"use client";

import { useEffect, useState } from "react";
import { loadRuntimeData } from "@/lib/data/runtime-fetch";

import type {
  CountyDetail,
  CountyDataSourceName,
  CountyRecord,
  ExplorerPresenceIndex,
  ExplorerSpecies,
  SpeciesFilters,
} from "@/lib/data/types";

interface DatasetSnapshot {
  snapshotDate: string;
  sourceRefs: string[];
  coverageSummary?: {
    catalogSpeciesCount: number;
    mappedSpeciesCount: number;
    unmatchedSpeciesCount: number;
    sourceSpeciesCounts: Partial<Record<CountyDataSourceName, number>>;
  };
}

export interface ClientDataStorePayload {
  allSpecies: ExplorerSpecies[];
  countyIndex: Record<string, CountyRecord>;
  countyDetails: Record<string, CountyDetail>;
  presenceIndex: ExplorerPresenceIndex;
  datasetSnapshot: DatasetSnapshot;
}

export interface ClientDataStore {
  allSpecies: ExplorerSpecies[];
  speciesById: Map<string, ExplorerSpecies>;
  speciesByOrdinal: ExplorerSpecies[];
  countyIndex: Record<string, CountyRecord>;
  countyDetails: Record<string, CountyDetail>;
  presenceIndex: ExplorerPresenceIndex;
  datasetSnapshot: DatasetSnapshot;
}

let storePromise: Promise<ClientDataStore> | null = null;
let cachedStore: ClientDataStore | null = null;
export function createClientDataStore(payload: ClientDataStorePayload): ClientDataStore {
  return {
    allSpecies: payload.allSpecies,
    speciesById: new Map(payload.allSpecies.map((item) => [item.id, item])),
    speciesByOrdinal: payload.allSpecies,
    countyIndex: payload.countyIndex,
    countyDetails: payload.countyDetails,
    presenceIndex: payload.presenceIndex,
    datasetSnapshot: payload.datasetSnapshot,
  };
}

async function loadClientDataStore(): Promise<ClientDataStore> {
  return createClientDataStore(await loadRuntimeData<ClientDataStorePayload>("map"));
}

function getClientDataStore() {
  if (cachedStore) {
    return Promise.resolve(cachedStore);
  }

  if (!storePromise) {
    storePromise = loadClientDataStore()
      .then((nextStore) => {
        cachedStore = nextStore;
        return nextStore;
      })
      .catch((error) => {
        storePromise = null;
        throw error;
      });
  }

  return storePromise;
}

export function useClientDataStore(initialPayload?: ClientDataStorePayload) {
  const [store, setStore] = useState<ClientDataStore | null>(() =>
    initialPayload ? createClientDataStore(initialPayload) : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (initialPayload) return;

    let cancelled = false;
    setError(null);

    getClientDataStore()
      .then((nextStore) => {
        if (cancelled) return;
        setStore(nextStore);
      })
      .catch(() => {
        if (cancelled) return;
        setError("The species and county snapshot could not be loaded. Check your connection and try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [initialPayload, attempt]);

  return { store, error, retry: () => setAttempt((value) => value + 1) };
}

export function speciesHasCountyData(species: ExplorerSpecies) {
  return Boolean(species.registry?.hasCountyData);
}

export function speciesMatchesFilters(species: ExplorerSpecies, filters?: SpeciesFilters) {
  if (filters?.speciesId && species.id !== filters.speciesId) return false;
  if (filters?.categories?.length && !filters.categories.includes(species.category)) {
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
    const haystack = [species.commonName, species.scientificName, species.displayGroup]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(query)) return false;
  }
  return true;
}

export function getCountyRecord(
  countyIndex: Record<string, CountyRecord>,
  countyFips?: string | null,
) {
  if (!countyFips) return null;
  return countyIndex[countyFips] ?? null;
}

export function getSpeciesForCounty(
  presenceIndex: ExplorerPresenceIndex,
  speciesByOrdinal: ExplorerSpecies[],
  countyFips?: string | null,
  filters?: SpeciesFilters,
) {
  const countyPresence = countyFips ? presenceIndex[countyFips] : null;
  if (!countyPresence) return [];

  return countyPresence
    .map((speciesIndex) => speciesByOrdinal[speciesIndex])
    .filter((item): item is ExplorerSpecies => Boolean(item))
    .filter((item) => speciesMatchesFilters(item, filters));
}

export function getSpeciesForCounties(
  presenceIndex: ExplorerPresenceIndex,
  speciesByOrdinal: ExplorerSpecies[],
  countyFips: string[],
  filters?: SpeciesFilters,
) {
  const seen = new Set<string>();

  return countyFips.flatMap((county) => {
    return getSpeciesForCounty(presenceIndex, speciesByOrdinal, county, filters).filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  });
}

export function getSpeciesWithoutCountyCoverage(
  allSpecies: ExplorerSpecies[],
  filters?: SpeciesFilters,
) {
  return allSpecies
    .filter((species) => speciesMatchesFilters(species, filters) && !speciesHasCountyData(species))
    .sort((left, right) => left.commonName.localeCompare(right.commonName));
}
