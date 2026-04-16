"use client";

import { useEffect, useMemo, useState } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import countyTopology from "us-atlas/counties-10m.json";
import statesTopology from "us-atlas/states-10m.json";

import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from "@/lib/constants";
import type { CountyRecord, ExplorerPresenceIndex } from "@/lib/data/types";
import { cn } from "@/lib/utils";

interface UsCountyMapProps {
  countyIndex: Record<string, CountyRecord>;
  presenceIndex: ExplorerPresenceIndex;
  selectedCountyFips: string | null;
  neighboringCountyFips: string[];
  matchingCountyFips: Set<string>;
  countyMatchCounts: Record<string, number>;
  maxCountyMatchCount: number;
  selectedCountyHasCoverageGaps: boolean;
  onCountySelect: (countyFips: string) => void;
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 7;
const EXCLUDED_STATE_PREFIXES = new Set(["02", "15", "60", "66", "69", "72", "78"]);

function getHeatFill(count: number, maxCount: number, hasData: boolean) {
  if (!hasData) return "var(--county-unknown)";
  if (count <= 0 || maxCount <= 0) return "var(--county-none)";

  const ratio = count / maxCount;
  if (ratio >= 0.8) return "var(--county-critical)";
  if (ratio >= 0.55) return "var(--county-high)";
  if (ratio >= 0.3) return "var(--county-mid)";
  return "var(--county-low)";
}

export function UsCountyMap({
  countyIndex,
  presenceIndex,
  selectedCountyFips,
  neighboringCountyFips,
  matchingCountyFips,
  countyMatchCounts,
  maxCountyMatchCount,
  selectedCountyHasCoverageGaps,
  onCountySelect,
}: UsCountyMapProps) {
  const [position, setPosition] = useState({
    coordinates: DEFAULT_MAP_CENTER as [number, number],
    zoom: DEFAULT_MAP_ZOOM,
  });
  const [hoveredCountyFips, setHoveredCountyFips] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedCountyFips) {
      setPosition({
        coordinates: DEFAULT_MAP_CENTER,
        zoom: DEFAULT_MAP_ZOOM,
      });
      return;
    }

    const county = countyIndex[selectedCountyFips];
    if (!county) return;

    setPosition({
      coordinates: county.center,
      zoom: 4.6,
    });
  }, [countyIndex, selectedCountyFips]);

  const neighborSet = useMemo(
    () => new Set(neighboringCountyFips),
    [neighboringCountyFips],
  );

  const hoveredCounty = hoveredCountyFips
    ? countyIndex[hoveredCountyFips]
    : selectedCountyFips
      ? countyIndex[selectedCountyFips]
      : null;

  const hoveredCount = hoveredCountyFips
    ? countyMatchCounts[hoveredCountyFips] ?? 0
    : selectedCountyFips
      ? countyMatchCounts[selectedCountyFips] ?? 0
      : 0;

  return (
    <section className="glass-panel rounded-[28px] p-4 lg:p-5">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--foreground)]">
            County-level invasive species explorer
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setPosition((current) => ({
                ...current,
                zoom: Math.max(MIN_ZOOM, current.zoom - 0.6),
              }))
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent)]"
            aria-label="Zoom out"
          >
            <Minus size={16} />
          </button>
          <button
            type="button"
            onClick={() =>
              setPosition((current) => ({
                ...current,
                zoom: Math.min(MAX_ZOOM, current.zoom + 0.6),
              }))
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent)]"
            aria-label="Zoom in"
          >
            <Plus size={16} />
          </button>
          <button
            type="button"
            onClick={() =>
              setPosition({
                coordinates: DEFAULT_MAP_CENTER,
                zoom: DEFAULT_MAP_ZOOM,
              })
            }
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent)]"
            aria-label="Reset map"
          >
            <RotateCcw size={16} />
          </button>
        </div>
      </div>

      <div className="map-shell relative overflow-hidden rounded-[24px] border border-[var(--border)]">
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{ scale: 1325 }}
          width={1100}
          height={680}
          className="h-auto w-full"
        >
          <ZoomableGroup
            center={position.coordinates}
            zoom={position.zoom}
            onMoveEnd={({ coordinates, zoom }: { coordinates: [number, number]; zoom: number }) => {
              setPosition({
                coordinates: coordinates as [number, number],
                zoom,
              });
            }}
          >
            <Geographies geography={countyTopology as never}>
              {({ geographies }: { geographies: Array<{ id: string | number; rsmKey: string }> }) =>
                geographies
                  .filter((geo) => !EXCLUDED_STATE_PREFIXES.has(String(geo.id).slice(0, 2)))
                  .map((geo: { id: string | number; rsmKey: string }) => {
                    const countyFips = String(geo.id);
                    const isSelected = countyFips === selectedCountyFips;
                    const isNeighbor = neighborSet.has(countyFips);
                    const hasData = Boolean(presenceIndex[countyFips]);
                    const count = countyMatchCounts[countyFips] ?? 0;
                    const fill = getHeatFill(count, maxCountyMatchCount, hasData);

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        onMouseEnter={() => setHoveredCountyFips(countyFips)}
                        onMouseLeave={() => setHoveredCountyFips(null)}
                        onClick={() => onCountySelect(countyFips)}
                        style={{
                          default: {
                            fill,
                            outline: "none",
                            stroke: isSelected
                              ? "rgba(239,143,118,0.95)"
                              : isNeighbor
                                ? "rgba(240,181,93,0.95)"
                                : "rgba(255,255,255,0.08)",
                            strokeWidth: isSelected ? 1.8 : isNeighbor ? 1.1 : 0.3,
                          },
                          hover: {
                            fill,
                            outline: "none",
                            stroke: "rgba(255,255,255,0.34)",
                            strokeWidth: isSelected ? 1.9 : 0.95,
                          },
                          pressed: {
                            fill,
                            outline: "none",
                          },
                        }}
                        className="cursor-pointer"
                      />
                    );
                  })
              }
            </Geographies>
            <Geographies geography={statesTopology as never}>
              {({ geographies }: { geographies: Array<{ id: string | number; rsmKey: string }> }) =>
                geographies
                  .filter((geo) => !EXCLUDED_STATE_PREFIXES.has(String(geo.id).slice(0, 2)))
                  .map((geo: { id: string | number; rsmKey: string }) => (
                    <Geography
                      key={`state-${geo.rsmKey}`}
                      geography={geo}
                      style={{
                        default: {
                          fill: "transparent",
                          outline: "none",
                          stroke: "rgba(0,0,0,0.42)",
                          strokeWidth: 0.8,
                        },
                        hover: {
                          fill: "transparent",
                          outline: "none",
                          stroke: "rgba(0,0,0,0.42)",
                          strokeWidth: 0.8,
                        },
                        pressed: {
                          fill: "transparent",
                          outline: "none",
                          stroke: "rgba(0,0,0,0.42)",
                          strokeWidth: 0.8,
                        },
                      }}
                      className="pointer-events-none"
                    />
                  ))
              }
            </Geographies>
          </ZoomableGroup>
        </ComposableMap>

        <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-[color:color-mix(in_srgb,var(--background)_58%,transparent)] px-3 py-2 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
          Click a county or search by ZIP
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-[22px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="whitespace-nowrap text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
              Map focus
            </div>
            <div className="mt-1 whitespace-nowrap text-sm text-[var(--foreground)]">
              {hoveredCounty
                ? `${hoveredCounty.name}, ${hoveredCounty.stateCode}${!hoveredCountyFips && selectedCountyHasCoverageGaps ? " *" : ""}`
                : "Contiguous U.S. overview"}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--county-critical)]" />
              <span className="whitespace-nowrap">Highest reports</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--county-high)]" />
              <span className="whitespace-nowrap">Elevated</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--county-mid)]" />
              <span className="whitespace-nowrap">Moderate</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--county-low)]" />
              <span className="whitespace-nowrap">Lower</span>
            </span>
            <span className="inline-flex items-center gap-3 whitespace-nowrap">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-[var(--border)] bg-[var(--county-none)]" />
                <span className="whitespace-nowrap">No reports in view</span>
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[var(--county-unknown)]" />
                <span className="whitespace-nowrap">No data</span>
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border-2 border-[var(--county-selected)]" />
            <span className="whitespace-nowrap">Selected county</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-full border-2 border-[var(--county-neighbor)]" />
            <span className="whitespace-nowrap">Neighboring counties</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="font-semibold text-[var(--accent-strong)]">*</span>
            <span className="whitespace-nowrap">
              Some filtered species still lack county-level coverage
            </span>
          </span>
          <span
            className={cn(
              "rounded-full border border-[var(--border)] px-3 py-1.5",
              hoveredCounty || matchingCountyFips.size > 0 ? "text-[var(--foreground)]" : "",
            )}
          >
            {hoveredCount} matches in current view
          </span>
        </div>

      </div>
    </section>
  );
}
