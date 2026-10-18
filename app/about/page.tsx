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
          <p>We bring public evidence together without separating a finding from its context. Each source has its own scope and limits; our job is to make those clear, keep the references traceable, and leave uncertainty visible.</p>
        </div>
        <dl className="record-context">
          <div><dt><MapPin size={21} aria-hidden="true" /> Where</dt><dd>We connect evidence to the place it actually describes. A statewide mention alone does not establish a record in every county.</dd></div>
          <div><dt><CalendarDays size={21} aria-hidden="true" /> When</dt><dd>We distinguish the observation date from publication and review dates. A newly added record may describe a much older finding.</dd></div>
          <div><dt><BookOpen size={21} aria-hidden="true" /> According to whom</dt><dd>We preserve the source and how the evidence was gathered, so you can follow the reference and understand what it supports.</dd></div>
        </dl>
        <div className="about-evidence-note"><ScanSearch size={22} aria-hidden="true" /><p>An empty spot on the map does not mean a species is absent. An older record does not prove it is still there today.</p></div>
        <div className="about-section-actions"><Link href="/approach">See our full approach <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/species">See the records <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </section>

      <div className="about-research-grid">
      <section className="about-sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">The research we build on.</h2>
        <p>Our catalog starts with US-RIIS. Agency records, scientific collections, surveys, and community observations help document where species have been found; university and scientific references help explain them. Each source contributes a different part of the picture.</p>
        <p>Our data-sources paper explains what we use, how the sources differ, and where their limits matter. Credits recognize the people and organizations behind that work.</p>
        <div className="about-section-actions"><Link href="/data-sources">Read our data-sources paper <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/credits#research">Explore source credits <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
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
