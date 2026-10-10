export const CORRECTION_CATEGORIES = {
  common_name: "Common name", scientific_name: "Scientific name", image: "Picture",
  description: "Description", identification: "How to identify it", action: "What to do",
  occurrences: "Where it has been recorded", source: "Sources or references", other: "Something else",
} as const;
export type CorrectionCategory = keyof typeof CORRECTION_CATEGORIES;
export function validateCorrection(input: Record<string, unknown>) {
  const species = typeof input.species_id === "string" ? input.species_id.trim() : "";
  const details = typeof input.details === "string" ? input.details.trim() : "";
  const source = typeof input.source_url === "string" ? input.source_url.trim() : "";
  const categories = Array.isArray(input.categories) ? [...new Set(input.categories)] : [];
  if (!/^[a-z0-9][a-z0-9-]{0,119}$/.test(species)) throw new Error("Choose a species profile.");
  if (!categories.length || categories.length > 9 || categories.some(value => typeof value !== "string" || !Object.hasOwn(CORRECTION_CATEGORIES, value))) throw new Error("Choose what needs a correction.");
  if (details.length < 20 || details.length > 3000) throw new Error("Describe the correction in 20–3,000 characters.");
  if (source) {
    let url: URL; try { url = new URL(source); } catch { throw new Error("Add a complete source link beginning with https://."); }
    if (url.protocol !== "https:" || url.username || url.password || source.length > 1500) throw new Error("Use a public HTTPS source link without login details.");
  }
  if (input.consent !== true) throw new Error("Confirm that we may store and review your suggestion.");
  return { species_id: species, categories: categories as CorrectionCategory[], details, source_url: source || null, consent_version: "correction-2026-10-10" };
}
