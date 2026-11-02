"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { SpeciesName } from "@/lib/data/species-names";

const PAGE_SIZE = 6;

export function SpeciesNameNotes({ speciesId, names }: { speciesId: string; names: SpeciesName[] }) {
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<number | null>(null);
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, names.length);
  function changePage(next: number) {
    setExpanded(null);
    setPage(next);
  }
  return <div className="species-name-reader">
    {names.length > PAGE_SIZE && <nav className="species-name-pagination" aria-label="Browse naming notes">
      <span role="status" aria-live="polite">{start + 1}-{end} of {names.length} names</span>
      <div>
        <button type="button" aria-label="Previous names" disabled={page === 0} onClick={() => changePage(page - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
        <button type="button" aria-label="Next names" disabled={end === names.length} onClick={() => changePage(page + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
      </div>
    </nav>}
    <ul className="species-name-notes">
      {names.map((entry, index) => {
        const visible = index >= start && index < end;
        const open = visible && expanded === index;
        const id = `name-note-${speciesId}-${index}`;
        return <li key={entry.name} className="species-name-note" hidden={!visible}>
          <button id={`${id}-button`} type="button" className="species-name-toggle" aria-expanded={open} aria-controls={id} onClick={() => setExpanded(open ? null : index)}>
            <span className="species-name-label">{(entry.scientific ?? entry.kind === "reference") ? <i>{entry.name}</i> : entry.name}{entry.kind === "misapplied" && <small className="species-name-kind">Name clarification</small>}</span>
            <ChevronDown size={17} aria-hidden="true" />
          </button>
          <div id={id} className="species-name-explanation" hidden={!open} aria-labelledby={`${id}-button`}>
            <p>{entry.explanation}</p>
            {entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer">Read the source</a> : <a href="#species-name-references">See the sources below</a>}
          </div>
        </li>;
      })}
    </ul>
  </div>;
}
