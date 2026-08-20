import assert from "node:assert/strict";

import {
  APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL,
  APHIS_HONEY_BEE_SOURCE_ID,
  aphisHoneyBeeSurveyAdapter,
  extractAphisHoneyBeeDownloadUrl,
  parseAphisHoneyBeeCsv,
  replayAphisHoneyBeeSurvey,
} from "./research/adapters/aphis-honey-bee-survey";

import type { SourceAdapterContext } from "@/lib/research/source-adapter";

const GENERATED_HEADER =
  "File generated from usbeedata.org database on 2026-06-05 13:15:49.160078+00:00";
const COVERAGE_HEADER = '"Includes data with a collection date up to Dec 31, 2025"';
const CSV = `${GENERATED_HEADER}\n${COVERAGE_HEADER}\n` +
  "sample_year,sample_month_number,sample_month,state_code,sampling_county_from_gps,varroa_per_100_bees,million_spores_per_bee,abpv,amsv1,cbpv,dwv,dwv-b,iapv,kbv,lsv2,sbpv,mkv,nosema_ceranae,pesticides\n" +
  "2025,5,May,AL,Clarke,0.0,,,,,,,,,,,,,\n" +
  "2016,4,April,AL,Sumter,0.0,,,,,,,,,,,,,\n";

const expectedSurveyRows = [
  {
    countyFips: "01025",
    countyName: "Clarke",
    sampleYear: 2025,
    sampleMonth: 5,
    sampleMonthName: "May",
    varroaPer100Bees: 0 as const,
  },
];

const context: SourceAdapterContext = {
  runId: "20260820T012500Z__aphis-honey-bee__test",
  sourceId: APHIS_HONEY_BEE_SOURCE_ID,
  stateCode: "AL",
  requestedPairs: [
    {
      countyFips: "01025",
      countyName: "Clarke",
      speciesId: "varroa-destructor",
      scientificName: "Varroa destructor",
    },
  ],
  runStartedAt: "2026-08-20T01:25:00.000Z",
  parameters: {},
};

async function main() {

assert.equal(
  extractAphisHoneyBeeDownloadUrl(
    '<a href="https://example.test/UploadCSVFile_public.csv?sig=a&amp;b=c">Download</a>',
  ),
  "https://example.test/UploadCSVFile_public.csv?sig=a&b=c",
);

const parsed = parseAphisHoneyBeeCsv(CSV);
assert.equal(parsed.generatedHeader, GENERATED_HEADER);
assert.equal(parsed.coverageHeader, COVERAGE_HEADER);
assert.equal(parsed.rows.length, 2);

const replay = replayAphisHoneyBeeSurvey({
  context,
  rows: parsed.rows,
  expectedSurveyRows,
  completedAt: "2026-08-20T01:25:03.000Z",
});
assert.equal(replay.assertions.length, 1);
assert.equal(replay.reviews.length, 1);
assert.equal(replay.outcomes.length, 1);
assert.equal(replay.outcomes[0]?.status, "evidence-found");
assert.equal(replay.assertions[0]?.claim_type, "not-detected");
assert.equal(replay.assertions[0]?.evidence_kind, "survey-non-detection");
assert.equal(replay.assertions[0]?.scope, "survey-area");
assert.equal(replay.assertions[0]?.source_record_date, "2025-05");
assert.equal(replay.assertions[0]?.geography_match.source_county, "Clarke");
assert.match(replay.assertions[0]?.geography_match.method ?? "", /explicit source county/iu);
assert.doesNotMatch(replay.assertions[0]?.geography_match.method ?? "", /coordinate/iu);
assert.match(replay.assertions[0]?.survey_scope ?? "", /target/iu);
assert.match(replay.assertions[0]?.survey_scope ?? "", /program/iu);
assert.match(replay.assertions[0]?.survey_scope ?? "", /sample/iu);
assert.match(replay.assertions[0]?.survey_scope ?? "", /effort/iu);
assert.match(replay.assertions[0]?.survey_scope ?? "", /zero/iu);
assert.match(replay.assertions[0]?.survey_scope ?? "", /negative/iu);
assert.match(replay.assertions[0]?.spatial_scope ?? "", /not countywide absence/iu);

assert.throws(
  () =>
    replayAphisHoneyBeeSurvey({
      context,
      rows: parsed.rows.map((row) =>
        row.sampling_county_from_gps === "Clarke"
          ? { ...row, varroa_per_100_bees: "1.0" }
          : row,
      ),
      expectedSurveyRows,
      completedAt: "2026-08-20T01:25:03.000Z",
    }),
  /frozen expected survey rows/iu,
);

assert.throws(
  () =>
    replayAphisHoneyBeeSurvey({
      context,
      rows: [
        ...parsed.rows,
        {
          sample_year: "2025",
          sample_month_number: "6",
          sample_month: "June",
          state_code: "AL",
          sampling_county_from_gps: "Clarke",
          varroa_per_100_bees: "1.0",
        },
      ],
      expectedSurveyRows,
      completedAt: "2026-08-20T01:25:03.000Z",
    }),
  /unexpected positive Varroa result/iu,
);

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url === APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL) {
      return new Response(
        '<a href="https://example.test/UploadCSVFile_public.csv?temporary=token">Download</a>',
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }
    if (url.startsWith("https://example.test/UploadCSVFile_public.csv")) {
      return new Response(CSV, { status: 200, headers: { "content-type": "text/csv" } });
    }
    throw new Error(`Unexpected test URL ${url}`);
  };
  const acquired = await aphisHoneyBeeSurveyAdapter.run({
    ...context,
    parameters: {
      stateCode: "AL",
      candidateLimit: 1,
      candidatePairs: ["01025:varroa-destructor"],
      downloadPageUrl: APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL,
      generatedHeaderExact: GENERATED_HEADER,
      coverageHeaderExact: COVERAGE_HEADER,
      surveyDateRange: { start: "2025-05-01", end: "2025-05-31" },
      metricColumn: "varroa_per_100_bees",
      targetSpeciesId: "varroa-destructor",
      targetScientificName: "Varroa destructor",
      zeroValue: 0,
      expectedSurveyRows,
      maxCsvBytes: 5_242_880,
    },
  });
  assert.equal(acquired.upstreamRequests.length, 2);
  assert.equal(acquired.upstreamRequests[1]?.url.includes("temporary=token"), false);
  assert.equal(acquired.artifacts.some((artifact) => artifact.filename.endsWith(".csv.gz")), true);
  const metadata = acquired.artifacts.find((artifact) => artifact.filename.endsWith("metadata.json"));
  assert.equal(String(metadata?.contents).includes("temporary=token"), false);
  assert.equal(acquired.assertions.length, 1);
} finally {
  globalThis.fetch = originalFetch;
}

  process.stdout.write("APHIS Honey Bee explicit-survey adapter tests passed.\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
