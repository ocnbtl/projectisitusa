import assert from "node:assert/strict";

import {
  APHIS_SOURCE_ID,
  type AphisFeature,
  type AphisProgramMapping,
  replayNationalAphisState,
} from "./research/national-aphis-federal-quarantine";
import { stableJson } from "@/lib/research/run-files";

const completedAt = "2026-08-15T03:30:00.000Z";
const mapping: AphisProgramMapping = {
  sourceProgram: "Imported Fire Ant",
  speciesId: "solenopsis-invicta",
  scientificName: "Solenopsis invicta",
};
const requestedPairs = [
  {
    countyFips: "10001",
    countyName: "Kent",
    countyLegalName: "Kent County",
    stateCode: "DE",
    stateName: "Delaware",
    speciesId: mapping.speciesId,
    scientificName: mapping.scientificName,
  },
  {
    countyFips: "10003",
    countyName: "New Castle",
    countyLegalName: "New Castle County",
    stateCode: "DE",
    stateName: "Delaware",
    speciesId: mapping.speciesId,
    scientificName: mapping.scientificName,
  },
];

function feature(objectId: number, status: string, county: string, fips: string): AphisFeature {
  return {
    attributes: {
      OBJECTID: objectId,
      Quarantine_State: "Delaware",
      Quarantine_State_Abbr: "DE",
      Quarantine_County: county,
      Quarantine_Program: mapping.sourceProgram,
      Quarantine_Status: status,
      Quarantine_Unit: "County",
      Quarantine_Name: county,
      Quarantine_Statewide: "No",
      Quarantine_Statewide_Date: null,
      Quarantine_Established_Date: 1722470400000,
      Quarantine_Modified_Date: 1754006400000,
      Quarantine_Removed_Date: null,
      Quarantine_Reg_Doc: "Federal order",
      Quarantine_Reg_Doc_Link: "https://www.aphis.usda.gov/plant-pests-diseases/imported-fire-ants",
      Quarantine_Program_Link: null,
      Quarantine_Additional_Link: null,
      Quarantine_County_FIPS: fips,
    },
  };
}

const features = [
  feature(3, "Active Federal Quarantine", "Kent", "10001"),
  feature(2, "Pending Federal Quarantine", "Kent", "10001"),
  feature(1, "Active Federal Quarantine", "Sussex", "10001"),
];
const context = {
  runId: "20260815T033000Z__aphis-federal-quarantine__test",
  sourceId: APHIS_SOURCE_ID,
  stateCode: "DE",
  requestedPairs,
  runStartedAt: completedAt,
  parameters: {},
};
const first = replayNationalAphisState({
  context,
  requestedPairs,
  features,
  mappings: [mapping],
  acceptedStatuses: ["Active Federal Quarantine"],
  completedAt,
});
const second = replayNationalAphisState({
  context,
  requestedPairs,
  features: [...features].reverse(),
  mappings: [mapping],
  acceptedStatuses: ["Active Federal Quarantine"],
  completedAt,
});

assert.equal(first.candidateRecordCount, 3);
assert.equal(first.assertions.length, 1);
assert.equal(first.reviews.length, 1);
assert.equal(first.rejections.length, 2);
assert.equal(first.outcomes.length, 2);
assert.deepEqual(first.outcomes.map((outcome) => outcome.status), ["evidence-found", "no-qualifying-evidence"]);
assert(first.outcomes.every((outcome) => outcome.scope_complete));
assert(first.assertions.every((assertion) => assertion.claim_type === "recorded-present"));
assert(!JSON.stringify(first.assertions).includes('"claim_type":"officially-absent"'));
assert(!JSON.stringify(first.assertions).includes('"claim_type":"not-detected"'));
assert.equal(stableJson(first), stableJson(second));

console.log(JSON.stringify({
  ok: true,
  candidates: first.candidateRecordCount,
  assertions: first.assertions.length,
  rejections: first.rejections.length,
  outcomes: first.outcomes.length,
  deterministicReplay: true,
  supportsVerifiedAbsence: false,
  supportsNotDetected: false,
}));
