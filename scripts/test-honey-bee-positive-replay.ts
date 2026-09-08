import { compileAdditiveResearchEvidence } from "@/lib/research/compile-evidence";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { buildHoneyPositiveResult as build, honeyPositiveRowValue as metric, resolveHoneyPublishedCounty, honeyPositiveInputPaths, HONEY_POSITIVE_REVIEW_PATH, HONEY_CSV_PATH } from "@/lib/research/honey-bee-positive-review";
import { sha256 } from "@/lib/research/run-files";
import { resolveCountyEquivalent } from "@/lib/research/geography-registry";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
const read = (p: string) => readFileSync(p);
const methodReviewSha256 = sha256(read(HONEY_POSITIVE_REVIEW_PATH));
const make = (stateCode: string, fips: string[]): SourceAdapterContext => ({
  runId: "honey-positive-fixture-" + stateCode, sourceId: "aphis-honey-bee", stateCode, runStartedAt: "2026-09-08T23:59:00.000Z",
  requestedPairs: fips.map(countyFips => ({countyFips, countyName: "Source registry", speciesId: "varroa-destructor", scientificName: "Varroa destructor"})),
  parameters: {mode: "retained-positive-survey", stateCode, methodReviewSha256, candidatePairs: fips.map(f => f + ":varroa-destructor").sort(), candidateLimit: fips.length},
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw Error("Offline replay attempted network access."); };
let rejected = 0;
try {
  const context = make("NY", ["36003", "36009"]), result = build(context, read);
  assert.equal(result.assertions.length, 2); assert.equal(result.candidateRecordCount, 18);
  assert.deepEqual(result.assertions.map(a => a.source_record_date), ["2020-08", "2020-08"]);
  assert(result.assertions.every(a => a.claim_type === "recorded-present" && a.scope === "survey-area" && a.retrieved_at === "2026-08-20T02:06:05.317Z"));
  assert.equal(result.upstreamRequests.length, 0);
  const sources = JSON.parse(read("src/data/research/source-registry.json").toString()).sources;
  const immutableBefore = JSON.stringify(result.assertions);
  const compile = (assertions = result.assertions, reviews = result.reviews) => compileAdditiveResearchEvidence({bootstrapEvidence: [], runAssertions: assertions, reviewEvents: reviews, sources, asOf: "2026-09-08"});
  const published = compile().runEvidence;
  assert.equal(published.length, 2);
  assert(published.every(e => e.caveat.includes("copyright University of Maryland") && e.caveat.includes("do not constitute endorsement")));
  assert(published.every(e => !e.caveat.includes("src/data/research/runs/") && !e.caveat.includes("Method review src/")));
  assert.equal(JSON.stringify(result.assertions), immutableBefore);
  const missingCredit = structuredClone(result.assertions); missingCredit[0].notes = [];
  assert.throws(() => compile(missingCredit), /requires its retained UMD attribution/u); rejected++;
  const oldDir = "src/data/research/runs/20260820T020544Z__aphis-honey-bee__1845d88d8f70/";
  const ndjson = (p: string) => read(p).toString().split("\n").filter(Boolean).map(s => JSON.parse(s));
  const oldAssertions = ndjson(oldDir + "assertions.ndjson"), oldReviews = ndjson(oldDir + "reviews.ndjson");
  assert.equal(compile(oldAssertions, oldReviews).runEvidence[0].caveat, oldAssertions[0].caveats.join(" "));

  const artifact = JSON.parse(result.artifacts[0].contents.toString());
  assert.equal(artifact.biologicalRowsScanned, 12704); assert.equal(artifact.dictionaryRowsExcluded, 1);
  assert.deepEqual(artifact.witnesses.map((w: {positiveRows: number}) => w.positiveRows), [2, 13]);
  const allegany = artifact.witnesses[0].sourceRows;
  assert.deepEqual(allegany.map((r: {physicalLineOneBased: number}) => r.physicalLineOneBased), [7298,7895,9281,11991]);
  assert.equal(allegany[0].lineSha256Utf8WithoutTerminator, "9d74ca80cf7235fe371ad1d87272dddd138b9f5d7dc3d1663f5127ae7e1c29d3");
  assert.equal(allegany[1].lineSha256Utf8WithoutTerminator, "576e393716e30e7124ad0562b1cd88b963935c78c3d7b1e8b316ddf1a3f09ca1");
  assert.equal(allegany[2].disposition, "zero-metric-no-positive-claim");
  assert(artifact.attribution.includes("copyright University of Maryland") && artifact.attribution.includes("do not constitute endorsement"));
  const hi = build(make("HI", ["15001", "15003"]), read);
  assert.equal(hi.candidateRecordCount, 169);
  assert.deepEqual(hi.assertions.map(a => a.source_record_date), ["2025-05", "2024-02"]);
  for (const f of ["15007", "15009"]) { assert.throws(() => build(make("HI", [f]), read), /source-conflict hold/u); rejected++; }
  for (const [name, records] of [["evidence-assertion", result.assertions],["review-event", result.reviews],["pair-outcome", result.outcomes],["rejection-record", result.rejections]] as const) {
    const schema = JSON.parse(read("src/data/research/schemas/" + name + ".schema.json").toString()); delete schema.allOf;
    const validator = z.fromJSONSchema(schema); for (const r of records) validator.parse(r);
  }
  const schema = z.fromJSONSchema(JSON.parse(read("src/data/research/schemas/aphis-honey-bee-survey-parameters.schema.json").toString()));
  schema.parse(context.parameters);
  const legacy = JSON.parse(read("src/data/research/runs/20260820T020544Z__aphis-honey-bee__1845d88d8f70/receipt.json").toString());
  schema.parse(legacy.parameters);
  assert(honeyPositiveInputPaths({methodReviewSha256}, read).includes(HONEY_CSV_PATH));
  for (const mutate of [
    (c: SourceAdapterContext) => { c.sourceId = "unregistered"; },
    (c: SourceAdapterContext) => { c.stateCode = "HI"; },
    (c: SourceAdapterContext) => { c.parameters.candidateLimit = 3; },
    (c: SourceAdapterContext) => { c.parameters.candidatePairs = ["36003:varroa-destructor"]; },
    (c: SourceAdapterContext) => { c.parameters.candidatePairs = ["36009:varroa-destructor","36003:varroa-destructor"]; },
    (c: SourceAdapterContext) => { c.parameters.methodReviewSha256 = "a".repeat(64); },
    (c: SourceAdapterContext) => { c.requestedPairs[0].scientificName = "Varroa jacobsoni"; },
    (c: SourceAdapterContext) => { c.runStartedAt = "2026-08-19T00:00:00.000Z"; },
    (c: SourceAdapterContext) => { c.parameters.mode = "non-detection"; },
  ]) { const c = structuredClone(context); mutate(c); assert.throws(() => build(c, read)); rejected++; }
  for (const path of honeyPositiveInputPaths({methodReviewSha256}, read).filter(p => !p.endsWith(".ts"))) {
    assert.throws(() => build(context, p => p === path ? Buffer.from("changed immutable input") : read(p))); rejected++;
  }
  const baseRow = {varroa_per_100_bees: "0.01", sample_year: "2025", sample_month_number: "2", sample_month: "February"};
  assert.deepEqual(metric(baseRow), {month:"2025-02", metric:0.01});
  for (const value of ["0","0.0",""," ","-1","NaN","Infinity","1e3","1.2x","+2","0x1"])
    assert(metric({...baseRow,varroa_per_100_bees:value}).reason);
  for (const overrides of [{sample_year:"2026"},{sample_year:"2008"},{sample_month_number:"13"},{sample_month_number:"0"},{sample_month:"March"}])
    assert(metric({...baseRow,...overrides}).reason);
  const registry = JSON.parse(read("src/data/research/county-equivalent-registry.json").toString());
  assert.equal(resolveHoneyPublishedCounty(registry, "CT", "Fairfield").reason, "retired-geography");
  assert.equal(resolveHoneyPublishedCounty(registry, "VA", "Richmond").reason, "ambiguous-county-name");
  assert.equal(resolveHoneyPublishedCounty(registry, "AK", "Valdez-Cordova").reason, "retired-geography");
  assert.equal(resolveHoneyPublishedCounty(registry, "NY", "").reason, "missing-geography");
  assert.equal(resolveHoneyPublishedCounty(registry, "NY", "Cattaraugus").county?.countyFips, "36009");
  const preflight = JSON.parse(gunzipSync(read("ops/national-research/evaluations/artifacts/honey-bee-positive-preflight-20260908-r12.json.gz")).toString());
  const pairs = preflight.pairs.filter((p: {pair: string}) => !["15007:varroa-destructor","15009:varroa-destructor"].includes(p.pair));
  let total = 0, states = 0;
  for (const state of [...new Set<string>(pairs.map((p: {stateCode: string}) => p.stateCode))].sort()) {
    const statePairs = pairs.filter((p: {stateCode: string}) => p.stateCode === state);
    const built = build(make(state, statePairs.map((p: {countyFips: string}) => p.countyFips)), read);
    assert.equal(built.assertions.length, statePairs.length);
    for (const p of statePairs) {
      const local = resolveHoneyPublishedCounty(registry, state, p.countyName);
      const shared = resolveCountyEquivalent({stateCode:state,countyName:p.countyName,sourceId:"aphis-honey-bee"});
      assert.equal(shared.status, "resolved");
      assert.equal(local.county?.countyFips, p.countyFips);
    }
    total += built.assertions.length; states++;
  }
  assert.equal(total, 1739); assert.equal(states, 48);
  console.log(JSON.stringify({passed:true,fixtureCandidatePairs:total,jurisdictions:states,independentRowHashesMatched:true,legacyParametersAccepted:true,invalidCasesRejected:rejected,networkRequests:0,actualNewDeterminations:0}));
} finally { globalThis.fetch = originalFetch; }
