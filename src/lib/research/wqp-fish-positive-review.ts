import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { sha256, stableJson } from "./run-files";
import { parseWqpCsv, resolveWqpStation, WQP_SOURCE, WQP_ADAPTER } from "./wqp-field-positive-review";
import type { SourceAdapterContext, SourceAdapterResult } from "./source-adapter";

export const WQP_FISH_VERSION = "2.0.0";
export const WQP_FISH_METHOD = "retained-wqp-fish-measurement-station-join-v2";
export const WQP_FISH_METHOD_PATH = "src/data/research/source-method-reviews/wqp-fish-measurements-v2.json";
export const WQP_FISH_INPUT = ".cache/research/campaigns/20260908-r14-wqp-expansion/";
export const WQP_FISH_TAXA: Record<string, string> = {
  "hypophthalmichthys-molitrix": "Hypophthalmichthys molitrix",
  "neogobius-melanostomus": "Neogobius melanostomus",
};
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const safePath = z.string().regex(/^[a-zA-Z0-9.][a-zA-Z0-9_./-]+$/u)
  .refine(p => !p.split("/").includes("..") && !p.includes("//"));
const file = z.object({path:safePath, bytes:z.number().int().positive().max(20_000_000), sha256:hash}).strict();
const pair = z.string().regex(/^[0-9]{5}:(?:hypophthalmichthys-molitrix|neogobius-melanostomus)$/u);
export const wqpFishParametersSchema = z.object({
  mode:z.literal("retained-fish-positive-measurement"), stateCode:z.string().regex(/^[A-Z]{2}$/u),
  methodReviewSha256:hash, candidatePairs:z.array(pair).min(1).max(5000),
  candidateLimit:z.number().int().positive().max(5000),
}).strict();
export type WqpFishPlan = Pick<z.infer<typeof wqpFishParametersSchema>, "methodReviewSha256">;
type Read = (p:string) => Buffer;
type Row = Record<string,string>;
type CsvEntry = ReturnType<typeof parseWqpCsv>[number];
const methodSchema = z.object({
  schemaVersion:z.literal(1), methodVersion:z.literal(WQP_FISH_METHOD), sourceId:z.literal(WQP_SOURCE),
  status:z.literal("approved-with-specific-holds"), reviewedBy:z.literal("MAIN"), reviewedAt:z.string().datetime(),
  inputArchive:file, acquisitionReceipt:file, acquisitionRecipe:file, originalAcquisitionRecipe:file,
  repositoryBaseCommit:z.string().regex(/^[a-f0-9]{40}$/u), context:z.array(file).min(1),
  independentReviews:z.array(file).length(2), approvedPairs:z.array(pair).min(1), heldPairs:z.array(pair),
  heldResultRows:z.array(z.object({speciesId:z.enum(["hypophthalmichthys-molitrix","neogobius-melanostomus"]),
    parsedRowIndexZeroBased:z.number().int().nonnegative(),rowSha256:hash,reason:z.string().min(1)}).strict()),
  rationale:z.string().min(1), attribution:z.string().min(1), limitations:z.array(z.string().min(1)).min(1),
  speciesCaveats:z.record(z.string(),z.array(z.string().min(1))),
  pairCaveats:z.record(pair,z.array(z.string().min(1))),
}).strict();
const sourceProfile = file.extend({url:z.url(),status:z.literal(200),startedAt:z.string().datetime(),
  retrievedAt:z.string().datetime(),decodedBytes:z.number().int().positive().max(20_000_000),
  decodedSha256:hash,headers:z.record(z.string(),z.string())}).strict();
const reviewWitness = z.object({pairKey:pair,parsedRowIndexZeroBased:z.number().int().nonnegative(),
  physicalEndLineOneBased:z.number().int().positive(),rawRecordSha256:hash,
  stationParsedRowIndexZeroBased:z.number().int().nonnegative(),stationPhysicalEndLineOneBased:z.number().int().positive(),
  stationRawRecordSha256:hash,date:z.string(),resultFields:z.record(z.string(),z.string()),
  stationFields:z.record(z.string(),z.string())}).passthrough();
const reviewSchema = z.object({kind:z.literal("independent-wqp-fish-source-review"),recordedBy:z.literal("MAIN"),
  actorId:z.string().min(1),recordedAt:z.string().datetime(),acquisitionReceiptSha256:hash,inputArchive:file,
  sourceProfiles:z.object({result:sourceProfile,station:sourceProfile}).strict(),
  reviewedPairs:z.number().int().positive(),heldPairs:z.array(pair),witnesses:z.array(reviewWitness).min(1)}).passthrough();
function assert(v:unknown,msg:string):asserts v {if(!v)throw Error(msg);}
function pinned(ref:z.infer<typeof file>,read:Read) {
  const bytes=read(ref.path);
  assert(bytes.length===ref.bytes && sha256(bytes)===ref.sha256,"WQP fish pinned input drift: "+ref.path);
  return bytes;
}
function embeddedArchive(ref:z.infer<typeof file>,read:Read) {
  const bundle=z.object({schemaVersion:z.literal(1),files:z.array(z.object({originalPath:safePath,
    bytes:z.number().int().nonnegative().max(20_000_000),sha256:hash,encoding:z.literal("base64"),contents:z.string()}).strict())})
    .passthrough().parse(JSON.parse(gunzipSync(pinned(ref,read),{maxOutputLength:20_000_000}).toString("utf8")));
  const entries=new Map<string,Buffer>();
  for(const entry of bundle.files) {
    const bytes=Buffer.from(entry.contents,"base64");
    assert(!entries.has(entry.originalPath)&&bytes.length===entry.bytes&&sha256(bytes)===entry.sha256,"WQP embedded file differs: "+entry.originalPath);
    entries.set(entry.originalPath,bytes);
  }
  return (p:string)=>{const bytes=entries.get(p);assert(bytes,"Missing WQP retained archive entry: "+p);return bytes;};
}
export function loadWqpFishMethod(plan:WqpFishPlan,read:Read) {
  const bytes=read(WQP_FISH_METHOD_PATH);
  assert(sha256(bytes)===hash.parse(plan.methodReviewSha256),"WQP fish method review hash differs.");
  const method=methodSchema.parse(JSON.parse(bytes.toString("utf8"))),embedded=embeddedArchive(method.inputArchive,read);
  for(const ref of method.context)pinned(ref,read);
  assert(method.acquisitionReceipt.path===WQP_FISH_INPUT+"inputs/retrieval-receipt.json"
    &&method.acquisitionRecipe.path===WQP_FISH_INPUT+"acquire-remaining-candidates.cjs"
    &&method.originalAcquisitionRecipe.path===WQP_FISH_INPUT+"acquire-candidates.cjs","WQP fish acquisition path differs.");
  const acquisition=JSON.parse(pinned(method.acquisitionReceipt,embedded).toString("utf8"));
  pinned(method.acquisitionRecipe,embedded);pinned(method.originalAcquisitionRecipe,embedded);
  assert(acquisition.kind==="wqp-expansion-candidate-acquisition"&&acquisition.repositoryBaseCommit===method.repositoryBaseCommit
    &&acquisition.attemptedGets===10&&acquisition.successfulGets===8&&acquisition.failedGets===2&&acquisition.providerWrites===0
    &&acquisition.recipe.sha256===method.acquisitionRecipe.sha256&&acquisition.originalRecipe.sha256===method.originalAcquisitionRecipe.sha256
    &&acquisition.recipe.path.replaceAll("\\","/").endsWith("/"+method.acquisitionRecipe.path)
    &&acquisition.originalRecipe.path===method.originalAcquisitionRecipe.path
    &&Date.parse(acquisition.recordedAt)<=Date.parse(method.reviewedAt),"WQP fish acquisition lineage differs.");
  const reviews=method.independentReviews.map(ref=>reviewSchema.parse(JSON.parse(pinned(ref,read).toString("utf8"))));
  assert(new Set(reviews.map(r=>r.actorId)).size===2&&reviews.every(r=>r.actorId!=="MAIN"
    &&r.acquisitionReceiptSha256===method.acquisitionReceipt.sha256&&stableJson(r.inputArchive)===stableJson(method.inputArchive)
    &&r.reviewedPairs===r.witnesses.length&&Date.parse(r.recordedAt)<=Date.parse(method.reviewedAt)),"WQP fish independent review identity differs.");
  const reviewedPairs=reviews.flatMap(r=>r.witnesses.map(w=>w.pairKey)).sort();
  assert(new Set(reviewedPairs).size===reviewedPairs.length&&stableJson(reviewedPairs)===stableJson(method.approvedPairs)
    &&reviews.every(r=>r.heldPairs.every(p=>method.heldPairs.includes(p))),"WQP fish approved scope differs from independent reviews.");
  for(const review of reviews)for(const profile of ["result","station"]as const) {
    const ref=review.sourceProfiles[profile], original=acquisition.receipts.find((r:{path?:string})=>r.path===ref.path);
    assert(original&&stableJson(original)===stableJson(ref),"WQP fish source profile receipt differs.");
    const decoded=gunzipSync(pinned(ref,embedded),{maxOutputLength:20_000_000});
    assert(decoded.length===ref.decodedBytes&&sha256(decoded)===ref.decodedSha256
      &&Date.parse(ref.startedAt)<=Date.parse(ref.retrievedAt)&&Date.parse(ref.retrievedAt)<=Date.parse(review.recordedAt),"WQP fish source bytes or chronology differ.");
  }
  return {method,acquisition,reviews,embedded};
}
export function wqpFishInputPaths(plan:WqpFishPlan,read:Read) {
  const {method}=loadWqpFishMethod(plan,read);
  return [...new Set(["src/lib/research/wqp-fish-positive-review.ts","src/lib/research/wqp-field-positive-review.ts",
    "scripts/research/adapters/wqp-retained-field-counts.ts",WQP_FISH_METHOD_PATH,method.inputArchive.path,
    ...method.context.map(r=>r.path),...method.independentReviews.map(r=>r.path)])].sort();
}
export function wqpFishPositiveRowValue(r:Row,name:string,asOf:string) {
  if(r.SubjectTaxonomicName!==name||r.UnidentifiedSpeciesIdentifier)return {reason:"nonexact-taxon"}as const;
  const form=[r.BiologicalIntentName,r.CharacteristicName,r["ResultMeasure/MeasureUnitCode"]].join("/");
  if(r.ActivityMediaName!=="Biological"||!["Population Census/Count/count","Group Summary/Count/count","Individual/Count/count",
    "Individual/Length/mm","Individual/Length, Total (Fish)/cm","Individual/Weight/kg",
    "Population Census/Total Sample Weight/g"].includes(form))return {reason:"outside-reviewed-fish-measurement-form"}as const;
  if(r.ResultDetectionConditionText||r.MeasureQualifierCode||r.ResultStatusIdentifier!=="Final")return {reason:"unapproved-result-status-or-qualifier"}as const;
  const value=r.ResultMeasureValue;
  if(!/^\d+(?:\.\d+)?$/u.test(value??"")||!Number.isFinite(Number(value))||Number(value)<=0)return {reason:"no-positive-finite-measurement"}as const;
  if(r.ResultValueTypeName!=="Actual")return {reason:"unreviewed-value-type"}as const;
  if(r.ToxicityTestType||r.SampleTissueAnatomyName||r.LaboratoryName||!["Sample-Routine","Field Msr/Obs"].includes(r.ActivityTypeCode))
    return {reason:"nonfield-or-unreviewed-biological-context"}as const;
  const context=Object.entries(r).filter(([k])=>/CommentText|MethodDescriptionText|MethodName$/u.test(k)).map(([,v])=>v).join(" ");
  if(/\b(?:toxicity|toxicological|hatchery|transplant(?:ed)?|sentinel|caged|mesocosm|aquarium|cultured organisms|stocked organisms)\b/iu.test(context))
    return {reason:"potential-introduced-test-organism-context"}as const;
  const date=r.ActivityStartDate,ms=Date.parse(date+"T00:00:00.000Z");
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(date??"")||!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==date||date>asOf
    ||!r.OrganizationIdentifier||!r.OrganizationFormalName||!r.ActivityIdentifier||!r.MonitoringLocationIdentifier)return {reason:"invalid-date-or-source-identity"}as const;
  return {date,value:Number(value),form};
}
const id=(prefix:string,v:unknown)=>prefix+"-"+sha256(stableJson(v));
const fields=(r:Row)=>Object.fromEntries(Object.entries(r).filter(([,v])=>v!==""));
export function buildWqpFishResult(context:SourceAdapterContext,read:Read):SourceAdapterResult {
  const p=wqpFishParametersSchema.parse(context.parameters),{method,acquisition,reviews,embedded}=loadWqpFishMethod(p,read);z.string().datetime().parse(context.runStartedAt);
  assert(context.sourceId===WQP_SOURCE&&context.stateCode===p.stateCode&&Date.parse(method.reviewedAt)<=Date.parse(context.runStartedAt),"WQP source, state or chronology differs.");
  const registry=JSON.parse(read("src/data/research/county-equivalent-registry.json").toString("utf8"));
  const active=new Map<string,{countyFips:string;stateCode:string}>(registry.countyEquivalents.filter((c:{status:string})=>c.status==="active").map((c:{countyFips:string;stateCode:string})=>[c.countyFips,c]));
  const requested=context.requestedPairs.map(r=>r.countyFips+":"+r.speciesId).sort();
  assert(new Set(requested).size===requested.length&&stableJson(requested)===stableJson(p.candidatePairs)&&p.candidateLimit===requested.length
    &&requested.every(key=>method.approvedPairs.includes(key))&&!requested.some(key=>method.heldPairs.includes(key)),"WQP requested scope differs or contains a held pair.");
  for(const r of context.requestedPairs)assert(WQP_FISH_TAXA[r.speciesId]===r.scientificName&&active.get(r.countyFips)?.stateCode===p.stateCode,"WQP target species/county differs.");
  function csv(speciesId:string,profile:"station"|"result") {const filePath=WQP_FISH_INPUT+"inputs/"+speciesId+"-"+profile+".csv.gz";
    const ref=acquisition.receipts.find((a:{path:string})=>a.path===filePath);assert(ref,"Missing WQP profile.");
    const decoded=gunzipSync(embedded(filePath),{maxOutputLength:20_000_000});const rows=parseWqpCsv(decoded);
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
      const value=wqpFishPositiveRowValue(r,WQP_FISH_TAXA[speciesId],context.runStartedAt.slice(0,10));
      target.push({index,entry,stations:matches,disposition:held?"review-hold: "+held.reason:value.date?"positive":value.reason!,date:held?null:value.date??null});});
    for(const [key,rows]of selected) {
      const positive=rows.filter(r=>r.disposition==="positive");assert(positive.length,"Selected WQP fish pair has no supported positive row: "+key);
      const review=reviews.find(r=>r.witnesses.some(w=>w.pairKey===key))!,witness=review.witnesses.find(w=>w.pairKey===key)!;
      const primary=positive.find(r=>r.index===witness.parsedRowIndexZeroBased),station=primary?.stations.find(s=>s.index===witness.stationParsedRowIndexZeroBased);
      assert(primary&&station&&sha256(primary.entry.raw)===witness.rawRecordSha256&&sha256(station.entry.raw)===witness.stationRawRecordSha256
        &&primary.entry.physicalEndLineOneBased===witness.physicalEndLineOneBased&&station.entry.physicalEndLineOneBased===witness.stationPhysicalEndLineOneBased
        &&primary.date===witness.date&&stableJson(fields(primary.entry.record))===stableJson(witness.resultFields)
        &&stableJson(fields(station.entry.record))===stableJson(witness.stationFields),"WQP fish independently reviewed witness differs: "+key);
      result.candidateRecordCount+=rows.length;const [countyFips]=key.split(":"),dates=positive.map(r=>r.date!).sort(),latest=dates.at(-1)!;
      const attribution="Data contributors: "+[...new Set(positive.map(r=>r.entry.record.OrganizationFormalName+" ("+r.entry.record.OrganizationIdentifier+")"))].sort().join("; ")+". "+method.attribution;
      const caveats=[attribution,...method.limitations,...(method.speciesCaveats[speciesId]??[]),...(method.pairCaveats[key]??[]),"Station county codes were joined by exact organization and monitoring-location identifiers. These are the publisher's county metadata, not a new coordinate-derived assignment.",
        "Original Actual count, length and catch-weight values retain their units and biological intent. Repeated rows or individual measurements are not independent fish or reconstructed abundance."];
      const payload={pairKey:key,resultDecodedSha256:results.ref.decodedSha256,stationDecodedSha256:stations.ref.decodedSha256,methodReviewSha256:p.methodReviewSha256,
        positiveRows:positive.map(r=>({parsedRowIndexZeroBased:r.index,rowSha256:sha256(r.entry.raw),stationRows:r.stations.map(s=>({parsedRowIndexZeroBased:s.index,rowSha256:sha256(s.entry.raw)}))}))};
      const assertionId=id("wqp-fish-assertion",{runId:context.runId,...payload});
      result.assertions.push({schemaVersion:1,eventId:assertionId,event_type:"evidence.asserted",created_at:context.runStartedAt,actor_type:"adapter",actor_id:WQP_ADAPTER+"@"+WQP_FISH_VERSION,
        run_id:context.runId,source_id:WQP_SOURCE,state_code:p.stateCode,county_fips:countyFips,species_id:speciesId,claim_type:"recorded-present",evidence_kind:"occurrence",scope:"survey-area",
        source_record_id:id("retained-wqp-result-rows",payload),source_url:results.ref.url,source_record_date:latest,retrieved_at:results.ref.retrievedAt,
        taxon_match:{method:"Exact disclosed SubjectTaxonomicName equals the current catalog binomial.",target_scientific_name:WQP_FISH_TAXA[speciesId],source_scientific_name:WQP_FISH_TAXA[speciesId],source_taxon_key:null},
        geography_match:{method:"Exact organization and monitoring-location join to unambiguous active publisher Station county FIPS; not coordinate-derived.",source_state:p.stateCode,source_county:countyFips,county_fips:countyFips},
        temporal_scope:"Positive field-sample dates span "+dates[0]+" through "+latest+"; latest supported collection date retained.",
        spatial_scope:"Sampled locations in the publisher-reported county; no countywide prevalence claim.",survey_scope:"Positive species-specific fish counts, individual lengths or catch weights from reviewed field Population Census, Group Summary or Individual activities; Final status and Actual values. Tissue analytes and unreviewed metrics are excluded.",
        normalized_payload_hash:sha256(stableJson(payload)),caveats,notes:["Result query: "+results.ref.url,"Station query: "+stations.ref.url,
          "Exact source row identities, full nonempty source fields and station joins are retained in wqp-fish-witnesses.json; omitted fields were blank in the pinned CSV. No stable public ResultIdentifier is fabricated."]});
      result.reviews.push({schemaVersion:1,eventId:id("wqp-fish-review",{assertionId}),event_type:"evidence.reviewed",created_at:context.runStartedAt,actor_type:"adapter",actor_id:WQP_ADAPTER+"@"+WQP_FISH_VERSION,
        run_id:context.runId,source_id:WQP_SOURCE,state_code:p.stateCode,county_fips:countyFips,species_id:speciesId,references:{assertion_event_id:assertionId},review_level:"machine-validated",decision:"accepted",publication_eligible:true,
        reason_codes:["positive-field-fish-measurement","exact-source-station-county","independently-reviewed-method","original-collection-date"],notes:["Canonical offline reconstruction from hash-pinned Results and Station responses with explicit method holds. Machine validation, not individual human voucher verification."]});
      const rejectionIds:string[]=[];
      for(const reason of [...new Set(rows.filter(r=>r.disposition!=="positive").map(r=>r.disposition))].sort()) {const excluded=rows.filter(r=>r.disposition===reason),rejectionId=id("wqp-fish-rejection",{runId:context.runId,key,reason,rows:excluded.map(r=>r.index)});rejectionIds.push(rejectionId);
        result.rejections.push({schemaVersion:1,rejection_id:rejectionId,created_at:context.runStartedAt,actor_type:"adapter",actor_id:WQP_ADAPTER+"@"+WQP_FISH_VERSION,run_id:context.runId,source_id:WQP_SOURCE,
          candidate_locator:results.ref.path+"#pair="+key+"&reason="+encodeURIComponent(reason),candidate_taxon:WQP_FISH_TAXA[speciesId],candidate_geography:countyFips,
          normalized_target:{state_code:p.stateCode,county_fips:countyFips,species_id:speciesId},reason_code:"record-failed",supporting_notes:[excluded.length+" rows excluded: "+reason+". No absence or non-detection follows; exact rows retained in witness artifact."]});}
      result.outcomes.push({schemaVersion:1,outcome_id:id("wqp-fish-outcome",{runId:context.runId,key}),run_id:context.runId,source_id:WQP_SOURCE,state_code:p.stateCode,county_fips:countyFips,species_id:speciesId,status:"evidence-found",scope_complete:true,recorded_at:context.runStartedAt,
        assertion_event_ids:[assertionId],rejection_ids:rejectionIds,query_urls:[results.ref.url,stations.ref.url],notes:["Complete scan of the retained profiles for this selected positive pair only; no exhaustive current county inventory or protocol-completion claim."]});
      witnesses.push({...payload,attribution,resultUrl:results.ref.url,stationUrl:stations.ref.url,resultRetrievedAt:results.ref.retrievedAt,stationRetrievedAt:stations.ref.retrievedAt,
        sourceRows:rows.map(r=>({parsedRowIndexZeroBased:r.index,physicalEndLineOneBased:r.entry.physicalEndLineOneBased,rawRecordSha256:sha256(r.entry.raw),disposition:r.disposition,sourceFields:fields(r.entry.record),
          stationRows:r.stations.map(s=>({parsedRowIndexZeroBased:s.index,physicalEndLineOneBased:s.entry.physicalEndLineOneBased,rawRecordSha256:sha256(s.entry.raw),sourceFields:fields(s.entry.record)}))}))});
    }
  }
  result.artifacts.push({filename:"wqp-fish-witnesses.json",mediaType:"application/json",contents:JSON.stringify({schemaVersion:1,method:WQP_FISH_METHOD,methodReviewSha256:p.methodReviewSha256,
    locatorConvention:"Zero-based parsed data-row index excludes header. Physical end line is one-based in the original CSV, including multiline fields. SHA-256 hashes exact csv-parse raw record bytes including its original trailing line terminator. Nonempty field values are lossless; omitted CSV fields were empty.",
    acquisitionReceiptSha256:method.acquisitionReceipt.sha256,acquisitionCodeQualification:"The original preflight repositoryBaseCommit identifies repository HEAD during acquisition. Both executed recipes are separately hash-pinned inside the retained input archive. Failed requests remain failed. This offline run code_commit identifies interpretation code, not a new provider acquisition.",witnesses},null,2)+"\n"});
  return result;
}
