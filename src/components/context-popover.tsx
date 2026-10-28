"use client";
import "./context-popover.css";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

/** Small contextual explanations stay beside their trigger without reflowing the page. */
export function ContextPopover({ label, children, text }: { label: string; children: ReactNode; text?: string }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 320, maxHeight: 400 });
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const r = trigger.current?.getBoundingClientRect(); if (!r) return;
      const viewport = window.visualViewport;
      const vw = viewport?.width ?? innerWidth, vh = viewport?.height ?? innerHeight;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = Math.min(336, vw - 32), height = Math.min(panel.current?.scrollHeight ?? 240, vh - 32);
      setPosition({ left: Math.max(x + 16, Math.min(r.right - width, x + vw - width - 16)),
        top: r.bottom + height + 8 < y + vh ? r.bottom + 8 : Math.max(y + 16, r.top - height - 8), width, maxHeight: vh - 32 });
    }
    place(); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    panel.current?.focus({ preventScroll: true });
    function outside(e: PointerEvent) { if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) setOpen(false); }
    function escape(e: KeyboardEvent) { if (e.key === 'Escape') { setOpen(false); trigger.current?.focus({ preventScroll: true }); } }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [open]);
  return <span className="context-popover-trigger"><button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" aria-controls={open ? id : undefined} onClick={() => setOpen(!open)}><Info size={17} aria-hidden="true"/>{text}</button>
    {open && createPortal(<div id={id} ref={panel} tabIndex={-1} role="dialog" aria-label={label} className="context-popover-panel" style={position}>
      <div className="context-popover-heading"><strong>{label}</strong><button type="button" aria-label="Close information" onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}><X size={17} aria-hidden="true"/></button></div>{children}
    </div>, document.body)}</span>;
}
