import type { MetadataRoute } from "next";
import { allSpecies } from "@/lib/data/species-store";

const origin = "https://isitusa.com";
const publicPages = [
  "", "/species", "/research", "/about", "/approach", "/data-sources",
  "/credits", "/support", "/volunteer", "/report", "/join", "/observations",
  "/brand", "/privacy", "/terms",
];

// Canonical catalog entries only. Aliases, filters, and private workspace routes
// are intentionally excluded. Do not invent a last-modified date at build time.
export default function sitemap(): MetadataRoute.Sitemap {
  return [...new Set([
    ...publicPages.map((pathname) => origin + pathname),
    ...allSpecies.map((species) => origin + "/species/" + species.slug),
  ])].map((url) => ({ url }));
}
