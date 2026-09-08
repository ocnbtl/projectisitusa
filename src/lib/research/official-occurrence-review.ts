import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { occurrenceDateBounds } from "./occurrence-date";
import { sha256, stableJson } from "./run-files";
import type { SourceAdapterContext, SourceAdapterResult } from "./source-adapter";

export const OFFICIAL_OCCURRENCE_SOURCE = "cdfa-confirmed-pest-occurrences";
export const OFFICIAL_OCCURRENCE_ADAPTER = "official-confirmed-occurrence-report";
export const OFFICIAL_OCCURRENCE_VERSION = "1.0.0";
export const OFFICIAL_OCCURRENCE_METHOD = "official-confirmed-occurrence-report-v1";
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u);
const repositoryPath = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_./-]+$/u).refine(p => !p.split("/").includes("..") && !p.includes("//"));
const file = z.object({ path: repositoryPath, bytes: z.number().int().positive().max(8_000_000), sha256: hash }).strict();
const compressed = file.extend({ decodedBytes: z.number().int().positive().max(8_000_000), decodedSha256: hash }).strict();
const day = z.string().refine(v => occurrenceDateBounds(v)?.precision === "day", "Expected a valid calendar date");
const timestamp = z.string().datetime();
export const officialOccurrenceRecordSchema = z.object({
  schemaVersion: z.literal(1), methodVersion: z.literal(OFFICIAL_OCCURRENCE_METHOD), id: slug,
  sourceId: z.literal(OFFICIAL_OCCURRENCE_SOURCE), authority: z.literal("California Department of Food and Agriculture"),
  url: z.string().url().refine(v => { const u = new URL(v); return u.protocol === "https:" && u.hostname === "www.cdfa.ca.gov" && !u.username && !u.password && !u.search && !u.hash; }),
  source: compressed, extraction: compressed, documentDate: day, retrievedAt: timestamp,
  speciesId: slug, scientificName: z.string().regex(/^[A-Z][a-z]+ [a-z-]+$/u),
  sourceTaxonVerbatim: z.string().min(1), taxonRank: z.literal("species"), taxonQualifier: z.null(),
  stateCode: z.literal("CA"), countyFips: z.string().regex(/^06[0-9]{3}$/u), sourceCounty: z.string().min(1),
  claimType: z.literal("recorded-present"), observationDate: z.string().min(1),
  occurrenceContext: z.enum(["field-detection", "historical-agency-detection"]),
  supports: z.array(z.object({ page: z.number().int().positive(), textSha256: hash, quote: z.string().min(1), purpose: z.enum(["occurrence", "taxonomy", "context"]) }).strict()).min(2),
  review: z.object({ status: z.literal("admitted"), actorId: z.literal("MAIN"), independentActorId: z.string().min(1), reviewedAt: timestamp, independentReview: file }).strict(),
  caveats: z.array(z.string().min(1)).min(1),
}).strict();
export type OfficialOccurrenceRecord = z.infer<typeof officialOccurrenceRecordSchema>;
const pinSchema = z.object({ recordId: slug, sha256: hash }).strict();
export const officialOccurrenceParametersSchema = z.object({
  mode: z.literal("retained-reviewed-official-occurrence"), stateCode: z.literal("CA"), asOf: day,
  reviewActorId: z.string().min(1), records: z.array(pinSchema).min(1).max(5000),
  candidatePairs: z.array(z.string().regex(/^[0-9]{5}:[a-z0-9-]+$/u)).min(1).max(5000),
  candidateLimit: z.number().int().positive().max(5000),
}).strict();
export type OfficialOccurrencePlan = Pick<z.infer<typeof officialOccurrenceParametersSchema>, "asOf" | "reviewActorId" | "records">;
export type OccurrenceInputReader = (repositoryPath: string) => Buffer;
export const officialOccurrenceRecordPath = (id: string) => "src/data/research/official-occurrence-records/" + slug.parse(id) + ".json";
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function readPinned(ref: z.infer<typeof file>, read: OccurrenceInputReader) {
  const bytes = read(ref.path);
  assert(bytes.length === ref.bytes && sha256(bytes) === ref.sha256, "Pinned occurrence artifact drift: " + ref.path);
  return bytes;
}
function decodePinned(ref: z.infer<typeof compressed>, read: OccurrenceInputReader) {
  const decoded = gunzipSync(readPinned(ref, read), { maxOutputLength: 8_000_000 });
  assert(decoded.length === ref.decodedBytes && sha256(decoded) === ref.decodedSha256, "Decoded occurrence artifact drift: " + ref.path);
  return decoded;
}
export function loadOfficialOccurrenceRecord(pin: z.infer<typeof pinSchema>, read: OccurrenceInputReader) {
  pinSchema.parse(pin);
  const bytes = read(officialOccurrenceRecordPath(pin.recordId));
  assert(sha256(bytes) === pin.sha256, "Reviewed occurrence record hash differs.");
  const record = officialOccurrenceRecordSchema.parse(JSON.parse(bytes.toString("utf8")));
  assert(record.id === pin.recordId, "Reviewed occurrence identity differs.");
  const observed = occurrenceDateBounds(record.observationDate)!;
  assert(observed && observed.end <= occurrenceDateBounds(record.documentDate)!.end, "Observation date is invalid or follows the report date.");
  assert(record.documentDate <= record.retrievedAt.slice(0, 10) && Date.parse(record.retrievedAt) <= Date.parse(record.review.reviewedAt), "Occurrence source/review dates are out of order.");
  assert(record.review.independentActorId !== record.review.actorId, "Source interpretation is not independent.");
  assert(record.source.path.startsWith("ops/national-research/inputs/") && record.source.path.endsWith(".pdf.gz")
    && record.extraction.path.startsWith("ops/national-research/inputs/") && record.extraction.path.endsWith(".text.json.gz")
    && record.review.independentReview.path.startsWith("ops/national-research/evaluations/"), "Unexpected reviewed input path.");
  const pdf = decodePinned(record.source, read);
  assert(pdf.subarray(0, 5).toString() === "%PDF-", "Source is not the retained PDF.");
  const extraction = JSON.parse(decodePinned(record.extraction, read).toString("utf8"));
  assert(extraction.kind === "retained-pdf-text-extraction" && extraction.originalSource.sha256 === record.source.decodedSha256
    && extraction.originalSource.storedSha256 === record.source.sha256 && extraction.originalSource.path === record.source.path
    && extraction.originalSource.url === record.url && extraction.originalSource.retrievedAt === record.retrievedAt, "Extraction source lineage differs.");
  const pages = new Map<number, { text: string; textSha256: string }>();
  for (const page of extraction.pages) {
    assert(Number.isInteger(page.pageOneBased) && !pages.has(page.pageOneBased) && sha256(page.text) === page.textSha256, "Extraction page identity/hash differs.");
    pages.set(page.pageOneBased, page);
  }
  for (const support of record.supports) {
    const page = pages.get(support.page);
    assert(page && page.textSha256 === support.textSha256 && page.text.includes(support.quote), "Exact reviewed page passage differs.");
  }
  const occurrencePassages = record.supports.filter(s => s.purpose === "occurrence").map(s => s.quote).join(" ");
  assert(occurrencePassages.includes(record.sourceCounty), "Named county is not in the occurrence passage.");
  assert(record.supports.some(s => s.purpose === "taxonomy" && s.quote.includes(record.sourceTaxonVerbatim)), "Source taxon lacks its reviewed passage.");
  assert(record.sourceTaxonVerbatim === record.scientificName || new RegExp("^" + record.scientificName + " \\([A-Za-z., &0-9-]+\\)$", "u").test(record.sourceTaxonVerbatim), "Unresolved group, complex or other taxon qualifier is not an exact species.");
  const review = JSON.parse(readPinned(record.review.independentReview, read).toString("utf8"));
  assert(review.kind === "independent-source-interpretation-proposal" && review.actorId === record.review.independentActorId
    && review.status === "supported-recorded-occurrence" && review.recordedBy === "MAIN"
    && review.scope.stateCode === record.stateCode && review.scope.pairs.includes(record.countyFips + ":" + record.speciesId), "Independent source interpretation is missing or held.");
  const expectedClaim = { claimType: record.claimType, countyFips: record.countyFips, speciesId: record.speciesId, scientificName: record.scientificName,
    sourceRecordDate: record.observationDate, sourceDecodedSha256: record.source.decodedSha256 };
  assert(stableJson(review.recommendedClaim) === stableJson(expectedClaim) && Date.parse(review.recordedAt) <= Date.parse(record.review.reviewedAt), "Independent interpretation does not support the exact proposed claim.");
  return record;
}
export function officialOccurrenceInputPaths(plan: OfficialOccurrencePlan, read: OccurrenceInputReader) {
  return [...new Set(["src/lib/research/official-occurrence-review.ts", "src/lib/research/occurrence-date.ts", ...plan.records.flatMap(pin => {
    const r = loadOfficialOccurrenceRecord(pin, read);
    return [officialOccurrenceRecordPath(pin.recordId), r.source.path, r.extraction.path, r.review.independentReview.path];
  })])].sort();
}
const eventId = (prefix: string, payload: unknown) => prefix + "-" + sha256(stableJson(payload));
export function buildOfficialOccurrenceResult(context: SourceAdapterContext, read: OccurrenceInputReader): SourceAdapterResult {
  const p = officialOccurrenceParametersSchema.parse(context.parameters);
  assert(context.sourceId === OFFICIAL_OCCURRENCE_SOURCE && context.stateCode === p.stateCode, "Wrong official occurrence source/state.");
  timestamp.parse(context.runStartedAt);
  assert(context.runStartedAt.slice(0, 10) >= p.asOf, "Run precedes assessment.");
  const requested = context.requestedPairs.map(pair => pair.countyFips + ":" + pair.speciesId).sort();
  const records = p.records.map(pin => loadOfficialOccurrenceRecord(pin, read));
  const selected = records.map(r => r.countyFips + ":" + r.speciesId).sort();
  assert(new Set(selected).size === selected.length && new Set(p.records.map(r => r.recordId)).size === records.length
    && stableJson(selected) === stableJson(requested) && stableJson(p.candidatePairs) === stableJson(requested)
    && p.candidateLimit === selected.length, "Official occurrence scope must match exactly one reviewed record per requested pair.");
  const countyRegistry = JSON.parse(read("src/data/research/county-equivalent-registry.json").toString("utf8"));
  const result: SourceAdapterResult = { completedAt: context.runStartedAt, assertions: [], reviews: [], outcomes: [], rejections: [], artifacts: [], upstreamRequests: [],
    candidateRecordCount: records.length, duplicateRecordCount: 0, errors: [], warnings: ["Offline replay of independently reviewed explicit agency occurrence reports. Only selected reports were reviewed; no exhaustive source search, current persistence, absence or non-detection is claimed."] };
  for (const record of records) {
    const key = record.countyFips + ":" + record.speciesId;
    const pair = context.requestedPairs.find(pair => pair.countyFips + ":" + pair.speciesId === key)!;
    const county = countyRegistry.countyEquivalents.find((c: { countyFips: string }) => c.countyFips === record.countyFips);
    assert(record.stateCode === p.stateCode && county?.stateCode === p.stateCode && county.status === "active"
      && [county.legalName, county.shortName, ...(county.aliases ?? [])].includes(record.sourceCounty), "Official occurrence named county is not an exact active registry alias.");
    assert(pair.scientificName === record.scientificName, "Catalog species concept differs from reviewed occurrence.");
    assert(record.review.reviewedAt <= context.runStartedAt && occurrenceDateBounds(record.observationDate)!.end <= occurrenceDateBounds(p.asOf)!.end,
      "Review or occurrence follows this run/assessment.");
    assert(p.reviewActorId !== record.review.actorId && p.reviewActorId !== record.review.independentActorId, "Evidence review requires a distinct lease actor.");
    const pin = p.records.find(pin => pin.recordId === record.id)!;
    const payload = { recordId: record.id, recordSha256: pin.sha256, pairKey: key, sourceDate: record.observationDate, sourceDecodedSha256: record.source.decodedSha256 };
    const id = eventId("official-occurrence-assertion", { runId: context.runId, ...payload });
    result.assertions.push({ schemaVersion: 1, eventId: id, event_type: "evidence.asserted", created_at: context.runStartedAt,
      actor_type: "adapter", actor_id: OFFICIAL_OCCURRENCE_ADAPTER + "@" + OFFICIAL_OCCURRENCE_VERSION, run_id: context.runId,
      source_id: context.sourceId, state_code: context.stateCode, county_fips: record.countyFips, species_id: record.speciesId,
      claim_type: "recorded-present", evidence_kind: "occurrence", scope: "county", source_record_id: record.id,
      source_url: record.url, source_record_date: record.observationDate, retrieved_at: record.retrievedAt,
      taxon_match: { method: "Exact binomial with authorship retained; independent incident-specific species review.", target_scientific_name: pair.scientificName, source_scientific_name: record.sourceTaxonVerbatim, source_taxon_key: null },
      geography_match: { method: "Explicit named county in the confirmed occurrence passage; exact active registry alias, no polygon or coordinate inference.", source_state: record.stateCode, source_county: record.sourceCounty, county_fips: record.countyFips },
      temporal_scope: "Reported occurrence: " + record.observationDate + "; source precision retained. Document issued " + record.documentDate + "; no current-persistence assertion.",
      spatial_scope: "Agency-reported detection within " + record.sourceCounty + "; not every location in the county.", survey_scope: null,
      normalized_payload_hash: sha256(stableJson(payload)), caveats: record.caveats,
      notes: ["Reviewed source record " + record.id + " (" + pin.sha256 + ").", "Context: " + record.occurrenceContext + ".", "Independent source interpretation: " + record.review.independentReview.path + " (" + record.review.independentReview.sha256 + ").",
        ...record.supports.map(s => "PDF page " + s.page + " [" + s.purpose + "]: " + s.quote)] });
    result.reviews.push({ schemaVersion: 1, eventId: eventId("official-occurrence-review", { id, actorId: p.reviewActorId }), event_type: "evidence.reviewed", created_at: context.runStartedAt,
      actor_type: "agent", actor_id: p.reviewActorId, run_id: context.runId, source_id: context.sourceId, state_code: context.stateCode, county_fips: record.countyFips, species_id: record.speciesId,
      references: { assertion_event_id: id }, review_level: "agent-reviewed", decision: "accepted", publication_eligible: true,
      reason_codes: ["explicit-confirmed-agency-occurrence", "independent-source-interpretation", "exact-species-and-named-county", "original-date-precision"],
      notes: ["Agent review of the hash-pinned source interpretation and original passages. No human approval is claimed."] });
    result.outcomes.push({ schemaVersion: 1, outcome_id: eventId("official-occurrence-outcome", { runId: context.runId, key }), run_id: context.runId, source_id: context.sourceId,
      state_code: context.stateCode, county_fips: record.countyFips, species_id: record.speciesId, status: "evidence-found", scope_complete: true, recorded_at: context.runStartedAt,
      assertion_event_ids: [id], rejection_ids: [], query_urls: [record.url], notes: ["Completed only the selected reviewed occurrence record. No exhaustive source search, species-group expansion, current persistence or negative claim."] });
  }
  result.artifacts.push({ filename: "reviewed-occurrence-witnesses.json", mediaType: "application/json", contents: JSON.stringify({ method: OFFICIAL_OCCURRENCE_METHOD, records, pins: p.records }, null, 2) + "\n" });
  return result;
}
