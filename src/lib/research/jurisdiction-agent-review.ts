import { createHash } from "node:crypto";
import type { JurisdictionEvidenceRecord, JurisdictionEvidenceReview } from "./types";

export const JURISDICTION_AGENT_REVIEW_VERSION = "official-jurisdiction-agent-review-v1" as const;
export const JURISDICTION_EXPIRY_POLICY = "authority-date-plus-365-days-v1" as const;

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export function strictJurisdictionDate(value: string, label: string): number {
  assert(/^\d{4}-\d{2}-\d{2}$/u.test(value), label + " must be a date.");
  const time = Date.parse(value + "T00:00:00.000Z");
  assert(Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value, label + " is not a real calendar date.");
  return time;
}
export function jurisdictionReviewExpiry(authorityDate: string): string {
  return new Date(strictJurisdictionDate(authorityDate, "Authority date") + 365 * 86400000).toISOString().slice(0, 10);
}
export function isAcceptedJurisdictionReview(review: JurisdictionEvidenceReview): boolean {
  return (review.gate === "human-approved" && review.status === "human-approved")
    || (review.gate === "agent-reviewed" && review.status === "agent-reviewed"
      && review.methodVersion === JURISDICTION_AGENT_REVIEW_VERSION);
}
export function validateAgentJurisdictionReview(record: JurisdictionEvidenceRecord): void {
  const review = record.review;
  if (review.gate !== "agent-reviewed") return;
  const label = record.id + ": ";
  assert(review.status === "agent-reviewed" && review.methodVersion === JURISDICTION_AGENT_REVIEW_VERSION, label + "unapproved agent review method.");
  assert(review.actorId.length > 0 && review.independentActorId.length > 0 && review.actorId !== review.independentActorId, label + "independent review requires distinct actors.");
  assert(review.expiryPolicy === JURISDICTION_EXPIRY_POLICY, label + "unsupported expiry policy.");
  assert(review.independentReview.path.startsWith("ops/national-research/evaluations/")
    && !review.independentReview.path.includes("\\") && !review.independentReview.path.split("/").includes("..")
    && /^[a-f0-9]{64}$/u.test(review.independentReview.sha256), label + "invalid independent review reference.");
  const declaration = record.sourceDocuments.find(d => d.sourceId === review.declarationSourceId);
  const corroboration = record.sourceDocuments.find(d => d.sourceId === review.corroborationSourceId);
  assert(declaration && corroboration && declaration !== corroboration, label + "separate declaration and current corroboration are required.");
  assert(declaration.publishedAt === record.effectiveAt, label + "effectiveAt must preserve the declaration publication date.");
  assert(/\babsent\b|\beradicat(?:ed|ion)\b/iu.test(declaration.supportText), label + "explicit negative declaration text is missing.");
  const authorityDate = review.authorityDateKind === "modified" ? corroboration.modifiedAt
    : review.authorityDateKind === "published" ? corroboration.publishedAt : null;
  assert(authorityDate && record.reaffirmedAt === authorityDate, label + "reaffirmation must use the declared authority date, never retrieval.");
  const asOf = strictJurisdictionDate(review.reviewedAsOf, label + "reviewedAsOf");
  assert(strictJurisdictionDate(record.effectiveAt, label + "declaration date") <= asOf
    && strictJurisdictionDate(authorityDate, label + "corroboration date") <= asOf, label + "source date is after assessment.");
  assert(record.validThrough === jurisdictionReviewExpiry(authorityDate), label + "expiry must follow the versioned authority-date policy.");
  assert(asOf <= strictJurisdictionDate(record.validThrough, label + "validThrough"), label + "corroboration expired before review.");
  const reviewedAt = Date.parse(review.reviewedAt);
  assert(Number.isFinite(reviewedAt) && reviewedAt >= asOf && reviewedAt <= Date.now(), label + "review timestamp is invalid or future.");
  assert(record.conflictCheckFrom !== undefined && strictJurisdictionDate(record.conflictCheckFrom, label + "conflictCheckFrom") <= strictJurisdictionDate(record.effectiveAt, label + "effectiveAt"), label + "conservative conflict start is required.");
  assert(record.caveats.some(c => /review expiry/iu.test(c)) && record.caveats.some(c => /declaration date/iu.test(c)), label + "date and expiry meanings must be explicit.");
}
export function verifyIndependentJurisdictionReview(record: JurisdictionEvidenceRecord, bytes: Buffer): void {
  const review = record.review;
  if (review.gate !== "agent-reviewed") return;
  assert(createHash("sha256").update(bytes).digest("hex") === review.independentReview.sha256, record.id + ": independent review bytes changed.");
  const receipt = JSON.parse(bytes.toString("utf8")) as { actorId?: string; preflight?: { passed?: boolean }; independentFinding?: string; input?: { path?: string; sha256?: string } };
  assert(receipt.actorId === review.independentActorId && receipt.preflight?.passed === true
    && typeof receipt.independentFinding === "string" && receipt.independentFinding.length > 0
    && typeof receipt.input?.path === "string" && typeof receipt.input?.sha256 === "string", record.id + ": independent review identity or evidence is missing.");
}
