import assert from "node:assert/strict";

import {
  USFWS_EDNA_COORDINATE_GEOGRAPHY_METHOD,
  USFWS_EDNA_COORDINATE_TOPOLOGY_PATH,
} from "@/lib/research/coordinate-geography-contract";

import {
  USFWS_EDNA_SOURCE_ID,
  replayUsfwsEdnaState,
  type UsfwsEdnaReplayPair,
} from "./research/adapters/usfws-invasive-carp-edna-snapshot";
import type { UsfwsAcceptedSample } from "./research/usfws-invasive-carp-edna-coverage";

const samples: UsfwsAcceptedSample[] = [
  {
    objectId: 10,
    ruid: 26001010,
    globalId: "global-10",
    stateCode: "WI",
    countyFips: "55063",
    countyName: "La Crosse",
    caseNumber: 26001,
    stationId: "LAX-1",
    basin: "UMR",
    waterbody: "Mississippi River",
    siteName: "Station one",
    collectionDate: "2026-05-01",
    latitude: 43.81,
    longitude: -91.25,
    doubleSampleFlag: "No",
    comments: null,
  },
  {
    objectId: 11,
    ruid: 26001011,
    globalId: "global-11",
    stateCode: "WI",
    countyFips: "55063",
    countyName: "La Crosse",
    caseNumber: 26001,
    stationId: "LAX-2",
    basin: "UMR",
    waterbody: "Mississippi River",
    siteName: "Station two",
    collectionDate: "2026-05-02",
    latitude: 43.82,
    longitude: -91.24,
    doubleSampleFlag: "No",
    comments: null,
  },
];

const pair: UsfwsEdnaReplayPair = {
  stateCode: "WI",
  stateName: "Wisconsin",
  countyFips: "55063",
  countyName: "La Crosse",
  countyLegalName: "La Crosse County",
  speciesId: "hypophthalmichthys-molitrix",
  scientificName: "Hypophthalmichthys molitrix",
  commonName: "Silver Carp",
  samples,
};

const context = {
  runId: "fixture-usfws-edna-run",
  sourceId: USFWS_EDNA_SOURCE_ID,
  stateCode: "WI",
  requestedPairs: [{
    countyFips: pair.countyFips,
    countyName: pair.countyName,
    speciesId: pair.speciesId,
    scientificName: pair.scientificName,
  }],
  runStartedAt: "2026-08-21T15:00:00.000Z",
  parameters: {},
};

const result = replayUsfwsEdnaState({
  context,
  pairs: [pair],
  completedAt: context.runStartedAt,
  topologySha256: "a".repeat(64),
  acquisitionUrl: "https://example.gov/usfws-edna",
});

assert.equal(result.assertions.length, 1);
assert.equal(result.reviews.length, 1);
assert.equal(result.outcomes.length, 1);
assert.equal(result.rejections.length, 0);
assert.equal(result.selectedPairCount, 1);
assert.equal(result.selectedSampleCount, 2);
assert.equal(result.assertions[0]?.claim_type, "not-detected");
assert.equal(result.assertions[0]?.evidence_kind, "survey-non-detection");
assert.equal(result.assertions[0]?.scope, "survey-area");
assert.equal(result.assertions[0]?.geography_match.method, USFWS_EDNA_COORDINATE_GEOGRAPHY_METHOD);
assert.equal(result.assertions[0]?.geography_match.source_coordinate_count, 2);
assert.equal(result.assertions[0]?.geography_match.topology_path, USFWS_EDNA_COORDINATE_TOPOLOGY_PATH);
assert.equal(result.assertions[0]?.geography_match.topology_sha256, "a".repeat(64));
assert.match(result.assertions[0]?.geography_match.source_coordinates_sha256 ?? "", /^[a-f0-9]{64}$/u);
assert.equal(result.reviews[0]?.publication_eligible, true);
assert.equal(result.outcomes[0]?.status, "evidence-found");
assert.equal(result.outcomes[0]?.scope_complete, true);
assert(result.assertions.every((assertion) => assertion.claim_type !== "recorded-present"));
assert(result.assertions.every((assertion) => assertion.claim_type !== "officially-absent"));

const replay = replayUsfwsEdnaState({
  context,
  pairs: [{ ...pair, samples: [...samples].reverse() }],
  completedAt: context.runStartedAt,
  topologySha256: "a".repeat(64),
  acquisitionUrl: "https://example.gov/usfws-edna",
});
assert.deepEqual(replay, result);

console.log("USFWS invasive-carp eDNA snapshot adapter tests passed.");
