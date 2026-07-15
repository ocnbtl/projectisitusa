import { mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  EvidenceReviewEvent,
  EvidenceAssertion,
  ResearchCountyFile,
  ResearchRejectionRecord,
  ResearchRunReceipt,
  ResearchSourceRegistry,
} from "@/lib/research/types";
import {
  listImmutableResearchRuns,
  readNdjson as readRunNdjson,
  stableJson,
} from "@/lib/research/run-files";

type RunsFile = { schemaVersion: 1; runs: ResearchRunReceipt[] };

const ROOT = process.cwd();
// This database is a disposable query index. Versioned inputs and compiled projections remain authoritative.
const OUTPUT = path.join(ROOT, ".cache/research/isitusa.sqlite");

function parseState(argv: string[]) {
  if (argv.length !== 2 || argv[0] !== "--state" || !/^[A-Za-z]{2}$/.test(argv[1] ?? "")) {
    throw new Error("research:index requires --state <XX>.");
  }
  return argv[1].toUpperCase();
}

const STATE_CODE = parseState(process.argv.slice(2));

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function readNdjson<T>(filepath: string): T[] {
  return readFileSync(filepath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function mergeOriginRecords<T>(
  inputs: Array<{ origin: string; records: T[] }>,
  getId: (record: T) => string,
): Array<{ origins: string[]; record: T }> {
  const recordsById = new Map<string, { origins: Set<string>; record: T }>();
  for (const input of inputs) {
    for (const record of input.records) {
      const id = getId(record);
      const existing = recordsById.get(id);
      if (existing) {
        if (stableJson(existing.record) !== stableJson(record)) {
          throw new Error(`Conflicting immutable research records share ID ${id}.`);
        }
        existing.origins.add(input.origin);
      } else {
        recordsById.set(id, {
          origins: new Set([input.origin]),
          record,
        });
      }
    }
  }
  return [...recordsById.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, value]) => ({
      origins: [...value.origins].sort(),
      record: value.record,
    }));
}

mkdirSync(path.dirname(OUTPUT), { recursive: true });
rmSync(OUTPUT, { force: true });

const registry = readJson<ResearchSourceRegistry>(path.join(ROOT, "src/data/research/source-registry.json"));
const bootstrapEvidence = readNdjson<EvidenceAssertion>(
  path.join(ROOT, "src/data/research/evidence-assertions.ndjson"),
).filter((entry) => entry.stateCode === STATE_CODE);
const runs = readJson<RunsFile>(path.join(ROOT, "src/data/research/research-runs.json")).runs
  .filter((entry) => entry.stateCode === STATE_CODE);
const immutableRuns = listImmutableResearchRuns(ROOT)
  .filter((bundle) => bundle.receipt.requested_scope.state_code === STATE_CODE);
const runAssertions = immutableRuns.flatMap((bundle) => bundle.assertions);
const runReviewEvents = immutableRuns.flatMap((bundle) => bundle.reviews);
const laterReviewEvents = readRunNdjson<EvidenceReviewEvent>(
  path.join(ROOT, "src/data/research/review-events.ndjson"),
).filter((entry) => entry.state_code === STATE_CODE);
const runRejections = immutableRuns.flatMap((bundle) => bundle.rejections);
const laterRejections = readRunNdjson<ResearchRejectionRecord>(
  path.join(ROOT, "src/data/research/rejections.ndjson"),
).filter((entry) => entry.normalized_target.state_code === STATE_CODE);
const outcomes = immutableRuns.flatMap((bundle) => bundle.outcomes);
const reviewRecords = mergeOriginRecords(
  [
    { origin: "immutable-run", records: runReviewEvents },
    { origin: "append-only-ledger", records: laterReviewEvents },
  ],
  (event) => event.eventId,
);
const rejectionRecords = mergeOriginRecords(
  [
    { origin: "immutable-run", records: runRejections },
    { origin: "append-only-ledger", records: laterRejections },
  ],
  (record) => record.rejection_id,
);
const countyDir = path.join(ROOT, `public/generated/research/${STATE_CODE}/counties`);
const countyFiles = readdirSync(countyDir).filter((filename) => filename.endsWith(".json")).sort();
const stateSummary = readJson<{
  asOf?: string;
  generatedAt: string;
  stateCode: string;
  summary: Record<string, unknown>;
}>(path.join(ROOT, `public/generated/research/${STATE_CODE}/summary.json`));
if (stateSummary.stateCode !== STATE_CODE) throw new Error(`Research summary state ${stateSummary.stateCode} does not match ${STATE_CODE}.`);

const db = new DatabaseSync(OUTPUT);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE sources (
    source_id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    authority TEXT NOT NULL,
    tier TEXT NOT NULL,
    status TEXT NOT NULL,
    homepage TEXT NOT NULL,
    caveat TEXT NOT NULL
  );

  CREATE TABLE evidence (
    evidence_id TEXT PRIMARY KEY,
    state_code TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    species_id TEXT NOT NULL,
    assertion TEXT NOT NULL,
    scope TEXT NOT NULL,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    source_label TEXT NOT NULL,
    url TEXT NOT NULL,
    external_record_id TEXT,
    observed_at TEXT,
    reviewed_at TEXT,
    accessed_at TEXT,
    lineage TEXT NOT NULL,
    caveat TEXT NOT NULL
  );

  CREATE TABLE research_runs (
    run_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    state_code TEXT NOT NULL,
    status TEXT NOT NULL,
    scope TEXT NOT NULL,
    accessed_at TEXT,
    accepted_pair_count INTEGER NOT NULL,
    artifact_path TEXT NOT NULL,
    caveat TEXT NOT NULL
  );

  CREATE TABLE immutable_run_receipts (
    run_id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    state_code TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    source_registry_hash TEXT NOT NULL,
    adapter_id TEXT NOT NULL,
    adapter_version TEXT NOT NULL,
    adapter_code_hash TEXT NOT NULL,
    code_commit TEXT NOT NULL,
    parameter_hash TEXT NOT NULL,
    parameters_json TEXT NOT NULL,
    requested_scope_json TEXT NOT NULL,
    counts_json TEXT NOT NULL,
    errors_json TEXT NOT NULL,
    known_caveats_json TEXT NOT NULL,
    source_warnings_json TEXT NOT NULL,
    deviations_json TEXT NOT NULL,
    rerun_command TEXT NOT NULL,
    receipt_path TEXT NOT NULL
  );

  CREATE TABLE immutable_run_files (
    run_id TEXT NOT NULL REFERENCES immutable_run_receipts(run_id),
    file_kind TEXT NOT NULL,
    path TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    media_type TEXT NOT NULL,
    PRIMARY KEY (run_id, path)
  );

  CREATE TABLE immutable_run_requests (
    run_id TEXT NOT NULL REFERENCES immutable_run_receipts(run_id),
    request_index INTEGER NOT NULL,
    url TEXT NOT NULL,
    status INTEGER NOT NULL,
    retrieved_at TEXT NOT NULL,
    record_count INTEGER NOT NULL,
    PRIMARY KEY (run_id, request_index)
  );

  CREATE TABLE immutable_run_targets (
    run_id TEXT NOT NULL REFERENCES immutable_run_receipts(run_id),
    pair_key TEXT NOT NULL,
    PRIMARY KEY (run_id, pair_key)
  );

  CREATE TABLE run_targets (
    run_id TEXT NOT NULL REFERENCES research_runs(run_id),
    species_id TEXT NOT NULL,
    result TEXT NOT NULL,
    PRIMARY KEY (run_id, species_id, result)
  );

  CREATE TABLE run_evidence_assertions (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    run_id TEXT NOT NULL REFERENCES immutable_run_receipts(run_id),
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    state_code TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    species_id TEXT NOT NULL,
    claim_type TEXT NOT NULL,
    evidence_kind TEXT NOT NULL,
    scope TEXT NOT NULL,
    source_record_id TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_record_date TEXT,
    retrieved_at TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    taxon_match_json TEXT NOT NULL,
    geography_match_json TEXT NOT NULL,
    temporal_scope TEXT NOT NULL,
    spatial_scope TEXT NOT NULL,
    survey_scope TEXT,
    normalized_payload_hash TEXT NOT NULL,
    caveats_json TEXT NOT NULL,
    notes_json TEXT NOT NULL
  );

  CREATE TABLE review_events (
    event_id TEXT PRIMARY KEY,
    event_origin TEXT NOT NULL,
    event_type TEXT NOT NULL,
    created_at TEXT NOT NULL,
    run_id TEXT NOT NULL REFERENCES immutable_run_receipts(run_id),
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    state_code TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    species_id TEXT NOT NULL,
    assertion_event_id TEXT NOT NULL REFERENCES run_evidence_assertions(event_id),
    replacement_assertion_event_id TEXT,
    review_level TEXT NOT NULL,
    decision TEXT NOT NULL,
    publication_eligible INTEGER NOT NULL,
    reason_codes_json TEXT NOT NULL,
    notes_json TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL
  );

  CREATE TABLE rejections (
    rejection_id TEXT PRIMARY KEY,
    record_origin TEXT NOT NULL,
    created_at TEXT NOT NULL,
    run_id TEXT NOT NULL REFERENCES immutable_run_receipts(run_id),
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    candidate_locator TEXT NOT NULL,
    candidate_taxon TEXT NOT NULL,
    candidate_geography TEXT,
    target_state_code TEXT NOT NULL,
    target_species_id TEXT NOT NULL,
    target_county_fips TEXT,
    reason_code TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    supporting_notes_json TEXT NOT NULL
  );

  CREATE TABLE research_outcomes (
    outcome_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES immutable_run_receipts(run_id),
    source_id TEXT NOT NULL REFERENCES sources(source_id),
    state_code TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    species_id TEXT NOT NULL,
    status TEXT NOT NULL,
    scope_complete INTEGER NOT NULL,
    recorded_at TEXT NOT NULL,
    assertion_event_ids_json TEXT NOT NULL,
    rejection_ids_json TEXT NOT NULL,
    query_urls_json TEXT NOT NULL,
    notes_json TEXT NOT NULL
  );

  CREATE TABLE pair_status (
    state_code TEXT NOT NULL,
    county_fips TEXT NOT NULL,
    county_name TEXT NOT NULL,
    species_id TEXT NOT NULL,
    common_name TEXT NOT NULL,
    scientific_name TEXT NOT NULL,
    category TEXT NOT NULL,
    display_status TEXT NOT NULL,
    determination_status TEXT NOT NULL,
    survey_status TEXT NOT NULL,
    research_status TEXT NOT NULL,
    freshness_status TEXT NOT NULL,
    conflict INTEGER NOT NULL,
    evidence_count INTEGER NOT NULL,
    screened_source_ids TEXT NOT NULL,
    PRIMARY KEY (county_fips, species_id)
  );

  CREATE TABLE coverage_metrics (
    state_code TEXT NOT NULL,
    as_of TEXT,
    generated_at TEXT NOT NULL,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    PRIMARY KEY (state_code, metric)
  );

  CREATE VIEW all_research_runs AS
    SELECT
      run_id,
      source_id,
      state_code,
      status,
      scope,
      accessed_at AS finished_at,
      'bootstrap' AS run_kind
    FROM research_runs
    UNION ALL
    SELECT
      run_id,
      source_id,
      state_code,
      status,
      'immutable-adapter-run' AS scope,
      finished_at,
      'immutable' AS run_kind
    FROM immutable_run_receipts;
`);

const insertSource = db.prepare(`
  INSERT INTO sources (source_id, label, authority, tier, status, homepage, caveat)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const insertEvidence = db.prepare(`
  INSERT INTO evidence (
    evidence_id, state_code, county_fips, species_id, assertion, scope, source_id,
    source_label, url, external_record_id, observed_at, reviewed_at, accessed_at, lineage, caveat
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertRun = db.prepare(`
  INSERT INTO research_runs (
    run_id, source_id, state_code, status, scope, accessed_at, accepted_pair_count, artifact_path, caveat
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertImmutableRun = db.prepare(`
  INSERT INTO immutable_run_receipts (
    run_id, source_id, state_code, status, started_at, finished_at, actor_type,
    actor_id, source_registry_hash, adapter_id, adapter_version, adapter_code_hash,
    code_commit, parameter_hash, parameters_json, requested_scope_json,
    counts_json, errors_json, known_caveats_json, source_warnings_json,
    deviations_json, rerun_command, receipt_path
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertImmutableRunFile = db.prepare(`
  INSERT INTO immutable_run_files (run_id, file_kind, path, sha256, bytes, media_type)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const insertImmutableRunRequest = db.prepare(`
  INSERT INTO immutable_run_requests (
    run_id, request_index, url, status, retrieved_at, record_count
  ) VALUES (?, ?, ?, ?, ?, ?)
`);
const insertImmutableRunTarget = db.prepare(`
  INSERT INTO immutable_run_targets (run_id, pair_key) VALUES (?, ?)
`);
const insertTarget = db.prepare(`
  INSERT INTO run_targets (run_id, species_id, result) VALUES (?, ?, ?)
`);
const insertRunAssertion = db.prepare(`
  INSERT INTO run_evidence_assertions (
    event_id, event_type, created_at, run_id, source_id, state_code, county_fips,
    species_id, claim_type, evidence_kind, scope, source_record_id, source_url,
    source_record_date, retrieved_at, actor_type, actor_id, taxon_match_json,
    geography_match_json, temporal_scope, spatial_scope, survey_scope,
    normalized_payload_hash, caveats_json, notes_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertReview = db.prepare(`
  INSERT INTO review_events (
    event_id, event_origin, event_type, created_at, run_id, source_id, state_code,
    county_fips, species_id, assertion_event_id, replacement_assertion_event_id,
    review_level, decision, publication_eligible, reason_codes_json, notes_json,
    actor_type, actor_id
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertRejection = db.prepare(`
  INSERT INTO rejections (
    rejection_id, record_origin, created_at, run_id, source_id, candidate_locator,
    candidate_taxon, candidate_geography, target_state_code, target_species_id,
    target_county_fips, reason_code, actor_type, actor_id, supporting_notes_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertOutcome = db.prepare(`
  INSERT INTO research_outcomes (
    outcome_id, run_id, source_id, state_code, county_fips, species_id, status,
    scope_complete, recorded_at, assertion_event_ids_json, rejection_ids_json,
    query_urls_json, notes_json
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertPair = db.prepare(`
  INSERT INTO pair_status (
    state_code, county_fips, county_name, species_id, common_name, scientific_name,
    category, display_status, determination_status, survey_status, research_status,
    freshness_status, conflict, evidence_count, screened_source_ids
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertCoverageMetric = db.prepare(`
  INSERT INTO coverage_metrics (state_code, as_of, generated_at, metric, value)
  VALUES (?, ?, ?, ?, ?)
`);

db.exec("BEGIN");
try {
  for (const source of registry.sources) {
    insertSource.run(source.id, source.label, source.authority, source.tier, source.status, source.homepage, source.caveat);
  }
  for (const entry of bootstrapEvidence) {
    insertEvidence.run(
      entry.evidenceId,
      entry.stateCode,
      entry.countyFips,
      entry.speciesId,
      entry.assertion,
      entry.scope,
      entry.sourceId,
      entry.sourceLabel,
      entry.url,
      entry.externalRecordId ?? null,
      entry.observedAt ?? null,
      entry.reviewedAt ?? null,
      entry.accessedAt ?? null,
      entry.lineage,
      entry.caveat,
    );
  }
  for (const run of runs) {
    insertRun.run(
      run.runId,
      run.sourceId,
      run.stateCode,
      run.status,
      run.scope,
      run.accessedAt,
      run.acceptedPairCount,
      run.artifactPath,
      run.caveat,
    );
    const accepted = new Set(run.acceptedSpeciesIds);
    for (const speciesId of run.targetSpeciesIds) {
      insertTarget.run(run.runId, speciesId, accepted.has(speciesId) ? "accepted" : "screened-no-record");
    }
  }
  for (const bundle of immutableRuns) {
    const receipt = bundle.receipt;
    const receiptPath = `${path
      .relative(ROOT, bundle.directory)
      .split(path.sep)
      .join("/")}/receipt.json`;
    insertImmutableRun.run(
      receipt.run_id,
      receipt.source_id,
      receipt.requested_scope.state_code,
      receipt.status,
      receipt.started_at,
      receipt.finished_at,
      receipt.actor_type,
      receipt.actor_id,
      receipt.source_registry_hash,
      receipt.adapter_id,
      receipt.adapter_version,
      receipt.adapter_code_hash,
      receipt.code_commit,
      receipt.parameter_hash,
      stableJson(receipt.parameters),
      stableJson(receipt.requested_scope),
      stableJson(receipt.counts),
      stableJson(receipt.errors),
      stableJson(receipt.known_caveats),
      stableJson(receipt.source_warnings),
      stableJson(receipt.deviations),
      receipt.rerun_command,
      receiptPath,
    );
    for (const [fileKind, files] of [
      ["artifact", receipt.artifacts],
      ["output", receipt.outputs],
    ] as const) {
      for (const file of files) {
        insertImmutableRunFile.run(
          receipt.run_id,
          fileKind,
          file.path,
          file.sha256,
          file.bytes,
          file.media_type,
        );
      }
    }
    for (const [requestIndex, request] of receipt.upstream_requests.entries()) {
      insertImmutableRunRequest.run(
        receipt.run_id,
        requestIndex,
        request.url,
        request.status,
        request.retrieved_at,
        request.record_count,
      );
    }
    for (const pair of receipt.requested_scope.pair_keys) {
      insertImmutableRunTarget.run(receipt.run_id, pair);
    }
  }
  for (const assertion of runAssertions) {
    insertRunAssertion.run(
      assertion.eventId,
      assertion.event_type,
      assertion.created_at,
      assertion.run_id,
      assertion.source_id,
      assertion.state_code,
      assertion.county_fips,
      assertion.species_id,
      assertion.claim_type,
      assertion.evidence_kind,
      assertion.scope,
      assertion.source_record_id,
      assertion.source_url,
      assertion.source_record_date,
      assertion.retrieved_at,
      assertion.actor_type,
      assertion.actor_id,
      stableJson(assertion.taxon_match),
      stableJson(assertion.geography_match),
      assertion.temporal_scope,
      assertion.spatial_scope,
      assertion.survey_scope,
      assertion.normalized_payload_hash,
      stableJson(assertion.caveats),
      stableJson(assertion.notes),
    );
  }
  for (const { origins, record: review } of reviewRecords) {
    insertReview.run(
      review.eventId,
      origins.join("+"),
      review.event_type,
      review.created_at,
      review.run_id,
      review.source_id,
      review.state_code,
      review.county_fips,
      review.species_id,
      review.references.assertion_event_id,
      review.references.replacement_assertion_event_id ?? null,
      review.review_level,
      review.decision,
      review.publication_eligible ? 1 : 0,
      stableJson(review.reason_codes),
      stableJson(review.notes),
      review.actor_type,
      review.actor_id,
    );
  }
  for (const { origins, record: rejection } of rejectionRecords) {
    insertRejection.run(
      rejection.rejection_id,
      origins.join("+"),
      rejection.created_at,
      rejection.run_id,
      rejection.source_id,
      rejection.candidate_locator,
      rejection.candidate_taxon,
      rejection.candidate_geography,
      rejection.normalized_target.state_code,
      rejection.normalized_target.species_id,
      rejection.normalized_target.county_fips,
      rejection.reason_code,
      rejection.actor_type,
      rejection.actor_id,
      stableJson(rejection.supporting_notes),
    );
  }
  for (const outcome of outcomes) {
    insertOutcome.run(
      outcome.outcome_id,
      outcome.run_id,
      outcome.source_id,
      outcome.state_code,
      outcome.county_fips,
      outcome.species_id,
      outcome.status,
      outcome.scope_complete ? 1 : 0,
      outcome.recorded_at,
      stableJson(outcome.assertion_event_ids),
      stableJson(outcome.rejection_ids),
      stableJson(outcome.query_urls),
      stableJson(outcome.notes),
    );
  }
  for (const filename of countyFiles) {
    const county = readJson<ResearchCountyFile>(path.join(countyDir, filename));
    for (const pair of county.pairs) {
      insertPair.run(
        county.stateCode,
        county.countyFips,
        county.countyName,
        pair.speciesId,
        pair.commonName,
        pair.scientificName,
        pair.category,
        pair.displayStatus,
        pair.determinationStatus,
        pair.surveyStatus,
        pair.researchStatus,
        pair.freshnessStatus,
        pair.conflict ? 1 : 0,
        pair.evidence.length,
        stableJson(pair.screenedBySourceIds),
      );
    }
  }
  for (const [metric, value] of Object.entries(stateSummary.summary).sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (typeof value === "number" && Number.isFinite(value)) {
      insertCoverageMetric.run(
        stateSummary.stateCode,
        stateSummary.asOf ?? null,
        stateSummary.generatedAt,
        metric,
        value,
      );
    }
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

db.exec(`
  CREATE INDEX evidence_county_species_idx ON evidence (county_fips, species_id);
  CREATE INDEX evidence_source_idx ON evidence (source_id);
  CREATE INDEX evidence_assertion_idx ON evidence (assertion);
  CREATE INDEX immutable_runs_source_idx ON immutable_run_receipts (source_id);
  CREATE INDEX immutable_runs_finished_idx ON immutable_run_receipts (finished_at);
  CREATE INDEX immutable_run_files_hash_idx ON immutable_run_files (sha256);
  CREATE INDEX run_assertions_county_species_idx ON run_evidence_assertions (county_fips, species_id);
  CREATE INDEX run_assertions_source_idx ON run_evidence_assertions (source_id);
  CREATE INDEX run_assertions_claim_idx ON run_evidence_assertions (claim_type);
  CREATE INDEX review_events_assertion_idx ON review_events (assertion_event_id);
  CREATE INDEX review_events_decision_idx ON review_events (decision);
  CREATE INDEX rejections_target_idx ON rejections (target_county_fips, target_species_id);
  CREATE INDEX rejections_reason_idx ON rejections (reason_code);
  CREATE INDEX research_outcomes_pair_idx ON research_outcomes (county_fips, species_id);
  CREATE INDEX research_outcomes_status_idx ON research_outcomes (status, scope_complete);
  CREATE INDEX pair_status_status_idx ON pair_status (display_status);
  CREATE INDEX pair_status_species_idx ON pair_status (species_id);
  CREATE INDEX pair_status_county_idx ON pair_status (county_fips);
  CREATE INDEX run_targets_species_idx ON run_targets (species_id);
  PRAGMA optimize;
`);

const counts = {
  sources: Number((db.prepare("SELECT COUNT(*) AS count FROM sources").get() as { count: number }).count),
  bootstrapEvidence: Number((db.prepare("SELECT COUNT(*) AS count FROM evidence").get() as { count: number }).count),
  runAssertions: Number((db.prepare("SELECT COUNT(*) AS count FROM run_evidence_assertions").get() as { count: number }).count),
  reviewEvents: Number((db.prepare("SELECT COUNT(*) AS count FROM review_events").get() as { count: number }).count),
  rejections: Number((db.prepare("SELECT COUNT(*) AS count FROM rejections").get() as { count: number }).count),
  outcomes: Number((db.prepare("SELECT COUNT(*) AS count FROM research_outcomes").get() as { count: number }).count),
  bootstrapRuns: Number((db.prepare("SELECT COUNT(*) AS count FROM research_runs").get() as { count: number }).count),
  immutableRuns: Number((db.prepare("SELECT COUNT(*) AS count FROM immutable_run_receipts").get() as { count: number }).count),
  pairStatuses: Number((db.prepare("SELECT COUNT(*) AS count FROM pair_status").get() as { count: number }).count),
  coverageMetrics: Number((db.prepare("SELECT COUNT(*) AS count FROM coverage_metrics").get() as { count: number }).count),
};
db.close();

console.log(JSON.stringify({ output: path.relative(ROOT, OUTPUT), stateCode: STATE_CODE, ...counts }, null, 2));
