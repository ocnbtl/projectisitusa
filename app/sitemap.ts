import type { MetadataRoute } from "next";
import { allSpecies } from "@/lib/data/species-store";
import { directoryPageCount, directoryPagePath } from "@/lib/ui/species-directory-pagination";
const origin = "https://isitusa.com";
const publicPages = [
  "", "/species", "/research", "/about", "/approach", "/data-sources",
  "/credits", "/support", "/volunteer", "/report", "/join",
  "/brand", "/privacy", "/terms",
];
// Only canonical, indexable pages. Observations and preferences intentionally
// remain noindex. Build time is not a reliable content modification date.
export default function sitemap(): MetadataRoute.Sitemap {
  return [...new Set([
    ...publicPages.map(pathname => origin + pathname),
    ...Array.from({ length: directoryPageCount(allSpecies.length) - 1 }, (_, index) => origin + directoryPagePath(index + 2)),
    ...allSpecies.map(species => origin + "/species/" + species.slug),
  ])].map(url => ({ url }));
}

