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
          <h1>A clearer view of invasive species.</h1>
          <p>Which invasive species have been found where you live? The answer should be easy to find.</p>
          <p>IsItUSA brings scattered records together in a map anyone can explore. Look up your county, get to know a species, and see the research behind each record.</p>
          <Link href="/" className="primary-button inline-flex items-center gap-2">Explore your county <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <figure className="about-field-image">
          <SpeciesImage src={getSpeciesImageAsset("/species/kudzu.jpg").full.src} alt="Kudzu leaves and a cluster of purple flowers" credit="Forest & Kim Starr / Wikimedia Commons" label="Kudzu" />
          <figcaption><Link href="/species/kudzu">Get to know kudzu <ArrowUpRight size={15} aria-hidden="true" /></Link><p className="text-xs text-[var(--muted)]"><a href="https://commons.wikimedia.org/wiki/File:Starr_021012-0015_Pueraria_montana_var._lobata.jpg" target="_blank" rel="noreferrer">Photo by Forest &amp; Kim Starr</a> · <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>. Resized and cropped for display.</p></figcaption>
        </figure>
      </header>

      <section className="about-purpose" aria-labelledby="purpose-heading">
        <h2 id="purpose-heading">Local questions deserve clear answers.</h2>
        <div>
          <p>A plant at the edge of a trail. An unfamiliar insect in the garden. A change along a favorite river. These are often the things that make us curious about invasive species.</p>
          <p>The information is out there, but it can take time to find and understand. We bring together records from researchers, public agencies, and monitoring programs so more people can use them.</p>
        </div>
      </section>

      <section className="about-method" aria-labelledby="method-heading">
        <div className="section-introduction">
          <h2 id="method-heading">Look beyond the dot on the map.</h2>
          <p>Where a species was found, when it was recorded, and who documented it all matter.</p>
        </div>
        <dl className="record-context">
          <div><dt><MapPin size={21} aria-hidden="true" /> A place</dt><dd>A record from one county does not tell us what is happening across an entire state.</dd></div>
          <div><dt><CalendarDays size={21} aria-hidden="true" /> A date</dt><dd>A record may be years old. We keep observation dates separate from the date we reviewed the source.</dd></div>
          <div><dt><BookOpen size={21} aria-hidden="true" /> A source</dt><dd>Open the original reference to see how a finding was documented and what it says.</dd></div>
        </dl>
        <div className="about-evidence-note"><ScanSearch size={22} aria-hidden="true" /><p>An empty spot on the map does not mean a species is absent. An older record does not prove it is still there today.</p></div>
        <Link href="/research" className="text-link inline-flex min-h-11 items-center gap-2">See how we review records <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>

      <section className="about-outlook" aria-labelledby="outlook-heading">
        <Globe2 size={32} strokeWidth={1.5} aria-hidden="true" />
        <div><h2 id="outlook-heading">Built in the U.S. With a wider purpose.</h2><p>Invasive species cross borders. Useful information should, too. IsItUSA is an independent initiative based in the United States, with a long-term ambition to make local species information easier to use around the world.</p><p>We are starting with U.S. counties and county equivalents. Our species catalog begins with the US-RIIS lower-48 register; it is a starting point, not a complete list of every species in every place.</p></div>
      </section>

      <section id="help" className="about-help scroll-mt-8" aria-labelledby="help-heading">
        <div className="section-introduction"><h2 id="help-heading">Help make the atlas more useful.</h2><p>Share it with someone, learn how to report a sighting, or see what we are working on next.</p></div>
        <div className="involvement-links">
          <Link href="/report"><span><strong>Share an observation</strong><small>See how to document what you found and where to report it.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/join"><span><strong>See the updates we are planning</strong><small>County news, species alerts, and ways to help. Email signups are coming later.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
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
