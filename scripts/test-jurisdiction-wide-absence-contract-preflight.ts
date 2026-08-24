import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildJurisdictionWideAbsenceContractPreflight,
  serializeJurisdictionWideAbsenceContractPreflight,
} from "./research/build-jurisdiction-wide-absence-contract-preflight";

const root = process.cwd();
const artifactPath = path.join(
  root,
  "ops/national-research/evaluations/post-usfws-jurisdiction-wide-absence-contract-preflight-20260824-r1.json",
);
const preflight = buildJurisdictionWideAbsenceContractPreflight(root);

assert.equal(preflight.mode, "zero-assertion-authoritative-jurisdiction-contract-preflight");
assert.equal(preflight.retainedSources.length, 6);
assert.equal(preflight.retainedSources.filter((source) => source.role === "candidate-support").length, 5);
assert.equal(preflight.retainedSources.filter((source) => source.role === "ambiguity-record").length, 1);
assert.equal(preflight.candidateCatalog[0].id, "vespa-mandarinia");
assert.equal(preflight.candidateCatalog[1].id, "asian-longhorned-beetle");
assert.equal(preflight.exactJurisdictionCoverage.nationalV1.jurisdictionCount, 51);
assert.equal(preflight.exactJurisdictionCoverage.nationalV1.countyEquivalentCount, 3_144);
assert.equal(
  preflight.exactJurisdictionCoverage.nationalV1.countyFipsSha256,
  "e637d99538d4e253df2320f0a660e6bfca6d674d50c215f907fa1a67e287e333",
);
assert.deepEqual(
  preflight.exactJurisdictionCoverage.newJerseyAsianLonghornedBeetle.counties,
  [
    { countyFips: "34017", stateCode: "NJ", countyName: "Hudson" },
    { countyFips: "34023", stateCode: "NJ", countyName: "Middlesex" },
    { countyFips: "34039", stateCode: "NJ", countyName: "Union" },
  ],
);
assert.equal(preflight.baselineProjectionAudit.targetSetAcceptedPresenceConflicts, 0);
assert.deepEqual(
  preflight.baselineProjectionAudit.asianLonghornedBeetle.verifiedPresentCountyFips,
  ["25027", "36059", "36103", "39025", "45019", "45035"],
);
assert.equal(preflight.candidateBatchIfLaterApproved.currentDeterminationPairs, 3_147);
assert.equal(preflight.candidateBatchIfLaterApproved.historicalRecordedPresencePairs, 4);
assert.equal(preflight.candidateBatchIfLaterApproved.assertionEventsCreatedByThisPreflight, 0);
assert.equal(preflight.operations.publicationMutations, 0);
assert.equal(preflight.operations.r2Mutations, 0);
assert.equal(preflight.decision.status, "go-semantic-implementation-required-assertions-deferred");
assert.equal(
  readFileSync(artifactPath, "utf8"),
  serializeJurisdictionWideAbsenceContractPreflight(preflight),
);

console.log("Jurisdiction-wide absence contract preflight tests passed.");
