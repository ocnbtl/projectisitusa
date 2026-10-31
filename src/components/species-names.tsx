import { Info } from "lucide-react";
import { getSpeciesNames } from "@/lib/data/species-names";
import "./species-names.css";

export function SpeciesNames({ speciesId }: { speciesId: string }) {
  const record = getSpeciesNames(speciesId);
  if (!record.names.length) return null;
  const common = record.names.filter(entry => entry.kind === "common");
  const qualified = record.names.filter(entry => entry.kind !== "common");
  return <section className="species-names" aria-labelledby="species-names-title">
    <div className="species-names-intro"><h2 id="species-names-title">Other names you may know</h2><p>Names vary between places and references. These can help you find the species you mean.</p></div>
    <div className="species-names-content">
      {common.length > 0 && <div><h3>Common names</h3><ul className="species-name-list">{common.map(entry => <li key={entry.name}>{entry.name}</li>)}</ul></div>}
      {qualified.length > 0 && <div><h3>Names that need context</h3><div className="species-name-notes">{qualified.map(entry => <details key={entry.name} className="species-name-note"><summary><span>{entry.kind === "reference" || entry.scientific ? <i>{entry.name}</i> : entry.name}</span><span className="species-name-kind">{entry.kind === "misapplied" ? "Name clarification" : "In other references"}</span><Info size={17} aria-hidden="true" /><span className="sr-only">Read why this name needs context</span></summary><div className="species-name-explanation"><p>{entry.explanation}</p><a href="#species-name-references">See the naming references below</a></div></details>)}</div></div>}
      <details id="species-name-references" className="species-name-references"><summary>Naming references <span>({record.sources.length})</span></summary><ul>{record.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></details>
    </div>
  </section>;
}
