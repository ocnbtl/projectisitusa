import assert from 'node:assert/strict';
import fs from 'node:fs';
import {z} from 'zod';
import {resolveCountyEquivalent} from '@/lib/research/geography-registry';
import {buildEpaNrsa1314Result as build, loadEpaNrsa1314Method as load, epaNrsa1314InputPaths as inputs} from '@/lib/research/epa-nrsa-1314-fish-counts';
import {sha256,stableJson} from '@/lib/research/run-files';
import {compileAdditiveResearchEvidence} from '@/lib/research/compile-evidence';
import type {SourceAdapterContext} from '@/lib/research/source-adapter';
const read=(p:string)=>fs.readFileSync(p),json=(p:string)=>JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/,''));
const methodPath='src/data/research/source-method-reviews/epa-nrsa-fish-counts-1314-20260908-r21.json',method=json(methodPath),plan={methodReviewPath:methodPath,methodReviewSha256:sha256(read(methodPath))};
const loaded=load(plan,read),counties=new Map<string,string>(json('src/data/research/county-equivalent-registry.json').countyEquivalents.map((c:any)=>[c.countyFips,c.stateCode]));
const states=[...new Set<string>(method.approvedPairs.map((k:string)=>counties.get(k.split(':')[0])))].sort();
const make=(stateCode:string):SourceAdapterContext=>{const pairs=method.approvedPairs.filter((k:string)=>counties.get(k.split(':')[0])===stateCode);return{runId:'epa-nrsa-1314-fixture-'+stateCode,sourceId:'epa-nrsa-fish-counts',stateCode,runStartedAt:new Date(Date.parse(method.reviewedAt)+1000).toISOString(),parameters:{mode:'retained-reviewed-fish-counts-1314',stateCode,...plan,candidatePairs:pairs,candidateLimit:pairs.length},requestedPairs:pairs.map((k:string)=>{const[countyFips,speciesId]=k.split(':');return{countyFips,speciesId,countyName:'Pinned registry',scientificName:method.taxa[speciesId]}})}};
const schemas=Object.fromEntries(['evidence-assertion','review-event','pair-outcome','rejection-record'].map(n=>{const s=json('src/data/research/schemas/'+n+'.schema.json');delete s.allOf;return[n,z.fromJSONSchema(s)]}));
const oldFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Retained EPA test attempted network access')};
const rejected:string[]=[],checks:unknown[]=[];let assertions=0,sourceRows=0,positiveRows=0,rejections=0,primaryDateDifferences=0;
const reject=(name:string,f:()=>unknown)=>{assert.throws(f,name);rejected.push(name)};
function mutate(name:string,f:(m:any,o:Map<string,Buffer>)=>void){const m=structuredClone(method),o=new Map<string,Buffer>();f(m,o);const b=Buffer.from(JSON.stringify(m)),c=make('AR');c.parameters.methodReviewSha256=sha256(b);o.set(methodPath,b);reject(name,()=>build(c,p=>o.get(p)??read(p)));}
function reviewChange(m:any,o:Map<string,Buffer>,f:(r:any)=>void){const ref=m.independentReviews[0],r=json(ref.path);f(r);const b=Buffer.from(JSON.stringify(r));o.set(ref.path,b);Object.assign(ref,{bytes:b.length,sha256:sha256(b)});}
try{
 assert.equal(loaded.method.approvedPairs.length,230);assert.deepEqual(loaded.method.heldPairs,['12111:pterygoplichthys-disjunctivus','12115:pterygoplichthys-disjunctivus']);assert.equal(states.length,40);
 for(const state of states){const c=make(state),r=build(c,read),artifact=JSON.parse(r.artifacts[0].contents.toString());assert.equal(r.assertions.length,c.requestedPairs.length);assert.equal(r.reviews.length,r.assertions.length);assert.equal(r.outcomes.length,r.assertions.length);assert.equal(r.errors.length,0);assert.equal(r.upstreamRequests.length,0);
  for(const[n,records]of [['evidence-assertion',r.assertions],['review-event',r.reviews],['pair-outcome',r.outcomes],['rejection-record',r.rejections]]as const)for(const row of records)schemas[n].parse(row);
  for(const w of artifact.witnesses){const a=r.assertions.find(a=>a.county_fips+':'+a.species_id===w.pairKey)!;assert.equal(a.claim_type,'recorded-present');assert(!method.heldPairs.includes(w.pairKey));const county=resolveCountyEquivalent({stateCode:state,countyFips:w.primary.site.sourceFields.STATECTY.padStart(5,'0'),countyName:a.geography_match.source_county,sourceId:'epa-nrsa-fish-counts'});assert(county.status==='resolved'&&county.county.countyFips===a.county_fips);
   const positives=w.sourceRows.filter((x:any)=>x.disposition==='positive'),primary=positives.find((x:any)=>x.fish.parsedRowIndexZeroBased===w.primary.fish.parsedRowIndexZeroBased);assert(primary);for(const t of ['fish','site','taxon'])assert.deepEqual(primary[t],w.primary[t]);assert.equal(primary.date,w.primary.date);
   const latest=positives.map((x:any)=>x.date).sort().at(-1);assert.equal(a.source_record_date,latest);if(latest!==w.primary.date)primaryDateDifferences++;positiveRows+=positives.length;
   for(const row of positives){assert.equal(row.fish.sourceFields.UID,row.site.sourceFields.UID);assert.equal(row.fish.sourceFields.PSTL_CODE,row.site.sourceFields.PSTL_CODE);assert.equal(row.fish.sourceFields.IS_DISTINCT,'1');}
   if(w.pairKey==='29143:ctenopharyngodon-idella'){assert.equal(w.sourceRows.filter((x:any)=>x.fish.parsedRowIndexZeroBased===6701&&x.disposition!=='positive').length,1);assert(!positives.some((x:any)=>x.fish.parsedRowIndexZeroBased===6701));}
  }
  const compiled=compileAdditiveResearchEvidence({bootstrapEvidence:[],runAssertions:r.assertions,reviewEvents:r.reviews,sources:json('src/data/research/source-registry.json').sources,asOf:'2026-09-08'});assert.equal(compiled.runEvidence.length,r.assertions.length);assert(compiled.runEvidence.every(e=>e.caveat.includes('Environmental Protection Agency')));
  if(['AR','FL','MO'].includes(state))assert.equal(stableJson(build(c,read)),stableJson(r));assertions+=r.assertions.length;sourceRows+=r.candidateRecordCount;rejections+=r.rejections.length;checks.push({state,assertions:r.assertions.length,sourceRows:r.candidateRecordCount,rejections:r.rejections.length});
 }
 assert.equal(assertions,230);assert.equal(sourceRows,283);assert.equal(positiveRows,282);assert.equal(rejections,1);
 for(const[name,f]of [['source',(c:any)=>c.sourceId='other'],['state',(c:any)=>c.stateCode='FL'],['limit',(c:any)=>c.parameters.candidateLimit=999],['method hash',(c:any)=>c.parameters.methodReviewSha256='a'.repeat(64)],['method path',(c:any)=>c.parameters.methodReviewPath='../outside.json'],['target taxonomy',(c:any)=>c.requestedPairs[0].scientificName='Other species'],['chronology',(c:any)=>c.runStartedAt='2026-09-07T00:00:00.000Z'],['negative mode',(c:any)=>c.parameters.mode='absent'],['duplicate pair',(c:any)=>c.requestedPairs.push(c.requestedPairs[0])],['extra parameter',(c:any)=>c.parameters.allowAbsence=true]]as const){const c=make('AR');f(c);reject(name,()=>build(c,read));}
 const held=make('FL');held.requestedPairs=[{countyFips:'12111',speciesId:'pterygoplichthys-disjunctivus',countyName:'St Lucie',scientificName:'Pterygoplichthys disjunctivus'}];held.parameters.candidatePairs=['12111:pterygoplichthys-disjunctivus'];held.parameters.candidateLimit=1;reject('specific taxonomy hold',()=>build(held,read));
 for(const p of inputs(plan,read).filter(p=>!p.endsWith('.ts')))reject('pinned input '+p,()=>build(make('AR'),q=>q===p?Buffer.from('changed'):read(q)));
 mutate('original commit lineage',(m,o)=>reviewChange(m,o,r=>r.originalCommit='a'.repeat(40)));
 mutate('unreviewed scope',m=>m.approvedPairs.push('01001:cyprinus-carpio'));
 mutate('source acquisition code lineage',m=>m.acquisitions[0].repositoryBaseCommit='a'.repeat(40));
 mutate('duplicate profile',m=>m.profiles[1]=m.profiles[0]);mutate('row count',m=>m.profiles[0].rowCount++);mutate('column order',m=>m.profiles[0].columns.reverse());mutate('decoding contract',m=>m.profiles[1].encoding='utf8');mutate('decoded hash',m=>m.profiles[0].decodedSha256='a'.repeat(64));mutate('held row identity',m=>m.heldFishRows[0].rawRecordSha256='a'.repeat(64));
 for(const[name,f]of [['actor MAIN',(r:any)=>r.actorId='MAIN'],['review chronology',(r:any)=>r.recordedAt='2026-09-07T00:00:00.000Z'],['lease scope',(r:any)=>r.leasedPairs.pop()],['acquisition hash',(r:any)=>r.acquisitionReceiptSha256='a'.repeat(64)],['primary date',(r:any)=>r.witnesses[0].date='2024-01-01'],['primary count',(r:any)=>r.witnesses[0].total++],['omitted material row',(r:any)=>r.materialRows.pop()],['duplicated material row',(r:any)=>r.materialRows.push(r.materialRows[0])],['original proposal hash',(r:any)=>r.originalProposal.sha256='a'.repeat(64)]]as const)mutate(name,(m,o)=>reviewChange(m,o,f));
 for(const table of ['fish','site','taxon'])for(const field of ['parsedRowIndexZeroBased','physicalEndLineOneBased','rawRecordSha256','sourceFields'])mutate(table+' '+field,(m,o)=>reviewChange(m,o,r=>r.materialRows[0][table][field]=field==='rawRecordSha256'?'a'.repeat(64):field==='sourceFields'?{forged:'yes'}:0));
 mutate('contemporaneous taxon changed',m=>{Object.values<any>(m.taxonReviews)[0].taxon.sourceFields.SPECIES='OTHER'});
 mutate('removed hold',(m,o)=>{m.heldPairs.shift();reviewChange(m,o,r=>r.heldPairs.shift())});
 console.log(JSON.stringify({passed:true,checks,assertions,sourceRows,positiveRows,rejections,primaryDateDifferences,rejectedCases:rejected.length,rejected,deterministicStates:['AR','FL','MO'],providerRequests:0,newDeterminations:0}));
}finally{globalThis.fetch=oldFetch;}
