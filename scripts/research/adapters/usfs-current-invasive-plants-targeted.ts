import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

import type { ResearchSourceAdapter, SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import type {
  EvidenceReviewEvent,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { getStateDefinition, listCountyEquivalents } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";
import {
  USFS_CURRENT_PLANTS_POLYGON_GEOGRAPHY_METHOD,
  USFS_CURRENT_PLANTS_POLYGON_TOPOLOGY_PATH,
} from "@/lib/research/coordinate-geography-contract";

export const USFS_CURRENT_PLANTS_SOURCE_ID = "usfs-current-invasive-plants" as const;
export const USFS_CURRENT_PLANTS_ADAPTER_ID = "usfs-current-invasive-plants-targeted" as const;
export const USFS_CURRENT_PLANTS_ADAPTER_VERSION = "1.1.0" as const;
export const USFS_CURRENT_PLANTS_LAYER_URL =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InvasiveSpecies_01/MapServer/0" as const;
export const USFS_CURRENT_PLANTS_QUERY_URL = `${USFS_CURRENT_PLANTS_LAYER_URL}/query` as const;

type TargetMapping = {
  pairKey: string;
  countyFips: string;
  speciesId: string;
  scientificName: string;
  objectIds: number[];
};

type TargetedParameters = {
  stateCode: string;
  mode: "targeted-stable-positive-witness";
  layerUrl: typeof USFS_CURRENT_PLANTS_LAYER_URL;
  preflightEvaluationId: string;
  providerDeclaredRefreshDate: string;
  catalogResponseSha256: string;
  minimumRequestIntervalMs: 1000;
  maxResponseBytes: number;
  objectIdsPerRequest: number;
  targets: TargetMapping[];
  candidatePairs: string[];
};

type UsfsAttributes = {
  objectid: number;
  site_id_fs: string | null;
  accepted_plant_code: string | null;
  accepted_scientific_name: string | null;
  accepted_common_name: string | null;
  date_collected: number | null;
  date_collected_most_recent: number | null;
  current_measurement: string | null;
  plant_status: string | null;
  plant_status_set: string | null;
  fs_unit_id: string | null;
  fs_unit_name: string | null;
  feature_cn: string | null;
  last_update: number | null;
  crc_value: number | string | null;
};

type UsfsFeature = {
  attributes: UsfsAttributes;
  geometry: { rings: number[][][] };
};

type UsfsResponse = {
  features?: UsfsFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string; details?: string[] };
};

type CountyFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pairKey(value: { countyFips: string; speciesId: string }) {
  return `${value.countyFips}:${value.speciesId}`;
}

function normalizedName(value: unknown) {
  return typeof value === "string"
    ? value.trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US")
    : "";
}

function parseParameters(context: SourceAdapterContext) {
  const parameters = context.parameters as unknown as TargetedParameters;
  assert(parameters.mode === "targeted-stable-positive-witness", "USFS targeted adapter mode differs.");
  assert(parameters.stateCode === context.stateCode, "USFS targeted adapter state differs.");
  assert(parameters.layerUrl === USFS_CURRENT_PLANTS_LAYER_URL, "USFS targeted layer URL differs.");
  assert(parameters.minimumRequestIntervalMs === 1000, "USFS targeted rate limit differs.");
  assert(Number.isInteger(parameters.maxResponseBytes) && parameters.maxResponseBytes > 0, "USFS response budget is invalid.");
  assert(Number.isInteger(parameters.objectIdsPerRequest) && parameters.objectIdsPerRequest >= 1 && parameters.objectIdsPerRequest <= 100, "USFS object-id request chunk size is invalid.");
  assert(Array.isArray(parameters.targets) && parameters.targets.length > 0, "USFS targeted adapter has no targets.");
  assert(Array.isArray(parameters.candidatePairs), "USFS targeted candidate pairs are missing.");
  const requestedKeys = [...context.requestedPairs].map(pairKey).sort(compareText);
  const targetKeys = parameters.targets.map((target) => target.pairKey).sort(compareText);
  assert(stableJson(requestedKeys) === stableJson(targetKeys), "USFS target identities differ from requested pairs.");
  assert(stableJson(requestedKeys) === stableJson([...parameters.candidatePairs].sort(compareText)), "USFS parameter candidate pairs differ from requested pairs.");
  for (const target of parameters.targets) {
    assert(target.pairKey === pairKey(target), `USFS target pair key differs for ${target.pairKey}.`);
    assert(target.objectIds.length > 0 && target.objectIds.every((value) => Number.isInteger(value) && value > 0), `USFS target object identities are invalid for ${target.pairKey}.`);
  }
  return parameters;
}

function canonicalFeature(featureValue: UsfsFeature) {
  return {
    attributes: Object.fromEntries(
      Object.entries(featureValue.attributes).sort(([left], [right]) => compareText(left, right)),
    ),
    geometry: featureValue.geometry,
  };
}

function geometryCoordinates(featureValue: UsfsFeature) {
  const output: Array<[number, number]> = [];
  for (const ring of featureValue.geometry?.rings ?? []) {
    for (const coordinate of ring) {
      if (
        Array.isArray(coordinate) &&
        typeof coordinate[0] === "number" && Number.isFinite(coordinate[0]) &&
        typeof coordinate[1] === "number" && Number.isFinite(coordinate[1])
      ) {
        output.push([coordinate[0], coordinate[1]]);
      }
    }
  }
  return output;
}

function validCollectedDate(value: unknown, upperBound: number) {
  const lowerBound = Date.parse("1900-01-01T00:00:00.000Z");
  return typeof value === "number" && Number.isFinite(value) && value >= lowerBound && value <= upperBound;
}

function buildQueryUrl(objectIds: number[]) {
  const url = new URL(USFS_CURRENT_PLANTS_QUERY_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("objectIds", objectIds.join(","));
  url.searchParams.set("outFields", [
    "objectid",
    "site_id_fs",
    "accepted_plant_code",
    "accepted_scientific_name",
    "accepted_common_name",
    "date_collected",
    "date_collected_most_recent",
    "current_measurement",
    "plant_status",
    "plant_status_set",
    "fs_unit_id",
    "fs_unit_name",
    "feature_cn",
    "last_update",
    "crc_value",
  ].join(","));
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("geometryPrecision", "7");
  url.searchParams.set("orderByFields", "objectid ASC");
  return url.toString();
}

export function chunkUsfsCurrentPlantObjectIds(objectIds: number[], chunkSize: number) {
  assert(Number.isInteger(chunkSize) && chunkSize >= 1 && chunkSize <= 100, "USFS object-id request chunk size is invalid.");
  const unique = [...new Set(objectIds)].sort((left, right) => left - right);
  const chunks: number[][] = [];
  for (let index = 0; index < unique.length; index += chunkSize) {
    chunks.push(unique.slice(index, index + chunkSize));
  }
  return chunks;
}

async function fetchSnapshot(url: string, maxResponseBytes: number) {
  const retrievedAt = new Date().toISOString();
  const response = await fetch(url, {
    headers: { "user-agent": "Project-Isitusa-USFS-targeted/1.1" },
    signal: AbortSignal.timeout(60_000),
  });
  assert(response.ok, `USFS targeted request returned HTTP ${response.status}.`);
  const contents = await response.text();
  assert(Buffer.byteLength(contents) <= maxResponseBytes, `USFS targeted response exceeded ${maxResponseBytes} bytes.`);
  const parsed = JSON.parse(contents) as UsfsResponse;
  assert(!parsed.error, `USFS targeted response error: ${parsed.error?.message ?? "unknown error"}.`);
  assert(parsed.exceededTransferLimit !== true, "USFS targeted response was truncated.");
  return { response, contents, parsed, retrievedAt };
}

function loadCountyFeatures(context: SourceAdapterContext) {
  const counties = new Map(listCountyEquivalents(context.stateCode).map((county) => [county.countyFips, county]));
  const topologyPath = path.join(process.cwd(), USFS_CURRENT_PLANTS_POLYGON_TOPOLOGY_PATH);
  const topologyBytes = readFileSync(topologyPath);
  const topology = JSON.parse(topologyBytes.toString("utf8")) as { objects: { counties: unknown } };
  const collection = feature(topology as never, topology.objects.counties as never) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, Record<string, unknown>>;
  const features = new Map<string, CountyFeature>();
  for (const countyFeature of collection.features) {
    const fips = String(countyFeature.id ?? "").padStart(5, "0");
    if (counties.has(fips)) features.set(fips, countyFeature);
  }
  return { counties, features, topologySha256: sha256(topologyBytes) };
}

function rejection(input: {
  context: SourceAdapterContext;
  target: TargetMapping;
  objectId: number;
  reason: ResearchRejectionRecord["reason_code"];
  detail: string;
  createdAt: string;
}) {
  return {
    schemaVersion: 1,
    rejection_id: contentId("usfs-current-plants-rejection", {
      runId: input.context.runId,
      pairKey: input.target.pairKey,
      objectId: input.objectId,
      reason: input.reason,
      detail: input.detail,
    }),
    created_at: input.createdAt,
    actor_type: "adapter",
    actor_id: `${USFS_CURRENT_PLANTS_ADAPTER_ID}@${USFS_CURRENT_PLANTS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: USFS_CURRENT_PLANTS_SOURCE_ID,
    candidate_locator: `arcgis-objectid:${input.objectId}`,
    candidate_taxon: input.target.scientificName,
    candidate_geography: input.target.countyFips,
    normalized_target: {
      state_code: input.context.stateCode,
      species_id: input.target.speciesId,
      county_fips: input.target.countyFips,
    },
    reason_code: input.reason,
    supporting_notes: [
      input.detail,
      "A rejected or missing targeted record creates no absence or non-detection claim.",
    ],
  } satisfies ResearchRejectionRecord;
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  target: TargetMapping;
  features: UsfsFeature[];
  countyFeature: CountyFeature;
  countyName: string;
  countyLegalName: string;
  stateName: string;
  topologySha256: string;
  queryUrls: string[];
  completedAt: string;
}) {
  const coordinates = input.features.flatMap(geometryCoordinates);
  const witnessedCoordinates = coordinates.filter((coordinate) => geoContains(input.countyFeature, coordinate));
  assert(witnessedCoordinates.length > 0, `USFS accepted pair ${input.target.pairKey} lacks an inside-county vertex witness.`);
  const objectIds = input.features.map((entry) => entry.attributes.objectid).sort((left, right) => left - right);
  const sourceDates = input.features.map((entry) => entry.attributes.date_collected_most_recent as number).sort((left, right) => left - right);
  const normalizedPayloadHash = sha256(stableJson(input.features.map(canonicalFeature)));
  const coordinateHash = sha256(stableJson(coordinates));
  const eventId = contentId("usfs-current-plants-assertion", {
    runId: input.context.runId,
    pairKey: input.target.pairKey,
    objectIds,
    normalizedPayloadHash,
  });
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${USFS_CURRENT_PLANTS_ADAPTER_ID}@${USFS_CURRENT_PLANTS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: USFS_CURRENT_PLANTS_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.target.countyFips,
    species_id: input.target.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "point",
    source_record_id: `usfs-current-invasive-plants:${sha256(`${objectIds.join(",")}\n`)}`,
    source_url: input.queryUrls[0],
    source_record_date: new Date(sourceDates.at(-1)!).toISOString(),
    retrieved_at: input.completedAt,
    taxon_match: {
      method: "Exact normalized accepted scientific name to one Project Isitusa catalog taxon",
      target_scientific_name: input.target.scientificName,
      source_scientific_name: input.target.scientificName,
      source_taxon_key: input.features.map((entry) => entry.attributes.accepted_plant_code).filter(Boolean).join(",") || null,
    },
    geography_match: {
      method: USFS_CURRENT_PLANTS_POLYGON_GEOGRAPHY_METHOD,
      source_state: input.context.stateCode,
      source_county: input.countyName,
      county_fips: input.target.countyFips,
      source_coordinate_count: coordinates.length,
      source_coordinates_sha256: coordinateHash,
      topology_path: USFS_CURRENT_PLANTS_POLYGON_TOPOLOGY_PATH,
      topology_sha256: input.topologySha256,
    },
    temporal_scope: `Most recent source measurements ${new Date(sourceDates[0]!).toISOString()} through ${new Date(sourceDates.at(-1)!).toISOString()}.`,
    spatial_scope: `${witnessedCoordinates.length} retained source polygon vertices lie inside ${input.countyLegalName}, ${input.stateName}. The evidence is limited to the represented infestation polygons on Forest Service lands, not the unsampled county area.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "The source represents current invasive-plant infestation polygons on Forest Service lands and is not a complete county inventory.",
      "A polygon witness supports recorded presence only; it does not establish abundance, establishment beyond the mapped infestation, countywide distribution, absence, or non-detection.",
      "Target selection began with a bbox-center estimate, but publication eligibility requires the retained full-geometry vertex witness recorded here.",
    ],
    notes: [
      `Stable source OBJECTIDs: ${objectIds.join(", ")}.`,
      `All source coordinate SHA-256: ${coordinateHash}.`,
      `County topology SHA-256: ${input.topologySha256}.`,
      `Targeted query URL SHA-256 values: ${input.queryUrls.map((value) => sha256(value)).join(", ")}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("usfs-current-plants-review", { assertionEventId: eventId }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${USFS_CURRENT_PLANTS_ADAPTER_ID}@${USFS_CURRENT_PLANTS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: USFS_CURRENT_PLANTS_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.target.countyFips,
    species_id: input.target.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "stable-double-fetch",
      "exact-accepted-scientific-name",
      "valid-nonfuture-measurement-date",
      "unique-source-object-identity",
      "full-geometry-polygon-vertex-witness",
      "active-county-topology",
      "occurrence-only-semantics",
    ],
    notes: [
      "Both retained provider responses normalized to identical features before evidence construction.",
      "Publication is limited to recorded presence; source silence and every rejection remain non-negative.",
    ],
  };
  return { assertion, review };
}

export async function runUsfsCurrentPlantsTargeted(context: SourceAdapterContext): Promise<SourceAdapterResult> {
  assert(context.sourceId === USFS_CURRENT_PLANTS_SOURCE_ID, "USFS targeted adapter received the wrong source.");
  const parameters = parseParameters(context);
  const objectIds = [...new Set(parameters.targets.flatMap((target) => target.objectIds))].sort((left, right) => left - right);
  const chunks = chunkUsfsCurrentPlantObjectIds(objectIds, parameters.objectIdsPerRequest);
  const artifacts: SourceAdapterResult["artifacts"] = [];
  const upstreamRequests: SourceAdapterResult["upstreamRequests"] = [];
  const featureById = new Map<number, UsfsFeature>();
  const queryUrlByObjectId = new Map<number, string>();
  let duplicateRecordCount = 0;
  let completedAt = context.runStartedAt;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    const queryUrl = buildQueryUrl(chunk);
    const first = await fetchSnapshot(queryUrl, parameters.maxResponseBytes);
    await new Promise((resolve) => setTimeout(resolve, parameters.minimumRequestIntervalMs));
    const second = await fetchSnapshot(queryUrl, parameters.maxResponseBytes);
    const firstFeatures = [...(first.parsed.features ?? [])].sort((left, right) => left.attributes.objectid - right.attributes.objectid);
    const secondFeatures = [...(second.parsed.features ?? [])].sort((left, right) => left.attributes.objectid - right.attributes.objectid);
    assert(stableJson(firstFeatures.map(canonicalFeature)) === stableJson(secondFeatures.map(canonicalFeature)), `USFS targeted chunk ${index + 1} changed between the stable double fetch.`);
    completedAt = second.retrievedAt;
    const label = String(index + 1).padStart(4, "0");
    artifacts.push(
      { filename: `usfs-current-invasive-plants-${label}-before.json`, mediaType: "application/json", contents: first.contents },
      { filename: `usfs-current-invasive-plants-${label}-after.json`, mediaType: "application/json", contents: second.contents },
    );
    upstreamRequests.push(
      { url: queryUrl, status: first.response.status, retrievedAt: first.retrievedAt, recordCount: firstFeatures.length },
      { url: queryUrl, status: second.response.status, retrievedAt: second.retrievedAt, recordCount: secondFeatures.length },
    );
    for (const objectId of chunk) queryUrlByObjectId.set(objectId, queryUrl);
    for (const featureValue of secondFeatures) {
      const objectId = featureValue.attributes?.objectid;
      assert(Number.isInteger(objectId) && objectId > 0, "USFS targeted feature lacks a valid objectid.");
      if (featureById.has(objectId)) duplicateRecordCount += 1;
      else featureById.set(objectId, featureValue);
    }
    if (index + 1 < chunks.length) {
      await new Promise((resolve) => setTimeout(resolve, parameters.minimumRequestIntervalMs));
    }
  }
  const { counties, features: countyFeatures, topologySha256 } = loadCountyFeatures(context);
  const state = getStateDefinition(context.stateCode);
  assert(state, `USFS targeted state ${context.stateCode} is not registered.`);
  const runUpperBound = Date.parse(context.runStartedAt);
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const rejections: ResearchRejectionRecord[] = [];
  const outcomes: ResearchPairOutcome[] = [];

  for (const target of [...parameters.targets].sort((left, right) => compareText(left.pairKey, right.pairKey))) {
    const requested = context.requestedPairs.find((pair) => pairKey(pair) === target.pairKey);
    assert(requested && normalizedName(requested.scientificName) === normalizedName(target.scientificName), `USFS requested taxon differs for ${target.pairKey}.`);
    const county = counties.get(target.countyFips);
    const countyFeature = countyFeatures.get(target.countyFips);
    assert(county && countyFeature, `USFS target county ${target.countyFips} lacks active topology.`);
    const accepted: UsfsFeature[] = [];
    const pairRejectionIds: string[] = [];
    for (const objectId of target.objectIds) {
      const featureValue = featureById.get(objectId);
      let rejected: ResearchRejectionRecord | null = null;
      if (!featureValue) {
        rejected = rejection({ context, target, objectId, reason: "record-failed", detail: "The selected objectid was absent from both stable targeted responses.", createdAt: completedAt });
      } else if (normalizedName(featureValue.attributes.accepted_scientific_name) !== normalizedName(target.scientificName)) {
        rejected = rejection({ context, target, objectId, reason: "taxon-mismatch", detail: "The provider accepted scientific name no longer exactly matches the selected catalog taxon.", createdAt: completedAt });
      } else if (
        !validCollectedDate(featureValue.attributes.date_collected, runUpperBound) ||
        !validCollectedDate(featureValue.attributes.date_collected_most_recent, runUpperBound)
      ) {
        rejected = rejection({ context, target, objectId, reason: "record-failed", detail: "The source collected date is missing, before 1900, or after the run start.", createdAt: completedAt });
      } else {
        const coordinates = geometryCoordinates(featureValue);
        if (coordinates.length === 0 || !coordinates.some((coordinate) => geoContains(countyFeature, coordinate))) {
          rejected = rejection({ context, target, objectId, reason: "geography-ambiguous", detail: "The retained full source polygon has no coordinate vertex inside the selected active county topology.", createdAt: completedAt });
        }
      }
      if (rejected) {
        rejections.push(rejected);
        pairRejectionIds.push(rejected.rejection_id);
      } else {
        accepted.push(featureValue!);
      }
    }
    let assertion: RunEvidenceAssertionEvent | null = null;
    if (accepted.length > 0) {
      const queryUrls = [...new Set(target.objectIds
        .map((objectId) => queryUrlByObjectId.get(objectId))
        .filter((value): value is string => Boolean(value)))].sort(compareText);
      assert(queryUrls.length > 0, `USFS target ${target.pairKey} lacks query lineage.`);
      const evidence = assertionAndReview({
        context,
        target,
        features: accepted,
        countyFeature,
        countyName: county.shortName,
        countyLegalName: county.legalName,
        stateName: state.stateName,
        topologySha256,
        queryUrls,
        completedAt,
      });
      assertion = evidence.assertion;
      assertions.push(evidence.assertion);
      reviews.push(evidence.review);
    }
    const status = assertion ? "evidence-found" : "no-qualifying-evidence";
    outcomes.push({
      schemaVersion: 1,
      outcome_id: contentId("usfs-current-plants-outcome", {
        runId: context.runId,
        pairKey: target.pairKey,
        status,
        assertionEventId: assertion?.eventId ?? null,
        rejectionIds: pairRejectionIds,
      }),
      run_id: context.runId,
      source_id: USFS_CURRENT_PLANTS_SOURCE_ID,
      state_code: context.stateCode,
      county_fips: target.countyFips,
      species_id: target.speciesId,
      status,
      scope_complete: true,
      recorded_at: completedAt,
      assertion_event_ids: assertion ? [assertion.eventId] : [],
      rejection_ids: pairRejectionIds.sort(compareText),
      query_urls: [...new Set(target.objectIds
        .map((objectId) => queryUrlByObjectId.get(objectId))
        .filter((value): value is string => Boolean(value)))].sort(compareText),
      notes: assertion
        ? ["A stable targeted official source record passed exact taxon, date, identity, and full-geometry county witness gates."]
        : [
            "No selected source object passed every positive-evidence gate.",
            "This targeted outcome is not verified absence and is not survey non-detection.",
          ],
    });
  }
  assert(outcomes.length === context.requestedPairs.length, "USFS targeted outcome count differs from requested pairs.");
  return {
    completedAt,
    assertions,
    reviews,
    rejections,
    outcomes,
    artifacts,
    upstreamRequests,
    candidateRecordCount: featureById.size,
    duplicateRecordCount,
    errors: [],
    warnings: [
      "USFS current invasive-plant rows support recorded presence on represented Forest Service lands only.",
      "Targeted selection and source silence create no absence or non-detection claim.",
      `${rejections.length} selected object records failed one or more conservative publication gates.`,
    ],
  };
}

export const usfsCurrentInvasivePlantsTargetedAdapter: ResearchSourceAdapter = {
  adapterId: USFS_CURRENT_PLANTS_ADAPTER_ID,
  adapterVersion: USFS_CURRENT_PLANTS_ADAPTER_VERSION,
  sourceId: USFS_CURRENT_PLANTS_SOURCE_ID,
  run: runUsfsCurrentPlantsTargeted,
};
