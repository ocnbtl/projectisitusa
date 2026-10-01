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
  const anchors = bands.filter(band => band.min > 0);
  const spectrum = anchors.length > 1 ? "linear-gradient(to right, " + anchors.map(band => band.color).join(", ") + ")" : anchors[0]?.color ?? "var(--county-none)";
  const helpButton = useRef<HTMLButtonElement>(null), colorButton = useRef<HTMLButtonElement>(null);
  const area = scope === "U.S." ? "the United States" : scope === "Visible counties" ? "the counties in view" : scope;
  const published = datasetDate ? new Date(datasetDate.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  return <div className="atlas-legend glass-panel" onKeyDown={event => {
    if (event.key === "Escape" && open) { event.stopPropagation(); (open === "help" ? helpButton : colorButton).current?.focus(); setOpen(null); }
  }}>
    <div id={id + "-help"} className="legend-drawer" data-open={open === "help"} aria-hidden={open !== "help"}>
      <div><div className="legend-explanation"><h2>Reading the map</h2>
        <p>Species per county, matching your filters. Counts, not harm.</p>
        <p><strong>0:</strong> no records, not absence. <strong>Gray:</strong> unavailable.</p>
        <p className="legend-data-date">Colors blend between the count labels below. The scale adjusts to {area} as you zoom.{published && <> {datasetLabel === "Earlier map records" ? "Earlier data" : "Data"}: {published}; sighting dates are in the sources.</>}</p>
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
        <div className="map-spectrum-exceptions"><span><i style={{ background: "var(--county-none)" }} />0 records</span><span><i style={{ background: "var(--county-unknown)" }} />Unavailable</span></div>
      </div>
    </div>
  </div>;
}
