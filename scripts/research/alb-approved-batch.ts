import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import type { JurisdictionEvidenceRecord } from "@/lib/research/types";
import {
  ALB_BASELINE_COMMIT, ALB_REVIEW_ID, ALB_REVIEW_PATH, ALB_SOURCE_SHA256,
  ALB_SPECIES_ID, reviewHash, validateAlbReview,
} from "./alb-eradication-review";

export const ALB_APPROVED_REVIEW_SHA256 = "19229e1f90b7be211af20874814744b94c31beeef947441228f432d2aa8b22d1";
export const ALB_APPROVAL_RECEIPT_PATH = "ops/national-research/evaluations/aphis-alb-eradication-human-approval-receipt-20260905-r2.json";
export const ALB_APPROVAL_TOKEN = `Approve ${ALB_REVIEW_ID} sha256:${ALB_APPROVED_REVIEW_SHA256}`;

const approvalSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.literal("human-approved"),
  actorId: z.literal("Ocean"),
  recordedAt: z.string().datetime(),
  userMessageVerbatim: z.literal("Approved"),
  normalizedApprovalToken: z.literal(ALB_APPROVAL_TOKEN),
  approvedArtifact: z.object({ path: z.literal(ALB_REVIEW_PATH), sha256: z.literal(ALB_APPROVED_REVIEW_SHA256) }),
  approvedScope: z.object({ eligibleCountyCount: z.literal(101), heldCountyCount: z.literal(7), localApplicationOnly: z.literal(true) }),
  sourceRecheck: z.object({ checkedAt: z.string().datetime(), artifactSha256: z.literal(ALB_SOURCE_SHA256), byteIdenticalToReviewedSource: z.literal(true) }),
});

export function validateAlbApproval(reviewBytes: Buffer, receiptValue: unknown, sourceBytes: Buffer) {
  assert.equal(reviewHash(reviewBytes), ALB_APPROVED_REVIEW_SHA256, "Approved ALB artifact hash changed.");
  const review = validateAlbReview(JSON.parse(reviewBytes.toString("utf8")));
  const receipt = approvalSchema.parse(receiptValue);
  assert.equal(reviewHash(sourceBytes), review.source.artifactSha256, "Approved ALB source bytes changed.");
  assert.equal(sourceBytes.length, review.source.artifactBytes, "Approved ALB source size changed.");
  assert.equal(review.source.artifactSha256, ALB_SOURCE_SHA256);
  assert(Date.parse(receipt.sourceRecheck.checkedAt) <= Date.parse(receipt.recordedAt), "Source recheck follows the recorded approval receipt.");
  assert(Date.parse(receipt.recordedAt) <= Date.now(), "Approval receipt cannot be future dated.");
  return { review, receipt };
}

export function loadApprovedAlbBatch(root: string) {
  const reviewBytes = readFileSync(path.join(root, ALB_REVIEW_PATH));
  const receiptBytes = readFileSync(path.join(root, ALB_APPROVAL_RECEIPT_PATH));
  const parsedReview = validateAlbReview(JSON.parse(reviewBytes.toString("utf8")));
  return {
    ...validateAlbApproval(reviewBytes, JSON.parse(receiptBytes.toString("utf8")), readFileSync(path.join(root, parsedReview.source.artifactPath))),
    receiptSha256: reviewHash(receiptBytes),
  };
}

export function approvedAlbParentRecords(root: string): JurisdictionEvidenceRecord[] {
  const { review, receipt } = loadApprovedAlbBatch(root);
  return review.proposedParentRecords.map(({ reviewStatus: _status, ...record }) => ({
    schemaVersion: 1,
    ...record,
    jurisdiction: { ...record.jurisdiction, id: `US-${record.jurisdiction.stateCode}-ALB-approved-unconflicted-counties-20260905-r2` },
    sourceDocuments: [{
      sourceId: review.source.sourceId,
      url: review.source.url,
      artifactPath: review.source.artifactPath,
      artifactSha256: review.source.artifactSha256,
      supportText: review.source.supportText,
      supportTextSha256: review.source.supportTextSha256,
      publishedAt: review.source.publishedAt,
      modifiedAt: null,
    }],
    review: { gate: "human-approved", status: "human-approved", actorId: receipt.actorId, reviewedAt: receipt.recordedAt },
    caveats: [
      "APHIS reports an eradication year. effectiveAt is the first day after that year, a date by which eradication had occurred; it is not an exact event date.",
      "conflictCheckFrom is the first day of the reported year. Any occurrence within or after that year, or an undated occurrence, remains a possible conflict.",
      "Only the exact 101 approved counties are included. All seven held counties and their undated accepted presence evidence remain unchanged.",
      `Approval: ${ALB_APPROVAL_RECEIPT_PATH}; review SHA-256 ${ALB_APPROVED_REVIEW_SHA256}.`,
      "The current determination expires after 2027-07-30 without a new authoritative reaffirmation.",
    ],
  }));
}

// This narrowly approved batch cannot run against changed evidence inputs or stale projections.
// A future research wave must create a new review instead of silently reusing this approval.
export function verifyAlbApplicationBaseline(root: string) {
  const { review } = loadApprovedAlbBatch(root);
  const authorityPaths = [
    "src/data/research/runs", "src/data/research/evidence-assertions.ndjson",
    "src/data/research/review-events.ndjson", "src/data/research/rejections.ndjson",
    "src/data/research/research-runs.json", "src/data/research/migration-candidates.json",
    "src/data/research/state-candidates", "src/data/research/state-research-config.json",
    "src/data/research/state-applicability", "src/data/generated/species.json",
    "src/data/source", "src/data/research/county-equivalent-registry.json",
  ];
  const git = (args: string[]) => execFileSync("git", ["-c", "safe.directory=C:/Code/project-isitusa", ...args], { cwd: root, encoding: "utf8", maxBuffer: 1024 * 1024 }).trim();
  assert.equal(git(["diff", "--name-only", ALB_BASELINE_COMMIT, "HEAD", "--", ...authorityPaths]), "", "Evidence inputs changed since the approved baseline; a new ALB review is required.");
  assert.equal(git(["status", "--porcelain", "--", ...authorityPaths]), "", "Evidence inputs contain uncommitted changes; ALB application is blocked.");
  for (const row of review.audit) {
    const bytes = readFileSync(path.join(root, row.projectionPath));
    assert.equal(reviewHash(bytes), row.projectionSha256, `County ${row.countyFips} projection changed since approval.`);
    const county = JSON.parse(bytes.toString("utf8")) as { pairs: Array<{ speciesId: string; evidence: Array<{ assertion: string }> }> };
    const pair = county.pairs.find((entry) => entry.speciesId === ALB_SPECIES_ID);
    assert(pair, `Missing ALB baseline pair ${row.countyFips}.`);
    if (review.scope.eligibleCountyFips.includes(row.countyFips)) {
      assert(!pair.evidence.some((entry) => entry.assertion === "recorded-present"), `New accepted presence in ${row.countyFips} requires a new review.`);
    }
  }
  return { countiesRechecked: 108, eligibleWithoutAcceptedPresence: 101, heldUnchanged: 7 };
}
