import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { NationalIdigbioContractPreflightSchema } from "./research/build-national-idigbio-contract-preflight";

const root = process.cwd();
const artifactPath = path.join(
  root,
  "ops/national-research/evaluations/post-round-78-idigbio-national-contract-preflight-20260820-r1.json",
);
const artifact = NationalIdigbioContractPreflightSchema.parse(
  JSON.parse(readFileSync(artifactPath, "utf8")),
);

assert.equal(artifact.baselineSha, "bcef10cb58965fec1bd6cc9e7bb7388dde2f8325");
assert.equal(artifact.generatedContentCommit, "0afdc8a161d39476c712897c8974e33ede30eb5a");
assert.equal(artifact.source.providerSnapshotFrozenAsOf, "2026-05-08");
assert.equal(artifact.retainedCorpus.runCount, 8);
assert.deepEqual(artifact.retainedCorpus.stateCodes, ["AL"]);
assert.deepEqual(artifact.retainedCorpus.adapterVersions, ["1.0.0", "1.1.0"]);
assert.equal(artifact.retainedCorpus.requestedPairs, 155);
assert.equal(artifact.retainedCorpus.candidateRecords, 3_547);
assert.equal(artifact.retainedCorpus.assertionEvents, 198);
assert.equal(artifact.retainedCorpus.reviewEvents, 198);
assert.equal(artifact.retainedCorpus.rejectionRecords, 685);
assert.equal(artifact.retainedCorpus.pairOutcomes, 155);
assert.equal(artifact.retainedCorpus.upstreamRequests, 83);
assert.equal(artifact.retainedCorpus.retainedArtifacts, 83);
assert.equal(artifact.retainedCorpus.retainedArtifactBytes, 6_323_007);
assert.equal(artifact.exactOverlap.historicalEvidenceFound.total, 80);
assert.equal(artifact.exactOverlap.historicalEvidenceFound.currentVerifiedPresent, 80);
assert.equal(artifact.exactOverlap.historicalNoQualifyingEvidence.total, 75);
assert.equal(artifact.exactOverlap.historicalNoQualifyingEvidence.currentVerifiedPresent, 60);
assert.equal(artifact.exactOverlap.historicalNoQualifyingEvidence.currentResearchedUnresolved, 15);
assert.equal(artifact.exactOverlap.currentVerifiedPresent, 140);
assert.equal(artifact.exactOverlap.currentResearchedUnresolved, 15);
assert.equal(artifact.exactOverlap.currentNotResearched, 0);
assert.equal(artifact.exactOverlap.retainedReplayNetNewPairs, 0);
assert.equal(artifact.nationalContract.providerNativeNationalArchiveImplemented, false);
assert.equal(artifact.nationalContract.currentMaterialScopeExecutable, false);
assert.equal(artifact.decision.providerRequestAuthorizedByThisEvaluation, false);
assert.equal(artifact.operations.networkRequests, 0);
assert.equal(artifact.operations.providerPosts, 0);

assert.throws(
  () => NationalIdigbioContractPreflightSchema.parse({
    ...artifact,
    exactOverlap: {
      ...artifact.exactOverlap,
      currentNotResearched: 1,
    },
  }),
  /do not conserve|must equal/u,
);

process.stdout.write(`${JSON.stringify({
  runCount: artifact.retainedCorpus.runCount,
  uniquePairOutcomes: artifact.exactOverlap.uniquePairOutcomes,
  currentVerifiedPresent: artifact.exactOverlap.currentVerifiedPresent,
  currentResearchedUnresolved: artifact.exactOverlap.currentResearchedUnresolved,
  retainedReplayNetNewPairs: artifact.exactOverlap.retainedReplayNetNewPairs,
  providerRequestAuthorized: artifact.decision.providerRequestAuthorizedByThisEvaluation,
}, null, 2)}\n`);
process.stdout.write("National iDigBio contract preflight tests passed.\n");
