import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ALB_REVIEW_ID, ALB_REVIEW_PATH } from "./research/alb-eradication-review";
import {
  ALB_APPROVED_REVIEW_SHA256, ALB_APPROVAL_RECEIPT_PATH,
  approvedAlbParentRecords, loadApprovedAlbBatch, validateAlbApproval,
} from "./research/alb-approved-batch";
import { ALB_ERADICATION_ADAPTER_VERSION, officialEradicationAdapter } from "./research/adapters/official-eradication-determination";
import { resolveTemporalPairDetermination, validateJurisdictionEvidenceRegistry } from "@/lib/research/jurisdiction-evidence";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";

const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p));
const json = (p: string) => JSON.parse(read(p).toString("utf8"));
const { review, receipt, receiptSha256 } = loadApprovedAlbBatch(root);
const parents = approvedAlbParentRecords(root);
const registry = { schemaVersion: 1 as const, updatedAt: "2026-09-05", records: parents };
const countyRegistry = json("src/data/research/county-equivalent-registry.json");
const stateRegistry = json("src/data/research/state-registry.json");
validateJurisdictionEvidenceRegistry({ registry, countyRegistry, stateRegistry });
z.fromJSONSchema(json("src/data/research/schemas/jurisdiction-evidence-registry.schema.json")).parse(registry);
const parameterValidator = z.fromJSONSchema(json("src/data/research/schemas/official-eradication-determination-parameters.schema.json"));

async function main() {
  const adapter = officialEradicationAdapter(review.source.sourceId, ALB_ERADICATION_ADAPTER_VERSION);
  assert.deepEqual(parents.flatMap(p => p.jurisdiction.countyFips), review.scope.eligibleCountyFips);
  assert(parents.every(p => p.review.status === "human-approved" && p.review.actorId === "Ocean"));
  assert(parents.every(p => p.jurisdiction.countyFips.every(fips => !review.scope.heldCountyFips.includes(fips))));
  for (const parent of parents) {
    const context: SourceAdapterContext = {
      sourceId: review.source.sourceId, runId: `fixture-alb-${parent.jurisdiction.stateCode}`,
      stateCode: parent.jurisdiction.stateCode!, runStartedAt: receipt.recordedAt,
      requestedPairs: parent.jurisdiction.countyFips.map(countyFips => ({
        countyFips, countyName: countyRegistry.countyEquivalents.find((c: { countyFips: string }) => c.countyFips === countyFips).legalName,
        speciesId: parent.speciesId, scientificName: "Anoplophora glabripennis",
      })),
      parameters: {
        stateCode: parent.jurisdiction.stateCode!, mode: "human-approved-official-eradication",
        batchId: ALB_REVIEW_ID, approvalArtifactPath: ALB_REVIEW_PATH,
        approvalArtifactSha256: ALB_APPROVED_REVIEW_SHA256, approvalReceiptPath: ALB_APPROVAL_RECEIPT_PATH,
        approvalReceiptSha256: receiptSha256, sourceDocumentId: review.source.sourceId,
        parentJurisdictionEvidenceId: parent.id, candidateLimit: parent.jurisdiction.countyFips.length,
        candidatePairs: parent.jurisdiction.countyFips.map(fips => `${fips}:${parent.speciesId}`),
        historicalOccurrencePairKeys: [], humanReviewActorId: "Ocean", humanReviewTimestamp: receipt.recordedAt,
      },
    };
    parameterValidator.parse(context.parameters);
    assert.throws(() => parameterValidator.parse({ ...context.parameters, unapprovedExtraField: true }));
    for (const key of Object.keys(context.parameters)) {
      const incomplete = { ...context.parameters };
      delete incomplete[key];
      assert.throws(() => parameterValidator.parse(incomplete), `Missing required parameter must fail: ${key}`);
    }
    const result = await adapter.run(context);
    assert.equal(result.assertions.length, parent.jurisdiction.countyFips.length);
    assert(result.assertions.every(a => a.claim_type === "officially-absent" && a.parent_jurisdiction_evidence_id === parent.id && a.actor_id.endsWith("@1.1.0")));
    assert(result.reviews.every(r => r.actor_type === "human" && r.actor_id === "Ocean" && r.publication_eligible));
    assert.equal(result.upstreamRequests.length, 0);
    assert.equal(result.rejections.length, 0);
    const tampered = structuredClone(context);
    tampered.requestedPairs[0]!.countyFips = parent.jurisdiction.stateCode === "IL" ? "17031" : "25025";
    await assert.rejects(adapter.run(tampered), /exact approval/u);
    const partial = structuredClone(context);
    partial.requestedPairs = [];
    await assert.rejects(adapter.run(partial), /exact approval/u);
    await assert.rejects(adapter.run({ ...context, parameters: { ...context.parameters, approvalArtifactSha256: "a".repeat(64) } }), /artifact hash/u);
    await assert.rejects(adapter.run({ ...context, parameters: { ...context.parameters, approvalReceiptSha256: "a".repeat(64) } }), /receipt hash/u);
    await assert.rejects(adapter.run({ ...context, stateCode: "NY" }), /does not include/u);
    await assert.rejects(adapter.run({ ...context, parameters: { ...context.parameters, humanReviewActorId: "agent" } }), /Human review actor/u);
    const mixed = { ...context.parameters, batchId: "jurisdiction-wide-eradication-human-approval-request-20260901-r1" };
    assert.throws(() => parameterValidator.parse(mixed));

    const resolve = (observedAt?: string, asOf = "2026-09-05") => resolveTemporalPairDetermination({
      presenceEvidence: [{ evidenceId: "fixture-presence", observedAt }], jurisdictionEvidence: [parent], asOf,
    });
    for (const observedAt of [undefined, parent.conflictCheckFrom, `${parent.conflictCheckFrom!.slice(0, 4)}-12-31`, parent.effectiveAt, "2026-09-04"]) {
      assert.equal(resolve(observedAt).conflict, true, `Possible post-eradication presence must conflict: ${observedAt}`);
    }
    assert.equal(resolve(`${Number(parent.conflictCheckFrom!.slice(0, 4)) - 1}-12-31`).conflict, false);
    assert.equal(resolveTemporalPairDetermination({ presenceEvidence: [], jurisdictionEvidence: [parent], asOf: "2027-07-30" }).currentDeterminationStatus, "officially-eradicated");
    assert.equal(resolveTemporalPairDetermination({ presenceEvidence: [], jurisdictionEvidence: [parent], asOf: "2027-07-31" }).currentDeterminationStatus, "none");
    const invalid = structuredClone(registry);
    invalid.records[0]!.conflictCheckFrom = "2026-07-30";
    assert.throws(() => validateJurisdictionEvidenceRegistry({ registry: invalid, countyRegistry, stateRegistry }), /follows effectiveAt/u);
  }
  const sourceBytes = read(review.source.artifactPath);
  const reviewBytes = read(ALB_REVIEW_PATH);
  assert.throws(() => validateAlbApproval(Buffer.concat([reviewBytes, Buffer.from(" ")]), receipt, sourceBytes), /artifact hash/u);
  assert.throws(() => validateAlbApproval(reviewBytes, { ...receipt, actorId: "agent" }, sourceBytes));
  assert.throws(() => validateAlbApproval(reviewBytes, { ...receipt, status: "awaiting-human-approval" }, sourceBytes));
  assert.throws(() => validateAlbApproval(reviewBytes, receipt, Buffer.from("source changed")), /source bytes/u);
  console.log(JSON.stringify({ approvedParents: parents.length, approvedPairs: 101, heldPairs: 7, scopeTamperingRejected: true, mixedApprovalRejected: true, intervalConflictsPreserved: true, expiryFailsClosed: true }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
