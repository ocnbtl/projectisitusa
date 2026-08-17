import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { stableJson } from "@/lib/research/run-files";
import {
  type NrcsDistributionRow,
  type NationalNrcsPlan,
  type NrcsRequestedPair,
  type NrcsTaxonMapping,
  replayNationalNrcsState,
} from "./research/national-usda-nrcs-plants";
import {
  ProviderStartRateLimiter,
  RestartRequiredAcquisitionError,
  acquisitionFailureIsRetryable,
  assertPartialAcquisitionResumeAllowed,
  expectedProviderRequestCount,
  parseNrcsDistributionCsv,
  parseNrcsStatusFingerprint,
  requestIntervalMilliseconds,
  validateNrcsProfile,
} from "./research/run-national-usda-nrcs-plants";

assert.equal(requestIntervalMilliseconds(1), 1000);
assert.equal(requestIntervalMilliseconds(2), 500);
assert.equal(requestIntervalMilliseconds(3), 334);
assert.throws(() => requestIntervalMilliseconds(0), /positive finite/u);
assert.equal(acquisitionFailureIsRetryable(new Error("transport")), true);
assert.equal(acquisitionFailureIsRetryable(new RestartRequiredAcquisitionError("status drift")), false);
assert.doesNotThrow(() => assertPartialAcquisitionResumeAllowed(null));
assert.doesNotThrow(() => assertPartialAcquisitionResumeAllowed({ retryable: true }));
assert.throws(() => assertPartialAcquisitionResumeAllowed({ retryable: false }), /new --started-at/u);
async function testProviderStartRateLimiter() {
  let fakeNow = 0;
  const rateLimitWaits: number[] = [];
  const limiter = new ProviderStartRateLimiter(
    1000,
    () => fakeNow,
    async (milliseconds) => {
      rateLimitWaits.push(milliseconds);
      fakeNow += milliseconds;
    },
  );
  await limiter.waitForSlot();
  await limiter.waitForSlot();
  fakeNow += 250;
  await limiter.waitForSlot();
  assert.deepEqual(rateLimitWaits, [1000, 750]);
}

const plan = JSON.parse(readFileSync(
  "src/data/research/national-acquisition-plans/usda-nrcs-plants-national-v1-tranche-01.json",
  "utf8",
)) as NationalNrcsPlan;
const scalePlan = JSON.parse(readFileSync(
  "src/data/research/national-acquisition-plans/usda-nrcs-plants-national-v1-tranche-05.json",
  "utf8",
)) as NationalNrcsPlan;
assert.equal(scalePlan.taxonMappings.length, 80);
assert.equal(expectedProviderRequestCount(scalePlan), 165);
const scaleStatusFingerprint = parseNrcsStatusFingerprint(Buffer.from(JSON.stringify({
  features: scalePlan.taxonMappings.map((entry) => ({
    attributes: {
      plant_master_id: entry.plantMasterId,
      Symbol: "Introduced",
      plant_nativity_id: "3",
      row_count: 1,
    },
  })),
})), scalePlan);
assert.equal(scaleStatusFingerprint.length, 80);
const statusFeatures = plan.taxonMappings.map((entry) => ({
  attributes: {
    plant_master_id: entry.plantMasterId,
    Symbol: "Introduced",
    plant_nativity_id: "3",
    row_count: 1,
  },
}));
const statusFingerprint = parseNrcsStatusFingerprint(
  Buffer.from(JSON.stringify({ features: statusFeatures })),
  plan,
);
assert.equal(statusFingerprint.length, 40);
assert.ok(statusFingerprint.every((entry) =>
  entry.establishmentMeans === "Introduced" && entry.establishmentStatusId === "3"
));
const misleadingAliasDrift = structuredClone(statusFeatures);
misleadingAliasDrift[0]!.attributes.Symbol = plan.taxonMappings[0]!.symbol;
assert.throws(
  () => parseNrcsStatusFingerprint(Buffer.from(JSON.stringify({ features: misleadingAliasDrift })), plan),
  /disallowed establishment means/u,
);

const mapping: NrcsTaxonMapping = {
  plantMasterId: 31170,
  symbol: "ACAU2",
  speciesId: "acanthospermum-australe",
  scientificName: "Acanthospermum australe",
};
validateNrcsProfile({
  Id: 31170,
  AcceptedId: 31170,
  Symbol: "ACAU2",
  ScientificName: "<i>Acanthospermum australe</i>",
  NativeStatuses: [{ Region: "L48", Status: "I", Type: "Introduced" }],
}, mapping);
validateNrcsProfile({
  Id: 51199,
  AcceptedId: 51199,
  Symbol: "MAPU7",
  ScientificName: "<i>Mazus pumilus</i> (Burm. f.) Steenis",
  NativeStatuses: [{ Region: "L48", Status: "I", Type: "Introduced" }],
}, {
  plantMasterId: 51199,
  symbol: "MAPU7",
  speciesId: "mazus-pumilus",
  scientificName: "Mazus pumilus",
});
validateNrcsProfile({
  Id: 75035,
  AcceptedId: 75035,
  Symbol: "EUFOR2",
  ScientificName: "<i>Euonymus fortunei</i> (Turcz.) Hand.-Maz. var. <i>radicans</i> (Siebold ex Miq.) Rehder",
  NativeStatuses: [{ Region: "L48", Status: "I", Type: "Introduced" }],
}, {
  plantMasterId: 75035,
  symbol: "EUFOR2",
  speciesId: "euonymus-fortunei-var-radicans",
  scientificName: "Euonymus fortunei var. radicans",
});
assert.throws(() => validateNrcsProfile({
  Id: 31170,
  AcceptedId: 31170,
  Symbol: "ACAU2",
  ScientificName: "<i>Acanthospermum australe</i>",
  NativeStatuses: [{ Region: "L48", Status: "N", Type: "Native" }],
}, mapping), /lacks L48 Introduced status/u);
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
testProviderStartRateLimiter()
  .then(() => console.log(JSON.stringify({
    ok: true,
    assertions: first.assertions.length,
    rejections: first.rejections.length,
    outcomes: first.outcomes.length,
    deterministic: true,
    layer6AliasSemantics: true,
    profileStatusSemantics: true,
    profileAuthorshipRankSemantics: true,
    providerRateLimitSemantics: true,
    stableWindowRestartSemantics: true,
  }, null, 2)))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
