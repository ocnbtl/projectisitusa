import countyRegistryJson from "@/data/research/county-equivalent-registry.json";
import stateRegistryJson from "@/data/research/state-registry.json";

export type JurisdictionKind = "state" | "federal-district" | "territory";
export type CountyEquivalentKind =
  | "county"
  | "parish"
  | "borough"
  | "census-area"
  | "municipality"
  | "city-and-borough"
  | "independent-city"
  | "planning-region"
  | "federal-district"
  | "municipio"
  | "district"
  | "island"
  | "other-county-equivalent";

export type StateRegistryEntry = {
  stateCode: string;
  stateFips: string;
  stateName: string;
  countyEquivalentCount: number;
  jurisdictionKind: JurisdictionKind;
  nationalV1Scope: boolean;
  certificationOrder: number | null;
  countyEquivalentLabel: string;
  sourceStateNames: { gbif: string; idigbio: string };
};

export type CountyEquivalentRegistryEntry = {
  countyFips: string;
  stateFips: string;
  stateCode: string;
  stateName: string;
  shortName: string;
  legalName: string;
  kind: CountyEquivalentKind;
  legalStatisticalAreaCode: string;
  censusNamespaceId: string;
  status: "active";
  validFrom: string;
  validThrough: null;
  aliases: string[];
  sourceAliases: Record<string, string[]>;
  predecessorFips: string[];
  successorFips: string[];
  topologyId: string;
  coordinateDerivationAllowed: false;
};

type RetiredCountyEquivalent = {
  countyFips: string;
  stateCode: string;
  shortName?: string;
  legalName: string;
  status: "retired";
  successorFips: string[];
  automaticResolutionAllowed: false;
};

const stateRegistry = stateRegistryJson as {
  nationalV1: {
    stateCount: number;
    federalDistrictCount: number;
    jurisdictionCount: number;
    countyEquivalentCount: number;
    certificationOrder: string[];
    activeCertificationStateCode: string;
    activeCertificationCohort: number;
    nextCertificationCohort: number;
    certificationCohorts: Array<{ cohort: number; stateCodes: string[] }>;
    pilotStateCodes: string[];
  };
  jurisdictions: StateRegistryEntry[];
};

const countyRegistry = countyRegistryJson as {
  geographyPolicy: {
    coordinateDerivationAllowed: false;
    retiredGeographyAutomaticSuccessorAssignmentAllowed: false;
  };
  countyEquivalents: CountyEquivalentRegistryEntry[];
  retiredCountyEquivalents: RetiredCountyEquivalent[];
};

const statesByCode = new Map(
  stateRegistry.jurisdictions.map((entry) => [entry.stateCode, entry]),
);
const countiesByFips = new Map(
  countyRegistry.countyEquivalents.map((entry) => [entry.countyFips, entry]),
);
const retiredByFips = new Map(
  countyRegistry.retiredCountyEquivalents.map((entry) => [entry.countyFips, entry]),
);

function normalizeAlias(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

const countiesByState = new Map<string, CountyEquivalentRegistryEntry[]>();
const aliasesByState = new Map<string, Map<string, CountyEquivalentRegistryEntry[]>>();
const retiredAliasesByState = new Map<string, Map<string, RetiredCountyEquivalent[]>>();
for (const county of countyRegistry.countyEquivalents) {
  const counties = countiesByState.get(county.stateCode) ?? [];
  counties.push(county);
  countiesByState.set(county.stateCode, counties);

  const aliases: Map<string, CountyEquivalentRegistryEntry[]> =
    aliasesByState.get(county.stateCode) ?? new Map<string, CountyEquivalentRegistryEntry[]>();
  for (const alias of [
    county.shortName,
    county.legalName,
    ...county.aliases,
    ...Object.values(county.sourceAliases).flat(),
  ]) {
    const normalized = normalizeAlias(alias);
    const matches = aliases.get(normalized) ?? [];
    if (!matches.some((entry) => entry.countyFips === county.countyFips)) matches.push(county);
    aliases.set(normalized, matches);
  }
  aliasesByState.set(county.stateCode, aliases);
}
for (const counties of countiesByState.values()) {
  counties.sort((left, right) => left.countyFips.localeCompare(right.countyFips));
}
for (const county of countyRegistry.retiredCountyEquivalents) {
  const aliases =
    retiredAliasesByState.get(county.stateCode) ??
    new Map<string, RetiredCountyEquivalent[]>();
  for (const alias of [county.shortName, county.legalName].filter(
    (value): value is string => Boolean(value),
  )) {
    const normalized = normalizeAlias(alias);
    const matches = aliases.get(normalized) ?? [];
    if (!matches.some((entry) => entry.countyFips === county.countyFips)) matches.push(county);
    aliases.set(normalized, matches);
  }
  retiredAliasesByState.set(county.stateCode, aliases);
}

export function getNationalV1Registry() {
  return stateRegistry.nationalV1;
}

export function getStateDefinition(stateCode: string) {
  return statesByCode.get(stateCode.toUpperCase()) ?? null;
}

export function listCountyEquivalents(stateCode: string) {
  return [...(countiesByState.get(stateCode.toUpperCase()) ?? [])];
}

export function countyEquivalentNameMatchesFips(input: {
  stateCode: string;
  countyFips: string;
  countyName: string;
  sourceId?: string | null;
}) {
  const stateCode = input.stateCode.toUpperCase();
  const county = countiesByFips.get(input.countyFips);
  if (
    !county ||
    county.stateCode !== stateCode ||
    !input.countyName.trim()
  ) {
    return false;
  }
  const normalized = normalizeAlias(input.countyName);
  const aliases = [
    county.shortName,
    county.legalName,
    ...county.aliases,
    ...(input.sourceId ? county.sourceAliases[input.sourceId] ?? [] : []),
  ];
  return aliases.some((alias) => normalizeAlias(alias) === normalized);
}

export type CountyResolution =
  | { status: "resolved"; county: CountyEquivalentRegistryEntry; method: "fips" | "alias" }
  | {
      status: "rejected";
      reasonCode:
        | "unknown-state"
        | "unknown-county-fips"
        | "state-fips-mismatch"
        | "retired-geography"
        | "missing-geography"
        | "unknown-county-name"
        | "ambiguous-county-name";
      detail: string;
      successorFips?: string[];
      candidateFips?: string[];
    };

export function resolveCountyEquivalent(input: {
  stateCode: string;
  countyFips?: string | null;
  countyName?: string | null;
  sourceId?: string | null;
}): CountyResolution {
  const stateCode = input.stateCode.toUpperCase();
  if (!statesByCode.has(stateCode)) {
    return { status: "rejected", reasonCode: "unknown-state", detail: `Unknown state ${stateCode}.` };
  }

  if (input.countyFips) {
    const retired = retiredByFips.get(input.countyFips);
    if (retired) {
      return {
        status: "rejected",
        reasonCode: "retired-geography",
        detail: `${retired.legalName} is retired and cannot be assigned automatically.`,
        successorFips: retired.successorFips,
      };
    }
    const county = countiesByFips.get(input.countyFips);
    if (!county) {
      return {
        status: "rejected",
        reasonCode: "unknown-county-fips",
        detail: `Unknown active county-equivalent FIPS ${input.countyFips}.`,
      };
    }
    if (county.stateCode !== stateCode) {
      return {
        status: "rejected",
        reasonCode: "state-fips-mismatch",
        detail: `${input.countyFips} belongs to ${county.stateCode}, not ${stateCode}.`,
      };
    }
    return { status: "resolved", county, method: "fips" };
  }

  if (!input.countyName?.trim()) {
    return {
      status: "rejected",
      reasonCode: "missing-geography",
      detail: "An exact county-equivalent FIPS or registered name is required.",
    };
  }
  const normalized = normalizeAlias(input.countyName);
  const stateAliases = aliasesByState.get(stateCode) ?? new Map();
  const directMatches = stateAliases.get(normalized) ?? [];
  const retiredMatches = retiredAliasesByState.get(stateCode)?.get(normalized) ?? [];
  if (retiredMatches.length > 0) {
    return {
      status: "rejected",
      reasonCode: "retired-geography",
      detail: `${retiredMatches.map((entry) => entry.legalName).join(", ")} is retired and cannot be assigned automatically.`,
      successorFips: [...new Set(retiredMatches.flatMap((entry) => entry.successorFips))].sort(),
    };
  }
  const sourceMatches = input.sourceId
    ? (countiesByState.get(stateCode) ?? []).filter((county) =>
        (county.sourceAliases[input.sourceId ?? ""] ?? []).some(
          (alias) => normalizeAlias(alias) === normalized,
        ),
      )
    : [];
  const matches = [...new Map([...sourceMatches, ...directMatches].map((entry) => [entry.countyFips, entry])).values()];
  if (matches.length === 0) {
    return {
      status: "rejected",
      reasonCode: "unknown-county-name",
      detail: `${input.countyName} is not a registered ${stateCode} county-equivalent name.`,
    };
  }
  if (matches.length > 1) {
    return {
      status: "rejected",
      reasonCode: "ambiguous-county-name",
      detail: `${input.countyName} matches more than one ${stateCode} county equivalent.`,
      candidateFips: matches.map((entry) => entry.countyFips).sort(),
    };
  }
  return { status: "resolved", county: matches[0], method: "alias" };
}

export function assertCoordinateDerivationDisabled() {
  if (
    countyRegistry.geographyPolicy.coordinateDerivationAllowed !== false ||
    countyRegistry.geographyPolicy.retiredGeographyAutomaticSuccessorAssignmentAllowed !== false
  ) {
    throw new Error("The national geography registry weakened its exact-geography policy.");
  }
}
