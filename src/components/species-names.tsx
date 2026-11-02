import { Info } from "lucide-react";
import { getSpeciesNames } from "@/lib/data/species-names";
import "./species-names.css";

export function SpeciesNames({ speciesId }: { speciesId: string }) {
  const record = getSpeciesNames(speciesId);
  if (!record.names.length) return null;
  const common = record.names.filter(entry => entry.kind === "common");
  const qualified = record.names.filter(entry => entry.kind !== "common" || entry.explanation);
  const preview = common.slice(0, 3);
  return <section className="species-names" aria-labelledby="species-names-title">
    <h2 id="species-names-title">Other names</h2>
    {preview.length > 0 && <p className="species-names-preview">{preview.map((entry, index) => <span key={entry.name}>{index > 0 && ", "}{entry.scientific ? <i>{entry.name}</i> : entry.name}</span>)}{common.length > preview.length && <span> +{common.length - preview.length} more</span>}</p>}
    <details className="species-names-disclosure" open={Boolean(record.warning)}>
      <summary>{record.warning ? "Naming note & references" : "All names & references"}<span className="species-names-count">{record.names.length}</span></summary>
    <div className="species-names-content">
      {record.warning && <p className="species-names-description">{record.warning}</p>}
      <p className="species-names-description">Names can vary between places and sources. These notes explain how each name relates to this profile.</p>
      {common.length > 0 && <div><h3>Common names</h3><ul className="species-name-list">{common.map(entry => <li key={entry.name}>{entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer" aria-label={`${entry.name}: naming source`}>{entry.scientific ? <i>{entry.name}</i> : entry.name}</a> : entry.scientific ? <i>{entry.name}</i> : entry.name}</li>)}</ul></div>}
      {qualified.length > 0 && <div><h3>About these names</h3><div className="species-name-notes">{qualified.map(entry => <details key={entry.name} className="species-name-note"><summary><span>{(entry.scientific ?? entry.kind === "reference") ? <i>{entry.name}</i> : entry.name}</span><span className="species-name-kind">{entry.kind === "misapplied" ? "Name clarification" : "In other sources"}</span><Info size={17} aria-hidden="true" /><span className="sr-only">Read why this name needs context</span></summary><div className="species-name-explanation"><p>{entry.explanation}</p>{entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer">Read the source</a> : <a href="#species-name-references">See the sources below</a>}</div></details>)}</div></div>}
      <details id="species-name-references" className="species-name-references"><summary>Sources for these names <span>({record.sources.length})</span></summary><ul>{record.sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noreferrer">{source.title}</a></li>)}</ul></details>
    </div>
    </details>
  </section>;
}
