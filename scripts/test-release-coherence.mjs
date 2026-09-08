import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { candidateCountyPresence, checkReleaseCoherence, compareCountyPresence, enforceHostedReleaseCoherence, isHostedBuild } from "./check-release-coherence.mjs";
import { decideSafeVercelBuild } from "./should-ignore-vercel-build.mjs";

const sha = (v) => createHash("sha256").update(v).digest("hex");
const bytes = (v) => Buffer.from(JSON.stringify(v));
const config = { states: [{ stateCode: "AL", mode: "authoritative", compatibilityPublication: true }, { stateCode: "AK", mode: "research-only", compatibilityPublication: false }] };
const species = [{ id: "carp" }, { id: "bass" }];
const counties = { "01001": { stateCode: "AL", countyFips: "01001" }, "02001": { stateCode: "AK", countyFips: "02001" } };
const candidate = candidateCountyPresence(species, { "01001": [0], "02001": [1] }, counties, config);
assert.deepEqual(candidate, { "01001": { stateCode: "AL", speciesIds: ["carp"] } });
assert.deepEqual(candidateCountyPresence([...species].reverse(), { "01001": [1] }, counties, config), candidate, "Ordinal reordering preserves species identity");
assert.throws(() => candidateCountyPresence(species, {}, counties, config), /Missing county presence/);
for (const bad of [[-1], [2], [0.5], [null], ["0"], [0, 0]]) assert.throws(() => candidateCountyPresence(species, { "01001": bad }, counties, config), /Invalid species ordinal|Duplicate county species/);
assert.throws(() => candidateCountyPresence([species[0], species[0]], { "01001": [0] }, counties, config), /Duplicate explorer/);
assert.throws(() => candidateCountyPresence(species, { "01001": [0], "01999": [] }, counties, config), /missing from catalog/);
assert.throws(() => candidateCountyPresence(species, { "01001": [0] }, {}, config), /missing from catalog/);
assert.throws(() => candidateCountyPresence(species, { "01001": [0] }, counties, { states: [] }), /Invalid compatibility/);
assert.equal(compareCountyPresence(candidate, candidate).length, 0);
assert.deepEqual(compareCountyPresence(candidate, { "01001": { stateCode: "AL", speciesIds: ["bass"] } })[0], { countyFips: "01001", stateCode: "AL", appPresent: 1, publishedPresent: 1, addedInApp: ["carp"], missingInApp: ["bass"] }, "Same-count species swaps must fail");
assert.throws(() => compareCountyPresence(candidate, {}), /scope mismatch/);
assert.throws(() => compareCountyPresence(candidate, { ...candidate, "01003": candidate["01001"] }), /scope mismatch/);
for (const env of [{ VERCEL: "1" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" }]) assert.equal(isHostedBuild(env), true);
assert.equal(isHostedBuild({}), false);
assert.equal((await enforceHostedReleaseCoherence({}, "unused", () => { throw new Error("Must not fetch locally"); })).mode, "local");
await assert.rejects(() => enforceHostedReleaseCoherence({ VERCEL: "1" }, "unused", async () => ({ coherent: false, mismatches: ["wrong species"] })), /publication mismatch/);
assert.equal((await enforceHostedReleaseCoherence({ VERCEL_ENV: "preview" }, "unused", async () => ({ coherent: true }))).mode, "hosted");
const run = () => ({ ignoreBuild: false, reason: "app changed" });
const offline = async () => { throw new Error("Provider unavailable"); };
assert.equal((await decideSafeVercelBuild({}, ".", offline, run)).ignoreBuild, true);
assert.equal((await decideSafeVercelBuild({}, ".", offline, () => { throw new Error("Git unavailable"); })).ignoreBuild, true);
assert.equal((await decideSafeVercelBuild({}, ".", async () => {}, run)).ignoreBuild, false);
assert.equal((await decideSafeVercelBuild({}, ".", () => { assert.fail("No requests on docs-only commits"); }, () => ({ ignoreBuild: true }))).ignoreBuild, true);
assert.ok(JSON.parse(readFileSync(new URL("../package.json", import.meta.url))).scripts.build.startsWith("node scripts/check-release-coherence.mjs --vercel && "), "Build guard precedes asset generation and cannot rely only on the ignore hook");

const tempParent = path.resolve(tmpdir());
const root = mkdtempSync(path.join(tempParent, "isitusa-release-coherence-"));
try {
  mkdirSync(path.join(root, "src/data/research"), { recursive: true });
  writeFileSync(path.join(root, "src/data/research/research-data-delivery.json"), JSON.stringify({ mode: "r2", r2: { origin: "https://data.isitusa.com", pointerPath: "current.json" } }));
  function fixture(mutate = () => {}) {
    const county = { stateCode: "AL", countyFips: "01001", pairs: [{ speciesId: "carp", displayStatus: "verified-present" }, { speciesId: "bass", displayStatus: "not-detected" }] };
    const releaseId = `research-${"a".repeat(12)}-${"b".repeat(16)}`;
    const sourceCommit = "c".repeat(40);
    const countyBytes = bytes(county), countySha = sha(countyBytes);
    const entry = { logicalPath: "public/generated/research/AL/counties/01001.json", objectKey: `objects/sha256/${countySha.slice(0, 2)}/${countySha}.json`, sha256: countySha, bytes: countyBytes.length };
    const manifest = { releaseId, sourceCommit, artifacts: [entry] };
    const pointer = { schemaVersion: 1, kind: "isitusa-research-projection-pointer", releaseId, sourceCommit, releaseManifestKey: `releases/${releaseId}/manifest.json`, releaseManifestSha256: "" };
    const state = { county, entry, manifest, pointer, countyBytes, network: new Map(), calls: [], changePointer: false };
    mutate(state);
    const mb = bytes(manifest);
    pointer.releaseManifestSha256 ||= sha(mb);
    state.network.set("current.json", bytes(pointer));
    state.network.set(pointer.releaseManifestKey, mb);
    state.network.set(entry.objectKey, state.countyBytes);
    const fetchImpl = async (url, options) => {
      assert.ok(url.startsWith("https://data.isitusa.com/"));
      assert.equal(options.redirect, "error");
      assert.equal(options.cache, "no-store");
      assert.ok(options.signal instanceof AbortSignal);
      const key = url.slice("https://data.isitusa.com/".length);
      state.calls.push(key);
      if (state.changePointer && key === "current.json" && state.calls.length > 1) return new Response(bytes({ ...pointer, promotedAt: "changed" }));
      return new Response(state.network.get(key) ?? "missing", { status: state.network.has(key) ? 200 : 404 });
    };
    return { ...state, fetchImpl };
  }
  const good = fixture();
  const result = await checkReleaseCoherence(root, { candidate, fetchImpl: good.fetchImpl });
  assert.equal(result.coherent, true);
  assert.equal(result.countiesChecked, 1);
  assert.equal(result.requestCount, 4);
  assert.deepEqual(result.publishedPresence, candidate, "Non-detection does not become presence or absence");
  const changed = await checkReleaseCoherence(root, { candidate: { "01001": { stateCode: "AL", speciesIds: ["bass"] } }, fetchImpl: fixture().fetchImpl });
  assert.equal(changed.coherent, false);
  const adverse = [
    [s => { s.pointer.releaseManifestKey = "https://example.com/manifest.json"; }, /Invalid published research pointer/],
    [s => { s.pointer.releaseManifestSha256 = "f".repeat(64); }, /SHA-256 mismatch/],
    [s => { s.manifest.sourceCommit = "d".repeat(40); }, /manifest identity mismatch/],
    [s => { s.manifest.artifacts.push({ ...s.entry }); }, /Duplicate manifest logical/],
    [s => { s.manifest.artifacts = []; }, /county scopes differ/],
    [s => { s.entry.objectKey = "../secret"; }, /Invalid published county descriptor/],
    [s => { s.entry.bytes += 1; }, /byte length mismatch/],
    [s => { s.entry.bytes -= 1; }, /byte budget exceeded/],
    [s => { s.entry.bytes = 21 * 1024 * 1024; }, /Invalid published county descriptor/],
    [s => { s.countyBytes = Buffer.from("tampered"); }, /SHA-256 mismatch/],
    [s => { s.changePointer = true; }, /pointer changed/],
    [s => { s.county.countyFips = "01003"; s.countyBytes = bytes(s.county); s.entry.bytes = s.countyBytes.length; s.entry.sha256 = sha(s.countyBytes); s.entry.objectKey = `objects/sha256/${s.entry.sha256.slice(0, 2)}/${s.entry.sha256}.json`; }, /county identity mismatch/],
    [s => { s.county.pairs.push(s.county.pairs[0]); s.countyBytes = bytes(s.county); s.entry.bytes = s.countyBytes.length; s.entry.sha256 = sha(s.countyBytes); s.entry.objectKey = `objects/sha256/${s.entry.sha256.slice(0, 2)}/${s.entry.sha256}.json`; }, /Duplicate published pair/],
  ];
  for (const [mutate, expected] of adverse) await assert.rejects(() => checkReleaseCoherence(root, { candidate, fetchImpl: fixture(mutate).fetchImpl }), expected);
  await assert.rejects(() => checkReleaseCoherence(root, { candidate, fetchImpl: offline }), /Provider unavailable/);
  await assert.rejects(() => checkReleaseCoherence(root, { candidate, fetchImpl: async () => new Response("unavailable", { status: 503 }) }), /request failed \(503\)/);
  console.log("Release coherence tests passed: identity parity, ordinal reordering, scope, integrity, bounded retrieval, pointer race, and both build gates.");
} finally {
  const relative = path.relative(tempParent, path.resolve(root));
  assert.ok(relative.startsWith("isitusa-release-coherence-") && !relative.includes(path.sep));
  rmSync(root, { recursive: true, force: true });
}
