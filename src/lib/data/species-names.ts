import records from "@/content/species-names.json";
import { approvedSpeciesDisplayName } from "@/lib/data/species-display-name";

export type SpeciesName = { name: string; kind: "common" | "reference" | "misapplied"; explanation?: string; scientific?: boolean };
export type SpeciesNames = { names: SpeciesName[]; sources: { title: string; url: string }[]; warning?: string };
type NamedSpecies = { id: string; commonName: string; scientificName: string; displayGroup?: string };
const namesById = records as Record<string, SpeciesNames>;
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
export function getSpeciesNames(id: string): SpeciesNames {
  return namesById[id] ?? { names: [], sources: [] };
}
export function speciesNameMatches(species: NamedSpecies, query: string): boolean {
  const search = normalize(query);
  if (!search) return true;
  const names = getSpeciesNames(species.id).names.map(entry => entry.name);
  return [approvedSpeciesDisplayName(species.id, species.scientificName, species.commonName), species.scientificName, species.displayGroup ?? "", ...names].some(name => normalize(name).includes(search));
}
export function matchedSpeciesName(species: NamedSpecies, query: string): string | null {
  const search = normalize(query);
  if (!search || [approvedSpeciesDisplayName(species.id, species.scientificName, species.commonName), species.scientificName].some(name => normalize(name).includes(search))) return null;
  const match = getSpeciesNames(species.id).names.find(entry => normalize(entry.name).includes(search));
  return match ? `${match.kind === "misapplied" ? "Name clarification" : "Also found as"}: ${match.name}` : null;
}
export function speciesStructuredData(species: NamedSpecies & { slug: string }) {
  const record = getSpeciesNames(species.id);
  // Misapplied and taxonomically qualified reference names are searchable text,
  // never unqualified aliases or sameAs assertions for search engines.
  const commonName = approvedSpeciesDisplayName(species.id, species.scientificName, species.commonName);
  const aliases = [...new Set([...(record.warning ? [] : [commonName]), ...record.names.filter(entry => entry.kind === "common").map(entry => entry.name)])].filter(name => name !== species.scientificName);
  return { "@context": "https://schema.org", "@type": "Taxon", name: species.scientificName, alternateName: aliases, url: `https://isitusa.com/species/${species.slug}`, ...(record.warning ? { disambiguatingDescription: record.warning } : {}) };
}
