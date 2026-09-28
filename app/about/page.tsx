import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { datasetSnapshot } from "@/lib/data/snapshot-store";

export const metadata: Metadata = {
  title: "About the project | Isitusa",
  description:
    "How Isitusa connects species profiles, county records, and source evidence, and what the available data can and cannot tell you.",
};

export default function AboutPage() {
  const snapshotDate = new Date(datasetSnapshot.snapshotDate).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });

  return (
    <main id="main-content" className="reading-page">
      <header className="reading-hero">
        <p className="reading-kicker">About Isitusa</p>
        <h1 className="max-w-4xl">A clearer picture of the places we share.</h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Invasive Species in the USA brings species information and county
          evidence together. Start with a place, get to know a species, and follow
          the sources behind what is recorded.
        </p>
        <Link href="/" className="primary-button mt-6 inline-flex items-center gap-2">
          Explore your county <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </header>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-16">
        <div>
          <section className="reading-section" aria-labelledby="purpose-heading">
            <p className="reading-kicker">Our purpose</p>
            <h2 id="purpose-heading" className="text-2xl font-semibold">Make local information easier to use.</h2>
            <p className="mt-4 text-base leading-8 text-[var(--muted)]">
              Useful information lives across agency records, surveys, museum
              collections, and species references. Isitusa makes those connections
              easier to explore for people who live, work, hike, fish, farm, and
              restore in these places.
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--muted)]">
              The map is a starting point. County details and research views let
              you examine sources, dates, and uncertainty. Species profiles add
              identification and action notes where that material is available.
            </p>
          </section>

          <section className="reading-section" aria-labelledby="method-heading">
            <p className="reading-kicker">How it works</p>
            <h2 id="method-heading" className="text-2xl font-semibold">From source records to a local view.</h2>
            <ol className="mt-6 divide-y divide-[var(--border)]">
              <li className="grid gap-2 py-5 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-5">
                <span className="text-sm tabular-nums text-[var(--muted)]" aria-hidden="true">01</span>
                <div><h3 className="text-lg font-semibold">A shared species catalog</h3><p className="mt-2 text-base leading-7 text-[var(--muted)]">The catalog is based on the U.S. Register of Introduced and Invasive Species (US-RIIS) lower-48 snapshot. Its scope does not represent a complete inventory of every species in Alaska, Hawaii, or any county.</p></div>
              </li>
              <li className="grid gap-2 py-5 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-5">
                <span className="text-sm tabular-nums text-[var(--muted)]" aria-hidden="true">02</span>
                <div><h3 className="text-lg font-semibold">A dated county map</h3><p className="mt-2 text-base leading-7 text-[var(--muted)]">The map uses a stored county snapshot dated <time dateTime={datasetSnapshot.snapshotDate}>{snapshotDate}</time>, starting with EDDMapS and USGS NAS records. Reviewed county research also contributes to the Alabama map. Counts describe documented matching species, not their abundance or the level of danger.</p></div>
              </li>
              <li className="grid gap-2 py-5 sm:grid-cols-[48px_minmax(0,1fr)] sm:gap-5">
                <span className="text-sm tabular-nums text-[var(--muted)]" aria-hidden="true">03</span>
                <div><h3 className="text-lg font-semibold">Evidence you can inspect</h3><p className="mt-2 text-base leading-7 text-[var(--muted)]">County research covers all 50 states and the District of Columbia. It tracks evidence, source links, assessment dates, and unresolved questions. Research releases are updated separately from the map, so their records and counts can differ.</p></div>
              </li>
            </ol>
            <Link href="/research" className="text-link mt-4 inline-flex min-h-11 items-center gap-2">Explore county research <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </section>

          <section className="reading-section" aria-labelledby="limits-heading">
            <p className="reading-kicker">Read the limits with the evidence</p>
            <h2 id="limits-heading" className="text-2xl font-semibold">A missing record is an open question.</h2>
            <div className="mt-5 space-y-4 text-base leading-8 text-[var(--muted)]">
              <p>A recorded occurrence may be historical. It does not by itself establish that a species is present today, and an empty map area does not establish absence.</p>
              <p>A survey that did not detect a species is different from an official finding of absence or eradication. Each finding retains its geographic, time, and survey scope. Unresolved research remains unresolved.</p>
              <p>Catalog status, local occurrence, and current authority guidance answer different questions. Read the linked sources before making identification or management decisions.</p>
            </div>
          </section>

          <section id="help" className="reading-section scroll-mt-24" aria-labelledby="help-heading">
            <p className="reading-kicker">Take part</p>
            <h2 id="help-heading" className="text-2xl font-semibold">Start with an informed next step.</h2>
            <p className="mt-4 text-base leading-8 text-[var(--muted)]">Look up the species you are concerned about. Where a profile includes a reporting contact, it links directly to the relevant authority. County pages also include available local resources.</p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
              <Link href="/species" className="text-link inline-flex min-h-11 items-center gap-2">Find a species <ArrowUpRight size={16} aria-hidden="true" /></Link>
              <Link href="/" className="text-link inline-flex min-h-11 items-center gap-2">Find county resources <ArrowUpRight size={16} aria-hidden="true" /></Link>
            </div>
            <p className="mt-5 text-sm leading-7 text-[var(--muted)]">Isitusa does not currently accept sightings, email subscriptions, or donations through this site.</p>
          </section>
        </div>

        <aside className="reading-section lg:sticky lg:top-24" aria-labelledby="sources-heading">
          <p className="reading-kicker">Start at the source</p>
          <h2 id="sources-heading" className="text-xl font-semibold">Data foundations</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">These are starting sources. Individual county findings and species profiles carry their own references.</p>
          <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
            <li className="py-3"><a href="https://doi.org/10.5066/P9KFFTOD" target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">US-RIIS, version 2 <ArrowUpRight size={14} aria-hidden="true" /></a></li>
            <li className="py-3"><a href="https://www.eddmaps.org/" target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">EDDMapS <ArrowUpRight size={14} aria-hidden="true" /></a></li>
            <li className="py-3"><a href="https://nas.er.usgs.gov/" target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">USGS aquatic species <ArrowUpRight size={14} aria-hidden="true" /></a></li>
          </ul>
        </aside>
      </div>
    </main>
  );
}
