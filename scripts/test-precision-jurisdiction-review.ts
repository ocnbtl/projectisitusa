import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { sha256, stableJson } from "@/lib/research/run-files";
import { resolveTemporalPairDetermination, validateJurisdictionEvidenceRegistry } from "@/lib/research/jurisdiction-evidence";
import { JURISDICTION_PRECISION_REVIEW_VERSION, jurisdictionDeclarationRecordDate, jurisdictionAgentAdapterVersion, jurisdictionTemporalScope, verifyIndependentJurisdictionReview } from "@/lib/research/jurisdiction-agent-review";
import { approvedAgentParentRecords, agentParentInputPaths, AGENT_JURISDICTION_RECORDS_PATH } from "./research/agent-jurisdiction-records";
import { agentJurisdictionAdapter, runAgentJurisdictionDetermination } from "./research/adapters/official-jurisdiction-agent-reviewed";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import type { JurisdictionEvidenceRecord } from "@/lib/research/types";

const root = process.cwd();
const read = (p: string) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
const countyRegistry = read("src/data/research/county-equivalent-registry.json");
const stateRegistry = read("src/data/research/state-registry.json");
const schema = z.fromJSONSchema(read("src/data/research/schemas/jurisdiction-evidence-registry.schema.json"));
const allParents = approvedAgentParentRecords(root);
const parents = allParents.filter(r => r.review.gate === "agent-reviewed" && r.review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION);
assert.deepEqual(parents.map(r => r.jurisdiction.stateCode).sort(), ["AL", "TN", "TX"]);
assert.equal(parents.reduce((n,r) => n + r.jurisdiction.countyFips.length, 0), 416);
assert.equal(allParents.some(r => r.jurisdiction.stateCode === "NM"), false, "Unadjudicated NPPO presence must not be admitted.");
assert.equal(jurisdictionAgentAdapterVersion(allParents[0]), "1.0.0");
assert.equal(jurisdictionDeclarationRecordDate(allParents[0]), "2010-11-12");
let rejected = 0, fixtureChildren = 0, conflictCases = 0;
const validate = (record: JurisdictionEvidenceRecord) => {
  const registry = {schemaVersion: 1 as const, updatedAt: "2026-09-08", records: [record]};
  schema.parse(registry); validateJurisdictionEvidenceRegistry({registry, countyRegistry, stateRegistry});
};
function rejects(parent: JurisdictionEvidenceRecord, mutate: (r: JurisdictionEvidenceRecord) => void) {
  const changed = structuredClone(parent); mutate(changed); assert.throws(() => validate(changed)); rejected++;
}
for(const parent of parents) {
  validate(parent);
  assert.equal(jurisdictionDeclarationRecordDate(parent), null);
  assert.equal(jurisdictionAgentAdapterVersion(parent), "1.1.0");
  assert.match(jurisdictionTemporalScope(parent), /declaration date unknown/);
  assert.match(jurisdictionTemporalScope(parent), /not a demonstrated statement-specific reaffirmation/);
  assert.doesNotMatch(jurisdictionTemporalScope(parent), /Official declaration dated/);
  rejects(parent, r => { r.sourceDocuments[0].publishedAt = "2012-01-01"; });
  rejects(parent, r => { r.sourceDocuments[0].modifiedAt = "2024-12-10"; });
  rejects(parent, r => { delete r.sourceDocuments[0].informationYear; });
  rejects(parent, r => { r.sourceDocuments[0].informationYear = 2099; });
  rejects(parent, r => { r.effectiveAt = "2026-09-07"; });
  rejects(parent, r => { r.reaffirmedAt = "2026-09-07"; });
  rejects(parent, r => { r.validThrough = "2027-09-07"; });
  rejects(parent, r => { r.conflictCheckFrom = "2026-01-01"; });
  rejects(parent, r => { r.jurisdiction.countyFips.pop(); r.jurisdiction.countyFipsSha256 = sha256(JSON.stringify(r.jurisdiction.countyFips)); });
  rejects(parent, r => { r.sourceDocuments[0].supportText = "No quarantine applies."; r.sourceDocuments[0].supportTextSha256 = sha256(r.sourceDocuments[0].supportText); });
  rejects(parent, r => { if(r.review.gate === "agent-reviewed" && r.review.methodVersion === JURISDICTION_PRECISION_REVIEW_VERSION) r.review.presenceConflictPolicy = r.review.presenceConflictPolicy === "all-presence" ? "from-conservative-boundary" : "all-presence"; });
  if(parent.review.gate !== "agent-reviewed") throw Error("Missing review");
  const originalReview = read(parent.review.independentReview.path);
  for(const mutation of [
    (r: typeof originalReview) => { r.admissionRecommendation = "needs-revision-before-method-admission"; },
    (r: typeof originalReview) => { r.sourceConflictDisposition = "unresolved-undated-nppo-presence"; },
    (r: typeof originalReview) => { r.supportedStatementType = parent.statementType === "officially-absent" ? "officially-eradicated" : "officially-absent"; },
    (r: typeof originalReview) => { r.presenceConflictPolicy = "ignore-historical-records"; },
  ]) {
    const receipt = structuredClone(originalReview); mutation(receipt); const bytes = Buffer.from(JSON.stringify(receipt));
    const changed = structuredClone(parent); if(changed.review.gate === "agent-reviewed") changed.review.independentReview.sha256 = sha256(bytes);
    assert.throws(() => verifyIndependentJurisdictionReview(changed, bytes)); rejected++;
  }
  for(const [asOf, expected] of [["2026-06-08","none"], ["2026-06-09","none"], ["2026-09-07","none"], ["2026-09-08",parent.statementType], ["2027-06-09",parent.statementType], ["2027-06-10","none"]]) {
    assert.equal(resolveTemporalPairDetermination({presenceEvidence: [], jurisdictionEvidence: [parent], asOf}).currentDeterminationStatus, expected);
  }
}

async function main() {
  const fixture = mkdtempSync(path.join(tmpdir(), "isitusa-precision-jurisdiction-"));
  const originalFetch = globalThis.fetch;
  const put = (p: string, value: unknown) => { const full = path.join(fixture,p); mkdirSync(path.dirname(full),{recursive:true}); writeFileSync(full,JSON.stringify(value)); };
  try {
    for(const p of [...agentParentInputPaths(root), "src/data/research/county-equivalent-registry.json", "src/data/research/state-registry.json"]) {
      const target = path.join(fixture,p); mkdirSync(path.dirname(target),{recursive:true}); copyFileSync(path.join(root,p),target);
    }
    globalThis.fetch = async () => { throw Error("Offline method must not fetch"); };
    process.chdir(fixture);
    assert.equal(agentJurisdictionAdapter("eppo-karnal-bunt-state-status").adapterVersion,"1.1.0");
    assert.equal(agentJurisdictionAdapter("nappo-karnal-bunt-eradication-2010").adapterVersion,"1.0.0");
    for(const parent of parents) {
      if(parent.review.gate !== "agent-reviewed") throw Error("Missing review");
      const state = parent.jurisdiction.stateCode!;
      const countyPath = (f: string) => "public/generated/research/"+state+"/counties/"+f+".json";
      const county = (f: string, evidence: unknown[] = []) => ({asOf:"2026-09-08",stateCode:state,countyFips:f,pairs:[{speciesId:"tilletia-indica",evidence}]});
      for(const f of parent.jurisdiction.countyFips) put(countyPath(f),county(f));
      const context: SourceAdapterContext = {runId:"fixture-precision-"+state,sourceId:parent.review.declarationSourceId,stateCode:state,runStartedAt:new Date().toISOString(),
        requestedPairs:parent.jurisdiction.countyFips.map(countyFips=>({countyFips,countyName:countyFips,speciesId:"tilletia-indica",scientificName:"Tilletia indica"})),
        parameters:{mode:"retained-agent-reviewed-jurisdiction",stateCode:state,parentId:parent.id,parentSha256:sha256(stableJson(parent)),asOf:"2026-09-08",reviewActorId:"independent-fixture-child",candidatePairs:parent.jurisdiction.countyFips.map(f=>f+":tilletia-indica"),candidateLimit:parent.jurisdiction.countyFips.length}};
      const result = await runAgentJurisdictionDetermination(context);
      fixtureChildren += result.assertions.length;
      assert.equal(result.assertions.length,parent.jurisdiction.countyFips.length);
      assert.equal(result.upstreamRequests.length,0);
      assert.ok(JSON.parse(JSON.stringify(result.assertions)).every((a: {source_record_date:unknown})=>a.source_record_date===null));
      assert.ok(result.assertions.every(a=>a.actor_id==="official-jurisdiction-agent-reviewed@1.1.0" && a.survey_scope===null && a.parent_jurisdiction_evidence_id===parent.id && a.retrieved_at<"2026-09-09"));
      const f = parent.jurisdiction.countyFips[0];
      for(const observedAt of ["1998", "1999-01-01", "2010", "2009/2011", "bad-date", undefined]) {
        put(countyPath(f),county(f,[{assertion:"recorded-present",evidenceId:"credible-record",observedAt}]));
        const conflict = await runAgentJurisdictionDetermination(context);
        const expectedConflict = state!=="TX" || observedAt===undefined || ["2010","2009/2011","bad-date"].includes(observedAt);
        assert.equal(conflict.outcomes[0].status,expectedConflict?"blocked":"evidence-found");
        assert.equal(conflict.assertions.length,parent.jurisdiction.countyFips.length-(expectedConflict?1:0));
        conflictCases++;
      }
      put(countyPath(f),county(f));
      for(const mutate of [
        (c: SourceAdapterContext)=>{c.parameters.asOf="2026-09-07";},
        (c: SourceAdapterContext)=>{c.parameters.asOf="2027-06-10";},
        (c: SourceAdapterContext)=>{c.requestedPairs[0].scientificName="Tilletia walkeri";},
        (c: SourceAdapterContext)=>{c.parameters.reviewActorId=parent.review.actorId;},
      ]) {const changed=structuredClone(context);mutate(changed);await assert.rejects(()=>runAgentJurisdictionDetermination(changed));rejected++;}
      put(countyPath(f),{...county(f),asOf:"2026-09-07"});
      await assert.rejects(()=>runAgentJurisdictionDetermination(context));rejected++;
    }
    for(const mutate of [
      (r:JurisdictionEvidenceRecord)=>{if(r.review.gate==="agent-reviewed" && r.review.methodVersion===JURISDICTION_PRECISION_REVIEW_VERSION){r.review.declarationInformationYear=2011;r.sourceDocuments[0].informationYear=2011;}},
      (r:JurisdictionEvidenceRecord)=>{r.sourceDocuments[0].url="https://example.test/forged-state";},
    ]) {const changed=structuredClone(parents[0]);mutate(changed);put(AGENT_JURISDICTION_RECORDS_PATH,{schemaVersion:1,updatedAt:"2026-09-08",records:[changed]});assert.throws(()=>approvedAgentParentRecords(fixture));rejected++;}
    put(AGENT_JURISDICTION_RECORDS_PATH,read(AGENT_JURISDICTION_RECORDS_PATH));
    const contextual="ops/national-research/inputs/karnal-bunt-state-status-20260908-r9/eppo-misidentification-report-2000.html.gz";
    writeFileSync(path.join(fixture,contextual),Buffer.from("tampered contextual source"));
    assert.throws(()=>approvedAgentParentRecords(fixture));rejected++;
    assert.equal(fixtureChildren,416);
    console.log(JSON.stringify({passed:true,rejectedInvalidCases:rejected,fixtureCountyChildren:fixtureChildren,conflictCases,offline:true,unknownSourceDatesPreserved:true,dissentBlocked:true,invalidRecordHistoryRequiresAdjudication:true,realDeterminationsCreated:0},null,2));
  } finally {
    process.chdir(root);globalThis.fetch=originalFetch;
    assert.equal(path.dirname(fixture),path.resolve(tmpdir()));assert.ok(path.basename(fixture).startsWith("isitusa-precision-jurisdiction-"));
    rmSync(fixture,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
