import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { sha256, stableJson } from './run-files';
import { parseWqpCsv, resolveWqpStation, WQP_SOURCE, WQP_ADAPTER } from './wqp-field-positive-review';
import { wqpFishPositiveRowValue } from './wqp-fish-positive-review';
import { decodeSingleCsvZip } from './single-csv-zip';
import type { SourceAdapterContext, SourceAdapterResult } from './source-adapter';
export const WQP_REVIEWED_FISH_VERSION = '3.0.0';
export const WQP_REVIEWED_FISH_METHOD = 'retained-wqp-reviewed-fish-measurement-v3';
const hash = z.string().regex(/^[a-f0-9]{64}$/u), safePath = z.string().regex(/^[a-zA-Z0-9.][a-zA-Z0-9_./-]+$/u).refine(p => !p.split('/').includes('..') && !p.includes('//'));
const file = z.object({ path: safePath, bytes: z.number().int().positive().max(20000000), sha256: hash }).strict();
const speciesId = z.string().regex(/^[a-z0-9][a-z0-9-]*$/u), pair = z.string().regex(/^[0-9]{5}:[a-z0-9][a-z0-9-]*$/u);
const methodPath = safePath.refine(p => /^src\/data\/research\/source-method-reviews\/wqp-reviewed-fish-[a-z0-9-]+\.json$/u.test(p));
export const wqpReviewedFishParametersSchema = z.object({ mode: z.literal('retained-reviewed-fish-measurement'), stateCode: z.string().regex(/^[A-Z]{2}$/u), methodReviewPath: methodPath, methodReviewSha256: hash, candidatePairs: z.array(pair).min(1).max(5000), candidateLimit: z.number().int().positive().max(5000) }).strict();
export type WqpReviewedFishPlan = Pick<z.infer<typeof wqpReviewedFishParametersSchema>, 'methodReviewPath' | 'methodReviewSha256'>;
type Read = (p: string) => Buffer;
type CsvEntry = ReturnType<typeof parseWqpCsv>[number];
type Row = Record<string, string>;
const profileSchema = z.object({ acquisitionId: z.string().min(1), path: safePath, encoding: z.enum(['gzip', 'zip']), decodedBytes: z.number().int().positive().max(20000000), decodedSha256: hash, rowCount: z.number().int().positive() }).strict();
const methodSchema = z.object({ schemaVersion: z.literal(1), methodVersion: z.literal(WQP_REVIEWED_FISH_METHOD), sourceId: z.literal(WQP_SOURCE), status: z.literal('approved-with-specific-holds'), reviewedBy: z.literal('MAIN'), reviewedAt: z.string().datetime(), taxa: z.record(speciesId, z.string().min(1)),
    acquisitions: z.array(z.object({ id: z.string().min(1), archive: file, receipt: file, recipe: file, additionalRecipes: z.array(file), repositoryBaseCommit: z.string().regex(/^[a-f0-9]{40}$/u) }).strict()).min(1).max(16),
    context: z.array(file).min(1), groups: z.array(z.object({ stateCode: z.string().regex(/^[A-Z]{2}$/u), speciesId, review: file, result: profileSchema, station: profileSchema }).strict()).min(1).max(32), approvedPairs: z.array(pair).min(1).max(100000), heldPairs: z.array(pair),
    heldResultRows: z.array(z.object({ resultProfilePath: safePath, parsedRowIndexZeroBased: z.number().int().nonnegative(), rowSha256: hash, reason: z.string().min(1) }).strict()), rationale: z.string().min(1), attribution: z.string().min(1), limitations: z.array(z.string().min(1)).min(1), speciesCaveats: z.record(speciesId, z.array(z.string().min(1))), pairCaveats: z.record(pair, z.array(z.string().min(1))) }).strict();
const witnessSchema = z.object({ pairKey: pair, parsedRowIndexZeroBased: z.number().int().nonnegative(), physicalEndLineOneBased: z.number().int().positive(), rawRecordSha256: hash, stationParsedRowIndexZeroBased: z.number().int().nonnegative(), stationPhysicalEndLineOneBased: z.number().int().positive(), stationRawRecordSha256: hash, date: z.string(), resultFields: z.record(z.string(), z.string()), stationFields: z.record(z.string(), z.string()) }).strict();
const reviewSchema = z.object({ schemaVersion: z.literal(1), kind: z.literal('independent-wqp-fish-source-review-v3'), recordedBy: z.literal('MAIN'), actorId: z.string().min(1), recordedAt: z.string().datetime(), acquisitionReceiptSha256: hash, inputArchives: z.array(file).min(1), sourceProfiles: z.object({ result: z.object({ sourceZip: z.record(z.string(), z.unknown()), decodedBytes: z.number(), decodedSha256: hash, rowCount: z.number() }).passthrough(), station: z.record(z.string(), z.unknown()) }).strict(), reviewedPairs: z.number().int().positive(), heldPairs: z.array(pair), witnesses: z.array(witnessSchema).min(1) }).passthrough();
function assert(value: unknown, message: string): asserts value { if (!value)
    throw Error('WQP reviewed fish: ' + message); }
function pinned(ref: z.infer<typeof file>, read: Read) { const b = read(ref.path); assert(b.length === ref.bytes && sha256(b) === ref.sha256, 'pinned input differs ' + ref.path); return b; }
function embedded(ref: z.infer<typeof file>, read: Read) {
    const bundle = z.object({ schemaVersion: z.literal(1), files: z.array(z.object({ originalPath: safePath, bytes: z.number().int().nonnegative().max(20000000), sha256: hash, encoding: z.literal('base64'), contents: z.string() }).strict()) }).passthrough().parse(JSON.parse(gunzipSync(pinned(ref, read), { maxOutputLength: 20000000 }).toString('utf8'))), entries = new Map<string, Buffer>();
    for (const f of bundle.files) {
        const b = Buffer.from(f.contents, 'base64');
        assert(!entries.has(f.originalPath) && b.length === f.bytes && sha256(b) === f.sha256, 'embedded entry differs ' + f.originalPath);
        entries.set(f.originalPath, b);
    }
    return (p: string) => { const b = entries.get(p); assert(b, 'missing embedded entry ' + p); return b; };
}
const responseSchema = file.extend({ url: z.url(), status: z.literal(200), startedAt: z.string().datetime(), retrievedAt: z.string().datetime(), headers: z.record(z.string(), z.string()) }).passthrough();
export function loadWqpReviewedFishMethod(plan: WqpReviewedFishPlan, read: Read) {
    const p = { methodReviewPath: methodPath.parse(plan.methodReviewPath), methodReviewSha256: hash.parse(plan.methodReviewSha256) }, b = read(p.methodReviewPath);
    assert(sha256(b) === p.methodReviewSha256, 'method review hash differs');
    const method = methodSchema.parse(JSON.parse(b.toString('utf8')));
    assert(new Set(method.acquisitions.map(a => a.id)).size === method.acquisitions.length, 'duplicate acquisition IDs');
    for (const ref of method.context)
        pinned(ref, read);
    const acquisitions = method.acquisitions.map(a => {
        const bytes = embedded(a.archive, read), receipt = JSON.parse(pinned(a.receipt, bytes).toString('utf8'));
        for (const ref of [a.recipe, ...a.additionalRecipes])
            pinned(ref, bytes);
        assert(receipt.repositoryBaseCommit === a.repositoryBaseCommit && receipt.recipe?.sha256 === a.recipe.sha256 && String(receipt.recipe.path).replaceAll('\\', '/').endsWith(a.recipe.path), 'acquisition code lineage differs');
        if (receipt.originalRecipe)
            assert(a.additionalRecipes.some(r => r.sha256 === receipt.originalRecipe.sha256 && r.path === receipt.originalRecipe.path), 'original acquisition recipe missing');
        assert(Array.isArray(receipt.receipts) && receipt.providerWrites === 0, 'acquisition receipt shape differs');
        return { definition: a, receipt, bytes };
    });
    const reviews = method.groups.map(g => reviewSchema.parse(JSON.parse(pinned(g.review, read).toString('utf8'))));
    assert(new Set(method.groups.map(g => g.stateCode + ':' + g.speciesId)).size === method.groups.length, 'duplicate state/species profiles');
    assert(new Set(reviews.map(r => r.actorId)).size >= 2 && reviews.every(r => r.actorId !== 'MAIN' && r.reviewedPairs === r.witnesses.length && Date.parse(r.recordedAt) <= Date.parse(method.reviewedAt)), 'independent review identity or chronology differs');
    const approved = reviews.flatMap(r => r.witnesses.map(w => w.pairKey)).sort(), held = [...new Set(reviews.flatMap(r => r.heldPairs))].sort();
    assert(new Set(approved).size === approved.length && stableJson(approved) === stableJson(method.approvedPairs) && stableJson(held) === stableJson(method.heldPairs) && !approved.some(p => held.includes(p)), 'reviewed pair scope differs');
    const groups = method.groups.map((g, i) => {
        const review = reviews[i];
        assert(method.taxa[g.speciesId] && review.witnesses.every(w => w.pairKey.endsWith(':' + g.speciesId)), 'group taxon differs');
        function profile(spec: z.infer<typeof profileSchema>, kind: 'result' | 'station') {
            const a = acquisitions.find(a => a.definition.id === spec.acquisitionId);
            assert(a, 'missing acquisition ' + spec.acquisitionId);
            const original = a.receipt.receipts.find((r: {
                path?: string;
            }) => r.path === spec.path);
            assert(original, 'missing profile receipt');
            const ref = responseSchema.parse(original), bytes = pinned({ path: ref.path, bytes: ref.bytes, sha256: ref.sha256 }, a.bytes), decoded = spec.encoding === 'zip' ? decodeSingleCsvZip(bytes).bytes : gunzipSync(bytes, { maxOutputLength: 20000000 });
            assert(decoded.length === spec.decodedBytes && sha256(decoded) === spec.decodedSha256, 'decoded source differs');
            assert(Date.parse(ref.startedAt) <= Date.parse(ref.retrievedAt) && Date.parse(ref.retrievedAt) <= Date.parse(review.recordedAt), 'source chronology differs');
            const url = new URL(ref.url);
            assert(url.origin === 'https://www.waterqualitydata.us' && url.pathname === '/data/' + (kind === 'result' ? 'Result' : 'Station') + '/search' && url.searchParams.get('sampleMedia') === 'Biological' && url.searchParams.get('subjectTaxonomicName') === method.taxa[g.speciesId] && url.searchParams.get('mimeType') === 'csv' && url.searchParams.get('zip') === (spec.encoding === 'zip' ? 'yes' : 'no'), 'source query profile differs');
            assert(review.inputArchives.some(x => stableJson(x) === stableJson(a.definition.archive)), 'source archive omitted from independent review');
            if (kind === 'result') {
                assert(stableJson(original) === stableJson(review.sourceProfiles.result.sourceZip) && review.acquisitionReceiptSha256 === a.definition.receipt.sha256 && review.sourceProfiles.result.decodedBytes === spec.decodedBytes && review.sourceProfiles.result.decodedSha256 === spec.decodedSha256 && review.sourceProfiles.result.rowCount === spec.rowCount, 'reviewed result receipt differs');
            }
            else
                assert(stableJson(original) === stableJson(review.sourceProfiles.station) && original.decodedBytes === spec.decodedBytes && original.decodedSha256 === spec.decodedSha256, 'reviewed station receipt differs');
            const rows = parseWqpCsv(decoded);
            assert(rows.length === spec.rowCount && rows.length === Number(ref.headers[kind === 'result' ? 'total-result-count' : 'total-site-count']), 'source row count differs');
            return { ref: { ...ref, decodedBytes: spec.decodedBytes, decodedSha256: spec.decodedSha256 }, rows };
        }
        return { definition: g, review, result: profile(g.result, 'result'), station: profile(g.station, 'station') };
    });
    for (const hold of method.heldResultRows) {
        const matching = groups.filter(g => g.definition.result.path === hold.resultProfilePath);
        assert(matching.length > 0, 'held profile missing');
        for (const g of matching) {
            const entry = g.result.rows[hold.parsedRowIndexZeroBased];
            assert(entry && sha256(entry.raw) === hold.rowSha256, 'held row identity differs');
        }
    }
    return { method, acquisitions, reviews, groups };
}
export function wqpReviewedFishInputPaths(plan: WqpReviewedFishPlan, read: Read) { const { method } = loadWqpReviewedFishMethod(plan, read); return [...new Set(['src/lib/research/wqp-reviewed-fish.ts', 'src/lib/research/single-csv-zip.ts', 'src/lib/research/wqp-fish-positive-review.ts', 'src/lib/research/wqp-field-positive-review.ts', 'scripts/research/adapters/wqp-retained-field-counts.ts', plan.methodReviewPath, ...method.acquisitions.map(a => a.archive.path), ...method.context.map(a => a.path), ...method.groups.map(g => g.review.path)])].sort(); }
const id = (prefix: string, v: unknown) => prefix + "-" + sha256(stableJson(v));
const fields = (r: Row) => Object.fromEntries(Object.entries(r).filter(([, v]) => v !== ""));
export function buildWqpReviewedFishResult(context: SourceAdapterContext, read: Read): SourceAdapterResult {
    const p = wqpReviewedFishParametersSchema.parse(context.parameters), { method, acquisitions, reviews, groups } = loadWqpReviewedFishMethod(p, read);
    z.string().datetime().parse(context.runStartedAt);
    assert(context.sourceId === WQP_SOURCE && context.stateCode === p.stateCode && Date.parse(method.reviewedAt) <= Date.parse(context.runStartedAt), "WQP source, state or chronology differs.");
    const registry = JSON.parse(read("src/data/research/county-equivalent-registry.json").toString("utf8"));
    const active = new Map<string, {
        countyFips: string;
        stateCode: string;
    }>(registry.countyEquivalents.filter((c: {
        status: string;
    }) => c.status === "active").map((c: {
        countyFips: string;
        stateCode: string;
    }) => [c.countyFips, c]));
    const requested = context.requestedPairs.map(r => r.countyFips + ":" + r.speciesId).sort();
    assert(new Set(requested).size === requested.length && stableJson(requested) === stableJson(p.candidatePairs) && p.candidateLimit === requested.length
        && requested.every(key => method.approvedPairs.includes(key)) && !requested.some(key => method.heldPairs.includes(key)), "WQP requested scope differs or contains a held pair.");
    for (const r of context.requestedPairs)
        assert(method.taxa[r.speciesId] === r.scientificName && active.get(r.countyFips)?.stateCode === p.stateCode, "WQP target species/county differs.");
    function csv(speciesId: string, profile: 'station' | 'result') { const group = groups.find(g => g.definition.speciesId === speciesId && g.definition.stateCode === p.stateCode); assert(group, 'Missing reviewed state/species source profile'); return group[profile]; }
    const result: SourceAdapterResult = { completedAt: context.runStartedAt, assertions: [], reviews: [], rejections: [], outcomes: [], artifacts: [], upstreamRequests: [], candidateRecordCount: 0, duplicateRecordCount: 0, errors: [], warnings: method.limitations };
    const witnesses: unknown[] = [];
    for (const speciesId of [...new Set(context.requestedPairs.map(r => r.speciesId))].sort()) {
        const stations = csv(speciesId, "station"), results = csv(speciesId, "result");
        const stationIndex = new Map<string, Array<{
            entry: CsvEntry;
            index: number;
        }>>();
        stations.rows.forEach((entry, index) => { const key = entry.record.OrganizationIdentifier + "\0" + entry.record.MonitoringLocationIdentifier; const a = stationIndex.get(key) ?? []; a.push({ entry, index }); stationIndex.set(key, a); });
        const selected = new Map(requested.filter(k => k.endsWith(":" + speciesId)).map(k => [k, [] as Array<{
                index: number;
                entry: CsvEntry;
                stations: Array<{
                    entry: CsvEntry;
                    index: number;
                }>;
                disposition: string;
                date: string | null;
            }>]));
        results.rows.forEach((entry, index) => {
            const r = entry.record, matches = stationIndex.get(r.OrganizationIdentifier + "\0" + r.MonitoringLocationIdentifier) ?? [];
            const geo = resolveWqpStation(matches.map(m => m.entry.record), active);
            if (!geo.county || geo.county.stateCode !== p.stateCode)
                return;
            const target = selected.get(geo.county.countyFips + ":" + speciesId);
            if (!target)
                return;
            const held = method.heldResultRows.find(h => h.resultProfilePath === results.ref.path && h.parsedRowIndexZeroBased === index);
            if (held)
                assert(sha256(entry.raw) === held.rowSha256, "WQP held row identity differs.");
            const value = wqpFishPositiveRowValue(r, method.taxa[speciesId], context.runStartedAt.slice(0, 10));
            target.push({ index, entry, stations: matches, disposition: held ? "review-hold: " + held.reason : value.date ? "positive" : value.reason!, date: held ? null : value.date ?? null });
        });
        for (const [key, rows] of selected) {
            const positive = rows.filter(r => r.disposition === "positive");
            assert(positive.length, "Selected WQP fish pair has no supported positive row: " + key);
            const review = reviews.find(r => r.witnesses.some(w => w.pairKey === key))!, witness = review.witnesses.find(w => w.pairKey === key)!;
            const primary = positive.find(r => r.index === witness.parsedRowIndexZeroBased), station = primary?.stations.find(s => s.index === witness.stationParsedRowIndexZeroBased);
            assert(primary && station && sha256(primary.entry.raw) === witness.rawRecordSha256 && sha256(station.entry.raw) === witness.stationRawRecordSha256
                && primary.entry.physicalEndLineOneBased === witness.physicalEndLineOneBased && station.entry.physicalEndLineOneBased === witness.stationPhysicalEndLineOneBased
                && primary.date === witness.date && stableJson(fields(primary.entry.record)) === stableJson(witness.resultFields)
                && stableJson(fields(station.entry.record)) === stableJson(witness.stationFields), "WQP fish independently reviewed witness differs: " + key);
            result.candidateRecordCount += rows.length;
            const [countyFips] = key.split(":"), dates = positive.map(r => r.date!).sort(), latest = dates.at(-1)!;
            const attribution = "Data contributors: " + [...new Set(positive.map(r => r.entry.record.OrganizationFormalName + " (" + r.entry.record.OrganizationIdentifier + ")"))].sort().join("; ") + ". " + method.attribution;
            const caveats = [attribution, ...method.limitations, ...(method.speciesCaveats[speciesId] ?? []), ...(method.pairCaveats[key] ?? []), "Station county codes were joined by exact organization and monitoring-location identifiers. These are the publisher's county metadata, not a new coordinate-derived assignment.",
                "Original Actual count, length and catch-weight values retain their units and biological intent. Repeated rows or individual measurements are not independent fish or reconstructed abundance."];
            const payload = { pairKey: key, resultDecodedSha256: results.ref.decodedSha256, stationDecodedSha256: stations.ref.decodedSha256, methodReviewPath: p.methodReviewPath, methodReviewSha256: p.methodReviewSha256,
                positiveRows: positive.map(r => ({ parsedRowIndexZeroBased: r.index, rowSha256: sha256(r.entry.raw), stationRows: r.stations.map(s => ({ parsedRowIndexZeroBased: s.index, rowSha256: sha256(s.entry.raw) })) })) };
            const assertionId = id("wqp-reviewed-fish-assertion", { runId: context.runId, ...payload });
            result.assertions.push({ schemaVersion: 1, eventId: assertionId, event_type: "evidence.asserted", created_at: context.runStartedAt, actor_type: "adapter", actor_id: WQP_ADAPTER + "@" + WQP_REVIEWED_FISH_VERSION,
                run_id: context.runId, source_id: WQP_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId, claim_type: "recorded-present", evidence_kind: "occurrence", scope: "survey-area",
                source_record_id: id("retained-wqp-result-rows", payload), source_url: results.ref.url, source_record_date: latest, retrieved_at: results.ref.retrievedAt,
                taxon_match: { method: "Exact disclosed SubjectTaxonomicName equals the current catalog binomial.", target_scientific_name: method.taxa[speciesId], source_scientific_name: method.taxa[speciesId], source_taxon_key: null },
                geography_match: { method: "Exact organization and monitoring-location join to unambiguous active publisher Station county FIPS; not coordinate-derived.", source_state: p.stateCode, source_county: countyFips, county_fips: countyFips },
                temporal_scope: "Positive field-sample dates span " + dates[0] + " through " + latest + "; latest supported collection date retained.",
                spatial_scope: "Sampled locations in the publisher-reported county; no countywide prevalence claim.", survey_scope: "Positive species-specific fish counts, individual lengths or catch weights from reviewed field Population Census, Group Summary or Individual activities; Final status and Actual values. Tissue analytes and unreviewed metrics are excluded.",
                normalized_payload_hash: sha256(stableJson(payload)), caveats, notes: ["Result query: " + results.ref.url, "Station query: " + stations.ref.url,
                    "Exact source row identities, full nonempty source fields and station joins are retained in wqp-reviewed-fish-witnesses.json; omitted fields were blank in the pinned CSV. No stable public ResultIdentifier is fabricated."] });
            result.reviews.push({ schemaVersion: 1, eventId: id("wqp-reviewed-fish-review", { assertionId }), event_type: "evidence.reviewed", created_at: context.runStartedAt, actor_type: "adapter", actor_id: WQP_ADAPTER + "@" + WQP_REVIEWED_FISH_VERSION,
                run_id: context.runId, source_id: WQP_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId, references: { assertion_event_id: assertionId }, review_level: "machine-validated", decision: "accepted", publication_eligible: true,
                reason_codes: ["positive-field-fish-measurement", "exact-source-station-county", "independently-reviewed-method", "original-collection-date"], notes: ["Canonical offline reconstruction from hash-pinned Results and Station responses with explicit method holds. Machine validation, not individual human voucher verification."] });
            const rejectionIds: string[] = [];
            for (const reason of [...new Set(rows.filter(r => r.disposition !== "positive").map(r => r.disposition))].sort()) {
                const excluded = rows.filter(r => r.disposition === reason), rejectionId = id("wqp-reviewed-fish-rejection", { runId: context.runId, key, reason, rows: excluded.map(r => r.index) });
                rejectionIds.push(rejectionId);
                result.rejections.push({ schemaVersion: 1, rejection_id: rejectionId, created_at: context.runStartedAt, actor_type: "adapter", actor_id: WQP_ADAPTER + "@" + WQP_REVIEWED_FISH_VERSION, run_id: context.runId, source_id: WQP_SOURCE,
                    candidate_locator: results.ref.path + "#pair=" + key + "&reason=" + encodeURIComponent(reason), candidate_taxon: method.taxa[speciesId], candidate_geography: countyFips,
                    normalized_target: { state_code: p.stateCode, county_fips: countyFips, species_id: speciesId }, reason_code: "record-failed", supporting_notes: [excluded.length + " rows excluded: " + reason + ". No absence or non-detection follows; exact rows retained in witness artifact."] });
            }
            result.outcomes.push({ schemaVersion: 1, outcome_id: id("wqp-reviewed-fish-outcome", { runId: context.runId, key }), run_id: context.runId, source_id: WQP_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId, status: "evidence-found", scope_complete: true, recorded_at: context.runStartedAt,
                assertion_event_ids: [assertionId], rejection_ids: rejectionIds, query_urls: [results.ref.url, stations.ref.url], notes: ["Complete scan of the retained profiles for this selected positive pair only; no exhaustive current county inventory or protocol-completion claim."] });
            witnesses.push({ ...payload, attribution, resultUrl: results.ref.url, stationUrl: stations.ref.url, resultRetrievedAt: results.ref.retrievedAt, stationRetrievedAt: stations.ref.retrievedAt,
                sourceRows: rows.map(r => ({ parsedRowIndexZeroBased: r.index, physicalEndLineOneBased: r.entry.physicalEndLineOneBased, rawRecordSha256: sha256(r.entry.raw), disposition: r.disposition, sourceFields: fields(r.entry.record),
                    stationRows: r.stations.map(s => ({ parsedRowIndexZeroBased: s.index, physicalEndLineOneBased: s.entry.physicalEndLineOneBased, rawRecordSha256: sha256(s.entry.raw), sourceFields: fields(s.entry.record) })) })) });
        }
    }
    result.artifacts.push({ filename: "wqp-reviewed-fish-witnesses.json", mediaType: "application/json", contents: JSON.stringify({ schemaVersion: 1, method: WQP_REVIEWED_FISH_METHOD, methodReviewPath: p.methodReviewPath, methodReviewSha256: p.methodReviewSha256,
            locatorConvention: "Zero-based parsed data-row index excludes header. Physical end line is one-based in the original CSV, including multiline fields. SHA-256 hashes exact csv-parse raw record bytes including its original trailing line terminator. Nonempty field values are lossless; omitted CSV fields were empty.",
            acquisitionReceiptSha256s: acquisitions.map(a => a.definition.receipt.sha256), acquisitionCodeQualification: "The original preflight repositoryBaseCommit identifies repository HEAD during acquisition. The executed recipes are separately hash-pinned inside their retained input archives. Failed requests remain failed. This offline run code_commit identifies interpretation code, not a new provider acquisition.", witnesses }, null, 2) + "\n" });
    return result;
}
