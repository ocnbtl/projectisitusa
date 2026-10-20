import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, ChevronDown, MapPin, ScanSearch } from "lucide-react";
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
          <h2 id="source-panel-heading">Built on trusted research</h2>
          <AboutSourceCarousel sources={researchSources} />
          <p>We aggregate public data from state agencies, universities, scientific collections, and the federal government to defend our planet and protect the places we care about.</p>
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
          <p>We look through published research, public records, and observations to help you understand what has been found near you. Alongside each finding, we keep the details that help you make sense of it: where it came from, when it was recorded, and what we still don’t know.</p>
        </div>
        <dl className="record-context">
          <div><dt><MapPin size={21} aria-hidden="true" /> Where</dt><dd>We check which place a record describes before adding it to the map. A species reported somewhere in a state is not automatically recorded in every county.</dd></div>
          <div><dt><CalendarDays size={21} aria-hidden="true" /> When</dt><dd>We look for when a species was observed, as well as when the record was published or reviewed. Something new to our map may have been found years ago.</dd></div>
          <div><dt><BookOpen size={21} aria-hidden="true" /> According to whom</dt><dd>We keep a link to the original source and, when available, explain how the finding was documented. You can see who reported it and read the details for yourself.</dd></div>
        </dl>
        <div className="about-evidence-note"><ScanSearch size={22} aria-hidden="true" /><p><strong>Records tell part of the story.</strong> A blank area may simply mean we haven’t found a record for it yet. An older sighting tells us a species was found there then, but we need newer evidence to know whether it is still there.</p></div>
        <div className="about-section-actions"><Link href="/approach">See our full approach <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/species">See the records <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </section>

      <div className="about-research-grid">
      <section className="about-sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">The research we build on.</h2>
        <p>We draw on public resources from agencies, universities, museums, herbaria, and established observation networks. Our species catalog begins with the U.S. Register of Introduced and Invasive Species (US-RIIS), and we bring together additional records and references to build the map and profiles. A single source may provide sightings, photographs, identification details, or information about a species’ effects.</p>
        <p>Want to look closer? Our data-sources guide explains which resources we use, how we use them, and what they can and cannot tell us. Our credits link to the people, organizations, and collections whose work makes this possible.</p>
        <div className="about-section-actions"><Link href="/data-sources">Read our data-sources paper <ArrowRight size={16} aria-hidden="true" /></Link><Link href="/credits#research">Explore source credits <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </section>
      <details className="about-direction">
        <summary>What makes a species invasive?<ChevronDown size={18} aria-hidden="true" /></summary>
        <p>Not every species introduced to a new place is invasive. The term describes a species outside its native range whose introduction causes, or is likely to cause, harm to nature, the economy, or health.</p>
        <p>Understanding which species are nearby is a starting point. Learning how to recognize them, how they spread, and what local guidance recommends can help you decide what to do next.</p>
        <a className="about-definition-link" href="https://www.invasivespeciesinfo.gov/what-are-invasive-species" target="_blank" rel="noreferrer">Read the USDA definition <ArrowUpRight size={15} aria-hidden="true" /></a>
      </details>
      </div>

      <section id="help" className="about-help scroll-mt-8" aria-labelledby="help-heading">
        <div className="section-introduction"><h2 id="help-heading">Be part of the work.</h2><p>Share what you find, stay informed about the places you love, or help us build a resource more people can use.</p></div>
        <div className="involvement-links">
          <Link href="/report"><span><strong>Report a sighting</strong><small>Share photographs and details directly with our team for identification, review, and a possible referral.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/join"><span><strong>Get invasive species updates</strong><small>Choose the places, species, and stories you want to hear about. Update your preferences whenever you like.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/support"><span><strong>Support the mission</strong><small>Give once or regularly to help keep this free, open source tool available to everyone.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href={{pathname:"/volunteer"}}><span><strong>Volunteer with ISITUSA</strong><small>Bring your skills and curiosity. Tell us what you enjoy doing and find a role where you can help.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
        </div>
      </section>

      <p id="credits" className="about-credit-note"><span id="map-credits" />We draw on the resources, research, and creations of great people. Learn more about them in our <Link href="/credits">Credits</Link>.</p>
    </main>
  );
}
