import topology from "@/data/source/county-equivalents-topology.json";
import countyRegistry from "@/data/research/county-equivalent-registry.json";
import countyRegistrySchema from "@/data/research/schemas/county-equivalent-registry.schema.json";
import stateRegistrySchema from "@/data/research/schemas/state-registry.schema.json";
import stateRegistry from "@/data/research/state-registry.json";
import { z } from "zod";
import {
  assertCoordinateDerivationDisabled,
  countyEquivalentNameMatchesFips,
  getNationalV1Registry,
  getStateDefinition,
  listCountyEquivalents,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assertCoordinateDerivationDisabled();
z.fromJSONSchema(
  stateRegistrySchema as unknown as Parameters<typeof z.fromJSONSchema>[0],
).parse(stateRegistry);
z.fromJSONSchema(
  countyRegistrySchema as unknown as Parameters<typeof z.fromJSONSchema>[0],
).parse(countyRegistry);
const national = getNationalV1Registry();
assert(national.stateCount === 50, "National v1 must contain exactly 50 states.");
assert(national.federalDistrictCount === 1, "National v1 must track DC separately.");
assert(national.jurisdictionCount === 51, "National v1 must contain 51 jurisdictions.");
assert(national.countyEquivalentCount === 3144, "National v1 county-equivalent count is stale.");
assert(national.certificationOrder.slice(0, 4).join(",") === "AL,AK,AZ,AR", "Certification order is not alphabetical.");
assert(national.activeCertificationStateCode === "AL", "Alabama must remain the active certification lane.");
assert(national.activeCertificationCohort === 1, "Certification cohort 1 must remain active.");
assert(national.nextCertificationCohort === 2, "Certification cohort 2 must remain next.");
assert(national.certificationCohorts.length === 13, "Certification cohort count is stale.");
assert(
  national.certificationCohorts
    .flatMap((entry) => entry.stateCodes)
    .join(",") === national.certificationOrder.join(","),
  "Certification cohorts do not preserve the national certification order.",
);
assert(national.pilotStateCodes.join(",") === "AK,AZ,AR", "Pilot state registry changed.");

assert(getStateDefinition("AL")?.countyEquivalentCount === 67, "Alabama must have 67 counties.");
assert(listCountyEquivalents("AL").length === 67, "Alabama county registry count is stale.");
assert(listCountyEquivalents("AK").length === 30, "Alaska must have 30 active county equivalents.");
assert(listCountyEquivalents("AZ").length === 15, "Arizona must have 15 counties.");
assert(listCountyEquivalents("AR").length === 75, "Arkansas must have 75 counties.");

for (const [name, fips] of [
  ["Autauga", "01001"],
  ["Autauga County", "01001"],
  ["Anchorage Municipality", "02020"],
  ["Bethel Census Area", "02050"],
  ["North Slope Borough", "02185"],
  ["Juneau City and Borough", "02110"],
] as const) {
  const stateCode = fips.startsWith("01") ? "AL" : "AK";
  const result = resolveCountyEquivalent({ stateCode, countyName: name });
  assert(result.status === "resolved" && result.county.countyFips === fips, `${name} did not resolve to ${fips}.`);
}

const alaskaFips = new Set(listCountyEquivalents("AK").map((entry) => entry.countyFips));
assert(alaskaFips.has("02063") && alaskaFips.has("02066"), "Alaska successors are missing.");
assert(!alaskaFips.has("02261"), "Retired Valdez-Cordova remains active.");
const retired = resolveCountyEquivalent({ stateCode: "AK", countyFips: "02261" });
assert(
  retired.status === "rejected" &&
    retired.reasonCode === "retired-geography" &&
    retired.successorFips?.join(",") === "02063,02066",
  "Retired Alaska geography was not blocked with successors.",
);

const ambiguous = resolveCountyEquivalent({ stateCode: "VA", countyName: "Fairfax" });
assert(
  ambiguous.status === "rejected" && ambiguous.reasonCode === "ambiguous-county-name",
  "Ambiguous county versus independent-city aliases must be rejected.",
);
const ambiguousMissouri = resolveCountyEquivalent({
  stateCode: "MO",
  countyName: "St. Louis",
});
assert(
  ambiguousMissouri.status === "rejected" &&
    ambiguousMissouri.reasonCode === "ambiguous-county-name",
  "Ambiguous Missouri county versus independent-city aliases must be rejected without FIPS.",
);
assert(
  countyEquivalentNameMatchesFips({
    stateCode: "MO",
    countyFips: "29189",
    countyName: "St. Louis",
    sourceId: "gbif-preserved-specimens",
  }) &&
    countyEquivalentNameMatchesFips({
      stateCode: "MO",
      countyFips: "29510",
      countyName: "St. Louis",
      sourceId: "gbif-preserved-specimens",
    }),
  "An exact FIPS must disambiguate a registered shared Missouri short name.",
);
assert(
  !countyEquivalentNameMatchesFips({
    stateCode: "MO",
    countyFips: "29189",
    countyName: "Jackson",
    sourceId: "gbif-preserved-specimens",
  }),
  "A mismatched county name must still be rejected when FIPS is present.",
);
const stateMismatch = resolveCountyEquivalent({ stateCode: "AK", countyFips: "01001" });
assert(
  stateMismatch.status === "rejected" && stateMismatch.reasonCode === "state-fips-mismatch",
  "State and county FIPS mismatch must be rejected.",
);

const topologyFips = new Set(
  (topology.objects.counties.geometries as Array<{ id: string }>).map((entry) => String(entry.id)),
);
const registryFips = new Set(
  [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL",
    "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE",
    "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD",
    "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  ].flatMap((stateCode) => listCountyEquivalents(stateCode).map((entry) => entry.countyFips)),
);
assert(registryFips.size === 3144, "Registry FIPS total is stale.");
for (const countyFips of registryFips) assert(topologyFips.has(countyFips), `Topology is missing ${countyFips}.`);

console.log(
  JSON.stringify(
    {
      nationalV1States: national.stateCount,
      nationalV1FederalDistricts: national.federalDistrictCount,
      nationalV1CountyEquivalents: national.countyEquivalentCount,
      alabamaCountyCount: listCountyEquivalents("AL").length,
      alaskaCountyEquivalentCount: listCountyEquivalents("AK").length,
      topologyCountyEquivalentCount: topologyFips.size,
      geographyPolicy: "exact-only",
    },
    null,
    2,
  ),
);
