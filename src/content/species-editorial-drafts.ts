/** Prepared descriptions for the internal review workspace. Publication is a separate action. */
export interface SpeciesEditorial { summary: string; reviewedAt: string; sources: { label: string; url: string }[] }
import batchOneCompletion from "./editorial-batch-01-completion.json";
import batchTwoCompletion from "./editorial-batch-02-completion.json";
import batchThreeCompletion from "./editorial-batch-03-completion.json";
import batchFourCompletion from "./editorial-batch-04-completion.json";
import batchFiveCompletion from "./editorial-batch-05-completion.json";
import batchSixCompletion from "./editorial-batch-06-completion.json";
import batchSevenCompletion from "./editorial-batch-07-completion.json";
import batchEightCompletion from "./editorial-batch-08-completion.json";
import batchNineCompletion from "./editorial-batch-09-completion.json";
import batchTenCompletion from "./editorial-batch-10-completion.json";
import batchElevenCompletion from "./editorial-batch-11-completion.json";
import batchTwelveCompletion from "./editorial-batch-12-completion.json";
import { EDITORIAL_REVISIONS } from "./species-editorial-revisions";
import { editorialReviewDraft } from "@/lib/ui/editorial-review";
export const SPECIES_EDITORIAL_DRAFTS: Record<string, SpeciesEditorial> = {
  ...batchOneCompletion,
  ...batchTwoCompletion,
  ...batchThreeCompletion,
  ...batchFourCompletion,
  ...batchFiveCompletion,
  ...batchSixCompletion,
  ...batchSevenCompletion,
  ...batchEightCompletion,
  ...batchNineCompletion,
  ...batchTenCompletion,
  ...batchElevenCompletion,
  ...batchTwelveCompletion,
  ...Object.fromEntries(Object.values(EDITORIAL_REVISIONS)
    .filter(row => row.researchDepth === "full_profile")
    .map(row => [row.speciesId, {
      summary: editorialReviewDraft(row),
      reviewedAt: row.revisedAt ?? row.sources[0]?.accessedAt ?? "",
      sources: row.sources.map(source => ({ label: source.title, url: source.url })),
    }])),
};
