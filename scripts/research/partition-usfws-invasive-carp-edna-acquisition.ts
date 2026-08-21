import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { z } from "zod";

import {
  USFWS_EDNA_COORDINATE_TOPOLOGY_PATH,
} from "@/lib/research/coordinate-geography-contract";
import {
  getStateDefinition,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";
import {
  listImmutableResearchRuns,
  sha256,
  stableJson,
} from "@/lib/research/run-files";
import type {
  ImmutableResearchRunReceipt,
  ResearchSourceRegistry,
} from "@/lib/research/types";
import {
  validateResearchRunInMemory,
  verifyStagedResearchRun,
} from "@/lib/research/validate-run";

import {
  USFWS_EDNA_ADAPTER_ID,
  USFWS_EDNA_ADAPTER_VERSION,
  USFWS_EDNA_SOURCE_ID,
  replayUsfwsEdnaState,
  type UsfwsEdnaReplayPair,
} from "./adapters/usfws-invasive-carp-edna-snapshot";
import {
  asNdjson,
  assertCommitAncestor,
  captureCommittedInputSnapshot,
  compareText,
  relativeGitPath,
  runFileReference,
  runTimestamp,
  verifyCommittedInputSnapshot,
} from "./national-usgs-nas-common";
import { countyResolver } from "./run-usfws-invasive-carp-edna-coverage";
import {
  USFWS_EDNA_LAYER_URL,
  USFWS_EDNA_TARGETS,
  selectUsfwsAcceptedSamples,
  type UsfwsCoveragePair,
  type UsfwsCoverageResult,
  type UsfwsEdnaRow,
} from "./usfws-invasive-carp-edna-coverage";

const ROOT = process.cwd();
const RESEARCH_ROOT = path.join(ROOT, "src/data/research");
const ACQUISITIONS_ROOT = path.join(RESEARCH_ROOT, "national-acquisitions");
const RUNS_ROOT = path.join(RESEARCH_ROOT, "runs");
const CACHE_ROOT = path.join(ROOT, ".cache/research/usfws-edna-partitions");
const QUALIFYING_CLASSIFICATION = "researched-unresolved-candidate";

type AcquisitionArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  role: string;
  recordCount?: number | null;
};

type AcquisitionReceipt = {
  acquisitionId: string;
  sourceId: string;
  baselineSha: string;
  observedAt: string;
  sourceIdentity: {
    objectIdCount: number;
    objectIdSetSha256: string;
  };
  coverage: Omit<UsfwsCoverageResult, "groups" | "pairs">;
  artifacts: AcquisitionArtifact[];
  operations: {
    providerPosts: number;
    assertionsCreated: number;
    publicationMutations: number;
    r2Mutations: number;
  };
};

type AcquisitionReference = {
  schemaVersion: 1;
  acquisitionId: string;
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  recordsPath: string;
  recordsSha256: string;
  coveragePath: string;
  coverageSha256: string;
  sourceId: string;
  adapterVersion: string;
  adapterCodeSha256: string;
  partitionScriptSha256: string;
  topologyPath: string;
  topologySha256: string;
  stateCode: string;
  selectedPairClassification: typeof QUALIFYING_CLASSIFICATION;
  selectedPairCount: number;
  selectedSampleCount: number;
  selectedSamplesSha256: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value && !value.startsWith("--"), `Invalid argument near ${key ?? "end"}.`);
    assert(!values.has(key.slice(2)), `Duplicate argument ${key}.`);
    values.set(key.slice(2), value);
  }
  const acquisitionId = values.get("acquisition") ?? "";
  const recordedAtValue = values.get("recorded-at") ?? "";
  assert(/^[a-z0-9_-]+$/u.test(acquisitionId), "--acquisition must name a repository acquisition.");
  assert(new Date(recordedAtValue).toISOString() === recordedAtValue, "--recorded-at must be an ISO timestamp.");
  assert(Date.parse(recordedAtValue) <= Date.now(), "--recorded-at cannot be in the future.");
  const unsupported = [...values.keys()].filter((key) => !["acquisition", "recorded-at"].includes(key));
  assert(unsupported.length === 0, `Unsupported arguments: ${unsupported.join(", ")}.`);
  return { acquisitionId, recordedAt: recordedAtValue };
}

function resolveArtifact(
  acquisitionDirectory: string,
  receipt: AcquisitionReceipt,
  role: string,
) {
  const artifact = receipt.artifacts.find((entry) => entry.role === role);
  assert(artifact, `USFWS acquisition lacks ${role}.`);
  const filepath = path.join(acquisitionDirectory, artifact.path);
  assert(existsSync(filepath), `USFWS acquisition artifact is missing: ${artifact.path}.`);
  const bytes = readFileSync(filepath);
  assert(bytes.length === artifact.bytes, `USFWS artifact byte count changed: ${artifact.path}.`);
  assert(sha256(bytes) === artifact.sha256, `USFWS artifact hash changed: ${artifact.path}.`);
  return { artifact, filepath, bytes };
}

function parseRows(bytes: Buffer) {
  const text = gunzipSync(bytes).toString("utf8");
  return text.split("\n").filter(Boolean).map((line, index) => {
    const value = JSON.parse(line) as UsfwsEdnaRow;
    assert(Number.isInteger(value.OBJECTID) && value.OBJECTID > 0, `USFWS retained row ${index} has an invalid OBJECTID.`);
    return value;
  });
}

function runDirectoryContents(runDirectory: string) {
  return new Map(
    [
      "assertions.ndjson",
      "reviews.ndjson",
      "rejections.ndjson",
      "outcomes.ndjson",
      "artifacts/national-acquisition-reference.json",
      "receipt.json",
    ].map((filename) => [filename, readFileSync(path.join(runDirectory, filename), "utf8")]),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const acquisitionDirectory = path.join(ACQUISITIONS_ROOT, options.acquisitionId);
  const acquisitionReceiptPath = path.join(acquisitionDirectory, "receipt.json");
  assert(existsSync(acquisitionReceiptPath), `Unknown USFWS acquisition ${options.acquisitionId}.`);
  const acquisitionReceiptBytes = readFileSync(acquisitionReceiptPath);
  const acquisition = JSON.parse(acquisitionReceiptBytes.toString("utf8")) as AcquisitionReceipt;
  assert(acquisition.acquisitionId === options.acquisitionId, "USFWS acquisition ID and directory differ.");
  assert(acquisition.sourceId === USFWS_EDNA_SOURCE_ID, "USFWS acquisition source differs.");
  assert(
    acquisition.operations.providerPosts === 0 &&
      acquisition.operations.assertionsCreated === 0 &&
      acquisition.operations.publicationMutations === 0 &&
      acquisition.operations.r2Mutations === 0,
    "USFWS coverage acquisition was not provider-write-free and evidence-neutral.",
  );
  const records = resolveArtifact(acquisitionDirectory, acquisition, "source-records");
  const coverageArtifact = resolveArtifact(acquisitionDirectory, acquisition, "coverage-projection");
  const coverage = JSON.parse(coverageArtifact.bytes.toString("utf8")) as UsfwsCoverageResult;
  assert(coverage.rawRows === acquisition.sourceIdentity.objectIdCount, "USFWS coverage row count differs from its pinned object-ID set.");
  const rows = parseRows(records.bytes);
  assert(rows.length === coverage.rawRows, "USFWS retained record count differs from coverage.");
  const selection = selectUsfwsAcceptedSamples(rows, countyResolver());
  assert(selection.accepted.length === coverage.acceptedSamples, "USFWS accepted sample replay differs from coverage.");
  assert(selection.explicitNegativeRows === coverage.explicitNegativeRows, "USFWS explicit-negative replay differs from coverage.");
  assert(selection.duplicateRows === coverage.duplicateRows, "USFWS duplicate replay differs from coverage.");
  assert(stableJson(selection.rejectionReasons) === stableJson(coverage.rejectionReasons), "USFWS rejection replay differs from coverage.");
  assert(stableJson(selection.statusCounts) === stableJson(coverage.statusCounts), "USFWS status replay differs from coverage.");

  const targetBySpeciesId = new Map<string, typeof USFWS_EDNA_TARGETS[number]>(
    USFWS_EDNA_TARGETS.map((target) => [target.speciesId, target]),
  );
  const samplesByCounty = new Map<string, typeof selection.accepted>();
  for (const sample of selection.accepted) {
    const values = samplesByCounty.get(sample.countyFips) ?? [];
    values.push(sample);
    samplesByCounty.set(sample.countyFips, values);
  }
  const qualifyingCoveragePairs = coverage.pairs
    .filter((pair) => pair.classification === QUALIFYING_CLASSIFICATION)
    .sort((left, right) => compareText(left.pairKey, right.pairKey));
  assert(qualifyingCoveragePairs.length === coverage.researchedUnresolvedPairs, "USFWS qualifying pair count differs from coverage.");
  assert(coverage.netNewPairs === 0, "USFWS integration scope changed: net-new pairs now exist.");
  const replayPairs: UsfwsEdnaReplayPair[] = qualifyingCoveragePairs.map((pair) => {
    const county = resolveCountyEquivalent({
      stateCode: pair.stateCode,
      countyFips: pair.countyFips,
    });
    assert(county.status === "resolved", `USFWS pair ${pair.pairKey} has retired or unknown geography.`);
    const state = getStateDefinition(pair.stateCode);
    assert(state?.nationalV1Scope, `USFWS pair ${pair.pairKey} is outside national-v1 scope.`);
    const target = targetBySpeciesId.get(pair.speciesId);
    assert(target?.scientificName === pair.scientificName, `USFWS target contract differs for ${pair.pairKey}.`);
    const samples = [...(samplesByCounty.get(pair.countyFips) ?? [])].sort((left, right) => left.objectId - right.objectId);
    assert(samples.length === pair.sampleCount, `USFWS sample count differs for ${pair.pairKey}.`);
    return {
      stateCode: pair.stateCode,
      stateName: state.stateName,
      countyFips: pair.countyFips,
      countyName: county.county.shortName,
      countyLegalName: county.county.legalName,
      speciesId: pair.speciesId,
      scientificName: pair.scientificName,
      commonName: pair.commonName,
      samples,
    };
  });
  assert(replayPairs.length > 0, "USFWS snapshot has no qualifying researched-unresolved pairs.");

  const registryPath = path.join(RESEARCH_ROOT, "source-registry.json");
  const adapterPath = path.join(ROOT, "scripts/research/adapters/usfws-invasive-carp-edna-snapshot.ts");
  const partitionScriptPath = path.join(ROOT, "scripts/research/partition-usfws-invasive-carp-edna-acquisition.ts");
  const coverageModulePath = path.join(ROOT, "scripts/research/usfws-invasive-carp-edna-coverage.ts");
  const acquisitionRunnerPath = path.join(ROOT, "scripts/research/run-usfws-invasive-carp-edna-coverage.ts");
  const acquisitionCommonPath = path.join(ROOT, "scripts/research/national-usfws-edna-common.ts");
  const parameterSchemaPath = path.join(RESEARCH_ROOT, "schemas/usfws-invasive-carp-edna-snapshot-parameters.schema.json");
  const assertionSchemaPath = path.join(RESEARCH_ROOT, "schemas/evidence-assertion.schema.json");
  const topologyPath = path.join(ROOT, USFWS_EDNA_COORDINATE_TOPOLOGY_PATH);
  const coordinateContractPath = path.join(ROOT, "src/lib/research/coordinate-geography-contract.ts");
  const countyRegistryPath = path.join(RESEARCH_ROOT, "county-equivalent-registry.json");
  const stateRegistryPath = path.join(RESEARCH_ROOT, "state-registry.json");
  const speciesCatalogPath = path.join(ROOT, "src/data/generated/species.json");
  const registry = readJson<ResearchSourceRegistry>(registryPath);
  const source = registry.sources.find((entry) => entry.id === USFWS_EDNA_SOURCE_ID);
  assert(source?.researchAdapter?.id === USFWS_EDNA_ADAPTER_ID, "USFWS research adapter is not registered.");
  assert(source.researchAdapter.allowedVersions.includes(USFWS_EDNA_ADAPTER_VERSION), "USFWS adapter version is not registered.");
  const inputPaths = [
    registryPath,
    adapterPath,
    partitionScriptPath,
    coverageModulePath,
    acquisitionRunnerPath,
    acquisitionCommonPath,
    parameterSchemaPath,
    assertionSchemaPath,
    topologyPath,
    coordinateContractPath,
    countyRegistryPath,
    stateRegistryPath,
    speciesCatalogPath,
    acquisitionReceiptPath,
    records.filepath,
    coverageArtifact.filepath,
  ];
  const snapshot = captureCommittedInputSnapshot(ROOT, inputPaths);
  assert(snapshot.commit !== acquisition.baselineSha, "USFWS partition requires a committed integration checkpoint after acquisition code.");
  assertCommitAncestor(ROOT, acquisition.baselineSha, snapshot.commit);
  const parameterSchema = readJson<Parameters<typeof z.fromJSONSchema>[0]>(parameterSchemaPath);
  const parameterValidator = z.fromJSONSchema(parameterSchema);
  const adapterCodeHash = snapshot.fileHashes.get(adapterPath)!;
  const partitionScriptHash = snapshot.fileHashes.get(partitionScriptPath)!;
  const sourceRegistryHash = snapshot.fileHashes.get(registryPath)!;
  const topologySha256 = snapshot.fileHashes.get(topologyPath)!;
  const acquisitionReceiptSha256 = sha256(acquisitionReceiptBytes);
  const replayCacheRoot = path.join(CACHE_ROOT, options.acquisitionId);
  rmSync(replayCacheRoot, { recursive: true, force: true });
  mkdirSync(replayCacheRoot, { recursive: true });

  const pairsByState = new Map<string, UsfwsEdnaReplayPair[]>();
  for (const pair of replayPairs) {
    const values = pairsByState.get(pair.stateCode) ?? [];
    values.push(pair);
    pairsByState.set(pair.stateCode, values);
  }
  const generatedRuns: Array<{
    runId: string;
    finalDirectory: string;
    stagedDirectory: string;
    receipt: ImmutableResearchRunReceipt;
    contents: Map<string, string>;
  }> = [];

  for (const [stateCode, statePairs] of [...pairsByState.entries()].sort(([left], [right]) => compareText(left, right))) {
    const candidatePairs = statePairs.map((pair) => `${pair.countyFips}:${pair.speciesId}`).sort(compareText);
    const parameters = {
      stateCode,
      mode: "national-acquisition-replay",
      nationalAcquisitionId: options.acquisitionId,
      nationalAcquisitionReceiptSha256: acquisitionReceiptSha256,
      coverageSha256: coverageArtifact.artifact.sha256,
      selectedPairClassification: QUALIFYING_CLASSIFICATION,
      candidatePairs,
    };
    parameterValidator.parse(parameters);
    const parameterHash = sha256(stableJson(parameters));
    const runIdentityHash = sha256(stableJson({
      parameterHash,
      adapterCodeHash,
      partitionScriptHash,
      coverageSha256: coverageArtifact.artifact.sha256,
      recordsSha256: records.artifact.sha256,
      topologySha256,
    }));
    const runId = `${runTimestamp(options.recordedAt)}__${USFWS_EDNA_SOURCE_ID}__${runIdentityHash.slice(0, 12)}`;
    const finalDirectory = path.join(RUNS_ROOT, runId);
    const stagedDirectory = path.join(replayCacheRoot, runId);
    const context = {
      runId,
      sourceId: USFWS_EDNA_SOURCE_ID,
      stateCode,
      requestedPairs: statePairs.map((pair) => ({
        countyFips: pair.countyFips,
        countyName: pair.countyName,
        speciesId: pair.speciesId,
        scientificName: pair.scientificName,
      })),
      runStartedAt: options.recordedAt,
      parameters,
    };
    const result = replayUsfwsEdnaState({
      context,
      pairs: statePairs,
      completedAt: options.recordedAt,
      topologySha256,
      acquisitionUrl: USFWS_EDNA_LAYER_URL,
    });
    const reference: AcquisitionReference = {
      schemaVersion: 1,
      acquisitionId: options.acquisitionId,
      acquisitionReceiptPath: relativeGitPath(ROOT, acquisitionReceiptPath),
      acquisitionReceiptSha256,
      recordsPath: relativeGitPath(ROOT, records.filepath),
      recordsSha256: records.artifact.sha256,
      coveragePath: relativeGitPath(ROOT, coverageArtifact.filepath),
      coverageSha256: coverageArtifact.artifact.sha256,
      sourceId: USFWS_EDNA_SOURCE_ID,
      adapterVersion: USFWS_EDNA_ADAPTER_VERSION,
      adapterCodeSha256: adapterCodeHash,
      partitionScriptSha256: partitionScriptHash,
      topologyPath: USFWS_EDNA_COORDINATE_TOPOLOGY_PATH,
      topologySha256,
      stateCode,
      selectedPairClassification: QUALIFYING_CLASSIFICATION,
      selectedPairCount: result.selectedPairCount,
      selectedSampleCount: result.selectedSampleCount,
      selectedSamplesSha256: result.selectedSamplesSha256,
    };
    const referenceContents = `${JSON.stringify(reference, null, 2)}\n`;
    const outputContents = new Map<string, { contents: string; mediaType: string }>([
      ["assertions.ndjson", { contents: asNdjson(result.assertions), mediaType: "application/x-ndjson" }],
      ["reviews.ndjson", { contents: asNdjson(result.reviews), mediaType: "application/x-ndjson" }],
      ["rejections.ndjson", { contents: asNdjson(result.rejections), mediaType: "application/x-ndjson" }],
      ["outcomes.ndjson", { contents: asNdjson(result.outcomes), mediaType: "application/x-ndjson" }],
    ]);
    const runRelativeDirectory = relativeGitPath(ROOT, finalDirectory);
    const outputs = [...outputContents.entries()].map(([filename, value]) =>
      runFileReference(path.posix.join(runRelativeDirectory, filename), value.contents, value.mediaType)
    );
    const artifacts = [runFileReference(
      path.posix.join(runRelativeDirectory, "artifacts/national-acquisition-reference.json"),
      referenceContents,
      "application/json",
    )];
    const dates = statePairs.flatMap((pair) => pair.samples.map((sample) => sample.collectionDate)).sort(compareText);
    const receipt: ImmutableResearchRunReceipt = {
      schemaVersion: 1,
      run_id: runId,
      status: "complete",
      started_at: options.recordedAt,
      finished_at: options.recordedAt,
      actor_type: "adapter",
      actor_id: `${USFWS_EDNA_ADAPTER_ID}@${USFWS_EDNA_ADAPTER_VERSION}`,
      source_id: USFWS_EDNA_SOURCE_ID,
      source_registry_hash: sourceRegistryHash,
      adapter_id: USFWS_EDNA_ADAPTER_ID,
      adapter_version: USFWS_EDNA_ADAPTER_VERSION,
      adapter_code_hash: adapterCodeHash,
      code_commit: snapshot.commit,
      parameter_hash: parameterHash,
      parameters,
      requested_scope: {
        state_code: stateCode,
        county_fips: [...new Set(statePairs.map((pair) => pair.countyFips))].sort(compareText),
        species_ids: [...new Set(statePairs.map((pair) => pair.speciesId))].sort(compareText),
        pair_keys: candidatePairs,
        date_range: { start: dates[0]!, end: dates.at(-1)! },
      },
      upstream_requests: [],
      artifacts,
      outputs,
      counts: {
        requested_pairs: candidatePairs.length,
        candidate_records: result.candidateRecordCount,
        assertion_events: result.assertions.length,
        review_events: result.reviews.length,
        rejection_records: 0,
        duplicate_records: 0,
        error_count: 0,
        pair_outcomes: result.outcomes.length,
      },
      errors: [],
      known_caveats: [
        source.caveat,
        "The assertion scope is the surveyed sample points and waters, never unsampled county area or verified countywide absence.",
        "Positive eDNA is excluded and never converted to verified presence.",
        "Historical assay and sample-processing changes remain explicit caveats.",
      ],
      source_warnings: result.warnings,
      deviations: [
        "The official national layer was acquired once, then replayed locally without state-specific network requests.",
        "Only pairs classified as researched-unresolved at acquisition time were selected; verified-present overlaps, already-not-detected pairs, and positive labels were excluded.",
        "Qualifying sample rows were aggregated to one not-detected assertion per county-species pair while all raw rows remained in the hash-pinned acquisition.",
        "The source-specific coordinate exception retains the exact committed topology hash and per-assertion coordinate-set hash; the global coordinate-derived geography default remains prohibited.",
      ],
      rerun_command: `& 'C:\\Code\\tools\\node-v22.23.2-win-x64\\node.exe' --import tsx scripts/research/partition-usfws-invasive-carp-edna-acquisition.ts --acquisition ${options.acquisitionId} --recorded-at ${options.recordedAt}`,
    };
    validateResearchRunInMemory({
      root: ROOT,
      sourceId: USFWS_EDNA_SOURCE_ID,
      source,
      stateCode,
      runId,
      requestedPairKeys: candidatePairs,
      result,
      receipt,
      outputContents: new Map([...outputContents.entries()].map(([filename, value]) => [filename, value.contents])),
    });
    const contents = new Map<string, string>([
      ...[...outputContents.entries()].map(([filename, value]) => [filename, value.contents] as const),
      ["artifacts/national-acquisition-reference.json", referenceContents],
      ["receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
    ]);
    mkdirSync(path.join(stagedDirectory, "artifacts"), { recursive: true });
    for (const [filename, value] of contents) writeFileSync(path.join(stagedDirectory, filename), value);
    verifyStagedResearchRun(stagedDirectory, receipt);
    generatedRuns.push({ runId, finalDirectory, stagedDirectory, receipt, contents });
  }

  const totalAssertions = generatedRuns.reduce((sum, run) => sum + run.receipt.counts.assertion_events, 0);
  const totalOutcomes = generatedRuns.reduce((sum, run) => sum + run.receipt.counts.pair_outcomes, 0);
  assert(generatedRuns.length === pairsByState.size, "USFWS generated run count differs from qualifying states.");
  assert(totalAssertions === replayPairs.length && totalOutcomes === replayPairs.length, "USFWS pair integration does not reconcile.");
  const existingBundles = new Map(listImmutableResearchRuns(ROOT).map((bundle) => [bundle.receipt.run_id, bundle]));
  const newRuns: typeof generatedRuns = [];
  for (const run of generatedRuns) {
    if (!existsSync(run.finalDirectory)) {
      newRuns.push(run);
      continue;
    }
    assert(existingBundles.has(run.runId), `Existing run ${run.runId} failed immutable discovery.`);
    const existingContents = runDirectoryContents(run.finalDirectory);
    for (const [filename, value] of run.contents) {
      assert(existingContents.get(filename) === value, `Existing run ${run.runId} differs at ${filename}.`);
    }
  }
  verifyCommittedInputSnapshot(ROOT, snapshot);
  const moved: typeof newRuns = [];
  try {
    mkdirSync(RUNS_ROOT, { recursive: true });
    for (const run of newRuns) {
      assert(!existsSync(run.finalDirectory), `USFWS run appeared during partition: ${run.runId}.`);
      renameSync(run.stagedDirectory, run.finalDirectory);
      moved.push(run);
    }
    const immutableById = new Map(listImmutableResearchRuns(ROOT).map((bundle) => [bundle.receipt.run_id, bundle]));
    generatedRuns.forEach((run) => assert(immutableById.has(run.runId), `USFWS run ${run.runId} is missing.`));
  } catch (error) {
    for (const run of [...moved].reverse()) {
      if (existsSync(run.finalDirectory) && !existsSync(run.stagedDirectory)) {
        renameSync(run.finalDirectory, run.stagedDirectory);
      }
    }
    throw error;
  }
  rmSync(replayCacheRoot, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({
    acquisitionId: options.acquisitionId,
    codeCommit: snapshot.commit,
    runCount: generatedRuns.length,
    newRunCount: newRuns.length,
    states: [...pairsByState.keys()].sort(compareText),
    assertionPairs: totalAssertions,
    outcomes: totalOutcomes,
    selectedSampleRowsAcrossTargets: generatedRuns.reduce((sum, run) => sum + run.receipt.counts.candidate_records, 0),
    positiveAssertions: 0,
    absenceAssertions: 0,
    runIds: generatedRuns.map((run) => run.runId).sort(compareText),
  }, null, 2)}\n`);
}

void main();
