import assert from "node:assert/strict";

import {
  acquireNationalGbifCountCalibration,
  fetchGbifCountCalibration,
  type GbifCountCalibrationTaxon,
} from "./research/acquire-national-gbif-count-calibration";
import {
  deterministicGbifTieBreaker,
  fitNationalGbifYieldModelV2,
  predictNationalGbifTaxonV2,
  rankNationalGbifCandidatesV2,
} from "./research/national-gbif-yield-model-v2";

const candidate: GbifCountCalibrationTaxon = {
  speciesId: "example-species",
  scientificName: "Example species",
  taxonKey: 123,
  category: "plants",
  displayGroup: "Other plants",
  grossPairs: 100,
  notResearchedPairs: 80,
  blockedPairs: 5,
  alreadyResearchedPairs: 15,
};

async function main() {
  const rounds = [{
    round: 1,
    providerRows: 100,
    selectedScopeRows: 50,
    acceptedArchiveRows: 20,
    uniquePresentPairs: 10,
    taxa: [{
      speciesId: "training-species",
      category: "plants",
      displayGroup: "Other plants",
      providerRows: 100,
      uniquePresentPairs: 10,
    }],
  }];
  const model = fitNationalGbifYieldModelV2(rounds);
  assert.equal(model.trainingRounds[0], 1);
  assert.equal(model.stageEstimates.providerToSelectedScope.numerator, 50);
  const prediction = predictNationalGbifTaxonV2(model, { ...candidate, providerRows: 40 }, "test-seed");
  assert(prediction.expectedSelectedScopeRows > prediction.expectedAcceptedArchiveRows);
  assert(prediction.expectedAcceptedArchiveRows > prediction.expectedUniquePresentPairs);
  assert(prediction.upper95UniquePresentPairs >= prediction.expectedUniquePresentPairs);
  assert.equal(prediction.yieldFeatureSource, "display-group-history");

  const ties = rankNationalGbifCandidatesV2(model, [
    { ...candidate, speciesId: "alpha", taxonKey: 1, providerRows: 10 },
    { ...candidate, speciesId: "zulu", taxonKey: 2, providerRows: 10 },
  ], "opaque-seed");
  assert.deepEqual(
    ties.map((entry) => entry.deterministicTieBreaker),
    [...ties.map((entry) => entry.deterministicTieBreaker)].sort(),
  );
  assert.notEqual(deterministicGbifTieBreaker("opaque-seed", "alpha"), deterministicGbifTieBreaker("opaque-seed", "zulu"));

  const observedAt = () => "2026-08-21T12:00:00.000Z";
  const fetchImpl: typeof fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("limit"), "0");
    assert.equal(url.searchParams.get("country"), "US");
    assert.equal(url.searchParams.get("basis_of_record"), "PRESERVED_SPECIMEN");
    assert.equal(url.searchParams.get("occurrence_status"), "PRESENT");
    assert.equal(url.searchParams.get("taxon_key"), "123");
    return new Response(JSON.stringify({ count: 17, endOfRecords: true, results: [] }), {
      status: 200,
      headers: { "content-type": "application/json; charset=UTF-8" },
    });
  };
  const calibrated = await fetchGbifCountCalibration(candidate, { fetchImpl, observedAt });
  assert.equal(calibrated.providerRows, 17);
  assert.equal(calibrated.observedAt, observedAt());
  assert.match(calibrated.responseSha256, /^[0-9a-f]{64}$/u);
  const batch = await acquireNationalGbifCountCalibration({
    taxa: [candidate],
    fetchImpl,
    delayMilliseconds: 0,
    observedAt,
  });
  assert.equal(batch.length, 1);

  process.stdout.write("National GBIF yield-model v2 and count-only calibration tests passed.\n");
}

void main();
