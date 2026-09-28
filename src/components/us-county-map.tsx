"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { Minus, Plus, RotateCcw, Navigation } from "lucide-react";
import countyTopology from "@/data/source/county-equivalents-topology.json";
import type { CountyRecord, ExplorerPresenceIndex } from "@/lib/data/types";

type Region = "US" | "AK" | "HI";
type CountyFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
const counties = (feature(countyTopology as never, countyTopology.objects.counties as never) as unknown as GeoJSON.FeatureCollection).features as CountyFeature[];
const regions: Array<[Region, string]> = [["US", "United States"], ["AK", "Alaska"], ["HI", "Hawaii"]];
const fipsOf = (county: CountyFeature) => String(county.id).padStart(5, "0");

interface UsCountyMapProps {
  countyIndex: Record<string, CountyRecord>;
  presenceIndex: ExplorerPresenceIndex;
  selectedCountyFips: string | null;
  neighboringCountyFips: string[];
  countyMatchCounts: Record<string, number>;
  maxCountyMatchCount: number;
  onCountySelect: (fips: string) => void;
}

export function getHeatFill(count: number, maxCount: number, hasData: boolean) {
  if (!hasData) return "var(--county-unknown)";
  if (!count || !maxCount) return "var(--county-none)";
  const ratio = count / maxCount;
  return ratio >= .8 ? "var(--county-critical)" : ratio >= .55 ? "var(--county-high)" : ratio >= .3 ? "var(--county-mid)" : "var(--county-low)";
}

export const UsCountyMap = memo(function UsCountyMap({ countyIndex, presenceIndex, selectedCountyFips, neighboringCountyFips, countyMatchCounts, maxCountyMatchCount, onCountySelect }: UsCountyMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [region, setRegion] = useState<Region>("US");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number; moved: boolean } | null>(null);
  const didDrag = useRef(false);
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visibleCounties = useMemo(() => counties.filter(c => countyIndex[fipsOf(c)] && Number(fipsOf(c).slice(0, 2)) < 60 && (region === "US" || fipsOf(c).startsWith(region === "AK" ? "02" : "15"))), [countyIndex, region]);
  const projection = useMemo(() => {
    const width = Math.max(100, size.width), height = Math.max(100, size.height);
    const collection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: visibleCounties };
    const mobile = width < 700;
    const top = mobile ? 300 : 155;
    const bottom = mobile ? 245 : 165;
    const extent: [[number, number], [number, number]] = [[mobile ? 14 : 305, top], [width - (mobile ? 14 : 45), Math.max(top + 120, height - bottom)]];
    // Alaska is rotated before Mercator fitting so Aleutian islands across the
    // antimeridian remain in the same visible region. The US overview retains
    // Albers USA's deliberate Alaska/Hawaii insets.
    return region === "US" ? geoAlbersUsa().fitExtent(extent, collection) : geoMercator().rotate(region === "AK" ? [154, 0] : [157, 0]).fitExtent(extent, collection);
  }, [region, size, visibleCounties]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const shapes = useMemo(() => visibleCounties.map(county => ({ fips: fipsOf(county), d: path(county) ?? "", center: path.centroid(county) })), [path, visibleCounties]);
  const selectedShape = shapes.find(shape => shape.fips === selectedCountyFips);
  const neighbors = useMemo(() => new Set(neighboringCountyFips), [neighboringCountyFips]);

  useEffect(() => {
    pendingFocus.current = selectedCountyFips;
    if (!selectedCountyFips) { setView({ x: 0, y: 0, k: 1 }); return; }
    const nextRegion: Region = selectedCountyFips.startsWith("02") ? "AK" : selectedCountyFips.startsWith("15") ? "HI" : "US";
    setRegion(nextRegion);
  }, [selectedCountyFips]);
  useEffect(() => {
    if (!pendingFocus.current) return;
    const expectedRegion = pendingFocus.current.startsWith("02") ? "AK" : pendingFocus.current.startsWith("15") ? "HI" : "US";
    if (region !== expectedRegion) return;
    const shape = shapes.find(s => s.fips === pendingFocus.current);
    if (!shape || !shape.center.every(Number.isFinite)) { setView({ x: 0, y: 0, k: 1 }); return; }
    const k = region === "US" ? 2.7 : 1.6;
    setView({ x: (size.width <= 700 ? size.width / 2 : (size.width - (size.width <= 1100 ? 404 : 444)) / 2) - shape.center[0] * k, y: (size.width <= 700 ? 255 : size.height * .46) - shape.center[1] * k, k });
  }, [selectedCountyFips, shapes, region, size]);

  function zoom(factor: number) {
    setView(current => {
      const k = Math.min(12, Math.max(1, current.k * factor));
      return { k, x: size.width / 2 - (size.width / 2 - current.x) * k / current.k, y: size.height / 2 - (size.height / 2 - current.y) * k / current.k };
    });
  }
  const focused = hovered ? countyIndex[hovered] : null;

  return <div ref={container} className="atlas-map" aria-label="Interactive county map">
    <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} aria-label="United States counties. Use the search control to select any county by keyboard."
      onPointerDown={event => { if (event.button !== 0) return; didDrag.current = false; drag.current = { x: event.clientX, y: event.clientY, startX: view.x, startY: view.y, moved: false }; }}
      onPointerMove={event => { const current = drag.current; if (!current) return; const dx = event.clientX - current.x, dy = event.clientY - current.y; if (Math.abs(dx) + Math.abs(dy) > 5) { current.moved = true; didDrag.current = true; event.currentTarget.setPointerCapture(event.pointerId); setView(v => ({ ...v, x: current.startX + dx, y: current.startY + dy })); } }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        {shapes.map(({ fips, d }) => <path key={fips} data-county={fips} d={d}
          fill={getHeatFill(countyMatchCounts[fips] ?? 0, maxCountyMatchCount, Object.hasOwn(presenceIndex, fips))}
          className={`atlas-county ${fips === selectedCountyFips ? "is-selected" : neighbors.has(fips) ? "is-neighbor" : ""}`}
          vectorEffect="non-scaling-stroke" onMouseEnter={() => setHovered(fips)} onMouseLeave={() => setHovered(null)}
          onClick={() => { if (!didDrag.current) onCountySelect(fips); }}>
          <title>{countyIndex[fips]?.name}, {countyIndex[fips]?.stateCode}: {countyMatchCounts[fips] ?? 0} matching mapped species{!Object.hasOwn(presenceIndex, fips) ? "; map data unavailable" : ""}</title>
        </path>)}
        {selectedShape?.center.every(Number.isFinite) ? <circle data-selected-marker="true" cx={selectedShape.center[0]} cy={selectedShape.center[1]} r={6 / view.k} fill="var(--county-selected)" stroke="var(--surface-strong)" strokeWidth={2 / view.k} pointerEvents="none" /> : null}
      </g>
    </svg>
    <div className="atlas-regions glass-panel" role="group" aria-label="Map region">
      {regions.map(([id, label]) => <button key={id} type="button" aria-pressed={region === id} onClick={() => { pendingFocus.current = null; setRegion(id); setView({ x: 0, y: 0, k: 1 }); }}>{label}</button>)}
    </div>
    <div className="atlas-zoom glass-panel" role="group" aria-label="Map controls">
      <button type="button" aria-label="Zoom in" onClick={() => zoom(1.4)} disabled={view.k >= 12}><Plus size={19} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.4)} disabled={view.k <= 1}><Minus size={19} /></button>
      <button type="button" aria-label="Reset map view" onClick={() => { pendingFocus.current = null; setRegion("US"); setView({ x: 0, y: 0, k: 1 }); }}><RotateCcw size={17} /></button>
    </div>
    {focused ? <div className="atlas-hover glass-panel"><strong>{focused.name}, {focused.stateCode}</strong><span>{(countyMatchCounts[focused.countyFips] ?? 0).toLocaleString()} matching mapped species</span></div> : null}
    <div className="atlas-legend glass-panel">
      <div><strong>Mapped species</strong><span>Matching the current filters</span></div>
      <div className="legend-scale" aria-label={`Map scale: zero to ${maxCountyMatchCount} matching species`}><span>0</span><i style={{ background: "var(--county-none)" }} /><i style={{ background: "var(--county-low)" }} /><i style={{ background: "var(--county-mid)" }} /><i style={{ background: "var(--county-high)" }} /><i style={{ background: "var(--county-critical)" }} /><span>{maxCountyMatchCount}</span></div>
      <p><span className="legend-unknown" /> No map data <span aria-hidden="true"> / </span> Counts are not abundance or impact. Missing records do not establish absence.</p>
    </div>
    <div className="atlas-orientation"><Navigation size={14} aria-hidden="true" /> N <span>Alaska and Hawaii shown as insets in U.S. view</span></div>
  </div>;
});
