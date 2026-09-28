import { SPECIES_EDITORIAL } from "@/content/species-editorial";
import type { Species, ExplorerSpecies } from "@/lib/data/types";
export function getSpeciesEditorial(species: Pick<Species | ExplorerSpecies, "id" | "summary">) {
  const entry = SPECIES_EDITORIAL[species.id];
  // Formulaic registry boilerplate is not an identification description.
  const summary = entry?.summary ?? (/^An invasive .*associated with/.test(species.summary) ? null : species.summary);
  return { summary, sources: entry?.sources ?? [], reviewedAt: entry?.reviewedAt };
}

/** Collection-slide / ledger images fail the public identification-photo purpose.
 * Source assets and their occurrence records are preserved for provenance review. */
export const PHOTO_REVIEW_HOLDS = new Set(["kilifia-acuminata", "pineus-boerneri", "hemichromis-letourneuxi"]);
export function getDisplaySpecies<T extends Species | ExplorerSpecies>(species: T): T {
  return PHOTO_REVIEW_HOLDS.has(species.id) ? { ...species, image: undefined } : species;
}
