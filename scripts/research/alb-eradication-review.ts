import { createHash } from "node:crypto";
import { z } from "zod";

import { resolveTemporalPairDetermination } from "@/lib/research/jurisdiction-evidence";

export const ALB_SPECIES_ID = "asian-longhorned-beetle";
export const ALB_REVIEW_ID = "aphis-alb-eradication-review-20260905-r2";
export const ALB_REVIEW_PATH = `ops/national-research/evaluations/${ALB_REVIEW_ID}.json`;
export const ALB_INPUT_ROOT = "ops/national-research/inputs/aphis-alb-review-20260905-r1";
export const ALB_REVIEW_AS_OF = "2026-09-05";
export const ALB_BASELINE_COMMIT = "3faf9a4efef83848610a0b7ec1a007e968dbb961";
export const ALB_SOURCE_SHA256 = "61c2586048a1e15f8ed3d3cc2ad65fcf03098a58c18049e2e03f0c10d151130b";

export function reviewHash(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

const fipsSchema = z.string().regex(/^\d{5}$/u);
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const presenceSchema = z.strictObject({
  evidenceId: z.string().min(1),
  sourceId: z.string().min(1),
  observedAt: z.string().nullable(),
});

export const albReviewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  kind: z.literal("review-only-eradication-proposal"),
  evaluationId: z.literal(ALB_REVIEW_ID),
  asOf: z.literal(ALB_REVIEW_AS_OF),
  status: z.literal("awaiting-human-approval-for-unconflicted-subset"),
  baselineCommit: z.literal(ALB_BASELINE_COMMIT),
  source: z.strictObject({
    sourceId: z.literal("aphis-asian-longhorned-beetle-program-update-2026"),
    url: z.string().url(),
    artifactPath: z.string(),
    artifactSha256: hashSchema,
    artifactBytes: z.number().int().positive(),
    retrievedAt: z.string(),
    publishedAt: z.literal("2026-07-30"),
    supportText: z.string().min(1),
    supportTextSha256: hashSchema,
  }),
  baseline: z.strictObject({
    verifiedPresent: z.number().int().nonnegative(),
    verifiedAbsent: z.number().int().nonnegative(),
    determinations: z.number().int().nonnegative(),
    denominator: z.number().int().positive(),
  }),
  scope: z.strictObject({
    candidateCountyFips: z.array(fipsSchema).length(108),
    candidateCountyFipsSha256: hashSchema,
    eligibleCountyFips: z.array(fipsSchema).length(101),
    eligibleCountyFipsSha256: hashSchema,
    heldCountyFips: z.array(fipsSchema).length(7),
    heldCountyFipsSha256: hashSchema,
    excludedSubcountyScopes: z.array(z.string()).min(1),
  }),
  proposedParentRecords: z.array(z.strictObject({
    id: z.string(),
    speciesId: z.literal(ALB_SPECIES_ID),
    statementType: z.literal("officially-eradicated"),
    jurisdiction: z.strictObject({
      level: z.literal("county-set"),
      stateCode: z.enum(["IL", "MA"]),
      countyFips: z.array(fipsSchema).min(1),
      countyFipsSha256: hashSchema,
      exclusions: z.array(fipsSchema).length(0),
    }),
    effectiveAt: dateSchema,
    conflictCheckFrom: dateSchema,
    reaffirmedAt: z.literal("2026-07-30"),
    validThrough: z.literal("2027-07-30"),
    reviewStatus: z.literal("awaiting-human-approval"),
  })).length(2),
  audit: z.array(z.strictObject({
    countyFips: fipsSchema,
    stateCode: z.enum(["IL", "MA", "NY"]),
    countyName: z.string(),
    baselineDisplayStatus: z.enum(["verified-present", "researched-unresolved"]),
    projectionPath: z.string(),
    projectionSha256: hashSchema,
    effectiveAt: dateSchema,
    conflictCheckFrom: dateSchema,
    presenceEvidence: z.array(presenceSchema),
    conflict: z.boolean(),
    conflictReason: z.string().nullable(),
    reviewDisposition: z.enum(["eligible-for-human-review", "held-undated-presence"]),
  })).length(108),
  reconciliation: z.strictObject({
    reviewedCandidatePairs: z.literal(108),
    eligibleNewDeterminations: z.literal(101),
    heldExistingPresentPairs: z.literal(7),
    undatedPresenceConflicts: z.literal(7),
    datedPostEradicationConflicts: z.literal(0),
    expectedPresentDeltaAfterApproval: z.literal(0),
    expectedAbsentDeltaAfterApproval: z.literal(101),
    expectedDeterminationDeltaAfterApproval: z.literal(101),
    actualDeterminationDeltaBeforeApproval: z.literal(0),
  }),
  boundaries: z.array(z.string()).min(1),
});

export type AlbCounty = {
  countyFips: string;
  stateCode: string;
  shortName: string;
  status: string;
};

export function albCandidateCounties(counties: AlbCounty[]) {
  const extra = new Set(["25021", "25025", "36047", "36061", "36081", "36085"]);
  const result = counties
    .filter((county) => county.status === "active" && (county.stateCode === "IL" || extra.has(county.countyFips)))
    .sort((a, b) => a.countyFips.localeCompare(b.countyFips));
  if (result.length !== 108 || new Set(result.map((county) => county.countyFips)).size !== 108) {
    throw new Error("The reviewed 108-county scope changed.");
  }
  return result;
}

export function albEffectiveAt(county: Pick<AlbCounty, "countyFips" | "stateCode">) {
  // APHIS gives years only. This is a date by which eradication had occurred,
  // not a claimed exact event date. Conflict screening uses the earlier bound below.
  if (county.stateCode === "IL") return "2009-01-01";
  if (county.stateCode === "MA") return "2015-01-01";
  return ["36047", "36081"].includes(county.countyFips) ? "2020-01-01" : "2014-01-01";
}

export function albConflictCheckFrom(county: Pick<AlbCounty, "countyFips" | "stateCode">) {
  // A presence anywhere within the reported year may be post-eradication.
  return `${Number(albEffectiveAt(county).slice(0, 4)) - 1}-01-01`;
}

export function auditAlbTemporalScope(
  county: AlbCounty,
  evidence: Array<{ evidenceId: string; sourceId: string; observedAt?: string }>,
) {
  return resolveTemporalPairDetermination({
    presenceEvidence: evidence,
    jurisdictionEvidence: [{
      id: `review-only-alb-${county.countyFips}`,
      statementType: "officially-eradicated",
      effectiveAt: albConflictCheckFrom(county),
      reaffirmedAt: "2026-07-30",
      validThrough: "2027-07-30",
    }],
    asOf: ALB_REVIEW_AS_OF,
  });
}

export function validateAlbReview(value: unknown) {
  const review = albReviewSchema.parse(value);
  for (const name of ["candidate", "eligible", "held"] as const) {
    const fips = review.scope[`${name}CountyFips`];
    if (JSON.stringify([...new Set(fips)].sort()) !== JSON.stringify(fips)) {
      throw new Error(`${name} county scope must be sorted and unique.`);
    }
    if (reviewHash(JSON.stringify(fips)) !== review.scope[`${name}CountyFipsSha256`]) {
      throw new Error(`${name} county scope hash differs.`);
    }
  }
  const expectedHeld = ["17031", "17043", "25025", "36047", "36061", "36081", "36085"];
  if (JSON.stringify(review.scope.heldCountyFips) !== JSON.stringify(expectedHeld)) {
    throw new Error("Held presence scope differs from the audited baseline.");
  }
  const partition = [...review.scope.eligibleCountyFips, ...review.scope.heldCountyFips].sort();
  if (new Set(partition).size !== 108 || JSON.stringify(partition) !== JSON.stringify(review.scope.candidateCountyFips)) {
    throw new Error("Eligible and held counties do not partition the exact candidate scope.");
  }
  const recordFips = review.proposedParentRecords.flatMap((record) => {
    if (reviewHash(JSON.stringify(record.jurisdiction.countyFips)) !== record.jurisdiction.countyFipsSha256) {
      throw new Error("Proposed parent scope hash differs.");
    }
    return record.jurisdiction.countyFips;
  }).sort();
  if (JSON.stringify(recordFips) !== JSON.stringify(review.scope.eligibleCountyFips)) {
    throw new Error("Proposed parent records include an unreviewable or missing county.");
  }
  if (JSON.stringify(review.audit.map((row) => row.countyFips)) !== JSON.stringify(review.scope.candidateCountyFips)) {
    throw new Error("Audit rows differ from the exact candidate scope.");
  }
  for (const row of review.audit) {
    if (row.effectiveAt !== albEffectiveAt(row) || row.conflictCheckFrom !== albConflictCheckFrom(row)) {
      throw new Error("Eradication-year bounds differ from the reviewed source.");
    }
    const held = review.scope.heldCountyFips.includes(row.countyFips);
    if (held !== row.conflict || held !== (row.reviewDisposition === "held-undated-presence")) {
      throw new Error("A conflicted county was promoted into the approval subset.");
    }
    if (!held && row.presenceEvidence.length > 0) {
      throw new Error("This approval subset requires no accepted presence evidence; new presence requires a new review.");
    }
    if (held && !row.presenceEvidence.some((evidence) => evidence.observedAt === null)) {
      throw new Error("Held county has no retained undated presence.");
    }
  }
  if (review.source.supportTextSha256 !== reviewHash(review.source.supportText)) {
    throw new Error("Source support text hash differs.");
  }
  if (review.baseline.determinations !== review.baseline.verifiedPresent + review.baseline.verifiedAbsent) {
    throw new Error("Baseline determination count does not reconcile.");
  }
  return review;
}
