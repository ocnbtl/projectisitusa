import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  USGS_NAS_ADAPTER_ID,
  USGS_NAS_ADAPTER_VERSION,
  USGS_NAS_SELECTED_RECORD_BUDGET_PER_PARTITION,
  USGS_NAS_SELECTED_RECORD_BUDGET_PER_SCREEN,
  USGS_NAS_SOURCE_ID,
  type NasArchiveOccurrence,
  type NationalNasPlan,
  type NationalNasReference,
  asNdjson,
  assertCommitAncestor,
  canonicalBinomial,
  canonicalNasArchiveUrl,
  captureCommittedInputSnapshot,
  compareText,
  nationalNasRecordAppliesToScreen,
  relativeGitPath,
  runFileReference,
  runTimestamp,
  streamNationalNasOccurrences,
  validateNationalNasPlan,
  validateNationalNasReference,
  verifyCommittedInputSnapshot,
  verifyNationalNasAcquisition,
} from "./national-usgs-nas-common";
import {
  type NasRequestedPair,
  replayNationalNasScreen,
} from "./adapters/usgs-nas-archive";

import { getStateDefinition, listCountyEquivalents } from "@/lib/research/geography-registry";
import { listImmutableResearchRuns, sha256, stableJson } from "@/lib/research/run-files";
import type { ImmutableResearchRunReceipt, ResearchSourceRegistry } from "@/lib/research/types";
import { validateResearchRunInMemory, verifyStagedResearchRun } from "@/lib/research/validate-run";

const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, "src/data/research");
const RUNS_ROOT = path.join(RESEARCH_DIR, "runs");
const NATIONAL_ROOT = path.join(RESEARCH_DIR, "national-acquisitions");
const CACHE_ROOT = path.join(ROOT, ".cache/research/national-usgs-nas-partitions");
type SpeciesCatalogEntry = { id: string; scientificName: string };
type StateResearchConfig = {
  states: Array<{
    stateCode: string;
    speciesScope: { mode: string; applicabilityPath: string | null };
  }>;
};
type StateApplicability = {
  stateCode: string;
  species: Array<{ speciesId: string; applicability: string }>;
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
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid argument sequence near ${flag ?? "end of arguments"}.`);
    }
    const key = flag.slice(2);
    assert(!values.has(key), `Duplicate argument --${key}.`);
    values.set(key, value);
  }
  const acquisitionId = values.get("acquisition") ?? "";
  const planId = values.get("plan") ?? "";
  const recordedAtValue = values.get("recorded-at") ?? "";
  const recordedAtMilliseconds = Date.parse(recordedAtValue);
  const stateCodes = (values.get("states") ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .sort(compareText);
  assert(acquisitionId.length > 0, "--acquisition is required.");
  assert(/^[a-z0-9-]+$/.test(planId), "--plan must name a repository acquisition plan.");
  assert(recordedAtValue.length > 0 && !Number.isNaN(recordedAtMilliseconds), "--recorded-at must be an ISO date-time.");
  assert(recordedAtMilliseconds <= Date.now(), "--recorded-at cannot be in the future.");
  const recordedAt = new Date(recordedAtMilliseconds).toISOString();
  assert(stateCodes.length > 0, "--states must contain at least one state.");
  assert(new Set(stateCodes).size === stateCodes.length, "--states contains duplicates.");
  const unsupported = [...values.keys()].filter((key) => !["acquisition", "plan", "states", "recorded-at"].includes(key));
  assert(unsupported.length === 0, `Unsupported arguments: ${unsupported.join(", ")}.`);
  return { acquisitionId, planId, stateCodes, recordedAt };
}

function runDirectoryContents(runDirectory: string) {
  const filenames = [
    "assertions.ndjson",
    "reviews.ndjson",
    "rejections.ndjson",
    "outcomes.ndjson",
    "artifacts/national-acquisition-reference.json",
    "receipt.json",
  ];
  return new Map(
    filenames.map((filename) => [filename, readFileSync(path.join(runDirectory, filename), "utf8")]),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const acquisitionDirectory = path.join(NATIONAL_ROOT, options.acquisitionId);
  const acquisition = await verifyNationalNasAcquisition(ROOT, acquisitionDirectory, false);
  const planPath = path.join(RESEARCH_DIR, "national-acquisition-plans", `${options.planId}.json`);
  const plan = readJson<NationalNasPlan>(planPath);
  validateNationalNasPlan(ROOT, plan);
  assert(plan.planId === options.planId, "USGS NAS plan ID and filename disagree.");
  assert(plan.archiveVersion === acquisition.receipt.parameters.archiveVersion, "USGS NAS plan and archive versions differ.");

  const registryPath = path.join(RESEARCH_DIR, "source-registry.json");
  const adapterPath = path.join(ROOT, "scripts/research/adapters/usgs-nas-archive.ts");
  const partitionScriptPath = path.join(ROOT, "scripts/research/partition-national-usgs-nas-acquisition.ts");
  const commonPath = path.join(ROOT, "scripts/research/national-usgs-nas-common.ts");
  const parameterSchemaPath = path.join(RESEARCH_DIR, "schemas/usgs-nas-archive-parameters.schema.json");
  const runReceiptSchemaPath = path.join(RESEARCH_DIR, "schemas/run-receipt.schema.json");
  const acquisitionReceiptSchemaPath = path.join(RESEARCH_DIR, "schemas/national-usgs-nas-acquisition-receipt.schema.json");
  const referenceSchemaPath = path.join(RESEARCH_DIR, "schemas/national-usgs-nas-reference.schema.json");
  const planSchemaPath = path.join(RESEARCH_DIR, "schemas/national-usgs-nas-plan.schema.json");
  const stateRegistryPath = path.join(RESEARCH_DIR, "state-registry.json");
  const countyRegistryPath = path.join(RESEARCH_DIR, "county-equivalent-registry.json");
  const stateConfigPath = path.join(RESEARCH_DIR, "state-research-config.json");
  const speciesCatalogPath = path.join(ROOT, "src/data/generated/species.json");

  const registry = readJson<ResearchSourceRegistry>(registryPath);
  const source = registry.sources.find((entry) => entry.id === USGS_NAS_SOURCE_ID);
  assert(source?.researchAdapter?.id === USGS_NAS_ADAPTER_ID, "USGS NAS research adapter is not registered.");
  assert(
    source.researchAdapter.allowedVersions.includes(USGS_NAS_ADAPTER_VERSION),
    `USGS NAS adapter ${USGS_NAS_ADAPTER_VERSION} is not registered.`,
  );
  const stateConfig = readJson<StateResearchConfig>(stateConfigPath);
  const configByState = new Map(stateConfig.states.map((entry) => [entry.stateCode, entry]));
  const applicabilityPaths: string[] = [];
  const applicableByState = new Map<string, Set<string>>();
  for (const stateCode of options.stateCodes) {
    const state = getStateDefinition(stateCode);
    assert(state?.nationalV1Scope, `Unknown national-v1 state ${stateCode}.`);
    const config = configByState.get(stateCode);
    assert(
      config?.speciesScope.mode === "explicit" && config.speciesScope.applicabilityPath,
      `${stateCode} lacks explicit applicability.`,
    );
    const filepath = path.join(ROOT, config.speciesScope.applicabilityPath);
    const applicability = readJson<StateApplicability>(filepath);
    assert(applicability.stateCode === stateCode, `Applicability file does not match ${stateCode}.`);
    applicabilityPaths.push(filepath);
    applicableByState.set(
      stateCode,
      new Set(
        applicability.species
          .filter((entry) => entry.applicability === "applicable")
          .map((entry) => entry.speciesId),
      ),
    );
  }
  const selectedScreens = plan.screens.filter((screen) => options.stateCodes.includes(screen.stateCode));
  assert(selectedScreens.length > 0, "Requested states have no screens in the USGS NAS plan.");
  for (const stateCode of options.stateCodes) {
    assert(selectedScreens.some((screen) => screen.stateCode === stateCode), `${stateCode} has no USGS NAS plan screen.`);
  }
  const catalogById = new Map(
    readJson<SpeciesCatalogEntry[]>(speciesCatalogPath).map((entry) => [entry.id, entry]),
  );
  for (const screen of selectedScreens) {
    const catalog = catalogById.get(screen.speciesId);
    assert(catalog?.scientificName === screen.scientificName, `USGS NAS plan taxon differs from catalog for ${screen.speciesId}.`);
    assert(applicableByState.get(screen.stateCode)?.has(screen.speciesId), `USGS NAS plan taxon ${screen.speciesId} is not applicable in ${screen.stateCode}.`);
  }

  const inputPaths = [
    registryPath,
    adapterPath,
    partitionScriptPath,
    commonPath,
    parameterSchemaPath,
    runReceiptSchemaPath,
    acquisitionReceiptSchemaPath,
    referenceSchemaPath,
    planSchemaPath,
    stateRegistryPath,
    countyRegistryPath,
    stateConfigPath,
    speciesCatalogPath,
    planPath,
    ...applicabilityPaths,
    acquisition.receiptPath,
    acquisition.archivePath,
  ];
  const snapshot = captureCommittedInputSnapshot(ROOT, inputPaths);
  assert(snapshot.commit !== acquisition.receipt.code_commit, "USGS NAS partition requires a committed acquisition checkpoint first.");
  assertCommitAncestor(ROOT, acquisition.receipt.code_commit, snapshot.commit);
  const parameterSchema = JSON.parse(readFileSync(parameterSchemaPath, "utf8")) as Parameters<typeof z.fromJSONSchema>[0];
  const parameterValidator = z.fromJSONSchema(parameterSchema);
  const adapterCodeHash = snapshot.fileHashes.get(adapterPath)!;
  const partitionScriptHash = snapshot.fileHashes.get(partitionScriptPath)!;
  const sourceRegistryHash = snapshot.fileHashes.get(registryPath)!;
  const planSha256 = snapshot.fileHashes.get(planPath)!;

  const screenKey = (stateCode: string, scientificName: string) =>
    `${stateCode}:${canonicalBinomial(scientificName)}`;
  const recordsByScreen = new Map(
    selectedScreens.map((screen) => [screenKey(screen.stateCode, screen.scientificName), [] as NasArchiveOccurrence[]]),
  );
  let selectedRecordCount = 0;
  const screensByTaxon = new Map<string, typeof selectedScreens>();
  for (const screen of selectedScreens) {
    const key = canonicalBinomial(screen.scientificName);
    const values = screensByTaxon.get(key) ?? [];
    values.push(screen);
    screensByTaxon.set(key, values);
  }
  const archiveRecordCount = await streamNationalNasOccurrences(acquisition.archivePath, (record) => {
    const matchingScreens = screensByTaxon.get(canonicalBinomial(record.scientificName)) ?? [];
    for (const screen of matchingScreens) {
      if (!nationalNasRecordAppliesToScreen({
        recordStateProvince: record.stateProvince,
        recordScientificName: record.scientificName,
        screenStateCode: screen.stateCode,
        screenScientificName: screen.scientificName,
      })) continue;
      const values = recordsByScreen.get(screenKey(screen.stateCode, screen.scientificName))!;
      assert(
        values.length < USGS_NAS_SELECTED_RECORD_BUDGET_PER_SCREEN,
        `USGS NAS screen ${screen.stateCode}:${screen.speciesId} exceeds its ${USGS_NAS_SELECTED_RECORD_BUDGET_PER_SCREEN}-record memory budget.`,
      );
      assert(
        selectedRecordCount < USGS_NAS_SELECTED_RECORD_BUDGET_PER_PARTITION,
        `USGS NAS partition exceeds its ${USGS_NAS_SELECTED_RECORD_BUDGET_PER_PARTITION}-record memory budget.`,
      );
      values.push(record);
      selectedRecordCount += 1;
    }
  });
  assert(
    archiveRecordCount === acquisition.receipt.archive.record_count,
    `USGS NAS archive expected ${acquisition.receipt.archive.record_count} rows, streamed ${archiveRecordCount}.`,
  );

  const replayCacheRoot = path.join(CACHE_ROOT, options.acquisitionId, options.planId);
  rmSync(replayCacheRoot, { recursive: true, force: true });
  mkdirSync(replayCacheRoot, { recursive: true });
  const generatedRuns: Array<{
    runId: string;
    finalDirectory: string;
    stagedDirectory: string;
    receipt: ImmutableResearchRunReceipt;
    contents: Map<string, string>;
  }> = [];

  for (const screen of selectedScreens) {
    const state = getStateDefinition(screen.stateCode)!;
    const counties = listCountyEquivalents(screen.stateCode);
    const requestedPairs: NasRequestedPair[] = counties.map((county) => ({
      countyFips: county.countyFips,
      countyName: county.shortName,
      countyLegalName: county.legalName,
      stateCode: screen.stateCode,
      stateName: state.stateName,
      speciesId: screen.speciesId,
      scientificName: screen.scientificName,
    }));
    const candidatePairs = requestedPairs.map((pair) => `${pair.countyFips}:${pair.speciesId}`);
    const parameters = {
      stateCode: screen.stateCode,
      mode: "national-archive-replay",
      nationalAcquisitionId: options.acquisitionId,
      nationalAcquisitionReceiptSha256: acquisition.receiptSha256,
      archiveVersion: acquisition.receipt.parameters.archiveVersion,
      planId: plan.planId,
      candidateLimit: candidatePairs.length,
      candidatePairs,
      acceptedOccurrenceStatuses: plan.acceptedOccurrenceStatuses,
    };
    parameterValidator.parse(parameters);
    const parameterHash = sha256(stableJson(parameters));
    const runIdentityHash = sha256(stableJson({
      parameterHash,
      adapterCodeHash,
      partitionScriptHash,
      planSha256,
    }));
    const runId = `${runTimestamp(options.recordedAt)}__${USGS_NAS_SOURCE_ID}__${runIdentityHash.slice(0, 12)}`;
    const finalDirectory = path.join(RUNS_ROOT, runId);
    const stagedDirectory = path.join(replayCacheRoot, runId);
    const context = {
      runId,
      sourceId: USGS_NAS_SOURCE_ID,
      stateCode: screen.stateCode,
      requestedPairs: requestedPairs.map((pair) => ({
        countyFips: pair.countyFips,
        countyName: pair.countyName,
        speciesId: pair.speciesId,
        scientificName: pair.scientificName,
      })),
      runStartedAt: options.recordedAt,
      parameters,
    };
    const result = replayNationalNasScreen({
      context,
      requestedPairs,
      records: recordsByScreen.get(screenKey(screen.stateCode, screen.scientificName)) ?? [],
      acceptedOccurrenceStatuses: plan.acceptedOccurrenceStatuses,
      completedAt: options.recordedAt,
      archiveUrl: canonicalNasArchiveUrl(acquisition.receipt.parameters.archiveVersion),
    });
    const reference: NationalNasReference = {
      schemaVersion: 1,
      acquisitionId: options.acquisitionId,
      acquisitionReceiptPath: relativeGitPath(ROOT, acquisition.receiptPath),
      acquisitionReceiptSha256: acquisition.receiptSha256,
      archiveVersion: acquisition.receipt.parameters.archiveVersion,
      archivePath: relativeGitPath(ROOT, acquisition.archivePath),
      archiveSha256: acquisition.receipt.artifact.sha256,
      archiveBytes: acquisition.receipt.artifact.bytes,
      planPath: relativeGitPath(ROOT, planPath),
      planSha256,
      sourceId: USGS_NAS_SOURCE_ID,
      adapterVersion: USGS_NAS_ADAPTER_VERSION,
      adapterCodeSha256: adapterCodeHash,
      partitionScriptSha256: partitionScriptHash,
      stateCode: screen.stateCode,
      speciesId: screen.speciesId,
      scientificName: screen.scientificName,
      partitionMode: "exact-state-county-name-and-status-no-coordinate-fallback",
      selectedRowsSha256: result.selectedRowsSha256,
      reconciliation: result.reconciliation,
    };
    validateNationalNasReference(ROOT, reference);
    const referenceContents = `${JSON.stringify(reference, null, 2)}\n`;
    const outputContents = new Map<string, { contents: string; mediaType: string }>([
      ["assertions.ndjson", { contents: asNdjson(result.assertions), mediaType: "application/x-ndjson" }],
      ["reviews.ndjson", { contents: asNdjson(result.reviews), mediaType: "application/x-ndjson" }],
      ["rejections.ndjson", { contents: asNdjson(result.rejections), mediaType: "application/x-ndjson" }],
      ["outcomes.ndjson", { contents: asNdjson(result.outcomes), mediaType: "application/x-ndjson" }],
    ]);
    const runRelativeDirectory = relativeGitPath(ROOT, finalDirectory);
    const outputs = [...outputContents.entries()].map(([filename, value]) =>
      runFileReference(path.posix.join(runRelativeDirectory, filename), value.contents, value.mediaType),
    );
    const artifacts = [
      runFileReference(
        path.posix.join(runRelativeDirectory, "artifacts/national-acquisition-reference.json"),
        referenceContents,
        "application/json",
      ),
    ];
    const receipt: ImmutableResearchRunReceipt = {
      schemaVersion: 1,
      run_id: runId,
      status: result.outcomes.every((entry) => entry.scope_complete) ? "complete" : "partial",
      started_at: options.recordedAt,
      finished_at: options.recordedAt,
      actor_type: "adapter",
      actor_id: `${USGS_NAS_ADAPTER_ID}@${USGS_NAS_ADAPTER_VERSION}`,
      source_id: USGS_NAS_SOURCE_ID,
      source_registry_hash: sourceRegistryHash,
      adapter_id: USGS_NAS_ADAPTER_ID,
      adapter_version: USGS_NAS_ADAPTER_VERSION,
      adapter_code_hash: adapterCodeHash,
      code_commit: snapshot.commit,
      parameter_hash: parameterHash,
      parameters,
      requested_scope: {
        state_code: screen.stateCode,
        county_fips: counties.map((county) => county.countyFips),
        species_ids: [screen.speciesId],
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
        "Only exact collected or established rows passed this bounded plan's positive-evidence gate.",
        "The complete archive screen can support researched-unresolved outcomes but never verified absence or not-detected.",
      ],
      source_warnings: result.warnings,
      deviations: [
        "The versioned national archive was acquired once, then streamed locally and partitioned without state-specific network requests.",
        "Qualifying raw records were aggregated to one assertion per county-species pair while every raw row remained in the hash-pinned archive.",
        "The explicit partition recorded-at value is the deterministic logical timestamp for this offline replay and both receipt boundaries.",
      ],
      rerun_command: `npm run research:partition:usgs-nas-national -- --acquisition ${options.acquisitionId} --plan ${options.planId} --states ${screen.stateCode} --recorded-at ${options.recordedAt}`,
    };
    validateResearchRunInMemory({
      root: ROOT,
      sourceId: USGS_NAS_SOURCE_ID,
      source,
      stateCode: screen.stateCode,
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

  const expectedOutcomeCount = selectedScreens.reduce(
    (sum, screen) => sum + listCountyEquivalents(screen.stateCode).length,
    0,
  );
  const totalOutcomes = generatedRuns.reduce((sum, run) => sum + run.receipt.counts.pair_outcomes, 0);
  assert(generatedRuns.length === selectedScreens.length, "USGS NAS generated run count differs from plan screens.");
  assert(totalOutcomes === expectedOutcomeCount, `Expected ${expectedOutcomeCount} outcomes, generated ${totalOutcomes}.`);
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
      assert(!existsSync(run.finalDirectory), `Run appeared during partition: ${run.runId}.`);
      renameSync(run.stagedDirectory, run.finalDirectory);
      moved.push(run);
    }
    const immutableById = new Map(listImmutableResearchRuns(ROOT).map((bundle) => [bundle.receipt.run_id, bundle]));
    generatedRuns.forEach((run) => assert(immutableById.has(run.runId), `Run ${run.runId} is missing.`));
  } catch (error) {
    for (const run of [...moved].reverse()) {
      if (existsSync(run.finalDirectory) && !existsSync(run.stagedDirectory)) {
        renameSync(run.finalDirectory, run.stagedDirectory);
      }
    }
    throw error;
  }
  rmSync(replayCacheRoot, { recursive: true, force: true });
  console.log(JSON.stringify({
    acquisitionId: options.acquisitionId,
    planId: options.planId,
    stateCodes: options.stateCodes,
    archiveRecordCount,
    generatedRunCount: generatedRuns.length,
    newRunCount: newRuns.length,
    existingRunCount: generatedRuns.length - newRuns.length,
    requestedPairs: generatedRuns.reduce((sum, run) => sum + run.receipt.counts.requested_pairs, 0),
    candidateRecords: generatedRuns.reduce((sum, run) => sum + run.receipt.counts.candidate_records, 0),
    selectedRecordMemoryBudget: {
      perScreen: USGS_NAS_SELECTED_RECORD_BUDGET_PER_SCREEN,
      partition: USGS_NAS_SELECTED_RECORD_BUDGET_PER_PARTITION,
      used: selectedRecordCount,
    },
    assertions: generatedRuns.reduce((sum, run) => sum + run.receipt.counts.assertion_events, 0),
    reviews: generatedRuns.reduce((sum, run) => sum + run.receipt.counts.review_events, 0),
    rejectionEvents: generatedRuns.reduce((sum, run) => sum + run.receipt.counts.rejection_records, 0),
    blockedOutcomes: generatedRuns.reduce((sum, run) => {
      const outcomes = run.contents.get("outcomes.ndjson")!
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { status: string });
      return sum + outcomes.filter((entry) => entry.status === "blocked").length;
    }, 0),
    rejectedCandidateRecords: generatedRuns.reduce((sum, run) => {
      const reference = JSON.parse(run.contents.get("artifacts/national-acquisition-reference.json")!) as NationalNasReference;
      return sum + reference.reconciliation.rejected_candidate_records;
    }, 0),
    outcomes: totalOutcomes,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
