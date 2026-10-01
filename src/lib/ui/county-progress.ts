import type { ResearchStatusCounts } from "@/lib/research/types";

/** Compiler display-status buckets are exclusive. Survey axes are not. */
export function countyResearchProgress(summary: ResearchStatusCounts) {
  const started = summary.verifiedPresent + summary.verifiedAbsent + summary.notDetected + summary.researchedUnresolved;
  const total = summary.fullCountySpeciesDenominator || summary.catalogSpeciesCount;
  return { started, total, percent: total > 0 ? started / total * 100 : 0 };
}
