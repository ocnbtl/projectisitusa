import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { geoBounds, geoContains } from "d3-geo";
import { feature } from "topojson-client";

import {
  USFS_CURRENT_PLANTS_LAYER_URL,
  USFS_CURRENT_PLANTS_SOURCE_ID,
} from "./adapters/usfs-current-invasive-plants-targeted";

import { USFS_CURRENT_PLANTS_POLYGON_TOPOLOGY_PATH } from "@/lib/research/coordinate-geography-contract";
import {
  getStateDefinition,
  listCountyEquivalents,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

type Species = {
  id: string;
  scientificName: string;
};

type CountyFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { countyFips: string }
>;

type PlannerFeature = {
  attributes?: {
    objectid?: number;
    accepted_scientific_name?: string | null;
    date_collected?: number | null;
    date_collected_most_recent?: number | null;
  };
  geometry?: { rings?: number[][][] };
};

type ArcGisResponse = {
  objectIds?: number[];
  features?: PlannerFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string; details?: string[] };
};

type DisplayStatus =
  | "verified-present"
  | "verified-absent"
  | "not-detected"
  | "researched-unresolved"
  | "not-researched";

type CountyShard = {
  pairs: Array<{ speciesId: string; displayStatus: DisplayStatus }>;
  pairResolution: { defaultDisplayStatus: DisplayStatus };
};

type Preflight = {
  evaluationId: string;
  provider: {
    layerUrl: string;
    bulkArchive: {
      providerDeclaredRefreshDate: string;
      catalogResponseSha256: string;
    };
  };
};

type PlannerArguments = {
  stateCode: string;
  evaluatedAt: string;
  outputPath: string;
  preflightPath: string;
  maxSourceRecords: number;
  maxCandidates: number;
  featuresPerRequest: number;
  requestIntervalMs: number;
};

type Target = {
  pairKey: string;
  countyFips: string;
  speciesId: string;
  scientificName: string;
  objectIds: number[];
  baselineStatus: DisplayStatus;
};

const ROOT = process.cwd();
const MINIMUM_DATE = Date.parse("1900-01-01T00:00:00.000Z");
const MAX_RESPONSE_BYTES = 52_428_800;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US")
    : "";
}

function parseArguments(argv: string[]): PlannerArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    assert(flag?.startsWith("--") && value && !value.startsWith("--"), `Invalid argument sequence near ${flag ?? "end"}.`);
    values.set(flag.slice(2), value);
  }
  const supported = new Set([
    "state",
    "evaluated-at",
    "output",
    "preflight",
    "max-source-records",
    "max-candidates",
    "features-per-request",
    "request-interval-ms",
  ]);
  const unsupported = [...values.keys()].filter((key) => !supported.has(key));
  assert(unsupported.length === 0, `Unsupported arguments: ${unsupported.join(", ")}.`);
  const stateCode = (values.get("state") ?? "").toUpperCase();
  assert(getStateDefinition(stateCode)?.nationalV1Scope, `Unknown national-v1 state ${stateCode || "missing"}.`);
  const evaluatedAt = new Date(values.get("evaluated-at") ?? "").toISOString();
  assert(Date.parse(evaluatedAt) <= Date.now(), "--evaluated-at cannot be in the future.");
  const outputPath = path.resolve(ROOT, values.get("output") ?? "");
  const preflightPath = path.resolve(
    ROOT,
    values.get("preflight") ??
      "ops/national-research/evaluations/usfs-current-invasive-plants-national-preflight-20260827-r1.json",
  );
  assert(outputPath.startsWith(`${ROOT}${path.sep}`), "--output must remain inside the repository.");
  assert(!existsSync(outputPath), `Planner output already exists: ${path.relative(ROOT, outputPath)}.`);
  assert(existsSync(preflightPath), `Missing preflight ${path.relative(ROOT, preflightPath)}.`);
  const maxSourceRecords = Number(values.get("max-source-records") ?? 0);
  const maxCandidates = Number(values.get("max-candidates") ?? 5000);
  const featuresPerRequest = Number(values.get("features-per-request") ?? 500);
  const requestIntervalMs = Number(values.get("request-interval-ms") ?? 1000);
  assert(Number.isInteger(maxSourceRecords) && maxSourceRecords >= 0, "--max-source-records must be a nonnegative integer.");
  assert(Number.isInteger(maxCandidates) && maxCandidates >= 1 && maxCandidates <= 5000, "--max-candidates must be from 1 through 5000.");
  assert(Number.isInteger(featuresPerRequest) && featuresPerRequest >= 1 && featuresPerRequest <= 500, "--features-per-request must be from 1 through 500.");
  assert(Number.isInteger(requestIntervalMs) && requestIntervalMs >= 1000, "--request-interval-ms must be at least 1000.");
  return {
    stateCode,
    evaluatedAt,
    outputPath,
    preflightPath,
    maxSourceRecords,
    maxCandidates,
    featuresPerRequest,
    requestIntervalMs,
  };
}

export function stratifiedObjectIds(objectIds: number[], maximum: number) {
  const sorted = [...new Set(objectIds)].sort((left, right) => left - right);
  if (maximum === 0 || sorted.length <= maximum) return sorted;
  if (maximum === 1) return [sorted[0]];
  const selected = new Set<number>();
  for (let index = 0; index < maximum; index += 1) {
    selected.add(sorted[Math.round((index * (sorted.length - 1)) / (maximum - 1))]);
  }
  return [...selected].sort((left, right) => left - right);
}

export function chunkPlannerObjectIds(objectIds: number[], chunkSize: number) {
  const output: number[][] = [];
  for (let index = 0; index < objectIds.length; index += chunkSize) {
    output.push(objectIds.slice(index, index + chunkSize));
  }
  return output;
}

function featureCoordinates(value: PlannerFeature) {
  const output: Array<[number, number]> = [];
  for (const ring of value.geometry?.rings ?? []) {
    for (const coordinate of ring) {
      if (
        Array.isArray(coordinate) &&
        typeof coordinate[0] === "number" &&
        Number.isFinite(coordinate[0]) &&
        typeof coordinate[1] === "number" &&
        Number.isFinite(coordinate[1])
      ) {
        output.push([coordinate[0], coordinate[1]]);
      }
    }
  }
  return output;
}

function validDate(value: unknown, upperBound: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= MINIMUM_DATE && value <= upperBound;
}

function countyGeometry(stateCode: string) {
  const registered = new Map(listCountyEquivalents(stateCode).map((entry) => [entry.countyFips, entry]));
  const topologyPath = path.join(ROOT, USFS_CURRENT_PLANTS_POLYGON_TOPOLOGY_PATH);
  const topology = JSON.parse(readFileSync(topologyPath, "utf8")) as { objects: { counties: unknown } };
  const collection = feature(topology as never, topology.objects.counties as never) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    Record<string, unknown>
  >;
  const counties: Array<{
    countyFips: string;
    feature: CountyFeature;
    bounds: [[number, number], [number, number]];
  }> = [];
  for (const entry of collection.features) {
    const countyFips = String(entry.id ?? "").padStart(5, "0");
    if (!registered.has(countyFips)) continue;
    const countyFeature = { ...entry, properties: { countyFips } } as CountyFeature;
    counties.push({ countyFips, feature: countyFeature, bounds: geoBounds(countyFeature) });
  }
  assert(counties.length > 0, `No county topology resolved for ${stateCode}.`);
  const envelope = {
    xmin: Math.min(...counties.map((entry) => entry.bounds[0][0])),
    ymin: Math.min(...counties.map((entry) => entry.bounds[0][1])),
    xmax: Math.max(...counties.map((entry) => entry.bounds[1][0])),
    ymax: Math.max(...counties.map((entry) => entry.bounds[1][1])),
  };
  return { counties, envelope };
}

function pairStatuses(stateCode: string, countyFipsValues: string[]) {
  const output = new Map<string, DisplayStatus>();
  for (const countyFips of countyFipsValues) {
    const shard = JSON.parse(
      readFileSync(path.join(ROOT, "public/generated/research", stateCode, "counties", `${countyFips}.json`), "utf8"),
    ) as CountyShard;
    for (const pair of shard.pairs) output.set(`${countyFips}:${pair.speciesId}`, pair.displayStatus);
    output.set(`${countyFips}:*`, shard.pairResolution.defaultDisplayStatus);
  }
  return output;
}

function arcGisUrl(parameters: Record<string, string>) {
  const url = new URL(`${USFS_CURRENT_PLANTS_LAYER_URL}/query`);
  for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
  return url.toString();
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const preflightBytes = readFileSync(options.preflightPath);
  const preflight = JSON.parse(preflightBytes.toString("utf8")) as Preflight;
  assert(preflight.provider.layerUrl === USFS_CURRENT_PLANTS_LAYER_URL, "USFS preflight layer URL differs.");
  const species = JSON.parse(readFileSync(path.join(ROOT, "src/data/generated/species.json"), "utf8")) as Species[];
  const speciesByName = new Map(species.map((entry) => [normalizedName(entry.scientificName), entry]));
  const { counties, envelope } = countyGeometry(options.stateCode);
  const statuses = pairStatuses(options.stateCode, counties.map((entry) => entry.countyFips));
  const receipts: Array<{ label: string; urlSha256: string; responseSha256: string; bytes: number; records: number }> = [];
  let lastRequestAt = 0;
  async function fetchJson(label: string, url: string) {
    const waitMs = Math.max(0, options.requestIntervalMs - (Date.now() - lastRequestAt));
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    const response = await fetch(url, {
      headers: { "user-agent": "Project-Isitusa-USFS-state-planner/1.0" },
      signal: AbortSignal.timeout(120_000),
    });
    lastRequestAt = Date.now();
    assert(response.ok, `${label} failed with HTTP ${response.status}.`);
    const contents = await response.text();
    assert(Buffer.byteLength(contents) <= MAX_RESPONSE_BYTES, `${label} exceeded the response budget.`);
    const parsed = JSON.parse(contents) as ArcGisResponse;
    assert(!parsed.error, `${label} returned ArcGIS error: ${parsed.error?.message ?? "unknown"}.`);
    assert(parsed.exceededTransferLimit !== true, `${label} was truncated.`);
    receipts.push({
      label,
      urlSha256: sha256(url),
      responseSha256: sha256(contents),
      bytes: Buffer.byteLength(contents),
      records: parsed.objectIds?.length ?? parsed.features?.length ?? 0,
    });
    return parsed;
  }

  const idsResponse = await fetchJson("state-envelope-objectids", arcGisUrl({
    f: "json",
    where: "1=1",
    geometry: JSON.stringify(envelope),
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    returnIdsOnly: "true",
  }));
  const providerObjectIds = [...new Set(idsResponse.objectIds ?? [])].sort((left, right) => left - right);
  assert(providerObjectIds.length > 0, `USFS returned no object IDs for ${options.stateCode}.`);
  const selectedObjectIds = stratifiedObjectIds(providerObjectIds, options.maxSourceRecords);
  const objectIdsByPair = new Map<string, Set<number>>();
  let exactCatalogFeatureRows = 0;
  let invalidDateRows = 0;
  let rowsWithCountyWitness = 0;
  let rowsWithoutCountyWitness = 0;
  for (const [index, chunk] of chunkPlannerObjectIds(selectedObjectIds, options.featuresPerRequest).entries()) {
    const response = await fetchJson(`features-${String(index + 1).padStart(4, "0")}`, arcGisUrl({
      f: "json",
      objectIds: chunk.join(","),
      outFields: "objectid,accepted_scientific_name,date_collected,date_collected_most_recent",
      returnGeometry: "true",
      outSR: "4326",
      geometryPrecision: "5",
      maxAllowableOffset: "0.001",
      orderByFields: "objectid ASC",
    }));
    for (const sourceFeature of response.features ?? []) {
      const objectId = sourceFeature.attributes?.objectid;
      const catalog = speciesByName.get(normalizedName(sourceFeature.attributes?.accepted_scientific_name));
      if (!catalog || !Number.isInteger(objectId)) continue;
      exactCatalogFeatureRows += 1;
      if (
        !validDate(sourceFeature.attributes?.date_collected, Date.parse(options.evaluatedAt)) ||
        !validDate(sourceFeature.attributes?.date_collected_most_recent, Date.parse(options.evaluatedAt))
      ) {
        invalidDateRows += 1;
        continue;
      }
      const witnessedCounties = new Set<string>();
      for (const coordinate of featureCoordinates(sourceFeature)) {
        for (const county of counties) {
          if (
            coordinate[0] < county.bounds[0][0] ||
            coordinate[0] > county.bounds[1][0] ||
            coordinate[1] < county.bounds[0][1] ||
            coordinate[1] > county.bounds[1][1]
          ) continue;
          if (geoContains(county.feature, coordinate)) witnessedCounties.add(county.countyFips);
        }
      }
      if (witnessedCounties.size === 0) {
        rowsWithoutCountyWitness += 1;
        continue;
      }
      rowsWithCountyWitness += 1;
      for (const countyFips of witnessedCounties) {
        const key = `${countyFips}:${catalog.id}`;
        const values = objectIdsByPair.get(key) ?? new Set<number>();
        if (values.size < 20) values.add(objectId!);
        objectIdsByPair.set(key, values);
      }
    }
  }

  const existingDeterminationCounts = { "verified-present": 0, "verified-absent": 0 };
  const eligible: Target[] = [];
  for (const [pairKey, values] of objectIdsByPair) {
    const separator = pairKey.indexOf(":");
    const countyFips = pairKey.slice(0, separator);
    const speciesId = pairKey.slice(separator + 1);
    const catalog = species.find((entry) => entry.id === speciesId);
    assert(catalog, `Planner pair ${pairKey} lacks catalog identity.`);
    const baselineStatus = statuses.get(pairKey) ?? statuses.get(`${countyFips}:*`) ?? "not-researched";
    if (baselineStatus === "verified-present" || baselineStatus === "verified-absent") {
      existingDeterminationCounts[baselineStatus] += 1;
      continue;
    }
    eligible.push({
      pairKey,
      countyFips,
      speciesId,
      scientificName: catalog.scientificName,
      objectIds: [...values].sort((left, right) => left - right),
      baselineStatus,
    });
  }
  const statusPriority: Record<DisplayStatus, number> = {
    "not-researched": 0,
    "researched-unresolved": 1,
    "not-detected": 2,
    "verified-present": 3,
    "verified-absent": 4,
  };
  eligible.sort((left, right) =>
    right.objectIds.length - left.objectIds.length ||
    statusPriority[left.baselineStatus] - statusPriority[right.baselineStatus] ||
    compareText(left.pairKey, right.pairKey));
  const targets = eligible.slice(0, options.maxCandidates);
  const baselineStatusCounts = Object.fromEntries(
    [...new Set(targets.map((entry) => entry.baselineStatus))]
      .sort(compareText)
      .map((status) => [status, targets.filter((entry) => entry.baselineStatus === status).length]),
  );
  const evaluatedDate = options.evaluatedAt.slice(0, 10).replaceAll("-", "");
  const plan = {
    schemaVersion: 1,
    planId: `usfs-current-invasive-plants-${options.stateCode.toLowerCase()}-scale-${evaluatedDate}-r1`,
    sourceId: USFS_CURRENT_PLANTS_SOURCE_ID,
    stateCode: options.stateCode,
    generatedAt: new Date().toISOString(),
    evaluatedAt: options.evaluatedAt,
    candidates: targets.map((entry) => ({
      sourceId: USFS_CURRENT_PLANTS_SOURCE_ID,
      countyFips: entry.countyFips,
      speciesId: entry.speciesId,
    })),
    usfsPilot: {
      mode: "targeted-stable-positive-witness",
      layerUrl: USFS_CURRENT_PLANTS_LAYER_URL,
      preflightEvaluationId: preflight.evaluationId,
      providerDeclaredRefreshDate: preflight.provider.bulkArchive.providerDeclaredRefreshDate,
      catalogResponseSha256: preflight.provider.bulkArchive.catalogResponseSha256,
      minimumRequestIntervalMs: 1000,
      maxResponseBytes: MAX_RESPONSE_BYTES,
      objectIdsPerRequest: 100,
      targets: targets.map(({ baselineStatus: _baselineStatus, ...target }) => target),
    },
    discovery: {
      mode: options.maxSourceRecords > 0 ? "stratified-bounded-state-envelope" : "complete-state-envelope",
      externalMutationCount: 0,
      stateEnvelope: envelope,
      providerObjectIds: providerObjectIds.length,
      selectedObjectIds: selectedObjectIds.length,
      exactCatalogFeatureRows,
      invalidDateRows,
      rowsWithCountyWitness,
      rowsWithoutCountyWitness,
      uniqueWitnessedPairs: objectIdsByPair.size,
      excludedExistingDeterminations: existingDeterminationCounts,
      eligibleNetDeterminationCandidates: eligible.length,
      selectedNetDeterminationCandidates: targets.length,
      selectedBaselineStatusCounts: baselineStatusCounts,
      requestCount: receipts.length,
      responseBytes: receipts.reduce((sum, entry) => sum + entry.bytes, 0),
      responseLineageSha256: sha256(stableJson(receipts)),
      preflightPath: path.relative(ROOT, options.preflightPath).replaceAll("\\", "/"),
      preflightSha256: sha256(preflightBytes),
      semantics: {
        plannerCreatesEvidence: false,
        selectedTargetsRequireStableDoubleFetch: true,
        sourceSilenceCreatesAbsence: false,
        sourceSilenceCreatesNonDetection: false,
        fullGeometryCountyWitnessRequiredForPublication: true,
      },
    },
  };
  writeFileSync(options.outputPath, stableJson(plan), { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: path.relative(ROOT, options.outputPath).replaceAll("\\", "/"),
    outputSha256: sha256(stableJson(plan)),
    providerObjectIds: providerObjectIds.length,
    selectedObjectIds: selectedObjectIds.length,
    eligibleNetDeterminationCandidates: eligible.length,
    selectedNetDeterminationCandidates: targets.length,
    selectedBaselineStatusCounts: baselineStatusCounts,
    requestCount: receipts.length,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
