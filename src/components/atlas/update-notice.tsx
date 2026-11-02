"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, BookOpen, X } from "lucide-react";
import { SITE_RELEASE_ID, SITE_UPDATES } from "@/content/site-updates";

const dateLabel = (date: string) => new Date(date.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function UpdateNotice({ datasetDate, datasetLabel }: { datasetDate: string; datasetLabel: string }) {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const [availableHeight, setAvailableHeight] = useState<number>();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    try { setUnread(localStorage.getItem("isitusa.seen-site-release") !== SITE_RELEASE_ID); } catch { /* Optional preference storage. */ }
  }, []);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  useEffect(() => {
    if (!open) return;
    // The map controls wrap on phones, so measure the actual space below them.
    function fitNotice() {
      const bottom = root.current?.getBoundingClientRect().bottom;
      if (bottom !== undefined) setAvailableHeight(Math.max(120, (window.visualViewport?.height ?? window.innerHeight) + (window.visualViewport?.offsetTop ?? 0) - bottom - 22));
    }
    fitNotice();
    window.addEventListener("resize", fitNotice);
    window.visualViewport?.addEventListener("resize", fitNotice);
    return () => { window.removeEventListener("resize", fitNotice); window.visualViewport?.removeEventListener("resize", fitNotice); };
  }, [open]);
  const latest = [...SITE_UPDATES.map(update => update.date), datasetDate.slice(0, 10)].sort().at(-1)!;
  function close() { setOpen(false); trigger.current?.focus({ preventScroll: true }); }
  function toggle() {
    setOpen(!open);
    if (!open) {
      setUnread(false);
      try { localStorage.setItem("isitusa.seen-site-release", SITE_RELEASE_ID); } catch { /* The notice still works without storage. */ }
    }
  }
  return <div ref={root} className="atlas-updates" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
    <button ref={trigger} className="updates-trigger" type="button" aria-label="Recent updates" aria-describedby={unread ? "atlas-unread-update" : undefined} aria-expanded={open} aria-controls="atlas-update-list" onClick={toggle}>
      <span className="updates-bell" data-unread={unread}><Bell size={17} aria-hidden="true" />{unread && <span id="atlas-unread-update" className="sr-only">New site update</span>}</span>
      <span className="updates-summary">Most recently updated <time dateTime={latest}>{dateLabel(latest)}</time></span>
      <span className="updates-compact">Updated <time dateTime={latest}>{latest.slice(5, 7)}/{latest.slice(8, 10)}/{latest.slice(2, 4)}</time></span>
    </button>
    <section ref={node => { if (node) node.inert = !open; }} id="atlas-update-list" className="updates-popover" data-open={open} aria-hidden={!open} style={{ maxHeight: availableHeight }} aria-label="Recent updates">
      <header><div className="updates-heading"><h2>What&apos;s new with ISITUSA</h2></div><button type="button" aria-label="Close updates" onClick={close}><X size={18} /></button></header>
      <p className="updates-latest">Most recently updated <time dateTime={latest}>{dateLabel(latest)}</time></p>
      <ol>{SITE_UPDATES.map((update, index) => <li key={index}><time dateTime={update.date}>{dateLabel(update.date)}</time><Link href={{ pathname: update.href }}><strong>{update.title}</strong><ArrowUpRight size={16} aria-hidden="true" /></Link><p>{update.detail}</p></li>)}
        {datasetDate && <li><time dateTime={datasetDate}>{dateLabel(datasetDate)}</time><Link href="/research"><strong>{datasetLabel === "Earlier map records" ? "Earlier county records" : "The records behind the map"}</strong><BookOpen size={16} aria-hidden="true" /></Link><p>This is the date of the data release. To see when a species was observed, open its county record and follow the source.</p></li>}
      </ol>
    </section>
  </div>;
}
