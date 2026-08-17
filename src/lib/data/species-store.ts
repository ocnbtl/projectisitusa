import species from "@/data/generated/species.json";
import type { Species } from "@/lib/data/types";

export const allSpecies = species as Species[];
export const speciesById = new Map(allSpecies.map((item) => [item.id, item]));
export const speciesSlugAliases = new Map<string, string>([
  ["euphorbia-esula", "euphorbia-virgata"],
]);
export const speciesBySlug = new Map(
  [
    ...allSpecies.map((item) => [item.slug, item] as const),
    ...[...speciesSlugAliases.entries()]
      .map(([alias, canonicalSlug]) => {
        const canonical = allSpecies.find((item) => item.slug === canonicalSlug);
        return canonical ? ([alias, canonical] as const) : null;
      })
      .filter((entry): entry is readonly [string, Species] => Boolean(entry)),
  ],
);
