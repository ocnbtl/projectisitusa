import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { buildWqpFishResult as build, loadWqpFishMethod, wqpFishInputPaths, wqpFishPositiveRowValue,
  WQP_FISH_METHOD_PATH, WQP_FISH_TAXA } from "@/lib/research/wqp-fish-positive-review";
import { isCommittedSnapshotReplayReceipt } from "@/lib/research/validate-run";
import { sha256, stableJson } from "@/lib/research/run-files";
import { compileAdditiveResearchEvidence } from "@/lib/research/compile-evidence";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
const read=(p:string)=>readFileSync(p),json=(p:string)=>JSON.parse(read(p).toString());
const method=json(WQP_FISH_METHOD_PATH),methodReviewSha256=sha256(read(WQP_FISH_METHOD_PATH));
const planRoot="ops/national-research/plans/wqp-fish-measurements-20260908-r14/";
const states=readdirSync(planRoot).filter(p=>p.endsWith(".json")).map(p=>p.slice(0,2)).sort();
const make=(stateCode:string):SourceAdapterContext=>{
  const plan=json(planRoot+stateCode+".json"),pairs=plan.candidates.map((r:{countyFips:string;speciesId:string})=>r.countyFips+":"+r.speciesId).sort();
  return {runId:"wqp-fish-fixture-"+stateCode,sourceId:"water-quality-portal",stateCode,runStartedAt:"2026-09-08T23:59:00.000Z",
    parameters:{mode:"retained-fish-positive-measurement",stateCode,methodReviewSha256,candidatePairs:pairs,candidateLimit:pairs.length},
    requestedPairs:plan.candidates.map((r:{countyFips:string;speciesId:string})=>({...r,countyName:"Pinned registry",scientificName:WQP_FISH_TAXA[r.speciesId]}))};
};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error("Unexpected network access in retained fish replay.");};
let invalidCases=0,assertions=0,sourceRows=0,positiveRows=0,rejections=0;
try {
  const loaded=loadWqpFishMethod({methodReviewSha256},read);
  const replay={source_id:"water-quality-portal",adapter_id:"wqp-retained-field-counts",adapter_version:"2.0.0",parameters:{mode:"retained-fish-positive-measurement",methodReviewSha256}};
  assert(isCommittedSnapshotReplayReceipt(replay));
  for(const override of [{source_id:"other"},{adapter_id:"other"},{adapter_version:"1.0.0"},{adapter_version:"3.0.0"},{parameters:{mode:"retained-field-positive-count",methodReviewSha256}},{parameters:{mode:"retained-fish-positive-measurement",methodReviewSha256:"bad"}}]){assert(!isCommittedSnapshotReplayReceipt({...replay,...override}));invalidCases++;}
  for(const state of states) {
    const context=make(state),result=build(context,read),witnesses=JSON.parse(result.artifacts[0].contents.toString()).witnesses;
    assert.equal(result.assertions.length,context.requestedPairs.length);assert.equal(result.reviews.length,result.assertions.length);
    assertions+=result.assertions.length;sourceRows+=result.candidateRecordCount;rejections+=result.rejections.length;
    assert(result.assertions.every(a=>a.claim_type==="recorded-present"&&a.scope==="survey-area"&&a.source_record_date!<"2026-09-08"&&a.retrieved_at.startsWith("2026-09-08T12:")));
    assert(result.outcomes.every(o=>o.status==="evidence-found"&&o.scope_complete));assert.equal(result.upstreamRequests.length,0);
    for(const [name,records]of [["evidence-assertion",result.assertions],["review-event",result.reviews],["pair-outcome",result.outcomes],["rejection-record",result.rejections]]as const) {
      const schema=json("src/data/research/schemas/"+name+".schema.json");delete schema.allOf;const validate=z.fromJSONSchema(schema);for(const r of records)validate.parse(r);
    }
    const projected=compileAdditiveResearchEvidence({bootstrapEvidence:[],runAssertions:result.assertions,reviewEvents:result.reviews,sources:json("src/data/research/source-registry.json").sources,asOf:"2026-09-08"});
    assert.equal(projected.runEvidence.length,result.assertions.length);
    assert(projected.runEvidence.every(e=>e.caveat.includes("10.5066/P9QRKUVJ")&&e.caveat.includes("Data contributors:")&&!e.caveat.includes("ops/national-research/")));
    if(state==="OH")assert(result.assertions.find(a=>a.county_fips==="39043"&&a.species_id==="neogobius-melanostomus")!.caveats.some(s=>s.includes("7.5 km")&&s.includes("neither")));
    for(const witness of witnesses)for(const row of witness.sourceRows) {
      if(row.disposition==="positive") {positiveRows++;assert.equal(row.sourceFields.ResultValueTypeName,"Actual");assert(!row.sourceFields.SampleTissueAnatomyName);}
      if(witness.pairKey==="18129:hypophthalmichthys-molitrix"&&row.parsedRowIndexZeroBased===11)assert(row.disposition.startsWith("review-hold:"));
    }
    if(state==="IN")assert.equal(stableJson(build(context,read)),stableJson(result));
  }
  assert.equal(assertions,67);assert.equal(sourceRows,611);
  for(const r of loaded.reviews)for(const w of r.witnesses)assert.equal(wqpFishPositiveRowValue(w.resultFields,WQP_FISH_TAXA[w.pairKey.split(":")[1]],"2026-09-08").date,w.date);
  for(const mutate of [(c:SourceAdapterContext)=>{c.sourceId="other";},(c:SourceAdapterContext)=>{c.stateCode="NY";},(c:SourceAdapterContext)=>{c.parameters.candidateLimit=1;},(c:SourceAdapterContext)=>{c.parameters.methodReviewSha256="a".repeat(64);},(c:SourceAdapterContext)=>{c.requestedPairs[0].scientificName="Hypophthalmichthys sp.";},(c:SourceAdapterContext)=>{c.runStartedAt="2026-09-07T00:00:00.000Z";},(c:SourceAdapterContext)=>{c.parameters.mode="absent";},(c:SourceAdapterContext)=>{(c.parameters.candidatePairs as string[]).reverse();}]) {const c=make("IN");mutate(c);assert.throws(()=>build(c,read));invalidCases++;}
  const outside=make("IN"),r=outside.requestedPairs[0];r.countyFips="18001";outside.requestedPairs=[r];outside.parameters.candidatePairs=[r.countyFips+":"+r.speciesId];outside.parameters.candidateLimit=1;assert.throws(()=>build(outside,read));invalidCases++;
  for(const p of wqpFishInputPaths({methodReviewSha256},read).filter(p=>!p.endsWith(".ts"))){assert.throws(()=>build(make("IN"),q=>q===p?Buffer.from("changed pinned input"):read(q)));invalidCases++;}
  const valid=loaded.reviews[0].witnesses[0].resultFields,name=valid.SubjectTaxonomicName;
  for(const v of ["0","-1",""," ","NaN","Infinity","1e3","1x","+1"]){assert(wqpFishPositiveRowValue({...valid,ResultMeasureValue:v},name,"2026-09-08").reason);invalidCases++;}
  for(const override of [{ResultStatusIdentifier:"Provisional"},{ResultStatusIdentifier:"Accepted"},{ResultDetectionConditionText:"Not Detected"},{MeasureQualifierCode:"J"},{ResultValueTypeName:"Estimated"},{ResultValueTypeName:"Calculated"},{BiologicalIntentName:"Tissue"},{BiologicalIntentName:"Frequency Class"},{CharacteristicName:"Species diversity"},{"ResultMeasure/MeasureUnitCode":"ng/g"},{ActivityTypeCode:"Quality Control Sample-Lab Duplicate"},{LaboratoryName:"Lab"},{SampleTissueAnatomyName:"Whole body"},{ToxicityTestType:"Acute"},{UnidentifiedSpeciesIdentifier:"true"},{ActivityStartDate:"2021-02-29"},{ActivityStartDate:"2027-01-01"},{SubjectTaxonomicName:"Cyprinus carpio"},{ResultCommentText:"caged sentinel organisms"}] as Array<Record<string,string>>){assert(wqpFishPositiveRowValue({...valid,...override},name,"2026-09-08").reason);invalidCases++;}
  for(const [intent,characteristic,unit]of [["Individual","Length","mm"],["Individual","Length, Total (Fish)","cm"],["Individual","Weight","kg"],["Population Census","Total Sample Weight","g"],["Group Summary","Count","count"]])assert(wqpFishPositiveRowValue({...valid,BiologicalIntentName:intent,CharacteristicName:characteristic,"ResultMeasure/MeasureUnitCode":unit},name,"2026-09-08").date);
  const mutateMethod=(change:(m:typeof method)=>void)=>{const m=structuredClone(method);change(m);const bytes=Buffer.from(JSON.stringify(m)),context=make("IN");context.parameters.methodReviewSha256=sha256(bytes);assert.throws(()=>build(context,p=>p===WQP_FISH_METHOD_PATH?bytes:read(p)));invalidCases++;};
  mutateMethod(m=>m.approvedPairs.push("18001:hypophthalmichthys-molitrix"));
  mutateMethod(m=>m.repositoryBaseCommit="a".repeat(40));
  mutateMethod(m=>m.heldResultRows[0].rowSha256="a".repeat(64));
  const reviewPath=method.independentReviews[0].path,changedReview=json(reviewPath);changedReview.witnesses.find((w:{pairKey:string})=>w.pairKey.startsWith("18")).rawRecordSha256="a".repeat(64);
  const reviewBytes=Buffer.from(JSON.stringify(changedReview)),m=structuredClone(method);m.independentReviews[0]={path:reviewPath,bytes:reviewBytes.length,sha256:sha256(reviewBytes)};const methodBytes=Buffer.from(JSON.stringify(m)),context=make("IN");context.parameters.methodReviewSha256=sha256(methodBytes);assert.throws(()=>build(context,p=>p===WQP_FISH_METHOD_PATH?methodBytes:p===reviewPath?reviewBytes:read(p)));invalidCases++;
  console.log(JSON.stringify({passed:true,states:states.length,reviewedPairWitnesses:67,fixtureAssertions:assertions,sourceRows,positiveRows,rejectionGroups:rejections,invalidCasesRejected:invalidCases,networkRequests:0,actualNewDeterminations:0}));
} finally {globalThis.fetch=originalFetch;}
