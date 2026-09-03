import { createHash } from "node:crypto";

import type { ResearchSourceAdapter, SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import type {
  EvidenceReviewEvent,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import {
  countyEquivalentNameMatchesFips,
  getStateDefinition,
  listCountyEquivalents,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const BLM_AIM_SOURCE_ID = "blm-aim-terrestrial-invasive-plants" as const;
export const BLM_AIM_ADAPTER_ID = "blm-aim-terrestrial-invasive-plants-targeted" as const;
export const BLM_AIM_ADAPTER_VERSION = "1.0.0" as const;
export const BLM_AIM_LAYER_URL =
  "https://services1.arcgis.com/KbxwQRRfWyEYLgp4/arcgis/rest/services/BLM_Natl_AIM_Terrestrial_Species_Indicators_Public/FeatureServer/6" as const;
export const BLM_AIM_QUERY_URL = `${BLM_AIM_LAYER_URL}/query` as const;
export const BLM_AIM_POSITIVE_WHERE = "Invasive='Invasive' AND AH_SpeciesCover_n > 0" as const;

type TargetMapping = {
  pairKey: string;
  countyFips: string;
  speciesId: string;
  scientificName: string;
  objectId: number;
  sourceRecordCount: number;
  sourceCountyName: string;
  sourceStateCode: string;
};

type BlmParameters = {
  stateCode: string;
  mode: "targeted-stable-positive-witness";
  layerUrl: typeof BLM_AIM_LAYER_URL;
  layerLastEditMs: number;
  preflightEvaluationId: string;
  positiveWhereClause: typeof BLM_AIM_POSITIVE_WHERE;
  minimumRequestIntervalMs: 1000;
  maxResponseBytes: number;
  objectIdsPerRequest: number;
  targets: TargetMapping[];
  candidatePairs: string[];
};

type BlmAttributes = {
  OBJECTID: number;
  PrimaryKey: string | null;
  PlotID: string | null;
  State: string | null;
  Species: string | null;
  ScientificName: string | null;
  DateVisited: number | null;
  AH_SpeciesCover: number | null;
  AH_SpeciesCover_n: number | null;
  GrowthHabit: string | null;
  Duration: string | null;
  Nonnative: string | null;
  Noxious: string | null;
  Invasive: string | null;
  SG_Group: string | null;
  CommonName: string | null;
  CountyName: string | null;
  COUNTY_FIPS: string | null;
  STATE_FIPS: string | null;
  FIPS: string | null;
  DateLoadedInDb: string | null;
  DBKey: string | null;
  ViewOBJECTID: number | null;
  GlobalID: string | null;
  CurrentPLANTSCode: string | null;
};

type BlmFeature = { attributes: BlmAttributes };
type BlmResponse = {
  features?: BlmFeature[];
  exceededTransferLimit?: boolean;
  error?: { message?: string; details?: string[] };
};
type LayerMetadata = {
  name?: string;
  maxRecordCount?: number;
  editingInfo?: { lastEditDate?: number };
  advancedQueryCapabilities?: {
    supportsPagination?: boolean;
    supportsOrderBy?: boolean;
    supportsStatistics?: boolean;
  };
  error?: { message?: string; details?: string[] };
};

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
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US")
    : "";
}

function parseParameters(context: SourceAdapterContext) {
  const parameters = context.parameters as unknown as BlmParameters;
  assert(parameters.mode === "targeted-stable-positive-witness", "BLM AIM adapter mode differs.");
  assert(parameters.stateCode === context.stateCode, "BLM AIM adapter state differs.");
  assert(parameters.layerUrl === BLM_AIM_LAYER_URL, "BLM AIM layer URL differs.");
  assert(parameters.positiveWhereClause === BLM_AIM_POSITIVE_WHERE, "BLM AIM positive gate differs.");
  assert(Number.isInteger(parameters.layerLastEditMs) && parameters.layerLastEditMs > 0, "BLM AIM last-edit identity is invalid.");
  assert(parameters.minimumRequestIntervalMs === 1000, "BLM AIM rate limit differs.");
  assert(Number.isInteger(parameters.maxResponseBytes) && parameters.maxResponseBytes > 0, "BLM AIM response budget is invalid.");
  assert(Number.isInteger(parameters.objectIdsPerRequest) && parameters.objectIdsPerRequest >= 1 && parameters.objectIdsPerRequest <= 100, "BLM AIM object-id chunk size is invalid.");
  assert(Array.isArray(parameters.targets) && parameters.targets.length > 0, "BLM AIM adapter has no targets.");
  const requestedKeys = [...context.requestedPairs].map(pairKey).sort(compareText);
  const targetKeys = parameters.targets.map((target) => target.pairKey).sort(compareText);
  assert(stableJson(requestedKeys) === stableJson(targetKeys), "BLM AIM targets differ from requested pairs.");
  assert(stableJson(requestedKeys) === stableJson([...parameters.candidatePairs].sort(compareText)), "BLM AIM candidate pairs differ from requested pairs.");
  assert(new Set(parameters.targets.map((target) => target.objectId)).size === parameters.targets.length, "BLM AIM target object identities are not unique.");
  for (const target of parameters.targets) {
    assert(target.pairKey === pairKey(target), `BLM AIM target pair key differs for ${target.pairKey}.`);
    assert(Number.isInteger(target.objectId) && target.objectId > 0, `BLM AIM target object identity is invalid for ${target.pairKey}.`);
    assert(Number.isInteger(target.sourceRecordCount) && target.sourceRecordCount > 0, `BLM AIM grouped record count is invalid for ${target.pairKey}.`);
    assert(target.sourceStateCode === context.stateCode, `BLM AIM target source state differs for ${target.pairKey}.`);
  }
  return parameters;
}

export function chunkBlmAimObjectIds(objectIds: number[], chunkSize: number) {
  assert(Number.isInteger(chunkSize) && chunkSize >= 1 && chunkSize <= 100, "BLM AIM object-id chunk size is invalid.");
  const unique = [...new Set(objectIds)].sort((left, right) => left - right);
  const chunks: number[][] = [];
  for (let index = 0; index < unique.length; index += chunkSize) chunks.push(unique.slice(index, index + chunkSize));
  return chunks;
}

function buildQueryUrl(objectIds: number[]) {
  const url = new URL(BLM_AIM_QUERY_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("objectIds", objectIds.join(","));
  url.searchParams.set("outFields", [
    "OBJECTID", "PrimaryKey", "PlotID", "State", "Species", "ScientificName", "DateVisited",
    "AH_SpeciesCover", "AH_SpeciesCover_n", "GrowthHabit", "Duration", "Nonnative", "Noxious",
    "Invasive", "SG_Group", "CommonName", "CountyName", "COUNTY_FIPS", "STATE_FIPS", "FIPS",
    "DateLoadedInDb", "DBKey", "ViewOBJECTID", "GlobalID", "CurrentPLANTSCode",
  ].join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("orderByFields", "OBJECTID ASC");
  return url.toString();
}

async function fetchText(url: string, maxResponseBytes: number, label: string) {
  const retrievedAt = new Date().toISOString();
  const response = await fetch(url, {
    headers: { "user-agent": "Project-Isitusa-BLM-AIM-targeted/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  assert(response.ok, `${label} returned HTTP ${response.status}.`);
  const contents = await response.text();
  assert(Buffer.byteLength(contents) <= maxResponseBytes, `${label} exceeded ${maxResponseBytes} bytes.`);
  return { response, contents, retrievedAt };
}

function parseMetadata(contents: string, expectedLastEditMs: number) {
  const metadata = JSON.parse(contents) as LayerMetadata;
  assert(!metadata.error, `BLM AIM metadata error: ${metadata.error?.message ?? "unknown error"}.`);
  assert(metadata.name === "BLM Natl AIM Terrestrial Species Indicators Public", "BLM AIM layer identity differs.");
  assert(metadata.editingInfo?.lastEditDate === expectedLastEditMs, "BLM AIM layer last-edit identity differs from the committed plan.");
  assert(metadata.maxRecordCount === 2000, "BLM AIM layer page limit differs.");
  assert(metadata.advancedQueryCapabilities?.supportsPagination === true, "BLM AIM pagination support differs.");
  assert(metadata.advancedQueryCapabilities?.supportsOrderBy === true, "BLM AIM ordering support differs.");
  assert(metadata.advancedQueryCapabilities?.supportsStatistics === true, "BLM AIM statistics support differs.");
  return metadata;
}

function parseFeatures(contents: string) {
  const parsed = JSON.parse(contents) as BlmResponse;
  assert(!parsed.error, `BLM AIM query error: ${parsed.error?.message ?? "unknown error"}.`);
  assert(parsed.exceededTransferLimit !== true, "BLM AIM targeted response was truncated.");
  return [...(parsed.features ?? [])].sort((left, right) => left.attributes.OBJECTID - right.attributes.OBJECTID);
}

function rejection(input: {
  context: SourceAdapterContext;
  target: TargetMapping;
  reason: ResearchRejectionRecord["reason_code"];
  detail: string;
  createdAt: string;
}) {
  return {
    schemaVersion: 1,
    rejection_id: contentId("blm-aim-rejection", {
      runId: input.context.runId,
      pairKey: input.target.pairKey,
      objectId: input.target.objectId,
      reason: input.reason,
      detail: input.detail,
    }),
    created_at: input.createdAt,
    actor_type: "adapter",
    actor_id: `${BLM_AIM_ADAPTER_ID}@${BLM_AIM_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: BLM_AIM_SOURCE_ID,
    candidate_locator: `arcgis-objectid:${input.target.objectId}`,
    candidate_taxon: input.target.scientificName,
    candidate_geography: input.target.countyFips,
    normalized_target: {
      state_code: input.context.stateCode,
      species_id: input.target.speciesId,
      county_fips: input.target.countyFips,
    },
    reason_code: input.reason,
    supporting_notes: [input.detail, "A rejected or missing BLM plot record creates no absence or non-detection claim."],
  } satisfies ResearchRejectionRecord;
}

function validateFeature(input: {
  feature: BlmFeature | undefined;
  target: TargetMapping;
  stateFips: string;
  runUpperBound: number;
}) {
  const { feature, target } = input;
  if (!feature) return { reason: "record-failed" as const, detail: "The selected OBJECTID was absent from both stable targeted responses." };
  const attributes = feature.attributes;
  if (normalizedName(attributes.ScientificName) !== normalizedName(target.scientificName)) {
    return { reason: "taxon-mismatch" as const, detail: "The retained provider scientific name no longer exactly matches the selected catalog binomial." };
  }
  if (attributes.Invasive !== "Invasive" || typeof attributes.AH_SpeciesCover_n !== "number" || !(attributes.AH_SpeciesCover_n > 0)) {
    return { reason: "record-failed" as const, detail: "The retained record no longer satisfies the positive invasive-cover gate." };
  }
  if (
    attributes.State !== target.sourceStateCode ||
    attributes.STATE_FIPS !== input.stateFips ||
    attributes.COUNTY_FIPS !== target.countyFips.slice(2) ||
    attributes.FIPS !== target.countyFips ||
    attributes.CountyName !== target.sourceCountyName ||
    !countyEquivalentNameMatchesFips({
      stateCode: target.sourceStateCode,
      countyFips: target.countyFips,
      countyName: attributes.CountyName ?? "",
      sourceId: BLM_AIM_SOURCE_ID,
    })
  ) {
    return { reason: "geography-ambiguous" as const, detail: "The retained state, state FIPS, county FIPS, full FIPS, and registered county name do not all agree." };
  }
  const lowerBound = Date.parse("1900-01-01T00:00:00.000Z");
  if (typeof attributes.DateVisited !== "number" || attributes.DateVisited < lowerBound || attributes.DateVisited > input.runUpperBound) {
    return { reason: "record-failed" as const, detail: "The source visit date is missing, before 1900, or after the run start." };
  }
  if (!/^\{[0-9a-f-]{36}\}$/iu.test(attributes.GlobalID ?? "")) {
    return { reason: "record-failed" as const, detail: "The retained source record lacks a stable GlobalID." };
  }
  return null;
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  target: TargetMapping;
  feature: BlmFeature;
  queryUrl: string;
  completedAt: string;
}) {
  const attributes = input.feature.attributes;
  const normalizedPayloadHash = sha256(stableJson(input.feature));
  const eventId = contentId("blm-aim-assertion", {
    runId: input.context.runId,
    pairKey: input.target.pairKey,
    globalId: attributes.GlobalID,
    normalizedPayloadHash,
  });
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${BLM_AIM_ADAPTER_ID}@${BLM_AIM_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: BLM_AIM_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.target.countyFips,
    species_id: input.target.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "point",
    source_record_id: `blm-aim:${String(attributes.GlobalID).toLocaleLowerCase("en-US")}`,
    source_url: input.queryUrl,
    source_record_date: new Date(attributes.DateVisited!).toISOString(),
    retrieved_at: input.completedAt,
    taxon_match: {
      method: "Exact normalized BLM ScientificName to one Project Isitusa catalog binomial",
      target_scientific_name: input.target.scientificName,
      source_scientific_name: attributes.ScientificName!,
      source_taxon_key: attributes.CurrentPLANTSCode ?? attributes.Species,
    },
    geography_match: {
      method: "Exact provider State + STATE_FIPS + COUNTY_FIPS + FIPS agreement with one active county equivalent; no coordinate inference",
      source_state: attributes.State!,
      source_county: attributes.CountyName!,
      county_fips: attributes.FIPS!,
    },
    temporal_scope: `BLM AIM plot visit on ${new Date(attributes.DateVisited!).toISOString()}.`,
    spatial_scope: `Positive cover at BLM AIM plot ${attributes.PlotID ?? "unknown"} in ${attributes.CountyName}, ${attributes.State}; not a complete inventory of the county or unsampled land.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "This historical plot detection supports recorded presence only at a sampled BLM AIM location.",
      "It does not establish current abundance, countywide distribution, or establishment beyond the retained plot observation.",
      "Missing, zero-cover, unmatched, and rejected rows create no absence or non-detection claim.",
    ],
    notes: [
      `Stable ArcGIS OBJECTID ${attributes.OBJECTID}; GlobalID ${attributes.GlobalID}.`,
      `Positive gate: Invasive=${attributes.Invasive}; AH_SpeciesCover_n=${attributes.AH_SpeciesCover_n}.`,
      `The preflight group represented ${input.target.sourceRecordCount} positive source record(s); the lowest stable OBJECTID was retained as the deterministic witness.`,
      `PrimaryKey=${attributes.PrimaryKey ?? "null"}; DBKey=${attributes.DBKey ?? "null"}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("blm-aim-review", { assertionEventId: eventId }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${BLM_AIM_ADAPTER_ID}@${BLM_AIM_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: BLM_AIM_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.target.countyFips,
    species_id: input.target.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "stable-double-fetch",
      "sealed-layer-last-edit",
      "positive-invasive-cover",
      "exact-catalog-binomial",
      "exact-active-county-fips",
      "valid-nonfuture-visit-date",
      "stable-global-id",
      "occurrence-only-semantics",
    ],
    notes: [
      "The selected provider record was byte-semantically stable across both retained targeted responses while the layer last-edit identity remained sealed.",
      "Publication is limited to historical recorded presence; source silence and every rejection remain non-negative.",
    ],
  };
  return { assertion, review };
}

export async function runBlmAimTerrestrialInvasivePlants(context: SourceAdapterContext): Promise<SourceAdapterResult> {
  assert(context.sourceId === BLM_AIM_SOURCE_ID, "BLM AIM adapter received the wrong source.");
  const parameters = parseParameters(context);
  const state = getStateDefinition(context.stateCode);
  assert(state, `BLM AIM state ${context.stateCode} is not registered.`);
  const activeCountyFips = new Set(listCountyEquivalents(context.stateCode).map((county) => county.countyFips));
  const artifacts: SourceAdapterResult["artifacts"] = [];
  const upstreamRequests: SourceAdapterResult["upstreamRequests"] = [];
  const metadataUrl = `${BLM_AIM_LAYER_URL}?f=json`;
  const metadataBefore = await fetchText(metadataUrl, parameters.maxResponseBytes, "BLM AIM metadata-before request");
  parseMetadata(metadataBefore.contents, parameters.layerLastEditMs);
  artifacts.push({ filename: "blm-aim-layer-metadata-before.json", mediaType: "application/json", contents: metadataBefore.contents });
  upstreamRequests.push({ url: metadataUrl, status: metadataBefore.response.status, retrievedAt: metadataBefore.retrievedAt, recordCount: 1 });

  const featureById = new Map<number, BlmFeature>();
  const queryUrlByObjectId = new Map<number, string>();
  const chunks = chunkBlmAimObjectIds(parameters.targets.map((target) => target.objectId), parameters.objectIdsPerRequest);
  for (let index = 0; index < chunks.length; index += 1) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, parameters.minimumRequestIntervalMs));
    const queryUrl = buildQueryUrl(chunks[index]);
    const first = await fetchText(queryUrl, parameters.maxResponseBytes, `BLM AIM chunk ${index + 1} first request`);
    await new Promise((resolve) => setTimeout(resolve, parameters.minimumRequestIntervalMs));
    const second = await fetchText(queryUrl, parameters.maxResponseBytes, `BLM AIM chunk ${index + 1} second request`);
    const firstFeatures = parseFeatures(first.contents);
    const secondFeatures = parseFeatures(second.contents);
    assert(stableJson(firstFeatures) === stableJson(secondFeatures), `BLM AIM chunk ${index + 1} changed between the stable double fetch.`);
    const label = String(index + 1).padStart(4, "0");
    artifacts.push(
      { filename: `blm-aim-${label}-before.json`, mediaType: "application/json", contents: first.contents },
      { filename: `blm-aim-${label}-after.json`, mediaType: "application/json", contents: second.contents },
    );
    upstreamRequests.push(
      { url: queryUrl, status: first.response.status, retrievedAt: first.retrievedAt, recordCount: firstFeatures.length },
      { url: queryUrl, status: second.response.status, retrievedAt: second.retrievedAt, recordCount: secondFeatures.length },
    );
    for (const objectId of chunks[index]) queryUrlByObjectId.set(objectId, queryUrl);
    for (const feature of secondFeatures) {
      assert(Number.isInteger(feature.attributes?.OBJECTID) && feature.attributes.OBJECTID > 0, "BLM AIM feature lacks a valid OBJECTID.");
      assert(!featureById.has(feature.attributes.OBJECTID), `BLM AIM response repeated OBJECTID ${feature.attributes.OBJECTID}.`);
      featureById.set(feature.attributes.OBJECTID, feature);
    }
  }

  await new Promise((resolve) => setTimeout(resolve, parameters.minimumRequestIntervalMs));
  const metadataAfter = await fetchText(metadataUrl, parameters.maxResponseBytes, "BLM AIM metadata-after request");
  parseMetadata(metadataAfter.contents, parameters.layerLastEditMs);
  assert(stableJson(JSON.parse(metadataBefore.contents)) === stableJson(JSON.parse(metadataAfter.contents)), "BLM AIM layer metadata changed during acquisition.");
  artifacts.push({ filename: "blm-aim-layer-metadata-after.json", mediaType: "application/json", contents: metadataAfter.contents });
  upstreamRequests.push({ url: metadataUrl, status: metadataAfter.response.status, retrievedAt: metadataAfter.retrievedAt, recordCount: 1 });

  const completedAt = metadataAfter.retrievedAt;
  const runUpperBound = Date.parse(context.runStartedAt);
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const rejections: ResearchRejectionRecord[] = [];
  const outcomes: ResearchPairOutcome[] = [];
  const acceptedGlobalIds = new Set<string>();
  for (const target of [...parameters.targets].sort((left, right) => compareText(left.pairKey, right.pairKey))) {
    assert(activeCountyFips.has(target.countyFips), `BLM AIM target county ${target.countyFips} is not active in ${context.stateCode}.`);
    const requested = context.requestedPairs.find((pair) => pairKey(pair) === target.pairKey);
    assert(requested && normalizedName(requested.scientificName) === normalizedName(target.scientificName), `BLM AIM requested taxon differs for ${target.pairKey}.`);
    const feature = featureById.get(target.objectId);
    const invalid = validateFeature({ feature, target, stateFips: state.stateFips, runUpperBound });
    const pairRejectionIds: string[] = [];
    let assertionEventId: string | null = null;
    if (invalid) {
      const rejected = rejection({ context, target, reason: invalid.reason, detail: invalid.detail, createdAt: completedAt });
      rejections.push(rejected);
      pairRejectionIds.push(rejected.rejection_id);
    } else {
      const normalizedGlobalId = String(feature!.attributes.GlobalID).toLocaleLowerCase("en-US");
      assert(!acceptedGlobalIds.has(normalizedGlobalId), `BLM AIM accepted duplicate GlobalID ${feature!.attributes.GlobalID}.`);
      acceptedGlobalIds.add(normalizedGlobalId);
      const accepted = assertionAndReview({ context, target, feature: feature!, queryUrl: queryUrlByObjectId.get(target.objectId)!, completedAt });
      assertions.push(accepted.assertion);
      reviews.push(accepted.review);
      assertionEventId = accepted.assertion.eventId;
    }
    outcomes.push({
      schemaVersion: 1,
      outcome_id: contentId("blm-aim-outcome", { runId: context.runId, pairKey: target.pairKey }),
      run_id: context.runId,
      source_id: BLM_AIM_SOURCE_ID,
      state_code: context.stateCode,
      county_fips: target.countyFips,
      species_id: target.speciesId,
      status: assertionEventId ? "evidence-found" : "no-qualifying-evidence",
      scope_complete: true,
      recorded_at: completedAt,
      assertion_event_ids: assertionEventId ? [assertionEventId] : [],
      rejection_ids: pairRejectionIds,
      query_urls: [queryUrlByObjectId.get(target.objectId)!],
      notes: assertionEventId
        ? ["One stable positive BLM AIM plot record supports historical recorded presence for this pair."]
        : ["The selected positive witness failed validation. This is not verified absence or survey non-detection."],
    });
  }

  return {
    completedAt,
    assertions,
    reviews,
    rejections,
    outcomes,
    artifacts,
    upstreamRequests,
    candidateRecordCount: featureById.size,
    duplicateRecordCount: 0,
    errors: [],
    warnings: [
      "BLM AIM plot detections support recorded presence only on sampled BLM lands.",
      "Source silence, zero cover, and rejected records never support absence or non-detection.",
    ],
  };
}

export const blmAimTerrestrialInvasivePlantsAdapter: ResearchSourceAdapter = {
  adapterId: BLM_AIM_ADAPTER_ID,
  adapterVersion: BLM_AIM_ADAPTER_VERSION,
  sourceId: BLM_AIM_SOURCE_ID,
  run: runBlmAimTerrestrialInvasivePlants,
};
