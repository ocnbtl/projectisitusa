"use client";
import Image from "next/image";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Bird, Bug, Building2, Check, ChevronDown, Fish, Leaf, MapPin, Microscope, Mountain, Search, SlidersHorizontal, Sprout, Trees, Waves, Wheat, X } from "lucide-react";
import { StatePicker } from "@/components/atlas/state-picker";
import { CATEGORY_OPTIONS, ENVIRONMENT_OPTIONS } from "@/lib/constants";
import type { CountyRecord, EnvironmentTag, ExplorerSpecies, SpeciesCategory } from "@/lib/data/types";

interface MapToolbarProps {
  counties: Record<string, CountyRecord>; species: ExplorerSpecies[];
  countyCounts: Record<string, number>; speciesCounts: Record<string, number>; dataReady: boolean;
  categories: SpeciesCategory[]; environment: EnvironmentTag | null; stateCode: string | null;
  speciesId: string | null; query: string; zipStatus: string | null; isSearching: boolean;
  onCountySelect: (fips: string) => void; onStateChange: (state: string | null) => void;
  onSpeciesSelect: (id: string | null) => void; onQueryChange: (query: string) => void;
  onCategoryToggle: (category: SpeciesCategory) => void; onEnvironmentChange: (value: EnvironmentTag | null) => void;
  onApplyFilters: (categories: SpeciesCategory[], environment: EnvironmentTag | null) => void;
  onZipSearch: (zip: string) => void; onClearFilters: () => void;
}
type SearchResult = { id: string; label: string; detail: string; image?: string; credit?: string; count?: string };
const categoryIcons = { plants: Leaf, insects: Bug, wildlife: Bird, "fungi-diseases": Microscope };
const environmentIcons = { land: Mountain, freshwater: Fish, "marine-coastal": Waves, wetlands: Sprout, forest: Trees, agriculture: Wheat, urban: Building2 };
function SearchAvatar({ src, kind }: { src?: string; kind: "place" | "species" }) {
  const [failed, setFailed] = useState(false);
  const Icon = kind === "place" ? MapPin : Leaf;
  return <span className="search-avatar">{src && !failed ? <Image src={src} alt="" width={40} height={40} unoptimized onError={() => setFailed(true)} /> : <Icon size={19} />}</span>;
}
function SearchField({ kind, results, value, onChange, onChoose, onSubmit, busy = false }: {
  kind: "place" | "species"; results: SearchResult[]; value: string; onChange: (value: string) => void;
  onChoose: (id: string) => void; onSubmit?: (value: string) => void; busy?: boolean;
}) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1);
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const id = useId(), normalized = value.trim(), isZip = kind === "place" && /^\d{5}$/.test(normalized);
  const options: SearchResult[] = isZip ? [{ id: normalized, label: "Find ZIP " + normalized, detail: "See what has been recorded in this county" }] : results;
  useEffect(() => { if (open && active >= 0) document.getElementById(id + "-" + active)?.scrollIntoView({ block: "nearest" }); }, [open, active, id]);
  useEffect(() => {
    function outside(e: PointerEvent) { if (!root.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside); return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function choose(result: SearchResult) {
    if (isZip) onSubmit?.(result.id); else onChoose(result.id);
    onChange(""); setActive(-1); setOpen(false); input.current?.focus();
  }
  function submit() {
    const result = options[active >= 0 ? active : 0];
    if (result) choose(result); else if (kind === "species" && normalized.length >= 2) { onSubmit?.(normalized); setOpen(false); }
  }
  const Icon = kind === "place" ? MapPin : Sprout;
  return <div ref={root} className="map-search-field" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
    <form className="atlas-search glass-panel" role="search" aria-label={kind === "place" ? "Find a place" : "Find a species"} onSubmit={e => { e.preventDefault(); submit(); }}>
      <Icon size={18} aria-hidden="true" />
      <input ref={input} role="combobox" aria-label={kind === "place" ? "Search county or ZIP" : "Search species"} aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open && options[active] ? id + "-" + active : undefined}
        placeholder={kind === "place" ? "County or ZIP" : "Search species"} autoComplete="off" value={value} maxLength={120}
        onFocus={() => setOpen(true)} onChange={e => { onChange(e.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={e => {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); }
          if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setOpen(true); setActive(i => Math.max(0, Math.min(options.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))); }
        }} />
      {value && <button type="button" aria-label={"Clear " + kind + " search"} onClick={() => { onChange(""); setActive(-1); input.current?.focus(); }}><X size={16} /></button>}
      <button type="submit" className="search-submit" aria-label={kind === "place" ? "Find county" : "Find species"} disabled={busy || (!normalized && active < 0)}><Search size={17} /></button>
    </form>
    {open && <div className="search-suggestion-panel">
      <p className="search-suggestion-title">{normalized ? "Search results" : kind === "place" ? "Explore a county" : "Get to know a species"}</p>
      <div className="search-results" id={id} role="listbox" aria-label={kind === "place" ? "Matching counties" : "Matching species"}>
        {options.map((result,index) => <button id={id + "-" + index} key={result.id} type="button" role="option" aria-selected={active === index} tabIndex={-1} onMouseDown={e => e.preventDefault()} onClick={() => choose(result)}>
          <SearchAvatar src={result.image} kind={kind} /><span><strong>{result.label}</strong><small className={kind === "species" ? "scientific-name" : ""}>{result.detail}</small>{result.count && <small className="suggestion-count">{result.count}</small>}</span><ArrowUpRight size={15} aria-hidden="true" />
        </button>)}
        {!options.length && <div className="search-empty"><p>{kind === "place" ? "Try a county name with its state, or a five-digit ZIP." : "Try a common or scientific name."}</p></div>}
      </div>
      {kind === "species" && options.some(option => option.image) && <details className="suggestion-credits"><summary>About these photos</summary>{options.filter(option => option.image).map(option => <p key={option.id}><strong>{option.label}</strong> · {option.credit}</p>)}</details>}
      {kind === "place" && !normalized && <p className="search-suggestion-note">A few counties with plenty to explore. Enter a ZIP to find its county.</p>}
    </div>}
  </div>;
}
export function MapToolbar(props: MapToolbarProps) {
  const [placeSearch,setPlaceSearch] = useState(""), [speciesSearch,setSpeciesSearch] = useState(""), [filterOpen,setFilterOpen] = useState(false);
  const [draftCategories,setDraftCategories] = useState(props.categories), [draftEnvironment,setDraftEnvironment] = useState(props.environment);
  const root = useRef<HTMLDivElement>(null), filterButton = useRef<HTMLButtonElement>(null);
  const filtersId = useId();
  const placeResults = useMemo(() => {
    const q = placeSearch.trim().toLowerCase();
    return Object.values(props.counties).filter(c => (!props.stateCode || c.stateCode === props.stateCode) && (!q || (c.name + " " + c.stateCode).toLowerCase().includes(q)))
      .sort((a,b) => (props.countyCounts[b.countyFips] ?? 0) - (props.countyCounts[a.countyFips] ?? 0) || a.name.localeCompare(b.name)).slice(0,12)
      .map(c => ({ id:c.countyFips, label:c.name, detail:c.stateCode, count:props.dataReady && Object.hasOwn(props.countyCounts,c.countyFips) ? props.countyCounts[c.countyFips].toLocaleString() + " species recorded" : props.dataReady ? "Records unavailable" : "Records loading" }));
  }, [props.counties,props.stateCode,props.countyCounts,props.dataReady,placeSearch]);
  const speciesResults = useMemo(() => {
    const q = speciesSearch.trim().toLowerCase();
    return props.species.filter(s => !q || (s.commonName + " " + s.scientificName).toLowerCase().includes(q))
      .sort((a,b) => (props.speciesCounts[b.id] ?? 0) - (props.speciesCounts[a.id] ?? 0) || a.commonName.localeCompare(b.commonName)).slice(0,12)
      .map(s => ({ id:s.id, label:s.commonName, detail:s.scientificName, image:s.image?.thumbnail ?? s.image?.src, credit:s.image?.credit, count:props.dataReady ? (props.speciesCounts[s.id] ?? 0).toLocaleString() + (props.stateCode ? " counties in " + props.stateCode : " counties across the U.S.") : "County records loading" }));
  }, [props.species,props.speciesCounts,props.stateCode,props.dataReady,speciesSearch]);
  useEffect(() => {
    function outside(e: PointerEvent) { if (!root.current?.contains(e.target as Node)) setFilterOpen(false); }
    document.addEventListener("pointerdown",outside); return () => document.removeEventListener("pointerdown",outside);
  }, []);
  const selectedSpecies = props.species.find(s => s.id === props.speciesId);
  const count = props.categories.length + Number(Boolean(props.environment));
  const hasFilters = Boolean(count || props.speciesId || props.query);
  function close() { setFilterOpen(false); filterButton.current?.focus(); }
  return <div className="atlas-toolbar">
    <div className="atlas-control-row">
      <SearchField kind="place" value={placeSearch} results={placeResults} onChange={setPlaceSearch} onChoose={props.onCountySelect} onSubmit={props.onZipSearch} busy={props.isSearching} />
      <SearchField kind="species" value={speciesSearch} results={speciesResults} onChange={setSpeciesSearch} onChoose={props.onSpeciesSelect} onSubmit={props.onQueryChange} />
      <StatePicker value={props.stateCode} onChange={props.onStateChange} />
      <div className="filter-cluster">
      <div ref={root} className="filter-control" onKeyDown={e => { if(e.key === "Escape") {e.stopPropagation();close();} }}>
        <button ref={filterButton} type="button" aria-label="Filters" className="filter-trigger glass-panel" aria-expanded={filterOpen} aria-controls={filtersId} onClick={() => { if (!filterOpen) {setDraftCategories(props.categories);setDraftEnvironment(props.environment);} setFilterOpen(!filterOpen); }}><SlidersHorizontal size={17} /><span>Filters</span>{count > 0 && <b>{count}</b>}<ChevronDown size={14} /></button>
        {filterOpen && <section id={filtersId} className="atlas-filter-panel" aria-label="Map filters">
          <header><h2>What would you like to see?</h2><button type="button" aria-label="Close filters" onClick={close}><X size={19} /></button></header>
          <fieldset><legend>Species groups</legend><div className="filter-options">{CATEGORY_OPTIONS.map(option => {const Icon=categoryIcons[option.value], checked=draftCategories.includes(option.value); return <button key={option.value} type="button" className={"filter-option category-" + option.value} aria-pressed={checked} onClick={() => setDraftCategories(checked ? draftCategories.filter(c=>c!==option.value) : [...draftCategories,option.value])}><Icon size={20}/><span>{option.label}</span>{checked && <Check size={14}/>}</button>;})}</div></fieldset>
          <fieldset><legend>Environment</legend><div className="filter-options environment-options">{ENVIRONMENT_OPTIONS.filter(option => option.value).map(option => {const value=option.value!,Icon=environmentIcons[value];return <button key={value} type="button" className="filter-option" aria-pressed={draftEnvironment === value} onClick={() => setDraftEnvironment(draftEnvironment === value ? null : value)}><Icon size={20}/><span>{option.label}</span></button>;})}</div></fieldset>
          <footer><button type="button" className="primary-button" onClick={() => {props.onApplyFilters(draftCategories,draftEnvironment);close();}}>Apply filters <ArrowRight size={16}/></button><button type="button" className="filter-clear-button" onClick={() => {setDraftCategories([]);setDraftEnvironment(null);props.onClearFilters();close();}}>Clear filters</button></footer>
        </section>}
      </div>
    {hasFilters && <div className="atlas-filter-row" aria-label="Applied map filters">
      {props.categories.map(category => <button key={category} className={"filter-chip category-" + category} onClick={() => props.onCategoryToggle(category)} aria-label={"Remove " + CATEGORY_OPTIONS.find(c=>c.value===category)?.label + " filter"}>{CATEGORY_OPTIONS.find(c=>c.value===category)?.label}<X size={13}/></button>)}
      {props.environment && <button className="filter-chip" onClick={()=>props.onEnvironmentChange(null)} aria-label="Remove environment filter">{ENVIRONMENT_OPTIONS.find(e=>e.value===props.environment)?.label}<X size={13}/></button>}
      {selectedSpecies && <button className="filter-chip" onClick={()=>props.onSpeciesSelect(null)} aria-label="Remove species filter">{selectedSpecies.commonName}<X size={13}/></button>}
      {props.query && <button className="filter-chip" onClick={()=>props.onQueryChange("")} aria-label="Remove search filter">{props.query}<X size={13}/></button>}
      <button className="clear-all-filters" type="button" onClick={props.onClearFilters} aria-label="Clear all filters" title="Clear all filters"><X size={16}/></button>
    </div>}
      </div>
    </div>

    {props.zipStatus && <p className="atlas-search-status" role="status">{props.zipStatus}</p>}
  </div>;
}
