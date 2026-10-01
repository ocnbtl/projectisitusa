"use client";

import Image from "next/image";
import Link from "next/link";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Grid2X2, List, Rows3, Search, X } from "lucide-react";
import { CustomSelect } from "@/components/atlas/custom-select";
import { loadRuntimeData } from "@/lib/data/runtime-fetch";
import type { Species, SpeciesCategory } from "@/lib/data/types";
import { getDisplaySpecies, getSpeciesEditorial } from "@/lib/ui/species-editorial";
import { formatCategoryLabel } from "@/lib/utils";

import { NatureIcon, CATEGORY_NATURE } from "@/components/atlas/nature-icon";
import { DIRECTORY_CATEGORIES, DIRECTORY_PAGE_SIZES, readDirectoryState, type DirectoryView } from "@/lib/ui/species-directory-state";
// Reuse the validated catalog during a visit rather than remounting a loading skeleton.
let cachedCatalog: Species[] | null = null;
const categories = DIRECTORY_CATEGORIES;

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
            <span className="directory-image-placeholder"><NatureIcon kind={CATEGORY_NATURE[species.category]} width={30} height={30} /><small>{species.image ? "Photo unavailable" : "No photo yet"}</small></span>
          )}
        </div>
        <div className="directory-names">
          <h3>{species.commonName}</h3>
          <p><i>{species.scientificName}</i></p>
          <span className={"category-" + species.category}><NatureIcon kind={CATEGORY_NATURE[species.category]} width={17} height={17} />{formatCategoryLabel(species.category)}</span>
        </div>
        <ArrowUpRight className="directory-open-icon" size={18} aria-hidden="true" />
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
  const [catalog, setCatalog] = useState<Species[] | null>(() => cachedCatalog);
  const [error, setError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedCategories, setCategories] = useState<SpeciesCategory[]>([]);
  const [pageSize, setPageSize] = useState<number>(24);
  const [view, setView] = useState<DirectoryView>("rows");
  const [page, setPage] = useState(1);
  const [locationReady, setLocationReady] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function readLocation() {
      const state = readDirectoryState(window.location.search);
      setQuery(state.query); setCategories(state.categories); setPage(state.page);
      setPageSize(state.pageSize); setView(state.view);
      setLocationReady(true);
    }
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);

  useEffect(() => {
    if (cachedCatalog && loadAttempt === 0) return;
    let active = true;
    setError(false);
    void loadRuntimeData<unknown>("catalog").then(data => {
      if (!Array.isArray(data) || !data.every(isDirectorySpecies)) throw new Error("Invalid catalog");
      cachedCatalog = data.map(getDisplaySpecies).sort((a, b) => a.commonName.localeCompare(b.commonName, "en") || a.scientificName.localeCompare(b.scientificName, "en"));
      if (active) setCatalog(cachedCatalog);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [loadAttempt]);

  const matches = useMemo(() => {
    const search = deferredQuery.trim().toLocaleLowerCase("en-US");
    return (catalog ?? []).filter(species =>
      (!selectedCategories.length || selectedCategories.includes(species.category))
      && (!search || `${species.commonName} ${species.scientificName} ${species.displayGroup}`.toLocaleLowerCase("en-US").includes(search)));
  }, [catalog, selectedCategories, deferredQuery]);
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const hasFilters = Boolean(query || selectedCategories.length);

  useEffect(() => {
    if (!locationReady || !catalog) return;
    const url = new URL(window.location.href);
    if (deferredQuery.trim()) url.searchParams.set("q", deferredQuery.trim()); else url.searchParams.delete("q");
    if (selectedCategories.length) url.searchParams.set("category", selectedCategories.join(",")); else url.searchParams.delete("category");
    if (pageSize !== 24) url.searchParams.set("size", String(pageSize)); else url.searchParams.delete("size");
    if (view !== "rows") url.searchParams.set("view", view); else url.searchParams.delete("view");
    if (currentPage > 1) url.searchParams.set("page", String(currentPage)); else url.searchParams.delete("page");
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
  }, [catalog, selectedCategories, currentPage, pageSize, view, deferredQuery, locationReady]);

  function resetFilters() { setQuery(""); setCategories([]); setPage(1); searchInput.current?.focus(); }
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
        <div className="directory-category-tags" role="group" aria-label="Species categories">{categories.map(category => <button key={category} type="button" className={"category-" + category} aria-pressed={selectedCategories.includes(category)} onClick={() => { setCategories(current => current.includes(category) ? current.filter(value => value !== category) : [...current, category]); setPage(1); }}><NatureIcon kind={CATEGORY_NATURE[category]} width={23} height={23} /><span>{formatCategoryLabel(category)}</span></button>)}</div>
      </div>

      {hasFilters && <div className="directory-active-filters" aria-label="Active species filters">
        {query && <button type="button" onClick={() => { setQuery(""); setPage(1); searchInput.current?.focus(); }} aria-label={`Remove search ${query}`}><Search size={14} aria-hidden="true" /><span>{query}</span><X size={14} aria-hidden="true" /></button>}
        {selectedCategories.map(category => <button type="button" key={category} className={"category-" + category} onClick={() => { setCategories(current => current.filter(value => value !== category)); setPage(1); }} aria-label={`Remove ${formatCategoryLabel(category)} filter`}><span>{formatCategoryLabel(category)}</span><X size={14} aria-hidden="true" /></button>)}
        <button type="button" className="directory-clear-all" onClick={resetFilters}>Clear all</button>
      </div>}

      <div id="directory-results" aria-busy={!error && (catalog === null || query !== deferredQuery)}>
        {error ? (
          <div role="alert" className="directory-empty"><Search size={26} aria-hidden="true" /><h2>We could not load the species.</h2><p>Check your connection, then give it another try.</p><button type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)} className="primary-button">Try again</button></div>
        ) : catalog === null ? (
          <div className="directory-loading"><p role="status">Loading the species catalog...</p><div className="directory-skeleton" aria-hidden="true"><span /><span /><span /></div></div>
        ) : (
          <>
            <div className="directory-results-heading">
              <h2 ref={resultsHeading} tabIndex={-1}>{matches.length.toLocaleString()} species{hasFilters ? " found" : ""}</h2>
              <div><p role="status" aria-live="polite" aria-atomic="true">{matches.length ? `Showing ${start + 1}-${Math.min(start + pageSize, matches.length)} of ${matches.length.toLocaleString()}` : "No matching species"}</p></div>
            </div>
            <div className="directory-display-controls">
              <div className="directory-view-switch" role="group" aria-label="Species layout">{([{ value: "rows", label: "Comfortable rows", Icon: Rows3 }, { value: "compact", label: "Compact rows", Icon: List }, { value: "grid", label: "Grid", Icon: Grid2X2 }] as const).map(option => <button type="button" key={option.value} aria-label={option.label} title={option.label} aria-pressed={view === option.value} onClick={() => setView(option.value)}><option.Icon size={18} aria-hidden="true" /><span>{option.label}</span></button>)}</div>
              <CustomSelect label="Per page" compact value={String(pageSize)} options={DIRECTORY_PAGE_SIZES.map(value => ({ value: String(value), label: String(value) }))} onChange={value => { setPageSize(Number(value)); setPage(1); }} />
            </div>
            {matches.length ? (
              <div className={"directory-grid directory-view-" + view}>{matches.slice(start, start + pageSize).map(species => <DirectoryCard key={species.id} species={species} />)}</div>
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
