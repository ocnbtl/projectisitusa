import { parseEpaNrsaCsv, EPA_NRSA_SOURCE, EPA_NRSA_ADAPTER } from './epa-nrsa-fish-counts';

export { EPA_NRSA_SOURCE, EPA_NRSA_ADAPTER };
export const EPA_NRSA_1819_VERSION = '2.0.0';
export const EPA_NRSA_1819_METHOD = 'retained-epa-nrsa-1819-reviewed-fish-counts-v1';
export const EPA_NRSA_1819_MODE = 'retained-reviewed-fish-counts-1819';
export type EpaNrsa1819Row = Record<string, string>;
export type EpaNrsa1819County = {countyFips: string; stateCode: string; status: string; shortName: string; legalName: string; aliases: string[]};

// The 2018-19 site header has a BOM. Data-row slices still retain their exact
// original bytes and terminators; the already-tested 2023-24 parser is unchanged.
export function parseEpaNrsa1819Csv(decoded: Buffer, expectedHeaderBom: boolean) {
  const hasBom = decoded[0] === 0xef && decoded[1] === 0xbb && decoded[2] === 0xbf;
  if (hasBom !== expectedHeaderBom) throw new Error('EPA NRSA1819: unexpected header BOM profile');
  return parseEpaNrsaCsv(hasBom ? decoded.subarray(3) : decoded);
}

export function epaNrsa1819Date(value: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(201[89])$/u.exec(value);
  if (!match) return null;
  const date = match[3] + '-' + match[1].padStart(2, '0') + '-' + match[2].padStart(2, '0');
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date ? date : null;
}

export function epaNrsa1819VisitKey(row: EpaNrsa1819Row, stateField: 'STATE' | 'PSTL_CODE') {
  const date = epaNrsa1819Date(row.DATE_COL);
  if (!row.SITE_ID || !date || !['1', '2'].includes(row.VISIT_NO) || !/^[A-Z]{2}$/u.test(row[stateField] ?? '')) return null;
  return JSON.stringify([row.SITE_ID, date, row.VISIT_NO, row[stateField]]);
}

export function epaNrsa1819VisitIndex(rows: Array<{record: EpaNrsa1819Row}>, stateField: 'STATE' | 'PSTL_CODE') {
  const index = new Map<string, number[]>();
  rows.forEach((entry, i) => {
    const key = epaNrsa1819VisitKey(entry.record, stateField);
    if (key) index.set(key, [...(index.get(key) ?? []), i]);
  });
  return index;
}

const normalizeCounty = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^a-z0-9]/gu, '');
const integer = (value: string) => /^\d+$/u.test(value ?? '') && Number.isSafeInteger(Number(value));

// This predicate alone does not approve a record: the registered retained method
// must also validate unique joins, reviewed taxonomy, exact witnesses and holds.
export function epaNrsa1819PositiveValue(
  fish: EpaNrsa1819Row,
  sampling: EpaNrsa1819Row,
  site: EpaNrsa1819Row,
  taxon: EpaNrsa1819Row,
  county: EpaNrsa1819County | undefined,
  scientificName: string,
) {
  const reject = (reason: string) => ({ date: null, reason });
  if (!county || county.status !== 'active' || site.STATECTY !== 'F' + county.countyFips || site.PSTL_CODE !== county.stateCode || !site.CNTYNAME || ![county.shortName, county.legalName, ...county.aliases].some(name => normalizeCounty(name) === normalizeCounty(site.CNTYNAME))) return reject('publisher-county-identity');
  const key = epaNrsa1819VisitKey(fish, 'STATE');
  if (!key || key !== epaNrsa1819VisitKey(sampling, 'STATE') || key !== epaNrsa1819VisitKey(site, 'PSTL_CODE')) return reject('complete-visit-identity');
  if (!integer(fish.UID) || !integer(sampling.UID) || sampling.UID !== site.UID) return reject('original-visit-identifiers');
  if (!fish.TAXA_ID || fish.TAXA_ID !== taxon.TAXA_ID || fish.FINAL_NAME !== taxon.FINAL_NAME || (taxon.GENUS + ' ' + taxon.SPECIES).toLowerCase() !== scientificName.toLowerCase()) return reject('reviewed-taxon-identity');
  if (fish.IS_DISTINCT !== '1') return reject('non-distinct-taxon');
  if (!integer(fish.TOTAL) || Number(fish.TOTAL) <= 0) return reject('nonpositive-or-invalid-total');
  if (fish.ANOM_CT !== '' && !integer(fish.ANOM_CT)) return reject('invalid-anomaly-count');
  // ANOM_CT counts anomalies, not necessarily distinct fish; no unsupported
  // TOTAL ceiling is imposed on it. Effort sufficiency is preserved separately.
  if (sampling.SAMPLE_TYPE !== 'FISH' || sampling.FISH_SAMPLING !== '') return reject('sampling-qualification-requires-review');
  if (site.EVAL_CAT !== 'Target_Sampled' || site.DSGN_CYCLE !== '2018-19') return reject('visit-not-target-sampled');
  const date = epaNrsa1819Date(fish.DATE_COL)!;
  if (site.YEAR !== date.slice(0, 4) || (sampling.ACTUAL_DATE !== '' && epaNrsa1819Date(sampling.ACTUAL_DATE) !== date)) return reject('field-date-contradiction');
  return { date, reason: null };
}
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { sha256, stableJson } from './run-files';
import type { SourceAdapterContext, SourceAdapterResult } from './source-adapter';

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const pathSchema = z.string().regex(/^[a-zA-Z0-9.][a-zA-Z0-9_./-]+$/u).refine(p => !p.split('/').includes('..') && !p.includes('//'));
const fileSchema = z.object({path: pathSchema, bytes: z.number().int().positive().max(20000000), sha256: hashSchema}).strict();
const pairSchema = z.string().regex(/^[0-9]{5}:[a-z0-9][a-z0-9-]*$/u);
const speciesSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u);
const methodPathSchema = pathSchema.refine(p => /^src\/data\/research\/source-method-reviews\/epa-nrsa-fish-counts-1819-[a-z0-9-]+\.json$/u.test(p));
export const epaNrsa1819ParametersSchema = z.object({mode: z.literal(EPA_NRSA_1819_MODE), stateCode: z.string().regex(/^[A-Z]{2}$/u), methodReviewPath: methodPathSchema, methodReviewSha256: hashSchema, candidatePairs: z.array(pairSchema).min(1).max(5000), candidateLimit: z.number().int().positive().max(5000)}).strict();
export type EpaNrsa1819Plan = Pick<z.infer<typeof epaNrsa1819ParametersSchema>, 'methodReviewPath' | 'methodReviewSha256'>;
type Read1819 = (p: string) => Buffer;
type Entry1819 = ReturnType<typeof parseEpaNrsa1819Csv>[number];
const locator1819Schema = z.object({parsedRowIndexZeroBased: z.number().int().nonnegative(), physicalEndLineOneBased: z.number().int().positive(), rawRecordSha256: hashSchema, sourceFields: z.record(z.string(), z.string())}).strict();
const witness1819Schema = z.object({pairKey: pairSchema, fish: locator1819Schema, sampling: locator1819Schema, site: locator1819Schema, taxon2023: locator1819Schema, taxon2013: locator1819Schema.nullable(), date: z.string(), total: z.number().int().positive()}).strict();
const acquisitionNameSchema = z.enum(['primary2018', 'taxonomy2013', 'taxonomy2023']);
const profileNameSchema = z.enum(['fishcount', 'sampling', 'siteinfo', 'taxa2013', 'taxa2023']);
const acquisitionSchema = z.object({name: acquisitionNameSchema, archive: fileSchema, receipt: fileSchema, recipe: fileSchema, repositoryBaseCommit: z.string().regex(/^[a-f0-9]{40}$/u)}).strict();
const profile1819Schema = z.object({name: profileNameSchema, path: pathSchema, decodedBytes: z.number().int().positive().max(20000000), decodedSha256: hashSchema, rowCount: z.number().int().positive(), columns: z.array(z.string().min(1)).min(1), headerBom: z.boolean()}).strict();
const review1819Schema = z.object({schemaVersion: z.literal(1), kind: z.literal('independent-epa-nrsa-1819-fish-source-review-v1'), recordedBy: z.literal('MAIN'), actorId: z.string().min(1), recordedAt: z.string().datetime(), originalProposal: fileSchema, originalSupplement: fileSchema.nullable(), originalRecipe: fileSchema, originalCommit: z.string().regex(/^[a-f0-9]{40}$/u), inputArchive: fileSchema, acquisitionReceiptSha256: hashSchema, leasedPairs: z.array(pairSchema).min(1), heldPairs: z.array(pairSchema), witnesses: z.array(witness1819Schema).min(1)}).strict();
const taxonReviewSchema = z.object({speciesId: speciesSchema, commonName: z.string().min(1), taxon2023: locator1819Schema, taxon2013: locator1819Schema.nullable(), rationale: z.string().min(1), caveats: z.array(z.string().min(1))}).strict();
const method1819Schema = z.object({schemaVersion: z.literal(1), methodVersion: z.literal(EPA_NRSA_1819_METHOD), sourceId: z.literal(EPA_NRSA_SOURCE), status: z.literal('approved-with-specific-holds'), reviewedBy: z.literal('MAIN'), reviewedAt: z.string().datetime(), acquisitions: z.array(acquisitionSchema).length(3), profiles: z.array(profile1819Schema).length(5), manualTaxonomy: fileSchema, context: z.array(fileSchema).min(1), independentReviews: z.array(fileSchema).min(2), taxa: z.record(speciesSchema, z.string().min(1)), taxonReviews: z.record(z.string().regex(/^\d+$/u), taxonReviewSchema), approvedPairs: z.array(pairSchema).min(1), heldPairs: z.array(pairSchema), heldFishRows: z.array(z.object({parsedRowIndexZeroBased: z.number().int().nonnegative(), rawRecordSha256: hashSchema, reason: z.string().min(1)}).strict()), attribution: z.string().min(1), rationale: z.string().min(1), limitations: z.array(z.string().min(1)).min(1), speciesCaveats: z.record(speciesSchema, z.array(z.string().min(1))), pairCaveats: z.record(pairSchema, z.array(z.string().min(1)))}).strict();
const response1819Schema = fileSchema.extend({url: z.url(), finalUrl: z.url(), status: z.literal(200), startedAt: z.string().datetime(), retrievedAt: z.string().datetime(), storageEncoding: z.literal('gzip'), decodedBytes: z.number().int().positive().max(20000000), decodedSha256: hashSchema}).passthrough();
function assert1819(value: unknown, message: string): asserts value {if (!value) throw new Error('EPA NRSA1819: ' + message);}
const text1819 = (bytes: Buffer) => new TextDecoder('utf-8', {fatal: true}).decode(bytes);
function pinned1819(ref: z.infer<typeof fileSchema>, read: Read1819) {const b = read(ref.path); assert1819(b.length === ref.bytes && sha256(b) === ref.sha256, 'pinned input differs: ' + ref.path); return b;}
function embedded1819(ref: z.infer<typeof fileSchema>, read: Read1819): Read1819 {
  const doc = z.object({schemaVersion: z.literal(1), files: z.array(z.object({originalPath: pathSchema, bytes: z.number().int().nonnegative().max(20000000), sha256: hashSchema, encoding: z.literal('base64'), contents: z.string()}).strict())}).passthrough().parse(JSON.parse(text1819(gunzipSync(pinned1819(ref, read), {maxOutputLength: 20000000}))));
  const entries = new Map<string, Buffer>();
  for (const f of doc.files) {const bytes = Buffer.from(f.contents, 'base64'); assert1819(!entries.has(f.originalPath) && bytes.length === f.bytes && sha256(bytes) === f.sha256, 'embedded entry differs: ' + f.originalPath); entries.set(f.originalPath, bytes);}
  return p => {const bytes = entries.get(p); assert1819(bytes, 'missing embedded file: ' + p); return bytes;};
}
const primaryUrls = [
  'https://www.epa.gov/system/files/other-files/2022-03/nrsa-1819-fish-sampling-information-data.csv',
  'https://www.epa.gov/system/files/other-files/2022-03/nrsa-1819-fish-sampling-information-metadata.txt',
  'https://www.epa.gov/system/files/other-files/2022-03/nrsa-1819-fish-count-data.csv',
  'https://www.epa.gov/system/files/other-files/2022-03/nrsa-1819-fish-count-metadata.txt',
  'https://www.epa.gov/system/files/other-files/2023-01/NRSA_1819_SiteInfo.csv',
  'https://www.epa.gov/system/files/other-files/2023-01/NRSA18_19_Site_Information_Metadata.txt',
];
const acquisitionContracts = {
  primary2018: {kind: 'official-epa-nrsa-1819-source-preflight', urls: primaryUrls},
  taxonomy2013: {kind: 'official-epa-nrsa-1314-taxonomy-discovery', urls: ['https://www.epa.gov/sites/default/files/2019-04/nrsa1314_fishtaxa_02042019.csv', 'https://www.epa.gov/sites/default/files/2019-04/nrsa1314_fishtaxa_meta_04292019.txt']},
  taxonomy2023: {kind: 'official-epa-nrsa-2324-source-preflight', urls: ['fishcount', 'fishcount_metadata', 'fishtaxa', 'fishtaxa_metadata', 'siteinfo', 'siteinfo_metadata'].map(n => 'https://www.epa.gov/system/files/other-files/2026-06/nrsa2324_' + n + '.csv')},
};
const profileContracts = {
  fishcount: {acquisition: 'primary2018', url: primaryUrls[2], bom: false},
  sampling: {acquisition: 'primary2018', url: primaryUrls[0], bom: false},
  siteinfo: {acquisition: 'primary2018', url: primaryUrls[4], bom: true},
  taxa2013: {acquisition: 'taxonomy2013', url: acquisitionContracts.taxonomy2013.urls[0], bom: false},
  taxa2023: {acquisition: 'taxonomy2023', url: 'https://www.epa.gov/system/files/other-files/2026-06/nrsa2324_fishtaxa.csv', bom: false},
} as const;
const nonempty1819 = (row: EpaNrsa1819Row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== ''));
function check1819Witness(rows: Entry1819[], witness: z.infer<typeof locator1819Schema>) {
  const row = rows[witness.parsedRowIndexZeroBased];
  assert1819(row && row.physicalEndLineOneBased === witness.physicalEndLineOneBased && sha256(row.raw) === witness.rawRecordSha256 && stableJson(nonempty1819(row.record)) === stableJson(witness.sourceFields), 'independent raw witness differs');
  return row;
}
export function normalize1819OriginalWitness(value: unknown) {
  const raw = z.record(z.string(), z.unknown()).parse(value);
  const loc = (v: unknown) => {const r = z.record(z.string(), z.unknown()).parse(v); return locator1819Schema.parse(Object.fromEntries(['parsedRowIndexZeroBased','physicalEndLineOneBased','rawRecordSha256','sourceFields'].map(k => [k, r[k]])));};
  return witness1819Schema.parse({pairKey: raw.pairKey, date: raw.date, total: raw.total, fish: loc(raw.fish), sampling: loc(raw.sampling), site: loc(raw.site), taxon2023: loc(raw.taxon2023), taxon2013: raw.taxon2013 === null ? null : loc(raw.taxon2013)});
}
export function loadEpaNrsa1819Method(plan: EpaNrsa1819Plan, read: Read1819) {
  const bytes = read(methodPathSchema.parse(plan.methodReviewPath)); assert1819(sha256(bytes) === hashSchema.parse(plan.methodReviewSha256), 'method hash differs');
  const method = method1819Schema.parse(JSON.parse(text1819(bytes)));
  method.context.forEach(ref => pinned1819(ref, read));
  assert1819(new Set(method.acquisitions.map(a => a.name)).size === 3 && new Set(method.profiles.map(p => p.name)).size === 5, 'duplicate acquisition or profile');
  const cache = new Map<string, Read1819>();
  const acquisitions = method.acquisitions.map(a => {
    let retained = cache.get(a.archive.sha256); if (!retained) {retained = embedded1819(a.archive, read); cache.set(a.archive.sha256, retained);}
    const receipt = JSON.parse(text1819(pinned1819(a.receipt, retained))); pinned1819(a.recipe, retained);
    const contract = acquisitionContracts[a.name];
    assert1819(receipt.kind === contract.kind && receipt.repositoryBaseCommit === a.repositoryBaseCommit && receipt.recipe?.path === a.recipe.path && receipt.recipe?.sha256 === a.recipe.sha256 && receipt.providerWrites === 0 && receipt.automaticRetries === 0 && Array.isArray(receipt.receipts) && receipt.receipts.length === contract.urls.length, 'acquisition lineage differs: ' + a.name);
    const refs = receipt.receipts.map((v: unknown) => response1819Schema.parse(v));
    assert1819(stableJson(refs.map((r: z.infer<typeof response1819Schema>) => r.url).sort()) === stableJson([...contract.urls].sort()) && new Set(refs.map((r: z.infer<typeof response1819Schema>) => r.path)).size === refs.length, 'acquisition URL scope differs');
    for (const r of refs) {
      assert1819(r.finalUrl === r.url && Date.parse(r.startedAt) <= Date.parse(r.retrievedAt) && Date.parse(r.retrievedAt) <= Date.parse(method.reviewedAt), 'acquisition response or chronology differs');
      const decoded = gunzipSync(pinned1819(r, retained), {maxOutputLength: 20000000});
      assert1819(decoded.length === r.decodedBytes && sha256(decoded) === r.decodedSha256, 'decoded acquisition differs');
    }
    return {definition: a, receipt, refs: refs as Array<z.infer<typeof response1819Schema>>, retained};
  });
  const profiles = method.profiles.map(spec => {
    const contract = profileContracts[spec.name], acquisition = acquisitions.find(a => a.definition.name === contract.acquisition)!;
    const refs = acquisition.refs.filter(r => r.url === contract.url && r.path === spec.path); assert1819(refs.length === 1, 'profile receipt differs');
    const ref = refs[0], decoded = gunzipSync(pinned1819(ref, acquisition.retained), {maxOutputLength: 20000000});
    assert1819(spec.decodedBytes === ref.decodedBytes && spec.decodedSha256 === ref.decodedSha256 && spec.headerBom === contract.bom, 'profile byte or BOM contract differs');
    const rows = parseEpaNrsa1819Csv(decoded, spec.headerBom);
    assert1819(rows.length === spec.rowCount && new Set(spec.columns).size === spec.columns.length && rows.every(r => stableJson(Object.keys(r.record)) === stableJson(spec.columns)), 'CSV shape differs');
    return {definition: spec, ref, rows};
  });
  const profile = (name: z.infer<typeof profileNameSchema>) => profiles.find(p => p.definition.name === name)!;
  const fish = profile('fishcount'), sampling = profile('sampling'), sites = profile('siteinfo'), taxa2023 = profile('taxa2023'), taxa2013 = profile('taxa2013');
  const taxonIndex = new Map<string, number>();
  taxa2023.rows.forEach((e, i) => {assert1819(e.record.TAXA_ID && !taxonIndex.has(e.record.TAXA_ID), 'duplicate taxon identity'); taxonIndex.set(e.record.TAXA_ID, i);});
  for (const [key, review] of Object.entries(method.taxonReviews)) {
    const current = check1819Witness(taxa2023.rows, review.taxon2023).record;
    assert1819(current.TAXA_ID === key && current.FINAL_NAME === review.commonName && method.taxa[review.speciesId]?.toLowerCase() === (current.GENUS + ' ' + current.SPECIES).toLowerCase(), 'reviewed taxonomy differs');
    if (review.taxon2013) {const prior = check1819Witness(taxa2013.rows, review.taxon2013).record; assert1819(['TAXA_ID', 'FINAL_NAME', 'GENUS', 'SPECIES'].every(k => prior[k] === current[k]), 'historical taxonomy crosswalk differs');}
  }
  const manual = z.object({schemaVersion: z.literal(1), kind: z.literal('main-verified-epa-nrsa-1819-taxonomy-manual'), reviewedBy: z.literal('MAIN'), reviewedAt: z.string().datetime(), source: fileSchema, sourceUrl: z.literal('https://19january2021snapshot.epa.gov/sites/static/files/2018-10/documents/nrsa1819_fom_appendix_version_1.1_april_2018.pdf'), retrievalReceipt: fileSchema, extraction: fileSchema, extractionRecipe: fileSchema, entries: z.array(z.object({speciesId: speciesSchema, scientificName: z.string(), commonName: z.string(), pdfPageOneBased: z.number().int().positive(), exactExtractedLine: z.string()}).strict()).length(3), visualVerification: z.string().min(1)}).strict().parse(JSON.parse(text1819(pinned1819(method.manualTaxonomy, read))));
  for (const ref of [manual.source, manual.retrievalReceipt, manual.extraction, manual.extractionRecipe]) {
    assert1819(method.context.some(f => stableJson(f) === stableJson(ref)), 'manual context not declared'); pinned1819(ref, read);
  }
  assert1819(Date.parse(manual.reviewedAt) <= Date.parse(method.reviewedAt) && read(manual.source.path).subarray(0,5).equals(Buffer.from('%PDF-')), 'manual identity or chronology differs');
  const manualReceipt = JSON.parse(text1819(read(manual.retrievalReceipt.path))), extraction = JSON.parse(text1819(read(manual.extraction.path)));
  assert1819(manualReceipt.kind === 'official-epa-manual-usgs-taxonomy-context' && manualReceipt.providerWrites === 0 && manualReceipt.automaticRetries === 0 && extraction.sourceSha256 === manual.source.sha256 && extraction.pdfPages === 94, 'manual lineage differs');
  const manualResponses = manualReceipt.receipts.filter((r: {url?: string}) => r.url === manual.sourceUrl);
  assert1819(manualResponses.length === 1 && manualResponses[0].status === 200 && manualResponses[0].finalUrl === manual.sourceUrl && manualResponses[0].sha256 === manual.source.sha256 && manualResponses[0].bytes === manual.source.bytes && Date.parse(manualResponses[0].retrievedAt) <= Date.parse(manual.reviewedAt), 'manual receipt differs');
  assert1819(new Set(manual.entries.map(e => e.speciesId)).size === 3, 'duplicate manual taxonomy entry');
  for (const entry of manual.entries) {
    const pages = extraction.pages.filter((v: {pdfPageOneBased?: number}) => v.pdfPageOneBased === entry.pdfPageOneBased);
    assert1819(pages.length === 1 && pages[0].text.split(/\r?\n/u).some((line: string) => line.trim() === entry.exactExtractedLine) && entry.exactExtractedLine.replace(/\s+/gu, ' ').toLowerCase().endsWith((entry.scientificName + ' ' + entry.commonName).toLowerCase()) && method.taxa[entry.speciesId] === entry.scientificName, 'manual name or line differs');
  }
  for (const review of Object.values(method.taxonReviews)) if (!review.taxon2013) assert1819(manual.entries.some(e => e.speciesId === review.speciesId && e.commonName.toUpperCase() === review.commonName), 'historical taxonomy corroboration absent');
  const reviews = method.independentReviews.map(ref => review1819Schema.parse(JSON.parse(text1819(pinned1819(ref, read)))));
  assert1819(new Set(reviews.map(r => r.actorId)).size === reviews.length && reviews.every(r => r.actorId !== 'MAIN'), 'independent actors differ');
  const primary = acquisitions.find(a => a.definition.name === 'primary2018')!;
  const approved = reviews.flatMap(r => r.witnesses.map(w => w.pairKey)).sort(), held = reviews.flatMap(r => r.heldPairs).sort();
  assert1819(new Set(approved).size === approved.length && new Set(held).size === held.length && stableJson(approved) === stableJson(method.approvedPairs) && stableJson(held) === stableJson(method.heldPairs) && !approved.some(p => held.includes(p)), 'independent scope differs');
  for (const review of reviews) {
    const original = JSON.parse(text1819(pinned1819(review.originalProposal, read))); pinned1819(review.originalRecipe, read);
    assert1819(original.actorId === review.actorId && Array.isArray(original.witnesses) && original.status === 'proposal-ready-main-method-required', 'original proposal actor or witnesses differ');
    const originalScope = original.scope ?? original;
    assert1819(stableJson([...originalScope.leasedPairs].sort()) === stableJson([...review.leasedPairs].sort()), 'original leased scope differs');
    let supplemental: unknown[] = [], expectedHeld = originalScope.heldPairs;
    if (review.originalSupplement) {
      const supplement = JSON.parse(text1819(pinned1819(review.originalSupplement, read)));
      assert1819(supplement.actorId === review.actorId && supplement.kind === 'epa-nrsa-2018-19-supplementary-taxonomy-qualification' && supplement.originalProposal.sha256 === review.originalProposal.sha256 && stableJson(supplement.inputArchive) === stableJson(review.inputArchive), 'supplement lineage differs');
      supplemental = supplement.witnesses; expectedHeld = supplement.scope.revisedProposedHeldPairs;
      assert1819(stableJson(supplement.scope.originalHeldPairs) === stableJson(originalScope.heldPairs) && stableJson([...supplement.scope.originalSupportedPairs].sort()) === stableJson([...originalScope.supportedPairs].sort()), 'supplement original scope differs');
      for (const value of supplemental) {
        const w = normalize1819OriginalWitness(value);
        assert1819(originalScope.heldPairs.includes(w.pairKey) && manual.entries.some(e => e.speciesId === w.pairKey.split(':')[1]), 'supplement is not a corroborated taxonomy hold');
        const originals = original.reviewedRecords.filter((v: {pairKey?: string; fish?: {parsedRowIndexZeroBased?: number}}) => v.pairKey === w.pairKey && v.fish?.parsedRowIndexZeroBased === w.fish.parsedRowIndexZeroBased);
        assert1819(originals.length === 1 && stableJson(normalize1819OriginalWitness(originals[0])) === stableJson(w), 'supplement altered original row');
      }
      assert1819(new Set(supplemental.map(v => normalize1819OriginalWitness(v).pairKey)).size === supplemental.length && stableJson([...originalScope.heldPairs].filter((k: string) => !supplemental.some(v => normalize1819OriginalWitness(v).pairKey === k)).sort()) === stableJson([...expectedHeld].sort()), 'supplement hold scope differs');
    }
    assert1819(stableJson([...expectedHeld].sort()) === stableJson([...review.heldPairs].sort()), 'original held scope differs');
    assert1819(stableJson(review.inputArchive) === stableJson(primary.definition.archive) && review.acquisitionReceiptSha256 === primary.definition.receipt.sha256 && Date.parse(review.recordedAt) <= Date.parse(method.reviewedAt) && profiles.every(p => Date.parse(p.ref.retrievedAt) <= Date.parse(review.recordedAt)), 'review lineage or chronology differs');
    assert1819(stableJson([...review.leasedPairs].sort()) === stableJson([...review.witnesses.map(w => w.pairKey), ...review.heldPairs].sort()), 'review lease scope differs');
    for (const w of review.witnesses) {
      const originals = [...original.witnesses, ...supplemental].filter((v: {pairKey?: string}) => v.pairKey === w.pairKey); assert1819(originals.length === 1, 'original proposal selection differs');
      const sourceWitness = normalize1819OriginalWitness(originals[0]);
      assert1819(stableJson(sourceWitness) === stableJson(w), 'normalized proposal witness differs');
      check1819Witness(fish.rows, w.fish); check1819Witness(sampling.rows, w.sampling); check1819Witness(sites.rows, w.site); check1819Witness(taxa2023.rows, w.taxon2023); if (w.taxon2013) check1819Witness(taxa2013.rows, w.taxon2013);
    }
  }
  assert1819(new Set(method.heldFishRows.map(h => h.parsedRowIndexZeroBased)).size === method.heldFishRows.length, 'duplicate held rows');
  for (const h of method.heldFishRows) assert1819(fish.rows[h.parsedRowIndexZeroBased] && sha256(fish.rows[h.parsedRowIndexZeroBased].raw) === h.rawRecordSha256, 'held source row differs');
  return {method, acquisitions, profiles, reviews, fish, sampling, sites, taxa2023, taxa2013, taxonIndex, samplingIndex: epaNrsa1819VisitIndex(sampling.rows, 'STATE'), siteIndex: epaNrsa1819VisitIndex(sites.rows, 'PSTL_CODE')};
}
export function epaNrsa1819InputPaths(plan: EpaNrsa1819Plan, read: Read1819) {
  const loaded = loadEpaNrsa1819Method(plan, read), {method, reviews} = loaded;
  return [...new Set(['src/lib/research/epa-nrsa-1819-fish-counts.ts', 'src/lib/research/epa-nrsa-fish-counts.ts', 'scripts/research/adapters/epa-nrsa-1819-fish-counts.ts', plan.methodReviewPath, ...method.acquisitions.map(a => a.archive.path), ...method.context.map(f => f.path), ...method.independentReviews.map(f => f.path), ...reviews.flatMap(r => [r.originalProposal.path, r.originalRecipe.path, ...(r.originalSupplement ? [r.originalSupplement.path] : [])]), method.manualTaxonomy.path])].sort();
}
const id1819 = (prefix: string, payload: unknown) => prefix + '-' + sha256(stableJson(payload));
function original1819(entry: Entry1819, index: number) {return {parsedRowIndexZeroBased: index, physicalEndLineOneBased: entry.physicalEndLineOneBased, rawRecordSha256: sha256(entry.raw), sourceFields: nonempty1819(entry.record)};}
export function buildEpaNrsa1819Result(context: SourceAdapterContext, read: Read1819): SourceAdapterResult {
  const p = epaNrsa1819ParametersSchema.parse(context.parameters), loaded = loadEpaNrsa1819Method(p, read);
  const {method, reviews, fish, sampling, sites, taxa2023, taxa2013, taxonIndex, samplingIndex, siteIndex} = loaded;
  z.string().datetime().parse(context.runStartedAt);
  assert1819(context.sourceId === EPA_NRSA_SOURCE && context.stateCode === p.stateCode && Date.parse(method.reviewedAt) <= Date.parse(context.runStartedAt), 'run identity or chronology differs');
  const registry = JSON.parse(text1819(read('src/data/research/county-equivalent-registry.json')));
  const active = new Map<string, EpaNrsa1819County>(registry.countyEquivalents.filter((c: EpaNrsa1819County) => c.status === 'active').map((c: EpaNrsa1819County) => [c.countyFips, c]));
  const requested = context.requestedPairs.map(r => r.countyFips + ':' + r.speciesId).sort();
  assert1819(new Set(requested).size === requested.length && stableJson(requested) === stableJson(p.candidatePairs) && p.candidateLimit === requested.length && requested.every(k => method.approvedPairs.includes(k) && !method.heldPairs.includes(k)), 'requested scope differs');
  for (const target of context.requestedPairs) assert1819(method.taxa[target.speciesId] === target.scientificName && active.get(target.countyFips)?.stateCode === p.stateCode, 'target county or taxon differs');
  type Selected = {fishIndex: number; samplingIndex: number; siteIndex: number; taxonIndex: number; date: string | null; disposition: string};
  const selected = new Map(requested.map(k => [k, [] as Selected[]]));
  const names = new Map(Object.entries(method.taxa).map(([species, name]) => [name.toLowerCase(), species]));
  assert1819(names.size === Object.keys(method.taxa).length, 'ambiguous catalog mapping');
  fish.rows.forEach((entry, i) => {
    const key = epaNrsa1819VisitKey(entry.record, 'STATE'), ti = taxonIndex.get(entry.record.TAXA_ID);
    if (!key || ti === undefined) return;
    const sampleMatches = samplingIndex.get(key) ?? [], siteMatches = siteIndex.get(key) ?? [];
    assert1819(sampleMatches.length === 1 && siteMatches.length === 1, 'fish visit does not have unique complete joins');
    const mi = sampleMatches[0], si = siteMatches[0], s = sites.rows[si].record, t = taxa2023.rows[ti].record;
    const species = names.get((t.GENUS + ' ' + t.SPECIES).toLowerCase());
    if (!species || !/^F\d{5}$/u.test(s.STATECTY)) return;
    const countyFips = s.STATECTY.slice(1), target = selected.get(countyFips + ':' + species); if (!target) return;
    const taxonReview = method.taxonReviews[entry.record.TAXA_ID];
    const positive = epaNrsa1819PositiveValue(entry.record, sampling.rows[mi].record, s, t, active.get(countyFips), method.taxa[species]);
    const hold = method.heldFishRows.find(h => h.parsedRowIndexZeroBased === i);
    const disposition = hold ? 'review-hold: ' + hold.reason : !taxonReview || taxonReview.speciesId !== species ? 'taxonomy-not-reviewed' : positive.reason ?? 'positive';
    target.push({fishIndex: i, samplingIndex: mi, siteIndex: si, taxonIndex: ti, date: disposition === 'positive' ? positive.date : null, disposition});
  });
  const result: SourceAdapterResult = {completedAt: context.runStartedAt, assertions: [], reviews: [], rejections: [], outcomes: [], artifacts: [], upstreamRequests: [], candidateRecordCount: 0, duplicateRecordCount: 0, errors: [], warnings: method.limitations};
  const witnesses: unknown[] = [], actor = EPA_NRSA_ADAPTER + '@' + EPA_NRSA_1819_VERSION;
  const originalRows = (row: Selected) => {
    const taxonomy = method.taxonReviews[fish.rows[row.fishIndex].record.TAXA_ID];
    return {disposition: row.disposition, date: row.date, fish: original1819(fish.rows[row.fishIndex], row.fishIndex), sampling: original1819(sampling.rows[row.samplingIndex], row.samplingIndex), site: original1819(sites.rows[row.siteIndex], row.siteIndex), taxon2023: original1819(taxa2023.rows[row.taxonIndex], row.taxonIndex), taxon2013: taxonomy?.taxon2013 ? original1819(taxa2013.rows[taxonomy.taxon2013.parsedRowIndexZeroBased], taxonomy.taxon2013.parsedRowIndexZeroBased) : null};
  };
  for (const [key, rows] of selected) {
    const positive = rows.filter(r => r.disposition === 'positive'); assert1819(positive.length, 'no qualified positive: ' + key);
    const review = reviews.find(r => r.witnesses.some(w => w.pairKey === key))!, primary = review.witnesses.find(w => w.pairKey === key)!;
    const first = positive.find(r => r.fishIndex === primary.fish.parsedRowIndexZeroBased);
    assert1819(first && first.samplingIndex === primary.sampling.parsedRowIndexZeroBased && first.siteIndex === primary.site.parsedRowIndexZeroBased && first.taxonIndex === primary.taxon2023.parsedRowIndexZeroBased && first.date === primary.date && Number(fish.rows[first.fishIndex].record.TOTAL) === primary.total, 'primary reviewed witness not admitted: ' + key);
    assert1819(stableJson(primary.taxon2013) === stableJson(method.taxonReviews[fish.rows[first.fishIndex].record.TAXA_ID].taxon2013), 'primary historical taxonomy differs');
    result.candidateRecordCount += rows.length;
    const [countyFips, species] = key.split(':'), dates = positive.map(r => r.date!).sort(), latest = dates.at(-1)!;
    const payload = {pairKey: key, methodReviewPath: p.methodReviewPath, methodReviewSha256: p.methodReviewSha256, profiles: loaded.profiles.map(v => ({name: v.definition.name, decodedSha256: v.ref.decodedSha256})), primaryFishIndex: first.fishIndex, positiveRows: positive.map(originalRows)};
    const assertionId = id1819('epa-nrsa-1819-fish-assertion', {runId: context.runId, ...payload});
    const caveats = [method.attribution, ...method.limitations, ...(method.speciesCaveats[species] ?? []), ...(method.pairCaveats[key] ?? [])];
    result.assertions.push({schemaVersion: 1, eventId: assertionId, event_type: 'evidence.asserted', created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: species, claim_type: 'recorded-present', evidence_kind: 'occurrence', scope: 'survey-area', source_record_id: id1819('retained-epa-nrsa-1819-fish-rows', payload), source_url: fish.ref.url, source_record_date: latest, retrieved_at: fish.ref.retrievedAt,
      taxon_match: {method: 'Reviewed original TAXA_ID and common-name identity with exact case-normalized scientific name; historical reference corroboration retained.', target_scientific_name: method.taxa[species], source_scientific_name: method.taxa[species], source_taxon_key: null},
      geography_match: {method: 'Unique complete site/date/visit/state join to active publisher STATECTY FIPS and county name; original distinct UID values retained. Gross geographic contradictions held.', source_state: p.stateCode, source_county: sites.rows[first.siteIndex].record.CNTYNAME, county_fips: countyFips},
      temporal_scope: 'Positive sample dates span ' + dates[0] + ' through ' + latest + '; independently selected primary date ' + primary.date + '.', spatial_scope: 'Sampled locations in the publisher-reported county; no countywide prevalence claim.', survey_scope: 'Distinct positive fish counts from 2018/2019 Target_Sampled visits with unqualified fish sampling status. Effort sufficiency remains a caveat, and county inventory completeness is not inferred.', normalized_payload_hash: sha256(stableJson(payload)), caveats,
      notes: ['Exact original fish, sampling, site and taxon row witnesses are retained in epa-nrsa-1819-fish-witnesses.json.', 'Site information: ' + sites.ref.url, 'Sampling information: ' + sampling.ref.url, 'Taxonomy: ' + taxa2023.ref.url, 'Historical taxonomy: ' + taxa2013.ref.url]});
    result.reviews.push({schemaVersion: 1, eventId: id1819('epa-nrsa-1819-fish-review', {assertionId}), event_type: 'evidence.reviewed', created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: species, references: {assertion_event_id: assertionId}, review_level: 'machine-validated', decision: 'accepted', publication_eligible: true, reason_codes: ['positive-distinct-fish-count', 'exact-publisher-county', 'unique-complete-visit-join', 'independently-reviewed-method', 'original-field-date'], notes: ['Offline reconstruction from hash-pinned source tables and independent proposals. Not individual human specimen verification.']});
    const rejectionIds: string[] = [];
    for (const reason of [...new Set(rows.filter(r => r.disposition !== 'positive').map(r => r.disposition))].sort()) {
      const excluded = rows.filter(r => r.disposition === reason), rejectionId = id1819('epa-nrsa-1819-fish-rejection', {runId: context.runId, key, reason, rows: excluded.map(r => r.fishIndex)}); rejectionIds.push(rejectionId);
      result.rejections.push({schemaVersion: 1, rejection_id: rejectionId, created_at: context.runStartedAt, actor_type: 'adapter', actor_id: actor, run_id: context.runId, source_id: EPA_NRSA_SOURCE, candidate_locator: fish.ref.path + '#pair=' + key + '&reason=' + encodeURIComponent(reason), candidate_taxon: method.taxa[species], candidate_geography: countyFips, normalized_target: {state_code: p.stateCode, county_fips: countyFips, species_id: species}, reason_code: 'record-failed', supporting_notes: [excluded.length + ' rows excluded: ' + reason + '. Exact rows retained; no absence or non-detection inferred.']});
    }
    result.outcomes.push({schemaVersion: 1, outcome_id: id1819('epa-nrsa-1819-fish-outcome', {runId: context.runId, key}), run_id: context.runId, source_id: EPA_NRSA_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: species, status: 'evidence-found', scope_complete: true, recorded_at: context.runStartedAt, assertion_event_ids: [assertionId], rejection_ids: rejectionIds, query_urls: [fish.ref.url, sampling.ref.url, sites.ref.url, taxa2023.ref.url, taxa2013.ref.url], notes: ['Complete retained-table scan for this selected positive pair only. No protocol-completion or exhaustive current county inventory claim.']});
    witnesses.push({...payload, independentActor: review.actorId, primary, sourceRows: rows.map(originalRows)});
  }
  result.artifacts.push({filename: 'epa-nrsa-1819-fish-witnesses.json', mediaType: 'application/json', contents: JSON.stringify({schemaVersion: 1, method: EPA_NRSA_1819_METHOD, methodReviewPath: p.methodReviewPath, methodReviewSha256: p.methodReviewSha256, acquisitions: method.acquisitions, locatorConvention: 'Zero-based parsed data-row index excludes header. Physical end line is one-based in original CSV. Raw hash includes original terminator. Only the known site header BOM is removed for parsing. Omitted source fields were blank.', acquisitionCodeQualification: 'Original receipt and executed recipe identify source acquisition. Offline run code_commit identifies interpretation code, not a fresh request. The primary receipt is a retained byte-identical reacquisition after the disclosed receipt-path collision.', profiles: loaded.profiles.map(v => v.ref), witnesses}, null, 2) + '\n'});
  return result;
}
