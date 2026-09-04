import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

import countyTopology from "@/data/source/county-equivalents-topology.json";
import type { ResearchSourceAdapter, SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import type { EvidenceReviewEvent, ResearchPairOutcome, RunEvidenceAssertionEvent } from "@/lib/research/types";
import { getStateDefinition, listCountyEquivalents } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const BLM_NISIMS_SOURCE_ID = "blm-nisims" as const;
export const GBIF_IPAMS_SOURCE_ID = "gbif-ipams" as const;
export const RETAINED_GBIF_OBSERVATION_ADAPTER_VERSION = "1.0.0" as const;

export type RetainedGbifObservationTarget = {
  pairKey: string;
  occurrenceId: string;
  countyFips: string;
  stateCode: string;
  sourceState: string;
  sourceCounty: string;
  speciesId: string;
  scientificName: string;
  eventDate: string;
  latitude: number;
  longitude: number;
};

type RetainedGbifObservationParameters = {
  stateCode: string;
  mode: "retained-archive-witnesses";
  profile: "blm-nisims" | "gbif-ipams";
  datasetKey: string;
  datasetDoi: string;
  datasetUrl: string;
  metadataUrl: string;
  usagePolicyUrl: string;
  datasetVersion: string;
  datasetLastModified: string;
  archiveBytes: number;
  archiveSha256: string;
  occurrenceBytes: number;
  occurrenceSha256: string;
  emlSha256: string;
  metaSha256: string;
  archiveVerifiedAt: string;
  preflightEvaluationId: string;
  targetPairSetSha256: string;
  targets: RetainedGbifObservationTarget[];
  candidatePairs: string[];
};

type Profile = {
  profile: RetainedGbifObservationParameters["profile"];
  sourceId: typeof BLM_NISIMS_SOURCE_ID | typeof GBIF_IPAMS_SOURCE_ID;
  adapterId: "blm-nisims-retained-snapshot" | "gbif-ipams-retained-snapshot";
  label: "BLM NISIMS" | "GBIF IPAMS";
  datasetKey: string;
  datasetDoi: string;
  datasetUrl: string;
  metadataUrl: string;
  policyUrl: string;
  datasetVersion: string;
  datasetLastModified: string;
  archiveBytes: number;
  archiveSha256: string;
  occurrenceBytes: number;
  occurrenceSha256: string;
  emlSha256: string;
  metaSha256: string;
  taxonomyMethod: string;
  geographyMethod: string;
  reasonCodes: string[];
};

const BLM_NISIMS_PROFILE: Profile = {
  profile: "blm-nisims",
  sourceId: BLM_NISIMS_SOURCE_ID,
  adapterId: "blm-nisims-retained-snapshot",
  label: "BLM NISIMS",
  datasetKey: "cc63e998-fe1b-468d-94f1-6afcf494d0e4",
  datasetDoi: "10.15468/y4xndh",
  datasetUrl: "https://ipt.gbif.us/archive.do?r=blm_nisims",
  metadataUrl: "https://ipt.gbif.us/eml.do?r=blm_nisims",
  policyUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  datasetVersion: "1.2",
  datasetLastModified: "2023-01-04T17:25:43Z",
  archiveBytes: 7449124,
  archiveSha256: "60f8d6e8974b3b95e89e8d291db3cd1472548c18e85f8c3f3468abcd7c3d726c",
  occurrenceBytes: 54516023,
  occurrenceSha256: "8544e613a4f835c7c59cde648435cb59ab06512fded53b77fb0e234cc9123523",
  emlSha256: "bca5abb478b269331aa4a9e2a7aaa528f5834009b57f10ef9d1bb66d06a001e8",
  metaSha256: "6acfaedea65ff8ff2ec9cc02be54cf1e1d9456faedabb757f9cc492d147196c5",
  taxonomyMethod: "Exact unambiguous source scientific name to one Project Isitusa catalog species after Unicode, whitespace, and case normalization",
  geographyMethod: "The retained point coordinate resolves inside exactly one active county equivalent in the provider-declared state; the county name is the registered active county name derived from that geometry",
  reasonCodes: [
    "retained-cc0-archive",
    "stable-occurrence-identity",
    "human-observation-basis",
    "explicit-present-status",
    "positive-percent-cover",
    "explicit-introduced-establishment",
    "exact-catalog-scientific-name",
    "coordinate-inside-active-county",
    "valid-event-date",
    "occurrence-only-semantics",
  ],
};

const GBIF_IPAMS_PROFILE: Profile = {
  profile: "gbif-ipams",
  sourceId: GBIF_IPAMS_SOURCE_ID,
  adapterId: "gbif-ipams-retained-snapshot",
  label: "GBIF IPAMS",
  datasetKey: "d587c7e5-d442-437a-a6d7-d1a78ecf2300",
  datasetDoi: "10.15468/3j3ueb",
  datasetUrl: "https://ipt.gbif.us/archive.do?r=ipams",
  metadataUrl: "https://ipt.gbif.us/eml.do?r=ipams",
  policyUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  datasetVersion: "1.4",
  datasetLastModified: "2020-07-31T18:39:03Z",
  archiveBytes: 898409,
  archiveSha256: "d9fed59d6b61541b9234c330990703fc823ad0a919acf8b2639f19a0b9a64e4b",
  occurrenceBytes: 12884816,
  occurrenceSha256: "57e011f88799e68e903c9999665da0ce76b069e8abb62adab93ead1f95795d7e",
  emlSha256: "1bf923fffc81199623492d9a22b63348b1fb265d4ebf6fc83dfa32fa43fd86f9",
  metaSha256: "deab7d2648df646fb121272f66917d1787ed96d884e85a3ea704baa62d2a468d",
  taxonomyMethod: "Exact unambiguous source scientific name to one Project Isitusa catalog species after Unicode, whitespace, and case normalization",
  geographyMethod: "The provider county and state resolve to the same active county equivalent as the retained point coordinate",
  reasonCodes: [
    "retained-cc0-archive",
    "stable-occurrence-identity",
    "human-observation-basis",
    "explicit-regional-nonnative-establishment",
    "exact-catalog-scientific-name",
    "coordinate-source-county-agreement",
    "valid-event-date",
    "occurrence-only-semantics",
  ],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function pairKey(value: { countyFips: string; speciesId: string }) {
  return `${value.countyFips}:${value.speciesId}`;
}

function countyFeatureByFips() {
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: Array<{ id: string | number; properties?: { name?: string } }> } };
  };
  const collection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name?: string }>;
  return new Map(
    collection.features.map((countyFeature, index) => {
      const geometry = topology.objects.counties.geometries[index];
      return [String(geometry.id).padStart(5, "0"), {
        name: geometry.properties?.name ?? countyFeature.properties?.name ?? "",
        feature: countyFeature,
      }] as const;
    }),
  );
}

const COUNTY_FEATURE_BY_FIPS = countyFeatureByFips();

function parseParameters(context: SourceAdapterContext, profile: Profile) {
  const parameters = context.parameters as unknown as RetainedGbifObservationParameters;
  assert(parameters.stateCode === context.stateCode, `${profile.label} state differs from the requested state.`);
  assert(parameters.profile === profile.profile, `${profile.label} profile differs.`);
  assert(parameters.mode === "retained-archive-witnesses", `${profile.label} acquisition mode differs.`);
  assert(parameters.datasetKey === profile.datasetKey, `${profile.label} dataset key differs.`);
  assert(parameters.datasetDoi === profile.datasetDoi, `${profile.label} dataset DOI differs.`);
  assert(parameters.datasetUrl === profile.datasetUrl, `${profile.label} dataset URL differs.`);
  assert(parameters.metadataUrl === profile.metadataUrl, `${profile.label} metadata URL differs.`);
  assert(parameters.usagePolicyUrl === profile.policyUrl, `${profile.label} usage policy URL differs.`);
  assert(parameters.datasetVersion === profile.datasetVersion, `${profile.label} dataset version differs.`);
  assert(parameters.datasetLastModified === profile.datasetLastModified, `${profile.label} dataset Last-Modified differs.`);
  assert(parameters.archiveBytes === profile.archiveBytes, `${profile.label} archive byte count differs.`);
  assert(parameters.archiveSha256 === profile.archiveSha256, `${profile.label} archive SHA-256 differs.`);
  assert(parameters.occurrenceBytes === profile.occurrenceBytes, `${profile.label} occurrence byte count differs.`);
  assert(parameters.occurrenceSha256 === profile.occurrenceSha256, `${profile.label} occurrence SHA-256 differs.`);
  assert(parameters.emlSha256 === profile.emlSha256, `${profile.label} EML SHA-256 differs.`);
  assert(parameters.metaSha256 === profile.metaSha256, `${profile.label} meta SHA-256 differs.`);
  assert(Number.isFinite(Date.parse(parameters.archiveVerifiedAt)), `${profile.label} archive verification timestamp is invalid.`);
  assert(new RegExp(`^${profile.sourceId}-preflight-[0-9]{8}-r[0-9]+$`, "u").test(parameters.preflightEvaluationId), `${profile.label} preflight identity is invalid.`);
  assert(/^[0-9a-f]{64}$/u.test(parameters.targetPairSetSha256), `${profile.label} target pair hash is invalid.`);
  assert(Array.isArray(parameters.targets) && parameters.targets.length > 0 && parameters.targets.length <= 5000, `${profile.label} target count is invalid.`);
  const candidatePairs = [...parameters.candidatePairs].sort(compareText);
  const requestedPairs = context.requestedPairs.map(pairKey).sort(compareText);
  const targetPairs = parameters.targets.map((target) => target.pairKey).sort(compareText);
  assert(stableJson(candidatePairs) === stableJson(requestedPairs), `${profile.label} candidates differ from requested pairs.`);
  assert(stableJson(candidatePairs) === stableJson(targetPairs), `${profile.label} targets differ from requested pairs.`);
  assert(sha256(candidatePairs.join("\n")) === parameters.targetPairSetSha256, `${profile.label} target pair hash differs.`);
  assert(new Set(parameters.targets.map((target) => target.occurrenceId)).size === parameters.targets.length, `${profile.label} occurrence identities repeat within the state plan.`);
  return parameters;
}

function validateTarget(context: SourceAdapterContext, target: RetainedGbifObservationTarget, profile: Profile) {
  assert(target.pairKey === pairKey(target), `${profile.label} pair identity differs for ${target.pairKey}.`);
  assert(target.stateCode === context.stateCode, `${profile.label} state differs for ${target.pairKey}.`);
  assert(/^\d{5}$/u.test(target.countyFips), `${profile.label} county FIPS is invalid for ${target.pairKey}.`);
  assert(target.occurrenceId.trim().length > 0 && target.occurrenceId.length <= 500, `${profile.label} occurrence identity is invalid for ${target.pairKey}.`);
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(target.eventDate), `${profile.label} event date is invalid for ${target.pairKey}.`);
  assert(Number.isFinite(target.latitude) && Number.isFinite(target.longitude), `${profile.label} coordinates are invalid for ${target.pairKey}.`);
  const requested = context.requestedPairs.find((pair) => pairKey(pair) === target.pairKey);
  assert(requested, `${profile.label} target was not requested: ${target.pairKey}.`);
  assert(normalizedText(requested.scientificName) === normalizedText(target.scientificName), `${profile.label} taxonomy differs for ${target.pairKey}.`);
  const state = getStateDefinition(context.stateCode);
  assert(state?.nationalV1Scope, `${profile.label} state ${context.stateCode} is not registered.`);
  assert(normalizedText(target.sourceState) === normalizedText(state.sourceStateNames.gbif), `${profile.label} provider state differs for ${target.pairKey}.`);
  const activeCounty = listCountyEquivalents(context.stateCode).find((county) => county.countyFips === target.countyFips);
  assert(activeCounty, `${profile.label} county is inactive for ${target.pairKey}.`);
  const countyGeometry = COUNTY_FEATURE_BY_FIPS.get(target.countyFips);
  assert(countyGeometry, `${profile.label} county geometry is missing for ${target.pairKey}.`);
  assert(geoContains(countyGeometry.feature, [target.longitude, target.latitude]), `${profile.label} coordinate does not fall inside ${target.countyFips} for ${target.pairKey}.`);
  if (profile.profile === "blm-nisims") {
    assert(normalizedText(target.sourceCounty) === normalizedText(activeCounty.legalName), `${profile.label} derived county name differs for ${target.pairKey}.`);
  } else {
    assert(normalizedText(target.sourceCounty) === normalizedText(countyGeometry.name), `${profile.label} provider county differs from coordinate county for ${target.pairKey}.`);
  }
}

function buildAssertionAndReview(
  context: SourceAdapterContext,
  target: RetainedGbifObservationTarget,
  completedAt: string,
  parameters: RetainedGbifObservationParameters,
  profile: Profile,
) {
  const normalizedPayloadHash = sha256(stableJson(target));
  const assertionEventId = contentId(`${profile.profile}-assertion`, {
    runId: context.runId,
    pairKey: target.pairKey,
    occurrenceId: target.occurrenceId,
    normalizedPayloadHash,
  });
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId: assertionEventId,
    event_type: "evidence.asserted",
    created_at: completedAt,
    actor_type: "adapter",
    actor_id: `${profile.adapterId}@${RETAINED_GBIF_OBSERVATION_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: profile.sourceId,
    state_code: context.stateCode,
    county_fips: target.countyFips,
    species_id: target.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "point",
    source_record_id: `${profile.sourceId}:${target.occurrenceId}`,
    source_url: profile.datasetUrl,
    source_record_date: target.eventDate,
    retrieved_at: parameters.archiveVerifiedAt,
    taxon_match: {
      method: profile.taxonomyMethod,
      target_scientific_name: target.scientificName,
      source_scientific_name: target.scientificName,
      source_taxon_key: null,
    },
    geography_match: {
      method: profile.geographyMethod,
      source_state: target.sourceState,
      source_county: target.sourceCounty,
      county_fips: target.countyFips,
    },
    temporal_scope: `Human observation recorded on ${target.eventDate}.`,
    spatial_scope: `Point occurrence at ${target.latitude}, ${target.longitude} inside ${target.countyFips}; not a complete county inventory.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "The retained observation supports historical recorded presence only.",
      "It does not establish current abundance, countywide distribution, or present-day establishment.",
      "Source silence, excluded rows, zero values, and rejected rows create no absence or non-detection claim.",
    ],
    notes: [
      `${profile.label} occurrence ${target.occurrenceId}.`,
      `CC0 dataset ${profile.datasetDoi}; archive ${profile.archiveSha256}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId(`${profile.profile}-review`, { assertionEventId }),
    event_type: "evidence.reviewed",
    created_at: completedAt,
    actor_type: "adapter",
    actor_id: `${profile.adapterId}@${RETAINED_GBIF_OBSERVATION_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: profile.sourceId,
    state_code: context.stateCode,
    county_fips: target.countyFips,
    species_id: target.speciesId,
    references: { assertion_event_id: assertionEventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: profile.reasonCodes,
    notes: [
      "The witness was selected by a complete archive preflight and retained inside this immutable run.",
      "Publication is limited to historical recorded presence; no source omission or rejected row is negative evidence.",
    ],
  };
  return { assertion, review };
}

function buildRunner(profile: Profile) {
  return async (context: SourceAdapterContext): Promise<SourceAdapterResult> => {
    assert(context.sourceId === profile.sourceId, `${profile.label} adapter received the wrong source.`);
    const parameters = parseParameters(context, profile);
    const completedAt = new Date().toISOString();
    assert(Date.parse(completedAt) >= Date.parse(context.runStartedAt), `${profile.label} completion precedes run start.`);
    const assertions: RunEvidenceAssertionEvent[] = [];
    const reviews: EvidenceReviewEvent[] = [];
    const outcomes: ResearchPairOutcome[] = [];
    for (const target of [...parameters.targets].sort((left, right) => compareText(left.pairKey, right.pairKey))) {
      validateTarget(context, target, profile);
      const accepted = buildAssertionAndReview(context, target, completedAt, parameters, profile);
      assertions.push(accepted.assertion);
      reviews.push(accepted.review);
      outcomes.push({
        schemaVersion: 1,
        outcome_id: contentId(`${profile.profile}-outcome`, { runId: context.runId, pairKey: target.pairKey }),
        run_id: context.runId,
        source_id: profile.sourceId,
        state_code: context.stateCode,
        county_fips: target.countyFips,
        species_id: target.speciesId,
        status: "evidence-found",
        scope_complete: true,
        recorded_at: completedAt,
        assertion_event_ids: [accepted.assertion.eventId],
        rejection_ids: [],
        query_urls: [profile.datasetUrl],
        notes: [`One retained CC0 human-observation witness supports historical recorded presence for this county-species pair.`],
      });
    }
    const identity = {
      profile: profile.profile,
      datasetKey: parameters.datasetKey,
      datasetDoi: parameters.datasetDoi,
      datasetUrl: parameters.datasetUrl,
      metadataUrl: parameters.metadataUrl,
      usagePolicyUrl: parameters.usagePolicyUrl,
      datasetVersion: parameters.datasetVersion,
      datasetLastModified: parameters.datasetLastModified,
      archiveBytes: parameters.archiveBytes,
      archiveSha256: parameters.archiveSha256,
      occurrenceBytes: parameters.occurrenceBytes,
      occurrenceSha256: parameters.occurrenceSha256,
      emlSha256: parameters.emlSha256,
      metaSha256: parameters.metaSha256,
      archiveVerifiedAt: parameters.archiveVerifiedAt,
      preflightEvaluationId: parameters.preflightEvaluationId,
      targetPairSetSha256: parameters.targetPairSetSha256,
    };
    return {
      completedAt,
      assertions,
      reviews,
      rejections: [],
      outcomes,
      artifacts: [
        { filename: `${profile.profile}-source-identity.json`, mediaType: "application/json", contents: `${JSON.stringify(identity, null, 2)}\n` },
        { filename: `${profile.profile}-retained-witnesses.json.gz`, mediaType: "application/gzip", contents: gzipSync(Buffer.from(stableJson(parameters.targets))) },
      ],
      upstreamRequests: [],
      candidateRecordCount: parameters.targets.length,
      duplicateRecordCount: 0,
      errors: [],
      warnings: [
        `${profile.label} human observations support historical recorded presence only.`,
        "The complete source archive was screened offline; one strict retained witness per eligible county-species pair is persisted in each immutable run.",
        "Source silence and rejected rows never support absence or non-detection.",
      ],
    };
  };
}

export const blmNisimsRetainedAdapter: ResearchSourceAdapter = {
  adapterId: BLM_NISIMS_PROFILE.adapterId,
  adapterVersion: RETAINED_GBIF_OBSERVATION_ADAPTER_VERSION,
  sourceId: BLM_NISIMS_SOURCE_ID,
  run: buildRunner(BLM_NISIMS_PROFILE),
};

export const gbifIpamsRetainedAdapter: ResearchSourceAdapter = {
  adapterId: GBIF_IPAMS_PROFILE.adapterId,
  adapterVersion: RETAINED_GBIF_OBSERVATION_ADAPTER_VERSION,
  sourceId: GBIF_IPAMS_SOURCE_ID,
  run: buildRunner(GBIF_IPAMS_PROFILE),
};
