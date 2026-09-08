import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { sha256, stableJson } from './run-files';
import { parse } from 'csv-parse/sync';
import type { SourceAdapterContext, SourceAdapterResult } from './source-adapter';

export const EPA_NRSA_SOURCE = 'epa-nrsa-fish-counts';
export const EPA_NRSA_ADAPTER = 'epa-nrsa-retained-fish-counts';
export const EPA_NRSA_VERSION = '1.0.0';
export const EPA_NRSA_METHOD = 'retained-epa-nrsa-reviewed-fish-counts-v1';
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const safePath = z.string().regex(/^[a-zA-Z0-9.][a-zA-Z0-9_./-]+$/u).refine(p => !p.split('/').includes('..') && !p.includes('//'));
const file = z.object({ path: safePath, bytes: z.number().int().positive().max(20000000), sha256: hash }).strict();
const pair = z.string().regex(/^[0-9]{5}:[a-z0-9][a-z0-9-]*$/u);
const speciesId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);
const methodPath = safePath.refine(p => /^src\/data\/research\/source-method-reviews\/epa-nrsa-fish-counts-[a-z0-9-]+\.json$/u.test(p));
export const epaNrsaParametersSchema = z.object({ mode: z.literal('retained-reviewed-fish-counts'), stateCode: z.string().regex(/^[A-Z]{2}$/u), methodReviewPath: methodPath, methodReviewSha256: hash, candidatePairs: z.array(pair).min(1).max(5000), candidateLimit: z.number().int().positive().max(5000) }).strict();
export type EpaNrsaPlan = Pick<z.infer<typeof epaNrsaParametersSchema>, 'methodReviewPath' | 'methodReviewSha256'>;
type Read = (p: string) => Buffer;
type Row = Record<string, string>;
type Entry = {record: Row; raw: Buffer; physicalEndLineOneBased: number};
export function parseEpaNrsaCsv(decoded: Buffer): Entry[] {
  text(decoded);
  assert(!(decoded[0] === 0xef && decoded[1] === 0xbb && decoded[2] === 0xbf), 'unexpected CSV BOM');
  const parsed = parse(decoded, {columns: false, skip_empty_lines: false, info: true}) as Array<{record: string[]; info: {bytes: number}}>;
  const header = parsed.shift(); assert(header && header.record.length && header.record.every(Boolean) && new Set(header.record).size === header.record.length, 'invalid CSV header');
  let cursor = 0, breaks = 0;
  const advance = (end: number) => {assert(Number.isInteger(end) && end >= cursor && end <= decoded.length, 'invalid CSV byte boundary'); for (; cursor < end; cursor++) if (decoded[cursor] === 13 || (decoded[cursor] === 10 && decoded[cursor - 1] !== 13)) breaks++;};
  advance(header.info.bytes);
  const rows = parsed.map(entry => {
    assert(entry.record.length === header.record.length, 'CSV column count differs');
    const start = cursor; advance(entry.info.bytes);
    return {record: Object.fromEntries(header.record.map((name, i) => [name, entry.record[i]])), raw: decoded.subarray(start, cursor), physicalEndLineOneBased: breaks + (cursor > 0 && decoded[cursor - 1] !== 10 && decoded[cursor - 1] !== 13 ? 1 : 0)};
  });
  assert(cursor === decoded.length, 'unparsed trailing CSV bytes'); return rows;
}
const profileNames = ['fishcount', 'fishcount_metadata', 'fishtaxa', 'fishtaxa_metadata', 'siteinfo', 'siteinfo_metadata'] as const;
const profileSchema = z.object({ name: z.enum(profileNames), path: safePath, decodedBytes: z.number().int().positive().max(20000000), decodedSha256: hash, rowCount: z.number().int().positive(), columns: z.array(z.string().min(1)).min(1) }).strict();
const locator = z.object({ parsedRowIndexZeroBased: z.number().int().nonnegative(), physicalEndLineOneBased: z.number().int().positive(), rawRecordSha256: hash, sourceFields: z.record(z.string(), z.string()) }).strict();
const witnessSchema = z.object({ pairKey: pair, fish: locator, site: locator, taxon: locator, date: z.string(), total: z.number().int().positive() }).strict();
const reviewSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('independent-epa-nrsa-fish-source-review-v1'), recordedBy: z.literal('MAIN'), actorId: z.string().min(1), recordedAt: z.string().datetime(), inputArchive: file, acquisitionReceiptSha256: hash, leasedPairs: z.array(pair).min(1), heldPairs: z.array(pair), witnesses: z.array(witnessSchema).min(1) }).passthrough();
const methodSchema = z.object({ schemaVersion: z.literal(1), methodVersion: z.literal(EPA_NRSA_METHOD), sourceId: z.literal(EPA_NRSA_SOURCE), status: z.literal('approved-with-specific-holds'), reviewedBy: z.literal('MAIN'), reviewedAt: z.string().datetime(), acquisition: z.object({ archive: file, receipt: file, recipe: file, repositoryBaseCommit: z.string().regex(/^[a-f0-9]{40}$/u) }).strict(), profiles: z.array(profileSchema).length(6), context: z.array(file).min(1), independentReviews: z.array(file).min(2), taxa: z.record(speciesId, z.string().min(1)), approvedPairs: z.array(pair).min(1), heldPairs: z.array(pair), heldFishRows: z.array(z.object({ parsedRowIndexZeroBased: z.number().int().nonnegative(), rawRecordSha256: hash, reason: z.string().min(1) }).strict()), attribution: z.string().min(1), rationale: z.string().min(1), limitations: z.array(z.string().min(1)).min(1), speciesCaveats: z.record(speciesId, z.array(z.string().min(1))), pairCaveats: z.record(pair, z.array(z.string().min(1))) }).strict();
const responseSchema = file.extend({ url: z.url(), finalUrl: z.url(), status: z.literal(200), startedAt: z.string().datetime(), retrievedAt: z.string().datetime(), storageEncoding: z.literal('gzip'), decodedBytes: z.number().int().positive(), decodedSha256: hash }).passthrough();
function assert(value: unknown, message: string): asserts value { if (!value) throw Error('EPA NRSA: ' + message); }
function text(bytes: Buffer) { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
function pinned(ref: z.infer<typeof file>, read: Read) { const b = read(ref.path); assert(b.length === ref.bytes && sha256(b) === ref.sha256, 'pinned input differs: ' + ref.path); return b; }
function embedded(ref: z.infer<typeof file>, read: Read): Read {
  const archive = z.object({ schemaVersion: z.literal(1), files: z.array(z.object({ originalPath: safePath, bytes: z.number().int().nonnegative().max(20000000), sha256: hash, encoding: z.literal('base64'), contents: z.string() }).strict()) }).passthrough().parse(JSON.parse(text(gunzipSync(pinned(ref, read), { maxOutputLength: 20000000 }))));
  const entries = new Map<string, Buffer>();
  for (const f of archive.files) { const b = Buffer.from(f.contents, 'base64'); assert(!entries.has(f.originalPath) && b.length === f.bytes && sha256(b) === f.sha256, 'embedded entry differs: ' + f.originalPath); entries.set(f.originalPath, b); }
  return p => { const b = entries.get(p); assert(b, 'missing embedded file: ' + p); return b; };
}
const nonempty = (r: Row) => Object.fromEntries(Object.entries(r).filter(([, value]) => value !== ''));
function checkWitness(entries: Entry[], witness: z.infer<typeof locator>) {
  const entry = entries[witness.parsedRowIndexZeroBased];
  assert(entry && entry.physicalEndLineOneBased === witness.physicalEndLineOneBased && sha256(entry.raw) === witness.rawRecordSha256 && stableJson(nonempty(entry.record)) === stableJson(witness.sourceFields), 'independent raw witness differs');
  return entry;
}
export function loadEpaNrsaMethod(plan: EpaNrsaPlan, read: Read) {
  const p = { methodReviewPath: methodPath.parse(plan.methodReviewPath), methodReviewSha256: hash.parse(plan.methodReviewSha256) };
  const bytes = read(p.methodReviewPath); assert(sha256(bytes) === p.methodReviewSha256, 'method hash differs');
  const method = methodSchema.parse(JSON.parse(text(bytes)));
  method.context.forEach(ref => pinned(ref, read));
  const retained = embedded(method.acquisition.archive, read);
  const receipt = JSON.parse(text(pinned(method.acquisition.receipt, retained)));
  pinned(method.acquisition.recipe, retained);
  assert(receipt.kind === 'official-epa-nrsa-2324-source-preflight' && receipt.repositoryBaseCommit === method.acquisition.repositoryBaseCommit && receipt.recipe?.path === method.acquisition.recipe.path && receipt.recipe?.sha256 === method.acquisition.recipe.sha256 && receipt.providerWrites === 0 && receipt.automaticRetries === 0 && Array.isArray(receipt.receipts) && receipt.receipts.length === 6, 'acquisition lineage/accounting differs');
  assert(new Set(method.profiles.map(p => p.name)).size === 6 && new Set(method.profiles.map(p => p.path)).size === 6, 'duplicate source profiles');
  const profiles = method.profiles.map(spec => {
    const refs = receipt.receipts.filter((r: {path?: string}) => r.path === spec.path); assert(refs.length === 1, 'ambiguous source receipt');
    const ref = responseSchema.parse(refs[0]);
    const url = 'https://www.epa.gov/system/files/other-files/2026-06/nrsa2324_' + spec.name + '.csv';
    assert(ref.url === url && ref.finalUrl === url && spec.path.endsWith('/nrsa2324_' + spec.name + '.csv.gz'), 'source URL/profile differs');
    assert(Date.parse(ref.startedAt) <= Date.parse(ref.retrievedAt) && Date.parse(ref.retrievedAt) <= Date.parse(method.reviewedAt), 'acquisition chronology differs');
    const decoded = gunzipSync(pinned(ref, retained), { maxOutputLength: 20000000 }); text(decoded);
    assert(decoded.length === spec.decodedBytes && decoded.length === ref.decodedBytes && sha256(decoded) === spec.decodedSha256 && spec.decodedSha256 === ref.decodedSha256, 'decoded source differs');
    const rows = parseEpaNrsaCsv(decoded);
    assert(rows.length === spec.rowCount && new Set(spec.columns).size === spec.columns.length && rows.every(r => stableJson(Object.keys(r.record)) === stableJson(spec.columns)), 'CSV shape differs');
    return { definition: spec, ref, rows };
  });
  const profile = (name: typeof profileNames[number]) => { const entry = profiles.find(p => p.definition.name === name); assert(entry, 'missing profile'); return entry; };
  const fish = profile('fishcount'), sites = profile('siteinfo'), taxa = profile('fishtaxa');
  const taxonIndex = new Map<string, number>(), siteIndex = new Map<string, number>();
  taxa.rows.forEach((e, i) => { assert(e.record.TAXA_ID && !taxonIndex.has(e.record.TAXA_ID), 'duplicate/empty TAXA_ID'); taxonIndex.set(e.record.TAXA_ID, i); });
  sites.rows.forEach((e, i) => { assert(e.record.UID && !siteIndex.has(e.record.UID), 'duplicate/empty site UID'); siteIndex.set(e.record.UID, i); });
  const reviews = method.independentReviews.map(ref => reviewSchema.parse(JSON.parse(text(pinned(ref, read)))));
  assert(new Set(reviews.map(r => r.actorId)).size === reviews.length && reviews.every(r => r.actorId !== 'MAIN'), 'independent actors differ');
  const approved = reviews.flatMap(r => r.witnesses.map(w => w.pairKey)).sort(), held = reviews.flatMap(r => r.heldPairs).sort();
  assert(new Set(approved).size === approved.length && new Set(held).size === held.length && stableJson(approved) === stableJson(method.approvedPairs) && stableJson(held) === stableJson(method.heldPairs) && !approved.some(p => held.includes(p)), 'reviewed pair scope differs');
  for (const review of reviews) {
    assert(stableJson(review.inputArchive) === stableJson(method.acquisition.archive) && review.acquisitionReceiptSha256 === method.acquisition.receipt.sha256, 'independent acquisition differs');
    assert(Date.parse(review.recordedAt) <= Date.parse(method.reviewedAt) && profiles.every(p => Date.parse(p.ref.retrievedAt) <= Date.parse(review.recordedAt)), 'independent review chronology differs');
    assert(stableJson([...review.leasedPairs].sort()) === stableJson([...review.witnesses.map(w => w.pairKey), ...review.heldPairs].sort()), 'review lease coverage differs');
    for (const w of review.witnesses) { checkWitness(fish.rows, w.fish); checkWitness(sites.rows, w.site); checkWitness(taxa.rows, w.taxon); }
  }
  assert(new Set(method.heldFishRows.map(h => h.parsedRowIndexZeroBased)).size === method.heldFishRows.length, 'duplicate held rows');
  for (const h of method.heldFishRows) assert(fish.rows[h.parsedRowIndexZeroBased] && sha256(fish.rows[h.parsedRowIndexZeroBased].raw) === h.rawRecordSha256, 'held row differs');
  return { method, receipt, profiles, reviews, fish, sites, taxa, siteIndex, taxonIndex };
}
export function epaNrsaInputPaths(plan: EpaNrsaPlan, read: Read) {
  const { method } = loadEpaNrsaMethod(plan, read);
  return [...new Set(['src/lib/research/epa-nrsa-fish-counts.ts', 'scripts/research/adapters/epa-nrsa-fish-counts.ts', plan.methodReviewPath, method.acquisition.archive.path, ...method.context.map(f => f.path), ...method.independentReviews.map(f => f.path)])].sort();
}
const normalize = (v: string) => v.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]/gu, '');
type County = {countyFips: string; stateCode: string; status: string; shortName: string; legalName: string; aliases: string[]};
export function epaNrsaPositiveValue(r: Row, s: Row, t: Row, county: County | undefined, scientificName: string) {
  const reject = (reason: string) => ({date: null, reason});
  if (!county || county.status !== 'active' || s.STATECTY !== 'F' + county.countyFips || county.stateCode !== s.PSTL_CODE || ![county.shortName, county.legalName, ...county.aliases].some(n => normalize(n) === normalize(s.CNTYNAME))) return reject('publisher-county-identity');
  if (r.UID !== s.UID || ['SITE_ID', 'UNIQUE_ID', 'DATE_COL', 'VISIT_NO', 'PSTL_CODE'].some(k => !r[k] || r[k] !== s[k])) return reject('visit-identity');
  if (r.TAXA_ID !== t.TAXA_ID || r.FINAL_NAME !== t.FINAL_NAME || (t.GENUS + ' ' + t.SPECIES).toLowerCase() !== scientificName.toLowerCase()) return reject('exact-taxon-identity');
  if (r.IS_DISTINCT !== '1') return reject('non-distinct-taxon');
  if (r.FISH_SAMPLING !== '') return reject('sampling-qualification-requires-review');
  if (s.EVAL_CAT !== 'Target_Sampled' || s.DSGN_CYCLE !== '2023-24' || s.STUDY !== 'NRSA') return reject('visit-not-target-sampled');
  if (!/^\d+$/u.test(r.TOTAL) || !Number.isSafeInteger(Number(r.TOTAL)) || Number(r.TOTAL) <= 0) return reject('nonpositive-or-invalid-total');
  if (r.ANOM_CT !== '' && (!/^\d+$/u.test(r.ANOM_CT) || Number(r.ANOM_CT) > Number(r.TOTAL))) return reject('invalid-anomaly-count');
  const bins = ['COUNT_6', 'COUNT_12', 'COUNT_18', 'COUNT_19'].map(k => r[k]);
  if (bins.some(v => v !== '' && !/^\d+$/u.test(v)) || bins.reduce((sum, v) => sum + Number(v || 0), 0) !== Number(r.TOTAL)) return reject('inconsistent-size-counts');
  const m = /^(\d{1,2})\/(\d{1,2})\/(202[34])$/u.exec(r.DATE_COL);
  if (!m) return reject('invalid-field-date');
  const date = m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0');
  if (!Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || s.YEAR !== m[3]) return reject('invalid-field-date');
  return { date, reason: null };
}
const id = (prefix: string, payload: unknown) => prefix + '-' + sha256(stableJson(payload));
function original(entry: Entry, index: number) { return { parsedRowIndexZeroBased: index, physicalEndLineOneBased: entry.physicalEndLineOneBased, rawRecordSha256: sha256(entry.raw), sourceFields: nonempty(entry.record) }; }
export function buildEpaNrsaResult(context: SourceAdapterContext, read: Read): SourceAdapterResult {
  const p = epaNrsaParametersSchema.parse(context.parameters), loaded = loadEpaNrsaMethod(p, read);
  const { method, reviews, fish, sites, taxa, siteIndex, taxonIndex } = loaded;
  z.string().datetime().parse(context.runStartedAt);
  assert(context.sourceId === EPA_NRSA_SOURCE && context.stateCode === p.stateCode && Date.parse(method.reviewedAt) <= Date.parse(context.runStartedAt), 'run identity/chronology differs');
  const registry = JSON.parse(text(read('src/data/research/county-equivalent-registry.json')));
  const active = new Map<string, County>(registry.countyEquivalents.filter((c: County) => c.status === 'active').map((c: County) => [c.countyFips, c]));
  const requested = context.requestedPairs.map(r => r.countyFips + ':' + r.speciesId).sort();
  assert(new Set(requested).size === requested.length && stableJson(requested) === stableJson(p.candidatePairs) && p.candidateLimit === requested.length && requested.every(key => method.approvedPairs.includes(key) && !method.heldPairs.includes(key)), 'requested scope differs');
  for (const target of context.requestedPairs) assert(method.taxa[target.speciesId] === target.scientificName && active.get(target.countyFips)?.stateCode === p.stateCode, 'target county/taxon differs');
  const selected = new Map(requested.map(key => [key, [] as Array<{fishIndex: number; siteIndex: number; taxonIndex: number; date: string | null; disposition: string}>]));
  const names = new Map(Object.entries(method.taxa).map(([id, name]) => [name.toLowerCase(), id]));
  assert(names.size === Object.keys(method.taxa).length, 'ambiguous catalog mapping');
  fish.rows.forEach((e, i) => {
    const si = siteIndex.get(e.record.UID), ti = taxonIndex.get(e.record.TAXA_ID);
    if (si === undefined || ti === undefined) return;
    const s = sites.rows[si].record, t = taxa.rows[ti].record, species = names.get((t.GENUS + ' ' + t.SPECIES).toLowerCase());
    if (!species || !/^F\d{5}$/u.test(s.STATECTY)) return;
    const countyFips = s.STATECTY.slice(1), target = selected.get(countyFips + ':' + species); if (!target) return;
    const positive = epaNrsaPositiveValue(e.record, s, t, active.get(countyFips), method.taxa[species]);
    const hold = method.heldFishRows.find(h => h.parsedRowIndexZeroBased === i);
    target.push({fishIndex: i, siteIndex: si, taxonIndex: ti, date: hold ? null : positive.date, disposition: hold ? 'review-hold: ' + hold.reason : positive.reason ?? 'positive'});
  });
  const result: SourceAdapterResult = { completedAt: context.runStartedAt, assertions: [], reviews: [], rejections: [], outcomes: [], artifacts: [], upstreamRequests: [], candidateRecordCount: 0, duplicateRecordCount: 0, errors: [], warnings: method.limitations };
  const witnesses: unknown[] = [], actor = EPA_NRSA_ADAPTER + '@' + EPA_NRSA_VERSION;
  for (const [key, rows] of selected) {
    const positive = rows.filter(r => r.disposition === 'positive'); assert(positive.length, 'no qualified positive: ' + key);
    const review = reviews.find(r => r.witnesses.some(w => w.pairKey === key))!, primary = review.witnesses.find(w => w.pairKey === key)!;
    const selectedPrimary = positive.find(r => r.fishIndex === primary.fish.parsedRowIndexZeroBased);
    assert(selectedPrimary && selectedPrimary.siteIndex === primary.site.parsedRowIndexZeroBased && selectedPrimary.taxonIndex === primary.taxon.parsedRowIndexZeroBased && selectedPrimary.date === primary.date && Number(fish.rows[selectedPrimary.fishIndex].record.TOTAL) === primary.total, 'primary reviewed witness not admitted: ' + key);
    result.candidateRecordCount += rows.length;
    const [countyFips, species] = key.split(':'), dates = positive.map(r => r.date!).sort(), latest = dates.at(-1)!;
    const payload = {pairKey: key, methodReviewPath: p.methodReviewPath, methodReviewSha256: p.methodReviewSha256, fishDecodedSha256: fish.ref.decodedSha256, siteDecodedSha256: sites.ref.decodedSha256, taxonDecodedSha256: taxa.ref.decodedSha256, primaryFishIndex: selectedPrimary.fishIndex, positiveRows: positive.map(r => ({fishIndex: r.fishIndex, fishSha256: sha256(fish.rows[r.fishIndex].raw), siteIndex: r.siteIndex, siteSha256: sha256(sites.rows[r.siteIndex].raw), taxonIndex: r.taxonIndex, taxonSha256: sha256(taxa.rows[r.taxonIndex].raw)}))};
    const assertionId = id('epa-nrsa-fish-assertion', {runId: context.runId, ...payload});
    const caveats = [method.attribution, ...method.limitations, ...(method.speciesCaveats[species] ?? []), ...(method.pairCaveats[key] ?? [])];
    result.assertions.push({schemaVersion: 1, eventId: assertionId, event_type: 'evidence.asserted', created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: species, claim_type: 'recorded-present', evidence_kind: 'occurrence', scope: 'survey-area', source_record_id: id('retained-epa-nrsa-fish-rows', payload), source_url: fish.ref.url, source_record_date: latest, retrieved_at: fish.ref.retrievedAt,
      taxon_match: {method: 'Exact case-normalized GENUS and SPECIES through unique source TAXA_ID; original common-name agreement.', target_scientific_name: method.taxa[species], source_scientific_name: method.taxa[species], source_taxon_key: null},
      geography_match: {method: 'Exact source visit join to active publisher STATECTY county FIPS and county name; not coordinate-derived.', source_state: p.stateCode, source_county: sites.rows[selectedPrimary.siteIndex].record.CNTYNAME, county_fips: countyFips},
      temporal_scope: 'Positive field-sample dates span ' + dates[0] + ' through ' + latest + '; independent primary date ' + primary.date + '.', spatial_scope: 'Sampled locations in the publisher-reported county; no countywide prevalence claim.', survey_scope: 'Distinct species-specific positive fish counts in actual 2023/2024 sampled visits. Sampling sufficiency qualifications are retained; precise gear execution and complete county inventory are not inferred.', normalized_payload_hash: sha256(stableJson(payload)), caveats,
      notes: ['Original fish, site and taxon rows, positive/excluded dispositions, source locators and the independently selected primary witness are retained in epa-nrsa-fish-witnesses.json.', 'Site information: ' + sites.ref.url, 'Taxonomy: ' + taxa.ref.url]});
    result.reviews.push({schemaVersion: 1, eventId: id('epa-nrsa-fish-review', {assertionId}), event_type: 'evidence.reviewed', created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: species, references: {assertion_event_id: assertionId}, review_level: 'machine-validated', decision: 'accepted', publication_eligible: true, reason_codes: ['positive-distinct-fish-count', 'exact-publisher-county', 'independently-reviewed-method', 'original-field-date'], notes: ['Offline canonical reconstruction from hash-pinned source tables and independent review proposals; not individual human specimen verification.']});
    const rejectionIds: string[] = [];
    for (const reason of [...new Set(rows.filter(r => r.disposition !== 'positive').map(r => r.disposition))].sort()) {
      const excluded = rows.filter(r => r.disposition === reason), rejectionId = id('epa-nrsa-fish-rejection', {runId: context.runId, key, reason, rows: excluded.map(r => r.fishIndex)}); rejectionIds.push(rejectionId);
      result.rejections.push({schemaVersion: 1, rejection_id: rejectionId, created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, candidate_locator: fish.ref.path + '#pair=' + key + '&reason=' + encodeURIComponent(reason), candidate_taxon: method.taxa[species], candidate_geography: countyFips, normalized_target: {state_code: p.stateCode, county_fips: countyFips, species_id: species}, reason_code: 'record-failed', supporting_notes: [excluded.length + ' rows excluded: ' + reason + '. Source flags do not create absence or non-detection. Exact records retained.']});
    }
    result.outcomes.push({schemaVersion: 1, outcome_id: id('epa-nrsa-fish-outcome', {runId: context.runId, key}), run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: species, status: 'evidence-found', scope_complete: true, recorded_at: context.runStartedAt, assertion_event_ids: [assertionId], rejection_ids: rejectionIds, query_urls: [fish.ref.url, sites.ref.url, taxa.ref.url], notes: ['Complete retained-profile scan for this selected positive pair only; no protocol-completion or exhaustive current county inventory claim.']});
    witnesses.push({...payload, independentActor: review.actorId, primary, sourceRows: rows.map(r => ({disposition: r.disposition, date: r.date, fish: original(fish.rows[r.fishIndex], r.fishIndex), site: original(sites.rows[r.siteIndex], r.siteIndex), taxon: original(taxa.rows[r.taxonIndex], r.taxonIndex)}))});
  }
  result.artifacts.push({filename: 'epa-nrsa-fish-witnesses.json', mediaType: 'application/json', contents: JSON.stringify({schemaVersion: 1, method: EPA_NRSA_METHOD, methodReviewPath: p.methodReviewPath, methodReviewSha256: p.methodReviewSha256, acquisitionReceiptSha256: method.acquisition.receipt.sha256, locatorConvention: 'Zero-based parsed data-row index excludes header. Physical end line is one-based in original CSV. SHA-256 covers exact raw CSV record bytes with original line terminator. Omitted source fields were blank.', acquisitionCodeQualification: 'Original acquisition repository HEAD and separately retained executed recipe identify acquisition. This offline run code_commit identifies interpretation code, not a new provider acquisition.', profiles: loaded.profiles.map(p => p.ref), witnesses}, null, 2) + '\n'});
  return result;
}
