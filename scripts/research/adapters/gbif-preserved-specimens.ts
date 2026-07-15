import { createHash } from "node:crypto";

import type {
  EvidenceReviewEvent,
  RejectionReasonCode,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import type {
  ResearchSourceAdapter,
  SourceAdapterContext,
  SourceAdapterResult,
} from "@/lib/research/source-adapter";
import {
  getStateDefinition,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

const SOURCE_ID = "gbif-preserved-specimens";
const ADAPTER_ID = "gbif-preserved-specimens";
const ADAPTER_VERSION = "1.1.0";
const GBIF_API_BASE_URL = "https://api.gbif.org/v1";
const GBIF_OCCURRENCE_BASE_URL = "https://www.gbif.org/occurrence";
const USER_AGENT = "Project-Isitusa/1.0 (county-species evidence research)";
const REQUEST_INTERVAL_MS = 334;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETAINED_ARTIFACT_BYTES = 32 * 1024 * 1024;
const MAX_SEARCH_RESULT_WINDOW = 100_000;

const CULTIVATED_OR_CAPTIVE_PATTERN =
  /\b(captive|captivity|cultivated|cultivation|cultured|garden|greenhouse|managed|nursery|planted|planting|arboretum|botanical garden|campus landscape|landscaped|zoo|aquarium)\b/i;

const GEOSPATIAL_CONTRADICTION_ISSUES = new Set([
  "CONTINENT_COUNTRY_MISMATCH",
  "COORDINATE_INVALID",
  "COORDINATE_OUT_OF_RANGE",
  "COUNTRY_COORDINATE_MISMATCH",
  "COUNTRY_MISMATCH",
  "PRESUMED_NEGATED_LATITUDE",
  "PRESUMED_NEGATED_LONGITUDE",
  "PRESUMED_SWAPPED_COORDINATE",
  "ZERO_COORDINATE",
]);

interface GbifAdapterParameters {
  stateCode: string;
  stateProvince: string;
  candidateLimit: number;
  candidatePairs: string[];
  basisOfRecord: "PRESERVED_SPECIMEN";
  occurrenceStatus: "PRESENT";
  minimumMatchConfidence: number;
  pageLimit: number;
}

interface RequestedPair {
  countyFips: string;
  countyName: string;
  countyLegalName: string;
  stateCode: string;
  stateName: string;
  sourceStateName: string;
  speciesId: string;
  scientificName: string;
}

interface GbifSpeciesMatchResponse {
  usageKey?: number;
  acceptedUsageKey?: number;
  speciesKey?: number;
  matchType?: string;
  confidence?: number;
  status?: string;
  rank?: string;
  canonicalName?: string;
  scientificName?: string;
}

interface GbifOccurrenceSearchResponse {
  offset?: number;
  limit?: number;
  endOfRecords?: boolean;
  count?: number;
  results?: GbifOccurrenceRecord[];
}

interface GbifOccurrenceRecord {
  key?: number;
  gbifID?: string;
  datasetKey?: string;
  occurrenceID?: string;
  basisOfRecord?: string;
  occurrenceStatus?: string;
  country?: string;
  countryCode?: string;
  stateProvince?: string;
  county?: string;
  verbatimStateProvince?: string;
  verbatimLocality?: string;
  locality?: string;
  scientificName?: string;
  acceptedScientificName?: string;
  species?: string;
  taxonRank?: string;
  taxonKey?: number;
  acceptedTaxonKey?: number;
  speciesKey?: number;
  taxonomicStatus?: string;
  hasGeospatialIssue?: boolean;
  issues?: string[];
  decimalLatitude?: number;
  decimalLongitude?: number;
  coordinateUncertaintyInMeters?: number;
  institutionCode?: string;
  collectionCode?: string;
  catalogNumber?: string;
  eventDate?: string;
  verbatimEventDate?: string;
  year?: number;
  month?: number;
  day?: number;
  occurrenceRemarks?: string;
  habitat?: string;
  establishmentMeans?: string;
  degreeOfEstablishment?: string;
  preparations?: string;
}

interface GbifMatch {
  speciesKey: number;
  canonicalName: string;
  confidence: number;
}

interface RequestResult<T> {
  ok: boolean;
  data: T | null;
  retrievedAt: string;
  artifactLimitReached: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown): string {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function canonicalText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function canonicalBinomial(value: string): string {
  const words = canonicalText(value)
    .replace(/[(),]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 2).join(" ");
}

function pairKey(pair: { countyFips: string; speciesId: string }): string {
  return `${pair.countyFips}:${pair.speciesId}`;
}

function requireInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} through ${maximum}.`);
  }
  return Number(value);
}

function parseParameters(context: SourceAdapterContext): GbifAdapterParameters {
  const parameters = context.parameters;
  const expectedKeys = new Set([
    "stateCode",
    "stateProvince",
    "candidateLimit",
    "candidatePairs",
    "basisOfRecord",
    "occurrenceStatus",
    "minimumMatchConfidence",
    "pageLimit",
  ]);
  const unsupportedKeys = Object.keys(parameters).filter((key) => !expectedKeys.has(key));
  if (unsupportedKeys.length > 0) {
    throw new Error(`Unsupported GBIF adapter parameters: ${unsupportedKeys.join(", ")}.`);
  }
  const stateCode = String(parameters.stateCode ?? "").toUpperCase();
  const state = getStateDefinition(stateCode);
  if (!state?.nationalV1Scope || context.stateCode.toUpperCase() !== stateCode) {
    throw new Error(`The GBIF adapter received an unknown or mismatched state: ${stateCode}.`);
  }
  if (parameters.stateProvince !== state.sourceStateNames.gbif) {
    throw new Error(
      `stateProvince must match the registered GBIF state name ${state.sourceStateNames.gbif}.`,
    );
  }
  if (parameters.basisOfRecord !== "PRESERVED_SPECIMEN") {
    throw new Error("basisOfRecord must be PRESERVED_SPECIMEN.");
  }
  if (parameters.occurrenceStatus !== "PRESENT") {
    throw new Error("occurrenceStatus must be PRESENT.");
  }
  if (!Array.isArray(parameters.candidatePairs) || parameters.candidatePairs.length === 0) {
    throw new Error("candidatePairs must contain at least one county-species pair key.");
  }
  const candidatePairs = parameters.candidatePairs.map((value) => {
    if (typeof value !== "string" || !/^[0-9]{5}:[a-z0-9-]+$/.test(value)) {
      throw new Error(`Invalid candidate pair key: ${String(value)}.`);
    }
    return value;
  });
  if (new Set(candidatePairs).size !== candidatePairs.length) {
    throw new Error("candidatePairs must not contain duplicates.");
  }
  const candidateLimit = requireInteger(parameters.candidateLimit, "candidateLimit", 1, 100);
  if (candidatePairs.length > candidateLimit) {
    throw new Error(
      `candidatePairs contains ${candidatePairs.length} entries, exceeding candidateLimit ${candidateLimit}.`,
    );
  }
  return {
    stateCode,
    stateProvince: state.sourceStateNames.gbif,
    candidateLimit,
    candidatePairs,
    basisOfRecord: "PRESERVED_SPECIMEN",
    occurrenceStatus: "PRESENT",
    minimumMatchConfidence: requireInteger(
      parameters.minimumMatchConfidence,
      "minimumMatchConfidence",
      95,
      100,
    ),
    pageLimit: requireInteger(parameters.pageLimit, "pageLimit", 1, 300),
  };
}

function selectRequestedPairs(
  context: SourceAdapterContext,
  parameters: GbifAdapterParameters,
): RequestedPair[] {
  const pairByKey = new Map<string, RequestedPair>();
  for (const pair of context.requestedPairs) {
    const key = pairKey(pair);
    if (pairByKey.has(key)) {
      throw new Error(`Duplicate requested pair in adapter context: ${key}.`);
    }
    const countyResolution = resolveCountyEquivalent({
      stateCode: parameters.stateCode,
      countyFips: pair.countyFips,
    });
    if (countyResolution.status !== "resolved") {
      throw new Error(`Requested pair ${key} has invalid geography: ${countyResolution.detail}`);
    }
    const nameResolution = resolveCountyEquivalent({
      stateCode: parameters.stateCode,
      countyName: pair.countyName,
      sourceId: SOURCE_ID,
    });
    if (
      nameResolution.status !== "resolved" ||
      nameResolution.county.countyFips !== countyResolution.county.countyFips
    ) {
      throw new Error(`Requested pair ${key} has a county name that does not match its FIPS.`);
    }
    if (canonicalBinomial(pair.scientificName).split(" ").length !== 2) {
      throw new Error(`Requested pair ${key} lacks an exact county name or scientific binomial.`);
    }
    pairByKey.set(key, {
      ...pair,
      countyName: countyResolution.county.shortName,
      countyLegalName: countyResolution.county.legalName,
      stateCode: parameters.stateCode,
      stateName: countyResolution.county.stateName,
      sourceStateName: parameters.stateProvince,
    });
  }
  return parameters.candidatePairs.map((key) => {
    const pair = pairByKey.get(key);
    if (!pair) {
      throw new Error(`candidatePairs references ${key}, which is absent from requestedPairs.`);
    }
    return pair;
  });
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createRequester(
  artifacts: SourceAdapterResult["artifacts"],
  upstreamRequests: SourceAdapterResult["upstreamRequests"],
  errors: SourceAdapterResult["errors"],
  warnings: string[],
) {
  let lastRequestStartedAt = 0;
  let retainedArtifactBytes = 0;
  let artifactLimitReported = false;

  return async function requestJson<T>(
    url: string,
    filename: string,
    recordCount: (payload: T) => number,
  ): Promise<RequestResult<T>> {
    const waitMilliseconds = Math.max(
      0,
      REQUEST_INTERVAL_MS - (Date.now() - lastRequestStartedAt),
    );
    if (waitMilliseconds > 0) {
      await sleep(waitMilliseconds);
    }
    lastRequestStartedAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        code: "gbif-request-failed",
        message: `${url}: ${message}`,
        retryable: true,
      });
      return {
        ok: false,
        data: null,
        retrievedAt: new Date().toISOString(),
        artifactLimitReached: false,
      };
    }

    const retrievedAt = new Date().toISOString();
    let contents: string;
    try {
      contents = await response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        code: "gbif-response-read-failed",
        message: `${url}: ${message}`,
        retryable: true,
      });
      upstreamRequests.push({
        url,
        status: response.status,
        retrievedAt,
        recordCount: 0,
      });
      return {
        ok: false,
        data: null,
        retrievedAt,
        artifactLimitReached: false,
      };
    } finally {
      clearTimeout(timeout);
    }

    const artifactBytes = Buffer.byteLength(contents);
    retainedArtifactBytes += artifactBytes;
    artifacts.push({ filename, mediaType: "application/json", contents });
    const artifactLimitReached = retainedArtifactBytes > MAX_RETAINED_ARTIFACT_BYTES;
    if (artifactLimitReached && !artifactLimitReported) {
      artifactLimitReported = true;
      warnings.push(
        `Raw GBIF response artifacts exceeded the ${MAX_RETAINED_ARTIFACT_BYTES}-byte adapter budget. The current response was retained and the active pair was left incomplete.`,
      );
      errors.push({
        code: "artifact-byte-limit-exceeded",
        message: `Retained GBIF response artifacts reached ${retainedArtifactBytes} bytes.`,
        retryable: false,
      });
    }

    let data: T | null = null;
    try {
      data = JSON.parse(contents) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({
        code: "gbif-invalid-json",
        message: `${url}: ${message}`,
        retryable: true,
      });
    }

    upstreamRequests.push({
      url,
      status: response.status,
      retrievedAt,
      recordCount: data === null ? 0 : recordCount(data),
    });

    if (!response.ok) {
      errors.push({
        code: `gbif-http-${response.status}`,
        message: `GBIF request returned HTTP ${response.status}: ${url}`,
        retryable: response.status === 429 || response.status >= 500,
      });
    }

    return {
      ok: response.ok && data !== null,
      data,
      retrievedAt,
      artifactLimitReached,
    };
  };
}

function speciesMatchUrl(scientificName: string): string {
  const url = new URL(`${GBIF_API_BASE_URL}/species/match`);
  url.searchParams.set("name", scientificName);
  url.searchParams.set("rank", "SPECIES");
  url.searchParams.set("strict", "true");
  return url.toString();
}

function occurrenceSearchUrl(
  speciesKey: number,
  parameters: GbifAdapterParameters,
  offset: number,
  limit: number,
): string {
  const url = new URL(`${GBIF_API_BASE_URL}/occurrence/search`);
  url.searchParams.set("country", "US");
  url.searchParams.set("stateProvince", parameters.stateProvince);
  url.searchParams.set("basisOfRecord", parameters.basisOfRecord);
  url.searchParams.set("occurrenceStatus", parameters.occurrenceStatus);
  url.searchParams.set("taxonKey", String(speciesKey));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  return url.toString();
}

function validateSpeciesMatch(
  payload: GbifSpeciesMatchResponse,
  pair: RequestedPair,
  minimumConfidence: number,
): { match: GbifMatch | null; reason: RejectionReasonCode; notes: string[] } {
  const sourceCanonicalName = payload.canonicalName ?? payload.scientificName ?? "";
  const speciesKey = payload.speciesKey ?? payload.acceptedUsageKey ?? payload.usageKey;
  const notes = [
    `GBIF match type: ${payload.matchType ?? "missing"}.`,
    `GBIF confidence: ${payload.confidence ?? "missing"}.`,
    `GBIF rank: ${payload.rank ?? "missing"}.`,
    `GBIF canonical name: ${sourceCanonicalName || "missing"}.`,
  ];

  if (payload.matchType !== "EXACT") {
    return {
      match: null,
      reason: payload.matchType === "NONE" ? "taxon-mismatch" : "taxon-ambiguous",
      notes,
    };
  }
  if ((payload.confidence ?? 0) < minimumConfidence || payload.rank !== "SPECIES") {
    return { match: null, reason: "taxon-ambiguous", notes };
  }
  if (
    !speciesKey ||
    canonicalBinomial(sourceCanonicalName) !== canonicalBinomial(pair.scientificName)
  ) {
    return { match: null, reason: "taxon-mismatch", notes };
  }
  return {
    match: {
      speciesKey,
      canonicalName: sourceCanonicalName,
      confidence: payload.confidence ?? 0,
    },
    reason: "taxon-mismatch",
    notes,
  };
}

function recordLocator(record: GbifOccurrenceRecord, fallback: string): string {
  if (record.key !== undefined) {
    return `${GBIF_OCCURRENCE_BASE_URL}/${record.key}`;
  }
  if (record.gbifID) {
    return `gbifID:${record.gbifID}`;
  }
  if (record.occurrenceID) {
    return `occurrenceID:${record.occurrenceID}`;
  }
  return fallback;
}

function candidateTaxon(record: GbifOccurrenceRecord): string | null {
  return (
    record.acceptedScientificName ??
    record.species ??
    record.scientificName ??
    null
  );
}

function candidateGeography(record: GbifOccurrenceRecord): string | null {
  const parts = [record.county, record.stateProvince, record.countryCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

function makeRejection(
  context: SourceAdapterContext,
  pair: RequestedPair,
  createdAt: string,
  candidateLocator: string,
  candidateTaxonName: string,
  geography: string | null,
  reasonCode: RejectionReasonCode,
  notes: string[],
  identityPayload: unknown,
  targetCountyFips: string | null = pair.countyFips,
): ResearchRejectionRecord {
  return {
    schemaVersion: 1,
    rejection_id: contentId("gbif-rejection", {
      runId: context.runId,
      sourceId: SOURCE_ID,
      target: targetCountyFips ? pairKey(pair) : `species:${pair.speciesId}`,
      candidateLocator,
      reasonCode,
      identityPayload,
    }),
    created_at: createdAt,
    actor_type: "adapter",
    actor_id: `${ADAPTER_ID}@${ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: SOURCE_ID,
    candidate_locator: candidateLocator,
    candidate_taxon: candidateTaxonName,
    candidate_geography: geography,
    normalized_target: {
      state_code: pair.stateCode,
      species_id: pair.speciesId,
      county_fips: targetCountyFips,
    },
    reason_code: reasonCode,
    supporting_notes: notes,
  };
}

function sourceRecordId(record: GbifOccurrenceRecord): string | null {
  if (record.key !== undefined && Number.isInteger(record.key)) {
    return String(record.key);
  }
  if (record.gbifID && /^[0-9]+$/.test(record.gbifID)) {
    return record.gbifID;
  }
  return null;
}

function recordDate(record: GbifOccurrenceRecord): string | null {
  if (record.eventDate) return record.eventDate;
  if (record.verbatimEventDate) return record.verbatimEventDate;
  if (record.year === undefined) return null;
  if (record.month === undefined) return String(record.year);
  if (record.day === undefined) {
    return `${record.year}-${String(record.month).padStart(2, "0")}`;
  }
  return `${record.year}-${String(record.month).padStart(2, "0")}-${String(record.day).padStart(2, "0")}`;
}

function occurrenceLooksCultivatedOrCaptive(record: GbifOccurrenceRecord): boolean {
  return [
    record.locality,
    record.verbatimLocality,
    record.occurrenceRemarks,
    record.habitat,
    record.establishmentMeans,
    record.degreeOfEstablishment,
    record.preparations,
  ].some((value) => value && CULTIVATED_OR_CAPTIVE_PATTERN.test(value));
}

function occurrenceRejection(
  record: GbifOccurrenceRecord,
  pair: RequestedPair,
  match: GbifMatch,
): { reason: RejectionReasonCode; notes: string[] } | null {
  if (!sourceRecordId(record)) {
    return {
      reason: "record-failed",
      notes: ["The occurrence lacks a numeric GBIF key needed for a stable direct record URL."],
    };
  }
  if (record.basisOfRecord !== "PRESERVED_SPECIMEN") {
    return {
      reason: "unsupported-claim-type",
      notes: [`Unexpected basisOfRecord: ${record.basisOfRecord ?? "missing"}.`],
    };
  }
  if (record.occurrenceStatus !== "PRESENT") {
    return {
      reason: "unsupported-claim-type",
      notes: [`Unexpected occurrenceStatus: ${record.occurrenceStatus ?? "missing"}.`],
    };
  }
  if (record.countryCode !== "US") {
    return {
      reason: "outside-scope",
      notes: [`The record countryCode is ${record.countryCode ?? "missing"}, not US.`],
    };
  }
  if (canonicalText(record.stateProvince ?? "") !== canonicalText(pair.sourceStateName)) {
    return {
      reason: "outside-scope",
      notes: [
        `The record stateProvince is ${record.stateProvince ?? "missing"}, not explicit ${pair.sourceStateName}.`,
      ],
    };
  }
  if (!record.county?.trim()) {
    return {
      reason: "geography-missing",
      notes: ["The record does not contain explicit county text."],
    };
  }
  const countyResolution = resolveCountyEquivalent({
    stateCode: pair.stateCode,
    countyName: record.county,
    sourceId: SOURCE_ID,
  });
  if (countyResolution.status !== "resolved") {
    return {
      reason:
        countyResolution.reasonCode === "missing-geography"
          ? "geography-missing"
          : "geography-ambiguous",
      notes: [countyResolution.detail],
    };
  }
  if (countyResolution.county.countyFips !== pair.countyFips) {
    return {
      reason: "outside-scope",
      notes: [
        `The record county ${record.county} resolves to ${countyResolution.county.countyFips}, not requested ${pair.countyFips}.`,
      ],
    };
  }
  const contradictionIssues = (record.issues ?? []).filter((issue) =>
    GEOSPATIAL_CONTRADICTION_ISSUES.has(issue),
  );
  const unexplainedGeospatialFlag =
    record.hasGeospatialIssue === true && (record.issues ?? []).length === 0;
  if (unexplainedGeospatialFlag || contradictionIssues.length > 0) {
    return {
      reason: "source-contradiction",
      notes: [
        `GBIF hasGeospatialIssue is ${String(record.hasGeospatialIssue ?? false)}.`,
        `Contradictory geography issues: ${contradictionIssues.join(", ") || "unspecified"}.`,
      ],
    };
  }
  if (occurrenceLooksCultivatedOrCaptive(record)) {
    return {
      reason: "cultivated-or-captive",
      notes: [
        "Locality, habitat, occurrence remarks, establishment, or preparation text indicates cultivated, captive, or managed material.",
      ],
    };
  }

  const sourceScientificName = candidateTaxon(record);
  if (!sourceScientificName) {
    return {
      reason: "taxon-ambiguous",
      notes: ["The occurrence does not contain an explicit source scientific name."],
    };
  }
  const sourceTaxonKeys = [record.speciesKey, record.acceptedTaxonKey]
    .filter((key): key is number => Number.isInteger(key));
  if (
    sourceTaxonKeys.length === 0 &&
    record.taxonRank === "SPECIES" &&
    Number.isInteger(record.taxonKey)
  ) {
    sourceTaxonKeys.push(record.taxonKey as number);
  }
  if (sourceTaxonKeys.length === 0) {
    return {
      reason: "taxon-ambiguous",
      notes: ["The occurrence lacks an accepted GBIF species-level taxon key."],
    };
  }
  if (!sourceTaxonKeys.includes(match.speciesKey)) {
    return {
      reason: "taxon-mismatch",
      notes: [
        `Occurrence taxon keys ${sourceTaxonKeys.join(", ")} do not match exact GBIF species key ${match.speciesKey}.`,
      ],
    };
  }
  if (canonicalBinomial(sourceScientificName) !== canonicalBinomial(pair.scientificName)) {
    return {
      reason: "taxon-mismatch",
      notes: [
        `Occurrence taxon ${sourceScientificName} does not exactly match target binomial ${pair.scientificName}.`,
      ],
    };
  }
  if (!record.datasetKey && !record.institutionCode) {
    return {
      reason: "record-failed",
      notes: [
        "The occurrence lacks both GBIF dataset identity and publisher institution identity.",
      ],
    };
  }
  return null;
}

function supportingPayload(
  record: GbifOccurrenceRecord,
  pair: RequestedPair,
  match: GbifMatch,
) {
  return {
    gbifKey: sourceRecordId(record),
    occurrenceID: record.occurrenceID ?? null,
    datasetKey: record.datasetKey ?? null,
    basisOfRecord: record.basisOfRecord ?? null,
    occurrenceStatus: record.occurrenceStatus ?? null,
    countryCode: record.countryCode ?? null,
    stateProvince: record.stateProvince ?? null,
    county: record.county ?? null,
    targetCountyFips: pair.countyFips,
    targetSpeciesId: pair.speciesId,
    targetScientificName: pair.scientificName,
    sourceScientificName: candidateTaxon(record),
    matchedSpeciesKey: match.speciesKey,
    sourceTaxonKeys: [record.speciesKey, record.acceptedTaxonKey, record.taxonKey]
      .filter((key): key is number => Number.isInteger(key))
      .sort((left, right) => left - right),
    eventDate: recordDate(record),
    decimalLatitude: record.decimalLatitude ?? null,
    decimalLongitude: record.decimalLongitude ?? null,
    coordinateUncertaintyInMeters: record.coordinateUncertaintyInMeters ?? null,
    issues: [...(record.issues ?? [])].sort(),
  };
}

function makeAssertionAndReview(
  context: SourceAdapterContext,
  pair: RequestedPair,
  match: GbifMatch,
  record: GbifOccurrenceRecord,
  retrievedAt: string,
): { assertion: RunEvidenceAssertionEvent; review: EvidenceReviewEvent } {
  const sourceRecordKey = sourceRecordId(record);
  if (!sourceRecordKey) {
    throw new Error("Validated GBIF occurrence unexpectedly lacks a source record key.");
  }
  const normalizedPayloadHash = sha256(stableJson(supportingPayload(record, pair, match)));
  const eventId = contentId("gbif-assertion", {
    runId: context.runId,
    sourceId: SOURCE_ID,
    sourceRecordKey,
    speciesId: pair.speciesId,
    countyFips: pair.countyFips,
    normalizedPayloadHash,
  });
  const sourceScientificName = candidateTaxon(record);
  if (!sourceScientificName) {
    throw new Error("Validated GBIF occurrence unexpectedly lacks a source scientific name.");
  }
  const sourceDate = recordDate(record);
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: retrievedAt,
    actor_type: "adapter",
    actor_id: `${ADAPTER_ID}@${ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: SOURCE_ID,
    state_code: pair.stateCode,
    county_fips: pair.countyFips,
    species_id: pair.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "preserved-specimen",
    scope: "point",
    source_record_id: sourceRecordKey,
    source_url: `${GBIF_OCCURRENCE_BASE_URL}/${sourceRecordKey}`,
    source_record_date: sourceDate,
    retrieved_at: retrievedAt,
    taxon_match: {
      method: `GBIF strict EXACT species match with confidence ${match.confidence} and exact canonical binomial`,
      target_scientific_name: pair.scientificName,
      source_scientific_name: sourceScientificName,
      source_taxon_key: String(match.speciesKey),
    },
    geography_match: {
      method: "Registered exact county-equivalent name matched to requested Census county FIPS",
      source_state: record.stateProvince ?? pair.sourceStateName,
      source_county: record.county ?? pair.countyName,
      county_fips: pair.countyFips,
    },
    temporal_scope: sourceDate
      ? `Preserved specimen event date reported by GBIF as ${sourceDate}.`
      : "Historical preserved specimen record with no source event date available.",
    spatial_scope: `Specimen locality reported within ${pair.countyLegalName}, ${pair.stateName}. This does not imply countywide abundance or current distribution.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "GBIF is an aggregator and publisher record quality can vary.",
      "This preserved specimen occurrence supports historical presence only.",
      "Missing GBIF records never support absence or non-detection.",
    ],
    notes: [
      record.datasetKey ? `GBIF dataset key: ${record.datasetKey}.` : "",
      record.occurrenceID ? `Publisher occurrence ID: ${record.occurrenceID}.` : "",
      record.institutionCode ? `Institution code: ${record.institutionCode}.` : "",
      record.collectionCode ? `Collection code: ${record.collectionCode}.` : "",
      record.catalogNumber ? `Catalog number: ${record.catalogNumber}.` : "",
    ].filter(Boolean),
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("gbif-review", {
      assertionEventId: eventId,
      reviewLevel: "machine-validated",
      decision: "accepted",
    }),
    event_type: "evidence.reviewed",
    created_at: retrievedAt,
    actor_type: "adapter",
    actor_id: `${ADAPTER_ID}@${ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: SOURCE_ID,
    state_code: pair.stateCode,
    county_fips: pair.countyFips,
    species_id: pair.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "registered-machine-validation-gate",
      "exact-taxon-match",
      "exact-county-match",
      "preserved-specimen-present",
    ],
    notes: [
      "The registered GBIF adapter publication gate permits machine-validated occurrence evidence.",
      "The record passed explicit taxon, county, status, cultivation, captivity, and geospatial contradiction checks.",
    ],
  };
  return { assertion, review };
}

function makeOutcome(
  context: SourceAdapterContext,
  pair: RequestedPair,
  recordedAt: string,
  status: ResearchPairOutcome["status"],
  scopeComplete: boolean,
  assertionEventIds: string[],
  rejectionIds: string[],
  queryUrls: string[],
  notes: string[],
): ResearchPairOutcome {
  return {
    schemaVersion: 1,
    outcome_id: contentId("gbif-outcome", {
      runId: context.runId,
      pair: pairKey(pair),
      status,
      scopeComplete,
      assertionEventIds: [...assertionEventIds].sort(),
      rejectionIds: [...rejectionIds].sort(),
    }),
    run_id: context.runId,
    source_id: SOURCE_ID,
    state_code: pair.stateCode,
    county_fips: pair.countyFips,
    species_id: pair.speciesId,
    status,
    scope_complete: scopeComplete,
    recorded_at: recordedAt,
    assertion_event_ids: [...new Set(assertionEventIds)].sort(),
    rejection_ids: [...new Set(rejectionIds)].sort(),
    query_urls: [...new Set(queryUrls)].sort(),
    notes,
  };
}

function artifactStem(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function runAdapter(context: SourceAdapterContext): Promise<SourceAdapterResult> {
  if (context.sourceId !== SOURCE_ID) {
    throw new Error(
      `Adapter ${ADAPTER_ID} cannot run source ${context.sourceId}; expected ${SOURCE_ID}.`,
    );
  }
  const parameters = parseParameters(context);
  const requestedPairs = selectRequestedPairs(context, parameters);
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const rejections: ResearchRejectionRecord[] = [];
  const outcomes: ResearchPairOutcome[] = [];
  const artifacts: SourceAdapterResult["artifacts"] = [];
  const upstreamRequests: SourceAdapterResult["upstreamRequests"] = [];
  const errors: SourceAdapterResult["errors"] = [];
  const warnings: string[] = [];
  const requestJson = createRequester(artifacts, upstreamRequests, errors, warnings);
  const seenAssertionIds = new Set<string>();
  let duplicateRecordCount = 0;
  let resourceBudgetReached = false;

  const pairsBySpecies = new Map<string, RequestedPair[]>();
  for (const pair of requestedPairs) {
    const pairs = pairsBySpecies.get(pair.speciesId) ?? [];
    const priorScientificName = pairs[0]?.scientificName;
    if (
      priorScientificName &&
      canonicalBinomial(priorScientificName) !== canonicalBinomial(pair.scientificName)
    ) {
      throw new Error(
        `Species ${pair.speciesId} has inconsistent requested scientific names: ${priorScientificName} and ${pair.scientificName}.`,
      );
    }
    pairs.push(pair);
    pairsBySpecies.set(pair.speciesId, pairs);
  }

  for (const speciesPairs of pairsBySpecies.values()) {
    const representativePair = speciesPairs[0];
    const matchUrl = speciesMatchUrl(representativePair.scientificName);
    if (resourceBudgetReached) {
      const recordedAt = new Date().toISOString();
      for (const pair of speciesPairs) {
        const rejection = makeRejection(
          context,
          pair,
          recordedAt,
          "adapter:artifact-byte-limit-exceeded",
          pair.scientificName,
          `${pair.countyLegalName}, ${pair.stateName}`,
          "record-failed",
          ["The adapter stopped before this pair after reaching its retained artifact budget."],
          { resourceBudgetReached: true },
        );
        rejections.push(rejection);
        outcomes.push(
          makeOutcome(
            context,
            pair,
            recordedAt,
            "blocked",
            false,
            [],
            [rejection.rejection_id],
            [],
            ["No source request was attempted after the adapter resource guard activated."],
          ),
        );
      }
      continue;
    }

    const matchResult = await requestJson<GbifSpeciesMatchResponse>(
      matchUrl,
      `gbif-species-match-${artifactStem(representativePair.speciesId)}.json`,
      () => 1,
    );
    resourceBudgetReached ||= matchResult.artifactLimitReached;
    if (!matchResult.ok || !matchResult.data) {
      for (const pair of speciesPairs) {
        const rejection = makeRejection(
          context,
          pair,
          matchResult.retrievedAt,
          matchUrl,
          pair.scientificName,
          `${pair.countyLegalName}, ${pair.stateName}`,
          "record-failed",
          ["The GBIF species match request did not return a usable response."],
          { matchUrl, requestFailed: true },
        );
        rejections.push(rejection);
        outcomes.push(
          makeOutcome(
            context,
            pair,
            matchResult.retrievedAt,
            "blocked",
            false,
            [],
            [rejection.rejection_id],
            [matchUrl],
            ["Occurrence acquisition was not attempted because the taxon request failed."],
          ),
        );
      }
      continue;
    }

    const matchValidation = validateSpeciesMatch(
      matchResult.data,
      representativePair,
      parameters.minimumMatchConfidence,
    );
    if (!matchValidation.match) {
      for (const pair of speciesPairs) {
        const rejection = makeRejection(
          context,
          pair,
          matchResult.retrievedAt,
          matchUrl,
          pair.scientificName,
          `${pair.countyLegalName}, ${pair.stateName}`,
          matchValidation.reason,
          matchValidation.notes,
          matchResult.data,
        );
        rejections.push(rejection);
        outcomes.push(
          makeOutcome(
            context,
            pair,
            matchResult.retrievedAt,
            "needs-followup",
            false,
            [],
            [rejection.rejection_id],
            [matchUrl],
            [
              "No occurrence query was run because the target failed the registered exact GBIF species match gate.",
            ],
          ),
        );
      }
      continue;
    }

    const speciesQueryUrls: string[] = [];
    const cachedPages: Array<{
      queryUrl: string;
      retrievedAt: string;
      records: GbifOccurrenceRecord[];
    }> = [];
    const scopeNotes: string[] = [];
    let scopeFailure: {
      locator: string;
      notes: string[];
      identityPayload: unknown;
    } | null = null;
    let offset = 0;
    let expectedCount: number | null = null;
    let returnedRecordCount = 0;
    const seenSourceRecordIds = new Set<string>();
    let scopeComplete = !resourceBudgetReached;
    let recordedAt = matchResult.retrievedAt;

    if (resourceBudgetReached) {
      scopeFailure = {
        locator: "adapter:artifact-byte-limit-exceeded",
        notes: [
          "The adapter stopped before occurrence acquisition after reaching its retained artifact budget.",
        ],
        identityPayload: { resourceBudgetReached: true },
      };
    }

    while (scopeComplete) {
      const availableWindow = MAX_SEARCH_RESULT_WINDOW - offset;
      if (availableWindow <= 0) {
        scopeComplete = false;
        warnings.push(
          `Stopped ${representativePair.speciesId} at GBIF's ${MAX_SEARCH_RESULT_WINDOW}-record search window.`,
        );
        errors.push({
          code: "gbif-search-window-limit-exceeded",
          message: `${representativePair.speciesId} reached GBIF's ${MAX_SEARCH_RESULT_WINDOW}-record search window before a terminal page.`,
          retryable: false,
        });
        scopeFailure = {
          locator: "adapter:gbif-search-window-limit-exceeded",
          notes: [
            `The statewide species screen reached GBIF's ${MAX_SEARCH_RESULT_WINDOW}-record search window before completion.`,
          ],
          identityPayload: {
            speciesId: representativePair.speciesId,
            offset,
          },
        };
        break;
      }

      const requestLimit = Math.min(parameters.pageLimit, availableWindow);
      const queryUrl = occurrenceSearchUrl(
        matchValidation.match.speciesKey,
        parameters,
        offset,
        requestLimit,
      );
      speciesQueryUrls.push(queryUrl);
      const pageResult = await requestJson<GbifOccurrenceSearchResponse>(
        queryUrl,
        `gbif-occurrences-${artifactStem(representativePair.speciesId)}-${String(offset).padStart(6, "0")}.json`,
        (payload) => (Array.isArray(payload.results) ? payload.results.length : 0),
      );
      recordedAt = pageResult.retrievedAt;
      resourceBudgetReached ||= pageResult.artifactLimitReached;

      if (!pageResult.ok || !pageResult.data) {
        scopeComplete = false;
        scopeFailure = {
          locator: queryUrl,
          notes: ["The GBIF occurrence page request did not return a usable response."],
          identityPayload: { queryUrl, requestFailed: true },
        };
        break;
      }

      const payload = pageResult.data;
      if (
        !Array.isArray(payload.results) ||
        typeof payload.count !== "number" ||
        !Number.isInteger(payload.count) ||
        typeof payload.offset !== "number" ||
        !Number.isInteger(payload.offset) ||
        typeof payload.endOfRecords !== "boolean"
      ) {
        scopeComplete = false;
        errors.push({
          code: "gbif-invalid-response-shape",
          message: `GBIF occurrence response for ${representativePair.speciesId} lacks offset, count, endOfRecords, or results.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The occurrence response shape was incomplete or invalid."],
          identityPayload: payload,
        };
        break;
      }

      cachedPages.push({
        queryUrl,
        retrievedAt: recordedAt,
        records: payload.results,
      });
      returnedRecordCount += payload.results.length;
      let paginationIdentityFailure = false;
      for (const record of payload.results) {
        const recordId = sourceRecordId(record);
        if (!recordId || seenSourceRecordIds.has(recordId)) {
          paginationIdentityFailure = true;
          continue;
        }
        seenSourceRecordIds.add(recordId);
      }
      if (paginationIdentityFailure) {
        scopeComplete = false;
        errors.push({
          code: "gbif-pagination-record-identity-failed",
          message: `${representativePair.speciesId} returned a missing or repeated stable occurrence ID while paging.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: [
            "The statewide occurrence pages contained a missing or repeated stable GBIF record ID.",
          ],
          identityPayload: {
            speciesId: representativePair.speciesId,
            offset,
            returnedRecordCount,
            uniqueSourceRecordCount: seenSourceRecordIds.size,
          },
        };
      }
      if (payload.results.length > requestLimit) {
        scopeComplete = false;
        errors.push({
          code: "gbif-page-limit-exceeded",
          message: `${representativePair.speciesId} returned ${payload.results.length} records for a ${requestLimit}-record page.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The occurrence response exceeded the requested page limit."],
          identityPayload: {
            requestedLimit: requestLimit,
            returnedRecordCount: payload.results.length,
          },
        };
      }
      if (payload.offset !== offset) {
        scopeComplete = false;
        warnings.push(
          `GBIF returned offset ${payload.offset} for requested offset ${offset} on ${representativePair.speciesId}.`,
        );
        errors.push({
          code: "gbif-pagination-offset-mismatch",
          message: `${representativePair.speciesId} returned offset ${payload.offset} for requested offset ${offset}.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The occurrence response offset did not match the requested offset."],
          identityPayload: { requestedOffset: offset, returnedOffset: payload.offset },
        };
      }
      const payloadCount = payload.count;
      if (expectedCount === null) {
        expectedCount = payloadCount;
      } else if (payloadCount !== expectedCount) {
        scopeComplete = false;
        warnings.push(
          `GBIF result count changed from ${expectedCount} to ${payloadCount} while paging ${representativePair.speciesId}.`,
        );
        errors.push({
          code: "gbif-pagination-count-drift",
          message: `${representativePair.speciesId} result count changed from ${expectedCount} to ${payloadCount}.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The declared occurrence result count changed during pagination."],
          identityPayload: { expectedCount, returnedCount: payloadCount },
        };
      }
      if (payloadCount > MAX_SEARCH_RESULT_WINDOW) {
        scopeComplete = false;
        errors.push({
          code: "gbif-search-window-limit-exceeded",
          message: `${representativePair.speciesId} declares ${payloadCount} records, beyond GBIF's ${MAX_SEARCH_RESULT_WINDOW}-record search window.`,
          retryable: false,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: [
            `The declared result count exceeds GBIF's ${MAX_SEARCH_RESULT_WINDOW}-record search window.`,
          ],
          identityPayload: { declaredCount: payloadCount },
        };
      }
      if (pageResult.artifactLimitReached) {
        scopeComplete = false;
        scopeNotes.push(
          "The current raw response page was retained, but later pages were not requested after the artifact budget was reached.",
        );
        scopeFailure = {
          locator: "adapter:artifact-byte-limit-exceeded",
          notes: [
            "The statewide species screen stopped after reaching the retained artifact budget.",
          ],
          identityPayload: {
            speciesId: representativePair.speciesId,
            offset,
          },
        };
        break;
      }
      if (payload.endOfRecords) {
        if (
          returnedRecordCount !== payloadCount ||
          seenSourceRecordIds.size !== payloadCount
        ) {
          scopeComplete = false;
          errors.push({
            code: "gbif-terminal-count-mismatch",
            message: `${representativePair.speciesId} terminated after ${returnedRecordCount} rows and ${seenSourceRecordIds.size} unique IDs, but GBIF declared ${payloadCount}.`,
            retryable: true,
          });
          scopeFailure = {
            locator: queryUrl,
            notes: [
              "The terminal occurrence page did not reconcile to the declared result count.",
            ],
            identityPayload: {
              declaredCount: payloadCount,
              returnedRecordCount,
              uniqueSourceRecordCount: seenSourceRecordIds.size,
            },
          };
        }
        break;
      }
      if (payload.results.length === 0) {
        scopeComplete = false;
        warnings.push(
          `GBIF returned an empty nonterminal page for ${representativePair.speciesId} at offset ${offset}.`,
        );
        errors.push({
          code: "gbif-empty-nonterminal-page",
          message: `${representativePair.speciesId} returned an empty nonterminal page at offset ${offset}.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The occurrence search returned an empty nonterminal page."],
          identityPayload: { offset, declaredCount: payloadCount },
        };
        break;
      }
      const nextOffset = offset + payload.results.length;
      if (nextOffset <= offset) {
        scopeComplete = false;
        warnings.push(`GBIF pagination did not advance for ${representativePair.speciesId}.`);
        errors.push({
          code: "gbif-pagination-did-not-advance",
          message: `${representativePair.speciesId} pagination did not advance from offset ${offset}.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The occurrence search pagination did not advance."],
          identityPayload: { offset, resultCount: payload.results.length },
        };
        break;
      }
      offset = nextOffset;
    }

    const sharedRejectionIds: string[] = [];
    const seenSharedRejectionIds = new Set<string>();
    for (const page of cachedPages) {
      for (const [recordIndex, record] of page.records.entries()) {
        const sharedCountyResolution = resolveCountyEquivalent({
          stateCode: representativePair.stateCode,
          countyName: record.county,
          sourceId: SOURCE_ID,
        });
        if (sharedCountyResolution.status === "resolved") continue;
        const fallbackLocator = `${page.queryUrl}#result-${recordIndex}`;
        const rejectionResult = occurrenceRejection(
          record,
          representativePair,
          matchValidation.match,
        );
        if (!rejectionResult) {
          throw new Error(
            `Unresolved-county GBIF record ${recordLocator(record, fallbackLocator)} unexpectedly passed validation.`,
          );
        }
        const rejection = makeRejection(
          context,
          representativePair,
          page.retrievedAt,
          recordLocator(record, fallbackLocator),
          candidateTaxon(record) ?? "missing",
          candidateGeography(record),
          rejectionResult.reason,
          rejectionResult.notes,
          supportingPayload(record, representativePair, matchValidation.match),
          null,
        );
        if (seenSharedRejectionIds.has(rejection.rejection_id)) continue;
        seenSharedRejectionIds.add(rejection.rejection_id);
        rejections.push(rejection);
        sharedRejectionIds.push(rejection.rejection_id);
      }
    }

    for (const pair of speciesPairs) {
      const pairAssertionIds: string[] = [];
      const pairRejectionIds: string[] = [...sharedRejectionIds];
      const seenPairRejectionIds = new Set(pairRejectionIds);
      if (scopeFailure) {
        const rejection = makeRejection(
          context,
          pair,
          recordedAt,
          scopeFailure.locator,
          pair.scientificName,
          `${pair.countyLegalName}, ${pair.stateName}`,
          "record-failed",
          scopeFailure.notes,
          scopeFailure.identityPayload,
        );
        rejections.push(rejection);
        pairRejectionIds.push(rejection.rejection_id);
        seenPairRejectionIds.add(rejection.rejection_id);
      }

      for (const page of cachedPages) {
        for (const [recordIndex, record] of page.records.entries()) {
          if (!record.county?.trim()) continue;
          const recordCountyResolution = resolveCountyEquivalent({
            stateCode: pair.stateCode,
            countyName: record.county,
            sourceId: SOURCE_ID,
          });
          if (
            recordCountyResolution.status !== "resolved" ||
            recordCountyResolution.county.countyFips !== pair.countyFips
          ) {
            continue;
          }
          const fallbackLocator = `${page.queryUrl}#result-${recordIndex}`;
          const rejectionResult = occurrenceRejection(
            record,
            pair,
            matchValidation.match,
          );
          if (rejectionResult) {
            const rejection = makeRejection(
              context,
              pair,
              page.retrievedAt,
              recordLocator(record, fallbackLocator),
              candidateTaxon(record) ?? "missing",
              candidateGeography(record),
              rejectionResult.reason,
              rejectionResult.notes,
              supportingPayload(record, pair, matchValidation.match),
            );
            if (!seenPairRejectionIds.has(rejection.rejection_id)) {
              seenPairRejectionIds.add(rejection.rejection_id);
              rejections.push(rejection);
              pairRejectionIds.push(rejection.rejection_id);
            }
            continue;
          }

          const normalized = makeAssertionAndReview(
            context,
            pair,
            matchValidation.match,
            record,
            page.retrievedAt,
          );
          if (seenAssertionIds.has(normalized.assertion.eventId)) {
            duplicateRecordCount += 1;
            const rejection = makeRejection(
              context,
              pair,
              page.retrievedAt,
              normalized.assertion.source_url,
              candidateTaxon(record) ?? "missing",
              candidateGeography(record),
              "duplicate",
              [
                `The content-equivalent assertion ${normalized.assertion.eventId} was already emitted in this run.`,
              ],
              supportingPayload(record, pair, matchValidation.match),
            );
            if (!seenPairRejectionIds.has(rejection.rejection_id)) {
              seenPairRejectionIds.add(rejection.rejection_id);
              rejections.push(rejection);
              pairRejectionIds.push(rejection.rejection_id);
            }
            continue;
          }
          seenAssertionIds.add(normalized.assertion.eventId);
          assertions.push(normalized.assertion);
          reviews.push(normalized.review);
          pairAssertionIds.push(normalized.assertion.eventId);
        }
      }

      if (!scopeComplete) {
        outcomes.push(
          makeOutcome(
            context,
            pair,
            recordedAt,
            "needs-followup",
            false,
            pairAssertionIds,
            pairRejectionIds,
            speciesQueryUrls,
            [
              ...scopeNotes,
              "The declared source scope was not completed. No absence or non-detection is inferred.",
            ],
          ),
        );
      } else if (pairAssertionIds.length > 0) {
        outcomes.push(
          makeOutcome(
            context,
            pair,
            recordedAt,
            "evidence-found",
            true,
            pairAssertionIds,
            pairRejectionIds,
            speciesQueryUrls,
            [
              `Completed the registered GBIF preserved specimen screen and emitted ${pairAssertionIds.length} publishable assertion event(s).`,
            ],
          ),
        );
      } else {
        outcomes.push(
          makeOutcome(
            context,
            pair,
            recordedAt,
            "no-qualifying-evidence",
            true,
            [],
            pairRejectionIds,
            speciesQueryUrls,
            [
              "Completed the declared GBIF preserved specimen query scope without publishable evidence.",
              "This is a research outcome only and does not support absence or non-detection.",
            ],
          ),
        );
      }
    }
  }

  return {
    completedAt: new Date().toISOString(),
    assertions: assertions.sort((left, right) => left.eventId.localeCompare(right.eventId)),
    reviews: reviews.sort((left, right) => left.eventId.localeCompare(right.eventId)),
    rejections: rejections.sort((left, right) =>
      left.rejection_id.localeCompare(right.rejection_id),
    ),
    outcomes: outcomes.sort((left, right) => left.outcome_id.localeCompare(right.outcome_id)),
    artifacts: artifacts.sort((left, right) => left.filename.localeCompare(right.filename)),
    upstreamRequests,
    candidateRecordCount: upstreamRequests
      .filter((request) => request.url.includes("/occurrence/search"))
      .reduce((total, request) => total + request.recordCount, 0),
    duplicateRecordCount,
    errors,
    warnings: [...new Set(warnings)],
  };
}

export const adapter: ResearchSourceAdapter = {
  adapterId: ADAPTER_ID,
  adapterVersion: ADAPTER_VERSION,
  sourceId: SOURCE_ID,
  run: runAdapter,
};

export const gbifPreservedSpecimensAdapter = adapter;
export default adapter;
