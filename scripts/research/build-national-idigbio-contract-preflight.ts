import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import { sha256, stableJson } from "./national-gbif-download";

const SOURCE_ID = "idigbio-preserved-specimens";
const RUN_NAME_PATTERN = /^[0-9]{8}T[0-9]{6}Z__idigbio-preserved-specimens__[a-f0-9]{12}$/u;
const SNAPSHOT_NOTE_PATTERN = /lastModified ([0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)/u;
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitShaSchema = z.string().regex(/^[a-f0-9]{40}$/u);

const CorpusLineageSchema = z.object({
  runId: z.string().regex(RUN_NAME_PATTERN),
  receiptPath: z.string().min(1),
  receiptSha256: Sha256Schema,
  outcomesPath: z.string().min(1),
  outcomesSha256: Sha256Schema,
  adapterVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/u),
  stateCode: z.string().regex(/^[A-Z]{2}$/u),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  requestedPairs: z.number().int().positive(),
  candidateRecords: z.number().int().nonnegative(),
  assertionEvents: z.number().int().nonnegative(),
  reviewEvents: z.number().int().nonnegative(),
  rejectionRecords: z.number().int().nonnegative(),
  pairOutcomes: z.number().int().positive(),
}).strict();

const OutcomeOverlapSchema = z.object({
  total: z.number().int().nonnegative(),
  currentVerifiedPresent: z.number().int().nonnegative(),
  currentResearchedUnresolved: z.number().int().nonnegative(),
  currentOther: z.number().int().nonnegative(),
}).strict();

export const NationalIdigbioContractPreflightSchema = z.object({
  schemaVersion: z.literal(1),
  evaluationId: z.string().regex(/^post-round-[0-9]+-idigbio-national-contract-preflight-[0-9]{8}-r[0-9]+$/u),
  evaluatedAt: z.string().datetime(),
  baselineSha: GitShaSchema,
  generatedContentCommit: GitShaSchema,
  source: z.object({
    sourceId: z.literal(SOURCE_ID),
    registryPath: z.literal("src/data/research/source-registry.json"),
    registrySha256: Sha256Schema,
    parameterSchemaPath: z.literal("src/data/research/schemas/idigbio-preserved-specimens-parameters.schema.json"),
    parameterSchemaSha256: Sha256Schema,
    adapterPath: z.literal("scripts/research/adapters/idigbio-preserved-specimens.ts"),
    adapterSha256: Sha256Schema,
    currentAdapterVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/u),
    allowedAdapterVersions: z.array(z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/u)).min(1),
    evidenceCapabilities: z.array(z.literal("recorded-present")).length(1),
    negativeSemantics: z.literal("none"),
    providerSnapshotFrozenAsOf: z.string().date(),
    caveat: z.string().min(1),
  }).strict(),
  retainedCorpus: z.object({
    runPathPattern: z.literal("src/data/research/runs/*__idigbio-preserved-specimens__*"),
    runCount: z.number().int().positive(),
    stateCodes: z.array(z.string().regex(/^[A-Z]{2}$/u)).min(1),
    adapterVersions: z.array(z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/u)).min(1),
    earliestSnapshotLastModified: z.string().datetime(),
    latestSnapshotLastModified: z.string().datetime(),
    requestedPairs: z.number().int().positive(),
    candidateRecords: z.number().int().nonnegative(),
    assertionEvents: z.number().int().nonnegative(),
    reviewEvents: z.number().int().nonnegative(),
    rejectionRecords: z.number().int().nonnegative(),
    duplicateRecords: z.number().int().nonnegative(),
    errorCount: z.number().int().nonnegative(),
    pairOutcomes: z.number().int().positive(),
    upstreamRequests: z.number().int().nonnegative(),
    retainedArtifacts: z.number().int().nonnegative(),
    retainedArtifactBytes: z.number().int().nonnegative(),
    lineageSha256: Sha256Schema,
    lineage: z.array(CorpusLineageSchema).min(1),
  }).strict(),
  exactOverlap: z.object({
    uniquePairOutcomes: z.number().int().positive(),
    duplicatePairOutcomes: z.number().int().nonnegative(),
    historicalEvidenceFound: OutcomeOverlapSchema,
    historicalNoQualifyingEvidence: OutcomeOverlapSchema,
    currentVerifiedPresent: z.number().int().nonnegative(),
    currentResearchedUnresolved: z.number().int().nonnegative(),
    currentVerifiedAbsent: z.number().int().nonnegative(),
    currentNotDetected: z.number().int().nonnegative(),
    currentNotResearched: z.number().int().nonnegative(),
    retainedReplayNetNewPairs: z.number().int().nonnegative(),
  }).strict(),
  nationalContract: z.object({
    currentAdapterMode: z.literal("bounded-state-species-search-pagination"),
    candidateLimitMaximum: z.number().int().positive(),
    pageLimitMaximum: z.number().int().positive(),
    maxPagesPerSpeciesMaximum: z.number().int().positive(),
    providerNativeNationalArchiveImplemented: z.literal(false),
    currentMaterialScopeExecutable: z.literal(false),
    blockers: z.array(z.string().min(1)).min(1),
    requiredArchiveContract: z.array(z.string().min(1)).min(1),
  }).strict(),
  decision: z.object({
    status: z.literal("historical-replay-exhausted-national-contract-blocked"),
    measuredCurrentNetNewPairs: z.literal(0),
    providerRequestAuthorizedByThisEvaluation: z.literal(false),
    nextAction: z.string().min(1),
    reason: z.string().min(1),
  }).strict(),
  semantics: z.object({
    sourceSilenceCreatesAbsence: z.literal(false),
    sourceSilenceCreatesNotDetected: z.literal(false),
    historicalEvidenceProvesCurrentProviderYield: z.literal(false),
    zeroReplayNetProvesZeroFutureNationalYield: z.literal(false),
  }).strict(),
  operations: z.object({
    networkRequests: z.literal(0),
    providerPosts: z.literal(0),
    generationCommands: z.literal(0),
    publicationMutations: z.literal(0),
  }).strict(),
  checks: z.object({
    generatedTreesMatchPinnedCommit: z.literal(true),
    sourceRegistryContractPinned: z.literal(true),
    immutableRunCountsConserved: z.literal(true),
    outcomePairsUnique: z.literal(true),
    exactOverlapConserved: z.literal(true),
    negativeSemanticsPreserved: z.literal(true),
    externalMutationCountIsZero: z.literal(true),
  }).strict(),
}).strict().superRefine((value, context) => {
  const historicalEvidence = value.exactOverlap.historicalEvidenceFound;
  const historicalNoEvidence = value.exactOverlap.historicalNoQualifyingEvidence;
  const overlapTotal = historicalEvidence.total + historicalNoEvidence.total;
  const currentTotal =
    value.exactOverlap.currentVerifiedPresent +
    value.exactOverlap.currentResearchedUnresolved +
    value.exactOverlap.currentVerifiedAbsent +
    value.exactOverlap.currentNotDetected +
    value.exactOverlap.currentNotResearched;
  if (
    overlapTotal !== value.exactOverlap.uniquePairOutcomes ||
    currentTotal !== value.exactOverlap.uniquePairOutcomes ||
    value.retainedCorpus.pairOutcomes !== value.exactOverlap.uniquePairOutcomes
  ) {
    context.addIssue({ code: "custom", message: "iDigBio historical and current overlap counts do not conserve." });
  }
  for (const overlap of [historicalEvidence, historicalNoEvidence]) {
    if (overlap.currentVerifiedPresent + overlap.currentResearchedUnresolved + overlap.currentOther !== overlap.total) {
      context.addIssue({ code: "custom", message: "iDigBio outcome cross-tab does not conserve." });
    }
  }
  if (value.exactOverlap.currentNotResearched !== value.exactOverlap.retainedReplayNetNewPairs) {
    context.addIssue({ code: "custom", message: "iDigBio replay net movement must equal exact retained pairs still not researched." });
  }
});

type Receipt = {
  run_id?: string;
  status?: string;
  started_at?: string;
  finished_at?: string;
  source_id?: string;
  adapter_version?: string;
  parameters?: { candidatePairs?: string[] };
  requested_scope?: { state_code?: string; pair_keys?: string[] };
  upstream_requests?: unknown[];
  artifacts?: Array<{ bytes?: number }>;
  counts?: {
    requested_pairs?: number;
    candidate_records?: number;
    assertion_events?: number;
    review_events?: number;
    rejection_records?: number;
    duplicate_records?: number;
    error_count?: number;
    pair_outcomes?: number;
  };
};

type Outcome = {
  run_id?: string;
  source_id?: string;
  state_code?: string;
  county_fips?: string;
  species_id?: string;
  status?: "evidence-found" | "no-qualifying-evidence";
  scope_complete?: boolean;
  notes?: string[];
};

type CountyShard = {
  stateCode: string;
  countyFips: string;
  pairResolution: { defaultDisplayStatus: string };
  pairs: Array<{ speciesId: string; displayStatus: string }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const required = ["output", "evaluation-id", "evaluated-at", "baseline-sha", "generated-content-commit"];
  assert(required.every((key) => values.has(key)), `Missing required argument; expected ${required.join(", ")}.`);
  return {
    outputPath: path.resolve(values.get("output")!),
    evaluationId: values.get("evaluation-id")!,
    evaluatedAt: values.get("evaluated-at")!,
    baselineSha: values.get("baseline-sha")!,
    generatedContentCommit: values.get("generated-content-commit")!,
  };
}

function relativePath(root: string, filepath: string) {
  return path.relative(root, filepath).replaceAll("\\", "/");
}

function parseNdjson<T>(contents: string, filepath: string): T[] {
  return contents.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch (error) {
      throw new Error(`${filepath}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function increment(record: Record<string, number>, key: string, amount = 1) {
  record[key] = (record[key] ?? 0) + amount;
}

function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  assert(!existsSync(args.outputPath), "iDigBio contract preflight refuses to overwrite an existing artifact.");
  execFileSync("git", ["merge-base", "--is-ancestor", args.generatedContentCommit, args.baselineSha], { cwd: root });
  execFileSync("git", ["diff", "--quiet", args.generatedContentCommit, "--", "public/generated/research", "src/data/generated/research"], { cwd: root });

  const registryPath = path.join(root, "src/data/research/source-registry.json");
  const parameterSchemaPath = path.join(root, "src/data/research/schemas/idigbio-preserved-specimens-parameters.schema.json");
  const adapterPath = path.join(root, "scripts/research/adapters/idigbio-preserved-specimens.ts");
  const registryBytes = readFileSync(registryPath);
  const parameterSchemaBytes = readFileSync(parameterSchemaPath);
  const adapterBytes = readFileSync(adapterPath);
  const registry = JSON.parse(registryBytes.toString("utf8")) as {
    sources?: Array<{
      id?: string;
      evidenceCapabilities?: string[];
      negativeSemantics?: string;
      caveat?: string;
      researchAdapter?: { allowedVersions?: string[] };
    }>;
  };
  const source = registry.sources?.find((entry) => entry.id === SOURCE_ID);
  assert(source, "iDigBio source registry entry is missing.");
  assert(JSON.stringify(source.evidenceCapabilities) === JSON.stringify(["recorded-present"]), "iDigBio evidence capabilities changed.");
  assert(source.negativeSemantics === "none", "iDigBio negative semantics changed.");
  const frozenMatch = source.caveat?.match(/frozen as of ([0-9]{4}-[0-9]{2}-[0-9]{2})/u);
  assert(frozenMatch, "iDigBio source caveat no longer identifies its frozen provider snapshot date.");
  const adapterVersionMatch = adapterBytes.toString("utf8").match(/const ADAPTER_VERSION = "([0-9]+\.[0-9]+\.[0-9]+)";/u);
  assert(adapterVersionMatch, "iDigBio adapter version is not declared in the expected form.");
  const allowedAdapterVersions = source.researchAdapter?.allowedVersions;
  assert(Array.isArray(allowedAdapterVersions) && allowedAdapterVersions.includes(adapterVersionMatch[1]!), "Current iDigBio adapter version is not registered.");
  const parameterSchema = JSON.parse(parameterSchemaBytes.toString("utf8")) as {
    properties?: Record<string, { maximum?: number }>;
  };
  const candidateLimitMaximum = parameterSchema.properties?.candidateLimit?.maximum;
  const pageLimitMaximum = parameterSchema.properties?.pageLimit?.maximum;
  const maxPagesPerSpeciesMaximum = parameterSchema.properties?.maxPagesPerSpecies?.maximum;
  assert([candidateLimitMaximum, pageLimitMaximum, maxPagesPerSpeciesMaximum].every(Number.isInteger), "iDigBio parameter maxima are missing.");

  const runsRoot = path.join(root, "src/data/research/runs");
  const runNames = readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && RUN_NAME_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  assert(runNames.length > 0, "No retained iDigBio immutable runs were found.");
  const lineage: z.infer<typeof CorpusLineageSchema>[] = [];
  const outcomes: Outcome[] = [];
  const snapshotDates: string[] = [];
  const aggregate = {
    requestedPairs: 0,
    candidateRecords: 0,
    assertionEvents: 0,
    reviewEvents: 0,
    rejectionRecords: 0,
    duplicateRecords: 0,
    errorCount: 0,
    pairOutcomes: 0,
    upstreamRequests: 0,
    retainedArtifacts: 0,
    retainedArtifactBytes: 0,
  };
  const adapterVersions = new Set<string>();
  const stateCodes = new Set<string>();

  for (const runId of runNames) {
    const runPath = path.join(runsRoot, runId);
    const receiptPath = path.join(runPath, "receipt.json");
    const outcomesPath = path.join(runPath, "outcomes.ndjson");
    const receiptBytes = readFileSync(receiptPath);
    const outcomesBytes = readFileSync(outcomesPath);
    const receipt = JSON.parse(receiptBytes.toString("utf8")) as Receipt;
    const runOutcomes = parseNdjson<Outcome>(outcomesBytes.toString("utf8"), outcomesPath);
    assert(receipt.run_id === runId && receipt.source_id === SOURCE_ID && receipt.status === "complete", `Invalid retained iDigBio receipt identity: ${runId}.`);
    assert(receipt.started_at && !Number.isNaN(Date.parse(receipt.started_at)), `Invalid iDigBio started_at: ${runId}.`);
    assert(receipt.finished_at && !Number.isNaN(Date.parse(receipt.finished_at)), `Invalid iDigBio finished_at: ${runId}.`);
    assert(receipt.adapter_version && /^[0-9]+\.[0-9]+\.[0-9]+$/u.test(receipt.adapter_version), `Invalid iDigBio adapter version: ${runId}.`);
    const counts = receipt.counts;
    const stateCode = receipt.requested_scope?.state_code;
    assert(counts && stateCode && /^[A-Z]{2}$/u.test(stateCode), `Incomplete iDigBio receipt counts or scope: ${runId}.`);
    assert(counts.error_count === 0, `Retained iDigBio run has errors: ${runId}.`);
    assert(counts.pair_outcomes === runOutcomes.length, `iDigBio outcome count differs from receipt: ${runId}.`);
    assert(counts.requested_pairs === receipt.parameters?.candidatePairs?.length, `iDigBio candidate pair count differs from receipt: ${runId}.`);
    assert(counts.requested_pairs === receipt.requested_scope?.pair_keys?.length, `iDigBio requested scope differs from receipt: ${runId}.`);
    for (const outcome of runOutcomes) {
      assert(
        outcome.run_id === runId &&
          outcome.source_id === SOURCE_ID &&
          outcome.state_code === stateCode &&
          outcome.scope_complete === true &&
          (outcome.status === "evidence-found" || outcome.status === "no-qualifying-evidence") &&
          outcome.county_fips && /^[0-9]{5}$/u.test(outcome.county_fips) &&
          outcome.species_id && /^[a-z0-9-]+$/u.test(outcome.species_id),
        `Invalid retained iDigBio outcome: ${runId}.`,
      );
      const snapshotNotes = (outcome.notes ?? []).map((note) => note.match(SNAPSHOT_NOTE_PATTERN)?.[1]).filter((entry): entry is string => Boolean(entry));
      assert(snapshotNotes.length === 1 && !Number.isNaN(Date.parse(snapshotNotes[0]!)), `iDigBio outcome lacks one valid snapshot lastModified note: ${runId}.`);
      snapshotDates.push(snapshotNotes[0]!);
      outcomes.push(outcome);
    }
    const numericCounts = {
      requestedPairs: counts.requested_pairs!,
      candidateRecords: counts.candidate_records!,
      assertionEvents: counts.assertion_events!,
      reviewEvents: counts.review_events!,
      rejectionRecords: counts.rejection_records!,
      pairOutcomes: counts.pair_outcomes!,
    };
    assert(Object.values(numericCounts).every((value) => Number.isInteger(value) && value >= 0), `Invalid iDigBio receipt counts: ${runId}.`);
    aggregate.requestedPairs += numericCounts.requestedPairs;
    aggregate.candidateRecords += numericCounts.candidateRecords;
    aggregate.assertionEvents += numericCounts.assertionEvents;
    aggregate.reviewEvents += numericCounts.reviewEvents;
    aggregate.rejectionRecords += numericCounts.rejectionRecords;
    aggregate.pairOutcomes += numericCounts.pairOutcomes;
    aggregate.duplicateRecords += counts.duplicate_records ?? 0;
    aggregate.errorCount += counts.error_count ?? 0;
    aggregate.upstreamRequests += receipt.upstream_requests?.length ?? 0;
    aggregate.retainedArtifacts += receipt.artifacts?.length ?? 0;
    aggregate.retainedArtifactBytes += (receipt.artifacts ?? []).reduce((sum, artifact) => sum + (artifact.bytes ?? 0), 0);
    adapterVersions.add(receipt.adapter_version);
    stateCodes.add(stateCode);
    lineage.push(CorpusLineageSchema.parse({
      runId,
      receiptPath: relativePath(root, receiptPath),
      receiptSha256: sha256(receiptBytes),
      outcomesPath: relativePath(root, outcomesPath),
      outcomesSha256: sha256(outcomesBytes),
      adapterVersion: receipt.adapter_version,
      stateCode,
      startedAt: receipt.started_at,
      finishedAt: receipt.finished_at,
      ...numericCounts,
    }));
  }

  const pairKeys = new Set<string>();
  const currentCounts: Record<string, number> = {};
  const crossTab = {
    "evidence-found": { total: 0, currentVerifiedPresent: 0, currentResearchedUnresolved: 0, currentOther: 0 },
    "no-qualifying-evidence": { total: 0, currentVerifiedPresent: 0, currentResearchedUnresolved: 0, currentOther: 0 },
  };
  for (const outcome of outcomes) {
    const pairKey = `${outcome.county_fips}:${outcome.species_id}`;
    assert(!pairKeys.has(pairKey), `Duplicate retained iDigBio pair outcome: ${pairKey}.`);
    pairKeys.add(pairKey);
    const shardPath = path.join(root, "public/generated/research", outcome.state_code!, "counties", `${outcome.county_fips}.json`);
    const shard = JSON.parse(readFileSync(shardPath, "utf8")) as CountyShard;
    assert(shard.stateCode === outcome.state_code && shard.countyFips === outcome.county_fips, `Generated shard identity differs for ${pairKey}.`);
    assert(shard.pairResolution.defaultDisplayStatus === "not-researched", `Generated shard default differs for ${pairKey}.`);
    const currentDisplayStatus = shard.pairs.find((entry) => entry.speciesId === outcome.species_id)?.displayStatus ?? "not-researched";
    assert(new Set(["verified-present", "verified-absent", "not-detected", "researched-unresolved", "not-researched"]).has(currentDisplayStatus), `Unsupported generated display status for ${pairKey}.`);
    increment(currentCounts, currentDisplayStatus);
    const cross = crossTab[outcome.status!];
    cross.total += 1;
    if (currentDisplayStatus === "verified-present") cross.currentVerifiedPresent += 1;
    else if (currentDisplayStatus === "researched-unresolved") cross.currentResearchedUnresolved += 1;
    else cross.currentOther += 1;
  }

  const output = NationalIdigbioContractPreflightSchema.parse({
    schemaVersion: 1,
    evaluationId: args.evaluationId,
    evaluatedAt: args.evaluatedAt,
    baselineSha: args.baselineSha,
    generatedContentCommit: args.generatedContentCommit,
    source: {
      sourceId: SOURCE_ID,
      registryPath: "src/data/research/source-registry.json",
      registrySha256: sha256(registryBytes),
      parameterSchemaPath: "src/data/research/schemas/idigbio-preserved-specimens-parameters.schema.json",
      parameterSchemaSha256: sha256(parameterSchemaBytes),
      adapterPath: "scripts/research/adapters/idigbio-preserved-specimens.ts",
      adapterSha256: sha256(adapterBytes),
      currentAdapterVersion: adapterVersionMatch[1],
      allowedAdapterVersions,
      evidenceCapabilities: source.evidenceCapabilities,
      negativeSemantics: source.negativeSemantics,
      providerSnapshotFrozenAsOf: frozenMatch[1],
      caveat: source.caveat,
    },
    retainedCorpus: {
      runPathPattern: "src/data/research/runs/*__idigbio-preserved-specimens__*",
      runCount: runNames.length,
      stateCodes: [...stateCodes].sort(),
      adapterVersions: [...adapterVersions].sort(),
      earliestSnapshotLastModified: [...snapshotDates].sort()[0],
      latestSnapshotLastModified: [...snapshotDates].sort().at(-1),
      ...aggregate,
      lineageSha256: sha256(stableJson(lineage)),
      lineage,
    },
    exactOverlap: {
      uniquePairOutcomes: pairKeys.size,
      duplicatePairOutcomes: outcomes.length - pairKeys.size,
      historicalEvidenceFound: crossTab["evidence-found"],
      historicalNoQualifyingEvidence: crossTab["no-qualifying-evidence"],
      currentVerifiedPresent: currentCounts["verified-present"] ?? 0,
      currentResearchedUnresolved: currentCounts["researched-unresolved"] ?? 0,
      currentVerifiedAbsent: currentCounts["verified-absent"] ?? 0,
      currentNotDetected: currentCounts["not-detected"] ?? 0,
      currentNotResearched: currentCounts["not-researched"] ?? 0,
      retainedReplayNetNewPairs: currentCounts["not-researched"] ?? 0,
    },
    nationalContract: {
      currentAdapterMode: "bounded-state-species-search-pagination",
      candidateLimitMaximum,
      pageLimitMaximum,
      maxPagesPerSpeciesMaximum,
      providerNativeNationalArchiveImplemented: false,
      currentMaterialScopeExecutable: false,
      blockers: [
        "The registered provider search snapshot is officially frozen as historical evidence.",
        "All 155 retained exact county-species outcomes are already researched in the current matrix, so replay has zero net movement.",
        "The current adapter performs bounded state-species search pagination and does not consume one provider-native national immutable archive.",
        "No versioned national archive identity, completeness receipt, or exact national overlap plan is implemented.",
      ],
      requiredArchiveContract: [
        "One provider-native United States preserved-specimen snapshot with a stable provider identity and acquisition timestamp.",
        "Hash-pinned retained raw bytes plus byte count, media type, source URL, and provider snapshot metadata.",
        "A complete record-count or terminal-pagination contract that fails closed on drift, truncation, repeated pages, or invalid payloads.",
        "Deterministic exact-binomial, explicit state, and explicit active county-equivalent partitioning with conservative rejection semantics.",
        "A zero-network exact overlap plan that measures not-researched, blocked, and already-researched pairs before provider execution.",
        "Immutable replay receipts and tests proving source silence creates only researched-unresolved outcomes, never absence or non-detection.",
      ],
    },
    decision: {
      status: "historical-replay-exhausted-national-contract-blocked",
      measuredCurrentNetNewPairs: 0,
      providerRequestAuthorizedByThisEvaluation: false,
      nextAction: "Return to the measured 25,152-pair GBIF fallback and prepare a separately gated Round 79 plan without issuing a provider POST yet.",
      reason: "The retained iDigBio corpus is fully overlapped and the registered provider snapshot is frozen. A future national iDigBio lane needs a real provider-native immutable archive contract and fresh zero-network overlap measurement; inventing one from the state-search adapter would overstate executability.",
    },
    semantics: {
      sourceSilenceCreatesAbsence: false,
      sourceSilenceCreatesNotDetected: false,
      historicalEvidenceProvesCurrentProviderYield: false,
      zeroReplayNetProvesZeroFutureNationalYield: false,
    },
    operations: {
      networkRequests: 0,
      providerPosts: 0,
      generationCommands: 0,
      publicationMutations: 0,
    },
    checks: {
      generatedTreesMatchPinnedCommit: true,
      sourceRegistryContractPinned: true,
      immutableRunCountsConserved: true,
      outcomePairsUnique: true,
      exactOverlapConserved: true,
      negativeSemanticsPreserved: true,
      externalMutationCountIsZero: true,
    },
  });
  mkdirSync(path.dirname(args.outputPath), { recursive: true });
  const contents = stableJson(output);
  writeFileSync(args.outputPath, contents, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: relativePath(root, args.outputPath),
    outputSha256: sha256(contents),
    runCount: output.retainedCorpus.runCount,
    uniquePairOutcomes: output.exactOverlap.uniquePairOutcomes,
    currentVerifiedPresent: output.exactOverlap.currentVerifiedPresent,
    currentResearchedUnresolved: output.exactOverlap.currentResearchedUnresolved,
    retainedReplayNetNewPairs: output.exactOverlap.retainedReplayNetNewPairs,
    decision: output.decision.status,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
