"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { StateFlag } from "@/components/atlas/state-picker";
import { Check, ChevronDown, Search } from "lucide-react";
import { findSelectOption, nextSelectOption, selectSearchText, type SelectOption } from "@/lib/ui/select-navigation";

export function CustomSelect({ label, value, options, onChange, disabled = false, compact = false, stateFlags = false }: {
  label: string; value: string; options: SelectOption[]; onChange: (value: string) => void;
  disabled?: boolean; compact?: boolean; stateFlags?: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null), popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null), list = useRef<HTMLDivElement>(null);
  const typing = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false), [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 0, maxHeight: 320 });
  const searchable = options.length > 8;
  const filtered = useMemo(() => options.filter(option => selectSearchText(option.label).includes(selectSearchText(query))), [options, query]);
  const selected = options.find(option => option.value === value);

  function close(restoreFocus = false) {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }
  function show(key?: string) {
    setQuery("");
    typing.current = { text: "", at: 0 };
    const selectedIndex = options.findIndex(option => option.value === value && !option.disabled);
    setActive(key === "Home" || key === "End" ? nextSelectOption(options, selectedIndex, key)
      : selectedIndex >= 0 ? selectedIndex : nextSelectOption(options, -1, key ?? "ArrowDown"));
    setOpen(true);
  }
  function choose(index: number) {
    const option = filtered[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close(true);
  }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const rect = trigger.current?.getBoundingClientRect();
      if (!rect) return;
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0, topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      const roomBelow = topEdge + height - rect.bottom - 16, roomAbove = rect.top - topEdge - 16;
      const desired = Math.min(360, filtered.length * 44 + (searchable ? 60 : 0) + 16);
      const above = roomBelow < Math.min(desired, 200) && roomAbove > roomBelow;
      const maxHeight = Math.max(80, Math.min(360, above ? roomAbove : roomBelow));
      const panelWidth = Math.min(Math.max(rect.width, 220), width - 24);
      setPosition({ left: Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + width - panelWidth - 12)),
        top: above ? rect.top - Math.min(desired, maxHeight) - 6 : rect.bottom + 6, width: panelWidth, maxHeight });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); window.visualViewport?.removeEventListener("resize", place); };
  }, [open, filtered.length, searchable]);

  useEffect(() => {
    if (!open) return;
    (searchable ? search.current : list.current)?.focus({ preventScroll: true });
    function outside(event: PointerEvent) {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, searchable]);
  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-option-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
    else if (event.key === "Tab") { close(true); }
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && (!searchable || !["Home", "End"].includes(event.key))) {
      event.preventDefault(); setActive(nextSelectOption(filtered, active, event.key));
    } else if (event.key === "Enter" || (event.key === " " && !searchable)) {
      event.preventDefault(); choose(active);
    } else if (!searchable && event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const previous = now - typing.current.at < 700 ? typing.current.text : "";
      const text = previous === event.key ? event.key : previous + event.key;
      typing.current = { text, at: now };
      const match = findSelectOption(filtered, text, text.length === 1 ? active : -1);
      if (match >= 0) setActive(match);
    }
  }

  const activeId = active >= 0 && filtered[active] ? `${id}-option-${active}` : undefined;
  return <div className={"custom-select" + (compact ? " custom-select-compact" : "")}>
    <span id={`${id}-label`} className="custom-select-label">{label}</span>
    <button ref={trigger} type="button" className="custom-select-trigger" disabled={disabled || !options.some(option => !option.disabled)}
      aria-labelledby={`${id}-label ${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? `${id}-popup` : undefined}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) { event.preventDefault(); show(event.key); }
      }}><span className="select-option-label" id={`${id}-value`}>{stateFlags && selected && <StateFlag key={selected.value} code={selected.value} />}{selected?.label ?? "Choose an option"}</span><ChevronDown size={16} aria-hidden="true" /></button>
    {open && createPortal(<div ref={popup} id={`${id}-popup`} role="dialog" aria-label={label} className="custom-select-popup" style={position} onKeyDown={keyDown}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node) && event.relatedTarget !== trigger.current) setOpen(false); }}>
      {searchable && <div className="custom-select-search"><Search size={16} aria-hidden="true" /><input ref={search} value={query} role="combobox" aria-label={`Search ${label.toLowerCase()}`} aria-expanded="true" aria-autocomplete="list" aria-controls={`${id}-list`} aria-activedescendant={activeId}
        placeholder="Type to find..." onChange={event => { const text = event.target.value; setQuery(text); setActive(nextSelectOption(options.filter(option => selectSearchText(option.label).includes(selectSearchText(text))), -1, "Home")); }} /></div>}
      <div ref={list} id={`${id}-list`} role="listbox" aria-label={label} tabIndex={searchable ? -1 : 0} aria-activedescendant={searchable ? undefined : activeId} className="custom-select-options">
        {filtered.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
          data-option-index={index} data-active={index === active} onPointerMove={event => { if (event.pointerType === "mouse" && !option.disabled) setActive(index); }}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(index)}><span className="select-option-label">{stateFlags && <StateFlag code={option.value} />}{option.label}</span>{option.value === value && <Check size={16} aria-hidden="true" />}</div>)}
        {!filtered.length && <p className="custom-select-empty" role="status">No matches. Try another name.</p>}
      </div>
    </div>, document.body)}
  </div>;
}
