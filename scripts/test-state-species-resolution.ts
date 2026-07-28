import {
  deriveStateSpeciesResolution,
  type StateSpeciesApplicability,
} from "@/lib/research/state-species-resolution";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(label: string, expected: RegExp, run: () => unknown) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expected.test(message), `${label} failed with an unexpected message: ${message}`);
    return;
  }
  throw new Error(`${label} unexpectedly passed.`);
}

const catalogSpeciesIds = [
  "accepted-present",
  "explicit-applicable",
  "explicit-not-applicable",
  "explicit-blocked",
  "fully-researched-unresolved",
  "partially-researched",
  "untouched",
];
const countyFips = ["01001", "01003"];
const explicitApplicabilityBySpeciesId = new Map<string, StateSpeciesApplicability>([
  ["explicit-applicable", "applicable"],
  ["explicit-not-applicable", "not-applicable"],
  ["explicit-blocked", "blocked"],
]);
const researchedPairKeys = new Set([
  "01001:accepted-present",
  "01001:explicit-applicable",
  "01001:fully-researched-unresolved",
  "01003:fully-researched-unresolved",
  "01001:partially-researched",
]);
const blockedPairKeys = new Set([
  "01003:accepted-present",
  "01003:explicit-applicable",
]);

const resolution = deriveStateSpeciesResolution({
  catalogSpeciesIds,
  countyFips,
  explicitApplicabilityBySpeciesId,
  acceptedPresentSpeciesIds: new Set(["accepted-present"]),
  researchedPairKeys,
  blockedPairKeys,
});
const byId = new Map(
  resolution.overrides.map((entry) => [entry.speciesId, entry]),
);

assert(
  resolution.applicabilityDecisionCounts.applicable === 2 &&
    resolution.applicabilityDecisionCounts["not-applicable"] === 1 &&
    resolution.applicabilityDecisionCounts.blocked === 1 &&
    resolution.applicabilityDecisionCounts.unknown === 3,
  "Effective applicability decisions were not derived deterministically.",
);
assert(
  resolution.derivedApplicableSpeciesCount === 1 &&
    byId.get("accepted-present")?.applicabilityStatus === "applicable" &&
    byId.get("accepted-present")?.status === "applicable",
  "Accepted reviewed presence did not establish state applicability.",
);
assert(
  byId.get("fully-researched-unresolved")?.status ===
    "researched-unresolved",
  "A fully accounted unresolved species was not distinguished.",
);
assert(
  byId.get("partially-researched")?.status === "partially-researched",
  "Partial state-species research was not preserved.",
);
assert(
  !byId.has("untouched") &&
    resolution.counts["not-researched"] === 1 &&
    resolution.defaultStatus === "not-researched",
  "Untouched species did not remain a sparse not-researched default.",
);
assert(
  resolution.counts.applicable === 2 &&
    resolution.counts["not-applicable"] === 1 &&
    resolution.counts.blocked === 1 &&
    resolution.counts["researched-unresolved"] === 1 &&
    resolution.counts["partially-researched"] === 1 &&
    resolution.counts["not-researched"] === 1,
  "State-species research statuses do not partition the catalog.",
);
assert(
  !resolution.fullCatalogResearchAccounted,
  "Partial and untouched species incorrectly passed the research-accounted gate.",
);

const allAccounted = deriveStateSpeciesResolution({
  catalogSpeciesIds: ["unresolved", "blocked"],
  countyFips,
  explicitApplicabilityBySpeciesId: new Map(),
  acceptedPresentSpeciesIds: new Set(),
  researchedPairKeys: new Set([
    "01001:unresolved",
    "01003:unresolved",
  ]),
  blockedPairKeys: new Set([
    "01001:blocked",
    "01003:blocked",
  ]),
});
assert(
  allAccounted.fullCatalogResearchAccounted &&
    allAccounted.counts["researched-unresolved"] === 1 &&
    allAccounted.counts["researched-blocked"] === 1,
  "Fully researched or explicitly blocked unresolved species did not pass the research-accounted gate.",
);

expectFailure(
  "positive versus explicit not applicable",
  /contradicts explicit not-applicable/,
  () =>
    deriveStateSpeciesResolution({
      catalogSpeciesIds: ["conflict"],
      countyFips,
      explicitApplicabilityBySpeciesId: new Map([
        ["conflict", "not-applicable"],
      ]),
      acceptedPresentSpeciesIds: new Set(["conflict"]),
      researchedPairKeys: new Set(["01001:conflict"]),
      blockedPairKeys: new Set(),
    }),
);

console.log(
  JSON.stringify({
    cases: 3,
    status: "pass",
    counts: resolution.counts,
    effectiveApplicability: resolution.applicabilityDecisionCounts,
  }),
);
