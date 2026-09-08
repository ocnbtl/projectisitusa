import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { buildOfficialOccurrenceResult as build, loadOfficialOccurrenceRecord as load, officialOccurrenceRecordPath as recordPath, officialOccurrenceInputPaths, type OfficialOccurrenceRecord, type OfficialOccurrencePlan } from "@/lib/research/official-occurrence-review";
import { sha256 } from "@/lib/research/run-files";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
const root = process.cwd(), read = (p: string) => readFileSync(path.join(root, p));
const ids = ["cdfa-cff-la-confirmed-occurrence-20260318-v1", "cdfa-cff-sd-confirmed-occurrence-20260318-v1"];
const pins = ids.map(recordId => ({ recordId, sha256: sha256(read(recordPath(recordId))) }));
const records = pins.map(pin => load(pin, read));
const context: SourceAdapterContext = { runId: "fixture-official-occurrence", sourceId: "cdfa-confirmed-pest-occurrences", stateCode: "CA", runStartedAt: "2026-09-08T12:00:00.000Z",
  requestedPairs: records.map(r => ({ countyFips: r.countyFips, countyName: r.sourceCounty, speciesId: r.speciesId, scientificName: r.scientificName })),
  parameters: { mode: "retained-reviewed-official-occurrence", stateCode: "CA", asOf: "2026-09-08", reviewActorId: "fixture-evidence-worker", records: pins, candidatePairs: records.map(r => r.countyFips + ":" + r.speciesId).sort(), candidateLimit: 2 } };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error("Retained adapter attempted network access"); };
let rejected = 0;
try {
  const result = build(context, read);
  assert.equal(result.assertions.length, 2); assert.equal(result.reviews.length, 2); assert.equal(result.outcomes.length, 2);
  assert.deepEqual(result.assertions.map(a => a.source_record_date), ["2026-01-20/2026-02-09", "1983"]);
  assert(result.assertions.every(a => a.claim_type === "recorded-present" && a.evidence_kind === "occurrence" && a.retrieved_at === "2026-09-08T07:51:56.731Z"));
  assert.equal(result.upstreamRequests.length, 0);
  assert.equal(result.candidateRecordCount, 2);
  for (const [name, values] of [["evidence-assertion", result.assertions], ["review-event", result.reviews], ["pair-outcome", result.outcomes]] as const) {
    const jsonSchema = JSON.parse(read("src/data/research/schemas/" + name + ".schema.json").toString()); delete jsonSchema.allOf; const validator = z.fromJSONSchema(jsonSchema);
    for (const value of values) validator.parse(value);
  }
  const schema = z.fromJSONSchema(JSON.parse(read("src/data/research/schemas/official-confirmed-occurrence-report-parameters.schema.json").toString()));
  schema.parse(context.parameters);
  assert(officialOccurrenceInputPaths(context.parameters as unknown as OfficialOccurrencePlan, read).includes(records[0].source.path));
  for (const mutate of [
    (r: OfficialOccurrenceRecord) => { r.observationDate = "2026-03-18"; },
    (r: OfficialOccurrenceRecord) => { r.observationDate = "2026-02-30"; },
    (r: OfficialOccurrenceRecord) => { r.observationDate = "2027"; },
    (r: OfficialOccurrenceRecord) => { r.sourceCounty = "Riverside County"; },
    (r: OfficialOccurrenceRecord) => { r.countyFips = "06065"; },
    (r: OfficialOccurrenceRecord) => { r.scientificName = "Anastrepha ludens"; },
    (r: OfficialOccurrenceRecord) => { r.sourceTaxonVerbatim += " group"; },
    (r: OfficialOccurrenceRecord) => { (r as unknown as { claimType: string }).claimType = "officially-absent"; },
    (r: OfficialOccurrenceRecord) => { (r as unknown as { occurrenceContext: string }).occurrenceContext = "sterile-release"; },
    (r: OfficialOccurrenceRecord) => { r.supports[0].quote = "Future detections may occur in Los Angeles County."; },
    (r: OfficialOccurrenceRecord) => { r.supports[0].page = 13; },
    (r: OfficialOccurrenceRecord) => { r.source.path = "../source.pdf.gz"; },
    (r: OfficialOccurrenceRecord) => { r.source.sha256 = "a".repeat(64); },
    (r: OfficialOccurrenceRecord) => { r.extraction.decodedSha256 = "a".repeat(64); },
    (r: OfficialOccurrenceRecord) => { r.review.independentActorId = "MAIN"; },
    (r: OfficialOccurrenceRecord) => { r.url = "https://example.test/unrelated.pdf"; },
  ]) {
    const r = structuredClone(records[0]); mutate(r); const bytes = Buffer.from(JSON.stringify(r));
    assert.throws(() => load({ recordId: r.id, sha256: sha256(bytes) }, p => p === recordPath(r.id) ? bytes : read(p)));
    rejected++;
  }
  for (const mutate of [
    (c: SourceAdapterContext) => { c.requestedPairs[0].scientificName = "Anastrepha ludens"; },
    (c: SourceAdapterContext) => { c.parameters.reviewActorId = "MAIN"; },
    (c: SourceAdapterContext) => { c.parameters.reviewActorId = records[0].review.independentActorId; },
    (c: SourceAdapterContext) => { c.parameters.asOf = "2026-01-01"; },
    (c: SourceAdapterContext) => { c.requestedPairs.pop(); },
    (c: SourceAdapterContext) => { c.parameters.candidateLimit = 3; },
    (c: SourceAdapterContext) => { c.parameters.records = [pins[0], pins[0]]; },
    (c: SourceAdapterContext) => { c.stateCode = "AL"; },
    (c: SourceAdapterContext) => { c.sourceId = "manual-authoritative"; },
    (c: SourceAdapterContext) => { c.runStartedAt = "2026-09-08T07:00:00.000Z"; },
  ]) { const c = structuredClone(context); mutate(c); assert.throws(() => build(c, read)); rejected++; }
  const held = JSON.parse(read("ops/national-research/evaluations/off-group-occurrence-independent-review-20260908-r11.json").toString());
  assert.equal(held.status, "held-unresolved-taxon-group"); assert.equal(held.recommendedClaim, null);
  const reviewPath = records[0].review.independentReview.path;
  for (const mutate of [
    (r: typeof held) => { r.status = "held-unresolved-taxon-group"; },
    (r: typeof held) => { r.recommendedClaim.sourceRecordDate = "2026-10-15"; },
    (r: typeof held) => { r.actorId = "MAIN"; },
  ]) {
    const review = JSON.parse(read(reviewPath).toString()); mutate(review); const reviewBytes = Buffer.from(JSON.stringify(review));
    const record = structuredClone(records[0]); record.review.independentReview = { path: reviewPath, bytes: reviewBytes.length, sha256: sha256(reviewBytes) };
    const recordBytes = Buffer.from(JSON.stringify(record));
    assert.throws(() => load({ recordId: record.id, sha256: sha256(recordBytes) }, p => p === recordPath(record.id) ? recordBytes : p === reviewPath ? reviewBytes : read(p))); rejected++;
  }
  console.log(JSON.stringify({ passed: true, confirmedRecords: 2, rejectedInvalidCases: rejected, networkRequests: 0, sourcePrecisionPreserved: true, unresolvedSpeciesGroupNotAdmitted: true, assertionsAreNotCurrentPersistence: true }));
} finally { globalThis.fetch = originalFetch; }