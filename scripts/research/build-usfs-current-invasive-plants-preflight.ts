import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import { z } from "zod";

import { sha256, stableJson } from "./national-gbif-download";

const SOURCE_ID = "usfs-current-invasive-plants";
const LAYER_URL = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InvasiveSpecies_01/MapServer/0";
const ROOT_URL = "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InvasiveSpecies_01/MapServer";
const CLEARINGHOUSE_URL = "https://data.fs.usda.gov/geodata/edw/datasets.php?xmlKeyword=Current+Invasive+Plants";
const BULK_ARCHIVE_URL = "https://data.fs.usda.gov/geodata/edw/edw_resources/fc/Bio_InvasivePlantCurrent.gdb.zip";
const SAMPLE_STRATA = 8;
const SAMPLE_ROWS_PER_STRATUM = 25;
const REQUEST_INTERVAL_MS = 1_000;
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitShaSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const DisplayStatusSchema = z.enum([
  "verified-present",
  "verified-absent",
  "not-detected",
  "researched-unresolved",
  "not-researched",
]);

const ResponseReceiptSchema = z.object({
  label: z.string().min(1),
  urlSha256: Sha256Schema,
  responseSha256: Sha256Schema,
  bytes: z.number().int().positive(),
}).strict();

const ExactMappingSchema = z.object({
  scientificName: z.string().min(1),
  speciesId: z.string().min(1),
  featureCount: z.number().int().positive(),
}).strict();

const SampleStatusSchema = z.object({
  displayStatus: DisplayStatusSchema,
  pairCount: z.number().int().nonnegative(),
}).strict();

const EstimatedCandidateSchema = z.object({
  pairKey: z.string().regex(/^[0-9]{5}:[a-z0-9-]+$/u),
  stateCode: z.string().regex(/^[A-Z]{2}$/u),
  countyFips: z.string().regex(/^[0-9]{5}$/u),
  speciesId: z.string().regex(/^[a-z0-9-]+$/u),
  scientificName: z.string().min(1),
  objectIds: z.array(z.number().int().positive()).min(1),
  geographyEstimateOnly: z.literal(true),
}).strict();

export const UsfsCurrentInvasivePlantsPreflightSchema = z.object({
  schemaVersion: z.literal(1),
  evaluationId: z.string().regex(/^usfs-current-invasive-plants-national-preflight-[0-9]{8}-r[0-9]+$/u),
  evaluatedAt: z.string().datetime(),
  baselineSha: GitShaSchema,
  source: z.object({
    sourceId: z.literal(SOURCE_ID),
    registryPath: z.literal("src/data/research/source-registry.json"),
    registrySha256: Sha256Schema,
    registryTier: z.literal("official-national"),
    evidenceCapabilities: z.array(z.literal("recorded-present")).length(1),
    negativeSemantics: z.literal("none"),
    geographicScope: z.array(z.literal("USFS lands")).length(1),
    caveat: z.string().min(1),
    targetedAdapter: z.object({
      adapterId: z.literal("usfs-current-invasive-plants-targeted"),
      adapterVersion: z.enum(["1.0.0", "1.1.0"]),
      modulePath: z.literal("scripts/research/adapters/usfs-current-invasive-plants-targeted.ts"),
      moduleSha256: Sha256Schema,
      parameterSchemaPath: z.literal("src/data/research/schemas/usfs-current-invasive-plants-targeted-parameters.schema.json"),
      parameterSchemaSha256: Sha256Schema,
      pilotPlanPath: z.literal("src/data/research/national-acquisition-plans/usfs-current-invasive-plants-or-pilot-v1.json"),
      pilotPlanSha256: Sha256Schema,
    }).strict(),
  }).strict(),
  provider: z.object({
    rootUrl: z.literal(ROOT_URL),
    layerUrl: z.literal(LAYER_URL),
    serviceVersion: z.number().positive(),
    layerName: z.literal("Current Invasive Plant Locations"),
    layerDescriptionSha256: Sha256Schema,
    copyrightText: z.string().min(1),
    geometryType: z.literal("esriGeometryPolygon"),
    maxRecordCount: z.number().int().positive(),
    supportsStatistics: z.literal(true),
    supportsDistinct: z.literal(true),
    supportsPagination: z.literal(true),
    totalFeatures: z.number().int().positive(),
    maxObjectId: z.number().int().positive(),
    bulkArchive: z.object({
      clearinghouseUrl: z.literal(CLEARINGHOUSE_URL),
      archiveUrl: z.literal(BULK_ARCHIVE_URL),
      format: z.literal("ESRI File Geodatabase ZIP"),
      advertisedSizeMb: z.literal(338),
      providerDeclaredRefreshDate: z.string().date(),
      catalogResponseSha256: Sha256Schema,
    }).strict(),
  }).strict(),
  snapshotBarrier: z.object({
    providerServiceItemId: z.null(),
    layerLastEditDate: z.null(),
    providerDeclaredSnapshotId: z.string().date(),
    datedBulkArchiveAvailable: z.literal(true),
    immutableArchiveBytesRetained: z.literal(false),
    stableTargetedAcquisitionImplemented: z.literal(true),
    targetedAcquisitionAuthorized: z.literal(true),
    reason: z.string().min(1),
    requiredContract: z.array(z.string().min(1)).min(1),
  }).strict(),
  taxonCoverage: z.object({
    catalogSpecies: z.number().int().positive(),
    catalogPlantSpecies: z.number().int().positive(),
    providerDistinctAcceptedNames: z.number().int().positive(),
    exactCatalogNames: z.number().int().positive(),
    unmatchedProviderNames: z.number().int().nonnegative(),
    exactCatalogFeatureRows: z.number().int().positive(),
    unmatchedFeatureRows: z.number().int().nonnegative(),
    missingAcceptedNameRows: z.number().int().nonnegative(),
    exactMappingsSha256: Sha256Schema,
    exactMappings: z.array(ExactMappingSchema).min(1),
  }).strict(),
  dateQuality: z.object({
    collectedDateNullRows: z.number().int().nonnegative(),
    mostRecentCollectedDateNullRows: z.number().int().nonnegative(),
    lastUpdateNullRows: z.number().int().nonnegative(),
    collectedBefore1900Rows: z.number().int().nonnegative(),
    collectedAfterEvaluationDateRows: z.number().int().nonnegative(),
    invalidOrFutureRows: z.number().int().nonnegative(),
    publicationDatePolicyImplemented: z.literal(false),
  }).strict(),
  currentMatrix: z.object({
    stateSummaryCount: z.number().int().positive(),
    activeRegistryCountyEquivalentCount: z.number().int().positive(),
    generatedCountyEquivalentCount: z.number().int().positive(),
    catalogSpeciesCount: z.number().int().positive(),
    totalPairs: z.number().int().positive(),
    verifiedPresent: z.number().int().nonnegative(),
    verifiedAbsent: z.number().int().nonnegative(),
    notDetected: z.number().int().nonnegative(),
    researchedUnresolved: z.number().int().nonnegative(),
    notResearched: z.number().int().nonnegative(),
    summaryLineageSha256: Sha256Schema,
  }).strict(),
  stratifiedSample: z.object({
    method: z.literal("eight-objectid-ranges-first-25-bbox-center-estimate"),
    geographyMethodIsPublicationSafe: z.literal(false),
    stratumCount: z.literal(SAMPLE_STRATA),
    requestedRowsPerStratum: z.literal(SAMPLE_ROWS_PER_STRATUM),
    returnedRows: z.number().int().positive(),
    exactCatalogRows: z.number().int().nonnegative(),
    unmatchedRows: z.number().int().nonnegative(),
    exactRowsResolvedToOneGeneratedCounty: z.number().int().nonnegative(),
    exactRowsOutsideGeneratedScopeOrAmbiguous: z.number().int().nonnegative(),
    uniqueResolvedCountySpeciesPairs: z.number().int().nonnegative(),
    duplicateResolvedRows: z.number().int().nonnegative(),
    currentStatusCounts: z.array(SampleStatusSchema).length(5),
    estimatedPotentialNetNewPairs: z.number().int().nonnegative(),
    estimatedCandidates: z.array(EstimatedCandidateSchema),
    sampleLineageSha256: Sha256Schema,
  }).strict(),
  decision: z.object({
    contractEngineeringStatus: z.literal("go"),
    acquisitionStatus: z.literal("go-targeted-positive-pilot"),
    generationStatus: z.literal("no-go"),
    publicationStatus: z.literal("no-go"),
    measuredNetNewPairs: z.literal(0),
    estimatedPotentialNetNewPairs: z.number().int().nonnegative(),
    nextAction: z.string().min(1),
    reason: z.string().min(1),
  }).strict(),
  semantics: z.object({
    providerRowsCreateRecordedPresenceOnly: z.literal(true),
    sourceSilenceCreatesAbsence: z.literal(false),
    sourceSilenceCreatesNotDetected: z.literal(false),
    sampleCreatesEvidence: z.literal(false),
    sampleEstimatePromisesMovement: z.literal(false),
    bboxCenterMayPublishGeography: z.literal(false),
  }).strict(),
  operations: z.object({
    networkRequests: z.number().int().positive(),
    providerGets: z.number().int().positive(),
    providerPosts: z.literal(0),
    generationCommands: z.literal(0),
    publicationMutations: z.literal(0),
    responseReceipts: z.array(ResponseReceiptSchema).min(1),
  }).strict(),
  checks: z.object({
    sourceRegistryContractPinned: z.literal(true),
    exactNameCountsConserved: z.literal(true),
    exactFeatureCountsConserved: z.literal(true),
    sampleCountsConserved: z.literal(true),
    currentMatrixCountsConserved: z.literal(true),
    negativeSemanticsPreserved: z.literal(true),
    externalMutationCountIsZero: z.literal(true),
  }).strict(),
}).strict().superRefine((value, context) => {
  const taxon = value.taxonCoverage;
  if (taxon.exactCatalogNames + taxon.unmatchedProviderNames !== taxon.providerDistinctAcceptedNames) {
    context.addIssue({ code: "custom", message: "USFS accepted-name counts do not conserve." });
  }
  if (
    taxon.exactCatalogFeatureRows + taxon.unmatchedFeatureRows +
      taxon.missingAcceptedNameRows !== value.provider.totalFeatures
  ) {
    context.addIssue({ code: "custom", message: "USFS feature-row counts do not conserve." });
  }
  const sample = value.stratifiedSample;
  if (
    sample.exactCatalogRows + sample.unmatchedRows !== sample.returnedRows ||
    sample.exactRowsResolvedToOneGeneratedCounty + sample.exactRowsOutsideGeneratedScopeOrAmbiguous !== sample.exactCatalogRows ||
    sample.uniqueResolvedCountySpeciesPairs + sample.duplicateResolvedRows !== sample.exactRowsResolvedToOneGeneratedCounty
  ) {
    context.addIssue({ code: "custom", message: "USFS sample counts do not conserve." });
  }
  const sampleStatusTotal = sample.currentStatusCounts.reduce((sum, entry) => sum + entry.pairCount, 0);
  if (sampleStatusTotal !== sample.uniqueResolvedCountySpeciesPairs) {
    context.addIssue({ code: "custom", message: "USFS sample status counts do not conserve." });
  }
  const matrix = value.currentMatrix;
  if (
    matrix.verifiedPresent + matrix.verifiedAbsent + matrix.notDetected +
      matrix.researchedUnresolved + matrix.notResearched !== matrix.totalPairs
  ) {
    context.addIssue({ code: "custom", message: "Current matrix counts do not conserve." });
  }
  if (
    value.operations.providerGets !== value.operations.networkRequests ||
    value.operations.responseReceipts.length !== value.operations.networkRequests
  ) {
    context.addIssue({ code: "custom", message: "USFS request receipts do not conserve." });
  }
  if (sample.estimatedPotentialNetNewPairs !== value.decision.estimatedPotentialNetNewPairs) {
    context.addIssue({ code: "custom", message: "USFS estimated overlap counts do not conserve." });
  }
  if (
    sample.estimatedCandidates.length !== sample.estimatedPotentialNetNewPairs ||
    new Set(sample.estimatedCandidates.map((candidate) => candidate.pairKey)).size !== sample.estimatedCandidates.length
  ) {
    context.addIssue({ code: "custom", message: "USFS estimated candidate identities do not conserve." });
  }
});

type Args = {
  outputPath: string;
  evaluationId: string;
  evaluatedAt: string;
  baselineSha: string;
};

type ArcGisFeature = {
  attributes?: Record<string, unknown>;
  geometry?: { rings?: unknown };
};

type ArcGisResponse = {
  count?: number;
  features?: ArcGisFeature[];
  error?: { message?: string; details?: string[] };
  [key: string]: unknown;
};

type CatalogSpecies = {
  id: string;
  scientificName: string;
  category: string;
};

type CountyRegistryEntry = {
  countyFips: string;
  stateCode: string;
  topologyId: string;
  status: string;
};

type CountyFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, {
  countyFips: string;
}>;

type CountyShard = {
  pairResolution: { defaultDisplayStatus: string };
  pairs: Array<{ speciesId: string; displayStatus: string }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Expected --key value arguments; received ${key ?? "end of input"}.`);
    values.set(key.slice(2), value);
  }
  const output = values.get("output");
  const evaluationId = values.get("evaluation-id");
  const evaluatedAt = values.get("evaluated-at");
  const baselineSha = values.get("baseline-sha");
  assert(output && evaluationId && evaluatedAt && baselineSha, "--output, --evaluation-id, --evaluated-at, and --baseline-sha are required.");
  return {
    outputPath: path.resolve(output),
    evaluationId,
    evaluatedAt,
    baselineSha,
  };
}

function normalizeScientificName(value: string) {
  return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function integerAttribute(featureValue: ArcGisFeature, key: string) {
  const value = featureValue.attributes?.[key];
  assert(typeof value === "number" && Number.isInteger(value), `Expected integer ArcGIS attribute ${key}.`);
  return value;
}

function stringAttribute(featureValue: ArcGisFeature, key: string) {
  const value = featureValue.attributes?.[key];
  assert(typeof value === "string" && value.trim(), `Expected non-empty ArcGIS attribute ${key}.`);
  return value.trim();
}

function arcGisUrl(baseUrl: string, parameters: Record<string, string>) {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

function bboxCenter(ringsValue: unknown) {
  if (!Array.isArray(ringsValue)) return null;
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;
  for (const ring of ringsValue) {
    if (!Array.isArray(ring)) continue;
    for (const coordinate of ring) {
      if (!Array.isArray(coordinate) || typeof coordinate[0] !== "number" || typeof coordinate[1] !== "number") continue;
      minLongitude = Math.min(minLongitude, coordinate[0]);
      minLatitude = Math.min(minLatitude, coordinate[1]);
      maxLongitude = Math.max(maxLongitude, coordinate[0]);
      maxLatitude = Math.max(maxLatitude, coordinate[1]);
    }
  }
  if (![minLongitude, minLatitude, maxLongitude, maxLatitude].every(Number.isFinite)) return null;
  return [(minLongitude + maxLongitude) / 2, (minLatitude + maxLatitude) / 2] as [number, number];
}

function readCurrentMatrix(root: string, activeRegistryCountyEquivalentCount: number, catalogSpeciesCount: number) {
  const generatedRoot = path.join(root, "public/generated/research");
  const lineage: Array<{ stateCode: string; path: string; sha256: string }> = [];
  const totals = {
    totalPairs: 0,
    verifiedPresent: 0,
    verifiedAbsent: 0,
    notDetected: 0,
    researchedUnresolved: 0,
    notResearched: 0,
  };
  let countyCount = 0;
  for (const entry of readdirSync(generatedRoot, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const summaryPath = path.join(generatedRoot, entry.name, "summary.json");
    if (!existsSync(summaryPath)) continue;
    const bytes = readFileSync(summaryPath);
    const summary = JSON.parse(bytes.toString("utf8")) as {
      stateCode?: string;
      summary?: Record<string, unknown>;
    };
    assert(summary.stateCode === entry.name, `Research summary state mismatch for ${entry.name}.`);
    const counts = summary.summary;
    assert(counts, `Research summary counts are missing for ${entry.name}.`);
    const speciesCount = counts.speciesCount;
    const stateCountyCount = counts.countyCount;
    assert(speciesCount === catalogSpeciesCount, `Catalog count mismatch in ${entry.name}.`);
    assert(typeof stateCountyCount === "number" && Number.isInteger(stateCountyCount), `County count missing in ${entry.name}.`);
    countyCount += stateCountyCount;
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      const value = counts[key];
      assert(typeof value === "number" && Number.isInteger(value), `Matrix count ${key} is missing in ${entry.name}.`);
      totals[key] += value;
    }
    lineage.push({
      stateCode: entry.name,
      path: path.relative(root, summaryPath).replaceAll("\\", "/"),
      sha256: sha256(bytes),
    });
  }
  assert(countyCount <= activeRegistryCountyEquivalentCount, "Generated county count exceeds the active registry count.");
  assert(totals.totalPairs === countyCount * catalogSpeciesCount, "Generated matrix denominator does not match the generated county by catalog product.");
  return {
    stateSummaryCount: lineage.length,
    activeRegistryCountyEquivalentCount,
    generatedCountyEquivalentCount: countyCount,
    catalogSpeciesCount,
    ...totals,
    summaryLineageSha256: sha256(stableJson(lineage)),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  assert(!existsSync(args.outputPath), `Refusing to overwrite existing preflight artifact: ${args.outputPath}`);
  assert(new Date(args.evaluatedAt).toISOString() === args.evaluatedAt, "--evaluated-at must be a canonical UTC datetime.");
  const currentSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  assert(currentSha === args.baselineSha, `Baseline ${args.baselineSha} differs from HEAD ${currentSha}.`);

  const registryPath = path.join(root, "src/data/research/source-registry.json");
  const registryBytes = readFileSync(registryPath);
  const registry = JSON.parse(registryBytes.toString("utf8")) as { sources?: Array<Record<string, unknown>> };
  const source = registry.sources?.find((entry) => entry.id === SOURCE_ID);
  assert(source, `Source registry entry ${SOURCE_ID} is missing.`);
  assert(source.tier === "official-national" && source.negativeSemantics === "none", "USFS registry semantics differ from the preflight contract.");
  assert(stableJson(source.evidenceCapabilities) === stableJson(["recorded-present"]), "USFS evidence capabilities differ from the preflight contract.");
  assert(stableJson(source.geographicScope) === stableJson(["USFS lands"]), "USFS geographic scope differs from the preflight contract.");
  assert(typeof source.caveat === "string" && source.caveat, "USFS source caveat is missing.");
  const registeredAdapter = source.researchAdapter as Record<string, unknown> | undefined;
  assert(registeredAdapter?.id === "usfs-current-invasive-plants-targeted", "USFS targeted adapter is not registered.");
  assert(stableJson(registeredAdapter.allowedVersions) === stableJson(["1.0.0", "1.1.0"]), "USFS targeted adapter version differs.");
  const adapterPath = path.join(root, "scripts/research/adapters/usfs-current-invasive-plants-targeted.ts");
  const parameterSchemaPath = path.join(root, "src/data/research/schemas/usfs-current-invasive-plants-targeted-parameters.schema.json");
  const pilotPlanPath = path.join(root, "src/data/research/national-acquisition-plans/usfs-current-invasive-plants-or-pilot-v1.json");
  const adapterBytes = readFileSync(adapterPath);
  const parameterSchemaBytes = readFileSync(parameterSchemaPath);
  const pilotPlanBytes = readFileSync(pilotPlanPath);

  const species = JSON.parse(readFileSync(path.join(root, "src/data/generated/species.json"), "utf8")) as CatalogSpecies[];
  const speciesByScientificName = new Map<string, CatalogSpecies>();
  for (const entry of species) {
    const key = normalizeScientificName(entry.scientificName);
    assert(!speciesByScientificName.has(key), `Duplicate catalog scientific name ${entry.scientificName}.`);
    speciesByScientificName.set(key, entry);
  }

  const countyRegistry = JSON.parse(readFileSync(path.join(root, "src/data/research/county-equivalent-registry.json"), "utf8")) as {
    activeCountyEquivalentCount: number;
    countyEquivalents: CountyRegistryEntry[];
  };
  const activeCounties = countyRegistry.countyEquivalents.filter((entry) => entry.status === "active");
  assert(activeCounties.length === countyRegistry.activeCountyEquivalentCount, "Active county registry count does not conserve.");
  const activeCountyByTopologyId = new Map(activeCounties.map((entry) => [entry.topologyId, entry]));
  const activeCountyByFips = new Map(activeCounties.map((entry) => [entry.countyFips, entry]));
  const generatedStateCodes = new Set(
    readdirSync(path.join(root, "public/generated/research"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(path.join(root, "public/generated/research", entry.name, "summary.json")))
      .map((entry) => entry.name),
  );
  const topology = JSON.parse(readFileSync(path.join(root, "node_modules/us-atlas/counties-10m.json"), "utf8")) as {
    objects: { counties: unknown };
  };
  const topologyFeatures = feature(topology as never, topology.objects.counties as never) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;
  const countyFeatures: CountyFeature[] = topologyFeatures.features.flatMap((entry) => {
    const topologyId = String(entry.id ?? "").padStart(5, "0");
    const county = activeCountyByTopologyId.get(topologyId);
    return county && generatedStateCodes.has(county.stateCode)
      ? [{ ...entry, properties: { countyFips: county.countyFips } }]
      : [];
  });

  const responseReceipts: z.infer<typeof ResponseReceiptSchema>[] = [];
  let lastRequestAt = 0;
  async function fetchJson(label: string, url: string) {
    const waitMs = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const response = await fetch(url, {
      headers: { "user-agent": "Project-Isitusa-USFS-preflight/1.0" },
      signal: AbortSignal.timeout(45_000),
    });
    lastRequestAt = Date.now();
    assert(response.ok, `${label} failed with HTTP ${response.status}.`);
    const text = await response.text();
    const parsed = JSON.parse(text) as ArcGisResponse;
    assert(!parsed.error, `${label} returned ArcGIS error: ${parsed.error?.message ?? "unknown error"}.`);
    responseReceipts.push({
      label,
      urlSha256: sha256(url),
      responseSha256: sha256(text),
      bytes: Buffer.byteLength(text),
    });
    return parsed;
  }

  async function fetchText(label: string, url: string) {
    const waitMs = Math.max(0, REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const response = await fetch(url, {
      headers: { "user-agent": "Project-Isitusa-USFS-preflight/1.0" },
      signal: AbortSignal.timeout(45_000),
    });
    lastRequestAt = Date.now();
    assert(response.ok, `${label} failed with HTTP ${response.status}.`);
    const contents = await response.text();
    responseReceipts.push({
      label,
      urlSha256: sha256(url),
      responseSha256: sha256(contents),
      bytes: Buffer.byteLength(contents),
    });
    return contents;
  }

  const rootMetadata = await fetchJson("service-metadata", arcGisUrl(ROOT_URL, { f: "json" }));
  const layerMetadata = await fetchJson("layer-metadata", arcGisUrl(LAYER_URL, { f: "json" }));
  const clearinghouseHtml = await fetchText("bulk-archive-catalog", CLEARINGHOUSE_URL);
  assert(clearinghouseHtml.includes(BULK_ARCHIVE_URL) || clearinghouseHtml.includes("Bio_InvasivePlantCurrent.gdb.zip"), "USFS bulk archive link is missing from the clearinghouse catalog.");
  const refreshMatch = clearinghouseHtml.match(/Date of last refresh:\s*([A-Z][a-z]{2})\s+([0-9]{1,2}),\s+([0-9]{4})/u);
  assert(refreshMatch, "USFS bulk archive refresh date is missing from the clearinghouse catalog.");
  const month = new Map([
    ["Jan", "01"], ["Feb", "02"], ["Mar", "03"], ["Apr", "04"],
    ["May", "05"], ["Jun", "06"], ["Jul", "07"], ["Aug", "08"],
    ["Sep", "09"], ["Oct", "10"], ["Nov", "11"], ["Dec", "12"],
  ]).get(refreshMatch[1]);
  assert(month, `Unsupported USFS refresh month ${refreshMatch[1]}.`);
  const providerDeclaredRefreshDate = `${refreshMatch[3]}-${month}-${refreshMatch[2].padStart(2, "0")}`;
  assert(layerMetadata.name === "Current Invasive Plant Locations", "USFS layer name changed.");
  assert(layerMetadata.geometryType === "esriGeometryPolygon", "USFS layer geometry type changed.");
  const advanced = layerMetadata.advancedQueryCapabilities as Record<string, unknown> | undefined;
  assert(advanced?.supportsStatistics === true && advanced.supportsDistinct === true && advanced.supportsPagination === true, "USFS query capabilities no longer satisfy preflight requirements.");

  const countResult = await fetchJson("feature-count", arcGisUrl(`${LAYER_URL}/query`, {
    f: "json", where: "1=1", returnCountOnly: "true",
  }));
  assert(typeof countResult.count === "number" && Number.isInteger(countResult.count) && countResult.count > 0, "USFS feature count is invalid.");
  const totalFeatures = countResult.count;

  const groupedNames = await fetchJson("accepted-name-groups", arcGisUrl(`${LAYER_URL}/query`, {
    f: "json",
    where: "1=1",
    outFields: "accepted_scientific_name",
    outStatistics: JSON.stringify([{ statisticType: "count", onStatisticField: "objectid", outStatisticFieldName: "feature_count" }]),
    groupByFieldsForStatistics: "accepted_scientific_name",
    orderByFields: "feature_count DESC,accepted_scientific_name ASC",
    returnGeometry: "false",
    resultRecordCount: "2000",
  }));
  const groupedFeatures = groupedNames.features ?? [];
  assert(groupedFeatures.length > 0 && groupedNames.exceededTransferLimit !== true, "USFS accepted-name grouping is empty or truncated.");
  const exactMappings: Array<z.infer<typeof ExactMappingSchema>> = [];
  let unmatchedFeatureRows = 0;
  let missingAcceptedNameRows = 0;
  let providerDistinctAcceptedNames = 0;
  for (const groupedFeature of groupedFeatures) {
    const featureCount = integerAttribute(groupedFeature, "feature_count");
    const rawScientificName = groupedFeature.attributes?.accepted_scientific_name;
    if (typeof rawScientificName !== "string" || !rawScientificName.trim()) {
      missingAcceptedNameRows += featureCount;
      continue;
    }
    const scientificName = rawScientificName.trim();
    providerDistinctAcceptedNames += 1;
    const catalog = speciesByScientificName.get(normalizeScientificName(scientificName));
    if (catalog) exactMappings.push({ scientificName, speciesId: catalog.id, featureCount });
    else unmatchedFeatureRows += featureCount;
  }
  exactMappings.sort((a, b) => a.scientificName.localeCompare(b.scientificName));
  const exactCatalogFeatureRows = exactMappings.reduce((sum, entry) => sum + entry.featureCount, 0);

  const maxObjectResult = await fetchJson("maximum-objectid", arcGisUrl(`${LAYER_URL}/query`, {
    f: "json",
    where: "1=1",
    outStatistics: JSON.stringify([{ statisticType: "max", onStatisticField: "objectid", outStatisticFieldName: "max_objectid" }]),
    returnGeometry: "false",
  }));
  const maxObjectFeature = maxObjectResult.features?.[0];
  assert(maxObjectFeature, "USFS maximum objectid response is empty.");
  const maxObjectId = integerAttribute(maxObjectFeature, "max_objectid");

  async function countWhere(label: string, where: string) {
    const result = await fetchJson(label, arcGisUrl(`${LAYER_URL}/query`, { f: "json", where, returnCountOnly: "true" }));
    assert(typeof result.count === "number" && Number.isInteger(result.count), `${label} count is invalid.`);
    return result.count;
  }
  const evaluationDate = args.evaluatedAt.slice(0, 10);
  const collectedDateNullRows = await countWhere("date-collected-null", "date_collected IS NULL");
  const mostRecentCollectedDateNullRows = await countWhere("date-collected-most-recent-null", "date_collected_most_recent IS NULL");
  const lastUpdateNullRows = await countWhere("last-update-null", "last_update IS NULL");
  const collectedBefore1900Rows = await countWhere("date-collected-before-1900", "date_collected < DATE '1900-01-01'");
  const collectedAfterEvaluationDateRows = await countWhere("date-collected-after-evaluation", `date_collected > DATE '${evaluationDate}'`);

  const sampledRows: Array<{
    stratum: number;
    objectId: number;
    speciesId: string | null;
    acceptedScientificName: string | null;
    countyFips: string | null;
  }> = [];
  for (let stratum = 0; stratum < SAMPLE_STRATA; stratum += 1) {
    const start = Math.floor((stratum * maxObjectId) / SAMPLE_STRATA) + 1;
    const end = Math.floor(((stratum + 1) * maxObjectId) / SAMPLE_STRATA);
    const sampleResponse = await fetchJson(`sample-stratum-${stratum + 1}`, arcGisUrl(`${LAYER_URL}/query`, {
      f: "json",
      where: `objectid BETWEEN ${start} AND ${end}`,
      outFields: "objectid,accepted_scientific_name",
      orderByFields: "objectid ASC",
      resultRecordCount: String(SAMPLE_ROWS_PER_STRATUM),
      returnGeometry: "true",
      outSR: "4326",
      geometryPrecision: "5",
      maxAllowableOffset: "0.005",
    }));
    const rows = sampleResponse.features ?? [];
    assert(rows.length > 0 && rows.length <= SAMPLE_ROWS_PER_STRATUM, `USFS sample stratum ${stratum + 1} is empty or oversized.`);
    for (const row of rows) {
      const rawScientificName = row.attributes?.accepted_scientific_name;
      const scientificName = typeof rawScientificName === "string" && rawScientificName.trim()
        ? rawScientificName.trim()
        : null;
      const catalog = scientificName
        ? speciesByScientificName.get(normalizeScientificName(scientificName))
        : undefined;
      let countyFips: string | null = null;
      if (catalog) {
        const center = bboxCenter(row.geometry?.rings);
        if (center) {
          const matches = countyFeatures.filter((countyFeature) => geoContains(countyFeature, center));
          if (matches.length === 1) countyFips = matches[0].properties.countyFips;
        }
      }
      sampledRows.push({
        stratum: stratum + 1,
        objectId: integerAttribute(row, "objectid"),
        speciesId: catalog?.id ?? null,
        acceptedScientificName: scientificName,
        countyFips,
      });
    }
  }

  const exactRows = sampledRows.filter((row) => row.speciesId !== null);
  const resolvedRows = exactRows.filter((row) => row.countyFips !== null);
  const uniquePairs = new Map<string, { countyFips: string; speciesId: string }>();
  for (const row of resolvedRows) {
    assert(row.countyFips && row.speciesId, "Resolved sample row is missing its pair identity.");
    uniquePairs.set(`${row.countyFips}:${row.speciesId}`, { countyFips: row.countyFips, speciesId: row.speciesId });
  }
  const currentStatusCounts = new Map<z.infer<typeof DisplayStatusSchema>, number>([
    ["verified-present", 0],
    ["verified-absent", 0],
    ["not-detected", 0],
    ["researched-unresolved", 0],
    ["not-researched", 0],
  ]);
  const statusByPair = new Map<string, z.infer<typeof DisplayStatusSchema>>();
  for (const { countyFips, speciesId } of uniquePairs.values()) {
    const county = activeCountyByFips.get(countyFips);
    assert(county, `Resolved sample county ${countyFips} is not active.`);
    const shardPath = path.join(root, "public/generated/research", county.stateCode, "counties", `${countyFips}.json`);
    const shard = JSON.parse(readFileSync(shardPath, "utf8")) as CountyShard;
    const statusValue = shard.pairs.find((pair) => pair.speciesId === speciesId)?.displayStatus ?? shard.pairResolution.defaultDisplayStatus;
    const status = DisplayStatusSchema.parse(statusValue);
    currentStatusCounts.set(status, (currentStatusCounts.get(status) ?? 0) + 1);
    statusByPair.set(`${countyFips}:${speciesId}`, status);
  }
  const statusEntries = [...currentStatusCounts.entries()].map(([displayStatus, pairCount]) => ({ displayStatus, pairCount }));
  const estimatedPotentialNetNewPairs = currentStatusCounts.get("not-researched") ?? 0;
  const catalogById = new Map(species.map((entry) => [entry.id, entry]));
  const estimatedCandidates = [...uniquePairs.entries()]
    .filter(([key]) => statusByPair.get(key) === "not-researched")
    .map(([pairKeyValue, pair]) => {
      const county = activeCountyByFips.get(pair.countyFips);
      const catalog = catalogById.get(pair.speciesId);
      assert(county && catalog, `Estimated pair ${pairKeyValue} lacks catalog or geography identity.`);
      const objectIds = [...new Set(resolvedRows
        .filter((row) => row.countyFips === pair.countyFips && row.speciesId === pair.speciesId)
        .map((row) => row.objectId))].sort((left, right) => left - right);
      assert(objectIds.length > 0, `Estimated pair ${pairKeyValue} has no source object identity.`);
      return {
        pairKey: pairKeyValue,
        stateCode: county.stateCode,
        countyFips: pair.countyFips,
        speciesId: pair.speciesId,
        scientificName: catalog.scientificName,
        objectIds,
        geographyEstimateOnly: true as const,
      };
    })
    .sort((left, right) => left.pairKey.localeCompare(right.pairKey));
  const currentMatrix = readCurrentMatrix(root, countyRegistry.activeCountyEquivalentCount, species.length);

  const output = UsfsCurrentInvasivePlantsPreflightSchema.parse({
    schemaVersion: 1,
    evaluationId: args.evaluationId,
    evaluatedAt: args.evaluatedAt,
    baselineSha: args.baselineSha,
    source: {
      sourceId: SOURCE_ID,
      registryPath: "src/data/research/source-registry.json",
      registrySha256: sha256(registryBytes),
      registryTier: source.tier,
      evidenceCapabilities: source.evidenceCapabilities,
      negativeSemantics: source.negativeSemantics,
      geographicScope: source.geographicScope,
      caveat: source.caveat,
      targetedAdapter: {
        adapterId: "usfs-current-invasive-plants-targeted",
        adapterVersion: "1.1.0",
        modulePath: "scripts/research/adapters/usfs-current-invasive-plants-targeted.ts",
        moduleSha256: sha256(adapterBytes),
        parameterSchemaPath: "src/data/research/schemas/usfs-current-invasive-plants-targeted-parameters.schema.json",
        parameterSchemaSha256: sha256(parameterSchemaBytes),
        pilotPlanPath: "src/data/research/national-acquisition-plans/usfs-current-invasive-plants-or-pilot-v1.json",
        pilotPlanSha256: sha256(pilotPlanBytes),
      },
    },
    provider: {
      rootUrl: ROOT_URL,
      layerUrl: LAYER_URL,
      serviceVersion: rootMetadata.currentVersion,
      layerName: layerMetadata.name,
      layerDescriptionSha256: sha256(String(layerMetadata.description ?? "")),
      copyrightText: rootMetadata.copyrightText,
      geometryType: layerMetadata.geometryType,
      maxRecordCount: layerMetadata.maxRecordCount,
      supportsStatistics: advanced.supportsStatistics,
      supportsDistinct: advanced.supportsDistinct,
      supportsPagination: advanced.supportsPagination,
      totalFeatures,
      maxObjectId,
      bulkArchive: {
        clearinghouseUrl: CLEARINGHOUSE_URL,
        archiveUrl: BULK_ARCHIVE_URL,
        format: "ESRI File Geodatabase ZIP",
        advertisedSizeMb: 338,
        providerDeclaredRefreshDate,
        catalogResponseSha256: sha256(clearinghouseHtml),
      },
    },
    snapshotBarrier: {
      providerServiceItemId: rootMetadata.serviceItemId ?? null,
      layerLastEditDate: (layerMetadata.editingInfo as Record<string, unknown> | undefined)?.lastEditDate ?? null,
      providerDeclaredSnapshotId: providerDeclaredRefreshDate,
      datedBulkArchiveAvailable: true,
      immutableArchiveBytesRetained: false,
      stableTargetedAcquisitionImplemented: true,
      targetedAcquisitionAuthorized: true,
      reason: "The live EDW layer exposes no edit watermark, but the registered targeted adapter now retains two normalized-identical responses for explicit positive object identities and fails closed on drift. The official dated File Geodatabase remains the later complete-national path.",
      requiredContract: [
        "Capture the complete ordered objectid set twice around acquisition and fail closed on count, maximum objectid, or identity drift.",
        "Retain every raw response with URL hash, response hash, byte count, retrieval time, and terminal pagination proof.",
        "Resolve full infestation polygons against active county geometry; bbox centers remain preflight estimates only.",
        "Reject ambiguous, retired, offshore, invalid-date, future-date, genus-only, and unmatched taxonomy records conservatively.",
        "Replay fixture and retained-artifact tests must prove occurrence-only semantics and zero negative inference from silence.",
      ],
    },
    taxonCoverage: {
      catalogSpecies: species.length,
      catalogPlantSpecies: species.filter((entry) => entry.category === "plants").length,
      providerDistinctAcceptedNames,
      exactCatalogNames: exactMappings.length,
      unmatchedProviderNames: providerDistinctAcceptedNames - exactMappings.length,
      exactCatalogFeatureRows,
      unmatchedFeatureRows,
      missingAcceptedNameRows,
      exactMappingsSha256: sha256(stableJson(exactMappings)),
      exactMappings,
    },
    dateQuality: {
      collectedDateNullRows,
      mostRecentCollectedDateNullRows,
      lastUpdateNullRows,
      collectedBefore1900Rows,
      collectedAfterEvaluationDateRows,
      invalidOrFutureRows: collectedBefore1900Rows + collectedAfterEvaluationDateRows,
      publicationDatePolicyImplemented: false,
    },
    currentMatrix,
    stratifiedSample: {
      method: "eight-objectid-ranges-first-25-bbox-center-estimate",
      geographyMethodIsPublicationSafe: false,
      stratumCount: SAMPLE_STRATA,
      requestedRowsPerStratum: SAMPLE_ROWS_PER_STRATUM,
      returnedRows: sampledRows.length,
      exactCatalogRows: exactRows.length,
      unmatchedRows: sampledRows.length - exactRows.length,
      exactRowsResolvedToOneGeneratedCounty: resolvedRows.length,
      exactRowsOutsideGeneratedScopeOrAmbiguous: exactRows.length - resolvedRows.length,
      uniqueResolvedCountySpeciesPairs: uniquePairs.size,
      duplicateResolvedRows: resolvedRows.length - uniquePairs.size,
      currentStatusCounts: statusEntries,
      estimatedPotentialNetNewPairs,
      estimatedCandidates,
      sampleLineageSha256: sha256(stableJson(sampledRows)),
    },
    decision: {
      contractEngineeringStatus: "go",
      acquisitionStatus: "go-targeted-positive-pilot",
      generationStatus: "no-go",
      publicationStatus: "no-go",
      measuredNetNewPairs: 0,
      estimatedPotentialNetNewPairs,
      nextAction: "Commit the registered targeted adapter and Oregon pilot plan, run the no-network semantic dry run from that exact commit, then execute the 16-pair pilot with immutable double-response artifacts. Generate only from accepted recorded-presence assertions after run validation.",
      reason: "The official source has material exact-catalog occurrence volume, a dated bulk archive, sampled overlap opportunity, and a fixture-tested targeted positive-witness adapter. Only the bounded Oregon acquisition is authorized here; the sample remains non-evidence until live records pass every adapter gate.",
    },
    semantics: {
      providerRowsCreateRecordedPresenceOnly: true,
      sourceSilenceCreatesAbsence: false,
      sourceSilenceCreatesNotDetected: false,
      sampleCreatesEvidence: false,
      sampleEstimatePromisesMovement: false,
      bboxCenterMayPublishGeography: false,
    },
    operations: {
      networkRequests: responseReceipts.length,
      providerGets: responseReceipts.length,
      providerPosts: 0,
      generationCommands: 0,
      publicationMutations: 0,
      responseReceipts,
    },
    checks: {
      sourceRegistryContractPinned: true,
      exactNameCountsConserved: true,
      exactFeatureCountsConserved: true,
      sampleCountsConserved: true,
      currentMatrixCountsConserved: true,
      negativeSemanticsPreserved: true,
      externalMutationCountIsZero: true,
    },
  });
  const contents = stableJson(output);
  writeFileSync(args.outputPath, contents, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: path.relative(root, args.outputPath).replaceAll("\\", "/"),
    outputSha256: sha256(contents),
    totalFeatures: output.provider.totalFeatures,
    exactCatalogNames: output.taxonCoverage.exactCatalogNames,
    exactCatalogFeatureRows: output.taxonCoverage.exactCatalogFeatureRows,
    sampledPairs: output.stratifiedSample.uniqueResolvedCountySpeciesPairs,
    estimatedPotentialNetNewPairs: output.stratifiedSample.estimatedPotentialNetNewPairs,
    acquisitionStatus: output.decision.acquisitionStatus,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
