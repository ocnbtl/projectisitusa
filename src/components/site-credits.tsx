import Link from "next/link";
import { STATE_FLAGS } from "@/content/state-flags";
import stateRegistry from "@/data/research/state-registry.json";

const stateNames = new Map(stateRegistry.jurisdictions.map(state => [state.stateCode, state.stateName]));
const flags = Object.entries(STATE_FLAGS).sort(([a], [b]) => (stateNames.get(a) ?? a).localeCompare(stateNames.get(b) ?? b));

function artistCredit(artist: string) {
  // Older Commons metadata includes template syntax and an appended insignia notice.
  const credit = artist.split("permission=")[0].replace(/Template:|User:/g, "").replace(/Unknown authorUnknown author/g, "Unknown author").replace(/\s+/g, " ").trim();
  return credit && credit !== "N.a" ? credit : "Contributor details are available on the source file page";
}

export function SiteCredits() {
  return <section id="credits" className="about-sources about-credits" aria-labelledby="credits-heading">
    <span id="map-credits" aria-hidden="true" />
    <h2 id="credits-heading">Credits</h2>
    <p>ISITUSA brings together the work of researchers, photographers, artists, and open-source contributors. Here is where the materials used across the site come from.</p>
    <ul className="credit-list">
      <li><h3>Research and records</h3><p>Our catalog draws on the USGS US-RIIS register. Records and references come from the agencies, universities, collections, and observation platforms listed in <a href="#sources-heading">our data sources</a>. <Link href="/research">Explore the research</Link> for source details; species profiles also list their references.</p></li>
      <li><h3>Maps and boundaries</h3><p>County maps use the <a href="https://www.census.gov/geographies/mapping-files/time-series/geo/carto-boundary-file.html">U.S. Census Bureau&apos;s cartographic boundaries</a>, 2025 county edition. County-card state outlines use <a href="https://github.com/topojson/us-atlas">U.S. Atlas</a> by Mike Bostock, derived from 2017 Census boundaries (<a href="/credits/us-atlas-LICENSE.txt">license</a>). Map rendering uses <a href="https://github.com/d3/d3-geo">D3 Geo</a> (<a href="/credits/d3-geo-LICENSE.txt">license</a>) and <a href="https://github.com/topojson/topojson-client">TopoJSON</a> (<a href="/credits/topojson-client-LICENSE.txt">license</a>).</p></li>
      <li><h3>Species photography</h3><p>Images belong to their credited photographers and contributors. Open <Link href="/species">the species directory</Link> or an individual profile and select &ldquo;Photo credit&rdquo; for the attribution supplied with that image. Image permissions vary; consult the original source before reusing a photograph.</p></li>
      <li><h3>Typography</h3><p>ISITUSA Botanical combines custom lettering with adapted glyphs from <a href="https://github.com/cadsondemak/Chonburi">Chonburi by Cadson Demak</a> (2015), under the <a href="/fonts/isitusa-botanical/OFL.txt">SIL Open Font License 1.1</a>. The adaptation adds custom capitals and reinforces fine strokes for screen legibility. Our <Link href="/brand">brand kit</Link> contains the current project artwork.</p></li>
      <li><h3>Interface icons</h3><p><a href="https://lucide.dev/">Lucide</a> icons are created by the Lucide contributors, with portions derived from Cole Bemis&apos;s Feather icons. Their <a href="/credits/lucide-LICENSE.txt">ISC and MIT license notices</a> are available here.</p></li>
      <li><h3>Organization logos</h3><p>The agency, university, and collection logos above identify sources used in our research. They belong to their respective organizations; their appearance does not imply partnership or endorsement.</p></li>
    </ul>
    <details className="flag-credits">
      <summary>State and district flag artwork ({flags.length} source files)</summary>
      <p>Flag artwork is served from Wikimedia Commons and displayed at a smaller size. We do not alter the source artwork. Each entry links to its file history, contributors, and usage terms.</p>
      <ul className="flag-credit-list">{flags.map(([code, flag]) => <li key={code}>
        <a href={flag.source}>{stateNames.get(code) ?? code} flag</a>
        <p>{artistCredit(flag.artist)}.</p>
        <p>{flag.license === "CC BY-SA 4.0" ? <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a> : flag.license === "Copyrighted free use" ? <a href={`${flag.source}#Licensing`}>Copyrighted, free use under the source terms</a> : flag.license}. {code === "ME" ? "Enzwell's artwork, with subsequent revisions documented in the linked file history." : null}</p>
      </li>)}</ul>
    </details>
  </section>;
}
