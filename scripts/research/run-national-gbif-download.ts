import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import {
  GBIF_DOWNLOAD_STATUS_URL,
  GBIF_NATIONAL_DOWNLOAD_ACTOR,
  buildGbifDownloadRequest,
  downloadStatusDisposition,
  gbifCredentialReadiness,
  loadNationalGbifDownloadPlan,
  publicDownloadMetadata,
  redactGbifDownloadRequest,
  resolveNationalGbifTaxa,
  sha256,
  stableJson,
} from "./national-gbif-download";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

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
  assert(semanticDryRun || !preflightOutput, "--preflight-output is only valid for a semantic dry run.");
  return {
    planPath: path.resolve(ROOT, plan),
    startedAt: new Date(startedAt).toISOString(),
    semanticDryRun,
    preflightOutput: preflightOutput ? path.resolve(ROOT, preflightOutput) : null,
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
  writeFileSync(filepath, stableJson(value), "utf8");
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function checkedFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`GBIF request failed with HTTP ${response.status} for ${url}.`);
  return response;
}

async function retainDownload(url: string, filepath: string, budgetBytes: number) {
  const response = await checkedFetch(url, { redirect: "follow" });
  assert(response.body, "GBIF download response has no body.");
  const temporary = `${filepath}.partial`;
  let bytes = 0;
  const hash = createHash("sha256");
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
  await pipeline(Readable.fromWeb(response.body as never), limiter, createWriteStream(temporary, { flags: "wx" }));
  renameSync(temporary, filepath);
  return { bytes, sha256: hash.digest("hex") };
}

async function hashRetainedFile(filepath: string, budgetBytes: number) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filepath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    assert(bytes <= budgetBytes, `Retained GBIF archive exceeds the ${budgetBytes}-byte artifact budget.`);
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = loadNationalGbifDownloadPlan(options.planPath);
  const taxonomyPath = path.resolve(ROOT, plan.taxonomyCachePath);
  const taxa = resolveNationalGbifTaxa(ROOT, plan);
  const readiness = gbifCredentialReadiness(process.env);
  const planSha256 = sha256(readFileSync(options.planPath));
  const parameterHash = sha256(stableJson({
    planId: plan.planId,
    planSha256,
    taxonomyCacheSha256: plan.taxonomyCacheSha256,
    taxa,
  }));
  const acquisitionId = `${runTimestamp(options.startedAt)}__gbif-download__${parameterHash.slice(0, 12)}`;
  const acquisitionDirectory = path.join(ROOT, "src/data/research/national-acquisitions", acquisitionId);
  const preflight = {
    schemaVersion: 1,
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
    secretsReadOrPersisted: false,
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
      partitioningImplemented: false,
      qualification: "This version proves authenticated immutable national acquisition only. Download parsing and exact county partitioning remain intentionally blocked until a real complete archive is retained.",
    },
    semantics: {
      completeDownloadRequiredBeforePartition: true,
      createsAbsenceFromSilence: false,
      createsNotDetectedFromSilence: false,
      failedDownloadCreatesNegative: false,
      unparsedArchiveMarksScopeComplete: false,
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
  committedInputHash(options.planPath);
  committedInputHash(taxonomyPath);
  mkdirSync(acquisitionDirectory, { recursive: true });
  const progressPath = path.join(acquisitionDirectory, "progress.json");
  const redactedRequestPath = path.join(acquisitionDirectory, "request.redacted.json");
  const receiptPath = path.join(acquisitionDirectory, "receipt.json");
  const archivePath = path.join(acquisitionDirectory, "download.zip");
  const username = process.env.GBIF_USERNAME!.trim();
  const password = process.env.GBIF_PASSWORD!;
  const email = process.env.GBIF_EMAIL!.trim();
  const request = buildGbifDownloadRequest(plan, taxa, email);
  writeJson(redactedRequestPath, redactGbifDownloadRequest(request));

  type StatusHistoryEntry = ReturnType<typeof publicDownloadMetadata> & { observedAt: string };
  let progress: { downloadKey: string; requestedAt: string; statusHistory: StatusHistoryEntry[] };
  if (existsSync(progressPath)) {
    progress = JSON.parse(readFileSync(progressPath, "utf8"));
  } else {
    const response = await checkedFetch(plan.requestUrl, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(request),
    });
    const downloadKey = (await response.text()).trim();
    assert(/^[A-Za-z0-9-]+$/u.test(downloadKey), "GBIF returned an invalid download key.");
    progress = { downloadKey, requestedAt: new Date().toISOString(), statusHistory: [] };
    writeJson(progressPath, progress);
  }

  const recordStatus = (metadata: ReturnType<typeof publicDownloadMetadata>) => {
    const previous = progress.statusHistory.at(-1);
    if (!previous || previous.status !== metadata.status || previous.modified !== metadata.modified) {
      progress.statusHistory.push({ observedAt: new Date().toISOString(), ...metadata });
      writeJson(progressPath, progress);
    }
  };

  const deadline = Date.now() + (plan.maxPollMinutes * 60_000);
  let metadata = publicDownloadMetadata(await (await checkedFetch(`${GBIF_DOWNLOAD_STATUS_URL}/${progress.downloadKey}`)).json());
  recordStatus(metadata);
  while (downloadStatusDisposition(metadata.status) === "pending" && Date.now() < deadline) {
    await sleep(plan.pollIntervalSeconds * 1_000);
    metadata = publicDownloadMetadata(await (await checkedFetch(`${GBIF_DOWNLOAD_STATUS_URL}/${progress.downloadKey}`)).json());
    recordStatus(metadata);
  }
  const disposition = downloadStatusDisposition(metadata.status);
  assert(disposition !== "pending", `GBIF download ${progress.downloadKey} did not finish inside the polling budget.`);
  assert(disposition === "succeeded", `GBIF download ${progress.downloadKey} ended with status ${metadata.status}.`);
  assert(metadata.downloadLink, "GBIF successful download metadata lacks a download link.");
  const archive = existsSync(archivePath)
    ? await hashRetainedFile(archivePath, plan.artifactBudgetBytes)
    : await retainDownload(metadata.downloadLink, archivePath, plan.artifactBudgetBytes);
  const finishedAt = new Date().toISOString();
  const receipt = {
    schemaVersion: 1,
    acquisitionId,
    actor: GBIF_NATIONAL_DOWNLOAD_ACTOR,
    planId: plan.planId,
    planPath: relativeGitPath(options.planPath),
    planSha256,
    taxonomyCachePath: plan.taxonomyCachePath,
    taxonomyCacheSha256: plan.taxonomyCacheSha256,
    startedAt: options.startedAt,
    requestedAt: progress.requestedAt,
    finishedAt,
    download: metadata,
    statusHistory: progress.statusHistory,
    archive: { path: relativeGitPath(archivePath), ...archive },
    taxonCount: taxa.length,
    requestPath: relativeGitPath(redactedRequestPath),
    credentialsPersisted: false,
    completeArchiveRetained: true,
    partitioningStatus: "not-started",
    semantics: {
      createsAbsenceFromSilence: false,
      createsNotDetectedFromSilence: false,
      failedDownloadCreatesNegative: false,
      unparsedArchiveMarksScopeComplete: false,
    },
  };
  writeJson(receiptPath, receipt);
  process.stdout.write(stableJson(receipt));
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
