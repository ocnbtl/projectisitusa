import assert from "node:assert/strict";

import { stableJson } from "@/lib/research/run-files";
import {
  type NrcsDistributionRow,
  type NrcsRequestedPair,
  type NrcsTaxonMapping,
  replayNationalNrcsState,
} from "./research/national-usda-nrcs-plants";
import { parseNrcsDistributionCsv } from "./research/run-national-usda-nrcs-plants";

const mapping: NrcsTaxonMapping = {
  plantMasterId: 31170,
  symbol: "ACAU2",
  speciesId: "acanthospermum-australe",
  scientificName: "Acanthospermum australe",
};
const csv = Buffer.from([
  "Distribution Data",
  "Symbol,Country,State,State FIP,County,County FIP",
  "ACAU2,United States,Alabama,01,Autauga,001",
  "ACAU2,United States,Alabama,01,,",
  "ACAU2,Canada,Ontario,35,,",
  "",
].join("\r\n"));
const parsed = parseNrcsDistributionCsv(csv, mapping);
assert.equal(parsed.length, 3);
assert.equal(parsed[0]?.countyFips, "001");
assert.equal(parsed[1]?.countyFips, "");

const requestedPairs: NrcsRequestedPair[] = [
  {
    countyFips: "01001",
    countyName: "Autauga",
    countyLegalName: "Autauga County",
    stateCode: "AL",
    stateName: "Alabama",
    stateFips: "01",
    speciesId: mapping.speciesId,
    scientificName: mapping.scientificName,
  },
  {
    countyFips: "01003",
    countyName: "Baldwin",
    countyLegalName: "Baldwin County",
    stateCode: "AL",
    stateName: "Alabama",
    stateFips: "01",
    speciesId: mapping.speciesId,
    scientificName: mapping.scientificName,
  },
];
const rows: NrcsDistributionRow[] = [
  parsed[0]!,
  { ...parsed[0]!, sourceRowNumber: 4 },
  {
    symbol: "ACAU2",
    country: "United States",
    state: "Alabama",
    stateFips: "01",
    county: "Wrong County",
    countyFips: "003",
    sourceRowNumber: 5,
    plantMasterId: 31170,
  },
  parsed[1]!,
  parsed[2]!,
];
const context = {
  runId: "20260815T120000Z__usda-nrcs-plants__test",
  sourceId: "usda-nrcs-plants",
  stateCode: "AL",
  requestedPairs,
  runStartedAt: "2026-08-15T12:00:00.000Z",
  parameters: {},
};
const first = replayNationalNrcsState({
  context,
  requestedPairs,
  rows,
  mappings: [mapping],
  completedAt: "2026-08-15T12:01:00.000Z",
});
const second = replayNationalNrcsState({
  context,
  requestedPairs,
  rows,
  mappings: [mapping],
  completedAt: "2026-08-15T12:01:00.000Z",
});
assert.equal(stableJson(first), stableJson(second));
assert.equal(first.assertions.length, 1);
assert.equal(first.reviews.length, 1);
assert.equal(first.rejections.length, 2);
assert.equal(first.outcomes.length, 2);
assert.equal(first.outcomes.filter((entry) => entry.status === "evidence-found").length, 1);
assert.equal(first.outcomes.filter((entry) => entry.status === "no-qualifying-evidence").length, 1);
assert.equal(first.reconciliation.state_only_rows, 1);
assert.equal(first.reconciliation.foreign_rows, 1);
assert.equal(first.reconciliation.duplicate_rows, 1);
assert.equal(first.reconciliation.county_name_mismatch_rows, 1);
assert.ok(first.outcomes.every((entry) => entry.scope_complete));
assert.ok(first.outcomes.every((entry) => entry.notes.every((note) => !/absence established|not detected established/iu.test(note))));
console.log(JSON.stringify({
  ok: true,
  assertions: first.assertions.length,
  rejections: first.rejections.length,
  outcomes: first.outcomes.length,
  deterministic: true,
}, null, 2));
