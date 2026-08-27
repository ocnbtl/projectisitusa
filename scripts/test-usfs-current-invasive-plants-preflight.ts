import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { UsfsCurrentInvasivePlantsPreflightSchema } from "./research/build-usfs-current-invasive-plants-preflight";

const artifactPath = path.join(
  process.cwd(),
  "ops/national-research/evaluations/usfs-current-invasive-plants-national-preflight-20260827-r1.json",
);
const artifact = UsfsCurrentInvasivePlantsPreflightSchema.parse(
  JSON.parse(readFileSync(artifactPath, "utf8")),
);

assert.equal(artifact.baselineSha, "289d7d7a539e44d62116f036008e0944b1d95abe");
assert.equal(artifact.provider.totalFeatures, 946_008);
assert.equal(artifact.provider.maxObjectId, 946_497);
assert.equal(artifact.taxonCoverage.providerDistinctAcceptedNames, 1_052);
assert.equal(artifact.taxonCoverage.exactCatalogNames, 517);
assert.equal(artifact.taxonCoverage.exactCatalogFeatureRows, 785_457);
assert.equal(artifact.taxonCoverage.unmatchedFeatureRows, 158_112);
assert.equal(artifact.taxonCoverage.missingAcceptedNameRows, 2_439);
assert.equal(artifact.dateQuality.collectedBefore1900Rows, 61);
assert.equal(artifact.dateQuality.collectedAfterEvaluationDateRows, 128);
assert.equal(artifact.currentMatrix.activeRegistryCountyEquivalentCount, 3_235);
assert.equal(artifact.currentMatrix.generatedCountyEquivalentCount, 3_144);
assert.equal(artifact.currentMatrix.totalPairs, 7_872_576);
assert.equal(artifact.currentMatrix.verifiedPresent, 195_138);
assert.equal(artifact.currentMatrix.notDetected, 254);
assert.equal(artifact.stratifiedSample.returnedRows, 200);
assert.equal(artifact.stratifiedSample.uniqueResolvedCountySpeciesPairs, 157);
assert.equal(artifact.stratifiedSample.estimatedPotentialNetNewPairs, 30);
assert.equal(artifact.stratifiedSample.geographyMethodIsPublicationSafe, false);
assert.equal(artifact.snapshotBarrier.datedBulkArchiveAvailable, true);
assert.equal(artifact.snapshotBarrier.immutableArchiveBytesRetained, false);
assert.equal(artifact.snapshotBarrier.stableTargetedAcquisitionImplemented, true);
assert.equal(artifact.snapshotBarrier.targetedAcquisitionAuthorized, true);
assert.equal(artifact.decision.contractEngineeringStatus, "go");
assert.equal(artifact.decision.acquisitionStatus, "go-targeted-positive-pilot");
assert.equal(artifact.decision.measuredNetNewPairs, 0);
assert.equal(artifact.stratifiedSample.estimatedCandidates.length, 30);
assert.equal(artifact.provider.bulkArchive.providerDeclaredRefreshDate, "2026-08-12");
assert.equal(artifact.operations.networkRequests, 19);
assert.equal(artifact.operations.providerPosts, 0);
assert.equal(artifact.operations.generationCommands, 0);
assert.equal(artifact.operations.publicationMutations, 0);

assert.throws(
  () => UsfsCurrentInvasivePlantsPreflightSchema.parse({
    ...artifact,
    taxonCoverage: {
      ...artifact.taxonCoverage,
      missingAcceptedNameRows: artifact.taxonCoverage.missingAcceptedNameRows - 1,
    },
  }),
  /feature-row counts do not conserve/u,
);

assert.throws(
  () => UsfsCurrentInvasivePlantsPreflightSchema.parse({
    ...artifact,
    stratifiedSample: {
      ...artifact.stratifiedSample,
      estimatedPotentialNetNewPairs: artifact.stratifiedSample.estimatedPotentialNetNewPairs + 1,
    },
  }),
  /estimated overlap counts do not conserve/u,
);

process.stdout.write(`${JSON.stringify({
  totalFeatures: artifact.provider.totalFeatures,
  exactCatalogNames: artifact.taxonCoverage.exactCatalogNames,
  exactCatalogFeatureRows: artifact.taxonCoverage.exactCatalogFeatureRows,
  sampledPairs: artifact.stratifiedSample.uniqueResolvedCountySpeciesPairs,
  estimatedPotentialNetNewPairs: artifact.stratifiedSample.estimatedPotentialNetNewPairs,
  acquisitionStatus: artifact.decision.acquisitionStatus,
}, null, 2)}\n`);
process.stdout.write("USFS Current Invasive Plant Locations preflight tests passed.\n");
