import { createHash } from "node:crypto";
import type { JurisdictionEvidenceRecord, JurisdictionEvidenceReview } from "./types";

export const JURISDICTION_AGENT_REVIEW_VERSION = "official-jurisdiction-agent-review-v1" as const;
export const JURISDICTION_PRECISION_REVIEW_VERSION = "official-jurisdiction-agent-review-precision-v2" as const;
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
      && (review.methodVersion === JURISDICTION_AGENT_REVIEW_VERSION || review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION));
}
export function validateAgentJurisdictionReview(record: JurisdictionEvidenceRecord): void {
  const review = record.review;
  if (review.gate !== "agent-reviewed") return;
  const label = record.id + ": ";
  assert(review.status === "agent-reviewed" && isAcceptedJurisdictionReview(review), label + "unapproved agent review method.");
  assert(review.actorId.length > 0 && review.independentActorId.length > 0 && review.actorId !== review.independentActorId, label + "independent review requires distinct actors.");
  assert(review.expiryPolicy === JURISDICTION_EXPIRY_POLICY, label + "unsupported expiry policy.");
  assert(review.independentReview.path.startsWith("ops/national-research/evaluations/")
    && !review.independentReview.path.includes("\\") && !review.independentReview.path.split("/").includes("..")
    && /^[a-f0-9]{64}$/u.test(review.independentReview.sha256), label + "invalid independent review reference.");
  const declaration = record.sourceDocuments.find(d => d.sourceId === review.declarationSourceId);
  const corroboration = record.sourceDocuments.find(d => d.sourceId === review.corroborationSourceId);
  assert(declaration && corroboration && declaration !== corroboration, label + "separate declaration and current corroboration are required.");
  const precision = review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION;
  if (!precision) assert(declaration.publishedAt === record.effectiveAt, label + "effectiveAt must preserve the declaration publication date.");
  assert(/\babsent\b|\beradicat(?:ed|ion)\b/iu.test(declaration.supportText), label + "explicit negative declaration text is missing.");
  const authorityDate = review.authorityDateKind === "modified" ? corroboration.modifiedAt
    : review.authorityDateKind === "published" ? corroboration.publishedAt : null;
  assert(authorityDate && record.reaffirmedAt === authorityDate, label + "reaffirmation must use the declared authority date, never retrieval.");
  const asOf = strictJurisdictionDate(review.reviewedAsOf, label + "reviewedAsOf");
  if (precision) {
    assert(declaration.publishedAt === null && declaration.modifiedAt === null, label + "year-precision declaration dates must remain unknown.");
    assert(Number.isInteger(review.declarationInformationYear) && review.declarationInformationYear >= 1000
      && review.declarationInformationYear <= Number(authorityDate.slice(0, 4))
      && declaration.informationYear === review.declarationInformationYear, label + "underlying information year is missing, mismatched, or future.");
    assert(review.effectiveDateKind === "corroboration-authority-date" && record.effectiveAt === authorityDate, label + "precision eligibility must use separate corroboration metadata.");
    assert((record.statementType === "officially-absent" && review.presenceConflictPolicy === "all-presence")
      || (record.statementType === "officially-eradicated" && review.presenceConflictPolicy === "from-conservative-boundary"), label + "invalid-record absence cannot clear unrelated historical presence.");
    assert(review.sourceConflictDisposition === "no-unresolved-current-conflict", label + "unresolved source-level conflict blocks precision admission.");
    assert(record.conflictCheckFrom && record.conflictCheckFrom <= review.declarationInformationYear + "-01-01", label + "conflict boundary must include the full information year.");
    assert(record.caveats.some(c => /page modification|page publication/iu.test(c))
      && record.caveats.some(c => /not.*statement-specific reaffirmation/iu.test(c)), label + "page metadata must not imply statement-specific reaffirmation.");
  }
  assert(strictJurisdictionDate(record.effectiveAt, label + "eligibility date") <= asOf
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
  const receipt = JSON.parse(bytes.toString("utf8")) as { actorId?: string; preflight?: { passed?: boolean }; independentFinding?: string; input?: { path?: string; sha256?: string }; sourceConflictDisposition?: string; supportedStatementType?: string; presenceConflictPolicy?: string; admissionRecommendation?: string };
  assert(receipt.actorId === review.independentActorId && receipt.preflight?.passed === true
    && typeof receipt.independentFinding === "string" && receipt.independentFinding.length > 0
    && typeof receipt.input?.path === "string" && typeof receipt.input?.sha256 === "string", record.id + ": independent review identity or evidence is missing.");
  if (review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION) {
    assert(receipt.admissionRecommendation === "conditional-support" && receipt.presenceConflictPolicy === review.presenceConflictPolicy
      && receipt.sourceConflictDisposition === review.sourceConflictDisposition
      && receipt.supportedStatementType === record.statementType, record.id + ": independent source conflict or status interpretation differs.");
  }
}
export function jurisdictionDeclarationRecordDate(record: JurisdictionEvidenceRecord): string | null {
  return record.review.gate === "agent-reviewed" && record.review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION ? null : record.effectiveAt;
}
export function jurisdictionAgentAdapterVersion(record: JurisdictionEvidenceRecord): "1.0.0" | "1.1.0" {
  assert(record.review.gate === "agent-reviewed" && isAcceptedJurisdictionReview(record.review), "Unregistered agent review method.");
  return record.review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION ? "1.1.0" : "1.0.0";
}
export function jurisdictionTemporalScope(record: JurisdictionEvidenceRecord): string {
  if (record.review.gate === "agent-reviewed" && record.review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION) {
    const metadataKind = record.review.authorityDateKind === "modified" ? "modification" : "publication";
    return "Official jurisdiction status based on information year " + record.review.declarationInformationYear
      + "; declaration date unknown. Separate corroboration page " + metadataKind + " date " + record.reaffirmedAt
      + " anchors project eligibility, not a demonstrated statement-specific reaffirmation. Reviewed as of " + record.review.reviewedAsOf
      + "; project review expiry " + record.validThrough + ". No continuous historical absence or county survey is asserted.";
  }
  return "Official declaration dated " + record.effectiveAt + ", corroborated at authority date " + record.reaffirmedAt + "; project review expiry " + record.validThrough + ". No exact biological eradication date or continuous historical absence is asserted.";
}
