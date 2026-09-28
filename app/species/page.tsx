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
        <div><h1>Meet the species.</h1><p>Find a name, take a closer look, and follow its story.</p></div>
        <Link href="/" className="text-link inline-flex min-h-11 items-center gap-2">Explore by county <ArrowUpRight size={16} aria-hidden="true" /></Link>
      </header>
      <SpeciesDirectory />
      <details className="catalog-note">
        <summary>What is included in this catalog?</summary>
        <p>The catalog begins with the US-RIIS lower-48 register. It is not a complete inventory of every county, and inclusion here does not establish local presence. Individual records carry their own sources and geographic scope.</p>
      </details>
      <noscript><p className="reading-section">The searchable directory needs JavaScript to load its catalog. You can still read <Link href="/about" className="text-link">about IsItUSA and its sources</Link>.</p></noscript>
    </main>
  );
}
