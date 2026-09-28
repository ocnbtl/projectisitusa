"use client";
import Image from "next/image";
import { Check, ChevronDown, Map, Search } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import stateRegistry from "@/data/research/state-registry.json";
import { STATE_FLAGS } from "@/content/state-flags";

const states = stateRegistry.jurisdictions.filter(state => state.nationalV1Scope).sort((a,b) => a.stateName.localeCompare(b.stateName));
function Flag({ code }: { code: string }) {
  const [failed, setFailed] = useState(false);
  const asset = STATE_FLAGS[code];
  return asset && !failed ? <Image src={asset.src} alt="" width={27} height={18} unoptimized onError={() => setFailed(true)} /> : <span className="state-code" aria-hidden="true">{code}</span>;
}
export function StatePicker({ value, onChange }: { value: string | null; onChange: (state: string | null) => void }) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(""), [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null), input = useRef<HTMLInputElement>(null);
  const id = useId();
  const options = useMemo(() => [{ code: "", name: "All states" }, ...states.map(state => ({ code: state.stateCode, name: state.stateName }))].filter(s => !query || (s.code + " " + s.name).toLowerCase().includes(query.toLowerCase())), [query]);
  const current = states.find(state => state.stateCode === value);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (open) document.getElementById(id + "-" + active)?.scrollIntoView({ block: "nearest" }); }, [active, open, id]);
  function choose(code: string) { onChange(code || null); setOpen(false); button.current?.focus(); }
  return <div ref={root} className="state-picker" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); button.current?.focus(); } }}>
    <button ref={button} type="button" className="state-picker-trigger glass-panel" aria-label={"Focus on a state: " + (current?.stateName ?? "All states")} aria-haspopup="listbox" aria-expanded={open} aria-controls={id} onClick={() => { setOpen(!open); setQuery(""); setActive(0); }}>
      {value ? <Flag key={value} code={value} /> : <Map size={20} aria-hidden="true" />}<span>{current?.stateName ?? "All states"}</span><ChevronDown size={15} />
    </button>
    {open && <div className="state-picker-popover">
      <label><Search size={16} /><input ref={input} value={query} role="combobox" aria-label="Find a state" aria-autocomplete="list" aria-expanded={open} aria-controls={id} aria-activedescendant={options[active] ? id + "-" + active : undefined} placeholder="Find a state" onChange={e => { setQuery(e.target.value); setActive(0); }} onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(i => Math.max(0, Math.min(options.length - 1, i + (event.key === "ArrowDown" ? 1 : -1)))); }
        if (event.key === "Enter" && options[active]) { event.preventDefault(); choose(options[active].code); }
      }} /></label>
      <div id={id} role="listbox" aria-label="States">{options.map((option, index) => <button tabIndex={-1} id={id + "-" + index} key={option.code} type="button" role="option" className={index === active ? "is-focused" : ""} aria-selected={(value ?? "") === option.code} onMouseDown={event => event.preventDefault()} onClick={() => choose(option.code)}>
        {option.code ? <Flag code={option.code} /> : <Map size={20} aria-hidden="true" />}<span>{option.name}</span>{(value ?? "") === option.code && <Check size={16} />}
      </button>)}{!options.length && <p className="search-empty">No matching state.</p>}</div>
      <details className="state-flag-credits"><summary>Flag sources & credits</summary><a href="https://commons.wikimedia.org/wiki/Flags_of_the_U.S._states_and_territories" target="_blank" rel="noreferrer">Wikimedia Commons gallery</a>{Object.entries(STATE_FLAGS).filter(([,flag]) => flag.license !== "Public domain").map(([code,flag]) => <p key={code}><a href={flag.source} target="_blank" rel="noreferrer">{code} flag</a>: {flag.artist}. {flag.license === "CC BY-SA 4.0" ? <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> : flag.license}. Unmodified.</p>)}</details>
    </div>}
  </div>;
}
