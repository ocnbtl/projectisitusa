export type StateSpeciesApplicability =
  | "applicable"
  | "not-applicable"
  | "unknown"
  | "blocked";

export type StateSpeciesResearchStatus =
  | "applicable"
  | "not-applicable"
  | "researched-unresolved"
  | "researched-blocked"
  | "partially-researched"
  | "not-researched"
  | "blocked";

export type StateSpeciesResearchCounts = Record<
  StateSpeciesResearchStatus,
  number
>;

export type StateSpeciesResolutionOverride = {
  speciesId: string;
  status: StateSpeciesResearchStatus;
  applicabilityStatus: StateSpeciesApplicability;
  applicabilityBasis: "explicit" | "accepted-reviewed-presence" | "unresolved";
  researchedCountyCount: number;
  blockedCountyCount: number;
  accountedCountyCount: number;
  notResearchedCountyCount: number;
};

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

function validatePairKeys(input: {
  label: string;
  pairKeys: Set<string>;
  catalogSpeciesIdSet: Set<string>;
  countyFipsSet: Set<string>;
}) {
  for (const key of input.pairKeys) {
    const separator = key.indexOf(":");
    const countyFips = key.slice(0, separator);
    const speciesId = key.slice(separator + 1);
    if (
      separator < 1 ||
      !input.countyFipsSet.has(countyFips) ||
      !input.catalogSpeciesIdSet.has(speciesId)
    ) {
      throw new Error(`${input.label} contains an out-of-scope pair: ${key}.`);
    }
  }
}

export function deriveStateSpeciesResolution(input: {
  catalogSpeciesIds: string[];
  countyFips: string[];
  explicitApplicabilityBySpeciesId: Map<string, StateSpeciesApplicability>;
  acceptedPresentSpeciesIds: Set<string>;
  researchedPairKeys: Set<string>;
  blockedPairKeys: Set<string>;
}) {
  const catalogSpeciesIds = [...input.catalogSpeciesIds].sort();
  const countyFips = [...input.countyFips].sort();
  const catalogSpeciesIdSet = new Set(catalogSpeciesIds);
  const countyFipsSet = new Set(countyFips);
  if (
    catalogSpeciesIdSet.size !== catalogSpeciesIds.length ||
    countyFipsSet.size !== countyFips.length
  ) {
    throw new Error("State-species resolution requires unique catalog species and counties.");
  }
  for (const speciesId of input.explicitApplicabilityBySpeciesId.keys()) {
    if (!catalogSpeciesIdSet.has(speciesId)) {
      throw new Error(
        `Explicit state applicability references unknown species ${speciesId}.`,
      );
    }
  }
  for (const speciesId of input.acceptedPresentSpeciesIds) {
    if (!catalogSpeciesIdSet.has(speciesId)) {
      throw new Error(
        `Accepted reviewed presence references unknown species ${speciesId}.`,
      );
    }
  }
  validatePairKeys({
    label: "Researched pair set",
    pairKeys: input.researchedPairKeys,
    catalogSpeciesIdSet,
    countyFipsSet,
  });
  validatePairKeys({
    label: "Blocked pair set",
    pairKeys: input.blockedPairKeys,
    catalogSpeciesIdSet,
    countyFipsSet,
  });

  const applicabilityBySpeciesId = new Map(
    input.explicitApplicabilityBySpeciesId,
  );
  let derivedApplicableSpeciesCount = 0;
  for (const speciesId of [...input.acceptedPresentSpeciesIds].sort()) {
    const explicit = applicabilityBySpeciesId.get(speciesId);
    if (explicit === "not-applicable") {
      throw new Error(
        `Accepted reviewed presence for ${speciesId} contradicts explicit not-applicable state evidence.`,
      );
    }
    if (explicit !== "applicable") derivedApplicableSpeciesCount += 1;
    applicabilityBySpeciesId.set(speciesId, "applicable");
  }

  const applicabilityDecisionCounts: Record<StateSpeciesApplicability, number> =
    {
      applicable: 0,
      "not-applicable": 0,
      unknown: 0,
      blocked: 0,
    };
  const counts: StateSpeciesResearchCounts = {
    applicable: 0,
    "not-applicable": 0,
    "researched-unresolved": 0,
    "researched-blocked": 0,
    "partially-researched": 0,
    "not-researched": 0,
    blocked: 0,
  };
  const overrides: StateSpeciesResolutionOverride[] = [];
  let fullyAccountedSpeciesCount = 0;
  let partiallyAccountedSpeciesCount = 0;
  let untouchedSpeciesCount = 0;

  for (const speciesId of catalogSpeciesIds) {
    const explicit = input.explicitApplicabilityBySpeciesId.get(speciesId);
    const applicabilityStatus =
      applicabilityBySpeciesId.get(speciesId) ?? "unknown";
    applicabilityDecisionCounts[applicabilityStatus] += 1;
    let researchedCountyCount = 0;
    let blockedCountyCount = 0;
    for (const county of countyFips) {
      const key = pairKey(county, speciesId);
      if (input.researchedPairKeys.has(key)) {
        researchedCountyCount += 1;
      } else if (input.blockedPairKeys.has(key)) {
        blockedCountyCount += 1;
      }
    }
    const accountedCountyCount =
      researchedCountyCount + blockedCountyCount;
    const notResearchedCountyCount =
      countyFips.length - accountedCountyCount;
    const stateDecisionAccountsForAllPairs =
      applicabilityStatus === "not-applicable" ||
      (applicabilityStatus === "blocked" &&
        !input.acceptedPresentSpeciesIds.has(speciesId));
    if (
      stateDecisionAccountsForAllPairs ||
      accountedCountyCount === countyFips.length
    ) {
      fullyAccountedSpeciesCount += 1;
    } else if (accountedCountyCount > 0) {
      partiallyAccountedSpeciesCount += 1;
    } else {
      untouchedSpeciesCount += 1;
    }

    let status: StateSpeciesResearchStatus;
    if (applicabilityStatus === "applicable") {
      status = "applicable";
    } else if (applicabilityStatus === "not-applicable") {
      status = "not-applicable";
    } else if (applicabilityStatus === "blocked") {
      status = "blocked";
    } else if (
      accountedCountyCount === countyFips.length &&
      researchedCountyCount > 0
    ) {
      status = "researched-unresolved";
    } else if (
      accountedCountyCount === countyFips.length &&
      blockedCountyCount > 0
    ) {
      status = "researched-blocked";
    } else if (accountedCountyCount > 0) {
      status = "partially-researched";
    } else {
      status = "not-researched";
    }
    counts[status] += 1;
    if (
      status !== "not-researched" ||
      applicabilityStatus !== "unknown"
    ) {
      overrides.push({
        speciesId,
        status,
        applicabilityStatus,
        applicabilityBasis:
          explicit !== undefined
            ? "explicit"
            : input.acceptedPresentSpeciesIds.has(speciesId)
              ? "accepted-reviewed-presence"
              : "unresolved",
        researchedCountyCount,
        blockedCountyCount,
        accountedCountyCount,
        notResearchedCountyCount,
      });
    }
  }

  return {
    schemaVersion: 1 as const,
    defaultStatus: "not-researched" as const,
    denominator: catalogSpeciesIds.length,
    countyEquivalentCount: countyFips.length,
    applicabilityDecisionCounts,
    derivedApplicableSpeciesCount,
    counts,
    fullyAccountedSpeciesCount,
    partiallyAccountedSpeciesCount,
    untouchedSpeciesCount,
    fullCatalogResearchAccounted:
      fullyAccountedSpeciesCount === catalogSpeciesIds.length,
    applicabilityBySpeciesId,
    overrides,
  };
}
