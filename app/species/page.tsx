import "@/components/discovery-pages.css";
import "@/components/discovery-refinement.css";
import { IllustratedIntro } from "@/components/editorial-art";
import type { Metadata } from "next";
import Link from "next/link";
import { SpeciesSourcesNote } from "@/components/species-sources-note";
import { SpeciesDirectory } from "@/components/species-directory";

export const metadata: Metadata = {
  alternates: { canonical: "https://isitusa.com/species" },
  title: "Species | ISITUSA",
  description: "Look up a species, explore its recorded occurrences, and follow the sources behind its profile.",
};

export default function SpeciesPage() {
  return (
    <main id="main-content" className="reading-page species-page">
      <IllustratedIntro subject="catalog" compact><header className="reading-hero directory-hero">
        <div className="directory-intro-copy"><h1 className="page-heading">Explore species.</h1><p>Learn what to look for, how species spread, and where they have been recorded.</p></div>
      <SpeciesSourcesNote />
      </header></IllustratedIntro>
      <SpeciesDirectory />
      <noscript><p className="reading-section">The searchable directory needs JavaScript to load its catalog. You can still read <Link href="/about" className="text-link">about ISITUSA and its sources</Link>.</p></noscript>
    </main>
  );
}
