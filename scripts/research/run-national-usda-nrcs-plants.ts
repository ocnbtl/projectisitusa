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
import { pathToFileURL } from "node:url";

import { z } from "zod";

import {
  NRCS_ACQUISITION_ACTOR,
  NRCS_ADAPTER_ID,
  NRCS_ADAPTER_VERSION,
  NRCS_DISTRIBUTION_URL,
  NRCS_LAYER6_QUERY_URL,
  NRCS_MAPSERVER_URL,
  NRCS_PROFILE_BASE_URL,
  NRCS_SOURCE_ID,
  NRCS_TERMS_URL,
  type NationalNrcsPlan,
  type NrcsDistributionRow,
  type NrcsRequestedPair,
  type NrcsTaxonMapping,
  asNdjson,
  canonicalScientificName,
  compareText,
  normalizedText,
  relativeGitPath,
  replayNationalNrcsState,
  runTimestamp,
  sha256,
} from "./national-usda-nrcs-plants";

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
const SWAGGER_URL = "https://plantsservices.sc.egov.usda.gov/swagger/v1/swagger.json";
const SERVICE_METADATA_URL = `${NRCS_MAPSERVER_URL}?f=pjson`;
const LAYER6_METADATA_URL = `${NRCS_MAPSERVER_URL}/6?f=pjson`;

type ArtifactRole =
  | "swagger"
  | "service-metadata"
  | "layer6-metadata"
  | "status-before"
  | "profile"
  | "distribution"
  | "status-after";

type AcquisitionArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  media_type: "application/json" | "text/csv";
  role: ArtifactRole;
  taxon_master_id: number | null;
  record_count: number;
  source_url: string;
};

type UpstreamRequest = {
  request_id: string;
  url: string;
  method: "GET" | "POST";
  request_body_sha256: string | null;
  status: 200;
  retrieved_at: string;
  bytes_received: number;
  attempt: number;
  artifact_path: string;
  role: ArtifactRole;
  taxon_master_id: number | null;
  record_count: number;
  acquired_code_commit: string;
};

type NrcsProfile = {
  Id?: number;
  AcceptedId?: number;
  Symbol?: string;
  ScientificName?: string;
  NativeStatuses?: Array<{
    Region?: string;
    Status?: string;
    Type?: string;
  }>;
};

type AggregateFeature = {
  attributes?: {
    plant_master_id?: number | string | null;
    Symbol?: string | null;
    plant_nativity_id?: string | null;
    row_count?: number | string | null;
  };
};

type AggregateResponse = {
  features?: AggregateFeature[];
  error?: unknown;
};

type AggregateFingerprint = Array<{
  plantMasterId: number;
  establishmentMeans: string;
  establishmentStatusId: string;
  rowCount: number;
}>;

export type NationalNrcsReceipt = {
  schemaVersion: 1;
  acquisition_id: string;
  status: "complete";
  started_at: string;
  finished_at: string;
  actor_type: "adapter";
  actor_id: typeof NRCS_ACQUISITION_ACTOR;
  source_id: typeof NRCS_SOURCE_ID;
  code_commit: string;
  input_hashes: Record<string, string>;
  parameter_hash: string;
  parameters: {
    planId: NationalNrcsPlan["planId"];
    snapshotDate: string;
    profileBaseUrl: string;
    distributionUrl: string;
    mapServerUrl: string;
    artifactBudgetBytes: number;
    maxAttempts: number;
    stateCodes: string[];
    allowedEstablishmentMeans: string[];
    taxonMappings: NrcsTaxonMapping[];
  };
  upstream_requests: UpstreamRequest[];
  artifacts: AcquisitionArtifact[];
  source_verification: {
    publisher: "USDA Natural Resources Conservation Service";
    terms_url: string;
    license: string;
    freshness_status: "current-provider-snapshot";
    contract_snapshot_count: 3;
    rate_limit_requests_per_second: number;
    request_code_commits: string[];
    status_fingerprint_before_sha256: string;
    status_fingerprint_after_sha256: string;
    stable_status_window: true;
    profile_identity_complete: true;
    distribution_responses_complete: true;
    county_geography_policy: string;
    state_row_policy: string;
    taxonomy_policy: string;
    nativity_policy: string;
    positive_semantics: string;
    negative_semantics: string;
    snapshot_completeness: string;
    known_caveats: string[];
  };
  counts: {
    upstream_requests: number;
    distribution_responses: number;
    profile_responses: number;
    contract_snapshots: number;
    aggregate_snapshots: number;
    artifacts: number;
    artifact_bytes: number;
    csv_rows: number;
    united_states_county_rows: number;
    united_states_state_only_rows: number;
    foreign_rows: number;
    transient_failures: number;
  };
  errors: [];
  warnings: string[];
  rerun_command: string;
};

export type VerifiedNrcsAcquisition = {
  directory: string;
  receiptPath: string;
  receiptBytes: Buffer;
  receiptSha256: string;
  receipt: NationalNrcsReceipt;
  rows: NrcsDistributionRow[];
  profiles: Map<number, NrcsProfile>;
  statusFingerprint: AggregateFingerprint;
};

type StateRegistry = {
  jurisdictions: Array<{
    stateCode: string;
    stateFips: string;
    stateName: string;
    nationalV1Scope: boolean;
  }>;
};

type CatalogSpecies = {
  id: string;
  scientificName: string;
  registry?: {
    countyDataSources?: Array<{
      source: string;
      externalId: string;
    }>;
  };
};

type ProgressFile = {
  schemaVersion: 1;
  acquisitionId: string;
  codeCommit?: string;
  requests: UpstreamRequest[];
  artifacts: AcquisitionArtifact[];
  transientFailures: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export class RestartRequiredAcquisitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestartRequiredAcquisitionError";
  }
}

export function requestIntervalMilliseconds(requestsPerSecond: number) {
  assert(Number.isFinite(requestsPerSecond) && requestsPerSecond > 0, "Provider rate limit must be a positive finite number.");
  return Math.ceil(1000 / requestsPerSecond);
}

export function acquisitionFailureIsRetryable(error: unknown) {
  return !(error instanceof RestartRequiredAcquisitionError);
}

export function assertPartialAcquisitionResumeAllowed(partial: { retryable?: boolean } | null) {
  if (partial?.retryable === false) {
    throw new RestartRequiredAcquisitionError(
      "NRCS partial acquisition is marked non-retryable. Preserve it and start a new acquisition with a new --started-at value.",
    );
  }
}

export class ProviderStartRateLimiter {
  private lastStartedAt = Number.NEGATIVE_INFINITY;

  constructor(
    private readonly intervalMilliseconds: number,
    private readonly now: () => number = () => performance.now(),
    private readonly sleep: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  ) {
    assert(Number.isFinite(intervalMilliseconds) && intervalMilliseconds > 0, "Provider request interval must be a positive finite number.");
  }

  async waitForSlot() {
    const waitMilliseconds = this.intervalMilliseconds - (this.now() - this.lastStartedAt);
    if (waitMilliseconds > 0) await this.sleep(waitMilliseconds);
    this.lastStartedAt = this.now();
  }
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
  const allowed = new Set([
    "plan",
    "started-at",
    "semantic-dry-run",
    "preflight-output",
    "acquisition-root",
    "runs-root",
    "attempt-telemetry",
  ]);
  for (const key of values.keys()) assert(allowed.has(key), `Unknown argument --${key}.`);
  const plan = values.get("plan");
  const startedAt = values.get("started-at");
  const dry = values.get("semantic-dry-run") ?? "false";
  assert(plan, "--plan is required.");
  assert(startedAt && !Number.isNaN(Date.parse(startedAt)), "--started-at must be an ISO timestamp.");
  assert(dry === "true" || dry === "false", "--semantic-dry-run must be true or false.");
  const semanticDryRun = dry === "true";
  const preflightOutput = values.get("preflight-output");
  assert(semanticDryRun || !preflightOutput, "--preflight-output is only valid with --semantic-dry-run true.");
  const telemetry = values.get("attempt-telemetry");
  assert(semanticDryRun || telemetry, "--attempt-telemetry is required for acquisition.");
  return {
    planPath: path.resolve(ROOT, plan),
    startedAt: new Date(startedAt).toISOString(),
    semanticDryRun,
    preflightOutputPath: preflightOutput ? path.resolve(ROOT, preflightOutput) : null,
    acquisitionRoot: path.resolve(ROOT, values.get("acquisition-root") ?? "src/data/research/national-acquisitions"),
    runsRoot: path.resolve(ROOT, values.get("runs-root") ?? "src/data/research/runs"),
    telemetryPath: telemetry ? path.resolve(ROOT, telemetry) : null,
  };
}

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
}

function assertGitClean(allowedUntrackedDirectories: string[] = []) {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  const lines = status.split(/\r?\n/u).filter(Boolean);
  const allowed = allowedUntrackedDirectories.map((directory) => `${directory.replace(/\\/gu, "/").replace(/\/$/u, "")}/`);
  const unexpected = lines.filter((line) => {
    if (!line.startsWith("?? ")) return true;
    const filepath = line.slice(3).replace(/\\/gu, "/");
    return !allowed.some((directory) => filepath === directory.slice(0, -1) || filepath.startsWith(directory));
  });
  assert(unexpected.length === 0, `NRCS acquisition requires a clean canonical worktree; unexpected status: ${unexpected.join(", ")}.`);
}

function inputSnapshot(files: string[]) {
  return Object.fromEntries(
    [...files].sort(compareText).map((filepath) => [relativeGitPath(ROOT, filepath), sha256(readFileSync(filepath))]),
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
  const plan = readJson<NationalNrcsPlan>(planPath);
  schemaValidator("national-usda-nrcs-plants-plan.schema.json").parse(plan);
  assert(plan.profileBaseUrl === NRCS_PROFILE_BASE_URL, "NRCS plan profile URL changed.");
  assert(plan.distributionUrl === NRCS_DISTRIBUTION_URL, "NRCS plan distribution URL changed.");
  assert(plan.mapServerUrl === NRCS_MAPSERVER_URL, "NRCS plan MapServer URL changed.");
  assert(new Set(plan.taxonMappings.map((entry) => entry.plantMasterId)).size === plan.taxonMappings.length, "NRCS master IDs are duplicated.");
  assert(new Set(plan.taxonMappings.map((entry) => entry.symbol)).size === plan.taxonMappings.length, "NRCS symbols are duplicated.");
  assert(new Set(plan.taxonMappings.map((entry) => entry.speciesId)).size === plan.taxonMappings.length, "NRCS catalog mappings are duplicated.");
  const registry = readJson<StateRegistry>(path.join(RESEARCH_ROOT, "state-registry.json"));
  const nationalStates = registry.jurisdictions.filter((entry) => entry.nationalV1Scope).map((entry) => entry.stateCode).sort(compareText);
  assert(stableJson([...plan.nationalV1StateCodes].sort(compareText)) === stableJson(nationalStates), "NRCS plan state scope differs from national-v1.");
  const catalog = readJson<CatalogSpecies[]>(path.join(ROOT, "src/data/generated/species.json"));
  const catalogById = new Map(catalog.map((entry) => [entry.id, entry]));
  for (const mapping of plan.taxonMappings) {
    const species = catalogById.get(mapping.speciesId);
    assert(species, `NRCS mapping species is missing: ${mapping.speciesId}.`);
    assert(species.scientificName === mapping.scientificName, `NRCS scientific name differs for ${mapping.speciesId}.`);
    const source = species.registry?.countyDataSources?.find((entry) => entry.source === "USDA NRCS PLANTS county distribution");
    assert(source, `NRCS source mapping is missing for ${mapping.speciesId}.`);
    assert(source.externalId.startsWith(`${mapping.symbol} ${mapping.plantMasterId} `), `NRCS legacy taxonomy identity differs for ${mapping.speciesId}.`);
  }
  const activeCountyCount = plan.nationalV1StateCodes.reduce((sum, stateCode) => sum + listCountyEquivalents(stateCode).length, 0);
  assert(activeCountyCount === 3144, `National-v1 active county count is ${activeCountyCount}, not 3144.`);
  assert(activeCountyCount * plan.taxonMappings.length === plan.expectedGrossPairs, "NRCS gross pair scope differs from plan.");
  assert(plan.expectedGrossPairs - plan.expectedNetNewPairsAtBaseline === plan.expectedAlreadyResearchedAtBaseline, "NRCS baseline overlap arithmetic differs.");
  return plan;
}

function buildAcquisitionParameters(plan: NationalNrcsPlan) {
  return {
    planId: plan.planId,
    snapshotDate: plan.snapshotDate,
    profileBaseUrl: plan.profileBaseUrl,
    distributionUrl: plan.distributionUrl,
    mapServerUrl: plan.mapServerUrl,
    artifactBudgetBytes: plan.artifactBudgetBytes,
    maxAttempts: plan.maxAttempts,
    stateCodes: [...plan.nationalV1StateCodes],
    allowedEstablishmentMeans: [...plan.allowedEstablishmentMeans],
    taxonMappings: [...plan.taxonMappings],
  };
}

export function expectedProviderRequestCount(plan: NationalNrcsPlan) {
  return 5 + (2 * plan.taxonMappings.length);
}

function buildStateScopes(input: {
  plan: NationalNrcsPlan;
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
    const requestedPairs: NrcsRequestedPair[] = counties
      .flatMap((county) => input.plan.taxonMappings.map((mapping) => ({
        countyFips: county.countyFips,
        countyName: county.shortName,
        countyLegalName: county.legalName,
        stateCode,
        stateName: state.stateName,
        stateFips: state.stateFips,
        speciesId: mapping.speciesId,
        scientificName: mapping.scientificName,
      })))
      .sort((left, right) => compareText(`${left.countyFips}:${left.speciesId}`, `${right.countyFips}:${right.speciesId}`));
    const candidatePairs = requestedPairs.map((pair) => `${pair.countyFips}:${pair.speciesId}`);
    const parameters = {
      stateCode,
      mode: "national-taxonomy-bounded-csv-replay",
      nationalAcquisitionId: input.acquisitionId,
      nationalAcquisitionParameterHash: input.acquisitionParameterHash,
      snapshotDate: input.plan.snapshotDate,
      candidateLimit: candidatePairs.length,
      candidatePairs,
    };
    schemaValidator("usda-nrcs-plants-parameters.schema.json").parse(parameters);
    const parameterHash = sha256(stableJson(parameters));
    const runIdentityHash = sha256(stableJson({
      parameterHash,
      adapterCodeHash: input.adapterCodeHash,
      runnerCodeHash: input.runnerCodeHash,
    }));
    const runId = `${runTimestamp(input.startedAt)}__${NRCS_SOURCE_ID}__${runIdentityHash.slice(0, 12)}`;
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

function aggregateUrl(plan: NationalNrcsPlan) {
  const ids = [...plan.taxonMappings].sort((a, b) => a.plantMasterId - b.plantMasterId).map((entry) => entry.plantMasterId);
  return urlWithParameters(NRCS_LAYER6_QUERY_URL, {
    where: `plant_master_id IN (${ids.join(",")})`,
    outStatistics: JSON.stringify([{
      statisticType: "count",
      onStatisticField: "plant_master_id",
      outStatisticFieldName: "row_count",
    }]),
    groupByFieldsForStatistics: "plant_master_id,Symbol,plant_nativity_id",
    orderByFields: "plant_master_id ASC,Symbol ASC,plant_nativity_id ASC",
    returnGeometry: "false",
    f: "json",
  });
}

async function fetchBytes(input: {
  url: string;
  method: "GET" | "POST";
  body: string | null;
  accept: string;
  maxAttempts: number;
  transient: { count: number };
  beforeAttempt: () => Promise<void>;
}) {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= input.maxAttempts; attempt += 1) {
    await input.beforeAttempt();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      const response = await fetch(input.url, {
        method: input.method,
        body: input.body,
        signal: controller.signal,
        headers: {
          Accept: input.accept,
          ...(input.body ? { "Content-Type": "application/json" } : {}),
          "User-Agent": "Project-Isitusa/1.0 national evidence research",
        },
      });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${bytes.toString("utf8").slice(0, 300)}`);
      assert(bytes.length > 0, `Empty response from ${input.url}.`);
      return { bytes, status: 200 as const, attempt, retrievedAt: new Date().toISOString() };
    } catch (error) {
      lastError = error;
      if (attempt < input.maxAttempts) {
        input.transient.count += 1;
        await new Promise((resolve) => setTimeout(resolve, [1000, 5000][attempt - 1] ?? 5000));
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function parseJson<T>(bytes: Buffer, label: string) {
  const value = JSON.parse(bytes.toString("utf8")) as T & { error?: unknown };
  assert(!value.error, `${label} contains a provider error.`);
  return value;
}

function parseCsvRecords(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (quoted) {
      if (char === '"' && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/u, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  assert(!quoted, "NRCS CSV ended inside a quoted field.");
  if (field || row.length) {
    row.push(field.replace(/\r$/u, ""));
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((fieldValue) => fieldValue.length > 0));
}

export function parseNrcsDistributionCsv(bytes: Buffer, mapping: NrcsTaxonMapping) {
  const records = parseCsvRecords(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  assert(records.length >= 2, `NRCS distribution CSV is empty for ${mapping.speciesId}.`);
  assert(records[0]!.length === 1 && normalizedText(records[0]![0]) === "Distribution Data", `NRCS CSV title changed for ${mapping.speciesId}.`);
  const expectedHeader = ["Symbol", "Country", "State", "State FIP", "County", "County FIP"];
  assert(stableJson(records[1]!.map(normalizedText)) === stableJson(expectedHeader), `NRCS CSV header changed for ${mapping.speciesId}.`);
  return records.slice(2).map((fields, index) => {
    assert(fields.length === 6, `NRCS CSV row ${index + 3} has ${fields.length} fields for ${mapping.speciesId}.`);
    return {
      symbol: normalizedText(fields[0]),
      country: normalizedText(fields[1]),
      state: normalizedText(fields[2]),
      stateFips: normalizedText(fields[3]).padStart(2, "0"),
      county: normalizedText(fields[4]),
      countyFips: normalizedText(fields[5]).padStart(fields[5]?.trim() ? 3 : 0, "0"),
      sourceRowNumber: index + 3,
      plantMasterId: mapping.plantMasterId,
    } satisfies NrcsDistributionRow;
  });
}

function extractScientificName(value: string) {
  const decoded = normalizedText(value)
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&times;/giu, "x");
  const italicMatches = [...decoded.matchAll(/<i>([^<]+)<\/i>/giu)];
  if (italicMatches.length > 0) {
    const headTokens = normalizedText(italicMatches[0]![1]!).split(" ").filter(Boolean);
    assert(headTokens.length >= 2, `NRCS profile scientific name is invalid: ${value}.`);
    const result = [headTokens[0]!, headTokens[1]!];
    const headEnd = italicMatches[0]!.index + italicMatches[0]![0].length;
    const ranked = decoded.slice(headEnd).match(/\b(subsp\.|ssp\.|var\.|f\.|forma)\s*<i>([^<]+)<\/i>/iu);
    if (ranked) {
      const rank = ranked[1]!.toLowerCase().replace(/^ssp\.$/u, "subsp.");
      const epithet = normalizedText(ranked[2]!).split(" ").filter(Boolean)[0];
      assert(epithet, `NRCS profile scientific name is invalid: ${value}.`);
      result.push(rank, epithet);
    }
    return result.join(" ");
  }
  const plain = decoded
    .replace(/<[^>]+>/gu, " ")
    .replace(/\([^)]*\)/gu, " ");
  const tokens = normalizedText(plain).replace(/[(),]/gu, " ").split(" ").filter(Boolean);
  assert(tokens.length >= 2, `NRCS profile scientific name is invalid: ${value}.`);
  const result = [tokens[0]!, tokens[1]!];
  if (tokens[2] && ["subsp.", "ssp.", "var.", "f.", "forma"].includes(tokens[2].toLowerCase()) && tokens[3]) {
    result.push(tokens[2].toLowerCase().replace(/^ssp\.$/u, "subsp."), tokens[3]);
  }
  return result.join(" ");
}

export function validateNrcsProfile(profile: NrcsProfile, mapping: NrcsTaxonMapping) {
  assert(profile.Id === mapping.plantMasterId, `NRCS profile ID changed for ${mapping.speciesId}.`);
  assert(profile.AcceptedId === profile.Id, `NRCS profile is not accepted for ${mapping.speciesId}.`);
  assert(normalizedText(profile.Symbol) === mapping.symbol, `NRCS profile symbol changed for ${mapping.speciesId}.`);
  assert(canonicalScientificName(extractScientificName(String(profile.ScientificName ?? ""))) === canonicalScientificName(mapping.scientificName), `NRCS profile scientific name changed for ${mapping.speciesId}.`);
  assert(profile.NativeStatuses?.some((status) =>
    normalizedText(status.Region).toUpperCase() === "L48" &&
    normalizedText(status.Status).toUpperCase() === "I" &&
    normalizedText(status.Type).toLowerCase() === "introduced"
  ), `NRCS profile lacks L48 Introduced status for ${mapping.speciesId}.`);
}

export function parseNrcsStatusFingerprint(bytes: Buffer, plan: NationalNrcsPlan) {
  const response = parseJson<AggregateResponse>(bytes, "NRCS status aggregate");
  assert(Array.isArray(response.features), "NRCS status aggregate lacks features.");
  const planned = new Map(plan.taxonMappings.map((entry) => [entry.plantMasterId, entry]));
  const allowed = new Set(plan.allowedEstablishmentMeans);
  const result: AggregateFingerprint = response.features.map((feature) => {
    const raw = feature.attributes ?? {};
    const plantMasterId = Number(raw.plant_master_id);
    const establishmentMeans = normalizedText(raw.Symbol);
    const establishmentStatusId = normalizedText(raw.plant_nativity_id);
    const rowCount = Number(raw.row_count);
    assert(Number.isSafeInteger(plantMasterId) && planned.has(plantMasterId), `NRCS aggregate includes unplanned master ID ${raw.plant_master_id}.`);
    assert(allowed.has(establishmentMeans as "Introduced" | "Both"), `NRCS aggregate has disallowed establishment means ${establishmentMeans} for ${plantMasterId}.`);
    assert(/^\d+$/u.test(establishmentStatusId), `NRCS aggregate establishment status ID is invalid for ${plantMasterId}.`);
    assert(Number.isSafeInteger(rowCount) && rowCount > 0, `NRCS aggregate row count is invalid for ${plantMasterId}.`);
    return { plantMasterId, establishmentMeans, establishmentStatusId, rowCount };
  }).sort((left, right) => compareText(
    `${left.plantMasterId}:${left.establishmentMeans}:${left.establishmentStatusId}`,
    `${right.plantMasterId}:${right.establishmentMeans}:${right.establishmentStatusId}`,
  ));
  const present = new Set(result.map((entry) => entry.plantMasterId));
  assert(present.size === plan.taxonMappings.length, `NRCS aggregate covers ${present.size} taxa, expected ${plan.taxonMappings.length}.`);
  return result;
}

function artifactFor(input: {
  stagingDirectory: string;
  filename: string;
  bytes: Buffer;
  mediaType: AcquisitionArtifact["media_type"];
  role: ArtifactRole;
  taxonMasterId: number | null;
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
    media_type: input.mediaType,
    role: input.role,
    taxon_master_id: input.taxonMasterId,
    record_count: input.recordCount,
    source_url: input.sourceUrl,
  } satisfies AcquisitionArtifact;
}

function verifyArtifact(directory: string, artifact: AcquisitionArtifact) {
  const bytes = readFileSync(path.join(directory, artifact.path));
  assert(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256, `NRCS artifact changed: ${artifact.path}.`);
  return bytes;
}

export function verifyNationalNrcsAcquisition(directory: string, plan: NationalNrcsPlan): VerifiedNrcsAcquisition {
  const receiptPath = path.join(directory, "receipt.json");
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as NationalNrcsReceipt;
  schemaValidator("national-usda-nrcs-plants-acquisition-receipt.schema.json").parse(receipt);
  assert(path.basename(directory) === receipt.acquisition_id, "NRCS acquisition ID differs from directory.");
  const actualFiles = readdirSync(path.join(directory, "artifacts"), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `artifacts/${entry.name}`)
    .sort(compareText);
  assert(stableJson(actualFiles) === stableJson(receipt.artifacts.map((entry) => entry.path).sort(compareText)), "NRCS artifact file set differs from receipt.");
  const rows: NrcsDistributionRow[] = [];
  const profiles = new Map<number, NrcsProfile>();
  let before: AggregateFingerprint | null = null;
  let after: AggregateFingerprint | null = null;
  for (const artifact of receipt.artifacts) {
    const bytes = verifyArtifact(directory, artifact);
    if (artifact.role === "profile") {
      const mapping = plan.taxonMappings.find((entry) => entry.plantMasterId === artifact.taxon_master_id);
      assert(mapping, `NRCS profile artifact has unknown master ID ${artifact.taxon_master_id}.`);
      const profile = parseJson<NrcsProfile>(bytes, artifact.path);
      validateNrcsProfile(profile, mapping);
      profiles.set(mapping.plantMasterId, profile);
    } else if (artifact.role === "distribution") {
      const mapping = plan.taxonMappings.find((entry) => entry.plantMasterId === artifact.taxon_master_id);
      assert(mapping, `NRCS distribution artifact has unknown master ID ${artifact.taxon_master_id}.`);
      const parsed = parseNrcsDistributionCsv(bytes, mapping);
      assert(parsed.length === artifact.record_count, `NRCS distribution count changed for ${mapping.speciesId}.`);
      rows.push(...parsed);
    } else if (artifact.role === "status-before") before = parseNrcsStatusFingerprint(bytes, plan);
    else if (artifact.role === "status-after") after = parseNrcsStatusFingerprint(bytes, plan);
    else parseJson<unknown>(bytes, artifact.path);
  }
  assert(profiles.size === plan.taxonMappings.length, "NRCS profile set is incomplete.");
  assert(before && after && stableJson(before) === stableJson(after), "NRCS source-status fingerprint changed during acquisition.");
  assert(sha256(stableJson(before)) === receipt.source_verification.status_fingerprint_before_sha256, "NRCS before fingerprint hash changed.");
  assert(sha256(stableJson(after)) === receipt.source_verification.status_fingerprint_after_sha256, "NRCS after fingerprint hash changed.");
  assert(stableJson(receipt.parameters.taxonMappings) === stableJson(plan.taxonMappings), "NRCS acquisition mappings differ from plan.");
  return {
    directory,
    receiptPath,
    receiptBytes,
    receiptSha256: sha256(receiptBytes),
    receipt,
    rows,
    profiles,
    statusFingerprint: before,
  };
}

async function acquire(input: {
  plan: NationalNrcsPlan;
  acquisitionId: string;
  acquisitionDirectory: string;
  parameterHash: string;
  parameters: ReturnType<typeof buildAcquisitionParameters>;
  inputHashes: Record<string, string>;
  codeCommit: string;
  startedAt: string;
  rerunCommand: string;
  rateLimitRequestsPerSecond: number;
}) {
  if (existsSync(input.acquisitionDirectory)) return verifyNationalNrcsAcquisition(input.acquisitionDirectory, input.plan);
  const stagingDirectory = path.join(ROOT, ".cache/research", `.pending-${input.acquisitionId}`);
  const priorPartialPath = path.join(stagingDirectory, "partial-receipt.json");
  assertPartialAcquisitionResumeAllowed(existsSync(priorPartialPath) ? readJson<{ retryable?: boolean }>(priorPartialPath) : null);
  mkdirSync(path.join(stagingDirectory, "artifacts"), { recursive: true });
  const progressPath = path.join(stagingDirectory, "progress.json");
  const progress = existsSync(progressPath)
    ? readJson<ProgressFile>(progressPath)
    : { schemaVersion: 1 as const, acquisitionId: input.acquisitionId, codeCommit: input.codeCommit, requests: [], artifacts: [], transientFailures: 0 };
  assert(progress.acquisitionId === input.acquisitionId, "NRCS partial progress belongs to a different acquisition.");
  const originalProgressCommit = progress.codeCommit ?? "05aad75e26c661e522e9b03c22c361b76a4f1273";
  progress.codeCommit = originalProgressCommit;
  for (const existingRequest of progress.requests) {
    existingRequest.acquired_code_commit ??= originalProgressCommit;
  }
  const transient = { count: progress.transientFailures };
  const completed = new Map(progress.requests.map((request) => [request.request_id, request]));
  const artifactsByPath = new Map(progress.artifacts.map((artifact) => [artifact.path, artifact]));
  const requestIntervalMs = requestIntervalMilliseconds(input.rateLimitRequestsPerSecond);
  const rateLimiter = new ProviderStartRateLimiter(requestIntervalMs);

  function persistProgress() {
    progress.transientFailures = transient.count;
    writeFileSync(progressPath, `${JSON.stringify(progress, null, 2)}\n`);
  }

  async function request(inputRequest: {
    requestId: string;
    role: ArtifactRole;
    url: string;
    method: "GET" | "POST";
    body: string | null;
    filename: string;
    mediaType: AcquisitionArtifact["media_type"];
    taxonMasterId: number | null;
    recordCount: (bytes: Buffer) => number;
  }) {
    const existing = completed.get(inputRequest.requestId);
    if (existing) {
      const artifact = artifactsByPath.get(existing.artifact_path);
      assert(artifact, `NRCS partial progress lacks artifact ${existing.artifact_path}.`);
      const bytes = verifyArtifact(stagingDirectory, artifact);
      assert(existing.url === inputRequest.url && existing.method === inputRequest.method, `NRCS resumed request contract changed for ${inputRequest.requestId}.`);
      assert(existing.request_body_sha256 === (inputRequest.body ? sha256(inputRequest.body) : null), `NRCS resumed request body changed for ${inputRequest.requestId}.`);
      const recordCount = inputRequest.recordCount(bytes);
      assert(existing.record_count === recordCount && artifact.record_count === recordCount, `NRCS resumed record count changed for ${inputRequest.requestId}.`);
      return bytes;
    }
    const response = await fetchBytes({
      url: inputRequest.url,
      method: inputRequest.method,
      body: inputRequest.body,
      accept: inputRequest.mediaType,
      maxAttempts: input.plan.maxAttempts,
      transient,
      beforeAttempt: () => rateLimiter.waitForSlot(),
    });
    const artifact = artifactFor({
      stagingDirectory,
      filename: inputRequest.filename,
      bytes: response.bytes,
      mediaType: inputRequest.mediaType,
      role: inputRequest.role,
      taxonMasterId: inputRequest.taxonMasterId,
      recordCount: 0,
      sourceUrl: inputRequest.url,
    });
    const descriptor: UpstreamRequest = {
      request_id: inputRequest.requestId,
      url: inputRequest.url,
      method: inputRequest.method,
      request_body_sha256: inputRequest.body ? sha256(inputRequest.body) : null,
      status: 200,
      retrieved_at: response.retrievedAt,
      bytes_received: response.bytes.length,
      attempt: response.attempt,
      artifact_path: artifact.path,
      role: inputRequest.role,
      taxon_master_id: inputRequest.taxonMasterId,
      record_count: 0,
      acquired_code_commit: input.codeCommit,
    };
    progress.artifacts.push(artifact);
    progress.requests.push(descriptor);
    artifactsByPath.set(artifact.path, artifact);
    completed.set(descriptor.request_id, descriptor);
    persistProgress();
    const recordCount = inputRequest.recordCount(response.bytes);
    artifact.record_count = recordCount;
    descriptor.record_count = recordCount;
    persistProgress();
    return response.bytes;
  }

  try {
    await request({ requestId: "contract-swagger", role: "swagger", url: SWAGGER_URL, method: "GET", body: null, filename: "contract-swagger.json", mediaType: "application/json", taxonMasterId: null, recordCount: () => 0 });
    await request({ requestId: "contract-mapserver", role: "service-metadata", url: SERVICE_METADATA_URL, method: "GET", body: null, filename: "mapserver-metadata.json", mediaType: "application/json", taxonMasterId: null, recordCount: () => 0 });
    await request({ requestId: "contract-layer6", role: "layer6-metadata", url: LAYER6_METADATA_URL, method: "GET", body: null, filename: "layer6-metadata.json", mediaType: "application/json", taxonMasterId: null, recordCount: () => 0 });
    const statusUrl = aggregateUrl(input.plan);
    const beforeBytes = await request({ requestId: "status-before", role: "status-before", url: statusUrl, method: "GET", body: null, filename: "status-before.json", mediaType: "application/json", taxonMasterId: null, recordCount: (bytes) => parseNrcsStatusFingerprint(bytes, input.plan).reduce((sum, row) => sum + row.rowCount, 0) });
    const before = parseNrcsStatusFingerprint(beforeBytes, input.plan);

    for (const mapping of [...input.plan.taxonMappings].sort((a, b) => a.plantMasterId - b.plantMasterId)) {
      const profileUrl = `${input.plan.profileBaseUrl}/${mapping.plantMasterId}`;
      const profileBytes = await request({
        requestId: `profile-${mapping.plantMasterId}`,
        role: "profile",
        url: profileUrl,
        method: "GET",
        body: null,
        filename: `profile-${mapping.plantMasterId}.json`,
        mediaType: "application/json",
        taxonMasterId: mapping.plantMasterId,
        recordCount: () => 1,
      });
      validateNrcsProfile(parseJson<NrcsProfile>(profileBytes, `profile ${mapping.plantMasterId}`), mapping);
      const body = JSON.stringify({ masterId: mapping.plantMasterId, allData: 1 });
      const csvBytes = await request({
        requestId: `distribution-${mapping.plantMasterId}`,
        role: "distribution",
        url: input.plan.distributionUrl,
        method: "POST",
        body,
        filename: `distribution-${mapping.plantMasterId}.csv`,
        mediaType: "text/csv",
        taxonMasterId: mapping.plantMasterId,
        recordCount: (bytes) => parseNrcsDistributionCsv(bytes, mapping).length,
      });
      parseNrcsDistributionCsv(csvBytes, mapping);
    }

    const afterBytes = await request({ requestId: "status-after", role: "status-after", url: statusUrl, method: "GET", body: null, filename: "status-after.json", mediaType: "application/json", taxonMasterId: null, recordCount: (bytes) => parseNrcsStatusFingerprint(bytes, input.plan).reduce((sum, row) => sum + row.rowCount, 0) });
    const after = parseNrcsStatusFingerprint(afterBytes, input.plan);
    if (stableJson(before) !== stableJson(after)) {
      throw new RestartRequiredAcquisitionError(
        "NRCS provider status changed during acquisition. This retained window is not resumable; preserve it and start a new acquisition with a new --started-at value.",
      );
    }

    const artifacts = [...progress.artifacts];
    const requests = [...progress.requests];
    const expectedRequests = expectedProviderRequestCount(input.plan);
    assert(requests.length === expectedRequests && artifacts.length === expectedRequests, `NRCS acquisition produced ${requests.length} requests and ${artifacts.length} artifacts, expected ${expectedRequests} each.`);
    const artifactBytes = artifacts.reduce((sum, artifact) => sum + artifact.bytes, 0);
    assert(artifactBytes <= input.plan.artifactBudgetBytes, `NRCS artifacts exceed ${input.plan.artifactBudgetBytes} bytes.`);
    const rows = artifacts.filter((artifact) => artifact.role === "distribution").flatMap((artifact) => {
      const mapping = input.plan.taxonMappings.find((entry) => entry.plantMasterId === artifact.taxon_master_id)!;
      return parseNrcsDistributionCsv(readFileSync(path.join(stagingDirectory, artifact.path)), mapping);
    });
    const usCounty = rows.filter((row) => row.country === "United States" && row.countyFips);
    const usStateOnly = rows.filter((row) => row.country === "United States" && !row.countyFips);
    const foreign = rows.filter((row) => row.country !== "United States");
    const requestCodeCommits = [...new Set(requests.map((request) => request.acquired_code_commit))].sort(compareText);
    const receipt: NationalNrcsReceipt = {
      schemaVersion: 1,
      acquisition_id: input.acquisitionId,
      status: "complete",
      started_at: input.startedAt,
      finished_at: new Date().toISOString(),
      actor_type: "adapter",
      actor_id: NRCS_ACQUISITION_ACTOR,
      source_id: NRCS_SOURCE_ID,
      code_commit: input.codeCommit,
      input_hashes: input.inputHashes,
      parameter_hash: input.parameterHash,
      parameters: input.parameters,
      upstream_requests: requests,
      artifacts,
      source_verification: {
        publisher: "USDA Natural Resources Conservation Service",
        terms_url: NRCS_TERMS_URL,
        license: "Official USDA NRCS service; no dataset-specific machine-readable license was exposed. Copyright attribution and exact source bytes are retained.",
        freshness_status: "current-provider-snapshot",
        contract_snapshot_count: 3,
        rate_limit_requests_per_second: input.rateLimitRequestsPerSecond,
        request_code_commits: requestCodeCommits,
        status_fingerprint_before_sha256: sha256(stableJson(before)),
        status_fingerprint_after_sha256: sha256(stableJson(after)),
        stable_status_window: true,
        profile_identity_complete: true,
        distribution_responses_complete: true,
        county_geography_policy: "Only United States CSV rows with explicit two-digit state FIPS and three-digit county FIPS matching current registry state and county names may publish. No coordinates, MapServer ID joins, or retired-geography crosswalks are used.",
        state_row_policy: "United States state-only rows with blank county FIPS are retained but cannot create county occurrence evidence.",
        taxonomy_policy: "Every taxon requires exact committed master ID, accepted profile identity, symbol, scientific name, and L48 Introduced profile status.",
        nativity_policy: "Before and after layer-6 aggregate fingerprints must contain only Introduced or Both establishment text for every selected taxon, with stable numeric status IDs and row counts. The provider's misleading layer-6 Symbol field carries establishment text, not the plant symbol; profile and CSV symbol fields are validated separately.",
        positive_semantics: "A qualifying provider-declared county distribution row supports recorded-present county evidence.",
        negative_semantics: "Complete taxon CSV silence creates researched-unresolved only. Failure, rejection, missing geography, and state-only rows never support absence or non-detection.",
        snapshot_completeness: `All ${input.plan.taxonMappings.length} taxon profiles and ${input.plan.taxonMappings.length} single-response distribution CSVs were retained between byte-identical normalized before/after status fingerprints, together with three provider-contract snapshots.`,
        known_caveats: [
          "The live service exposes neither historic-moment support nor CSV ETag/Last-Modified validators.",
          "Provider metadata describes a live public service while also reporting Publication20181011 and Revision20180914; both claims are preserved.",
          "Layer-6 country_subdivision_id does not join layer-2 plant_location_id or StateSearch county IDs.",
          "MapServer ID and ESRI_OID values are not stable record identities and are not used.",
          "The CSV exposes no nativity field or row date; source status and profile gates are independently retained.",
          "Layer 6 aliases establishment text as Symbol and its numeric establishment code as plant_nativity_id; neither field is treated as the plant symbol.",
        ],
      },
      counts: {
        upstream_requests: requests.length,
        distribution_responses: artifacts.filter((artifact) => artifact.role === "distribution").length,
        profile_responses: artifacts.filter((artifact) => artifact.role === "profile").length,
        contract_snapshots: artifacts.filter((artifact) => ["swagger", "service-metadata", "layer6-metadata"].includes(artifact.role)).length,
        aggregate_snapshots: artifacts.filter((artifact) => ["status-before", "status-after"].includes(artifact.role)).length,
        artifacts: artifacts.length,
        artifact_bytes: artifactBytes,
        csv_rows: rows.length,
        united_states_county_rows: usCounty.length,
        united_states_state_only_rows: usStateOnly.length,
        foreign_rows: foreign.length,
        transient_failures: transient.count,
      },
      errors: [],
      warnings: [
        "State-only distribution rows are retained outside county evidence.",
        "No coordinate-derived county mapping is permitted.",
        "No dataset-specific machine-readable license was exposed.",
        ...(requestCodeCommits.length > 1
          ? [`Acquisition resumed across actor code commits ${requestCodeCommits.join(", ")}; every retained response records its exact acquiring commit.`]
          : []),
      ],
      rerun_command: input.rerunCommand,
    };
    schemaValidator("national-usda-nrcs-plants-acquisition-receipt.schema.json").parse(receipt);
    writeFileSync(path.join(stagingDirectory, "receipt.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    rmSync(progressPath, { force: true });
    assert(!existsSync(input.acquisitionDirectory), "NRCS acquisition path appeared during acquisition.");
    mkdirSync(path.dirname(input.acquisitionDirectory), { recursive: true });
    renameSync(stagingDirectory, input.acquisitionDirectory);
    return verifyNationalNrcsAcquisition(input.acquisitionDirectory, input.plan);
  } catch (error) {
    persistProgress();
    const retryable = acquisitionFailureIsRetryable(error);
    const partial = {
      schemaVersion: 1,
      acquisitionId: input.acquisitionId,
      status: "partial",
      failedAt: new Date().toISOString(),
      completedRequestIds: [...completed.keys()].sort(compareText),
      remainingRequestCount: expectedProviderRequestCount(input.plan) - completed.size,
      retryable,
      error: error instanceof Error ? error.message : String(error),
      semantics: retryable
        ? "Partial acquisition cannot create complete pair outcomes, absence, or non-detection. Hash-verified completed request IDs may be resumed."
        : "Partial acquisition cannot create complete pair outcomes, absence, or non-detection. This stable-window failure is restart-required and the retained request IDs must not be resumed.",
    };
    writeFileSync(path.join(stagingDirectory, "partial-receipt.json"), `${JSON.stringify(partial, null, 2)}\n`);
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
  plan: NationalNrcsPlan;
  acquisition: VerifiedNrcsAcquisition;
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
  const parameterValidator = schemaValidator("usda-nrcs-plants-parameters.schema.json");
  const referenceValidator = schemaValidator("national-usda-nrcs-plants-reference.schema.json");
  const sourceVerificationValidator = schemaValidator("worker-source-verification.schema.json");
  const stagingRoot = path.join(ROOT, ".cache/research", `.nrcs-partitions-${input.acquisition.receipt.acquisition_id}`);
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
      sourceId: NRCS_SOURCE_ID,
      stateCode: scope.stateCode,
      requestedPairs: scope.requestedPairs,
      runStartedAt: input.acquisition.receipt.started_at,
      parameters: scope.parameters,
    };
    const result = replayNationalNrcsState({
      context,
      requestedPairs: scope.requestedPairs,
      rows: input.acquisition.rows,
      mappings: input.plan.taxonMappings,
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
      sourceId: NRCS_SOURCE_ID,
      stateCode: scope.stateCode,
      acquisitionArtifacts,
      adapterVersion: NRCS_ADAPTER_VERSION,
      adapterCodeSha256: input.adapterCodeHash,
      runnerCodeSha256: input.runnerCodeHash,
      partitionMode: "acquire-once-taxon-bounded-fips-csv-no-mapserver-id-join-no-coordinate-fallback",
      selectedRowsSha256: result.selectedRowsSha256,
      mappings: input.plan.taxonMappings,
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
      sourceId: NRCS_SOURCE_ID,
      stateCode: scope.stateCode,
      pairKeys: scope.candidatePairs,
      parameterHash: scope.parameterHash,
      authority: {
        name: "USDA Natural Resources Conservation Service",
        sourceUrl: NRCS_DISTRIBUTION_URL,
        publisher: "USDA NRCS",
      },
      terms: {
        license: input.acquisition.receipt.source_verification.license,
        termsUrl: NRCS_TERMS_URL,
        retentionAllowed: true,
      },
      availability: {
        status: "available",
        checkedAt: input.acquisition.receipt.finished_at,
        freshnessDate: input.plan.snapshotDate,
      },
      geography: {
        method: "Exact provider-declared state and county FIPS plus matching registered active state and county-equivalent names.",
        countyEquivalentSupported: true,
        coordinatePolicy: "Coordinates, MapServer cross-layer ID joins, and automatic retired-geography crosswalks are prohibited.",
      },
      taxonomy: {
        method: "Exact committed PLANTS master ID, accepted profile, symbol, scientific name, and L48 Introduced status.",
        targetSpeciesIds: input.plan.taxonMappings.map((mapping) => mapping.speciesId).sort(compareText),
      },
      acquisition: {
        snapshotComplete: true,
        paginationComplete: true,
        stableIdentityFields: ["plantMasterId", "Symbol", "State FIP", "County FIP"],
        requests: [],
      },
      negativeEvidence: {
        supportsVerifiedAbsence: false,
        supportsNotDetected: false,
        limitations: [
          "PLANTS distribution rows are positive occurrence documentation, not a negative survey.",
          "Source silence, failure, rejection, missing geography, and state-only rows never create absence or non-detection.",
        ],
      },
      retainedEvidence: [{ path: artifactReference.path, sha256: artifactReference.sha256, bytes: artifactReference.bytes }],
      caveats: [
        input.source.caveat,
        `The official mutable service was acquired once as ${input.plan.taxonMappings.length} complete taxon-bounded CSV responses guarded by profile and source-status fingerprints.`,
        "No dataset-specific machine-readable license or row date was exposed.",
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
      actor_id: `${NRCS_ADAPTER_ID}@${NRCS_ADAPTER_VERSION}`,
      source_id: NRCS_SOURCE_ID,
      source_registry_hash: input.sourceRegistryHash,
      adapter_id: NRCS_ADAPTER_ID,
      adapter_version: NRCS_ADAPTER_VERSION,
      adapter_code_hash: input.adapterCodeHash,
      code_commit: input.codeCommit,
      parameter_hash: scope.parameterHash,
      parameters: scope.parameters,
      requested_scope: {
        state_code: scope.stateCode,
        county_fips: scope.counties.map((county) => county.countyFips),
        species_ids: input.plan.taxonMappings.map((mapping) => mapping.speciesId).sort(compareText),
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
        "State-only rows and rows without exact current county geography cannot publish county evidence.",
      ],
      source_warnings: result.warnings,
      deviations: [
        "The national PLANTS source was acquired once as taxon-bounded CSVs and partitioned locally without state-specific network requests.",
        "Only exact accepted profile mappings, Introduced/Both status fingerprints, explicit FIPS, and matching active state/county names may publish.",
        "MapServer cross-layer IDs, coordinates, and automatic retired-geography crosswalks were not used.",
      ],
      rerun_command: input.rerunCommand,
    };
    const validationResult: SourceAdapterResult = {
      ...result,
      artifacts: [{ filename: "national-acquisition-reference.json", contents: referenceContents, mediaType: "application/json" }],
    };
    validateResearchRunInMemory({
      root: ROOT,
      sourceId: NRCS_SOURCE_ID,
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
        assert(stableJson([...existing.entries()].sort()) === stableJson([...run.contents.entries()].sort()), `Existing NRCS run differs: ${run.scope.runId}.`);
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
          sourceId: NRCS_SOURCE_ID,
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
    const commonPath = path.join(ROOT, "scripts/research/national-usda-nrcs-plants.ts");
    const runnerPath = path.join(ROOT, "scripts/research/run-national-usda-nrcs-plants.ts");
    const inputFiles = [
      options.planPath,
      path.join(ROOT, plan.selectionEvidencePath ?? "ops/national-research/evaluations/round-62-usda-nrcs-plants-portfolio-selection-20260815-r1.json"),
      commonPath,
      runnerPath,
      path.join(RESEARCH_ROOT, "source-registry.json"),
      path.join(RESEARCH_ROOT, "state-registry.json"),
      path.join(RESEARCH_ROOT, "county-equivalent-registry.json"),
      path.join(ROOT, "src/data/generated/species.json"),
      ...[
        "national-usda-nrcs-plants-plan.schema.json",
        "national-usda-nrcs-plants-acquisition-receipt.schema.json",
        "national-usda-nrcs-plants-reference.schema.json",
        "usda-nrcs-plants-parameters.schema.json",
        "worker-source-verification.schema.json",
        "run-receipt.schema.json",
        "evidence-assertion.schema.json",
        "review-event.schema.json",
        "rejection-record.schema.json",
        "pair-outcome.schema.json",
      ].map((filename) => path.join(RESEARCH_ROOT, "schemas", filename)),
    ];
    const inputHashes = inputSnapshot(inputFiles);
    const sourceRegistryPath = path.join(RESEARCH_ROOT, "source-registry.json");
    const sourceRegistryBytes = readFileSync(sourceRegistryPath);
    const sourceRegistry = JSON.parse(sourceRegistryBytes.toString("utf8")) as ResearchSourceRegistry;
    const sources = sourceRegistry.sources.filter((entry) => entry.id === NRCS_SOURCE_ID);
    assert(sources.length === 1 && sources[0]!.researchAdapter?.id === NRCS_ADAPTER_ID, "NRCS research adapter is not registered exactly once.");
    const rateLimitRequestsPerSecond = sources[0]!.researchAdapter!.rateLimitRequestsPerSecond;
    const requestIntervalMs = requestIntervalMilliseconds(rateLimitRequestsPerSecond);
    const codeCommit = gitHead();
    const adapterCodeHash = sha256(readFileSync(commonPath));
    const runnerCodeHash = sha256(readFileSync(runnerPath));
    const acquisitionParameters = buildAcquisitionParameters(plan);
    const acquisitionParameterHash = sha256(stableJson(acquisitionParameters));
    const acquisitionId = `${runTimestamp(options.startedAt).toLowerCase()}__${NRCS_SOURCE_ID}__${acquisitionParameterHash.slice(0, 12)}`;
    assert(/^[a-z0-9.-]+(?:__[a-z0-9.-]+)*$/u.test(acquisitionId), "NRCS deterministic acquisition ID violates receipt schema.");
    const acquisitionDirectory = path.join(options.acquisitionRoot, acquisitionId);
    const stateScopes = buildStateScopes({
      plan,
      acquisitionId,
      acquisitionParameterHash,
      adapterCodeHash,
      runnerCodeHash,
      startedAt: options.startedAt,
      runsRoot: options.runsRoot,
    });
    assert(stateScopes.reduce((sum, scope) => sum + scope.candidatePairs.length, 0) === plan.expectedGrossPairs, "NRCS deterministic state scope differs from gross plan.");
    const expandedCommand = [
      `& 'C:\\Code\\tools\\node-v22.23.2-win-x64\\node.exe' --import tsx '${runnerPath}'`,
      `--plan '${relativeGitPath(ROOT, options.planPath)}'`,
      `--started-at '${options.startedAt}'`,
      "--semantic-dry-run false",
      `--acquisition-root '${relativeGitPath(ROOT, options.acquisitionRoot)}'`,
      `--runs-root '${relativeGitPath(ROOT, options.runsRoot)}'`,
      `--attempt-telemetry '${options.telemetryPath
        ? relativeGitPath(ROOT, options.telemetryPath)
        : `ops/national-research/attempt-telemetry/${plan.planId}-${plan.snapshotDate.replace(/-/gu, "")}.json`}'`,
    ].join(" ");
    const expectedRequests = expectedProviderRequestCount(plan);
    if (options.semanticDryRun) {
      const preflight = {
        ok: true,
        semanticDryRun: true,
        networkRequestsIssued: 0,
        sourceId: NRCS_SOURCE_ID,
        baseSha: codeCommit,
        expectedReceiptCodeCommit: codeCommit,
        planPath: relativeGitPath(ROOT, options.planPath),
        planSha256: inputHashes[relativeGitPath(ROOT, options.planPath)],
        acquisitionParameterHash,
        acquisitionId,
        acquisitionPath: relativeGitPath(ROOT, acquisitionDirectory),
        expandedCommand,
        stateCount: stateScopes.length,
        taxonCount: plan.taxonMappings.length,
        activeCountyCount: 3144,
        orderedPairCount: plan.expectedGrossPairs,
        expectedNetNewPairsAtBaseline: plan.expectedNetNewPairsAtBaseline,
        expectedAlreadyResearchedAtBaseline: plan.expectedAlreadyResearchedAtBaseline,
        expectedProviderRequests: {
          contractSnapshots: 3,
          aggregateSnapshots: 2,
          profiles: plan.taxonMappings.length,
          distributionResponses: plan.taxonMappings.length,
          total: expectedRequests,
        },
        expectedNetPairsPerProviderRequest: Number((plan.expectedNetNewPairsAtBaseline / expectedRequests).toFixed(6)),
        retryPolicy: {
          maxAttempts: plan.maxAttempts,
          backoffMilliseconds: [1000, 5000],
          resume: "reuse each hash-verified successful deterministic artifact and retry only missing request IDs; a changed before/after source-status window is non-retryable and requires a new started-at/acquisition identity",
        },
        providerRateLimit: {
          requestsPerSecond: rateLimitRequestsPerSecond,
          minimumAttemptStartIntervalMilliseconds: requestIntervalMs,
          enforcement: "every provider attempt, including retries; hash-verified resumed artifacts issue no request",
        },
        artifactBudgetBytes: plan.artifactBudgetBytes,
        geographyPolicy: "Exact provider state/county FIPS and active-name matches only; no cross-layer ID join, coordinate fallback, or automatic retired-geography resolution.",
        negativeSemantics: "Completed silence may create researched-unresolved only; failure, rejection, incomplete scope, and missing geography create no negative claim.",
        runPaths: stateScopes.map((scope) => ({
          stateCode: scope.stateCode,
          orderedPairCount: scope.candidatePairs.length,
          pairHash: sha256(`${scope.candidatePairs.join("\n")}\n`),
          runId: scope.runId,
          outputPath: relativeGitPath(ROOT, scope.outputPath),
        })),
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

    assertGitClean(existsSync(acquisitionDirectory) ? [relativeGitPath(ROOT, acquisitionDirectory)] : []);
    assertCommittedInputs(codeCommit, inputHashes);
    assert(options.telemetryPath && !existsSync(options.telemetryPath), "NRCS attempt telemetry already exists.");
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
      rateLimitRequestsPerSecond,
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
      sourceId: NRCS_SOURCE_ID,
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
      distributionResponses: acquisition.receipt.counts.distribution_responses,
      providerRecords: acquisition.receipt.counts.csv_rows,
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
    mkdirSync(path.dirname(options.telemetryPath), { recursive: true });
    writeFileSync(options.telemetryPath, `${JSON.stringify(telemetry, null, 2)}\n`);
    console.log(JSON.stringify({
      acquisitionPath: relativeGitPath(ROOT, acquisition.directory),
      acquisitionReceiptSha256: acquisition.receiptSha256,
      ...telemetry,
      telemetryPath: relativeGitPath(ROOT, options.telemetryPath),
      runPaths: runs.map((run) => relativeGitPath(ROOT, run.finalDirectory)),
    }, null, 2));
  } finally {
    clearInterval(sampler);
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
