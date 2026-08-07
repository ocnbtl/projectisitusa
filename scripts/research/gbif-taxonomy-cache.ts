import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

export type GbifTaxonomyCacheEntry = {
  speciesId: string;
  scientificName: string;
  requestUrl: string;
  status: 200;
  retrievedAt: string;
  responseBodyBase64: string;
  responseBodySha256: string;
  provenance: {
    runId: string;
    codeCommit: string;
    adapterVersion: string;
    sourceVerificationPath: string;
    sourceVerificationSha256: string;
    artifactPath: string;
    artifactSha256: string;
    artifactBytes: number;
  };
};

type GbifTaxonomyCache = {
  schemaVersion: 1;
  cacheId: string;
  createdAt: string;
  sourceId: "gbif-preserved-specimens";
  compatibleAdapterVersions: string[];
  entries: GbifTaxonomyCacheEntry[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function speciesMatchUrl(scientificName: string) {
  const url = new URL("https://api.gbif.org/v1/species/match");
  url.searchParams.set("name", scientificName);
  url.searchParams.set("rank", "SPECIES");
  url.searchParams.set("strict", "true");
  return url.toString();
}

export function loadGbifTaxonomyCache(input: {
  repositoryRoot: string;
  cachePath: string;
  adapterVersion: string;
  expectedSpecies: Array<{ speciesId: string; scientificName: string }>;
}) {
  const root = path.resolve(input.repositoryRoot);
  const cachePath = path.resolve(input.cachePath);
  assert(
    cachePath.startsWith(`${root}${path.sep}`),
    "The GBIF taxonomy cache must remain inside the repository.",
  );
  const bytes = readFileSync(cachePath);
  const cache = JSON.parse(bytes.toString("utf8")) as GbifTaxonomyCache;
  assert(
    cache.schemaVersion === 1 &&
      cache.sourceId === "gbif-preserved-specimens" &&
      cache.cacheId.length > 0 &&
      !Number.isNaN(Date.parse(cache.createdAt)),
    "The GBIF taxonomy cache header is invalid.",
  );
  assert(
    cache.compatibleAdapterVersions.includes(input.adapterVersion),
    `GBIF taxonomy cache ${cache.cacheId} is not compatible with adapter ${input.adapterVersion}.`,
  );
  const bySpecies = new Map<string, GbifTaxonomyCacheEntry>();
  const byUrl = new Map<string, GbifTaxonomyCacheEntry>();
  for (const entry of cache.entries) {
    assert(
      /^[a-z0-9][a-z0-9-]*$/u.test(entry.speciesId) &&
        entry.scientificName.length > 0 &&
        entry.status === 200 &&
        !Number.isNaN(Date.parse(entry.retrievedAt)),
      `GBIF taxonomy cache ${cache.cacheId} contains an invalid entry.`,
    );
    assert(!bySpecies.has(entry.speciesId), `Duplicate cached species ${entry.speciesId}.`);
    assert(!byUrl.has(entry.requestUrl), `Duplicate cached request URL ${entry.requestUrl}.`);
    assert(
      entry.requestUrl === speciesMatchUrl(entry.scientificName),
      `Cached request URL changed for ${entry.speciesId}.`,
    );
    const body = Buffer.from(entry.responseBodyBase64, "base64");
    assert(body.length > 0, `Cached response is empty for ${entry.speciesId}.`);
    assert(
      sha256(body) === entry.responseBodySha256,
      `Cached response hash changed for ${entry.speciesId}.`,
    );
    JSON.parse(body.toString("utf8"));
    assert(
      /^[a-f0-9]{40}$/u.test(entry.provenance.codeCommit) &&
        /^[a-f0-9]{64}$/u.test(entry.provenance.sourceVerificationSha256) &&
        /^[a-f0-9]{64}$/u.test(entry.provenance.artifactSha256) &&
        Number.isInteger(entry.provenance.artifactBytes) &&
        entry.provenance.artifactBytes > 0,
      `Cached provenance is invalid for ${entry.speciesId}.`,
    );
    const sourceVerificationPath = path.resolve(root, entry.provenance.sourceVerificationPath);
    const artifactPath = path.resolve(root, entry.provenance.artifactPath);
    for (const [label, provenancePath] of [
      ["source verification", sourceVerificationPath],
      ["artifact", artifactPath],
    ] as const) {
      assert(
        provenancePath.startsWith(`${root}${path.sep}`),
        `Cached ${label} provenance escapes the repository for ${entry.speciesId}.`,
      );
    }
    const sourceVerificationBytes = readFileSync(sourceVerificationPath);
    assert(
      sha256(sourceVerificationBytes) === entry.provenance.sourceVerificationSha256,
      `Cached source-verification provenance changed for ${entry.speciesId}.`,
    );
    const sourceVerification = JSON.parse(sourceVerificationBytes.toString("utf8")) as {
      runId?: string;
      sourceId?: string;
    };
    assert(
      sourceVerification.runId === entry.provenance.runId &&
        sourceVerification.sourceId === "gbif-preserved-specimens",
      `Cached source-verification identity changed for ${entry.speciesId}.`,
    );
    const artifactBytes = readFileSync(artifactPath);
    assert(
      artifactBytes.length === entry.provenance.artifactBytes &&
        sha256(artifactBytes) === entry.provenance.artifactSha256,
      `Cached taxonomy artifact provenance changed for ${entry.speciesId}.`,
    );
    const artifactBody = entry.provenance.artifactPath.endsWith(".gz")
      ? gunzipSync(artifactBytes)
      : artifactBytes;
    assert(
      artifactBody.equals(body),
      `Cached response differs from its verified artifact for ${entry.speciesId}.`,
    );
    bySpecies.set(entry.speciesId, entry);
    byUrl.set(entry.requestUrl, entry);
  }

  const missingSpecies: Array<{ speciesId: string; scientificName: string }> = [];
  const selected = input.expectedSpecies.flatMap((species) => {
    const entry = bySpecies.get(species.speciesId);
    if (!entry) {
      missingSpecies.push(species);
      return [];
    }
    assert(
      entry.scientificName === species.scientificName &&
        entry.requestUrl === speciesMatchUrl(species.scientificName),
      `GBIF taxonomy cache identity changed for ${species.speciesId}.`,
    );
    return [entry];
  });
  assert(
    new Set(selected.map((entry) => entry.speciesId)).size === selected.length,
    "The requested GBIF taxonomy-cache scope contains duplicate species.",
  );
  const selectedByUrl = new Map(selected.map((entry) => [entry.requestUrl, entry]));

  return {
    cacheId: cache.cacheId,
    cachePath,
    cacheSha256: sha256(bytes),
    selectedEntries: selected.map((entry) => ({
      speciesId: entry.speciesId,
      scientificName: entry.scientificName,
      requestUrl: entry.requestUrl,
      retrievedAt: entry.retrievedAt,
      responseBodySha256: entry.responseBodySha256,
      provenance: entry.provenance,
    })),
    missingSpecies,
    has(url: string) {
      return selectedByUrl.has(url);
    },
    response(url: string) {
      const entry = selectedByUrl.get(url);
      assert(entry, `No selected GBIF taxonomy cache entry matches ${url}.`);
      return new Response(Buffer.from(entry.responseBodyBase64, "base64"), {
        status: entry.status,
        headers: {
          "Content-Type": "application/json",
          "X-Isitusa-Cache": cache.cacheId,
        },
      });
    },
  };
}
