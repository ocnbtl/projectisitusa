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
import { LogoLoader } from "@/components/atlas/logo-loader";
import { MapToolbar } from "@/components/map-toolbar";
import { UsCountyMap } from "@/components/us-county-map";
import { type ClientDataStorePayload, getSpeciesForCounty, getSpeciesForCounties, speciesMatchesFilters, useClientDataStore } from "@/lib/data/client-store";
import { getDisplaySpecies } from "@/lib/ui/species-editorial";
import { CATEGORY_OPTIONS, ENVIRONMENT_OPTIONS } from "@/lib/constants";
import { useReviewedMapData } from "@/lib/data/reviewed-map-store";
import type { EnvironmentTag, ExplorerSpecies, SpeciesCategory, SpeciesFilters, ZipLookupResult } from "@/lib/data/types";

export function MapExplorer({ initialStore }: { initialStore?: ClientDataStorePayload }) {
  const params = useSearchParams();
  const { store, error, retry } = useClientDataStore(initialStore);
  const reviewed = useReviewedMapData();
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
  const stateParam = params.get("state");
  const stateCode = countyFips && store?.countyIndex[countyFips]
    ? store.countyIndex[countyFips].stateCode
    : store && Object.values(store.countyIndex).some(c => c.stateCode === stateParam) ? stateParam : null;
  const layer = params.get("layer") === "legacy" ? "legacy" : "reviewed";
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
  const selectCounty = useCallback((fips: string) => { cancelZipLookup(); setExpanded(true); update({ county: fips, state: store?.countyIndex[fips]?.stateCode ?? null }); }, [cancelZipLookup, update, store]);
  const closeCounty = useCallback(() => {
    cancelZipLookup(); update({ county: null });
    document.querySelector<HTMLInputElement>('[aria-label="Search county or ZIP"]')?.focus();
  }, [cancelZipLookup, update]);
  const county = store && countyFips ? store.countyIndex[countyFips] ?? null : null;
  const reviewedSpecies = useMemo(() => reviewed.data && store ? reviewed.data.speciesIds.map(id => store.speciesById.get(id)) : [], [reviewed.data, store]);
  const missingSpecies = reviewedSpecies.some(species => !species);
  const dataReady = layer === "legacy" ? Boolean(store) : Boolean(reviewed.data && store && !missingSpecies);
  const activePresence = useMemo(() => layer === "legacy" ? store?.presenceIndex ?? {} : dataReady ? reviewed.data!.occurrenceByCounty : {}, [layer, store, dataReady, reviewed.data]);
  const activeSpecies = useMemo(() => (layer === "legacy" ? store?.speciesByOrdinal ?? [] : dataReady ? reviewedSpecies : []) as ExplorerSpecies[], [layer, store, dataReady, reviewedSpecies]);
  const displaySpecies = useMemo(() => store?.allSpecies.map(getDisplaySpecies) ?? [], [store]);
  const displayActiveSpecies = useMemo(() => activeSpecies.map(getDisplaySpecies), [activeSpecies]);
  const datasetDate = layer === "legacy" ? store?.datasetSnapshot.snapshotDate ?? "" : reviewed.data?.asOf ?? "";
  const datasetLabel = layer === "legacy" ? "Earlier map records" : "Reviewed records";
  const dataError = layer === "reviewed" ? missingSpecies ? "The species catalog and research records do not match. Please reload the page." : reviewed.error : null;
  const countyMatchCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const matches = activeSpecies.map(species => speciesMatchesFilters(species, filters));
    for (const [fips, ordinals] of Object.entries(activePresence)) counts[fips] = ordinals.reduce((count, ordinal) => count + Number(matches[ordinal] ?? false), 0);
    return counts;
  }, [activePresence, activeSpecies, filters]);
  const countyCounts = useMemo(() => Object.fromEntries(Object.entries(activePresence).map(([fips, ids]) => [fips, ids.length])), [activePresence]);
  const speciesCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const [fips, ordinals] of Object.entries(activePresence)) {
      if (stateCode && store?.countyIndex[fips]?.stateCode !== stateCode) continue;
      for (const ordinal of ordinals) { const id = activeSpecies[ordinal]?.id; if (id) counts[id] = (counts[id] ?? 0) + 1; }
    }
    return counts;
  }, [activePresence, activeSpecies, stateCode, store]);
  const focalSpecies = useMemo(() => getSpeciesForCounty(activePresence, displayActiveSpecies, countyFips, filters), [activePresence, displayActiveSpecies, countyFips, filters]);
  const nearbySpecies = useMemo(() => {
    if (!store || !county) return [];
    const focalIds = new Set(focalSpecies.map(s => s.id));
    return getSpeciesForCounties(activePresence, displayActiveSpecies, county.neighborFips, filters).filter(s => !focalIds.has(s.id));
  }, [store, county, filters, focalSpecies, activePresence, displayActiveSpecies]);
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
      setExpanded(true); update({ county: payload.data.countyFips, state: store?.countyIndex[payload.data.countyFips]?.stateCode ?? null }); setZipStatus(`${zip}: ${payload.data.countyName}`);
    } catch { if (sequence === lookupSequence.current) setZipStatus("ZIP lookup is unavailable. Search a county name or try again."); }
    finally { if (sequence === lookupSequence.current) { setSearching(false); lookupAbort.current = null; } }
  }
  if (!store && !error) return <main id="main-content"><LogoLoader overlay /></main>;
  if (!store) return <main id="main-content" className="atlas-loading"><Compass size={36} /><h1>{error ? "The map could not load" : "Opening the field atlas"}</h1><p role={error ? "alert" : "status"}>{error || "Loading the versioned county and species snapshot..."}</p>{error ? <button type="button" className="primary-button" onClick={retry}>Try again</button> : null}<Link href="/research" className="text-link">Explore research status</Link></main>;
  return <main id="main-content" className={`atlas ${county ? "has-county" : ""} ${stateCode ? "has-state" : ""} ${expanded ? "sheet-expanded" : "sheet-collapsed"}`}>
    <UsCountyMap countyIndex={store.countyIndex} presenceIndex={activePresence} stateCode={stateCode} selectedCountyFips={county?.countyFips ?? null} neighboringCountyFips={county?.neighborFips ?? []} countyMatchCounts={countyMatchCounts} onCountySelect={selectCounty} onReset={() => { cancelZipLookup(); update({ county: null, state: null }); }} sheetExpanded={expanded} datasetLabel={datasetLabel} datasetDate={datasetDate} dataReady={dataReady} />
    <MapToolbar counties={store.countyIndex} species={displaySpecies} categories={categories} environment={environment} stateCode={stateCode} speciesId={speciesId} query={query} zipStatus={zipStatus} isSearching={searching} countyCounts={countyCounts} speciesCounts={speciesCounts} dataReady={dataReady} datasetDate={datasetDate} datasetLabel={datasetLabel}
      onApplyFilters={(values, habitat) => update({ categories: values.join(","), environment: habitat, species: null })}
      onStateChange={value => { cancelZipLookup(); update({ state: value, county: null }); }}
      onCountySelect={selectCounty} onSpeciesSelect={id => { cancelZipLookup(); update({ species: id, q: null }); }} onQueryChange={value => { cancelZipLookup(); update({ q: value, species: null }); }}
      onCategoryToggle={category => { const next = categories.includes(category) ? categories.filter(c => c !== category) : [...categories, category]; update({ categories: next.join(","), species: null }); }}
      onEnvironmentChange={value => update({ environment: value })} onZipSearch={searchZip} onClearFilters={() => update({ categories: null, species: null, environment: null, q: null })} />
    {!county && !stateCode ? <div className="atlas-intro"><h1>Understand the species.<br />Protect the places.</h1><p>Explore invasive species records across the United States. Start with a place. Follow the evidence.</p><Link href="/species">Discover the species <ArrowUpRight size={16} /></Link></div> : null}
    {!dataReady ? <div className="atlas-data-status" role={dataError ? "alert" : "status"}>{dataError ? <><p>{typeof dataError === "string" ? dataError : "Research records could not be loaded."}</p><button type="button" className="text-link" onClick={reviewed.retry}>Try again</button></> : "Loading reviewed county records..."}</div> : null}
    {countyFips && !county ? <div className="atlas-notice" role="status">This county code is not in the current geography. Search for a county or planning region.<button onClick={() => update({ county: null })}>Clear selection</button></div> : null}
    {county ? <aside className="county-sheet" aria-label={`${county.name} county details`} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); closeCounty(); } }}>
      <div className="county-sheet-heading"><div><h2>{county.name}<span className="county-state-name">{county.stateCode}</span></h2></div><div className="county-sheet-actions"><button className="sheet-toggle icon-button" type="button" aria-label={expanded ? "Collapse county details" : "Expand county details"} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ArrowDown size={18} /> : <ArrowUp size={18} />}</button><button type="button" className="icon-button" aria-label="Close county details" onClick={closeCounty}><X size={19} /></button></div></div>
      <div className="county-sheet-body">{dataReady ? <CountyInsightPanel key={`${county.countyFips}-${layer}`} selectedCounty={county} selectedCountyDetail={store.countyDetails[county.countyFips] ?? null} focalSpecies={focalSpecies} nearbySpecies={nearbySpecies} allSpecies={displaySpecies} filters={filters} snapshotDate={datasetDate} datasetLabel={datasetLabel} layer={layer} temporalExceptions={layer === "reviewed" ? reviewed.data?.temporalExceptions[county.countyFips] : undefined} /> : <p className="county-note">{dataError ? "County records are unavailable. Use Try again to reload them." : "Loading this county's records..."}</p>}</div>
    </aside> : null}
    <div className="atlas-footer"><Link href="/about">Methods & limitations</Link><Link href="/research">Research status <ArrowUpRight size={13} /></Link></div>
  </main>;
}
