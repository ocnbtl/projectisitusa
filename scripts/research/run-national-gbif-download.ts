import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  GBIF_DOWNLOAD_STATUS_URL,
  GBIF_NATIONAL_DOWNLOAD_ACTOR,
  buildGbifDownloadRequest,
  downloadStatusDisposition,
  gbifCredentialReadiness,
  loadNationalGbifDownloadPlan,
  loadNationalGbifSelection,
  nationalGbifAcquisitionInputPaths,
  publicDownloadMetadata,
  redactGbifDownloadRequest,
  resolveNationalGbifTaxa,
  sha256,
  stableJson,
} from "./national-gbif-download";
import { verifyNationalGbifAcquisition } from "./verify-national-gbif-download";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUEST_TIMEOUT_MS = 180_000;
const ARCHIVE_STREAM_TIMEOUT_MS = 60 * 60_000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
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
    assert(key?.startsWith("--") && value, `Invalid GBIF national actor argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const plan = values.get("plan");
  const startedAt = values.get("started-at");
  const dry = values.get("semantic-dry-run") ?? "false";
  assert(plan, "--plan is required.");
  assert(startedAt && !Number.isNaN(Date.parse(startedAt)), "--started-at must be an ISO timestamp.");
  assert(dry === "true" || dry === "false", "--semantic-dry-run must be true or false.");
  const semanticDryRun = dry === "true";
  const preflightOutput = values.get("preflight-output");
  const reconcileDownloadKey = values.get("reconcile-download-key") ?? null;
  assert(semanticDryRun || !preflightOutput, "--preflight-output is only valid for a semantic dry run.");
  assert(
    !reconcileDownloadKey || /^[A-Za-z0-9-]+$/u.test(reconcileDownloadKey),
    "--reconcile-download-key must be a GBIF download key.",
  );
  assert(!semanticDryRun || !reconcileDownloadKey, "--reconcile-download-key cannot be used for a semantic dry run.");
  return {
    planPath: path.resolve(ROOT, plan),
    startedAt: new Date(startedAt).toISOString(),
    semanticDryRun,
    preflightOutput: preflightOutput ? path.resolve(ROOT, preflightOutput) : null,
    reconcileDownloadKey,
  };
}

function committedInputHash(filepath: string) {
  const relative = relativeGitPath(filepath);
  execFileSync("git", ["diff", "--quiet", "--", relative], { cwd: ROOT, stdio: "ignore" });
  execFileSync("git", ["diff", "--cached", "--quiet", "--", relative], { cwd: ROOT, stdio: "ignore" });
  const tracked = execFileSync("git", ["ls-files", "--error-unmatch", "--", relative], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  assert(tracked === relative, `GBIF national input is not committed: ${relative}`);
  return sha256(readFileSync(filepath));
}

function writeJson(filepath: string, value: unknown) {
  mkdirSync(path.dirname(filepath), { recursive: true });
  const temporary = path.join(path.dirname(filepath), `.${path.basename(filepath)}.tmp`);
  if (existsSync(temporary)) unlinkSync(temporary);
  writeFileSync(temporary, stableJson(value), { encoding: "utf8", flag: "wx" });
  renameSync(temporary, filepath);
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readBoundedResponse(
  response: Response,
  label: string,
  byteBudget = 4 * 1024 * 1024,
  timeoutMs = REQUEST_TIMEOUT_MS,
) {
  assert(response.body, `${label} response has no body.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const deadline = Date.now() + timeoutMs;
  try {
    while (true) {
      const remaining = deadline - Date.now();
      assert(remaining > 0, `${label} response body exceeded its time budget.`);
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const next = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error(`${label} response body exceeded its time budget.`)), remaining);
        }),
      ]).finally(() => {
        if (timeout) clearTimeout(timeout);
      });
      if (next.done) break;
      bytes += next.value.length;
      assert(bytes <= byteBudget, `${label} response body exceeds the ${byteBudget}-byte budget.`);
      chunks.push(next.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), bytes);
}

export type GbifHttpAttempt = {
  role: "request" | "status" | "archive";
  method: string;
  url: string;
  attempt: number;
  status: number | null;
  observedAt: string;
  retryable: boolean;
  error: string | null;
};

export function requestResumeAction(
  progressExists: boolean,
  dispatchMarkerExists: boolean,
  reconcileDownloadKey: string | null,
) {
  if (progressExists) {
    assert(!reconcileDownloadKey, "--reconcile-download-key is invalid after a download key is durable.");
    return "resume" as const;
  }
  if (dispatchMarkerExists) return reconcileDownloadKey ? "reconcile" as const : "blocked" as const;
  assert(!reconcileDownloadKey, "--reconcile-download-key requires an ambiguous request dispatch marker.");
  return "dispatch" as const;
}

function retryDelay(response: Response, attempt: number, baseDelayMs: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 60_000);
    const timestamp = Date.parse(retryAfter);
    if (!Number.isNaN(timestamp)) return Math.max(0, Math.min(timestamp - Date.now(), 60_000));
  }
  return Math.min(baseDelayMs * (2 ** attempt), 60_000);
}

export async function checkedFetch(
  url: string,
  init?: RequestInit,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    requestTimeoutMs?: number;
    deadlineMs?: number;
    role?: GbifHttpAttempt["role"];
    onAttempt?: (attempt: GbifHttpAttempt) => void;
  } = {},
) {
  const maxAttempts = options.maxAttempts ?? 5;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
  const method = (init?.method ?? "GET").toUpperCase();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remainingBeforeAttempt = (options.deadlineMs ?? Number.POSITIVE_INFINITY) - Date.now();
    assert(remainingBeforeAttempt > 0, `GBIF request exceeded its overall deadline for ${url}.`);
    let response: Response;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Math.min(requestTimeoutMs, remainingBeforeAttempt));
    const signal = init?.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;
    try {
      response = await fetch(url, { ...init, signal });
    } catch (error) {
      const retryable = method === "GET" && attempt + 1 < maxAttempts;
      options.onAttempt?.({
        role: options.role ?? "status",
        method,
        url,
        attempt: attempt + 1,
        status: null,
        observedAt: new Date().toISOString(),
        retryable,
        error: error instanceof Error ? error.name : "unknown-fetch-error",
      });
      if (!retryable) throw error;
      const remainingAfterError = (options.deadlineMs ?? Number.POSITIVE_INFINITY) - Date.now();
      assert(remainingAfterError > 0, `GBIF request exceeded its overall deadline for ${url}.`);
      const delay = Math.min(
        baseDelayMs * (2 ** attempt),
        60_000,
        remainingAfterError,
      );
      if (delay > 0) await sleep(delay);
      continue;
    } finally {
      clearTimeout(timeout);
    }
    const retryable = method === "GET" && (response.status === 429 || response.status >= 500);
    options.onAttempt?.({
      role: options.role ?? "status",
      method,
      url,
      attempt: attempt + 1,
      status: response.status,
      observedAt: new Date().toISOString(),
      retryable: retryable && attempt + 1 < maxAttempts,
      error: null,
    });
    if (response.ok) return response;
    if (!retryable || attempt + 1 === maxAttempts) {
      throw new Error(`GBIF request failed with HTTP ${response.status} for ${url}.`);
    }
    const remainingAfterResponse = (options.deadlineMs ?? Number.POSITIVE_INFINITY) - Date.now();
    assert(remainingAfterResponse > 0, `GBIF request exceeded its overall deadline for ${url}.`);
    const delay = Math.min(
      retryDelay(response, attempt, baseDelayMs),
      remainingAfterResponse,
    );
    await response.body?.cancel().catch(() => undefined);
    if (delay > 0) await sleep(delay);
  }
  throw new Error(`GBIF request exhausted retries for ${url}.`);
}

export function assertSuccessfulDownloadMetadata(
  metadata: ReturnType<typeof publicDownloadMetadata>,
  plan: ReturnType<typeof loadNationalGbifDownloadPlan>,
) {
  assert(metadata.downloadLink, "GBIF successful download metadata lacks a download link.");
  assert(metadata.doi?.trim(), "GBIF successful download metadata lacks a DOI.");
  assert(metadata.license?.trim(), "GBIF successful download metadata lacks a license.");
  assert(Number.isInteger(metadata.size) && metadata.size! > 0, "GBIF successful download metadata lacks a positive archive size.");
  assert(metadata.size! <= plan.artifactBudgetBytes, `GBIF provider metadata size ${metadata.size} exceeds the ${plan.artifactBudgetBytes}-byte archive budget.`);
  assert(Number.isInteger(metadata.totalRecords) && metadata.totalRecords! >= 0, "GBIF successful download metadata lacks a record count.");
  assert(metadata.totalRecords! <= plan.maxOccurrenceRows!, `GBIF provider record count ${metadata.totalRecords} exceeds the ${plan.maxOccurrenceRows}-row guard.`);
}

export async function retainDownload(
  url: string,
  filepath: string,
  budgetBytes: number,
  expectedBytes: number,
  onAttempt?: (attempt: GbifHttpAttempt) => void,
  streamTimeoutMs = ARCHIVE_STREAM_TIMEOUT_MS,
) {
  const temporary = `${filepath}.partial`;
  const priorBytes = existsSync(temporary) ? statSync(temporary).size : 0;
  assert(priorBytes <= expectedBytes, `GBIF partial archive bytes ${priorBytes} exceed provider metadata ${expectedBytes}.`);
  if (priorBytes === expectedBytes) {
    const completed = await hashRetainedFile(temporary, budgetBytes, expectedBytes);
    renameSync(temporary, filepath);
    return completed;
  }
  const headers = priorBytes > 0 ? { range: `bytes=${priorBytes}-` } : undefined;
  const controller = new AbortController();
  const response = await checkedFetch(
    url,
    { redirect: "follow", headers, signal: controller.signal },
    { role: "archive", onAttempt },
  );
  assert(response.body, "GBIF download response has no body.");
  const append = priorBytes > 0 && response.status === 206;
  if (append) {
    const contentRange = response.headers.get("content-range");
    assert(
      contentRange === `bytes ${priorBytes}-${expectedBytes - 1}/${expectedBytes}`,
      `GBIF archive Content-Range ${contentRange ?? "missing"} does not resume at ${priorBytes}.`,
    );
  } else {
    assert(response.status === 200, `GBIF archive request returned unexpected HTTP ${response.status}.`);
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength) {
    const expectedResponseBytes = append ? expectedBytes - priorBytes : expectedBytes;
    assert(Number(declaredLength) === expectedResponseBytes, `GBIF archive Content-Length ${declaredLength} differs from expected response bytes ${expectedResponseBytes}.`);
  }
  let bytes = append ? priorBytes : 0;
  const hash = createHash("sha256");
  if (append) {
    for await (const chunk of createReadStream(temporary)) hash.update(chunk);
  }
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > budgetBytes) {
        callback(new Error(`GBIF download exceeds the ${budgetBytes}-byte artifact budget.`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  const streamTimeout = setTimeout(() => controller.abort(), streamTimeoutMs);
  try {
    await pipeline(Readable.fromWeb(response.body as never), limiter, createWriteStream(temporary, { flags: append ? "a" : "w" }));
  } finally {
    clearTimeout(streamTimeout);
  }
  assert(bytes === expectedBytes, `GBIF retained archive bytes ${bytes} differ from provider metadata ${expectedBytes}.`);
  renameSync(temporary, filepath);
  return { bytes, sha256: hash.digest("hex") };
}

export async function hashRetainedFile(filepath: string, budgetBytes: number, expectedBytes: number) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filepath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    assert(bytes <= budgetBytes, `Retained GBIF archive exceeds the ${budgetBytes}-byte artifact budget.`);
    hash.update(buffer);
  }
  assert(bytes === expectedBytes, `GBIF retained archive bytes ${bytes} differ from provider metadata ${expectedBytes}.`);
  return { bytes, sha256: hash.digest("hex") };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = loadNationalGbifDownloadPlan(options.planPath);
  const selection = loadNationalGbifSelection(ROOT, plan);
  const taxonomyPath = path.resolve(ROOT, plan.taxonomyCachePath);
  const taxa = resolveNationalGbifTaxa(ROOT, plan);
  const readiness = gbifCredentialReadiness(process.env);
  const planSha256 = sha256(readFileSync(options.planPath));
  const parameterHash = sha256(stableJson({
    planId: plan.planId,
    planSha256,
    taxonomyCacheSha256: plan.taxonomyCacheSha256,
    taxa,
    selectionSha256: plan.selectionEvidenceSha256,
  }));
  const acquisitionId = `${runTimestamp(options.startedAt)}__gbif-download__${parameterHash.slice(0, 12)}`;
  const acquisitionDirectory = path.join(ROOT, "src/data/research/national-acquisitions", acquisitionId);
  const preflight = {
    schemaVersion: 2,
    evaluationId: `${plan.planId}-semantic-preflight`,
    evaluatedAt: options.startedAt,
    actor: GBIF_NATIONAL_DOWNLOAD_ACTOR,
    planId: plan.planId,
    sourceId: plan.sourceId,
    semanticDryRun: true,
    networkRequestsIssued: 0,
    technicalContractStatus: "pass",
    executionReadiness: readiness.ready ? "ready" : "blocked-external-credentials",
    credentialPresence: readiness.presence,
    missingCredentialEnvironment: readiness.missing,
    credentialPresenceChecked: true,
    secretValuesPersistedOrEmitted: false,
    authenticationMethod: "HTTP Basic with GBIF username and password; values are read only for acquisition and never persisted",
    notificationAddressPersistence: "redacted",
    providerDocumentation: [plan.documentationUrl, plan.taxonomyDocumentationUrl, plan.termsUrl],
    taxonomyMode: plan.taxonomyMode,
    taxonomyQualification: "The plan intentionally retains exact legacy GBIF Backbone numeric identifiers. GBIF documents continued API support for those identifiers; a COL XR migration requires a separately verified v2 taxonomy cache.",
    predicate: {
      country: plan.countryCode,
      basisOfRecord: plan.basisOfRecord,
      occurrenceStatus: plan.occurrenceStatus,
      taxonKeys: taxa.length,
    },
    nationalScope: {
      jurisdictions: plan.nationalV1StateCodes.length,
      species: taxa.length,
      activeCounties: selection.selection.counts.activeCountyCount,
      grossPairs: selection.selection.counts.grossPairs,
      selectedNotResearchedPairs: selection.selection.counts.notResearchedPairs,
      excludedBlockedPairs: selection.selection.counts.blockedPairs,
      alreadyResearchedPairs: selection.selection.counts.alreadyResearchedPairs,
      partitioningImplemented: true,
      partitionMode: "stream interpreted and verbatim Darwin Core tables, exact registered provider state and county text only, no coordinate assignment",
    },
    semantics: {
      completeDownloadRequiredBeforePartition: true,
      createsAbsenceFromSilence: false,
      createsNotDetectedFromSilence: false,
      failedDownloadCreatesNegative: false,
      unparsedArchiveMarksScopeComplete: false,
    },
    resourceGuards: {
      compressedArchiveBytes: plan.artifactBudgetBytes,
      providerOccurrenceRows: plan.maxOccurrenceRows,
      selectedEvidenceRecords: plan.maxSelectedEvidenceRecords,
      pollingSeconds: plan.pollIntervalSeconds,
      maximumPollingMinutes: plan.maxPollMinutes,
      providerRequests: "one non-retried authenticated POST, then bounded retry-after-aware idempotent status and resumable archive GETs",
    },
    inputHashes: {
      [relativeGitPath(options.planPath)]: planSha256,
      [relativeGitPath(selection.selectionPath)]: sha256(selection.bytes),
      [plan.taxonomyCachePath]: sha256(readFileSync(taxonomyPath)),
      [plan.selectionUniversePlanPath!]: sha256(readFileSync(path.resolve(ROOT, plan.selectionUniversePlanPath!))),
      "scripts/research/national-gbif-download.ts": sha256(readFileSync(path.join(ROOT, "scripts/research/national-gbif-download.ts"))),
      "scripts/research/national-gbif-download-replay.ts": sha256(readFileSync(path.join(ROOT, "scripts/research/national-gbif-download-replay.ts"))),
      "scripts/research/run-national-gbif-download.ts": sha256(readFileSync(path.join(ROOT, "scripts/research/run-national-gbif-download.ts"))),
      "scripts/research/partition-national-gbif-download.ts": sha256(readFileSync(path.join(ROOT, "scripts/research/partition-national-gbif-download.ts"))),
    },
    deterministicAcquisitionPath: relativeGitPath(acquisitionDirectory),
    parameterHash,
  };
  if (options.semanticDryRun) {
    if (options.preflightOutput) writeJson(options.preflightOutput, preflight);
    process.stdout.write(stableJson(preflight));
    return;
  }

  assert(readiness.ready, `GBIF national acquisition is blocked: missing ${readiness.missing.join(", ")}.`);
  const initialStatus = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  assert(!initialStatus, "GBIF national acquisition requires a clean committed worktree.");
  const inputFiles = nationalGbifAcquisitionInputPaths(
    plan,
    relativeGitPath(options.planPath),
  ).map((relativePath) => path.resolve(ROOT, relativePath));
  const inputHashes = Object.fromEntries(inputFiles.map((filepath) => [relativeGitPath(filepath), committedInputHash(filepath)]));
  const codeCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  if (existsSync(acquisitionDirectory)) {
    const existing = await verifyNationalGbifAcquisition(ROOT, acquisitionDirectory);
    assert(existing.receipt.parameter_hash === parameterHash, "Existing GBIF acquisition uses different parameters.");
    process.stdout.write(stableJson(existing.receipt));
    return;
  }
  const stagingDirectory = path.join(ROOT, ".cache/research/national-gbif-acquisitions", acquisitionId);
  mkdirSync(stagingDirectory, { recursive: true });
  const progressPath = path.join(stagingDirectory, "progress.json");
  const requestDispatchPath = path.join(stagingDirectory, "request.dispatch.json");
  const redactedRequestPath = path.join(stagingDirectory, "request.redacted.json");
  const receiptPath = path.join(stagingDirectory, "receipt.json");
  const archivePath = path.join(stagingDirectory, "download.zip");
  const username = process.env.GBIF_USERNAME!.trim();
  const password = process.env.GBIF_PASSWORD!;
  const email = process.env.GBIF_EMAIL!.trim();
  const request = buildGbifDownloadRequest(plan, taxa, email);
  const redactedRequest = redactGbifDownloadRequest(request);
  if (existsSync(redactedRequestPath)) {
    assert(
      readFileSync(redactedRequestPath, "utf8") === stableJson(redactedRequest),
      "Staged GBIF redacted request differs from this run.",
    );
  } else {
    writeJson(redactedRequestPath, redactedRequest);
  }

  type StatusHistoryEntry = ReturnType<typeof publicDownloadMetadata> & { observedAt: string };
  type Progress = {
    parameterHash: string;
    startedAt: string;
    planSha256: string;
    selectionSha256: string;
    downloadKey: string;
    requestedAt: string;
    statusHistory: StatusHistoryEntry[];
    httpAttempts: GbifHttpAttempt[];
    requestResolution: "provider-response" | "operator-reconciled";
  };
  type RequestDispatch = {
    parameterHash: string;
    startedAt: string;
    planSha256: string;
    selectionSha256: string;
    dispatchedAt: string;
    requestState: "unknown";
    httpAttempts: GbifHttpAttempt[];
  };
  const validateRequestDispatch = (marker: RequestDispatch) => {
    assert(
      marker.parameterHash === parameterHash &&
        marker.startedAt === options.startedAt &&
        marker.planSha256 === planSha256 &&
        marker.selectionSha256 === sha256(selection.bytes) &&
        !Number.isNaN(Date.parse(marker.dispatchedAt)) &&
        marker.requestState === "unknown" &&
        Array.isArray(marker.httpAttempts),
      "Staged GBIF request dispatch marker does not match this acquisition identity.",
    );
  };
  let progress: Progress;
  const resumeAction = requestResumeAction(
    existsSync(progressPath),
    existsSync(requestDispatchPath),
    options.reconcileDownloadKey,
  );
  if (resumeAction === "resume") {
    progress = JSON.parse(readFileSync(progressPath, "utf8")) as Progress;
    assert(
      progress.parameterHash === parameterHash &&
        progress.startedAt === options.startedAt &&
        progress.planSha256 === planSha256 &&
        progress.selectionSha256 === sha256(selection.bytes) &&
        /^[A-Za-z0-9-]+$/u.test(progress.downloadKey) &&
        !Number.isNaN(Date.parse(progress.requestedAt)) &&
        Array.isArray(progress.statusHistory) &&
        Array.isArray(progress.httpAttempts) &&
        ["provider-response", "operator-reconciled"].includes(progress.requestResolution),
      "Staged GBIF progress does not match this acquisition identity.",
    );
    if (existsSync(requestDispatchPath)) {
      const marker = JSON.parse(readFileSync(requestDispatchPath, "utf8")) as RequestDispatch;
      validateRequestDispatch(marker);
      unlinkSync(requestDispatchPath);
    }
  } else if (resumeAction === "blocked") {
    const marker = JSON.parse(readFileSync(requestDispatchPath, "utf8")) as RequestDispatch;
    validateRequestDispatch(marker);
    throw new Error(
      "A prior GBIF download POST has an ambiguous outcome. Reconcile the provider job, then rerun with --reconcile-download-key <key>; the actor will not issue another POST.",
    );
  } else {
    let marker: RequestDispatch;
    let downloadKey: string;
    let requestResolution: Progress["requestResolution"];
    if (resumeAction === "reconcile") {
      marker = JSON.parse(readFileSync(requestDispatchPath, "utf8")) as RequestDispatch;
      validateRequestDispatch(marker);
      downloadKey = options.reconcileDownloadKey!;
      requestResolution = "operator-reconciled";
    } else {
      marker = {
        parameterHash,
        startedAt: options.startedAt,
        planSha256,
        selectionSha256: sha256(selection.bytes),
        dispatchedAt: new Date().toISOString(),
        requestState: "unknown",
        httpAttempts: [],
      };
      writeJson(requestDispatchPath, marker);
      let response: Response;
      try {
        response = await checkedFetch(plan.requestUrl, {
          method: "POST",
          headers: {
            authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
        }, {
          role: "request",
          onAttempt: (attempt) => {
            marker.httpAttempts.push(attempt);
            writeJson(requestDispatchPath, marker);
          },
        });
      } catch (error) {
        const lastAttempt = marker.httpAttempts.at(-1);
        if (lastAttempt?.status !== null && (lastAttempt?.status ?? 0) >= 400) unlinkSync(requestDispatchPath);
        throw error;
      }
      downloadKey = (await readBoundedResponse(response, "GBIF download request")).toString("utf8").trim();
      assert(/^[A-Za-z0-9-]+$/u.test(downloadKey), "GBIF returned an invalid download key.");
      requestResolution = "provider-response";
    }
    progress = {
      parameterHash,
      startedAt: options.startedAt,
      planSha256,
      selectionSha256: sha256(selection.bytes),
      downloadKey,
      requestedAt: marker.dispatchedAt,
      statusHistory: [],
      httpAttempts: marker.httpAttempts,
      requestResolution,
    };
    writeJson(progressPath, progress);
    unlinkSync(requestDispatchPath);
  }

  const recordHttpAttempt = (attempt: GbifHttpAttempt) => {
    progress.httpAttempts.push(attempt);
    writeJson(progressPath, progress);
  };

  const recordStatus = (metadata: ReturnType<typeof publicDownloadMetadata>) => {
    const previous = progress.statusHistory.at(-1);
    if (!previous || previous.status !== metadata.status || previous.modified !== metadata.modified) {
      progress.statusHistory.push({ observedAt: new Date().toISOString(), ...metadata });
      writeJson(progressPath, progress);
    }
  };

  const deadline = Date.parse(progress.requestedAt) + (plan.maxPollMinutes * 60_000);
  const readStatus = async () => {
    const remaining = deadline - Date.now();
    assert(remaining > 0, `GBIF download ${progress.downloadKey} exceeded its overall polling deadline.`);
    const response = await checkedFetch(
      `${GBIF_DOWNLOAD_STATUS_URL}/${progress.downloadKey}`,
      undefined,
      { role: "status", onAttempt: recordHttpAttempt, deadlineMs: deadline },
    );
    const bodyRemaining = deadline - Date.now();
    assert(bodyRemaining > 0, `GBIF download ${progress.downloadKey} exceeded its overall polling deadline.`);
    return publicDownloadMetadata(JSON.parse((await readBoundedResponse(
      response,
      "GBIF download status",
      4 * 1024 * 1024,
      Math.min(REQUEST_TIMEOUT_MS, bodyRemaining),
    )).toString("utf8")));
  };
  let metadata = await readStatus();
  recordStatus(metadata);
  while (downloadStatusDisposition(metadata.status) === "pending" && Date.now() < deadline) {
    await sleep(Math.min(plan.pollIntervalSeconds * 1_000, Math.max(0, deadline - Date.now())));
    if (Date.now() >= deadline) break;
    metadata = await readStatus();
    recordStatus(metadata);
  }
  const disposition = downloadStatusDisposition(metadata.status);
  assert(disposition !== "pending", `GBIF download ${progress.downloadKey} did not finish inside the polling budget.`);
  assert(disposition === "succeeded", `GBIF download ${progress.downloadKey} ended with status ${metadata.status}.`);
  assertSuccessfulDownloadMetadata(metadata, plan);
  const archive = existsSync(archivePath)
    ? await hashRetainedFile(archivePath, plan.artifactBudgetBytes, metadata.size!)
    : await retainDownload(metadata.downloadLink!, archivePath, plan.artifactBudgetBytes, metadata.size!, recordHttpAttempt);
  const finishedAt = new Date().toISOString();
  assert(
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim() === codeCommit,
    "Repository HEAD changed during GBIF acquisition.",
  );
  const finalStatus = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  assert(!finalStatus, "The worktree changed during GBIF acquisition.");
  for (const filepath of inputFiles) {
    const relative = relativeGitPath(filepath);
    assert(committedInputHash(filepath) === inputHashes[relative], `GBIF acquisition input changed at ${relative}.`);
  }
  const receipt = {
    schemaVersion: 2,
    acquisition_id: acquisitionId,
    status: "complete",
    actor_type: "adapter",
    actor_id: GBIF_NATIONAL_DOWNLOAD_ACTOR,
    source_id: plan.sourceId,
    code_commit: codeCommit,
    input_hashes: inputHashes,
    parameter_hash: parameterHash,
    parameters: {
      planId: plan.planId,
      planPath: relativeGitPath(options.planPath),
      planSha256,
      selectionPath: relativeGitPath(selection.selectionPath),
      selectionSha256: sha256(selection.bytes),
      taxonomyCachePath: plan.taxonomyCachePath,
      taxonomyCacheSha256: plan.taxonomyCacheSha256,
      artifactBudgetBytes: plan.artifactBudgetBytes,
      maxOccurrenceRows: plan.maxOccurrenceRows,
      maxSelectedEvidenceRecords: plan.maxSelectedEvidenceRecords,
      taxonCount: taxa.length,
      selectedPairCount: selection.selection.counts.notResearchedPairs,
    },
    started_at: options.startedAt,
    requested_at: progress.requestedAt,
    finished_at: finishedAt,
    download: metadata,
    status_history: progress.statusHistory,
    http_attempts: progress.httpAttempts,
    archive: {
      path: relativeGitPath(path.join(acquisitionDirectory, "download.zip")),
      ...archive,
      source_url: metadata.downloadLink,
      media_type: "application/zip",
      provider_total_records: metadata.totalRecords,
    },
    request_path: relativeGitPath(path.join(acquisitionDirectory, "request.redacted.json")),
    credentials_persisted: false,
    complete_archive_retained: true,
    partitioning_status: "ready-for-replay",
    semantics: {
      createsAbsenceFromSilence: false,
      createsNotDetectedFromSilence: false,
      failedDownloadCreatesNegative: false,
      unparsedArchiveMarksScopeComplete: false,
      coordinateCountyAssignmentAllowed: false,
    },
    errors: [],
    warnings: [
      "The plan intentionally retains exact legacy GBIF Backbone taxon identifiers. A Catalogue of Life migration requires a separately reviewed plan and taxonomy cache.",
    ],
  };
  const receiptSchema = JSON.parse(readFileSync(
    path.join(ROOT, "src/data/research/schemas/national-gbif-download-acquisition-receipt.schema.json"),
    "utf8",
  )) as Parameters<typeof z.fromJSONSchema>[0];
  z.fromJSONSchema(receiptSchema).parse(receipt);
  const receiptContents = stableJson(receipt);
  if (existsSync(receiptPath)) {
    assert(readFileSync(receiptPath, "utf8") === receiptContents, "Staged GBIF receipt differs from this completed run.");
  } else {
    writeJson(receiptPath, receipt);
  }
  assert(
    stableJson(readdirSync(stagingDirectory).sort()) ===
      stableJson(["download.zip", "progress.json", "receipt.json", "request.redacted.json"]),
    "Completed GBIF staging directory contains unexpected files.",
  );
  assert(!existsSync(acquisitionDirectory), "GBIF acquisition final directory appeared during staging.");
  mkdirSync(path.dirname(acquisitionDirectory), { recursive: true });
  renameSync(stagingDirectory, acquisitionDirectory);
  try {
    const verified = await verifyNationalGbifAcquisition(ROOT, acquisitionDirectory);
    process.stdout.write(stableJson(verified.receipt));
  } catch (error) {
    renameSync(acquisitionDirectory, stagingDirectory);
    throw error;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
