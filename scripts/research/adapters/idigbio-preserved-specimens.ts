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
import { stableJson } from "@/lib/research/run-files";

const SOURCE_ID = "idigbio-preserved-specimens";
const ADAPTER_ID = "idigbio-preserved-specimens";
const ADAPTER_VERSION = "1.0.0";
const API_BASE_URL = "https://search.idigbio.org/v2/search/records/";
const PORTAL_RECORD_BASE_URL = "https://portal.idigbio.org/portal/records";
const USER_AGENT = "Project-Isitusa/1.0 (county-species evidence research)";
const REQUEST_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETAINED_ARTIFACT_BYTES = 32 * 1024 * 1024;

const CULTIVATED_OR_CAPTIVE_PATTERN =
  /\b(captive|captivity|cultivated|cultivation|cultured|garden|greenhouse|managed|nursery|planted|planting|arboretum|botanical garden|campus landscape|landscaped|zoo|aquarium)\b/i;
const TAXON_FAILURE_PATTERN = /taxon.*(?:match|name).*(?:fail|problem|error)/i;

interface IdigbioAdapterParameters {
  stateCode: "AL";
  candidateLimit: number;
  candidatePairs: string[];
  basisOfRecord: "preservedspecimen";
  country: "united states";
  stateProvince: "alabama";
  pageLimit: number;
  maxPagesPerSpecies: number;
  sortField: "uuid";
  sortOrder: "asc";
}

interface RequestedPair {
  countyFips: string;
  countyName: string;
  speciesId: string;
  scientificName: string;
}

interface IdigbioAttribution {
  uuid?: string;
  itemCount?: number;
  name?: string;
  description?: string;
  url?: string;
  emllink?: string;
  archivelink?: string;
  data_rights?: string;
  publisher?: string;
  totalCount?: number;
}

interface IdigbioIndexTerms {
  uuid?: string;
  scientificname?: string;
  canonicalname?: string;
  taxonid?: string;
  taxonrank?: string;
  taxonomicstatus?: string;
  basisofrecord?: string;
  country?: string;
  countrycode?: string;
  stateprovince?: string;
  county?: string;
  geopoint?: { lat?: number; lon?: number };
  locality?: string;
  datecollected?: string;
  eventdate?: string;
  institutioncode?: string;
  collectioncode?: string;
  catalognumber?: string;
  recordset?: string;
  occurrenceid?: string;
  occurrencestatus?: string;
  flags?: string[];
}

interface IdigbioRecord {
  uuid?: string;
  type?: string;
  data?: Record<string, unknown>;
  indexTerms?: IdigbioIndexTerms;
}

interface IdigbioSearchResponse {
  itemCount?: number;
  lastModified?: string;
  items?: IdigbioRecord[];
  attribution?: IdigbioAttribution[];
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

function textValue(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const strings = value.filter(
      (entry): entry is string => typeof entry === "string" && Boolean(entry.trim()),
    );
    return strings.length === 1 ? strings[0].trim() : null;
  }
  return null;
}

function rawText(record: IdigbioRecord, key: string): string | null {
  return textValue(record.data?.[key]);
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

function normalizeCountyName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[.'`()\-]/g, " ")
    .replace(/\b(county|parish|borough|census area|municipality|city|co)\b/g, " ")
    .replace(/\bsaint\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

function pairKey(pair: RequestedPair): string {
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

function parseParameters(context: SourceAdapterContext): IdigbioAdapterParameters {
  const parameters = context.parameters;
  const expectedKeys = new Set([
    "stateCode",
    "candidateLimit",
    "candidatePairs",
    "basisOfRecord",
    "country",
    "stateProvince",
    "pageLimit",
    "maxPagesPerSpecies",
    "sortField",
    "sortOrder",
  ]);
  const unsupportedKeys = Object.keys(parameters).filter((key) => !expectedKeys.has(key));
  if (unsupportedKeys.length > 0) {
    throw new Error(`Unsupported iDigBio adapter parameters: ${unsupportedKeys.join(", ")}.`);
  }
  if (parameters.stateCode !== "AL" || context.stateCode !== "AL") {
    throw new Error("The iDigBio preserved specimen adapter currently supports Alabama only.");
  }
  if (
    parameters.basisOfRecord !== "preservedspecimen" ||
    parameters.country !== "united states" ||
    parameters.stateProvince !== "alabama" ||
    parameters.sortField !== "uuid" ||
    parameters.sortOrder !== "asc"
  ) {
    throw new Error("The iDigBio source scope or stable sort parameters are invalid.");
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
    stateCode: "AL",
    candidateLimit,
    candidatePairs,
    basisOfRecord: "preservedspecimen",
    country: "united states",
    stateProvince: "alabama",
    pageLimit: requireInteger(parameters.pageLimit, "pageLimit", 1, 300),
    maxPagesPerSpecies: requireInteger(
      parameters.maxPagesPerSpecies,
      "maxPagesPerSpecies",
      1,
      1000,
    ),
    sortField: "uuid",
    sortOrder: "asc",
  };
}

function selectRequestedPairs(
  context: SourceAdapterContext,
  parameters: IdigbioAdapterParameters,
): RequestedPair[] {
  const pairByKey = new Map<string, RequestedPair>();
  for (const pair of context.requestedPairs) {
    const key = pairKey(pair);
    if (pairByKey.has(key)) {
      throw new Error(`Duplicate requested pair in adapter context: ${key}.`);
    }
    if (!/^01[0-9]{3}$/.test(pair.countyFips)) {
      throw new Error(`Requested pair ${key} does not use an Alabama county FIPS.`);
    }
    if (!pair.countyName.trim() || canonicalBinomial(pair.scientificName).split(" ").length !== 2) {
      throw new Error(`Requested pair ${key} lacks an exact county name or scientific binomial.`);
    }
    pairByKey.set(key, pair);
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
    if (waitMilliseconds > 0) await sleep(waitMilliseconds);
    lastRequestStartedAt = Date.now();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeout);
      errors.push({
        code: "idigbio-request-failed",
        message: `${url}: ${error instanceof Error ? error.message : String(error)}`,
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
      errors.push({
        code: "idigbio-response-read-failed",
        message: `${url}: ${error instanceof Error ? error.message : String(error)}`,
        retryable: true,
      });
      upstreamRequests.push({ url, status: response.status, retrievedAt, recordCount: 0 });
      return { ok: false, data: null, retrievedAt, artifactLimitReached: false };
    } finally {
      clearTimeout(timeout);
    }

    retainedArtifactBytes += Buffer.byteLength(contents);
    artifacts.push({ filename, mediaType: "application/json", contents });
    const artifactLimitReached = retainedArtifactBytes > MAX_RETAINED_ARTIFACT_BYTES;
    if (artifactLimitReached && !artifactLimitReported) {
      artifactLimitReported = true;
      warnings.push(
        `Raw iDigBio response artifacts exceeded the ${MAX_RETAINED_ARTIFACT_BYTES}-byte adapter budget. The current response was retained and the active species screen was left incomplete.`,
      );
      errors.push({
        code: "artifact-byte-limit-exceeded",
        message: `Retained iDigBio response artifacts reached ${retainedArtifactBytes} bytes.`,
        retryable: false,
      });
    }

    let data: T | null = null;
    try {
      data = JSON.parse(contents) as T;
    } catch (error) {
      errors.push({
        code: "idigbio-invalid-json",
        message: `${url}: ${error instanceof Error ? error.message : String(error)}`,
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
        code: `idigbio-http-${response.status}`,
        message: `iDigBio request returned HTTP ${response.status}: ${url}`,
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

function searchUrl(
  scientificName: string,
  parameters: IdigbioAdapterParameters,
  offset: number,
): string {
  const url = new URL(API_BASE_URL);
  url.searchParams.set(
    "rq",
    JSON.stringify({
      basisofrecord: parameters.basisOfRecord,
      country: parameters.country,
      scientificname: canonicalBinomial(scientificName),
      stateprovince: parameters.stateProvince,
    }),
  );
  url.searchParams.set(
    "sort",
    JSON.stringify([{ [parameters.sortField]: parameters.sortOrder }]),
  );
  url.searchParams.set(
    "fields",
    JSON.stringify([
      "uuid",
      "scientificname",
      "canonicalname",
      "taxonid",
      "taxonrank",
      "taxonomicstatus",
      "basisofrecord",
      "country",
      "countrycode",
      "stateprovince",
      "county",
      "geopoint",
      "locality",
      "datecollected",
      "eventdate",
      "institutioncode",
      "collectioncode",
      "catalognumber",
      "recordset",
      "occurrenceid",
      "flags",
      "data.dwc:scientificName",
      "data.dwc:basisOfRecord",
      "data.dwc:country",
      "data.dwc:stateProvince",
      "data.dwc:county",
      "data.dwc:eventDate",
      "data.dwc:verbatimEventDate",
      "data.dwc:locality",
      "data.dwc:verbatimLocality",
      "data.dwc:habitat",
      "data.dwc:occurrenceRemarks",
      "data.dwc:establishmentMeans",
      "data.dwc:degreeOfEstablishment",
      "data.dwc:preparations",
      "data.dwc:identificationQualifier",
      "data.dwc:occurrenceStatus",
      "data.dcterms:license",
      "data.dcterms:rightsHolder",
    ]),
  );
  url.searchParams.set("limit", String(parameters.pageLimit));
  url.searchParams.set("offset", String(offset));
  return url.toString();
}

function recordUuid(record: IdigbioRecord): string | null {
  const value = record.uuid ?? record.indexTerms?.uuid;
  return value && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value) ? value : null;
}

function recordLocator(record: IdigbioRecord, fallback: string): string {
  const uuid = recordUuid(record);
  return uuid ? `${PORTAL_RECORD_BASE_URL}/${uuid}` : fallback;
}

function recordDate(record: IdigbioRecord): string | null {
  return (
    record.indexTerms?.eventdate ??
    record.indexTerms?.datecollected ??
    rawText(record, "dwc:eventDate") ??
    rawText(record, "dwc:verbatimEventDate")
  );
}

function candidateTaxon(record: IdigbioRecord): string | null {
  return (
    rawText(record, "dwc:scientificName") ??
    record.indexTerms?.canonicalname ??
    record.indexTerms?.scientificname ??
    null
  );
}

function candidateGeography(record: IdigbioRecord): string | null {
  const parts = [
    record.indexTerms?.county ?? rawText(record, "dwc:county"),
    record.indexTerms?.stateprovince ?? rawText(record, "dwc:stateProvince"),
    record.indexTerms?.country ?? rawText(record, "dwc:country"),
  ].filter(Boolean);
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
    rejection_id: contentId("idigbio-rejection", {
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
      state_code: "AL",
      species_id: pair.speciesId,
      county_fips: targetCountyFips,
    },
    reason_code: reasonCode,
    supporting_notes: notes,
  };
}

function occurrenceLooksCultivatedOrCaptive(record: IdigbioRecord): boolean {
  return [
    record.indexTerms?.locality,
    rawText(record, "dwc:locality"),
    rawText(record, "dwc:verbatimLocality"),
    rawText(record, "dwc:habitat"),
    rawText(record, "dwc:occurrenceRemarks"),
    rawText(record, "dwc:establishmentMeans"),
    rawText(record, "dwc:degreeOfEstablishment"),
    rawText(record, "dwc:preparations"),
  ].some((value) => value && CULTIVATED_OR_CAPTIVE_PATTERN.test(value));
}

function occurrenceRejection(
  record: IdigbioRecord,
  pair: RequestedPair,
): { reason: RejectionReasonCode; notes: string[] } | null {
  const terms = record.indexTerms;
  const uuid = recordUuid(record);
  if (!uuid) {
    return {
      reason: "record-failed",
      notes: ["The record lacks a stable iDigBio UUID needed for a direct record URL."],
    };
  }
  if (!terms) {
    return {
      reason: "record-failed",
      notes: ["The record lacks normalized iDigBio index terms."],
    };
  }
  if (canonicalText(terms.basisofrecord ?? "") !== "preservedspecimen") {
    return {
      reason: "unsupported-claim-type",
      notes: [`Unexpected indexed basisofrecord: ${terms.basisofrecord ?? "missing"}.`],
    };
  }
  const rawBasis = rawText(record, "dwc:basisOfRecord");
  if (rawBasis && canonicalText(rawBasis) !== "preservedspecimen") {
    return {
      reason: "source-contradiction",
      notes: [`Provider basisOfRecord ${rawBasis} contradicts the preserved specimen index term.`],
    };
  }
  const occurrenceStatus =
    terms.occurrencestatus ?? rawText(record, "dwc:occurrenceStatus");
  if (
    occurrenceStatus &&
    !new Set(["present", "presence"]).has(canonicalText(occurrenceStatus))
  ) {
    return {
      reason: "unsupported-claim-type",
      notes: [`Unexpected occurrence status: ${occurrenceStatus}.`],
    };
  }
  if (canonicalText(terms.country ?? "") !== "united states") {
    return {
      reason: "outside-scope",
      notes: [`The indexed country is ${terms.country ?? "missing"}, not United States.`],
    };
  }
  if (canonicalText(terms.stateprovince ?? "") !== "alabama") {
    return {
      reason: "outside-scope",
      notes: [`The indexed stateprovince is ${terms.stateprovince ?? "missing"}, not Alabama.`],
    };
  }
  const rawCountry = rawText(record, "dwc:country");
  if (rawCountry && canonicalText(rawCountry) !== "united states") {
    return {
      reason: "source-contradiction",
      notes: [`Provider country ${rawCountry} contradicts the United States index term.`],
    };
  }
  const rawState = rawText(record, "dwc:stateProvince");
  if (rawState && canonicalText(rawState) !== "alabama") {
    return {
      reason: "source-contradiction",
      notes: [`Provider stateProvince ${rawState} contradicts the Alabama index term.`],
    };
  }
  if (!terms.county?.trim()) {
    return {
      reason: "geography-missing",
      notes: [
        "The record does not contain explicit normalized county text. Coordinates were retained but not used to infer a county.",
      ],
    };
  }
  if (normalizeCountyName(terms.county) !== normalizeCountyName(pair.countyName)) {
    return {
      reason: "outside-scope",
      notes: [
        `The indexed county ${terms.county} does not exactly resolve to requested ${pair.countyName} County.`,
      ],
    };
  }
  const rawCounty = rawText(record, "dwc:county");
  if (
    rawCounty &&
    normalizeCountyName(rawCounty) !== normalizeCountyName(terms.county)
  ) {
    return {
      reason: "source-contradiction",
      notes: [
        `Provider county ${rawCounty} contradicts normalized iDigBio county ${terms.county}.`,
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

  const providerScientificName = rawText(record, "dwc:scientificName");
  if (!providerScientificName) {
    return {
      reason: "taxon-ambiguous",
      notes: ["The retained provider record lacks an explicit Darwin Core scientific name."],
    };
  }
  const targetBinomial = canonicalBinomial(pair.scientificName);
  const indexedScientificName = canonicalBinomial(terms.scientificname ?? "");
  const canonicalName = canonicalBinomial(terms.canonicalname ?? "");
  const providerBinomial = canonicalBinomial(providerScientificName);
  if (!indexedScientificName || !canonicalName) {
    return {
      reason: "taxon-ambiguous",
      notes: [
        "The record lacks both normalized scientificname and canonicalname terms required by the publication gate.",
      ],
    };
  }
  if (
    indexedScientificName !== targetBinomial ||
    canonicalName !== targetBinomial ||
    providerBinomial !== targetBinomial
  ) {
    return {
      reason: "taxon-mismatch",
      notes: [
        `Target binomial: ${pair.scientificName}.`,
        `Indexed scientificname: ${terms.scientificname ?? "missing"}.`,
        `Indexed canonicalname: ${terms.canonicalname ?? "missing"}.`,
        `Provider scientificName: ${providerScientificName}.`,
      ],
    };
  }
  if (terms.taxonrank && canonicalText(terms.taxonrank) !== "species") {
    return {
      reason: "taxon-ambiguous",
      notes: [`The normalized taxon rank is ${terms.taxonrank}, not species.`],
    };
  }
  if (
    terms.taxonomicstatus &&
    canonicalText(terms.taxonomicstatus) !== "accepted"
  ) {
    return {
      reason: "taxon-ambiguous",
      notes: [`The normalized taxonomic status is ${terms.taxonomicstatus}, not accepted.`],
    };
  }
  const identificationQualifier = rawText(record, "dwc:identificationQualifier");
  if (identificationQualifier) {
    return {
      reason: "taxon-ambiguous",
      notes: [`Provider identificationQualifier is ${identificationQualifier}.`],
    };
  }
  const taxonFailureFlags = (terms.flags ?? []).filter((flag) =>
    TAXON_FAILURE_PATTERN.test(flag),
  );
  if (taxonFailureFlags.length > 0) {
    return {
      reason: "taxon-ambiguous",
      notes: [`iDigBio taxon flags: ${taxonFailureFlags.join(", ")}.`],
    };
  }
  if (!terms.recordset?.trim()) {
    return {
      reason: "record-failed",
      notes: ["The record lacks a stable iDigBio recordset identifier."],
    };
  }
  return null;
}

function supportingPayload(
  record: IdigbioRecord,
  pair: RequestedPair,
  attribution: IdigbioAttribution | null,
) {
  return {
    uuid: recordUuid(record),
    type: record.type ?? null,
    targetCountyFips: pair.countyFips,
    targetSpeciesId: pair.speciesId,
    targetScientificName: pair.scientificName,
    indexedScientificName: record.indexTerms?.scientificname ?? null,
    canonicalName: record.indexTerms?.canonicalname ?? null,
    providerScientificName: rawText(record, "dwc:scientificName"),
    taxonId: record.indexTerms?.taxonid ?? null,
    taxonRank: record.indexTerms?.taxonrank ?? null,
    taxonomicStatus: record.indexTerms?.taxonomicstatus ?? null,
    indexedBasisOfRecord: record.indexTerms?.basisofrecord ?? null,
    providerBasisOfRecord: rawText(record, "dwc:basisOfRecord"),
    occurrenceStatus:
      record.indexTerms?.occurrencestatus ?? rawText(record, "dwc:occurrenceStatus"),
    indexedCountry: record.indexTerms?.country ?? null,
    providerCountry: rawText(record, "dwc:country"),
    indexedState: record.indexTerms?.stateprovince ?? null,
    providerState: rawText(record, "dwc:stateProvince"),
    indexedCounty: record.indexTerms?.county ?? null,
    providerCounty: rawText(record, "dwc:county"),
    geopoint: record.indexTerms?.geopoint ?? null,
    eventDate: recordDate(record),
    institutionCode: record.indexTerms?.institutioncode ?? null,
    collectionCode: record.indexTerms?.collectioncode ?? null,
    catalogNumber: record.indexTerms?.catalognumber ?? null,
    occurrenceId: record.indexTerms?.occurrenceid ?? null,
    recordset: record.indexTerms?.recordset ?? null,
    recordsetName: attribution?.name ?? null,
    recordsetUrl: attribution?.url ?? null,
    publisher: attribution?.publisher ?? null,
    license: rawText(record, "dcterms:license"),
    rightsHolder: rawText(record, "dcterms:rightsHolder"),
    flags: [...(record.indexTerms?.flags ?? [])].sort(),
  };
}

function makeAssertionAndReview(
  context: SourceAdapterContext,
  pair: RequestedPair,
  record: IdigbioRecord,
  attribution: IdigbioAttribution | null,
  retrievedAt: string,
): { assertion: RunEvidenceAssertionEvent; review: EvidenceReviewEvent } {
  const uuid = recordUuid(record);
  const providerScientificName = rawText(record, "dwc:scientificName");
  const sourceCounty = record.indexTerms?.county;
  if (!uuid || !providerScientificName || !sourceCounty) {
    throw new Error("Validated iDigBio record unexpectedly lacks UUID, taxon, or county identity.");
  }
  const normalizedPayloadHash = sha256(
    stableJson(supportingPayload(record, pair, attribution)),
  );
  const eventId = contentId("idigbio-assertion", {
    runId: context.runId,
    sourceId: SOURCE_ID,
    uuid,
    speciesId: pair.speciesId,
    countyFips: pair.countyFips,
    normalizedPayloadHash,
  });
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
    state_code: "AL",
    county_fips: pair.countyFips,
    species_id: pair.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "preserved-specimen",
    scope: "point",
    source_record_id: uuid,
    source_url: `${PORTAL_RECORD_BASE_URL}/${uuid}`,
    source_record_date: sourceDate,
    retrieved_at: retrievedAt,
    taxon_match: {
      method:
        "Exact binomial agreement across target, normalized iDigBio scientific and canonical names, and provider Darwin Core scientific name",
      target_scientific_name: pair.scientificName,
      source_scientific_name: providerScientificName,
      source_taxon_key: record.indexTerms?.taxonid ?? null,
    },
    geography_match: {
      method:
        "Exact normalized Alabama county text matched to requested local county FIPS without coordinate-derived county resolution",
      source_state: record.indexTerms?.stateprovince ?? "alabama",
      source_county: sourceCounty,
      county_fips: pair.countyFips,
    },
    temporal_scope: sourceDate
      ? `Preserved specimen event date reported through iDigBio as ${sourceDate}.`
      : "Historical preserved specimen record with no source event date available.",
    spatial_scope: `Specimen locality reported within ${pair.countyName} County, Alabama. This does not imply countywide abundance or current distribution.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "iDigBio is an aggregator and provider record quality can vary.",
      "The iDigBio search index is frozen historical data and no longer receives updates.",
      "This preserved specimen occurrence supports historical presence only.",
      "Missing iDigBio records never support absence or non-detection.",
      "Coordinates are retained as lineage but were not used to resolve county.",
    ],
    notes: [
      `iDigBio recordset: ${record.indexTerms?.recordset}.`,
      attribution?.name ? `Recordset name: ${attribution.name}.` : "",
      attribution?.publisher ? `Publisher UUID: ${attribution.publisher}.` : "",
      attribution?.url ? `Recordset URL: ${attribution.url}.` : "",
      record.indexTerms?.institutioncode
        ? `Institution code: ${record.indexTerms.institutioncode}.`
        : "",
      record.indexTerms?.collectioncode
        ? `Collection code: ${record.indexTerms.collectioncode}.`
        : "",
      record.indexTerms?.catalognumber
        ? `Catalog number: ${record.indexTerms.catalognumber}.`
        : "",
      record.indexTerms?.occurrenceid
        ? `Publisher occurrence ID: ${record.indexTerms.occurrenceid}.`
        : "",
      rawText(record, "dcterms:license")
        ? `Provider license: ${rawText(record, "dcterms:license")}.`
        : "",
    ].filter(Boolean),
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("idigbio-review", {
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
    state_code: "AL",
    county_fips: pair.countyFips,
    species_id: pair.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "registered-machine-validation-gate",
      "exact-provider-and-indexed-taxon-match",
      "exact-explicit-county-match",
      "preserved-specimen-present",
    ],
    notes: [
      "The registered iDigBio adapter publication gate permits machine-validated occurrence evidence.",
      "The record passed explicit provider and normalized taxon, county, status, recordset, and cultivation checks.",
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
    outcome_id: contentId("idigbio-outcome", {
      runId: context.runId,
      pair: pairKey(pair),
      status,
      scopeComplete,
      assertionEventIds: [...assertionEventIds].sort(),
      rejectionIds: [...rejectionIds].sort(),
    }),
    run_id: context.runId,
    source_id: SOURCE_ID,
    state_code: "AL",
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
  const warnings: string[] = [
    "The iDigBio search index is a frozen historical dataset and no longer receives source updates.",
  ];
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
    if (resourceBudgetReached) {
      const recordedAt = new Date().toISOString();
      for (const pair of speciesPairs) {
        const rejection = makeRejection(
          context,
          pair,
          recordedAt,
          "adapter:artifact-byte-limit-exceeded",
          pair.scientificName,
          `${pair.countyName} County, Alabama`,
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

    const speciesQueryUrls: string[] = [];
    const cachedPages: Array<{
      queryUrl: string;
      retrievedAt: string;
      records: IdigbioRecord[];
      attributionByRecordset: Map<string, IdigbioAttribution>;
    }> = [];
    let scopeFailure: {
      locator: string;
      notes: string[];
      identityPayload: unknown;
    } | null = null;
    let expectedCount: number | null = null;
    let expectedLastModified: string | null = null;
    let returnedRecordCount = 0;
    let offset = 0;
    let pageNumber = 0;
    let scopeComplete = true;
    let recordedAt = context.runStartedAt;
    const seenSourceRecordIds = new Set<string>();

    while (scopeComplete) {
      if (pageNumber >= parameters.maxPagesPerSpecies) {
        scopeComplete = false;
        errors.push({
          code: "idigbio-page-limit-exceeded",
          message: `${representativePair.speciesId} reached ${parameters.maxPagesPerSpecies} pages before its declared result count was complete.`,
          retryable: false,
        });
        scopeFailure = {
          locator: "adapter:idigbio-page-limit-exceeded",
          notes: ["The statewide species screen reached its declared page guard."],
          identityPayload: {
            speciesId: representativePair.speciesId,
            pageNumber,
            returnedRecordCount,
            expectedCount,
          },
        };
        break;
      }

      const queryUrl = searchUrl(
        representativePair.scientificName,
        parameters,
        offset,
      );
      speciesQueryUrls.push(queryUrl);
      const pageResult = await requestJson<IdigbioSearchResponse>(
        queryUrl,
        `idigbio-records-${artifactStem(representativePair.speciesId)}-${String(offset).padStart(6, "0")}.json`,
        (payload) => (Array.isArray(payload.items) ? payload.items.length : 0),
      );
      recordedAt = pageResult.retrievedAt;
      resourceBudgetReached ||= pageResult.artifactLimitReached;
      if (!pageResult.ok || !pageResult.data) {
        scopeComplete = false;
        scopeFailure = {
          locator: queryUrl,
          notes: ["The iDigBio record page request did not return a usable response."],
          identityPayload: { queryUrl, requestFailed: true },
        };
        break;
      }

      const payload = pageResult.data;
      if (
        !Array.isArray(payload.items) ||
        !Number.isInteger(payload.itemCount) ||
        Number(payload.itemCount) < 0 ||
        typeof payload.lastModified !== "string" ||
        Number.isNaN(Date.parse(payload.lastModified)) ||
        (payload.attribution !== undefined && !Array.isArray(payload.attribution))
      ) {
        scopeComplete = false;
        errors.push({
          code: "idigbio-invalid-response-shape",
          message: `iDigBio response for ${representativePair.speciesId} lacks valid itemCount, lastModified, items, or attribution.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The record response shape was incomplete or invalid."],
          identityPayload: payload,
        };
        break;
      }

      const itemCount = Number(payload.itemCount);
      if (expectedCount === null) {
        expectedCount = itemCount;
        expectedLastModified = payload.lastModified;
      } else if (
        itemCount !== expectedCount ||
        payload.lastModified !== expectedLastModified
      ) {
        scopeComplete = false;
        errors.push({
          code: "idigbio-pagination-snapshot-drift",
          message: `${representativePair.speciesId} changed itemCount or lastModified while paging.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The declared result count or source snapshot timestamp changed during pagination."],
          identityPayload: {
            expectedCount,
            returnedCount: itemCount,
            expectedLastModified,
            returnedLastModified: payload.lastModified,
          },
        };
      }
      if (payload.items.length > parameters.pageLimit) {
        scopeComplete = false;
        errors.push({
          code: "idigbio-page-size-exceeded",
          message: `${representativePair.speciesId} returned ${payload.items.length} records for a ${parameters.pageLimit}-record page.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The record response exceeded the requested page limit."],
          identityPayload: {
            requestedLimit: parameters.pageLimit,
            returnedRecordCount: payload.items.length,
          },
        };
      }

      const attributionByRecordset = new Map<string, IdigbioAttribution>();
      for (const attribution of payload.attribution ?? []) {
        if (attribution.uuid?.trim()) {
          attributionByRecordset.set(attribution.uuid.toLowerCase(), attribution);
        }
      }
      cachedPages.push({
        queryUrl,
        retrievedAt: recordedAt,
        records: payload.items,
        attributionByRecordset,
      });
      returnedRecordCount += payload.items.length;
      let identityFailure = false;
      for (const record of payload.items) {
        const uuid = recordUuid(record);
        if (!uuid || seenSourceRecordIds.has(uuid)) {
          identityFailure = true;
          duplicateRecordCount += uuid && seenSourceRecordIds.has(uuid) ? 1 : 0;
          continue;
        }
        seenSourceRecordIds.add(uuid);
      }
      if (identityFailure) {
        scopeComplete = false;
        errors.push({
          code: "idigbio-pagination-record-identity-failed",
          message: `${representativePair.speciesId} returned a missing or repeated stable UUID while paging.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The statewide pages contained a missing or repeated stable iDigBio UUID."],
          identityPayload: {
            speciesId: representativePair.speciesId,
            offset,
            returnedRecordCount,
            uniqueSourceRecordCount: seenSourceRecordIds.size,
          },
        };
      }
      if (returnedRecordCount > itemCount) {
        scopeComplete = false;
        errors.push({
          code: "idigbio-terminal-count-exceeded",
          message: `${representativePair.speciesId} returned ${returnedRecordCount} rows beyond declared itemCount ${itemCount}.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The accumulated response exceeded the declared result count."],
          identityPayload: { itemCount, returnedRecordCount },
        };
      }
      if (pageResult.artifactLimitReached) {
        scopeComplete = false;
        scopeFailure = {
          locator: "adapter:artifact-byte-limit-exceeded",
          notes: ["The statewide species screen stopped after reaching its artifact budget."],
          identityPayload: { speciesId: representativePair.speciesId, offset },
        };
        break;
      }
      if (!scopeComplete) break;
      if (
        returnedRecordCount === itemCount &&
        seenSourceRecordIds.size === itemCount
      ) {
        warnings.push(
          `iDigBio reported source snapshot ${payload.lastModified} for ${representativePair.speciesId}.`,
        );
        break;
      }
      if (payload.items.length === 0) {
        scopeComplete = false;
        errors.push({
          code: "idigbio-empty-nonterminal-page",
          message: `${representativePair.speciesId} returned an empty page before its declared itemCount was reached.`,
          retryable: true,
        });
        scopeFailure = {
          locator: queryUrl,
          notes: ["The record search returned an empty nonterminal page."],
          identityPayload: { offset, itemCount, returnedRecordCount },
        };
        break;
      }
      offset = returnedRecordCount;
      pageNumber += 1;
    }

    const sharedRejectionIds: string[] = [];
    const seenSharedRejectionIds = new Set<string>();
    for (const page of cachedPages) {
      for (const [recordIndex, record] of page.records.entries()) {
        if (record.indexTerms?.county?.trim()) continue;
        const fallbackLocator = `${page.queryUrl}#result-${recordIndex}`;
        const rejectionResult = occurrenceRejection(record, representativePair);
        if (!rejectionResult) {
          throw new Error(
            `County-free iDigBio record ${recordLocator(record, fallbackLocator)} unexpectedly passed validation.`,
          );
        }
        const recordset = record.indexTerms?.recordset?.toLowerCase() ?? "";
        const rejection = makeRejection(
          context,
          representativePair,
          page.retrievedAt,
          recordLocator(record, fallbackLocator),
          candidateTaxon(record) ?? "missing",
          candidateGeography(record),
          rejectionResult.reason,
          rejectionResult.notes,
          supportingPayload(
            record,
            representativePair,
            page.attributionByRecordset.get(recordset) ?? null,
          ),
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
      const pairRejectionIds = [...sharedRejectionIds];
      const seenPairRejectionIds = new Set(pairRejectionIds);
      if (scopeFailure) {
        const rejection = makeRejection(
          context,
          pair,
          recordedAt,
          scopeFailure.locator,
          pair.scientificName,
          `${pair.countyName} County, Alabama`,
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
          const indexedCounty = record.indexTerms?.county;
          if (
            !indexedCounty?.trim() ||
            normalizeCountyName(indexedCounty) !== normalizeCountyName(pair.countyName)
          ) {
            continue;
          }
          const fallbackLocator = `${page.queryUrl}#result-${recordIndex}`;
          const recordset = record.indexTerms?.recordset?.toLowerCase() ?? "";
          const attribution = page.attributionByRecordset.get(recordset) ?? null;
          const rejectionResult = occurrenceRejection(record, pair);
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
              supportingPayload(record, pair, attribution),
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
            record,
            attribution,
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
              supportingPayload(record, pair, attribution),
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
              "The declared iDigBio source scope was not completed. No absence or non-detection is inferred.",
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
              `Completed the registered iDigBio preserved specimen screen and emitted ${pairAssertionIds.length} publishable assertion event(s).`,
              `The source snapshot for this query reported lastModified ${expectedLastModified}.`,
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
              "Completed the declared iDigBio preserved specimen query scope without publishable evidence.",
              `The source snapshot for this query reported lastModified ${expectedLastModified}.`,
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
    candidateRecordCount: upstreamRequests.reduce(
      (total, request) => total + request.recordCount,
      0,
    ),
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

export const idigbioPreservedSpecimensAdapter = adapter;
export default adapter;
