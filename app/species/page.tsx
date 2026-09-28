import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { SpeciesDirectory } from "@/components/species-directory";

export const metadata: Metadata = {
  title: "Species | IsItUSA",
  description: "Look up a species, explore its recorded occurrences, and follow the sources behind its profile.",
};

export default function SpeciesPage() {
  return (
    <main id="main-content" className="reading-page species-page">
      <header className="reading-hero directory-hero">
        <div><h1>Meet the species.</h1><p>Get to know introduced and invasive species, see where they have been recorded, and learn what makes each one distinctive.</p></div>
        <Link href="/" className="text-link inline-flex min-h-11 items-center gap-2">Explore by county <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </header>
      <SpeciesDirectory />
      <details className="catalog-note">
        <summary>What is included in this catalog?</summary>
        <p>Our starting point is the US-RIIS register for the lower 48 states. A species being listed here does not mean it has been found in your county. Open its records to see where it was documented and who reported it.</p>
      </details>
      <noscript><p className="reading-section">The searchable directory needs JavaScript to load its catalog. You can still read <Link href="/about" className="text-link">about IsItUSA and its sources</Link>.</p></noscript>
    </main>
  );
}
