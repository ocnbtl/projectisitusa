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
  AFPE_ACQUISITION_ACTOR,
  AFPE_ARCHIVE_BYTES,
  AFPE_ARCHIVE_SHA256,
  AFPE_ARTIFACT_BUDGET_BYTES,
  AFPE_COUNTY_CSV,
  AFPE_COUNTY_CSV_BYTES,
  AFPE_COUNTY_CSV_SHA256,
  AFPE_DICTIONARY_BYTES,
  AFPE_DICTIONARY_CSV,
  AFPE_DICTIONARY_SHA256,
  AFPE_ARCHIVE_ENTRIES,
  type AfpeUpstreamRequest,
  type NationalAfpeAcquisitionReceipt,
  acquisitionInputSnapshot,
  compareText,
  inspectNationalAfpeArchive,
  relativeGitPath,
  validateNationalAfpeReceipt,
  verifyCommittedInputSnapshot,
  verifyNationalAfpeAcquisition,
} from "./national-usfs-afpe-common";
import {
  AFPE_ARCHIVE_URL,
  AFPE_ARCHIVE_VERSION,
  AFPE_DOI_URL,
  AFPE_PUBLICATION_URL,
  AFPE_SOURCE_ID,
} from "./adapters/usfs-afpe-archive";

import { sha256, stableJson } from "@/lib/research/run-files";

const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, "src/data/research");
const NATIONAL_ROOT = path.join(RESEARCH_DIR, "national-acquisitions");
const CACHE_ROOT = path.join(
  ROOT,
  ".cache/research/national-acquisitions/usfs-afpe",
);
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 180_000;

type DownloadCheckpoint = {
  schemaVersion: 1;
  archiveVersion: typeof AFPE_ARCHIVE_VERSION;
  archiveUrl: typeof AFPE_ARCHIVE_URL;
  codeCommit: string;
  inputHashes: Record<string, string>;
  parameterHash: string;
  startedAt: string;
  upstreamRequests: AfpeUpstreamRequest[];
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
  const unsupported = [...values.keys()].filter((key) =>
    !["version", "started-at"].includes(key)
  );
  assert(unsupported.length === 0, `Unsupported arguments: ${unsupported.join(", ")}.`);
  const version = values.get("version") ?? "";
  assert(version === AFPE_ARCHIVE_VERSION, "--version must be 1.0.");
  const startedAtValue = values.get("started-at") ?? "";
  assert(startedAtValue.length > 0, "--started-at is required.");
  const milliseconds = Date.parse(startedAtValue);
  assert(Number.isFinite(milliseconds), "--started-at must be an ISO date-time.");
  assert(milliseconds <= Date.now(), "--started-at cannot be in the future.");
  return {
    version: AFPE_ARCHIVE_VERSION,
    startedAt: new Date(milliseconds).toISOString(),
  };
}

function saveCheckpoint(filepath: string, checkpoint: DownloadCheckpoint) {
  mkdirSync(path.dirname(filepath), { recursive: true });
  const temporary = `${filepath}.next`;
  writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`);
  renameSync(temporary, filepath);
}

function contentLength(value: string | null) {
  if (value === null) return null;
  assert(/^[0-9]+$/.test(value), `Invalid AFPE Content-Length ${value}.`);
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed), `Unsafe AFPE Content-Length ${value}.`);
  return parsed;
}

function validateCheckpoint(
  checkpoint: DownloadCheckpoint,
  expected: Omit<
    DownloadCheckpoint,
    "upstreamRequests" | "transientFailures" | "resumedBytes" | "warnings"
  >,
) {
  assert(checkpoint.schemaVersion === 1, "Unsupported AFPE checkpoint version.");
  assert(checkpoint.archiveVersion === expected.archiveVersion, "AFPE checkpoint version is stale.");
  assert(checkpoint.archiveUrl === expected.archiveUrl, "AFPE checkpoint URL is stale.");
  assert(checkpoint.codeCommit === expected.codeCommit, "AFPE checkpoint commit is stale.");
  assert(checkpoint.parameterHash === expected.parameterHash, "AFPE checkpoint parameters are stale.");
  assert(checkpoint.startedAt === expected.startedAt, "AFPE checkpoint start time is stale.");
  assert(
    stableJson(checkpoint.inputHashes) === stableJson(expected.inputHashes),
    "AFPE checkpoint input hashes are stale.",
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const snapshot = acquisitionInputSnapshot(ROOT);
  const inputHashes = Object.fromEntries(
    [...snapshot.fileHashes.entries()]
      .map(([filepath, hash]) => [relativeGitPath(ROOT, filepath), hash] as const)
      .sort(([left], [right]) => compareText(left, right)),
  );
  const parameters: NationalAfpeAcquisitionReceipt["parameters"] = {
    archiveVersion: options.version,
    archiveUrl: AFPE_ARCHIVE_URL,
    publicationUrl: AFPE_PUBLICATION_URL,
    doiUrl: AFPE_DOI_URL,
    artifactBudgetBytes: AFPE_ARTIFACT_BUDGET_BYTES,
  };
  const parameterHash = sha256(stableJson(parameters));
  const pendingDirectory = path.join(
    CACHE_ROOT,
    options.version,
    snapshot.commit,
  );
  const checkpointFile = path.join(pendingDirectory, "checkpoint.json");
  const partialArchive = path.join(pendingDirectory, "afpe-v1.0.zip.part");
  const verifiedCache = path.join(pendingDirectory, "afpe-v1.0.verified.zip");
  const expectedCheckpoint = {
    schemaVersion: 1 as const,
    archiveVersion: options.version,
    archiveUrl: AFPE_ARCHIVE_URL,
    codeCommit: snapshot.commit,
    inputHashes,
    parameterHash,
    startedAt: options.startedAt,
  };
  let checkpoint: DownloadCheckpoint;
  if (existsSync(checkpointFile)) {
    checkpoint = JSON.parse(
      readFileSync(checkpointFile, "utf8"),
    ) as DownloadCheckpoint;
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

  let verified = false;
  if (existsSync(verifiedCache)) {
    inspectNationalAfpeArchive(verifiedCache);
    verified = true;
  }
  if (!verified && existsSync(partialArchive) && statSync(partialArchive).size === AFPE_ARCHIVE_BYTES) {
    try {
      inspectNationalAfpeArchive(partialArchive);
      renameSync(partialArchive, verifiedCache);
      verified = true;
    } catch {
      rmSync(partialArchive, { force: true });
      checkpoint.warnings.push(
        "Discarded a complete-size partial file that failed AFPE archive validation.",
      );
      saveCheckpoint(checkpointFile, checkpoint);
    }
  }

  if (!verified) {
    let lastError = "unknown AFPE archive download failure";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const rangeStart = existsSync(partialArchive)
        ? statSync(partialArchive).size
        : 0;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let requestIndex: number | null = null;
      let writeStart = rangeStart;
      try {
        const response = await fetch(AFPE_ARCHIVE_URL, {
          headers: {
            Accept: "application/zip",
            ...(rangeStart > 0 ? { Range: `bytes=${rangeStart}-` } : {}),
            "User-Agent": "Project-Isitusa/1.0 (national evidence acquisition)",
          },
          redirect: "follow",
          signal: controller.signal,
        });
        const retrievedAt = new Date().toISOString();
        const length = contentLength(response.headers.get("content-length"));
        checkpoint.upstreamRequests.push({
          url: AFPE_ARCHIVE_URL,
          response_url: response.url || AFPE_ARCHIVE_URL,
          method: "GET",
          status: response.status,
          retrieved_at: retrievedAt,
          bytes_received: 0,
          range_start: rangeStart,
          content_range: response.headers.get("content-range"),
          content_length: length,
          attempt,
          etag: response.headers.get("etag"),
          last_modified: response.headers.get("last-modified"),
        });
        requestIndex = checkpoint.upstreamRequests.length - 1;
        saveCheckpoint(checkpointFile, checkpoint);
        assert(response.ok && response.body, `AFPE archive request returned HTTP ${response.status}.`);
        const canAppend = rangeStart > 0 && response.status === 206;
        if (canAppend) {
          assert(
            (response.headers.get("content-range") ?? "").startsWith(
              `bytes ${rangeStart}-`,
            ),
            "AFPE resume response has invalid Content-Range.",
          );
        } else {
          assert(response.status === 200, `AFPE request returned HTTP ${response.status}.`);
          writeStart = 0;
          if (existsSync(partialArchive)) rmSync(partialArchive, { force: true });
        }
        if (length !== null) {
          assert(
            writeStart + length <= AFPE_ARTIFACT_BUDGET_BYTES,
            "AFPE response exceeds the artifact budget.",
          );
        }
        mkdirSync(path.dirname(partialArchive), { recursive: true });
        let responseBytes = 0;
        const remainingBudget = AFPE_ARTIFACT_BUDGET_BYTES - writeStart;
        const limiter = new Transform({
          transform(chunk, _encoding, callback) {
            responseBytes += chunk.length;
            if (responseBytes > remainingBudget) {
              callback(new Error("AFPE response exceeded the artifact budget while streaming."));
              return;
            }
            callback(null, chunk);
          },
        });
        await pipeline(
          Readable.fromWeb(response.body as never),
          limiter,
          createWriteStream(partialArchive, { flags: canAppend ? "a" : "w" }),
        );
        const bytesReceived = statSync(partialArchive).size - writeStart;
        assert(bytesReceived > 0, "AFPE response did not add bytes.");
        checkpoint.upstreamRequests[requestIndex]!.bytes_received = bytesReceived;
        if (canAppend) checkpoint.resumedBytes = Math.max(checkpoint.resumedBytes, rangeStart);
        saveCheckpoint(checkpointFile, checkpoint);
        inspectNationalAfpeArchive(partialArchive);
        renameSync(partialArchive, verifiedCache);
        verified = true;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        if (requestIndex !== null && existsSync(partialArchive)) {
          checkpoint.upstreamRequests[requestIndex]!.bytes_received = Math.max(
            0,
            statSync(partialArchive).size - writeStart,
          );
        }
        checkpoint.transientFailures += 1;
        checkpoint.warnings.push(`AFPE request attempt ${attempt} failed: ${lastError}.`);
        saveCheckpoint(checkpointFile, checkpoint);
      } finally {
        clearTimeout(timeout);
      }
      if (attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 1000 : 5000));
      }
    }
    assert(verified, `AFPE archive download failed after ${MAX_ATTEMPTS} attempts: ${lastError}.`);
  }

  const archive = readFileSync(verifiedCache);
  assert(
    archive.length === AFPE_ARCHIVE_BYTES &&
      sha256(archive) === AFPE_ARCHIVE_SHA256,
    "Verified AFPE cache changed before publication.",
  );
  const inspected = inspectNationalAfpeArchive(verifiedCache);
  const acquisitionId =
    `20240328__usfs-afpe-v1-0__${AFPE_ARCHIVE_SHA256.slice(0, 12)}`;
  const finalDirectory = path.join(NATIONAL_ROOT, acquisitionId);
  if (existsSync(finalDirectory)) {
    const existing = verifyNationalAfpeAcquisition(ROOT, finalDirectory);
    assert(
      existing.receipt.artifact.sha256 === AFPE_ARCHIVE_SHA256,
      "Existing AFPE acquisition differs.",
    );
    console.log(JSON.stringify({
      acquisitionId,
      existing: true,
      ...existing.receipt.counts,
    }, null, 2));
    return;
  }

  const finishedAt = new Date().toISOString();
  const relativeArchivePath = relativeGitPath(
    ROOT,
    path.join(finalDirectory, "artifacts", "usfs-afpe-v1.0.zip"),
  );
  const receipt: NationalAfpeAcquisitionReceipt = {
    schemaVersion: 1,
    acquisition_id: acquisitionId,
    status: "complete",
    started_at: options.startedAt,
    finished_at: finishedAt,
    actor_type: "adapter",
    actor_id: AFPE_ACQUISITION_ACTOR,
    source_id: AFPE_SOURCE_ID,
    code_commit: snapshot.commit,
    input_hashes: inputHashes,
    parameter_hash: parameterHash,
    parameters,
    upstream_requests: checkpoint.upstreamRequests,
    artifact: {
      path: relativeArchivePath,
      sha256: AFPE_ARCHIVE_SHA256,
      bytes: AFPE_ARCHIVE_BYTES,
      media_type: "application/zip",
    },
    archive: {
      title: "Alien Forest Pest Detection by Counties in US",
      version: AFPE_ARCHIVE_VERSION,
      publication_date: "2024-03-28",
      archived_at: "2024-04-29",
      source_data_last_updated: "2023-04",
      license: "CC0-1.0",
      doi: "10.4231/HWQF-V087",
      record_count: inspected.rows.length as 3221,
      pest_column_count: inspected.pestColumns.length as 93,
      entry_names: [...AFPE_ARCHIVE_ENTRIES],
      county_csv: {
        path: AFPE_COUNTY_CSV,
        sha256: AFPE_COUNTY_CSV_SHA256,
        bytes: AFPE_COUNTY_CSV_BYTES,
      },
      dictionary_csv: {
        path: AFPE_DICTIONARY_CSV,
        sha256: AFPE_DICTIONARY_SHA256,
        bytes: AFPE_DICTIONARY_BYTES,
      },
    },
    source_verification: {
      publisher:
        "Purdue University Research Repository, USDA Forest Service Northern Research Station, and Forest Health Protection",
      license_url:
        "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
      geography_policy:
        "Only exact five-digit source FIPS matching one active national-v1 county equivalent may publish. Retired, abolished, superseded, missing, and out-of-scope FIPS are never reassigned automatically.",
      taxon_policy:
        "Only the 13 hash-pinned, manually reviewed DCA-column mappings may publish. The remaining common-name-only columns are not automatically mapped.",
      positive_semantics:
        "A binary value of 1 supports recorded-present historical county detection evidence only.",
      negative_semantics:
        "A binary value of 0 may complete an applicable source screen as no-qualifying-evidence. It never supports verified absence or survey non-detection.",
      freshness_status: "stale-historical",
      snapshot_completeness:
        "The archive is complete for the published v1.0 bundle but is missing 19 current national-v1 county equivalents and is not a current pest inventory.",
      known_contradictions: [
        "PURR metadata describes 74 insects plus 15 pathogens, or 89 pests, while the published CSV and dictionary contain 93 DCA pest columns.",
        "The current online AFPE v2 application is newer and volatile, but it has no equivalent CC0 snapshot manifest and was not substituted for this archive.",
      ],
    },
    counts: {
      upstream_requests: checkpoint.upstreamRequests.length,
      artifacts: 1,
      records: 3221,
      pest_cells: 299553,
      zero_cells: inspected.zeroCells as 280805,
      one_cells: inspected.oneCells as 18748,
      transient_failures: checkpoint.transientFailures,
      resumed_bytes: checkpoint.resumedBytes,
    },
    errors: [],
    warnings: [
      ...new Set([
        ...checkpoint.warnings,
        "AFPE v1.0 underlying pest data was last updated in April 2023 and is stale for current-source readiness.",
        "Values of 0 support research-only no-qualifying outcomes, never absence or non-detection.",
        "Nineteen current national-v1 county equivalents are absent from the published archive and must remain blocked.",
      ]),
    ],
    rerun_command:
      `npm run research:acquire:usfs-afpe-national -- --version 1.0 --started-at ${options.startedAt}`,
  };
  validateNationalAfpeReceipt(ROOT, receipt);
  verifyCommittedInputSnapshot(ROOT, snapshot);
  const staging = path.join(pendingDirectory, `${acquisitionId}.final`);
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(path.join(staging, "artifacts"), { recursive: true });
  copyFileSync(verifiedCache, path.join(staging, "artifacts", "usfs-afpe-v1.0.zip"));
  writeFileSync(
    path.join(staging, "receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  mkdirSync(NATIONAL_ROOT, { recursive: true });
  renameSync(staging, finalDirectory);
  const final = verifyNationalAfpeAcquisition(ROOT, finalDirectory);
  console.log(JSON.stringify({
    acquisitionId,
    directory: relativeGitPath(ROOT, finalDirectory),
    existing: false,
    ...final.receipt.counts,
    receiptSha256: final.receiptSha256,
    archiveSha256: final.receipt.artifact.sha256,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
