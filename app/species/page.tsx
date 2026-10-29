import "@/components/discovery-pages.css";
import { IllustratedIntro } from "@/components/editorial-art";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
        <div className="discovery-reading-links"><Link href="/">Explore the map <ArrowRight size={16} aria-hidden="true" /></Link></div>
      </header></IllustratedIntro>
      <details className="catalog-note catalog-note-top">
        <summary>Where does this information come from?</summary>
        <p>We gather species information from public agencies, universities, scientific collections, and observation programs. Each profile brings those references together so you can learn about a species and follow the evidence behind it. County records show where it was reported and when.</p>
        <p>The U.S. Register of Introduced and Invasive Species helps us keep species names consistent across the lower 48 states. We bring in other references too, including research from Alaska and Hawaii. Being in this catalog does not mean a species has been found near you. If we have no record for a place, we may simply need more information.</p>
        <Link href="/research" className="catalog-research-link"><span>Browse county evidence and research progress</span><ArrowRight size={16} aria-hidden="true" /></Link>
      </details>
      <SpeciesDirectory />
      <noscript><p className="reading-section">The searchable directory needs JavaScript to load its catalog. You can still read <Link href="/about" className="text-link">about ISITUSA and its sources</Link>.</p></noscript>
    </main>
  );
}
