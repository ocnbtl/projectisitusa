import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Globe2, Heart, MapPin, ScanSearch } from "lucide-react";
import { STATE_FLAGS } from "@/content/state-flags";
import Image from "next/image";
import "./about.css";

const researchSources = [
  { name: "Harvard University", description: "Harvard University Herbaria: preserved plant specimens used in our occurrence research", image: "harvard.png", width: 192, height: 192, href: "https://www.huh.harvard.edu/pages/digital-resources", style: "" },
  { name: "Smithsonian", description: "Smithsonian National Museum of Natural History: preserved specimens used in our occurrence research", image: "smithsonian.svg", width: 148, height: 57, href: "https://collections.nmnh.si.edu/ipt/resource?r=nmnh_extant_dwc-a", style: "source-logo-dark-light" },
  { name: "USGS", description: "U.S. Geological Survey: US-RIIS and aquatic species records", image: "usgs.png", width: 227, height: 86, href: "https://nas.er.usgs.gov/", style: "source-logo-usgs" },
  { name: "USDA", description: "U.S. Department of Agriculture: plant, pest, and forest research", image: "usda.svg", width: 219, height: 150, href: "https://www.aphis.usda.gov/", style: "source-logo-dark-light" },
  { name: "EPA", description: "U.S. Environmental Protection Agency: river and stream surveys", image: "epa.png", width: 196, height: 196, href: "https://www.epa.gov/national-aquatic-resource-surveys/nrsa", style: "source-logo-dark-light" },
  { name: "U.S. Fish & Wildlife", description: "U.S. Fish and Wildlife Service: invasive carp monitoring", image: "fws.svg", width: 125, height: 150, href: "https://www.fws.gov/", style: "source-logo-shield" },
  { name: "Cornell University", description: "Cornell Integrated Pest Management: invasive insect identification and practical guidance", image: "cornell.png", width: 1600, height: 1603, href: "https://cals.cornell.edu/integrated-pest-management/outreach-education/whats-bugging-you/brown-marmorated-stink-bug", style: "source-logo-dark-light" },
  { name: "Penn State", description: "Penn State Extension: allium leafminer monitoring and management guidance", image: "penn-state.ico", width: 347, height: 347, href: "https://extension.psu.edu/fall-flight-of-allium-leafminer-observed-in-southeast-pa", style: "" },
  { name: "Purdue University", description: "Purdue University and USDA Forest Service: Alien Forest Pest Explorer", image: "purdue.svg", width: 203.8, height: 132, href: "https://purr.purdue.edu/publications/4479", style: "source-logo-usgs" },
  { name: "University of Florida", description: "University of Florida IFAS and Florida Museum: plant research and species identification guides", image: "florida.png", width: 64, height: 64, href: "https://plant-directory.ifas.ufl.edu/plant-directory/dioscorea-bulbifera/", style: "" },
  { name: "University of Wisconsin-Madison", description: "University of Wisconsin-Madison Extension: horticultural research and plant profiles", image: "wisconsin.svg", width: 55.5, height: 87.28, href: "https://hort.extension.wisc.edu/articles/popcorn-cassia-senna-cassia-didymobotrya/", style: "source-logo-shield" },
  { name: "University of Georgia", description: "University of Georgia: Early Detection and Distribution Mapping System", image: "eddmaps.png", width: 250, height: 61, href: "https://www.eddmaps.org/", style: "source-logo-dark-light" },
  { name: "Forest Service", description: "USDA Forest Service: forest pest detections and invasive plant surveys", image: "usfs.svg", width: 182, height: 198, href: "https://www.fs.usda.gov/", style: "source-logo-shield" },
  { name: "New York Botanical Garden", description: "New York Botanical Garden: preserved herbarium specimens", image: "nybg.svg", width: 524, height: 160, href: "https://sweetgum.nybg.org/science/vh/", style: "source-logo-dark-light" },
  { name: "GBIF", description: "Global Biodiversity Information Facility: biodiversity records and collections", image: "gbif.svg", width: 1061, height: 218, href: "https://www.gbif.org/", style: "source-logo-dark-light" },
  { name: "iNaturalist", description: "iNaturalist: research-grade observations", image: "inaturalist.svg", width: 1153, height: 210, href: "https://www.inaturalist.org/", style: "source-logo-dark-light" },
  { name: "iDigBio", description: "Integrated Digitized Biocollections: museum and herbarium specimens", image: "idigbio.png", width: 200, height: 62, href: "https://www.idigbio.org/", style: "" },
];

export const metadata: Metadata = {
  title: "About isitusa",
  alternates: { canonical: "https://isitusa.com/about" },
  description: "isitusa is an independent initiative based in the United States, making invasive species information easier to find, understand, and use.",
};

export default function AboutPage() {
  return (
    <main id="main-content" className="reading-page about-page">
      <header className="about-opening">
        <h1>Making invasive species research useful.</h1>
        <div className="about-introduction">
          <div className="about-story">
            <p className="about-lead">Everyone should be able to find accurate information about invasive species near them, and see the source it comes from.</p>
            <p><strong className="brand-wordmark">isitusa</strong> is an independent initiative established in the United States of America by environmentalists. We care about the places we call home, and believe good information should help more people care for them.</p>
            <p>We bring scattered reports into one useful, intuitive map, connecting the places you care about with reputable research you can trace back to its source. Agency records, scientific collections, and observations become easier to explore together, with the context that gives each finding meaning.</p>
            <p>Whether you are noticing something new in your backyard or looking after an entire landscape, we want to make the next step clearer: learn what has been recorded, understand what is still uncertain, and know where to look next.</p>
            <Link href="/" className="primary-button inline-flex items-center gap-2">Explore your county <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
          <div className="about-brand-and-sources">
            <div className="about-brand-lockup" aria-label="About isitusa">
              <Image className="brand-art" src="/brand/v3/isitusa-symbol-name.svg" alt="isitusa" width={220} height={294} unoptimized priority />
              <Image className="brand-art about-full-name" src="/brand/full-name-v2/isitusa-full-name-green.svg" alt="Invasive Species In The United States of America" width={2133} height={356} unoptimized priority />
            </div>
            <section className="about-source-panel" aria-labelledby="source-panel-heading">
              <h2 id="source-panel-heading">Built on trusted research from fellow protagonists</h2>
              <ul className="about-source-logos">
                {researchSources.map(source => <li key={source.name}>
                  <a href={source.href} target="_blank" rel="noreferrer" title={source.description}>
                    <span className={`about-source-mark ${source.style}`}><Image src={`/source-logos/${source.image}`} alt="" width={source.width} height={source.height} unoptimized /></span>
                    <span>{source.name}<ArrowUpRight size={12} aria-hidden="true" /></span>
                    <span className="sr-only">{source.description}. Opens in a new tab.</span>
                  </a>
                </li>)}
              </ul>
              <p>We aggregate data from state agencies, universities, scientific collections, and the federal government to defend our planet and protect the places we care about. Source attribution does not imply partnership or endorsement.</p>
              <a href="#sources-heading" className="text-link">More about our data sources <ArrowRight size={15} aria-hidden="true" /></a>
            </section>
          </div>
        </div>
      </header>

      <nav className="about-page-nav" aria-label="On this page"><a href="#purpose-heading">Why isitusa</a><a href="#method-heading">Our approach</a><a href="#outlook-heading">Where we are headed</a><a href="#help-heading">Get involved <ArrowRight size={16} aria-hidden="true" /></a></nav>

      <section className="about-purpose" aria-labelledby="purpose-heading">
        <h2 id="purpose-heading">Useful knowledge should be within reach.</h2>
        <div>
          <p>You might be looking after a garden, managing a park, or trying to name a plant beside a trail. Finding reliable information should not require knowing which database to search.</p>
          <p>Much of the knowledge already exists, but it lives across agency websites, scientific collections, local surveys, and separate databases. We use technology to connect those pieces and make them easier to navigate. The people who collected the evidence remain part of the story: their sources, dates, and findings stay attached to the information you see.</p>
        </div>
      </section>

      <section className="about-purpose" aria-labelledby="commitment-heading"><h2 id="commitment-heading">Built to be useful, and open about its limits.</h2><div><p>We are building isitusa as an independent research initiative. We organize existing knowledge, check what it supports, and make the results easier to explore. Our responsibility is to make the sources, dates, and limits of each finding easy to check.</p><p>This project is a work in progress. Some counties have extensive records; others need more research. We show those gaps because knowing what is still unknown is part of understanding a place. As the evidence changes, our findings can change too.</p></div></section>

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

      <section className="about-purpose" aria-labelledby="review-heading"><h2 id="review-heading">How a finding reaches the map.</h2><div><p>We check that the species, county, source, and time period support the claim being made. Sources that are incomplete or ambiguous stay unresolved. Reviewed evidence is kept with the record, including corrections and conflicting findings.</p><p>Presence, survey non-detection, and an explicit finding of absence answer different questions. We keep them separate, along with what still needs checking.</p></div></section>

      <section className="about-outlook" aria-labelledby="outlook-heading">
        <Globe2 size={32} strokeWidth={1.5} aria-hidden="true" />
        <div><h2 id="outlook-heading">Starting in the U.S., thinking beyond borders.</h2><p>Invasive species do not stop at borders. Our work begins with U.S. counties and county equivalents, but our ambition is global: to make local invasive species information easier to access wherever people need it. We want to earn trust through useful tools, transparent research, and a willingness to improve when better evidence comes along.</p><p>Our catalog starts with the US-RIIS lower-48 register. It is a foundation to build on, not a complete list of every species in every place.</p></div>
      </section>

      <section id="help" className="about-help scroll-mt-8" aria-labelledby="help-heading">
        <div className="section-introduction"><h2 id="help-heading">Help make the research more useful.</h2><p>Share it with someone, learn how to report a sighting, or see what we are working on next.</p></div>
        <div className="involvement-links">
          <Link href="/report"><span><strong>Share an observation</strong><small>See how to document what you found and where to report it.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/join"><span><strong>Follow what matters to you</strong><small>We are planning county updates, species alerts, and ways to help. Signups are not open yet.</small></span><ArrowUpRight size={22} aria-hidden="true" /></Link>
          <Link href="/support"><span><strong>Support the mission</strong><small>Help keep research open and useful.</small></span><Heart size={22} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className="about-sources" aria-labelledby="sources-heading">
        <h2 id="sources-heading">The research we build on.</h2>
        <p>The map is possible because researchers, public agencies, museums, herbaria, and people in the field have spent years documenting the natural world. We bring together selected records from their work. Our catalog begins with US-RIIS; occurrence and monitoring evidence comes from sources including EDDMapS, USGS aquatic species records, USDA programs, EPA surveys, GBIF, iDigBio, and iNaturalist.</p>
        <p>Different sources answer different questions. A specimen documents a collection, a survey describes what was checked, and a regulatory notice has its own geographic and time limits. We keep those distinctions visible rather than treating every record as the same kind of proof. Visit the research pages for source details, review status, and the references behind individual findings.</p>
        <div className="source-links">
          <a href="https://doi.org/10.5066/P9KFFTOD" target="_blank" rel="noreferrer">US-RIIS <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://www.eddmaps.org/" target="_blank" rel="noreferrer">EDDMapS <ArrowUpRight size={15} aria-hidden="true" /></a>
          <a href="https://nas.er.usgs.gov/" target="_blank" rel="noreferrer">USGS aquatic species <ArrowUpRight size={15} aria-hidden="true" /></a>
          <Link href="/research">Explore the research <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>
      <section id="map-credits" className="about-sources"><h2>Map artwork credits.</h2>
      <details className="map-artwork-credits"><summary>Flag sources & credits</summary><a href="https://commons.wikimedia.org/wiki/Flags_of_the_U.S._states_and_territories" target="_blank" rel="noreferrer">Wikimedia Commons gallery</a>{Object.entries(STATE_FLAGS).filter(([,flag]) => flag.license !== "Public domain").map(([code,flag]) => <p key={code}><a href={flag.source} target="_blank" rel="noreferrer">{code} flag</a>: {flag.artist}. {flag.license === "CC BY-SA 4.0" ? <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> : flag.license}. Unmodified.</p>)}</details>
      </section>
    </main>
  );
}
