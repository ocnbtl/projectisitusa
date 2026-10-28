import rows from "./species-editorial-revisions.json";

export type EditorialRevision = {
  speciesId: string;
  proposedDescription: string;
  previousDescription?: string;
  revisionNumber?: number;
  revisedAt?: string;
  researchDepth?: "full_profile";
  alternativeNames?: string[];
  otherScientificNames?: string[];
  identification?: string;
  actions?: string;
  sources: { title: string; url: string; accessedAt: string }[];
  researchNotes: string;
  status: "ready_for_review" | "research_gap";
};
export const EDITORIAL_REVISIONS = Object.fromEntries((rows as EditorialRevision[]).map(row => [row.speciesId, row]));
