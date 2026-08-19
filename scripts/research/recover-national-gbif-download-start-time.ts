import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableJson } from "./national-gbif-download";
import { verifyNationalGbifAcquisition } from "./verify-national-gbif-download";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function relativeGitPath(filepath: string) {
  return path.relative(ROOT, filepath).split(path.sep).join("/");
}

function runTimestamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z").toLowerCase();
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid recovery argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const staging = values.get("staging");
  const evaluation = values.get("evaluation");
  assert(staging, "--staging is required.");
  assert(evaluation, "--evaluation is required.");
  return { stagingDirectory: path.resolve(ROOT, staging), evaluationPath: path.resolve(ROOT, evaluation) };
}

function writeAtomic(filepath: string, contents: string) {
  const temporary = path.join(path.dirname(filepath), `.${path.basename(filepath)}.tmp`);
  rmSync(temporary, { force: true });
  writeFileSync(temporary, contents, { flag: "wx" });
  renameSync(temporary, filepath);
}

async function main() {
  const { stagingDirectory, evaluationPath } = parseArgs(process.argv.slice(2));
  const stagingRoot = path.join(ROOT, ".cache/research/national-gbif-acquisitions");
  const acquisitionRoot = path.join(ROOT, "src/data/research/national-acquisitions");
  const evaluationRoot = path.join(ROOT, "ops/national-research/evaluations");
  assert(stagingDirectory.startsWith(`${stagingRoot}${path.sep}`), "GBIF recovery staging path escapes its cache root.");
  assert(evaluationPath.startsWith(`${evaluationRoot}${path.sep}`), "GBIF recovery evaluation path escapes its operations root.");
  assert(existsSync(stagingDirectory), "GBIF recovery staging directory is missing.");
  assert(!existsSync(evaluationPath), "GBIF recovery evaluation already exists.");
  assert(
    execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" }).trim() === "",
    "GBIF timestamp recovery requires a clean committed worktree.",
  );

  const receiptPath = path.join(stagingDirectory, "receipt.json");
  const progressPath = path.join(stagingDirectory, "progress.json");
  const originalReceiptContents = readFileSync(receiptPath, "utf8");
  const originalProgressContents = readFileSync(progressPath, "utf8");
  const receipt = JSON.parse(originalReceiptContents) as Record<string, any>;
  const progress = JSON.parse(originalProgressContents) as Record<string, any>;
  assert(receipt.acquisition_id === path.basename(stagingDirectory), "GBIF recovery acquisition identity changed.");
  assert(receipt.status === "complete" && receipt.download?.status === "SUCCEEDED", "GBIF recovery requires a completed provider download.");
  assert(receipt.started_at === progress.startedAt, "GBIF recovery start timestamps already disagree.");
  assert(receipt.requested_at === progress.requestedAt, "GBIF recovery request timestamps already disagree.");
  const originalStartedAt = String(receipt.started_at);
  const correctedStartedAt = String(receipt.requested_at);
  const negativeSkewMilliseconds = Date.parse(originalStartedAt) - Date.parse(correctedStartedAt);
  assert(negativeSkewMilliseconds > 0, "GBIF recovery is only for a future declared start timestamp.");
  assert(negativeSkewMilliseconds <= 5 * 60_000, "GBIF recovery refuses timestamp skew over five minutes.");
  const correctedAcquisitionId = `${runTimestamp(correctedStartedAt)}__gbif-download__${String(receipt.parameter_hash).slice(0, 12)}`;
  const finalDirectory = path.join(acquisitionRoot, correctedAcquisitionId);
  assert(!existsSync(finalDirectory), "Corrected GBIF acquisition directory already exists.");

  receipt.acquisition_id = correctedAcquisitionId;
  receipt.started_at = correctedStartedAt;
  receipt.archive.path = relativeGitPath(path.join(finalDirectory, "download.zip"));
  receipt.request_path = relativeGitPath(path.join(finalDirectory, "request.redacted.json"));
  receipt.warnings = [
    ...(receipt.warnings ?? []),
    `The declared start timestamp was transactionally corrected from ${originalStartedAt} to the provider requested timestamp ${correctedStartedAt}; no additional provider request was issued.`,
  ];
  progress.startedAt = correctedStartedAt;
  const correctedReceiptContents = stableJson(receipt);
  const correctedProgressContents = stableJson(progress);
  const recoveryScriptPath = fileURLToPath(import.meta.url);
  const recoveryCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const evaluation = {
    schemaVersion: 1,
    evaluationId: "round-72-gbif-national-start-time-recovery-20260818-r1",
    status: "complete",
    recoveryMode: "zero-network-completed-staging-timestamp-correction",
    recoveryCommit,
    recoveryScriptPath: relativeGitPath(recoveryScriptPath),
    recoveryScriptSha256: sha256(readFileSync(recoveryScriptPath)),
    sourceCodeCommit: receipt.code_commit,
    originalAcquisitionId: path.basename(stagingDirectory),
    correctedAcquisitionId,
    originalStartedAt,
    correctedStartedAt,
    requestedAt: receipt.requested_at,
    finishedAt: receipt.finished_at,
    negativeSkewMilliseconds,
    providerCallsAddedByRecovery: 0,
    downloadKey: receipt.download.key,
    doi: receipt.download.doi,
    providerRecords: receipt.archive.provider_total_records,
    archiveBytes: receipt.archive.bytes,
    archiveSha256: receipt.archive.sha256,
    originalReceiptSha256: sha256(originalReceiptContents),
    correctedReceiptSha256: sha256(correctedReceiptContents),
    result: "The completed archive was retained, timestamps were made chronological, and the corrected acquisition passed the full committed-input verifier without issuing another provider request.",
  };
  const stagedEvaluationPath = path.join(ROOT, ".cache/research", `.${path.basename(evaluationPath)}.staged`);
  rmSync(stagedEvaluationPath, { force: true });
  writeFileSync(stagedEvaluationPath, stableJson(evaluation), { flag: "wx" });

  let moved = false;
  try {
    writeAtomic(receiptPath, correctedReceiptContents);
    writeAtomic(progressPath, correctedProgressContents);
    renameSync(stagingDirectory, finalDirectory);
    moved = true;
    const verified = await verifyNationalGbifAcquisition(ROOT, finalDirectory);
    assert(verified.receiptSha256 === evaluation.correctedReceiptSha256, "Recovered GBIF receipt hash changed during verification.");
    renameSync(stagedEvaluationPath, evaluationPath);
    process.stdout.write(`${JSON.stringify({
      acquisitionDirectory: relativeGitPath(finalDirectory),
      receiptSha256: verified.receiptSha256,
      archiveSha256: verified.receipt.archive.sha256,
      providerRecords: verified.receipt.archive.provider_total_records,
      providerCallsAddedByRecovery: 0,
      evaluationPath: relativeGitPath(evaluationPath),
    }, null, 2)}\n`);
  } catch (error) {
    if (moved && existsSync(finalDirectory) && !existsSync(stagingDirectory)) renameSync(finalDirectory, stagingDirectory);
    writeAtomic(receiptPath, originalReceiptContents);
    writeAtomic(progressPath, originalProgressContents);
    rmSync(stagedEvaluationPath, { force: true });
    throw error;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
