import { readFileSync } from "node:fs";
import path from "node:path";

import type { Species } from "@/lib/data/types";

const species = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/data/generated/species.json"), "utf8"),
) as Species[];

export const allSpecies = species;
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
