"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import { loadRuntimeData } from "@/lib/data/runtime-fetch";
import type { Species, SpeciesCategory } from "@/lib/data/types";
import { formatCategoryLabel } from "@/lib/utils";

const PAGE_SIZE = 24;
const categories: SpeciesCategory[] = ["plants", "insects", "wildlife", "fungi-diseases"];

function isDirectorySpecies(value: unknown): value is Species {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<Species>;
  return typeof entry.id === "string"
    && typeof entry.slug === "string"
    && typeof entry.commonName === "string"
    && typeof entry.scientificName === "string"
    && typeof entry.displayGroup === "string"
    && typeof entry.summary === "string"
    && categories.includes(entry.category as SpeciesCategory);
}

function DirectoryCard({ species }: { species: Species }) {
  const [imageFailed, setImageFailed] = useState(false);
  const summary = species.profileType === "registry" && species.registry
    ? `${species.displayGroup}${species.registry.family ? ` in the ${species.registry.family} family` : ""}. ${species.registry.habitats.length ? `Recorded habitats: ${species.registry.habitats.slice(0, 2).join(" and ")}.` : `Listed as ${species.registry.statusLabel.toLowerCase()} by US-RIIS (lower 48).`}`
    : species.summary;

  return (
    <article className="directory-card flex min-w-0 flex-col gap-4 p-5">
      <div className="flex items-start gap-4">
        <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--background)]">
          {species.image && !imageFailed ? (
            <Image
              src={species.image.thumbnail ?? species.image.src}
              alt={species.image.alt}
              width={96}
              height={96}
              sizes="96px"
              className="h-full w-full object-cover"
              unoptimized
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <span className="px-3 text-center text-xs leading-5 text-[var(--muted)]">
              {species.image ? "Image unavailable" : "No image"}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold leading-snug">
            <Link href={`/species/${species.slug}`} prefetch={false} className="text-link">
              {species.commonName}
            </Link>
          </h3>
          <p className="mt-1 break-words text-sm italic leading-6 text-[var(--muted)]">
            {species.scientificName}
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">{formatCategoryLabel(species.category)}</p>
        </div>
      </div>
      <p className="directory-summary text-sm leading-6 text-[var(--muted)]">{summary}</p>
      {species.image ? (
        <details className="image-credit mt-auto text-xs text-[var(--muted)]">
          <summary className="inline-flex min-h-11 cursor-pointer items-center underline decoration-[var(--border)] underline-offset-4" aria-label={`Photo credit for ${species.commonName}`}>
            Photo credit
          </summary>
          <p className="break-words pb-2 text-xs leading-5">{species.image.credit}</p>
        </details>
      ) : null}
    </article>
  );
}

export function SpeciesDirectory() {
  const [catalog, setCatalog] = useState<Species[] | null>(null);
  const [error, setError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<SpeciesCategory | "all">("all");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query);
  const resultsHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    setError(false);
    void loadRuntimeData<unknown>("catalog")
      .then((data) => {
        if (!Array.isArray(data) || !data.every(isDirectorySpecies)) {
          throw new Error("The species catalog has an invalid shape.");
        }
        if (active) {
          setCatalog([...data].sort((a, b) =>
            a.commonName.localeCompare(b.commonName, "en")
            || a.scientificName.localeCompare(b.scientificName, "en")));
        }
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => { active = false; };
  }, [loadAttempt]);

  const matches = useMemo(() => {
    const search = deferredQuery.trim().toLocaleLowerCase("en-US");
    return (catalog ?? []).filter((species) =>
      (category === "all" || species.category === category)
      && (!search || `${species.commonName} ${species.scientificName} ${species.displayGroup}`
        .toLocaleLowerCase("en-US").includes(search)));
  }, [catalog, category, deferredQuery]);
  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const visibleSpecies = matches.slice(start, start + PAGE_SIZE);

  function resetFilters() {
    setQuery("");
    setCategory("all");
    setPage(1);
  }

  function changePage(nextPage: number) {
    setPage(nextPage);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }

  return (
    <section className="species-directory" aria-label="Search the species catalog">
      <div className="reading-section flex flex-col gap-5 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="directory-search" className="mb-2 block text-sm font-medium">
            Search species
          </label>
          <div className="relative">
            <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              id="directory-search"
              type="search"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              placeholder="Common or scientific name"
              aria-controls="directory-results"
              className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] py-3 pl-11 pr-4 text-base"
            />
          </div>
        </div>
        <div className="sm:w-56">
          <label htmlFor="directory-category" className="mb-2 block text-sm font-medium">
            Category
          </label>
          <select
            id="directory-category"
            value={category}
            onChange={(event) => { setCategory(event.target.value as SpeciesCategory | "all"); setPage(1); }}
            aria-controls="directory-results"
            className="min-h-12 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-base"
          >
            <option value="all">All categories</option>
            {categories.map((value) => <option key={value} value={value}>{formatCategoryLabel(value)}</option>)}
          </select>
        </div>
      </div>

      {error ? (
        <div role="alert" className="reading-section">
          <h2 className="text-xl font-semibold">The catalog could not be loaded.</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
            Check your connection and try again. No species results are available until the catalog loads.
          </p>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)} className="primary-button mt-4">
            Try again
          </button>
        </div>
      ) : catalog === null ? (
        <p role="status" className="reading-section text-[var(--muted)]">Loading the species catalog...</p>
      ) : (
        <div id="directory-results" aria-busy={query !== deferredQuery}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 ref={resultsHeading} tabIndex={-1} className="scroll-mt-24 text-lg font-semibold">
              {matches.length.toLocaleString()} species
              {query || category !== "all" ? " found" : " in the catalog"}
            </h2>
            <p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-[var(--muted)]">
              {matches.length ? `Showing ${start + 1} to ${Math.min(start + PAGE_SIZE, matches.length)} of ${matches.length.toLocaleString()}` : "No matching species"}
            </p>
          </div>
          {matches.length ? (
            <div className="directory-grid grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleSpecies.map((species) => <DirectoryCard key={species.id} species={species} />)}
            </div>
          ) : (
            <div className="reading-section py-10">
              <p className="text-lg font-medium">No match for this search.</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Try a shorter name, check the spelling, or search all categories.</p>
              <button type="button" onClick={resetFilters} className="text-link mt-4 min-h-11">Clear search and filters</button>
            </div>
          )}
          {totalPages > 1 ? (
            <nav aria-label="Species pages" className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--border)] pt-6">
              <button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)} className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">
                Previous
              </button>
              <span className="text-center text-sm text-[var(--muted)]">Page {currentPage} of {totalPages}</span>
              <button type="button" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)} className="min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">
                Next
              </button>
            </nav>
          ) : null}
        </div>
      )}
    </section>
  );
}
