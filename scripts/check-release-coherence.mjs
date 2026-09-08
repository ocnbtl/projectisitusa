import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ORIGIN = "https://data.isitusa.com";
const SHA = /^[0-9a-f]{64}$/u;
const RELEASE = /^research-[0-9a-f]{12}-[0-9a-f]{16}$/u;
const MAX_COUNTIES = 128;
const MAX_BYTES = 256 * 1024 * 1024;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const read = (root, name) => JSON.parse(readFileSync(path.join(root, name), "utf8"));
const unique = (values, label) => {
  requireValue(Array.isArray(values) && values.every((v) => typeof v === "string" && v.length > 0), `Invalid ${label}`);
  requireValue(new Set(values).size === values.length, `Duplicate ${label}`);
  return [...values].sort();
};

export function isHostedBuild(environment = process.env) {
  return environment.VERCEL === "1" || ["production", "preview"].includes(environment.VERCEL_ENV);
}

export function candidateCountyPresence(species, presence, counties, config) {
  requireValue(Array.isArray(species), "Missing explorer species");
  unique(species.map((s) => s.id), "explorer species IDs");
  requireValue(Array.isArray(config.states), "Missing research state configuration");
  unique(config.states.map((s) => s.stateCode), "configured states");
  const states = config.states.filter((s) => s.compatibilityPublication === true);
  requireValue(states.length > 0 && states.every((s) => s.mode === "authoritative" && /^[A-Z]{2}$/u.test(s.stateCode)), "Invalid compatibility publication scope");
  requireValue(counties && !Array.isArray(counties) && presence && !Array.isArray(presence), "Missing county or presence index");
  for (const fips of Object.keys(presence)) requireValue(Object.hasOwn(counties, fips), `Presence county missing from catalog: ${fips}`);
  const result = {};
  for (const state of states) {
    const scope = Object.entries(counties).filter(([, county]) => county.stateCode === state.stateCode);
    requireValue(scope.length > 0, `Missing county scope: ${state.stateCode}`);
    for (const [fips, county] of scope) {
      requireValue(/^\d{5}$/u.test(fips) && county.countyFips === fips, `Invalid county identity: ${fips}`);
      requireValue(Object.hasOwn(presence, fips) && Array.isArray(presence[fips]), `Missing county presence: ${fips}`);
      const ordinals = presence[fips];
      requireValue(ordinals.every((n) => Number.isSafeInteger(n) && n >= 0 && n < species.length), `Invalid species ordinal: ${fips}`);
      result[fips] = { stateCode: state.stateCode, speciesIds: unique(ordinals.map((n) => species[n].id), `county species IDs: ${fips}`) };
    }
  }
  requireValue(Object.keys(result).length <= MAX_COUNTIES, `Compatibility scope exceeds the ${MAX_COUNTIES}-county read budget; review the budget before expanding publication`);
  return result;
}

export function compareCountyPresence(candidate, published) {
  const mismatches = [];
  const counties = unique([...new Set([...Object.keys(candidate), ...Object.keys(published)])], "comparison counties");
  for (const fips of counties) {
    const app = candidate[fips], research = published[fips];
    requireValue(app && research && app.stateCode === research.stateCode, `County scope mismatch: ${fips}`);
    const appIds = unique(app.speciesIds, `app IDs: ${fips}`), researchIds = unique(research.speciesIds, `research IDs: ${fips}`);
    const appSet = new Set(appIds), researchSet = new Set(researchIds);
    const addedInApp = appIds.filter((id) => !researchSet.has(id));
    const missingInApp = researchIds.filter((id) => !appSet.has(id));
    if (addedInApp.length || missingInApp.length) mismatches.push({ countyFips: fips, stateCode: app.stateCode, appPresent: appIds.length, publishedPresent: researchIds.length, addedInApp, missingInApp });
  }
  return mismatches;
}

// This is a bounded, read-only release preflight. It never runs in public requests.
export async function checkReleaseCoherence(root = process.cwd(), { fetchImpl = globalThis.fetch, candidate } = {}) {
  const startedAt = new Date().toISOString();
  const delivery = read(root, "src/data/research/research-data-delivery.json");
  requireValue(delivery.mode === "r2" && delivery.r2?.origin === ORIGIN && delivery.r2?.pointerPath === "current.json", "Release coherence requires the configured public R2 origin and pointer");
  const local = candidate ?? candidateCountyPresence(
    read(root, "src/data/generated/explorer-species.json"),
    read(root, "src/data/generated/explorer-presence.json"),
    read(root, "src/data/generated/counties.json"),
    read(root, "src/data/research/state-research-config.json"),
  );
  requireValue(Object.keys(local).length > 0 && Object.keys(local).length <= MAX_COUNTIES, "Invalid candidate county budget");
  const signal = AbortSignal.timeout(90_000);
  const requests = [];
  let totalBytes = 0;
  async function get(key, limit, expectedSha, expectedBytes) {
    requireValue(key === "current.json" || /^releases\/research-[0-9a-f]{12}-[0-9a-f]{16}\/manifest\.json$/u.test(key) || /^objects\/sha256\/[0-9a-f]{2}\/[0-9a-f]{64}\.json$/u.test(key), `Unsafe public object key: ${key}`);
    const response = await fetchImpl(`${ORIGIN}/${key}`, { redirect: "error", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) });
    requireValue(response.status === 200 && response.body, `Public release request failed (${response.status}): ${key}`);
    const chunks = [];
    let bytes = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.length;
        totalBytes += chunk.value.length;
        requireValue(bytes <= limit && totalBytes <= MAX_BYTES, `Public release byte budget exceeded: ${key}`);
        chunks.push(chunk.value);
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
    const buffer = Buffer.concat(chunks);
    const sha256 = hash(buffer);
    requireValue(!expectedSha || sha256 === expectedSha, `Public release SHA-256 mismatch: ${key}`);
    requireValue(expectedBytes === undefined || bytes === expectedBytes, `Public release byte length mismatch: ${key}`);
    requests.push({ key, decodedBytes: bytes, sha256 });
    return JSON.parse(buffer.toString("utf8"));
  }
  const pointer = await get("current.json", 65_536);
  requireValue(pointer.schemaVersion === 1 && pointer.kind === "isitusa-research-projection-pointer" && RELEASE.test(pointer.releaseId) && SHA.test(pointer.releaseManifestSha256) && /^[0-9a-f]{40}$/u.test(pointer.sourceCommit) && pointer.releaseManifestKey === `releases/${pointer.releaseId}/manifest.json`, "Invalid published research pointer");
  const firstPointerHash = requests[0].sha256;
  const manifest = await get(pointer.releaseManifestKey, 16 * 1024 * 1024, pointer.releaseManifestSha256);
  requireValue(manifest.releaseId === pointer.releaseId && manifest.sourceCommit === pointer.sourceCommit && Array.isArray(manifest.artifacts), "Published manifest identity mismatch");
  unique(manifest.artifacts.map((a) => a.logicalPath), "manifest logical paths");
  const states = new Set(Object.values(local).map((c) => c.stateCode));
  const entries = manifest.artifacts.filter((a) => {
    const match = /^public\/generated\/research\/([A-Z]{2})\/counties\/(\d{5})\.json$/u.exec(a.logicalPath);
    return match && states.has(match[1]);
  });
  const entryCounties = entries.map((a) => path.posix.basename(a.logicalPath, ".json"));
  requireValue(JSON.stringify(unique(entryCounties, "published counties")) === JSON.stringify(Object.keys(local).sort()), "Published and candidate county scopes differ");
  for (const entry of entries) {
    requireValue(SHA.test(entry.sha256) && Number.isSafeInteger(entry.bytes) && entry.bytes > 0 && entry.bytes <= 20 * 1024 * 1024 && entry.objectKey === `objects/sha256/${entry.sha256.slice(0, 2)}/${entry.sha256}.json`, `Invalid published county descriptor: ${entry.logicalPath}`);
  }
  const published = {};
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const entry = entries[next++];
      const county = await get(entry.objectKey, entry.bytes, entry.sha256, entry.bytes);
      const fips = path.posix.basename(entry.logicalPath, ".json");
      requireValue(county.countyFips === fips && county.stateCode === local[fips].stateCode && Array.isArray(county.pairs), `Published county identity mismatch: ${fips}`);
      unique(county.pairs.map((p) => p.speciesId), `published pair IDs: ${fips}`);
      requireValue(county.pairs.every((p) => ["verified-present", "verified-absent", "not-detected", "researched-unresolved", "not-researched"].includes(p.displayStatus)), `Invalid published determination status: ${fips}`);
      published[fips] = { stateCode: county.stateCode, speciesIds: county.pairs.filter((p) => p.displayStatus === "verified-present").map((p) => p.speciesId).sort() };
    }
  }
  const results = await Promise.allSettled([worker(), worker()]);
  for (const result of results) if (result.status === "rejected") throw result.reason;
  await get("current.json", 65_536);
  requireValue(requests.at(-1).sha256 === firstPointerHash, "Research pointer changed during release verification; retry against one stable release");
  const mismatches = compareCountyPresence(local, published);
  return { schemaVersion: 1, startedAt, finishedAt: new Date().toISOString(), coherent: mismatches.length === 0, releaseId: pointer.releaseId, manifestSha256: pointer.releaseManifestSha256, states: [...states].sort(), countiesChecked: entries.length, requestCount: requests.length, decodedBytes: totalBytes, mismatches, publishedPresence: published, requests };
}

export function coherenceSummary(result) {
  const { publishedPresence, requests, ...summary } = result;
  return summary;
}

export async function enforceHostedReleaseCoherence(environment = process.env, root = process.cwd(), check = checkReleaseCoherence) {
  if (!isHostedBuild(environment)) return { mode: "local" };
  const result = await check(root);
  requireValue(result.coherent, `App/research publication mismatch: ${JSON.stringify(result.mismatches)}`);
  return { mode: "hosted", ...coherenceSummary(result) };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    const result = process.argv.includes("--vercel")
      ? await enforceHostedReleaseCoherence()
      : await checkReleaseCoherence();
    console.log(JSON.stringify(coherenceSummary(result)));
    if (result.coherent === false) process.exitCode = 1;
  } catch (error) {
    console.error(`Release coherence check failed: ${error.message}`);
    process.exitCode = 1;
  }
}
