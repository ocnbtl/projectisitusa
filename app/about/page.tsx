import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Heart, MapPin, ScanSearch } from "lucide-react";
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
          <h1>Accessible invasive species research to protect the places you love</h1>
          <p className="about-lead">Our mission is to make invasive species research accessible, understandable, and useful to everyone. We connect people with accurate information about the species near them, helping communities take informed action to protect native biodiversity and the places they love.</p>
          <div className="about-mission-identity">
            <Image className="brand-art" src="/brand/v10/symbol-name.svg?v=1.005" alt="ISITUSA" width={90} height={116} unoptimized />
            <p className="about-mission-copy"><strong className="brand-wordmark">ISITUSA</strong> is an independent initiative established in the United States of America by environmentalists.</p>
          </div>
          <Link href="/" className="primary-button inline-flex items-center gap-2">Explore your county <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <section className="about-source-panel" aria-labelledby="source-panel-heading">
          <h2 id="source-panel-heading">Built on trusted research from fellow protagonists</h2>
          <AboutSourceCarousel sources={researchSources} />
          <p>We aggregate public data from state agencies, universities, scientific collections, and the federal government to defend our planet and protect the places we care about.</p>
          <p className="source-disclaimer">Source attribution does not imply partnership or endorsement.</p>
          <a href="#sources-heading" className="text-link">More about our data sources <ArrowRight size={15} aria-hidden="true" /></a>
        </section>
      </header>
      <nav className="about-page-nav" aria-label="On this page"><a href="#method-heading">Our approach</a><a href="#sources-heading">Our data sources</a><a href="#help-heading">Get involved <ArrowRight size={16} aria-hidden="true" /></a></nav>

      <section className="about-method" aria-labelledby="method-heading">
        <div className="section-introduction">
          <h2 id="method-heading">Every record needs context.</h2>
          <p>We check the species, location, date, and original source behind a finding. Incomplete or conflicting evidence stays marked for further review.</p>
        </div>
        <dl className="record-context">
          <div><dt><MapPin size={21} aria-hidden="true" /> Where</dt><dd>A county record describes that county. It does not establish presence across a whole state.</dd></div>
          <div><dt><CalendarDays size={21} aria-hidden="true" /> When</dt><dd>The date a species was found can be much earlier than our review. We keep those dates separate.</dd></div>
          <div><dt><BookOpen size={21} aria-hidden="true" /> According to whom</dt><dd>Follow the original source to see what was documented and how the finding was made.</dd></div>
        </dl>
        <div className="about-evidence-note"><ScanSearch size={22} aria-hidden="true" /><p>An empty spot on the map does not mean a species is absent. An older record does not prove it is still there today.</p></div>
        <Link href="/research" className="text-link inline-flex min-h-11 items-center gap-2">See how we review records <ArrowRight size={16} aria-hidden="true" /></Link>
      </section>

      <div className="about-research-grid">
      <section className="about-sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">The research we build on.</h2>
        <p>Our catalog begins with the US-RIIS lower-48 register. Occurrence and monitoring evidence comes from sources including EDDMapS, USGS aquatic species records, USDA programs, EPA surveys, GBIF, iDigBio, and iNaturalist. Each finding keeps its source and date.</p>
        <p>A collected specimen, a survey, and a regulatory notice tell different stories. We keep those distinctions visible, including the difference between presence, non-detection, and documented absence.</p>
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
        <div className="section-introduction"><h2 id="help-heading">Help make the research more useful.</h2><p>Share it with someone, learn how to report a sighting, or see what we are working on next.</p></div>
        <div className="involvement-links">
          <Link href="/report"><span><strong>Share an observation</strong><small>See how to document what you found and where to report it.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/join"><span><strong>Follow what matters to you</strong><small>Choose the updates you would like to receive as our email program grows.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/support"><span><strong>Support the mission</strong><small>Help keep research open and useful.</small></span><Heart size={22} aria-hidden="true" /></Link>
        </div>
      </section>

      <p id="credits" className="about-credit-note"><span id="map-credits" />We draw on the resources, research, and creations of great people. Learn more about them in our <Link href="/credits">Credits</Link>.</p>
    </main>
  );
}
