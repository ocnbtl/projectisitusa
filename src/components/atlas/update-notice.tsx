"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bell, BookOpen, X } from "lucide-react";
import { SITE_UPDATES } from "@/content/site-updates";

const dateLabel = (date: string) => new Date(date.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function UpdateNotice({ datasetDate, datasetLabel }: { datasetDate: string; datasetLabel: string }) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const update = () => setToday(new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }));
    update(); const timer = setInterval(update, 60000);
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => { clearInterval(timer); document.removeEventListener("pointerdown", outside); };
  }, []);
  const latest = [SITE_UPDATES[0].date, datasetDate.slice(0, 10)].sort().at(-1)!;
  return <div ref={root} className="atlas-updates" onKeyDown={event => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }}>
    <button ref={trigger} className="updates-trigger" type="button" aria-label="Open recent updates" aria-expanded={open} aria-controls="atlas-update-list" onClick={() => setOpen(!open)}>
      <span className="updates-bell"><Bell size={17} aria-hidden="true" /><i /></span>
      <span>Most recently updated <time dateTime={latest}>{dateLabel(latest)}</time></span>
    </button>
    {today && <span className="today-date">Today · {today}</span>}
    {open && <section id="atlas-update-list" className="updates-popover" aria-label="Recent updates">
      <header><h2>What’s new</h2><button type="button" aria-label="Close updates" onClick={() => { setOpen(false); trigger.current?.focus(); }}><X size={18} /></button></header>
      <ol>{SITE_UPDATES.map((update, index) => <li key={index}><time dateTime={update.date}>{dateLabel(update.date)}</time><Link href={update.href}><strong>{update.title}</strong><ArrowUpRight size={16} /></Link><p>{update.detail}</p></li>)}
        <li><time dateTime={datasetDate}>{datasetDate ? dateLabel(datasetDate) : "Loading snapshot"}</time><Link href="/research"><strong>{datasetLabel}</strong><BookOpen size={16} /></Link><p>County records from the published research snapshot. Observation dates are shown with each source.</p></li>
      </ol>
    </section>}
  </div>;
}
