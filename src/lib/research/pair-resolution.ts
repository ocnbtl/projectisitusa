import type {
  ResearchCountyFile,
  ResearchPairRecord,
} from "@/lib/research/types";
import type { SpeciesCategory } from "@/lib/data/types";

export type ResearchCatalogSpecies = {
  id: string;
  commonName: string;
  scientificName: string;
  category: SpeciesCategory;
};

export type ResolvedResearchPair = ResearchPairRecord & {
  sparseDefault: boolean;
};

function assertUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicates.`);
  }
}

export function resolveSparseCountyPairs(input: {
  catalogSpecies: ResearchCatalogSpecies[];
  county: ResearchCountyFile;
}): ResolvedResearchPair[] {
  const { catalogSpecies, county } = input;
  const catalogIds = catalogSpecies.map((entry) => entry.id);
  assertUnique(catalogIds, "Research species catalog");
  if (catalogSpecies.length !== county.scope.catalogSpeciesCount) {
    throw new Error(
      `County projection catalog count ${county.scope.catalogSpeciesCount} does not match ${catalogSpecies.length}.`,
    );
  }

  const explicitPairs = new Map(
    county.pairs.map((entry) => [entry.speciesId, entry]),
  );
  assertUnique(
    county.pairs.map((entry) => entry.speciesId),
    `${county.countyFips} explicit research pairs`,
  );
  const applicabilityOverrides = new Map(
    county.pairResolution.applicabilityOverrides.map((entry) => [
      entry.speciesId,
      entry.applicability,
    ]),
  );
  assertUnique(
    county.pairResolution.applicabilityOverrides.map((entry) => entry.speciesId),
    `${county.stateCode} applicability overrides`,
  );

  const resolved = catalogSpecies.map((species): ResolvedResearchPair => {
    const explicit = explicitPairs.get(species.id);
    if (explicit) {
      return { ...explicit, sparseDefault: false };
    }
    const applicabilityStatus =
      applicabilityOverrides.get(species.id) ??
      county.pairResolution.defaultApplicability;
    return {
      speciesId: species.id,
      commonName: species.commonName,
      scientificName: species.scientificName,
      category: species.category,
      applicabilityStatus,
      displayStatus: county.pairResolution.defaultDisplayStatus,
      determinationStatus: "none",
      surveyStatus: "unassessed",
      researchStatus: "not-started",
      freshnessStatus: "undated",
      reviewStatus: "not-reviewed",
      conflict: false,
      evidence: [],
      screenedBySourceIds: [],
      sparseDefault: true,
    };
  });

  const catalogIdSet = new Set(catalogIds);
  for (const speciesId of explicitPairs.keys()) {
    if (!catalogIdSet.has(speciesId)) {
      throw new Error(`County projection references unknown species ${speciesId}.`);
    }
  }
  for (const speciesId of applicabilityOverrides.keys()) {
    if (!catalogIdSet.has(speciesId)) {
      throw new Error(`Applicability override references unknown species ${speciesId}.`);
    }
  }
  return resolved;
}
