import Link from "next/link";
import { STATE_FLAGS } from "@/content/state-flags";
import { researchSources } from "@/content/research-source-credits";
import stateRegistry from "@/data/research/state-registry.json";
import s from "../../app/credits/credits.module.css";

const stateNames = new Map(stateRegistry.jurisdictions.map(state => [state.stateCode, state.stateName]));
const flags = Object.entries(STATE_FLAGS).sort(([a], [b]) => (stateNames.get(a) ?? a).localeCompare(stateNames.get(b) ?? b));
const researchGroups = [
  { title: "Agencies & public programs", description: "Catalogs, monitoring programs, occurrence records, and subject-specific guidance.", names: ["USGS", "USDA", "Forest Service", "EPA", "U.S. Fish & Wildlife", "NOAA", "National Park Service"] },
  { title: "Collections & observation networks", description: "Preserved specimens, shared biodiversity records, and documented observations.", names: ["Harvard University", "Smithsonian", "New York Botanical Garden", "University of Georgia", "GBIF", "iNaturalist", "iDigBio"] },
  { title: "Universities & extension resources", description: "Species identification, ecological context, management references, and specialist datasets.", names: ["Cornell University", "Penn State", "Purdue University", "University of Florida", "University of Wisconsin-Madison", "University of Minnesota", "NC State University", "Virginia Tech", "Oregon State University"] },
];
function artistCredit(artist: string) {
  const credit = artist.split("permission=")[0].replace(/Template:|User:/g, "").replace(/Unknown authorUnknown author/g, "Unknown author").replace(/\s+/g, " ").trim();
  return credit && credit !== "N.a" ? credit : "Contributor details are available on the source file page";
}

export function SiteCredits() {
  return <div className={s.body}>
    <section id="research" className={s.section} aria-labelledby="research-credit-heading">
      <h2 id="research-credit-heading">Research &amp; records</h2>
      <p>Our species catalog begins with the <a href="https://doi.org/10.5066/P9KFFTOD">U.S. Geological Survey&apos;s US-RIIS lower-48 register</a>. We combine it with occurrence records, specimen collections, surveys, and identification guidance from the sources below.</p>
      <p>These acknowledgments are grouped by contribution, with a direct link and a description of what we use. Individual profiles and records carry the more specific references behind each finding. For source selection, coverage, and limitations, read <Link href="/data-sources">Our data sources</Link>; for the evidence workflow, read <Link href="/approach">Our approach</Link>.</p>
      {researchGroups.map(group => <div className={s.creditGroup} key={group.title}>
        <h3>{group.title}</h3><p>{group.description}</p>
        <ul className={s.entries}>{group.names.map(name => researchSources.find(source => source.name === name)).filter(source => source !== undefined).map(source => <li key={source.name}>
          <h4><a href={source.href}>{source.name}</a></h4><p>{source.description}</p>
        </li>)}</ul>
      </div>)}
      <p>Additional program-specific evidence pathways, including regional collections and state agency sources, are listed in the <Link href="/data-sources#source-register">full registered-source directory</Link>. The organizations above are selected credits, not an exhaustive inventory of every original record publisher.</p>
      <p className={s.notice}>Source attribution does not imply partnership or endorsement. Data providers and original contributors retain their applicable rights; consult each source for its citation and reuse terms.</p>
    </section>
    <section id="maps" className={s.section} aria-labelledby="maps-credit-heading">
      <h2 id="maps-credit-heading">Maps &amp; boundaries</h2>
      <div className={s.entry}><h3>U.S. Census Bureau</h3><p>County maps use the <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html">2025 cartographic boundary files</a>. These supply the county and county-equivalent shapes used to display geographic records.</p></div>
      <div className={s.entry}><h3>U.S. Atlas, by Mike Bostock</h3><p>State outlines on downloadable county cards use <a href="https://github.com/topojson/us-atlas">U.S. Atlas</a>, derived from 2017 Census boundaries. <a href="/credits/us-atlas-LICENSE.txt">Read the copyright and license notice</a>.</p></div>
      <p>Mapping libraries are credited under <a href="#software">Open-source tools</a>. The geography supplies a frame for the evidence; a boundary itself does not establish that a species occurs there.</p>
    </section>
    <section id="photography" className={s.section} aria-labelledby="photo-credit-heading">
      <h2 id="photo-credit-heading">Species photography</h2>
      <p>Photographs help make a species recognizable. They belong to the photographers and contributors identified alongside each image.</p>
      <p>Open a profile in <Link href="/species">the species directory</Link> and select <strong>Photo credit</strong> to find the attribution supplied for that photograph and its source. We keep these credits with the image so the creator is not separated from their work.</p>
      <p>Permissions vary by photograph. Follow the original source for its license, required attribution, and reuse conditions.</p>
    </section>
    <section id="design" className={s.section} aria-labelledby="design-credit-heading">
      <h2 id="design-credit-heading">Typography &amp; design</h2>
      <div className={s.entry}><h3>Invasive Serif &amp; the ISITUSA identity</h3><p>Our custom botanical display lettering appears in the wordmark and editorial headings. Body text, scientific names, and controls use a system sans-serif. The New York Botanical Garden&apos;s identity was a visual inspiration; our font does not include proprietary NYBG font software or outlines. <Link href="/brand">Explore the brand kit</Link> and <a href="/fonts/invasive-serif/README.txt">font usage notes</a>.</p></div>
      <div className={s.entry}><h3>Organization logos</h3><p>Agency, university, and collection marks on our <Link href="/about">About page</Link> identify research sources. They belong to their respective organizations. Their use does not imply endorsement, affiliation, or permission to reuse those marks elsewhere.</p></div>
      <details><summary>Earlier typefaces &amp; retained license notices</summary>
        <p>Earlier brand experiments remain available in historical assets. Their original contributors and licenses are credited here separately from the current Invasive Serif identity.</p>
        <ul className={s.entries}>
          <li><h3><a href="https://github.com/cadsondemak/Chonburi">Chonburi, by Cadson Demak</a></h3><p>Adapted for earlier ISITUSA Botanical assets. <a href="/fonts/isitusa-botanical/OFL.txt">SIL Open Font License</a>.</p></li>
          <li><h3><a href="https://github.com/undercasetype/Fraunces">Fraunces, by Undercase Type</a></h3><p>Adapted for ISITUSA Field Display. <a href="/fonts/isitusa-display/OFL.txt">SIL Open Font License</a>.</p></li>
          <li><h3><a href="https://github.com/Outfitio/Outfit-Fonts">The Outfit Project Authors</a></h3><p>Ancillary characters and font structure used in the earlier ISITUSA Canopy family. <a href="/fonts/isitusa-canopy/OFL.txt">SIL Open Font License</a>.</p></li>
          <li><h3>Lilita One, by Juan Montoreano</h3><p>Retained with earlier font assets. <a href="/fonts/lilita-one/OFL.txt">SIL Open Font License and copyright notice</a>.</p></li>
        </ul>
      </details>
    </section>
    <section id="software" className={s.section} aria-labelledby="software-credit-heading">
      <h2 id="software-credit-heading">Open-source tools</h2>
      <ul className={s.entries}>
        <li><h3><a href="https://github.com/d3/d3-geo">D3 Geo</a></h3><p>Geographic projections and map rendering. <a href="/credits/d3-geo-LICENSE.txt">Copyright and license notice</a>.</p></li>
        <li><h3><a href="https://github.com/topojson/topojson-client">TopoJSON Client</a></h3><p>Reading and working with our map geometry. <a href="/credits/topojson-client-LICENSE.txt">Copyright and license notice</a>.</p></li>
        <li><h3><a href="https://lucide.dev/">Lucide contributors</a></h3><p>Interface icons, including work derived from Cole Bemis&apos;s Feather icons. <a href="/credits/lucide-LICENSE.txt">ISC and MIT license notices</a>.</p></li>
      </ul>
      <p className={s.notice}>The website is also built with <a href="https://github.com/vercel/next.js">Next.js</a>, <a href="https://github.com/facebook/react">React</a>, and <a href="https://github.com/tailwindlabs/tailwindcss">Tailwind CSS</a>. Their repositories include contributor acknowledgments and license notices.</p>
    </section>
    <section id="flags" className={s.section} aria-labelledby="flags-credit-heading">
      <h2 id="flags-credit-heading">State &amp; district flag artwork</h2>
      <p>Flag images are served from Wikimedia Commons and displayed at a smaller size without altering the source artwork. The entries below retain the creator and licensing information recorded for each file. Source pages include contributor histories and current usage terms.</p>
      <details><summary>View all {flags.length} flag credits</summary>
        <ul className={s.flags}>{flags.map(([code, flag]) => <li key={code}>
          <h3><a href={flag.source}>{stateNames.get(code) ?? code} flag</a></h3>
          <p>{artistCredit(flag.artist)}.</p>
          <p>{flag.license === "CC BY-SA 4.0" ? <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a> : flag.license === "Copyrighted free use" ? <a href={`${flag.source}#Licensing`}>Copyrighted, free use under the source terms</a> : flag.license}. {code === "ME" ? "Enzwell's artwork, with subsequent revisions documented in the linked file history." : null}</p>
        </li>)}</ul>
      </details>
      <p className={s.notice}>Missing a credit or spotted an error? Please <a href="mailto:contact@isitusa.com">contact us</a> with the page, resource, and correct attribution so we can review it.</p>
    </section>
  </div>;
}
