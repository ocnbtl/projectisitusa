export const REVIEW_STATES = { queued: "Not drafted", in_progress: "In progress", in_review: "Awaiting review", reviewed: "Approved" } as const;
export type ReviewStatus = keyof typeof REVIEW_STATES;
export type EditorialTask = { species_id: string; status: ReviewStatus; draft: string; notes: string; sources: string[]; version: number; updated_at?: string };
/** Keep identification and actions attached when a reviewer adopts a full-profile revision. */
export function editorialReviewDraft(revision: { proposedDescription: string; researchDepth?: string; identification?: string; actions?: string }): string {
  if (revision.researchDepth !== "full_profile") return revision.proposedDescription;
  return [revision.proposedDescription, revision.identification && `How to recognize it\n${revision.identification}`, revision.actions && `What to do\n${revision.actions}`].filter(Boolean).join("\n\n");
}
export function reviewStatus(task: EditorialTask | undefined, hasDescription: boolean): ReviewStatus {
  return task?.status ?? (hasDescription ? "in_review" : "queued");
}
export function sourceUrls(value: string): string[] {
  const urls = [...new Set(value.split(/\r?\n/).map(url => url.trim()).filter(Boolean))];
  if (urls.length > 20) throw new Error("Keep up to 20 source links per profile.");
  for (const url of urls) {
    let parsed: URL;
    try { parsed = new URL(url); } catch { throw new Error("Each source must be a complete https:// or http:// link."); }
    if (!['https:', 'http:'].includes(parsed.protocol) || url.length > 1500) throw new Error("Each source must be an http:// or https:// link under 1,501 characters.");
  }
  return urls;
}
