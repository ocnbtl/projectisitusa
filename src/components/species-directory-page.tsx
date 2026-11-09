import "@/components/discovery-pages.css";
import "@/components/discovery-refinement.css";
import "@/components/species-pagination.css";
import { IllustratedIntro } from "@/components/editorial-art";
import { SpeciesSourcesNote } from "@/components/species-sources-note";
import { SpeciesDirectory } from "@/components/species-directory";
import { allSpecies } from "@/lib/data/species-store";
import { getDisplaySpecies } from "@/lib/ui/species-editorial";
import { CRAWLABLE_DIRECTORY_PAGE_SIZE } from "@/lib/ui/species-directory-pagination";

const catalog = allSpecies.map(getDisplaySpecies).sort((a, b) => a.commonName.localeCompare(b.commonName, "en") || a.scientificName.localeCompare(b.scientificName, "en"));
export function SpeciesDirectoryPage({ page = 1 }: { page?: number }) {
  const start = (page - 1) * CRAWLABLE_DIRECTORY_PAGE_SIZE;
  return <main id="main-content" className="reading-page species-page">
    <IllustratedIntro subject="catalog" compact><header className="reading-hero directory-hero">
      <div className="directory-intro-copy"><h1 className="page-heading">Explore species.</h1><p>Learn what to look for, how species spread, and where they have been recorded.</p></div>
      <SpeciesSourcesNote />
    </header></IllustratedIntro>
    <SpeciesDirectory key={page} initialSpecies={catalog.slice(start, start + CRAWLABLE_DIRECTORY_PAGE_SIZE)} initialPage={page} totalSpecies={catalog.length} />
    <noscript><p className="reading-section">Browse using the species and page links. Search and filters are available when JavaScript is enabled.</p></noscript>
  </main>;
}
