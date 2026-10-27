import "@/components/discovery-pages.css";
import { IllustratedIntro } from "@/components/editorial-art";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SpeciesDirectory } from "@/components/species-directory";

export const metadata: Metadata = {
  title: "Species | ISITUSA",
  description: "Look up a species, explore its recorded occurrences, and follow the sources behind its profile.",
};

export default function SpeciesPage() {
  return (
    <main id="main-content" className="reading-page species-page">
      <IllustratedIntro subject="catalog" compact><header className="reading-hero directory-hero">
        <div><h1 className="page-heading">Explore species.</h1><p>Learn what to look for, how species spread, and where they have been recorded.</p></div>
        <div className="discovery-reading-links"><Link href="/">Explore the map <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </header></IllustratedIntro>
      <details className="catalog-note catalog-note-top">
        <summary>Where does this information come from?</summary>
        <p>Species records are spread across agency websites, research collections, and monitoring programs. We bring them together here, with the original sources close at hand. Open a county finding to see who reported it, when it was recorded, and what the evidence tells us.</p>
        <p>Our catalog draws on the US-RIIS register for the lower 48 states alongside the sources cited in each profile. We also research Alaska and Hawaii, though the catalog does not yet include every introduced species there. A species listed here may not occur in your county; a gap in the records does not mean it is absent.</p>
        <Link href="/research" className="text-link">Browse county evidence and research progress <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </details>
      <SpeciesDirectory />
      <noscript><p className="reading-section">The searchable directory needs JavaScript to load its catalog. You can still read <Link href="/about" className="text-link">about ISITUSA and its sources</Link>.</p></noscript>
    </main>
  );
}
