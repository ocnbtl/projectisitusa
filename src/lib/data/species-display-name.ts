import corrections from "@/content/species-name-corrections.json";

const byId = new Map(corrections.map(correction => [correction.speciesId, correction]));

/** Display corrections preserve the original source names and biological identities. */
export function approvedSpeciesDisplayName(id: string, scientificName: string, currentName: string): string {
  const correction = byId.get(id);
  if (!correction) return currentName;
  if (scientificName !== correction.scientificName ||
      (currentName !== correction.previousName && currentName !== correction.displayName)) {
    throw new Error(`Approved display-name correction needs review for ${id}`);
  }
  return correction.displayName;
}
