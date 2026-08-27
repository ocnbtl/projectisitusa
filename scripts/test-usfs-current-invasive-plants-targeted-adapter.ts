import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { geoCentroid, geoContains } from "d3-geo";
import { feature } from "topojson-client";

import {
  USFS_CURRENT_PLANTS_LAYER_URL,
  runUsfsCurrentPlantsTargeted,
} from "./research/adapters/usfs-current-invasive-plants-targeted";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";

const topology = JSON.parse(
  readFileSync(path.join(process.cwd(), "node_modules/us-atlas/counties-10m.json"), "utf8"),
) as { objects: { counties: unknown } };
const collection = feature(topology as never, topology.objects.counties as never) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
const deschutes = collection.features.find((entry) => String(entry.id).padStart(5, "0") === "41017");
assert(deschutes, "Fixture county topology is missing.");
const center = geoCentroid(deschutes);
assert(geoContains(deschutes, center), "Fixture county centroid is outside its topology.");

function responseBody(objectId: number, scientificName: string, longitude: number, latitude: number) {
  return JSON.stringify({
    features: [{
      attributes: {
        objectid: objectId,
        site_id_fs: `fixture-${objectId}`,
        accepted_plant_code: "CYSC4",
        accepted_scientific_name: scientificName,
        accepted_common_name: "Scotch broom",
        date_collected: Date.parse("2026-08-01T00:00:00.000Z"),
        date_collected_most_recent: Date.parse("2026-08-01T00:00:00.000Z"),
        current_measurement: "Yes",
        plant_status: "Current",
        plant_status_set: "Current",
        fs_unit_id: "fixture-unit",
        fs_unit_name: "Fixture National Forest",
        feature_cn: `fixture-feature-${objectId}`,
        last_update: Date.parse("2026-08-02T00:00:00.000Z"),
        crc_value: 1,
      },
      geometry: {
        rings: [[
          [longitude - 0.001, latitude - 0.001],
          [longitude + 0.001, latitude - 0.001],
          [longitude + 0.001, latitude + 0.001],
          [longitude - 0.001, latitude + 0.001],
          [longitude - 0.001, latitude - 0.001],
        ]],
      },
    }],
  });
}

function contextFor(countyFips: string): SourceAdapterContext {
  const pairKey = `${countyFips}:cytisus-scoparius`;
  return {
    runId: `20260827T230000Z__usfs-current-invasive-plants__fixture-${countyFips}`,
    sourceId: "usfs-current-invasive-plants",
    stateCode: "OR",
    requestedPairs: [{
      countyFips,
      countyName: "Deschutes",
      speciesId: "cytisus-scoparius",
      scientificName: "Cytisus scoparius",
    }],
    runStartedAt: "2026-08-27T23:00:00.000Z",
    parameters: {
      stateCode: "OR",
      mode: "targeted-stable-positive-witness",
      layerUrl: USFS_CURRENT_PLANTS_LAYER_URL,
      preflightEvaluationId: "usfs-current-invasive-plants-national-preflight-20260827-r1",
      providerDeclaredRefreshDate: "2026-08-12",
      catalogResponseSha256: "a".repeat(64),
      minimumRequestIntervalMs: 1000,
      maxResponseBytes: 1_048_576,
      targets: [{
        pairKey,
        countyFips,
        speciesId: "cytisus-scoparius",
        scientificName: "Cytisus scoparius",
        objectIds: [3],
      }],
      candidatePairs: [pairKey],
    },
  };
}

async function runWithBody(context: SourceAdapterContext, body: string) {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await runUsfsCurrentPlantsTargeted(context);
    assert.equal(requests, 2);
    return result;
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  const accepted = await runWithBody(
    contextFor("41017"),
    responseBody(3, "Cytisus scoparius", center[0], center[1]),
  );
  assert.equal(accepted.assertions.length, 1);
  assert.equal(accepted.reviews.length, 1);
  assert.equal(accepted.rejections.length, 0);
  assert.equal(accepted.outcomes.length, 1);
  assert.equal(accepted.outcomes[0].status, "evidence-found");
  assert.equal(accepted.outcomes[0].scope_complete, true);
  assert.equal(accepted.assertions[0].claim_type, "recorded-present");
  assert.equal(accepted.assertions[0].scope, "point");
  assert.equal(accepted.artifacts.length, 2);
  assert.equal(accepted.upstreamRequests.length, 2);

  const rejected = await runWithBody(
    contextFor("41017"),
    responseBody(3, "Cytisus scoparius", -70, 40),
  );
  assert.equal(rejected.assertions.length, 0);
  assert.equal(rejected.reviews.length, 0);
  assert.equal(rejected.rejections.length, 1);
  assert.equal(rejected.rejections[0].reason_code, "geography-ambiguous");
  assert.equal(rejected.outcomes[0].status, "no-qualifying-evidence");
  assert.equal(rejected.outcomes[0].scope_complete, true);
  assert.match(rejected.outcomes[0].notes.join(" "), /not verified absence/u);

  process.stdout.write("USFS Current Invasive Plant Locations targeted adapter tests passed.\n");
}

main();
