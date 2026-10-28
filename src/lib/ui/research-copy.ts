/** Public explanations leave the evidence ledger and original source notes intact. */
const NOTES: Record<string, string> = {
  "Occurrence evidence only. Missing rows do not support absence or non-detection, and the legacy bounded merge cannot be subtracted safely without a full source-family rebuild.": "This source documents where the species has been recorded. Places without a record remain an open question. These records came from an earlier combined dataset; correcting that import requires reviewing the combined source data together.",
  "Preserved specimen evidence only. Aggregated records may overlap GBIF and collection portals.": "These records come from specimens held in scientific collections. The same specimen may also appear in GBIF or a collection’s own website, so several listings may describe the same observation.",
  "PLANTS county distribution is occurrence documentation, not an abundance survey. The provider exposes no row-level observation date or machine-readable dataset-specific license. Source silence never supports absence or non-detection.": "USDA PLANTS lists counties where this species has been documented; it does not tell us how common it is. Individual observation dates and a dataset-specific license in a computer-readable format are not provided. An unlisted county does not mean the species is absent or that a survey found none.",
  "FIA is a sampled forest inventory and does not establish complete county distribution. Missing FIA detections never support verified absence or survey non-detection. This assertion records presence only at the county scope supplied by explicit FIA codes.": "The Forest Service surveys a sample of forest locations, not every part of a county. This record places the species in the county identified by the survey. It does not show its full distribution, and a missing record does not mean the species is absent or that a survey found none.",
};

export function readableSourceNote(note: string) {
  // Exact matches only: an extra qualification must never be silently dropped.
  return NOTES[note] ?? note;
}

export function findingDescription(pair: { displayStatus: string; conflict: boolean }) {
  if (pair.conflict) return "The sources do not agree. Read the records below to see what each reports and when it was recorded.";
  switch (pair.displayStatus) {
    case "verified-present": return "This species has been recorded here. Check the observation dates: an older record does not tell us whether it is still present today.";
    case "verified-absent": return "An official source reports absence for a particular place and period. Its geographic limits and dates matter; this is not a guarantee for every location today.";
    case "not-detected": return "A survey looked for this species and did not find it. That result applies to the area and time surveyed, rather than proving it is absent everywhere in the county.";
    case "researched-unresolved": return "We have checked sources, but do not yet have enough evidence to reach a finding for this county. The species may or may not be present.";
    default: return "We have not yet completed a source check for this species in this county. A missing record does not mean the species is absent.";
  }
}

export const EVIDENCE_LABELS: Record<string, string> = {
  "recorded-present": "Species recorded", "officially-absent": "Official absence finding", "not-detected": "Not found in this survey",
  point: "Observation location", county: "County record", "survey-area": "Survey area", "regulatory-area": "Area covered by an official statement", "legacy-county-pair": "County record from an earlier dataset",
  "reviewed-evidence-found": "Evidence reviewed", "reviewed-no-qualifying-evidence": "Checked; more evidence needed", "source-screened": "Source checked", "needs-followup": "Follow-up needed", "not-started": "Not started", resolved: "Finding recorded", undated: "Date not provided", aging: "Earlier record", stale: "Older record", unassessed: "Not assessed", none: "No finding recorded",
};
