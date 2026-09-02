import { gunzipSync } from "node:zlib";

import sourceRegistry from "@/data/research/source-registry.json";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import {
  INATURALIST_GBIF_DATASET_KEY,
  inaturalistGbifResearchGradeAdapter,
} from "./research/adapters/inaturalist-gbif-research-grade";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = sourceRegistry.sources.find(
  (entry) => entry.id === inaturalistGbifResearchGradeAdapter.sourceId,
);
assert(
  source?.researchAdapter?.allowedVersions.includes(inaturalistGbifResearchGradeAdapter.adapterVersion),
  "The iNaturalist weekly-GBIF adapter version is not registered.",
);

const parameters = {
  stateCode: "AL",
  stateProvince: "Alabama",
  candidateLimit: 2,
  candidatePairs: ["01001:example-species", "01003:example-species"],
  basisOfRecord: "HUMAN_OBSERVATION",
  occurrenceStatus: "PRESENT",
  minimumMatchConfidence: 95,
  pageLimit: 300,
  datasetKey: INATURALIST_GBIF_DATASET_KEY,
  expectedCrawlId: 605,
  expectedLastParsed: "2026-08-29T05:09:50.488Z",
  maximumCoordinateUncertaintyMeters: 10_000,
  allowedLicenses: [
    "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
    "http://creativecommons.org/licenses/by/4.0/legalcode",
    "http://creativecommons.org/licenses/by-nc/4.0/legalcode",
  ],
};

const context: SourceAdapterContext = {
  runId: "synthetic-inaturalist-gbif-run",
  sourceId: "inaturalist-research-grade",
  stateCode: "AL",
  requestedPairs: [
    { countyFips: "01001", countyName: "Autauga", speciesId: "example-species", scientificName: "Example species" },
    { countyFips: "01003", countyName: "Baldwin", speciesId: "example-species", scientificName: "Example species" },
  ],
  runStartedAt: "2026-09-02T12:00:00.000Z",
  parameters,
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function occurrence(
  key: number,
  county: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    key,
    gbifID: String(key),
    datasetKey: INATURALIST_GBIF_DATASET_KEY,
    occurrenceID: `https://www.inaturalist.org/observations/${key}`,
    basisOfRecord: "HUMAN_OBSERVATION",
    occurrenceStatus: "PRESENT",
    countryCode: "US",
    stateProvince: "Alabama",
    gadm: {
      level0: { gid: "USA", name: "United States" },
      level1: { gid: "USA.1_1", name: "Alabama" },
      level2: { gid: `USA.1.${key}_1`, name: county },
    },
    crawlId: 605,
    lastParsed: "2026-08-29T01:09:50.488-04:00",
    license: "http://creativecommons.org/licenses/by/4.0/legalcode",
    acceptedScientificName: "Example species",
    taxonRank: "SPECIES",
    speciesKey: 123,
    acceptedTaxonKey: 123,
    eventDate: "2026-06-01",
    hasGeospatialIssue: false,
    issues: ["COORDINATE_ROUNDED", "CONTINENT_DERIVED_FROM_COORDINATES"],
    decimalLatitude: 32.5,
    decimalLongitude: -86.5,
    coordinateUncertaintyInMeters: 25,
    "http://unknown.org/captive_cultivated": "wild",
    ...overrides,
  };
}

async function runWith(records: unknown[], runId: string) {
  const urls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: URL | RequestInfo) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/species/match")) {
      return jsonResponse({
        usageKey: 123,
        speciesKey: 123,
        matchType: "EXACT",
        confidence: 100,
        rank: "SPECIES",
        canonicalName: "Example species",
      });
    }
    return jsonResponse({
      offset: 0,
      limit: 300,
      endOfRecords: true,
      count: records.length,
      results: records,
    });
  }) as typeof fetch;
  try {
    return { urls, result: await inaturalistGbifResearchGradeAdapter.run({ ...context, runId }) };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main() {
  const accepted = await runWith(
    [occurrence(1001, "Autauga"), occurrence(1002, "Autauga"), occurrence(1003, "Baldwin")],
    "synthetic-inaturalist-gbif-accepted",
  );
  assert(accepted.urls.length === 2, "The adapter did not make one taxon and one occurrence request.");
  const occurrenceUrl = new URL(accepted.urls[1]!);
  assert(occurrenceUrl.searchParams.get("datasetKey") === INATURALIST_GBIF_DATASET_KEY, "The occurrence query was not dataset-scoped.");
  assert(occurrenceUrl.searchParams.get("hasCoordinate") === "true", "The occurrence query did not require coordinates.");
  assert(occurrenceUrl.searchParams.get("hasGeospatialIssue") === "false", "The occurrence query did not reject provider geospatial issues.");
  assert(accepted.result.assertions.length === 2, "The adapter did not collapse observations to one assertion per county-species pair.");
  assert(accepted.result.reviews.length === 2, "Accepted assertions were not machine-reviewed.");
  assert(accepted.result.assertions.every((entry) => entry.evidence_kind === "occurrence"), "The adapter emitted the wrong evidence kind.");
  assert(accepted.result.outcomes.every((entry) => entry.status === "evidence-found" && entry.scope_complete), "Accepted pair outcomes were not complete evidence-found results.");
  assert(
    accepted.result.artifacts.every((artifact) =>
      artifact.filename.endsWith(".json.gz") &&
      artifact.mediaType === "application/gzip" &&
      Buffer.isBuffer(artifact.contents) &&
      JSON.parse(gunzipSync(artifact.contents).toString("utf8")),
    ),
    "The adapter did not retain deterministic raw gzip artifacts.",
  );

  const rejected = await runWith(
    [
      occurrence(2001, "Autauga", { license: null }),
      occurrence(2002, "Baldwin", { "http://unknown.org/captive_cultivated": "captive" }),
    ],
    "synthetic-inaturalist-gbif-rejected",
  );
  assert(rejected.result.assertions.length === 0, "A non-licensed or captive observation was published.");
  assert(rejected.result.rejections.some((entry) => entry.reason_code === "record-failed"), "Missing license was not rejected.");
  assert(rejected.result.rejections.some((entry) => entry.reason_code === "cultivated-or-captive"), "Captive evidence was not rejected.");
  assert(rejected.result.outcomes.every((entry) => entry.status === "no-qualifying-evidence" && entry.scope_complete), "Rejected complete scope became a determination.");
  assert(rejected.result.assertions.every((entry) => entry.claim_type === "recorded-present"), "The adapter emitted negative evidence.");

  const drift = await runWith(
    [occurrence(3001, "Autauga", { crawlId: 606 }), occurrence(3002, "Baldwin", { coordinateUncertaintyInMeters: 20_000 })],
    "synthetic-inaturalist-gbif-drift",
  );
  assert(drift.result.assertions.length === 0, "Snapshot drift or excessive uncertainty was published.");
  assert(drift.result.rejections.some((entry) => entry.reason_code === "source-contradiction"), "Crawl drift was not rejected.");
  assert(drift.result.rejections.some((entry) => entry.reason_code === "geography-missing"), "Excessive uncertainty was not rejected.");

  process.stdout.write("iNaturalist weekly-GBIF Research Grade adapter tests passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
