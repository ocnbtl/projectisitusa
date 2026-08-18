import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { sha256 } from "@/lib/research/run-files";

import { buildSourceCoverageIndex } from "./research/source-coverage-index";

let root = "";

function writeRun(runId: string, status: "complete" | "partial") {
  const directory = path.join(root, "src/data/research/runs", runId);
  mkdirSync(directory, { recursive: true });
  const outcome = {
    schemaVersion: 1,
    outcome_id: `${runId}-outcome`,
    run_id: runId,
    source_id: "fixture-source",
    state_code: "AL",
    county_fips: "01001",
    species_id: "fixture-species",
    status: "no-qualifying-evidence",
    scope_complete: status === "complete",
    recorded_at: "2026-08-18T00:01:00.000Z",
    assertion_event_ids: [],
    rejection_ids: [],
    query_urls: ["https://example.invalid/query"],
    notes: [],
  };
  const outcomes = `${JSON.stringify(outcome)}\n`;
  const outcomesPath = `src/data/research/runs/${runId}/outcomes.ndjson`;
  writeFileSync(path.join(root, outcomesPath), outcomes);
  const receipt = {
    schemaVersion: 1,
    run_id: runId,
    status,
    started_at: "2026-08-18T00:00:00.000Z",
    finished_at: "2026-08-18T00:02:00.000Z",
    actor_type: "adapter",
    actor_id: "fixture@1.0.0",
    source_id: "fixture-source",
    source_registry_hash: "b".repeat(64),
    adapter_id: "fixture",
    adapter_version: "1.0.0",
    adapter_code_hash: "c".repeat(64),
    code_commit: "d".repeat(40),
    parameter_hash: "e".repeat(64),
    parameters: {},
    requested_scope: {
      state_code: "AL",
      county_fips: ["01001"],
      species_ids: ["fixture-species"],
      pair_keys: ["01001:fixture-species"],
      date_range: { start: null, end: null },
    },
    upstream_requests: [],
    artifacts: [],
    outputs: [{
      path: outcomesPath,
      sha256: sha256(outcomes),
      bytes: Buffer.byteLength(outcomes),
      media_type: "application/x-ndjson",
    }],
    counts: {
      requested_pairs: 1,
      candidate_records: 0,
      assertion_events: 0,
      review_events: 0,
      rejection_records: 0,
      duplicate_records: 0,
      error_count: 0,
      pair_outcomes: 1,
    },
    errors: [],
    known_caveats: [],
    source_warnings: [],
    deviations: [],
    rerun_command: "fixture",
  };
  writeFileSync(path.join(directory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
}

async function main() {
  root = mkdtempSync(path.join(tmpdir(), "isitusa-coverage-test-"));
  try {
  const registryDirectory = path.join(root, "src/data/research");
  mkdirSync(registryDirectory, { recursive: true });
  writeFileSync(path.join(registryDirectory, "source-registry.json"), `${JSON.stringify({
    schemaVersion: 1,
    updatedAt: "2026-08-18",
    sources: [
      { id: "fixture-source", refreshCadenceDays: 30 },
      { id: "uncovered-source", refreshCadenceDays: 90 },
    ],
  }, null, 2)}\n`);
  writeRun("20260818T000000Z__fixture__complete", "complete");
  writeRun("20260818T000000Z__fixture__partial", "partial");
  const index = await buildSourceCoverageIndex({ root, generatedFromCommit: "a".repeat(40) });
  assert.equal(index.runCount, 2);
  assert.equal(index.sourceCount, 2);
  assert.equal(index.sources[0].scopeCompletePairs, 1);
  assert.equal(index.sources[1].coverageState, "no-immutable-run-coverage");
  assert.equal(index.sources[1].latestFinishedAt, null);
  assert.equal(index.entries[0].plannerAction, "skip-identical-query-until-freshness-deadline");
  assert.equal(index.entries[1].plannerAction, "resume-partial-run");
  assert.equal(index.entries[0].freshnessDeadline, "2026-09-17T00:02:00.000Z");
    console.log("Source coverage index tests passed.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main();
