"use client";
import "./context-popover.css";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

/** Keep the surface mounted through its exit, without shifting the surrounding page. */
export function ContextPopover({ label, children, text }: { label: string; children: ReactNode; text?: string }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 320, maxHeight: 400 });
  const [origin, setOrigin] = useState("top right");

  useEffect(() => {
    if (open) { setMounted(true); return; }
    setVisible(false);
    const delay = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 340;
    const timer = window.setTimeout(() => setMounted(false), delay);
    return () => window.clearTimeout(timer);
  }, [open]);
  useLayoutEffect(() => { if (panel.current) panel.current.inert = !open; }, [mounted, open]);
  useLayoutEffect(() => {
    if (!mounted || !open) return;
    let frame = 0;
    function place() {
      const r = trigger.current?.getBoundingClientRect(); if (!r) return;
      const viewport = window.visualViewport;
      const vw = viewport?.width ?? innerWidth, vh = viewport?.height ?? innerHeight;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = Math.min(336, vw - 32), height = Math.min(panel.current?.scrollHeight ?? 240, vh - 32);
      const below = r.bottom + height + 8 < y + vh;
      const next = { left: Math.max(x + 16, Math.min(r.right - width, x + vw - width - 16)),
        top: below ? r.bottom + 8 : Math.max(y + 16, r.top - height - 8), width, maxHeight: vh - 32 };
      setPosition(current => Object.keys(next).every(key => current[key as keyof typeof next] === next[key as keyof typeof next]) ? current : next);
      setOrigin(Math.max(0, Math.min(width, r.left + r.width / 2 - next.left)) + "px " + (below ? "top" : "bottom"));
    }
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(place); }
    place();
    // A painted starting state lets both first-open and quick reversals transition.
    let reveal = requestAnimationFrame(() => { reveal = requestAnimationFrame(() => setVisible(true)); });
    panel.current?.focus({ preventScroll: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    window.visualViewport?.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(reveal);
      window.removeEventListener("resize", schedule); window.removeEventListener("scroll", schedule, true);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [mounted, open]);
  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (!panel.current?.contains(e.target as Node) && !trigger.current?.contains(e.target as Node)) {
        if (panel.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
        setOpen(false);
      }
    }
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
    }
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  return <span className="context-popover-trigger"><button ref={trigger} type="button" aria-label={label} aria-expanded={open} aria-haspopup="dialog" aria-controls={mounted ? id : undefined} onClick={() => setOpen(value => !value)}><Info size={17} aria-hidden="true"/>{text}</button>
    {mounted && createPortal(<div id={id} ref={panel} tabIndex={-1} role="dialog" aria-label={label} aria-hidden={!open} data-visible={visible && open} className="context-popover-panel" style={{ ...position, transformOrigin: origin }}>
      <div className="context-popover-heading"><strong>{label}</strong><button type="button" aria-label="Close information" onClick={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}><X size={17} aria-hidden="true"/></button></div>{children}
    </div>, document.body)}</span>;
}
