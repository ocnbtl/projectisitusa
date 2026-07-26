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
  FIA_ACQUISITION_ACTOR,
  FIA_ARTIFACT_BUDGET_BYTES,
  FIA_DATAMART_URL,
  FIA_REFERENCE_FILES,
  FIA_SOURCE_ID,
  FIA_STATE_CODES,
  FIA_TERMS_URL,
  type FiaAcquisitionArtifact,
  type FiaUpstreamRequest,
  type NationalFiaAcquisitionReceipt,
  acquisitionInputSnapshot,
  compareText,
  csvHeaderSha256,
  fiaArtifactUrl,
  fiaStateArtifactName,
  parseFiaCsv,
  relativeGitPath,
  validateNationalFiaReceipt,
  verifyCommittedInputSnapshot,
  verifyNationalFiaAcquisition,
} from "./national-usfs-fia-common";

import { sha256, stableJson } from "@/lib/research/run-files";

const ROOT = process.cwd();
const NATIONAL_ROOT = path.join(
  ROOT,
  "src/data/research/national-acquisitions",
);
const CACHE_ROOT = path.join(
  ROOT,
  ".cache/research/national-acquisitions/usfs-fia",
);
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 180_000;

type CachedFile = {
  filename: string;
  url: string;
  sha256: string;
  bytes: number;
  rowCount: number;
  headerSha256: string;
  request: FiaUpstreamRequest;
};

type AcquisitionCheckpoint = {
  schemaVersion: 1;
  codeCommit: string;
  parameterHash: string;
  startedAt: string;
  snapshotDate: string;
  requests: FiaUpstreamRequest[];
  files: Record<string, CachedFile>;
  transientFailures: number;
  dcVerifiedNotFound: boolean;
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
    assert(
      flag?.startsWith("--") && value && !value.startsWith("--"),
      `Invalid argument sequence near ${flag ?? "end of arguments"}.`,
    );
    const key = flag.slice(2);
    assert(!values.has(key), `Duplicate argument --${key}.`);
    values.set(key, value);
  }
  const unsupported = [...values.keys()].filter(
    (key) => !["snapshot-date", "started-at"].includes(key),
  );
  assert(
    unsupported.length === 0,
    `Unsupported arguments: ${unsupported.join(", ")}.`,
  );
  const snapshotDate = values.get("snapshot-date") ?? "";
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) &&
      Number.isFinite(Date.parse(`${snapshotDate}T00:00:00Z`)),
    "--snapshot-date must be YYYY-MM-DD.",
  );
  const startedAtValue = values.get("started-at") ?? "";
  const startedMilliseconds = Date.parse(startedAtValue);
  assert(
    Number.isFinite(startedMilliseconds),
    "--started-at must be an ISO date-time.",
  );
  assert(
    startedMilliseconds <= Date.now(),
    "--started-at cannot be in the future.",
  );
  assert(
    snapshotDate === new Date(startedMilliseconds).toISOString().slice(0, 10),
    "--snapshot-date must equal the UTC date of --started-at.",
  );
  return {
    snapshotDate,
    startedAt: new Date(startedMilliseconds).toISOString(),
  };
}

function saveCheckpoint(filepath: string, checkpoint: AcquisitionCheckpoint) {
  mkdirSync(path.dirname(filepath), { recursive: true });
  const temporary = `${filepath}.next`;
  writeFileSync(temporary, `${JSON.stringify(checkpoint, null, 2)}\n`);
  renameSync(temporary, filepath);
}

function contentLength(value: string | null) {
  if (value === null) return null;
  assert(/^[0-9]+$/.test(value), `Invalid FIA Content-Length ${value}.`);
  const parsed = Number(value);
  assert(Number.isSafeInteger(parsed), `Unsafe FIA Content-Length ${value}.`);
  return parsed;
}

function validateCsv(filename: string, bytes: Buffer) {
  const header = bytes
    .subarray(0, Math.max(0, bytes.indexOf(0x0a)))
    .toString("utf8")
    .replace(/^\uFEFF/, "");
  const columns = header.split(",").map((value) => value.replace(/^"|"$/g, ""));
  const required = filename === "REF_PLANT_DICTIONARY.csv"
    ? ["SYMBOL", "SCIENTIFIC_NAME"]
    : filename === "REF_INVASIVE_SPECIES.csv"
      ? ["STATECD", "SYMBOL"]
      : ["CN", "STATECD", "COUNTYCD", "VEG_FLDSPCD", "VEG_SPCD"];
  for (const column of required) {
    assert(columns.includes(column), `${filename} is missing ${column}.`);
  }
  const rows = parseFiaCsv<Record<string, string>>(bytes);
  return {
    rowCount: rows.length,
    headerSha256: csvHeaderSha256(bytes),
  };
}

async function acquireFile(input: {
  filename: string;
  checkpoint: AcquisitionCheckpoint;
  checkpointPath: string;
  cacheDirectory: string;
}) {
  const { filename, checkpoint, checkpointPath, cacheDirectory } = input;
  const url = fiaArtifactUrl(filename);
  const verifiedPath = path.join(cacheDirectory, `${filename}.verified`);
  const partialPath = path.join(cacheDirectory, `${filename}.part`);
  const cached = checkpoint.files[filename];
  if (existsSync(verifiedPath)) {
    assert(cached, `Verified FIA cache ${filename} lacks checkpoint lineage.`);
    const bytes = readFileSync(verifiedPath);
    assert(
      bytes.length === cached.bytes && sha256(bytes) === cached.sha256,
      `Verified FIA cache ${filename} changed.`,
    );
    const inspected = validateCsv(filename, bytes);
    assert(
      inspected.rowCount === cached.rowCount &&
        inspected.headerSha256 === cached.headerSha256,
      `Verified FIA cache ${filename} no longer parses identically.`,
    );
    return { ...cached, reused: true, verifiedPath };
  }
  if (cached && existsSync(partialPath)) {
    const bytes = readFileSync(partialPath);
    if (bytes.length === cached.bytes && sha256(bytes) === cached.sha256) {
      validateCsv(filename, bytes);
      renameSync(partialPath, verifiedPath);
      return { ...cached, reused: true, verifiedPath };
    }
  }
  let lastError = "unknown FIA download failure";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const rangeStart = existsSync(partialPath) ? statSync(partialPath).size : 0;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let request: FiaUpstreamRequest | null = null;
    let writeStart = rangeStart;
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "text/csv",
          ...(rangeStart > 0 ? { Range: `bytes=${rangeStart}-` } : {}),
          "User-Agent": "Project-Isitusa/1.0 (national evidence acquisition)",
        },
        redirect: "follow",
        signal: controller.signal,
      });
      const length = contentLength(response.headers.get("content-length"));
      request = {
        request_id: `artifact-${filename}`,
        url,
        response_url: response.url || url,
        method: "GET",
        status: response.status,
        retrieved_at: new Date().toISOString(),
        bytes_received: 0,
        content_length: length,
        attempt,
        etag: response.headers.get("etag"),
        last_modified: response.headers.get("last-modified"),
        artifact_path: null,
        expected_not_found: false,
      };
      checkpoint.requests.push(request);
      saveCheckpoint(checkpointPath, checkpoint);
      assert(
        response.ok && response.body,
        `${filename} returned HTTP ${response.status}.`,
      );
      const canAppend = rangeStart > 0 && response.status === 206;
      if (canAppend) {
        assert(
          (response.headers.get("content-range") ?? "").startsWith(
            `bytes ${rangeStart}-`,
          ),
          `${filename} resume response has invalid Content-Range.`,
        );
      } else {
        assert(response.status === 200, `${filename} returned HTTP ${response.status}.`);
        writeStart = 0;
        rmSync(partialPath, { force: true });
      }
      const existingVerifiedBytes = Object.values(checkpoint.files).reduce(
        (total, entry) => total + entry.bytes,
        0,
      );
      if (length !== null) {
        assert(
          existingVerifiedBytes + writeStart + length <=
            FIA_ARTIFACT_BUDGET_BYTES,
          `${filename} would exceed the FIA artifact budget.`,
        );
      }
      mkdirSync(cacheDirectory, { recursive: true });
      let responseBytes = 0;
      const limiter = new Transform({
        transform(chunk, _encoding, callback) {
          responseBytes += chunk.length;
          if (
            existingVerifiedBytes + writeStart + responseBytes >
            FIA_ARTIFACT_BUDGET_BYTES
          ) {
            callback(new Error("FIA acquisition exceeded its artifact budget."));
            return;
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(response.body as never),
        limiter,
        createWriteStream(partialPath, { flags: canAppend ? "a" : "w" }),
      );
      request.bytes_received = responseBytes;
      const bytes = readFileSync(partialPath);
      const inspected = validateCsv(filename, bytes);
      const file: CachedFile = {
        filename,
        url,
        sha256: sha256(bytes),
        bytes: bytes.length,
        rowCount: inspected.rowCount,
        headerSha256: inspected.headerSha256,
        request,
      };
      checkpoint.files[filename] = file;
      saveCheckpoint(checkpointPath, checkpoint);
      renameSync(partialPath, verifiedPath);
      return { ...file, reused: false, verifiedPath };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (request && existsSync(partialPath)) {
        request.bytes_received = Math.max(
          0,
          statSync(partialPath).size - writeStart,
        );
      }
      checkpoint.transientFailures += 1;
      checkpoint.warnings.push(
        `${filename} request attempt ${attempt} failed: ${lastError}.`,
      );
      saveCheckpoint(checkpointPath, checkpoint);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error(
    `${filename} failed after ${MAX_ATTEMPTS} attempts: ${lastError}.`,
  );
}

async function verifyDcNotApplicable(
  checkpoint: AcquisitionCheckpoint,
  checkpointPath: string,
) {
  if (checkpoint.dcVerifiedNotFound) return;
  const url = fiaArtifactUrl("DC_INVASIVE_SUBPLOT_SPP.csv");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/csv",
        "User-Agent": "Project-Isitusa/1.0 (national evidence acquisition)",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    const request: FiaUpstreamRequest = {
      request_id: "state-DC",
      url,
      response_url: response.url || url,
      method: "GET",
      status: response.status,
      retrieved_at: new Date().toISOString(),
      bytes_received: 0,
      content_length: contentLength(response.headers.get("content-length")),
      attempt: 1,
      etag: response.headers.get("etag"),
      last_modified: response.headers.get("last-modified"),
      artifact_path: null,
      expected_not_found: true,
    };
    checkpoint.requests.push(request);
    assert(
      response.status === 404,
      `Expected the FIA DC state file to be unavailable, received HTTP ${response.status}.`,
    );
    checkpoint.dcVerifiedNotFound = true;
    saveCheckpoint(checkpointPath, checkpoint);
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const snapshot = acquisitionInputSnapshot(ROOT);
  const inputHashes = Object.fromEntries(
    [...snapshot.fileHashes.entries()]
      .map(([filepath, hash]) => [relativeGitPath(ROOT, filepath), hash] as const)
      .sort(([left], [right]) => compareText(left, right)),
  );
  const parameters: NationalFiaAcquisitionReceipt["parameters"] = {
    snapshotDate: options.snapshotDate,
    dataMartUrl: FIA_DATAMART_URL,
    artifactBudgetBytes: FIA_ARTIFACT_BUDGET_BYTES,
    stateCodes: [...FIA_STATE_CODES],
    referenceFiles: [...FIA_REFERENCE_FILES],
  };
  const parameterHash = sha256(stableJson(parameters));
  const cacheDirectory = path.join(
    CACHE_ROOT,
    options.snapshotDate,
    snapshot.commit,
  );
  const checkpointPath = path.join(cacheDirectory, "checkpoint.json");
  let checkpoint: AcquisitionCheckpoint;
  if (existsSync(checkpointPath)) {
    checkpoint = JSON.parse(
      readFileSync(checkpointPath, "utf8"),
    ) as AcquisitionCheckpoint;
    assert(checkpoint.schemaVersion === 1, "Unsupported FIA checkpoint.");
    assert(checkpoint.codeCommit === snapshot.commit, "FIA checkpoint commit is stale.");
    assert(
      checkpoint.parameterHash === parameterHash,
      "FIA checkpoint parameters are stale.",
    );
    assert(
      checkpoint.startedAt === options.startedAt,
      "FIA checkpoint start time is stale.",
    );
  } else {
    checkpoint = {
      schemaVersion: 1,
      codeCommit: snapshot.commit,
      parameterHash,
      startedAt: options.startedAt,
      snapshotDate: options.snapshotDate,
      requests: [],
      files: {},
      transientFailures: 0,
      dcVerifiedNotFound: false,
      warnings: [],
    };
    saveCheckpoint(checkpointPath, checkpoint);
  }

  const filenames = [
    ...FIA_STATE_CODES.map(fiaStateArtifactName),
    ...FIA_REFERENCE_FILES,
  ].sort(compareText);
  const files: Array<
    CachedFile & { reused: boolean; verifiedPath: string }
  > = [];
  for (const filename of filenames) {
    files.push(
      await acquireFile({
        filename,
        checkpoint,
        checkpointPath,
        cacheDirectory,
      }),
    );
  }
  await verifyDcNotApplicable(checkpoint, checkpointPath);

  const manifestHash = sha256(
    stableJson(
      files.map((entry) => ({
        filename: entry.filename,
        sha256: entry.sha256,
        bytes: entry.bytes,
      })),
    ),
  );
  const acquisitionId =
    `${options.snapshotDate.replaceAll("-", "")}__usfs-fia-invasive-plants__${manifestHash.slice(0, 12)}`;
  const finalDirectory = path.join(NATIONAL_ROOT, acquisitionId);
  if (existsSync(finalDirectory)) {
    const existing = verifyNationalFiaAcquisition(ROOT, finalDirectory);
    console.log(
      JSON.stringify(
        {
          acquisitionId,
          existing: true,
          ...existing.receipt.counts,
        },
        null,
        2,
      ),
    );
    return;
  }

  const artifacts: FiaAcquisitionArtifact[] = files
    .map((entry) => {
      const stateMatch = /^([A-Z]{2})_INVASIVE_SUBPLOT_SPP\.csv$/.exec(
        entry.filename,
      );
      const role: FiaAcquisitionArtifact["role"] = stateMatch
        ? "state-observations"
        : entry.filename === "REF_INVASIVE_SPECIES.csv"
          ? "invasive-reference"
          : "plant-dictionary";
      return {
        path: relativeGitPath(
          ROOT,
          path.join(finalDirectory, "artifacts", entry.filename),
        ),
        sha256: entry.sha256,
        bytes: entry.bytes,
        media_type: "text/csv" as const,
        role,
        state_code: stateMatch?.[1] ?? null,
        source_url: entry.url,
        row_count: entry.rowCount,
        header_sha256: entry.headerSha256,
      };
    })
    .sort((left, right) => compareText(left.path, right.path));
  for (const request of checkpoint.requests) {
    const filename = request.request_id.replace(/^artifact-/, "");
    const artifact = artifacts.find((entry) =>
      entry.path.endsWith(`/artifacts/${filename}`)
    );
    if (artifact) request.artifact_path = artifact.path;
  }
  const headerOnly = artifacts
    .filter(
      (entry) =>
        entry.role === "state-observations" && entry.row_count === 0,
    )
    .map((entry) => entry.state_code!)
    .sort(compareText);
  const stateRows = artifacts
    .filter((entry) => entry.role === "state-observations")
    .reduce((total, entry) => total + entry.row_count, 0);
  const invasiveReferenceRows = artifacts.find(
    (entry) => entry.role === "invasive-reference",
  )!.row_count;
  const plantDictionaryRows = artifacts.find(
    (entry) => entry.role === "plant-dictionary",
  )!.row_count;
  const receipt: NationalFiaAcquisitionReceipt = {
    schemaVersion: 1,
    acquisition_id: acquisitionId,
    status: "complete",
    started_at: options.startedAt,
    finished_at: new Date().toISOString(),
    actor_type: "adapter",
    actor_id: FIA_ACQUISITION_ACTOR,
    source_id: FIA_SOURCE_ID,
    code_commit: snapshot.commit,
    input_hashes: inputHashes,
    parameter_hash: parameterHash,
    parameters,
    upstream_requests: checkpoint.requests,
    artifacts,
    source_verification: {
      publisher: "USDA Forest Service Forest Inventory and Analysis",
      terms_url: FIA_TERMS_URL,
      license:
        "No dataset-specific machine-readable license surfaced; official Forest Service data-use terms and citation retained",
      freshness_status: "current-delivery-underlying-date-undated",
      geography_policy:
        "Only explicit STATECD plus zero-padded COUNTYCD matching one active county equivalent may publish. Coordinates and automatic retired-geography crosswalks are prohibited.",
      taxon_policy:
        "Only one-to-one exact catalog scientific-name matches from a state-listed invasive symbol through the retained FIA plant dictionary may publish.",
      positive_semantics:
        "A retained invasive subplot species row supports recorded-present evidence at its explicit county only.",
      negative_semantics:
        "A complete file screen with no qualifying row supports researched-unresolved only. It never supports verified absence or survey non-detection.",
      snapshot_completeness:
        "All 50 available state invasive subplot species files and both shared reference tables were acquired once. The guessed DC delivery URL returned 404, so DC remains unavailable and blocked for this delivery.",
      unavailable_jurisdictions: ["DC"],
      header_only_jurisdictions: headerOnly,
      known_caveats: [
        "FIA is a sampled forest inventory. Missing detection rows do not establish county absence.",
        "The acquisition confirms current delivery retrieval, but the underlying observation freshness is not summarized by one source-wide date.",
        "Alaska survey units and changing county-equivalent boundaries require exact current FIPS validation without inferred crosswalks.",
        "Header-only state files remain complete source artifacts but do not support absence or non-detection.",
      ],
    },
    counts: {
      upstream_requests: checkpoint.requests.length,
      artifacts: 52,
      artifact_bytes: artifacts.reduce(
        (total, entry) => total + entry.bytes,
        0,
      ),
      state_rows: stateRows,
      invasive_reference_rows: invasiveReferenceRows,
      plant_dictionary_rows: plantDictionaryRows,
      transient_failures: checkpoint.transientFailures,
      reused_verified_files: files.filter((entry) => entry.reused).length,
      expected_not_found: 1,
    },
    errors: [],
    warnings: [
      ...new Set([
        ...checkpoint.warnings,
        "Source silence creates researched-unresolved status only for documented applicable source screens.",
        "No FIA file row may create verified absence or survey non-detection.",
      ]),
    ],
    rerun_command:
      `npm run research:acquire:usfs-fia-national -- --snapshot-date ${options.snapshotDate} --started-at ${options.startedAt}`,
  };
  validateNationalFiaReceipt(ROOT, receipt);
  verifyCommittedInputSnapshot(ROOT, snapshot);
  const stagingDirectory = path.join(
    cacheDirectory,
    `${acquisitionId}.final`,
  );
  rmSync(stagingDirectory, { recursive: true, force: true });
  mkdirSync(path.join(stagingDirectory, "artifacts"), { recursive: true });
  for (const file of files) {
    copyFileSync(
      file.verifiedPath,
      path.join(stagingDirectory, "artifacts", file.filename),
    );
  }
  writeFileSync(
    path.join(stagingDirectory, "receipt.json"),
    `${JSON.stringify(receipt, null, 2)}\n`,
  );
  mkdirSync(NATIONAL_ROOT, { recursive: true });
  renameSync(stagingDirectory, finalDirectory);
  const verified = verifyNationalFiaAcquisition(ROOT, finalDirectory);
  console.log(
    JSON.stringify(
      {
        acquisitionId,
        directory: relativeGitPath(ROOT, finalDirectory),
        existing: false,
        ...verified.receipt.counts,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
