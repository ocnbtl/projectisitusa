import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { sha256, stableJson } from "./run-files";
import type { SourceAdapterContext, SourceAdapterResult } from "./source-adapter";

export const WQP_SOURCE = "water-quality-portal";
export const WQP_ADAPTER = "wqp-retained-field-counts";
export const WQP_VERSION = "1.0.0";
export const WQP_METHOD = "retained-wqp-field-count-station-join-v1";
export const WQP_METHOD_PATH = "src/data/research/source-method-reviews/wqp-field-counts-v1.json";
export const WQP_INPUT = "ops/national-research/inputs/wqp-positive-review-20260908-r13/";
export const WQP_TAXA: Record<string, string> = {"corbicula-fluminea":"Corbicula fluminea", "dreissena-polymorpha":"Dreissena polymorpha"};
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const safePath = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]+$/u).refine(p => !p.split("/").includes("..") && !p.includes("//"));
const file = z.object({path:safePath, bytes:z.number().int().positive().max(20_000_000), sha256:hash}).strict();
const pair = z.string().regex(/^[0-9]{5}:(?:corbicula-fluminea|dreissena-polymorpha)$/u);
export const wqpParametersSchema = z.object({mode:z.literal("retained-field-positive-count"), stateCode:z.string().regex(/^[A-Z]{2}$/u),
  methodReviewSha256:hash, candidatePairs:z.array(pair).min(1).max(5000), candidateLimit:z.number().int().positive().max(5000)}).strict();
export type WqpPlan = Pick<z.infer<typeof wqpParametersSchema>, "methodReviewSha256">;
type Read = (p:string) => Buffer;
type Row = Record<string,string>;
type CsvEntry = {record:Row; raw:string; info:{lines:number}};
const methodSchema = z.object({schemaVersion:z.literal(1), methodVersion:z.literal(WQP_METHOD), sourceId:z.literal(WQP_SOURCE),
  status:z.literal("approved-with-specific-holds"), reviewedBy:z.literal("MAIN"), reviewedAt:z.string().datetime(),
  acquisitionReceipt:file, acquisitionProvenance:file, context:z.array(file).min(1), independentReviews:z.array(file).length(2),
  heldPairs:z.array(pair), heldResultRows:z.array(z.object({speciesId:z.enum(["corbicula-fluminea","dreissena-polymorpha"]),
    parsedRowIndexZeroBased:z.number().int().nonnegative(), rowSha256:hash, reason:z.string().min(1)}).strict()),
  rationale:z.string().min(1), attribution:z.string().min(1), limitations:z.array(z.string().min(1)).min(1)}).strict();
function assert(v:unknown, msg:string):asserts v {if(!v) throw Error(msg);}
function pinned(ref:z.infer<typeof file>, read:Read) {const b=read(ref.path);assert(b.length===ref.bytes&&sha256(b)===ref.sha256,"WQP pinned input drift: "+ref.path);return b;}
export function loadWqpMethod(plan:WqpPlan, read:Read) {
  const b=read(WQP_METHOD_PATH);assert(sha256(b)===hash.parse(plan.methodReviewSha256),"WQP method review hash differs.");
  const method=methodSchema.parse(JSON.parse(b.toString("utf8")));
  assert(method.acquisitionReceipt.path===WQP_INPUT+"retrieval-receipt.json"&&method.acquisitionProvenance.path===WQP_INPUT+"acquisition-provenance.json","WQP acquisition path differs.");
  for(const ref of method.context) pinned(ref,read);
  const provenance=JSON.parse(pinned(method.acquisitionProvenance,read).toString("utf8"));
  const recipeStored=pinned(file.parse({path:provenance.recipe.path,bytes:provenance.recipe.bytes,sha256:provenance.recipe.sha256}),read);
  const recipe=gunzipSync(recipeStored,{maxOutputLength:20_000_000});
  assert(recipe.length===provenance.recipe.decodedBytes&&sha256(recipe)===provenance.recipe.decodedSha256,"WQP executed recipe differs.");
  const acquisition=JSON.parse(pinned(method.acquisitionReceipt,read).toString("utf8"));
  assert(acquisition.kind==="wqp-positive-preflight-context-acquisition"&&acquisition.successfulGets===6&&acquisition.providerWrites===0
    &&acquisition.codeCommit===provenance.repositoryBaseCommit,"WQP preflight acquisition lineage differs.");
  for(const ref of acquisition.receipts) {const stored=pinned(file.parse({path:ref.path,bytes:ref.bytes,sha256:ref.sha256}),read),decoded=gunzipSync(stored,{maxOutputLength:20_000_000});
    assert(decoded.length===ref.decodedBytes&&sha256(decoded)===ref.decodedSha256&&ref.status===200
      &&Date.parse(ref.retrievedAt)<=Date.parse(method.reviewedAt),"WQP source bytes or chronology differ.");}
  const reviews=method.independentReviews.map(ref=>JSON.parse(pinned(ref,read).toString("utf8")));
  assert(new Set(reviews.map(r=>r.actorId)).size===2&&reviews.every(r=>r.kind==="independent-wqp-field-source-review"&&r.recordedBy==="MAIN"&&r.actorId!=="MAIN"
    &&r.acquisitionReceiptSha256===method.acquisitionReceipt.sha256&&Date.parse(r.recordedAt)<=Date.parse(method.reviewedAt)),"WQP independent source review identity differs.");
  return {method,acquisition,provenance};
}
export function wqpInputPaths(plan:WqpPlan, read:Read) {const {method,acquisition,provenance}=loadWqpMethod(plan,read);return [...new Set<string>([
  "src/lib/research/wqp-field-positive-review.ts","scripts/research/adapters/wqp-retained-field-counts.ts",WQP_METHOD_PATH,
  method.acquisitionReceipt.path,method.acquisitionProvenance.path,provenance.recipe.path,...acquisition.receipts.map((r:{path:string})=>r.path),
  ...method.context.map(r=>r.path),...method.independentReviews.map(r=>r.path)])].sort();}
export function wqpPositiveRowValue(r:Row, name:string, asOf:string) {
  if(r.SubjectTaxonomicName!==name||r.UnidentifiedSpeciesIdentifier) return {reason:"nonexact-taxon"} as const;
  if(r.ActivityMediaName!=="Biological"||r.CharacteristicName!=="Count"||r["ResultMeasure/MeasureUnitCode"]!=="count")return {reason:"outside-positive-count-method"}as const;
  if(r.ResultDetectionConditionText||r.MeasureQualifierCode||!["Final","Accepted"].includes(r.ResultStatusIdentifier))return {reason:"unapproved-result-status-or-qualifier"}as const;
  const v=r.ResultMeasureValue;if(!/^\d+(?:\.\d+)?$/u.test(v??"")||!Number.isFinite(Number(v))||Number(v)<=0)return {reason:"no-positive-finite-count"}as const;
  if(!["Actual","Estimated","Calculated"].includes(r.ResultValueTypeName))return {reason:"unknown-value-type"}as const;
  if(!["Population Census","Species Density"].includes(r.BiologicalIntentName)||r.ToxicityTestType||r.SampleTissueAnatomyName
    ||!["Sample-Routine","Sample-Composite Without Parents","Field Msr/Obs","Field Msr/Obs-Habitat Assessment"].includes(r.ActivityTypeCode))return {reason:"nonfield-or-unreviewed-biological-context"}as const;
  if(r.OrganizationIdentifier === "NARS_WQX" && /:ZOO:ZOFN$/u.test(r.ActivityIdentifier ?? "")) return {reason:"unreviewed-nars-fine-zooplankton-count-context"} as const;
  const context=Object.entries(r).filter(([k])=>/CommentText|MethodDescriptionText|MethodName$/u.test(k)).map(([,v])=>v).join(" ");
  if(/\b(?:toxicity|toxicological|hatchery|transplant(?:ed)?|sentinel|caged|mesocosm|aquarium|cultured organisms|stocked organisms)\b/iu.test(context))return {reason:"potential-introduced-test-organism-context"}as const;
  const date=r.ActivityStartDate,ms=Date.parse(date+"T00:00:00.000Z");
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(date??"")||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date||date>asOf
    ||!r.OrganizationIdentifier||!r.OrganizationFormalName||!r.ActivityIdentifier||!r.MonitoringLocationIdentifier)return {reason:"invalid-date-or-source-identity"}as const;
  return {date,count:Number(v)};
}
export function resolveWqpStation(rows:Row[], active:Map<string,{countyFips:string;stateCode:string}>) {
  if(!rows.length)return {reason:"missing-station"}as const;
  const fips=rows.map(r=>r.CountryCode==="US"&&/^\d{1,2}$/u.test(r.StateCode??"")&&/^\d{1,3}$/u.test(r.CountyCode??"")?r.StateCode.padStart(2,"0")+r.CountyCode.padStart(3,"0"):null);
  if(fips.some(f=>!f)||new Set(fips).size!==1)return {reason:"ambiguous-or-invalid-station-county"}as const;
  const county=active.get(fips[0]!);return county?{county}:{reason:"inactive-station-county"}as const;
}
const id=(prefix:string,v:unknown)=>prefix+"-"+sha256(stableJson(v));
const fields=(r:Row)=>Object.fromEntries(Object.entries(r).filter(([,v])=>v!==""));
export function buildWqpResult(context:SourceAdapterContext,read:Read):SourceAdapterResult {
  const p=wqpParametersSchema.parse(context.parameters),{method,acquisition}=loadWqpMethod(p,read);z.string().datetime().parse(context.runStartedAt);
  assert(context.sourceId===WQP_SOURCE&&context.stateCode===p.stateCode&&Date.parse(method.reviewedAt)<=Date.parse(context.runStartedAt),"WQP source, state or chronology differs.");
  const registry=JSON.parse(read("src/data/research/county-equivalent-registry.json").toString("utf8"));
  const active=new Map<string,{countyFips:string;stateCode:string}>(registry.countyEquivalents.filter((c:{status:string})=>c.status==="active").map((c:{countyFips:string;stateCode:string})=>[c.countyFips,c]));
  const requested=context.requestedPairs.map(r=>r.countyFips+":"+r.speciesId).sort();
  assert(new Set(requested).size===requested.length&&stableJson(requested)===stableJson(p.candidatePairs)&&p.candidateLimit===requested.length
    &&!requested.some(key=>method.heldPairs.includes(key)),"WQP requested scope differs or contains a held pair.");
  for(const r of context.requestedPairs)assert(WQP_TAXA[r.speciesId]===r.scientificName&&active.get(r.countyFips)?.stateCode===p.stateCode,"WQP target species/county differs.");
  function csv(speciesId:string,profile:"station"|"result") {const filePath=WQP_INPUT+speciesId+"-"+profile+".csv.gz";
    const ref=acquisition.receipts.find((a:{path:string})=>a.path===filePath);assert(ref,"Missing WQP profile.");
    const decoded=gunzipSync(read(filePath),{maxOutputLength:20_000_000});const rows=parse(decoded,{columns:true,skip_empty_lines:true,raw:true,info:true})as CsvEntry[];
    assert(rows.length===Number(ref.headers[profile==="station"?"total-site-count":"total-result-count"]),"WQP profile row count differs.");return {ref,rows};}
  const result:SourceAdapterResult={completedAt:context.runStartedAt,assertions:[],reviews:[],rejections:[],outcomes:[],artifacts:[],upstreamRequests:[],candidateRecordCount:0,duplicateRecordCount:0,errors:[],warnings:method.limitations};
  const witnesses:unknown[]=[];
  for(const speciesId of [...new Set(context.requestedPairs.map(r=>r.speciesId))].sort()) {
    const stations=csv(speciesId,"station"),results=csv(speciesId,"result");const stationIndex=new Map<string,Array<{entry:CsvEntry;index:number}>>();
    stations.rows.forEach((entry,index)=>{const key=entry.record.OrganizationIdentifier+"\0"+entry.record.MonitoringLocationIdentifier;const a=stationIndex.get(key)??[];a.push({entry,index});stationIndex.set(key,a);});
    const selected=new Map(requested.filter(k=>k.endsWith(":"+speciesId)).map(k=>[k,[]as Array<{index:number;entry:CsvEntry;stations:Array<{entry:CsvEntry;index:number}>;disposition:string;date:string|null}>]));
    results.rows.forEach((entry,index)=>{const r=entry.record,matches=stationIndex.get(r.OrganizationIdentifier+"\0"+r.MonitoringLocationIdentifier)??[];
      const geo=resolveWqpStation(matches.map(m=>m.entry.record),active);if(!geo.county||geo.county.stateCode!==p.stateCode)return;
      const target=selected.get(geo.county.countyFips+":"+speciesId);if(!target)return;
      const held=method.heldResultRows.find(h=>h.speciesId===speciesId&&h.parsedRowIndexZeroBased===index);
      if(held)assert(sha256(entry.raw)===held.rowSha256,"WQP held row identity differs.");
      const value=wqpPositiveRowValue(r,WQP_TAXA[speciesId],context.runStartedAt.slice(0,10));
      target.push({index,entry,stations:matches,disposition:held?"review-hold: "+held.reason:value.date?"positive":value.reason!,date:held?null:value.date??null});});
    for(const [key,rows]of selected) {
      const positive=rows.filter(r=>r.disposition==="positive");assert(positive.length,"Selected WQP pair has no supported positive row: "+key);
      result.candidateRecordCount+=rows.length;const [countyFips]=key.split(":"),dates=positive.map(r=>r.date!).sort(),latest=dates.at(-1)!;
      const attribution="Data contributors: "+[...new Set(positive.map(r=>r.entry.record.OrganizationFormalName+" ("+r.entry.record.OrganizationIdentifier+")"))].sort().join("; ")+". "+method.attribution;
      const caveats=[attribution,...method.limitations,"Station county codes were joined by exact organization and monitoring-location identifiers. These are the publisher's county metadata, not a new coordinate-derived assignment.",
        "Actual, Estimated and Calculated count values retain their original type; they establish sampled occurrence, not reconstructed abundance."];
      const payload={pairKey:key,resultDecodedSha256:results.ref.decodedSha256,stationDecodedSha256:stations.ref.decodedSha256,methodReviewSha256:p.methodReviewSha256,
        positiveRows:positive.map(r=>({parsedRowIndexZeroBased:r.index,rowSha256:sha256(r.entry.raw),stationRows:r.stations.map(s=>({parsedRowIndexZeroBased:s.index,rowSha256:sha256(s.entry.raw)}))}))};
      const assertionId=id("wqp-field-assertion",{runId:context.runId,...payload});
      result.assertions.push({schemaVersion:1,eventId:assertionId,event_type:"evidence.asserted",created_at:context.runStartedAt,actor_type:"adapter",actor_id:WQP_ADAPTER+"@"+WQP_VERSION,
        run_id:context.runId,source_id:WQP_SOURCE,state_code:p.stateCode,county_fips:countyFips,species_id:speciesId,claim_type:"recorded-present",evidence_kind:"occurrence",scope:"survey-area",
        source_record_id:id("retained-wqp-result-rows",payload),source_url:results.ref.url,source_record_date:latest,retrieved_at:results.ref.retrievedAt,
        taxon_match:{method:"Exact disclosed SubjectTaxonomicName equals the current catalog binomial.",target_scientific_name:WQP_TAXA[speciesId],source_scientific_name:WQP_TAXA[speciesId],source_taxon_key:null},
        geography_match:{method:"Exact organization and monitoring-location join to unambiguous active publisher Station county FIPS; not coordinate-derived.",source_state:p.stateCode,source_county:countyFips,county_fips:countyFips},
        temporal_scope:"Positive field-sample dates span "+dates[0]+" through "+latest+"; latest supported collection date retained.",
        spatial_scope:"Sampled locations in the publisher-reported county; no countywide prevalence claim.",survey_scope:"Positive Biological Count/count results from reviewed field Population Census or Species Density activities; Final or Accepted result status.",
        normalized_payload_hash:sha256(stableJson(payload)),caveats,notes:["Result query: "+results.ref.url,"Station query: "+stations.ref.url,
          "Exact source row identities, full nonempty source fields and station joins are retained in wqp-field-witnesses.json; omitted fields were blank in the pinned CSV. No stable public ResultIdentifier is fabricated."]});
      result.reviews.push({schemaVersion:1,eventId:id("wqp-field-review",{assertionId}),event_type:"evidence.reviewed",created_at:context.runStartedAt,actor_type:"adapter",actor_id:WQP_ADAPTER+"@"+WQP_VERSION,
        run_id:context.runId,source_id:WQP_SOURCE,state_code:p.stateCode,county_fips:countyFips,species_id:speciesId,references:{assertion_event_id:assertionId},review_level:"machine-validated",decision:"accepted",publication_eligible:true,
        reason_codes:["positive-field-count","exact-source-station-county","independently-reviewed-method","original-collection-date"],notes:["Canonical offline reconstruction from hash-pinned Results and Station responses with explicit method holds. Machine validation, not individual human voucher verification."]});
      const rejectionIds:string[]=[];
      for(const reason of [...new Set(rows.filter(r=>r.disposition!=="positive").map(r=>r.disposition))].sort()) {const excluded=rows.filter(r=>r.disposition===reason),rejectionId=id("wqp-field-rejection",{runId:context.runId,key,reason,rows:excluded.map(r=>r.index)});rejectionIds.push(rejectionId);
        result.rejections.push({schemaVersion:1,rejection_id:rejectionId,created_at:context.runStartedAt,actor_type:"adapter",actor_id:WQP_ADAPTER+"@"+WQP_VERSION,run_id:context.runId,source_id:WQP_SOURCE,
          candidate_locator:results.ref.path+"#pair="+key+"&reason="+encodeURIComponent(reason),candidate_taxon:WQP_TAXA[speciesId],candidate_geography:countyFips,
          normalized_target:{state_code:p.stateCode,county_fips:countyFips,species_id:speciesId},reason_code:"record-failed",supporting_notes:[excluded.length+" rows excluded: "+reason+". No absence or non-detection follows; exact rows retained in witness artifact."]});}
      result.outcomes.push({schemaVersion:1,outcome_id:id("wqp-field-outcome",{runId:context.runId,key}),run_id:context.runId,source_id:WQP_SOURCE,state_code:p.stateCode,county_fips:countyFips,species_id:speciesId,status:"evidence-found",scope_complete:true,recorded_at:context.runStartedAt,
        assertion_event_ids:[assertionId],rejection_ids:rejectionIds,query_urls:[results.ref.url,stations.ref.url],notes:["Complete scan of the retained profiles for this selected positive pair only; no exhaustive current county inventory or protocol-completion claim."]});
      witnesses.push({...payload,attribution,resultUrl:results.ref.url,stationUrl:stations.ref.url,resultRetrievedAt:results.ref.retrievedAt,stationRetrievedAt:stations.ref.retrievedAt,
        sourceRows:rows.map(r=>({parsedRowIndexZeroBased:r.index,physicalEndLineOneBased:r.entry.info.lines,rawRecordSha256:sha256(r.entry.raw),disposition:r.disposition,sourceFields:fields(r.entry.record),
          stationRows:r.stations.map(s=>({parsedRowIndexZeroBased:s.index,physicalEndLineOneBased:s.entry.info.lines,rawRecordSha256:sha256(s.entry.raw),sourceFields:fields(s.entry.record)}))}))});
    }
  }
  result.artifacts.push({filename:"wqp-field-witnesses.json",mediaType:"application/json",contents:JSON.stringify({schemaVersion:1,method:WQP_METHOD,methodReviewSha256:p.methodReviewSha256,
    locatorConvention:"Zero-based parsed data-row index excludes header. Physical end line is one-based in the original CSV, including multiline fields. SHA-256 hashes exact csv-parse raw record bytes including its original trailing line terminator. Nonempty field values are lossless; omitted CSV fields were empty.",
    acquisitionReceiptSha256:method.acquisitionReceipt.sha256,acquisitionCodeQualification:"The original preflight receipt codeCommit identifies repository HEAD during acquisition; its separately pinned recipe contains the actual executed acquisition bytes. This offline run's code_commit identifies interpretation code, not a new provider acquisition.",witnesses},null,2)+"\n"});
  return result;
}
