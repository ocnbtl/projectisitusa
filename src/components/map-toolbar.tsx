"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, ChevronDown, MapPin, Search, SlidersHorizontal, Sprout, X } from "lucide-react";
import stateRegistry from "@/data/research/state-registry.json";
import { CATEGORY_OPTIONS, ENVIRONMENT_OPTIONS } from "@/lib/constants";
import type { CountyRecord, EnvironmentTag, ExplorerSpecies, SpeciesCategory } from "@/lib/data/types";

interface MapToolbarProps {
  counties: Record<string, CountyRecord>;
  species: ExplorerSpecies[];
  categories: SpeciesCategory[];
  environment: EnvironmentTag | null;
  stateCode: string | null;
  speciesId: string | null;
  query: string;
  zipStatus: string | null;
  isSearching: boolean;
  layer: "reviewed" | "legacy";
  onLayerChange: (layer: "reviewed" | "legacy") => void;
  onCountySelect: (fips: string) => void;
  onStateChange: (stateCode: string | null) => void;
  onSpeciesSelect: (id: string | null) => void;
  onQueryChange: (query: string) => void;
  onCategoryToggle: (category: SpeciesCategory) => void;
  onEnvironmentChange: (environment: EnvironmentTag | null) => void;
  onZipSearch: (zip: string) => void;
  onClearFilters: () => void;
}

const states = stateRegistry.jurisdictions.filter(state => state.nationalV1Scope).sort((a, b) => a.stateName.localeCompare(b.stateName));
type SearchResult = { id: string; label: string; detail: string };

function SearchField({ kind, results, value, onChange, onChoose, onSubmit, busy = false }: {
  kind: "place" | "species"; results: SearchResult[]; value: string;
  onChange: (value: string) => void; onChoose: (id: string) => void;
  onSubmit?: (value: string) => void; busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const normalized = value.trim();
  const isZip = kind === "place" && /^\d{5}$/.test(normalized);
  const show = open && normalized.length >= 2;
  const options = isZip ? [{ id: normalized, label: `Find ZIP ${normalized}`, detail: "County lookup" }] : results;
  useEffect(() => {
    if (!show || active < 0) return;
    const list = document.getElementById(id);
    const option = document.getElementById(`${id}-${active}`);
    if (!list || !option) return;
    const top = option.offsetTop;
    const bottom = top + option.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [active, show, id]);
  useEffect(() => {
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  function choose(id: string) {
    if (isZip) onSubmit?.(id); else onChoose(id);
    setOpen(false); onChange(""); setActive(-1); input.current?.focus();
  }
  function submit() {
    if (options[active >= 0 ? active : 0]) choose(options[active >= 0 ? active : 0].id);
    else if (kind === "species" && normalized.length >= 2) { onSubmit?.(normalized); setOpen(false); }
  }
  const Icon = kind === "place" ? MapPin : Sprout;
  return <div ref={root} className="map-search-field" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <form className="atlas-search glass-panel" role="search" aria-label={kind === "place" ? "Find a place" : "Find a species"} onSubmit={event => { event.preventDefault(); submit(); }}>
      <Icon size={18} aria-hidden="true" />
      <input ref={input} role="combobox" aria-label={kind === "place" ? "Search county or ZIP" : "Search species"} aria-expanded={show} aria-controls={id} aria-autocomplete="list"
        aria-activedescendant={show && active >= 0 && options[active] ? `${id}-${active}` : undefined}
        placeholder={kind === "place" ? "County or ZIP" : "Search species"} value={value} autoComplete="off"
        onChange={event => { onChange(event.target.value); setActive(-1); setOpen(true); }} onFocus={() => setOpen(true)}
        onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); setActive(current => options.length ? Math.max(0, Math.min(options.length - 1, current + (event.key === "ArrowDown" ? 1 : -1))) : -1); }
        }} />
      {value ? <button type="button" aria-label={`Clear ${kind} search`} onClick={() => { onChange(""); setActive(-1); input.current?.focus(); }}><X size={16} /></button> : null}
      <button className="search-submit" type="submit" aria-label={kind === "place" ? "Find county" : "Find species"} disabled={busy || normalized.length < 2}><Search size={17} /></button>
    </form>
    {show ? <div className="search-results" id={id} role="listbox" aria-label={kind === "place" ? "Matching counties" : "Matching species"}>
      {options.length ? options.map((result, index) => <button id={`${id}-${index}`} key={result.id} type="button" role="option" aria-selected={active === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(result.id)}>
        <Icon size={17} aria-hidden="true" /><span><strong>{result.label}</strong><small>{result.detail}</small></span><ArrowUpRight size={15} aria-hidden="true" />
      </button>) : <div className="search-empty"><p>{kind === "place" ? "No county found. Try the county name with its state abbreviation, or a five-digit ZIP." : "No species found. Try a common or scientific name."}</p></div>}
    </div> : null}
  </div>;
}

export function MapToolbar(props: MapToolbarProps) {
  const [placeSearch, setPlaceSearch] = useState("");
  const [speciesSearch, setSpeciesSearch] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const filtersId = useId();
  const selectedSpecies = props.species.find(s => s.id === props.speciesId);
  const countyResults = useMemo(() => {
    const query = placeSearch.trim().toLowerCase();
    if (query.length < 2 || /^\d{5}$/.test(query)) return [];
    return Object.values(props.counties).filter(c => Number(c.countyFips.slice(0, 2)) < 60 && (!props.stateCode || c.stateCode === props.stateCode))
      .filter(c => `${c.name} ${c.stateCode}`.toLowerCase().includes(query)).slice(0, 8)
      .map(c => ({ id: c.countyFips, label: c.name, detail: c.stateCode }));
  }, [placeSearch, props.counties, props.stateCode]);
  const speciesResults = useMemo(() => {
    const query = speciesSearch.trim().toLowerCase();
    return query.length < 2 ? [] : props.species.filter(s => `${s.commonName} ${s.scientificName}`.toLowerCase().includes(query)).slice(0, 8)
      .map(s => ({ id: s.id, label: s.commonName, detail: s.scientificName }));
  }, [speciesSearch, props.species]);
  useEffect(() => {
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setFilterOpen(false); }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const filterCount = props.categories.length + Number(Boolean(props.environment));
  return <div className="atlas-toolbar" ref={root} onKeyDown={event => { if (event.key === "Escape" && filterOpen) { setFilterOpen(false); filterButton.current?.focus(); } }}>
    <div className="atlas-control-row">
      <SearchField kind="place" results={countyResults} value={placeSearch} onChange={setPlaceSearch} onChoose={props.onCountySelect} onSubmit={props.onZipSearch} busy={props.isSearching} />
      <SearchField kind="species" results={speciesResults} value={speciesSearch} onChange={setSpeciesSearch} onChoose={props.onSpeciesSelect} onSubmit={props.onQueryChange} />
      <label className="map-state-filter glass-panel"><span className="sr-only">Focus on a state</span><select aria-label="Focus on a state" value={props.stateCode ?? ""} onChange={event => props.onStateChange(event.target.value || null)}><option value="">All states</option>{states.map(state => <option key={state.stateCode} value={state.stateCode}>{state.stateName}</option>)}</select></label>
      <button ref={filterButton} type="button" className="filter-trigger glass-panel" aria-expanded={filterOpen} aria-controls={filtersId} onClick={() => setFilterOpen(!filterOpen)}><SlidersHorizontal size={16} aria-hidden="true" /> Filters {filterCount ? <span className="filter-count">{filterCount}</span> : null}<ChevronDown size={14} aria-hidden="true" /></button>
    </div>
    <div className="atlas-filter-row">
      {selectedSpecies ? <button className="filter-chip" type="button" onClick={() => props.onSpeciesSelect(null)} aria-label={`Remove ${selectedSpecies.commonName} filter`}>{selectedSpecies.commonName}<X size={14} aria-hidden="true" /></button> : null}
      {props.query ? <button className="filter-chip" type="button" onClick={() => props.onQueryChange("")} aria-label={`Remove search filter ${props.query}`}>{props.query}<X size={14} aria-hidden="true" /></button> : null}
      {props.categories.map(category => <button className="filter-chip" type="button" key={category} onClick={() => props.onCategoryToggle(category)} aria-label={`Remove ${CATEGORY_OPTIONS.find(c => c.value === category)?.label} filter`}>{CATEGORY_OPTIONS.find(c => c.value === category)?.label}<X size={14} aria-hidden="true" /></button>)}
      {props.environment ? <button className="filter-chip" type="button" onClick={() => props.onEnvironmentChange(null)} aria-label="Remove environment filter">{ENVIRONMENT_OPTIONS.find(e => e.value === props.environment)?.label}<X size={14} aria-hidden="true" /></button> : null}
    </div>
    {filterOpen ? <section className="atlas-filter-panel" id={filtersId} aria-label="Species filters">
      <div className="filter-heading"><h2>Refine the map</h2><button type="button" onClick={props.onClearFilters}>Clear filters</button></div>
      <fieldset><legend>Species groups</legend>{CATEGORY_OPTIONS.map(category => <label key={category.value}><input type="checkbox" checked={props.categories.includes(category.value)} onChange={() => props.onCategoryToggle(category.value)} /><span>{category.label}</span></label>)}</fieldset>
      <label className="environment-label">Environment<select value={props.environment ?? ""} onChange={event => props.onEnvironmentChange(event.target.value as EnvironmentTag || null)}>{ENVIRONMENT_OPTIONS.map(option => <option key={option.value ?? "all"} value={option.value ?? ""}>{option.label}</option>)}</select></label>
      <label className="environment-label">Records shown<select value={props.layer} onChange={event => props.onLayerChange(event.target.value as "reviewed" | "legacy")}><option value="reviewed">Reviewed research records</option><option value="legacy">Earlier map records</option></select></label>
      <button type="button" className="primary-button" onClick={() => { setFilterOpen(false); filterButton.current?.focus(); }}>Show map</button>
    </section> : null}
    {props.zipStatus || props.isSearching ? <p className="atlas-search-status" role="status">{props.isSearching ? "Finding your county..." : props.zipStatus}</p> : null}
  </div>;
}
