import photoCredits from "@/content/species-photo-credits.json";
import photoReview from "@/content/species-photo-review.json";
import photoReplacements from "@/content/species-photo-replacements.json";
import { approvedSpeciesDisplayName } from "@/lib/data/species-display-name";
import photoAdditions from "@/content/species-photo-additions.json";
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
// A replacement is a separately verified photograph, not clearance of the old file.
// Keep the original-image holds, assets, and credits intact for provenance review.
export const VERIFIED_PHOTO_REPLACEMENTS = photoReplacements as Record<string, NonNullable<Species["image"]>>;
export const PHOTO_PROVENANCE_HOLDS = new Set<string>(photoReview.holds.filter(id => !VERIFIED_PHOTO_REPLACEMENTS[id]));
export function getSpeciesPhotoNote(id: string): string | undefined {
  return (photoReview.notes as Record<string, string>)[id];
}
export function getDisplaySpecies<T extends Species | ExplorerSpecies>(species: T): T {
  species = { ...species, commonName: approvedSpeciesDisplayName(species.id, species.scientificName, species.commonName) };
  const replacement = VERIFIED_PHOTO_REPLACEMENTS[species.id];
  if (replacement) return { ...species, image: replacement };
  if (PHOTO_PROVENANCE_HOLDS.has(species.id)) return { ...species, image: undefined };
  const addition = (photoAdditions as Record<string, NonNullable<Species["image"]>>)[species.id];
  if (addition) return { ...species, image: addition };
  if (PHOTO_REVIEW_HOLDS.has(species.id)) return { ...species, image: undefined };
  const credit = (photoCredits as Record<string, { sourceUrl: string; license?: string; credit?: string }>)[species.id];
  const note = getSpeciesPhotoNote(species.id);
  return species.image && credit ? { ...species, image: { ...species.image, ...credit, ...(note ? { alt: note, credit: `${credit.credit ?? species.image.credit}. ${note}` } : {}) } } : species;
}
