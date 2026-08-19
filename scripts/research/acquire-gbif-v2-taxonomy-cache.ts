import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { listCountyEquivalents } from "@/lib/research/geography-registry";
import { z } from "zod";

const MATCH_URL = "https://api.gbif.org/v2/species/match";
const METADATA_URL = "https://api.gbif.org/v2/species/match/metadata";
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 180_000;

type Species = { id: string; scientificName: string };
type CountyPair = { speciesId: string; displayStatus: string; researchStatus: string };
type CountyShard = {
  stateCode: string;
  countyFips: string;
  pairResolution: { defaultDisplayStatus: string };
  pairs: CountyPair[];
};

export type RankedSpecies = Species & {
  grossPairs: number;
  notResearchedPairs: number;
  blockedPairs: number;
  alreadyResearchedPairs: number;
};

type V2MatchResult = {
  usage?: {
    key?: string;
    canonicalName?: string;
    rank?: string;
    status?: string;
  };
  diagnostics?: {
    matchType?: string;
    confidence?: number;
  };
  synonym?: boolean;
  [key: string]: unknown;
};

type MatchDecision = {
  accepted: boolean;
  reason: string;
  taxonKey: number | null;
  canonicalName: string | null;
  confidence: number | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown) {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input)
        .sort(([left], [right]) => compareText(left, right))
        .map(([key, child]) => [key, normalize(child)]));
    }
    return input;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

function readJson<T>(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function repositoryPath(root: string, unresolved: string, label: string) {
  const resolved = path.resolve(root, unresolved);
  assert(resolved.startsWith(`${root}${path.sep}`), `${label} must remain in the repository.`);
  return resolved;
}

function getArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const required = (name: string) => {
    const value = values.get(name);
    assert(value, `--${name} is required.`);
    return value;
  };
  const candidateLimit = Number(required("candidate-limit"));
  assert(Number.isInteger(candidateLimit) && candidateLimit >= 25 && candidateLimit <= 500, "--candidate-limit must be an integer from 25 through 500.");
  const startedAt = new Date(required("started-at")).toISOString();
  assert(Date.parse(startedAt) <= Date.now() + 5_000, "--started-at cannot be more than five seconds in the future.");
  return {
    output: required("output"),
    evaluationOutput: required("evaluation-output"),
    cacheId: required("cache-id"),
    candidateLimit,
    startedAt,
  };
}

function currentHead(root: string) {
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
}

function assertClean(root: string) {
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  assert(status.length === 0, "GBIF taxonomy acquisition requires a clean worktree.");
}

export function rankCandidateSpecies(input: {
  species: Species[];
  countyShards: CountyShard[];
}) {
  const counts = new Map(input.species.map((species) => [species.id, {
    ...species,
    grossPairs: input.countyShards.length,
    notResearchedPairs: input.countyShards.length,
    blockedPairs: 0,
    alreadyResearchedPairs: 0,
  }]));
  for (const shard of input.countyShards) {
    assert(shard.pairResolution.defaultDisplayStatus === "not-researched", `County shard ${shard.countyFips} has an unsupported sparse default.`);
    const seen = new Set<string>();
    for (const pair of shard.pairs) {
      const current = counts.get(pair.speciesId);
      if (!current) continue;
      assert(!seen.has(pair.speciesId), `County shard ${shard.countyFips} repeats ${pair.speciesId}.`);
      seen.add(pair.speciesId);
      if (pair.displayStatus === "not-researched" && pair.researchStatus === "not-started") continue;
      current.notResearchedPairs -= 1;
      if (pair.displayStatus === "not-researched" && pair.researchStatus === "blocked") {
        current.blockedPairs += 1;
      } else {
        current.alreadyResearchedPairs += 1;
      }
    }
  }
  const ranked = [...counts.values()].sort(
    (left, right) => right.notResearchedPairs - left.notResearchedPairs || compareText(left.id, right.id),
  );
  for (const species of ranked) {
    assert(
      species.grossPairs === species.notResearchedPairs + species.blockedPairs + species.alreadyResearchedPairs,
      `Candidate counts do not reconcile for ${species.id}.`,
    );
  }
  return ranked;
}

export function classifyV2Match(scientificName: string, result: V2MatchResult): MatchDecision {
  const key = result.usage?.key;
  const canonicalName = result.usage?.canonicalName ?? null;
  const confidence = result.diagnostics?.confidence ?? null;
  if (result.diagnostics?.matchType !== "EXACT") {
    return { accepted: false, reason: "match-not-exact", taxonKey: null, canonicalName, confidence };
  }
  if (typeof confidence !== "number" || confidence < 95) {
    return { accepted: false, reason: "confidence-below-95", taxonKey: null, canonicalName, confidence };
  }
  if (result.usage?.rank !== "SPECIES") {
    return { accepted: false, reason: "matched-rank-not-species", taxonKey: null, canonicalName, confidence };
  }
  if (canonicalName?.toLocaleLowerCase("en-US") !== scientificName.toLocaleLowerCase("en-US")) {
    return { accepted: false, reason: "canonical-name-differs", taxonKey: null, canonicalName, confidence };
  }
  if (result.synonym === true || result.usage?.status !== "ACCEPTED") {
    return { accepted: false, reason: "matched-usage-not-accepted", taxonKey: null, canonicalName, confidence };
  }
  if (!key || !/^[1-9][0-9]*$/u.test(key) || Number(key) > Number.MAX_SAFE_INTEGER) {
    return { accepted: false, reason: "non-numeric-backbone-key", taxonKey: null, canonicalName, confidence };
  }
  return { accepted: true, reason: "accepted", taxonKey: Number(key), canonicalName, confidence };
}

async function readBounded(response: Response, label: string) {
  assert(response.body, `${label} response lacks a body.`);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.length;
      assert(bytes <= MAX_RESPONSE_BYTES, `${label} response exceeds ${MAX_RESPONSE_BYTES} bytes.`);
      chunks.push(Buffer.from(next.value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes);
}

async function getMetadata() {
  const response = await fetch(METADATA_URL, {
    headers: { Accept: "application/json", "User-Agent": "Project-Isitusa/gbif-taxonomy-v2" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assert(response.status === 200, `GBIF taxonomy metadata returned HTTP ${response.status}.`);
  const bytes = await readBounded(response, "GBIF taxonomy metadata");
  const parsed = JSON.parse(bytes.toString("utf8")) as {
    created?: string;
    mainIndex?: { datasetAlias?: string; datasetKey?: string; clbDatasetKey?: string };
  };
  assert(
    parsed.mainIndex?.datasetAlias === "GBIF" &&
      typeof parsed.mainIndex.datasetKey === "string" &&
      typeof parsed.mainIndex.clbDatasetKey === "string" &&
      typeof parsed.created === "string",
    "GBIF taxonomy metadata does not identify the default GBIF Backbone index.",
  );
  return { bytes, parsed };
}

function equivalentGetUrl(scientificName: string) {
  const url = new URL(MATCH_URL);
  url.searchParams.set("scientificName", scientificName);
  url.searchParams.set("taxonRank", "SPECIES");
  url.searchParams.set("strict", "true");
  return url.toString();
}

function writeAtomically(filepath: string, contents: string) {
  const temporary = path.join(path.dirname(filepath), `.${path.basename(filepath)}.tmp`);
  if (existsSync(temporary)) unlinkSync(temporary);
  writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx" });
  renameSync(temporary, filepath);
}

async function main() {
  const root = process.cwd();
  const options = getArgs(process.argv.slice(2));
  assert(/^[a-z0-9][a-z0-9-]*$/u.test(options.cacheId), "--cache-id is invalid.");
  const outputPath = repositoryPath(root, options.output, "Taxonomy cache output");
  const evaluationPath = repositoryPath(root, options.evaluationOutput, "Taxonomy evaluation output");
  assert(!existsSync(outputPath) && !existsSync(evaluationPath), "GBIF taxonomy acquisition refuses to overwrite an existing artifact.");
  assertClean(root);
  const baselineCommit = currentHead(root);

  const species = readJson<Species[]>(path.join(root, "src/data/generated/species.json"));
  const countyShards: CountyShard[] = [];
  const matrixHash = createHash("sha256");
  for (const stateCode of [
    "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS", "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV", "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY",
  ]) {
    for (const county of listCountyEquivalents(stateCode)) {
      const relative = `public/generated/research/${stateCode}/counties/${county.countyFips}.json`;
      const filepath = path.join(root, relative);
      const bytes = readFileSync(filepath);
      matrixHash.update(relative).update("\0").update(bytes).update("\0");
      const shard = JSON.parse(bytes.toString("utf8")) as CountyShard;
      assert(shard.stateCode === stateCode && shard.countyFips === county.countyFips, `County shard identity differs at ${relative}.`);
      countyShards.push(shard);
    }
  }
  assert(countyShards.length === 3144, `Expected 3144 county shards, found ${countyShards.length}.`);
  const ranked = rankCandidateSpecies({ species, countyShards });
  const candidates = ranked.slice(0, options.candidateLimit);
  assert(candidates.at(-1)!.notResearchedPairs > 0, "Candidate limit extends beyond all remaining not-researched species.");
  const request = candidates.map((candidate) => ({
    scientificName: candidate.scientificName,
    taxonRank: "SPECIES",
    strict: true,
  }));
  const requestContents = stableJson(request);

  const metadataBefore = await getMetadata();
  const response = await fetch(MATCH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Project-Isitusa/gbif-taxonomy-v2",
    },
    body: requestContents,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  assert(response.status === 200, `GBIF taxonomy batch returned HTTP ${response.status}.`);
  const responseBytes = await readBounded(response, "GBIF taxonomy batch");
  const results = JSON.parse(responseBytes.toString("utf8")) as V2MatchResult[];
  assert(Array.isArray(results) && results.length === candidates.length, "GBIF taxonomy batch result count differs from the request.");
  const metadataAfter = await getMetadata();
  assert(
    metadataBefore.parsed.created === metadataAfter.parsed.created &&
      metadataBefore.parsed.mainIndex?.datasetKey === metadataAfter.parsed.mainIndex?.datasetKey &&
      metadataBefore.parsed.mainIndex?.clbDatasetKey === metadataAfter.parsed.mainIndex?.clbDatasetKey,
    "GBIF taxonomy index identity changed during the batch request.",
  );
  assertClean(root);
  assert(currentHead(root) === baselineCommit, "Repository HEAD changed during GBIF taxonomy acquisition.");

  const decisions = candidates.map((candidate, index) => ({
    candidate,
    index,
    result: results[index]!,
    decision: classifyV2Match(candidate.scientificName, results[index]!),
  }));
  const speciesByKey = new Map<number, string[]>();
  for (const item of decisions) {
    if (!item.decision.accepted || item.decision.taxonKey === null) continue;
    speciesByKey.set(item.decision.taxonKey, [...(speciesByKey.get(item.decision.taxonKey) ?? []), item.candidate.id]);
  }
  for (const item of decisions) {
    if (
      item.decision.accepted &&
      item.decision.taxonKey !== null &&
      (speciesByKey.get(item.decision.taxonKey)?.length ?? 0) > 1
    ) {
      item.decision = { ...item.decision, accepted: false, reason: "duplicate-backbone-key" };
    }
  }
  const completedAt = new Date().toISOString();
  const matrixDigestSha256 = matrixHash.digest("hex");
  const batchRequestSha256 = sha256(requestContents);
  const batchResponseSha256 = sha256(responseBytes);
  const metadataSha256 = sha256(metadataBefore.bytes);
  const accepted = decisions.filter((item) => item.decision.accepted);
  const rejected = decisions.filter((item) => !item.decision.accepted);
  assert(accepted.length > 0, "GBIF taxonomy batch produced no accepted exact matches.");
  const entries = accepted.map((item) => {
    const body = stableJson(item.result);
    return {
      speciesId: item.candidate.id,
      scientificName: item.candidate.scientificName,
      requestUrl: equivalentGetUrl(item.candidate.scientificName),
      status: 200,
      retrievedAt: completedAt,
      responseBodyBase64: Buffer.from(body).toString("base64"),
      responseBodySha256: sha256(body),
      provenance: {
        baselineCommit,
        matrixDigestSha256,
        matcherMetadataSha256: metadataSha256,
        batchRequestSha256,
        batchResponseSha256,
        responseIndex: item.index,
      },
    };
  }).sort((left, right) => compareText(left.speciesId, right.speciesId));
  const cache = {
    schemaVersion: 2,
    cacheId: options.cacheId,
    createdAt: completedAt,
    sourceId: "gbif-preserved-specimens",
    taxonomyApiVersion: "v2",
    taxonomyMode: "gbif-backbone-v2-exact-match-retained-identifiers",
    checklistKey: null,
    matcher: {
      matchUrl: MATCH_URL,
      metadataUrl: METADATA_URL,
      metadataSha256,
      created: metadataBefore.parsed.created,
      datasetAlias: metadataBefore.parsed.mainIndex!.datasetAlias,
      datasetKey: metadataBefore.parsed.mainIndex!.datasetKey,
      clbDatasetKey: metadataBefore.parsed.mainIndex!.clbDatasetKey,
    },
    acquisition: {
      startedAt: options.startedAt,
      completedAt,
      method: "POST",
      requestCount: 1,
      retryCount: 0,
      requestBodySha256: batchRequestSha256,
      responseBodySha256: batchResponseSha256,
      responseBytes: responseBytes.length,
      responseBodyBase64: responseBytes.toString("base64"),
      metadataRequests: 2,
    },
    candidatePolicy: {
      baselineCommit,
      matrixDigestSha256,
      activeCountyCount: countyShards.length,
      catalogSpeciesCount: species.length,
      candidateLimit: options.candidateLimit,
      order: "descending not-researched county count, then species ID by code point",
      acceptance: "EXACT confidence >= 95, SPECIES rank, exact canonical name, accepted non-synonym usage, unique positive numeric default-GBIF-Backbone key",
    },
    counts: {
      candidates: candidates.length,
      accepted: entries.length,
      rejected: rejected.length,
      grossCandidatePairs: candidates.reduce((sum, item) => sum + item.grossPairs, 0),
      acceptedNotResearchedPairs: accepted.reduce((sum, item) => sum + item.candidate.notResearchedPairs, 0),
    },
    entries,
    rejections: rejected.map((item) => ({
      speciesId: item.candidate.id,
      scientificName: item.candidate.scientificName,
      responseIndex: item.index,
      reason: item.decision.reason,
      canonicalName: item.decision.canonicalName,
      confidence: item.decision.confidence,
      taxonKey: item.decision.taxonKey,
    })).sort((left, right) => compareText(left.speciesId, right.speciesId)),
  };
  const cacheContents = stableJson(cache);
  const cacheSchema = JSON.parse(readFileSync(
    path.join(root, "src/data/research/schemas/gbif-taxonomy-cache-v2.schema.json"),
    "utf8",
  )) as Parameters<typeof z.fromJSONSchema>[0];
  z.fromJSONSchema(cacheSchema).parse(cache);
  const evaluation = {
    schemaVersion: 1,
    evaluationId: path.basename(evaluationPath, ".json"),
    evaluatedAt: completedAt,
    baselineCommit,
    cachePath: path.relative(root, outputPath).replaceAll("\\", "/"),
    cacheSha256: sha256(cacheContents),
    cacheBytes: Buffer.byteLength(cacheContents),
    matrixDigestSha256,
    matcherMetadataSha256: metadataSha256,
    matcherDatasetKey: metadataBefore.parsed.mainIndex!.datasetKey,
    matcherCreated: metadataBefore.parsed.created,
    network: {
      metadataGets: 2,
      batchPosts: 1,
      batchPostRetries: 0,
      authenticatedRequests: 0,
      occurrenceDownloadRequests: 0,
    },
    counts: cache.counts,
    candidateBoundary: {
      first: candidates[0],
      last: candidates.at(-1),
    },
    evidenceSemantics: {
      taxonomyOnly: true,
      createsCountyEvidence: false,
      createsAbsence: false,
      createsNotDetected: false,
      authorizesOccurrenceAcquisitionByItself: false,
    },
    result: "complete-exact-gbif-backbone-v2-taxonomy-cache",
  };
  const evaluationContents = stableJson(evaluation);
  writeAtomically(outputPath, cacheContents);
  try {
    writeAtomically(evaluationPath, evaluationContents);
  } catch (error) {
    unlinkSync(outputPath);
    throw error;
  }
  process.stdout.write(stableJson({
    outputPath: evaluation.cachePath,
    cacheSha256: evaluation.cacheSha256,
    cacheBytes: evaluation.cacheBytes,
    ...cache.counts,
    matrixDigestSha256,
  }));
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
