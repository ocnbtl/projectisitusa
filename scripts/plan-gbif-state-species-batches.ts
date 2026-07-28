import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sha256, stableJson } from "@/lib/research/run-files";

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

function exactBinomial(scientificName: string): boolean {
  return scientificName.trim().split(/\s+/).length === 2;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function countCurrentEvidence(root: string, stateCode: string) {
  const counts = new Map<
    string,
    { verifiedPresentCount: number; gbifEvidenceCount: number }
  >();
  const countiesDirectory = path.join(
    root,
    "src/data/generated/research",
    stateCode,
    "counties",
  );
  const countyFiles = fs.existsSync(countiesDirectory)
    ? fs.readdirSync(countiesDirectory)
      .filter((entry) => entry.endsWith(".json"))
      .sort(compareText)
    : [];
  for (const filename of countyFiles) {
    const county = readJson<CountyFile>(path.join(countiesDirectory, filename));
    for (const pair of county.pairs) {
      const current = counts.get(pair.speciesId) ?? {
        verifiedPresentCount: 0,
        gbifEvidenceCount: 0,
      };
      if (pair.displayStatus === "verified-present") {
        current.verifiedPresentCount += 1;
      }
      if (pair.evidence.some((entry) => entry.sourceId === SOURCE_ID)) {
        current.gbifEvidenceCount += 1;
      }
      counts.set(pair.speciesId, current);
    }
  }
  return counts;
}

export function buildGbifStateSpeciesPlan(input: {
  root: string;
  planId: string;
  stateCode: string;
  limit: number;
  speciesPerBatch: number;
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
  const evidenceCounts = countCurrentEvidence(input.root, stateCode);
  const candidates = protocol.cells
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
      };
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
        incompleteCountyCount: cell.incompleteCountyCount,
        priorCompleteGbifCountyCount: cell.completeOutcomeCountyCount,
        gbifEvidenceCountyCount: counts.gbifEvidenceCount,
        verifiedPresentCountyCount: counts.verifiedPresentCount,
      }];
    })
    .sort(
      (left, right) =>
        right.incompleteCountyCount - left.incompleteCountyCount ||
        right.gbifEvidenceCountyCount - left.gbifEvidenceCountyCount ||
        right.verifiedPresentCountyCount - left.verifiedPresentCountyCount ||
        PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
        compareText(left.speciesId, right.speciesId),
    );
  const selected = candidates.slice(0, input.limit);
  const batches: PlannedBatch[] = [];
  for (let index = 0; index < selected.length; index += input.speciesPerBatch) {
    const selectedSpecies = selected.slice(index, index + input.speciesPerBatch);
    const batchNumber: number = batches.length + 1;
    const batchId: string =
      `${input.planId}-${stateCode.toLowerCase()}-${String(batchNumber).padStart(3, "0")}`;
    batches.push({
      batchId,
      stateCode,
      sourceId: SOURCE_ID,
      speciesIds: selectedSpecies.map((entry) => entry.speciesId),
      stateSpeciesScreenCount: selectedSpecies.length,
      countyOutcomeCount: selectedSpecies.length * countyFips.length,
      candidateFile: `${batchId}.json`,
      candidates: selectedSpecies.flatMap((entry) =>
        countyFips.map((countyFipsEntry) => ({
          sourceId: SOURCE_ID,
          speciesId: entry.speciesId,
          countyFips: countyFipsEntry,
        }))
      ),
    });
  }

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
      ranking: [
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
    },
    availableStateSpeciesScreenCount: candidates.length,
    selectedStateSpeciesScreenCount: selected.length,
    selectedCountyOutcomeCount: selected.length * countyFips.length,
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
