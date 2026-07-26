import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  type AfpeMappingFile,
  AFPE_MAPPING_PATH,
  AFPE_MAPPING_VERSION,
  type NationalAfpeReference,
  asNdjson,
  assertCommitAncestor,
  captureCommittedInputSnapshot,
  compareText,
  inspectNationalAfpeArchive,
  readAfpeMapping,
  relativeGitPath,
  runFileReference,
  runTimestamp,
  validateNationalAfpeReference,
  verifyCommittedInputSnapshot,
  verifyNationalAfpeAcquisition,
} from "./national-usfs-afpe-common";
import {
  AFPE_ADAPTER_ID,
  AFPE_ADAPTER_VERSION,
  AFPE_ARCHIVE_URL,
  AFPE_ARCHIVE_VERSION,
  AFPE_SOURCE_ID,
  replayNationalAfpeState,
} from "./adapters/usfs-afpe-archive";

import type {
  ImmutableResearchRunReceipt,
  ResearchSourceRegistry,
} from "@/lib/research/types";
import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import {
  getStateDefinition,
  listCountyEquivalents,
} from "@/lib/research/geography-registry";
import {
  listImmutableResearchRuns,
  sha256,
  stableJson,
} from "@/lib/research/run-files";
import {
  validateResearchRunInMemory,
  verifyStagedResearchRun,
} from "@/lib/research/validate-run";

const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, "src/data/research");
const RUNS_ROOT = path.join(RESEARCH_DIR, "runs");
const ACQUISITIONS_ROOT = path.join(RESEARCH_DIR, "national-acquisitions");
const CACHE_ROOT = path.join(
  ROOT,
  ".cache/research/national-usfs-afpe-partitions",
);

type StateRegistry = {
  jurisdictions: Array<{
    stateCode: string;
    stateFips: string;
    stateName: string;
    nationalV1Scope: boolean;
  }>;
};

type StateConfig = {
  states: Array<{
    stateCode: string;
    speciesScope: {
      mode: "catalog-all" | "sparse-default";
      applicabilityPath: string;
    };
  }>;
};

type StateApplicability = {
  stateCode: string;
  species: Array<{ speciesId: string }>;
};

type Species = {
  id: string;
  scientificName: string;
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
    !["acquisition", "states", "recorded-at"].includes(key)
  );
  assert(unsupported.length === 0, `Unsupported arguments: ${unsupported.join(", ")}.`);
  const acquisitionId = values.get("acquisition") ?? "";
  assert(/^[a-z0-9.-]+(?:__[a-z0-9.-]+)*$/.test(acquisitionId), "--acquisition is invalid.");
  const stateArgument = values.get("states") ?? "";
  assert(stateArgument.length > 0, "--states is required.");
  const recordedValue = values.get("recorded-at") ?? "";
  const recordedMilliseconds = Date.parse(recordedValue);
  assert(Number.isFinite(recordedMilliseconds), "--recorded-at must be an ISO date-time.");
  assert(recordedMilliseconds <= Date.now(), "--recorded-at cannot be in the future.");
  return {
    acquisitionId,
    stateArgument,
    recordedAt: new Date(recordedMilliseconds).toISOString(),
  };
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function directoryContents(directory: string, prefix = ""): Map<string, string> {
  const contents = new Map<string, string>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [filename, value] of directoryContents(absolute, relative)) {
        contents.set(filename, value);
      }
    } else {
      contents.set(relative, readFileSync(absolute, "utf8"));
    }
  }
  return contents;
}

function exactFileSet(directory: string, expected: string[]) {
  const actual = [...directoryContents(directory).keys()].sort(compareText);
  assert(
    stableJson(actual) === stableJson([...expected].sort(compareText)),
    `AFPE staged run file set differs: ${actual.join(", ")}.`,
  );
}

function mappingCatalogGate(mapping: AfpeMappingFile, catalog: Species[]) {
  const catalogById = new Map(catalog.map((species) => [species.id, species]));
  for (const entry of mapping.mappings) {
    assert(
      catalogById.get(entry.speciesId)?.scientificName === entry.scientificName,
      `AFPE mapping differs from the catalog for ${entry.speciesId}.`,
    );
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const registryPath = path.join(RESEARCH_DIR, "source-registry.json");
  const adapterPath = path.join(
    ROOT,
    "scripts/research/adapters/usfs-afpe-archive.ts",
  );
  const partitionScriptPath = path.join(
    ROOT,
    "scripts/research/partition-national-usfs-afpe-acquisition.ts",
  );
  const commonPath = path.join(
    ROOT,
    "scripts/research/national-usfs-afpe-common.ts",
  );
  const parameterSchemaPath = path.join(
    RESEARCH_DIR,
    "schemas/usfs-afpe-archive-parameters.schema.json",
  );
  const receiptSchemaPath = path.join(
    RESEARCH_DIR,
    "schemas/run-receipt.schema.json",
  );
  const acquisitionSchemaPath = path.join(
    RESEARCH_DIR,
    "schemas/national-usfs-afpe-acquisition-receipt.schema.json",
  );
  const referenceSchemaPath = path.join(
    RESEARCH_DIR,
    "schemas/national-usfs-afpe-reference.schema.json",
  );
  const stateRegistryPath = path.join(RESEARCH_DIR, "state-registry.json");
  const countyRegistryPath = path.join(
    RESEARCH_DIR,
    "county-equivalent-registry.json",
  );
  const stateConfigPath = path.join(
    RESEARCH_DIR,
    "state-research-config.json",
  );
  const speciesCatalogPath = path.join(ROOT, "src/data/generated/species.json");
  const mappingPath = path.join(ROOT, AFPE_MAPPING_PATH);
  const acquisitionDirectory = path.join(
    ACQUISITIONS_ROOT,
    options.acquisitionId,
  );
  const acquisition = verifyNationalAfpeAcquisition(ROOT, acquisitionDirectory);
  const registry = readJson<ResearchSourceRegistry>(registryPath);
  const source = registry.sources.find((entry) => entry.id === AFPE_SOURCE_ID);
  assert(source?.researchAdapter, "AFPE research adapter is not registered.");
  assert(
    source.researchAdapter.id === AFPE_ADAPTER_ID &&
      source.researchAdapter.allowedVersions.includes(AFPE_ADAPTER_VERSION),
    "AFPE adapter identity or version is not registered.",
  );
  assert(
    source.researchAdapter.parameterSchema ===
      relativeGitPath(ROOT, parameterSchemaPath),
    "AFPE parameter schema registration changed.",
  );
  const stateRegistry = readJson<StateRegistry>(stateRegistryPath);
  const nationalStates = stateRegistry.jurisdictions
    .filter((entry) => entry.nationalV1Scope)
    .sort((left, right) => compareText(left.stateCode, right.stateCode));
  const requestedStates = options.stateArgument === "ALL"
    ? nationalStates.map((entry) => entry.stateCode)
    : [...new Set(
        options.stateArgument
          .split(",")
          .map((entry) => entry.trim().toUpperCase())
          .filter(Boolean),
      )].sort(compareText);
  assert(requestedStates.length > 0, "No AFPE states were selected.");
  for (const stateCode of requestedStates) {
    assert(
      nationalStates.some((entry) => entry.stateCode === stateCode),
      `AFPE state ${stateCode} is outside national v1.`,
    );
  }
  const stateConfig = readJson<StateConfig>(stateConfigPath);
  const applicabilityPaths: string[] = [];
  const applicableByState = new Map<string, Set<string>>();
  const mapping = readAfpeMapping(ROOT);
  const catalog = readJson<Species[]>(speciesCatalogPath);
  mappingCatalogGate(mapping, catalog);
  for (const stateCode of requestedStates) {
    const config = stateConfig.states.find((entry) => entry.stateCode === stateCode);
    assert(config, `Missing research config for ${stateCode}.`);
    if (config.speciesScope.mode === "catalog-all") {
      applicableByState.set(
        stateCode,
        new Set(mapping.mappings.map((entry) => entry.speciesId)),
      );
      continue;
    }
    assert(
      config.speciesScope.applicabilityPath,
      `Explicit state ${stateCode} lacks applicability.`,
    );
    const filepath = path.join(ROOT, config.speciesScope.applicabilityPath);
    const applicability = readJson<StateApplicability>(filepath);
    assert(
      applicability.stateCode === stateCode,
      `Applicability path disagrees for ${stateCode}.`,
    );
    applicabilityPaths.push(filepath);
    applicableByState.set(
      stateCode,
      new Set(applicability.species.map((entry) => entry.speciesId)),
    );
    for (const entry of mapping.mappings) {
      assert(
        applicableByState.get(stateCode)!.has(entry.speciesId),
        `AFPE taxon ${entry.speciesId} is not applicable in ${stateCode}.`,
      );
    }
  }
  const inputPaths = [
    registryPath,
    adapterPath,
    partitionScriptPath,
    commonPath,
    parameterSchemaPath,
    receiptSchemaPath,
    acquisitionSchemaPath,
    referenceSchemaPath,
    stateRegistryPath,
    countyRegistryPath,
    stateConfigPath,
    speciesCatalogPath,
    mappingPath,
    ...applicabilityPaths,
    acquisition.receiptPath,
    acquisition.archivePath,
  ];
  const snapshot = captureCommittedInputSnapshot(ROOT, inputPaths);
  assert(
    snapshot.commit !== acquisition.receipt.code_commit,
    "AFPE partition requires a committed acquisition checkpoint first.",
  );
  assertCommitAncestor(ROOT, acquisition.receipt.code_commit, snapshot.commit);
  const parameterSchema = JSON.parse(
    readFileSync(parameterSchemaPath, "utf8"),
  ) as Parameters<typeof z.fromJSONSchema>[0];
  const parameterValidator = z.fromJSONSchema(parameterSchema);
  const adapterCodeHash = snapshot.fileHashes.get(adapterPath)!;
  const partitionScriptHash = snapshot.fileHashes.get(partitionScriptPath)!;
  const sourceRegistryHash = snapshot.fileHashes.get(registryPath)!;
  const mappingSha256 = snapshot.fileHashes.get(mappingPath)!;
  const archive = inspectNationalAfpeArchive(acquisition.archivePath);
  for (const entry of mapping.mappings) {
    assert(
      archive.dictionaryByField.get(entry.columnId) === entry.sourceLabel,
      `AFPE dictionary label changed for ${entry.columnId}.`,
    );
  }

  const replayCacheRoot = path.join(
    CACHE_ROOT,
    options.acquisitionId,
    snapshot.commit,
  );
  rmSync(replayCacheRoot, { recursive: true, force: true });
  mkdirSync(replayCacheRoot, { recursive: true });
  const generatedRuns: Array<{
    runId: string;
    finalDirectory: string;
    stagedDirectory: string;
    receipt: ImmutableResearchRunReceipt;
    contents: Map<string, string>;
  }> = [];
  const verifiedReusableCommits = new Set<string>();

  function receiptCodeCommit(finalDirectory: string) {
    if (!existsSync(finalDirectory)) return snapshot.commit;
    const existing = readJson<ImmutableResearchRunReceipt>(
      path.join(finalDirectory, "receipt.json"),
    );
    const commit = existing.code_commit;
    assertCommitAncestor(ROOT, commit, snapshot.commit);
    if (!verifiedReusableCommits.has(commit)) {
      for (const filepath of inputPaths) {
        const relativePath = relativeGitPath(ROOT, filepath);
        const committed = execFileSync(
          "git",
          ["show", `${commit}:${relativePath}`],
          { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 },
        );
        assert(
          sha256(committed) === snapshot.fileHashes.get(filepath),
          `Existing AFPE receipt commit ${commit} differs at ${relativePath}.`,
        );
      }
      verifiedReusableCommits.add(commit);
    }
    return commit;
  }

  for (const stateCode of requestedStates) {
    const state = nationalStates.find((entry) => entry.stateCode === stateCode)!;
    const counties = listCountyEquivalents(stateCode);
    const requestedPairs = counties.flatMap((county) =>
      mapping.mappings.map((entry) => ({
        countyFips: county.countyFips,
        countyName: county.shortName,
        speciesId: entry.speciesId,
        scientificName: entry.scientificName,
      }))
    ).sort(
      (left, right) =>
        compareText(left.countyFips, right.countyFips) ||
        compareText(left.speciesId, right.speciesId),
    );
    const candidatePairs = requestedPairs.map((pair) =>
      `${pair.countyFips}:${pair.speciesId}`
    );
    const parameters = {
      stateCode,
      mode: "national-archive-replay",
      nationalAcquisitionId: options.acquisitionId,
      nationalAcquisitionReceiptSha256: acquisition.receiptSha256,
      archiveVersion: AFPE_ARCHIVE_VERSION,
      mappingVersion: AFPE_MAPPING_VERSION,
      mappingSha256,
      candidateLimit: candidatePairs.length,
      candidatePairs,
      sourceDataLastUpdated: "2023-04",
    };
    parameterValidator.parse(parameters);
    const parameterHash = sha256(stableJson(parameters));
    const runIdentityHash = sha256(stableJson({
      parameterHash,
      adapterCodeHash,
      partitionScriptHash,
      mappingSha256,
    }));
    const runId =
      `${runTimestamp(options.recordedAt)}__${AFPE_SOURCE_ID}__${runIdentityHash.slice(0, 12)}`;
    const finalDirectory = path.join(RUNS_ROOT, runId);
    const stagedDirectory = path.join(replayCacheRoot, runId);
    const codeCommit = receiptCodeCommit(finalDirectory);
    const context = {
      runId,
      sourceId: AFPE_SOURCE_ID,
      stateCode,
      requestedPairs,
      runStartedAt: options.recordedAt,
      parameters,
    };
    const stateRows = archive.rows.filter((row) => row.STATE === state.stateFips);
    const result = replayNationalAfpeState({
      context,
      rows: stateRows,
      mappings: mapping.mappings,
      completedAt: options.recordedAt,
      archiveUrl: AFPE_ARCHIVE_URL,
    });
    const reference: NationalAfpeReference = {
      schemaVersion: 1,
      acquisitionId: options.acquisitionId,
      acquisitionReceiptPath: relativeGitPath(ROOT, acquisition.receiptPath),
      acquisitionReceiptSha256: acquisition.receiptSha256,
      archiveVersion: AFPE_ARCHIVE_VERSION,
      archivePath: relativeGitPath(ROOT, acquisition.archivePath),
      archiveSha256: acquisition.receipt.artifact.sha256,
      archiveBytes: acquisition.receipt.artifact.bytes,
      mappingPath: AFPE_MAPPING_PATH,
      mappingVersion: AFPE_MAPPING_VERSION,
      mappingSha256,
      sourceId: AFPE_SOURCE_ID,
      adapterVersion: AFPE_ADAPTER_VERSION,
      adapterCodeSha256: adapterCodeHash,
      partitionScriptSha256: partitionScriptHash,
      stateCode,
      partitionMode: "exact-current-fips-binary-cell-no-crosswalk",
      selectedRowsSha256: result.selectedRowsSha256,
      reconciliation: result.reconciliation,
    };
    validateNationalAfpeReference(ROOT, reference);
    const referenceContents = `${JSON.stringify(reference, null, 2)}\n`;
    const sourceVerificationContents = `${JSON.stringify({
      schemaVersion: 1,
      sourceId: AFPE_SOURCE_ID,
      stateCode,
      acquisitionId: options.acquisitionId,
      acquisitionReceiptSha256: acquisition.receiptSha256,
      verifiedAt: options.recordedAt,
      snapshot: {
        archiveVersion: AFPE_ARCHIVE_VERSION,
        archiveSha256: acquisition.receipt.artifact.sha256,
        archiveBytes: acquisition.receipt.artifact.bytes,
        sourceDataLastUpdated: acquisition.receipt.archive.source_data_last_updated,
        license: acquisition.receipt.archive.license,
        doi: acquisition.receipt.archive.doi,
      },
      policies: acquisition.receipt.source_verification,
      stateReconciliation: result.reconciliation,
    }, null, 2)}\n`;
    const outputContents = new Map<string, {
      contents: string;
      mediaType: string;
    }>([
      ["assertions.ndjson", {
        contents: asNdjson(result.assertions),
        mediaType: "application/x-ndjson",
      }],
      ["reviews.ndjson", {
        contents: asNdjson(result.reviews),
        mediaType: "application/x-ndjson",
      }],
      ["rejections.ndjson", {
        contents: asNdjson(result.rejections),
        mediaType: "application/x-ndjson",
      }],
      ["outcomes.ndjson", {
        contents: asNdjson(result.outcomes),
        mediaType: "application/x-ndjson",
      }],
    ]);
    const runRelativeDirectory = relativeGitPath(ROOT, finalDirectory);
    const outputs = [...outputContents.entries()].map(([filename, value]) =>
      runFileReference(
        path.posix.join(runRelativeDirectory, filename),
        value.contents,
        value.mediaType,
      )
    );
    const artifacts = [
      runFileReference(
        path.posix.join(
          runRelativeDirectory,
          "artifacts/national-acquisition-reference.json",
        ),
        referenceContents,
        "application/json",
      ),
      runFileReference(
        path.posix.join(
          runRelativeDirectory,
          "artifacts/source-verification.json",
        ),
        sourceVerificationContents,
        "application/json",
      ),
    ];
    const receipt: ImmutableResearchRunReceipt = {
      schemaVersion: 1,
      run_id: runId,
      status: result.outcomes.every((entry) => entry.scope_complete)
        ? "complete"
        : "partial",
      started_at: options.recordedAt,
      finished_at: options.recordedAt,
      actor_type: "adapter",
      actor_id: `${AFPE_ADAPTER_ID}@${AFPE_ADAPTER_VERSION}`,
      source_id: AFPE_SOURCE_ID,
      source_registry_hash: sourceRegistryHash,
      adapter_id: AFPE_ADAPTER_ID,
      adapter_version: AFPE_ADAPTER_VERSION,
      adapter_code_hash: adapterCodeHash,
      code_commit: codeCommit,
      parameter_hash: parameterHash,
      parameters,
      requested_scope: {
        state_code: stateCode,
        county_fips: counties.map((county) => county.countyFips).sort(compareText),
        species_ids: mapping.mappings.map((entry) => entry.speciesId).sort(compareText),
        pair_keys: candidatePairs,
        date_range: { start: null, end: null },
      },
      upstream_requests: [],
      artifacts,
      outputs,
      counts: {
        requested_pairs: requestedPairs.length,
        candidate_records: result.candidateRecordCount,
        assertion_events: result.assertions.length,
        review_events: result.reviews.length,
        rejection_records: result.rejections.length,
        duplicate_records: result.duplicateRecordCount,
        error_count: result.errors.length,
        pair_outcomes: result.outcomes.length,
      },
      errors: result.errors,
      known_caveats: [
        source.caveat,
        "AFPE v1.0 is stale historical evidence and does not satisfy a current-source readiness gate.",
        "A value of 0 supports only a completed no-qualifying-evidence source screen, never verified absence or not-detected.",
      ],
      source_warnings: result.warnings,
      deviations: [
        "The CC0 national archive was acquired once and partitioned locally without state-specific network requests.",
        "Only 13 versioned, manually reviewed DCA mappings were processed.",
        "Retired, abolished, superseded, missing, and unknown FIPS were never crosswalked automatically.",
      ],
      rerun_command:
        `npm run research:partition:usfs-afpe-national -- --acquisition ${options.acquisitionId} --states ${stateCode} --recorded-at ${options.recordedAt}`,
    };
    const validationResult: SourceAdapterResult = {
      ...result,
      artifacts: [
        {
          filename: "national-acquisition-reference.json",
          contents: referenceContents,
          mediaType: "application/json",
        },
        {
          filename: "source-verification.json",
          contents: sourceVerificationContents,
          mediaType: "application/json",
        },
      ],
    };
    validateResearchRunInMemory({
      root: ROOT,
      sourceId: AFPE_SOURCE_ID,
      source,
      stateCode,
      runId,
      requestedPairKeys: candidatePairs,
      result: validationResult,
      receipt,
      outputContents: new Map(
        [...outputContents.entries()].map(([filename, value]) => [
          filename,
          value.contents,
        ]),
      ),
    });
    const contents = new Map<string, string>([
      ...[...outputContents.entries()].map(([filename, value]) =>
        [filename, value.contents] as const
      ),
      ["artifacts/national-acquisition-reference.json", referenceContents],
      ["artifacts/source-verification.json", sourceVerificationContents],
      ["receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
    ]);
    mkdirSync(path.join(stagedDirectory, "artifacts"), { recursive: true });
    for (const [filename, value] of contents) {
      writeFileSync(path.join(stagedDirectory, filename), value);
    }
    exactFileSet(stagedDirectory, [...contents.keys()]);
    verifyStagedResearchRun(stagedDirectory, receipt);
    generatedRuns.push({
      runId,
      finalDirectory,
      stagedDirectory,
      receipt,
      contents,
    });
  }

  const expectedOutcomes = requestedStates.reduce(
    (total, stateCode) =>
      total + listCountyEquivalents(stateCode).length * mapping.mappings.length,
    0,
  );
  const actualOutcomes = generatedRuns.reduce(
    (total, run) => total + run.receipt.counts.pair_outcomes,
    0,
  );
  assert(
    actualOutcomes === expectedOutcomes,
    `AFPE expected ${expectedOutcomes} outcomes, generated ${actualOutcomes}.`,
  );
  const existingBundles = new Map(
    listImmutableResearchRuns(ROOT).map((bundle) => [
      bundle.receipt.run_id,
      bundle,
    ]),
  );
  const newRuns: typeof generatedRuns = [];
  for (const run of generatedRuns) {
    if (!existsSync(run.finalDirectory)) {
      newRuns.push(run);
      continue;
    }
    assert(
      existingBundles.has(run.runId),
      `Existing AFPE run ${run.runId} failed immutable discovery.`,
    );
    const existingContents = directoryContents(run.finalDirectory);
    assert(
      stableJson([...existingContents.entries()].sort()) ===
        stableJson([...run.contents.entries()].sort()),
      `Existing AFPE run ${run.runId} differs from deterministic replay.`,
    );
  }
  verifyCommittedInputSnapshot(ROOT, snapshot);
  const moved: typeof newRuns = [];
  try {
    mkdirSync(RUNS_ROOT, { recursive: true });
    for (const run of newRuns) {
      assert(!existsSync(run.finalDirectory), `AFPE run appeared: ${run.runId}.`);
      renameSync(run.stagedDirectory, run.finalDirectory);
      moved.push(run);
    }
    const immutableById = new Map(
      listImmutableResearchRuns(ROOT).map((bundle) => [
        bundle.receipt.run_id,
        bundle,
      ]),
    );
    for (const run of generatedRuns) {
      assert(immutableById.has(run.runId), `AFPE run ${run.runId} is missing.`);
    }
  } catch (error) {
    for (const run of [...moved].reverse()) {
      if (existsSync(run.finalDirectory) && !existsSync(run.stagedDirectory)) {
        renameSync(run.finalDirectory, run.stagedDirectory);
      }
    }
    throw error;
  }
  rmSync(replayCacheRoot, { recursive: true, force: true });
  const summary = {
    acquisitionId: options.acquisitionId,
    stateCodes: requestedStates,
    generatedRunCount: generatedRuns.length,
    newRunCount: newRuns.length,
    existingRunCount: generatedRuns.length - newRuns.length,
    requestedPairs: generatedRuns.reduce(
      (total, run) => total + run.receipt.counts.requested_pairs,
      0,
    ),
    candidateRecords: generatedRuns.reduce(
      (total, run) => total + run.receipt.counts.candidate_records,
      0,
    ),
    assertions: generatedRuns.reduce(
      (total, run) => total + run.receipt.counts.assertion_events,
      0,
    ),
    reviews: generatedRuns.reduce(
      (total, run) => total + run.receipt.counts.review_events,
      0,
    ),
    rejectionEvents: generatedRuns.reduce(
      (total, run) => total + run.receipt.counts.rejection_records,
      0,
    ),
    duplicateRecords: generatedRuns.reduce(
      (total, run) => total + run.receipt.counts.duplicate_records,
      0,
    ),
    outcomes: actualOutcomes,
    blockedOutcomes: generatedRuns.reduce((total, run) => {
      const outcomes = run.contents.get("outcomes.ndjson")!
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { status: string });
      return total + outcomes.filter((entry) => entry.status === "blocked").length;
    }, 0),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
