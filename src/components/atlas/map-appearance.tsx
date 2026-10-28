"use client";
import { useId, useRef, useState } from "react";
import { Check, Info, Palette } from "lucide-react";
import { MAP_PALETTES, type MapPaletteId } from "@/lib/ui/map-palettes";
import type { MapCountBand } from "@/lib/ui/map-scale";
import "./map-appearance.css";

export function MapAppearance({ palette, onPaletteChange, bands, scope }: {
  palette: MapPaletteId; onPaletteChange: (value: MapPaletteId) => void;
  bands: MapCountBand[]; scope: string; datasetDate: string; datasetLabel: string;
}) {
  const [open, setOpen] = useState<"help" | "colors" | null>(null);
  const id = useId();
  const anchors = bands.filter(band => band.min > 0);
  const spectrum = anchors.length > 1 ? "linear-gradient(to right, " + anchors.map(band => band.color).join(", ") + ")" : anchors[0]?.color ?? "var(--county-none)";
  const helpButton = useRef<HTMLButtonElement>(null), colorButton = useRef<HTMLButtonElement>(null);
  return <div className="atlas-legend glass-panel" onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); (open === "help" ? helpButton : colorButton).current?.focus(); setOpen(null); }
  }}>
    <div id={id + "-help"} className="legend-drawer" data-open={open === "help"} aria-hidden={open !== "help"}>
      <div><div className="legend-explanation"><h2>Reading the map</h2>
        <p>Colors show how many species have been recorded in each county with your filters, not the harm they cause. More records can reflect more research.</p>
        <p>Zero means no matching records, not confirmed absence. Gray means data isn’t available.</p>
      </div></div>
    </div>
    <div id={id + "-colors"} className="legend-drawer" data-open={open === "colors"} aria-hidden={open !== "colors"}>
      <div><div className="legend-palette-panel"><h2>Map colors</h2>
        <div className="map-palette-options" role="group" aria-label="Map color palettes">{MAP_PALETTES.map(option => <button key={option.id} type="button" tabIndex={open === "colors" ? 0 : -1} aria-pressed={palette === option.id} onClick={() => onPaletteChange(option.id)}>
          <span className="palette-preview" aria-hidden="true" style={{ background: "linear-gradient(to right, " + option.colors.join(", ") + ")" }} />
          <span>{option.name}</span>{palette === option.id && <Check size={15} aria-hidden="true" />}
        </button>)}</div>
      </div></div>
    </div>
    <div className="legend-summary">
      <div className="legend-heading"><strong>Species recorded</strong><div className="legend-actions">
        <button ref={colorButton} type="button" aria-label="Choose map colors" aria-expanded={open === "colors"} aria-controls={id + "-colors"} onClick={() => setOpen(open === "colors" ? null : "colors")}><Palette size={18} aria-hidden="true" /></button>
        <button ref={helpButton} type="button" aria-label="About map colors" aria-expanded={open === "help"} aria-controls={id + "-help"} onClick={() => setOpen(open === "help" ? null : "help")}><Info size={18} aria-hidden="true" /></button>
      </div></div>
      <div className="map-spectrum" aria-label={"Species count scale for " + scope}>
        {anchors.length > 0 ? <><div className="map-spectrum-bar" style={{ background: spectrum }} aria-hidden="true" /><ol className="map-spectrum-ticks">{anchors.map(band => <li key={band.min}>{band.label}</li>)}</ol></> : <p>No positive counts in this view</p>}
      </div>
    </div>
  </div>;
}
