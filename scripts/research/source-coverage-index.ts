import { createHash } from "node:crypto";
import { createReadStream, existsSync, lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ImmutableResearchRunReceipt, PairOutcomeStatus } from "@/lib/research/types";
import { sha256, stableJson } from "@/lib/research/run-files";

export const SOURCE_COVERAGE_INDEX_SCHEMA_VERSION = 1 as const;

type PlannerAction =
  | "skip-identical-query-until-freshness-deadline"
  | "resume-incomplete-scope"
  | "resume-partial-run"
  | "retry-only-after-blocker-change";

export interface SourceCoverageEntry {
  coverageKey: string;
  queryKey: string;
  runId: string;
  receiptPath: string;
  receiptSha256: string;
  sourceId: string;
  sourceRegistryHash: string;
  adapterId: string;
  adapterVersion: string;
  parameterHash: string;
  requestedScopeSha256: string;
  status: "complete" | "partial" | "failed";
  startedAt: string;
  finishedAt: string;
  refreshCadenceDays: number | null;
  freshnessDeadline: string | null;
  plannerAction: PlannerAction;
  requestedPairs: number;
  outcomePairs: number;
  scopeCompletePairs: number;
  outcomeStatusCounts: Record<PairOutcomeStatus, number>;
  outcomesPath: string;
  outcomesSha256: string;
  outcomesBytes: number;
}

export interface SourceCoverageIndex {
  schemaVersion: typeof SOURCE_COVERAGE_INDEX_SCHEMA_VERSION;
  kind: "isitusa-source-coverage-index";
  indexId: string;
  generatedFromCommit: string;
  sourceRegistryPath: "src/data/research/source-registry.json";
  sourceRegistrySha256: string;
  runReceiptDigestSha256: string;
  runCount: number;
  sourceCount: number;
  policy: {
    authority: "immutable-run-receipts-and-hash-pinned-outcomes";
    identicalCurrent: "skip";
    partial: "resume";
    stale: "refresh-deliberately";
    blocked: "retry-only-after-blocker-change";
    unknown: "prioritize-before-repeating-current-coverage";
  };
  sources: Array<{
    sourceId: string;
    coverageState: "covered-by-immutable-runs" | "no-immutable-run-coverage";
    runCount: number;
    completeRuns: number;
    partialRuns: number;
    failedRuns: number;
    requestedPairs: number;
    scopeCompletePairs: number;
    latestFinishedAt: string | null;
  }>;
  entries: SourceCoverageEntry[];
}

interface SourceRegistry {
  sources: Array<{ id: string; refreshCadenceDays: number | null }>;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function repositoryPath(root: string, filepath: string): string {
  const relative = path.relative(root, filepath).split(path.sep).join("/");
  assert(relative.length > 0 && !relative.startsWith("../") && !path.isAbsolute(relative), `Path escapes repository: ${filepath}`);
  return relative;
}

function addDays(value: string, days: number): string {
  const timestamp = Date.parse(value);
  assert(Number.isFinite(timestamp), `Invalid coverage timestamp: ${value}`);
  return new Date(timestamp + days * 86_400_000).toISOString();
}

async function scanOutcomes(input: {
  filepath: string;
  reference: { path: string; sha256: string; bytes: number };
  runId: string;
  sourceId: string;
}) {
  const stats = lstatSync(input.filepath);
  assert(stats.isFile() && !stats.isSymbolicLink(), `Coverage outcomes must be a regular file: ${input.reference.path}`);
  assert(stats.size === input.reference.bytes, `Coverage outcomes byte count changed: ${input.reference.path}`);

  const hash = createHash("sha256");
  let buffered = "";
  let bytes = 0;
  let outcomePairs = 0;
  let scopeCompletePairs = 0;
  const outcomeStatusCounts: Record<PairOutcomeStatus, number> = {
    "evidence-found": 0,
    "no-qualifying-evidence": 0,
    "needs-followup": 0,
    blocked: 0,
  };

  function consume(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;
    const outcome = JSON.parse(trimmed) as Record<string, unknown>;
    assert(outcome.run_id === input.runId, `Coverage outcome run_id mismatch in ${input.reference.path}.`);
    assert(outcome.source_id === input.sourceId, `Coverage outcome source_id mismatch in ${input.reference.path}.`);
    assert(typeof outcome.scope_complete === "boolean", `Coverage outcome scope_complete is invalid in ${input.reference.path}.`);
    const status = outcome.status as PairOutcomeStatus;
    assert(status in outcomeStatusCounts, `Coverage outcome status is invalid in ${input.reference.path}.`);
    outcomePairs += 1;
    if (outcome.scope_complete) scopeCompletePairs += 1;
    outcomeStatusCounts[status] += 1;
  }

  for await (const chunk of createReadStream(input.filepath)) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += data.length;
    hash.update(data);
    buffered += data.toString("utf8");
    let newline = buffered.indexOf("\n");
    while (newline >= 0) {
      consume(buffered.slice(0, newline));
      buffered = buffered.slice(newline + 1);
      newline = buffered.indexOf("\n");
    }
  }
  consume(buffered);
  assert(bytes === input.reference.bytes, `Coverage outcomes changed while reading: ${input.reference.path}`);
  assert(hash.digest("hex") === input.reference.sha256, `Coverage outcomes hash changed: ${input.reference.path}`);
  return { outcomePairs, scopeCompletePairs, outcomeStatusCounts };
}

export async function buildSourceCoverageIndex(input: {
  root: string;
  generatedFromCommit: string;
}): Promise<SourceCoverageIndex> {
  assert(/^[0-9a-f]{40}$/u.test(input.generatedFromCommit), "Coverage index commit must be a full lowercase Git SHA.");
  const registryPath = path.join(input.root, "src/data/research/source-registry.json");
  const registryBytes = readFileSync(registryPath);
  const registry = JSON.parse(registryBytes.toString("utf8")) as SourceRegistry;
  const registrySources = new Map(registry.sources.map((source) => [source.id, source]));
  assert(registrySources.size === registry.sources.length, "Source registry contains duplicate source IDs.");

  const runsRoot = path.join(input.root, "src/data/research/runs");
  const directories = readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".pending-research-run-"))
    .map((entry) => entry.name)
    .sort(compareText);
  const entries: SourceCoverageEntry[] = [];

  for (const directory of directories) {
    const runDirectory = path.join(runsRoot, directory);
    const receiptPath = path.join(runDirectory, "receipt.json");
    assert(existsSync(receiptPath), `Coverage run is missing receipt.json: ${directory}`);
    const receiptStats = lstatSync(receiptPath);
    assert(receiptStats.isFile() && !receiptStats.isSymbolicLink(), `Coverage receipt is not a regular file: ${directory}`);
    const receiptBytes = readFileSync(receiptPath);
    const receipt = JSON.parse(receiptBytes.toString("utf8")) as ImmutableResearchRunReceipt;
    assert(receipt.run_id === directory, `Coverage receipt run ID mismatch: ${directory}`);
    assert(["complete", "partial", "failed"].includes(receipt.status), `Coverage receipt status is invalid: ${directory}`);
    assert(registrySources.has(receipt.source_id), `Coverage receipt uses an unregistered source: ${receipt.source_id}`);
    assert(/^[0-9a-f]{64}$/u.test(receipt.parameter_hash), `Coverage parameter hash is invalid: ${directory}`);
    assert(receipt.requested_scope && Array.isArray(receipt.requested_scope.pair_keys), `Coverage receipt scope is invalid: ${directory}`);

    const outcomeReferences = receipt.outputs.filter((reference) => reference.path.endsWith("/outcomes.ndjson"));
    assert(outcomeReferences.length === 1, `Coverage receipt must declare one outcomes file: ${directory}`);
    const outcomeReference = outcomeReferences[0];
    const outcomesPath = path.resolve(input.root, outcomeReference.path);
    const relativeToRun = path.relative(runDirectory, outcomesPath);
    assert(
      relativeToRun.length > 0 && !relativeToRun.startsWith("..") && !path.isAbsolute(relativeToRun),
      `Coverage outcomes path escapes its run: ${outcomeReference.path}`,
    );
    const scan = await scanOutcomes({
      filepath: outcomesPath,
      reference: outcomeReference,
      runId: directory,
      sourceId: receipt.source_id,
    });
    assert(scan.outcomePairs === receipt.counts.pair_outcomes, `Coverage outcome count differs from receipt: ${directory}`);

    const requestedScopeSha256 = sha256(stableJson(receipt.requested_scope));
    const queryKey = sha256(stableJson({
      sourceId: receipt.source_id,
      parameterHash: receipt.parameter_hash,
      requestedScopeSha256,
    }));
    const coverageKey = sha256(stableJson({
      queryKey,
      sourceRegistryHash: receipt.source_registry_hash,
      adapterId: receipt.adapter_id,
      adapterVersion: receipt.adapter_version,
    }));
    const cadence = registrySources.get(receipt.source_id)!.refreshCadenceDays;
    const completeScope =
      receipt.status === "complete" &&
      receipt.counts.error_count === 0 &&
      scan.outcomePairs === receipt.counts.requested_pairs &&
      scan.scopeCompletePairs === scan.outcomePairs;
    const plannerAction: PlannerAction = completeScope
      ? "skip-identical-query-until-freshness-deadline"
      : receipt.status === "partial"
        ? "resume-partial-run"
        : receipt.status === "failed"
          ? "retry-only-after-blocker-change"
          : "resume-incomplete-scope";

    entries.push({
      coverageKey,
      queryKey,
      runId: directory,
      receiptPath: repositoryPath(input.root, receiptPath),
      receiptSha256: sha256(receiptBytes),
      sourceId: receipt.source_id,
      sourceRegistryHash: receipt.source_registry_hash,
      adapterId: receipt.adapter_id,
      adapterVersion: receipt.adapter_version,
      parameterHash: receipt.parameter_hash,
      requestedScopeSha256,
      status: receipt.status,
      startedAt: receipt.started_at,
      finishedAt: receipt.finished_at,
      refreshCadenceDays: cadence,
      freshnessDeadline: cadence === null ? null : addDays(receipt.finished_at, cadence),
      plannerAction,
      requestedPairs: receipt.counts.requested_pairs,
      outcomePairs: scan.outcomePairs,
      scopeCompletePairs: scan.scopeCompletePairs,
      outcomeStatusCounts: scan.outcomeStatusCounts,
      outcomesPath: outcomeReference.path,
      outcomesSha256: outcomeReference.sha256,
      outcomesBytes: outcomeReference.bytes,
    });
  }

  const sources = [...registrySources.keys()].sort(compareText).map((sourceId) => {
    const sourceEntries = entries.filter((entry) => entry.sourceId === sourceId);
    return {
      sourceId,
      coverageState: sourceEntries.length > 0
        ? "covered-by-immutable-runs" as const
        : "no-immutable-run-coverage" as const,
      runCount: sourceEntries.length,
      completeRuns: sourceEntries.filter((entry) => entry.status === "complete").length,
      partialRuns: sourceEntries.filter((entry) => entry.status === "partial").length,
      failedRuns: sourceEntries.filter((entry) => entry.status === "failed").length,
      requestedPairs: sourceEntries.reduce((total, entry) => total + entry.requestedPairs, 0),
      scopeCompletePairs: sourceEntries.reduce((total, entry) => total + entry.scopeCompletePairs, 0),
      latestFinishedAt: sourceEntries.map((entry) => entry.finishedAt).sort(compareText).at(-1) ?? null,
    };
  });
  const runReceiptDigestSha256 = sha256(stableJson(entries.map((entry) => ({
    runId: entry.runId,
    receiptSha256: entry.receiptSha256,
    outcomesSha256: entry.outcomesSha256,
  }))));
  const sourceRegistrySha256 = sha256(registryBytes);
  const indexId = `source-coverage-${sha256(stableJson({
    generatedFromCommit: input.generatedFromCommit,
    sourceRegistrySha256,
    runReceiptDigestSha256,
  })).slice(0, 20)}`;

  return {
    schemaVersion: SOURCE_COVERAGE_INDEX_SCHEMA_VERSION,
    kind: "isitusa-source-coverage-index",
    indexId,
    generatedFromCommit: input.generatedFromCommit,
    sourceRegistryPath: "src/data/research/source-registry.json",
    sourceRegistrySha256,
    runReceiptDigestSha256,
    runCount: entries.length,
    sourceCount: sources.length,
    policy: {
      authority: "immutable-run-receipts-and-hash-pinned-outcomes",
      identicalCurrent: "skip",
      partial: "resume",
      stale: "refresh-deliberately",
      blocked: "retry-only-after-blocker-change",
      unknown: "prioritize-before-repeating-current-coverage",
    },
    sources,
    entries,
  };
}

export function sourceCoverageIndexBytes(index: SourceCoverageIndex): Buffer {
  return Buffer.from(`${JSON.stringify(index, null, 2)}\n`, "utf8");
}
