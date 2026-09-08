import { gunzipSync } from "node:zlib";
import { parse } from "csv-parse/sync";
import { z } from "zod";
import { sha256, stableJson } from "./run-files";
import type { SourceAdapterContext, SourceAdapterResult } from "./source-adapter";
import type { CountyEquivalentRegistryEntry } from "./geography-registry";

export const HONEY_POSITIVE_SOURCE = "aphis-honey-bee";
export const HONEY_POSITIVE_ADAPTER = "aphis-honey-bee-survey";
export const HONEY_POSITIVE_VERSION = "2.0.0";
export const HONEY_POSITIVE_METHOD = "retained-positive-apiary-survey-v1";
export const HONEY_POSITIVE_REVIEW_PATH = "src/data/research/source-method-reviews/aphis-honey-bee-positive-v1.json";
export const HONEY_PARENT_PATH = "src/data/research/runs/20260820T020544Z__aphis-honey-bee__1845d88d8f70";
export const HONEY_CSV_PATH = HONEY_PARENT_PATH + "/artifacts/aphis-honey-bee-survey.csv.gz";
export const HONEY_CSV_SHA = "cc81b1ed8d4fc156cd2937e09ea019ebc2f3cb9f683828bd67f7a6e688dc7be5";
export const HONEY_DECODED_SHA = "befb8b2bb4253c4167ee2b4cb2aacf112ea24af1be9fcb1fbdcb6df24d6bc6bc";
export const HONEY_URL = "https://www.usbeedata.org/state_reports/public_download/";
const HELD_PAIRS = ["15007:varroa-destructor", "15009:varroa-destructor"];
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const file = z.object({
  path: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]+$/u).refine(p => !p.split("/").includes("..") && !p.includes("//")),
  bytes: z.number().int().positive().max(8_000_000), sha256: hash,
}).strict();
export const honeyPositiveParametersSchema = z.object({
  mode: z.literal("retained-positive-survey"), stateCode: z.string().regex(/^[A-Z]{2}$/u),
  methodReviewSha256: hash, candidatePairs: z.array(z.string().regex(/^[0-9]{5}:varroa-destructor$/u)).min(1).max(5000),
  candidateLimit: z.number().int().positive().max(5000),
}).strict();
export type HoneyPositivePlan = Pick<z.infer<typeof honeyPositiveParametersSchema>, "methodReviewSha256">;
type Read = (p: string) => Buffer;
const methodSchema = z.object({
  schemaVersion: z.literal(1), methodVersion: z.literal(HONEY_POSITIVE_METHOD), sourceId: z.literal(HONEY_POSITIVE_SOURCE),
  status: z.literal("approved-with-specific-holds"), reviewedBy: z.literal("MAIN"), reviewedAt: z.string().datetime(),
  sourceDecodedSha256: z.literal(HONEY_DECODED_SHA), scientificName: z.literal("Varroa destructor"),
  metric: z.literal("varroa_per_100_bees"), dateRange: z.object({start: z.literal("2009-01"), end: z.literal("2025-12")}).strict(),
  heldPairs: z.array(z.string()), context: z.array(file).min(8), independentReviews: z.array(file).length(2),
  rationale: z.string().min(1), attribution: z.string().min(1),
}).strict();
function assert(v: unknown, message: string): asserts v { if (!v) throw Error(message); }
function pinned(ref: z.infer<typeof file>, read: Read) {
  const b = read(ref.path); assert(b.length === ref.bytes && sha256(b) === ref.sha256, "Honey bee pinned input drift: " + ref.path); return b;
}
export function loadHoneyPositiveMethod(plan: HoneyPositivePlan, read: Read) {
  const bytes = read(HONEY_POSITIVE_REVIEW_PATH);
  assert(sha256(bytes) === hash.parse(plan.methodReviewSha256), "Honey bee method review hash differs.");
  const method = methodSchema.parse(JSON.parse(bytes.toString("utf8")));
  assert(stableJson(method.heldPairs) === stableJson(HELD_PAIRS), "The v1 Hawaii source-conflict holds must remain explicit.");
  for (const ref of method.context) pinned(ref, read);
  const reviews = method.independentReviews.map(ref => JSON.parse(pinned(ref, read).toString("utf8")));
  assert(new Set(reviews.map(r => r.actorId)).size === 2 && reviews.every(r =>
    r.kind === "independent-honey-bee-source-review" && r.recordedBy === "MAIN" && r.actorId !== "MAIN"
    && r.sourceDecodedSha256 === HONEY_DECODED_SHA && r.taxonMapping === "supported-program-level-varroa-destructor"
    && Date.parse(r.recordedAt) <= Date.parse(method.reviewedAt)), "Honey bee independent method reviews differ.");
  assert(reviews.some(r => stableJson(r.heldPairs) === stableJson(HELD_PAIRS))
    && reviews.some(r => r.supportedPairs.includes("36003:varroa-destructor") && r.supportedPairs.includes("36009:varroa-destructor")),
  "Honey bee independent review scope is incomplete.");
  const extractionRef = method.context.find(ref => ref.path.endsWith("/national-survey-2016-2017.text.json.gz"));
  assert(extractionRef, "Missing APHIS species/metric interpretation.");
  const extraction = JSON.parse(gunzipSync(pinned(extractionRef, read), { maxOutputLength: 8_000_000 }).toString("utf8"));
  const page = extraction.pages.find((p: { pageOneBased: number }) => p.pageOneBased === 4);
  assert(page && sha256(page.text) === "55aea8203f27507e2257e1f7f12bc23feb85c462a91ef0a12e8692e75c6d465c"
    && page.text.includes("Varroa destructor"), "APHIS assay species context differs.");
  return method;
}
export function honeyPositiveInputPaths(plan: HoneyPositivePlan, read: Read) {
  const method = loadHoneyPositiveMethod(plan, read);
  return [...new Set([
    "src/lib/research/honey-bee-positive-review.ts", "scripts/research/adapters/aphis-honey-bee-positive.ts",
    HONEY_POSITIVE_REVIEW_PATH, HONEY_CSV_PATH, HONEY_PARENT_PATH + "/receipt.json",
    HONEY_PARENT_PATH + "/artifacts/aphis-honey-bee-survey-metadata.json",
    ...method.context.map(f => f.path), ...method.independentReviews.map(f => f.path),
  ])].sort();
}
const normalize = (s: string) => s.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
type Registry = {
  countyEquivalents: CountyEquivalentRegistryEntry[];
  retiredCountyEquivalents: Array<{stateCode: string; shortName?: string; legalName: string}>;
};
export function resolveHoneyPublishedCounty(registry: Registry, state: string, name: string) {
  const key = normalize(name);
  if (!key) return { reason: "missing-geography" } as const;
  if (registry.retiredCountyEquivalents.some(c => c.stateCode === state && [c.shortName, c.legalName].some(n => n && normalize(n) === key)))
    return { reason: "retired-geography" } as const;
  const matches = registry.countyEquivalents.filter(c => c.stateCode === state && c.status === "active"
    && [c.shortName, c.legalName, ...c.aliases, ...Object.values(c.sourceAliases).flat()].some(n => normalize(n) === key));
  return matches.length === 1 ? { county: matches[0] } : { reason: matches.length ? "ambiguous-county-name" : "unknown-county-name" };
}
const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
type Row = Record<string, string>;
export function honeyPositiveRowValue(row: Row) {
  const metric = row.varroa_per_100_bees;
  if (!/^\d+(?:\.\d+)?$/u.test(metric ?? "") || !Number.isFinite(Number(metric))) return { reason: "missing-or-invalid-metric" } as const;
  if (Number(metric) === 0) return { reason: "zero-metric-no-positive-claim" } as const;
  const year = row.sample_year, month = row.sample_month_number;
  if (!/^\d{4}$/u.test(year ?? "") || !/^(?:[1-9]|1[0-2])$/u.test(month ?? "") ||
    Number(year) < 2009 || Number(year) > 2025 || row.sample_month !== months[Number(month) - 1])
    return { reason: "invalid-or-out-of-scope-month" } as const;
  return { month: year + "-" + month.padStart(2, "0"), metric: Number(metric) };
}
const caveats = [
  "Composite apiary samples pool eight managed honey bee colonies; a positive result does not mean all eight colonies were infested.",
  "The parasite was detected in a managed-host sampling context. Wild establishment, local acquisition, countywide prevalence and persistence today are not established.",
  "Migratory and stationary operations participated; individual public rows do not disclose migration history or apiary identifiers.",
  "The metric is mites per 100 bees, not a raw mite count. No sample denominator is available to reconstruct a raw count.",
  "The CSV metric is mapped at program level to Varroa destructor using the official 2016-2017 report; raw rows do not literally name the species. The 2025 plan uses Varroa spp. wording.",
  "Publisher county text comes from its 2020 TIGER/Line assignment; no coordinates or automatic retired-county successor assignment are used here.",
  "Collection month precision is preserved. Export, acquisition and review timestamps are separate.",
  "Zero, blank, invalid, ambiguous and held records create no positive or negative claim. A completed selected source screen does not certify a county or complete its research protocol.",
  "Anonymous rows are retained by immutable archive and exact row locator. Similar or identical disclosed fields cannot prove that two sampling events are identical.",
];
const id = (prefix: string, v: unknown) => prefix + "-" + sha256(stableJson(v));
export function buildHoneyPositiveResult(context: SourceAdapterContext, read: Read): SourceAdapterResult {
  const p = honeyPositiveParametersSchema.parse(context.parameters), method = loadHoneyPositiveMethod(p, read);
  z.string().datetime().parse(context.runStartedAt);
  assert(context.sourceId === HONEY_POSITIVE_SOURCE && context.stateCode === p.stateCode
    && Date.parse(method.reviewedAt) <= Date.parse(context.runStartedAt), "Honey bee source, state or review chronology differs.");
  const registry: Registry = JSON.parse(read("src/data/research/county-equivalent-registry.json").toString("utf8"));
  const states = JSON.parse(read("src/data/research/state-registry.json").toString("utf8"));
  assert(states.jurisdictions.some((s: {stateCode: string; nationalV1Scope: boolean}) => s.stateCode === p.stateCode && s.nationalV1Scope), "Honey bee state is outside v1 scope.");
  const requested = context.requestedPairs.map(pair => pair.countyFips + ":" + pair.speciesId).sort();
  assert(new Set(requested).size === requested.length && stableJson(requested) === stableJson(p.candidatePairs)
    && p.candidateLimit === requested.length && !requested.some(key => method.heldPairs.includes(key)), "Honey bee requested scope differs or includes a source-conflict hold.");
  for (const pair of context.requestedPairs) assert(pair.speciesId === "varroa-destructor" && pair.scientificName === method.scientificName
    && registry.countyEquivalents.some(c => c.countyFips === pair.countyFips && c.stateCode === p.stateCode && c.status === "active"),
    "Honey bee target species/county differs.");
  const stored = read(HONEY_CSV_PATH);
  assert(stored.length === 255170 && sha256(stored) === HONEY_CSV_SHA, "Retained honey bee CSV differs.");
  const decoded = gunzipSync(stored, { maxOutputLength: 2_000_000 });
  assert(decoded.length === 1523802 && sha256(decoded) === HONEY_DECODED_SHA, "Decoded honey bee CSV differs.");
  const parent = JSON.parse(read(HONEY_PARENT_PATH + "/receipt.json").toString("utf8"));
  const parentArtifact = parent.artifacts.find((a: {path: string}) => a.path === HONEY_CSV_PATH);
  assert(parent.source_id === HONEY_POSITIVE_SOURCE && parent.status === "complete" && parent.code_commit === "b2542a8b32221451d4eeae99a62d72b06de816c2"
    && parentArtifact?.sha256 === HONEY_CSV_SHA && parentArtifact.bytes === stored.length, "Honey bee original acquisition lineage differs.");
  for (const artifact of parent.artifacts) pinned(artifact, read);
  const retrievedAt = "2026-08-20T02:06:05.317Z";
  assert(parent.upstream_requests.some((r: {retrieved_at: string; status: number}) => r.retrieved_at === retrievedAt && r.status === 200), "Honey bee original retrieval differs.");
  const lines = decoded.toString("utf8").split(/\r?\n/u);
  assert(lines[0] === "File generated from usbeedata.org database on 2026-06-05 13:15:49.160078+00:00"
    && lines[1] === '"Includes data with a collection date up to Dec 31, 2025"', "Honey bee export preamble differs.");
  const rows = parse(lines.slice(2).join("\n"), {columns: true, skip_empty_lines: true, raw: true, info: true}) as Array<{record: Row; raw: string; info: {lines: number}}>;
  assert(rows.length === 12705 && rows[0].record.state_code === "the US state abbreviation the sample was collected in"
    && rows[0].record.sampling_county_from_gps.includes("2020 TIGER/Line"), "Honey bee row count/dictionary differs.");
  const selected = new Map<string, Array<{parsedRowIndexZeroBased: number; physicalLineOneBased: number; lineSha256Utf8WithoutTerminator: string; sourceRow: Row; disposition: string; month: string | null; metric: number | null}>>();
  for (const key of requested) selected.set(key, []);
  for (let i = 1; i < rows.length; i++) {
    const entry = rows[i], row = entry.record;
    if (row.state_code !== p.stateCode) continue;
    const resolved = resolveHoneyPublishedCounty(registry, p.stateCode, row.sampling_county_from_gps ?? "");
    if (!resolved.county) continue;
    const target = selected.get(resolved.county.countyFips + ":varroa-destructor");
    if (!target) continue;
    const value = honeyPositiveRowValue(row), raw = entry.raw.replace(/\r?\n$/u, "");
    assert(!/[\r\n]/u.test(raw), "Unexpected multiline CSV record requires locator review.");
    target.push({ parsedRowIndexZeroBased: i, physicalLineOneBased: entry.info.lines + 2,
      lineSha256Utf8WithoutTerminator: sha256(raw), sourceRow: row,
      disposition: value.month ? "positive" : value.reason!, month: value.month ?? null, metric: value.metric ?? null });
  }
  const result: SourceAdapterResult = {completedAt: context.runStartedAt, assertions: [], reviews: [], rejections: [], outcomes: [],
    artifacts: [], upstreamRequests: [], candidateRecordCount: 0, duplicateRecordCount: 0, errors: [], warnings: caveats};
  const witnesses = [];
  for (const key of requested) {
    const [countyFips, speciesId] = key.split(":"), sourceRows = selected.get(key)!;
    const positives = sourceRows.filter(r => r.disposition === "positive");
    assert(positives.length > 0, "Selected honey bee pair has no eligible positive source row: " + key);
    result.candidateRecordCount += sourceRows.length;
    const dates = positives.map(r => r.month!).sort(), latest = dates[dates.length - 1];
    const payload = {sourceDecodedSha256: HONEY_DECODED_SHA, pairKey: key, methodReviewSha256: p.methodReviewSha256,
      positiveRows: positives.map(r => ({parsedRowIndexZeroBased: r.parsedRowIndexZeroBased, rowSha256: r.lineSha256Utf8WithoutTerminator}))};
    const assertionId = id("honey-positive-assertion", {runId: context.runId, ...payload});
    result.assertions.push({schemaVersion: 1, eventId: assertionId, event_type: "evidence.asserted", created_at: context.runStartedAt,
      actor_type: "adapter", actor_id: HONEY_POSITIVE_ADAPTER + "@" + HONEY_POSITIVE_VERSION, run_id: context.runId,
      source_id: HONEY_POSITIVE_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId,
      claim_type: "recorded-present", evidence_kind: "occurrence", scope: "survey-area",
      source_record_id: id("anonymous-composite-source-rows", payload), source_url: HONEY_URL,
      source_record_date: latest, retrieved_at: retrievedAt,
      taxon_match: {method: "Reviewed program-specific Varroa assay metric to Varroa destructor; binomial absent from individual CSV rows.",
        target_scientific_name: method.scientificName, source_scientific_name: "varroa_per_100_bees (program-level Varroa metric)", source_taxon_key: null},
      geography_match: {method: "Exact publisher-supplied county name matched to active registry; publisher used 2020 TIGER/Line.",
        source_state: p.stateCode, source_county: positives[0].sourceRow.sampling_county_from_gps, county_fips: countyFips},
      temporal_scope: "Positive sampled months span " + dates[0] + " through " + latest + "; latest qualifying month supplies the occurrence date.",
      spatial_scope: "Positive composite samples at the published county's sampled apiaries; no countywide prevalence or establishment inference.",
      survey_scope: "APHIS National Honey Bee Survey; composite samples from eight managed colonies per apiary, with mites per 100 bees measured in alcohol-preserved samples.",
      normalized_payload_hash: sha256(stableJson(payload)), caveats,
      notes: [method.attribution, "Retained archive " + HONEY_CSV_PATH + " (decoded SHA-256 " + HONEY_DECODED_SHA + ").",
        "Method review " + HONEY_POSITIVE_REVIEW_PATH + " (SHA-256 " + p.methodReviewSha256 + ").",
        positives.length + " positive rows; " + sourceRows.length + " total retained rows in selected county, including zero or unavailable results.",
        "Exact full original row values and physical line hashes are in honey-bee-positive-witnesses.json. No public apiary identifier is fabricated."]});
    result.reviews.push({schemaVersion: 1, eventId: id("honey-positive-review", {assertionId}), event_type: "evidence.reviewed",
      created_at: context.runStartedAt, actor_type: "adapter", actor_id: HONEY_POSITIVE_ADAPTER + "@" + HONEY_POSITIVE_VERSION,
      run_id: context.runId, source_id: HONEY_POSITIVE_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId,
      references: {assertion_event_id: assertionId}, review_level: "machine-validated", decision: "accepted", publication_eligible: true,
      reason_codes: ["retained-positive-apiary-metric", "independently-reviewed-source-method", "exact-published-county", "original-month-precision"],
      notes: ["Canonical offline reconstruction checks all selected county rows against the immutable original CSV and independently reviewed method. No human approval or individual voucher identity is claimed."]});
    const rejectionIds: string[] = [];
    for (const reason of [...new Set(sourceRows.filter(r => r.disposition !== "positive").map(r => r.disposition))].sort()) {
      const excluded = sourceRows.filter(r => r.disposition === reason);
      const rejectionId = id("honey-positive-rejection", {runId: context.runId, key, reason, rows: excluded.map(r => r.parsedRowIndexZeroBased)});
      rejectionIds.push(rejectionId);
      result.rejections.push({schemaVersion: 1, rejection_id: rejectionId, created_at: context.runStartedAt, actor_type: "adapter",
        actor_id: HONEY_POSITIVE_ADAPTER + "@" + HONEY_POSITIVE_VERSION, run_id: context.runId, source_id: HONEY_POSITIVE_SOURCE,
        candidate_locator: HONEY_CSV_PATH + "#selected-pair=" + key + "&disposition=" + reason,
        candidate_taxon: "varroa_per_100_bees", candidate_geography: excluded[0].sourceRow.sampling_county_from_gps,
        normalized_target: {state_code: p.stateCode, county_fips: countyFips, species_id: speciesId},
        reason_code: reason === "zero-metric-no-positive-claim" ? "unsupported-claim-type" : "record-failed",
        supporting_notes: [excluded.length + " retained rows excluded from the positive-only claim: " + reason + ".",
          "Original rows, physical lines and hashes remain in the witness artifact. These records do not create absence or non-detection under this method."]});
    }
    result.outcomes.push({schemaVersion: 1, outcome_id: id("honey-positive-outcome", {runId: context.runId, key}),
      run_id: context.runId, source_id: HONEY_POSITIVE_SOURCE, state_code: p.stateCode, county_fips: countyFips, species_id: speciesId,
      status: "evidence-found", scope_complete: true, recorded_at: context.runStartedAt, assertion_event_ids: [assertionId],
      rejection_ids: rejectionIds, query_urls: [HONEY_URL],
      notes: ["Complete scan of this retained snapshot for the selected positive county-species pair only; no exhaustive current search, protocol completion, absence or non-detection claim."]});
    witnesses.push({pairKey: key, positiveRows: positives.length, sourceRows});
  }
  result.artifacts.push({filename: "honey-bee-positive-witnesses.json", mediaType: "application/json",
    contents: JSON.stringify({schemaVersion: 1, method: HONEY_POSITIVE_METHOD, methodReviewSha256: p.methodReviewSha256,
      originalRunId: parent.run_id, originalCodeCommit: parent.code_commit, originalRetrievedAt: retrievedAt,
      archivePath: HONEY_CSV_PATH, archiveStoredSha256: HONEY_CSV_SHA, archiveDecodedSha256: HONEY_DECODED_SHA,
      biologicalRowsScanned: 12704, dictionaryRowsExcluded: 1, locatorConvention: "Parsed row index includes the dictionary at zero; physical lines include both preambles, header and dictionary. Line hash excludes CRLF/LF.",
      attribution: method.attribution, witnesses}, null, 2) + "\n"});
  return result;
}
