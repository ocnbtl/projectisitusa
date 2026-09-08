import { resolveCountyEquivalent } from "@/lib/research/geography-registry";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { buildEpaNrsa1819Result as build, loadEpaNrsa1819Method as load, epaNrsa1819InputPaths as inputs } from '@/lib/research/epa-nrsa-1819-fish-counts';
import { sha256, stableJson } from '@/lib/research/run-files';
import { compileAdditiveResearchEvidence } from '@/lib/research/compile-evidence';
import type { SourceAdapterContext } from '@/lib/research/source-adapter';
const read = (p: string) => readFileSync(p), json = (p: string) => JSON.parse(read(p).toString('utf8').replace(/^\uFEFF/u, ''));
const methodPath = 'src/data/research/source-method-reviews/epa-nrsa-fish-counts-1819-20260908-r20.json', method = json(methodPath), plan = {methodReviewPath: methodPath, methodReviewSha256: sha256(read(methodPath))};
const loaded = load(plan, read), counties = new Map<string, string>(json('src/data/research/county-equivalent-registry.json').countyEquivalents.map((c: {countyFips: string; stateCode: string}) => [c.countyFips, c.stateCode]));
const states = [...new Set<string>(method.approvedPairs.map((key: string) => counties.get(key.split(':')[0])))].sort();
const make = (stateCode: string): SourceAdapterContext => {
 const pairs = method.approvedPairs.filter((key: string) => counties.get(key.split(':')[0]) === stateCode);
 return {runId: 'epa-nrsa-fixture-' + stateCode, sourceId: 'epa-nrsa-fish-counts', stateCode, runStartedAt: '2026-09-08T23:59:00.000Z', parameters: {mode: 'retained-reviewed-fish-counts-1819', stateCode, ...plan, candidatePairs: pairs, candidateLimit: pairs.length}, requestedPairs: pairs.map((key: string) => {const [countyFips, speciesId] = key.split(':'); return {countyFips, speciesId, countyName: 'Pinned registry', scientificName: method.taxa[speciesId]};})};
};
const schemas = Object.fromEntries(['evidence-assertion', 'review-event', 'pair-outcome', 'rejection-record'].map(name => {const s = json('src/data/research/schemas/' + name + '.schema.json'); delete s.allOf; return [name, z.fromJSONSchema(s)];}));
const originalFetch = globalThis.fetch; globalThis.fetch = async () => {throw Error('EPA retained replay attempted HTTP');};
const checks: unknown[] = [], rejected: string[] = []; let assertions = 0, sourceRows = 0, positiveRows = 0, rejections = 0, primaryDateDifferences = 0;
function reject(name: string, action: () => unknown) {assert.throws(action, name); rejected.push(name);}
function mutate(name: string, change: (m: typeof method, overrides: Map<string, Buffer>) => void) {const m = structuredClone(method), overrides = new Map<string, Buffer>(); change(m, overrides); const b = Buffer.from(JSON.stringify(m)), context = make('AR'); context.parameters.methodReviewSha256 = sha256(b); overrides.set(methodPath, b); reject(name, () => build(context, p => overrides.get(p) ?? read(p)));}
function reviewChange(m: typeof method, overrides: Map<string, Buffer>, change: (r: any) => void) {const ref = m.independentReviews[0], r = json(ref.path); change(r); const b = Buffer.from(JSON.stringify(r)); overrides.set(ref.path, b); Object.assign(ref, {bytes: b.length, sha256: sha256(b)});}
try {
 assert.equal(loaded.method.approvedPairs.length, 293); assert.deepEqual(loaded.method.heldPairs, ['05143:hypophthalmichthys-molitrix','12055:clarias-batrachus','31089:ctenopharyngodon-idella','31089:hypophthalmichthys-molitrix','39063:cyprinus-carpio']); assert.equal(states.length, 40);
 for (const state of states) {
  const context = make(state), r = build(context, read), artifact = JSON.parse(r.artifacts[0].contents.toString());
  assert.equal(r.assertions.length, context.requestedPairs.length); assert.equal(r.reviews.length, r.assertions.length); assert.equal(r.outcomes.length, r.assertions.length); assert.equal(r.errors.length, 0); assert.equal(r.upstreamRequests.length, 0);
  for (const [name, records] of [['evidence-assertion', r.assertions], ['review-event', r.reviews], ['pair-outcome', r.outcomes], ['rejection-record', r.rejections]] as const) for (const record of records) schemas[name].parse(record);
  for (const w of artifact.witnesses) {
   const a = r.assertions.find(a => a.county_fips + ':' + a.species_id === w.pairKey)!; assert(a && a.claim_type === 'recorded-present'); assert(!method.heldPairs.includes(w.pairKey));
   const county = resolveCountyEquivalent({stateCode: state, countyName: a.geography_match.source_county, sourceId: 'epa-nrsa-fish-counts'}); assert(county.status === 'resolved' && county.county.countyFips === a.county_fips, 'canonical source county name must resolve');
   const positive = w.sourceRows.filter((x: {disposition: string}) => x.disposition === 'positive'), primary = positive.find((x: any) => x.fish.parsedRowIndexZeroBased === w.primary.fish.parsedRowIndexZeroBased);
   assert(primary); assert.deepEqual(primary.fish, w.primary.fish); assert.deepEqual(primary.site, w.primary.site); assert.deepEqual(primary.sampling, w.primary.sampling); assert.deepEqual(primary.taxon2023, w.primary.taxon2023); assert.deepEqual(primary.taxon2013, w.primary.taxon2013); assert.equal(primary.date, w.primary.date);
   const latest = positive.map((x: {date: string}) => x.date).sort().at(-1); assert.equal(a.source_record_date, latest); if (latest !== w.primary.date) primaryDateDifferences++;
   for (const row of positive) {assert.equal(row.sampling.sourceFields.FISH_SAMPLING, undefined); assert.equal(row.fish.sourceFields.IS_DISTINCT, '1');} positiveRows += positive.length;
  }
  const projection = compileAdditiveResearchEvidence({bootstrapEvidence: [], runAssertions: r.assertions, reviewEvents: r.reviews, sources: json('src/data/research/source-registry.json').sources, asOf: '2026-09-08'});
  assert.equal(projection.runEvidence.length, r.assertions.length); assert(projection.runEvidence.every(e => e.caveat.includes('Environmental Protection Agency')));
  if (['AR', 'KS', 'FL'].includes(state)) assert.equal(stableJson(build(context, read)), stableJson(r), 'deterministic ' + state);
  assertions += r.assertions.length; sourceRows += r.candidateRecordCount; rejections += r.rejections.length; checks.push({state, assertions: r.assertions.length, sourceRows: r.candidateRecordCount, rejections: r.rejections.length});
 }
 assert.equal(assertions, 293);
 for (const [name, change] of [
  ['source', (c: SourceAdapterContext) => {c.sourceId = 'other';}], ['state', (c: SourceAdapterContext) => {c.stateCode = 'KS';}], ['limit', (c: SourceAdapterContext) => {c.parameters.candidateLimit = 99;}],
  ['method hash', (c: SourceAdapterContext) => {c.parameters.methodReviewSha256 = 'a'.repeat(64);}], ['method path', (c: SourceAdapterContext) => {c.parameters.methodReviewPath = '../method.json';}],
  ['taxon', (c: SourceAdapterContext) => {c.requestedPairs[0].scientificName = 'Cyprinus sp.';}], ['chronology', (c: SourceAdapterContext) => {c.runStartedAt = '2026-09-07T00:00:00.000Z';}], ['negative mode', (c: SourceAdapterContext) => {c.parameters.mode = 'absent';}],
  ['duplicate pair', (c: SourceAdapterContext) => {c.requestedPairs.push(c.requestedPairs[0]);}], ['extra parameter', (c: SourceAdapterContext) => {c.parameters.allowAbsence = true;}]
 ] as const) {const context = make('AR'); change(context); reject(name, () => build(context, read));}
 const held = make('AR'); held.requestedPairs = [{countyFips: '05143', speciesId: 'hypophthalmichthys-molitrix', countyName: 'Washington', scientificName: 'Hypophthalmichthys molitrix'}]; held.parameters.candidatePairs = ['05143:hypophthalmichthys-molitrix']; held.parameters.candidateLimit = 1; reject('explicit county hold', () => build(held, read));
 for (const p of inputs(plan, read).filter(p => !p.endsWith('.ts'))) reject('pinned input ' + p, () => build(make('AR'), q => q === p ? Buffer.from('changed') : read(q)));
 mutate('unreviewed pair', m => m.approvedPairs.push('01001:cyprinus-carpio'));
 mutate('acquisition lineage', m => {m.acquisitions[0].repositoryBaseCommit = 'a'.repeat(40);});
 mutate('profile duplicate', m => {m.profiles[1] = m.profiles[0];});
 mutate('profile row count', m => {m.profiles[0].rowCount++;});
 mutate('profile columns', m => {m.profiles[0].columns.reverse();});
 mutate('profile URL identity', m => {m.profiles[0].name = 'siteinfo';});
 mutate('profile decoded hash', m => {m.profiles[0].decodedSha256 = 'a'.repeat(64);});
 mutate('held row identity', m => {m.heldFishRows[0].rawRecordSha256 = 'a'.repeat(64);});
 mutate('review actor MAIN', (m, o) => reviewChange(m, o, r => {r.actorId = 'MAIN';}));
 mutate('review actor duplicate', (m, o) => reviewChange(m, o, r => {r.actorId = json(m.independentReviews[1].path).actorId;}));
 mutate('review predates source', (m, o) => reviewChange(m, o, r => {r.recordedAt = '2026-09-07T00:00:00.000Z';}));
 mutate('review lease scope', (m, o) => reviewChange(m, o, r => {r.leasedPairs.pop();}));
 mutate('review acquisition', (m, o) => reviewChange(m, o, r => {r.acquisitionReceiptSha256 = 'a'.repeat(64);}));
 for (const table of ['fish', 'sampling', 'site', 'taxon2023', 'taxon2013']) for (const field of ['parsedRowIndexZeroBased', 'physicalEndLineOneBased', 'rawRecordSha256', 'sourceFields']) mutate('review ' + table + ' ' + field, (m, o) => reviewChange(m, o, r => {r.witnesses[0][table][field] = field === 'rawRecordSha256' ? 'a'.repeat(64) : field === 'sourceFields' ? {forged: 'yes'} : 0;}));
 mutate('primary date', (m, o) => reviewChange(m, o, r => {r.witnesses[0].date = '2024-01-01';}));
 mutate('primary count', (m, o) => reviewChange(m, o, r => {r.witnesses[0].total++;}));
 mutate('site BOM profile', m => {m.profiles.find((p:any) => p.name === 'siteinfo').headerBom = false;});
 mutate('historical taxon mismatch', m => {Object.values<any>(m.taxonReviews)[0].taxon2013.sourceFields.GENUS = 'OTHER';});
 mutate('missing manual corroboration', m => {m.manualTaxonomy.sha256 = 'a'.repeat(64);});
 mutate('original proposal byte pin', (m,o) => reviewChange(m,o,r => {r.originalProposal.sha256 = 'a'.repeat(64);}));
 mutate('removed original hold', (m,o) => {m.heldPairs.shift(); reviewChange(m,o,r => {r.heldPairs.shift();});});
 function manualChange(name: string, change:(r:any)=>void) {mutate(name,(m,o)=>{const r=json(m.manualTaxonomy.path);change(r);const b=Buffer.from(JSON.stringify(r));o.set(m.manualTaxonomy.path,b);Object.assign(m.manualTaxonomy,{bytes:b.length,sha256:sha256(b)});});}
 manualChange('manual false scientific name',r=>{r.entries[0].scientificName='Other species';});
 manualChange('manual false page',r=>{r.entries[0].pdfPageOneBased=1;});
 manualChange('manual false source PDF',r=>{r.source.sha256='a'.repeat(64);});
 manualChange('manual edited extracted line',r=>{r.entries[0].exactExtractedLine+=' invented';});
 manualChange('manual duplicate taxonomy',r=>{r.entries[1]=r.entries[0];});
 console.log(JSON.stringify({passed: true, checks, assertions, sourceRows, positiveRows, rejections, primaryDateDifferences, rejectedCases: rejected.length, rejected, deterministicStates: ['AR', 'KS', 'FL'], providerRequests: 0, newDeterminations: 0}));
} finally {globalThis.fetch = originalFetch;}
