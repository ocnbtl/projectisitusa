import type { Metadata } from "next";
import Link from "next/link";

import { SpeciesDirectory } from "@/components/species-directory";

export const metadata: Metadata = {
  title: "Species directory | Isitusa",
  description:
    "Find a species by name or category, explore its recorded occurrences, and follow the sources behind its profile.",
};

export default function SpeciesPage() {
  return (
    <main id="main-content" className="reading-page species-page">
      <header className="reading-hero">
        <h1>Explore the species.</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Find a familiar name or look up something new. Open a profile to explore
          recorded occurrences, source references, and practical guidance where
          it is available.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Looking for a particular place? <Link href="/" className="text-link">Choose a county on the map</Link>.
        </p>
      </header>
      <SpeciesDirectory />
      <details className="reading-section mt-8 border-t border-[var(--border)] text-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-medium">About this catalog</summary>
        <p className="mt-2 max-w-2xl leading-7 text-[var(--muted)]">
          The catalog begins with the US-RIIS lower-48 register. It is not a
          complete inventory of every county, and inclusion here does not
          establish local presence. Individual records carry their own sources
          and geographic scope.
        </p>
      </details>
      <noscript>
        <p className="reading-section">
          The searchable directory needs JavaScript to load its catalog. You can
          still read <Link href="/about" className="text-link">about the project and its sources</Link>.
        </p>
      </noscript>
    </main>
  );
}
