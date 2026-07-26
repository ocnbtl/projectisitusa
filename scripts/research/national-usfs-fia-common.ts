import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { z } from "zod";

import {
  captureCommittedInputSnapshot,
  compareText,
  relativeGitPath,
} from "./national-usgs-nas-common";

import { sha256, stableJson } from "@/lib/research/run-files";

export {
  asNdjson,
  assertCommitAncestor,
  captureCommittedInputSnapshot,
  compareText,
  relativeGitPath,
  runFileReference,
  runTimestamp,
  verifyCommittedInputSnapshot,
} from "./national-usgs-nas-common";

export const FIA_SOURCE_ID = "usfs-fia-invasive-plants" as const;
export const FIA_ACQUISITION_ACTOR =
  "usfs-fia-national-acquisition@1.0.0" as const;
export const FIA_ADAPTER_ID = "usfs-fia-national" as const;
export const FIA_ADAPTER_VERSION = "1.0.0" as const;
export const FIA_DATAMART_URL =
  "https://apps.fs.usda.gov/fia/datamart/datamart.html" as const;
export const FIA_DATA_ROOT =
  "https://apps.fs.usda.gov/fia/datamart/CSV" as const;
export const FIA_TERMS_URL =
  "https://research.fs.usda.gov/products/dataandtools" as const;
export const FIA_ARTIFACT_BUDGET_BYTES = 134_217_728 as const;
export const FIA_ACCEPT_HEADER =
  "text/csv, application/octet-stream;q=0.9, */*;q=0.8";
export const FIA_STATE_CODES = [
  "AK",
  "AL",
  "AR",
  "AZ",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "IA",
  "ID",
  "IL",
  "IN",
  "KS",
  "KY",
  "LA",
  "MA",
  "MD",
  "ME",
  "MI",
  "MN",
  "MO",
  "MS",
  "MT",
  "NC",
  "ND",
  "NE",
  "NH",
  "NJ",
  "NM",
  "NV",
  "NY",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VA",
  "VT",
  "WA",
  "WI",
  "WV",
  "WY",
] as const;
export const FIA_REFERENCE_FILES = [
  "REF_INVASIVE_SPECIES.csv",
  "REF_PLANT_DICTIONARY.csv",
] as const;

export type FiaStateCode = (typeof FIA_STATE_CODES)[number];

export type FiaObservationRow = {
  CN?: string;
  PLT_CN?: string;
  INVYR?: string;
  STATECD?: string;
  COUNTYCD?: string;
  VEG_FLDSPCD?: string;
  VEG_SPCD?: string;
  CREATED_DATE?: string;
  MODIFIED_DATE?: string;
  [column: string]: string | undefined;
};

export type FiaPlantDictionaryRow = {
  SYMBOL?: string;
  SCIENTIFIC_NAME?: string;
  NEW_SCIENTIFIC_NAME?: string;
  [column: string]: string | undefined;
};

export type FiaInvasiveReferenceRow = {
  STATECD?: string;
  SYMBOL?: string;
  [column: string]: string | undefined;
};

export type FiaAcquisitionArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  media_type: "text/csv";
  role: "state-observations" | "invasive-reference" | "plant-dictionary";
  state_code: string | null;
  source_url: string;
  row_count: number;
  header_sha256: string;
};

export type FiaUpstreamRequest = {
  request_id: string;
  url: string;
  response_url: string;
  method: "GET";
  status: number;
  retrieved_at: string;
  bytes_received: number;
  content_length: number | null;
  attempt: number;
  etag: string | null;
  last_modified: string | null;
  artifact_path: string | null;
  expected_not_found: boolean;
};

export type NationalFiaAcquisitionReceipt = {
  schemaVersion: 1;
  acquisition_id: string;
  status: "complete";
  started_at: string;
  finished_at: string;
  actor_type: "adapter";
  actor_id: typeof FIA_ACQUISITION_ACTOR;
  source_id: typeof FIA_SOURCE_ID;
  code_commit: string;
  input_hashes: Record<string, string>;
  parameter_hash: string;
  parameters: {
    snapshotDate: string;
    dataMartUrl: typeof FIA_DATAMART_URL;
    artifactBudgetBytes: typeof FIA_ARTIFACT_BUDGET_BYTES;
    stateCodes: string[];
    referenceFiles: string[];
  };
  upstream_requests: FiaUpstreamRequest[];
  artifacts: FiaAcquisitionArtifact[];
  source_verification: {
    publisher: "USDA Forest Service Forest Inventory and Analysis";
    terms_url: typeof FIA_TERMS_URL;
    license: "No dataset-specific machine-readable license surfaced; official Forest Service data-use terms and citation retained";
    freshness_status: "current-delivery-underlying-date-undated";
    geography_policy: string;
    taxon_policy: string;
    positive_semantics: string;
    negative_semantics: string;
    snapshot_completeness: string;
    unavailable_jurisdictions: ["DC"];
    header_only_jurisdictions: string[];
    known_caveats: string[];
  };
  counts: {
    upstream_requests: number;
    artifacts: 52;
    artifact_bytes: number;
    state_rows: number;
    invasive_reference_rows: number;
    plant_dictionary_rows: number;
    transient_failures: number;
    reused_verified_files: number;
    expected_not_found: 1;
  };
  errors: [];
  warnings: string[];
  rerun_command: string;
};

export type VerifiedNationalFiaAcquisition = {
  directory: string;
  receiptPath: string;
  receiptBytes: Buffer;
  receiptSha256: string;
  receipt: NationalFiaAcquisitionReceipt;
  artifactPaths: Map<string, string>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function schemaValidator(root: string) {
  const schema = JSON.parse(
    readFileSync(
      path.join(
        root,
        "src/data/research/schemas/national-usfs-fia-acquisition-receipt.schema.json",
      ),
      "utf8",
    ),
  ) as Parameters<typeof z.fromJSONSchema>[0];
  return z.fromJSONSchema(schema);
}

function isWithin(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`)
  );
}

function listFiles(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
      const absolute = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(absolute, relative) : [relative];
    })
    .sort(compareText);
}

export function fiaStateArtifactName(stateCode: string) {
  assert(
    FIA_STATE_CODES.includes(stateCode as FiaStateCode),
    `Unsupported FIA state ${stateCode}.`,
  );
  return `${stateCode}_INVASIVE_SUBPLOT_SPP.csv`;
}

export function fiaArtifactUrl(filename: string) {
  return `${FIA_DATA_ROOT}/${filename}`;
}

export function parseFiaCsv<T extends Record<string, unknown>>(
  bytes: Buffer,
): T[] {
  return parse(bytes, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as T[];
}

export function csvHeaderSha256(bytes: Buffer) {
  const newline = bytes.indexOf(0x0a);
  const header = bytes.subarray(0, newline >= 0 ? newline + 1 : bytes.length);
  return sha256(header);
}

export function acquisitionInputSnapshot(root: string) {
  return captureCommittedInputSnapshot(root, [
    path.join(root, "src/data/research/source-registry.json"),
    path.join(
      root,
      "src/data/research/schemas/national-usfs-fia-acquisition-receipt.schema.json",
    ),
    path.join(root, "scripts/research/national-usfs-fia-common.ts"),
    path.join(root, "scripts/research/run-national-usfs-fia-acquisition.ts"),
  ]);
}

export function validateNationalFiaReceipt(
  root: string,
  receipt: NationalFiaAcquisitionReceipt,
) {
  schemaValidator(root).parse(receipt);
  assert(
    stableJson(receipt.parameters.stateCodes) ===
      stableJson([...FIA_STATE_CODES]),
    "FIA state list changed.",
  );
  assert(
    stableJson(receipt.parameters.referenceFiles) ===
      stableJson([...FIA_REFERENCE_FILES]),
    "FIA reference file list changed.",
  );
  const paths = receipt.artifacts.map((entry) => entry.path);
  assert(new Set(paths).size === paths.length, "FIA artifact paths are not unique.");
  assert(
    stableJson(receipt.artifacts) ===
      stableJson(
        [...receipt.artifacts].sort((left, right) =>
          compareText(left.path, right.path)
        ),
      ),
    "FIA artifacts are not sorted by path.",
  );
  const stateArtifacts = receipt.artifacts.filter(
    (entry) => entry.role === "state-observations",
  );
  assert(stateArtifacts.length === 50, "FIA receipt must contain 50 state files.");
  assert(
    stableJson(
      stateArtifacts.map((entry) => entry.state_code!).sort(compareText),
    ) === stableJson([...FIA_STATE_CODES]),
    "FIA state artifact coverage changed.",
  );
  assert(
    receipt.upstream_requests.filter((entry) => entry.expected_not_found).length ===
      1 &&
      receipt.upstream_requests.some(
        (entry) =>
          entry.request_id === "state-DC" &&
          entry.status === 404 &&
          entry.artifact_path === null &&
          entry.expected_not_found,
      ),
    "FIA DC unavailable-delivery request is missing.",
  );
  const expectedBytes = receipt.artifacts.reduce(
    (total, entry) => total + entry.bytes,
    0,
  );
  assert(
    receipt.counts.artifact_bytes === expectedBytes &&
      expectedBytes <= FIA_ARTIFACT_BUDGET_BYTES,
    "FIA artifact byte total is stale or over budget.",
  );
}

export function verifyNationalFiaAcquisition(
  root: string,
  directory: string,
): VerifiedNationalFiaAcquisition {
  assert(existsSync(directory), `Missing FIA acquisition ${directory}.`);
  const nationalRoot = realpathSync(
    path.join(root, "src/data/research/national-acquisitions"),
  );
  const resolvedDirectory = realpathSync(directory);
  assert(
    isWithin(nationalRoot, resolvedDirectory),
    "FIA acquisition escapes the national acquisition root.",
  );
  const receiptPath = path.join(resolvedDirectory, "receipt.json");
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(
    receiptBytes.toString("utf8"),
  ) as NationalFiaAcquisitionReceipt;
  validateNationalFiaReceipt(root, receipt);
  assert(
    path.basename(resolvedDirectory) === receipt.acquisition_id,
    "FIA acquisition directory and receipt ID differ.",
  );
  const expectedFiles = [
    "receipt.json",
    ...receipt.artifacts.map((entry) =>
      path.relative(resolvedDirectory, path.join(root, entry.path))
        .split(path.sep)
        .join("/")
    ),
  ].sort(compareText);
  assert(
    stableJson(listFiles(resolvedDirectory)) === stableJson(expectedFiles),
    "FIA acquisition file set differs from its receipt.",
  );
  const artifactPaths = new Map<string, string>();
  let stateRows = 0;
  let invasiveReferenceRows = 0;
  let plantDictionaryRows = 0;
  for (const artifact of receipt.artifacts) {
    const filepath = path.join(root, artifact.path);
    const resolved = realpathSync(filepath);
    assert(
      isWithin(resolvedDirectory, resolved),
      `FIA artifact escapes its acquisition: ${artifact.path}.`,
    );
    const bytes = readFileSync(resolved);
    assert(bytes.length === artifact.bytes, `${artifact.path} byte count changed.`);
    assert(sha256(bytes) === artifact.sha256, `${artifact.path} hash changed.`);
    assert(
      csvHeaderSha256(bytes) === artifact.header_sha256,
      `${artifact.path} header changed.`,
    );
    const rows = parseFiaCsv<Record<string, string>>(bytes);
    assert(
      rows.length === artifact.row_count,
      `${artifact.path} row count changed.`,
    );
    if (artifact.role === "state-observations") stateRows += rows.length;
    if (artifact.role === "invasive-reference") {
      invasiveReferenceRows += rows.length;
    }
    if (artifact.role === "plant-dictionary") {
      plantDictionaryRows += rows.length;
    }
    artifactPaths.set(path.basename(filepath), resolved);
  }
  assert(
    receipt.counts.state_rows === stateRows &&
      receipt.counts.invasive_reference_rows === invasiveReferenceRows &&
      receipt.counts.plant_dictionary_rows === plantDictionaryRows,
    "FIA parsed row totals differ from the receipt.",
  );
  return {
    directory: resolvedDirectory,
    receiptPath,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
    receipt,
    artifactPaths,
  };
}

export function normalizedScientificName(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

export function currentGitPath(root: string, filepath: string) {
  assert(statSync(filepath).isFile(), `Missing file ${filepath}.`);
  return relativeGitPath(root, filepath);
}
