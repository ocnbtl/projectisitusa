import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Globe2, Heart, MapPin, ScanSearch } from "lucide-react";
import { SpeciesImage } from "@/components/species-image";

export const metadata: Metadata = {
  title: "About IsItUSA",
  description: "IsItUSA is an independent initiative based in the United States, making invasive species information easier to find, understand, and use.",
};

export default function AboutPage() {
  return (
    <main id="main-content" className="reading-page about-page">
      <header className="about-hero">
        <div className="about-hero-copy">
          <h1>For the places<br />we care about.</h1>
          <p>Knowing what lives around us is a good place to start caring for it.</p>
          <p>IsItUSA brings invasive species records into one accessible atlas. Find what has been documented near you, follow the sources, and understand what those records can tell us.</p>
          <Link href="/" className="primary-button inline-flex items-center gap-2">Explore your county <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <figure className="about-field-image">
          <SpeciesImage src="/species/kudzu.jpg" alt="Kudzu vines covering trees" credit="Forest & Kim Starr / Wikimedia Commons" label="Kudzu" />
          <figcaption><Link href="/species/kudzu">Get to know kudzu <ArrowUpRight size={15} aria-hidden="true" /></Link></figcaption>
        </figure>
      </header>

      <section className="about-purpose" aria-labelledby="purpose-heading">
        <h2 id="purpose-heading">Good information<br />belongs within reach.</h2>
        <div>
          <p>Species records are scattered across research collections, agency websites, and monitoring programs. Finding them is only half the work. Understanding where they apply, when an observation was made, and what remains uncertain matters just as much.</p>
          <p>We connect those details so you can spend less time searching and more time learning about the places you know.</p>
        </div>
      </section>

      <section className="about-method" aria-labelledby="method-heading">
        <div className="section-introduction">
          <h2 id="method-heading">Every record has a story.</h2>
          <p>We keep the details that make it useful.</p>
        </div>
        <dl className="record-context">
          <div><dt><MapPin size={21} aria-hidden="true" /> A place</dt><dd>A county record and a statewide listing have different geographic limits.</dd></div>
          <div><dt><CalendarDays size={21} aria-hidden="true" /> A date</dt><dd>An observation tells us about a moment in time. Its review date is a separate detail.</dd></div>
          <div><dt><BookOpen size={21} aria-hidden="true" /> A source</dt><dd>References stay close to the record, so you can look into the evidence yourself.</dd></div>
        </dl>
        <div className="about-evidence-note"><ScanSearch size={22} aria-hidden="true" /><p>A gap in the records is an open question. It does not mean a species is absent, and an old record does not confirm it is present today.</p></div>
        <Link href="/research" className="text-link inline-flex min-h-11 items-center gap-2">Follow the research <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>

      <section className="about-outlook" aria-labelledby="outlook-heading">
        <Globe2 size={32} strokeWidth={1.5} aria-hidden="true" />
        <div><h2 id="outlook-heading">Starting locally. Thinking globally.</h2><p>IsItUSA is an independent initiative based in the United States. Our ambition is to make reliable, local species information useful across borders. We are building that foundation here, county by county.</p><p>Today, the atlas covers U.S. counties and county equivalents. Its catalog begins with the US-RIIS lower-48 register, so it is not a complete inventory of every place.</p></div>
      </section>

      <section id="help" className="about-help scroll-mt-8" aria-labelledby="help-heading">
        <div className="section-introduction"><h2 id="help-heading">There is a place for you in this work.</h2><p>Start with your curiosity. Take the next step when you are ready.</p></div>
        <div className="involvement-links">
          <Link href="/report"><span><strong>Share an observation</strong><small>See how to document what you found and where to report it.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/join"><span><strong>Follow what matters to you</strong><small>Learn about county updates, species alerts, and ways to help.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/support"><span><strong>Support the atlas</strong><small>Help make the research and the tools more useful.</small></span><Heart size={22} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="about-sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">Built on work worth crediting.</h2>
        <p>Our starting sources include the U.S. Register of Introduced and Invasive Species, EDDMapS, and the USGS Nonindigenous Aquatic Species database. Individual records carry their own references.</p>
        <div className="source-links">
          <a href="https://doi.org/10.5066/P9KFFTOD" target="_blank" rel="noreferrer">US-RIIS <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://www.eddmaps.org/" target="_blank" rel="noreferrer">EDDMapS <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://nas.er.usgs.gov/" target="_blank" rel="noreferrer">USGS aquatic species <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </section>
    </main>
  );
}
