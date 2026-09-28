"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import { geoAlbersUsa, geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import { Minus, Plus, RotateCcw } from "lucide-react";
import countyTopology from "@/data/source/county-equivalents-topology.json";
import type { CountyRecord, ExplorerPresenceIndex } from "@/lib/data/types";
import { MAP_COUNT_BANDS, mapCountColor } from "@/lib/ui/map-scale";

type CountyFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
const counties = (feature(countyTopology as never, countyTopology.objects.counties as never) as unknown as GeoJSON.FeatureCollection).features as CountyFeature[];
const fipsOf = (county: CountyFeature) => String(county.id).padStart(5, "0");

interface UsCountyMapProps {
  countyIndex: Record<string, CountyRecord>;
  presenceIndex: ExplorerPresenceIndex;
  stateCode: string | null;
  selectedCountyFips: string | null;
  neighboringCountyFips: string[];
  countyMatchCounts: Record<string, number>;
  onCountySelect: (fips: string) => void;
  onReset: () => void;
  sheetExpanded: boolean;
  datasetLabel: string;
  datasetDate: string;
  dataReady: boolean;
}

export const UsCountyMap = memo(function UsCountyMap({ countyIndex, presenceIndex, stateCode, selectedCountyFips, neighboringCountyFips, countyMatchCounts, onCountySelect, onReset, sheetExpanded, datasetLabel, datasetDate, dataReady }: UsCountyMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 1200, height: 800 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const didDrag = useRef(false);
  const [focusArea, setFocusArea] = useState({ left: 16, right: 1184, top: 195, bottom: 640 });
  const focusedState = stateCode ?? (selectedCountyFips ? countyIndex[selectedCountyFips]?.stateCode : null);

  useEffect(() => {
    const node = container.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const sheet = parent.querySelector<HTMLElement>(".county-sheet");
    const toolbar = parent.querySelector<HTMLElement>(".atlas-toolbar");
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const panel = sheet?.getBoundingClientRect();
      const controls = toolbar?.getBoundingClientRect();
      const mobile = rect.width <= 700;
      const controlTop = Math.max(190, (controls?.bottom ?? rect.top + 180) - rect.top + 12);
      parent.style.setProperty("--atlas-control-top", `${controlTop}px`);
      parent.style.setProperty("--atlas-sheet-clearance", `${controlTop + 88}px`);
      const top = mobile ? controlTop + (panel ? 54 : focusedState ? 15 : 102) : Math.max(190, controlTop + 15);
      const right = !mobile && panel ? panel.left - rect.left - 24 : rect.width - 24;
      const bottom = mobile ? (panel ? panel.top - rect.top - 16 : rect.height - 162) : rect.height - 90;
      const left = !mobile && !focusedState && !panel ? 315 : 24;
      const next = { left, right: Math.max(left + 80, right), top: Math.min(top, bottom - 40), bottom };
      setFocusArea(old => Object.keys(next).every(key => old[key as keyof typeof old] === next[key as keyof typeof next]) ? old : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (sheet) observer.observe(sheet);
    if (toolbar) observer.observe(toolbar);
    return () => observer.disconnect();
  }, [selectedCountyFips, sheetExpanded, focusedState]);

  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const visibleCounties = useMemo(() => counties.filter(c => countyIndex[fipsOf(c)] && Number(fipsOf(c).slice(0, 2)) < 60 && (!focusedState || countyIndex[fipsOf(c)].stateCode === focusedState)), [countyIndex, focusedState]);
  const projection = useMemo(() => {
    const collection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: visibleCounties };
    const extent: [[number, number], [number, number]] = [[focusArea.left, focusArea.top], [focusArea.right, focusArea.bottom]];
    // Rotate Alaska before fitting to keep both sides of the Aleutian antimeridian together.
    return !focusedState ? geoAlbersUsa().fitExtent(extent, collection) : geoMercator().rotate(focusedState === "AK" ? [154, 0] : focusedState === "HI" ? [157, 0] : [0, 0]).fitExtent(extent, collection);
  }, [focusedState, focusArea, visibleCounties]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const shapes = useMemo(() => visibleCounties.map(county => ({ fips: fipsOf(county), d: path(county) ?? "", center: path.centroid(county) })), [path, visibleCounties]);
  const selectedShape = shapes.find(shape => shape.fips === selectedCountyFips);
  const neighbors = useMemo(() => new Set(neighboringCountyFips), [neighboringCountyFips]);

  useEffect(() => {
    setHovered(null);
    if (!selectedCountyFips) { setView({ x: 0, y: 0, k: 1 }); return; }
    const shape = shapes.find(s => s.fips === selectedCountyFips);
    if (!shape || !shape.center.every(Number.isFinite)) { setView({ x: 0, y: 0, k: 1 }); return; }
    const k = 1.6;
    setView({ x: (focusArea.left + focusArea.right) / 2 - shape.center[0] * k, y: (focusArea.top + focusArea.bottom) / 2 - shape.center[1] * k, k });
  }, [selectedCountyFips, shapes, focusArea]);

  function zoom(factor: number) {
    setView(current => {
      const k = Math.min(12, Math.max(1, current.k * factor));
      const cx = (focusArea.left + focusArea.right) / 2, cy = (focusArea.top + focusArea.bottom) / 2;
      return { k, x: cx - (cx - current.x) * k / current.k, y: cy - (cy - current.y) * k / current.k };
    });
  }
  function countLabel(fips: string) {
    return !dataReady ? "Records loading" : !Object.hasOwn(presenceIndex, fips) ? "Records unavailable in this layer" : `${(countyMatchCounts[fips] ?? 0).toLocaleString()} matching species with records`;
  }
  const focused = hovered ? countyIndex[hovered] : null;
  return <div ref={container} className="atlas-map" aria-label="Interactive county map">
    <svg width={size.width} height={size.height} viewBox={`0 0 ${size.width} ${size.height}`} aria-label="County map. Use county search or the state filter to explore by keyboard."
      onPointerDown={event => { if (event.button !== 0) return; didDrag.current = false; drag.current = { x: event.clientX, y: event.clientY, startX: view.x, startY: view.y }; }}
      onPointerMove={event => { const current = drag.current; if (!current) return; const dx = event.clientX - current.x, dy = event.clientY - current.y; if (Math.abs(dx) + Math.abs(dy) > 5) { didDrag.current = true; event.currentTarget.setPointerCapture(event.pointerId); setView(v => ({ ...v, x: current.startX + dx, y: current.startY + dy })); } }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
        {shapes.map(({ fips, d }) => <path key={fips} data-county={fips} data-count={dataReady && Object.hasOwn(presenceIndex, fips) ? countyMatchCounts[fips] ?? 0 : undefined} d={d}
          fill={mapCountColor(countyMatchCounts[fips] ?? 0, dataReady && Object.hasOwn(presenceIndex, fips))}
          className={`atlas-county ${fips === selectedCountyFips ? "is-selected" : neighbors.has(fips) ? "is-neighbor" : ""}`}
          vectorEffect="non-scaling-stroke" onMouseEnter={() => setHovered(fips)} onMouseLeave={() => setHovered(null)}
          onClick={() => { if (!didDrag.current) onCountySelect(fips); }}>
          <title>{countyIndex[fips]?.name}, {countyIndex[fips]?.stateCode}: {countLabel(fips)}</title>
        </path>)}
        {selectedShape?.center.every(Number.isFinite) ? <circle data-selected-marker="true" cx={selectedShape.center[0]} cy={selectedShape.center[1]} r={6 / view.k} fill="var(--county-selected)" stroke="var(--surface-strong)" strokeWidth={2 / view.k} pointerEvents="none" /> : null}
      </g>
    </svg>
    <div className="atlas-zoom glass-panel" role="group" aria-label="Map controls">
      <button type="button" aria-label="Zoom in" onClick={() => zoom(1.4)} disabled={view.k >= 12}><Plus size={19} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.4)} disabled={view.k <= 1}><Minus size={19} /></button>
      <button type="button" aria-label="Show all states" onClick={() => { onReset(); setView({ x: 0, y: 0, k: 1 }); }}><RotateCcw size={17} /></button>
    </div>
    {focused ? <div className="atlas-hover glass-panel"><strong>{focused.name}, {focused.stateCode}</strong><span>{countLabel(focused.countyFips)}</span></div> : null}
    <div className="atlas-legend glass-panel">
      <div><strong>Species with records</strong><span>{datasetLabel}{datasetDate ? ` · ${datasetDate}` : ""}</span></div>
      <ol className="map-count-bands" aria-label="Species count ranges">{MAP_COUNT_BANDS.map(band => <li key={band.min}><i style={{ background: band.color }} aria-hidden="true" /><span>{band.label}</span></li>)}</ol>
      <p><span className="legend-unknown" /> Unavailable <span aria-hidden="true"> / </span> Counts reflect your filters, not abundance or impact. Zero records does not mean absence.</p>
    </div>
  </div>;
});
