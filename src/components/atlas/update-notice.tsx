"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, BookOpen, X } from "lucide-react";
import { SITE_UPDATES } from "@/content/site-updates";

const dateLabel = (date: string) => new Date(date.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function UpdateNotice({ datasetDate, datasetLabel }: { datasetDate: string; datasetLabel: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  const latest = [...SITE_UPDATES.map(update => update.date), datasetDate.slice(0, 10)].sort().at(-1)!;
  function close() { setOpen(false); trigger.current?.focus(); }
  return <div ref={root} className="atlas-updates" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
    <button ref={trigger} className="updates-trigger" type="button" aria-label="Recent updates" aria-expanded={open} aria-controls="atlas-update-list" onClick={() => setOpen(!open)}>
      <span className="updates-bell"><Bell size={17} aria-hidden="true" /></span>
      <span>Most recently updated <time dateTime={latest}>{dateLabel(latest)}</time></span>
    </button>
    {open && <section id="atlas-update-list" className="updates-popover" aria-label="Recent updates">
      <header><h2>What&apos;s new at isitusa</h2><button type="button" aria-label="Close updates" onClick={close}><X size={18} /></button></header>
      <ol>{SITE_UPDATES.map((update, index) => <li key={index}><time dateTime={update.date}>{dateLabel(update.date)}</time><Link href={update.href}><strong>{update.title}</strong><ArrowUpRight size={16} aria-hidden="true" /></Link><p>{update.detail}</p></li>)}
        {datasetDate && <li><time dateTime={datasetDate}>{dateLabel(datasetDate)}</time><Link href="/research"><strong>{datasetLabel === "Earlier map records" ? "Earlier county records" : "The records behind the map"}</strong><BookOpen size={16} aria-hidden="true" /></Link><p>This is the date of the data release. To see when a species was observed, open its county record and follow the source.</p></li>}
      </ol>
    </section>}
  </div>;
}
