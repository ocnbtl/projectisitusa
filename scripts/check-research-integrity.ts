import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type {
  EvidenceAssertion,
  EvidenceReviewEvent,
  ResearchCountyFile,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  ResearchRunReceipt,
  ResearchSourceRegistry,
  ResearchStateSummary,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { compileAdditiveResearchEvidence } from "@/lib/research/compile-evidence";
import {
  listImmutableResearchRuns,
  readNdjson as readRunNdjson,
  stableJson,
} from "@/lib/research/run-files";
import {
  assertImmutableRunStateConsistency,
  selectImmutableResearchRunsForState,
} from "@/lib/research/state-run-selection";
import {
  type NasArchiveOccurrence,
  type NationalNasReference,
  USGS_NAS_SELECTED_RECORD_BUDGET_PER_PARTITION,
  USGS_NAS_SELECTED_RECORD_BUDGET_PER_SCREEN,
  assertCommitAncestor,
  canonicalBinomial,
  canonicalNasArchiveUrl,
  nationalNasRecordAppliesToScreen,
  streamNationalNasOccurrences,
  validateNationalNasReference,
  verifyNationalNasAcquisition,
} from "./research/national-usgs-nas-common";
import { replayNationalNasScreen } from "./research/adapters/usgs-nas-archive";
import {
  getStateDefinition,
  listCountyEquivalents,
} from "@/lib/research/geography-registry";

type SpeciesRecord = { id: string };
type CountyRecord = { countyFips: string; stateCode: string };
type MatrixFile = {
  summary: {
    totalDeterminations: number;
    presentVerifiedDeterminations: number;
    verifiedAbsentDeterminations: number;
    notDetectedDeterminations: number;
  };
  counties: Array<{
    countyFips: string;
    presentVerifiedSpeciesIds: string[];
    verifiedAbsentSpeciesIds: string[];
    notDetectedSpeciesIds: string[];
  }>;
};
type RunsFile = { schemaVersion: 1; runs: ResearchRunReceipt[] };
type MigrationCandidatesFile = {
  candidateCount: number;
  distinctPairCount: number;
  candidates: Array<{ sourceId: string; countyFips: string; speciesId: string }>;
};
type BootstrapFreezeFile = {
  files: Record<
    "evidenceAssertions" | "researchRuns" | "migrationReport" | "migrationCandidates",
    { path: string; sha256: string; bytes?: number; recordCount?: number }
  >;
  assertionPairSets: Record<
    "recorded-present" | "officially-absent" | "not-detected",
    { recordCount: number; distinctPairCount: number; sortedPairSetSha256: string }
  >;
  rules: {
    initializationOnly: boolean;
    routineRefreshMayRunMigration: boolean;
    reviewedRunEvidenceMustRemainSeparate: boolean;
  };
};

const ROOT = process.cwd();
const SCHEMA_DIR = path.join(ROOT, "src/data/research/schemas");
const NATIONAL_ACQUISITIONS_DIR = path.join(
  ROOT,
  "src/data/research/national-acquisitions",
);
const LEGACY_DIRTY_BOOTSTRAP_RUN_ID =
  "20260715T034832Z__gbif-preserved-specimens__090596ab4867";

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function readNdjson<T>(filepath: string): T[] {
  return readFileSync(filepath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

function assertUnique(values: string[], label: string) {
  assert(new Set(values).size === values.length, `${label} contains duplicate values.`);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

const versionedHashCache = new Map<string, Set<string>>();

function versionedFileHashes(relativePath: string) {
  const cached = versionedHashCache.get(relativePath);
  if (cached) return cached;
  const commits = execFileSync(
    "git",
    ["log", "--format=%H", "--all", "--", relativePath],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean);
  const hashes = new Set(
    commits.map((commit) =>
      sha256(execFileSync("git", ["show", `${commit}:${relativePath}`], { cwd: ROOT })),
    ),
  );
  versionedHashCache.set(relativePath, hashes);
  return hashes;
}

function schemaValidator(filename: string) {
  const filepath = path.join(SCHEMA_DIR, filename);
  assert(existsSync(filepath), `Missing research schema: ${filename}`);
  const schema = JSON.parse(readFileSync(filepath, "utf8")) as Parameters<
    typeof z.fromJSONSchema
  >[0];
  return z.fromJSONSchema(schema);
}

function schemaValidatorWithoutConditionals(filename: string) {
  const filepath = path.join(SCHEMA_DIR, filename);
  assert(existsSync(filepath), `Missing research schema: ${filename}`);
  const schema = JSON.parse(readFileSync(filepath, "utf8")) as Record<string, unknown>;
  delete schema.allOf;
  return z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
}

function validateRecords<T>(validator: z.ZodType, values: T[], label: string) {
  for (let index = 0; index < values.length; index += 1) {
    const result = validator.safeParse(values[index]);
    assert(
      result.success,
      `${label} ${index + 1} failed schema validation: ${result.error?.message}`,
    );
  }
}

function assertReviewInvariant(event: EvidenceReviewEvent) {
  if (event.event_type === "evidence.reviewed") {
    assert(
      ["accepted", "rejected"].includes(event.decision),
      `Review ${event.eventId} has an incompatible decision.`,
    );
    assert(
      !event.references.replacement_assertion_event_id,
      `Review ${event.eventId} unexpectedly names a replacement assertion.`,
    );
  }
  if (event.event_type === "evidence.retracted") {
    assert(event.decision === "retracted", `Retraction ${event.eventId} has the wrong decision.`);
    assert(!event.publication_eligible, `Retraction ${event.eventId} cannot be publication eligible.`);
    assert(event.reason_codes.length > 0, `Retraction ${event.eventId} requires a reason code.`);
  }
  if (event.event_type === "evidence.superseded") {
    assert(event.decision === "superseded", `Superseding event ${event.eventId} has the wrong decision.`);
    assert(!event.publication_eligible, `Superseding event ${event.eventId} cannot be publication eligible.`);
    assert(
      Boolean(event.references.replacement_assertion_event_id),
      `Superseding event ${event.eventId} requires a replacement assertion.`,
    );
    assert(event.reason_codes.length > 0, `Superseding event ${event.eventId} requires a reason code.`);
  }
  if (event.decision === "rejected") {
    assert(!event.publication_eligible, `Rejected review ${event.eventId} cannot be publication eligible.`);
    assert(event.reason_codes.length > 0, `Rejected review ${event.eventId} requires a reason code.`);
  }
  if (event.publication_eligible) {
    assert(
      event.event_type === "evidence.reviewed" && event.decision === "accepted",
      `Publication eligible review ${event.eventId} must be an accepted review.`,
    );
  }
}

function assertOutcomeInvariant(outcome: ResearchPairOutcome) {
  if (outcome.status === "evidence-found") {
    assert(
      outcome.assertion_event_ids.length > 0 && outcome.query_urls.length > 0,
      `Evidence outcome ${outcome.outcome_id} lacks assertions or query URLs.`,
    );
  }
  if (outcome.status === "no-qualifying-evidence") {
    assert(outcome.scope_complete, `No-evidence outcome ${outcome.outcome_id} must be scope complete.`);
    assert(
      outcome.assertion_event_ids.length === 0 && outcome.query_urls.length > 0,
      `No-evidence outcome ${outcome.outcome_id} has assertions or lacks query URLs.`,
    );
  }
  if (["needs-followup", "blocked"].includes(outcome.status)) {
    assert(!outcome.scope_complete, `Incomplete outcome ${outcome.outcome_id} cannot be scope complete.`);
  }
  if (outcome.scope_complete) {
    assert(
      ["evidence-found", "no-qualifying-evidence"].includes(outcome.status),
      `Scope-complete outcome ${outcome.outcome_id} has an invalid status.`,
    );
  }
}

async function main() {
const registryPath = path.join(ROOT, "src/data/research/source-registry.json");
const evidencePath = path.join(ROOT, "src/data/research/evidence-assertions.ndjson");
const runsPath = path.join(ROOT, "src/data/research/research-runs.json");
const reviewEventsPath = path.join(ROOT, "src/data/research/review-events.ndjson");
const rejectionsPath = path.join(ROOT, "src/data/research/rejections.ndjson");
const migrationReportPath = path.join(ROOT, "src/data/research/migration-report.json");
const migrationCandidatesPath = path.join(ROOT, "src/data/research/migration-candidates.json");
const bootstrapFreezePath = path.join(ROOT, "src/data/research/bootstrap-ledger-freeze.json");
const summaryPath = path.join(ROOT, "src/data/generated/research/AL/summary.json");
const publicSummaryPath = path.join(ROOT, "public/generated/research/AL/summary.json");
const publicCountyDir = path.join(ROOT, "public/generated/research/AL/counties");

for (const filepath of [
  registryPath,
  evidencePath,
  runsPath,
  reviewEventsPath,
  rejectionsPath,
  migrationReportPath,
  migrationCandidatesPath,
  bootstrapFreezePath,
  summaryPath,
  publicSummaryPath,
]) {
  assert(existsSync(filepath), `Missing required research artifact: ${path.relative(ROOT, filepath)}`);
}

const speciesIds = new Set(
  readJson<SpeciesRecord[]>(path.join(ROOT, "src/data/generated/species.json")).map(
    (entry) => entry.id,
  ),
);
const generatedCounties = Object.values(
  readJson<Record<string, CountyRecord>>(path.join(ROOT, "src/data/generated/counties.json")),
);
const countyByFips = new Map(
  generatedCounties.map((county) => [county.countyFips, county]),
);
const nationalStateCodes = new Set(generatedCounties.map((county) => county.stateCode));
const alabamaCountyFips = new Set(
  generatedCounties
    .filter((county) => county.stateCode === "AL")
    .map((county) => county.countyFips),
);
const matrix = readJson<MatrixFile>(path.join(ROOT, "docs/county-coverage/states/AL.json"));
const bootstrapFreeze = readJson<BootstrapFreezeFile>(bootstrapFreezePath);
const registry = readJson<ResearchSourceRegistry>(registryPath);
const bootstrapEvidence = readNdjson<EvidenceAssertion>(evidencePath);
const runsFile = readJson<RunsFile>(runsPath);
const runs = runsFile.runs;
const summary = readJson<ResearchStateSummary>(summaryPath);
const asOfCutoff = Date.parse(`${summary.asOf}T23:59:59.999Z`);
const immutableRuns = listImmutableResearchRuns(ROOT);
for (const bundle of immutableRuns) assertImmutableRunStateConsistency(bundle);
const projectedAlabamaImmutableRuns = selectImmutableResearchRunsForState(
  immutableRuns,
  "AL",
  summary.asOf,
);
const runAssertions = immutableRuns.flatMap((bundle) => bundle.assertions);
const projectedRunAssertions = projectedAlabamaImmutableRuns.flatMap(
  (bundle) => bundle.assertions,
);
const perRunReviews = immutableRuns.flatMap((bundle) => bundle.reviews);
const laterReviews = readRunNdjson<EvidenceReviewEvent>(reviewEventsPath);
const reviews = [...perRunReviews, ...laterReviews];
const projectedReviews = [
  ...projectedAlabamaImmutableRuns.flatMap((bundle) => bundle.reviews),
  ...laterReviews.filter(
    (event) =>
      event.state_code === "AL" && Date.parse(event.created_at) <= asOfCutoff,
  ),
];
const perRunRejections = immutableRuns.flatMap((bundle) => bundle.rejections);
const laterRejections = readRunNdjson<ResearchRejectionRecord>(rejectionsPath);
const rejections = [...perRunRejections, ...laterRejections];
const projectedRejections = [
  ...projectedAlabamaImmutableRuns.flatMap((bundle) => bundle.rejections),
  ...laterRejections.filter(
    (record) =>
      record.normalized_target.state_code === "AL" &&
      Date.parse(record.created_at) <= asOfCutoff,
  ),
];
const outcomes = immutableRuns.flatMap((bundle) => bundle.outcomes);
const projectedOutcomes = projectedAlabamaImmutableRuns.flatMap(
  (bundle) => bundle.outcomes,
);
const migrationCandidates = readJson<MigrationCandidatesFile>(migrationCandidatesPath);
const nationalNasAcquisitions = [];
if (existsSync(NATIONAL_ACQUISITIONS_DIR)) {
  for (const entry of readdirSync(NATIONAL_ACQUISITIONS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const directory = path.join(NATIONAL_ACQUISITIONS_DIR, entry.name);
    const receiptPath = path.join(directory, "receipt.json");
    assert(existsSync(receiptPath), `National acquisition ${entry.name} lacks a receipt.`);
    const candidate = readJson<{ source_id?: string }>(receiptPath);
    assert(
      candidate.source_id === "usgs-nas",
      `National acquisition ${entry.name} has unsupported source ${candidate.source_id ?? "missing"}.`,
    );
    const verified = await verifyNationalNasAcquisition(ROOT, directory, true);
    assertCommitAncestor(ROOT, verified.receipt.code_commit, execFileSync(
      "git",
      ["rev-parse", "HEAD"],
      { cwd: ROOT, encoding: "utf8" },
    ).trim());
    nationalNasAcquisitions.push(verified);
  }
}
const nationalNasAcquisitionById = new Map(
  nationalNasAcquisitions.map((entry) => [entry.receipt.acquisition_id, entry]),
);
const nationalNasReferences: NationalNasReference[] = [];
const nationalNasReferenceEntries: Array<{
  reference: NationalNasReference;
  bundle: (typeof immutableRuns)[number];
}> = [];

assert(bootstrapFreeze.rules.initializationOnly, "Bootstrap migration is no longer initialization-only.");
assert(
  bootstrapFreeze.rules.routineRefreshMayRunMigration === false,
  "Routine refresh is incorrectly permitted to rerun bootstrap migration.",
);
assert(
  bootstrapFreeze.rules.reviewedRunEvidenceMustRemainSeparate,
  "Bootstrap freeze no longer separates reviewed run evidence.",
);
for (const [label, frozen] of Object.entries(bootstrapFreeze.files)) {
  const absolute = path.join(ROOT, frozen.path);
  assert(existsSync(absolute), `Frozen bootstrap file is missing: ${frozen.path}.`);
  const bytes = readFileSync(absolute);
  assert(sha256(bytes) === frozen.sha256, `Frozen bootstrap file changed: ${label}.`);
  if (frozen.bytes !== undefined) {
    assert(bytes.length === frozen.bytes, `Frozen bootstrap byte count changed: ${label}.`);
  }
}
assert(
  bootstrapFreeze.files.evidenceAssertions.recordCount === bootstrapEvidence.length,
  "Frozen bootstrap record count changed.",
);

schemaValidator("source-registry.schema.json").parse(registry);
schemaValidator("bootstrap-research-runs.schema.json").parse(runsFile);
validateRecords(
  schemaValidator("bootstrap-evidence-assertion.schema.json"),
  bootstrapEvidence,
  "Bootstrap evidence assertion",
);
validateRecords(
  schemaValidator("evidence-assertion.schema.json"),
  runAssertions,
  "Run evidence assertion",
);
validateRecords(
  schemaValidator("rejection-record.schema.json"),
  rejections,
  "Research rejection",
);
validateRecords(
  schemaValidatorWithoutConditionals("review-event.schema.json"),
  reviews,
  "Research review event",
);
validateRecords(
  schemaValidatorWithoutConditionals("pair-outcome.schema.json"),
  outcomes,
  "Research pair outcome",
);
validateRecords(
  schemaValidator("run-receipt.schema.json"),
  immutableRuns.map((bundle) => bundle.receipt),
  "Immutable run receipt",
);
schemaValidator("research-projection.schema.json").parse(summary);

assert(summary.schemaVersion === 3, "Unsupported generated research projection version.");
assert(registry.schemaVersion === 1, "Unsupported source registry schema version.");
assertUnique(registry.sources.map((source) => source.id), "Source IDs");
const registryLabels = registry.sources
  .flatMap((source) => [source.label, ...source.aliases])
  .map((label) => label.toLowerCase());
assertUnique(registryLabels, "Source labels and aliases");
const sourceById = new Map(registry.sources.map((source) => [source.id, source]));

assertUnique(bootstrapEvidence.map((entry) => entry.evidenceId), "Bootstrap evidence IDs");
for (const entry of bootstrapEvidence) {
  assert(entry.stateCode === "AL", `Evidence ${entry.evidenceId} has unexpected state ${entry.stateCode}.`);
  assert(alabamaCountyFips.has(entry.countyFips), `Evidence ${entry.evidenceId} has unknown county ${entry.countyFips}.`);
  assert(speciesIds.has(entry.speciesId), `Evidence ${entry.evidenceId} has unknown species ${entry.speciesId}.`);
  const source = sourceById.get(entry.sourceId);
  assert(source, `Evidence ${entry.evidenceId} has unknown source ${entry.sourceId}.`);
  assert(
    source.evidenceCapabilities.includes(entry.assertion),
    `Evidence ${entry.evidenceId} uses unsupported assertion ${entry.assertion} for ${entry.sourceId}.`,
  );
  assert(/^https?:\/\//.test(entry.url), `Evidence ${entry.evidenceId} has a non-HTTP source URL.`);
}

assertUnique(runs.map((run) => run.runId), "Bootstrap research run IDs");
for (const run of runs) {
  assert(sourceById.has(run.sourceId), `Research run ${run.runId} has unknown source ${run.sourceId}.`);
  for (const speciesId of [...run.targetSpeciesIds, ...run.acceptedSpeciesIds]) {
    assert(speciesIds.has(speciesId), `Research run ${run.runId} has unknown species ${speciesId}.`);
  }
  assertUnique(run.targetSpeciesIds, `Research run ${run.runId} target species`);
  assertUnique(run.acceptedSpeciesIds, `Research run ${run.runId} accepted species`);
}

assertUnique(immutableRuns.map((bundle) => bundle.receipt.run_id), "Immutable research run IDs");
assertUnique(runAssertions.map((entry) => entry.eventId), "Run evidence event IDs");
assertUnique(reviews.map((entry) => entry.eventId), "Review event IDs");
assertUnique(rejections.map((entry) => entry.rejection_id), "Rejection IDs");
assertUnique(outcomes.map((entry) => entry.outcome_id), "Pair outcome IDs");
const assertionById = new Map(runAssertions.map((entry) => [entry.eventId, entry]));
const rejectionById = new Map(rejections.map((entry) => [entry.rejection_id, entry]));

for (const bundle of immutableRuns) {
  const { receipt } = bundle;
  const runStateCode = receipt.requested_scope.state_code;
  assert(
    nationalStateCodes.has(runStateCode),
    `Immutable run ${receipt.run_id} has unknown state ${runStateCode}.`,
  );
  const source = sourceById.get(receipt.source_id);
  assert(source?.researchAdapter, `Immutable run ${receipt.run_id} has no registered adapter.`);
  execFileSync("git", ["cat-file", "-e", `${receipt.code_commit}^{commit}`], {
    cwd: ROOT,
    stdio: "ignore",
  });
  if (receipt.source_id === "usgs-nas" && receipt.adapter_id === "usgs-nas-archive") {
    const matchingArtifacts = receipt.artifacts.filter((entry) =>
      entry.path.endsWith("/artifacts/national-acquisition-reference.json"),
    );
    assert(
      matchingArtifacts.length === 1,
      `Immutable run ${receipt.run_id} must contain one national acquisition reference.`,
    );
    const artifact = matchingArtifacts[0]!;
    const artifactBytes = readFileSync(path.join(ROOT, artifact.path));
    assert(
      artifactBytes.length === artifact.bytes && sha256(artifactBytes) === artifact.sha256,
      `Immutable run ${receipt.run_id} national acquisition reference changed.`,
    );
    const reference = JSON.parse(artifactBytes.toString("utf8")) as NationalNasReference;
    validateNationalNasReference(ROOT, reference);
    nationalNasReferences.push(reference);
    nationalNasReferenceEntries.push({ reference, bundle });
    const acquisition = nationalNasAcquisitionById.get(reference.acquisitionId);
    assert(acquisition, `Immutable run ${receipt.run_id} references an unknown national acquisition.`);
    assert(
      reference.acquisitionReceiptPath === path.relative(ROOT, acquisition.receiptPath).split(path.sep).join("/") &&
        reference.acquisitionReceiptSha256 === acquisition.receiptSha256 &&
        reference.archivePath === path.relative(ROOT, acquisition.archivePath).split(path.sep).join("/") &&
        reference.archiveSha256 === acquisition.receipt.artifact.sha256 &&
        reference.archiveBytes === acquisition.receipt.artifact.bytes &&
        reference.archiveVersion === acquisition.receipt.parameters.archiveVersion,
      `Immutable run ${receipt.run_id} national acquisition lineage changed.`,
    );
    assertCommitAncestor(ROOT, acquisition.receipt.code_commit, receipt.code_commit);
    assert(
      reference.sourceId === receipt.source_id &&
        reference.adapterVersion === receipt.adapter_version &&
        reference.adapterCodeSha256 === receipt.adapter_code_hash &&
        reference.stateCode === runStateCode &&
        receipt.requested_scope.species_ids.length === 1 &&
        reference.speciesId === receipt.requested_scope.species_ids[0],
      `Immutable run ${receipt.run_id} national acquisition scope changed.`,
    );
    const committedPlan = execFileSync(
      "git",
      ["show", `${receipt.code_commit}:${reference.planPath}`],
      { cwd: ROOT },
    );
    const committedPartitionScript = execFileSync(
      "git",
      ["show", `${receipt.code_commit}:scripts/research/partition-national-usgs-nas-acquisition.ts`],
      { cwd: ROOT },
    );
    assert(
      sha256(committedPlan) === reference.planSha256 &&
        sha256(committedPartitionScript) === reference.partitionScriptSha256,
      `Immutable run ${receipt.run_id} national partition inputs changed.`,
    );
    assert(
      reference.reconciliation.selected_records === receipt.counts.candidate_records &&
      reference.reconciliation.assertion_pairs === receipt.counts.assertion_events &&
        reference.reconciliation.rejection_events === receipt.counts.rejection_records &&
        reference.reconciliation.duplicate_record_ids === receipt.counts.duplicate_records &&
        reference.reconciliation.blocked_outcome_pairs ===
          bundle.outcomes.filter((entry) => entry.status === "blocked").length &&
        reference.reconciliation.blocking_candidate_records <=
          reference.reconciliation.rejected_candidate_records,
      `Immutable run ${receipt.run_id} national reconciliation counts changed.`,
    );
  }
  if (receipt.run_id === LEGACY_DIRTY_BOOTSTRAP_RUN_ID) {
    assert(
      source.researchAdapter.id === receipt.adapter_id &&
        source.researchAdapter.allowedVersions.includes(receipt.adapter_version),
      `Legacy immutable run ${receipt.run_id} uses an unknown adapter or version.`,
    );
    const parameterSchemaPath = path.join(ROOT, source.researchAdapter.parameterSchema);
    const parameterSchema = JSON.parse(
      readFileSync(parameterSchemaPath, "utf8"),
    ) as Parameters<typeof z.fromJSONSchema>[0];
    z.fromJSONSchema(parameterSchema).parse(receipt.parameters);
    assert(
      versionedFileHashes(source.researchAdapter.module).has(receipt.adapter_code_hash),
      `Legacy immutable run ${receipt.run_id} adapter hash is not present in git history.`,
    );
    assert(
      versionedFileHashes("src/data/research/source-registry.json").has(
        receipt.source_registry_hash,
      ),
      `Legacy immutable run ${receipt.run_id} registry hash is not present in git history.`,
    );
  } else {
    const committedRegistry = execFileSync(
      "git",
      ["show", `${receipt.code_commit}:src/data/research/source-registry.json`],
      { cwd: ROOT },
    );
    assert(
      sha256(committedRegistry) === receipt.source_registry_hash,
      `Immutable run ${receipt.run_id} registry hash does not match its exact code commit.`,
    );
    const historicalRegistry = JSON.parse(
      committedRegistry.toString("utf8"),
    ) as ResearchSourceRegistry;
    const historicalSource = historicalRegistry.sources.find(
      (entry) => entry.id === receipt.source_id,
    );
    assert(
      historicalSource?.researchAdapter &&
        historicalSource.researchAdapter.id === receipt.adapter_id &&
        historicalSource.researchAdapter.allowedVersions.includes(receipt.adapter_version),
      `Immutable run ${receipt.run_id} is not registered at its exact code commit.`,
    );
    const committedAdapter = execFileSync(
      "git",
      ["show", `${receipt.code_commit}:${historicalSource.researchAdapter.module}`],
      { cwd: ROOT },
    );
    assert(
      sha256(committedAdapter) === receipt.adapter_code_hash,
      `Immutable run ${receipt.run_id} adapter hash does not match its exact code commit.`,
    );
    const committedParameterSchema = execFileSync(
      "git",
      ["show", `${receipt.code_commit}:${historicalSource.researchAdapter.parameterSchema}`],
      { cwd: ROOT },
    );
    const parameterSchema = JSON.parse(
      committedParameterSchema.toString("utf8"),
    ) as Parameters<typeof z.fromJSONSchema>[0];
    z.fromJSONSchema(parameterSchema).parse(receipt.parameters);
  }
  const startedAt = Date.parse(receipt.started_at);
  const finishedAt = Date.parse(receipt.finished_at);
  assert(startedAt <= finishedAt, `Immutable run ${receipt.run_id} finishes before it starts.`);
  for (const [label, records] of [
    ["assertion", bundle.assertions.map((record) => record.created_at)],
    ["review", bundle.reviews.map((record) => record.created_at)],
    ["rejection", bundle.rejections.map((record) => record.created_at)],
    ["outcome", bundle.outcomes.map((record) => record.recorded_at)],
  ] as const) {
    for (const timestamp of records) {
      const value = Date.parse(timestamp);
      assert(
        value >= startedAt && value <= finishedAt,
        `Immutable run ${receipt.run_id} ${label} timestamp is outside the receipt interval.`,
      );
    }
  }
  assert(
    receipt.counts.requested_pairs === receipt.requested_scope.pair_keys.length,
    `Immutable run ${receipt.run_id} has a requested-pair count mismatch.`,
  );
  assert(
    receipt.parameter_hash === sha256(stableJson(receipt.parameters)),
    `Immutable run ${receipt.run_id} has a parameter hash mismatch.`,
  );
  const candidatePairs = receipt.parameters.candidatePairs;
  assert(
    Array.isArray(candidatePairs) &&
      candidatePairs.every((value): value is string => typeof value === "string") &&
      stableJson(candidatePairs) === stableJson(receipt.requested_scope.pair_keys),
    `Immutable run ${receipt.run_id} parameter pairs disagree with requested scope.`,
  );
  const expectedCountyFips = [
    ...new Set(receipt.requested_scope.pair_keys.map((key) => key.split(":", 1)[0])),
  ].sort();
  const expectedSpeciesIds = [
    ...new Set(
      receipt.requested_scope.pair_keys.map((key) => key.slice(key.indexOf(":") + 1)),
    ),
  ].sort();
  assert(
    stableJson(expectedCountyFips) === stableJson(receipt.requested_scope.county_fips) &&
      stableJson(expectedSpeciesIds) === stableJson(receipt.requested_scope.species_ids),
    `Immutable run ${receipt.run_id} requested scope arrays disagree with pair keys.`,
  );
  assert(
    receipt.counts.error_count === receipt.errors.length,
    `Immutable run ${receipt.run_id} has an error count mismatch.`,
  );
  assert(
    bundle.outcomes.length === receipt.requested_scope.pair_keys.length,
    `Immutable run ${receipt.run_id} must emit one outcome per requested pair.`,
  );
  const requestedPairs = new Set(receipt.requested_scope.pair_keys);
  const outcomePairs = bundle.outcomes.map((outcome) => pairKey(outcome.county_fips, outcome.species_id));
  assertUnique(outcomePairs, `Immutable run ${receipt.run_id} outcome pairs`);
  for (const requestedPair of requestedPairs) {
    assert(outcomePairs.includes(requestedPair), `Immutable run ${receipt.run_id} lacks outcome ${requestedPair}.`);
  }
  for (const assertion of bundle.assertions) {
    assert(
      assertion.state_code === runStateCode,
      `Immutable run ${receipt.run_id} assertion ${assertion.eventId} disagrees with receipt state.`,
    );
  }
  for (const review of bundle.reviews) {
    assert(
      review.state_code === runStateCode,
      `Immutable run ${receipt.run_id} review ${review.eventId} disagrees with receipt state.`,
    );
  }
  for (const rejection of bundle.rejections) {
    assert(
      rejection.normalized_target.state_code === runStateCode,
      `Immutable run ${receipt.run_id} rejection ${rejection.rejection_id} disagrees with receipt state.`,
    );
  }
  for (const outcome of bundle.outcomes) {
    assert(
      outcome.state_code === runStateCode,
      `Immutable run ${receipt.run_id} outcome ${outcome.outcome_id} disagrees with receipt state.`,
    );
  }
}

for (const acquisition of nationalNasAcquisitions) {
  const referenceEntries = nationalNasReferenceEntries.filter(
    (entry) => entry.reference.acquisitionId === acquisition.receipt.acquisition_id,
  );
  if (referenceEntries.length === 0) continue;
  const recordsByRun = new Map(
    referenceEntries.map((entry) => [entry.bundle.receipt.run_id, [] as NasArchiveOccurrence[]]),
  );
  const referencesByTaxon = new Map<string, typeof referenceEntries>();
  for (const entry of referenceEntries) {
    const key = canonicalBinomial(entry.reference.scientificName);
    const values = referencesByTaxon.get(key) ?? [];
    values.push(entry);
    referencesByTaxon.set(key, values);
  }
  let selectedRecordCount = 0;
  const archiveRecordCount = await streamNationalNasOccurrences(
    acquisition.archivePath,
    (record) => {
      const matchingEntries = referencesByTaxon.get(canonicalBinomial(record.scientificName)) ?? [];
      for (const entry of matchingEntries) {
        if (!nationalNasRecordAppliesToScreen({
          recordStateProvince: record.stateProvince,
          recordScientificName: record.scientificName,
          screenStateCode: entry.reference.stateCode,
          screenScientificName: entry.reference.scientificName,
        })) continue;
        const values = recordsByRun.get(entry.bundle.receipt.run_id)!;
        assert(
          values.length < USGS_NAS_SELECTED_RECORD_BUDGET_PER_SCREEN,
          `Integrity replay exceeded the record budget for ${entry.bundle.receipt.run_id}.`,
        );
        assert(
          selectedRecordCount < USGS_NAS_SELECTED_RECORD_BUDGET_PER_PARTITION,
          `Integrity replay exceeded the ${USGS_NAS_SELECTED_RECORD_BUDGET_PER_PARTITION}-record acquisition budget.`,
        );
        values.push(record);
        selectedRecordCount += 1;
      }
    },
  );
  assert(
    archiveRecordCount === acquisition.receipt.archive.record_count,
    `Integrity replay counted ${archiveRecordCount} USGS NAS rows instead of ${acquisition.receipt.archive.record_count}.`,
  );
  for (const entry of referenceEntries) {
    const { bundle, reference } = entry;
    const state = getStateDefinition(reference.stateCode);
    assert(state, `Integrity replay has unknown state ${reference.stateCode}.`);
    const requestedPairs = listCountyEquivalents(reference.stateCode).map((county) => ({
      countyFips: county.countyFips,
      countyName: county.shortName,
      countyLegalName: county.legalName,
      stateCode: reference.stateCode,
      stateName: state.stateName,
      speciesId: reference.speciesId,
      scientificName: reference.scientificName,
    }));
    const acceptedOccurrenceStatuses = bundle.receipt.parameters.acceptedOccurrenceStatuses;
    assert(
      Array.isArray(acceptedOccurrenceStatuses) &&
        acceptedOccurrenceStatuses.every((value): value is string => typeof value === "string"),
      `Integrity replay lacks accepted statuses for ${bundle.receipt.run_id}.`,
    );
    const replay = replayNationalNasScreen({
      context: {
        runId: bundle.receipt.run_id,
        sourceId: bundle.receipt.source_id,
        stateCode: reference.stateCode,
        requestedPairs: requestedPairs.map((pair) => ({
          countyFips: pair.countyFips,
          countyName: pair.countyName,
          speciesId: pair.speciesId,
          scientificName: pair.scientificName,
        })),
        runStartedAt: bundle.receipt.started_at,
        parameters: bundle.receipt.parameters,
      },
      requestedPairs,
      records: recordsByRun.get(bundle.receipt.run_id)!,
      acceptedOccurrenceStatuses,
      completedAt: bundle.receipt.finished_at,
      archiveUrl: canonicalNasArchiveUrl(reference.archiveVersion),
    });
    assert(
      replay.selectedRowsSha256 === reference.selectedRowsSha256 &&
        stableJson(replay.reconciliation) === stableJson(reference.reconciliation),
      `Integrity replay changed USGS NAS selection or reconciliation for ${bundle.receipt.run_id}.`,
    );
    for (const [label, actual, expected] of [
      ["assertions", replay.assertions, bundle.assertions],
      ["reviews", replay.reviews, bundle.reviews],
      ["rejections", replay.rejections, bundle.rejections],
      ["outcomes", replay.outcomes, bundle.outcomes],
    ] as const) {
      assert(
        stableJson(actual) === stableJson(expected),
        `Integrity replay changed USGS NAS ${label} for ${bundle.receipt.run_id}.`,
      );
    }
  }
}

for (const entry of runAssertions) {
  const county = countyByFips.get(entry.county_fips);
  assert(county, `Run assertion ${entry.eventId} has an unknown county.`);
  assert(
    county.stateCode === entry.state_code,
    `Run assertion ${entry.eventId} county does not belong to ${entry.state_code}.`,
  );
  assert(speciesIds.has(entry.species_id), `Run assertion ${entry.eventId} has an unknown species.`);
  assert(sourceById.has(entry.source_id), `Run assertion ${entry.eventId} has an unknown source.`);
  assert(entry.geography_match.county_fips === entry.county_fips, `Run assertion ${entry.eventId} has inconsistent county mapping.`);
  assert(/^https?:\/\//.test(entry.source_url), `Run assertion ${entry.eventId} has a non-HTTP URL.`);
}
for (const event of reviews) {
  assertReviewInvariant(event);
  assert(
    nationalStateCodes.has(event.state_code),
    `Review ${event.eventId} has unknown state ${event.state_code}.`,
  );
  const assertion = assertionById.get(event.references.assertion_event_id);
  assert(assertion, `Review ${event.eventId} references an unknown assertion.`);
  assert(
    assertion.state_code === event.state_code &&
      assertion.county_fips === event.county_fips &&
      assertion.species_id === event.species_id,
    `Review ${event.eventId} does not match its assertion state or pair.`,
  );
}
for (const rejection of rejections) {
  assert(sourceById.has(rejection.source_id), `Rejection ${rejection.rejection_id} has an unknown source.`);
  assert(
    nationalStateCodes.has(rejection.normalized_target.state_code),
    `Rejection ${rejection.rejection_id} has an unknown state.`,
  );
  assert(speciesIds.has(rejection.normalized_target.species_id), `Rejection ${rejection.rejection_id} has an unknown species.`);
  if (rejection.normalized_target.county_fips) {
    const county = countyByFips.get(rejection.normalized_target.county_fips);
    assert(county, `Rejection ${rejection.rejection_id} has an unknown county.`);
    assert(
      county.stateCode === rejection.normalized_target.state_code,
      `Rejection ${rejection.rejection_id} county does not belong to its state.`,
    );
  }
}
for (const outcome of outcomes) {
  assertOutcomeInvariant(outcome);
  assert(sourceById.has(outcome.source_id), `Outcome ${outcome.outcome_id} has an unknown source.`);
  const county = countyByFips.get(outcome.county_fips);
  assert(county, `Outcome ${outcome.outcome_id} has an unknown county.`);
  assert(
    county.stateCode === outcome.state_code,
    `Outcome ${outcome.outcome_id} county does not belong to ${outcome.state_code}.`,
  );
  assert(speciesIds.has(outcome.species_id), `Outcome ${outcome.outcome_id} has an unknown species.`);
  for (const assertionId of outcome.assertion_event_ids) {
    const assertion = assertionById.get(assertionId);
    assert(assertion, `Outcome ${outcome.outcome_id} references unknown assertion ${assertionId}.`);
    assert(assertion.run_id === outcome.run_id, `Outcome ${outcome.outcome_id} references an assertion from another run.`);
    assert(
      assertion.source_id === outcome.source_id &&
        assertion.county_fips === outcome.county_fips &&
        assertion.species_id === outcome.species_id,
      `Outcome ${outcome.outcome_id} does not match assertion ${assertionId}.`,
    );
  }
  for (const rejectionId of outcome.rejection_ids) {
    const rejection = rejectionById.get(rejectionId);
    assert(rejection, `Outcome ${outcome.outcome_id} references unknown rejection ${rejectionId}.`);
    assert(rejection.run_id === outcome.run_id, `Outcome ${outcome.outcome_id} references a rejection from another run.`);
  }
}

const compiledEvidence = compileAdditiveResearchEvidence({
  bootstrapEvidence,
  runAssertions: projectedRunAssertions,
  reviewEvents: projectedReviews,
  sources: registry.sources,
  asOf: summary.asOf,
});
const resolvedRunEvidence = compiledEvidence.resolvedRunEvidence;
const publishedRunEvidenceIds = new Set(
  resolvedRunEvidence.publishedAssertions.map((entry) => entry.eventId),
);
const projectedRunEvidenceIds = new Set(
  compiledEvidence.projectedRunAssertions.map((entry) => entry.eventId),
);

const bootstrapPresentPairs = new Set(
  bootstrapEvidence
    .filter((entry) => entry.assertion === "recorded-present")
    .map((entry) => pairKey(entry.countyFips, entry.speciesId)),
);
const bootstrapAbsentPairs = new Set(
  bootstrapEvidence
    .filter((entry) => entry.assertion === "officially-absent")
    .map((entry) => pairKey(entry.countyFips, entry.speciesId)),
);
const bootstrapNotDetectedPairs = new Set(
  bootstrapEvidence
    .filter((entry) => entry.assertion === "not-detected")
    .map((entry) => pairKey(entry.countyFips, entry.speciesId)),
);
const matrixPresentPairs = new Set(
  matrix.counties.flatMap((county) =>
    county.presentVerifiedSpeciesIds.map((speciesId) => pairKey(county.countyFips, speciesId)),
  ),
);
const matrixAbsentPairs = new Set(
  matrix.counties.flatMap((county) =>
    county.verifiedAbsentSpeciesIds.map((speciesId) => pairKey(county.countyFips, speciesId)),
  ),
);
const matrixNotDetectedPairs = new Set(
  matrix.counties.flatMap((county) =>
    county.notDetectedSpeciesIds.map((speciesId) => pairKey(county.countyFips, speciesId)),
  ),
);

const frozenPairSets = {
  "recorded-present": bootstrapPresentPairs,
  "officially-absent": bootstrapAbsentPairs,
  "not-detected": bootstrapNotDetectedPairs,
};
for (const [assertion, pairs] of Object.entries(frozenPairSets)) {
  const frozen = bootstrapFreeze.assertionPairSets[
    assertion as keyof BootstrapFreezeFile["assertionPairSets"]
  ];
  const recordCount = bootstrapEvidence.filter((entry) => entry.assertion === assertion).length;
  const sortedPairSet = `${[...pairs].sort().join("\n")}\n`;
  assert(recordCount === frozen.recordCount, `Frozen ${assertion} record count changed.`);
  assert(pairs.size === frozen.distinctPairCount, `Frozen ${assertion} pair count changed.`);
  assert(sha256(sortedPairSet) === frozen.sortedPairSetSha256, `Frozen ${assertion} pair set changed.`);
}
const bootstrapEvidenceIds = new Set(bootstrapEvidence.map((entry) => entry.evidenceId));
for (const assertion of projectedRunAssertions) {
  assert(
    !bootstrapEvidenceIds.has(assertion.eventId),
    `Run assertion ${assertion.eventId} collides with frozen bootstrap evidence.`,
  );
}

const presentPairs = new Set(bootstrapPresentPairs);
const absentPairs = new Set(bootstrapAbsentPairs);
const notDetectedPairs = new Set(bootstrapNotDetectedPairs);

for (const assertion of compiledEvidence.projectedRunAssertions) {
  const key = pairKey(assertion.county_fips, assertion.species_id);
  if (assertion.claim_type === "recorded-present") presentPairs.add(key);
  if (assertion.claim_type === "officially-absent") absentPairs.add(key);
  if (assertion.claim_type === "not-detected") notDetectedPairs.add(key);
}
for (const key of bootstrapPresentPairs) assert(presentPairs.has(key), `Compiled evidence lost bootstrap present pair ${key}.`);
for (const key of bootstrapAbsentPairs) assert(absentPairs.has(key), `Compiled evidence lost bootstrap absence pair ${key}.`);
for (const key of bootstrapNotDetectedPairs) assert(notDetectedPairs.has(key), `Compiled evidence lost bootstrap not-detected pair ${key}.`);

const displayedNotDetectedPairs = new Set(
  [...notDetectedPairs].filter((key) => !presentPairs.has(key) && !absentPairs.has(key)),
);
assert(presentPairs.size === matrixPresentPairs.size, "Compiled present evidence does not match the compatibility matrix count.");
assert(absentPairs.size === matrixAbsentPairs.size, "Compiled absence evidence does not match the compatibility matrix count.");
assert(displayedNotDetectedPairs.size === matrixNotDetectedPairs.size, "Compiled not-detected evidence does not match the compatibility matrix count.");
for (const key of presentPairs) assert(matrixPresentPairs.has(key), `Compatibility matrix is missing present pair ${key}.`);
for (const key of absentPairs) assert(matrixAbsentPairs.has(key), `Compatibility matrix is missing absence pair ${key}.`);
for (const key of displayedNotDetectedPairs) assert(matrixNotDetectedPairs.has(key), `Compatibility matrix is missing not-detected pair ${key}.`);

const compatibilityPresence = readJson<Record<string, { speciesIds: string[] }>>(
  path.join(ROOT, "src/data/generated/presence.json"),
);
const compatibilityPresentPairs = new Set(
  Object.entries(compatibilityPresence)
    .filter(([countyFips]) => alabamaCountyFips.has(countyFips))
    .flatMap(([countyFips, county]) =>
      county.speciesIds.map((speciesId) => pairKey(countyFips, speciesId)),
    ),
);
assert(
  compatibilityPresentPairs.size === presentPairs.size,
  "Normal compatibility presence count differs from research presence.",
);
for (const key of presentPairs) {
  assert(compatibilityPresentPairs.has(key), `Normal compatibility presence is missing ${key}.`);
}
const explorerSpecies = readJson<Array<{ id: string }>>(
  path.join(ROOT, "src/data/generated/explorer-species.json"),
);
const explorerPresence = readJson<Record<string, number[]>>(
  path.join(ROOT, "src/data/generated/explorer-presence.json"),
);
for (const [countyFips, county] of Object.entries(compatibilityPresence)) {
  const decoded = (explorerPresence[countyFips] ?? []).map((ordinal) => explorerSpecies[ordinal]?.id);
  assert(
    decoded.join("\n") === county.speciesIds.join("\n"),
    `Explorer presence ordinals do not match normal presence for ${countyFips}.`,
  );
}
for (const filename of [
  "presence.json",
  "explorer-presence.json",
  "species.json",
  "explorer-species.json",
  "snapshot.json",
]) {
  assert(
    readFileSync(path.join(ROOT, "src/data/generated", filename), "utf8") ===
      readFileSync(path.join(ROOT, "public/generated", filename), "utf8"),
    `Source and public ${filename} differ.`,
  );
}

const totals = summary.summary;
assert(summary.stateCode === "AL", "Generated summary is not Alabama.");
assert(totals.speciesCount === speciesIds.size, "Generated summary species count is stale.");
assert(totals.countyCount === alabamaCountyFips.size, "Generated summary county count is stale.");
assert(totals.totalPairs === totals.speciesCount * totals.countyCount, "Generated total pair count is invalid.");
assert(
  totals.verifiedPresent +
    totals.verifiedAbsent +
    totals.notDetected +
    totals.researchedUnresolved +
    totals.notResearched ===
    totals.totalPairs,
  "Generated status counts do not sum to the total pair count.",
);
assert(totals.bootstrapEvidenceRecordCount === bootstrapEvidence.length, "Generated bootstrap evidence count is stale.");
assert(totals.runEvidenceRecordCount === compiledEvidence.runEvidence.length, "Generated run evidence count is stale.");
assert(totals.evidenceRecordCount === bootstrapEvidence.length + compiledEvidence.runEvidence.length, "Generated total evidence count is stale.");
assert(totals.rejectionRecordCount === projectedRejections.length, "Generated rejection count is stale.");
assert(
  totals.researchRunCount === runs.length + projectedAlabamaImmutableRuns.length,
  "Generated run count is stale.",
);
assert(totals.conflictCount === 0, "Generated research index contains present-versus-absence conflicts.");
assert(totals.verifiedPresent === presentPairs.size, "Research summary present count is stale.");
assert(totals.verifiedAbsent === absentPairs.size, "Research summary absence count is stale.");
assert(totals.notDetected === displayedNotDetectedPairs.size, "Research summary not-detected count is stale.");
assert(
  matrix.summary.presentVerifiedDeterminations === totals.verifiedPresent &&
    matrix.summary.verifiedAbsentDeterminations === totals.verifiedAbsent &&
    matrix.summary.notDetectedDeterminations === totals.notDetected,
  "Compatibility matrix summary differs from research summary.",
);
assert(
  summary.migrationCandidates.sourceAssertionCount === migrationCandidates.candidateCount &&
    summary.migrationCandidates.distinctPairCount === migrationCandidates.distinctPairCount,
  "Generated deferred-candidate baseline changed the historical candidate file.",
);
const completedCandidateSourceKeys = new Set(
  projectedOutcomes
    .filter(
      (outcome) =>
        outcome.scope_complete &&
        ["evidence-found", "no-qualifying-evidence"].includes(outcome.status),
    )
    .map((outcome) => `${outcome.source_id}:${outcome.county_fips}:${outcome.species_id}`),
);
const reviewedCandidateSourceAssertions = migrationCandidates.candidates.filter((candidate) =>
  completedCandidateSourceKeys.has(
    `${candidate.sourceId}:${candidate.countyFips}:${candidate.speciesId}`,
  ),
);
const reviewedCandidatePairKeys = new Set(
  reviewedCandidateSourceAssertions.map((candidate) =>
    pairKey(candidate.countyFips, candidate.speciesId),
  ),
);
assert(
  summary.migrationCandidates.reviewedSourceAssertionCount ===
    reviewedCandidateSourceAssertions.length &&
    summary.migrationCandidates.remainingSourceAssertionCount ===
      migrationCandidates.candidateCount - reviewedCandidateSourceAssertions.length &&
    summary.migrationCandidates.reviewedDistinctPairCount === reviewedCandidatePairKeys.size &&
    summary.migrationCandidates.remainingDistinctPairCount ===
      migrationCandidates.distinctPairCount - reviewedCandidatePairKeys.size,
  "Generated deferred-candidate progress is stale.",
);
assert(
  readFileSync(summaryPath, "utf8") === readFileSync(publicSummaryPath, "utf8"),
  "Source and public research summaries differ.",
);

const publicCountyFiles = readdirSync(publicCountyDir)
  .filter((filename) => filename.endsWith(".json"))
  .sort();
assert(publicCountyFiles.length === alabamaCountyFips.size, "Wrong number of public county research files.");

let countyPresent = 0;
let countyAbsent = 0;
let countyNotDetected = 0;
let countyResearchedUnresolved = 0;
let countyNotResearched = 0;
let countyExplicitOutcomePairs = 0;
const projectedEvidenceIds = new Set<string>();
for (const filename of publicCountyFiles) {
  const publicPath = path.join(publicCountyDir, filename);
  const county = readJson<ResearchCountyFile>(publicPath);
  schemaValidator("research-projection.schema.json").parse(county);
  assert(county.asOf === summary.asOf, `${filename} has a different as-of date.`);
  assert(alabamaCountyFips.has(county.countyFips), `${filename} has an unknown county FIPS.`);
  assert(county.pairs.length === speciesIds.size, `${filename} does not contain every catalog species.`);
  assertUnique(county.pairs.map((pair) => pair.speciesId), `${filename} species rows`);
  const sum =
    county.summary.verifiedPresent +
    county.summary.verifiedAbsent +
    county.summary.notDetected +
    county.summary.researchedUnresolved +
    county.summary.notResearched;
  assert(sum === speciesIds.size, `${filename} status counts do not sum to the species count.`);
  for (const pair of county.pairs) {
    assert(speciesIds.has(pair.speciesId), `${filename} has unknown species ${pair.speciesId}.`);
    const key = pairKey(county.countyFips, pair.speciesId);
    const expectedDetermination = presentPairs.has(key)
      ? "verified-present"
      : absentPairs.has(key)
        ? "verified-absent"
        : notDetectedPairs.has(key)
          ? "not-detected"
          : undefined;
    if (expectedDetermination) {
      assert(pair.displayStatus === expectedDetermination, `${filename}:${pair.speciesId} has the wrong published status.`);
      assert(pair.evidence.length > 0, `${filename}:${pair.speciesId} has a determination without evidence.`);
    } else {
      assert(
        !["verified-present", "verified-absent", "not-detected"].includes(pair.displayStatus),
        `${filename}:${pair.speciesId} has an unbacked determination.`,
      );
    }
    for (const evidence of pair.evidence) projectedEvidenceIds.add(evidence.evidenceId);
  }
  countyPresent += county.summary.verifiedPresent;
  countyAbsent += county.summary.verifiedAbsent;
  countyNotDetected += county.summary.notDetected;
  countyResearchedUnresolved += county.summary.researchedUnresolved;
  countyNotResearched += county.summary.notResearched;
  countyExplicitOutcomePairs += county.summary.explicitOutcomePairs;
}

for (const assertion of runAssertions.filter((entry) => entry.state_code === "AL")) {
  assert(
    projectedEvidenceIds.has(assertion.eventId) === projectedRunEvidenceIds.has(assertion.eventId),
    `Run assertion ${assertion.eventId} publication does not match its review state.`,
  );
}
assert(countyPresent === totals.verifiedPresent, "County files disagree with statewide present count.");
assert(countyAbsent === totals.verifiedAbsent, "County files disagree with statewide absence count.");
assert(countyNotDetected === totals.notDetected, "County files disagree with statewide not-detected count.");
assert(countyResearchedUnresolved === totals.researchedUnresolved, "County files disagree with statewide researched-unresolved count.");
assert(countyNotResearched === totals.notResearched, "County files disagree with statewide not-researched count.");
assert(countyExplicitOutcomePairs === totals.explicitOutcomePairCount, "County files disagree with statewide explicit outcome count.");

console.log(
  JSON.stringify(
    {
      sourceCount: registry.sources.length,
      nationalNasAcquisitionCount: nationalNasAcquisitions.length,
      nationalNasAcquisitionRecordCount: nationalNasAcquisitions.reduce(
        (sum, entry) => sum + entry.receipt.archive.record_count,
        0,
      ),
      nationalNasReferenceCount: nationalNasReferences.length,
      bootstrapResearchRunCount: runs.length,
      immutableResearchRunCount: projectedAlabamaImmutableRuns.length,
      totalImmutableResearchRunCount: immutableRuns.length,
      bootstrapLedgerEvidenceCount: bootstrapEvidence.length,
      runAssertionEventCount: projectedRunAssertions.length,
      totalRunAssertionEventCount: runAssertions.length,
      publishedRunEvidenceCount: publishedRunEvidenceIds.size,
      projectedRunEvidenceCount: projectedRunEvidenceIds.size,
      unreviewedRunEvidenceCount: resolvedRunEvidence.counts.unreviewed,
      ledgerRejectionCount: projectedRejections.length,
      totalLedgerRejectionCount: rejections.length,
      pairOutcomeCount: projectedOutcomes.length,
      totalPairOutcomeCount: outcomes.length,
      ...totals,
    },
    null,
    2,
  ),
);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
