import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Globe2, Heart, MapPin, ScanSearch } from "lucide-react";
import { SpeciesImage } from "@/components/species-image";
import { getSpeciesImageAsset } from "@/lib/data/species-image-assets";

export const metadata: Metadata = {
  title: "About IsItUSA",
  alternates: { canonical: "https://isitusa.com/about" },
  description: "IsItUSA is an independent initiative based in the United States, making invasive species information easier to find, understand, and use.",
};

export default function AboutPage() {
  return (
    <main id="main-content" className="reading-page about-page">
      <header className="about-hero">
        <div className="about-hero-copy">
          <h1>Making invasive species research useful.</h1>
          <p>Everyone should be able to find out what has been recorded where they live, and where that information comes from.</p>
          <p>IsItUSA brings scattered records into one atlas. We connect local places, species profiles, and original sources so you can ask better questions about the places you care for.</p>
          <Link href="/" className="primary-button inline-flex items-center gap-2">Explore your county <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <figure className="about-field-image">
          <SpeciesImage src={getSpeciesImageAsset("/species/kudzu.jpg").full.src} alt="Kudzu leaves and a cluster of purple flowers" credit="Forest & Kim Starr / Wikimedia Commons" label="Kudzu" />
          <figcaption><Link href="/species/kudzu">Get to know kudzu <ArrowUpRight size={15} aria-hidden="true" /></Link><p className="text-xs text-[var(--muted)]"><a href="https://commons.wikimedia.org/wiki/File:Starr_021012-0015_Pueraria_montana_var._lobata.jpg" target="_blank" rel="noreferrer">Photo by Forest &amp; Kim Starr</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Resized and cropped for display.</p></figcaption>
        </figure>
      </header>

      <nav className="about-page-nav" aria-label="On this page"><a href="#purpose-heading">Why IsItUSA</a><a href="#method-heading">Our approach</a><a href="#outlook-heading">Where we are headed</a><a href="#help-heading">Get involved <ArrowRight size={16} aria-hidden="true" /></a></nav>

      <section className="about-purpose" aria-labelledby="purpose-heading">
        <h2 id="purpose-heading">Useful knowledge should be within reach.</h2>
        <div>
          <p>You might be looking after a garden, managing a park, or trying to name a plant beside a trail. Finding reliable information should not require knowing which database to search.</p>
          <p>We bring together records from researchers, public agencies, and monitoring programs. Our job is to make their work easier to find and understand, while keeping the original evidence in view.</p>
        </div>
      </section>

      <section className="about-method" aria-labelledby="method-heading">
        <div className="section-introduction">
          <h2 id="method-heading">Every record needs context.</h2>
          <p>A map is a starting point. These three details help you understand a finding.</p>
        </div>
        <dl className="record-context">
          <div><dt><MapPin size={21} aria-hidden="true" /> Where</dt><dd>A county record describes that county. It does not establish presence across a whole state.</dd></div>
          <div><dt><CalendarDays size={21} aria-hidden="true" /> When</dt><dd>The date a species was found can be much earlier than our review. We keep those dates separate.</dd></div>
          <div><dt><BookOpen size={21} aria-hidden="true" /> According to whom</dt><dd>Follow the original source to see what was documented and how the finding was made.</dd></div>
        </dl>
        <div className="about-evidence-note"><ScanSearch size={22} aria-hidden="true" /><p>An empty spot on the map does not mean a species is absent. An older record does not prove it is still there today.</p></div>
        <Link href="/research" className="text-link inline-flex min-h-11 items-center gap-2">See how we review records <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>

      <section className="about-outlook" aria-labelledby="outlook-heading">
        <Globe2 size={32} strokeWidth={1.5} aria-hidden="true" />
        <div><h2 id="outlook-heading">Starting in the U.S., thinking beyond borders.</h2><p>IsItUSA is an independent initiative based in the United States. Our ambition is to help people use local species information around the world. We are beginning with U.S. counties and county equivalents, building an approach we can keep improving.</p><p>Our catalog starts with the US-RIIS lower-48 register. It is a foundation to build on, not a complete list of every species in every place.</p></div>
      </section>

      <section id="help" className="about-help scroll-mt-8" aria-labelledby="help-heading">
        <div className="section-introduction"><h2 id="help-heading">Help make the atlas more useful.</h2><p>Share it with someone, learn how to report a sighting, or see what we are working on next.</p></div>
        <div className="involvement-links">
          <Link href="/report"><span><strong>Share an observation</strong><small>See how to document what you found and where to report it.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/join"><span><strong>Follow what matters to you</strong><small>We are planning county updates, species alerts, and ways to help. Signups are not open yet.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/support"><span><strong>Support the atlas</strong><small>See how you can help while we prepare to accept contributions.</small></span><Heart size={22} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="about-sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">The research we build on.</h2>
        <p>This atlas draws on the work of researchers, public agencies, and people recording what they find. Our sources include US-RIIS, EDDMapS, and the USGS Nonindigenous Aquatic Species database. You can find the specific references alongside each record.</p>
        <div className="source-links">
          <a href="https://doi.org/10.5066/P9KFFTOD" target="_blank" rel="noreferrer">US-RIIS <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://www.eddmaps.org/" target="_blank" rel="noreferrer">EDDMapS <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://nas.er.usgs.gov/" target="_blank" rel="noreferrer">USGS aquatic species <ArrowUpRight size={15} aria-hidden="true" /></a>
        </div>
      </section>
    </main>
  );
}
