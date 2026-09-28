import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import * as applicationResearchModule from "../src/lib/research/application-research-fetch.ts";
const { createApplicationResearchFetcher } = applicationResearchModule.default ?? applicationResearchModule;
import { validateCounty } from "./build-application-research-snapshot.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const sourceCommit = "a".repeat(40), asOf = "2026-09-23";
const value = { countyFips: "02013", pairs: [{ speciesId: "example", currentDeterminationStatus: "officially-eradicated", historicalOccurrenceStatus: "recorded-present", evidence: [{ url: "https://example.org/source", observedAt: "2001-04-03" }] }] };
const decoded = Buffer.from(JSON.stringify(value)), packed = gzipSync(decoded);
function fixture(options = {}) {
  const artifact = { path: "AK/counties/02013.json.gz", sha256: options.wrongRawHash ? "0".repeat(64) : hash(decoded), bytes: decoded.length, storedSha256: hash(packed), storedBytes: packed.length };
  const manifest = { schemaVersion: 1, kind: "isitusa-application-research-snapshot", sourceCommit: options.identity ? "b".repeat(40) : sourceCommit, asOf, files: { [options.unsafe ? "../outside.json" : "AK/counties/02013.json"]: { ...artifact, ...(options.oversize ? { bytes: 100_000_000 } : {}) } } };
  const raw = Buffer.from(JSON.stringify(manifest));
  const config = { schemaVersion: 1, sourceCommit, asOf, basePath: "/research-snapshots/" + sourceCommit, manifestSha256: hash(raw), manifestBytes: raw.length };
  let requests = 0, manifests = 0, artifacts = 0; const artifactCaches = [];
  const request = async (url, init) => {
    requests++;
    if (String(url).endsWith("manifest.json")) {
      manifests++;
      if (options.failFirst && manifests === 1) return new Response(null, { status: 503 });
      return new Response(raw);
    }
    artifacts++; artifactCaches.push(init?.cache);
    const body = options.extra ? Buffer.concat([packed, Buffer.from("extra")]) : Buffer.from(packed);
    if (options.corrupt || (options.corruptFirst && artifacts === 1)) body[15] ^= 1;
    return new Response(body);
  };
  return { fetcher: createApplicationResearchFetcher(config, request), counts: () => ({ requests, manifests, artifactCaches }) };
}
async function main() {
  let passed = 0;
  const good = fixture();
  const both = await Promise.all([good.fetcher("AK/counties/02013.json"), good.fetcher("AK/counties/02013.json")]);
  assert.deepEqual(both, [value, value]); passed++;
  assert.equal(good.counts().manifests, 1); passed++;
  for (const relative of ["../AK/summary.json", "/AK/summary.json", "AK\\summary.json", "AK/counties/02013.json?other", "AK/counties/02013.json.gz"]) {
    await assert.rejects(good.fetcher(relative), /Unsafe/); passed++;
  }
  await assert.rejects(good.fetcher("HI/summary.json"), /does not include/); passed++;
  for (const option of [{ corrupt: true }, { extra: true }, { wrongRawHash: true }, { unsafe: true }, { identity: true }, { oversize: true }]) {
    await assert.rejects(fixture(option).fetcher("AK/counties/02013.json")); passed++;
  }
  const retry = fixture({ failFirst: true });
  await assert.rejects(retry.fetcher("AK/counties/02013.json"), /503/); passed++;
  assert.deepEqual(await retry.fetcher("AK/counties/02013.json"), value); passed++;
  assert.equal(retry.counts().manifests, 2); passed++;
  const corruptRetry = fixture({ corruptFirst: true });
  await assert.rejects(corruptRetry.fetcher("AK/counties/02013.json")); passed++;
  assert.deepEqual(await corruptRetry.fetcher("AK/counties/02013.json"), value); passed++;
  assert.deepEqual(corruptRetry.counts().artifactCaches, ["force-cache", "reload"]); passed++;
  const abort = fixture(), controller = new AbortController(); controller.abort();
  await assert.rejects(abort.fetcher("AK/counties/02013.json", { signal: controller.signal })); passed++;
  assert.equal(abort.counts().requests, 0); passed++;
  const county = { countyFips: "02013", stateCode: "AK", summary: { verifiedPresent: 1, fullCountySpeciesDenominator: 2 }, pairs: [
    { speciesId: "a", displayStatus: "verified-present", currentDeterminationStatus: "officially-eradicated", conflict: false, evidence: [] },
    { speciesId: "b", displayStatus: "verified-absent", conflict: false, evidence: [] },
  ] };
  const expected = { countyFips: "02013", stateCode: "AK" }, species = new Set(["a", "b"]);
  const row = { verifiedPresent: 1, fullCountySpeciesDenominator: 2 };
  assert.equal(validateCounty(county, expected, species, row).length, 1); passed++;
  assert.throws(() => validateCounty({ ...county, countyFips: "02261" }, expected, species, row)); passed++;
  assert.throws(() => validateCounty({ ...county, pairs: [county.pairs[0], county.pairs[0]] }, expected, species, row)); passed++;
  assert.throws(() => validateCounty(county, expected, new Set(["b", "c"]), row)); passed++;
  assert.throws(() => validateCounty(county, expected, species, { ...row, verifiedPresent: 0 })); passed++;
  console.log(JSON.stringify({ passed, failed: 0, coverage: "compressed transport integrity, identity, bounded responses, retry, abort, membership and geography semantics" }));
}
void main();
