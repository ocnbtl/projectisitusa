import { gunzipSync } from "node:zlib";

import sourceRegistry from "@/data/research/source-registry.json";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import {
  INATURALIST_GBIF_DATASET_KEY,
  inaturalistGbifResearchGradeAdapter,
  occurrenceRejection,
  supportingPayload,
  type GbifOccurrenceRecord,
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
  basisOfRecord: "HUMAN_OBSERVATION" as const,
  occurrenceStatus: "PRESENT" as const,
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

async function runWith(records: unknown[], runId: string, parameterOverrides: Record<string, unknown> = {}) {
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
    return { urls, result: await inaturalistGbifResearchGradeAdapter.run({ ...context, runId, parameters: { ...parameters, ...parameterOverrides } }) };
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

  const testPair = {
    countyFips: "01001", countyName: "Autauga", countyLegalName: "Autauga County",
    stateCode: "AL", stateName: "Alabama", sourceStateName: "Alabama",
    speciesId: "example-species", scientificName: "Example species",
  };
  const testMatch = { speciesKey: 123, canonicalName: "Example species", confidence: 100 };
  const safePlaces = ["Garden City", "Garden County", "Smithsonian National Zoo", "botanical garden", "greenhouse", "nursery", "arboretum", "campus landscape", "landscaped", "aquarium"];
  for (const locality of safePlaces) {
    const candidate = occurrence(4001, "Autauga", { locality });
    assert(occurrenceRejection(candidate, testPair, testMatch, parameters) === null, "A place or habitat alone incorrectly overrode explicit wild status: " + locality);
    assert(occurrenceRejection({ ...candidate, "http://unknown.org/captive_cultivated": "captive" }, testPair, testMatch, parameters)?.reason === "cultivated-or-captive", "A place name bypassed explicit captive status.");
    assert(occurrenceRejection({ ...candidate, "http://unknown.org/captive_cultivated": undefined }, testPair, testMatch, parameters)?.reason === "cultivated-or-captive", "Missing wild status was accepted.");
  }
  const managed = occurrence(4002, "Autauga", { occurrenceRemarks: "Managed to get me." });
  assert(occurrenceRejection(managed, testPair, testMatch, parameters) === null, "A verb in mosquito remarks became cultivation evidence.");
  for (const field of ["locality", "verbatimLocality", "occurrenceRemarks", "habitat", "establishmentMeans", "degreeOfEstablishment", "preparations"]) {
    for (const term of ["captive", "captivity", "cultivated", "cultivation", "cultured", "planted", "planting"]) {
      assert(occurrenceRejection(occurrence(4003, "Autauga", { [field]: term }), testPair, testMatch, parameters)?.reason === "cultivated-or-captive", "Explicit organism-status conflict escaped review: " + field + "/" + term);
    }
  }
  // Negations and references to another captive organism need a separately reviewed interpretation.
  assert(occurrenceRejection(occurrence(4004, "Autauga", { occurrenceRemarks: "Wild lizard in captive bird environment" }), testPair, testMatch, parameters)?.reason === "cultivated-or-captive", "Ambiguous narrative interpretation was silently admitted.");
  const newPayload = supportingPayload(managed as GbifOccurrenceRecord, testPair, testMatch);
  assert(newPayload.organismContext.occurrenceRemarks === "Managed to get me.", "The decision context was omitted from the normalized witness.");
  const licensed = await runWith([
    occurrence(5001, "Autauga", { license: parameters.allowedLicenses[2], locality: "Garden City" }),
    occurrence(5002, "Baldwin", { locality: "Garden City", recordedBy: ["Fixture observer"] }),
  ], "synthetic-inaturalist-license-subset", { allowedLicenses: [parameters.allowedLicenses[0], parameters.allowedLicenses[1]] });
  assert(licensed.result.assertions.length === 1 && licensed.result.assertions[0].county_fips === "01003", "The adapter expanded the explicitly selected license subset.");
  assert(licensed.result.assertions[0].notes.some(note => note.includes("Fixture observer")), "Observer attribution was lost.");
  assert(licensed.result.assertions[0].notes.some(note => note.includes("Observation metadata license:")), "Metadata license attribution was lost.");
  assert(licensed.result.assertions[0].claim_type === "recorded-present", "Context recovery changed the biological question.");
  for (const allowedLicenses of [[], [parameters.allowedLicenses[0], parameters.allowedLicenses[0]], ["https://example.invalid/unlicensed"]]) {
    let rejectedLicenseContract = false;
    try { await runWith([], "synthetic-inaturalist-invalid-license-set", { allowedLicenses }); }
    catch { rejectedLicenseContract = true; }
    assert(rejectedLicenseContract, "An empty, duplicate or unregistered license set was accepted.");
  }

  process.stdout.write("iNaturalist weekly-GBIF Research Grade adapter tests passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
