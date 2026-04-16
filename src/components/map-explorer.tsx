"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { CountyInsightPanel } from "@/components/county-insight-panel";
import { MapToolbar } from "@/components/map-toolbar";
import { UsCountyMap } from "@/components/us-county-map";
import {
  type ClientDataStorePayload,
  getCountyRecord,
  getSpeciesForCounties,
  getSpeciesForCounty,
  getSpeciesWithoutCountyCoverage,
  speciesMatchesFilters,
  useClientDataStore,
} from "@/lib/data/client-store";
import type {
  CountyRecord,
  EnvironmentTag,
  ExplorerPresenceIndex,
  ExplorerSpecies,
  SpeciesCategory,
  SpeciesFilters,
  ZipLookupResult,
} from "@/lib/data/types";
import { buildSearchParams } from "@/lib/url-state";
import { formatNaturalList } from "@/lib/utils";

const EMPTY_DATASET_SNAPSHOT = {
  snapshotDate: "",
  sourceRefs: [],
  coverageSummary: undefined,
};

const EMPTY_DATA_STORE = {
  allSpecies: [] as ExplorerSpecies[],
  speciesById: new Map<string, ExplorerSpecies>(),
  speciesByOrdinal: [] as ExplorerSpecies[],
  countyIndex: {} as Record<string, CountyRecord>,
  presenceIndex: {} as ExplorerPresenceIndex,
  datasetSnapshot: EMPTY_DATASET_SNAPSHOT,
};

const PUBLIC_DATA_SNAPSHOT_DATE = "April 14, 2026";
const COUNTY_DATA_SOURCE_LINKS = [
  {
    label: "EDDMaps",
    href: "https://www.eddmaps.org/",
  },
  {
    label: "USGS NAS",
    href: "https://nas.er.usgs.gov/",
  },
] as const;

function AboutDataPanel({
  coverageSummary,
  isNavigating,
  variant,
}: {
  coverageSummary: ClientDataStorePayload["datasetSnapshot"]["coverageSummary"];
  isNavigating: boolean;
  variant: "horizontal" | "vertical";
}) {
  const isVertical = variant === "vertical";

  return (
    <div className="glass-panel rounded-[28px] p-5 text-sm leading-7 text-[var(--muted)]">
      <div
        className={`flex gap-4 ${
          isVertical
            ? "flex-col"
            : "flex-col lg:flex-row lg:items-start lg:justify-between lg:gap-8"
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
            About the data
          </p>
          <p className="mt-3">
            This release combines the full verified lower-48 invasive species
            catalog from US-RIIS with a merged county presence snapshot captured on{" "}
            {PUBLIC_DATA_SNAPSHOT_DATE}. County-level records currently come from
            EDDMaps and USGS NAS where verified public records are available.
          </p>
          <p className="mt-3">
            {coverageSummary ? (
              <>
                {coverageSummary.mappedSpeciesCount.toLocaleString()} of{" "}
                {coverageSummary.catalogSpeciesCount.toLocaleString()} catalog
                species currently have county-level source coverage. Counties marked
                with <strong> *</strong> still have some species whose county-level
                records are being filled in.
              </>
            ) : (
              <>
                Species marked <strong>Catalog</strong> are in the verified
                nationwide registry, and county-level source coverage is still being
                added.
              </>
            )}
          </p>
        </div>
        <div
          className={`rounded-[22px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4 ${
            isVertical ? "" : "lg:w-[340px] lg:shrink-0"
          }`}
        >
          <p className="text-sm leading-6 text-[var(--foreground)]">
            Data snapshot on {PUBLIC_DATA_SNAPSHOT_DATE} from
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {COUNTY_DATA_SOURCE_LINKS.map((source) => (
              <Link
                key={source.label}
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-medium tracking-[0.12em] text-[var(--foreground)] transition hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
              >
                {source.label}
              </Link>
            ))}
          </div>
          {isNavigating ? (
            <p className="mt-3 text-sm text-[var(--accent-strong)]">
              Updating URL state…
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function sortSpeciesByMappedCountyCount(species: ExplorerSpecies[]) {
  return [...species].sort((left, right) => {
    const leftCount = left.registry?.mappedCountyCount ?? 0;
    const rightCount = right.registry?.mappedCountyCount ?? 0;

    if (leftCount !== rightCount) {
      return rightCount - leftCount;
    }

    return left.commonName.localeCompare(right.commonName);
  });
}

function parseCategoriesParam(value: string | null, fallback: string | null) {
  const raw = value
    ? value.split(",")
    : fallback
      ? [fallback]
      : [];

  return raw.filter(Boolean) as SpeciesCategory[];
}

function buildZipInsight({
  zipLookup,
    focalSpecies,
    nearbySpecies,
    unresolvedCount,
  }: {
    zipLookup: ZipLookupResult | null;
    focalSpecies: ExplorerSpecies[];
    nearbySpecies: ExplorerSpecies[];
    unresolvedCount: number;
  }) {
  if (!zipLookup) return null;

  const topFocal = focalSpecies.slice(0, 3).map((species) => species.commonName);
  const topNearby = nearbySpecies.slice(0, 2).map((species) => species.commonName);
  const introSpecies = [...focalSpecies, ...nearbySpecies].find(
    (species) => species.registry?.introDateNumber,
  );
  const countyLabel = `${zipLookup.countyName}`;
  const seed = Number(zipLookup.zip) % 4;
  const gapNote =
    unresolvedCount > 0
      ? " County-level coverage is still being filled in for some matching species."
      : "";

  if (topFocal.length > 0) {
    const focalList = formatNaturalList(topFocal);

    const variants = [
      `${countyLabel} currently shows ${focalSpecies.length} mapped species in this view. The clearest ones to watch for are ${focalList}.${gapNote}`,
      `Around ${zipLookup.city}, the strongest current watchlist is ${focalList}.${topNearby.length ? ` ${formatNaturalList(topNearby)} is also mapped in nearby counties.` : ""}${gapNote}`,
      `${countyLabel} has verified county records for ${focalList}.${introSpecies?.registry?.introDateNumber ? ` ${introSpecies.commonName} is listed in the current national registry snapshot with an introduction year of ${introSpecies.registry.introDateNumber}.` : ""}${gapNote}`,
      `If you are checking your area first, start with ${focalList} in ${countyLabel}.${topNearby.length ? ` Nearby counties also show ${formatNaturalList(topNearby)}.` : ""}${gapNote}`,
    ];

    return {
      title: `Near ${zipLookup.zip}`,
      body: variants[seed],
    };
  }

  if (topNearby.length > 0) {
    return {
      title: `Near ${zipLookup.zip}`,
      body: `${countyLabel} does not show a direct county match for the current filters, but ${formatNaturalList(topNearby)} is verified nearby.${gapNote}`,
    };
  }

  return {
    title: `Near ${zipLookup.zip}`,
    body: `No county-level matches are visible for the current filters in ${countyLabel} right now. Try broadening the filters or clicking a nearby county for more context.${gapNote}`,
  };
}

export function MapExplorer({
  initialStore,
}: {
  initialStore?: ClientDataStorePayload;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, startTransition] = useTransition();

  const initialCategories = parseCategoriesParam(
    searchParams.get("categories"),
    searchParams.get("category"),
  );
  const initialSpeciesId = searchParams.get("species");
  const initialCounty = searchParams.get("county");
  const initialEnvironment = searchParams.get("environment") as EnvironmentTag | null;
  const initialQuery = searchParams.get("q") ?? "";

  const [selectedCategories, setSelectedCategories] =
    useState<SpeciesCategory[]>(initialCategories);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<string | null>(
    initialSpeciesId,
  );
  const [selectedEnvironment, setSelectedEnvironment] =
    useState<EnvironmentTag | null>(initialEnvironment);
  const [speciesQuery, setSpeciesQuery] = useState(initialQuery);
  const [selectedCountyFips, setSelectedCountyFips] = useState<string | null>(
    initialCounty,
  );
  const [zipInput, setZipInput] = useState("");
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [zipLookup, setZipLookup] = useState<ZipLookupResult | null>(null);
  const [isSearchingZip, setIsSearchingZip] = useState(false);
  const deferredSpeciesQuery = useDeferredValue(speciesQuery);
  const { store, error } = useClientDataStore(initialStore);
  const dataStore = store ?? EMPTY_DATA_STORE;
  const {
    allSpecies,
    countyIndex,
    presenceIndex,
    datasetSnapshot,
    speciesById,
    speciesByOrdinal,
  } = dataStore;

  useEffect(() => {
    if (!store) return;
    const selectedSpecies = selectedSpeciesId ? speciesById.get(selectedSpeciesId) : null;
    if (!selectedSpecies) return;

    if (!selectedCategories.includes(selectedSpecies.category)) {
      setSelectedCategories((current) =>
        current.length === 0 ? [selectedSpecies.category] : [...current, selectedSpecies.category],
      );
    }
  }, [selectedCategories, selectedSpeciesId, speciesById, store]);

  useEffect(() => {
    if (!store) return;
    if (selectedCountyFips && !countyIndex[selectedCountyFips]) {
      setSelectedCountyFips(null);
    }
  }, [countyIndex, selectedCountyFips, store]);

  useEffect(() => {
    const query = buildSearchParams({
      categories: selectedCategories.length ? selectedCategories.join(",") : null,
      species: selectedSpeciesId,
      county: selectedCountyFips,
      environment: selectedEnvironment,
      q: !selectedSpeciesId && speciesQuery ? speciesQuery : null,
    });
    const current = searchParams.toString();

    if (query === current) return;

    startTransition(() => {
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      router.replace(nextUrl as Parameters<typeof router.replace>[0], {
        scroll: false,
      });
    });
  }, [
    pathname,
    router,
    searchParams,
    selectedCategories,
    selectedCountyFips,
    selectedEnvironment,
    selectedSpeciesId,
    speciesQuery,
    zipInput,
    zipLookup?.zip,
  ]);

  const filters = useMemo<SpeciesFilters>(
    () => ({
      categories: selectedCategories,
      speciesId: selectedSpeciesId,
      environment: selectedEnvironment,
      query: selectedSpeciesId ? null : deferredSpeciesQuery,
    }),
    [
      selectedCategories,
      deferredSpeciesQuery,
      selectedEnvironment,
      selectedSpeciesId,
    ],
  );

  const speciesOptions = useMemo(() => {
    return allSpecies.filter((species) => {
      if (
        filters.categories?.length &&
        !filters.categories.includes(species.category)
      ) {
        return false;
      }
      if (
        filters.environment &&
        !species.registry?.environmentTags.includes(filters.environment)
      ) {
        return false;
      }
      return true;
    });
  }, [allSpecies, filters.categories, filters.environment]);

  const countyMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};

    for (const [countyFips, countyPresence] of Object.entries(presenceIndex)) {
      let count = 0;

      for (const speciesIndex of countyPresence) {
        const species = speciesByOrdinal[speciesIndex];
        if (species && speciesMatchesFilters(species, filters)) {
          count += 1;
        }
      }

      counts[countyFips] = count;
    }

    return counts;
  }, [filters, presenceIndex, speciesByOrdinal]);

  const matchingCountyFips = useMemo(
    () =>
      new Set(
        Object.entries(countyMatchCounts)
          .filter(([, count]) => count > 0)
          .map(([countyFips]) => countyFips),
      ),
    [countyMatchCounts],
  );

  const maxCountyMatchCount = useMemo(
    () => Math.max(0, ...Object.values(countyMatchCounts)),
    [countyMatchCounts],
  );

  const selectedCounty = getCountyRecord(countyIndex, selectedCountyFips);
  const neighborCountyFips = useMemo(
    () => selectedCounty?.neighborFips ?? [],
    [selectedCounty],
  );
  const focalSpecies = useMemo(
    () =>
      sortSpeciesByMappedCountyCount(
        getSpeciesForCounty(
          presenceIndex,
          speciesByOrdinal,
          selectedCountyFips,
          filters,
        ),
      ),
    [filters, presenceIndex, selectedCountyFips, speciesByOrdinal],
  );
  const nearbySpecies = useMemo(
    () =>
      sortSpeciesByMappedCountyCount(
        getSpeciesForCounties(
          presenceIndex,
          speciesByOrdinal,
          neighborCountyFips,
          filters,
        ).filter((species) => !focalSpecies.some((focal) => focal.id === species.id)),
      ),
    [filters, focalSpecies, neighborCountyFips, presenceIndex, speciesByOrdinal],
  );
  const speciesWithoutCountyCoverage = getSpeciesWithoutCountyCoverage(allSpecies, filters);
  const coverageSummary = datasetSnapshot.coverageSummary;
  const hasExpandedCountyDetail = Boolean(selectedCounty);
  const zipInsight = useMemo(
    () =>
      buildZipInsight({
        zipLookup,
        focalSpecies,
        nearbySpecies,
        unresolvedCount: speciesWithoutCountyCoverage.length,
      }),
    [focalSpecies, nearbySpecies, speciesWithoutCountyCoverage.length, zipLookup],
  );
  async function handleZipSearch() {
    if (zipInput.length !== 5) {
      setZipStatus("Enter a valid 5-digit U.S. ZIP code.");
      return;
    }

    setIsSearchingZip(true);
    setZipStatus(null);

    try {
      const response = await fetch("/api/lookup/zip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({ zip: zipInput }),
      });
      const payload = (await response.json()) as
        | { ok: true; data: ZipLookupResult }
        | { ok: false; message: string };

      if (!response.ok || !payload.ok) {
        setZipLookup(null);
        setZipStatus(payload.ok ? "ZIP lookup failed." : payload.message);
        return;
      }

      setZipLookup(payload.data);
      setSelectedCountyFips(payload.data.countyFips);
      setZipInput(payload.data.zip);
      setZipStatus(
        `${payload.data.zip} resolves to ${payload.data.countyName}. Nearby counties are outlined in amber.`,
      );
    } catch {
      setZipStatus("ZIP lookup failed. Try another ZIP or click a county on the map.");
    } finally {
      setIsSearchingZip(false);
    }
  }

  function handleCategoryToggle(nextCategory: SpeciesCategory) {
    setSelectedCategories((current) => {
      const exists = current.includes(nextCategory);
      const next = exists
        ? current.filter((category) => category !== nextCategory)
        : [...current, nextCategory];

      if (selectedSpeciesId) {
        const selectedSpecies = speciesById.get(selectedSpeciesId);
        if (selectedSpecies && next.length > 0 && !next.includes(selectedSpecies.category)) {
          setSelectedSpeciesId(null);
        }
      }

      return next;
    });
  }

  function handleClearCategories() {
    setSelectedCategories([]);
  }

  function handleSpeciesChange(nextSpeciesId: string | null) {
    setSelectedSpeciesId(nextSpeciesId);
    if (nextSpeciesId) {
      const selectedSpecies = speciesById.get(nextSpeciesId);
      if (selectedSpecies && !selectedCategories.includes(selectedSpecies.category)) {
        setSelectedCategories((current) =>
          current.length === 0
            ? [selectedSpecies.category]
            : [...current, selectedSpecies.category],
        );
      }
    }
  }

  function handleClearAll() {
    setSelectedCategories([]);
    setSelectedSpeciesId(null);
    setSelectedEnvironment(null);
    setSpeciesQuery("");
    setSelectedCountyFips(null);
    setZipInput("");
    setZipLookup(null);
    setZipStatus(null);
  }

  if (error) {
    return (
      <div className="mx-auto grid w-full max-w-[1600px] items-start gap-5 px-4 pb-12 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <div className="glass-panel rounded-[28px] p-6 text-sm text-[var(--muted)]">
          {error}
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="mx-auto grid w-full max-w-[1600px] items-start gap-5 px-4 pb-12 sm:px-6 lg:grid-cols-[360px_minmax(0,1fr)] lg:px-8">
        <div className="glass-panel rounded-[28px] p-6 text-sm text-[var(--muted)]">
          Loading local species and county snapshot…
        </div>
        <div className="glass-panel rounded-[28px] p-6 text-sm text-[var(--muted)]">
          Preparing the county explorer…
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 pb-12 sm:px-6 lg:px-8">
      <div className="grid items-start gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <MapToolbar
            categories={selectedCategories}
            environment={selectedEnvironment}
            speciesId={selectedSpeciesId}
            speciesQuery={speciesQuery}
            speciesOptions={speciesOptions}
            zipInput={zipInput}
            zipStatus={zipStatus}
            zipInsight={zipInsight}
            isSearching={isSearchingZip}
            onCategoryToggle={handleCategoryToggle}
            onClearCategories={handleClearCategories}
            onEnvironmentChange={setSelectedEnvironment}
            onSpeciesQueryChange={setSpeciesQuery}
            onSpeciesChange={handleSpeciesChange}
            onZipChange={setZipInput}
            onZipSearch={handleZipSearch}
            onClearAll={handleClearAll}
          />
          <div
            className={`overflow-hidden transition-all duration-300 ease-out ${
              hasExpandedCountyDetail
                ? "max-h-[900px] translate-y-0 opacity-100"
                : "max-h-0 -translate-y-2 opacity-0 pointer-events-none"
            }`}
          >
            <AboutDataPanel
              coverageSummary={coverageSummary}
              isNavigating={isNavigating}
              variant="vertical"
            />
          </div>
        </div>

        <div className="grid content-start self-start gap-5">
          <UsCountyMap
            countyIndex={countyIndex}
            presenceIndex={presenceIndex}
            selectedCountyFips={selectedCountyFips}
            neighboringCountyFips={neighborCountyFips}
            matchingCountyFips={matchingCountyFips}
            countyMatchCounts={countyMatchCounts}
            maxCountyMatchCount={maxCountyMatchCount}
            selectedCountyHasCoverageGaps={speciesWithoutCountyCoverage.length > 0}
            onCountySelect={setSelectedCountyFips}
          />
          <CountyInsightPanel
            selectedCounty={selectedCounty}
            selectedCategories={selectedCategories}
            focalSpecies={focalSpecies}
            nearbySpecies={nearbySpecies}
            speciesWithoutCountyCoverage={speciesWithoutCountyCoverage}
          />
        </div>
      </div>

      <div
        className={`mt-5 overflow-hidden transition-all duration-300 ease-out ${
          hasExpandedCountyDetail
            ? "max-h-0 translate-y-2 opacity-0 pointer-events-none"
            : "max-h-[900px] translate-y-0 opacity-100"
        }`}
      >
        <AboutDataPanel
          coverageSummary={coverageSummary}
          isNavigating={isNavigating}
          variant="horizontal"
        />
      </div>
    </div>
  );
}
