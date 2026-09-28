"use client";
import { useId, useRef, useState } from "react";
import { Check, Info, Palette } from "lucide-react";
import { MAP_PALETTES, type MapPaletteId } from "@/lib/ui/map-palettes";
import type { MapCountBand } from "@/lib/ui/map-scale";

export function MapAppearance({ palette, onPaletteChange, bands, scope, datasetDate, datasetLabel }: {
  palette: MapPaletteId; onPaletteChange: (value: MapPaletteId) => void;
  bands: MapCountBand[]; scope: string; datasetDate: string; datasetLabel: string;
}) {
  const [open, setOpen] = useState<"help" | "colors" | null>(null);
  const id = useId();
  const helpButton = useRef<HTMLButtonElement>(null), colorButton = useRef<HTMLButtonElement>(null);
  const area = scope === "U.S." ? "the whole U.S." : scope === "Visible counties" ? "the counties in view" : scope;
  const published = datasetDate ? new Date(datasetDate.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  return <div className="atlas-legend glass-panel" onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); (open === "help" ? helpButton : colorButton).current?.focus(); setOpen(null); }
  }}>
    <div id={id + "-help"} className="legend-drawer" data-open={open === "help"} aria-hidden={open !== "help"}>
      <div><div className="legend-explanation"><h2>What the colors tell you</h2>
        <p>Each number is a count of different species recorded in a county, using your current filters.</p>
        <p>The colors currently compare <strong>{area}</strong>. The ranges adjust as you zoom or choose a state, so check the numbers when comparing places.</p>
        <p>More records do not necessarily mean more damage. Zero means no matching records, not that a species is absent. Gray means a count is unavailable.</p>
        {published && <p className="legend-data-date">{datasetLabel === "Earlier map records" ? "Earlier data release" : "Data released"}: {published}. Observation dates are listed with each source.</p>}
      </div></div>
    </div>
    <div id={id + "-colors"} className="legend-drawer" data-open={open === "colors"} aria-hidden={open !== "colors"}>
      <div><div className="legend-palette-panel"><h2>A different view</h2><p>Choose the colors you like. The records stay the same.</p>
        <div className="map-palette-options" role="group" aria-label="Map color palettes">{MAP_PALETTES.map(option => <button key={option.id} type="button" tabIndex={open === "colors" ? 0 : -1} aria-pressed={palette === option.id} onClick={() => onPaletteChange(option.id)}>
          <span className="palette-preview" aria-hidden="true">{option.colors.map(color => <i key={color} style={{ backgroundColor: color }} />)}</span>
          <span>{option.name}</span>{palette === option.id && <Check size={15} aria-hidden="true" />}
        </button>)}</div>
      </div></div>
    </div>
    <div className="legend-summary">
      <div className="legend-heading"><strong>Species recorded</strong><div className="legend-actions">
        <button ref={colorButton} type="button" aria-label="Choose map colors" aria-expanded={open === "colors"} aria-controls={id + "-colors"} onClick={() => setOpen(open === "colors" ? null : "colors")}><Palette size={18} aria-hidden="true" /></button>
        <button ref={helpButton} type="button" aria-label="About map colors" aria-expanded={open === "help"} aria-controls={id + "-help"} onClick={() => setOpen(open === "help" ? null : "help")}><Info size={18} aria-hidden="true" /></button>
      </div></div>
      <ol className="map-count-bands" style={{ gridTemplateColumns: "repeat(" + bands.length + ", minmax(0, 1fr))" }} aria-label={"Species count ranges for " + scope}>{bands.map((band, index) => <li key={index}><i style={{ backgroundColor: band.color }} aria-hidden="true" /><span>{band.label}</span></li>)}</ol>
    </div>
  </div>;
}
