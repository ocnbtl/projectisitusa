import records from "@/content/species-names.json";
import { approvedSpeciesDisplayName } from "@/lib/data/species-display-name";
export { matchedSpeciesName, speciesNameMatches } from "./species-name-search";

export type SpeciesName = { name: string; kind: "common" | "reference" | "misapplied"; explanation?: string; scientific?: boolean; sourceUrl?: string };
export type SpeciesNames = { names: SpeciesName[]; sources: { title: string; url: string }[]; warning?: string };
type NamedSpecies = { id: string; commonName: string; scientificName: string; displayGroup?: string };
const namesById = records as Record<string, SpeciesNames>;
export function getSpeciesNames(id: string): SpeciesNames {
  return namesById[id] ?? { names: [], sources: [] };
}
export function speciesStructuredData(species: NamedSpecies & { slug: string }) {
  const record = getSpeciesNames(species.id);
  // Misapplied and taxonomically qualified reference names are searchable text,
  // never unqualified aliases or sameAs assertions for search engines.
  const commonName = approvedSpeciesDisplayName(species.id, species.scientificName, species.commonName);
  const aliases = [...new Set([...(record.warning ? [] : [commonName]), ...record.names.filter(entry => entry.kind === "common").map(entry => entry.name)])].filter(name => name !== species.scientificName);
  return { "@context": "https://schema.org", "@type": "Taxon", name: species.scientificName, alternateName: aliases, url: `https://isitusa.com/species/${species.slug}`, ...(record.warning ? { disambiguatingDescription: record.warning } : {}) };
}
