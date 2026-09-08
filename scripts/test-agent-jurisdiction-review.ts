import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { sha256, stableJson } from "@/lib/research/run-files";
import { resolveTemporalPairDetermination, validateJurisdictionEvidenceRegistry } from "@/lib/research/jurisdiction-evidence";
import { strictJurisdictionDate, jurisdictionReviewExpiry, verifyIndependentJurisdictionReview } from "@/lib/research/jurisdiction-agent-review";
import { approvedAgentParentRecords, agentParentInputPaths, AGENT_JURISDICTION_RECORDS_PATH } from "./research/agent-jurisdiction-records";
import { runAgentJurisdictionDetermination } from "./research/adapters/official-jurisdiction-agent-reviewed";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import type { JurisdictionEvidenceRecord } from "@/lib/research/types";

const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const countyRegistry = read("src/data/research/county-equivalent-registry.json");
const stateRegistry = read("src/data/research/state-registry.json");
const schema = z.fromJSONSchema(read("src/data/research/schemas/jurisdiction-evidence-registry.schema.json"));
const parent = approvedAgentParentRecords(root)[0]!;
assert.equal(parent.speciesId, "tilletia-indica");
assert.equal(parent.review.gate, "agent-reviewed");
if (parent.review.gate !== "agent-reviewed") throw new Error("Missing agent fixture");
const review = parent.review;
assert.equal(parent.jurisdiction.countyFips.length, 58);
const validate = (record: JurisdictionEvidenceRecord) => {
  const registry = { schemaVersion: 1 as const, updatedAt: "2026-09-08", records: [record] };
  schema.parse(registry);
  validateJurisdictionEvidenceRegistry({ registry, countyRegistry, stateRegistry });
};
let rejected = 0;
function rejects(mutator: (record: JurisdictionEvidenceRecord) => void) {
  const changed = structuredClone(parent); mutator(changed);
  assert.throws(() => validate(changed)); rejected++;
}
validate(parent);
assert.throws(() => strictJurisdictionDate("2026-02-30", "impossible date")); rejected++;
assert.equal(jurisdictionReviewExpiry("2024-02-29"), "2025-02-28");
rejects(r => { r.effectiveAt = "2026-02-30"; });
rejects(r => { r.effectiveAt = "2026-09-07"; });
rejects(r => { r.reaffirmedAt = "2026-09-07"; });
rejects(r => { r.validThrough = "2028-06-09"; });
rejects(r => { if(r.review.gate === "agent-reviewed") r.review.independentActorId = r.review.actorId; });
rejects(r => { if(r.review.gate === "agent-reviewed") r.review.corroborationSourceId = r.review.declarationSourceId; });
rejects(r => { if(r.review.gate === "agent-reviewed") r.review.reviewedAsOf = "2027-06-10"; });
rejects(r => { if(r.review.gate === "agent-reviewed") r.review.reviewedAsOf = "2026-01-01"; });
rejects(r => { r.jurisdiction.countyFips.pop(); r.jurisdiction.countyFipsSha256 = sha256(JSON.stringify(r.jurisdiction.countyFips)); });
rejects(r => { r.jurisdiction.countyFips.push("04001"); r.jurisdiction.countyFips.sort(); r.jurisdiction.countyFipsSha256 = sha256(JSON.stringify(r.jurisdiction.countyFips)); });
rejects(r => { r.jurisdiction.countyFips.push(r.jurisdiction.countyFips[0]); });
rejects(r => { r.sourceDocuments[0].supportText = "Quarantine enforcement ended."; r.sourceDocuments[0].supportTextSha256 = sha256(r.sourceDocuments[0].supportText); });
const independentBytes = readFileSync(path.join(root, review.independentReview.path));
verifyIndependentJurisdictionReview(parent, independentBytes);
assert.throws(() => verifyIndependentJurisdictionReview(parent, Buffer.concat([independentBytes, Buffer.from(" ")]))); rejected++;
const wrongActor = JSON.parse(independentBytes.toString()); wrongActor.actorId = "MAIN";
const wrongActorBytes = Buffer.from(JSON.stringify(wrongActor)); const wrongActorParent = structuredClone(parent);
if(wrongActorParent.review.gate === "agent-reviewed") wrongActorParent.review.independentReview.sha256 = sha256(wrongActorBytes);
assert.throws(() => verifyIndependentJurisdictionReview(wrongActorParent, wrongActorBytes)); rejected++;
for (const observedAt of ["2010", "2010-01", "2025-12-01", undefined]) {
  assert.equal(resolveTemporalPairDetermination({ presenceEvidence: [{ evidenceId: "contrary", observedAt }], jurisdictionEvidence: [parent], asOf: "2026-09-08" }).conflict, true);
}
const historical = [{ evidenceId: "history", observedAt: "1996" }];
const history = resolveTemporalPairDetermination({ presenceEvidence: historical, jurisdictionEvidence: [parent], asOf: "2026-09-08" });
assert.equal(history.currentDeterminationStatus, "officially-eradicated");
assert.equal(history.compatibilityDisplayStatus, "verified-present");
assert.equal(history.historicalOccurrenceStatus, "recorded-present");
const expired = resolveTemporalPairDetermination({ presenceEvidence: historical, jurisdictionEvidence: [parent], asOf: "2027-06-10" });
assert.equal(expired.currentDeterminationStatus, "none");
assert.equal(expired.historicalOccurrenceStatus, "recorded-present");

async function main() {
  const fixture = mkdtempSync(path.join(tmpdir(), "isitusa-agent-jurisdiction-"));
  const originalFetch = globalThis.fetch;
  const put = (p: string, value: unknown) => { const full = path.join(fixture, p); mkdirSync(path.dirname(full), {recursive: true}); writeFileSync(full, JSON.stringify(value)); };
  try {
    for(const p of [...agentParentInputPaths(root), "src/data/research/county-equivalent-registry.json", "src/data/research/state-registry.json"]) {
      const target = path.join(fixture, p); mkdirSync(path.dirname(target), {recursive: true}); copyFileSync(path.join(root, p), target);
    }
    const context: SourceAdapterContext = { runId: "fixture-agent-jurisdiction", sourceId: review.declarationSourceId, stateCode: "CA", runStartedAt: new Date().toISOString(),
      requestedPairs: parent.jurisdiction.countyFips.map(countyFips => ({countyFips, countyName: countyFips, speciesId: "tilletia-indica", scientificName: "Tilletia indica"})),
      parameters: {mode: "retained-agent-reviewed-jurisdiction", stateCode: "CA", parentId: parent.id, parentSha256: sha256(stableJson(parent)), asOf: "2026-09-08", reviewActorId: "independent-child-fixture", candidatePairs: parent.jurisdiction.countyFips.map(f => f + ":tilletia-indica"), candidateLimit: 58} };
    const countyPath = (f: string) => "public/generated/research/CA/counties/" + f + ".json";
    const county = (f: string, evidence: unknown[] = []) => ({asOf: "2026-09-08", stateCode: "CA", countyFips: f, pairs: [{speciesId: "tilletia-indica", evidence}]});
    for(const f of parent.jurisdiction.countyFips) put(countyPath(f), county(f));
    globalThis.fetch = async () => { throw new Error("Offline method must not fetch"); };
    process.chdir(fixture);
    const result = await runAgentJurisdictionDetermination(context);
    assert.equal(result.assertions.length, 58); assert.equal(result.reviews.length, 58); assert.equal(result.outcomes.length, 58); assert.equal(result.upstreamRequests.length, 0);
    assert.ok(result.assertions.every(a => a.source_record_date === "2010-11-12" && a.retrieved_at === "2026-09-07T19:01:59.890Z" && a.survey_scope === null && a.parent_jurisdiction_evidence_id === parent.id));
    assert.ok(result.reviews.every(r => r.actor_type === "agent" && r.review_level === "agent-reviewed" && r.actor_id === "independent-child-fixture"));
    for (const mutate of [
      (c: SourceAdapterContext) => { c.requestedPairs.pop(); },
      (c: SourceAdapterContext) => { c.requestedPairs[0].scientificName = "Tilletia controversa"; },
      (c: SourceAdapterContext) => { c.parameters.reviewActorId = "MAIN"; },
      (c: SourceAdapterContext) => { c.parameters.reviewActorId = review.independentActorId; },
      (c: SourceAdapterContext) => { c.parameters.parentSha256 = "a".repeat(64); },
      (c: SourceAdapterContext) => { c.parameters.asOf = "2026-09-07"; },
      (c: SourceAdapterContext) => { c.runStartedAt = "2099-01-01T00:00:00Z"; },
    ]) { const c = structuredClone(context); mutate(c); await assert.rejects(() => runAgentJurisdictionDetermination(c)); rejected++; }
    const f = parent.jurisdiction.countyFips[0];
    for(const observedAt of ["2010", undefined]) {
      put(countyPath(f), county(f, [{assertion: "recorded-present", evidenceId: "contrary", observedAt}]));
      const conflict = await runAgentJurisdictionDetermination(context);
      assert.equal(conflict.assertions.length, 57); assert.equal(conflict.reviews.length, 57);
      assert.equal(conflict.outcomes[0].status, "blocked"); assert.equal(conflict.outcomes[0].scope_complete, false);
    }
    put(countyPath(f), county(f, [{assertion: "recorded-present", evidenceId: "old", observedAt: "1996"}]));
    assert.equal((await runAgentJurisdictionDetermination(context)).assertions.length, 58);
    put(countyPath(f), {...county(f), asOf: "2026-09-07"});
    await assert.rejects(() => runAgentJurisdictionDetermination(context)); rejected++;
    for(const mutate of [
      (r: JurisdictionEvidenceRecord) => { r.speciesId = "another-species"; },
      (r: JurisdictionEvidenceRecord) => { r.sourceDocuments[0].supportText = "This invented text says absent."; r.sourceDocuments[0].supportTextSha256 = sha256(r.sourceDocuments[0].supportText); },
      (r: JurisdictionEvidenceRecord) => { r.sourceDocuments[0].url = "https://example.test/forged-citation"; },
      (r: JurisdictionEvidenceRecord) => { r.jurisdiction.level = "county-set"; },
      (r: JurisdictionEvidenceRecord) => { r.review = {gate: "human-approved", status: "human-approved", actorId: "Ocean", reviewedAt: review.reviewedAt}; },
    ]) {
      const changed = structuredClone(parent); mutate(changed); put(AGENT_JURISDICTION_RECORDS_PATH, {schemaVersion: 1, updatedAt: "2026-09-08", records: [changed]});
      assert.throws(() => approvedAgentParentRecords(fixture)); rejected++;
    }
    console.log(JSON.stringify({passed: true, rejectedInvalidCases: rejected, exactCountyChildren: result.assertions.length, offline: true, truthfulAgentReview: true, historicalPresencePreserved: true, laterAndUndatedConflictsBlocked: true}, null, 2));
  } finally {
    process.chdir(root); globalThis.fetch = originalFetch;
    assert.equal(path.dirname(fixture), path.resolve(tmpdir())); assert.ok(path.basename(fixture).startsWith("isitusa-agent-jurisdiction-"));
    rmSync(fixture, {recursive: true, force: true});
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
