import type { Metadata } from "next";
import Link from "next/link";

import { SpeciesDirectory } from "@/components/species-directory";

export const metadata: Metadata = {
  title: "Species directory | Isitusa",
  description:
    "Explore the Isitusa species catalog by common name, scientific name, or category. Read profiles and follow their sources into county research.",
};

export default function SpeciesPage() {
  return (
    <main id="main-content" className="reading-page">
      <header className="reading-hero">
        <p className="reading-kicker">The species directory</p>
        <h1>Get to know the species.</h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--muted)]">
          Find a familiar name or discover something new. Explore identification
          notes, source references, and the evidence behind county records.
        </p>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          This catalog uses the US-RIIS lower-48 snapshot. An entry in the
          directory does not establish presence in your county. For local
          records, <Link href="/" className="text-link">explore the map</Link>.
        </p>
      </header>
      <SpeciesDirectory />
      <noscript>
        <p className="reading-section">
          The searchable directory needs JavaScript to load its catalog. You can
          still read the <Link href="/about" className="text-link">project methods</Link>.
        </p>
      </noscript>
    </main>
  );
}
