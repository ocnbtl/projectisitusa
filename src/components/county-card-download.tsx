"use client";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import type { CountyCategorySignal } from "@/lib/county-detail";
import type { CountyDetail, CountyRecord, ExplorerSpecies } from "@/lib/data/types";
const xml = (value: string) => value.replace(/[<>&"']/g, character => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!);
export function CountyCardDownload({ county, focalSpecies, snapshotDate, datasetLabel = "Map records" }: {
  county: CountyRecord; detail: CountyDetail | null; focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[]; countyCategorySignal: CountyCategorySignal | null; snapshotDate: string; datasetLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const svg = useMemo(() => {
    const rows = focalSpecies.slice(0, 6).map((species, index) => `<text x="55" y="${265 + index * 48}" font-size="21" font-weight="600">${xml(species.commonName.length > 36 ? species.commonName.slice(0, 35) + "…" : species.commonName)}</text><text x="530" y="${265 + index * 48}" font-size="16" font-style="italic">${xml(species.scientificName.slice(0, 43))}</text>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="720" viewBox="0 0 1000 720"><rect width="1000" height="720" fill="#edf2ef"/><g fill="#173c38" font-family="Segoe UI,Arial,sans-serif"><text x="55" y="65" font-size="20">ISITUSA / COUNTY RECORDS</text><text x="55" y="128" font-size="40" font-weight="600">${xml(county.name.slice(0, 37))}, ${xml(county.stateCode)}</text><text x="55" y="170" font-size="18">${xml(datasetLabel)}: ${xml(snapshotDate || 'Date not supplied')} / FIPS ${xml(county.countyFips)}</text><text x="55" y="215" font-size="24">${focalSpecies.length} mapped species matching the selected filters</text><path d="M55 235H945" stroke="#b9cbc2"/>${rows || '<text x="55" y="285" font-size="21">No matching mapped records in this view.</text>'}<path d="M55 580H945" stroke="#b9cbc2"/><text x="55" y="612" font-size="17">Records may be historical. Counts do not establish current presence, abundance or impact.</text><text x="55" y="640" font-size="17">Missing records do not establish absence. Follow source dates and agency findings on Isitusa.</text><text x="55" y="681" font-size="17">isitusa.com/?county=${xml(county.countyFips)} / ${focalSpecies.length > 6 ? 'First 6 matching species shown' : 'Matching species shown above'}</text></g></svg>`;
  }, [county, focalSpecies, snapshotDate, datasetLabel]);
  function save(blob: Blob, extension: string) {
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `isitusa-${county.countyFips}-records.${extension}`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function downloadPng() {
    setBusy(true); setError(null);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    try {
      const image = new window.Image(); image.src = url; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 720;
      const context = canvas.getContext('2d'); if (!context) throw Error('Canvas unavailable'); context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(Error('Export failed')), 'image/png'));
      save(blob, 'png');
    } catch { setError('The image could not be exported. Try the SVG download.'); }
    finally { URL.revokeObjectURL(url); setBusy(false); }
  }
  return <div className="county-record-export"><p className="county-note">A dated card of this filtered map snapshot, with its limitations included.</p><img src={`data:image/svg+xml,${encodeURIComponent(svg)}`} alt={`Preview of ${county.name} record card`} width={1000} height={720} className="my-4 h-auto w-full rounded-lg" /><div className="flex flex-wrap gap-2"><button className="primary-button" type="button" disabled={busy} onClick={downloadPng}><Download size={16} />{busy ? 'Preparing...' : 'Download PNG'}</button><button className="county-load-more" type="button" onClick={() => save(new Blob([svg], { type: 'image/svg+xml' }), 'svg')}>Download SVG</button></div>{error ? <p role="alert" className="county-note">{error}</p> : null}</div>;
}
