import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { z } from "zod";
import { buildWqpReviewedFishResult as build, loadWqpReviewedFishMethod as load,
  wqpReviewedFishInputPaths as inputs } from "@/lib/research/wqp-reviewed-fish";
import { isCommittedSnapshotReplayReceipt } from "@/lib/research/validate-run";
import { sha256, stableJson } from "@/lib/research/run-files";
import { compileAdditiveResearchEvidence } from "@/lib/research/compile-evidence";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";

const read=(p:string)=>readFileSync(p), json=(p:string)=>JSON.parse(read(p).toString());
const methodPath="src/data/research/source-method-reviews/wqp-reviewed-fish-common-carp-20260908-r15.json";
const method=json(methodPath), methodHash=sha256(read(methodPath));
const plan={methodReviewPath:methodPath,methodReviewSha256:methodHash};
const make=(stateCode:string):SourceAdapterContext=>{
  const group=method.groups.find((g:{stateCode:string})=>g.stateCode===stateCode);
  const pairs=json(group.review.path).witnesses.map((w:{pairKey:string})=>w.pairKey).sort();
  return {runId:"wqp-reviewed-fish-fixture-"+stateCode,sourceId:"water-quality-portal",stateCode,
    runStartedAt:"2026-09-08T23:59:00.000Z",
    parameters:{mode:"retained-reviewed-fish-measurement",stateCode,...plan,candidatePairs:pairs,candidateLimit:pairs.length},
    requestedPairs:pairs.map((p:string)=>{const [countyFips,speciesId]=p.split(":");
      return {countyFips,speciesId,countyName:"Pinned registry",scientificName:method.taxa[speciesId]};})};
};
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw Error("Retained source replay attempted network access.");};
let assertions=0,sourceRows=0,positiveRows=0,rejections=0,heldRows=0;
const invalidCases:string[]=[];
function reject(name:string,action:()=>unknown) {assert.throws(action,name);invalidCases.push(name);}
function mutated(name:string,change:(m:typeof method,overrides:Map<string,Buffer>)=>void) {
  const m=structuredClone(method), overrides=new Map<string,Buffer>();change(m,overrides);
  const bytes=Buffer.from(JSON.stringify(m)),context=make("IN");
  context.parameters.methodReviewSha256=sha256(bytes);overrides.set(methodPath,bytes);
  reject(name,()=>build(context,p=>overrides.get(p)??read(p)));
}
function changeReview(m:typeof method, overrides:Map<string,Buffer>, change:(r:any)=>void,index=0) {
  const ref=m.groups[index].review,r=json(ref.path);change(r);
  const bytes=Buffer.from(JSON.stringify(r));overrides.set(ref.path,bytes);
  Object.assign(ref,{bytes:bytes.length,sha256:sha256(bytes)});
}
try {
  const loaded=load(plan,read);
  assert.equal(loaded.method.approvedPairs.length,152);assert.equal(loaded.method.heldPairs.length,8);
  const replay={source_id:"water-quality-portal",adapter_id:"wqp-retained-field-counts",adapter_version:"3.0.0",
    parameters:{mode:"retained-reviewed-fish-measurement",...plan}};
  assert(isCommittedSnapshotReplayReceipt(replay));
  for(const override of [{source_id:"other"},{adapter_id:"other"},{adapter_version:"2.0.0"},
    {parameters:{...replay.parameters,methodReviewPath:"../outside.json"}},
    {parameters:{...replay.parameters,methodReviewSha256:"bad"}},
    {parameters:{...replay.parameters,mode:"retained-fish-positive-measurement"}}]) {
    assert(!isCommittedSnapshotReplayReceipt({...replay,...override}));invalidCases.push("invalid replay receipt "+invalidCases.length);
  }
  for(const state of ["IN","OK"]) {
    const context=make(state),result=build(context,read),artifact=JSON.parse(result.artifacts[0].contents.toString());
    assert.equal(result.assertions.length,state==="IN"?87:65);
    assert.equal(result.reviews.length,result.assertions.length);
    assert.equal(result.upstreamRequests.length,0);assert.equal(result.errors.length,0);
    assert(result.assertions.every(a=>a.claim_type==="recorded-present"&&a.scope==="survey-area"&&
      a.source_record_date!<"2026-09-08"&&!method.heldPairs.includes(a.county_fips+":"+a.species_id)));
    assert(result.outcomes.every(o=>o.status==="evidence-found"&&o.scope_complete));
    for(const [name,records]of [["evidence-assertion",result.assertions],["review-event",result.reviews],
      ["pair-outcome",result.outcomes],["rejection-record",result.rejections]]as const) {
      const schema=json("src/data/research/schemas/"+name+".schema.json");delete schema.allOf;
      const validate=z.fromJSONSchema(schema);for(const record of records)validate.parse(record);
    }
    const projected=compileAdditiveResearchEvidence({bootstrapEvidence:[],runAssertions:result.assertions,
      reviewEvents:result.reviews,sources:json("src/data/research/source-registry.json").sources,asOf:"2026-09-08"});
    assert.equal(projected.runEvidence.length,result.assertions.length);
    assert(projected.runEvidence.every(e=>e.caveat.includes("Data contributors:")&&e.caveat.includes("10.5066/P9QRKUVJ")));
    if(state==="OK")assert(result.assertions.find(a=>a.county_fips==="40089")!.caveats.some(c=>c.includes("126")));
    for(const witness of artifact.witnesses)for(const row of witness.sourceRows) {
      if(row.disposition==="positive") {
        positiveRows++;assert.equal(row.sourceFields.ResultStatusIdentifier,"Final");
        assert.equal(row.sourceFields.ResultValueTypeName,"Actual");assert(!row.sourceFields.SampleTissueAnatomyName);
      }
      if(row.disposition.startsWith("review-hold:")) {
        heldRows++;assert(witness.pairKey==="18073:cyprinus-carpio");
        assert([1610,1634].includes(row.parsedRowIndexZeroBased));
      }
    }
    assertions+=result.assertions.length;sourceRows+=result.candidateRecordCount;rejections+=result.rejections.length;
    assert.equal(stableJson(build(context,read)),stableJson(result),"byte-stable fixture replay "+state);
  }
  assert.equal(assertions,152);assert.equal(heldRows,2);
  for(const [name,change]of [
    ["source",(c:SourceAdapterContext)=>{c.sourceId="other";}],
    ["state",(c:SourceAdapterContext)=>{c.stateCode="NY";}],
    ["limit",(c:SourceAdapterContext)=>{c.parameters.candidateLimit=1;}],
    ["method hash",(c:SourceAdapterContext)=>{c.parameters.methodReviewSha256="a".repeat(64);}],
    ["method path",(c:SourceAdapterContext)=>{c.parameters.methodReviewPath="../method.json";}],
    ["taxon",(c:SourceAdapterContext)=>{c.requestedPairs[0].scientificName="Cyprinus sp.";}],
    ["chronology",(c:SourceAdapterContext)=>{c.runStartedAt="2026-09-07T00:00:00.000Z";}],
    ["negative mode",(c:SourceAdapterContext)=>{c.parameters.mode="absent";}],
    ["pair order",(c:SourceAdapterContext)=>{(c.parameters.candidatePairs as string[]).reverse();}],
    ["duplicate pair",(c:SourceAdapterContext)=>{c.requestedPairs.push(c.requestedPairs[0]);}],
    ["cross-method parameter",(c:SourceAdapterContext)=>{c.parameters.wqpFishPositive={};}]
  ]as const) {const c=make("IN");change(c);reject(name,()=>build(c,read));}
  const held=make("OK");held.requestedPairs=[{...held.requestedPairs[0],countyFips:"40005"}];
  held.parameters.candidatePairs=["40005:cyprinus-carpio"];held.parameters.candidateLimit=1;
  reject("provisional-only pair",()=>build(held,read));
  const wrongCounty=make("IN");wrongCounty.requestedPairs[0].countyFips="99999";
  wrongCounty.parameters.candidatePairs=wrongCounty.requestedPairs.map(r=>r.countyFips+":"+r.speciesId).sort();
  reject("unregistered county",()=>build(wrongCounty,read));
  for(const p of inputs(plan,read).filter(p=>!p.endsWith(".ts"))) {
    reject("changed pinned input "+p,()=>build(make("IN"),q=>q===p?Buffer.from("changed"):read(q)));
  }
  mutated("unreviewed scope",m=>m.approvedPairs.push("18001:cyprinus-carpio"));
  mutated("acquisition lineage",m=>{m.acquisitions[0].repositoryBaseCommit="a".repeat(40);});
  mutated("duplicate acquisition",m=>m.acquisitions.push(m.acquisitions[0]));
  mutated("duplicate group",m=>m.groups.push(m.groups[0]));
  mutated("wrong profile encoding",m=>{m.groups[0].result.encoding="gzip";});
  mutated("wrong decoded profile",m=>{m.groups[0].result.decodedSha256="a".repeat(64);});
  mutated("wrong profile count",m=>{m.groups[0].result.rowCount++;});
  mutated("wrong profile taxon",m=>{m.taxa["cyprinus-carpio"]="Cyprinus sp.";});
  mutated("held row changed",m=>{m.heldResultRows[0].rowSha256="a".repeat(64);});
  mutated("held profile missing",m=>{m.heldResultRows[0].resultProfilePath="missing.zip";});
  mutated("review predates source",(m,o)=>changeReview(m,o,r=>{r.recordedAt="2026-09-07T00:00:00.000Z";}));
  mutated("reviewer is MAIN",(m,o)=>changeReview(m,o,r=>{r.actorId="MAIN";}));
  mutated("reviewers are same actor",(m,o)=>changeReview(m,o,r=>{r.actorId=json(m.groups[1].review.path).actorId;}));
  for(const field of ["rawRecordSha256","stationRawRecordSha256","date","physicalEndLineOneBased","stationPhysicalEndLineOneBased"]) {
    mutated("review witness "+field,(m,o)=>changeReview(m,o,r=>{
      r.witnesses[0][field]=field.endsWith("Sha256")?"a".repeat(64):field==="date"?"2000-01-01":1;
    }));
  }
  mutated("review raw field",(m,o)=>changeReview(m,o,r=>{r.witnesses[0].resultFields.ResultMeasureValue="999999";}));
  mutated("review county field",(m,o)=>changeReview(m,o,r=>{r.witnesses[0].stationFields.CountyCode="999";}));
  mutated("review receipt",(m,o)=>changeReview(m,o,r=>{r.acquisitionReceiptSha256="a".repeat(64);}));
  mutated("review archive missing",(m,o)=>changeReview(m,o,r=>{r.inputArchives=[];}));
  mutated("duplicate archive entry",(m,o)=>{
    const ref=m.acquisitions[0].archive,bundle=JSON.parse(gunzipSync(read(ref.path)).toString());
    bundle.files.push(bundle.files[0]);const bytes=gzipSync(Buffer.from(JSON.stringify(bundle)));
    o.set(ref.path,bytes);Object.assign(ref,{bytes:bytes.length,sha256:sha256(bytes)});
  });
  console.log(JSON.stringify({passed:true,states:2,fixtureAssertions:assertions,sourceRows,positiveRows,
    heldRows,rejectionGroups:rejections,invalidCasesRejected:invalidCases.length,invalidCases,
    networkRequests:0,actualNewDeterminations:0}));
} finally {globalThis.fetch=originalFetch;}
