import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Heart, MapPin, ScanSearch } from "lucide-react";
import { SiteCredits } from "@/components/site-credits";
import Image from "next/image";
import "./about-experience.css";
import { AboutSourceCarousel } from "@/components/about-source-carousel";

const researchSources = [
  { name: "Harvard University", description: "Harvard University Herbaria: preserved plant specimens used in our occurrence research", image: "harvard.png", width: 192, height: 192, href: "https://www.huh.harvard.edu/pages/digital-resources", style: "" },
  { name: "Smithsonian", description: "Smithsonian National Museum of Natural History: preserved specimens used in our occurrence research", image: "smithsonian.svg", width: 148, height: 57, href: "https://collections.nmnh.si.edu/ipt/resource?r=nmnh_extant_dwc-a", style: "source-logo-dark-light" },
  { name: "USGS", description: "U.S. Geological Survey: US-RIIS and aquatic species records", image: "usgs.png", width: 227, height: 86, href: "https://nas.er.usgs.gov/", style: "source-logo-usgs" },
  { name: "USDA", description: "U.S. Department of Agriculture: plant, pest, and forest research", image: "usda.svg", width: 219, height: 150, href: "https://www.aphis.usda.gov/", style: "source-logo-dark-light" },
  { name: "EPA", description: "U.S. Environmental Protection Agency: river and stream surveys", image: "epa.png", width: 196, height: 196, href: "https://www.epa.gov/national-aquatic-resource-surveys/nrsa", style: "source-logo-dark-light" },
  { name: "U.S. Fish & Wildlife", description: "U.S. Fish and Wildlife Service: invasive carp monitoring", image: "fws.svg", width: 125, height: 150, href: "https://www.fws.gov/", style: "source-logo-shield" },
  {"name":"NOAA","description":"National Oceanic and Atmospheric Administration: invasive lionfish and marine species references","image":"noaa.svg","width":74,"height":74,"href":"https://oceanservice.noaa.gov/facts/lionfish-facts.html","style":""},
  {"name":"National Park Service","description":"National Park Service: invasive plant identification and ecological context","image":"nps.png","width":80,"height":106,"href":"https://www.nps.gov/neri/learn/nature/kudzu.htm","style":"source-logo-shield"},
  { name: "Cornell University", description: "Cornell Integrated Pest Management: invasive insect identification and practical guidance", image: "cornell.png", width: 1600, height: 1603, href: "https://cals.cornell.edu/integrated-pest-management/outreach-education/whats-bugging-you/brown-marmorated-stink-bug", style: "source-logo-dark-light" },
  { name: "Penn State", description: "Penn State Extension: allium leafminer monitoring and management guidance", image: "penn-state.ico", width: 347, height: 347, href: "https://extension.psu.edu/fall-flight-of-allium-leafminer-observed-in-southeast-pa", style: "" },
  { name: "Purdue University", description: "Purdue University and USDA Forest Service: Alien Forest Pest Explorer", image: "purdue.svg", width: 203.8, height: 132, href: "https://purr.purdue.edu/publications/4479", style: "source-logo-usgs" },
  { name: "University of Florida", description: "University of Florida IFAS and Florida Museum: plant research and species identification guides", image: "florida.png", width: 64, height: 64, href: "https://plant-directory.ifas.ufl.edu/plant-directory/dioscorea-bulbifera/", style: "" },
  { name: "University of Wisconsin-Madison", description: "University of Wisconsin-Madison Extension: horticultural research and plant profiles", image: "wisconsin.svg", width: 55.5, height: 87.28, href: "https://hort.extension.wisc.edu/articles/popcorn-cassia-senna-cassia-didymobotrya/", style: "source-logo-shield" },
  { name: "University of Georgia", description: "University of Georgia: Early Detection and Distribution Mapping System", image: "eddmaps.png", width: 250, height: 61, href: "https://www.eddmaps.org/", style: "source-logo-dark-light" },
  {"name":"University of Minnesota","description":"University of Minnesota Extension: invasive species identification and management guidance","image":"minnesota.svg","width":220,"height":152.7043158,"href":"https://extension.umn.edu/identify-invasive-species/garlic-mustard","style":"source-logo-dark-light"},
  {"name":"NC State University","description":"NC State Extension Plant Toolbox: plant identification and species profiles","image":"nc-state-compact.png","width":300,"height":144,"href":"https://plants.ces.ncsu.edu/plants/acer-pseudoplatanus/","style":"source-logo-dark-light"},
  {"name":"Virginia Tech","description":"Virginia Tech: weed identification resources used in our species profiles","image":"virginia-tech.svg","width":943,"height":466,"href":"https://weedid.cals.vt.edu/profile/476","style":"source-logo-usgs"},
  {"name":"Oregon State University","description":"Oregon State University: landscape plant descriptions and identification","image":"oregon-state.svg","width":250,"height":80,"href":"https://landscapeplants.oregonstate.edu/plants/pinus-halepensis","style":"source-logo-dark-light"},
  { name: "Forest Service", description: "USDA Forest Service: forest pest detections and invasive plant surveys", image: "usfs.svg", width: 182, height: 198, href: "https://www.fs.usda.gov/", style: "source-logo-shield" },
  { name: "New York Botanical Garden", description: "New York Botanical Garden: preserved herbarium specimens", image: "nybg.svg", width: 524, height: 160, href: "https://sweetgum.nybg.org/science/vh/", style: "source-logo-dark-light" },
  { name: "GBIF", description: "Global Biodiversity Information Facility: biodiversity records and collections", image: "gbif.svg", width: 1061, height: 218, href: "https://www.gbif.org/", style: "source-logo-dark-light" },
  { name: "iNaturalist", description: "iNaturalist: research-grade observations", image: "inaturalist.svg", width: 1153, height: 210, href: "https://www.inaturalist.org/", style: "source-logo-dark-light" },
  { name: "iDigBio", description: "Integrated Digitized Biocollections: museum and herbarium specimens", image: "idigbio.png", width: 200, height: 62, href: "https://www.idigbio.org/", style: "" },
];

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
          <div className="about-brand-lockup" aria-label="ISITUSA">
            <Image className="brand-art" src="/brand/v10/symbol-name.svg?v=1.001" alt="ISITUSA" width={840} height={1080} unoptimized priority />
            <Image className="brand-art about-full-name" src="/brand/v10/full-name.svg?v=1.001" alt="Invasive Species In The United States of America" width={11180} height={1874} unoptimized priority />
          </div>
          <p className="about-lead">Our mission is to make invasive species research accessible, understandable, and useful to everyone. We connect people with accurate information about the species near them, helping communities take informed action to protect native biodiversity and the places they love.</p>
          <p className="about-mission-copy"><strong className="brand-wordmark">ISITUSA</strong> is an independent initiative established in the United States of America by environmentalists.</p>
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

      <SiteCredits />
    </main>
  );
}
