import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SpeciesDirectory } from "@/components/species-directory";

export const metadata: Metadata = {
  title: "Species | isitusa",
  description: "Look up a species, explore its recorded occurrences, and follow the sources behind its profile.",
};

export default function SpeciesPage() {
  return (
    <main id="main-content" className="reading-page species-page">
      <header className="reading-hero directory-hero">
        <div><h1>Explore invasive species.</h1><p>Find a species, see where it has been recorded, and read the evidence.</p></div>
        <Link href="/" className="text-link inline-flex min-h-11 items-center gap-2">Explore by county <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </header>
      <details className="catalog-note catalog-note-top">
        <summary>Where does this information come from?</summary>
        <p>We bring together work from public agencies, universities, and monitoring programs, including USGS, USDA, and EDDMapS. County records link back to the evidence we reviewed, so you can see who reported a finding and when.</p>
        <p>The species catalog starts with the US-RIIS register for the lower 48 states. Our county research also covers Alaska and Hawaii, but the catalog is not a complete inventory of every introduced species there. A catalog entry is not proof of local presence, and a missing record is not proof of absence.</p>
        <Link href="/research" className="text-link">Browse county evidence and research progress <ArrowUpRight size={15} aria-hidden="true" /></Link>
      </details>
      <SpeciesDirectory />
      <noscript><p className="reading-section">The searchable directory needs JavaScript to load its catalog. You can still read <Link href="/about" className="text-link">about isitusa and its sources</Link>.</p></noscript>
    </main>
  );
}
