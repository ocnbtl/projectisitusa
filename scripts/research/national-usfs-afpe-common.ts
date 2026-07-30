import { execFileSync } from "node:child_process";
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
  AFPE_ADAPTER_VERSION,
  AFPE_ARCHIVE_URL,
  AFPE_ARCHIVE_VERSION,
  AFPE_DOI_URL,
  AFPE_PUBLICATION_URL,
  AFPE_SOURCE_ID,
  type AfpeCountyRow,
  type AfpeReconciliation,
  type AfpeTaxonMapping,
} from "./adapters/usfs-afpe-archive";
import {
  captureCommittedInputSnapshot,
  compareText,
  relativeGitPath,
} from "./national-usgs-nas-common";
import {
  listZipEntries,
  readZipEntry,
} from "./zip-tools";

import { sha256, stableJson } from "@/lib/research/run-files";

export {
  captureCommittedInputSnapshot,
  compareText,
  relativeGitPath,
  verifyCommittedInputSnapshot,
  assertCommitAncestor,
  asNdjson,
  runTimestamp,
  runFileReference,
} from "./national-usgs-nas-common";

export const AFPE_ACQUISITION_ACTOR =
  "usfs-afpe-national-acquisition@1.0.0" as const;
export const AFPE_ARTIFACT_BUDGET_BYTES = 16_777_216 as const;
export const AFPE_MAPPING_PATH =
  "src/data/research/source-mappings/usfs-afpe-v1.json" as const;
export const AFPE_MAPPING_VERSION = "2026-07-25.1" as const;
export const AFPE_COUNTY_CSV =
  "10_4231_HWQF-V087/AFPE_PEST_2023_counties.csv" as const;
export const AFPE_DICTIONARY_CSV =
  "10_4231_HWQF-V087/AFPE_PEST_2023_counties_data_dictionary.csv" as const;
export const AFPE_README =
  "10_4231_HWQF-V087/hubREADME.txt" as const;
export const AFPE_ARCHIVE_SHA256 =
  "ca1988d2f900a71ff5efab2b32642f757d64189c4bd0dd2dbdda98a6cf222383" as const;
export const AFPE_ARCHIVE_BYTES = 5_396_559 as const;
export const AFPE_COUNTY_CSV_SHA256 =
  "8df95f50028b4dfe3880c9cfb71ae4fbc5d691287703eb504382582d20f0f8fc" as const;
export const AFPE_COUNTY_CSV_BYTES = 1_092_467 as const;
export const AFPE_DICTIONARY_SHA256 =
  "8444b4560943fa54ea7fe20d96b131ee12fa6d9e054756448049beb8e8fa29a4" as const;
export const AFPE_DICTIONARY_BYTES = 3_137 as const;
export const AFPE_README_SHA256 =
  "978137c545a7684f657b39cec75f93738f7fa24e21325c49f1b36fd3c353fc83" as const;
export const AFPE_HEADER_SHA256 =
  "fca5c6a0f869e1911d4dcd987f35f40e8fdb3b212373bd167c5777c9c2dedd52" as const;
export const AFPE_ARCHIVE_ENTRIES = [
  AFPE_COUNTY_CSV,
  AFPE_DICTIONARY_CSV,
  "10_4231_HWQF-V087/gallery/AFPE_about-82058.PNG",
  "10_4231_HWQF-V087/gallery/AFPE_countymap-82059.PNG",
  AFPE_README,
] as const;

export type AfpeMappingFile = {
  schemaVersion: 1;
  mappingVersion: typeof AFPE_MAPPING_VERSION;
  sourceId: typeof AFPE_SOURCE_ID;
  archiveVersion: typeof AFPE_ARCHIVE_VERSION;
  reviewedAt: string;
  reviewBasis: string;
  mappings: AfpeTaxonMapping[];
};

export type AfpeUpstreamRequest = {
  url: string;
  response_url: string;
  method: "GET";
  status: number;
  retrieved_at: string;
  bytes_received: number;
  range_start: number;
  content_range: string | null;
  content_length: number | null;
  attempt: number;
  etag: string | null;
  last_modified: string | null;
};

export type NationalAfpeAcquisitionReceipt = {
  schemaVersion: 1;
  acquisition_id: string;
  status: "complete";
  started_at: string;
  finished_at: string;
  actor_type: "adapter";
  actor_id: typeof AFPE_ACQUISITION_ACTOR;
  source_id: typeof AFPE_SOURCE_ID;
  code_commit: string;
  input_hashes: Record<string, string>;
  parameter_hash: string;
  parameters: {
    archiveVersion: typeof AFPE_ARCHIVE_VERSION;
    archiveUrl: typeof AFPE_ARCHIVE_URL;
    publicationUrl: typeof AFPE_PUBLICATION_URL;
    doiUrl: typeof AFPE_DOI_URL;
    artifactBudgetBytes: typeof AFPE_ARTIFACT_BUDGET_BYTES;
  };
  upstream_requests: AfpeUpstreamRequest[];
  artifact: {
    path: string;
    sha256: typeof AFPE_ARCHIVE_SHA256;
    bytes: typeof AFPE_ARCHIVE_BYTES;
    media_type: "application/zip";
  };
  archive: {
    title: "Alien Forest Pest Detection by Counties in US";
    version: typeof AFPE_ARCHIVE_VERSION;
    publication_date: "2024-03-28";
    archived_at: "2024-04-29";
    source_data_last_updated: "2023-04";
    license: "CC0-1.0";
    doi: "10.4231/HWQF-V087";
    record_count: 3221;
    pest_column_count: 93;
    entry_names: string[];
    county_csv: {
      path: typeof AFPE_COUNTY_CSV;
      sha256: typeof AFPE_COUNTY_CSV_SHA256;
      bytes: typeof AFPE_COUNTY_CSV_BYTES;
    };
    dictionary_csv: {
      path: typeof AFPE_DICTIONARY_CSV;
      sha256: typeof AFPE_DICTIONARY_SHA256;
      bytes: typeof AFPE_DICTIONARY_BYTES;
    };
  };
  source_verification: {
    publisher: "Purdue University Research Repository, USDA Forest Service Northern Research Station, and Forest Health Protection";
    license_url: "http://creativecommons.org/publicdomain/zero/1.0/legalcode";
    geography_policy: string;
    taxon_policy: string;
    positive_semantics: string;
    negative_semantics: string;
    freshness_status: "stale-historical";
    snapshot_completeness: string;
    known_contradictions: string[];
  };
  counts: {
    upstream_requests: number;
    artifacts: 1;
    records: 3221;
    pest_cells: 299553;
    zero_cells: 280805;
    one_cells: 18748;
    transient_failures: number;
    resumed_bytes: number;
  };
  errors: [];
  warnings: string[];
  rerun_command: string;
};

export type NationalAfpeReference = {
  schemaVersion: 1;
  acquisitionId: string;
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  archiveVersion: typeof AFPE_ARCHIVE_VERSION;
  archivePath: string;
  archiveSha256: typeof AFPE_ARCHIVE_SHA256;
  archiveBytes: typeof AFPE_ARCHIVE_BYTES;
  mappingPath: typeof AFPE_MAPPING_PATH;
  mappingVersion: typeof AFPE_MAPPING_VERSION;
  mappingSha256: string;
  sourceId: typeof AFPE_SOURCE_ID;
  adapterVersion: typeof AFPE_ADAPTER_VERSION;
  adapterCodeSha256: string;
  partitionScriptSha256: string;
  stateCode: string;
  partitionMode: "exact-current-fips-binary-cell-no-crosswalk";
  selectedRowsSha256: string;
  reconciliation: AfpeReconciliation;
};

export type VerifiedNationalAfpeAcquisition = {
  directory: string;
  receiptPath: string;
  receiptBytes: Buffer;
  receiptSha256: string;
  receipt: NationalAfpeAcquisitionReceipt;
  archivePath: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function schemaValidator(root: string, filename: string) {
  const schema = JSON.parse(
    readFileSync(path.join(root, "src/data/research/schemas", filename), "utf8"),
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

function archiveEntries(archivePath: string) {
  return listZipEntries(archivePath)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort(compareText);
}

function readArchiveEntry(archivePath: string, entry: string, maxBuffer: number) {
  return readZipEntry(archivePath, entry, maxBuffer);
}

function listFilesRecursive(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursive(absolute, relative) : [relative];
  });
}

export function readAfpeMapping(root: string): AfpeMappingFile {
  const filepath = path.join(root, AFPE_MAPPING_PATH);
  const mapping = JSON.parse(readFileSync(filepath, "utf8")) as AfpeMappingFile;
  assert(mapping.schemaVersion === 1, "AFPE mapping schema version changed.");
  assert(mapping.mappingVersion === AFPE_MAPPING_VERSION, "AFPE mapping version changed.");
  assert(mapping.sourceId === AFPE_SOURCE_ID, "AFPE mapping source changed.");
  assert(mapping.archiveVersion === AFPE_ARCHIVE_VERSION, "AFPE mapping archive version changed.");
  assert(mapping.mappings.length === 13, "AFPE mapping must contain exactly 13 reviewed taxa.");
  assert(
    new Set(mapping.mappings.map((entry) => entry.columnId)).size === 13,
    "AFPE mapping contains duplicate DCA columns.",
  );
  assert(
    new Set(mapping.mappings.map((entry) => entry.speciesId)).size === 13,
    "AFPE mapping contains duplicate species.",
  );
  const sorted = [...mapping.mappings].sort((left, right) =>
    compareText(left.columnId, right.columnId)
  );
  assert(
    stableJson(mapping.mappings) === stableJson(sorted),
    "AFPE mapping is not sorted by DCA column.",
  );
  return mapping;
}

export function validateNationalAfpeReceipt(
  root: string,
  receipt: NationalAfpeAcquisitionReceipt,
) {
  schemaValidator(
    root,
    "national-usfs-afpe-acquisition-receipt.schema.json",
  ).parse(receipt);
  assert(
    stableJson(receipt.archive.entry_names) ===
      stableJson([...AFPE_ARCHIVE_ENTRIES]),
    "AFPE acquisition archive entries changed.",
  );
}

export function validateNationalAfpeReference(
  root: string,
  reference: NationalAfpeReference,
) {
  schemaValidator(root, "national-usfs-afpe-reference.schema.json").parse(reference);
  const reconciliation = reference.reconciliation;
  assert(
    reconciliation.positive_pairs +
        reconciliation.no_qualifying_evidence_pairs +
        reconciliation.blocked_pairs ===
      reconciliation.matched_current_county_rows * 13 +
        reconciliation.missing_current_counties * 13,
    "AFPE pair statuses do not reconcile to the state county scope.",
  );
  assert(
    reconciliation.assertion_pairs === reconciliation.positive_pairs,
    "AFPE assertion pairs do not reconcile to positive pairs.",
  );
}

export function inspectNationalAfpeArchive(archivePath: string) {
  assert(
    existsSync(archivePath) && statSync(archivePath).isFile(),
    `Missing AFPE archive ${archivePath}.`,
  );
  const archiveBytes = readFileSync(archivePath);
  assert(archiveBytes.length === AFPE_ARCHIVE_BYTES, "AFPE archive byte count changed.");
  assert(sha256(archiveBytes) === AFPE_ARCHIVE_SHA256, "AFPE archive hash changed.");
  const entries = archiveEntries(archivePath);
  assert(
    stableJson(entries) === stableJson([...AFPE_ARCHIVE_ENTRIES]),
    `AFPE archive entries changed: ${entries.join(", ")}.`,
  );
  const countyBytes = readArchiveEntry(
    archivePath,
    AFPE_COUNTY_CSV,
    4 * 1024 * 1024,
  );
  const dictionaryBytes = readArchiveEntry(
    archivePath,
    AFPE_DICTIONARY_CSV,
    1024 * 1024,
  );
  const readmeBytes = readArchiveEntry(archivePath, AFPE_README, 1024 * 1024);
  assert(
    countyBytes.length === AFPE_COUNTY_CSV_BYTES &&
      sha256(countyBytes) === AFPE_COUNTY_CSV_SHA256,
    "AFPE county CSV hash or byte count changed.",
  );
  assert(
    dictionaryBytes.length === AFPE_DICTIONARY_BYTES &&
      sha256(dictionaryBytes) === AFPE_DICTIONARY_SHA256,
    "AFPE dictionary hash or byte count changed.",
  );
  assert(sha256(readmeBytes) === AFPE_README_SHA256, "AFPE README hash changed.");
  const readme = readmeBytes.toString("utf8");
  for (const value of [
    "Alien Forest Pest Detection by Counties in the United States",
    "Version 1.0",
    "10.4231/HWQF-V087",
    "CC0 1.0 Universal",
    "2024-03-28",
  ]) {
    assert(readme.includes(value), `AFPE README is missing ${value}.`);
  }
  const rawHeader = countyBytes.subarray(
    0,
    countyBytes.indexOf(0x0a) + 1,
  );
  assert(sha256(rawHeader) === AFPE_HEADER_SHA256, "AFPE raw CSV header changed.");
  const rows = parse(countyBytes, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as AfpeCountyRow[];
  const dictionaryRows = parse(dictionaryBytes, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    relax_column_count: false,
  }) as Array<{ field: string; Description: string }>;
  assert(rows.length === 3221, `AFPE expected 3221 rows, found ${rows.length}.`);
  assert(
    dictionaryRows.length === 102,
    `AFPE expected 102 dictionary rows, found ${dictionaryRows.length}.`,
  );
  const columns = Object.keys(rows[0] ?? {});
  assert(columns.length === 102, `AFPE expected 102 columns, found ${columns.length}.`);
  const pestColumns = columns.filter((column) => /^DCA[0-9]+$/.test(column));
  assert(
    pestColumns.length === 93,
    `AFPE expected 93 DCA pest columns, found ${pestColumns.length}.`,
  );
  const dictionaryByField = new Map(
    dictionaryRows.map((entry) => [entry.field, entry.Description]),
  );
  assert(
    pestColumns.every((column) => dictionaryByField.has(column)),
    "AFPE dictionary does not describe every DCA column.",
  );
  let zeroCells = 0;
  let oneCells = 0;
  for (const [index, row] of rows.entries()) {
    assert(/^[0-9]{2}$/.test(row.STATE), `AFPE row ${index + 1} has invalid STATE.`);
    assert(/^[0-9]{3}$/.test(row.COUNTY), `AFPE row ${index + 1} has invalid COUNTY.`);
    assert(/^[0-9]{5}$/.test(row.FIPS), `AFPE row ${index + 1} has invalid FIPS.`);
    assert(
      row.FIPS === `${row.STATE}${row.COUNTY}`,
      `AFPE row ${index + 1} FIPS does not equal STATE plus COUNTY.`,
    );
    let detected = 0;
    for (const column of pestColumns) {
      const value = row[column];
      assert(value === "0" || value === "1", `AFPE row ${index + 1} ${column} is ${value}.`);
      if (value === "1") {
        detected += 1;
        oneCells += 1;
      } else {
        zeroCells += 1;
      }
    }
    assert(
      Number(row.Total) === detected,
      `AFPE row ${index + 1} Total does not equal its DCA detections.`,
    );
  }
  assert(zeroCells === 280805, `AFPE zero cell count changed to ${zeroCells}.`);
  assert(oneCells === 18748, `AFPE one cell count changed to ${oneCells}.`);
  return {
    rows,
    dictionaryByField,
    entries,
    pestColumns,
    zeroCells,
    oneCells,
  };
}

function verifyReceiptInputHashes(
  root: string,
  receipt: NationalAfpeAcquisitionReceipt,
) {
  const required = [
    "scripts/research/adapters/usfs-afpe-archive.ts",
    "scripts/research/national-usfs-afpe-common.ts",
    "scripts/research/run-national-usfs-afpe-acquisition.ts",
    "src/data/research/schemas/national-usfs-afpe-acquisition-receipt.schema.json",
    "src/data/research/source-mappings/usfs-afpe-v1.json",
    "src/data/research/source-registry.json",
  ].sort(compareText);
  assert(
    stableJson(Object.keys(receipt.input_hashes).sort(compareText)) ===
      stableJson(required),
    "AFPE acquisition input hash set is incomplete or excessive.",
  );
  for (const relativePath of required) {
    const committed = execFileSync(
      "git",
      ["show", `${receipt.code_commit}:${relativePath}`],
      { cwd: root },
    );
    assert(
      sha256(committed) === receipt.input_hashes[relativePath],
      `AFPE acquisition input hash changed for ${relativePath}.`,
    );
  }
}

function downloadedCoverage(requests: AfpeUpstreamRequest[]) {
  let covered = 0;
  for (const request of requests) {
    if (request.status === 200) {
      covered = request.bytes_received;
    } else if (request.status === 206) {
      assert(
        request.range_start === covered,
        `AFPE resumed request starts at ${request.range_start}, expected ${covered}.`,
      );
      assert(
        (request.content_range ?? "").startsWith(`bytes ${request.range_start}-`),
        "AFPE resumed request has invalid Content-Range.",
      );
      covered += request.bytes_received;
    }
  }
  return covered;
}

export function verifyNationalAfpeAcquisition(
  root: string,
  directory: string,
): VerifiedNationalAfpeAcquisition {
  const absoluteRoot = path.resolve(root);
  const absoluteDirectory = path.resolve(directory);
  const expectedParent = path.join(
    absoluteRoot,
    "src/data/research/national-acquisitions",
  );
  assert(isWithin(expectedParent, absoluteDirectory), "AFPE acquisition is outside its root.");
  assert(
    existsSync(absoluteDirectory) && statSync(absoluteDirectory).isDirectory(),
    "AFPE acquisition directory is missing.",
  );
  assert(
    isWithin(realpathSync(expectedParent), realpathSync(absoluteDirectory)),
    "AFPE acquisition resolves outside its root.",
  );
  const receiptPath = path.join(absoluteDirectory, "receipt.json");
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(
    receiptBytes.toString("utf8"),
  ) as NationalAfpeAcquisitionReceipt;
  validateNationalAfpeReceipt(root, receipt);
  assert(
    receipt.acquisition_id === path.basename(absoluteDirectory),
    "AFPE acquisition ID and directory disagree.",
  );
  assert(
    receipt.parameter_hash === sha256(stableJson(receipt.parameters)),
    "AFPE acquisition parameter hash changed.",
  );
  assert(
    Date.parse(receipt.started_at) <= Date.parse(receipt.finished_at),
    "AFPE acquisition finishes before it starts.",
  );
  verifyReceiptInputHashes(root, receipt);
  const archivePath = path.resolve(root, receipt.artifact.path);
  assert(isWithin(absoluteDirectory, archivePath), "AFPE archive path escapes its acquisition.");
  assert(
    existsSync(archivePath) && statSync(archivePath).isFile(),
    "AFPE archive artifact is missing.",
  );
  assert(
    isWithin(realpathSync(absoluteDirectory), realpathSync(archivePath)),
    "AFPE archive resolves outside its acquisition.",
  );
  const actualFiles = listFilesRecursive(absoluteDirectory).sort(compareText);
  const expectedFiles = [
    "receipt.json",
    relativeGitPath(absoluteDirectory, archivePath),
  ].sort(compareText);
  assert(
    stableJson(actualFiles) === stableJson(expectedFiles),
    "AFPE acquisition contains undeclared files.",
  );
  const archive = readFileSync(archivePath);
  assert(
    archive.length === receipt.artifact.bytes &&
      sha256(archive) === receipt.artifact.sha256,
    "AFPE retained archive hash or byte count changed.",
  );
  assert(
    downloadedCoverage(receipt.upstream_requests) === archive.length,
    "AFPE request bytes do not reconstruct the retained archive.",
  );
  assert(
    receipt.counts.upstream_requests === receipt.upstream_requests.length &&
      receipt.counts.records === receipt.archive.record_count,
    "AFPE acquisition receipt counts do not reconcile.",
  );
  inspectNationalAfpeArchive(archivePath);
  return {
    directory: absoluteDirectory,
    receiptPath,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
    receipt,
    archivePath,
  };
}

export function acquisitionInputSnapshot(root: string) {
  const files = [
    "scripts/research/adapters/usfs-afpe-archive.ts",
    "scripts/research/national-usfs-afpe-common.ts",
    "scripts/research/run-national-usfs-afpe-acquisition.ts",
    "src/data/research/schemas/national-usfs-afpe-acquisition-receipt.schema.json",
    AFPE_MAPPING_PATH,
    "src/data/research/source-registry.json",
  ].map((entry) => path.join(root, entry));
  return captureCommittedInputSnapshot(root, files);
}
