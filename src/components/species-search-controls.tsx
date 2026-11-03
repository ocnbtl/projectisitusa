"use client";

import { useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";

/** Shared immediate-search controls; secondary filters stay out of the reading path. */
export function SpeciesSearchControls({
  value, onChange, inputRef, filterCount, children, onReset, hasFilters,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  filterCount: number;
  children: ReactNode;
  onReset: () => void;
  hasFilters: boolean;
}) {
  const id = useId();
  const localInput = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const field = inputRef ?? localInput;
  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }
  return (
    <div className="species-search-controls">
      <div className="species-search-row">
        <label className="species-search-field" htmlFor={id}>
          <span className="sr-only">Search species</span>
          <Search size={19} aria-hidden="true" />
          <input ref={field} id={id} type="search" value={value} maxLength={200}
            onChange={event => onChange(event.target.value)}
            placeholder="Common or scientific name" />
          {value && <button type="button" aria-label="Clear species search" onClick={() => {
            onChange(""); field.current?.focus({ preventScroll: true });
          }}><X size={18} aria-hidden="true" /></button>}
        </label>
        <button ref={trigger} type="button" className="species-filter-toggle"
          aria-expanded={open} aria-controls={id + "-filters"} onClick={() => setOpen(current => !current)}>
          <SlidersHorizontal size={18} aria-hidden="true" /><span>Filters</span>
          {filterCount > 0 && <small aria-label={filterCount + " active filters"}>{filterCount}</small>}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      </div>
      <div id={id + "-filters"} className="species-filter-disclosure" data-open={open}
        aria-hidden={!open} inert={!open} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}>
        <div><div className="species-filter-content">
          {children}
          <footer>
            <button type="button" className="species-filter-reset" disabled={!hasFilters} onClick={onReset}>Clear all filters</button>
            <button type="button" className="species-filter-done" onClick={close}>Done<ChevronDown size={16} aria-hidden="true" /></button>
          </footer>
        </div></div>
      </div>
    </div>
  );
}
