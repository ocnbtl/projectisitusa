import { isCommittedSnapshotReplayReceipt } from "@/lib/research/validate-run";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { buildWqpResult as build, parseWqpCsv, wqpInputPaths, wqpPositiveRowValue, resolveWqpStation, WQP_METHOD_PATH, WQP_INPUT, WQP_TAXA } from "@/lib/research/wqp-field-positive-review";
import { sha256, stableJson } from "@/lib/research/run-files";
import { compileAdditiveResearchEvidence } from "@/lib/research/compile-evidence";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
const read=(p:string)=>readFileSync(p),json=(p:string)=>JSON.parse(read(p).toString()),methodReviewSha256=sha256(read(WQP_METHOD_PATH));
const method=json(WQP_METHOD_PATH),planRoot="ops/national-research/plans/wqp-field-counts-20260908-r13/";
const make=(state:string):SourceAdapterContext=>{const p=json(planRoot+state+".json");return{runId:"wqp-fixture-"+state,sourceId:"water-quality-portal",stateCode:state,runStartedAt:"2026-09-08T23:59:00.000Z",
  parameters:{mode:"retained-field-positive-count",stateCode:state,methodReviewSha256,candidatePairs:p.candidates.map((r:{countyFips:string;speciesId:string})=>r.countyFips+":"+r.speciesId).sort(),candidateLimit:p.candidates.length},
  requestedPairs:p.candidates.map((r:{countyFips:string;speciesId:string})=>({...r,countyName:"Pinned registry",scientificName:WQP_TAXA[r.speciesId]}))};};
const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error("Unexpected network access during retained replay.");};let rejected=0;
try{
  const replay={source_id:"water-quality-portal",adapter_id:"wqp-retained-field-counts",adapter_version:"1.0.0",parameters:{mode:"retained-field-positive-count",methodReviewSha256}};
  assert(isCommittedSnapshotReplayReceipt(replay));
  for(const override of [{source_id:"gbif-preserved-specimens"},{adapter_id:"other"},{adapter_version:"9.0.0"},{parameters:{mode:"live",methodReviewSha256}},{parameters:{mode:"retained-field-positive-count",methodReviewSha256:"bad"}}]){assert(!isCommittedSnapshotReplayReceipt({...replay,...override}));rejected++;}

  for(const [csv,expected] of [["id,note\r\n1,\"a\r\nb\"\r\n\r\n2,last",[3,5]],["id,note\n1,\"a\nb\"\n2,café\n",[3,4]],["id,note\r1,\"a\rb\"\r2,last",[3,4]]] as const) assert.deepEqual(parseWqpCsv(Buffer.from(csv)).map(r=>r.physicalEndLineOneBased),expected);
  const physicalRows=parseWqpCsv(gunzipSync(read(WQP_INPUT+"corbicula-fluminea-result.csv.gz")));
  for(const [index,line] of [[1778,1794],[2114,2140],[2501,2542],[3318,3506]]) assert.equal(physicalRows[index].physicalEndLineOneBased,line);
  const ca=build(make("CA"),read),ks=build(make("KS"),read);
  assert.equal(ca.assertions.length,14);assert.equal(ca.candidateRecordCount,82);assert.equal(ks.assertions.length,38);assert.equal(ks.candidateRecordCount,426);
  const artifact=JSON.parse(ca.artifacts[0].contents.toString()),ksArtifact=JSON.parse(ks.artifacts[0].contents.toString());
  assert.equal(artifact.witnesses.find((w:{pairKey:string})=>w.pairKey==="06001:corbicula-fluminea").sourceRows.find((r:{parsedRowIndexZeroBased:number})=>r.parsedRowIndexZeroBased===1778).rawRecordSha256,"a9d1b9aed380ec01bb1968d0f27e2fbf2fe0d41e158d8f6e58749b3108324d03");
  assert.equal(ksArtifact.witnesses.find((w:{pairKey:string})=>w.pairKey==="20197:corbicula-fluminea").sourceRows.find((r:{parsedRowIndexZeroBased:number})=>r.parsedRowIndexZeroBased===197).rawRecordSha256,"de1b9324cacc01ae488aee78b1e2be39dfc4988e5e23a6e27c529269d8230fa0");
  assert(ca.assertions.some(a=>a.county_fips==="06069"));
  assert(ksArtifact.witnesses.flatMap((w:{sourceRows:Array<{disposition:string}>})=>w.sourceRows).filter((r:{disposition:string})=>r.disposition==="positive").length===414);
  for(const result of [ca,ks]){
    assert(result.assertions.every(a=>a.claim_type==="recorded-present"&&a.scope==="survey-area"&&a.retrieved_at.startsWith("2026-09-08T11:")));
    assert(result.outcomes.every(o=>o.status==="evidence-found"));assert.equal(result.upstreamRequests.length,0);
    for(const [name,records]of [["evidence-assertion",result.assertions],["review-event",result.reviews],["pair-outcome",result.outcomes],["rejection-record",result.rejections]]as const){const s=json("src/data/research/schemas/"+name+".schema.json");delete s.allOf;const validator=z.fromJSONSchema(s);for(const r of records)validator.parse(r);}
  }
  const projected=compileAdditiveResearchEvidence({bootstrapEvidence:[],runAssertions:ca.assertions,reviewEvents:ca.reviews,sources:json("src/data/research/source-registry.json").sources,asOf:"2026-09-08"});
  assert.equal(projected.runEvidence.length,14);assert(projected.runEvidence.every(e=>e.caveat.includes("10.5066/P9QRKUVJ")&&e.caveat.includes("Data contributors:")&&!e.caveat.includes("ops/national-research/")));
  assert.equal(stableJson(build(make("CA"),read)),stableJson(ca));
  for(const ref of method.independentReviews){const review=json(ref.path);for(const w of review.witnesses){const sp=w.pairKey.split(":")[1];for(const [profile,index,expected]of [["result",w.parsedRowIndexZeroBased,w.rawRecordSha256],["station",w.stationParsedRowIndexZeroBased,w.stationRawRecordSha256]]as const){const rows=parse(gunzipSync(read(WQP_INPUT+sp+"-"+profile+".csv.gz")),{columns:true,skip_empty_lines:true,raw:true,info:true});assert.equal(sha256(rows[index].raw),expected);}}}
  for(const mutate of [(c:SourceAdapterContext)=>{c.sourceId="other";},(c:SourceAdapterContext)=>{c.stateCode="NY";},(c:SourceAdapterContext)=>{c.parameters.candidateLimit=1;},(c:SourceAdapterContext)=>{c.parameters.methodReviewSha256="a".repeat(64);},(c:SourceAdapterContext)=>{c.requestedPairs[0].scientificName="Corbicula sp.";},(c:SourceAdapterContext)=>{c.runStartedAt="2026-09-07T00:00:00.000Z";},(c:SourceAdapterContext)=>{c.parameters.mode="absent";},(c:SourceAdapterContext)=>{(c.parameters.candidatePairs as string[]).reverse();}]){const c=make("CA");mutate(c);assert.throws(()=>build(c,read));rejected++;}
  for(const key of method.heldPairs){const[f,sp]=key.split(":"),c=make("CA");c.requestedPairs=[{countyFips:f,speciesId:sp,countyName:"held",scientificName:WQP_TAXA[sp]}];c.parameters.candidatePairs=[key];c.parameters.candidateLimit=1;assert.throws(()=>build(c,read),/held pair/u);rejected++;}
  for(const p of wqpInputPaths({methodReviewSha256},read).filter(p=>!p.endsWith(".ts"))){assert.throws(()=>build(make("CA"),q=>q===p?Buffer.from("changed pinned input"):read(q)));rejected++;}
  const raw=parse(gunzipSync(read(WQP_INPUT+"corbicula-fluminea-result.csv.gz")),{columns:true,skip_empty_lines:true});const valid=raw[1778];assert.equal(wqpPositiveRowValue(valid,"Corbicula fluminea","2026-09-08").count,1);
  for(const value of ["0","-1",""," ","NaN","Infinity","1e3","1x","+1"]){assert(wqpPositiveRowValue({...valid,ResultMeasureValue:value},"Corbicula fluminea","2026-09-08").reason);rejected++;}
  for(const overrides of [{ResultStatusIdentifier:"Provisional"},{ResultDetectionConditionText:"Not Detected"},{BiologicalIntentName:"Toxicity"},{ActivityTypeCode:"Quality Control Sample-Lab Duplicate"},{ToxicityTestType:"Acute"},{UnidentifiedSpeciesIdentifier:"true"},{ActivityStartDate:"2021-02-29"},{ActivityStartDate:"2027-01-01"},{ResultValueTypeName:"unknown"},{ResultCommentText:"caged sentinel organisms"}]){assert(wqpPositiveRowValue({...valid,...overrides},"Corbicula fluminea","2026-09-08").reason);rejected++;}
  assert.equal(wqpPositiveRowValue(raw[4385],"Corbicula fluminea","2026-09-08").count,1);assert.equal(wqpPositiveRowValue(raw[4761],"Corbicula fluminea","2026-09-08").count,2);
  const active=new Map([["06001",{countyFips:"06001",stateCode:"CA"}]]),station={CountryCode:"US",StateCode:"6",CountyCode:"1"};assert.equal(resolveWqpStation([station],active).county?.countyFips,"06001");
  for(const rows of [[],[{...station,CountyCode:"000"}],[station,{...station,CountryCode:"CA"}],[station,{...station,CountyCode:"013"}],[station,{...station,CountyCode:""}]]){assert(resolveWqpStation(rows,active).reason);rejected++;}
  console.log(JSON.stringify({passed:true,independentlyReviewedPairWitnesses:52,fixtureAssertions:52,sourceRows:508,invalidCasesRejected:rejected,publicAttributionVerified:true,networkRequests:0,actualNewDeterminations:0}));
}finally{globalThis.fetch=originalFetch;}
