"use client";

import { useEffect, useState } from "react";

import type {
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
    sourceSpeciesCounts: Partial<Record<"EDDMaps" | "USGS NAS", number>>;
  };
}

export interface ClientDataStorePayload {
  allSpecies: ExplorerSpecies[];
  countyIndex: Record<string, CountyRecord>;
  presenceIndex: ExplorerPresenceIndex;
  datasetSnapshot: DatasetSnapshot;
}

export interface ClientDataStore {
  allSpecies: ExplorerSpecies[];
  speciesById: Map<string, ExplorerSpecies>;
  speciesByOrdinal: ExplorerSpecies[];
  countyIndex: Record<string, CountyRecord>;
  presenceIndex: ExplorerPresenceIndex;
  datasetSnapshot: DatasetSnapshot;
}

let storePromise: Promise<ClientDataStore> | null = null;
let cachedStore: ClientDataStore | null = null;
const DATASET_FETCH_TIMEOUT_MS = 15000;

async function fetchJson<T>(path: string) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DATASET_FETCH_TIMEOUT_MS);
  const response = await fetch(path, {
    cache: "force-cache",
    signal: controller.signal,
  }).finally(() => {
    window.clearTimeout(timeout);
  });

  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }

  return (await response.json()) as T;
}

export function createClientDataStore(payload: ClientDataStorePayload): ClientDataStore {
  return {
    allSpecies: payload.allSpecies,
    speciesById: new Map(payload.allSpecies.map((item) => [item.id, item])),
    speciesByOrdinal: payload.allSpecies,
    countyIndex: payload.countyIndex,
    presenceIndex: payload.presenceIndex,
    datasetSnapshot: payload.datasetSnapshot,
  };
}

async function loadClientDataStore(): Promise<ClientDataStore> {
  const [allSpecies, countyIndex, presenceIndex, datasetSnapshot] = await Promise.all([
    fetchJson<ExplorerSpecies[]>("/generated/explorer-species.json"),
    fetchJson<Record<string, CountyRecord>>("/generated/counties.json"),
    fetchJson<ExplorerPresenceIndex>("/generated/explorer-presence.json"),
    fetchJson<DatasetSnapshot>("/generated/snapshot.json"),
  ]);

  return createClientDataStore({
    allSpecies,
    countyIndex,
    presenceIndex,
    datasetSnapshot,
  });
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

  useEffect(() => {
    if (initialPayload) return;

    let cancelled = false;

    getClientDataStore()
      .then((nextStore) => {
        if (cancelled) return;
        setStore(nextStore);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Static dataset failed to load. Refresh and try again.");
      });

    return () => {
      cancelled = true;
    };
  }, [initialPayload]);

  return { store, error };
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
