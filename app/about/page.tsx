import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Heart, MapPin, ScanSearch } from "lucide-react";
import { researchSources } from "@/content/research-source-credits";
import Image from "next/image";
import "./about-experience.css";
import { AboutSourceCarousel } from "@/components/about-source-carousel";



export const metadata: Metadata = {
  title: "About ISITUSA",
  alternates: { canonical: "https://isitusa.com/about" },
  description: "ISITUSA is an independent initiative based in the United States, making invasive species information easier to find, understand, and use.",
};

export default function AboutPage() {
  return (
    <main id="main-content" className="reading-page about-page">
      <header className="about-opening">
        <div className="about-mission">
          <h1 className="page-heading">Accessible invasive species research to protect the places you love</h1>
          <div className="about-mission-identity">
            <Image className="brand-art" src="/brand/v10/symbol-name.svg?v=1.005" alt="ISITUSA" width={90} height={116} unoptimized />
            <p className="about-mission-copy"><strong className="brand-wordmark">ISITUSA</strong> is an independent initiative established in the United States of America by environmentalists.</p>
          </div>
          <p className="about-lead">Our mission is to make invasive species research accessible, understandable, and useful to everyone. We connect people with accurate information about the species near them, helping communities take informed action to protect native biodiversity and the places they love.</p>
        </div>
        <section className="about-source-panel" aria-labelledby="source-panel-heading">
          <h2 id="source-panel-heading">Built on trusted research from fellow protagonists</h2>
          <AboutSourceCarousel sources={researchSources} />
          <p>We aggregate public data from state agencies, universities, scientific collections, and the federal government to defend our planet and protect the places we care about.</p>
          <p className="source-disclaimer">Source attribution does not imply partnership or endorsement.</p>
          <a href="#sources-heading" className="text-link">More about our data sources <ArrowRight size={15} aria-hidden="true" /></a>
        </section>
      </header>
      <nav className="about-page-nav" aria-label="On this page">
        <a href="#method-heading"><span>Our approach</span><ArrowDown size={18} aria-hidden="true" /></a>
        <a href="#sources-heading"><span>Our data sources</span><ArrowDown size={18} aria-hidden="true" /></a>
        <a href="#help-heading"><span>Get involved</span><ArrowDown size={18} aria-hidden="true" /></a>
      </nav>

      <section className="about-method" aria-labelledby="method-heading">
        <div className="section-introduction">
          <h2 id="method-heading">Every record needs context.</h2>
          <p>A useful map starts long before a point appears on it. We search public agency records, scientific collections, monitoring programs, and observation databases for evidence about each species. Then we examine what a source actually documents, keeping its location, dates, and references together. Incomplete or conflicting evidence stays marked for further review.</p>
        </div>
        <dl className="record-context">
          <div><dt><MapPin size={21} aria-hidden="true" /> Where</dt><dd>We look for a named county, a survey location, or coordinates that connect a finding to a place. Evidence about one county stays tied to that county; a statewide mention alone does not tell us which counties have records. When the location is unclear, we leave that uncertainty visible.</dd></div>
          <div><dt><CalendarDays size={21} aria-hidden="true" /> When</dt><dd>A newly discovered source can describe a much older observation. We distinguish when a species was recorded from when a source was published or reviewed. That helps you tell a historical finding from recent evidence without mistaking an update to our map for a new arrival.</dd></div>
          <div><dt><BookOpen size={21} aria-hidden="true" /> According to whom</dt><dd>We keep a path back to the original evidence and consider how it was gathered. A preserved specimen, a field survey, and a public observation each offer different context. You can follow the reference to understand the finding, and gaps or disagreements remain open for review.</dd></div>
        </dl>
        <div className="about-evidence-note"><ScanSearch size={22} aria-hidden="true" /><p>An empty spot on the map does not mean a species is absent. An older record does not prove it is still there today.</p></div>
        <Link href="/research" className="text-link inline-flex min-h-11 items-center gap-2">See how we review records <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>

      <div className="about-research-grid">
      <section className="about-sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">The research we build on.</h2>
        <p>Our species catalog begins with the United States Register of Introduced and Invasive Species (US-RIIS) for the lower 48 states. To explore where species have been recorded, we draw on EDDMapS, the USGS Nonindigenous Aquatic Species database, state agency records, USDA and Forest Service programs, EPA river and stream surveys, and U.S. Fish and Wildlife Service monitoring.</p>
        <p>Scientific collections add another layer of evidence. GBIF and iDigBio make museum and herbarium records easier to find, alongside collections from institutions such as Harvard, the Smithsonian, and the New York Botanical Garden. Research-grade iNaturalist observations contribute records from people observing the natural world. University extension resources, including Cornell, NC State, and the University of Florida, help explain identification and management in our species profiles.</p>
        <p>These sources serve different purposes. We preserve the distinction between a recorded occurrence, a survey that did not detect a species, and an official determination of absence. References and dates let you look beyond the map and judge the evidence for yourself.</p>
        <div className="source-links">
          <a href="https://doi.org/10.5066/P9KFFTOD" target="_blank" rel="noreferrer">US-RIIS <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://www.eddmaps.org/" target="_blank" rel="noreferrer">EDDMapS <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://nas.er.usgs.gov/" target="_blank" rel="noreferrer">USGS aquatic species <ArrowUpRight size={15} aria-hidden="true" /></a>
          <Link href="/research">Explore the research <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>
      <section className="about-direction" aria-labelledby="outlook-heading">
        <h2 id="outlook-heading">Growing with the evidence.</h2>
        <p>Our work starts with U.S. counties and county equivalents. The catalog is a foundation to build on, not a complete list of every species in every place.</p>
        <p>Invasive species cross borders. We want reliable local information to be easier to find wherever people need it, growing the project as the evidence and our community grow.</p>
      </section>
      </div>

      <section id="help" className="about-help scroll-mt-8" aria-labelledby="help-heading">
        <div className="section-introduction"><h2 id="help-heading">Help make the research more useful.</h2><p>What you notice, learn, and share can help others understand the places around them. Choose a way to take part that works for you.</p></div>
        <div className="involvement-links">
          <Link href="/report"><span><strong>Document a sighting</strong><small>Noticed something unfamiliar? Learn what to photograph, which details to record, and how to share a useful observation.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/join"><span><strong>Choose your email updates</strong><small>Follow places and species you care about, discover their stories, and find practical ways to help. You choose what reaches your inbox.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/support"><span><strong>Help keep this research open</strong><small>Contribute once or give regularly to help make invasive species information easier for everyone to find, understand, and use.</small></span><Heart size={22} aria-hidden="true" /></Link>
        </div>
      </section>

      <p id="credits" className="about-credit-note"><span id="map-credits" />We draw on the resources, research, and creations of great people. Learn more about them in our <Link href="/credits">Credits</Link>.</p>
    </main>
  );
}
