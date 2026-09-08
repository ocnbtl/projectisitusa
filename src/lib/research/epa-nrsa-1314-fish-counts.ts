import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { parseEpaNrsaCsv, EPA_NRSA_SOURCE, EPA_NRSA_ADAPTER } from './epa-nrsa-fish-counts';
import { sha256, stableJson } from './run-files';
import type { SourceAdapterContext, SourceAdapterResult } from './source-adapter';
export { EPA_NRSA_SOURCE, EPA_NRSA_ADAPTER };
export const EPA_NRSA_1314_VERSION = '3.0.0';
export const EPA_NRSA_1314_METHOD = 'retained-epa-nrsa-1314-reviewed-fish-counts-v1';
export const EPA_NRSA_1314_MODE = 'retained-reviewed-fish-counts-1314';
type Row = Record<string, string>;
type Entry = ReturnType<typeof parseEpaNrsaCsv>[number];
type Read = (path: string) => Buffer;
export type EpaNrsa1314County = {countyFips: string; stateCode: string; status: string; shortName: string; legalName: string; aliases: string[]};
function check(value: unknown, message: string): asserts value { if (!value) throw new Error('EPA NRSA1314: ' + message); }
const text = (bytes: Buffer) => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
const nonempty = (row: Row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== ''));
const countyName = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]/gu, '');
const integer = (value: string) => /^\d+$/u.test(value ?? '') && Number.isSafeInteger(Number(value));

// This single-byte decoding exception belongs only to the original, pinned site
// file. It never changes source bytes or the strict UTF-8 parsers for other cycles.
export function parseEpaNrsa1314Csv(decoded: Buffer, encoding: 'utf8' | 'latin1'): Entry[] {
  if (encoding === 'utf8') return parseEpaNrsaCsv(decoded);
  check(!(decoded[0] === 0xef && decoded[1] === 0xbb && decoded[2] === 0xbf), 'unexpected site BOM');
  const high = [...decoded].filter(b => b > 127);
  check(high.length === 2 && high.every(b => b === 0xf1), 'unexpected single-byte site profile');
  const parsed = parse(decoded, {encoding: 'latin1', columns: false, skip_empty_lines: false, info: true}) as Array<{record: string[]; info: {bytes: number}}>;
  const header = parsed.shift(); check(header && header.record.every(Boolean) && new Set(header.record).size === header.record.length, 'invalid CSV header');
  let cursor = 0, breaks = 0;
  const advance = (end: number) => {check(Number.isInteger(end) && end >= cursor && end <= decoded.length, 'invalid byte boundary'); for (; cursor < end; cursor++) if (decoded[cursor] === 13 || (decoded[cursor] === 10 && decoded[cursor - 1] !== 13)) breaks++;};
  advance(header.info.bytes);
  const rows = parsed.map(entry => {check(entry.record.length === header.record.length, 'CSV column count differs'); const start = cursor; advance(entry.info.bytes); return {record: Object.fromEntries(header.record.map((name, i) => [name, entry.record[i]])), raw: decoded.subarray(start, cursor), physicalEndLineOneBased: breaks + (cursor > 0 && ![10, 13].includes(decoded[cursor - 1]) ? 1 : 0)};});
  check(cursor === decoded.length && Buffer.from(decoded.toString('latin1'), 'latin1').equals(decoded), 'unconsumed or irreversible site bytes');
  check(rows.filter(r => [...r.raw].some(b => b > 127)).length === 1, 'non-ASCII site rows differ');
  return rows;
}
export function epaNrsa1314Date(value: string) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(201[34])$/u.exec(value); if (!m) return null;
  const date = m[3] + '-' + m[1].padStart(2, '0') + '-' + m[2].padStart(2, '0'), stamp = Date.parse(date);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === date ? date : null;
}
export function epaNrsa1314VisitKey(row: Row) {
  const date = epaNrsa1314Date(row.DATE_COL);
  return row.SITE_ID && date && ['1', '2'].includes(row.VISIT_NO) && /^[A-Z]{2}$/u.test(row.PSTL_CODE ?? '') ? JSON.stringify([row.SITE_ID, date, row.VISIT_NO, row.PSTL_CODE]) : null;
}
export function epaNrsa1314Fips(value: string) {return /^\d{4,5}$/u.test(value ?? '') ? value.padStart(5, '0') : null;}
export function epaNrsa1314PositiveValue(fish: Row, site: Row, taxon: Row, county: EpaNrsa1314County | undefined, scientific: string) {
  const reject = (reason: string) => ({date: null, reason});
  if (!county || county.status !== 'active' || epaNrsa1314Fips(site.STATECTY) !== county.countyFips || site.PSTL_CODE !== county.stateCode || !site.CNTYNAME || ![county.shortName, county.legalName, ...county.aliases].some(n => countyName(n) === countyName(site.CNTYNAME))) return reject('publisher-county-identity');
  if (!integer(fish.UID) || fish.UID !== site.UID || !epaNrsa1314VisitKey(fish) || epaNrsa1314VisitKey(fish) !== epaNrsa1314VisitKey(site)) return reject('complete-uid-visit-identity');
  const border = site.STATE.split(':');
  if (site.STATE !== site.PSTL_CODE && !(border.length === 2 && new Set(border).size === 2 && border.every(s => /^[A-Z]{2}$/u.test(s)) && border.includes(site.PSTL_CODE) && site.STATE === site.BORD_RIV)) return reject('contradictory-state-border-qualifier');
  if (!fish.TAXA_ID || fish.TAXA_ID !== taxon.TAXA_ID || fish.FINAL_NAME !== taxon.FINAL_NAME || (taxon.GENUS + ' ' + taxon.SPECIES).toLowerCase() !== scientific.toLowerCase()) return reject('reviewed-taxon-identity');
  if (fish.IS_DISTINCT !== '1') return reject('non-distinct-taxon');
  if (!integer(fish.TOTAL) || Number(fish.TOTAL) <= 0) return reject('nonpositive-or-invalid-total');
  if (!integer(fish.ANOM_CT)) return reject('invalid-anomaly-count');
  if (site.SITESAMP !== 'Y' || site.EVALSTAT !== 'Target-Sampled' || site.NRS13_EVAL !== 'Target_Sampled' || site.STUDY !== 'NRSA' || site.EVALUATED !== 'YES' || site.NRSA_USE !== 'YES' || !['PROB', 'HAND'].includes(fish.SITETYPE) || fish.SITETYPE !== site.SITETYPE) return reject('visit-not-target-sampled');
  return {date: epaNrsa1314Date(fish.DATE_COL), reason: null};
}
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const safePath = z.string().regex(/^[a-zA-Z0-9.][a-zA-Z0-9_./-]+$/u).refine(p => !p.split('/').includes('..') && !p.includes('//'));
const file = z.object({path: safePath, bytes: z.number().int().positive().max(20000000), sha256: hash}).strict();
const pair = z.string().regex(/^\d{5}:[a-z0-9][a-z0-9-]*$/u), species = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);
const commit = z.string().regex(/^[a-f0-9]{40}$/u);
const methodPath = safePath.refine(p => /^src\/data\/research\/source-method-reviews\/epa-nrsa-fish-counts-1314-[a-z0-9-]+\.json$/u.test(p));
export const epaNrsa1314ParametersSchema = z.object({mode: z.literal(EPA_NRSA_1314_MODE), stateCode: z.string().regex(/^[A-Z]{2}$/u), methodReviewPath: methodPath, methodReviewSha256: hash, candidatePairs: z.array(pair).min(1).max(5000), candidateLimit: z.number().int().positive().max(5000)}).strict();
export type EpaNrsa1314Plan = Pick<z.infer<typeof epaNrsa1314ParametersSchema>, 'methodReviewPath' | 'methodReviewSha256'>;
const locator = z.object({parsedRowIndexZeroBased: z.number().int().nonnegative(), physicalEndLineOneBased: z.number().int().positive(), rawRecordSha256: hash, sourceFields: z.record(z.string(), z.string())}).strict();
const material = z.object({pairKey: pair, fish: locator, site: locator, taxon: locator}).strict();
const witness = material.extend({date: z.string(), total: z.number().int().positive()}).strict();
const acquisitionName = z.enum(['primary2013', 'taxonomy2013']);
const acquisition = z.object({name: acquisitionName, archive: file, receipt: file, recipe: file, repositoryBaseCommit: commit}).strict();
const profileName = z.enum(['fishcount', 'siteinfo', 'fishtaxa']);
const profile = z.object({name: profileName, path: safePath, decodedBytes: z.number().int().positive().max(20000000), decodedSha256: hash, rowCount: z.number().int().positive(), columns: z.array(z.string().min(1)).min(1), encoding: z.enum(['utf8', 'latin1'])}).strict();
const reviewSchema = z.object({schemaVersion: z.literal(1), kind: z.literal('independent-epa-nrsa-1314-fish-source-review-v1'), recordedBy: z.literal('MAIN'), actorId: z.string().min(1), recordedAt: z.string().datetime(), originalProposal: file, originalRecipe: file, originalCommit: commit, inputArchive: file, acquisitionReceiptSha256: hash, leasedPairs: z.array(pair).min(1), heldPairs: z.array(pair), witnesses: z.array(witness).min(1), materialRows: z.array(material).min(1)}).strict();
const methodSchema = z.object({schemaVersion: z.literal(1), methodVersion: z.literal(EPA_NRSA_1314_METHOD), sourceId: z.literal(EPA_NRSA_SOURCE), status: z.literal('approved-with-specific-holds'), reviewedBy: z.literal('MAIN'), reviewedAt: z.string().datetime(), acquisitions: z.array(acquisition).length(2), profiles: z.array(profile).length(3), context: z.array(file).min(1), independentReviews: z.array(file).min(2), taxa: z.record(species, z.string().min(1)), taxonReviews: z.record(z.string().regex(/^\d+$/u), z.object({speciesId: species, taxon: locator, rationale: z.string().min(1)}).strict()), approvedPairs: z.array(pair).min(1), heldPairs: z.array(pair), heldFishRows: z.array(z.object({parsedRowIndexZeroBased: z.number().int().nonnegative(), rawRecordSha256: hash, reason: z.string().min(1)}).strict()), attribution: z.string().min(1), rationale: z.string().min(1), limitations: z.array(z.string().min(1)).min(1), speciesCaveats: z.record(species, z.array(z.string().min(1))), pairCaveats: z.record(pair, z.array(z.string().min(1)))}).strict();
const response = file.extend({url: z.url(), finalUrl: z.url(), status: z.literal(200), startedAt: z.string().datetime(), retrievedAt: z.string().datetime(), storageEncoding: z.literal('gzip'), decodedBytes: z.number().int().positive().max(20000000), decodedSha256: hash}).passthrough();
function pinned(ref: z.infer<typeof file>, read: Read) {const b = read(ref.path); check(b.length === ref.bytes && sha256(b) === ref.sha256, 'pinned input differs: ' + ref.path); return b;}
function embedded(ref: z.infer<typeof file>, read: Read): Read {
  const doc = z.object({schemaVersion: z.literal(1), files: z.array(z.object({originalPath: safePath, bytes: z.number().int().nonnegative().max(20000000), sha256: hash, encoding: z.literal('base64'), contents: z.string()}).strict())}).passthrough().parse(JSON.parse(text(gunzipSync(pinned(ref, read), {maxOutputLength: 20000000}))));
  const entries = new Map<string, Buffer>();
  for (const f of doc.files) {const b = Buffer.from(f.contents, 'base64'); check(!entries.has(f.originalPath) && b.length === f.bytes && sha256(b) === f.sha256, 'embedded entry differs: ' + f.originalPath); entries.set(f.originalPath, b);}
  return p => {const b = entries.get(p); check(b, 'missing embedded file: ' + p); return b;};
}
const sourceBase = 'https://www.epa.gov/sites/default/files/2019-04/';
const contracts = {
  primary2013: {kind: 'official-epa-nrsa-1314-source-discovery', baseField: 'baseCommit', urls: ['nrsa1314_fishcts_04232019.csv', 'nrsa1314_fishcts_meta_04292019_0.txt', 'nrsa1314_siteinformation_wide_04292019.csv', 'nrsa1314_sitesuids_wide_meta_04292019.txt'].map(n => sourceBase + n)},
  taxonomy2013: {kind: 'official-epa-nrsa-1314-taxonomy-discovery', baseField: 'repositoryBaseCommit', urls: ['nrsa1314_fishtaxa_02042019.csv', 'nrsa1314_fishtaxa_meta_04292019.txt'].map(n => sourceBase + n)},
};
const profileContracts = {
  fishcount: {acquisition: 'primary2013', url: contracts.primary2013.urls[0], encoding: 'utf8'},
  siteinfo: {acquisition: 'primary2013', url: contracts.primary2013.urls[2], encoding: 'latin1'},
  fishtaxa: {acquisition: 'taxonomy2013', url: contracts.taxonomy2013.urls[0], encoding: 'utf8'},
} as const;
function original(entry: Entry, index: number) {return {parsedRowIndexZeroBased: index, physicalEndLineOneBased: entry.physicalEndLineOneBased, rawRecordSha256: sha256(entry.raw), sourceFields: nonempty(entry.record)};}
function checkWitness(rows: Entry[], ref: z.infer<typeof locator>) {const row = rows[ref.parsedRowIndexZeroBased]; check(row && stableJson(original(row, ref.parsedRowIndexZeroBased)) === stableJson(ref), 'independent original row differs'); return row;}
// Normalize the two independently authored proposal formats without changing them.
// The raw bytes in each proposal must agree with its locator and the source table.
export function normalize1314Proposal(value: unknown) {
  const p = z.record(z.string(), z.unknown()).parse(value);
  const pairs = z.array(z.record(z.string(), z.unknown())).parse(p.pairReviews);
  const normalize = (value: unknown, a: boolean) => {
    const r = z.record(z.string(), z.unknown()).parse(value), raw = Buffer.from(z.string().parse(r[a ? 'rawRowBase64IncludingTerminator' : 'rawRecordBase64']), 'base64');
    const result = locator.parse({parsedRowIndexZeroBased: r[a ? 'dataRowIndexZeroBased' : 'index'], physicalEndLineOneBased: r[a ? 'physicalEndLineOneBased' : 'physicalEndLine'], rawRecordSha256: r[a ? 'rawRowSha256IncludingTerminator' : 'rawRecordSha256'], sourceFields: nonempty(z.record(z.string(), z.string()).parse(r.fields))});
    check(sha256(raw) === result.rawRecordSha256, 'proposal raw bytes differ'); return result;
  };
  const witnesses: z.infer<typeof witness>[] = [], materialRows: z.infer<typeof material>[] = [];
  const supportedPairs = z.array(pair).parse(p.supportedPairs), heldPairs = z.array(pair).parse(p.heldPairs), leasedPairs = z.array(pair).parse(p.exactLeasedPairs);
  check(new Set(leasedPairs).size === leasedPairs.length && stableJson([...leasedPairs].sort()) === stableJson([...supportedPairs, ...heldPairs].sort()), 'original scope partition differs');
  for (const r of pairs) {
    const a = r.pairKey !== undefined, key = pair.parse(a ? r.pairKey : r.pair), selected = z.record(z.string(), z.unknown()).parse(r.selectedStrongestWitness);
    check(leasedPairs.includes(key), 'unleased original pair');
    const rows = z.array(z.record(z.string(), z.unknown())).parse(a ? r.allOriginalWitnesses : r.materialRows).map(w => {
      const sites = a ? z.array(z.unknown()).length(1).parse(w.siteCandidates) : [w.site], taxa = a ? z.array(z.unknown()).length(1).parse(w.taxonomyCandidates) : [w.taxonomy];
      return material.parse({pairKey: key, fish: normalize(w.fish, a), site: normalize(sites[0], a), taxon: normalize(taxa[0], a)});
    });
    check(rows.length > 0 && new Set(rows.map(w => w.fish.parsedRowIndexZeroBased)).size === rows.length, 'duplicate or empty material rows');
    materialRows.push(...rows);
    if (!supportedPairs.includes(key)) {check(heldPairs.includes(key), 'unclassified original pair'); continue;}
    check((a ? r.status : r.proposalDecision) === 'supported-method-candidate', 'original decision differs');
    const candidates = rows.filter(w => w.fish.parsedRowIndexZeroBased === selected[a ? 'fishRowIndexZeroBased' : 'fishIndex']); check(candidates.length === 1, 'original primary selection differs');
    const w = candidates[0]; check(w.fish.rawRecordSha256 === selected[a ? 'fishRawRowSha256' : 'fishRawRecordSha256'], 'original primary hash differs');
    if (a) check(w.fish.sourceFields.UID === selected.UID, 'original primary UID differs');
    else check(w.site.parsedRowIndexZeroBased === selected.siteIndex && w.taxon.parsedRowIndexZeroBased === selected.taxonomyIndex && Number(w.fish.sourceFields.TOTAL) === selected.total, 'original selected join differs');
    witnesses.push(witness.parse({...w, date: epaNrsa1314Date(w.fish.sourceFields.DATE_COL), total: Number(w.fish.sourceFields.TOTAL)}));
  }
  check(pairs.length === leasedPairs.length && new Set(pairs.map(r => r.pairKey ?? r.pair)).size === pairs.length && witnesses.length === supportedPairs.length, 'original review coverage differs');
  return {leasedPairs: [...leasedPairs].sort(), heldPairs: [...heldPairs].sort(), witnesses: witnesses.sort((a, b) => a.pairKey.localeCompare(b.pairKey)), materialRows: materialRows.sort((a, b) => a.pairKey.localeCompare(b.pairKey) || a.fish.parsedRowIndexZeroBased - b.fish.parsedRowIndexZeroBased)};
}
function index(rows: Entry[], key: (r: Row) => string | null) {const out = new Map<string, number[]>(); rows.forEach((r, i) => {const k = key(r.record); if (k) out.set(k, [...(out.get(k) ?? []), i]);}); return out;}
export function loadEpaNrsa1314Method(plan: EpaNrsa1314Plan, read: Read) {
  const bytes = read(methodPath.parse(plan.methodReviewPath)); check(sha256(bytes) === hash.parse(plan.methodReviewSha256), 'method hash differs');
  const method = methodSchema.parse(JSON.parse(text(bytes))); method.context.forEach(f => pinned(f, read));
  check(new Set(method.acquisitions.map(a => a.name)).size === 2 && new Set(method.profiles.map(p => p.name)).size === 3, 'duplicate acquisition or profile');
  const archives = new Map<string, Read>();
  const acquisitions = method.acquisitions.map(a => {
    let retained = archives.get(a.archive.sha256); if (!retained) {retained = embedded(a.archive, read); archives.set(a.archive.sha256, retained);}
    const receipt = JSON.parse(text(pinned(a.receipt, retained))); pinned(a.recipe, retained); const contract = contracts[a.name];
    check(receipt.kind === contract.kind && receipt[contract.baseField] === a.repositoryBaseCommit && receipt.recipe?.path === a.recipe.path && receipt.recipe?.sha256 === a.recipe.sha256 && receipt.providerWrites === 0 && receipt.automaticRetries === 0, 'acquisition lineage differs');
    const refs = z.array(response).length(contract.urls.length).parse(receipt.receipts);
    check(stableJson(refs.map(r => r.url).sort()) === stableJson([...contract.urls].sort()) && new Set(refs.map(r => r.path)).size === refs.length, 'acquisition URL scope differs');
    for (const r of refs) {check(r.url === r.finalUrl && Date.parse(r.startedAt) <= Date.parse(r.retrievedAt) && Date.parse(r.retrievedAt) <= Date.parse(method.reviewedAt), 'source identity or chronology differs'); const decoded = gunzipSync(pinned(r, retained), {maxOutputLength: 20000000}); check(decoded.length === r.decodedBytes && sha256(decoded) === r.decodedSha256, 'decoded acquisition differs');}
    return {definition: a, refs, retained};
  });
  const profiles = method.profiles.map(spec => {
    const contract = profileContracts[spec.name], acquired = acquisitions.find(a => a.definition.name === contract.acquisition)!;
    const refs = acquired.refs.filter(r => r.path === spec.path && r.url === contract.url); check(refs.length === 1, 'profile receipt differs'); const ref = refs[0];
    check(spec.encoding === contract.encoding && spec.decodedBytes === ref.decodedBytes && spec.decodedSha256 === ref.decodedSha256, 'profile byte or encoding contract differs');
    const rows = parseEpaNrsa1314Csv(gunzipSync(pinned(ref, acquired.retained), {maxOutputLength: 20000000}), spec.encoding);
    check(rows.length === spec.rowCount && rows.every(r => stableJson(Object.keys(r.record)) === stableJson(spec.columns)), 'CSV shape differs'); return {definition: spec, ref, rows};
  });
  const fish = profiles.find(p => p.definition.name === 'fishcount')!, sites = profiles.find(p => p.definition.name === 'siteinfo')!, taxa = profiles.find(p => p.definition.name === 'fishtaxa')!;
  const taxonIndex = new Map<string, number>(); taxa.rows.forEach((r, i) => {check(r.record.TAXA_ID && !taxonIndex.has(r.record.TAXA_ID), 'duplicate taxon identity'); taxonIndex.set(r.record.TAXA_ID, i);});
  for (const [id, review] of Object.entries(method.taxonReviews)) {const r = checkWitness(taxa.rows, review.taxon).record; check(r.TAXA_ID === id && method.taxa[review.speciesId]?.toLowerCase() === (r.GENUS + ' ' + r.SPECIES).toLowerCase(), 'contemporaneous taxon review differs');}
  const reviews = method.independentReviews.map(f => reviewSchema.parse(JSON.parse(text(pinned(f, read)))));
  check(new Set(reviews.map(r => r.actorId)).size === reviews.length && reviews.every(r => r.actorId !== 'MAIN'), 'independent actors differ');
  const approved = reviews.flatMap(r => r.witnesses.map(w => w.pairKey)).sort(), held = reviews.flatMap(r => r.heldPairs).sort();
  check(new Set(approved).size === approved.length && new Set(held).size === held.length && stableJson(approved) === stableJson(method.approvedPairs) && stableJson(held) === stableJson(method.heldPairs) && !approved.some(p => held.includes(p)), 'independent scope differs');
  const primary = acquisitions.find(a => a.definition.name === 'primary2013')!;
  for (const review of reviews) {
    const proposal = JSON.parse(text(pinned(review.originalProposal, read))); pinned(review.originalRecipe, read);
    check(proposal.actorId === review.actorId && proposal.status === 'proposal-ready-main-method-required', 'original proposal identity differs');
    check(stableJson(review.inputArchive) === stableJson(primary.definition.archive) && review.acquisitionReceiptSha256 === primary.definition.receipt.sha256 && Date.parse(review.recordedAt) <= Date.parse(method.reviewedAt) && profiles.every(p => Date.parse(p.ref.retrievedAt) <= Date.parse(review.recordedAt)), 'review lineage or chronology differs');
    const retention = method.context.map(f => JSON.parse(text(pinned(f, read)))).filter(r => r.kind === 'main-retained-independent-method-proposal' && r.actorId === review.actorId);
    check(retention.length === 1 && retention[0].originalCommit === review.originalCommit && retention[0].baseSha === proposal.baseSha && stableJson(retention[0].files) === stableJson([review.originalProposal, review.originalRecipe]) && Date.parse(retention[0].recordedAt) <= Date.parse(review.recordedAt), 'original proposal commit or retention lineage differs');
    const normalized = normalize1314Proposal(proposal);
    for (const field of ['leasedPairs', 'heldPairs', 'witnesses', 'materialRows'] as const) check(stableJson(normalized[field]) === stableJson(review[field]), 'normalized original ' + field + ' differ');
    for (const w of review.materialRows) {checkWitness(fish.rows, w.fish); checkWitness(sites.rows, w.site); checkWitness(taxa.rows, w.taxon);}
    // Retained USGS bytes are contextual taxonomy evidence, not county records.
    if (proposal.sourceContext) for (const r of proposal.sourceContext.retainedResponses) {
      check(['https://www.usgs.gov/publications/discovery-south-american-suckermouth-armored-catfishes-loricariidae-pterygoplichthys', 'https://nas.er.usgs.gov/queries/factsheet.aspx?SpeciesID=766'].includes(r.url) && r.status === 200 && r.finalUrl === r.url && Date.parse(r.startedAt) <= Date.parse(r.retrievedAt) && Date.parse(r.retrievedAt) <= Date.parse(review.recordedAt), 'retained context identity differs');
      const b = gunzipSync(Buffer.from(r.bodyGzipBase64, 'base64'), {maxOutputLength: 1000000}); check(b.length === r.decodedBytes && sha256(b) === r.decodedSha256, 'retained context bytes differ');
    }
  }
  const heldRows = reviews.flatMap(r => r.materialRows.filter(w => held.includes(w.pairKey))).sort((a, b) => a.fish.parsedRowIndexZeroBased - b.fish.parsedRowIndexZeroBased);
  check(stableJson(heldRows.map(w => ({parsedRowIndexZeroBased: w.fish.parsedRowIndexZeroBased, rawRecordSha256: w.fish.rawRecordSha256}))) === stableJson(method.heldFishRows.map(({reason: _reason, ...r}) => r)), 'held source row scope differs');
  return {method, reviews, acquisitions, profiles, fish, sites, taxa, taxonIndex, uidIndex: index(sites.rows, r => integer(r.UID) ? r.UID : null), visitIndex: index(sites.rows, epaNrsa1314VisitKey)};
}
export function epaNrsa1314InputPaths(plan: EpaNrsa1314Plan, read: Read) {
  const {method, reviews} = loadEpaNrsa1314Method(plan, read);
  return [...new Set(['src/lib/research/epa-nrsa-1314-fish-counts.ts', 'src/lib/research/epa-nrsa-fish-counts.ts', 'scripts/research/adapters/epa-nrsa-1314-fish-counts.ts', plan.methodReviewPath, ...method.acquisitions.map(a => a.archive.path), ...method.context.map(f => f.path), ...method.independentReviews.map(f => f.path), ...reviews.flatMap(r => [r.originalProposal.path, r.originalRecipe.path])])].sort();
}
const eventId = (prefix: string, payload: unknown) => prefix + '-' + sha256(stableJson(payload));
export function buildEpaNrsa1314Result(context: SourceAdapterContext, read: Read): SourceAdapterResult {
  const p = epaNrsa1314ParametersSchema.parse(context.parameters), loaded = loadEpaNrsa1314Method(p, read);
  const {method, reviews, fish, sites, taxa, taxonIndex, uidIndex, visitIndex} = loaded;
  z.string().datetime().parse(context.runStartedAt); check(context.sourceId === EPA_NRSA_SOURCE && context.stateCode === p.stateCode && Date.parse(method.reviewedAt) <= Date.parse(context.runStartedAt), 'run identity or chronology differs');
  const registry = JSON.parse(text(read('src/data/research/county-equivalent-registry.json')));
  const active = new Map<string, EpaNrsa1314County>(registry.countyEquivalents.filter((c: EpaNrsa1314County) => c.status === 'active').map((c: EpaNrsa1314County) => [c.countyFips, c]));
  const requested = context.requestedPairs.map(r => r.countyFips + ':' + r.speciesId).sort();
  check(new Set(requested).size === requested.length && stableJson(requested) === stableJson(p.candidatePairs) && p.candidateLimit === requested.length && requested.every(k => method.approvedPairs.includes(k) && !method.heldPairs.includes(k)), 'requested scope differs');
  for (const t of context.requestedPairs) check(method.taxa[t.speciesId] === t.scientificName && active.get(t.countyFips)?.stateCode === p.stateCode, 'target county or taxon differs');
  type Selected = {fishIndex: number; siteIndex: number; taxonIndex: number; date: string | null; disposition: string};
  const selected = new Map(requested.map(k => [k, [] as Selected[]])), names = new Map(Object.entries(method.taxa).map(([id, name]) => [name.toLowerCase(), id]));
  check(names.size === Object.keys(method.taxa).length, 'ambiguous catalog mapping');
  fish.rows.forEach((entry, i) => {
    const ti = taxonIndex.get(entry.record.TAXA_ID), uidMatches = uidIndex.get(entry.record.UID) ?? [];
    if (ti === undefined) return;
    const t = taxa.rows[ti].record, speciesId = names.get((t.GENUS + ' ' + t.SPECIES).toLowerCase()); if (!speciesId) return;
    // UID is used to locate material contradictions too, never as a substitute
    // for the independently unique complete visit join required for acceptance.
    for (const si of uidMatches) {
      const site = sites.rows[si].record, fips = epaNrsa1314Fips(site.STATECTY), target = fips ? selected.get(fips + ':' + speciesId) : undefined; if (!target) continue;
      const visit = epaNrsa1314VisitKey(entry.record), visits = visit ? visitIndex.get(visit) ?? [] : [];
      const value = epaNrsa1314PositiveValue(entry.record, site, t, active.get(fips!), method.taxa[speciesId]), taxonReview = method.taxonReviews[entry.record.TAXA_ID];
      const hold = method.heldFishRows.find(h => h.parsedRowIndexZeroBased === i);
      const disposition = hold ? 'review-hold: ' + hold.reason : uidMatches.length !== 1 || visits.length !== 1 || visits[0] !== si ? 'nonunique-or-contradictory-complete-join' : !taxonReview || taxonReview.speciesId !== speciesId ? 'taxonomy-not-reviewed' : value.reason ?? 'positive';
      target.push({fishIndex: i, siteIndex: si, taxonIndex: ti, date: disposition === 'positive' ? value.date : null, disposition});
    }
  });
  const result: SourceAdapterResult = {completedAt: context.runStartedAt, assertions: [], reviews: [], rejections: [], outcomes: [], artifacts: [], upstreamRequests: [], candidateRecordCount: 0, duplicateRecordCount: 0, errors: [], warnings: method.limitations};
  const witnesses: unknown[] = [], actor = EPA_NRSA_ADAPTER + '@' + EPA_NRSA_1314_VERSION;
  const originalRows = (r: Selected) => ({disposition: r.disposition, date: r.date, fish: original(fish.rows[r.fishIndex], r.fishIndex), site: original(sites.rows[r.siteIndex], r.siteIndex), taxon: original(taxa.rows[r.taxonIndex], r.taxonIndex)});
  for (const [key, rows] of selected) {
    const positive = rows.filter(r => r.disposition === 'positive'); check(positive.length, 'no qualified positive: ' + key);
    const review = reviews.find(r => r.witnesses.some(w => w.pairKey === key))!, primary = review.witnesses.find(w => w.pairKey === key)!;
    const scannedMaterial = rows.map(r => {const {disposition: _d, date: _date, ...w} = originalRows(r); return {pairKey: key, ...w};}).sort((a, b) => a.fish.parsedRowIndexZeroBased - b.fish.parsedRowIndexZeroBased);
    check(stableJson(scannedMaterial) === stableJson(review.materialRows.filter(w => w.pairKey === key)), 'complete material row review differs: ' + key);
    const first = positive.find(r => r.fishIndex === primary.fish.parsedRowIndexZeroBased);
    check(first && first.siteIndex === primary.site.parsedRowIndexZeroBased && first.taxonIndex === primary.taxon.parsedRowIndexZeroBased && first.date === primary.date && Number(fish.rows[first.fishIndex].record.TOTAL) === primary.total, 'primary reviewed witness not admitted: ' + key);
    result.candidateRecordCount += rows.length;
    const [countyFips, speciesId] = key.split(':'), dates = positive.map(r => r.date!).sort(), latest = dates.at(-1)!;
    const payload = {pairKey: key, methodReviewPath: p.methodReviewPath, methodReviewSha256: p.methodReviewSha256, profiles: loaded.profiles.map(v => ({name: v.definition.name, decodedSha256: v.ref.decodedSha256})), primaryFishIndex: first.fishIndex, positiveRows: positive.map(originalRows)};
    const assertionId = eventId('epa-nrsa-1314-fish-assertion', {runId: context.runId, ...payload}), caveats = [method.attribution, ...method.limitations, ...(method.speciesCaveats[speciesId] ?? []), ...(method.pairCaveats[key] ?? [])];
    result.assertions.push({schemaVersion: 1, eventId: assertionId, event_type: 'evidence.asserted', created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId, claim_type: 'recorded-present', evidence_kind: 'occurrence', scope: 'survey-area', source_record_id: eventId('retained-epa-nrsa-1314-fish-rows', payload), source_url: fish.ref.url, source_record_date: latest, retrieved_at: fish.ref.retrievedAt,
      taxon_match: {method: 'Reviewed original TAXA_ID and FINAL_NAME with exact case-normalized scientific name in the contemporaneous 2013/2014 taxonomy reference.', target_scientific_name: method.taxa[speciesId], source_scientific_name: method.taxa[speciesId], source_taxon_key: null},
      geography_match: {method: 'Unique original UID and complete site/date/visit/postal-state join; active publisher numeric FIPS, county name and primary state agree. One leading zero restored only for four-digit numeric FIPS. Explicit border qualifier checked independently.', source_state: p.stateCode, source_county: sites.rows[first.siteIndex].record.CNTYNAME, county_fips: countyFips},
      temporal_scope: 'Positive sample dates span ' + dates[0] + ' through ' + latest + '; independently selected primary date ' + primary.date + '.', spatial_scope: 'Sampled locations in the publisher-reported county; no countywide prevalence claim.', survey_scope: 'Distinct positive fish counts from qualified 2013/2014 Target-Sampled visits. Repeat-visit and non-native flags retained without county inventory or establishment inference.', normalized_payload_hash: sha256(stableJson(payload)), caveats,
      notes: ['Exact original fish, site and taxon row witnesses are retained in epa-nrsa-1314-fish-witnesses.json.', 'Site information: ' + sites.ref.url, 'Contemporaneous taxonomy: ' + taxa.ref.url]});
    result.reviews.push({schemaVersion: 1, eventId: eventId('epa-nrsa-1314-fish-review', {assertionId}), event_type: 'evidence.reviewed', created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId, references: {assertion_event_id: assertionId}, review_level: 'machine-validated', decision: 'accepted', publication_eligible: true, reason_codes: ['positive-distinct-fish-count', 'exact-publisher-county', 'unique-complete-visit-join', 'independently-reviewed-method', 'original-field-date'], notes: ['Offline reconstruction from hash-pinned source tables and independent proposals. Not individual human specimen verification.']});
    const rejectionIds: string[] = [];
    for (const reason of [...new Set(rows.filter(r => r.disposition !== 'positive').map(r => r.disposition))].sort()) {
      const excluded = rows.filter(r => r.disposition === reason), id = eventId('epa-nrsa-1314-fish-rejection', {runId: context.runId, key, reason, rows: excluded.map(r => r.fishIndex)}); rejectionIds.push(id);
      result.rejections.push({schemaVersion: 1, rejection_id: id, created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, candidate_locator: fish.ref.path + '#pair=' + key + '&reason=' + encodeURIComponent(reason), candidate_taxon: method.taxa[speciesId], candidate_geography: countyFips, normalized_target: {state_code: p.stateCode, county_fips: countyFips, species_id: speciesId}, reason_code: 'record-failed', supporting_notes: [excluded.length + ' rows excluded: ' + reason + '. Exact rows retained; no absence or non-detection inferred.']});
    }
    result.outcomes.push({schemaVersion: 1, outcome_id: eventId('epa-nrsa-1314-fish-outcome', {runId: context.runId, key}), run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId, status: 'evidence-found', scope_complete: true, recorded_at: context.runStartedAt, assertion_event_ids: [assertionId], rejection_ids: rejectionIds, query_urls: [fish.ref.url, sites.ref.url, taxa.ref.url], notes: ['Complete retained-table scan for this selected positive pair only. No protocol-completion or exhaustive current county inventory claim.']});
    witnesses.push({...payload, independentActor: review.actorId, primary, sourceRows: rows.map(originalRows)});
  }
  result.artifacts.push({filename: 'epa-nrsa-1314-fish-witnesses.json', mediaType: 'application/json', contents: JSON.stringify({schemaVersion: 1, method: EPA_NRSA_1314_METHOD, methodReviewPath: p.methodReviewPath, methodReviewSha256: p.methodReviewSha256, acquisitions: method.acquisitions, locatorConvention: 'Zero-based parsed data-row index excludes header; physical end line is one-based. Raw hash includes the original terminator. Only the pinned site file uses reversible single-byte decoding; original bytes never change. Omitted fields were blank.', acquisitionCodeQualification: 'Original receipts and executed recipes identify acquisition code. Offline code_commit identifies interpretation, not a fresh request.', profiles: loaded.profiles.map(v => v.ref), witnesses}, null, 2) + '\n'});
  return result;
}
