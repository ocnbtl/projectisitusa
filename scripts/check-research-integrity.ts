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
import { resolveRunEvidence } from "@/lib/research/event-resolution";
import {
  listImmutableResearchRuns,
  readNdjson as readRunNdjson,
} from "@/lib/research/run-files";

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

const ROOT = process.cwd();
const SCHEMA_DIR = path.join(ROOT, "src/data/research/schemas");

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

const registryPath = path.join(ROOT, "src/data/research/source-registry.json");
const evidencePath = path.join(ROOT, "src/data/research/evidence-assertions.ndjson");
const runsPath = path.join(ROOT, "src/data/research/research-runs.json");
const reviewEventsPath = path.join(ROOT, "src/data/research/review-events.ndjson");
const rejectionsPath = path.join(ROOT, "src/data/research/rejections.ndjson");
const migrationCandidatesPath = path.join(ROOT, "src/data/research/migration-candidates.json");
const summaryPath = path.join(ROOT, "src/data/generated/research/AL/summary.json");
const publicSummaryPath = path.join(ROOT, "public/generated/research/AL/summary.json");
const publicCountyDir = path.join(ROOT, "public/generated/research/AL/counties");

for (const filepath of [
  registryPath,
  evidencePath,
  runsPath,
  reviewEventsPath,
  rejectionsPath,
  migrationCandidatesPath,
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
const alabamaCountyFips = new Set(
  Object.values(
    readJson<Record<string, CountyRecord>>(path.join(ROOT, "src/data/generated/counties.json")),
  )
    .filter((county) => county.stateCode === "AL")
    .map((county) => county.countyFips),
);
const matrix = readJson<MatrixFile>(path.join(ROOT, "docs/county-coverage/states/AL.json"));
const registry = readJson<ResearchSourceRegistry>(registryPath);
const bootstrapEvidence = readNdjson<EvidenceAssertion>(evidencePath);
const runsFile = readJson<RunsFile>(runsPath);
const runs = runsFile.runs;
const summary = readJson<ResearchStateSummary>(summaryPath);
const asOfCutoff = Date.parse(`${summary.asOf}T23:59:59.999Z`);
const immutableRuns = listImmutableResearchRuns(ROOT);
const projectedImmutableRuns = immutableRuns.filter(
  (bundle) => Date.parse(bundle.receipt.finished_at) <= asOfCutoff,
);
const runAssertions = immutableRuns.flatMap((bundle) => bundle.assertions);
const projectedRunAssertions = projectedImmutableRuns.flatMap((bundle) => bundle.assertions);
const perRunReviews = immutableRuns.flatMap((bundle) => bundle.reviews);
const laterReviews = readRunNdjson<EvidenceReviewEvent>(reviewEventsPath);
const reviews = [...perRunReviews, ...laterReviews];
const projectedReviews = [
  ...projectedImmutableRuns.flatMap((bundle) => bundle.reviews),
  ...laterReviews.filter((event) => Date.parse(event.created_at) <= asOfCutoff),
];
const perRunRejections = immutableRuns.flatMap((bundle) => bundle.rejections);
const laterRejections = readRunNdjson<ResearchRejectionRecord>(rejectionsPath);
const rejections = [...perRunRejections, ...laterRejections];
const projectedRejections = [
  ...projectedImmutableRuns.flatMap((bundle) => bundle.rejections),
  ...laterRejections.filter((record) => Date.parse(record.created_at) <= asOfCutoff),
];
const outcomes = immutableRuns.flatMap((bundle) => bundle.outcomes);
const projectedOutcomes = projectedImmutableRuns.flatMap((bundle) => bundle.outcomes);
const migrationCandidates = readJson<MigrationCandidatesFile>(migrationCandidatesPath);

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

assert(summary.schemaVersion === 2, "Unsupported generated research projection version.");
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
  const source = sourceById.get(receipt.source_id);
  assert(source?.researchAdapter, `Immutable run ${receipt.run_id} has no registered adapter.`);
  assert(
    source.researchAdapter.id === receipt.adapter_id &&
      source.researchAdapter.allowedVersions.includes(receipt.adapter_version),
    `Immutable run ${receipt.run_id} uses an unregistered adapter or version.`,
  );
  const parameterSchemaPath = path.join(ROOT, source.researchAdapter.parameterSchema);
  assert(existsSync(parameterSchemaPath), `Immutable run ${receipt.run_id} lacks its parameter schema.`);
  const parameterSchema = JSON.parse(readFileSync(parameterSchemaPath, "utf8")) as Parameters<
    typeof z.fromJSONSchema
  >[0];
  z.fromJSONSchema(parameterSchema).parse(receipt.parameters);
  assert(
    receipt.counts.requested_pairs === receipt.requested_scope.pair_keys.length,
    `Immutable run ${receipt.run_id} has a requested-pair count mismatch.`,
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
}

for (const entry of runAssertions) {
  assert(entry.state_code === "AL", `Run assertion ${entry.eventId} is outside Alabama.`);
  assert(alabamaCountyFips.has(entry.county_fips), `Run assertion ${entry.eventId} has an unknown county.`);
  assert(speciesIds.has(entry.species_id), `Run assertion ${entry.eventId} has an unknown species.`);
  assert(sourceById.has(entry.source_id), `Run assertion ${entry.eventId} has an unknown source.`);
  assert(entry.geography_match.county_fips === entry.county_fips, `Run assertion ${entry.eventId} has inconsistent county mapping.`);
  assert(/^https?:\/\//.test(entry.source_url), `Run assertion ${entry.eventId} has a non-HTTP URL.`);
}
for (const event of reviews) assertReviewInvariant(event);
for (const rejection of rejections) {
  assert(sourceById.has(rejection.source_id), `Rejection ${rejection.rejection_id} has an unknown source.`);
  assert(rejection.normalized_target.state_code === "AL", `Rejection ${rejection.rejection_id} is outside Alabama.`);
  assert(speciesIds.has(rejection.normalized_target.species_id), `Rejection ${rejection.rejection_id} has an unknown species.`);
  if (rejection.normalized_target.county_fips) {
    assert(alabamaCountyFips.has(rejection.normalized_target.county_fips), `Rejection ${rejection.rejection_id} has an unknown county.`);
  }
}
for (const outcome of outcomes) {
  assertOutcomeInvariant(outcome);
  assert(sourceById.has(outcome.source_id), `Outcome ${outcome.outcome_id} has an unknown source.`);
  assert(outcome.state_code === "AL", `Outcome ${outcome.outcome_id} is outside Alabama.`);
  assert(alabamaCountyFips.has(outcome.county_fips), `Outcome ${outcome.outcome_id} has an unknown county.`);
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

const resolvedRunEvidence = resolveRunEvidence(
  projectedRunAssertions,
  projectedReviews,
  registry.sources,
  summary.asOf,
);
const publishedRunEvidenceIds = new Set(
  resolvedRunEvidence.publishedAssertions.map((entry) => entry.eventId),
);

const presentPairs = new Set(
  bootstrapEvidence
    .filter((entry) => entry.assertion === "recorded-present")
    .map((entry) => pairKey(entry.countyFips, entry.speciesId)),
);
const absentPairs = new Set(
  bootstrapEvidence
    .filter((entry) => entry.assertion === "officially-absent")
    .map((entry) => pairKey(entry.countyFips, entry.speciesId)),
);
const notDetectedPairs = new Set(
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

assert(presentPairs.size === matrixPresentPairs.size, "Bootstrap present evidence does not match the matrix count.");
assert(absentPairs.size === matrixAbsentPairs.size, "Bootstrap absence evidence does not match the matrix count.");
assert(notDetectedPairs.size === matrixNotDetectedPairs.size, "Bootstrap not-detected evidence does not match the matrix count.");
for (const key of matrixPresentPairs) assert(presentPairs.has(key), `Missing bootstrap present evidence for ${key}.`);
for (const key of matrixAbsentPairs) assert(absentPairs.has(key), `Missing bootstrap absence evidence for ${key}.`);
for (const key of matrixNotDetectedPairs) assert(notDetectedPairs.has(key), `Missing bootstrap not-detected evidence for ${key}.`);

for (const assertion of resolvedRunEvidence.publishedAssertions) {
  const key = pairKey(assertion.county_fips, assertion.species_id);
  if (assertion.claim_type === "recorded-present") presentPairs.add(key);
  if (assertion.claim_type === "officially-absent") absentPairs.add(key);
  if (assertion.claim_type === "not-detected") notDetectedPairs.add(key);
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
assert(totals.runEvidenceRecordCount === projectedRunAssertions.length, "Generated run evidence count is stale.");
assert(totals.evidenceRecordCount === bootstrapEvidence.length + projectedRunAssertions.length, "Generated total evidence count is stale.");
assert(totals.rejectionRecordCount === projectedRejections.length, "Generated rejection count is stale.");
assert(totals.researchRunCount === runs.length + projectedImmutableRuns.length, "Generated run count is stale.");
assert(totals.conflictCount === 0, "Generated research index contains present-versus-absence conflicts.");
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

for (const assertion of runAssertions) {
  assert(
    projectedEvidenceIds.has(assertion.eventId) === publishedRunEvidenceIds.has(assertion.eventId),
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
      bootstrapResearchRunCount: runs.length,
      immutableResearchRunCount: projectedImmutableRuns.length,
      totalImmutableResearchRunCount: immutableRuns.length,
      bootstrapLedgerEvidenceCount: bootstrapEvidence.length,
      runAssertionEventCount: projectedRunAssertions.length,
      totalRunAssertionEventCount: runAssertions.length,
      publishedRunEvidenceCount: publishedRunEvidenceIds.size,
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
