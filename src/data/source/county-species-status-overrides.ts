import type { CountySpeciesStatusOverride } from "@/lib/data/types";

/**
 * Manual non-presence determinations for the county-species matrix.
 *
 * Verified presence is generated from county presence imports and manual
 * authoritative presence overrides. Use this file only when a reputable source
 * supports a non-presence status for a specific county and species.
 */
export const countySpeciesStatusOverrides: CountySpeciesStatusOverride[] = [];
