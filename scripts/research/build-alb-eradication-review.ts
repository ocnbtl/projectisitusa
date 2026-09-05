import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import {
  ALB_BASELINE_COMMIT, ALB_INPUT_ROOT, ALB_REVIEW_AS_OF, ALB_REVIEW_ID,
  ALB_REVIEW_PATH, ALB_SOURCE_SHA256, ALB_SPECIES_ID, albCandidateCounties,
  albEffectiveAt, albConflictCheckFrom, albReviewSchema, auditAlbTemporalScope, reviewHash, validateAlbReview,
  type AlbCounty,
} from "./alb-eradication-review";

const root = process.cwd();
const json = <T,>(filename: string): T => JSON.parse(readFileSync(path.join(root, filename), "utf8")) as T;
const baselineBytes = (filename: string) => execFileSync("git", [
  "-c", "safe.directory=C:/Code/project-isitusa", "show", `${ALB_BASELINE_COMMIT}:${filename}`,
], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const baselineJson = <T,>(filename: string): T => JSON.parse(baselineBytes(filename).toString("utf8")) as T;
const mode = process.argv[2] ?? "--check";
assert(["--write", "--check"].includes(mode), "Use --write or --check.");

const capture = json<{
  sourceId: string; url: string; artifactPath: string; sha256: string; bytes: number; retrievedAt: string;
}>(`${ALB_INPUT_ROOT}/acquisition.json`);
const sourceBytes = readFileSync(path.join(root, capture.artifactPath));
assert.equal(capture.sha256, ALB_SOURCE_SHA256, "Review source identity changed.");
assert.equal(reviewHash(sourceBytes), capture.sha256);
assert.equal(sourceBytes.length, capture.bytes);
const prior = json<{ retainedSources: Array<{ id: string; supportText: string }> }>(
  "ops/national-research/evaluations/post-usfws-jurisdiction-wide-absence-contract-preflight-20260824-r1.json",
);
const supportText = prior.retainedSources.find((source) => source.id === capture.sourceId)?.supportText;
assert(supportText, "Registered source support is missing.");
const normalize = (text: string) => text.replace(/<[^>]*>/gu, " ").replace(/&nbsp;|&#160;/gu, " ").replace(/\s+/gu, " ").trim();
assert(normalize(sourceBytes.toString("utf8")).includes(normalize(supportText)), "Current source no longer contains the reviewed scope statement.");

const counties = albCandidateCounties(baselineJson<{ countyEquivalents: AlbCounty[] }>(
  "src/data/research/county-equivalent-registry.json",
).countyEquivalents);
const audit = counties.map((county) => {
  const projectionPath = `public/generated/research/${county.stateCode}/counties/${county.countyFips}.json`;
  const bytes = baselineBytes(projectionPath);
  const projection = JSON.parse(bytes.toString("utf8")) as {
    countyFips: string; stateCode: string; pairResolution: { defaultDisplayStatus: string };
    pairs: Array<{ speciesId: string; displayStatus: string; conflict: boolean;
      evidence: Array<{ evidenceId: string; sourceId: string; assertion: string; observedAt?: string }> }>;
  };
  assert.equal(projection.countyFips, county.countyFips);
  assert.equal(projection.stateCode, county.stateCode);
  const pair = projection.pairs.find((row) => row.speciesId === ALB_SPECIES_ID);
  assert(!pair?.conflict, "Baseline already has an unresolved conflict.");
  const evidence = (pair?.evidence ?? []).filter((row) => row.assertion === "recorded-present");
  const temporal = auditAlbTemporalScope(county, evidence);
  assert(!temporal.conflict || evidence.some((row) => !row.observedAt), "New dated post-eradication conflict requires a new review.");
  return {
    countyFips: county.countyFips,
    stateCode: county.stateCode,
    countyName: county.shortName,
    baselineDisplayStatus: pair?.displayStatus ?? projection.pairResolution.defaultDisplayStatus,
    projectionPath,
    projectionSha256: reviewHash(bytes),
    effectiveAt: albEffectiveAt(county),
    conflictCheckFrom: albConflictCheckFrom(county),
    presenceEvidence: evidence.map((row) => ({ evidenceId: row.evidenceId, sourceId: row.sourceId, observedAt: row.observedAt ?? null })),
    conflict: temporal.conflict,
    conflictReason: temporal.conflictReason,
    reviewDisposition: temporal.conflict ? "held-undated-presence" : "eligible-for-human-review",
  };
});
const candidateCountyFips = counties.map((county) => county.countyFips);
const eligibleCountyFips = audit.filter((row) => !row.conflict).map((row) => row.countyFips);
const heldCountyFips = audit.filter((row) => row.conflict).map((row) => row.countyFips);
const dashboard = baselineJson<{ national: { denominator: { verifiedPresent: number; verifiedAbsent: number; fullCountySpeciesDenominator: number } } }>(
  "ops/national-research/readiness-dashboard.json",
).national.denominator;

const review = validateAlbReview({
  schemaVersion: 1, kind: "review-only-eradication-proposal",
  evaluationId: ALB_REVIEW_ID, asOf: ALB_REVIEW_AS_OF,
  status: "awaiting-human-approval-for-unconflicted-subset", baselineCommit: ALB_BASELINE_COMMIT,
  source: {
    sourceId: capture.sourceId, url: capture.url, artifactPath: capture.artifactPath,
    artifactSha256: capture.sha256, artifactBytes: capture.bytes, retrievedAt: capture.retrievedAt,
    publishedAt: "2026-07-30", supportText, supportTextSha256: reviewHash(supportText),
  },
  baseline: {
    verifiedPresent: dashboard.verifiedPresent, verifiedAbsent: dashboard.verifiedAbsent,
    determinations: dashboard.verifiedPresent + dashboard.verifiedAbsent,
    denominator: dashboard.fullCountySpeciesDenominator,
  },
  scope: {
    candidateCountyFips, candidateCountyFipsSha256: reviewHash(JSON.stringify(candidateCountyFips)),
    eligibleCountyFips, eligibleCountyFipsSha256: reviewHash(JSON.stringify(eligibleCountyFips)),
    heldCountyFips, heldCountyFipsSha256: reviewHash(JSON.stringify(heldCountyFips)),
    excludedSubcountyScopes: [
      "Islip, Oyster Bay, Babylon, and Huntington in New York: narrower than a whole county.",
      "Batavia, Monroe, Stonelick, and Tate Townships in Ohio: partial township scopes.",
      "Holden in Massachusetts: town scope; Worcester County retains active program work.",
    ],
  },
  proposedParentRecords: (["IL", "MA"] as const).map((stateCode) => {
    const selected = audit.filter((row) => row.stateCode === stateCode && !row.conflict);
    const countyFips = selected.map((row) => row.countyFips);
    return {
      id: `asian-longhorned-beetle-${stateCode.toLowerCase()}-unconflicted-eradication-20260905-r2`,
      speciesId: ALB_SPECIES_ID, statementType: "officially-eradicated",
      jurisdiction: { level: "county-set", stateCode, countyFips, countyFipsSha256: reviewHash(JSON.stringify(countyFips)), exclusions: [] },
      effectiveAt: selected[0].effectiveAt, conflictCheckFrom: selected[0].conflictCheckFrom, reaffirmedAt: "2026-07-30", validThrough: "2027-07-30",
      reviewStatus: "awaiting-human-approval",
    };
  }),
  audit,
  reconciliation: {
    reviewedCandidatePairs: 108, eligibleNewDeterminations: 101, heldExistingPresentPairs: 7,
    undatedPresenceConflicts: 7, datedPostEradicationConflicts: 0,
    expectedPresentDeltaAfterApproval: 0, expectedAbsentDeltaAfterApproval: 101,
    expectedDeterminationDeltaAfterApproval: 101, actualDeterminationDeltaBeforeApproval: 0,
  },
  boundaries: [
    "This artifact is a review proposal, not a human approval, assertion, review event, or publishable registry.",
    "Approval applies only to the exact 101 eligible counties. The other seven cannot be applied under this artifact.",
    "Preserve all seven existing EDDMapS assertions and their undated observation dates. Do not backdate, retract, or relabel them to bypass a conflict.",
    "A zero dated-conflict count is insufficient: undated accepted presence is also a temporal conflict.",
    "The original 108-pair lead could add at most 101 new determinations because seven pairs are already determined present.",
    "APHIS supplies eradication years only. effectiveAt is the first day after that year, a date by which eradication had occurred, not an exact event date. conflictCheckFrom is January 1 of the reported year: any dated presence within or after that year remains a possible conflict.",
    "The proposed current authority window ends 2027-07-30, one year after the 2026-07-30 official reaffirmation; it must fail closed afterward.",
    "Revalidate source scope, approved artifact hash, and all included pair evidence immediately before application. This exact eligible subset requires zero accepted presence evidence. Any newly accepted presence, even apparently historical, requires a new proposal.",
    "No push, R2 upload or promotion, manual deployment, or external account mutation is authorized by this review.",
  ],
});
assert.equal(review.baseline.determinations, 314810);
const serialized = JSON.stringify(review, null, 2) + "\n";
const sha256 = reviewHash(serialized);
const approvalToken = `Approve ${ALB_REVIEW_ID} sha256:${sha256}`;
const schemaPath = "src/data/research/schemas/alb-eradication-review.schema.json";
const schema = JSON.stringify(z.toJSONSchema(albReviewSchema), null, 2) + "\n";
const notePath = ALB_REVIEW_PATH.replace(/\.json$/u, ".md");
const note = [
  "# APHIS ALB eradication review", "",
  "Review scope: 108 county-species pairs. Eligible for approval: 101. Held: 7.", "",
  "This r2 proposal supersedes the earlier r1 proposal and approval request. Only the r2 token below is applicable.", "",
  "The 101 eligible counties are 100 Illinois counties (all except Cook and DuPage) and Norfolk County, Massachusetts.",
  "The seven held counties are Cook and DuPage, Illinois; Suffolk, Massachusetts; and Kings, New York, Queens, and Richmond, New York.",
  "Their accepted EDDMapS evidence is undated. The current compiler treats undated presence as a conflict with eradication; no dates or history have been changed.", "",
  "Expected effect after approval and successful integration: +101 verified absent and +101 total determinations, with 0 present removed. Actual data change so far: 0.", "",
  "APHIS gives eradication years. Conflict checks start on January 1 of that year, so any occurrence within the year remains a possible conflict. The separate effectiveAt is the first day after the year, a date by which eradication had occurred; neither boundary is a claimed exact event date. Any newly accepted presence in the 101 eligible counties requires a new proposal before application.", "",
  "The exact FIPS sets, source bytes, per-county projection hashes, and conflict evidence are in the adjacent JSON artifact.", "",
  `Artifact SHA-256: ${sha256}`, "",
  "Exact approval token:", "",
  approvalToken, "",
  "Approval covers only the eligible subset and local application. External publication and push remain separate decisions.", "",
].join("\n");
for (const [filename, contents] of [[ALB_REVIEW_PATH, serialized], [schemaPath, schema], [notePath, note]]) {
  const target = path.join(root, filename);
  if (mode === "--write") writeFileSync(target, contents);
  else assert.equal(readFileSync(target, "utf8"), contents, `${filename} is not byte-stable.`);
}
console.log(JSON.stringify({ mode, artifactPath: ALB_REVIEW_PATH, sha256, approvalToken, ...review.reconciliation }, null, 2));
