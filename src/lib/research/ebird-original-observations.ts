import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { sha256, stableJson } from './run-files';
import type { SourceAdapterContext, SourceAdapterResult } from './source-adapter';

export const EBIRD_SOURCE = 'gbif-ebird';
export const EBIRD_ADAPTER = 'gbif-ebird-retained-original-observations';
export const EBIRD_VERSION = '1.0.0';
export const EBIRD_METHOD = 'retained-ebird-original-field-review-v1';
export const EBIRD_MODE = 'retained-reviewed-original-ebird-observations';
export const EBIRD_DATASET = '4fa7b334-ce0d-4e88-aaae-2e0c138d049e';
export const EBIRD_LICENSE = 'http://creativecommons.org/licenses/by/4.0/legalcode';
const term = (name: string) => 'http://rs.tdwg.org/dwc/terms/' + name;
const check: (value: unknown, message: string) => asserts value = (value, message) => {
  if (!value) throw new Error('EOD original review: ' + message);
};
const text = (bytes: Buffer) => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
const normalizedName = (name: string) => name.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
type Read = (path: string) => Buffer;
export type EbirdCounty = {countyFips: string; stateCode: string; stateName: string; status: string; shortName: string; legalName: string; aliases: string[]};
export type EbirdRecord = Record<string, unknown>;
export type EbirdMachineTag = {name: string; value: string; namespace: string; created: string};

export function ebirdOriginalDate(original: EbirdRecord) {
  const year = original[term('year')], month = original[term('month')], day = original[term('day')];
  if (typeof year !== 'string' || !/^\d{4}$/u.test(year) || typeof month !== 'string' || !/^\d{1,2}$/u.test(month) || typeof day !== 'string' || !/^\d{1,2}$/u.test(day)) return null;
  const date = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0'), stamp = Date.parse(date);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date ? date : null;
}

// An explicit, unambiguous original county can support a historical occurrence
// without a coordinate-uncertainty field. Source review must still check every
// original field; this predicate does not replace independent witness review.
export function qualifyEbirdOriginal(record: EbirdRecord, original: EbirdRecord, counties: EbirdCounty[], scientificName: string, taxonKey: number, machineTags: EbirdMachineTag[], reviewedCollections: readonly string[] = ['EBIRD']) {
  const fail = (reason: string) => ({county: null, date: null, reason});
  const collection = original[term('collectionCode')];
  if (typeof collection !== 'string' || !reviewedCollections.includes(collection) || !/^EBIRD(?:_ATL_[A-Z]{2})?$/u.test(collection)) return fail('publisher-or-country-identity');
  if (!Number.isSafeInteger(record.key) || original.key !== record.key || record.datasetKey !== EBIRD_DATASET || original.datasetKey !== EBIRD_DATASET) return fail('record-or-dataset-identity');
  if (record.publishingOrgKey !== 'e2e717bf-551a-4917-bdc9-4fa0f342c530' || original.publishingOrgKey !== record.publishingOrgKey || record.gbifID !== String(record.key)) return fail('publisher-or-gbif-identity');
  if (record.countryCode !== 'US' || original[term('country')] !== 'United States' || original[term('institutionCode')] !== 'CLO' || record.collectionCode !== collection) return fail('publisher-or-country-identity');
  if (original[term('scientificName')] !== scientificName || record.species !== scientificName || record.speciesKey !== taxonKey || record.acceptedTaxonKey !== taxonKey || record.taxonRank !== 'SPECIES' || record.taxonomicStatus !== 'ACCEPTED' || original[term('class')] !== 'Aves') return fail('exact-reviewed-taxon');
  if (record.basisOfRecord !== 'HUMAN_OBSERVATION' || original[term('basisOfRecord')] !== 'HumanObservation' || record.occurrenceStatus !== 'PRESENT' || original[term('occurrenceStatus')] !== 'PRESENT') return fail('positive-human-observation');
  const id = original[term('occurrenceID')];
  if (typeof id !== 'string' || !/^URN:catalog:CLO:EBIRD(?:_ATL_[A-Z]{2})?:OBS\d+$/u.test(id) || id !== record.occurrenceID || original['http://rs.gbif.org/terms/1.0/gbifID'] !== String(record.key)) return fail('stable-original-occurrence-identity');
  if (record.institutionCode !== 'CLO' || record.collectionCode !== collection || record.class !== 'Aves' || record.taxonKey !== taxonKey || original[term('catalogNumber')] !== record.catalogNumber || original['http://purl.org/dc/terms/identifier'] !== record.identifier || id !== 'URN:catalog:CLO:' + collection + ':' + String(original[term('catalogNumber')])) return fail('publisher-classification-or-catalog-identity');
  const classification = record.classifications;
  if (!classification || typeof classification !== 'object' || !Object.keys(classification).length) return fail('missing-reviewed-classifications');
  for (const value of Object.values(classification)) {
    const c = value as {taxonomicStatus?: unknown; acceptedUsage?: {genericName?: unknown; specificEpithet?: unknown}};
    if (c.taxonomicStatus !== 'ACCEPTED' || String(c.acceptedUsage?.genericName) + ' ' + String(c.acceptedUsage?.specificEpithet) !== scientificName) return fail('contradictory-accepted-classification');
  }
  if (record.locality !== original[term('locality')] || record.recordedBy !== original[term('recordedBy')]) return fail('original-interpreted-context-conflict');
  const date = ebirdOriginalDate(original);
  if (!date || record.eventDate !== date || record.year !== Number(original[term('year')]) || record.month !== Number(original[term('month')]) || record.day !== Number(original[term('day')])) return fail('original-calendar-date');
  const count = original[term('individualCount')];
  if (count !== undefined && count !== '' && (typeof count !== 'string' || !/^\d+$/u.test(count) || !Number.isSafeInteger(Number(count)) || Number(count) <= 0 || record.individualCount !== Number(count))) return fail('contradictory-or-invalid-positive-count');
  for (const [field, limit] of [['decimalLatitude', 90], ['decimalLongitude', 180]] as const) {
    const value = original[term(field)];
    if (value !== undefined && value !== '' && (typeof value !== 'string' || !/^-?\d+(\.\d+)?$/u.test(value) || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > limit || record[field] !== Number(value))) return fail('original-interpreted-coordinate-conflict');
  }
  if (record.license !== EBIRD_LICENSE) return fail('reviewed-license');
  if (!Array.isArray(record.issues) || record.issues.some(issue => !['CONTINENT_DERIVED_FROM_COORDINATES', 'TAXON_CONCEPT_ID_NOT_FOUND'].includes(String(issue)))) return fail('unreviewed-quality-flag');
  if (record.captive === true || original[term('occurrenceStatus')] === 'ABSENT') return fail('explicit-captivity-or-negative');
  const state = original[term('stateProvince')], countyName = original[term('county')];
  if (typeof state !== 'string' || typeof countyName !== 'string' || record.stateProvince !== state || record.county !== countyName) return fail('original-interpreted-geography-conflict');
  const matches = counties.filter(c => c.status === 'active' && normalizedName(c.stateName) === normalizedName(state) && [c.shortName, c.legalName, ...c.aliases].some(n => normalizedName(n) === normalizedName(countyName)));
  if (matches.length !== 1) return fail('nonunique-or-retired-publisher-county');
  // These fields match retained dataset annotations. That correlation is not
  // proof of individual eBird review, nor permission to ignore a different flag.
  for (const [field, namespace, expected] of [['status', 'citizenScience.gbif.org', 'not_reviewed'], ['crawl_attempt', 'crawler.gbif.org', '24'], ['omitFromScheduledCrawl', 'crawler.gbif.org', 'true']]) {
    if (original['http://unknown.org/' + field] !== expected || record['http://unknown.org/' + field] !== expected || !machineTags.some(t => t.name === field && t.namespace === namespace && t.value === expected && Number.isFinite(Date.parse(t.created)) && (field !== 'status' || Date.parse(t.created) < Date.parse(date)))) return fail('unqualified-dataset-annotation');
  }
  return {county: matches[0], date, reason: null};
}

const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const safePath = z.string().regex(/^[a-zA-Z0-9.][a-zA-Z0-9_./-]+$/u).refine(p => !p.split('/').includes('..') && !p.includes('//'));
const fileSchema = z.object({path: safePath, bytes: z.number().int().positive().max(20000000), sha256: hash}).strict();
export type EbirdFile = z.infer<typeof fileSchema>;
const methodPath = safePath.refine(p => /^src\/data\/research\/source-method-reviews\/ebird-original-[a-z0-9-]+\.json$/u.test(p));
export const ebirdParametersSchema = z.object({mode: z.literal(EBIRD_MODE), stateCode: z.string().regex(/^[A-Z]{2}$/u), methodReviewPath: methodPath, methodReviewSha256: hash, candidatePairs: z.array(z.string().regex(/^\d{5}:[a-z0-9-]+$/u)).min(1).max(5000), candidateLimit: z.number().int().positive().max(5000)}).strict();
export type EbirdPlan = Pick<z.infer<typeof ebirdParametersSchema>, 'methodReviewPath' | 'methodReviewSha256'>;
export function readEbirdPinned(ref: EbirdFile, read: Read) {
  const parsed = fileSchema.parse(ref), bytes = read(parsed.path);
  check(bytes.length === parsed.bytes && sha256(bytes) === parsed.sha256, 'pinned bytes differ: ' + parsed.path);
  return bytes;
}
export function readEbirdArchive(ref: EbirdFile, read: Read): Read {
  const doc = z.object({schemaVersion: z.literal(1), files: z.array(z.object({originalPath: safePath, bytes: z.number().int().nonnegative().max(20000000), sha256: hash, encoding: z.literal('base64'), contents: z.string()}).strict())}).passthrough().parse(JSON.parse(text(gunzipSync(readEbirdPinned(ref, read), {maxOutputLength: 30000000}))));
  const files = new Map<string, Buffer>();
  for (const f of doc.files) {
    const b = Buffer.from(f.contents, 'base64');
    check(!files.has(f.originalPath) && b.length === f.bytes && sha256(b) === f.sha256, 'embedded source bytes differ: ' + f.originalPath);
    files.set(f.originalPath, b);
  }
  return p => {const b = files.get(p); check(b, 'missing embedded source file: ' + p); return b;};
}

const pairKeySchema = z.string().regex(/^\d{5}:[a-z0-9-]+$/u);
const commitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const acquisitionSchema = z.object({name: z.enum(['search','verbatim-first','verbatim-rest','metadata','context']), archive: fileSchema, receipt: fileSchema, recipe: fileSchema, repositoryBaseCommit: commitSchema.nullable()}).strict();
const independentSchema = z.object({actorId: z.string().min(1), baseSha: commitSchema, originalCommit: commitSchema, proposal: fileSchema, recipe: fileSchema, retention: fileSchema}).strict();
const methodSchema = z.object({schemaVersion: z.literal(1), methodVersion: z.literal(EBIRD_METHOD), sourceId: z.literal(EBIRD_SOURCE), datasetKey: z.literal(EBIRD_DATASET), sourceYear: z.literal(2024), status: z.literal('approved-with-specific-holds'), reviewedBy: z.literal('MAIN'), reviewedAt: z.string().datetime(), acquisitions: z.array(acquisitionSchema).length(5), independentReviews: z.array(independentSchema).min(2), taxa: z.record(z.string(), z.object({scientificName:z.string().min(1),taxonKey:z.number().int().positive()}).strict()), approvedPairs: z.array(pairKeySchema).min(1), heldPairs: z.array(pairKeySchema), attribution: z.string().min(1), rationale: z.string().min(1), limitations: z.array(z.string().min(1)).min(1)}).strict();
const pairReviewSchema = z.object({pairKey:pairKeySchema, primaryKey:z.number().int().positive().nullable(), recordKeys:z.array(z.number().int().positive()).min(1), heldKeys:z.array(z.number().int().positive()), disposition:z.enum(['supported','held'])}).strict();
const adapterReviewSchema = z.object({actorId:z.string().min(1),baseSha:commitSchema,status:z.literal('proposal-ready-main-method-required'),pairs:z.array(pairReviewSchema).min(1)}).strict();
const responseSchema = fileSchema.extend({url:z.url(),status:z.literal(200),retrievedAt:z.string().datetime(),decodedBytes:z.number().int().positive().max(20000000),decodedSha256:hash}).passthrough();
const fileOnly = ({path,bytes,sha256}:EbirdFile):EbirdFile => ({path,bytes,sha256});
const unique = <T,>(values:T[]) => new Set(values).size === values.length;
const sortedKeys = (keys:number[]) => [...keys].sort((a,b)=>a-b);

export function loadEbirdMethod(plan:EbirdPlan, read:Read) {
  methodPath.parse(plan.methodReviewPath); hash.parse(plan.methodReviewSha256);
  const methodBytes=read(plan.methodReviewPath); check(sha256(methodBytes)===plan.methodReviewSha256,'method approval hash differs');
  const method=methodSchema.parse(JSON.parse(text(methodBytes)));
  check(unique(method.acquisitions.map(a=>a.name)),'duplicate acquisition profile');
  const archiveReaders=new Map<string,Read>();
  const acquired=method.acquisitions.map(a=>{
    let retained=archiveReaders.get(a.archive.sha256); if(!retained){retained=readEbirdArchive(a.archive,read);archiveReaders.set(a.archive.sha256,retained);}
    const receipt=JSON.parse(text(readEbirdPinned(a.receipt,retained)));
    readEbirdPinned(a.recipe,retained);
    check(receipt.recipe?.path===a.recipe.path&&receipt.recipe?.sha256===a.recipe.sha256&&receipt.providerWrites===0&&receipt.automaticRetries===0,'acquisition code or request lineage differs');
    check(a.repositoryBaseCommit===null?receipt.repositoryBaseCommit===undefined:receipt.repositoryBaseCommit===a.repositoryBaseCommit,'actual acquisition repository identity differs');
    check(Date.parse(receipt.startedAt)<=Date.parse(receipt.finishedAt)&&Date.parse(receipt.finishedAt)<=Date.parse(method.reviewedAt),'acquisition chronology differs');
    const responses=z.array(responseSchema).min(1).parse(a.name==='metadata'?receipt.receipts:receipt.responses);
    const decoded=new Map<string,Buffer>();
    for(const ref of responses){
      check((ref.finalUrl===undefined||ref.finalUrl===ref.url)&&Date.parse(receipt.startedAt)<=Date.parse(ref.retrievedAt)&&Date.parse(ref.retrievedAt)<=Date.parse(receipt.finishedAt),'source response identity or chronology differs');
      const b=gunzipSync(readEbirdPinned(fileOnly(ref),retained),{maxOutputLength:20000000});
      check(b.length===ref.decodedBytes&&sha256(b)===ref.decodedSha256&&!decoded.has(ref.path),'decoded source response differs');decoded.set(ref.path,b);
    }
    return {definition:a,receipt,responses,decoded};
  });
  const byName=(name:z.infer<typeof acquisitionSchema>['name'])=>acquired.find(a=>a.definition.name===name)!;
  const search=byName('search');
  check(search.receipt.kind==='ebird-public-field-inspection-pilot'&&search.receipt.paginationComplete===true&&search.receipt.errors.length===0&&search.responses.length===1,'complete bounded public search receipt differs');
  const sr=search.responses[0],url=new URL(sr.url),parameters=search.receipt.parameters;
  check(url.origin==='https://api.gbif.org'&&url.pathname==='/v1/occurrence/search'&&stableJson(Object.fromEntries(url.searchParams))===stableJson(parameters)&&parameters.datasetKey===EBIRD_DATASET&&parameters.country==='US'&&parameters.year===String(method.sourceYear)&&parameters.offset==='0'&&parameters.limit==='300','exact original source query differs');
  const page=JSON.parse(text(search.decoded.get(sr.path)!));
  const rows=z.array(z.record(z.string(),z.unknown())).min(1).max(300).parse(page.results);
  check(page.offset===0&&page.limit===300&&page.endOfRecords===true&&page.count===rows.length&&search.receipt.count===rows.length&&search.receipt.rows===rows.length&&unique(rows.map(r=>r.key)),'single-page bounded completeness differs');
  const first=byName('verbatim-first'),rest=byName('verbatim-rest');
  check(first.receipt.kind==='ebird-public-original-field-inspection-pilot'&&rest.receipt.kind===first.receipt.kind&&first.responses.length===1&&first.receipt.completed===false&&rest.receipt.completed===true,'retained verbatim acquisition profile differs');
  check(first.receipt.errors.length===1&&first.receipt.errors[0].message.includes('assert(parsed.core')&&rest.receipt.errors.length===0,'original parser failure or recovery lineage differs');
  for(const v of [first,rest])check(v.receipt.parentReceipt.path===search.definition.receipt.path&&v.receipt.parentReceipt.sha256===search.definition.receipt.sha256,'verbatim parent search differs');
  const originals=new Map<number,{record:EbirdRecord;response:z.infer<typeof responseSchema>}>();
  for(const a of [first,rest])for(const ref of a.responses){
    const record=z.record(z.string(),z.unknown()).parse(JSON.parse(text(a.decoded.get(ref.path)!))),key=z.number().int().positive().parse(record.key);
    check(ref.key===key&&ref.url==='https://api.gbif.org/v1/occurrence/'+key+'/verbatim'&&!originals.has(key),'verbatim record locator differs');originals.set(key,{record,response:ref});
  }
  check(originals.size===rows.length&&rows.every(r=>originals.has(Number(r.key))),'original record coverage differs');
  const metadata=byName('metadata'),datasetRefs=metadata.responses.filter(r=>r.url==='https://api.gbif.org/v1/dataset/'+EBIRD_DATASET);
  check(metadata.receipt.kind==='gbif-ebird-public-taxonomy-discovery'&&metadata.receipt.errors.length===0&&datasetRefs.length===1,'dataset acquisition differs');
  const dataset=JSON.parse(text(metadata.decoded.get(datasetRefs[0].path)!));
  check(dataset.key===EBIRD_DATASET&&dataset.license===EBIRD_LICENSE&&dataset.doi==='10.15468/aomfnb'&&dataset.publishingOrganizationKey==='e2e717bf-551a-4917-bdc9-4fa0f342c530','publisher, dataset or rights differ');
  const tags=z.array(z.object({name:z.string(),value:z.string(),namespace:z.string(),created:z.string()}).passthrough()).parse(dataset.machineTags);
  const context=byName('context'),expectedContext=[
    'https://api.gbif.org/v1/dataset/'+EBIRD_DATASET+'/document',
    'https://gbif.github.io/gbif-api/apidocs/src-html/org/gbif/api/vocabulary/TagName.html',
    'https://support.ebird.org/en/support/solutions/articles/48000795278-the-ebird-review-process',
    'https://support.ebird.org/en/support/solutions/articles/48000948757-ebird-faqs',
    'https://support.ebird.org/en/support/solutions/articles/48000838205-download-ebird-data',
  ];
  check(context.receipt.kind==='ebird-source-method-public-context'&&context.definition.repositoryBaseCommit===null&&context.receipt.errors.length===0&&stableJson(context.responses.map(r=>r.url).sort())===stableJson(expectedContext.sort()),'primary method context differs');
  const reviews=method.independentReviews.map(ref=>{
    const proposal=JSON.parse(text(readEbirdPinned(ref.proposal,read))),review=adapterReviewSchema.parse(proposal.adapterReview),retention=JSON.parse(text(readEbirdPinned(ref.retention,read)));
    readEbirdPinned(ref.recipe,read);
    check(review.actorId===ref.actorId&&review.baseSha===ref.baseSha&&ref.actorId!=='MAIN','independent reviewer identity differs');
    check(retention.kind==='main-retained-independent-method-proposal'&&retention.originalCommit===ref.originalCommit&&retention.actorId===ref.actorId&&retention.baseSha===ref.baseSha&&stableJson(retention.files)===stableJson([ref.proposal,ref.recipe])&&retention.acceptedDeterminations===0&&retention.canonicalEvents===0,'independent proposal retention lineage differs');
    check(Date.parse(retention.recordedAt)<=Date.parse(method.reviewedAt)&&retention.mainOfflineVerification.passed===true,'independent reproduction or chronology differs');
    return {definition:ref,review};
  });
  check(unique(reviews.map(r=>r.definition.actorId)),'reviewers are not distinct');
  const pairReviews=reviews.flatMap(r=>r.review.pairs.map(p=>({...p,actorId:r.definition.actorId})));
  check(unique(pairReviews.map(p=>p.pairKey))&&stableJson(pairReviews.filter(p=>p.disposition==='supported').map(p=>p.pairKey).sort())===stableJson(method.approvedPairs)&&stableJson(pairReviews.filter(p=>p.disposition==='held').map(p=>p.pairKey).sort())===stableJson(method.heldPairs),'approved and held review scope differs');
  const keys=pairReviews.flatMap(p=>p.recordKeys);
  check(unique(keys)&&stableJson(sortedKeys(keys))===stableJson(sortedKeys(rows.map(r=>Number(r.key)))),'all material original records must retain independent review');
  for(const p of pairReviews){check(unique(p.recordKeys)&&stableJson(p.recordKeys)===stableJson(sortedKeys(p.recordKeys))&&unique(p.heldKeys)&&stableJson(p.heldKeys)===stableJson(sortedKeys(p.heldKeys))&&p.heldKeys.every(k=>p.recordKeys.includes(k)),'review record scope differs');check(p.disposition==='held'?p.primaryKey===null:p.primaryKey!==null&&p.recordKeys.includes(p.primaryKey)&&!p.heldKeys.includes(p.primaryKey),'primary witness is not independently supported');}
  return {method,acquired,search,response:sr,rows,originals,tags,reviews,pairReviews};
}

export function ebirdInputPaths(plan:EbirdPlan, read:Read) {
  const {method}=loadEbirdMethod(plan,read);
  return [...new Set(['src/lib/research/ebird-original-observations.ts','scripts/research/adapters/ebird-original-observations.ts',plan.methodReviewPath,...method.acquisitions.map(a=>a.archive.path),...method.independentReviews.flatMap(r=>[r.proposal.path,r.recipe.path,r.retention.path])])].sort();
}
export function buildEbirdResult(context:SourceAdapterContext, read:Read):SourceAdapterResult {
  const p=ebirdParametersSchema.parse(context.parameters),loaded=loadEbirdMethod(p,read),{method,rows,originals,pairReviews}=loaded;
  z.string().datetime().parse(context.runStartedAt);
  check(context.sourceId===EBIRD_SOURCE&&context.stateCode===p.stateCode&&Date.parse(method.reviewedAt)<=Date.parse(context.runStartedAt),'run identity or chronology differs');
  const requested=context.requestedPairs.map(r=>r.countyFips+':'+r.speciesId).sort();
  check(unique(requested)&&stableJson(requested)===stableJson(p.candidatePairs)&&p.candidateLimit===requested.length&&requested.every(k=>method.approvedPairs.includes(k)&&!method.heldPairs.includes(k)),'requested approved scope differs');
  const counties=JSON.parse(text(read('src/data/research/county-equivalent-registry.json'))).countyEquivalents as EbirdCounty[];
  const recordByKey=new Map(rows.map(r=>[Number(r.key),r]));
  const resolved=new Map<number,ReturnType<typeof qualifyEbirdOriginal>>();
  for(const review of pairReviews){
    const [countyFips,speciesId]=review.pairKey.split(':'),taxon=method.taxa[speciesId];check(taxon,'unreviewed taxon');
    for(const key of review.recordKeys){
      const record=recordByKey.get(key)!,original=originals.get(key)!,value=qualifyEbirdOriginal(record,original.record,counties,taxon.scientificName,taxon.taxonKey,loaded.tags);
      check(record.year===method.sourceYear&&record.speciesKey===Number(loaded.search.receipt.parameters.taxonKey),'record differs from acquired search predicate');
      if(!review.heldKeys.includes(key)&&review.disposition==='supported')check(value.reason===null&&value.county?.countyFips===countyFips&&Date.parse(value.date!)<=Date.parse(original.response.retrievedAt),'supported original witness fails: '+key+' '+value.reason);
      resolved.set(key,value);
    }
  }
  const result:SourceAdapterResult={completedAt:context.runStartedAt,assertions:[],reviews:[],rejections:[],outcomes:[],artifacts:[],upstreamRequests:[],candidateRecordCount:0,duplicateRecordCount:0,errors:[],warnings:method.limitations};
  const actor=EBIRD_ADAPTER+'@'+EBIRD_VERSION,eventId=(name:string,value:unknown)=>name+'-'+sha256(stableJson(value)),witnesses:unknown[]=[];
  for(const target of context.requestedPairs){
    const pair=target.countyFips+':'+target.speciesId,review=pairReviews.find(r=>r.pairKey===pair)!,taxon=method.taxa[target.speciesId];
    check(taxon.scientificName===target.scientificName&&review.disposition==='supported'&&review.primaryKey!==null,'target differs from reviewed source');
    const primary=recordByKey.get(review.primaryKey)!,original=originals.get(review.primaryKey)!,qualified=resolved.get(review.primaryKey)!;
    check(qualified.county?.stateCode===p.stateCode&&qualified.county.countyFips===target.countyFips,'target source county/state differs');
    const accepted=review.recordKeys.filter(key=>!review.heldKeys.includes(key)),dates=accepted.map(key=>resolved.get(key)!.date!).sort();
    const sourceRows=review.recordKeys.map(key=>({key,disposition:review.heldKeys.includes(key)?'independent-record-hold':'supported-historical-occurrence',originalResponse:fileOnly(originals.get(key)!.response),originalResponseDecodedSha256:originals.get(key)!.response.decodedSha256,originalFields:originals.get(key)!.record,interpretedFields:recordByKey.get(key)!}));
    const payload={pairKey:pair,methodReviewPath:p.methodReviewPath,methodReviewSha256:p.methodReviewSha256,searchResponseSha256:loaded.response.sha256,primaryKey:review.primaryKey,acceptedKeys:accepted,heldKeys:review.heldKeys,originalResponseHashes:sourceRows.map(r=>({key:r.key,sha256:r.originalResponse.sha256}))};
    const assertionId=eventId('ebird-original-assertion',{runId:context.runId,...payload}),url='https://www.gbif.org/occurrence/'+review.primaryKey,caveats=[method.attribution,...method.limitations];
    result.assertions.push({schemaVersion:1,eventId:assertionId,event_type:'evidence.asserted',created_at:context.runStartedAt,actor_type:'adapter',actor_id:actor,run_id:context.runId,source_id:EBIRD_SOURCE,state_code:p.stateCode,county_fips:target.countyFips,species_id:target.speciesId,claim_type:'recorded-present',evidence_kind:'occurrence',scope:'point',source_record_id:String(primary.occurrenceID),source_url:url,source_record_date:qualified.date!,retrieved_at:original.response.retrievedAt,
      taxon_match:{method:'Independently reviewed exact original binomial, accepted GBIF species key and retained taxonomic classifications; unresolved Avibase concept annotation retained.',target_scientific_name:target.scientificName,source_scientific_name:String(original.record[term('scientificName')]),source_taxon_key:String(taxon.taxonKey)},
      geography_match:{method:'Exact original publisher county name or registered alias within its original state resolves uniquely to an active county. Coordinates are consistency evidence only; missing uncertainty does not change this county authority.',source_state:String(original.record[term('stateProvince')]),source_county:String(original.record[term('county')]),county_fips:target.countyFips},
      temporal_scope:'Selected original observation date '+qualified.date+'; additional reviewed records span '+dates[0]+' through '+dates.at(-1)+'.',spatial_scope:'Recorded bird observation locations in the explicit publisher county; no countywide abundance or prevalence claim.',survey_scope:'Annual EOD occurrence records without sampling-effort or complete-checklist metadata.',normalized_payload_hash:sha256(stableJson(payload)),caveats,notes:['Independent source review actor: '+review.actorId+'. Machine validation reconstructs that reviewed source contract; it does not claim individual human expert approval.','Distinct source records may share birds or observation events; counts are not summed.','Original source fields and response hashes: ebird-original-witnesses.json.']});
    result.reviews.push({schemaVersion:1,eventId:eventId('ebird-original-review',{assertionId}),event_type:'evidence.reviewed',created_at:context.runStartedAt,actor_type:'adapter',actor_id:actor,run_id:context.runId,source_id:EBIRD_SOURCE,state_code:p.stateCode,county_fips:target.countyFips,species_id:target.speciesId,references:{assertion_event_id:assertionId},review_level:'machine-validated',decision:'accepted',publication_eligible:true,reason_codes:['exact-original-taxon','exact-publisher-county','positive-human-observation','independent-original-field-review','qualified-dataset-metadata'],notes:['Original and interpreted source bytes, current registry identity and independently selected witness were reconstructed offline.']});
    const rejectionIds:string[]=[];
    if(review.heldKeys.length){const id=eventId('ebird-original-rejection',{runId:context.runId,pair,keys:review.heldKeys});rejectionIds.push(id);result.rejections.push({schemaVersion:1,rejection_id:id,created_at:context.runStartedAt,actor_type:'adapter',actor_id:actor,run_id:context.runId,source_id:EBIRD_SOURCE,candidate_locator:loaded.response.path+'#keys='+review.heldKeys.join(','),candidate_taxon:target.scientificName,candidate_geography:target.countyFips,normalized_target:{state_code:p.stateCode,county_fips:target.countyFips,species_id:target.speciesId},reason_code:'record-failed',supporting_notes:['Independent original-field record holds are retained in the pinned proposal; no negative determination follows.']});}
    result.outcomes.push({schemaVersion:1,outcome_id:eventId('ebird-original-outcome',{runId:context.runId,pair}),run_id:context.runId,source_id:EBIRD_SOURCE,state_code:p.stateCode,county_fips:target.countyFips,species_id:target.speciesId,status:'evidence-found',scope_complete:true,recorded_at:context.runStartedAt,assertion_event_ids:[assertionId],rejection_ids:rejectionIds,query_urls:[loaded.response.url,original.response.url],notes:['All retained original records for this selected positive pair in the bounded 2024 single-page source query were reviewed. This completes that source-record scope only, not all years, all EOD records or a county research protocol.']});
    result.candidateRecordCount+=review.recordKeys.length;
    witnesses.push({...payload,independentActor:review.actorId,selectedDate:qualified.date,selectedRecordUrl:url,sourceRows});
  }
  result.artifacts.push({filename:'ebird-original-witnesses.json',mediaType:'application/json',contents:JSON.stringify({schemaVersion:1,method:EBIRD_METHOD,methodReviewPath:p.methodReviewPath,methodReviewSha256:p.methodReviewSha256,datasetKey:EBIRD_DATASET,datasetDoi:'10.15468/aomfnb',license:EBIRD_LICENSE,acquisitions:method.acquisitions,sourceQuery:loaded.response,witnesses,qualification:'Original raw HTTP response bytes remain in the hash-pinned archives. Parsed fields here are derived representations. Offline run code identity is distinct from original acquisition code; no new provider request occurred.'},null,2)+'\n'});
  return result;
}
