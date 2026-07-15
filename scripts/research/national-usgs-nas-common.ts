import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import path from "node:path";

import { parse } from "csv-parse";
import { z } from "zod";

import type { ResearchRunFileReference } from "@/lib/research/types";
import { sha256, stableJson } from "@/lib/research/run-files";

export const USGS_NAS_SOURCE_ID = "usgs-nas" as const;
export const USGS_NAS_ACQUISITION_ACTOR = "usgs-nas-national-acquisition@1.0.0" as const;
export const USGS_NAS_ADAPTER_ID = "usgs-nas-archive" as const;
export const USGS_NAS_ADAPTER_VERSION = "1.0.0" as const;
export const USGS_NAS_RESOURCE_URL = "https://nas.er.usgs.gov/ipt/resource?r=nas" as const;
export const USGS_NAS_ARTIFACT_BUDGET_BYTES = 67_108_864 as const;
export const USGS_NAS_SELECTED_RECORD_BUDGET_PER_SCREEN = 50_000 as const;
export const USGS_NAS_SELECTED_RECORD_BUDGET_PER_PARTITION = 250_000 as const;
export const USGS_NAS_ACCEPTED_OCCURRENCE_STATUSES = ["collected", "established"] as const;
export const USGS_NAS_ARCHIVE_ENTRIES = ["eml.xml", "meta.xml", "occurrence.txt"] as const;
export const USGS_NAS_OCCURRENCE_HEADER = [
  "id",
  "modified",
  "language",
  "bibliographicCitation",
  "references",
  "collectionID",
  "basisOfRecord",
  "dynamicProperties",
  "occurrenceID",
  "catalogNumber",
  "establishmentMeans",
  "occurrenceStatus",
  "disposition",
  "associatedReferences",
  "samplingProtocol",
  "eventDate",
  "countryCode",
  "stateProvince",
  "county",
  "locality",
  "decimalLatitude",
  "decimalLongitude",
  "geodeticDatum",
  "georeferenceProtocol",
  "georeferenceRemarks",
  "taxonID",
  "scientificName",
  "kingdom",
  "order",
  "family",
  "genus",
  "specificEpithet",
  "scientificNameAuthorship",
  "vernacularName",
] as const;

export type NasArchiveOccurrence = Record<(typeof USGS_NAS_OCCURRENCE_HEADER)[number], string>;

export type NationalNasAcquisitionReceipt = {
  schemaVersion: 1;
  acquisition_id: string;
  status: "complete";
  started_at: string;
  finished_at: string;
  actor_type: "adapter";
  actor_id: typeof USGS_NAS_ACQUISITION_ACTOR;
  source_id: typeof USGS_NAS_SOURCE_ID;
  code_commit: string;
  input_hashes: Record<string, string>;
  parameter_hash: string;
  parameters: {
    archiveVersion: string;
    archiveUrl: string;
    resourceUrl: typeof USGS_NAS_RESOURCE_URL;
    artifactBudgetBytes: typeof USGS_NAS_ARTIFACT_BUDGET_BYTES;
  };
  upstream_requests: Array<{
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
  }>;
  artifact: {
    path: string;
    sha256: string;
    bytes: number;
    media_type: "application/zip";
  };
  archive: {
    title: "USGS Nonindigenous Aquatic Species database";
    publication_date: string;
    license: "CC0-1.0";
    record_count: number;
    core_file: "occurrence.txt";
    header_sha256: string;
    entry_names: ["eml.xml", "meta.xml", "occurrence.txt"];
  };
  counts: {
    upstream_requests: number;
    artifacts: 1;
    records: number;
    transient_failures: number;
    resumed_bytes: number;
  };
  errors: [];
  warnings: string[];
  rerun_command: string;
};

export type NationalNasPlan = {
  schemaVersion: 1;
  planId: string;
  sourceId: typeof USGS_NAS_SOURCE_ID;
  archiveVersion: string;
  acceptedOccurrenceStatuses: string[];
  screens: Array<{
    stateCode: string;
    speciesId: string;
    scientificName: string;
  }>;
  notes: string[];
};

export type NationalNasReconciliation = {
  selected_records: number;
  accepted_records: number;
  rejected_candidate_records: number;
  assertion_pairs: number;
  rejection_events: number;
  duplicate_record_ids: number;
  blank_status_records: number;
  unsupported_status_records: number;
  missing_geography_records: number;
  retired_geography_records: number;
  unknown_or_ambiguous_geography_records: number;
  invalid_identity_records: number;
  blocking_candidate_records: number;
  blocked_outcome_pairs: number;
};

export type NationalNasReference = {
  schemaVersion: 1;
  acquisitionId: string;
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  archiveVersion: string;
  archivePath: string;
  archiveSha256: string;
  archiveBytes: number;
  planPath: string;
  planSha256: string;
  sourceId: typeof USGS_NAS_SOURCE_ID;
  adapterVersion: typeof USGS_NAS_ADAPTER_VERSION;
  adapterCodeSha256: string;
  partitionScriptSha256: string;
  stateCode: string;
  speciesId: string;
  scientificName: string;
  partitionMode: "exact-state-county-name-and-status-no-coordinate-fallback";
  selectedRowsSha256: string;
  reconciliation: NationalNasReconciliation;
};

export type CommittedInputSnapshot = {
  commit: string;
  fileHashes: Map<string, string>;
};

export type VerifiedNationalNasAcquisition = {
  directory: string;
  receiptPath: string;
  receiptBytes: Buffer;
  receiptSha256: string;
  receipt: NationalNasAcquisitionReceipt;
  archivePath: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isWithin(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (
    !path.isAbsolute(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`)
  );
}

export function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function relativeGitPath(root: string, filepath: string) {
  return path.relative(root, filepath).split(path.sep).join("/");
}

export function runTimestamp(value: string) {
  return value.replace(/[-:]/g, "").replace(".", "");
}

export function asNdjson(values: unknown[]) {
  return values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "\n";
}

export function runFileReference(
  relativePath: string,
  contents: string,
  mediaType: string,
): ResearchRunFileReference {
  return {
    path: relativePath,
    sha256: sha256(contents),
    bytes: Buffer.byteLength(contents),
    media_type: mediaType,
  };
}

export function canonicalNasArchiveUrl(version: string) {
  assert(/^[0-9]+\.[0-9]+$/.test(version), `Invalid USGS NAS archive version ${version}.`);
  return `https://nas.er.usgs.gov/ipt/archive.do?r=nas&v=${version}`;
}

export function validateNationalNasCheckpointIdentity(input: {
  checkpointVersion: string;
  checkpointUrl: string;
  checkpointCommit: string;
  checkpointInputHashes: Record<string, string>;
  checkpointParameterHash: string;
  checkpointStartedAt: string;
  expectedVersion: string;
  expectedUrl: string;
  expectedCommit: string;
  expectedInputHashes: Record<string, string>;
  expectedParameterHash: string;
  expectedStartedAt: string;
}) {
  assert(input.checkpointVersion === input.expectedVersion, "USGS NAS checkpoint version is stale.");
  assert(input.checkpointUrl === input.expectedUrl, "USGS NAS checkpoint URL is stale.");
  assert(input.checkpointCommit === input.expectedCommit, "USGS NAS checkpoint base commit is stale.");
  assert(input.checkpointParameterHash === input.expectedParameterHash, "USGS NAS checkpoint parameters are stale.");
  assert(input.checkpointStartedAt === input.expectedStartedAt, "USGS NAS checkpoint start time is stale.");
  assert(
    stableJson(input.checkpointInputHashes) === stableJson(input.expectedInputHashes),
    "USGS NAS checkpoint input hashes are stale.",
  );
}

export function validateNationalNasResumeResponse(input: {
  rangeStart: number;
  status: number;
  contentRange: string | null;
}) {
  assert(Number.isInteger(input.rangeStart) && input.rangeStart >= 0, "Invalid USGS NAS resume offset.");
  if (input.rangeStart === 0) {
    assert(input.status === 200, `Initial USGS NAS request returned HTTP ${input.status}.`);
    return { append: false, writeStart: 0 };
  }
  if (input.status === 206) {
    assert(
      (input.contentRange ?? "").startsWith(`bytes ${input.rangeStart}-`),
      `USGS NAS resume response has invalid Content-Range ${input.contentRange ?? "missing"}.`,
    );
    return { append: true, writeStart: input.rangeStart };
  }
  assert(input.status === 200, `USGS NAS resume request returned HTTP ${input.status}.`);
  return { append: false, writeStart: 0 };
}

export function validateNationalNasResponseBudget(input: {
  writeStart: number;
  contentLength: number | null;
  artifactBudgetBytes: number;
}) {
  assert(
    Number.isInteger(input.writeStart) && input.writeStart >= 0,
    "Invalid USGS NAS response write offset.",
  );
  assert(
    Number.isInteger(input.artifactBudgetBytes) && input.artifactBudgetBytes > 0,
    "Invalid USGS NAS artifact budget.",
  );
  if (input.contentLength !== null) {
    assert(
      Number.isInteger(input.contentLength) && input.contentLength >= 0,
      "Invalid USGS NAS response Content-Length.",
    );
    assert(
      input.writeStart + input.contentLength <= input.artifactBudgetBytes,
      "USGS NAS response exceeds the artifact budget.",
    );
  }
  return input.artifactBudgetBytes - input.writeStart;
}

export function nationalNasDownloadedCoverage(
  requests: NationalNasAcquisitionReceipt["upstream_requests"],
) {
  let coveredBytes = 0;
  for (const request of requests) {
    if (request.status === 200) {
      coveredBytes = request.bytes_received;
      continue;
    }
    if (request.status === 206) {
      assert(
        request.range_start === coveredBytes,
        `USGS NAS request coverage breaks at byte ${request.range_start}; expected ${coveredBytes}.`,
      );
      assert(
        (request.content_range ?? "").startsWith(`bytes ${request.range_start}-`),
        "USGS NAS receipt contains an invalid resumed Content-Range.",
      );
      coveredBytes += request.bytes_received;
    }
  }
  return coveredBytes;
}

export function canonicalBinomial(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

export function nationalNasRecordAppliesToScreen(input: {
  recordStateProvince: string;
  recordScientificName: string;
  screenStateCode: string;
  screenScientificName: string;
}) {
  return canonicalBinomial(input.recordScientificName) ===
      canonicalBinomial(input.screenScientificName) &&
    (!input.recordStateProvince.trim() || input.recordStateProvince === input.screenStateCode);
}

function schemaValidator(root: string, filename: string) {
  const schema = JSON.parse(
    readFileSync(path.join(root, "src/data/research/schemas", filename), "utf8"),
  ) as Parameters<typeof z.fromJSONSchema>[0];
  return z.fromJSONSchema(schema);
}

export function validateNationalNasReceipt(root: string, receipt: NationalNasAcquisitionReceipt) {
  schemaValidator(root, "national-usgs-nas-acquisition-receipt.schema.json").parse(receipt);
  assert(
    stableJson(receipt.archive.entry_names) === stableJson([...USGS_NAS_ARCHIVE_ENTRIES]),
    "USGS NAS acquisition receipt archive entry_names changed.",
  );
}

export function validateNationalNasPlan(root: string, plan: NationalNasPlan) {
  schemaValidator(root, "national-usgs-nas-plan.schema.json").parse(plan);
  assert(
    stableJson(plan.acceptedOccurrenceStatuses) ===
      stableJson([...USGS_NAS_ACCEPTED_OCCURRENCE_STATUSES]),
    "USGS NAS plan changed the approved positive occurrence statuses.",
  );
  const screenKeys = plan.screens.map((entry) => `${entry.stateCode}:${entry.speciesId}`);
  assert(new Set(screenKeys).size === screenKeys.length, "USGS NAS plan contains duplicate screens.");
  assert(
    stableJson(screenKeys) === stableJson([...screenKeys].sort(compareText)),
    "USGS NAS plan screens are not stably ordered.",
  );
  assert(
    stableJson(plan.acceptedOccurrenceStatuses) ===
      stableJson([...plan.acceptedOccurrenceStatuses].sort(compareText)),
    "USGS NAS accepted statuses are not stably ordered.",
  );
  const screenTaxonKeys = plan.screens.map(
    (entry) => `${entry.stateCode}:${canonicalBinomial(entry.scientificName)}`,
  );
  assert(
    new Set(screenTaxonKeys).size === screenTaxonKeys.length,
    "USGS NAS plan assigns one state taxon to more than one species screen.",
  );
}

export function validateNationalNasReference(root: string, reference: NationalNasReference) {
  schemaValidator(root, "national-usgs-nas-reference.schema.json").parse(reference);
  const classified = reference.reconciliation.accepted_records +
    reference.reconciliation.rejected_candidate_records;
  assert(
    classified === reference.reconciliation.selected_records,
    "USGS NAS selected records do not reconcile to accepted and rejected records.",
  );
  assert(
    reference.reconciliation.blocking_candidate_records <=
      reference.reconciliation.rejected_candidate_records,
    "USGS NAS blocking candidates exceed rejected candidate records.",
  );
  const rejectionCategoryTotal = reference.reconciliation.duplicate_record_ids +
    reference.reconciliation.blank_status_records +
    reference.reconciliation.unsupported_status_records +
    reference.reconciliation.missing_geography_records +
    reference.reconciliation.retired_geography_records +
    reference.reconciliation.unknown_or_ambiguous_geography_records +
    reference.reconciliation.invalid_identity_records;
  assert(
    rejectionCategoryTotal === reference.reconciliation.rejected_candidate_records,
    "USGS NAS rejection categories do not reconcile to rejected candidate records.",
  );
}

export function captureCommittedInputSnapshot(
  root: string,
  filepaths: string[],
): CommittedInputSnapshot {
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  assert(!status, "National acquisition or partition requires a clean committed worktree.");
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const fileHashes = new Map<string, string>();
  for (const filepath of [...new Set(filepaths)].sort(compareText)) {
    const relativePath = relativeGitPath(root, filepath);
    const current = readFileSync(filepath);
    const committed = execFileSync("git", ["show", `${commit}:${relativePath}`], { cwd: root });
    assert(
      sha256(current) === sha256(committed),
      `${relativePath} does not match commit ${commit}.`,
    );
    fileHashes.set(filepath, sha256(current));
  }
  return { commit, fileHashes };
}

export function verifyCommittedInputSnapshot(root: string, snapshot: CommittedInputSnapshot) {
  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  assert(currentCommit === snapshot.commit, "Repository HEAD changed during national research work.");
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: root, encoding: "utf8" },
  ).trim();
  assert(!status, "The worktree changed during national research work.");
  for (const [filepath, expectedHash] of snapshot.fileHashes) {
    assert(
      sha256(readFileSync(filepath)) === expectedHash,
      `${relativeGitPath(root, filepath)} changed during national research work.`,
    );
  }
}

export function assertCommitAncestor(root: string, ancestor: string, descendant: string) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      stdio: "ignore",
    });
  } catch {
    throw new Error(`Commit ${ancestor} is not an ancestor of ${descendant}.`);
  }
}

function readArchiveEntry(archivePath: string, entry: string, maxBuffer: number) {
  return execFileSync("unzip", ["-p", archivePath, entry], { maxBuffer });
}

function archiveEntries(archivePath: string) {
  return execFileSync("unzip", ["-Z1", archivePath], { encoding: "utf8" })
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort(compareText);
}

export async function streamNationalNasOccurrences(
  archivePath: string,
  onRecord?: (record: NasArchiveOccurrence, index: number) => void | Promise<void>,
) {
  const unzip = spawn("unzip", ["-p", archivePath, "occurrence.txt"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closePromise = once(unzip, "close") as Promise<[number | null, NodeJS.Signals | null]>;
  let stderr = "";
  unzip.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < 16_384) stderr += chunk.toString("utf8");
  });
  let headerValidated = false;
  const parser = unzip.stdout.pipe(parse({
    columns: (header: string[]) => {
      assert(
        stableJson(header) === stableJson([...USGS_NAS_OCCURRENCE_HEADER]),
        "USGS NAS occurrence header changed.",
      );
      headerValidated = true;
      return header;
    },
    delimiter: "\t",
    quote: false,
    relax_column_count: false,
    skip_empty_lines: true,
  })) as AsyncIterable<NasArchiveOccurrence>;
  let count = 0;
  try {
    for await (const record of parser) {
      count += 1;
      if (onRecord) await onRecord(record, count);
    }
  } catch (error) {
    unzip.kill("SIGTERM");
    await closePromise.catch(() => undefined);
    throw error;
  }
  const [exitCode] = await closePromise;
  assert(exitCode === 0, `USGS NAS archive extraction failed: ${stderr.trim() || exitCode}.`);
  assert(headerValidated, "USGS NAS archive did not contain an occurrence header.");
  return count;
}

export async function inspectNationalNasArchive(archivePath: string, countRecords = true) {
  assert(existsSync(archivePath) && statSync(archivePath).isFile(), `Missing USGS NAS archive ${archivePath}.`);
  const entries = archiveEntries(archivePath);
  assert(
    stableJson(entries) === stableJson([...USGS_NAS_ARCHIVE_ENTRIES]),
    `USGS NAS archive entries changed: ${entries.join(", ")}.`,
  );
  const meta = readArchiveEntry(archivePath, "meta.xml", 1_048_576).toString("utf8");
  const eml = readArchiveEntry(archivePath, "eml.xml", 1_048_576).toString("utf8");
  assert(
    meta.includes("<location>occurrence.txt</location>") &&
      meta.includes('fieldsTerminatedBy="\\t"') &&
      meta.includes('ignoreHeaderLines="1"'),
    "USGS NAS Darwin Core manifest changed.",
  );
  for (const [index, field] of USGS_NAS_OCCURRENCE_HEADER.entries()) {
    if (index === 0) {
      assert(meta.includes('<id index="0"'), "USGS NAS Darwin Core ID mapping changed.");
    } else {
      assert(meta.includes(`<field index="${index}"`), `USGS NAS field index ${index} is missing.`);
      assert(meta.includes(`/${field}\"`) || field === "modified" || field === "language" || field === "bibliographicCitation" || field === "references", `USGS NAS field ${field} is missing.`);
    }
  }
  const publicationDate = eml.match(/<pubDate>\s*([0-9]{4}-[0-9]{2}-[0-9]{2})\s*<\/pubDate>/)?.[1];
  assert(publicationDate, "USGS NAS EML publication date is missing.");
  assert(
    eml.includes("USGS Nonindigenous Aquatic Species database"),
    "USGS NAS EML title changed.",
  );
  assert(
    eml.includes("Creative Commons Zero v1.0 Universal") && eml.includes("CC0-1.0"),
    "USGS NAS archive license changed.",
  );
  const recordCount = countRecords ? await streamNationalNasOccurrences(archivePath) : 0;
  return {
    title: "USGS Nonindigenous Aquatic Species database" as const,
    publicationDate,
    license: "CC0-1.0" as const,
    recordCount,
    coreFile: "occurrence.txt" as const,
    headerSha256: sha256(`${USGS_NAS_OCCURRENCE_HEADER.join("\t")}\n`),
    entryNames: [...USGS_NAS_ARCHIVE_ENTRIES] as ["eml.xml", "meta.xml", "occurrence.txt"],
  };
}

function listFilesRecursive(directory: string, prefix = ""): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursive(absolute, relative) : [relative];
  });
}

function verifyReceiptInputHashes(root: string, receipt: NationalNasAcquisitionReceipt) {
  const required = [
    "scripts/research/national-usgs-nas-common.ts",
    "scripts/research/run-national-usgs-nas-acquisition.ts",
    "src/data/research/schemas/national-usgs-nas-acquisition-receipt.schema.json",
    "src/data/research/source-registry.json",
  ].sort(compareText);
  assert(
    stableJson(Object.keys(receipt.input_hashes).sort(compareText)) === stableJson(required),
    "USGS NAS acquisition input hash set is incomplete or excessive.",
  );
  for (const relativePath of required) {
    const committed = execFileSync("git", ["show", `${receipt.code_commit}:${relativePath}`], {
      cwd: root,
    });
    assert(
      sha256(committed) === receipt.input_hashes[relativePath],
      `USGS NAS acquisition input hash changed for ${relativePath}.`,
    );
  }
}

export async function verifyNationalNasAcquisition(
  root: string,
  directory: string,
  countRecords = true,
): Promise<VerifiedNationalNasAcquisition> {
  const absoluteRoot = path.resolve(root);
  const absoluteDirectory = path.resolve(directory);
  const expectedParent = path.join(absoluteRoot, "src/data/research/national-acquisitions");
  assert(isWithin(expectedParent, absoluteDirectory), "USGS NAS acquisition is outside its root.");
  assert(existsSync(absoluteDirectory) && statSync(absoluteDirectory).isDirectory(), "USGS NAS acquisition directory is missing.");
  assert(isWithin(realpathSync(expectedParent), realpathSync(absoluteDirectory)), "USGS NAS acquisition resolves outside its root.");

  const receiptPath = path.join(absoluteDirectory, "receipt.json");
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as NationalNasAcquisitionReceipt;
  validateNationalNasReceipt(root, receipt);
  assert(receipt.acquisition_id === path.basename(absoluteDirectory), "USGS NAS acquisition ID and directory disagree.");
  assert(receipt.parameters.archiveUrl === canonicalNasArchiveUrl(receipt.parameters.archiveVersion), "USGS NAS archive URL is not canonical.");
  assert(receipt.parameter_hash === sha256(stableJson(receipt.parameters)), "USGS NAS acquisition parameter hash changed.");
  assert(Date.parse(receipt.started_at) <= Date.parse(receipt.finished_at), "USGS NAS acquisition finishes before it starts.");
  verifyReceiptInputHashes(root, receipt);

  const archivePath = path.resolve(root, receipt.artifact.path);
  assert(isWithin(absoluteDirectory, archivePath), "USGS NAS archive path escapes its acquisition.");
  assert(existsSync(archivePath) && statSync(archivePath).isFile(), "USGS NAS archive artifact is missing.");
  assert(isWithin(realpathSync(absoluteDirectory), realpathSync(archivePath)), "USGS NAS archive resolves outside its acquisition.");
  const archiveBytes = readFileSync(archivePath);
  assert(archiveBytes.length === receipt.artifact.bytes, "USGS NAS archive byte count changed.");
  assert(sha256(archiveBytes) === receipt.artifact.sha256, "USGS NAS archive hash changed.");
  assert(archiveBytes.length <= receipt.parameters.artifactBudgetBytes, "USGS NAS archive exceeds its artifact budget.");

  const actualFiles = listFilesRecursive(absoluteDirectory).sort(compareText);
  const expectedFiles = [
    "receipt.json",
    relativeGitPath(absoluteDirectory, archivePath),
  ].sort(compareText);
  assert(stableJson(actualFiles) === stableJson(expectedFiles), "USGS NAS acquisition contains undeclared files.");
  for (const request of receipt.upstream_requests) {
    assert(request.url === receipt.parameters.archiveUrl, "USGS NAS receipt contains a noncanonical request URL.");
    assert(/^https:\/\//.test(request.response_url), "USGS NAS receipt contains an invalid response URL.");
    const timestamp = Date.parse(request.retrieved_at);
    assert(
      timestamp >= Date.parse(receipt.started_at) && timestamp <= Date.parse(receipt.finished_at),
      "USGS NAS request timestamp is outside the receipt interval.",
    );
  }
  const successful = receipt.upstream_requests.filter((entry) => entry.status === 200 || entry.status === 206);
  assert(successful.length > 0, "USGS NAS receipt lacks a successful archive request.");
  assert(
    nationalNasDownloadedCoverage(receipt.upstream_requests) === archiveBytes.length,
    "USGS NAS request bytes do not reconstruct the retained archive.",
  );
  assert(
    receipt.counts.upstream_requests === receipt.upstream_requests.length &&
      receipt.counts.artifacts === 1 &&
      receipt.counts.records === receipt.archive.record_count,
    "USGS NAS receipt counts do not reconcile.",
  );
  assert(
    receipt.counts.resumed_bytes <= archiveBytes.length,
    "USGS NAS resumed byte count exceeds the retained archive.",
  );
  const inspected = await inspectNationalNasArchive(archivePath, countRecords);
  assert(inspected.publicationDate === receipt.archive.publication_date, "USGS NAS publication date changed.");
  assert(inspected.headerSha256 === receipt.archive.header_sha256, "USGS NAS occurrence header changed.");
  if (countRecords) {
    assert(inspected.recordCount === receipt.archive.record_count, "USGS NAS archive record count changed.");
  }
  return {
    directory: absoluteDirectory,
    receiptPath,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
    receipt,
    archivePath,
  };
}
