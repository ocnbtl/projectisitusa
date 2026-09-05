import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  ALB_BASELINE_COMMIT, ALB_REVIEW_PATH, albCandidateCounties, auditAlbTemporalScope, reviewHash, validateAlbReview,
} from "./research/alb-eradication-review";

const read = (filename: string) => JSON.parse(readFileSync(filename, "utf8"));
const counties = read("src/data/research/county-equivalent-registry.json").countyEquivalents;
const review = validateAlbReview(read(ALB_REVIEW_PATH));
assert.equal(albCandidateCounties(counties).length, 108);
assert.equal(review.audit.filter((row) => row.conflict).length, 7);
assert.equal(review.proposedParentRecords[0].jurisdiction.countyFips.length, 100);
assert.equal(review.proposedParentRecords[1].jurisdiction.countyFips.length, 1);
const county = counties.find((row: { countyFips: string }) => row.countyFips === "17031");
assert.equal(auditAlbTemporalScope(county, []).compatibilityDisplayStatus, "verified-absent");
assert.equal(auditAlbTemporalScope(county, [{ evidenceId: "test-only-undated", sourceId: "fixture" }]).conflict, true);
assert.equal(auditAlbTemporalScope(county, [{ evidenceId: "test-only-later", sourceId: "fixture", observedAt: "2010" }]).conflict, true);
const historical = auditAlbTemporalScope(county, [{ evidenceId: "test-only-earlier", sourceId: "fixture", observedAt: "1998" }]);
assert.equal(historical.conflict, false);
assert.equal(historical.historicalOccurrenceStatus, "recorded-present");
assert.equal(historical.compatibilityDisplayStatus, "verified-present");
const changed = structuredClone(review);
changed.scope.eligibleCountyFips[0] = "17031";
assert.throws(() => validateAlbReview(changed));
const promoted = structuredClone(review);
promoted.audit.find((row) => row.countyFips === "17031")!.conflict = false;
assert.throws(() => validateAlbReview(promoted), /conflicted county/u);
const wrongHash = structuredClone(review);
wrongHash.source.supportText += "changed";
assert.throws(() => validateAlbReview(wrongHash), /support text hash/u);
const fakeApproval = { ...review, status: "human-approved" };
assert.throws(() => validateAlbReview(fakeApproval));
const extraScope = structuredClone(review);
extraScope.scope.candidateCountyFips.push("36103");
assert.throws(() => validateAlbReview(extraScope));
for (const row of review.audit) {
  assert.equal(reviewHash(execFileSync("git", ["-c", "safe.directory=C:/Code/project-isitusa", "show", `${ALB_BASELINE_COMMIT}:${row.projectionPath}`], { maxBuffer: 16 * 1024 * 1024 })), row.projectionSha256);
}
assert.equal(auditAlbTemporalScope({ countyFips: "17001", stateCode: "IL", shortName: "Adams", status: "active" }, [{ evidenceId: "within-eradication-year", sourceId: "test", observedAt: "2008-06-01" }]).conflict, true, "Year-only eradication evidence must hold any possibly post-eradication record within that year.");
const changedBound = structuredClone(review);
changedBound.audit[0].conflictCheckFrom = "2009-01-01";
assert.throws(() => validateAlbReview(changedBound), /Eradication-year bounds/u);
console.log(JSON.stringify({
  passed: true, reviewed: 108, eligible: 101, held: 7,
  checked: ["exact-scope", "byte-identity", "undated-conflict", "dated-conflict", "within-year-conflict", "date-bound-tampering", "historical-preservation", "tamper-rejection", "no-fabricated-approval"],
}, null, 2));
