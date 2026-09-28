"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Bird, Bug, ChevronLeft, ChevronRight, Leaf, Microscope, Search, X } from "lucide-react";
import { loadRuntimeData } from "@/lib/data/runtime-fetch";
import type { Species, SpeciesCategory } from "@/lib/data/types";
import { getDisplaySpecies, getSpeciesEditorial } from "@/lib/ui/species-editorial";
import { formatCategoryLabel } from "@/lib/utils";

const PAGE_SIZE = 24;
const categories: SpeciesCategory[] = ["plants", "insects", "wildlife", "fungi-diseases"];
const categoryIcons = { plants: Leaf, insects: Bug, wildlife: Bird, "fungi-diseases": Microscope };

function isDirectorySpecies(value: unknown): value is Species {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<Species>;
  return typeof entry.id === "string" && typeof entry.slug === "string"
    && typeof entry.commonName === "string" && typeof entry.scientificName === "string"
    && typeof entry.displayGroup === "string" && typeof entry.summary === "string"
    && categories.includes(entry.category as SpeciesCategory);
}

function DirectoryCard({ species }: { species: Species }) {
  const [imageFailed, setImageFailed] = useState(false);
  const Icon = categoryIcons[species.category];
  const { summary } = getSpeciesEditorial(species);
  return (
    <article className="directory-card">
      <Link href={`/species/${species.slug}`} prefetch={false} className="directory-profile-link">
        <div className="directory-thumbnail">
          {species.image && !imageFailed ? (
            <Image src={species.image.thumbnail ?? species.image.src} alt={species.image.alt}
              width={112} height={112} sizes="112px" unoptimized loading="lazy"
              onError={() => setImageFailed(true)} />
          ) : (
            <span className="directory-image-placeholder"><Icon size={30} strokeWidth={1.3} aria-hidden="true" /><small>{species.image ? "Photo unavailable" : "No photo yet"}</small></span>
          )}
        </div>
        <div className="directory-names">
          <h3>{species.commonName}</h3>
          <p><i>{species.scientificName}</i></p>
          <span className={"category-" + species.category}><Icon size={13} aria-hidden="true" />{formatCategoryLabel(species.category)}</span>
        </div>
      </Link>
      {summary && <p className="directory-summary">{summary}</p>}
      {species.image && (
        <details className="image-credit">
          <summary aria-label={`Photo credit for ${species.commonName}`}>Photo credit</summary>
          <p>{species.image.credit}</p>
        </details>
      )}
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
  const [locationReady, setLocationReady] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function readLocation() {
      const params = new URLSearchParams(window.location.search);
      const selectedCategory = params.get("category") as SpeciesCategory;
      setQuery((params.get("q") ?? "").slice(0, 200));
      setCategory(categories.includes(selectedCategory) ? selectedCategory : "all");
      const requestedPage = Number(params.get("page"));
      setPage(Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
      setLocationReady(true);
    }
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);

  useEffect(() => {
    let active = true;
    setError(false);
    void loadRuntimeData<unknown>("catalog").then(data => {
      if (!Array.isArray(data) || !data.every(isDirectorySpecies)) throw new Error("Invalid catalog");
      if (active) setCatalog(data.map(getDisplaySpecies).sort((a, b) => a.commonName.localeCompare(b.commonName, "en") || a.scientificName.localeCompare(b.scientificName, "en")));
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [loadAttempt]);

  const matches = useMemo(() => {
    const search = deferredQuery.trim().toLocaleLowerCase("en-US");
    return (catalog ?? []).filter(species =>
      (category === "all" || species.category === category)
      && (!search || `${species.commonName} ${species.scientificName} ${species.displayGroup}`.toLocaleLowerCase("en-US").includes(search)));
  }, [catalog, category, deferredQuery]);
  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const hasFilters = Boolean(query || category !== "all");

  useEffect(() => {
    if (!locationReady || !catalog) return;
    const url = new URL(window.location.href);
    if (deferredQuery.trim()) url.searchParams.set("q", deferredQuery.trim()); else url.searchParams.delete("q");
    if (category !== "all") url.searchParams.set("category", category); else url.searchParams.delete("category");
    if (currentPage > 1) url.searchParams.set("page", String(currentPage)); else url.searchParams.delete("page");
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
  }, [catalog, category, currentPage, deferredQuery, locationReady]);

  function resetFilters() { setQuery(""); setCategory("all"); setPage(1); searchInput.current?.focus(); }
  function changePage(nextPage: number) {
    setPage(nextPage);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }

  return (
    <section className="species-directory" aria-label="Search the species catalog">
      <div className="directory-controls">
        <div className="directory-search-label">
          <label htmlFor="directory-search">Search species</label>
          <div className="directory-search-input"><Search size={19} aria-hidden="true" />
            <input ref={searchInput} id="directory-search" type="search" value={query} maxLength={200}
              onChange={event => { setQuery(event.target.value); setPage(1); }}
              placeholder="Common or scientific name" aria-controls="directory-results" />
            {query && <button type="button" onClick={() => { setQuery(""); setPage(1); searchInput.current?.focus(); }} aria-label="Clear species search"><X size={18} aria-hidden="true" /></button>}
          </div>
        </div>
        <label className="directory-category-label" htmlFor="directory-category"><span>Category</span>
          <select id="directory-category" value={category}
            onChange={event => { setCategory(event.target.value as SpeciesCategory | "all"); setPage(1); }}
            aria-controls="directory-results">
            <option value="all">All categories</option>
            {categories.map(value => <option key={value} value={value}>{formatCategoryLabel(value)}</option>)}
          </select>
        </label>
      </div>

      <div id="directory-results" aria-busy={!error && (catalog === null || query !== deferredQuery)}>
        {error ? (
          <div role="alert" className="directory-empty"><Search size={26} aria-hidden="true" /><h2>We could not load the species.</h2><p>Check your connection, then give it another try.</p><button type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)} className="primary-button">Try again</button></div>
        ) : catalog === null ? (
          <div className="directory-loading"><p role="status">Loading the species catalog...</p><div className="directory-skeleton" aria-hidden="true"><span /><span /><span /></div></div>
        ) : (
          <>
            <div className="directory-results-heading">
              <h2 ref={resultsHeading} tabIndex={-1}>{matches.length.toLocaleString()} species{hasFilters ? " found" : ""}</h2>
              <div><p role="status" aria-live="polite" aria-atomic="true">{matches.length ? `${start + 1}-${Math.min(start + PAGE_SIZE, matches.length)} of ${matches.length.toLocaleString()}` : "No matching species"}</p>{hasFilters && <button type="button" onClick={resetFilters} className="text-link">Clear filters</button>}</div>
            </div>
            {matches.length ? (
              <div className="directory-grid">{matches.slice(start, start + PAGE_SIZE).map(species => <DirectoryCard key={species.id} species={species} />)}</div>
            ) : (
              <div className="directory-empty"><Search size={28} aria-hidden="true" /><h3>No match for that search.</h3><p>Try a shorter name or search all categories.</p><button type="button" onClick={resetFilters} className="primary-button">Start a new search</button></div>
            )}
            {totalPages > 1 && (
              <nav aria-label="Species pages" className="directory-pagination">
                <button type="button" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}><ChevronLeft size={17} aria-hidden="true" />Previous</button>
                <span>Page {currentPage} of {totalPages}</span>
                <button type="button" disabled={currentPage === totalPages} onClick={() => changePage(currentPage + 1)}>Next<ChevronRight size={17} aria-hidden="true" /></button>
              </nav>
            )}
          </>
        )}
      </div>
    </section>
  );
}
