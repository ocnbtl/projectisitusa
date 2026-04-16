import counties from "@/data/generated/counties.json";
import presence from "@/data/generated/presence.json";
import snapshot from "@/data/generated/snapshot.json";
import species from "@/data/generated/species.json";
import type {
  CountyPresence,
  CountyRecord,
  Species,
  SpeciesFilters,
} from "@/lib/data/types";

export const allSpecies = species as Species[];
export const speciesById = new Map(allSpecies.map((item) => [item.id, item]));
export const speciesBySlug = new Map(allSpecies.map((item) => [item.slug, item]));

export const countyIndex = counties as unknown as Record<string, CountyRecord>;
export const presenceIndex = presence as unknown as Record<string, CountyPresence>;
export const datasetSnapshot = snapshot as {
  snapshotDate: string;
  sourceRefs: string[];
  coverageSummary?: {
    catalogSpeciesCount: number;
    mappedSpeciesCount: number;
    unmatchedSpeciesCount: number;
    sourceSpeciesCounts: Partial<Record<"EDDMaps" | "USGS NAS", number>>;
  };
};

export function getCountyRecord(countyFips?: string | null) {
  if (!countyFips) return null;
  return countyIndex[countyFips] ?? null;
}

export function getCountyPresence(countyFips?: string | null) {
  if (!countyFips) return null;
  return presenceIndex[countyFips] ?? null;
}

export function speciesHasCountyData(species: Species) {
  return Boolean(species.registry?.hasCountyData);
}

export function speciesMatchesFilters(species: Species, filters?: SpeciesFilters) {
  if (filters?.speciesId && species.id !== filters.speciesId) return false;
  if (
    filters?.categories?.length &&
    !filters.categories.includes(species.category)
  ) {
    return false;
  }
  if (filters?.status && species.registry?.status !== filters.status) return false;
  if (
    filters?.environment &&
    !species.registry?.environmentTags.includes(filters.environment)
  ) {
    return false;
  }
  if (filters?.availability === "mapped" && !speciesHasCountyData(species)) {
    return false;
  }
  if (filters?.availability === "catalog" && speciesHasCountyData(species)) {
    return false;
  }
  if (filters?.query) {
    const query = filters.query.toLowerCase();
    const haystack = [
      species.commonName,
      species.scientificName,
      species.displayGroup,
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

export function getSpeciesForCounty(
  countyFips?: string | null,
  filters?: SpeciesFilters,
) {
  const countyPresence = getCountyPresence(countyFips);
  if (!countyPresence) return [];

  return countyPresence.speciesIds
    .map((speciesId) => speciesById.get(speciesId))
    .filter((item): item is Species => Boolean(item))
    .filter((item) => speciesMatchesFilters(item, filters));
}

export function getSpeciesForCounties(
  countyFips: string[],
  filters?: SpeciesFilters,
) {
  const seen = new Set<string>();

  return countyFips.flatMap((county) => {
    return getSpeciesForCounty(county, filters).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  });
}

export function countyMatchesFilters(
  countyFips: string,
  filters?: SpeciesFilters,
) {
  return getSpeciesForCounty(countyFips, filters).length > 0;
}

export function getSpeciesWithoutCountyCoverage(filters?: SpeciesFilters) {
  return allSpecies
    .filter(
      (species) =>
        speciesMatchesFilters(species, filters) && !speciesHasCountyData(species),
    )
    .sort((left, right) => left.commonName.localeCompare(right.commonName));
}
