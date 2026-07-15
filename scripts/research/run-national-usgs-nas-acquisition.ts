import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  USGS_NAS_ACQUISITION_ACTOR,
  USGS_NAS_ARTIFACT_BUDGET_BYTES,
  USGS_NAS_RESOURCE_URL,
  USGS_NAS_SOURCE_ID,
  type NationalNasAcquisitionReceipt,
  canonicalNasArchiveUrl,
  captureCommittedInputSnapshot,
  compareText,
  inspectNationalNasArchive,
  nationalNasDownloadedCoverage,
  relativeGitPath,
  validateNationalNasReceipt,
  validateNationalNasCheckpointIdentity,
  validateNationalNasResponseBudget,
  validateNationalNasResumeResponse,
  verifyCommittedInputSnapshot,
  verifyNationalNasAcquisition,
} from "./national-usgs-nas-common";

import { sha256, stableJson } from "@/lib/research/run-files";

const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, "src/data/research");
const NATIONAL_ROOT = path.join(RESEARCH_DIR, "national-acquisitions");
const CACHE_ROOT = path.join(ROOT, ".cache/research/national-acquisitions/usgs-nas");
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 180_000;

type DownloadCheckpoint = {
  schemaVersion: 1;
  archiveVersion: string;
  archiveUrl: string;
  codeCommit: string;
  inputHashes: Record<string, string>;
  parameterHash: string;
  startedAt: string;
  upstreamRequests: NationalNasAcquisitionReceipt["upstream_requests"];
  transientFailures: number;
  resumedBytes: number;
  warnings: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid argument sequence near ${flag ?? "end of arguments"}.`);
    }
    const key = flag.slice(2);
    assert(!values.has(key), `Duplicate argument --${key}.`);
    values.set(key, value);
  }
  const version = values.get("version") ?? "";
  const startedAtValue = values.get("started-at") ?? "";
  assert(/^[0-9]+\.[0-9]+$/.test(version), "--version must be a published numeric IPT version.");
  assert(startedAtValue.length > 0, "--started-at is required for immutable request lineage.");
  const startedAtMilliseconds = Date.parse(startedAtValue);
  assert(!Number.isNaN(startedAtMilliseconds), "--started-at must be an ISO date-time.");
  assert(startedAtMilliseconds <= Date.now(), "--started-at cannot be in the future.");
  const startedAt = new Date(startedAtMilliseconds).toISOString();
  const unsupported = [...values.keys()].filter((key) => !["version", "started-at"].includes(key));
  assert(unsupported.length === 0, `Unsupported arguments: ${unsupported.join(", ")}.`);
  return { version, startedAt };
}

function saveCheckpoint(filepath: string, checkpoint: DownloadCheckpoint) {
  mkdirSync(path.dirname(filepath), { recursive: true });
  const temporary = `${filepath}.next`;
  writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`);
  renameSync(temporary, filepath);
}

function readCheckpoint(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as DownloadCheckpoint;
}

function responseContentLength(value: string | null) {
  if (value === null) return null;
  assert(/^\d+$/.test(value), `Invalid USGS NAS Content-Length ${value}.`);
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed), `Unsafe USGS NAS Content-Length ${value}.`);
  return parsed;
}

function recoverInterruptedRequest(
  checkpoint: DownloadCheckpoint,
  checkpointFile: string,
  partialArchive: string,
) {
  if (!existsSync(partialArchive)) return;
  const last = checkpoint.upstreamRequests.at(-1);
  if (!last || ![200, 206].includes(last.status) || last.bytes_received !== 0) return;
  const size = statSync(partialArchive).size;
  const writeStart = last.status === 206 ? last.range_start : 0;
  assert(size >= writeStart, "Interrupted USGS NAS partial archive is shorter than its range start.");
  const recoveredBytes = size - writeStart;
  if (recoveredBytes === 0) return;
  last.bytes_received = recoveredBytes;
  checkpoint.warnings.push(
    `Recovered ${recoveredBytes} checkpointed bytes from interrupted request ${last.attempt}.`,
  );
  saveCheckpoint(checkpointFile, checkpoint);
}

function validateCheckpoint(
  checkpoint: DownloadCheckpoint,
  expected: Omit<DownloadCheckpoint, "upstreamRequests" | "transientFailures" | "resumedBytes" | "warnings">,
) {
  assert(checkpoint.schemaVersion === 1, "Unsupported USGS NAS checkpoint version.");
  validateNationalNasCheckpointIdentity({
    checkpointVersion: checkpoint.archiveVersion,
    checkpointUrl: checkpoint.archiveUrl,
    checkpointCommit: checkpoint.codeCommit,
    checkpointInputHashes: checkpoint.inputHashes,
    checkpointParameterHash: checkpoint.parameterHash,
    checkpointStartedAt: checkpoint.startedAt,
    expectedVersion: expected.archiveVersion,
    expectedUrl: expected.archiveUrl,
    expectedCommit: expected.codeCommit,
    expectedInputHashes: expected.inputHashes,
    expectedParameterHash: expected.parameterHash,
    expectedStartedAt: expected.startedAt,
  });
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const commonPath = path.join(ROOT, "scripts/research/national-usgs-nas-common.ts");
  const scriptPath = path.join(ROOT, "scripts/research/run-national-usgs-nas-acquisition.ts");
  const receiptSchemaPath = path.join(
    RESEARCH_DIR,
    "schemas/national-usgs-nas-acquisition-receipt.schema.json",
  );
  const registryPath = path.join(RESEARCH_DIR, "source-registry.json");
  const inputPaths = [commonPath, scriptPath, receiptSchemaPath, registryPath];
  const snapshot = captureCommittedInputSnapshot(ROOT, inputPaths);
  const inputHashes = Object.fromEntries(
    [...snapshot.fileHashes.entries()]
      .map(([filepath, hash]) => [relativeGitPath(ROOT, filepath), hash] as const)
      .sort(([left], [right]) => compareText(left, right)),
  );
  const parameters: NationalNasAcquisitionReceipt["parameters"] = {
    archiveVersion: options.version,
    archiveUrl: canonicalNasArchiveUrl(options.version),
    resourceUrl: USGS_NAS_RESOURCE_URL,
    artifactBudgetBytes: USGS_NAS_ARTIFACT_BUDGET_BYTES,
  };
  const parameterHash = sha256(stableJson(parameters));
  const pendingDirectory = path.join(CACHE_ROOT, options.version, snapshot.commit);
  const checkpointFile = path.join(pendingDirectory, "checkpoint.json");
  const partialArchive = path.join(pendingDirectory, `usgs-nas-v${options.version}.zip.part`);
  const expectedCheckpoint = {
    schemaVersion: 1 as const,
    archiveVersion: options.version,
    archiveUrl: parameters.archiveUrl,
    codeCommit: snapshot.commit,
    inputHashes,
    parameterHash,
    startedAt: options.startedAt,
  };
  let checkpoint: DownloadCheckpoint;
  if (existsSync(checkpointFile)) {
    checkpoint = readCheckpoint(checkpointFile);
    validateCheckpoint(checkpoint, expectedCheckpoint);
  } else {
    checkpoint = {
      ...expectedCheckpoint,
      upstreamRequests: [],
      transientFailures: 0,
      resumedBytes: 0,
      warnings: [],
    };
    saveCheckpoint(checkpointFile, checkpoint);
  }

  recoverInterruptedRequest(checkpoint, checkpointFile, partialArchive);
  if (existsSync(partialArchive)) {
    try {
      assert(
        nationalNasDownloadedCoverage(checkpoint.upstreamRequests) === statSync(partialArchive).size,
        "USGS NAS checkpoint requests do not reconstruct the partial archive.",
      );
    } catch (error) {
      checkpoint.warnings.push(
        `Discarded a partial archive without complete request lineage: ${error instanceof Error ? error.message : String(error)}.`,
      );
      rmSync(partialArchive, { force: true });
      checkpoint.upstreamRequests = [];
      checkpoint.resumedBytes = 0;
      saveCheckpoint(checkpointFile, checkpoint);
    }
  }

  let inspected: Awaited<ReturnType<typeof inspectNationalNasArchive>> | null = null;
  if (existsSync(partialArchive) && statSync(partialArchive).size > 0) {
    try {
      inspected = await inspectNationalNasArchive(partialArchive, true);
    } catch {
      inspected = null;
    }
  }

  if (!inspected) {
    let lastError = "unknown archive download failure";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const rangeStart = existsSync(partialArchive) ? statSync(partialArchive).size : 0;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let requestIndex: number | null = null;
      let responseWriteStart = rangeStart;
      let responseCompleted = false;
      try {
        const response = await fetch(parameters.archiveUrl, {
          headers: {
            Accept: "application/zip",
            ...(rangeStart > 0 ? { Range: `bytes=${rangeStart}-` } : {}),
            "User-Agent": "Project-Isitusa/1.0 (national evidence acquisition)",
          },
          redirect: "follow",
          signal: controller.signal,
        });
        const retrievedAt = new Date().toISOString();
        if (!response.ok || !response.body) {
          checkpoint.upstreamRequests.push({
            url: parameters.archiveUrl,
            response_url: response.url || parameters.archiveUrl,
            method: "GET",
            status: response.status,
            retrieved_at: retrievedAt,
            bytes_received: 0,
            range_start: rangeStart,
            content_range: response.headers.get("content-range"),
            content_length: responseContentLength(response.headers.get("content-length")),
            attempt,
            etag: response.headers.get("etag"),
            last_modified: response.headers.get("last-modified"),
          });
          checkpoint.transientFailures += 1;
          checkpoint.warnings.push(`Archive request attempt ${attempt} returned HTTP ${response.status}.`);
          saveCheckpoint(checkpointFile, checkpoint);
          lastError = `HTTP ${response.status}`;
          if (response.status !== 429 && response.status < 500) break;
          continue;
        }
        const resume = validateNationalNasResumeResponse({
          rangeStart,
          status: response.status,
          contentRange: response.headers.get("content-range"),
        });
        const canResume = resume.append;
        const writeStart = resume.writeStart;
        responseWriteStart = writeStart;
        if (!canResume && rangeStart > 0) rmSync(partialArchive, { force: true });
        const contentLength = responseContentLength(response.headers.get("content-length"));
        const remainingBudget = validateNationalNasResponseBudget({
          writeStart,
          contentLength,
          artifactBudgetBytes: parameters.artifactBudgetBytes,
        });
        checkpoint.upstreamRequests.push({
          url: parameters.archiveUrl,
          response_url: response.url || parameters.archiveUrl,
          method: "GET",
          status: response.status,
          retrieved_at: retrievedAt,
          bytes_received: 0,
          range_start: rangeStart,
          content_range: response.headers.get("content-range"),
          content_length: contentLength,
          attempt,
          etag: response.headers.get("etag"),
          last_modified: response.headers.get("last-modified"),
        });
        requestIndex = checkpoint.upstreamRequests.length - 1;
        saveCheckpoint(checkpointFile, checkpoint);
        mkdirSync(path.dirname(partialArchive), { recursive: true });
        const beforeBytes = writeStart;
        let responseBytes = 0;
        const limiter = new Transform({
          transform(chunk, _encoding, callback) {
            responseBytes += chunk.length;
            if (responseBytes > remainingBudget) {
              callback(new Error("USGS NAS response exceeded the artifact budget while streaming."));
              return;
            }
            callback(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(response.body as never),
          limiter,
          createWriteStream(partialArchive, { flags: canResume ? "a" : "w" }),
        );
        responseCompleted = true;
        const afterBytes = statSync(partialArchive).size;
        const bytesReceived = afterBytes - beforeBytes;
        assert(bytesReceived > 0, "USGS NAS archive response did not add bytes.");
        checkpoint.upstreamRequests[requestIndex]!.bytes_received = bytesReceived;
        if (canResume) checkpoint.resumedBytes = Math.max(checkpoint.resumedBytes, rangeStart);
        saveCheckpoint(checkpointFile, checkpoint);
        inspected = await inspectNationalNasArchive(partialArchive, true);
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (requestIndex !== null && existsSync(partialArchive)) {
          checkpoint.upstreamRequests[requestIndex]!.bytes_received = Math.max(
            0,
            statSync(partialArchive).size - responseWriteStart,
          );
        }
        checkpoint.transientFailures += 1;
        checkpoint.warnings.push(`Archive request attempt ${attempt} failed: ${lastError}.`);
        if (responseCompleted) {
          rmSync(partialArchive, { force: true });
          checkpoint.warnings.push(
            `Discarded the completed response from attempt ${attempt} because archive validation failed.`,
          );
        }
        saveCheckpoint(checkpointFile, checkpoint);
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, [1_000, 5_000][attempt - 1]));
      }
    }
    assert(inspected, `USGS NAS archive download failed after ${MAX_ATTEMPTS} attempts: ${lastError}.`);
  }

  const archiveBytes = readFileSync(partialArchive);
  assert(
    archiveBytes.length <= parameters.artifactBudgetBytes,
    `USGS NAS archive exceeds ${parameters.artifactBudgetBytes} bytes.`,
  );
  const archiveSha256 = sha256(archiveBytes);
  const acquisitionId = `${inspected.publicationDate.replaceAll("-", "")}__usgs-nas-dwca-v${options.version.replace(".", "-")}__${archiveSha256.slice(0, 12)}`;
  const finalDirectory = path.join(NATIONAL_ROOT, acquisitionId);
  if (existsSync(finalDirectory)) {
    const verified = await verifyNationalNasAcquisition(ROOT, finalDirectory, true);
    assert(verified.receipt.artifact.sha256 === archiveSha256, "Existing USGS NAS acquisition differs.");
    rmSync(pendingDirectory, { recursive: true, force: true });
    console.log(JSON.stringify({ acquisitionId, existing: true, ...verified.receipt.counts }, null, 2));
    return;
  }

  const finishedAt = new Date().toISOString();
  const relativeArchivePath = relativeGitPath(
    ROOT,
    path.join(finalDirectory, "artifacts", `usgs-nas-dwca-v${options.version}.zip`),
  );
  const receipt: NationalNasAcquisitionReceipt = {
    schemaVersion: 1,
    acquisition_id: acquisitionId,
    status: "complete",
    started_at: options.startedAt,
    finished_at: finishedAt,
    actor_type: "adapter",
    actor_id: USGS_NAS_ACQUISITION_ACTOR,
    source_id: USGS_NAS_SOURCE_ID,
    code_commit: snapshot.commit,
    input_hashes: inputHashes,
    parameter_hash: parameterHash,
    parameters,
    upstream_requests: checkpoint.upstreamRequests,
    artifact: {
      path: relativeArchivePath,
      sha256: archiveSha256,
      bytes: archiveBytes.length,
      media_type: "application/zip",
    },
    archive: {
      title: inspected.title,
      publication_date: inspected.publicationDate,
      license: inspected.license,
      record_count: inspected.recordCount,
      core_file: inspected.coreFile,
      header_sha256: inspected.headerSha256,
      entry_names: inspected.entryNames,
    },
    counts: {
      upstream_requests: checkpoint.upstreamRequests.length,
      artifacts: 1,
      records: inspected.recordCount,
      transient_failures: checkpoint.transientFailures,
      resumed_bytes: checkpoint.resumedBytes,
    },
    errors: [],
    warnings: [
      ...new Set([
        ...checkpoint.warnings,
        "The USGS NAS archive is a provisional occurrence resource whose accuracy, completeness, scale, and temporal currency vary.",
        "Archive silence and rejected records support research screening only, never absence or non-detection.",
      ]),
    ],
    rerun_command: `npm run research:acquire:usgs-nas-national -- --version ${options.version} --started-at ${options.startedAt}`,
  };
  validateNationalNasReceipt(ROOT, receipt);
  verifyCommittedInputSnapshot(ROOT, snapshot);

  const stagingDirectory = path.join(pendingDirectory, `${acquisitionId}.final`);
  rmSync(stagingDirectory, { recursive: true, force: true });
  mkdirSync(path.join(stagingDirectory, "artifacts"), { recursive: true });
  copyFileSync(partialArchive, path.join(stagingDirectory, "artifacts", path.basename(relativeArchivePath)));
  writeFileSync(path.join(stagingDirectory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
  mkdirSync(NATIONAL_ROOT, { recursive: true });
  renameSync(stagingDirectory, finalDirectory);
  const verified = await verifyNationalNasAcquisition(ROOT, finalDirectory, true);
  rmSync(pendingDirectory, { recursive: true, force: true });
  console.log(JSON.stringify({
    acquisitionId,
    directory: relativeGitPath(ROOT, finalDirectory),
    existing: false,
    ...verified.receipt.counts,
    receiptSha256: verified.receiptSha256,
    archiveSha256,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
