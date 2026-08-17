import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  GBIF_DOWNLOAD_STATUS_URL,
  buildGbifDownloadRequest,
  compareText,
  downloadStatusDisposition,
  loadNationalGbifDownloadPlan,
  loadNationalGbifSelection,
  nationalGbifAcquisitionInputPaths,
  redactGbifDownloadRequest,
  resolveNationalGbifTaxa,
  sha256,
  stableJson,
} from "./national-gbif-download";
import type {
  GbifArchiveInspection,
  NationalGbifReplay,
} from "./national-gbif-download-replay";

export type NationalGbifReference = {
  schemaVersion: 1;
  acquisitionId: string;
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  partitionReceiptPath: string;
  partitionReceiptSha256: string;
  downloadKey: string;
  doi: string;
  license: string;
  archive: {
    path: string;
    sha256: string;
    bytes: number;
    providerTotalRecords: number;
  };
  sourceId: "gbif-preserved-specimens";
  stateCode: string;
  selectionId: string;
  selectionPairCount: number;
  selectionPairSha256: string;
  adapterVersion: "1.4.0";
  adapterCodeSha256: string;
  replayCodeSha256: string;
  partitionRunnerSha256: string;
  partitionMode: "provider-native-national-dwca-exact-state-county-text-no-coordinate-assignment";
  archiveInspection: GbifArchiveInspection;
  nationalReconciliation: NationalGbifReplay["reconciliation"];
  stateReconciliation: {
    stateCode: string;
    runCreated: true;
    runId: string;
    pairCount: number;
    pairSha256: string;
    candidateRecords: number;
    assertions: number;
    reviews: number;
    rejections: number;
    outcomes: number;
  };
};

export type NationalGbifAcquisitionReceipt = {
  schemaVersion: 2;
  acquisition_id: string;
  status: "complete";
  actor_type: "adapter";
  actor_id: "gbif-national-download-acquisition@2.0.0";
  source_id: "gbif-preserved-specimens";
  code_commit: string;
  input_hashes: Record<string, string>;
  parameter_hash: string;
  parameters: {
    planId: string;
    planPath: string;
    planSha256: string;
    selectionPath: string;
    selectionSha256: string;
    taxonomyCachePath: string;
    taxonomyCacheSha256: string;
    artifactBudgetBytes: number;
    maxOccurrenceRows: number;
    maxSelectedEvidenceRecords: number;
    taxonCount: number;
    selectedPairCount: number;
  };
  started_at: string;
  requested_at: string;
  finished_at: string;
  download: {
    key: string;
    status: string;
    downloadLink: string;
    doi: string;
    license: string;
    size: number;
    totalRecords: number;
    created: string | null;
    modified: string | null;
  };
  status_history: Array<Record<string, unknown>>;
  http_attempts: Array<{
    role: "request" | "status" | "archive";
    method: "GET" | "POST";
    url: string;
    attempt: number;
    status: number | null;
    observedAt: string;
    retryable: boolean;
    error: string | null;
  }>;
  archive: {
    path: string;
    bytes: number;
    sha256: string;
    source_url: string;
    media_type: "application/zip";
    provider_total_records: number;
  };
  request_path: string;
  credentials_persisted: false;
  complete_archive_retained: true;
  partitioning_status: "ready-for-replay";
  semantics: Record<string, boolean>;
  errors: [];
  warnings: string[];
};

export type VerifiedNationalGbifAcquisition = {
  directory: string;
  receiptPath: string;
  receiptBytes: Buffer;
  receiptSha256: string;
  receipt: NationalGbifAcquisitionReceipt;
  archivePath: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isWithin(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function listFilesRecursive(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursive(absolute, relative) : [relative];
  });
}

async function hashFile(filepath: string, byteBudget: number) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filepath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    assert(bytes <= byteBudget, "GBIF archive exceeds its declared artifact budget.");
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function relativeGitPath(root: string, filepath: string) {
  return path.relative(root, filepath).replaceAll("\\", "/");
}

export async function verifyNationalGbifAcquisition(
  root: string,
  directory: string,
): Promise<VerifiedNationalGbifAcquisition> {
  const absoluteRoot = path.resolve(root);
  const acquisitionRoot = path.join(absoluteRoot, "src/data/research/national-acquisitions");
  const absoluteDirectory = path.resolve(directory);
  assert(isWithin(acquisitionRoot, absoluteDirectory), "GBIF acquisition is outside its national root.");
  assert(existsSync(absoluteDirectory) && statSync(absoluteDirectory).isDirectory(), "GBIF acquisition directory is missing.");
  assert(isWithin(realpathSync(acquisitionRoot), realpathSync(absoluteDirectory)), "GBIF acquisition resolves outside its national root.");

  const receiptPath = path.join(absoluteDirectory, "receipt.json");
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as NationalGbifAcquisitionReceipt;
  const receiptSchema = JSON.parse(readFileSync(
    path.join(absoluteRoot, "src/data/research/schemas/national-gbif-download-acquisition-receipt.schema.json"),
    "utf8",
  )) as Parameters<typeof z.fromJSONSchema>[0];
  z.fromJSONSchema(receiptSchema).parse(receipt);
  assert(receipt.acquisition_id === path.basename(absoluteDirectory), "GBIF acquisition ID and directory disagree.");
  assert(Date.parse(receipt.started_at) <= Date.parse(receipt.requested_at), "GBIF acquisition was requested before it started.");
  assert(Date.parse(receipt.requested_at) <= Date.parse(receipt.finished_at), "GBIF acquisition finished before it was requested.");

  const planPath = path.resolve(absoluteRoot, receipt.parameters.planPath);
  const planBytes = readFileSync(planPath);
  assert(sha256(planBytes) === receipt.parameters.planSha256, "GBIF acquisition plan hash changed.");
  const plan = loadNationalGbifDownloadPlan(planPath);
  assert(plan.schemaVersion === 2 && plan.planId === receipt.parameters.planId, "GBIF acquisition plan identity changed.");
  assert(downloadStatusDisposition(receipt.download.status) === "succeeded", "GBIF acquisition metadata is not successful.");
  assert(receipt.download.downloadLink?.trim(), "GBIF acquisition metadata lacks a download link.");
  assert(receipt.download.doi?.trim(), "GBIF acquisition metadata lacks a DOI.");
  assert(receipt.download.license?.trim(), "GBIF acquisition metadata lacks a license.");
  assert(
    Number.isInteger(receipt.download.size) &&
      receipt.download.size > 0 &&
      receipt.download.size <= plan.artifactBudgetBytes,
    "GBIF acquisition metadata violates the archive byte budget.",
  );
  assert(
    Number.isInteger(receipt.download.totalRecords) &&
      receipt.download.totalRecords >= 0 &&
      receipt.download.totalRecords <= plan.maxOccurrenceRows!,
    "GBIF acquisition metadata violates the occurrence row budget.",
  );
  const selection = loadNationalGbifSelection(absoluteRoot, plan);
  const taxa = resolveNationalGbifTaxa(absoluteRoot, plan);
  assert(sha256(selection.bytes) === receipt.parameters.selectionSha256, "GBIF acquisition selection hash changed.");
  assert(receipt.parameters.taxonomyCacheSha256 === plan.taxonomyCacheSha256, "GBIF acquisition taxonomy hash changed.");
  assert(receipt.parameters.taxonCount === taxa.length, "GBIF acquisition taxon count changed.");
  assert(receipt.parameters.selectedPairCount === selection.selection.counts.notResearchedPairs, "GBIF acquisition pair count changed.");
  const expectedParameterHash = sha256(stableJson({
    planId: plan.planId,
    planSha256: receipt.parameters.planSha256,
    taxonomyCacheSha256: plan.taxonomyCacheSha256,
    taxa,
    selectionSha256: plan.selectionEvidenceSha256,
  }));
  assert(receipt.parameter_hash === expectedParameterHash, "GBIF acquisition parameter hash changed.");

  const requiredInputs = nationalGbifAcquisitionInputPaths(plan, receipt.parameters.planPath);
  assert(
    stableJson(Object.keys(receipt.input_hashes).sort(compareText)) === stableJson(requiredInputs),
    "GBIF acquisition input hash set is incomplete or excessive.",
  );
  for (const relativePath of requiredInputs) {
    const committed = execFileSync("git", ["show", `${receipt.code_commit}:${relativePath}`], {
      cwd: absoluteRoot,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert(sha256(committed) === receipt.input_hashes[relativePath], `GBIF acquisition input changed at ${relativePath}.`);
  }

  const archivePath = path.resolve(absoluteRoot, receipt.archive.path);
  assert(isWithin(absoluteDirectory, archivePath), "GBIF archive path escapes its acquisition.");
  assert(existsSync(archivePath) && statSync(archivePath).isFile(), "GBIF archive is missing.");
  assert(isWithin(realpathSync(absoluteDirectory), realpathSync(archivePath)), "GBIF archive resolves outside its acquisition.");
  const archive = await hashFile(archivePath, receipt.parameters.artifactBudgetBytes);
  assert(archive.bytes === receipt.archive.bytes && archive.sha256 === receipt.archive.sha256, "GBIF archive bytes or hash changed.");
  assert(receipt.archive.bytes === receipt.download.size, "GBIF archive bytes differ from provider metadata.");
  assert(receipt.archive.provider_total_records === receipt.download.totalRecords, "GBIF archive rows differ from provider metadata.");
  assert(receipt.archive.source_url === receipt.download.downloadLink, "GBIF archive URL differs from provider metadata.");

  const requestPath = path.resolve(absoluteRoot, receipt.request_path);
  assert(isWithin(absoluteDirectory, requestPath), "GBIF redacted request path escapes its acquisition.");
  const request = JSON.parse(readFileSync(requestPath, "utf8"));
  const expectedRequest = redactGbifDownloadRequest(buildGbifDownloadRequest(plan, taxa, "redacted@example.org"));
  assert(stableJson(request) === stableJson(expectedRequest), "GBIF redacted request predicate changed.");
  assert(stableJson(request).includes("[redacted]") && !stableJson(request).includes("redacted@example.org"), "GBIF request is not redacted.");

  const progress = JSON.parse(readFileSync(path.join(absoluteDirectory, "progress.json"), "utf8")) as {
    parameterHash: string;
    startedAt: string;
    planSha256: string;
    selectionSha256: string;
    downloadKey: string;
    requestedAt: string;
    statusHistory: unknown[];
    httpAttempts: unknown[];
    requestResolution: "provider-response" | "operator-reconciled";
  };
  assert(progress.parameterHash === receipt.parameter_hash, "GBIF progress parameter hash changed.");
  assert(progress.startedAt === receipt.started_at, "GBIF progress start timestamp changed.");
  assert(progress.planSha256 === receipt.parameters.planSha256, "GBIF progress plan hash changed.");
  assert(progress.selectionSha256 === receipt.parameters.selectionSha256, "GBIF progress selection hash changed.");
  assert(progress.downloadKey === receipt.download.key, "GBIF progress download key changed.");
  assert(progress.requestedAt === receipt.requested_at, "GBIF progress request timestamp changed.");
  assert(stableJson(progress.statusHistory) === stableJson(receipt.status_history), "GBIF status history changed.");
  assert(stableJson(progress.httpAttempts) === stableJson(receipt.http_attempts), "GBIF HTTP attempt log changed.");
  assert(
    ["provider-response", "operator-reconciled"].includes(progress.requestResolution),
    "GBIF request resolution is invalid.",
  );
  const lastStatus = receipt.status_history.at(-1) as ({ observedAt: string } & NationalGbifAcquisitionReceipt["download"]) | undefined;
  assert(lastStatus, "GBIF status history is empty.");
  const { observedAt: _observedAt, ...lastStatusMetadata } = lastStatus;
  assert(stableJson(lastStatusMetadata) === stableJson(receipt.download), "GBIF terminal status history differs from receipt metadata.");
  const requestAttempts = receipt.http_attempts.filter((entry) => entry.role === "request");
  const statusAttempts = receipt.http_attempts.filter((entry) => entry.role === "status");
  const archiveAttempts = receipt.http_attempts.filter((entry) => entry.role === "archive");
  const providerResponseRequest = requestAttempts.length === 1 &&
    requestAttempts[0]!.method === "POST" &&
    requestAttempts[0]!.url === plan.requestUrl &&
    requestAttempts[0]!.error === null &&
    requestAttempts[0]!.status !== null &&
    requestAttempts[0]!.status >= 200 && requestAttempts[0]!.status < 300;
  const operatorReconciledRequest = requestAttempts.length <= 1 && requestAttempts.every((entry) =>
    entry.method === "POST" && entry.url === plan.requestUrl &&
    (entry.status === null || (entry.status >= 200 && entry.status < 300))
  );
  assert(
    progress.requestResolution === "provider-response" ? providerResponseRequest : operatorReconciledRequest,
    "GBIF authenticated download request attempt is missing or inconsistent.",
  );
  const expectedStatusUrl = `${GBIF_DOWNLOAD_STATUS_URL}/${receipt.download.key}`;
  assert(
    statusAttempts.length > 0 && statusAttempts.every((entry) => entry.method === "GET" && entry.url === expectedStatusUrl) &&
      statusAttempts.some((entry) => entry.error === null && entry.status !== null && entry.status >= 200 && entry.status < 300),
    "GBIF status attempt history is missing or inconsistent.",
  );
  assert(
    archiveAttempts.length > 0 && archiveAttempts.every((entry) => entry.method === "GET" && entry.url === receipt.archive.source_url) &&
      archiveAttempts.some((entry) => entry.error === null && [200, 206].includes(entry.status ?? 0)),
    "GBIF archive retrieval attempt history is missing or inconsistent.",
  );
  let previousAttemptAt = Date.parse(receipt.started_at);
  for (const attempt of receipt.http_attempts) {
    const observedAt = Date.parse(attempt.observedAt);
    assert(
      observedAt >= previousAttemptAt && observedAt <= Date.parse(receipt.finished_at),
      "GBIF HTTP attempt chronology is inconsistent with the acquisition interval.",
    );
    previousAttemptAt = observedAt;
  }

  const actualFiles = listFilesRecursive(absoluteDirectory).sort(compareText);
  assert(
    stableJson(actualFiles) === stableJson(["download.zip", "progress.json", "receipt.json", "request.redacted.json"].sort(compareText)),
    "GBIF acquisition contains undeclared files.",
  );
  assert(relativeGitPath(absoluteDirectory, archivePath) === "download.zip", "GBIF archive filename changed.");
  return {
    directory: absoluteDirectory,
    receiptPath,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
    receipt,
    archivePath,
  };
}
