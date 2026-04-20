"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CountyCardDownload } from "@/components/county-card-download";
import { SpeciesCard } from "@/components/species-card";
import {
  buildCountyNarrative,
  buildCountyResourceSummary,
  buildCountyStats,
  formatCountyEvidenceLabel,
} from "@/lib/county-detail";
import type {
  CountyDetail,
  CountyRecord,
  ExplorerSpecies,
  SpeciesCategory,
} from "@/lib/data/types";
import { formatCategoryLabel } from "@/lib/utils";

interface CountyInsightPanelProps {
  selectedCounty: CountyRecord | null;
  selectedCountyDetail: CountyDetail | null;
  activeFilterLabel: string;
  selectedCategories: SpeciesCategory[];
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  speciesWithoutCountyCoverage: ExplorerSpecies[];
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function CountyInsightPanel({
  selectedCounty,
  selectedCountyDetail,
  activeFilterLabel,
  selectedCategories,
  focalSpecies,
  nearbySpecies,
  speciesWithoutCountyCoverage,
}: CountyInsightPanelProps) {
  const unresolvedPreview = speciesWithoutCountyCoverage.slice(0, 12);
  const [viewMode, setViewMode] = useState<"summary" | "county" | "nearby">("summary");
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZE_OPTIONS)[number]>(10);
  const [page, setPage] = useState(1);

  const activeSpecies = viewMode === "county" ? focalSpecies : nearbySpecies;
  const metricMax = useMemo(
    () => Math.max(0, ...activeSpecies.map((species) => species.registry?.mappedCountyCount ?? 0)),
    [activeSpecies],
  );
  const totalPages = Math.max(1, Math.ceil(activeSpecies.length / pageSize));
  const pageStart = activeSpecies.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, activeSpecies.length);
  const pagedSpecies = activeSpecies.slice(pageStart === 0 ? 0 : pageStart - 1, pageEnd);
  const evidenceLabel = formatCountyEvidenceLabel(
    selectedCountyDetail?.evidenceLevel ?? "not-reviewed",
  );
  const narrative = selectedCounty
    ? buildCountyNarrative({
        county: selectedCounty,
        detail: selectedCountyDetail,
        focalSpecies,
        nearbySpecies,
        unresolvedCount: speciesWithoutCountyCoverage.length,
        selectedCategories,
      })
    : "";
  const countyStats = buildCountyStats({
    detail: selectedCountyDetail,
    focalSpecies,
    nearbySpecies,
    unresolvedCount: speciesWithoutCountyCoverage.length,
  });
  const resourceSummary = buildCountyResourceSummary(selectedCountyDetail);

  useEffect(() => {
    setViewMode("summary");
    setPage(1);
  }, [selectedCounty?.countyFips]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, viewMode, focalSpecies.length, nearbySpecies.length]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  if (!selectedCounty) {
    return (
      <aside className="glass-panel rounded-[28px] p-5">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
          Local insight
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--foreground)]">
          Select a county or enter a ZIP code.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--muted)]">
          Click any county to inspect the current invasive species dataset, compare
          nearby counties, review county-specific source strength, and export a
          share-ready county card.
        </p>
      </aside>
    );
  }

  return (
    <aside className="glass-panel rounded-[28px] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
            County detail
          </p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--foreground)]">
            {selectedCounty.name}, {selectedCounty.stateCode}
            {speciesWithoutCountyCoverage.length > 0 ? " *" : ""}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--foreground)]">
              {evidenceLabel}
            </span>
            <span className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-1.5 text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
              {activeFilterLabel}
            </span>
          </div>
          {speciesWithoutCountyCoverage.length > 0 ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Confirmed county-level records are shown below. The asterisk means
              some species in the current filter set still do not have verified
              county-level source coverage attached yet.
            </p>
          ) : null}
        </div>
        {selectedCategories.length === 1 ? (
          <div className="rounded-full border border-[var(--border)] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            {formatCategoryLabel(selectedCategories[0])}
          </div>
        ) : selectedCategories.length > 1 ? (
          <div className="inline-flex whitespace-nowrap rounded-full border border-[var(--border)] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[var(--muted)]">
            {selectedCategories.length} categories
          </div>
        ) : null}
      </div>

      <div className="mt-5 grid gap-6">
        <div className="inline-flex w-fit rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
          <button
            type="button"
            onClick={() => setViewMode("summary")}
            className={`rounded-full px-4 py-2 text-sm transition ${
              viewMode === "summary"
                ? "bg-[var(--accent)] text-[var(--background)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Summary
          </button>
          <button
            type="button"
            onClick={() => setViewMode("county")}
            className={`rounded-full px-4 py-2 text-sm transition ${
              viewMode === "county"
                ? "bg-[var(--accent)] text-[var(--background)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            In this county ({focalSpecies.length.toLocaleString()})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("nearby")}
            className={`rounded-full px-4 py-2 text-sm transition ${
              viewMode === "nearby"
                ? "bg-[var(--accent)] text-[var(--background)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            Nearby-only watchlist ({nearbySpecies.length.toLocaleString()})
          </button>
        </div>

        {viewMode === "summary" ? (
          <section className="grid gap-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  County summary
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                  {narrative}
                </p>
              </div>

              <div className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[var(--muted)]">
                  Verified resources
                </p>
                <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
                  {resourceSummary}
                </p>
                {selectedCountyDetail?.resources?.length ? (
                  <ul className="mt-4 grid gap-3">
                    {selectedCountyDetail.resources.map((resource) => (
                      <li
                        key={`${resource.kind}-${resource.url}`}
                        className="rounded-[18px] border border-[var(--border)] bg-[var(--background)] px-4 py-3"
                      >
                        <Link
                          href={resource.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-[var(--foreground)] underline decoration-[color:rgba(79,143,102,0.4)] underline-offset-4"
                        >
                          {resource.label}
                        </Link>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                          {resource.kind.replaceAll("-", " ")}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mt-4 rounded-[18px] border border-dashed border-[var(--border)] px-4 py-4 text-sm text-[var(--muted)]">
                    County-specific resource links have not been curated yet for this county.
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {countyStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
                >
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold text-[var(--foreground)]">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    {stat.note}
                  </p>
                </div>
              ))}
            </div>

            <CountyCardDownload
              county={selectedCounty}
              detail={selectedCountyDetail}
              focalSpeciesCount={focalSpecies.length}
              nearbySpeciesCount={nearbySpecies.length}
              unresolvedCount={speciesWithoutCountyCoverage.length}
              filterLabel={activeFilterLabel}
            />
          </section>
        ) : (
          <section className="grid gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--foreground)]">
                  {viewMode === "county" ? "In this county" : "Nearby-only watchlist"}
                </h3>
                <p className="text-sm text-[var(--muted)]">
                  {viewMode === "county"
                    ? "Species directly associated with the selected county."
                    : "Species mapped in neighboring counties but not currently attached to the selected county."}
                </p>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-sm text-[var(--muted)]">
                  {activeSpecies.length.toLocaleString()} found
                </div>
                <label className="flex items-center gap-3 text-sm text-[var(--muted)]">
                  <span>Per page</span>
                  <select
                    value={pageSize}
                    onChange={(event) =>
                      setPageSize(Number(event.target.value) as (typeof PAGE_SIZE_OPTIONS)[number])
                    }
                    className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] outline-none"
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {activeSpecies.length > 0 ? (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-[var(--muted)]">
                    Showing {pageStart.toLocaleString()}-{pageEnd.toLocaleString()} of{" "}
                    {activeSpecies.length.toLocaleString()}
                  </div>
                  {totalPages > 1 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                        disabled={page === 1}
                        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-[var(--muted)]">
                        Page {page.toLocaleString()} of {totalPages.toLocaleString()}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                        disabled={page === totalPages}
                        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3">
                  {pagedSpecies.map((species) => (
                    <SpeciesCard
                      key={`${viewMode}-${species.id}`}
                      species={species}
                      metricMax={metricMax}
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-[24px] border border-dashed border-[var(--border)] px-4 py-5 text-sm text-[var(--muted)]">
                {viewMode === "county"
                  ? "No species in the current dataset match this county and filter combination."
                  : "No nearby-only watchlist matches are currently verified for this filter combination."}
              </div>
            )}

            {speciesWithoutCountyCoverage.length > 0 ? (
              <section className="grid gap-3">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-[var(--foreground)]">
                      County coverage still missing
                    </h3>
                    <p className="text-sm text-[var(--muted)]">
                      These species match the current filters, but county-level records
                      are still being verified or attached from public sources.
                    </p>
                  </div>
                  <div className="text-sm text-[var(--muted)]">
                    {speciesWithoutCountyCoverage.length} unresolved
                  </div>
                </div>
                <div className="rounded-[24px] border border-dashed border-[var(--border)] px-4 py-4">
                  <ul className="grid gap-2 md:grid-cols-2">
                    {unresolvedPreview.map((species) => (
                      <li
                        key={species.id}
                        className="flex items-start justify-between gap-3 text-sm text-[var(--foreground)]"
                      >
                        <span>{species.commonName}</span>
                        <span className="text-[var(--muted)]">
                          <em>{species.scientificName}</em>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {speciesWithoutCountyCoverage.length > unresolvedPreview.length ? (
                    <p className="mt-4 text-sm text-[var(--muted)]">
                      Showing {unresolvedPreview.length} of{" "}
                      {speciesWithoutCountyCoverage.length.toLocaleString()} species
                      still missing county-level coverage for this filter set.
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}
          </section>
        )}
      </div>
    </aside>
  );
}
