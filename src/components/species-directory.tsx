"use client";

import Image from "next/image";
import "@/components/species-names.css";
import { speciesNameMatches, matchedSpeciesName } from "@/lib/data/species-name-search";
import { SpeciesSearchControls } from "./species-search-controls";
import { PhotoCredit } from "./photo-credit";
import { track, resultBucket } from "@/lib/ui/telemetry";
import Link from "next/link";
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Globe2, ChevronLeft, ChevronRight, Grid2X2, List, Rows3, Search, X } from "lucide-react";
import { CustomSelect } from "@/components/atlas/custom-select";
import { loadRuntimeData } from "@/lib/data/runtime-fetch";
import type { EnvironmentTag, Species, SpeciesCategory } from "@/lib/data/types";
import { getDisplaySpecies, getSpeciesEditorial } from "@/lib/ui/species-editorial";
import { formatCategoryLabel } from "@/lib/utils";

import { ENVIRONMENT_OPTIONS } from "@/lib/constants";
import { toggleEnvironment } from "@/lib/data/environment-filters";
import { NatureIcon, EnvironmentIcon, CATEGORY_NATURE } from "@/components/atlas/nature-icon";
import { DIRECTORY_CATEGORIES, DIRECTORY_PAGE_SIZES, matchesEnvironment, readDirectoryState, type DirectoryView } from "@/lib/ui/species-directory-state";
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

function DirectoryCard({ species, view, query }: { species: Species; view: DirectoryView; query: string }) {
  const [imageFailed, setImageFailed] = useState(false);
  const { summary } = getSpeciesEditorial(species);
  const countyCount = species.registry?.mappedCountyCount;
  const countyLabel = countyCount === undefined ? "County records not available" : countyCount === 0 ? "No county records yet" : `${countyCount.toLocaleString()} ${countyCount === 1 ? "county" : "counties"}`;
  return (
    <article data-species-card={species.id} className={`directory-card refined-species-card ${!species.image || imageFailed ? "directory-without-photo" : ""}`}>
      <Link href={`/species/${species.slug}`} prefetch={false} className="directory-card-photo" aria-label={`View ${species.commonName} profile`} onClick={() => track("species_opened",{surface:"directory",species_id:species.id})}>
        <div className="directory-thumbnail">
          {species.image && !imageFailed ? <Image src={view !== "compact" ? species.image.src : species.image.thumbnail ?? species.image.src} alt={species.image.alt}
            width={450} height={450} sizes={view === "grid" ? "450px" : "160px"} unoptimized loading="lazy" onError={() => setImageFailed(true)} />
            : <span className="directory-image-placeholder"><NatureIcon kind={CATEGORY_NATURE[species.category]} width={30} height={30}/><small>{species.image ? "Photo unavailable" : "No photo yet"}</small></span>}
        </div>
      </Link>
      <div className="directory-card-names">
        <Link href={`/species/${species.slug}`} prefetch={false} onClick={() => track("species_opened",{surface:"directory",species_id:species.id})}><h3>{species.commonName}</h3><p><i>{species.scientificName}</i></p></Link>
        {matchedSpeciesName(species, query) && <p className="directory-name-match">{matchedSpeciesName(species, query)}</p>}
      </div>
      <div className="directory-card-meta"><span className={"category-" + species.category}><NatureIcon kind={CATEGORY_NATURE[species.category]} width={15} height={15}/>{formatCategoryLabel(species.category)}</span><small className="directory-county-count">{countyLabel}</small></div>
      {species.image && <div className="directory-card-credit"><PhotoCredit name={species.commonName} credit={species.image.credit} sourceUrl={species.image.sourceUrl} license={species.image.license}/></div>}
      {view === "rows" && summary && <p className="directory-summary">{summary}</p>}
      <Link href={`/species/${species.slug}`} prefetch={false} className="directory-profile-action" aria-label={`View profile for ${species.commonName}`} onClick={() => track("species_opened",{surface:"directory",species_id:species.id})}><span><span className="directory-action-verb">View </span>profile</span><ArrowRight size={16} aria-hidden="true"/></Link>
    </article>
  );
}

export function SpeciesDirectory() {
  const [catalog, setCatalog] = useState<Species[] | null>(() => cachedCatalog);
  const [error, setError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedCategories, setCategories] = useState<SpeciesCategory[]>([]);
  const [environment, setEnvironment] = useState<EnvironmentTag[]>([]);
  const [pageSize, setPageSize] = useState<number>(24);
  const [view, setView] = useState<DirectoryView>("rows");
  const [page, setPage] = useState(1);
  const [locationReady, setLocationReady] = useState(false);
  const deferredQuery = useDeferredValue(query);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const cards = useRef<HTMLDivElement>(null);
  const previousRects = useRef<Map<string, DOMRect> | null>(null);
  const layoutAnimations = useRef<Animation[]>([]);
  function changeView(next: DirectoryView) {
    if (next === view) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    previousRects.current = reduced ? null : new Map(
      Array.from(cards.current?.querySelectorAll<HTMLElement>("[data-species-card]") ?? [])
        .map(card => [card.dataset.speciesCard!, card.getBoundingClientRect()]));
    layoutAnimations.current.forEach(animation => animation.cancel());
    layoutAnimations.current = [];
    setView(next);
    track("directory_view_changed", { surface: "directory", view: next });
  }
  useLayoutEffect(() => {
    const before = previousRects.current;
    previousRects.current = null;
    if (!before || !cards.current) return;
    cards.current.querySelectorAll<HTMLElement>("[data-species-card]").forEach(card => {
      const from = before.get(card.dataset.speciesCard!);
      const to = card.getBoundingClientRect();
      if (!from || !to.width || !to.height || (from.top > innerHeight && to.top > innerHeight)) return;
      const animation = card.animate([
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`, transformOrigin: "top left" },
        { transform: "none", transformOrigin: "top left" },
      ], { duration: 480, easing: "cubic-bezier(.22,1,.36,1)" });
      layoutAnimations.current.push(animation);
    });
  }, [view]);
  useEffect(() => () => layoutAnimations.current.forEach(animation => animation.cancel()), []);

  useEffect(() => {
    function readLocation() {
      const state = readDirectoryState(window.location.search);
      setEnvironment(state.environment); setQuery(state.query); setCategories(state.categories); setPage(state.page);
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
      && matchesEnvironment(species, environment)
      && (!search || speciesNameMatches(species, search)));
  }, [catalog, selectedCategories, deferredQuery, environment]);
  useEffect(() => {
    if (!deferredQuery.trim() || !catalog) return;
    const timer = window.setTimeout(() => track("species_search_completed",{surface:"directory", result_bucket:resultBucket(matches.length), outcome:matches.length ? "found" : "empty"}), 900);
    return () => window.clearTimeout(timer);
  }, [deferredQuery, catalog, matches.length]);
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const hasFilters = Boolean(query || selectedCategories.length || environment.length);

  useEffect(() => {
    if (!locationReady || !catalog) return;
    const url = new URL(window.location.href);
    if (deferredQuery.trim()) url.searchParams.set("q", deferredQuery.trim()); else url.searchParams.delete("q");
    if (selectedCategories.length) url.searchParams.set("category", selectedCategories.join(",")); else url.searchParams.delete("category");
    if (environment.length) url.searchParams.set("environment", environment.join(",")); else url.searchParams.delete("environment");
    if (pageSize !== 24) url.searchParams.set("size", String(pageSize)); else url.searchParams.delete("size");
    if (view !== "rows") url.searchParams.set("view", view); else url.searchParams.delete("view");
    if (currentPage > 1) url.searchParams.set("page", String(currentPage)); else url.searchParams.delete("page");
    const next = url.pathname + url.search + url.hash;
    if (next !== window.location.pathname + window.location.search + window.location.hash) window.history.replaceState(window.history.state, "", next);
  }, [catalog, selectedCategories, currentPage, pageSize, view, deferredQuery, locationReady, environment]);

  function resetFilters() { setQuery(""); setCategories([]); setEnvironment([]); setPage(1); searchInput.current?.focus(); }
  function changePage(nextPage: number) {
    setPage(nextPage);
    resultsHeading.current?.focus({ preventScroll: true });
    resultsHeading.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }

  return (
    <section className="species-directory" aria-label="Search the species catalog">
      <SpeciesSearchControls value={query} onChange={value => { setQuery(value); setPage(1); }}
        inputRef={searchInput} filterCount={selectedCategories.length + environment.length}
        onReset={resetFilters} hasFilters={hasFilters}>
        <div className="directory-category-field"><span>Category</span><div className="directory-category-tags" role="group" aria-label="Species categories">{categories.map(category => <button key={category} type="button" className={"category-" + category} aria-pressed={selectedCategories.includes(category)} onClick={() => { setCategories(current => current.includes(category) ? current.filter(value => value !== category) : [...current, category]); setPage(1); }}><NatureIcon kind={CATEGORY_NATURE[category]} width={23} height={23} /><span>{formatCategoryLabel(category)}</span></button>)}</div></div>

      <div className="directory-environment-field" role="group" aria-label="Filter by environment"><span>Environments <small role="status">{environment.length ? `${environment.length} selected` : "All environments"}</small></span><div>{ENVIRONMENT_OPTIONS.map(option => <button key={option.value ?? "all"} type="button" aria-label={option.value ? option.label : "All environments"} aria-pressed={option.value ? environment.includes(option.value) : !environment.length} onClick={() => { const value = option.value; setEnvironment(current => value ? toggleEnvironment(current, value) : []); setPage(1); }}>{option.value ? <EnvironmentIcon kind={option.value} width={20} height={20}/> : !environment.length ? <Check size={20} aria-hidden="true"/> : <Globe2 size={20} aria-hidden="true"/>}<span>{option.value ? option.label : "All"}</span></button>)}</div></div>
      </SpeciesSearchControls>

      {hasFilters && <div className="directory-active-filters" aria-label="Active species filters">
        {query && <button type="button" onClick={() => { setQuery(""); setPage(1); searchInput.current?.focus(); }} aria-label={`Remove search ${query}`}><Search size={14} aria-hidden="true" /><span>{query}</span><X size={14} aria-hidden="true" /></button>}
        {selectedCategories.map(category => <button type="button" key={category} className={"category-" + category} onClick={() => { setCategories(current => current.filter(value => value !== category)); setPage(1); }} aria-label={`Remove ${formatCategoryLabel(category)} filter`}><span>{formatCategoryLabel(category)}</span><X size={14} aria-hidden="true" /></button>)}
        {environment.map(value => <button key={value} type="button" onClick={() => { setEnvironment(current => current.filter(item => item !== value)); setPage(1); }} aria-label={"Remove " + ENVIRONMENT_OPTIONS.find(option => option.value === value)?.label + " environment filter"}>{ENVIRONMENT_OPTIONS.find(option => option.value === value)?.label}<X size={14} aria-hidden="true"/></button>)}
        <button type="button" className="directory-clear-all" onClick={resetFilters}>Clear all</button>
      </div>}

      <div id="directory-results" aria-busy={!error && (catalog === null || query !== deferredQuery)}>
        {error ? (
          <div role="alert" className="directory-empty"><Search size={26} aria-hidden="true" /><h2>We could not load the species.</h2><p>Check your connection, then give it another try.</p><button type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)} className="primary-button">Try again</button></div>
        ) : catalog === null ? (
          <div className="directory-loading"><p role="status">Loading the species catalog...</p><div className="directory-skeleton" aria-hidden="true"><span /><span /><span /></div></div>
        ) : (
          <>
            <div className="directory-results-toolbar"><div className="directory-results-heading">
              <h2 ref={resultsHeading} tabIndex={-1}>{matches.length.toLocaleString()} species{hasFilters ? " found" : ""}</h2>
              <div><p role="status" aria-live="polite" aria-atomic="true">{matches.length ? `Showing ${start + 1}-${Math.min(start + pageSize, matches.length)} of ${matches.length.toLocaleString()}` : "No matching species"}</p></div>
            </div>
            <div className="directory-display-controls">
              <div className="directory-view-switch" data-view={view} role="group" aria-label="Species layout">{([{ value: "rows", label: "List", Icon: Rows3 }, { value: "compact", label: "Compact", Icon: List }, { value: "grid", label: "Grid", Icon: Grid2X2 }] as const).map(option => <button type="button" key={option.value} aria-label={option.label} title={option.label} aria-pressed={view === option.value} onClick={() => changeView(option.value)}><option.Icon size={18} aria-hidden="true" /><span>{option.label}</span></button>)}</div>
              <CustomSelect label="Per page" compact value={String(pageSize)} options={DIRECTORY_PAGE_SIZES.map(value => ({ value: String(value), label: String(value) }))} onChange={value => { setPageSize(Number(value)); setPage(1); }} />
            </div>
            </div>
            {matches.length ? (
              <div ref={cards} className={"directory-grid directory-view-" + view}>{matches.slice(start, start + pageSize).map(species => <DirectoryCard key={species.id} species={species} view={view} query={deferredQuery} />)}</div>
            ) : (
              <div className="directory-empty"><Search size={28} aria-hidden="true" /><h3>No match for that search.</h3><p>Try a shorter name, or clear a category or environment filter.</p><button type="button" onClick={resetFilters} className="primary-button">Start a new search</button></div>
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
