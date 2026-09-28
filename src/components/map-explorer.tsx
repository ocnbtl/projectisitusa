"use client";

/* THESIS: An open field atlas where place leads and evidence stays within reach.
 * OWN-WORLD: Mineral canvas, teal county shading, glass controls, solid reading panels.
 * STORY: Find a place, inspect mapped species, then read the source and its limits.
 * FIRST VIEWPORT: Full map, compact header, upper-left search, lower-left legend.
 * FORM: User-pinned map workspace; county selection opens a side panel or mobile sheet.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpRight, Compass, X } from "lucide-react";
import { CountyInsightPanel } from "@/components/county-insight-panel";
import { MapToolbar } from "@/components/map-toolbar";
import { UsCountyMap } from "@/components/us-county-map";
import { type ClientDataStorePayload, getSpeciesForCounty, getSpeciesForCounties, speciesMatchesFilters, useClientDataStore } from "@/lib/data/client-store";
import { CATEGORY_OPTIONS, ENVIRONMENT_OPTIONS } from "@/lib/constants";
import type { EnvironmentTag, SpeciesCategory, SpeciesFilters, ZipLookupResult } from "@/lib/data/types";

export function MapExplorer({ initialStore }: { initialStore?: ClientDataStorePayload }) {
  const params = useSearchParams();
  const { store, error, retry } = useClientDataStore(initialStore);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const lookupSequence = useRef(0);
  const lookupAbort = useRef<AbortController | null>(null);
  const cancelZipLookup = useCallback(() => {
    lookupSequence.current++;
    lookupAbort.current?.abort();
    lookupAbort.current = null;
    setSearching(false);
    setZipStatus(null);
  }, []);
  useEffect(() => {
    window.addEventListener("popstate", cancelZipLookup);
    return () => { window.removeEventListener("popstate", cancelZipLookup); lookupAbort.current?.abort(); };
  }, [cancelZipLookup]);
  const countyFips = params.get("county");
  const speciesId = params.get("species");
  const query = params.get("q") ?? "";
  const categoryParam = params.get("categories") ?? params.get("category") ?? "";
  const categories = useMemo(() => categoryParam.split(",").filter((value): value is SpeciesCategory => CATEGORY_OPTIONS.some(option => option.value === value)), [categoryParam]);
  const environment = ENVIRONMENT_OPTIONS.some(option => option.value === params.get("environment")) ? params.get("environment") as EnvironmentTag | null : null;
  const filters = useMemo<SpeciesFilters>(() => ({ categories, speciesId, environment, query: speciesId ? null : query }), [categories, speciesId, environment, query]);
  const update = useCallback((patch: Record<string, string | null>) => {
    const next = new URLSearchParams(window.location.search);
    if (next.has("category") && !next.has("categories")) next.set("categories", next.get("category")!);
    next.delete("category");
    for (const [key, value] of Object.entries(patch)) { if (value) next.set(key, value); else next.delete(key); }
    const search = next.toString();
    // Native history integrates with Next without duplicate URL state or a server fetch.
    window.history.pushState(null, "", search ? `/?${search}` : "/");
  }, []);
  const selectCounty = useCallback((fips: string) => { cancelZipLookup(); setExpanded(true); update({ county: fips }); }, [cancelZipLookup, update]);
  const closeCounty = useCallback(() => {
    cancelZipLookup(); update({ county: null });
    document.querySelector<HTMLInputElement>('[aria-label="Search county, ZIP, or species"]')?.focus();
  }, [cancelZipLookup, update]);
  const county = store && countyFips ? store.countyIndex[countyFips] ?? null : null;
  const countyMatchCounts = useMemo(() => {
    if (!store) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    const matches = store.speciesByOrdinal.map(species => speciesMatchesFilters(species, filters));
    for (const [fips, ordinals] of Object.entries(store.presenceIndex)) counts[fips] = ordinals.reduce((count, ordinal) => count + Number(matches[ordinal] ?? false), 0);
    return counts;
  }, [store, filters]);
  const maxCount = useMemo(() => Math.max(0, ...Object.values(countyMatchCounts)), [countyMatchCounts]);
  const focalSpecies = useMemo(() => store ? getSpeciesForCounty(store.presenceIndex, store.speciesByOrdinal, countyFips, filters) : [], [store, countyFips, filters]);
  const nearbySpecies = useMemo(() => {
    if (!store || !county) return [];
    const focalIds = new Set(focalSpecies.map(s => s.id));
    return getSpeciesForCounties(store.presenceIndex, store.speciesByOrdinal, county.neighborFips, filters).filter(s => !focalIds.has(s.id));
  }, [store, county, filters, focalSpecies]);
  async function searchZip(zip: string) {
    cancelZipLookup();
    const controller = new AbortController();
    lookupAbort.current = controller;
    const sequence = lookupSequence.current;
    setSearching(true); setZipStatus(null);
    try {
      const response = await fetch("/api/lookup/zip", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ zip }), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      const payload = await response.json() as { ok: true; data: ZipLookupResult } | { ok: false; message: string };
      if (sequence !== lookupSequence.current) return;
      if (!response.ok || !payload.ok) { setZipStatus(payload.ok ? "ZIP lookup failed. Try county search." : payload.message); return; }
      setExpanded(true); update({ county: payload.data.countyFips }); setZipStatus(`${zip}: ${payload.data.countyName}`);
    } catch { if (sequence === lookupSequence.current) setZipStatus("ZIP lookup is unavailable. Search a county name or try again."); }
    finally { if (sequence === lookupSequence.current) { setSearching(false); lookupAbort.current = null; } }
  }
  if (!store) return <main id="main-content" className="atlas-loading"><Compass size={36} /><h1>{error ? "The map could not load" : "Opening the field atlas"}</h1><p role={error ? "alert" : "status"}>{error || "Loading the versioned county and species snapshot..."}</p>{error ? <button type="button" className="primary-button" onClick={retry}>Try again</button> : null}<Link href="/research" className="text-link">Explore research status</Link></main>;
  return <main id="main-content" className={`atlas ${county ? "has-county" : ""} ${expanded ? "sheet-expanded" : "sheet-collapsed"}`}>
    <UsCountyMap countyIndex={store.countyIndex} presenceIndex={store.presenceIndex} selectedCountyFips={county?.countyFips ?? null} neighboringCountyFips={county?.neighborFips ?? []} countyMatchCounts={countyMatchCounts} maxCountyMatchCount={maxCount} onCountySelect={selectCounty} sheetExpanded={expanded} />
    <MapToolbar counties={store.countyIndex} species={store.allSpecies} categories={categories} environment={environment} speciesId={speciesId} query={query} zipStatus={zipStatus} isSearching={searching}
      onCountySelect={selectCounty} onSpeciesSelect={id => { cancelZipLookup(); update({ species: id, q: null }); }} onQueryChange={value => { cancelZipLookup(); update({ q: value, species: null }); }}
      onCategoryToggle={category => { const next = categories.includes(category) ? categories.filter(c => c !== category) : [...categories, category]; update({ categories: next.join(","), species: null }); }}
      onEnvironmentChange={value => update({ environment: value })} onZipSearch={searchZip} onClearFilters={() => update({ categories: null, species: null, environment: null, q: null })} />
    {!county ? <div className="atlas-intro"><p className="atlas-eyebrow">A living record of introduced species</p><h1>Get to know <br />your surroundings.</h1><p>Explore a county. Discover its species. <br />See the evidence behind each record.</p><Link href="/species">Browse the species directory <ArrowUpRight size={16} /></Link></div> : null}
    {countyFips && !county ? <div className="atlas-notice" role="status">This county code is not in the current geography. Search for a county or planning region.<button onClick={() => update({ county: null })}>Clear selection</button></div> : null}
    {county ? <aside className="county-sheet" aria-label={`${county.name} county details`} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); closeCounty(); } }}>
      <div className="county-sheet-heading"><div><p>{county.stateCode} / County explorer</p><h2>{county.name}</h2></div><div className="county-sheet-actions"><button className="sheet-toggle icon-button" type="button" aria-label={expanded ? "Collapse county details" : "Expand county details"} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ArrowDown size={18} /> : <ArrowUp size={18} />}</button><button type="button" className="icon-button" aria-label="Close county details" onClick={closeCounty}><X size={19} /></button></div></div>
      <div className="county-sheet-body"><CountyInsightPanel key={county.countyFips} selectedCounty={county} selectedCountyDetail={store.countyDetails[county.countyFips] ?? null} focalSpecies={focalSpecies} nearbySpecies={nearbySpecies} allSpecies={store.allSpecies} filters={filters} snapshotDate={store.datasetSnapshot.snapshotDate} /></div>
    </aside> : null}
    <div className="atlas-footer"><span>Project Isitusa</span><Link href="/about">Methods & limitations</Link><Link href="/research">Research status <ArrowUpRight size={13} /></Link></div>
  </main>;
}
