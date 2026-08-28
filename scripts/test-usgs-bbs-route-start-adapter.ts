import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { geoCentroid, geoContains } from "d3-geo";
import { feature } from "topojson-client";

import countyTopology from "@/data/source/county-equivalents-topology.json";
import {
  USGS_BBS_ROUTE_START_GEOGRAPHY_METHOD,
  USGS_BBS_ROUTE_START_TOPOLOGY_PATH,
} from "@/lib/research/coordinate-geography-contract";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import { runUsGsBbsRouteStart } from "./research/adapters/usgs-bbs-route-start";

function md5(value: Buffer) {
  return createHash("md5").update(value).digest("hex");
}

function fixtureFiles(stop1Count: number, countyFips: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "isitusa-bbs-fixture-"));
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: Array<{ id: string | number }> } };
  };
  const collection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  const index = topology.objects.counties.geometries.findIndex(
    (entry) => String(entry.id).padStart(5, "0") === countyFips,
  );
  assert(index >= 0, `Fixture topology is missing county ${countyFips}.`);
  const county = collection.features[index]!;
  const [longitude, latitude] = geoCentroid(county);
  assert(geoContains(county, [longitude, latitude]));

  const routes = Buffer.from(
    `CountryNum,StateNum,Route,RouteName,Active,Latitude,Longitude,Stratum,BCR,RouteTypeID,RouteTypeDetailID\n840,83,001,FIXTURE,1,${latitude},${longitude},1,1,1,1\n`,
  );
  const weather = Buffer.from(
    "RouteDataID,CountryNum,StateNum,Route,RPID,Year,Month,Day,ObsN,TotalSpp,StartTemp,EndTemp,TempScale,StartWind,EndWind,StartSky,EndSky,StartTime,EndTime,Assistant,QualityCurrentID,RunType\nfixture-run,840,83,001,1,2025,6,1,1,1,1,1,C,1,1,1,1,0500,0900,0,1,1\n",
  );
  const species = Buffer.from(
    "Seq,AOU,English_Common_Name,French_Common_Name,Order,Family,Genus,Species\n1,06882,House Sparrow,,Passeriformes,Passeridae,Passer,domesticus\n",
  );
  const fifty =
    "RouteDataID,CountryNum,StateNum,Route,RPID,Year,AOU,Stop1,Stop2\n" +
    `fixture-run,840,83,001,1,2025,06882,${stop1Count},0\n`;
  writeFileSync(path.join(directory, "Fifty1.csv"), fifty);
  const zipPath = path.join(directory, "50-StopData.zip");
  execFileSync("tar", ["-a", "-c", "-f", zipPath, "-C", directory, "Fifty1.csv"]);
  const zip = readFileSync(zipPath);
  return { directory, routes, weather, species, zip };
}

async function runFixture(
  stop1Count: number,
  stateCode = "TX",
  countyFips = "48001",
  countyName = "Anderson",
) {
  const files = fixtureFiles(stop1Count, countyFips);
  const citation = "Fixture USGS BBS citation.";
  const fileEntries = [
    { name: "Routes.csv" as const, buffer: files.routes },
    { name: "Weather.csv" as const, buffer: files.weather },
    { name: "50-StopData.zip" as const, buffer: files.zip },
    { name: "SpeciesList.csv" as const, buffer: files.species },
  ];
  const fileUrl = (name: string) => `https://example.test/${encodeURIComponent(name)}`;
  const item = {
    id: "6a0b0b0ab66b0188da36aedd",
    title: "Fixture 2026 BBS release",
    citation,
    files: fileEntries.map(({ name, buffer }) => ({
      name,
      size: buffer.length,
      downloadUri: fileUrl(name),
      checksum: { type: "MD5", value: md5(buffer) },
    })),
  };
  const itemUrl = "https://example.test/item";
  const responses = new Map<string, Buffer>([
    [`${itemUrl}?format=json`, Buffer.from(JSON.stringify(item))],
    ...fileEntries.map(({ name, buffer }) => [fileUrl(name), buffer] as const),
  ]);
  const requested: SourceAdapterContext["requestedPairs"][number] = {
    countyFips,
    countyName,
    speciesId: "passer-domesticus",
    scientificName: "Passer domesticus",
  };
  const context: SourceAdapterContext = {
    runId: "20260828T040000Z__usgs-bbs__fixture",
    sourceId: "usgs-bbs",
    stateCode,
    requestedPairs: [requested],
    runStartedAt: "2026-08-28T04:00:00.000Z",
    parameters: {
      stateCode,
      mode: "hash-pinned-standard-stop1-positive",
      scienceBaseItemId: item.id,
      scienceBaseItemUrl: itemUrl,
      rawDataPageUrl: "https://example.test/raw",
      releaseTitle: item.title,
      citation,
      releaseYearRange: { start: 1966, end: 2025 },
      minimumRequestIntervalMs: 0,
      maxResponseBytes: 1_000_000,
      filters: {
        countryNum: "840",
        runType: "1",
        stop: "Stop1",
        minimumStopCount: 1,
        geography: "fixture exact route-start county",
      },
      files: fileEntries.map(({ name, buffer }) => ({
        name,
        size: buffer.length,
        md5: md5(buffer),
      })),
      exactTargets: [
        { speciesId: requested.speciesId, scientificName: requested.scientificName, aou: "06882" },
      ],
      unmatchedCatalogBirds: [],
      expectedStateAcceptedRows: 1,
      expectedStateGrossPairs: 1,
      expectedStateNetNewPairs: 1,
      nationalPreflight: {},
      candidatePairs: [`${countyFips}:passer-domesticus`],
    },
  };
  const requests: string[] = [];
  const fetchFixture: typeof fetch = async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    requests.push(url);
    const body = responses.get(url);
    const responseBody = body
      ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
      : "missing";
    return new Response(responseBody, { status: body ? 200 : 404 });
  };
  try {
    const result = await runUsGsBbsRouteStart(context, fetchFixture);
    return { result, requests };
  } finally {
    rmSync(files.directory, { recursive: true, force: true });
  }
}

async function main() {
  const { result, requests } = await runFixture(2);
  assert.equal(requests.length, 5);
  assert.equal(result.candidateRecordCount, 1);
  assert.equal(result.assertions.length, 1);
  assert.equal(result.reviews.length, 1);
  assert.equal(result.rejections.length, 0);
  assert.equal(result.outcomes.length, 1);
  assert.equal(result.assertions[0]!.claim_type, "recorded-present");
  assert.equal(result.assertions[0]!.evidence_kind, "survey-detection");
  assert.equal(result.assertions[0]!.scope, "point");
  assert.equal(
    result.assertions[0]!.geography_match.method,
    USGS_BBS_ROUTE_START_GEOGRAPHY_METHOD,
  );
  assert.equal(
    result.assertions[0]!.geography_match.topology_path,
    USGS_BBS_ROUTE_START_TOPOLOGY_PATH,
  );
  assert.match(
    result.assertions[0]!.geography_match.topology_sha256 ?? "",
    /^[a-f0-9]{64}$/u,
  );
  assert.equal(result.outcomes[0]!.status, "evidence-found");
  assert.equal(result.outcomes[0]!.scope_complete, true);
  assert.equal(result.artifacts.length, 2);
  assert.equal(result.artifacts[1]!.filename, "tx-standard-stop1-detections.json");
  const illinois = await runFixture(2, "IL", "17001", "Adams");
  assert.equal(illinois.result.assertions.length, 1);
  assert.equal(illinois.result.assertions[0]!.state_code, "IL");
  assert.equal(illinois.result.assertions[0]!.county_fips, "17001");
  assert.equal(illinois.result.artifacts[1]!.filename, "il-standard-stop1-detections.json");
  await assert.rejects(() => runFixture(0), /reconciliation changed/u);
  process.stdout.write("USGS BBS route-start adapter tests passed.\n");
}

void main();
