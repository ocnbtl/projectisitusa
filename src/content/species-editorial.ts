/** Owner-authorized public summaries. Publishing remains an explicit, separate step. */
import published from "./editorial-published.json";
export interface SpeciesEditorial { summary: string; reviewedAt: string; sources?: { label: string; url: string }[] }
export const SPECIES_EDITORIAL: Record<string, SpeciesEditorial> = published;
