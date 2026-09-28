"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { geoAlbersUsa, geoMercator, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { MapAppearance } from "@/components/atlas/map-appearance";
import { getMapPalette, MAP_PALETTE_STORAGE_KEY, type MapPaletteId } from "@/lib/ui/map-palettes";
import countyTopology from "@/data/source/county-equivalents-topology.json";
import type { CountyRecord, ExplorerPresenceIndex } from "@/lib/data/types";
import { boundsIntersectView, createMapCountBands, mapCountColor } from "@/lib/ui/map-scale";
import { beginMapPointer, cancelMapGesture, createMapGesture, endMapPointer, moveMapPointer, scaleMapAt, type MapView } from "@/lib/ui/map-gestures";
import { measuredMapViewport, sameMapViewport, type MapViewport } from "@/lib/ui/map-viewport";

type CountyFeature = GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
const counties = (feature(countyTopology as never, countyTopology.objects.counties as never) as unknown as GeoJSON.FeatureCollection).features as CountyFeature[];
const fipsOf = (county: CountyFeature) => String(county.id).padStart(5, "0");
const EMPTY_VIEWPORT: MapViewport = { width: 1, height: 1, area: { left: 0, right: 1, top: 0, bottom: 1 } };

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
  const [paletteId, setPaletteId] = useState<MapPaletteId>("earth");
  useEffect(() => { try { setPaletteId(getMapPalette(localStorage.getItem(MAP_PALETTE_STORAGE_KEY)).id); } catch { /* Storage is optional. */ } }, []);
  function choosePalette(value: MapPaletteId) {
    setPaletteId(value);
    try { localStorage.setItem(MAP_PALETTE_STORAGE_KEY, value); } catch { /* Keep the choice for this visit. */ }
  }
  const [viewport, setViewport] = useState<MapViewport | null>(null);
  const size = viewport ?? EMPTY_VIEWPORT;
  const focusArea = size.area;
  const group = useRef<SVGGElement>(null);
  const frame = useRef<number | null>(null);
  const liveView = useRef({ x: 0, y: 0, k: 1 });
  const [dragging, setDragging] = useState(false);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [hovered, setHovered] = useState<string | null>(null);
  const gesture = useRef(createMapGesture());
  const pointerSpace = useRef({ left: 0, top: 0, sx: 1, sy: 1 });
  const focusedState = stateCode ?? (selectedCountyFips ? countyIndex[selectedCountyFips]?.stateCode : null);

  useLayoutEffect(() => {
    const node = container.current;
    const parent = node?.parentElement;
    if (!node || !parent) return;
    const sheet = parent.querySelector<HTMLElement>(".county-sheet");
    const toolbar = parent.querySelector<HTMLElement>(".atlas-topbar");
    const legend = node.querySelector<HTMLElement>(".atlas-legend");
    const intro = parent.querySelector<HTMLElement>(".atlas-intro");
    const measure = () => {
      const rect = node.getBoundingClientRect();
      const panel = sheet?.getBoundingClientRect();
      const controls = toolbar?.getBoundingClientRect();
      const legendBounds = legend?.getBoundingClientRect();
      const legendSummary = legend?.querySelector<HTMLElement>(".legend-summary")?.getBoundingClientRect();
      if (legendBounds && legendBounds.height > 0) parent.style.setProperty("--atlas-legend-clearance", `${rect.bottom - legendBounds.top + 12}px`);
      const mobile = rect.width <= 700;
      const controlTop = Math.max(0, (controls?.bottom ?? rect.top + 180) - rect.top + 12);
      parent.style.setProperty("--atlas-control-top", `${controlTop}px`);
      parent.style.setProperty("--atlas-sheet-clearance", `${controlTop + 88}px`);
      const introBounds = intro?.getBoundingClientRect();
      const introVisible = Boolean(introBounds && introBounds.height > 0);
      const top = mobile ? panel ? controlTop + 54 : introVisible ? introBounds!.bottom - rect.top + 18 : controlTop + 15 : controlTop + 15;
      const right = !mobile && panel ? panel.left - rect.left - 24 : rect.width - 24;
      const bottom = mobile ? (panel ? panel.top - rect.top - 16 : legendSummary && legendSummary.height > 0 ? legendSummary.top - rect.top - 28 : rect.height - 162) : rect.height - 90;
      const left = !mobile && introVisible && !panel ? Math.min(400, rect.width * .36) : 24;
      const next = measuredMapViewport(rect.width, rect.height, { left, right: Math.max(left + 80, right), top: Math.min(top, bottom - 40), bottom });
      if (next) setViewport(old => sameMapViewport(old, next) ? old : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (sheet) observer.observe(sheet);
    if (toolbar) observer.observe(toolbar);
    if (legend) observer.observe(legend);
    if (intro) observer.observe(intro);
    let active = true;
    void document.fonts.ready.then(() => { if (active) measure(); });
    return () => { active = false; observer.disconnect(); };
  }, [selectedCountyFips, sheetExpanded, focusedState]);

  const visibleCounties = useMemo(() => counties.filter(c => countyIndex[fipsOf(c)] && Number(fipsOf(c).slice(0, 2)) < 60 && (!focusedState || countyIndex[fipsOf(c)].stateCode === focusedState)), [countyIndex, focusedState]);
  const projection = useMemo(() => {
    if (!viewport) return geoAlbersUsa();
    const collection: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: visibleCounties };
    const extent: [[number, number], [number, number]] = [[focusArea.left, focusArea.top], [focusArea.right, focusArea.bottom]];
    // Rotate Alaska before fitting to keep both sides of the Aleutian antimeridian together.
    return !focusedState ? geoAlbersUsa().fitExtent(extent, collection) : geoMercator().rotate(focusedState === "AK" ? [154, 0] : focusedState === "HI" ? [157, 0] : [0, 0]).fitExtent(extent, collection);
  }, [focusedState, focusArea, visibleCounties, viewport]);
  const path = useMemo(() => geoPath(projection), [projection]);
  const stateBoundary = useMemo(() => {
    const geometries = countyTopology.objects.counties.geometries.filter(geometry => {
      const fips = String(geometry.id).padStart(5, "0");
      return countyIndex[fips] && Number(fips.slice(0, 2)) < 60 && (!focusedState || countyIndex[fips].stateCode === focusedState);
    });
    const borders = mesh(countyTopology as never, { type: "GeometryCollection", geometries } as never, (a, b) => a === b || String(a.id).padStart(5, "0").slice(0, 2) !== String(b.id).padStart(5, "0").slice(0, 2));
    return path(borders) ?? "";
  }, [countyIndex, focusedState, path]);
  const shapes = useMemo(() => viewport ? visibleCounties.map(county => ({ fips: fipsOf(county), d: path(county) ?? "", center: path.centroid(county), bounds: path.bounds(county) })) : [], [path, visibleCounties, viewport]);
  const scale = useMemo(() => {
    const inView = !focusedState && view.k > 1.3 ? new Set(shapes.filter(s => boundsIntersectView(s.bounds, view, { left: 0, right: size.width, top: 0, bottom: size.height })).map(s => s.fips)) : null;
    const allCounts = visibleCounties.filter(c => Object.hasOwn(presenceIndex, fipsOf(c)));
    const values = allCounts.filter(c => !inView || inView.has(fipsOf(c))).map(c => countyMatchCounts[fipsOf(c)] ?? 0);
    const useVisibleScale = inView !== null && values.some(count => count > 0);
    return { scope: focusedState ?? (useVisibleScale ? "Visible counties" : "U.S."), bands: createMapCountBands(inView && !useVisibleScale ? allCounts.map(c => countyMatchCounts[fipsOf(c)] ?? 0) : values, getMapPalette(paletteId).colors) };
  }, [visibleCounties, presenceIndex, countyMatchCounts, focusedState, shapes, view, size, paletteId]);
  const { bands, scope: scaleScope } = scale;
  const selectedShape = shapes.find(shape => shape.fips === selectedCountyFips);
  const neighbors = useMemo(() => new Set(neighboringCountyFips), [neighboringCountyFips]);

  // Legend reflow changes the fit area, but must not undo a manual zoom or pan.
  useLayoutEffect(() => {
    cancelMapGesture(gesture.current);
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    group.current?.removeAttribute("data-interacting");
    setDragging(false);
    if (!selectedCountyFips) setView({ x: 0, y: 0, k: 1 });
  }, [selectedCountyFips, focusedState, viewport?.width]);

  useLayoutEffect(() => {
    setHovered(null);
    if (!selectedCountyFips) return;
    const shape = shapes.find(s => s.fips === selectedCountyFips);
    if (!shape || !shape.center.every(Number.isFinite)) { setView({ x: 0, y: 0, k: 1 }); return; }
    const k = 1.6;
    setView({ x: (focusArea.left + focusArea.right) / 2 - shape.center[0] * k, y: (focusArea.top + focusArea.bottom) / 2 - shape.center[1] * k, k });
  }, [selectedCountyFips, shapes, focusArea]);

  useLayoutEffect(() => { liveView.current = view; }, [view]);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  function paintView() {
    const v = liveView.current;
    group.current?.setAttribute("transform", "translate(" + v.x + " " + v.y + ") scale(" + v.k + ")");
  }
  function pointerPoint(event: ReactPointerEvent<SVGSVGElement>) {
    const space = pointerSpace.current;
    return { x: (event.clientX - space.left) * space.sx, y: (event.clientY - space.top) * space.sy };
  }
  function finishPointer(event: ReactPointerEvent<SVGSVGElement>, cancelled = false) {
    if (!gesture.current.pointers.has(event.pointerId)) return;
    if (!cancelled) {
      const final = moveMapPointer(gesture.current, event.pointerId, pointerPoint(event));
      if (final) liveView.current = final;
    }
    const county = endMapPointer(gesture.current, event.pointerId, cancelled);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (gesture.current.pointers.size) return;
    if (frame.current !== null) { cancelAnimationFrame(frame.current); frame.current = null; }
    paintView();
    setView({ ...liveView.current });
    group.current?.removeAttribute("data-interacting");
    setDragging(false);
    if (county) onCountySelect(county);
  }
  function zoom(factor: number) {
    setView(current => {
      const center = { x: (focusArea.left + focusArea.right) / 2, y: (focusArea.top + focusArea.bottom) / 2 };
      return scaleMapAt(current, current.k * factor, center);
    });
  }
  function countLabel(fips: string) {
    return !dataReady ? "Records loading" : !Object.hasOwn(presenceIndex, fips) ? "Records unavailable in this layer" : `${(countyMatchCounts[fips] ?? 0).toLocaleString()} matching species with records`;
  }
  const focused = hovered ? countyIndex[hovered] : null;
  const paths = useMemo(() => shapes.map(({ fips, d }) => {
    const available = dataReady && Object.hasOwn(presenceIndex, fips);
    const count = countyMatchCounts[fips] ?? 0;
    return <path key={fips} data-county={fips} data-count={available ? count : undefined} d={d}
      fill={mapCountColor(count, available, bands)}
      className={"atlas-county " + (fips === selectedCountyFips ? "is-selected" : neighbors.has(fips) ? "is-neighbor" : "")}
      vectorEffect="non-scaling-stroke">
      <title>{countyIndex[fips]?.name}, {countyIndex[fips]?.stateCode}: {available ? count.toLocaleString() + " matching species with records" : dataReady ? "Records unavailable in this layer" : "Records loading"}</title>
    </path>;
  }), [shapes, countyIndex, countyMatchCounts, presenceIndex, dataReady, bands, selectedCountyFips, neighbors]);
  const emptyFocus = dataReady && (selectedCountyFips || view.k > 1.3) && (selectedCountyFips
    ? Object.hasOwn(presenceIndex, selectedCountyFips) && (countyMatchCounts[selectedCountyFips] ?? 0) === 0
    : hovered && Object.hasOwn(presenceIndex, hovered) && (countyMatchCounts[hovered] ?? 0) === 0);
  return <div ref={container} className={"atlas-map " + (dragging ? "is-dragging" : "")} aria-label="Interactive county map">
    <svg viewBox={viewport ? "0 0 " + size.width + " " + size.height : undefined} style={{ visibility: viewport ? "visible" : "hidden" }} aria-label="County map. Drag to move and pinch to zoom. Use county search or the state filter to explore by keyboard."
      onPointerDown={event => {
        if (event.button !== 0) return;
        event.preventDefault();
        if (!gesture.current.pointers.size) {
          const rect = event.currentTarget.getBoundingClientRect();
          pointerSpace.current = { left: rect.left, top: rect.top, sx: size.width / rect.width, sy: size.height / rect.height };
          // Begin at the visible position even if a button zoom is still animating.
          const transform = group.current && getComputedStyle(group.current).transform;
          if (transform && transform !== "none") {
            const matrix = new DOMMatrix(transform);
            const current: MapView = { x: matrix.e, y: matrix.f, k: matrix.a };
            if ([current.x, current.y, current.k].every(Number.isFinite) && current.k > 0) liveView.current = current;
          }
          group.current?.setAttribute("data-interacting", "true");
          paintView();
          setDragging(true);
          setHovered(null);
        }
        const county = (event.target as SVGElement).closest("[data-county]")?.getAttribute("data-county") ?? null;
        beginMapPointer(gesture.current, event.pointerId, pointerPoint(event), liveView.current, county);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event => {
        const next = moveMapPointer(gesture.current, event.pointerId, pointerPoint(event));
        if (!next) return;
        liveView.current = next;
        if (frame.current === null) frame.current = requestAnimationFrame(() => {
          paintView();
          frame.current = null;
        });
      }}
      onPointerUp={event => finishPointer(event)} onPointerCancel={event => finishPointer(event, true)} onLostPointerCapture={event => finishPointer(event, true)}>
      <g ref={group} className="atlas-map-shapes" transform={"translate(" + view.x + " " + view.y + ") scale(" + view.k + ")"}
        onPointerOver={event => { if (event.pointerType === "mouse" && !gesture.current.pointers.size) setHovered((event.target as SVGElement).closest("[data-county]")?.getAttribute("data-county") ?? null); }}
        onPointerLeave={() => { if (!gesture.current.pointers.size) setHovered(null); }}>
        {paths}
        <path className="atlas-state-boundaries" d={stateBoundary} fill="none" vectorEffect="non-scaling-stroke" pointerEvents="none" aria-hidden="true" />
        {selectedShape?.center.every(Number.isFinite) ? <circle data-selected-marker="true" cx={selectedShape.center[0]} cy={selectedShape.center[1]} r={6 / view.k} fill="var(--county-selected)" stroke="var(--surface-strong)" strokeWidth={2 / view.k} pointerEvents="none" /> : null}
      </g>
    </svg>
    <div className="atlas-zoom glass-panel" role="group" aria-label="Map controls">
      <button type="button" aria-label="Zoom in" onClick={() => zoom(1.4)} disabled={view.k >= 12}><Plus size={19} /></button>
      <button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.4)} disabled={view.k <= 1}><Minus size={19} /></button>
      <button type="button" aria-label="Show all states" onClick={() => { onReset(); setView({ x: 0, y: 0, k: 1 }); }}><RotateCcw size={17} /></button>
    </div>
    {focused ? <div className="atlas-hover glass-panel"><strong>{focused.name}, {focused.stateCode}</strong><span>{countLabel(focused.countyFips)}</span></div> : null}
    {emptyFocus ? <div className="map-empty-notice" role="status">No matching records here.<span>Try removing a filter. This does not tell us whether a species is absent.</span></div> : null}
    <MapAppearance palette={paletteId} onPaletteChange={choosePalette} bands={bands} scope={scaleScope} datasetDate={datasetDate} datasetLabel={datasetLabel} />
  </div>;
});
