import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import type {
  ImmutableResearchRunReceipt,
  ResearchPairOutcome,
} from "@/lib/research/types";
import { validateImmutableResearchRunProvenance } from "@/lib/research/validate-run";

import {
  sha256,
  stableJson,
} from "@/lib/research/run-files";

type Species = {
  id: string;
  scientificName: string;
  category: string;
};

type ProtocolCell = {
  stateCode: string;
  speciesId: string;
  priority: "regulated" | "high" | "pilot" | "baseline";
  sourceId: string;
  applicabilityStatus: "applicable" | "not-applicable";
  completionStatus: "complete" | "incomplete" | "blocked" | "not-applicable";
  freshnessStatus: "current" | "stale" | "undated" | "not-applicable";
  targetCountyCount: number;
  completeOutcomeCountyCount: number;
  incompleteCountyCount: number;
};

type StateSummary = {
  asOf: string;
  stateCode: string;
  stateSpeciesResearch: {
    overrides: Array<{
      speciesId: string;
      status: string;
      applicabilityStatus: "applicable" | "not-applicable" | "unknown" | "blocked";
      applicabilityBasis: string;
      notResearchedCountyCount: number;
    }>;
  };
};

type CountyRegistry = {
  countyEquivalents: Array<{
    countyFips: string;
    stateCode: string;
    status: "active" | "retired";
  }>;
};

type CountyFile = {
  pairs: Array<{
    speciesId: string;
    displayStatus: string;
    evidence: Array<{ sourceId: string }>;
  }>;
};

type GbifTaxonomyEvaluation = {
  sourceId: string;
  reviews: Array<{
    speciesId: string;
    disposition: string;
  }>;
};

type PlannedBatch = {
  batchId: string;
  stateCode: string;
  sourceId: string;
  speciesIds: string[];
  stateSpeciesScreenCount: number;
  countyOutcomeCount: number;
  candidateFile: string;
  candidates: Array<{
    sourceId: string;
    speciesId: string;
    countyFips: string;
  }>;
};

const SOURCE_ID = "gbif-preserved-specimens";
const LEGACY_DIRTY_BOOTSTRAP_RUN_ID = "20260715T034832Z__gbif-preserved-specimens__090596ab4867";
const MAX_CANDIDATE_PAIRS_PER_BATCH = 5_000;
const PRIORITY_ORDER = {
  regulated: 0,
  high: 1,
  pilot: 2,
  baseline: 3,
} as const;

function argumentValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredArgument(args: string[], name: string): string {
  const value = argumentValue(args, name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function positiveInteger(value: string, name: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`--${name} must be an integer from 1 through ${maximum}.`);
  }
  return parsed;
}

function readJson<T>(filepath: string): T {
  return JSON.parse(fs.readFileSync(filepath, "utf8")) as T;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function streamValidatedOutcomes(input: {
  repositoryRoot: string;
  filepath: string;
  validator: ReturnType<typeof z.fromJSONSchema>;
  receipt: ImmutableResearchRunReceipt;
  onOutcome: (outcome: ResearchPairOutcome) => void;
}) {
  const descriptors = input.receipt.outputs.filter((entry) => entry.path.endsWith("/outcomes.ndjson"));
  assert(descriptors.length === 1, `GBIF run ${input.receipt.run_id} must declare exactly one outcomes output.`);
  const descriptor = descriptors[0]!;
  const expectedPath = path.resolve(input.filepath);
  assert(path.resolve(input.repositoryRoot, descriptor.path) === expectedPath, `GBIF run ${input.receipt.run_id} outcomes path differs from its directory.`);
  const requestedPairs = new Set(input.receipt.requested_scope.pair_keys);
  assert(
    input.receipt.counts.requested_pairs === requestedPairs.size,
    `GBIF run ${input.receipt.run_id} requested-pair counts disagree.`,
  );
  const seenOutcomeIds = new Set<string>();
  const seenPairs = new Set<string>();
  const hash = createHash("sha256");
  const decoder = new StringDecoder("utf8");
  const buffer = Buffer.allocUnsafe(64 * 1024);
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    assert(Buffer.byteLength(line) <= 8 * 1024 * 1024, `GBIF run ${input.receipt.run_id} contains an oversized outcome record.`);
    const outcome = input.validator.parse(JSON.parse(line)) as ResearchPairOutcome;
    const key = `${outcome.county_fips}:${outcome.species_id}`;
    assert(
      outcome.run_id === input.receipt.run_id &&
        outcome.source_id === SOURCE_ID &&
        outcome.state_code === input.receipt.requested_scope.state_code &&
        requestedPairs.has(key),
      `GBIF run ${input.receipt.run_id} contains an outcome outside its declared scope.`,
    );
    assert(!seenOutcomeIds.has(outcome.outcome_id), `GBIF run ${input.receipt.run_id} repeats outcome ${outcome.outcome_id}.`);
    assert(!seenPairs.has(key), `GBIF run ${input.receipt.run_id} repeats pair ${key}.`);
    seenOutcomeIds.add(outcome.outcome_id);
    seenPairs.add(key);
    input.onOutcome(outcome);
  };
  const handle = fs.openSync(input.filepath, "r");
  let bytes = 0;
  let carry = "";
  try {
    while (true) {
      const read = fs.readSync(handle, buffer, 0, buffer.length, null);
      if (read === 0) break;
      const chunk = buffer.subarray(0, read);
      bytes += read;
      hash.update(chunk);
      carry += decoder.write(chunk);
      const lines = carry.split(/\r?\n/gu);
      carry = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
      assert(Buffer.byteLength(carry) <= 8 * 1024 * 1024, `GBIF run ${input.receipt.run_id} contains an oversized outcome record.`);
    }
    carry += decoder.end();
    handleLine(carry);
  } finally {
    fs.closeSync(handle);
  }
  assert(bytes === descriptor.bytes, `GBIF run ${input.receipt.run_id} outcomes byte count changed.`);
  assert(hash.digest("hex") === descriptor.sha256, `GBIF run ${input.receipt.run_id} outcomes hash changed.`);
  assert(
    seenOutcomeIds.size === input.receipt.counts.pair_outcomes,
    `GBIF run ${input.receipt.run_id} outcome count changed.`,
  );
}

function exactBinomial(scientificName: string): boolean {
  return scientificName.trim().split(/\s+/).length === 2;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function countCurrentEvidence(root: string, stateCode: string) {
  const counts = new Map<
    string,
    {
      verifiedPresentCount: number;
      gbifEvidenceCount: number;
      notResearchedCount: number;
    }
  >();
  const countiesDirectory = path.join(
    root,
    "public/generated/research",
    stateCode,
    "counties",
  );
  const countyFiles = fs.existsSync(countiesDirectory)
    ? fs.readdirSync(countiesDirectory)
      .filter((entry) => entry.endsWith(".json"))
      .sort(compareText)
    : [];
  const inputDigests: Array<{ filename: string; sha256: string }> = [];
  for (const filename of countyFiles) {
    const countyPath = path.join(countiesDirectory, filename);
    const countyBytes = fs.readFileSync(countyPath);
    inputDigests.push({ filename, sha256: sha256(countyBytes) });
    const county = JSON.parse(countyBytes.toString("utf8")) as CountyFile;
    for (const pair of county.pairs) {
      const current = counts.get(pair.speciesId) ?? {
        verifiedPresentCount: 0,
        gbifEvidenceCount: 0,
        notResearchedCount: 0,
      };
      if (pair.displayStatus === "verified-present") {
        current.verifiedPresentCount += 1;
      }
      if (pair.evidence.some((entry) => entry.sourceId === SOURCE_ID)) {
        current.gbifEvidenceCount += 1;
      }
      if (pair.displayStatus === "not-researched") {
        current.notResearchedCount += 1;
      }
      counts.set(pair.speciesId, current);
    }
  }
  return {
    counts,
    inputHash: sha256(stableJson(inputDigests)),
    fileCount: countyFiles.length,
  };
}

const completedPairCache = new Map<string, Map<string, Set<string>>>();

export function completedGbifPairKeys(root: string, stateCode: string) {
  const resolvedRoot = path.resolve(root);
  let byState = completedPairCache.get(resolvedRoot);
  if (!byState) {
    byState = new Map<string, Set<string>>();
    const runsRoot = path.join(resolvedRoot, "src/data/research/runs");
    const receiptValidator = z.fromJSONSchema(readJson<Parameters<typeof z.fromJSONSchema>[0]>(
      path.join(resolvedRoot, "src/data/research/schemas/run-receipt.schema.json"),
    ));
    const outcomeSchema = readJson<Record<string, unknown>>(
      path.join(resolvedRoot, "src/data/research/schemas/pair-outcome.schema.json"),
    );
    delete outcomeSchema.allOf;
    const outcomeValidator = z.fromJSONSchema(
      outcomeSchema as Parameters<typeof z.fromJSONSchema>[0],
    );
    const runDirectories = fs.existsSync(runsRoot)
      ? fs.readdirSync(runsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".pending-research-run-"))
        .map((entry) => path.join(runsRoot, entry.name))
        .sort(compareText)
      : [];
    for (const runDirectory of runDirectories) {
      const receiptPath = path.join(runDirectory, "receipt.json");
      if (!fs.existsSync(receiptPath)) continue;
      const candidateReceipt = readJson<Partial<ImmutableResearchRunReceipt>>(receiptPath);
      if (candidateReceipt.source_id !== SOURCE_ID) continue;
      const receipt = receiptValidator.parse(candidateReceipt) as ImmutableResearchRunReceipt;
      if (receipt.status !== "complete") continue;
      assert(path.basename(runDirectory) === receipt.run_id, `GBIF run directory ${path.basename(runDirectory)} differs from its receipt ID.`);
      if (receipt.run_id !== LEGACY_DIRTY_BOOTSTRAP_RUN_ID) {
        validateImmutableResearchRunProvenance({ repositoryRoot: resolvedRoot, receipt });
      }
      const receiptState = receipt.requested_scope.state_code;
      const outcomesPath = path.join(runDirectory, "outcomes.ndjson");
      assert(fs.existsSync(outcomesPath), `GBIF run ${receipt.run_id} lacks outcomes.ndjson.`);
      const completed = byState.get(receiptState) ?? new Set<string>();
      streamValidatedOutcomes({
        repositoryRoot: resolvedRoot,
        filepath: outcomesPath,
        validator: outcomeValidator,
        receipt,
        onOutcome: (outcome) => {
          if (outcome.scope_complete) {
          completed.add(`${outcome.county_fips}:${outcome.species_id}`);
          }
        },
      });
      byState.set(receiptState, completed);
    }
    completedPairCache.set(resolvedRoot, byState);
  }
  return byState.get(stateCode.toUpperCase()) ?? new Set<string>();
}

function taxonomyBlockedSpecies(root: string) {
  const evaluationPath = path.join(
    root,
    "ops/national-research/evaluations/gbif-taxonomy-ambiguities-20260731-r1.json",
  );
  if (!fs.existsSync(evaluationPath)) {
    return {
      evaluationPath: null,
      speciesIds: new Set<string>(),
    };
  }
  const evaluation = readJson<GbifTaxonomyEvaluation>(evaluationPath);
  if (evaluation.sourceId !== SOURCE_ID) {
    throw new Error(
      `Taxonomy evaluation source ${evaluation.sourceId} does not match ${SOURCE_ID}.`,
    );
  }
  return {
    evaluationPath,
    speciesIds: new Set(
      evaluation.reviews
        .filter(
          (entry) => entry.disposition === "catalog-taxonomy-review-required",
        )
        .map((entry) => entry.speciesId),
    ),
  };
}

export function buildGbifStateSpeciesPlan(input: {
  root: string;
  planId: string;
  stateCode: string;
  limit: number;
  speciesPerBatch: number;
  taxonomyCachePath?: string;
  requirePositiveNet?: boolean;
}) {
  const stateCode = input.stateCode.toUpperCase();
  const speciesPath = path.join(input.root, "src/data/generated/species.json");
  const countyRegistryPath = path.join(
    input.root,
    "src/data/research/county-equivalent-registry.json",
  );
  const summaryPath = path.join(
    input.root,
    "src/data/generated/research",
    stateCode,
    "summary.json",
  );
  const protocolPath = path.join(
    input.root,
    "src/data/generated/research",
    stateCode,
    "protocol-cells.json",
  );
  for (const filepath of [
    speciesPath,
    countyRegistryPath,
    summaryPath,
    protocolPath,
  ]) {
    if (!fs.existsSync(filepath)) throw new Error(`Missing plan input ${filepath}.`);
  }

  const taxonomyCachePath = input.taxonomyCachePath
    ? path.resolve(input.root, input.taxonomyCachePath)
    : null;
  if (
    taxonomyCachePath &&
    !taxonomyCachePath.startsWith(`${path.resolve(input.root)}${path.sep}`)
  ) {
    throw new Error("The taxonomy cache must remain inside the repository.");
  }
  if (taxonomyCachePath && !fs.existsSync(taxonomyCachePath)) {
    throw new Error(`Missing taxonomy cache ${taxonomyCachePath}.`);
  }
  const taxonomyCache = taxonomyCachePath
    ? readJson<{
        cacheId: string;
        sourceId: string;
        compatibleAdapterVersions: string[];
        entries: Array<{ speciesId: string }>;
      }>(taxonomyCachePath)
    : null;
  if (
    taxonomyCache &&
    (taxonomyCache.sourceId !== SOURCE_ID ||
      !taxonomyCache.compatibleAdapterVersions.includes("1.3.1"))
  ) {
    throw new Error(
      "The taxonomy cache is not compatible with the registered GBIF adapter.",
    );
  }
  const cachedSpeciesIds = new Set(
    taxonomyCache?.entries.map((entry) => entry.speciesId) ?? [],
  );

  const species = readJson<Species[]>(speciesPath);
  const speciesById = new Map(species.map((entry) => [entry.id, entry]));
  const countyRegistry = readJson<CountyRegistry>(countyRegistryPath);
  const countyFips = countyRegistry.countyEquivalents
    .filter(
      (entry) =>
        entry.stateCode === stateCode &&
        entry.status === "active",
    )
    .map((entry) => entry.countyFips)
    .sort(compareText);
  if (countyFips.length === 0) {
    throw new Error(`State ${stateCode} has no active county equivalents.`);
  }
  const summary = readJson<StateSummary>(summaryPath);
  const stateResearchBySpecies = new Map(
    summary.stateSpeciesResearch.overrides.map((entry) => [
      entry.speciesId,
      entry,
    ]),
  );
  const protocol = readJson<{ cells: ProtocolCell[] }>(protocolPath);
  const currentPairState = countCurrentEvidence(input.root, stateCode);
  const evidenceCounts = currentPairState.counts;
  const completedPairs = completedGbifPairKeys(input.root, stateCode);
  const taxonomyBlocks = taxonomyBlockedSpecies(input.root);
  let preventedCompletedPairCount = 0;
  let fullyCompletedStateSpeciesExcluded = 0;
  let taxonomyBlockedStateSpeciesExcluded = 0;
  const availableCandidates = protocol.cells
    .filter(
      (cell) =>
        cell.sourceId === SOURCE_ID &&
        cell.applicabilityStatus === "applicable" &&
        cell.completionStatus !== "complete" &&
        cell.incompleteCountyCount > 0,
    )
    .flatMap((cell) => {
      const speciesEntry = speciesById.get(cell.speciesId);
      const stateResearch = stateResearchBySpecies.get(cell.speciesId);
      if (taxonomyBlocks.speciesIds.has(cell.speciesId)) {
        taxonomyBlockedStateSpeciesExcluded += 1;
        return [];
      }
      if (
        !speciesEntry ||
        !stateResearch ||
        stateResearch.applicabilityStatus !== "applicable" ||
        !exactBinomial(speciesEntry.scientificName)
      ) {
        return [];
      }
      const counts = evidenceCounts.get(cell.speciesId) ?? {
        verifiedPresentCount: 0,
        gbifEvidenceCount: 0,
        notResearchedCount: 0,
      };
      const remainingCountyFips = countyFips.filter(
        (countyFipsEntry) =>
          !completedPairs.has(
            `${countyFipsEntry}:${cell.speciesId}`,
          ),
      );
      preventedCompletedPairCount +=
        countyFips.length - remainingCountyFips.length;
      if (remainingCountyFips.length === 0) {
        fullyCompletedStateSpeciesExcluded += 1;
        return [];
      }
      return [{
        stateCode,
        speciesId: cell.speciesId,
        scientificName: speciesEntry.scientificName,
        category: speciesEntry.category,
        priority: cell.priority,
        applicabilityBasis: stateResearch.applicabilityBasis,
        researchStatus: stateResearch.status,
        protocolCompletionStatus: cell.completionStatus,
        freshnessStatus: cell.freshnessStatus,
        countyCount: countyFips.length,
        incompleteCountyCount: remainingCountyFips.length,
        notResearchedCountyCount: counts.notResearchedCount,
        priorCompleteGbifCountyCount:
          countyFips.length - remainingCountyFips.length,
        gbifEvidenceCountyCount: counts.gbifEvidenceCount,
        verifiedPresentCountyCount: counts.verifiedPresentCount,
        remainingCountyFips,
      }];
    })
    .sort(
      (left, right) =>
        right.notResearchedCountyCount - left.notResearchedCountyCount ||
        right.incompleteCountyCount - left.incompleteCountyCount ||
        right.gbifEvidenceCountyCount - left.gbifEvidenceCountyCount ||
        right.verifiedPresentCountyCount - left.verifiedPresentCountyCount ||
        PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
        compareText(left.speciesId, right.speciesId),
    );
  const candidates = availableCandidates.filter(
    (entry) =>
      (!input.requirePositiveNet || entry.notResearchedCountyCount > 0) &&
      (!taxonomyCache || cachedSpeciesIds.has(entry.speciesId)),
  );
  const selected = candidates.slice(0, input.limit);
  const batches: PlannedBatch[] = [];
  let currentSpecies: typeof selected = [];
  let currentPairCount = 0;
  const flushBatch = () => {
    if (currentSpecies.length === 0) return;
    const batchNumber: number = batches.length + 1;
    const batchId: string =
      `${input.planId}-${stateCode.toLowerCase()}-${String(batchNumber).padStart(3, "0")}`;
    batches.push({
      batchId,
      stateCode,
      sourceId: SOURCE_ID,
      speciesIds: currentSpecies.map((entry) => entry.speciesId),
      stateSpeciesScreenCount: currentSpecies.length,
      countyOutcomeCount: currentSpecies.reduce(
        (sum, entry) => sum + entry.remainingCountyFips.length,
        0,
      ),
      candidateFile: `${batchId}.json`,
      candidates: currentSpecies.flatMap((entry) =>
        entry.remainingCountyFips.map((countyFipsEntry) => ({
          sourceId: SOURCE_ID,
          speciesId: entry.speciesId,
          countyFips: countyFipsEntry,
        }))
      ),
    });
    currentSpecies = [];
    currentPairCount = 0;
  };
  for (const entry of selected) {
    const entryPairCount = entry.remainingCountyFips.length;
    if (entryPairCount > MAX_CANDIDATE_PAIRS_PER_BATCH) {
      throw new Error(
        `State-species target ${stateCode}:${entry.speciesId} exceeds the ${MAX_CANDIDATE_PAIRS_PER_BATCH}-pair runner limit.`,
      );
    }
    if (
      currentSpecies.length >= input.speciesPerBatch ||
      currentPairCount + entryPairCount > MAX_CANDIDATE_PAIRS_PER_BATCH
    ) {
      flushBatch();
    }
    currentSpecies.push(entry);
    currentPairCount += entryPairCount;
  }
  flushBatch();

  return {
    schemaVersion: 1,
    planId: input.planId,
    sourceId: SOURCE_ID,
    stateCode,
    asOf: summary.asOf,
    selectionPolicy: {
      stateApplicability: "applicable",
      protocolApplicability: "applicable",
      protocolCompletion: "incomplete-or-blocked",
      taxonomy: "exact-two-token-binomial",
      ...(taxonomyCache
        ? {
            portfolioFilter:
              "provenance-compatible-taxonomy-cache-and-positive-not-researched-movement",
            taxonomyCacheId: taxonomyCache.cacheId,
            taxonomyCacheCompatibleAdapterVersions:
              taxonomyCache.compatibleAdapterVersions,
          }
        : {}),
      batchLimits: {
        maximumStateSpeciesScreens: input.speciesPerBatch,
        maximumCountySpeciesPairs: MAX_CANDIDATE_PAIRS_PER_BATCH,
        stateSpeciesQueriesRemainWhole: true,
      },
      ranking: [
        "not-researched-county-count-desc",
        "incomplete-county-count-desc",
        "existing-gbif-evidence-count-desc",
        "verified-present-count-desc",
        "priority-regulated-high-pilot-baseline",
        "species-id-asc",
      ],
    },
    inputHashes: {
      species: sha256(fs.readFileSync(speciesPath)),
      countyRegistry: sha256(fs.readFileSync(countyRegistryPath)),
      stateSummary: sha256(fs.readFileSync(summaryPath)),
      protocolCells: sha256(fs.readFileSync(protocolPath)),
      taxonomyEvaluation: taxonomyBlocks.evaluationPath
        ? sha256(fs.readFileSync(taxonomyBlocks.evaluationPath))
        : null,
      countyResearchProjections: currentPairState.inputHash,
      ...(taxonomyCachePath
        ? { taxonomyCache: sha256(fs.readFileSync(taxonomyCachePath)) }
        : {}),
    },
    rankingInputs: {
      countyProjectionFileCount: currentPairState.fileCount,
      expectedNetNewPairDefinition: "current displayStatus equals not-researched",
      ...(taxonomyCache
        ? { cachedTaxonomyEntryCount: taxonomyCache.entries.length }
        : {}),
    },
    deduplication: {
      immutableCompletePairCount: completedPairs.size,
      preventedCompletedPairCount,
      fullyCompletedStateSpeciesExcluded,
      taxonomyBlockedStateSpeciesExcluded,
      ...(taxonomyCache
        ? { cachedEligibleStateSpeciesScreenCount: candidates.length }
        : {}),
    },
    availableStateSpeciesScreenCount: availableCandidates.length,
    selectedStateSpeciesScreenCount: selected.length,
    selectedCountyOutcomeCount: selected.reduce(
      (sum, entry) => sum + entry.remainingCountyFips.length,
      0,
    ),
    expectedNetNewPairCount: selected.reduce(
      (sum, entry) => sum + entry.notResearchedCountyCount,
      0,
    ),
    countyCount: countyFips.length,
    selected,
    batches: batches.map(({ candidates: _candidates, ...batch }) => batch),
    candidateFiles: batches.map((batch) => ({
      schemaVersion: 1,
      stateCode,
      candidateCount: batch.candidates.length,
      distinctPairCount: batch.candidates.length,
      stateSpeciesScreenCount: batch.stateSpeciesScreenCount,
      batchId: batch.batchId,
      candidates: batch.candidates,
    })),
  };
}

function main() {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const stateCode = requiredArgument(args, "state");
  const planId = requiredArgument(args, "plan-id");
  const limit = positiveInteger(
    argumentValue(args, "limit") ?? "100",
    "limit",
    5_000,
  );
  const speciesPerBatch = positiveInteger(
    argumentValue(args, "species-per-batch") ?? "25",
    "species-per-batch",
    100,
  );
  const taxonomyCacheArgument = argumentValue(args, "taxonomy-cache");
  const taxonomyCachePath = taxonomyCacheArgument
    ? path.resolve(root, taxonomyCacheArgument)
    : undefined;
  const requirePositiveNetArgument =
    argumentValue(args, "require-positive-net") ?? "false";
  if (!["true", "false"].includes(requirePositiveNetArgument)) {
    throw new Error("--require-positive-net must be true or false.");
  }
  const outputDirectory = path.resolve(
    root,
    requiredArgument(args, "output-dir"),
  );
  if (!outputDirectory.startsWith(`${root}${path.sep}`)) {
    throw new Error("--output-dir must remain inside the repository.");
  }
  const plan = buildGbifStateSpeciesPlan({
    root,
    planId,
    stateCode,
    limit,
    speciesPerBatch,
    taxonomyCachePath,
    requirePositiveNet: requirePositiveNetArgument === "true",
  });
  fs.mkdirSync(outputDirectory, { recursive: true });
  const candidateFiles = plan.candidateFiles;
  for (const candidateFile of candidateFiles) {
    fs.writeFileSync(
      path.join(outputDirectory, `${candidateFile.batchId}.json`),
      `${JSON.stringify(candidateFile, null, 2)}\n`,
    );
  }
  const planDocument = {
    ...plan,
    candidateFiles: candidateFiles.map((entry) => ({
      batchId: entry.batchId,
      path: path
        .relative(root, path.join(outputDirectory, `${entry.batchId}.json`))
        .split(path.sep)
        .join("/"),
      sha256: sha256(`${JSON.stringify(entry, null, 2)}\n`),
      bytes: Buffer.byteLength(`${JSON.stringify(entry, null, 2)}\n`),
    })),
  };
  const planPath = path.join(outputDirectory, `${planId}-${stateCode.toLowerCase()}-plan.json`);
  fs.writeFileSync(planPath, `${JSON.stringify(planDocument, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      planPath: path.relative(root, planPath),
      planHash: sha256(stableJson(planDocument)),
      availableStateSpeciesScreenCount:
        plan.availableStateSpeciesScreenCount,
      selectedStateSpeciesScreenCount:
        plan.selectedStateSpeciesScreenCount,
      selectedCountyOutcomeCount: plan.selectedCountyOutcomeCount,
      expectedNetNewPairCount: plan.expectedNetNewPairCount,
      batchCount: plan.batches.length,
    }, null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main();
}
