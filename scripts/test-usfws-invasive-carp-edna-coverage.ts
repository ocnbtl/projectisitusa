import assert from "node:assert/strict";

import {
  buildUsfwsCoverage,
  chunkStableObjectIds,
  normalizeUsfwsState,
  selectUsfwsAcceptedSamples,
  USFWS_EDNA_ITEM_ID,
  validateUsfwsLayerContract,
  type PairStatus,
  type ResolvedCounty,
  type UsfwsEdnaRow,
} from "./research/usfws-invasive-carp-edna-coverage";

function row(overrides: Partial<UsfwsEdnaRow> = {}): UsfwsEdnaRow {
  return {
    OBJECTID: 1,
    RUID: 26001001,
    FWCO_ID: "LAX",
    State: "Wisconsin",
    Basin: "UMR",
    Waterbody: "Mississippi River",
    DATE_COLL: Date.parse("2026-05-01T00:00:00.000Z"),
    Latitude: 43.8,
    Longitude: -91.2,
    Double_Sample: "No",
    Blank: "No",
    GlobalID: "global-1",
    COMMENTS: "",
    eDNA_Detection_Status: "No eDNA detected",
    Case_Number: 26001,
    altLocationName: "Test station",
    ...overrides,
  };
}

const county: ResolvedCounty = {
  stateCode: "WI",
  countyFips: "55063",
  countyName: "La Crosse",
};

function pairStatus(
  speciesId: string,
  overrides: Partial<PairStatus> = {},
): PairStatus {
  return {
    stateCode: "WI",
    countyFips: "55063",
    speciesId,
    displayStatus: "not-researched",
    determinationStatus: "none",
    surveyStatus: "unassessed",
    researchStatus: "not-started",
    evidenceCount: 0,
    ...overrides,
  };
}

function main() {
  assert.equal(normalizeUsfwsState("WI"), "WI");
  assert.equal(normalizeUsfwsState("Wisconsin"), "WI");
  assert.equal(normalizeUsfwsState("No State"), null);

  assert.deepEqual(chunkStableObjectIds([4, 2, 3, 1], 2), [[1, 2], [3, 4]]);
  assert.throws(() => chunkStableObjectIds([1, 1], 2), /duplicates/u);
  const contract = validateUsfwsLayerContract({
    serviceItemId: USFWS_EDNA_ITEM_ID,
    name: "All_eDNA_Sample_Point_Data",
    objectIdField: "OBJECTID",
    maxRecordCount: 1_000,
    fields: [
      "OBJECTID",
      "RUID",
      "FWCO_ID",
      "State",
      "Basin",
      "Waterbody",
      "DATE_COLL",
      "Latitude",
      "Longitude",
      "Double_Sample",
      "Blank",
      "GlobalID",
      "COMMENTS",
      "eDNA_Detection_Status",
      "Case_Number",
      "altLocationName",
    ].map((name) => ({ name })),
    drawingInfo: {
      renderer: {
        field1: "eDNA_Detection_Status",
        uniqueValueInfos: [
          { value: "Both Bighead and Silver carp eDNA detected" },
          { value: "Silver carp eDNA only detected" },
          { value: "Bighead carp eDNA only detected" },
          { value: "IC carp eDNA only detected" },
          { value: "No eDNA detected" },
          { value: "No detection data" },
        ],
      },
    },
  }, {
    id: USFWS_EDNA_ITEM_ID,
    owner: "jeena_koenig@fws.gov_fws",
    title: "FWS Bighead and Silver Carp eDNA",
    type: "Feature Service",
    access: "public",
    snippet: "Reportable Silver Carp and Bighead Carp data from 2013 to present.",
    licenseInfo: "The genetic markers used to detect Invasive carp eDNA changed in 2014. In 2015, the detection methods used changed from conventional PCR (cPCR) to quantitative PCR (qPCR).",
  });
  assert.equal(contract.passed, true);
  assert.deepEqual(contract.targetSpeciesIds, [
    "hypophthalmichthys-nobilis",
    "hypophthalmichthys-molitrix",
  ]);

  const statuses = new Map<string, PairStatus>([
    ["55063:hypophthalmichthys-nobilis", pairStatus("hypophthalmichthys-nobilis")],
    [
      "55063:hypophthalmichthys-molitrix",
      pairStatus("hypophthalmichthys-molitrix", {
        displayStatus: "verified-present",
        determinationStatus: "recorded-present",
        researchStatus: "reviewed-evidence-found",
        evidenceCount: 2,
      }),
    ],
  ]);
  const rows = [
    row(),
    row({ OBJECTID: 2, RUID: 26001002, GlobalID: "global-2", Double_Sample: "Yes" }),
    row({ OBJECTID: 3, RUID: 26001002, GlobalID: "global-3" }),
    row({ OBJECTID: 4, RUID: 26001004, GlobalID: "global-4", eDNA_Detection_Status: "No detection data" }),
    row({ OBJECTID: 5, RUID: 26001005, GlobalID: "global-5", eDNA_Detection_Status: "Silver carp eDNA only detected" }),
    row({ OBJECTID: 6, RUID: 26001006, GlobalID: "global-6", Blank: "Yes" }),
    row({ OBJECTID: 7, RUID: 26001007, GlobalID: "global-7", State: "No State" }),
    row({ OBJECTID: 8, RUID: 26001008, GlobalID: "global-8", Latitude: null }),
    row({ OBJECTID: 9, RUID: 26001009, GlobalID: "global-9", Longitude: -88 }),
  ];
  const resolveCounty = (longitude: number) => longitude === -88 ? [] : [county];
  const result = buildUsfwsCoverage(rows, { resolveCounty, pairStatusByKey: statuses });
  const selection = selectUsfwsAcceptedSamples(rows, resolveCounty);
  assert.equal(result.rawRows, 9);
  assert.equal(result.explicitNegativeRows, 7);
  assert.equal(result.acceptedSamples, 2);
  assert.equal(selection.accepted.length, result.acceptedSamples);
  assert.equal(selection.explicitNegativeRows, result.explicitNegativeRows);
  assert.equal(selection.duplicateRows, result.duplicateRows);
  assert.deepEqual(selection.rejectionReasons, result.rejectionReasons);
  assert.deepEqual(selection.statusCounts, result.statusCounts);
  assert.equal(result.duplicateRows, 1);
  assert.equal(result.rejectionReasons["missing-detection-data"], 1);
  assert.equal(result.rejectionReasons["non-negative-result"], 1);
  assert.equal(result.rejectionReasons["field-blank"], 1);
  assert.equal(result.rejectionReasons["invalid-state"], 1);
  assert.equal(result.rejectionReasons["invalid-coordinates"], 1);
  assert.equal(result.rejectionReasons["offshore-or-outside-current-county"], 1);
  assert.equal(result.candidatePairs, 2);
  assert.equal(result.netNewPairs, 1);
  assert.equal(result.verifiedPresentOverlaps, 1);
  assert.equal(result.groups.length, 2);
  assert(result.groups.every((entry) => entry.sampleCount === 2));
  assert(result.groups.every((entry) => entry.doubleSampleFlagRows === 1));
  const silver = result.pairs.find((entry) => entry.speciesId === "hypophthalmichthys-molitrix");
  assert.equal(silver?.classification, "verified-present-overlap");

  const replay = buildUsfwsCoverage([...rows].reverse(), { resolveCounty, pairStatusByKey: statuses });
  assert.deepEqual(replay, result);

  const ambiguous = buildUsfwsCoverage([row()], {
    resolveCounty: () => [county, { ...county, countyFips: "55081", countyName: "Monroe" }],
    pairStatusByKey: statuses,
  });
  assert.equal(ambiguous.acceptedSamples, 0);
  assert.equal(ambiguous.rejectionReasons["multiple-county-match"], 1);

  const mismatch = buildUsfwsCoverage([row()], {
    resolveCounty: () => [{ stateCode: "MN", countyFips: "27055", countyName: "Houston" }],
    pairStatusByKey: statuses,
  });
  assert.equal(mismatch.acceptedSamples, 0);
  assert.equal(mismatch.rejectionReasons["source-state-county-mismatch"], 1);

  process.stdout.write("USFWS invasive-carp eDNA coverage contract tests passed.\n");
}

main();
