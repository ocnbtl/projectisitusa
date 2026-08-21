import { createHash } from "node:crypto";

import {
  USFWS_EDNA_COORDINATE_GEOGRAPHY_METHOD,
  USFWS_EDNA_COORDINATE_TOPOLOGY_PATH,
} from "@/lib/research/coordinate-geography-contract";
import type { SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import type {
  EvidenceReviewEvent,
  ResearchPairOutcome,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { stableJson } from "@/lib/research/run-files";

import {
  USFWS_EDNA_LAYER_URL,
  type UsfwsAcceptedSample,
} from "../usfws-invasive-carp-edna-coverage";

export const USFWS_EDNA_SOURCE_ID = "usfws-invasive-carp-edna";
export const USFWS_EDNA_ADAPTER_ID = "usfws-invasive-carp-edna-snapshot";
export const USFWS_EDNA_ADAPTER_VERSION = "1.0.0";

export type UsfwsEdnaReplayPair = {
  stateCode: string;
  stateName: string;
  countyFips: string;
  countyName: string;
  countyLegalName: string;
  speciesId: string;
  scientificName: string;
  commonName: string;
  samples: UsfwsAcceptedSample[];
};

export type UsfwsEdnaReplayResult = SourceAdapterResult & {
  selectedPairCount: number;
  selectedSampleCount: number;
  selectedSamplesSha256: string;
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

function pairKey(pair: { countyFips: string; speciesId: string }) {
  return `${pair.countyFips}:${pair.speciesId}`;
}

function reducedSample(sample: UsfwsAcceptedSample) {
  return {
    objectId: sample.objectId,
    ruid: sample.ruid,
    globalId: sample.globalId,
    stateCode: sample.stateCode,
    countyFips: sample.countyFips,
    countyName: sample.countyName,
    caseNumber: sample.caseNumber,
    stationId: sample.stationId,
    basin: sample.basin,
    waterbody: sample.waterbody,
    siteName: sample.siteName,
    collectionDate: sample.collectionDate,
    latitude: sample.latitude,
    longitude: sample.longitude,
    doubleSampleFlag: sample.doubleSampleFlag,
    comments: sample.comments,
  };
}

function coordinateReceipt(samples: UsfwsAcceptedSample[]) {
  return samples.map((sample) => ({
    objectId: sample.objectId,
    latitude: sample.latitude,
    longitude: sample.longitude,
    countyFips: sample.countyFips,
  }));
}

function buildAssertionAndReview(input: {
  context: SourceAdapterContext;
  pair: UsfwsEdnaReplayPair;
  completedAt: string;
  topologySha256: string;
}) {
  const samples = [...input.pair.samples].sort((left, right) => left.objectId - right.objectId);
  assert(samples.length > 0, `USFWS pair ${pairKey(input.pair)} has no accepted samples.`);
  assert(
    samples.every((sample) =>
      sample.stateCode === input.pair.stateCode &&
      sample.countyFips === input.pair.countyFips
    ),
    `USFWS pair ${pairKey(input.pair)} contains samples from another geography.`,
  );
  const payloadHash = sha256(stableJson(samples.map(reducedSample)));
  const coordinateHash = sha256(stableJson(coordinateReceipt(samples)));
  const sourceIdentityHash = sha256(`${samples.map((sample) => sample.objectId).join("\n")}\n`);
  const eventId = contentId("usfws-edna-assertion", {
    runId: input.context.runId,
    pairKey: pairKey(input.pair),
    payloadHash,
  });
  const dates = samples.map((sample) => sample.collectionDate).sort(compareText);
  const caseCount = new Set(samples.map((sample) => sample.caseNumber)).size;
  const stations = [...new Set(samples.map((sample) => sample.stationId))].sort(compareText);
  const waterbodies = [...new Set(samples.map((sample) => sample.waterbody))].sort(compareText);
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${USFWS_EDNA_ADAPTER_ID}@${USFWS_EDNA_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: USFWS_EDNA_SOURCE_ID,
    state_code: input.pair.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    claim_type: "not-detected",
    evidence_kind: "survey-non-detection",
    scope: "survey-area",
    source_record_id: `usfws-edna-sample-group:${sourceIdentityHash}`,
    source_url: USFWS_EDNA_LAYER_URL,
    source_record_date: dates.at(-1)!,
    retrieved_at: input.completedAt,
    taxon_match: {
      method: "Exact canonical binomial mapping to an official USFWS Bighead and Silver Carp eDNA program target",
      target_scientific_name: input.pair.scientificName,
      source_scientific_name: input.pair.scientificName,
      source_taxon_key: input.pair.commonName,
    },
    geography_match: {
      method: USFWS_EDNA_COORDINATE_GEOGRAPHY_METHOD,
      source_state: input.pair.stateCode,
      source_county: input.pair.countyName,
      county_fips: input.pair.countyFips,
      source_coordinate_count: samples.length,
      source_coordinates_sha256: coordinateHash,
      topology_path: USFWS_EDNA_COORDINATE_TOPOLOGY_PATH,
      topology_sha256: input.topologySha256,
    },
    temporal_scope: `USFWS eDNA sample dates ${dates[0]} through ${dates.at(-1)}.`,
    spatial_scope: `${samples.length} accepted sample points uniquely resolved inside ${input.pair.countyLegalName}, ${input.pair.stateName}. The evidence applies to those surveyed waters and sample points, not the unsampled county area.`,
    survey_scope: `The official USFWS Bighead and Silver Carp eDNA monitoring program explicitly targeted ${input.pair.commonName}. ${samples.length} non-blank samples across ${caseCount} case groups reported the exact negative result No eDNA detected.`,
    normalized_payload_hash: payloadHash,
    caveats: [
      "Survey non-detection is not verified absence and does not establish that the species is absent from the county.",
      "The official item documents assay and processing changes in 2014, 2015, and 2020; the retained sample dates and program documents preserve that historical-method boundary.",
      "Positive eDNA can be transported and is excluded from this negative assertion; no positive label is converted to verified presence.",
      "No detection data, field blanks, duplicate identities, invalid coordinates, offshore points, ambiguous geography, and state mismatches are ineligible.",
    ],
    notes: [
      `Qualifying sample count: ${samples.length}; case count: ${caseCount}.`,
      `Distinct stations: ${stations.length}; distinct waterbodies: ${waterbodies.length}.`,
      `Source coordinate receipt SHA-256: ${coordinateHash}.`,
      `Source OBJECTID set SHA-256: ${sourceIdentityHash}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("usfws-edna-review", { assertionEventId: eventId }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${USFWS_EDNA_ADAPTER_ID}@${USFWS_EDNA_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: USFWS_EDNA_SOURCE_ID,
    state_code: input.pair.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "complete-stable-official-snapshot",
      "exact-explicit-negative-label",
      "complete-two-target-contract",
      "non-blank-sample",
      "unique-source-identities",
      "source-specific-coordinate-contract",
      "unique-active-county-resolution",
      "matching-source-state",
    ],
    notes: [
      "Every grouped source sample passed the official negative-label, blank, identity, coordinate, source-state, and active-county gates.",
      "This review publishes survey-area not-detected evidence only; it creates no absence or presence determination.",
    ],
  };
  return { assertion, review };
}

export function replayUsfwsEdnaState(input: {
  context: SourceAdapterContext;
  pairs: UsfwsEdnaReplayPair[];
  completedAt: string;
  topologySha256: string;
  acquisitionUrl: string;
}): UsfwsEdnaReplayResult {
  assert(input.context.sourceId === USFWS_EDNA_SOURCE_ID, "USFWS replay received the wrong source.");
  assert(input.pairs.length > 0, "USFWS replay requires qualifying pairs.");
  const requested = new Set(input.context.requestedPairs.map(pairKey));
  const orderedPairs = [...input.pairs].sort((left, right) => compareText(pairKey(left), pairKey(right)));
  assert(requested.size === orderedPairs.length, "USFWS requested pair count differs from replay pairs.");
  assert(
    orderedPairs.every((pair) =>
      pair.stateCode === input.context.stateCode && requested.has(pairKey(pair))
    ),
    "USFWS replay pair is outside the requested state scope.",
  );
  const normalized = orderedPairs.map((pair) =>
    buildAssertionAndReview({
      context: input.context,
      pair,
      completedAt: input.completedAt,
      topologySha256: input.topologySha256,
    })
  );
  const assertions = normalized.map((entry) => entry.assertion);
  const reviews = normalized.map((entry) => entry.review);
  const outcomes: ResearchPairOutcome[] = orderedPairs.map((pair, index) => ({
    schemaVersion: 1,
    outcome_id: contentId("usfws-edna-outcome", {
      runId: input.context.runId,
      pairKey: pairKey(pair),
      assertionEventId: assertions[index]!.eventId,
    }),
    run_id: input.context.runId,
    source_id: USFWS_EDNA_SOURCE_ID,
    state_code: pair.stateCode,
    county_fips: pair.countyFips,
    species_id: pair.speciesId,
    status: "evidence-found",
    scope_complete: true,
    recorded_at: input.completedAt,
    assertion_event_ids: [assertions[index]!.eventId],
    rejection_ids: [],
    query_urls: [input.acquisitionUrl],
    notes: [
      "The complete stable USFWS snapshot contains qualifying explicit survey non-detection samples for this county-species pair.",
      "The result is survey-area not-detected evidence, not verified countywide absence.",
    ],
  }));
  const allSamples = orderedPairs.flatMap((pair) => pair.samples).sort((left, right) =>
    left.objectId - right.objectId || compareText(left.countyFips, right.countyFips)
  );
  return {
    completedAt: input.completedAt,
    assertions,
    reviews,
    rejections: [],
    outcomes,
    artifacts: [],
    upstreamRequests: [],
    candidateRecordCount: allSamples.length,
    duplicateRecordCount: 0,
    errors: [],
    warnings: [
      "USFWS eDNA survey non-detection is not verified absence.",
      "Positive eDNA labels are excluded and are not converted to verified presence.",
      "Historical assay and processing changes remain explicit caveats.",
    ],
    selectedPairCount: orderedPairs.length,
    selectedSampleCount: allSamples.length,
    selectedSamplesSha256: sha256(stableJson(allSamples.map(reducedSample))),
  };
}
