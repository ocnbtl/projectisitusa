import records from "@/content/species-name-search.json";
import { approvedSpeciesDisplayName } from "@/lib/data/species-display-name";

type NamedSpecies = { id: string; commonName: string; scientificName: string; displayGroup?: string };
type SearchName = string | [string, 1];
// JSON imports widen tuples; publication validation checks this generated shape.
const namesById = records as unknown as Record<string, SearchName[]>;
const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US").replace(/[’']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const label = (name: SearchName) => typeof name === "string" ? name : name[0];

export function speciesNameMatches(species: NamedSpecies, query: string): boolean {
  const search = normalize(query);
  if (!search) return true;
  const primary = [approvedSpeciesDisplayName(species.id, species.scientificName, species.commonName), species.scientificName, species.displayGroup ?? ""];
  return primary.some(name => normalize(name).includes(search))
    || (namesById[species.id] ?? []).some(name => normalize(label(name)).includes(search));
}

export function matchedSpeciesName(species: NamedSpecies, query: string): string | null {
  const search = normalize(query);
  if (!search || [approvedSpeciesDisplayName(species.id, species.scientificName, species.commonName), species.scientificName].some(name => normalize(name).includes(search))) return null;
  const match = (namesById[species.id] ?? []).find(name => normalize(label(name)).includes(search));
  return match ? `${typeof match === "string" ? "Also found as" : "Name clarification"}: ${label(match)}` : null;
}
