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
  APHIS_ACQUISITION_ACTOR,
  APHIS_ADAPTER_ID,
  APHIS_ADAPTER_VERSION,
  APHIS_LAYER_URL,
  APHIS_OUT_FIELDS,
  APHIS_QUERY_URL,
  APHIS_SOURCE_ID,
  APHIS_TERMS_URL,
  type AphisFeature,
  type AphisProgramMapping,
  type AphisRequestedPair,
  type NationalAphisPlan,
  asNdjson,
  compareText,
  replayNationalAphisState,
  relativeGitPath,
  runTimestamp,
  sha256,
} from "./national-aphis-federal-quarantine";

import type {
  ImmutableResearchRunReceipt,
  ResearchRunFileReference,
  ResearchSourceRegistry,
} from "@/lib/research/types";
import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import {
  getStateDefinition,
  listCountyEquivalents,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";
import {
  validateImmutableResearchRunDirectory,
  validateResearchRunInMemory,
  verifyStagedResearchRun,
} from "@/lib/research/validate-run";

const ROOT = process.cwd();
const RESEARCH_ROOT = path.join(ROOT, "src/data/research");

type AcquisitionArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  media_type: "application/json";
  role: "metadata-before" | "count" | "page" | "metadata-after";
  page_index: number | null;
  record_count: number;
  source_url: string;
};

type UpstreamRequest = {
  request_id: string;
  url: string;
  method: "GET";
  status: 200;
  retrieved_at: string;
  bytes_received: number;
  attempt: number;
  artifact_path: string;
  role: AcquisitionArtifact["role"];
  record_count: number;
};

type NationalAphisReceipt = {
  schemaVersion: 1;
  acquisition_id: string;
  status: "complete";
  started_at: string;
  finished_at: string;
  actor_type: "adapter";
  actor_id: typeof APHIS_ACQUISITION_ACTOR;
  source_id: typeof APHIS_SOURCE_ID;
  code_commit: string;
  input_hashes: Record<string, string>;
  parameter_hash: string;
  parameters: {
    planId: NationalAphisPlan["planId"];
    snapshotDate: string;
    layerUrl: string;
    pageSize: number;
    artifactBudgetBytes: number;
    maxAttempts: number;
    stateCodes: string[];
    acceptedStatuses: string[];
    programMappings: AphisProgramMapping[];
  };
  upstream_requests: UpstreamRequest[];
  artifacts: AcquisitionArtifact[];
  source_verification: {
    publisher: "USDA Animal and Plant Health Inspection Service";
    terms_url: string;
    license: string;
    freshness_status: "current-provider-snapshot";
    last_edit_date_before: number;
    last_edit_date_after: number;
    stable_edit_window: true;
    object_id_field: "OBJECTID";
    supports_pagination: true;
    supports_order_by: true;
    geography_policy: string;
    taxon_policy: string;
    positive_semantics: string;
    negative_semantics: string;
    snapshot_completeness: string;
    known_caveats: string[];
  };
  counts: {
    upstream_requests: number;
    occurrence_pages: number;
    artifacts: number;
    artifact_bytes: number;
    declared_records: number;
    received_records: number;
    distinct_object_ids: number;
    mapped_program_records: number;
    unmapped_program_records: number;
    transient_failures: number;
  };
  errors: [];
  warnings: string[];
  rerun_command: string;
};

type LayerMetadata = {
  objectIdField: string;
  maxRecordCount: number;
  editingInfo?: { lastEditDate?: number };
  advancedQueryCapabilities?: {
    supportsPagination?: boolean;
    supportsOrderBy?: boolean;
  };
  fields: Array<{ name: string }>;
};

type VerifiedAcquisition = {
  directory: string;
  receiptPath: string;
  receiptBytes: Buffer;
  receiptSha256: string;
  receipt: NationalAphisReceipt;
  features: AphisFeature[];
};

type StateRegistry = {
  jurisdictions: Array<{
    stateCode: string;
    stateName: string;
    nationalV1Scope: boolean;
  }>;
};

type CatalogSpecies = { id: string; scientificName: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function schemaValidator(filename: string) {
  const schema = readJson<Parameters<typeof z.fromJSONSchema>[0]>(
    path.join(RESEARCH_ROOT, "schemas", filename),
  );
  return z.fromJSONSchema(schema);
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    assert(flag?.startsWith("--") && value && !value.startsWith("--"), `Invalid argument sequence near ${flag ?? "end"}.`);
    const key = flag.slice(2);
    assert(!values.has(key), `Duplicate argument --${key}.`);
    values.set(key, value);
  }
  const allowed = new Set(["plan", "started-at", "semantic-dry-run", "preflight-output", "acquisition-root", "runs-root", "attempt-telemetry"]);
  const unsupported = [...values.keys()].filter((key) => !allowed.has(key));
  assert(unsupported.length === 0, `Unsupported arguments: ${unsupported.join(", ")}.`);
  const plan = values.get("plan") ?? "";
  const startedAtValue = values.get("started-at") ?? "";
  const startedMilliseconds = Date.parse(startedAtValue);
  assert(plan.length > 0, "--plan is required.");
  assert(Number.isFinite(startedMilliseconds), "--started-at must be an ISO date-time.");
  assert(startedMilliseconds <= Date.now(), "--started-at cannot be in the future.");
  const dry = values.get("semantic-dry-run") ?? "false";
  assert(dry === "true" || dry === "false", "--semantic-dry-run must be true or false.");
  const acquisitionRoot = values.get("acquisition-root") ?? "src/data/research/national-acquisitions";
  const runsRoot = values.get("runs-root") ?? "src/data/research/runs";
  const telemetry = values.get("attempt-telemetry") ?? "";
  const preflightOutput = values.get("preflight-output") ?? "";
  if (dry === "false") assert(telemetry.length > 0, "--attempt-telemetry is required for acquisition.");
  if (dry === "false") assert(preflightOutput.length === 0, "--preflight-output is only valid with --semantic-dry-run true.");
  return {
    planPath: path.resolve(ROOT, plan),
    startedAt: new Date(startedMilliseconds).toISOString(),
    semanticDryRun: dry === "true",
    acquisitionRoot: path.resolve(ROOT, acquisitionRoot),
    runsRoot: path.resolve(ROOT, runsRoot),
    telemetryPath: telemetry ? path.resolve(ROOT, telemetry) : null,
    preflightOutputPath: preflightOutput ? path.resolve(ROOT, preflightOutput) : null,
  };
}

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

function inputSnapshot(files: string[]) {
  return Object.fromEntries(
    [...files]
      .sort(compareText)
      .map((filepath) => [relativeGitPath(ROOT, filepath), sha256(readFileSync(filepath))]),
  );
}

function assertCommittedInputs(codeCommit: string, inputHashes: Record<string, string>) {
  for (const [relativePath, expectedHash] of Object.entries(inputHashes)) {
    const committed = execFileSync("git", ["show", `${codeCommit}:${relativePath}`], {
      cwd: ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert(sha256(committed) === expectedHash, `Committed input differs at ${relativePath}.`);
  }
}

function loadAndValidatePlan(planPath: string) {
  const plan = readJson<NationalAphisPlan>(planPath);
  schemaValidator("national-aphis-federal-quarantine-plan.schema.json").parse(plan);
  assert(plan.layerUrl === APHIS_LAYER_URL, "APHIS plan layer URL changed.");
  assert(plan.acceptedStatuses.every((status) => !plan.rejectedStatuses.includes(status)), "APHIS accepted and rejected statuses overlap.");
  assert(new Set(plan.programMappings.map((entry) => entry.sourceProgram)).size === plan.programMappings.length, "APHIS source programs are duplicated.");
  assert(new Set(plan.programMappings.map((entry) => entry.speciesId)).size === plan.programMappings.length, "APHIS catalog mappings are not one-to-one.");
  const registry = readJson<StateRegistry>(path.join(RESEARCH_ROOT, "state-registry.json"));
  const nationalStates = registry.jurisdictions.filter((entry) => entry.nationalV1Scope).map((entry) => entry.stateCode).sort(compareText);
  assert(stableJson([...plan.nationalV1StateCodes].sort(compareText)) === stableJson(nationalStates), "APHIS plan state scope differs from national-v1.");
  const catalog = readJson<CatalogSpecies[]>(path.join(ROOT, "src/data/generated/species.json"));
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  for (const mapping of plan.programMappings) {
    const species = catalogById.get(mapping.speciesId);
    assert(species, `APHIS mapping species is missing: ${mapping.speciesId}.`);
    assert(species.scientificName === mapping.scientificName, `APHIS scientific name differs for ${mapping.speciesId}.`);
  }
  const activeCountyCount = plan.nationalV1StateCodes.reduce((sum, stateCode) => sum + listCountyEquivalents(stateCode).length, 0);
  assert(activeCountyCount === 3144, `National-v1 active county count is ${activeCountyCount}, not 3144.`);
  assert(activeCountyCount * plan.programMappings.length === plan.expectedGrossPairs, "APHIS gross pair scope differs from the plan.");
  return plan;
}

function buildAcquisitionParameters(plan: NationalAphisPlan) {
  return {
    planId: plan.planId,
    snapshotDate: plan.snapshotDate,
    layerUrl: plan.layerUrl,
    pageSize: plan.pageSize,
    artifactBudgetBytes: plan.artifactBudgetBytes,
    maxAttempts: plan.maxAttempts,
    stateCodes: [...plan.nationalV1StateCodes],
    acceptedStatuses: [...plan.acceptedStatuses],
    programMappings: [...plan.programMappings],
  };
}

function buildStateScopes(input: {
  plan: NationalAphisPlan;
  acquisitionId: string;
  acquisitionParameterHash: string;
  adapterCodeHash: string;
  runnerCodeHash: string;
  startedAt: string;
  runsRoot: string;
}) {
  return input.plan.nationalV1StateCodes.map((stateCode) => {
    const state = getStateDefinition(stateCode);
    assert(state, `Missing state definition ${stateCode}.`);
    const counties = listCountyEquivalents(stateCode);
    const requestedPairs: AphisRequestedPair[] = counties
      .flatMap((county) => input.plan.programMappings.map((mapping) => ({
        countyFips: county.countyFips,
        countyName: county.shortName,
        countyLegalName: county.legalName,
        stateCode,
        stateName: state.stateName,
        speciesId: mapping.speciesId,
        scientificName: mapping.scientificName,
      })))
      .sort((left, right) => compareText(`${left.countyFips}:${left.speciesId}`, `${right.countyFips}:${right.speciesId}`));
    const candidatePairs = requestedPairs.map((pair) => `${pair.countyFips}:${pair.speciesId}`);
    const parameters = {
      stateCode,
      mode: "national-snapshot-replay",
      nationalAcquisitionId: input.acquisitionId,
      nationalAcquisitionParameterHash: input.acquisitionParameterHash,
      snapshotDate: input.plan.snapshotDate,
      acceptedStatuses: [...input.plan.acceptedStatuses],
      candidateLimit: candidatePairs.length,
      candidatePairs,
    };
    schemaValidator("aphis-federal-quarantine-parameters.schema.json").parse(parameters);
    const parameterHash = sha256(stableJson(parameters));
    const runIdentityHash = sha256(stableJson({ parameterHash, adapterCodeHash: input.adapterCodeHash, runnerCodeHash: input.runnerCodeHash }));
    const runId = `${runTimestamp(input.startedAt)}__${APHIS_SOURCE_ID}__${runIdentityHash.slice(0, 12)}`;
    return {
      stateCode,
      state,
      counties,
      requestedPairs,
      candidatePairs,
      parameters,
      parameterHash,
      runId,
      outputPath: path.join(input.runsRoot, runId),
    };
  });
}

function urlWithParameters(base: string, values: Record<string, string>) {
  const url = new URL(base);
  Object.entries(values).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

async function fetchBytes(url: string, maxAttempts: number, transient: { count: number }) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${bytes.toString("utf8").slice(0, 200)}`);
      JSON.parse(bytes.toString("utf8"));
      return { bytes, status: 200 as const, attempt, retrievedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        transient.count += 1;
        await new Promise((resolve) => setTimeout(resolve, [1000, 5000][attempt - 1] ?? 5000));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function artifactFor(input: {
  stagingDirectory: string;
  filename: string;
  bytes: Buffer;
  role: AcquisitionArtifact["role"];
  pageIndex: number | null;
  recordCount: number;
  sourceUrl: string;
}) {
  const relativePath = `artifacts/${input.filename}`;
  const filepath = path.join(input.stagingDirectory, relativePath);
  mkdirSync(path.dirname(filepath), { recursive: true });
  writeFileSync(filepath, input.bytes);
  return {
    path: relativePath,
    sha256: sha256(input.bytes),
    bytes: input.bytes.length,
    media_type: "application/json" as const,
    role: input.role,
    page_index: input.pageIndex,
    record_count: input.recordCount,
    source_url: input.sourceUrl,
  };
}

function parseJson<T>(bytes: Buffer, label: string) {
  const value = JSON.parse(bytes.toString("utf8")) as T & { error?: unknown };
  assert(!value.error, `${label} contains an ArcGIS error.`);
  return value;
}

function verifyAcquisition(directory: string, plan: NationalAphisPlan): VerifiedAcquisition {
  const receiptPath = path.join(directory, "receipt.json");
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as NationalAphisReceipt;
  schemaValidator("national-aphis-federal-quarantine-acquisition-receipt.schema.json").parse(receipt);
  assert(path.basename(directory) === receipt.acquisition_id, "APHIS acquisition ID differs from directory.");
  const actualFiles = readdirSync(path.join(directory, "artifacts"), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `artifacts/${entry.name}`)
    .sort(compareText);
  assert(stableJson(actualFiles) === stableJson(receipt.artifacts.map((entry) => entry.path).sort(compareText)), "APHIS acquisition artifact file set differs from receipt.");
  const features: AphisFeature[] = [];
  for (const artifact of receipt.artifacts) {
    const bytes = readFileSync(path.join(directory, artifact.path));
    assert(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256, `APHIS artifact changed: ${artifact.path}.`);
    if (artifact.role === "page") {
      const page = parseJson<{ features: AphisFeature[] }>(bytes, artifact.path);
      assert(Array.isArray(page.features) && page.features.length === artifact.record_count, `APHIS page count differs: ${artifact.path}.`);
      features.push(...page.features);
    }
  }
  const objectIds = features.map((feature) => feature.attributes.OBJECTID);
  assert(new Set(objectIds).size === objectIds.length, "APHIS snapshot contains duplicate OBJECTIDs.");
  assert(objectIds.every((value, index) => index === 0 || value > objectIds[index - 1]!), "APHIS snapshot is not strictly OBJECTID ordered.");
  assert(features.length === receipt.counts.declared_records && features.length === receipt.counts.received_records, "APHIS declared and received counts differ.");
  assert(receipt.source_verification.last_edit_date_before === receipt.source_verification.last_edit_date_after, "APHIS edit window changed.");
  assert(stableJson(receipt.parameters.programMappings) === stableJson(plan.programMappings), "APHIS acquisition mappings differ from plan.");
  return { directory, receiptPath, receiptBytes, receiptSha256: sha256(receiptBytes), receipt, features };
}

async function acquire(input: {
  plan: NationalAphisPlan;
  acquisitionId: string;
  acquisitionDirectory: string;
  parameterHash: string;
  parameters: ReturnType<typeof buildAcquisitionParameters>;
  inputHashes: Record<string, string>;
  codeCommit: string;
  startedAt: string;
  rerunCommand: string;
}) {
  if (existsSync(input.acquisitionDirectory)) return verifyAcquisition(input.acquisitionDirectory, input.plan);
  const stagingDirectory = path.join(ROOT, ".cache/research", `.pending-${input.acquisitionId}`);
  rmSync(stagingDirectory, { recursive: true, force: true });
  mkdirSync(path.join(stagingDirectory, "artifacts"), { recursive: true });
  const artifacts: AcquisitionArtifact[] = [];
  const requests: UpstreamRequest[] = [];
  const transient = { count: 0 };
  async function request(role: AcquisitionArtifact["role"], url: string, filename: string, pageIndex: number | null, recordCount: (bytes: Buffer) => number) {
    const response = await fetchBytes(url, input.plan.maxAttempts, transient);
    const count = recordCount(response.bytes);
    const artifact = artifactFor({ stagingDirectory, filename, bytes: response.bytes, role, pageIndex, recordCount: count, sourceUrl: url });
    artifacts.push(artifact);
    requests.push({
      request_id: `${role}-${String(requests.length + 1).padStart(3, "0")}`,
      url,
      method: "GET",
      status: 200,
      retrieved_at: response.retrievedAt,
      bytes_received: response.bytes.length,
      attempt: response.attempt,
      artifact_path: artifact.path,
      role,
      record_count: count,
    });
    return response.bytes;
  }
  try {
    const metadataUrl = urlWithParameters(input.plan.layerUrl, { f: "pjson" });
    const beforeBytes = await request("metadata-before", metadataUrl, "metadata-before.json", null, () => 0);
    const before = parseJson<LayerMetadata>(beforeBytes, "metadata-before");
    assert(before.objectIdField === "OBJECTID", "APHIS object ID field changed.");
    assert(before.maxRecordCount >= input.plan.pageSize, "APHIS maximum page size is below the plan.");
    assert(before.advancedQueryCapabilities?.supportsPagination === true, "APHIS no longer supports pagination.");
    assert(before.advancedQueryCapabilities?.supportsOrderBy === true, "APHIS no longer supports ordered queries.");
    assert(APHIS_OUT_FIELDS.every((field) => before.fields.some((entry) => entry.name === field)), "APHIS required fields changed.");
    const lastEditBefore = before.editingInfo?.lastEditDate;
    assert(Number.isSafeInteger(lastEditBefore) && lastEditBefore! > 0, "APHIS metadata lacks lastEditDate.");
    const countUrl = urlWithParameters(APHIS_QUERY_URL, { where: "1=1", returnCountOnly: "true", f: "json" });
    const countBytes = await request("count", countUrl, "count.json", null, (bytes) => parseJson<{ count: number }>(bytes, "count").count);
    const declaredCount = parseJson<{ count: number }>(countBytes, "count").count;
    assert(Number.isSafeInteger(declaredCount) && declaredCount > 0, "APHIS declared count is invalid.");
    let offset = 0;
    let pageIndex = 0;
    while (offset < declaredCount) {
      const pageUrl = urlWithParameters(APHIS_QUERY_URL, {
        where: "1=1",
        outFields: APHIS_OUT_FIELDS.join(","),
        returnGeometry: "false",
        orderByFields: "OBJECTID ASC",
        resultOffset: String(offset),
        resultRecordCount: String(input.plan.pageSize),
        f: "json",
      });
      const pageBytes = await request("page", pageUrl, `page-${String(pageIndex).padStart(4, "0")}.json`, pageIndex, (bytes) => parseJson<{ features: AphisFeature[] }>(bytes, `page-${pageIndex}`).features.length);
      const page = parseJson<{ features: AphisFeature[] }>(pageBytes, `page-${pageIndex}`);
      assert(page.features.length > 0, `APHIS page ${pageIndex} was empty before declared completion.`);
      offset += page.features.length;
      pageIndex += 1;
    }
    assert(offset === declaredCount, `APHIS pages returned ${offset}, expected ${declaredCount}.`);
    const afterBytes = await request("metadata-after", metadataUrl, "metadata-after.json", null, () => 0);
    const after = parseJson<LayerMetadata>(afterBytes, "metadata-after");
    const lastEditAfter = after.editingInfo?.lastEditDate;
    assert(lastEditAfter === lastEditBefore, "APHIS layer changed during acquisition; snapshot was not sealed.");
    const artifactBytes = artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
    assert(artifactBytes <= input.plan.artifactBudgetBytes, `APHIS artifacts exceed ${input.plan.artifactBudgetBytes} bytes.`);
    const pageFeatures = artifacts
      .filter((artifact) => artifact.role === "page")
      .flatMap((artifact) => parseJson<{ features: AphisFeature[] }>(readFileSync(path.join(stagingDirectory, artifact.path)), artifact.path).features);
    const mappedPrograms = new Set(input.plan.programMappings.map((mapping) => mapping.sourceProgram));
    const mappedProgramRecords = pageFeatures.filter((feature) => mappedPrograms.has(String(feature.attributes.Quarantine_Program ?? "").trim())).length;
    const receipt: NationalAphisReceipt = {
      schemaVersion: 1,
      acquisition_id: input.acquisitionId,
      status: "complete",
      started_at: input.startedAt,
      finished_at: new Date().toISOString(),
      actor_type: "adapter",
      actor_id: APHIS_ACQUISITION_ACTOR,
      source_id: APHIS_SOURCE_ID,
      code_commit: input.codeCommit,
      input_hashes: input.inputHashes,
      parameter_hash: input.parameterHash,
      parameters: input.parameters,
      upstream_requests: requests,
      artifacts,
      source_verification: {
        publisher: "USDA Animal and Plant Health Inspection Service",
        terms_url: APHIS_TERMS_URL,
        license: "Official public APHIS ArcGIS service; source URLs, raw response bytes, and retrieval metadata retained",
        freshness_status: "current-provider-snapshot",
        last_edit_date_before: lastEditBefore!,
        last_edit_date_after: lastEditAfter!,
        stable_edit_window: true,
        object_id_field: "OBJECTID",
        supports_pagination: true,
        supports_order_by: true,
        geography_policy: "Only explicit five-digit Quarantine_County_FIPS values matching the explicit state and registered active county name may publish. Coordinates and retired-geography crosswalks are prohibited.",
        taxon_policy: "Only the 17 exact reviewed APHIS program-to-catalog mappings in the committed plan may publish; all other programs remain review-only.",
        positive_semantics: "Accepted current regulatory statuses support recorded-present quarantine-program evidence for explicit counties.",
        negative_semantics: "Source silence, rejected status, missing geography, and non-mapped programs never support absence or non-detection.",
        snapshot_completeness: `Provider-declared ${declaredCount} records were retrieved in ${pageIndex} complete OBJECTID-ordered pages while lastEditDate remained ${lastEditBefore}.`,
        known_caveats: [
          "Regulatory quarantine areas may include movement-control, buffer, or administrative geography and are not biological abundance surveys.",
          "The official layer is mutable; completeness applies only to the hash-pinned stable-edit-window snapshot retained here.",
          "Four source programs lack exact Project Isitusa catalog mappings and remain review-only.",
        ],
      },
      counts: {
        upstream_requests: requests.length,
        occurrence_pages: pageIndex,
        artifacts: artifacts.length,
        artifact_bytes: artifactBytes,
        declared_records: declaredCount,
        received_records: pageFeatures.length,
        distinct_object_ids: new Set(pageFeatures.map((feature) => feature.attributes.OBJECTID)).size,
        mapped_program_records: mappedProgramRecords,
        unmapped_program_records: pageFeatures.length - mappedProgramRecords,
        transient_failures: transient.count,
      },
      errors: [],
      warnings: [
        "Pending-only and rescinded statuses are retained but cannot publish.",
        `Unmapped provider program records retained for review: ${pageFeatures.length - mappedProgramRecords}.`,
      ],
      rerun_command: input.rerunCommand,
    };
    schemaValidator("national-aphis-federal-quarantine-acquisition-receipt.schema.json").parse(receipt);
    writeFileSync(path.join(stagingDirectory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    assert(!existsSync(input.acquisitionDirectory), "APHIS acquisition path appeared during acquisition.");
    mkdirSync(path.dirname(input.acquisitionDirectory), { recursive: true });
    renameSync(stagingDirectory, input.acquisitionDirectory);
    return verifyAcquisition(input.acquisitionDirectory, input.plan);
  } catch (error) {
    rmSync(stagingDirectory, { recursive: true, force: true });
    throw error;
  }
}

function fileReference(filepath: string, contents: string, mediaType: string): ResearchRunFileReference {
  return { path: filepath, sha256: sha256(contents), bytes: Buffer.byteLength(contents), media_type: mediaType };
}

function directoryContents(directory: string, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const pair of directoryContents(absolute, relative)) result.set(...pair);
    } else result.set(relative, readFileSync(absolute, "utf8"));
  }
  return result;
}

function buildRuns(input: {
  plan: NationalAphisPlan;
  acquisition: VerifiedAcquisition;
  acquisitionParameterHash: string;
  stateScopes: ReturnType<typeof buildStateScopes>;
  adapterCodeHash: string;
  runnerCodeHash: string;
  codeCommit: string;
  sourceRegistryHash: string;
  source: ResearchSourceRegistry["sources"][number];
  runsRoot: string;
  rerunCommand: string;
}) {
  const parameterValidator = schemaValidator("aphis-federal-quarantine-parameters.schema.json");
  const referenceValidator = schemaValidator("national-aphis-federal-quarantine-reference.schema.json");
  const sourceVerificationValidator = schemaValidator("worker-source-verification.schema.json");
  const stagingRoot = path.join(ROOT, ".cache/research", `.aphis-partitions-${input.acquisition.receipt.acquisition_id}`);
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(stagingRoot, { recursive: true });
  const generated: Array<{
    scope: (typeof input.stateScopes)[number];
    stagingDirectory: string;
    finalDirectory: string;
    receipt: ImmutableResearchRunReceipt;
    contents: Map<string, string>;
  }> = [];
  for (const scope of input.stateScopes) {
    parameterValidator.parse(scope.parameters);
    const context = {
      runId: scope.runId,
      sourceId: APHIS_SOURCE_ID,
      stateCode: scope.stateCode,
      requestedPairs: scope.requestedPairs,
      runStartedAt: input.acquisition.receipt.started_at,
      parameters: scope.parameters,
    };
    const result = replayNationalAphisState({
      context,
      requestedPairs: scope.requestedPairs,
      features: input.acquisition.features,
      mappings: input.plan.programMappings,
      acceptedStatuses: input.plan.acceptedStatuses,
      completedAt: input.acquisition.receipt.finished_at,
    });
    const acquisitionArtifacts = input.acquisition.receipt.artifacts.map((artifact) => ({
      path: path.posix.join(relativeGitPath(ROOT, input.acquisition.directory), artifact.path),
      sha256: artifact.sha256,
      bytes: artifact.bytes,
      role: artifact.role,
      recordCount: artifact.record_count,
    }));
    const reference = {
      schemaVersion: 1,
      acquisitionId: input.acquisition.receipt.acquisition_id,
      acquisitionReceiptPath: relativeGitPath(ROOT, input.acquisition.receiptPath),
      acquisitionReceiptSha256: input.acquisition.receiptSha256,
      snapshotDate: input.plan.snapshotDate,
      sourceId: APHIS_SOURCE_ID,
      stateCode: scope.stateCode,
      acquisitionArtifacts,
      adapterVersion: APHIS_ADAPTER_VERSION,
      adapterCodeSha256: input.adapterCodeHash,
      runnerCodeSha256: input.runnerCodeHash,
      partitionMode: "acquire-once-national-stable-edit-window-exact-fips-and-name-no-coordinate-fallback",
      selectedRowsSha256: result.selectedRowsSha256,
      mappings: input.plan.programMappings,
      replayReconciliation: result.reconciliation,
    };
    referenceValidator.parse(reference);
    const referenceContents = `${JSON.stringify(reference, null, 2)}\n`;
    const finalDirectory = path.join(input.runsRoot, scope.runId);
    const runRelative = relativeGitPath(ROOT, finalDirectory);
    const artifactReference = fileReference(path.posix.join(runRelative, "artifacts/national-acquisition-reference.json"), referenceContents, "application/json");
    const sourceVerification = {
      schemaVersion: 1,
      verifiedAt: input.acquisition.receipt.finished_at,
      runId: scope.runId,
      sourceId: APHIS_SOURCE_ID,
      stateCode: scope.stateCode,
      pairKeys: scope.candidatePairs,
      parameterHash: scope.parameterHash,
      authority: {
        name: "USDA Animal and Plant Health Inspection Service",
        sourceUrl: APHIS_LAYER_URL,
        publisher: "USDA APHIS",
      },
      terms: {
        license: input.acquisition.receipt.source_verification.license,
        termsUrl: APHIS_TERMS_URL,
        retentionAllowed: true,
      },
      availability: {
        status: "available",
        checkedAt: input.acquisition.receipt.finished_at,
        freshnessDate: input.plan.snapshotDate,
      },
      geography: {
        method: "Exact explicit APHIS county FIPS plus matching state and registered active county-equivalent name.",
        countyEquivalentSupported: true,
        coordinatePolicy: "Coordinates and automatic retired-geography crosswalks are prohibited.",
      },
      taxonomy: {
        method: "Exact reviewed APHIS quarantine-program to catalog mapping from the committed national plan.",
        targetSpeciesIds: input.plan.programMappings.map((mapping) => mapping.speciesId).sort(compareText),
      },
      acquisition: {
        snapshotComplete: true,
        paginationComplete: true,
        stableIdentityFields: ["OBJECTID"],
        requests: [],
      },
      negativeEvidence: {
        supportsVerifiedAbsence: false,
        supportsNotDetected: false,
        limitations: [
          "APHIS quarantine records are positive regulatory evidence, not an absence or survey source.",
          "Source silence, pending-only status, rescission, rejection, and missing geography never create absence or non-detection.",
        ],
      },
      retainedEvidence: [{ path: artifactReference.path, sha256: artifactReference.sha256, bytes: artifactReference.bytes }],
      caveats: [
        input.source.caveat,
        "The official mutable service was acquired once and accepted only because lastEditDate was stable across complete ordered pagination.",
        "Regulatory geography may include buffer or movement-control areas and does not represent abundance.",
      ],
    };
    sourceVerificationValidator.parse(sourceVerification);
    const sourceVerificationContents = `${JSON.stringify(sourceVerification, null, 2)}\n`;
    const outputContents = new Map<string, { contents: string; mediaType: string }>([
      ["assertions.ndjson", { contents: asNdjson(result.assertions), mediaType: "application/x-ndjson" }],
      ["reviews.ndjson", { contents: asNdjson(result.reviews), mediaType: "application/x-ndjson" }],
      ["rejections.ndjson", { contents: asNdjson(result.rejections), mediaType: "application/x-ndjson" }],
      ["outcomes.ndjson", { contents: asNdjson(result.outcomes), mediaType: "application/x-ndjson" }],
      ["source-verification.json", { contents: sourceVerificationContents, mediaType: "application/json" }],
    ]);
    const outputs = [...outputContents.entries()].map(([filename, value]) => fileReference(path.posix.join(runRelative, filename), value.contents, value.mediaType));
    const receipt: ImmutableResearchRunReceipt = {
      schemaVersion: 1,
      run_id: scope.runId,
      status: "complete",
      started_at: input.acquisition.receipt.started_at,
      finished_at: input.acquisition.receipt.finished_at,
      actor_type: "adapter",
      actor_id: `${APHIS_ADAPTER_ID}@${APHIS_ADAPTER_VERSION}`,
      source_id: APHIS_SOURCE_ID,
      source_registry_hash: input.sourceRegistryHash,
      adapter_id: APHIS_ADAPTER_ID,
      adapter_version: APHIS_ADAPTER_VERSION,
      adapter_code_hash: input.adapterCodeHash,
      code_commit: input.codeCommit,
      parameter_hash: scope.parameterHash,
      parameters: scope.parameters,
      requested_scope: {
        state_code: scope.stateCode,
        county_fips: scope.counties.map((county) => county.countyFips),
        species_ids: input.plan.programMappings.map((mapping) => mapping.speciesId).sort(compareText),
        pair_keys: scope.candidatePairs,
        date_range: { start: null, end: input.plan.snapshotDate },
      },
      upstream_requests: [],
      artifacts: [artifactReference],
      outputs,
      counts: {
        requested_pairs: scope.candidatePairs.length,
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
        input.source.caveat,
        "Complete source silence changes research status only and never establishes absence or non-detection.",
        "Quarantine geography can represent regulatory buffers or movement controls rather than organism abundance.",
      ],
      source_warnings: result.warnings,
      deviations: [
        "The national APHIS layer was acquired once and partitioned locally without state-specific network requests.",
        "Only exact reviewed program mappings, accepted current statuses, explicit FIPS, and matching active county names may publish.",
        "Coordinates and automatic retired-geography crosswalks were not used.",
      ],
      rerun_command: input.rerunCommand,
    };
    const validationResult: SourceAdapterResult = {
      ...result,
      artifacts: [{ filename: "national-acquisition-reference.json", contents: referenceContents, mediaType: "application/json" }],
    };
    validateResearchRunInMemory({
      root: ROOT,
      sourceId: APHIS_SOURCE_ID,
      source: input.source,
      stateCode: scope.stateCode,
      runId: scope.runId,
      requestedPairKeys: scope.candidatePairs,
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
    generated.push({ scope, stagingDirectory, finalDirectory, receipt, contents });
  }
  const moved: typeof generated = [];
  try {
    mkdirSync(input.runsRoot, { recursive: true });
    for (const run of generated) {
      if (existsSync(run.finalDirectory)) {
        const existing = directoryContents(run.finalDirectory);
        assert(stableJson([...existing.entries()].sort()) === stableJson([...run.contents.entries()].sort()), `Existing APHIS run differs: ${run.scope.runId}.`);
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
          sourceId: APHIS_SOURCE_ID,
          stateCode: run.scope.stateCode,
          pairKeys: run.scope.candidatePairs,
          codeCommit: input.codeCommit,
        },
      });
    }
  } catch (error) {
    for (const run of [...moved].reverse()) {
      if (existsSync(run.finalDirectory) && !existsSync(run.stagingDirectory)) renameSync(run.finalDirectory, run.stagingDirectory);
    }
    throw error;
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true });
  }
  return generated;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const wallStart = performance.now();
  let peakRss = process.memoryUsage().rss;
  const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss); }, 25);
  sampler.unref();
  try {
    const plan = loadAndValidatePlan(options.planPath);
    const commonPath = path.join(ROOT, "scripts/research/national-aphis-federal-quarantine.ts");
    const runnerPath = path.join(ROOT, "scripts/research/run-national-aphis-federal-quarantine.ts");
    const inputFiles = [
      options.planPath,
      commonPath,
      runnerPath,
      path.join(RESEARCH_ROOT, "source-registry.json"),
      path.join(RESEARCH_ROOT, "state-registry.json"),
      path.join(RESEARCH_ROOT, "county-equivalent-registry.json"),
      path.join(ROOT, "src/data/generated/species.json"),
      ...[
        "national-aphis-federal-quarantine-plan.schema.json",
        "national-aphis-federal-quarantine-acquisition-receipt.schema.json",
        "national-aphis-federal-quarantine-reference.schema.json",
        "aphis-federal-quarantine-parameters.schema.json",
        "worker-source-verification.schema.json",
        "run-receipt.schema.json",
        "evidence-assertion.schema.json",
        "review-event.schema.json",
        "rejection-record.schema.json",
        "pair-outcome.schema.json",
      ].map((filename) => path.join(RESEARCH_ROOT, "schemas", filename)),
    ];
    const inputHashes = inputSnapshot(inputFiles);
    const codeCommit = gitHead();
    const adapterCodeHash = sha256(readFileSync(commonPath));
    const runnerCodeHash = sha256(readFileSync(runnerPath));
    const acquisitionParameters = buildAcquisitionParameters(plan);
    const acquisitionParameterHash = sha256(stableJson(acquisitionParameters));
    const acquisitionId = `${runTimestamp(options.startedAt).toLowerCase()}__${APHIS_SOURCE_ID}__${acquisitionParameterHash.slice(0, 12)}`;
    assert(/^[a-z0-9.-]+(?:__[a-z0-9.-]+)*$/.test(acquisitionId), "APHIS deterministic acquisition ID violates its receipt schema.");
    const acquisitionDirectory = path.join(options.acquisitionRoot, acquisitionId);
    const stateScopes = buildStateScopes({ plan, acquisitionId, acquisitionParameterHash, adapterCodeHash, runnerCodeHash, startedAt: options.startedAt, runsRoot: options.runsRoot });
    assert(stateScopes.reduce((sum, scope) => sum + scope.candidatePairs.length, 0) === plan.expectedGrossPairs, "APHIS deterministic state scope differs from gross plan.");
    const expandedCommand = [
      `& 'C:\\Code\\tools\\node-v22.23.2-win-x64\\node.exe' --import tsx '${runnerPath}'`,
      `--plan '${relativeGitPath(ROOT, options.planPath)}'`,
      `--started-at '${options.startedAt}'`,
      `--semantic-dry-run false`,
      `--acquisition-root '${relativeGitPath(ROOT, options.acquisitionRoot)}'`,
      `--runs-root '${relativeGitPath(ROOT, options.runsRoot)}'`,
      `--attempt-telemetry '${options.telemetryPath ? relativeGitPath(ROOT, options.telemetryPath) : "ops/national-research/attempt-telemetry/aphis-federal-quarantine-national-20260815.json"}'`,
    ].join(" ");
    if (options.semanticDryRun) {
      const preflight = {
        ok: true,
        semanticDryRun: true,
        networkRequestsIssued: 0,
        sourceId: APHIS_SOURCE_ID,
        baseSha: codeCommit,
        expectedReceiptCodeCommit: codeCommit,
        planPath: relativeGitPath(ROOT, options.planPath),
        planSha256: inputHashes[relativeGitPath(ROOT, options.planPath)],
        acquisitionParameterHash,
        acquisitionId,
        acquisitionPath: relativeGitPath(ROOT, acquisitionDirectory),
        expandedCommand,
        stateCount: stateScopes.length,
        taxonCount: plan.programMappings.length,
        activeCountyCount: 3144,
        orderedPairCount: plan.expectedGrossPairs,
        expectedNetNewPairsAtBaseline: plan.expectedNetNewPairsAtBaseline,
        expectedProviderRequests: { metadata: 2, count: 1, pagesAtStartupCount: 3, totalAtStartupCount: 6 },
        retryPolicy: { maxAttempts: plan.maxAttempts, backoffMilliseconds: [1000, 5000] },
        artifactBudgetBytes: plan.artifactBudgetBytes,
        runPaths: stateScopes.map((scope) => ({ stateCode: scope.stateCode, orderedPairCount: scope.candidatePairs.length, pairHash: sha256(`${scope.candidatePairs.join("\n")}\n`), runId: scope.runId, outputPath: relativeGitPath(ROOT, scope.outputPath) })),
        inputHashes,
      };
      const preflightBytes = `${JSON.stringify(preflight, null, 2)}\n`;
      if (options.preflightOutputPath) {
        mkdirSync(path.dirname(options.preflightOutputPath), { recursive: true });
        writeFileSync(options.preflightOutputPath, preflightBytes);
      }
      console.log(preflightBytes.trimEnd());
      return;
    }
    assertCommittedInputs(codeCommit, inputHashes);
    assert(!existsSync(options.telemetryPath!), "APHIS attempt telemetry already exists.");
    const sourceRegistryPath = path.join(RESEARCH_ROOT, "source-registry.json");
    const sourceRegistryBytes = readFileSync(sourceRegistryPath);
    const sourceRegistry = JSON.parse(sourceRegistryBytes.toString("utf8")) as ResearchSourceRegistry;
    const sources = sourceRegistry.sources.filter((entry) => entry.id === APHIS_SOURCE_ID);
    assert(sources.length === 1 && sources[0]!.researchAdapter?.id === APHIS_ADAPTER_ID, "APHIS research adapter is not registered exactly once.");
    const acquisition = await acquire({
      plan,
      acquisitionId,
      acquisitionDirectory,
      parameterHash: acquisitionParameterHash,
      parameters: acquisitionParameters,
      inputHashes,
      codeCommit,
      startedAt: options.startedAt,
      rerunCommand: expandedCommand,
    });
    const runs = buildRuns({
      plan,
      acquisition,
      acquisitionParameterHash,
      stateScopes,
      adapterCodeHash,
      runnerCodeHash,
      codeCommit,
      sourceRegistryHash: sha256(sourceRegistryBytes),
      source: sources[0]!,
      runsRoot: options.runsRoot,
      rerunCommand: expandedCommand,
    });
    clearInterval(sampler);
    peakRss = Math.max(peakRss, process.memoryUsage().rss);
    const finishedAt = new Date().toISOString();
    const telemetry = {
      schemaVersion: 1,
      sourceId: APHIS_SOURCE_ID,
      acquisitionId,
      status: "complete",
      startedAt: options.startedAt,
      finishedAt,
      wallSeconds: Number(((performance.now() - wallStart) / 1000).toFixed(3)),
      peakObservedRssMb: Number((peakRss / 1024 / 1024).toFixed(3)),
      providerAttempts: acquisition.receipt.upstream_requests.reduce((sum, request) => sum + request.attempt, 0),
      completedResponses: acquisition.receipt.upstream_requests.length,
      failedAttempts: acquisition.receipt.counts.transient_failures,
      retries: acquisition.receipt.counts.transient_failures,
      providerPages: acquisition.receipt.counts.occurrence_pages,
      providerRecords: acquisition.receipt.counts.received_records,
      artifacts: acquisition.receipt.counts.artifacts,
      artifactBytes: acquisition.receipt.counts.artifact_bytes,
      generatedRuns: runs.length,
      requestedPairs: runs.reduce((sum, run) => sum + run.receipt.counts.requested_pairs, 0),
      outcomes: runs.reduce((sum, run) => sum + run.receipt.counts.pair_outcomes, 0),
      candidates: runs.reduce((sum, run) => sum + run.receipt.counts.candidate_records, 0),
      assertions: runs.reduce((sum, run) => sum + run.receipt.counts.assertion_events, 0),
      reviews: runs.reduce((sum, run) => sum + run.receipt.counts.review_events, 0),
      rejections: runs.reduce((sum, run) => sum + run.receipt.counts.rejection_records, 0),
      manualInterventions: 0,
    };
    mkdirSync(path.dirname(options.telemetryPath!), { recursive: true });
    writeFileSync(options.telemetryPath!, `${JSON.stringify(telemetry, null, 2)}\n`);
    console.log(JSON.stringify({
      acquisitionPath: relativeGitPath(ROOT, acquisition.directory),
      acquisitionReceiptSha256: acquisition.receiptSha256,
      ...telemetry,
      telemetryPath: relativeGitPath(ROOT, options.telemetryPath!),
      runPaths: runs.map((run) => relativeGitPath(ROOT, run.finalDirectory)),
    }, null, 2));
  } finally {
    clearInterval(sampler);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
