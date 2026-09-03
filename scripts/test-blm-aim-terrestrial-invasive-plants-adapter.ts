import assert from "node:assert/strict";

import {
  BLM_AIM_LAYER_URL,
  BLM_AIM_POSITIVE_WHERE,
  chunkBlmAimObjectIds,
  runBlmAimTerrestrialInvasivePlants,
} from "./research/adapters/blm-aim-terrestrial-invasive-plants";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";

const LAST_EDIT_MS = 1780348225269;

function metadataBody() {
  return JSON.stringify({
    name: "BLM Natl AIM Terrestrial Species Indicators Public",
    maxRecordCount: 2000,
    editingInfo: { lastEditDate: LAST_EDIT_MS },
    advancedQueryCapabilities: {
      supportsPagination: true,
      supportsOrderBy: true,
      supportsStatistics: true,
    },
  });
}

function queryBody(input: { scientificName?: string; fips?: string; cover?: number }) {
  const fips = input.fips ?? "41017";
  return JSON.stringify({
    exceededTransferLimit: false,
    features: [{
      attributes: {
        OBJECTID: 42,
        PrimaryKey: "fixture-primary-key",
        PlotID: "fixture-plot",
        State: "OR",
        Species: "CYSC4",
        ScientificName: input.scientificName ?? "Cytisus scoparius",
        DateVisited: Date.parse("2026-08-01T00:00:00.000Z"),
        AH_SpeciesCover: 0.5,
        AH_SpeciesCover_n: input.cover ?? 1,
        GrowthHabit: "Woody",
        Duration: "Perennial",
        Nonnative: "EXOTIC",
        Noxious: "Noxious",
        Invasive: "Invasive",
        SG_Group: null,
        CommonName: "Scotch broom",
        CountyName: "Deschutes",
        COUNTY_FIPS: fips.slice(2),
        STATE_FIPS: fips.slice(0, 2),
        FIPS: fips,
        DateLoadedInDb: "2026-08-02",
        DBKey: "fixture-db",
        ViewOBJECTID: 84,
        GlobalID: "{59CB2B68-AEB9-4505-9750-52A3827B565A}",
        CurrentPLANTSCode: "CYSC4",
      },
    }],
  });
}

function context(): SourceAdapterContext {
  const pairKey = "41017:cytisus-scoparius";
  return {
    runId: "20260902T180000Z__blm-aim-terrestrial-invasive-plants__fixture",
    sourceId: "blm-aim-terrestrial-invasive-plants",
    stateCode: "OR",
    requestedPairs: [{ countyFips: "41017", countyName: "Deschutes", speciesId: "cytisus-scoparius", scientificName: "Cytisus scoparius" }],
    runStartedAt: "2026-09-02T18:00:00.000Z",
    parameters: {
      stateCode: "OR",
      mode: "targeted-stable-positive-witness",
      layerUrl: BLM_AIM_LAYER_URL,
      layerLastEditMs: LAST_EDIT_MS,
      preflightEvaluationId: "blm-aim-terrestrial-invasive-plants-preflight-20260902-r1",
      positiveWhereClause: BLM_AIM_POSITIVE_WHERE,
      minimumRequestIntervalMs: 1000,
      maxResponseBytes: 1_048_576,
      objectIdsPerRequest: 100,
      targets: [{
        pairKey,
        countyFips: "41017",
        speciesId: "cytisus-scoparius",
        scientificName: "Cytisus scoparius",
        objectId: 42,
        sourceRecordCount: 3,
        sourceCountyName: "Deschutes",
        sourceStateCode: "OR",
      }],
      candidatePairs: [pairKey],
    },
  };
}

async function runWithQueryBody(body: string) {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (input) => {
    requests += 1;
    return new Response(String(input).includes("/query?") ? body : metadataBody(), { status: 200 });
  };
  try {
    const result = await runBlmAimTerrestrialInvasivePlants(context());
    assert.equal(requests, 4);
    return result;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  assert.deepEqual(chunkBlmAimObjectIds([4, 2, 4, 1, 3], 2), [[1, 2], [3, 4]]);
  const accepted = await runWithQueryBody(queryBody({}));
  assert.equal(accepted.assertions.length, 1);
  assert.equal(accepted.reviews.length, 1);
  assert.equal(accepted.rejections.length, 0);
  assert.equal(accepted.outcomes[0].status, "evidence-found");
  assert.equal(accepted.outcomes[0].scope_complete, true);
  assert.equal(accepted.assertions[0].claim_type, "recorded-present");
  assert.equal(accepted.assertions[0].scope, "point");
  assert.equal(accepted.artifacts.length, 4);
  assert.equal(accepted.upstreamRequests.length, 4);
  const rejected = await runWithQueryBody(queryBody({ fips: "41019" }));
  assert.equal(rejected.assertions.length, 0);
  assert.equal(rejected.reviews.length, 0);
  assert.equal(rejected.rejections[0].reason_code, "geography-ambiguous");
  assert.equal(rejected.outcomes[0].status, "no-qualifying-evidence");
  assert.match(rejected.outcomes[0].notes.join(" "), /not verified absence/u);
  assert.equal(rejected.assertions.some((entry) => entry.claim_type === "officially-absent" || entry.claim_type === "not-detected"), false);
  process.stdout.write("BLM AIM terrestrial invasive-plant adapter tests passed.\n");
}

main();
