import { readFileSync } from "node:fs";
import path from "node:path";

import { getSpeciesImageAsset } from "@/lib/data/species-image-assets";

import type { Species } from "@/lib/data/types";

const species = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/data/generated/species.json"), "utf8"),
) as Species[];

export const allSpecies = species.map((item) => {
  const asset = item.image && getSpeciesImageAsset(item.image.src);
  return asset && item.image ? { ...item, image: { ...item.image, src: asset.full.src, thumbnail: asset.thumbnail.src } } : item;
});
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
