"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, MapPin, Search, SlidersHorizontal, Sprout, X } from "lucide-react";
import { CATEGORY_OPTIONS, ENVIRONMENT_OPTIONS } from "@/lib/constants";
import type { CountyRecord, EnvironmentTag, ExplorerSpecies, SpeciesCategory } from "@/lib/data/types";

interface MapToolbarProps {
  counties: Record<string, CountyRecord>;
  species: ExplorerSpecies[];
  categories: SpeciesCategory[];
  environment: EnvironmentTag | null;
  speciesId: string | null;
  query: string;
  zipStatus: string | null;
  isSearching: boolean;
  onCountySelect: (fips: string) => void;
  onSpeciesSelect: (id: string | null) => void;
  onQueryChange: (query: string) => void;
  onCategoryToggle: (category: SpeciesCategory) => void;
  onEnvironmentChange: (environment: EnvironmentTag | null) => void;
  onZipSearch: (zip: string) => void;
  onClearFilters: () => void;
}

export function MapToolbar(props: MapToolbarProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const resultsId = useId();
  const filtersId = useId();
  const selectedSpecies = props.species.find(s => s.id === props.speciesId);
  const normalized = search.trim().toLowerCase();
  const zip = /^\d{5}$/.test(normalized);
  const results = useMemo(() => {
    if (normalized.length < 2 || zip) return [];
    const counties = Object.values(props.counties).filter(c => Number(c.countyFips.slice(0, 2)) < 60).filter(c => `${c.name} ${c.stateCode} ${c.countyFips}`.toLowerCase().includes(normalized)).slice(0, 5).map(c => ({ id: c.countyFips, label: c.name, detail: c.stateCode, kind: "county" as const }));
    const species = props.species.filter(s => `${s.commonName} ${s.scientificName}`.toLowerCase().includes(normalized)).slice(0, 5).map(s => ({ id: s.id, label: s.commonName, detail: s.scientificName, kind: "species" as const }));
    return [...counties, ...species];
  }, [normalized, zip, props.counties, props.species]);
  useEffect(() => { setActive(-1); }, [search]);
  useEffect(() => {
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) { setOpen(false); setFilterOpen(false); } }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function choose(result: (typeof results)[number]) {
    if (result.kind === "county") props.onCountySelect(result.id); else props.onSpeciesSelect(result.id);
    setSearch(""); setOpen(false); input.current?.focus();
  }
  function submit() {
    if (zip) { props.onZipSearch(normalized); setOpen(false); }
    else if (active >= 0 && results[active]) choose(results[active]);
    else if (results[0]) choose(results[0]);
    else if (normalized.length >= 2) { props.onQueryChange(search.trim()); setOpen(false); }
  }
  const filterCount = props.categories.length + Number(Boolean(props.environment));
  return <div className="atlas-toolbar" ref={root} onKeyDown={event => { if (event.key === "Escape") { setOpen(false); setFilterOpen(false); input.current?.focus(); } }}>
    <form className="atlas-search glass-panel" role="search" onSubmit={event => { event.preventDefault(); submit(); }}>
      <Search size={20} aria-hidden="true" />
      <input ref={input} role="combobox" aria-label="Search county, ZIP, or species" aria-expanded={open && normalized.length >= 2} aria-controls={resultsId} aria-autocomplete="list" aria-activedescendant={open && active >= 0 && results[active] ? `${resultsId}-${active}` : undefined} placeholder="County, ZIP, or species" value={search}
        onChange={event => { setSearch(event.target.value); setOpen(true); setFilterOpen(false); }} onFocus={() => setOpen(true)}
        onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(current => results.length ? Math.max(0, Math.min(results.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))) : -1); } }} />
      {search ? <button type="button" aria-label="Clear search" onClick={() => { setSearch(""); input.current?.focus(); }}><X size={17} /></button> : <span className="search-key">Search</span>}
      <button className="search-submit" type="submit" aria-label="Find location or species" disabled={props.isSearching || normalized.length < 2}><ArrowUpRight size={20} /></button>
    </form>
    {open && normalized.length >= 2 ? <div className="search-results" id={resultsId} role="listbox" aria-label="Search results">
      {zip ? <button type="button" role="option" aria-selected={false} onClick={submit}><MapPin size={17} /><span><strong>Find ZIP {normalized}</strong><small>County lookup</small></span></button> : results.length ? results.map((result, index) => <button id={`${resultsId}-${index}`} key={`${result.kind}-${result.id}`} type="button" role="option" aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(result)}>
        {result.kind === "county" ? <MapPin size={17} /> : <Sprout size={17} />}<span><strong>{result.label}</strong><small>{result.detail}</small></span><em>{result.kind === "county" ? "County" : "Species"}</em>
      </button>) : <div className="search-empty"><p>No named locations or species found.</p><button type="button" onClick={() => { props.onQueryChange(search.trim()); setOpen(false); }}>Filter species by "{search}"</button></div>}
    </div> : null}
    <div className="atlas-filter-row">
      <button type="button" className="filter-trigger glass-panel" aria-expanded={filterOpen} aria-controls={filtersId} onClick={() => { setFilterOpen(!filterOpen); setOpen(false); }}><SlidersHorizontal size={16} /> Filters {filterCount ? <span className="filter-count">{filterCount}</span> : null}<ChevronDown size={14} /></button>
      {selectedSpecies ? <button className="filter-chip" type="button" onClick={() => props.onSpeciesSelect(null)} aria-label={`Remove ${selectedSpecies.commonName} filter`}>{selectedSpecies.commonName}<X size={14} /></button> : null}
      {props.query ? <button className="filter-chip" type="button" onClick={() => props.onQueryChange("")}>{props.query}<X size={14} /></button> : null}
      {props.categories.map(category => <button className="filter-chip" type="button" key={category} onClick={() => props.onCategoryToggle(category)}>{CATEGORY_OPTIONS.find(c => c.value === category)?.label}<X size={14} /></button>)}
      {props.environment ? <button className="filter-chip" type="button" onClick={() => props.onEnvironmentChange(null)}>{ENVIRONMENT_OPTIONS.find(e => e.value === props.environment)?.label}<X size={14} /></button> : null}
    </div>
    {filterOpen ? <section className="atlas-filter-panel" id={filtersId} aria-label="Species filters">
      <div className="filter-heading"><h2>Refine the map</h2><button type="button" onClick={props.onClearFilters}>Clear filters</button></div>
      <fieldset><legend>Species groups</legend>{CATEGORY_OPTIONS.map(category => <label key={category.value}><input type="checkbox" checked={props.categories.includes(category.value)} onChange={() => props.onCategoryToggle(category.value)} /><span>{category.label}</span></label>)}</fieldset>
      <label className="environment-label">Environment<select value={props.environment ?? ""} onChange={event => props.onEnvironmentChange(event.target.value as EnvironmentTag || null)}>{ENVIRONMENT_OPTIONS.map(option => <option key={option.value ?? "all"} value={option.value ?? ""}>{option.label}</option>)}</select></label>
      <button type="button" className="primary-button" onClick={() => setFilterOpen(false)}>Show map</button>
    </section> : null}
    {props.zipStatus || props.isSearching ? <p className="atlas-search-status" role="status">{props.isSearching ? "Finding your county..." : props.zipStatus}</p> : null}
  </div>;
}
