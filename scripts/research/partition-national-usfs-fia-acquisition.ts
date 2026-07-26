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
  FIA_ADAPTER_ID,
  FIA_ADAPTER_VERSION,
  FIA_DATAMART_URL,
  FIA_SOURCE_ID,
  type FiaAcquisitionArtifact,
  type FiaInvasiveReferenceRow,
  type FiaObservationRow,
  type FiaPlantDictionaryRow,
  type NationalFiaReference,
  asNdjson,
  assertCommitAncestor,
  captureCommittedInputSnapshot,
  compareText,
  fiaStateArtifactName,
  parseFiaCsv,
  relativeGitPath,
  runFileReference,
  runTimestamp,
  verifyCommittedInputSnapshot,
  verifyNationalFiaAcquisition,
} from "./national-usfs-fia-common";
import {
  buildFiaTaxonMappings,
  replayNationalFiaState,
} from "./adapters/usfs-fia-invasive-plants";

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
  validateImmutableResearchRunDirectory,
  validateResearchRunInMemory,
  verifyStagedResearchRun,
} from "@/lib/research/validate-run";

const ROOT = process.cwd();
const RESEARCH_ROOT = path.join(ROOT, "src/data/research");
const RUNS_ROOT = path.join(RESEARCH_ROOT, "runs");
const ACQUISITIONS_ROOT = path.join(
  RESEARCH_ROOT,
  "national-acquisitions",
);
const CACHE_ROOT = path.join(
  ROOT,
  ".cache/research/national-usfs-fia-partitions",
);

type StateRegistry = {
  jurisdictions: Array<{
    stateCode: string;
    stateFips: string;
    stateName: string;
    nationalV1Scope: boolean;
  }>;
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
    assert(
      flag?.startsWith("--") && value && !value.startsWith("--"),
      `Invalid argument sequence near ${flag ?? "end of arguments"}.`,
    );
    const key = flag.slice(2);
    assert(!values.has(key), `Duplicate argument --${key}.`);
    values.set(key, value);
  }
  const unsupported = [...values.keys()].filter(
    (key) =>
      ![
        "acquisition",
        "states",
        "recorded-at",
        "plan-only",
        "species",
        "include-pair-keys",
      ].includes(key),
  );
  assert(
    unsupported.length === 0,
    `Unsupported arguments: ${unsupported.join(", ")}.`,
  );
  const acquisitionId = values.get("acquisition") ?? "";
  assert(
    /^[a-z0-9.-]+(?:__[a-z0-9.-]+)*$/.test(acquisitionId),
    "--acquisition is invalid.",
  );
  const stateArgument = values.get("states") ?? "";
  assert(stateArgument.length > 0, "--states is required.");
  const recordedAtValue = values.get("recorded-at") ?? "";
  const recordedMilliseconds = Date.parse(recordedAtValue);
  assert(
    Number.isFinite(recordedMilliseconds),
    "--recorded-at must be an ISO date-time.",
  );
  assert(
    recordedMilliseconds <= Date.now(),
    "--recorded-at cannot be in the future.",
  );
  const planOnlyValue = values.get("plan-only") ?? "false";
  assert(
    planOnlyValue === "true" || planOnlyValue === "false",
    "--plan-only must be true or false.",
  );
  const includePairKeysValue = values.get("include-pair-keys") ?? "false";
  assert(
    includePairKeysValue === "true" || includePairKeysValue === "false",
    "--include-pair-keys must be true or false.",
  );
  const speciesArgument = values.get("species") ?? "ALL";
  return {
    acquisitionId,
    stateArgument,
    recordedAt: new Date(recordedMilliseconds).toISOString(),
    planOnly: planOnlyValue === "true",
    includePairKeys: includePairKeysValue === "true",
    speciesArgument,
  };
}

function readJson<T>(filepath: string) {
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
    `FIA staged run file set differs: ${actual.join(", ")}.`,
  );
}

function findArtifact(
  artifacts: FiaAcquisitionArtifact[],
  predicate: (entry: FiaAcquisitionArtifact) => boolean,
  label: string,
) {
  const matches = artifacts.filter(predicate);
  assert(matches.length === 1, `Expected one FIA ${label}, found ${matches.length}.`);
  return matches[0]!;
}

function schemaValidator(filename: string) {
  const schema = readJson<Parameters<typeof z.fromJSONSchema>[0]>(
    path.join(RESEARCH_ROOT, "schemas", filename),
  );
  return z.fromJSONSchema(schema);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const acquisitionDirectory = path.join(
    ACQUISITIONS_ROOT,
    options.acquisitionId,
  );
  const acquisition = verifyNationalFiaAcquisition(
    ROOT,
    acquisitionDirectory,
  );
  const registryPath = path.join(RESEARCH_ROOT, "source-registry.json");
  const adapterPath = path.join(
    ROOT,
    "scripts/research/adapters/usfs-fia-invasive-plants.ts",
  );
  const commonPath = path.join(
    ROOT,
    "scripts/research/national-usfs-fia-common.ts",
  );
  const partitionPath = path.join(
    ROOT,
    "scripts/research/partition-national-usfs-fia-acquisition.ts",
  );
  const parameterSchemaPath = path.join(
    RESEARCH_ROOT,
    "schemas/usfs-fia-invasive-plants-parameters.schema.json",
  );
  const receiptSchemaPath = path.join(
    RESEARCH_ROOT,
    "schemas/run-receipt.schema.json",
  );
  const sourceVerificationSchemaPath = path.join(
    RESEARCH_ROOT,
    "schemas/worker-source-verification.schema.json",
  );
  const referenceSchemaPath = path.join(
    RESEARCH_ROOT,
    "schemas/national-usfs-fia-reference.schema.json",
  );
  const stateRegistryPath = path.join(RESEARCH_ROOT, "state-registry.json");
  const countyRegistryPath = path.join(
    RESEARCH_ROOT,
    "county-equivalent-registry.json",
  );
  const speciesCatalogPath = path.join(
    ROOT,
    "src/data/generated/species.json",
  );
  const registry = readJson<ResearchSourceRegistry>(registryPath);
  const source = registry.sources.find((entry) => entry.id === FIA_SOURCE_ID);
  assert(source?.researchAdapter, "FIA research adapter is not registered.");
  assert(
    source.researchAdapter.id === FIA_ADAPTER_ID &&
      source.researchAdapter.allowedVersions.includes(FIA_ADAPTER_VERSION),
    "FIA adapter identity or version is not registered.",
  );
  assert(
    source.researchAdapter.parameterSchema ===
      relativeGitPath(ROOT, parameterSchemaPath),
    "FIA parameter schema registration changed.",
  );
  assert(
    source.negativeSemantics === "none",
    "FIA source must not support negative evidence.",
  );
  const stateRegistry = readJson<StateRegistry>(stateRegistryPath);
  const nationalStates = stateRegistry.jurisdictions
    .filter((entry) => entry.nationalV1Scope)
    .sort((left, right) => compareText(left.stateCode, right.stateCode));
  const requestedStates = options.stateArgument === "ALL"
    ? nationalStates
        .filter((entry) => entry.stateCode !== "DC")
        .map((entry) => entry.stateCode)
    : [...new Set(
        options.stateArgument
          .split(",")
          .map((entry) => entry.trim().toUpperCase())
          .filter(Boolean),
      )].sort(compareText);
  assert(requestedStates.length > 0, "No FIA states were selected.");
  for (const stateCode of requestedStates) {
    assert(stateCode !== "DC", "FIA DC delivery is unavailable and remains blocked.");
    assert(
      nationalStates.some((entry) => entry.stateCode === stateCode),
      `FIA state ${stateCode} is outside national v1.`,
    );
  }
  const invasiveArtifact = findArtifact(
    acquisition.receipt.artifacts,
    (entry) => entry.role === "invasive-reference",
    "invasive reference",
  );
  const dictionaryArtifact = findArtifact(
    acquisition.receipt.artifacts,
    (entry) => entry.role === "plant-dictionary",
    "plant dictionary",
  );
  const requestedStateArtifacts = requestedStates.map((stateCode) =>
    findArtifact(
      acquisition.receipt.artifacts,
      (entry) =>
        entry.role === "state-observations" &&
        entry.state_code === stateCode,
      `${stateCode} observation artifact`,
    )
  );
  const inputPaths = [
    registryPath,
    adapterPath,
    commonPath,
    partitionPath,
    parameterSchemaPath,
    receiptSchemaPath,
    sourceVerificationSchemaPath,
    referenceSchemaPath,
    stateRegistryPath,
    countyRegistryPath,
    speciesCatalogPath,
    acquisition.receiptPath,
    path.join(ROOT, invasiveArtifact.path),
    path.join(ROOT, dictionaryArtifact.path),
    ...requestedStateArtifacts.map((entry) => path.join(ROOT, entry.path)),
  ];
  const snapshot = captureCommittedInputSnapshot(ROOT, inputPaths);
  assert(
    snapshot.commit !== acquisition.receipt.code_commit,
    "FIA partition requires a committed acquisition checkpoint first.",
  );
  assertCommitAncestor(
    ROOT,
    acquisition.receipt.code_commit,
    snapshot.commit,
  );
  const sourceRegistryHash = snapshot.fileHashes.get(registryPath)!;
  const adapterCodeHash = snapshot.fileHashes.get(adapterPath)!;
  const partitionScriptHash = snapshot.fileHashes.get(partitionPath)!;
  const parameterValidator = schemaValidator(
    "usfs-fia-invasive-plants-parameters.schema.json",
  );
  const referenceValidator = schemaValidator(
    "national-usfs-fia-reference.schema.json",
  );
  const sourceVerificationValidator = schemaValidator(
    "worker-source-verification.schema.json",
  );
  const catalog = readJson<Species[]>(speciesCatalogPath);
  const invasiveRows = parseFiaCsv<FiaInvasiveReferenceRow>(
    readFileSync(path.join(ROOT, invasiveArtifact.path)),
  );
  const dictionaryRows = parseFiaCsv<FiaPlantDictionaryRow>(
    readFileSync(path.join(ROOT, dictionaryArtifact.path)),
  );
  const replayCacheRoot = path.join(
    CACHE_ROOT,
    options.acquisitionId,
    snapshot.commit,
  );
  if (!options.planOnly) {
    rmSync(replayCacheRoot, { recursive: true, force: true });
    mkdirSync(replayCacheRoot, { recursive: true });
  }
  const generatedRuns: Array<{
    runId: string;
    stateCode: string;
    finalDirectory: string;
    stagedDirectory: string;
    receipt: ImmutableResearchRunReceipt;
    contents: Map<string, string>;
  }> = [];
  const skippedStates: Array<{
    stateCode: string;
    reason: string;
    stateInvasiveSymbols: number;
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
          { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 },
        );
        assert(
          sha256(committed) === snapshot.fileHashes.get(filepath),
          `Existing FIA receipt commit ${commit} differs at ${relativePath}.`,
        );
      }
      verifiedReusableCommits.add(commit);
    }
    return commit;
  }

  for (const stateCode of requestedStates) {
    const state = getStateDefinition(stateCode)!;
    const stateArtifact = requestedStateArtifacts.find(
      (entry) => entry.state_code === stateCode,
    )!;
    const observationRows = parseFiaCsv<FiaObservationRow>(
      readFileSync(path.join(ROOT, stateArtifact.path)),
    );
    const fullMapping = buildFiaTaxonMappings({
      stateFips: state.stateFips,
      catalog,
      dictionaryRows,
      invasiveReferenceRows: invasiveRows,
    });
    if (fullMapping.mappings.length === 0) {
      skippedStates.push({
        stateCode,
        reason:
          "No state-listed FIA invasive symbol has a one-to-one exact catalog scientific-name match.",
        stateInvasiveSymbols:
          fullMapping.reconciliation.state_invasive_symbols,
      });
      continue;
    }
    const requestedSpeciesIds = options.speciesArgument === "ALL"
      ? null
      : [...new Set(
          options.speciesArgument
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        )].sort(compareText);
    assert(
      requestedSpeciesIds === null || requestedSpeciesIds.length > 0,
      "--species must be ALL or a comma-separated list of catalog species IDs.",
    );
    const fullMappedSpecies = new Set(
      fullMapping.mappings.map((entry) => entry.speciesId),
    );
    if (requestedSpeciesIds) {
      const missingSpecies = requestedSpeciesIds.filter(
        (speciesId) => !fullMappedSpecies.has(speciesId),
      );
      assert(
        missingSpecies.length === 0,
        `${stateCode} FIA scope does not map requested species: ${missingSpecies.join(", ")}.`,
      );
    }
    const selectedMappings = requestedSpeciesIds
      ? fullMapping.mappings.filter((entry) =>
          requestedSpeciesIds.includes(entry.speciesId)
        )
      : fullMapping.mappings;
    const selectedDistinctSpecies = new Set(
      selectedMappings.map((entry) => entry.speciesId),
    ).size;
    const mapping = {
      mappings: selectedMappings,
      reconciliation: {
        ...fullMapping.reconciliation,
        selected_exact_catalog_mappings: selectedMappings.length,
        selected_distinct_catalog_species: selectedDistinctSpecies,
      },
    };
    const counties = listCountyEquivalents(stateCode);
    const applicableSpecies = [...new Map(
      mapping.mappings.map((entry) => [
        entry.speciesId,
        {
          speciesId: entry.speciesId,
          scientificName: entry.scientificName,
        },
      ]),
    ).values()].sort(
      (left, right) => compareText(left.speciesId, right.speciesId),
    );
    const requestedPairs = counties
      .flatMap((county) =>
        applicableSpecies.map((entry) => ({
          countyFips: county.countyFips,
          countyName: county.legalName,
          speciesId: entry.speciesId,
          scientificName: entry.scientificName,
        }))
      )
      .sort(
        (left, right) =>
          compareText(left.countyFips, right.countyFips) ||
          compareText(left.speciesId, right.speciesId),
      );
    const candidatePairs = requestedPairs.map(
      (entry) => `${entry.countyFips}:${entry.speciesId}`,
    );
    assert(
      candidatePairs.length <= 100_000,
      `${stateCode} FIA pair scope exceeds the parameter limit.`,
    );
    const parameters = {
      stateCode,
      mode: "national-snapshot-replay",
      nationalAcquisitionId: options.acquisitionId,
      nationalAcquisitionReceiptSha256: acquisition.receiptSha256,
      snapshotDate: acquisition.receipt.parameters.snapshotDate,
      stateArtifactSha256: stateArtifact.sha256,
      invasiveReferenceSha256: invasiveArtifact.sha256,
      plantDictionarySha256: dictionaryArtifact.sha256,
      candidateLimit: candidatePairs.length,
      candidatePairs,
    };
    parameterValidator.parse(parameters);
    const parameterHash = sha256(stableJson(parameters));
    const runIdentityHash = sha256(
      stableJson({
        parameterHash,
        adapterCodeHash,
        partitionScriptHash,
      }),
    );
    const runId =
      `${runTimestamp(options.recordedAt)}__${FIA_SOURCE_ID}__${runIdentityHash.slice(0, 12)}`;
    const finalDirectory = path.join(RUNS_ROOT, runId);
    const stagedDirectory = path.join(replayCacheRoot, runId);
    const context = {
      runId,
      sourceId: FIA_SOURCE_ID,
      stateCode,
      requestedPairs,
      runStartedAt: options.recordedAt,
      parameters,
    };
    const result = replayNationalFiaState({
      context,
      observationRows,
      mappings: mapping.mappings,
      mappingReconciliation: mapping.reconciliation,
      completedAt: options.recordedAt,
      headerOnly: stateArtifact.row_count === 0,
    });
    const reference: NationalFiaReference = {
      schemaVersion: 1,
      acquisitionId: options.acquisitionId,
      acquisitionReceiptPath: relativeGitPath(
        ROOT,
        acquisition.receiptPath,
      ),
      acquisitionReceiptSha256: acquisition.receiptSha256,
      snapshotDate: acquisition.receipt.parameters.snapshotDate,
      sourceId: FIA_SOURCE_ID,
      stateCode,
      stateArtifact: {
        path: stateArtifact.path,
        sha256: stateArtifact.sha256,
        bytes: stateArtifact.bytes,
        rowCount: stateArtifact.row_count,
      },
      invasiveReference: {
        path: invasiveArtifact.path,
        sha256: invasiveArtifact.sha256,
        bytes: invasiveArtifact.bytes,
        rowCount: invasiveArtifact.row_count,
      },
      plantDictionary: {
        path: dictionaryArtifact.path,
        sha256: dictionaryArtifact.sha256,
        bytes: dictionaryArtifact.bytes,
        rowCount: dictionaryArtifact.row_count,
      },
      adapterVersion: FIA_ADAPTER_VERSION,
      adapterCodeSha256: adapterCodeHash,
      partitionScriptSha256: partitionScriptHash,
      partitionMode:
        "exact-state-county-codes-and-exact-taxon-no-coordinate-fallback",
      selectedRowsSha256: result.selectedRowsSha256,
      mappings: result.mappings,
      mappingReconciliation: mapping.reconciliation,
      replayReconciliation: result.reconciliation,
    };
    referenceValidator.parse(reference);
    const referenceContents = `${JSON.stringify(reference, null, 2)}\n`;
    const runRelativeDirectory = relativeGitPath(ROOT, finalDirectory);
    const artifactReference = runFileReference(
      path.posix.join(
        runRelativeDirectory,
        "artifacts/national-acquisition-reference.json",
      ),
      referenceContents,
      "application/json",
    );
    const sourceVerification = {
      schemaVersion: 1,
      verifiedAt: options.recordedAt,
      runId,
      sourceId: FIA_SOURCE_ID,
      stateCode,
      pairKeys: candidatePairs,
      parameterHash,
      authority: {
        name: "USDA Forest Service Forest Inventory and Analysis",
        sourceUrl: FIA_DATAMART_URL,
        publisher: "USDA Forest Service",
      },
      terms: {
        license:
          "No dataset-specific machine-readable license surfaced; official Forest Service data-use terms and citation retained",
        termsUrl: acquisition.receipt.source_verification.terms_url,
        retentionAllowed: true,
      },
      availability: {
        status: stateArtifact.row_count === 0 ? "blocked" : "available",
        checkedAt: options.recordedAt,
        freshnessDate: null,
      },
      geography: {
        method:
          "Explicit FIA STATECD plus zero-padded COUNTYCD matched the active county-equivalent registry.",
        countyEquivalentSupported: true,
        coordinatePolicy:
          "Coordinates and automatic retired-geography crosswalks are prohibited.",
      },
      taxonomy: {
        method:
          "Each state-listed FIA symbol resolves through the retained plant dictionary to the same exact catalog scientific name. Multiple exact source symbols may converge on one catalog species.",
        targetSpeciesIds: applicableSpecies.map((entry) => entry.speciesId),
      },
      acquisition: {
        snapshotComplete: stateArtifact.row_count > 0,
        paginationComplete: stateArtifact.row_count > 0,
        stableIdentityFields: ["CN"],
        requests: [],
      },
      negativeEvidence: {
        supportsVerifiedAbsence: false,
        supportsNotDetected: false,
        limitations: [
          "FIA is a sampled plot detection source. Missing rows are source silence only.",
          "No output from this adapter may claim verified absence or survey non-detection.",
        ],
      },
      retainedEvidence: [
        {
          path: artifactReference.path,
          sha256: artifactReference.sha256,
          bytes: artifactReference.bytes,
        },
      ],
      caveats: [
        source.caveat,
        "The current delivery retrieval date is known, but the underlying observation freshness has no one source-wide date.",
        ...(stateArtifact.row_count === 0
          ? [
              "The state artifact is header-only, so applicable pairs remain blocked.",
            ]
          : []),
      ],
    };
    sourceVerificationValidator.parse(sourceVerification);
    const sourceVerificationContents =
      `${JSON.stringify(sourceVerification, null, 2)}\n`;
    const outputContents = new Map<string, {
      contents: string;
      mediaType: string;
    }>([
      [
        "assertions.ndjson",
        {
          contents: asNdjson(result.assertions),
          mediaType: "application/x-ndjson",
        },
      ],
      [
        "reviews.ndjson",
        {
          contents: asNdjson(result.reviews),
          mediaType: "application/x-ndjson",
        },
      ],
      [
        "rejections.ndjson",
        {
          contents: asNdjson(result.rejections),
          mediaType: "application/x-ndjson",
        },
      ],
      [
        "outcomes.ndjson",
        {
          contents: asNdjson(result.outcomes),
          mediaType: "application/x-ndjson",
        },
      ],
      [
        "source-verification.json",
        {
          contents: sourceVerificationContents,
          mediaType: "application/json",
        },
      ],
    ]);
    const outputs = [...outputContents.entries()].map(([filename, value]) =>
      runFileReference(
        path.posix.join(runRelativeDirectory, filename),
        value.contents,
        value.mediaType,
      )
    );
    const receipt: ImmutableResearchRunReceipt = {
      schemaVersion: 1,
      run_id: runId,
      status: result.outcomes.every((entry) => entry.scope_complete) &&
          result.errors.length === 0
        ? "complete"
        : "partial",
      started_at: options.recordedAt,
      finished_at: options.recordedAt,
      actor_type: "adapter",
      actor_id: `${FIA_ADAPTER_ID}@${FIA_ADAPTER_VERSION}`,
      source_id: FIA_SOURCE_ID,
      source_registry_hash: sourceRegistryHash,
      adapter_id: FIA_ADAPTER_ID,
      adapter_version: FIA_ADAPTER_VERSION,
      adapter_code_hash: adapterCodeHash,
      code_commit: receiptCodeCommit(finalDirectory),
      parameter_hash: parameterHash,
      parameters,
      requested_scope: {
        state_code: stateCode,
        county_fips: counties.map((entry) => entry.countyFips).sort(compareText),
        species_ids: applicableSpecies.map((entry) => entry.speciesId),
        pair_keys: candidatePairs,
        date_range: { start: null, end: null },
      },
      upstream_requests: [],
      artifacts: [artifactReference],
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
        "Complete source silence changes research status only and never establishes absence or non-detection.",
        "Underlying observation freshness has no one source-wide date.",
      ],
      source_warnings: result.warnings,
      deviations: [
        "The national FIA delivery was acquired once and partitioned locally without state-specific network requests.",
        "Only exact state-listed symbol, dictionary, catalog, and active county matches may publish.",
        "Coordinates and automatic retired-geography crosswalks were not used.",
      ],
      rerun_command:
        `npm run research:partition:usfs-fia-national -- --acquisition ${options.acquisitionId} --states ${stateCode} --species ${options.speciesArgument} --recorded-at ${options.recordedAt}`,
    };
    const validationResult: SourceAdapterResult = {
      ...result,
      artifacts: [
        {
          filename: "national-acquisition-reference.json",
          contents: referenceContents,
          mediaType: "application/json",
        },
      ],
    };
    validateResearchRunInMemory({
      root: ROOT,
      sourceId: FIA_SOURCE_ID,
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
      ["receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
    ]);
    if (!options.planOnly) {
      mkdirSync(path.join(stagedDirectory, "artifacts"), { recursive: true });
      for (const [filename, value] of contents) {
        writeFileSync(path.join(stagedDirectory, filename), value);
      }
      exactFileSet(stagedDirectory, [...contents.keys()]);
      verifyStagedResearchRun(stagedDirectory, receipt);
    }
    generatedRuns.push({
      runId,
      stateCode,
      finalDirectory,
      stagedDirectory,
      receipt,
      contents,
    });
  }
  assert(
    generatedRuns.length > 0,
    "Selected FIA states produced no exact catalog mappings.",
  );
  const expectedOutcomes = generatedRuns.reduce(
    (total, entry) => total + entry.receipt.counts.requested_pairs,
    0,
  );
  const actualOutcomes = generatedRuns.reduce(
    (total, entry) => total + entry.receipt.counts.pair_outcomes,
    0,
  );
  assert(
    expectedOutcomes === actualOutcomes,
    "FIA requested-pair and outcome totals differ.",
  );
  if (options.planOnly) {
    verifyCommittedInputSnapshot(ROOT, snapshot);
    console.log(
      JSON.stringify(
        {
          acquisitionId: options.acquisitionId,
          recordedAt: options.recordedAt,
          planOnly: true,
          stateCodes: generatedRuns.map((entry) => entry.stateCode),
          skippedStates,
          generatedRunCount: generatedRuns.length,
          requestedPairs: expectedOutcomes,
          candidateRecords: generatedRuns.reduce(
            (total, entry) => total + entry.receipt.counts.candidate_records,
            0,
          ),
          assertions: generatedRuns.reduce(
            (total, entry) => total + entry.receipt.counts.assertion_events,
            0,
          ),
          reviews: generatedRuns.reduce(
            (total, entry) => total + entry.receipt.counts.review_events,
            0,
          ),
          rejectionEvents: generatedRuns.reduce(
            (total, entry) => total + entry.receipt.counts.rejection_records,
            0,
          ),
          duplicateRecords: generatedRuns.reduce(
            (total, entry) => total + entry.receipt.counts.duplicate_records,
            0,
          ),
          outcomes: actualOutcomes,
          blockedOutcomes: generatedRuns.reduce((total, run) => {
            return total + run.contents
              .get("outcomes.ndjson")!
              .split("\n")
              .filter(Boolean)
              .map((line) => JSON.parse(line) as { status: string })
              .filter((entry) => entry.status === "blocked").length;
          }, 0),
          runs: generatedRuns.map((run) => ({
            stateCode: run.stateCode,
            runId: run.runId,
            outputPath: relativeGitPath(ROOT, run.finalDirectory),
            requestedPairs: run.receipt.counts.requested_pairs,
            candidateRecords: run.receipt.counts.candidate_records,
            assertions: run.receipt.counts.assertion_events,
            reviews: run.receipt.counts.review_events,
            rejections: run.receipt.counts.rejection_records,
            duplicateRecords: run.receipt.counts.duplicate_records,
            outcomes: run.receipt.counts.pair_outcomes,
            speciesIds: run.receipt.requested_scope.species_ids,
            outputBytes: [...run.contents.values()].reduce(
              (total, value) => total + Buffer.byteLength(value),
              0,
            ),
            ...(options.includePairKeys
              ? { pairKeys: run.receipt.requested_scope.pair_keys }
              : {}),
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  const existingBundles = new Map(
    listImmutableResearchRuns(ROOT).map((bundle) => [
      bundle.receipt.run_id,
      bundle,
    ]),
  );
  const newRuns = generatedRuns.filter((run) => {
    if (!existsSync(run.finalDirectory)) return true;
    assert(
      existingBundles.has(run.runId),
      `Existing FIA run ${run.runId} failed immutable discovery.`,
    );
    const existing = directoryContents(run.finalDirectory);
    assert(
      stableJson([...existing.entries()].sort()) ===
        stableJson([...run.contents.entries()].sort()),
      `Existing FIA run ${run.runId} differs from deterministic replay.`,
    );
    return false;
  });
  verifyCommittedInputSnapshot(ROOT, snapshot);
  const moved: typeof newRuns = [];
  try {
    mkdirSync(RUNS_ROOT, { recursive: true });
    for (const run of newRuns) {
      assert(!existsSync(run.finalDirectory), `FIA run appeared: ${run.runId}.`);
      renameSync(run.stagedDirectory, run.finalDirectory);
      moved.push(run);
    }
    for (const run of generatedRuns) {
      validateImmutableResearchRunDirectory({
        repositoryRoot: ROOT,
        validationRoot: ROOT,
        runDirectory: run.finalDirectory,
        sourceVerificationPath: path.join(
          run.finalDirectory,
          "source-verification.json",
        ),
        expected: {
          runId: run.runId,
          sourceId: FIA_SOURCE_ID,
          stateCode: run.stateCode,
          pairKeys: run.receipt.requested_scope.pair_keys,
          codeCommit: run.receipt.code_commit,
        },
      });
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
  console.log(
    JSON.stringify(
      {
        acquisitionId: options.acquisitionId,
        stateCodes: generatedRuns.map((entry) => entry.stateCode),
        skippedStates,
        generatedRunCount: generatedRuns.length,
        newRunCount: newRuns.length,
        existingRunCount: generatedRuns.length - newRuns.length,
        requestedPairs: expectedOutcomes,
        candidateRecords: generatedRuns.reduce(
          (total, entry) =>
            total + entry.receipt.counts.candidate_records,
          0,
        ),
        assertions: generatedRuns.reduce(
          (total, entry) =>
            total + entry.receipt.counts.assertion_events,
          0,
        ),
        reviews: generatedRuns.reduce(
          (total, entry) => total + entry.receipt.counts.review_events,
          0,
        ),
        rejectionEvents: generatedRuns.reduce(
          (total, entry) =>
            total + entry.receipt.counts.rejection_records,
          0,
        ),
        duplicateRecords: generatedRuns.reduce(
          (total, entry) =>
            total + entry.receipt.counts.duplicate_records,
          0,
        ),
        outcomes: actualOutcomes,
        blockedOutcomes: generatedRuns.reduce((total, run) => {
          return total + run.contents
            .get("outcomes.ndjson")!
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line) as { status: string })
            .filter((entry) => entry.status === "blocked").length;
        }, 0),
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
