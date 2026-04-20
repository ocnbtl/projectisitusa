"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CountyCardDownload } from "@/components/county-card-download";
import { SpeciesCard } from "@/components/species-card";
import {
  buildCountyFilterLabel,
  buildCountyHeadline,
  buildCountyResourceLine,
  buildCountyStats,
  buildCountySummaryParagraphs,
  type CountyCategorySignal,
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
  selectedCategories: SpeciesCategory[];
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  countyCategorySignal: CountyCategorySignal | null;
  speciesWithoutCountyCoverage: ExplorerSpecies[];
}

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

export function CountyInsightPanel({
  selectedCounty,
  selectedCountyDetail,
  selectedCategories,
  focalSpecies,
  nearbySpecies,
  countyCategorySignal,
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
  const countyHeadline = selectedCounty
    ? buildCountyHeadline({
        county: selectedCounty,
        detail: selectedCountyDetail,
        focalSpecies,
      })
    : "";
  const countyParagraphs = selectedCounty
    ? buildCountySummaryParagraphs({
        county: selectedCounty,
        detail: selectedCountyDetail,
        focalSpecies,
        nearbySpecies,
        selectedCategories,
        categorySignal: countyCategorySignal,
      })
    : [];
  const countyStats = buildCountyStats({
    focalSpecies,
    nearbySpecies,
    categorySignal: countyCategorySignal,
  });
  const resourceLabels = buildCountyResourceLine(selectedCountyDetail);

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
          nearby counties, review local source strength, and export a share-ready
          county card.
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
          {speciesWithoutCountyCoverage.length > 0 ? (
            <p className="mt-3 max-w-3xl text-sm text-[var(--muted)]">
              The asterisk means some species in the current filter set still do
              not have verified county-level coverage attached yet.
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
          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)] xl:items-start">
            <div className="grid gap-5">
              <div className="grid grid-cols-3 gap-4 border-y border-[var(--border)] py-4">
                {countyStats.map((stat) => (
                  <div
                    key={`${stat.value}-${stat.caption}`}
                    className={`min-w-0 rounded-[24px] px-3 py-3 ${
                      stat.tone === "neutral"
                        ? ""
                        : "bg-[color:rgba(255,255,255,0.03)]"
                    }`}
                  >
                    <p className="text-[clamp(2rem,4vw,3.1rem)] font-semibold leading-none text-[var(--foreground)]">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-sm leading-5 text-[var(--muted)]">
                      {stat.caption}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid gap-4">
                <h3 className="font-[family-name:var(--font-display)] text-[clamp(2rem,4vw,3.2rem)] font-semibold leading-[1.02] text-[var(--foreground)]">
                  {countyHeadline}
                </h3>

                <div className="grid gap-4 text-[15px] leading-7 text-[var(--foreground)]">
                  {countyParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>

                {Array.isArray(resourceLabels) && resourceLabels.length > 0 ? (
                  <div className="overflow-x-auto pb-1">
                    <div className="flex min-w-max items-center gap-2 whitespace-nowrap">
                      {selectedCountyDetail?.resources.slice(0, 4).map((resource) => (
                        <Link
                          key={`${resource.kind}-${resource.url}`}
                          href={resource.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
                        >
                          {resource.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--muted)]">{resourceLabels}</p>
                )}
              </div>
            </div>

            <CountyCardDownload
              county={selectedCounty}
              detail={selectedCountyDetail}
              focalSpecies={focalSpecies}
              nearbySpecies={nearbySpecies}
              countyCategorySignal={countyCategorySignal}
              filterLabel={buildCountyFilterLabel(selectedCategories)}
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
