/** Previously published editorial; review drafts do not replace public copy automatically. */
import published from "./editorial-published.json";
export interface SpeciesEditorial { summary: string; reviewedAt: string; sources: { label: string; url: string }[] }
export const SPECIES_EDITORIAL: Record<string, SpeciesEditorial> = published;
