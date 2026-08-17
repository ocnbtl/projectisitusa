import { execFileSync } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { z } from "zod";

import type {
  ImmutableResearchRunReceipt,
  ResearchRunFileReference,
  ResearchSourceRegistry,
} from "@/lib/research/types";
import type { SourceAdapterResult, SourceAdapterContext } from "@/lib/research/source-adapter";
import {
  getStateDefinition,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";
import {
  validateImmutableResearchRunDirectory,
  validateResearchRunInMemory,
  verifyStagedResearchRun,
} from "@/lib/research/validate-run";

import {
  GBIF_ADAPTER_VERSION,
  type GbifRequestedPair,
} from "./adapters/gbif-preserved-specimens";
import {
  compareText,
  loadNationalGbifDownloadPlan,
  loadNationalGbifSelection,
  resolveNationalGbifTaxa,
  sha256,
} from "./national-gbif-download";
import { replayNationalGbifArchive } from "./national-gbif-download-replay";
import {
  assertCommitAncestor,
  captureCommittedInputSnapshot,
  verifyCommittedInputSnapshot,
} from "./national-usgs-nas-common";
import { verifyNationalGbifAcquisition } from "./verify-national-gbif-download";

const ROOT = process.cwd();
const RESEARCH_ROOT = path.join(ROOT, "src/data/research");
const SOURCE_ID = "gbif-preserved-specimens";
const ADAPTER_ID = "gbif-preserved-specimens";
const MAX_RUN_FILE_BYTES = 20 * 1024 * 1024;

type NationalGbifAcquisitionReceipt = {
  schemaVersion: 2;
  acquisition_id: string;
  status: "complete";
  actor_type: "adapter";
  actor_id: "gbif-national-download-acquisition@2.0.0";
  source_id: typeof SOURCE_ID;
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
  status_history: unknown[];
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

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function schemaValidator(filename: string) {
  const schema = readJson<Parameters<typeof z.fromJSONSchema>[0]>(path.join(RESEARCH_ROOT, "schemas", filename));
  return z.fromJSONSchema(schema);
}

function relativeGitPath(filepath: string) {
  return path.relative(ROOT, filepath).replaceAll("\\", "/");
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid GBIF partition argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const plan = values.get("plan");
  const acquisition = values.get("acquisition");
  assert(plan, "--plan is required.");
  assert(acquisition, "--acquisition is required.");
  return {
    planPath: path.resolve(ROOT, plan),
    acquisitionDirectory: path.resolve(ROOT, acquisition),
    runsRoot: path.resolve(ROOT, values.get("runs-root") ?? "src/data/research/runs"),
  };
}

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

function assertGitClean(acquisitionDirectory: string) {
  const allowed = `${relativeGitPath(acquisitionDirectory).replace(/\/$/u, "")}/`;
  const lines = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" })
    .split(/\r?\n/gu)
    .filter(Boolean);
  const unexpected = lines.filter((line) => {
    if (!line.startsWith("?? ")) return true;
    const filepath = line.slice(3).replaceAll("\\", "/");
    return filepath !== allowed.slice(0, -1) && !filepath.startsWith(allowed);
  });
  assert(unexpected.length === 0, `GBIF partition requires a clean worktree apart from its acquisition: ${unexpected.join(", ")}.`);
}

function runTimestamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

function asNdjson(values: unknown[]) {
  return values.length > 0 ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "";
}

function fileReference(filepath: string, contents: string, mediaType: string): ResearchRunFileReference {
  return { path: filepath, sha256: sha256(contents), bytes: Buffer.byteLength(contents), media_type: mediaType };
}

function directoryContents(directory: string, prefix = ""): Map<string, string> {
  const values = new Map<string, string>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [child, contents] of directoryContents(absolute, relative)) values.set(child, contents);
    } else {
      values.set(relative, readFileSync(absolute, "utf8"));
    }
  }
  return values;
}

async function hashFile(filepath: string) {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filepath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

function inputSnapshot(files: string[]) {
  return Object.fromEntries([...files].sort(compareText).map((filepath) => [relativeGitPath(filepath), sha256(readFileSync(filepath))]));
}

function assertCommittedInputs(codeCommit: string, inputHashes: Record<string, string>) {
  for (const [relativePath, expectedHash] of Object.entries(inputHashes)) {
    const filepath = path.resolve(ROOT, relativePath);
    assert(sha256(readFileSync(filepath)) === expectedHash, `Current GBIF partition input differs at ${relativePath}.`);
    const currentBlob = execFileSync("git", ["hash-object", `--path=${relativePath}`, filepath], { cwd: ROOT, encoding: "utf8" }).trim();
    const committedBlob = execFileSync("git", ["rev-parse", `${codeCommit}:${relativePath}`], { cwd: ROOT, encoding: "utf8" }).trim();
    assert(currentBlob === committedBlob, `Committed GBIF partition input differs at ${relativePath}.`);
  }
}

function verifyAcquisitionInputHashes(receipt: NationalGbifAcquisitionReceipt) {
  for (const [relativePath, expectedHash] of Object.entries(receipt.input_hashes)) {
    const committed = execFileSync("git", ["show", `${receipt.code_commit}:${relativePath}`], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 });
    assert(sha256(committed) === expectedHash, `GBIF acquisition input differs at ${relativePath}.`);
  }
}

function buildScopes(input: {
  plan: ReturnType<typeof loadNationalGbifDownloadPlan>;
  selection: ReturnType<typeof loadNationalGbifSelection>["selection"];
  taxa: ReturnType<typeof resolveNationalGbifTaxa>;
  acquisition: NationalGbifAcquisitionReceipt;
  adapterCodeHash: string;
  replayCodeHash: string;
  runnerCodeHash: string;
  partitionContractHash: string;
  runsRoot: string;
}) {
  const taxonBySpecies = new Map(input.taxa.map((taxon) => [taxon.speciesId, taxon]));
  return input.selection.stateScopes
    .filter((selectedScope) => selectedScope.candidatePairs.length > 0)
    .map((selectedScope) => {
    const state = getStateDefinition(selectedScope.stateCode);
    assert(state, `Missing state definition ${selectedScope.stateCode}.`);
    const requestedPairs = selectedScope.candidatePairs.map((key) => {
      const [countyFips, speciesId] = key.split(":");
      const taxon = taxonBySpecies.get(speciesId!);
      assert(taxon, `GBIF selection contains unplanned species ${speciesId}.`);
      const county = resolveCountyEquivalent({ stateCode: selectedScope.stateCode, countyFips });
      assert(county.status === "resolved", `GBIF selection contains invalid county ${countyFips}.`);
      return {
        countyFips: county.county.countyFips,
        countyName: county.county.shortName,
        countyLegalName: county.county.legalName,
        stateCode: selectedScope.stateCode,
        stateName: state.stateName,
        sourceStateName: state.sourceStateNames.gbif,
        speciesId: taxon.speciesId,
        scientificName: taxon.scientificName,
      } satisfies GbifRequestedPair;
    });
    const parameters = {
      stateCode: selectedScope.stateCode,
      stateProvince: state.sourceStateNames.gbif,
      candidateLimit: selectedScope.candidatePairs.length,
      candidatePairs: selectedScope.candidatePairs,
      basisOfRecord: input.plan.basisOfRecord,
      occurrenceStatus: input.plan.occurrenceStatus,
      minimumMatchConfidence: 95,
      pageLimit: 300,
    };
    schemaValidator("gbif-preserved-specimens-parameters.schema.json").parse(parameters);
    const parameterHash = sha256(stableJson(parameters));
    const identityHash = sha256(stableJson({
      parameterHash,
      adapterCodeHash: input.adapterCodeHash,
      replayCodeHash: input.replayCodeHash,
      runnerCodeHash: input.runnerCodeHash,
      partitionContractHash: input.partitionContractHash,
    }));
    const runId = `${runTimestamp(input.acquisition.started_at)}__${SOURCE_ID}__${identityHash.slice(0, 12)}`;
    const context: SourceAdapterContext = {
      runId,
      sourceId: SOURCE_ID,
      stateCode: selectedScope.stateCode,
      requestedPairs,
      runStartedAt: input.acquisition.started_at,
      parameters,
    };
    return {
      state: selectedScope.stateCode,
      selectedScope,
      requestedPairs,
      parameters,
      parameterHash,
      runId,
      context,
      outputPath: path.join(input.runsRoot, runId),
    };
    });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const plan = loadNationalGbifDownloadPlan(options.planPath);
  assert(plan.schemaVersion === 2, "GBIF partition requires a v2 plan.");
  const selectionLoaded = loadNationalGbifSelection(ROOT, plan);
  const taxa = resolveNationalGbifTaxa(ROOT, plan);
  const acquisitionReceiptPath = path.join(options.acquisitionDirectory, "receipt.json");
  const acquisitionReceiptBytes = readFileSync(acquisitionReceiptPath);
  const acquisition = JSON.parse(acquisitionReceiptBytes.toString("utf8")) as NationalGbifAcquisitionReceipt;
  schemaValidator("national-gbif-download-acquisition-receipt.schema.json").parse(acquisition);
  await verifyNationalGbifAcquisition(ROOT, options.acquisitionDirectory);
  assert(acquisition.acquisition_id === path.basename(options.acquisitionDirectory), "GBIF acquisition directory identity differs.");
  assert(acquisition.parameters.planSha256 === sha256(readFileSync(options.planPath)), "GBIF acquisition plan hash differs.");
  assert(acquisition.parameters.selectionSha256 === sha256(selectionLoaded.bytes), "GBIF acquisition selection hash differs.");
  assert(acquisition.archive.path.startsWith(`${relativeGitPath(options.acquisitionDirectory)}/`), "GBIF archive is outside its acquisition directory.");
  verifyAcquisitionInputHashes(acquisition);
  const archivePath = path.resolve(ROOT, acquisition.archive.path);
  const archiveHash = await hashFile(archivePath);
  assert(archiveHash.bytes === acquisition.archive.bytes && archiveHash.sha256 === acquisition.archive.sha256, "GBIF archive bytes or hash differ from receipt.");
  assert(archiveHash.bytes <= plan.artifactBudgetBytes, "GBIF archive exceeds plan budget.");

  const adapterPath = path.join(ROOT, "scripts/research/adapters/gbif-preserved-specimens.ts");
  const nationalHelperPath = path.join(ROOT, "scripts/research/national-gbif-download.ts");
  const replayPath = path.join(ROOT, "scripts/research/national-gbif-download-replay.ts");
  const runnerPath = path.join(ROOT, "scripts/research/partition-national-gbif-download.ts");
  const verifierPath = path.join(ROOT, "scripts/research/verify-national-gbif-download.ts");
  const zipToolsPath = path.join(ROOT, "scripts/research/zip-tools.ts");
  const snapshotHelperPath = path.join(ROOT, "scripts/research/national-usgs-nas-common.ts");
  const adapterCodeHash = sha256(readFileSync(adapterPath));
  const replayCodeHash = sha256(readFileSync(replayPath));
  const runnerCodeHash = sha256(readFileSync(runnerPath));
  const partitionContractHash = sha256(stableJson(
    [nationalHelperPath, verifierPath, zipToolsPath, snapshotHelperPath]
      .map((filepath) => [relativeGitPath(filepath), sha256(readFileSync(filepath))]),
  ));
  const inputFiles = [
    options.planPath,
    selectionLoaded.selectionPath,
    path.resolve(ROOT, plan.taxonomyCachePath),
    path.resolve(ROOT, plan.selectionUniversePlanPath!),
    adapterPath,
    nationalHelperPath,
    replayPath,
    runnerPath,
    verifierPath,
    zipToolsPath,
    snapshotHelperPath,
    path.join(RESEARCH_ROOT, "source-registry.json"),
    path.join(RESEARCH_ROOT, "state-registry.json"),
    path.join(RESEARCH_ROOT, "county-equivalent-registry.json"),
    ...[
      "gbif-preserved-specimens-parameters.schema.json",
      "national-gbif-download-acquisition-receipt.schema.json",
      "national-gbif-download-partition-receipt.schema.json",
      "national-gbif-download-reference.schema.json",
      "worker-source-verification.schema.json",
      "run-receipt.schema.json",
      "evidence-assertion.schema.json",
      "review-event.schema.json",
      "rejection-record.schema.json",
      "pair-outcome.schema.json",
    ].map((filename) => path.join(RESEARCH_ROOT, "schemas", filename)),
    acquisitionReceiptPath,
    archivePath,
  ];
  const snapshot = captureCommittedInputSnapshot(ROOT, inputFiles);
  assert(snapshot.commit !== acquisition.code_commit, "GBIF partition requires a committed acquisition checkpoint first.");
  assertCommitAncestor(ROOT, acquisition.code_commit, snapshot.commit);
  const inputHashes = Object.fromEntries(
    [...snapshot.fileHashes.entries()].map(([filepath, hash]) => [relativeGitPath(filepath), hash]),
  );
  const scopes = buildScopes({
    plan,
    selection: selectionLoaded.selection,
    taxa,
    acquisition,
    adapterCodeHash,
    replayCodeHash,
    runnerCodeHash,
    partitionContractHash,
    runsRoot: options.runsRoot,
  });
  const reusableCommits = new Set(
    scopes
      .filter((scope) => existsSync(path.join(scope.outputPath, "receipt.json")))
      .map((scope) => readJson<ImmutableResearchRunReceipt>(path.join(scope.outputPath, "receipt.json")).code_commit),
  );
  assert(reusableCommits.size <= 1, "Existing GBIF partition runs disagree on their receipt commit.");
  const codeCommit = reusableCommits.values().next().value ?? snapshot.commit;
  assertCommitAncestor(ROOT, codeCommit, snapshot.commit);
  assertCommittedInputs(codeCommit, inputHashes);
  assert(scopes.reduce((sum, scope) => sum + scope.requestedPairs.length, 0) === plan.expectedNotResearchedPairsAtBaseline, "GBIF partition selected pair count differs from plan.");
  const replay = await replayNationalGbifArchive({
    archivePath,
    plan,
    taxa,
    stateInputs: scopes.map((scope) => ({ context: scope.context, requestedPairs: scope.requestedPairs })),
    completedAt: acquisition.finished_at,
    downloadKey: acquisition.download.key,
    providerTotalRecords: acquisition.archive.provider_total_records,
  });
  assert(replay.reconciliation.selectedScopeRows <= plan.maxSelectedEvidenceRecords!, "GBIF selected evidence record guard exceeded.");
  const scopesByState = new Map(scopes.map((scope) => [scope.state, scope]));
  const statePartitions = selectionLoaded.selection.stateScopes.map((selectedScope) => {
    const scope = scopesByState.get(selectedScope.stateCode);
    if (!scope) {
      assert(selectedScope.candidatePairs.length === 0, `GBIF ${selectedScope.stateCode} lacks a nonempty run scope.`);
      return {
        stateCode: selectedScope.stateCode,
        runCreated: false,
        runId: null,
        pairCount: 0,
        pairSha256: selectedScope.candidatePairSha256,
        candidateRecords: 0,
        assertions: 0,
        reviews: 0,
        rejections: 0,
        outcomes: 0,
      };
    }
    const result = replay.resultsByState.get(scope.state);
    assert(result, `GBIF replay lacks state ${scope.state}.`);
    assert(result.outcomes.length === scope.requestedPairs.length, `GBIF ${scope.state} outcomes differ from selection.`);
    return {
      stateCode: scope.state,
      runCreated: true,
      runId: scope.runId,
      pairCount: scope.requestedPairs.length,
      pairSha256: scope.selectedScope.candidatePairSha256,
      candidateRecords: result.candidateRecordCount,
      assertions: result.assertions.length,
      reviews: result.reviews.length,
      rejections: result.rejections.length,
      outcomes: result.outcomes.length,
    };
  });
  const partitionId = `gbif-national-partition-${sha256(stableJson({ acquisition: acquisition.acquisition_id, selection: selectionLoaded.selection.selectionId, codeCommit })).slice(0, 16)}`;
  const partitionReceiptPath = path.join(ROOT, "ops/national-research/evaluations", `${partitionId}.json`);
  const partitionReceipt = {
    schemaVersion: 1,
    partitionId,
    status: "complete",
    sourceId: SOURCE_ID,
    createdAt: acquisition.finished_at,
    codeCommit,
    inputHashes,
    acquisitionId: acquisition.acquisition_id,
    acquisitionReceiptPath: relativeGitPath(acquisitionReceiptPath),
    acquisitionReceiptSha256: sha256(acquisitionReceiptBytes),
    archivePath: acquisition.archive.path,
    archiveSha256: acquisition.archive.sha256,
    selectionId: selectionLoaded.selection.selectionId,
    selectionPath: relativeGitPath(selectionLoaded.selectionPath),
    selectionSha256: sha256(selectionLoaded.bytes),
    inspection: replay.inspection,
    reconciliation: replay.reconciliation,
    statePartitions,
    semantics: {
      scopeComplete: true,
      createsAbsence: false,
      createsNotDetected: false,
      coordinateCountyAssignmentAllowed: false,
    },
    errors: [],
    warnings: [
      "Complete zero-evidence outcomes change research status only and never establish absence or non-detection.",
      "Rows without exact current registered state and county text are rejected without coordinate assignment.",
    ],
  };
  schemaValidator("national-gbif-download-partition-receipt.schema.json").parse(partitionReceipt);
  const partitionReceiptContents = `${JSON.stringify(partitionReceipt, null, 2)}\n`;
  const partitionReceiptSha256 = sha256(partitionReceiptContents);
  const stagedPartitionReceiptPath = path.join(ROOT, ".cache/research", `.${partitionId}-receipt.json`);
  mkdirSync(path.dirname(stagedPartitionReceiptPath), { recursive: true });
  if (existsSync(stagedPartitionReceiptPath)) {
    assert(
      readFileSync(stagedPartitionReceiptPath, "utf8") === partitionReceiptContents,
      "Staged GBIF partition receipt differs from this replay.",
    );
  } else {
    writeFileSync(stagedPartitionReceiptPath, partitionReceiptContents, { flag: "wx" });
  }

  const sourceRegistryPath = path.join(RESEARCH_ROOT, "source-registry.json");
  const sourceRegistryBytes = readFileSync(sourceRegistryPath);
  const registry = JSON.parse(sourceRegistryBytes.toString("utf8")) as ResearchSourceRegistry;
  const source = registry.sources.find((entry) => entry.id === SOURCE_ID);
  assert(
    source?.researchAdapter?.id === ADAPTER_ID &&
      source.researchAdapter.allowedVersions.includes(GBIF_ADAPTER_VERSION),
    "GBIF source registry does not allow the partition adapter version.",
  );
  assert(source.caveat, "GBIF source registry lacks its evidence caveat.");
  const archiveAttempts = acquisition.http_attempts.filter((attempt) => attempt.role === "archive");
  const successfulArchiveAttempts = archiveAttempts.filter(
    (attempt) => attempt.error === null && (attempt.status === 200 || attempt.status === 206),
  );
  const finalArchiveAttempt = successfulArchiveAttempts.at(-1);
  assert(finalArchiveAttempt, "GBIF acquisition lacks a successful archive HTTP attempt.");
  const sourceVerificationRequest = {
    requestGroupId: acquisition.acquisition_id,
    url: acquisition.archive.source_url,
    purpose: "Authenticated provider-native national Darwin Core archive reused by this offline state partition",
    attempts: archiveAttempts.length,
    status: finalArchiveAttempt.status!,
    retrievedAt: finalArchiveAttempt.observedAt,
    declaredRecordCount: acquisition.archive.provider_total_records,
    receivedRecordCount: acquisition.archive.provider_total_records,
    pagination: {
      mode: "snapshot" as const,
      pageIndex: 0,
      offset: null,
      limit: null,
      cursor: null,
      nextCursor: null,
      endOfRecords: true,
    },
  };
  const receiptUpstreamRequest = {
    url: sourceVerificationRequest.url,
    status: sourceVerificationRequest.status,
    retrieved_at: sourceVerificationRequest.retrievedAt,
    record_count: sourceVerificationRequest.receivedRecordCount,
  };
  const referenceValidator = schemaValidator("national-gbif-download-reference.schema.json");
  const sourceVerificationValidator = schemaValidator("worker-source-verification.schema.json");
  const stagingRoot = path.join(ROOT, ".cache/research", `.${partitionId}`);
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  const generated: Array<{
    scope: (typeof scopes)[number];
    result: SourceAdapterResult;
    stagingDirectory: string;
    finalDirectory: string;
    receipt: ImmutableResearchRunReceipt;
    contents: Map<string, string>;
  }> = [];
  for (const scope of scopes) {
    const result = replay.resultsByState.get(scope.state)!;
    const statePartition = statePartitions.find((entry) => entry.stateCode === scope.state)!;
    const reference = {
      schemaVersion: 1,
      acquisitionId: acquisition.acquisition_id,
      acquisitionReceiptPath: relativeGitPath(acquisitionReceiptPath),
      acquisitionReceiptSha256: sha256(acquisitionReceiptBytes),
      partitionReceiptPath: relativeGitPath(partitionReceiptPath),
      partitionReceiptSha256,
      downloadKey: acquisition.download.key,
      doi: acquisition.download.doi,
      license: acquisition.download.license,
      archive: {
        path: acquisition.archive.path,
        sha256: acquisition.archive.sha256,
        bytes: acquisition.archive.bytes,
        providerTotalRecords: acquisition.archive.provider_total_records,
      },
      sourceId: SOURCE_ID,
      stateCode: scope.state,
      selectionId: selectionLoaded.selection.selectionId,
      selectionPairCount: scope.requestedPairs.length,
      selectionPairSha256: scope.selectedScope.candidatePairSha256,
      adapterVersion: GBIF_ADAPTER_VERSION,
      adapterCodeSha256: adapterCodeHash,
      replayCodeSha256: replayCodeHash,
      partitionRunnerSha256: runnerCodeHash,
      partitionMode: "provider-native-national-dwca-exact-state-county-text-no-coordinate-assignment",
      archiveInspection: replay.inspection,
      nationalReconciliation: replay.reconciliation,
      stateReconciliation: statePartition,
    };
    referenceValidator.parse(reference);
    const referenceContents = `${JSON.stringify(reference, null, 2)}\n`;
    const finalDirectory = scope.outputPath;
    const runRelative = relativeGitPath(finalDirectory);
    const artifactReference = fileReference(path.posix.join(runRelative, "artifacts/national-acquisition-reference.json"), referenceContents, "application/json");
    const sourceVerification = {
      schemaVersion: 1,
      verifiedAt: acquisition.finished_at,
      runId: scope.runId,
      sourceId: SOURCE_ID,
      stateCode: scope.state,
      pairKeys: scope.selectedScope.candidatePairs,
      parameterHash: scope.parameterHash,
      authority: {
        name: "Global Biodiversity Information Facility",
        sourceUrl: `https://www.gbif.org/occurrence/download/${acquisition.download.key}`,
        publisher: "GBIF",
      },
      terms: {
        license: acquisition.download.license,
        termsUrl: plan.termsUrl,
        retentionAllowed: true,
      },
      availability: {
        status: "available",
        checkedAt: acquisition.finished_at,
        freshnessDate: plan.snapshotDate,
      },
      geography: {
        method: "Exact provider-declared state and county text resolved through the active Census county-equivalent registry.",
        countyEquivalentSupported: true,
        coordinatePolicy: "Coordinates never establish county membership; missing, ambiguous, contradictory, or retired geography is rejected.",
      },
      taxonomy: {
        method: "Exact retained GBIF species keys from a hash-pinned taxonomy cache with EXACT species matches and confidence at least 95.",
        targetSpeciesIds: [...new Set(scope.requestedPairs.map((pair) => pair.speciesId))].sort(compareText),
      },
      acquisition: {
        snapshotComplete: true,
        paginationComplete: true,
        stableIdentityFields: ["gbifID", "datasetKey", "speciesKey", "stateProvince", "county"],
        requests: [sourceVerificationRequest],
      },
      negativeEvidence: {
        supportsVerifiedAbsence: false,
        supportsNotDetected: false,
        limitations: [
          "GBIF preserved specimen records are positive occurrence evidence, not a negative survey.",
          "Complete archive silence changes research status only; failure, rejection, and missing geography create no negative claim.",
        ],
      },
      retainedEvidence: [{ path: artifactReference.path, sha256: artifactReference.sha256, bytes: artifactReference.bytes }],
      caveats: [
        source.caveat,
        "The archive uses deliberately retained legacy GBIF Backbone identifiers; Catalogue of Life migration is separate work.",
        "At most one deterministic qualifying specimen assertion is published per selected county-species pair.",
      ],
    };
    sourceVerificationValidator.parse(sourceVerification);
    const outputContents = new Map<string, { contents: string; mediaType: string }>([
      ["assertions.ndjson", { contents: asNdjson(result.assertions), mediaType: "application/x-ndjson" }],
      ["reviews.ndjson", { contents: asNdjson(result.reviews), mediaType: "application/x-ndjson" }],
      ["rejections.ndjson", { contents: asNdjson(result.rejections), mediaType: "application/x-ndjson" }],
      ["outcomes.ndjson", { contents: asNdjson(result.outcomes), mediaType: "application/x-ndjson" }],
      ["source-verification.json", { contents: `${JSON.stringify(sourceVerification, null, 2)}\n`, mediaType: "application/json" }],
    ]);
    for (const [filename, value] of outputContents) {
      assert(Buffer.byteLength(value.contents) <= MAX_RUN_FILE_BYTES, `GBIF ${scope.state} ${filename} exceeds the 20 MiB run-file limit.`);
    }
    const outputs = [...outputContents.entries()].map(([filename, value]) => fileReference(path.posix.join(runRelative, filename), value.contents, value.mediaType));
    const receipt: ImmutableResearchRunReceipt = {
      schemaVersion: 1,
      run_id: scope.runId,
      status: "complete",
      started_at: acquisition.started_at,
      finished_at: acquisition.finished_at,
      actor_type: "adapter",
      actor_id: `${ADAPTER_ID}@${GBIF_ADAPTER_VERSION}`,
      source_id: SOURCE_ID,
      source_registry_hash: sha256(sourceRegistryBytes),
      adapter_id: ADAPTER_ID,
      adapter_version: GBIF_ADAPTER_VERSION,
      adapter_code_hash: adapterCodeHash,
      code_commit: codeCommit,
      parameter_hash: scope.parameterHash,
      parameters: scope.parameters,
      requested_scope: {
        state_code: scope.state,
        county_fips: [...new Set(scope.requestedPairs.map((pair) => pair.countyFips))].sort(compareText),
        species_ids: [...new Set(scope.requestedPairs.map((pair) => pair.speciesId))].sort(compareText),
        pair_keys: scope.selectedScope.candidatePairs,
        date_range: { start: null, end: plan.snapshotDate },
      },
      upstream_requests: [receiptUpstreamRequest],
      artifacts: [artifactReference],
      outputs,
      counts: {
        requested_pairs: scope.requestedPairs.length,
        candidate_records: result.candidateRecordCount,
        assertion_events: result.assertions.length,
        review_events: result.reviews.length,
        rejection_records: result.rejections.length,
        duplicate_records: result.duplicateRecordCount,
        error_count: 0,
        pair_outcomes: result.outcomes.length,
      },
      errors: [],
      known_caveats: [
        source.caveat,
        "Complete source silence changes research status only and never establishes absence or non-detection.",
        "Only baseline not-researched pairs are emitted; blocked and already researched pairs remain outside this partition scope.",
      ],
      source_warnings: result.warnings,
      deviations: [
        "One authenticated provider-native national DWCA archive is partitioned offline without state or county network requests.",
        "Coordinates are retained as source fields but never used to assign county geography.",
        "One deterministic lowest-GBIF-ID qualifying assertion is emitted per selected pair to bound evidence volume.",
      ],
      rerun_command: `node --import tsx scripts/research/partition-national-gbif-download.ts --plan ${relativeGitPath(options.planPath)} --acquisition ${relativeGitPath(options.acquisitionDirectory)}`,
    };
    const validationResult: SourceAdapterResult = {
      ...result,
      artifacts: [{ filename: "national-acquisition-reference.json", contents: referenceContents, mediaType: "application/json" }],
    };
    validateResearchRunInMemory({
      root: ROOT,
      sourceId: SOURCE_ID,
      source,
      stateCode: scope.state,
      runId: scope.runId,
      requestedPairKeys: scope.selectedScope.candidatePairs,
      result: validationResult,
      receipt,
      outputContents: new Map([...outputContents.entries()].map(([filename, value]) => [filename, value.contents])),
    });
    const contents = new Map<string, string>([
      ...[...outputContents.entries()].map(([filename, value]) => [filename, value.contents] as const),
      ["artifacts/national-acquisition-reference.json", referenceContents],
      ["receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
    ]);
    const stagingDirectory = path.join(stagingRoot, scope.runId);
    mkdirSync(path.join(stagingDirectory, "artifacts"), { recursive: true });
    for (const [filename, contentsValue] of contents) writeFileSync(path.join(stagingDirectory, filename), contentsValue);
    verifyStagedResearchRun(stagingDirectory, receipt);
    generated.push({ scope, result, stagingDirectory, finalDirectory, receipt, contents });
  }
  const moved: typeof generated = [];
  try {
    verifyCommittedInputSnapshot(ROOT, snapshot);
    mkdirSync(options.runsRoot, { recursive: true });
    for (const run of generated) {
      if (existsSync(run.finalDirectory)) {
        const existing = directoryContents(run.finalDirectory);
        assert(stableJson([...existing.entries()].sort()) === stableJson([...run.contents.entries()].sort()), `Existing GBIF run differs: ${run.scope.runId}.`);
        continue;
      }
      renameSync(run.stagingDirectory, run.finalDirectory);
      moved.push(run);
    }
    for (const run of generated) {
      validateImmutableResearchRunDirectory({
        repositoryRoot: ROOT,
        validationRoot: ROOT,
        runDirectory: run.finalDirectory,
        sourceVerificationPath: path.join(run.finalDirectory, "source-verification.json"),
        expected: {
          runId: run.scope.runId,
          sourceId: SOURCE_ID,
          stateCode: run.scope.state,
          pairKeys: run.scope.selectedScope.candidatePairs,
          codeCommit,
        },
      });
    }
    mkdirSync(path.dirname(partitionReceiptPath), { recursive: true });
    if (existsSync(partitionReceiptPath)) {
      assert(
        readFileSync(partitionReceiptPath, "utf8") === partitionReceiptContents,
        `Existing GBIF partition receipt differs: ${relativeGitPath(partitionReceiptPath)}.`,
      );
    } else {
      renameSync(stagedPartitionReceiptPath, partitionReceiptPath);
    }
  } catch (error) {
    for (const run of [...moved].reverse()) {
      if (existsSync(run.finalDirectory) && !existsSync(run.stagingDirectory)) renameSync(run.finalDirectory, run.stagingDirectory);
    }
    throw error;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(stagedPartitionReceiptPath, { force: true });
  }
  process.stdout.write(`${JSON.stringify({
    partitionReceiptPath: relativeGitPath(partitionReceiptPath),
    partitionReceiptSha256,
    acquisitionId: acquisition.acquisition_id,
    archiveSha256: acquisition.archive.sha256,
    ...replay.reconciliation,
    runPaths: generated.map((run) => relativeGitPath(run.finalDirectory)),
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
