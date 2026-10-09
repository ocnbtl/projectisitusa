/** Display-only editorial notes; source taxonomy, determinations and occurrence data are unchanged. */
export interface SpeciesEditorial { summary: string; reviewedAt: string; sources: { label: string; url: string }[] }
import batchOneCompletion from "./editorial-batch-01-completion.json";
import batchTwoCompletion from "./editorial-batch-02-completion.json";
import batchThreeCompletion from "./editorial-batch-03-completion.json";
import batchFourCompletion from "./editorial-batch-04-completion.json";
export const SPECIES_EDITORIAL: Record<string, SpeciesEditorial> = {
  ...batchOneCompletion,
  ...batchTwoCompletion,
  ...batchThreeCompletion,
  ...batchFourCompletion,
};
