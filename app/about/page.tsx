import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export const metadata: Metadata = {
  title: "About Isitusa",
  description:
    "Isitusa is an independent initiative making invasive species information easier to understand and use, beginning in the United States with a global ambition.",
};

export default function AboutPage() {
  return (
    <main id="main-content" className="reading-page about-page">
      <header className="reading-hero about-introduction">
        <h1>For the places we care about.</h1>
        <p className="mt-6 max-w-3xl text-xl leading-9">
          Isitusa is an independent initiative making invasive species information
          easier to find, understand, and use.
        </p>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--muted)]">
          The work begins in the United States, with a global ambition: to help
          people understand introduced species where they live and make informed
          decisions about the places they care for.
        </p>
        <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
          <Link href="/" className="primary-button inline-flex items-center gap-2">
            Explore the map <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/research" className="text-link inline-flex min-h-11 items-center gap-2">
            Look into the research <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </header>

      <div className="about-layout grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_290px] lg:gap-16">
        <div>
          <section className="reading-section" aria-labelledby="purpose-heading">
            <h2 id="purpose-heading">Good information needs context.</h2>
            <p className="mt-4 text-base leading-8 text-[var(--muted)]">
              A useful record connects a species with a place, a date, and a
              source. That context helps distinguish an old observation from a
              recent survey, or a regional listing from a record in your own county.
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--muted)]">
              Much of this information is spread across agency websites, research
              collections, monitoring programs, and field guides. Isitusa brings
              those connections into a more approachable view, whether you are
              learning about your neighborhood, caring for land, or looking more
              closely at something you found outdoors.
            </p>
          </section>

          <section className="reading-section" aria-labelledby="method-heading">
            <h2 id="method-heading">An atlas built around the evidence.</h2>
            <div className="about-principles mt-6 divide-y divide-[var(--border)]">
              <div className="py-5">
                <h3 className="text-lg font-semibold">Start with a place or a species.</h3>
                <p className="mt-2 text-base leading-7 text-[var(--muted)]">
                  The map helps you explore county records. Species profiles
                  bring together references, identification notes, and practical
                  guidance where those materials are available.
                </p>
              </div>
              <div className="py-5">
                <h3 className="text-lg font-semibold">Keep the source within reach.</h3>
                <p className="mt-2 text-base leading-7 text-[var(--muted)]">
                  Research views let you follow the evidence behind a record,
                  including its location, dates, and geographic scope. An
                  observation date, a review date, and a release date each mean
                  something different.
                </p>
              </div>
              <div className="py-5">
                <h3 className="text-lg font-semibold">Leave room for what is still unknown.</h3>
                <p className="mt-2 text-base leading-7 text-[var(--muted)]">
                  A missing record does not establish absence. A historical
                  occurrence does not establish presence today. A survey that
                  did not detect a species and an official absence or eradication
                  finding retain their own time and geographic limits.
                </p>
              </div>
            </div>
          </section>

          <section className="reading-section" aria-labelledby="future-heading">
            <h2 id="future-heading">Starting in the U.S., looking further.</h2>
            <p className="mt-4 text-base leading-8 text-[var(--muted)]">
              The current
              atlas focuses on U.S. counties and county equivalents, with a
              species catalog drawn from the US-RIIS lower-48 register. Coverage
              varies, and the catalog is not a complete inventory of every place.
            </p>
            <p className="mt-4 text-base leading-8 text-[var(--muted)]">
              The longer-term goal is to extend this approach beyond the United
              States: clearer local information, more useful connections between
              sources, and a broader understanding of invasive species across
              borders. Building a trustworthy foundation here is the first step.
            </p>
          </section>

          <section id="help" className="reading-section about-participation scroll-mt-24" aria-labelledby="help-heading">
            <h2 id="help-heading">Your observations can help.</h2>
            <p className="mt-4 text-base leading-8 text-[var(--muted)]">
              If you think you have found an invasive species, use an established
              reporting program that can review the observation. EDDMapS accepts
              reports, and the USDA reporting directory can help you find a
              relevant program. Species profiles also link to available guidance
              from the responsible authorities.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
              <a href="https://www.eddmaps.org/report/" target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">
                Report through EDDMapS <ArrowUpRight size={16} aria-hidden="true" />
              </a>
              <a href="https://www.invasivespeciesinfo.gov/subject/reporting" target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">
                Find a reporting program <ArrowUpRight size={16} aria-hidden="true" />
              </a>
            </div>
            <p className="mt-5 text-base leading-8 text-[var(--muted)]">
              You can also use Isitusa to learn about a species, compare the
              evidence for a place, and share a profile with someone who would
              find it useful.
            </p>
          </section>
        </div>

        <aside className="reading-section about-aside lg:sticky lg:top-24" aria-labelledby="sources-heading">
          <h2 id="sources-heading">Where the information begins</h2>
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            These are some of the project&apos;s starting sources. Each species and
            county research record carries its own references.
          </p>
          <ul className="mt-4 divide-y divide-[var(--border)] text-sm">
            <li className="py-4">
              <a href="https://doi.org/10.5066/P9KFFTOD" target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">US-RIIS <ArrowUpRight size={14} aria-hidden="true" /></a>
              <p className="mt-1 text-[var(--muted)]">The U.S. Register of Introduced and Invasive Species, version 2.</p>
            </li>
            <li className="py-4">
              <a href="https://www.eddmaps.org/" target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">EDDMapS <ArrowUpRight size={14} aria-hidden="true" /></a>
              <p className="mt-1 text-[var(--muted)]">Early Detection & Distribution Mapping System.</p>
            </li>
            <li className="py-4">
              <a href="https://nas.er.usgs.gov/" target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">USGS aquatic species database <ArrowUpRight size={14} aria-hidden="true" /></a>
              <p className="mt-1 text-[var(--muted)]">Nonindigenous Aquatic Species records and references.</p>
            </li>
          </ul>
          <Link href="/research" className="text-link mt-4 inline-flex min-h-11 items-center gap-2">Explore the evidence <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </aside>
      </div>
    </main>
  );
}
