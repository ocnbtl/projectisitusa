import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  GbifTaxonomyCacheEntry,
  loadGbifTaxonomyCache,
} from "./gbif-taxonomy-cache";

type CacheFile = {
  schemaVersion: 1;
  cacheId: string;
  createdAt: string;
  sourceId: "gbif-preserved-specimens";
  compatibleAdapterVersions: string[];
  missingSpecies?: string[];
  entries: GbifTaxonomyCacheEntry[];
};

type Species = { id: string; scientificName: string };

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJson<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function mergeGbifTaxonomyCaches(input: {
  repositoryRoot: string;
  inputPaths: string[];
  outputPath: string;
  cacheId: string;
  createdAt: string;
}) {
  const root = path.resolve(input.repositoryRoot);
  const outputPath = path.resolve(input.outputPath);
  assert(outputPath.startsWith(`${root}${path.sep}`), "The merged GBIF taxonomy cache must remain in the repository.");
  assert(input.inputPaths.length > 0, "At least one GBIF taxonomy cache is required.");
  assert(/^[a-z0-9][a-z0-9-]*$/u.test(input.cacheId), "The merged GBIF taxonomy cache ID is invalid.");
  const createdAt = new Date(input.createdAt).toISOString();
  const species = readJson<Species[]>(path.join(root, "src/data/generated/species.json"));
  const scientificNameById = new Map(species.map((entry) => [entry.id, entry.scientificName]));
  const selected = new Map<string, { entry: GbifTaxonomyCacheEntry; inputPath: string }>();
  const inputHashes: Record<string, string> = {};

  for (const unresolvedPath of [...new Set(input.inputPaths)].sort(compareText)) {
    const inputPath = path.resolve(unresolvedPath);
    assert(inputPath.startsWith(`${root}${path.sep}`), "An input GBIF taxonomy cache escapes the repository.");
    assert(inputPath !== outputPath, "The merged cache cannot also be an input cache.");
    const relativePath = path.relative(root, inputPath).replaceAll("\\", "/");
    const bytes = readFileSync(inputPath);
    const cache = JSON.parse(bytes.toString("utf8")) as CacheFile;
    assert(
      cache.schemaVersion === 1 &&
        cache.sourceId === "gbif-preserved-specimens" &&
        cache.compatibleAdapterVersions.includes("1.3.1") &&
        Array.isArray(cache.entries),
      `Invalid GBIF taxonomy cache header at ${relativePath}.`,
    );
    const expectedSpecies = cache.entries.map((entry) => {
      const scientificName = scientificNameById.get(entry.speciesId);
      assert(scientificName === entry.scientificName, `Catalog identity changed for ${entry.speciesId}.`);
      return { speciesId: entry.speciesId, scientificName };
    });
    const verified = loadGbifTaxonomyCache({
      repositoryRoot: root,
      cachePath: inputPath,
      adapterVersion: "1.3.1",
      expectedSpecies,
    });
    assert(verified.missingSpecies.length === 0, `Verified cache ${relativePath} unexpectedly lacks an entry.`);
    assert(verified.selectedEntries.length === cache.entries.length, `Verified cache ${relativePath} entry count changed.`);
    inputHashes[relativePath] = sha256(bytes);
    for (const entry of cache.entries) {
      const previous = selected.get(entry.speciesId);
      if (!previous) {
        selected.set(entry.speciesId, { entry, inputPath: relativePath });
        continue;
      }
      const currentTime = Date.parse(entry.retrievedAt);
      const previousTime = Date.parse(previous.entry.retrievedAt);
      if (currentTime === previousTime && entry.responseBodySha256 !== previous.entry.responseBodySha256) {
        throw new Error(`Conflicting same-time GBIF taxonomy responses for ${entry.speciesId}.`);
      }
      if (currentTime > previousTime || (currentTime === previousTime && compareText(relativePath, previous.inputPath) < 0)) {
        selected.set(entry.speciesId, { entry, inputPath: relativePath });
      }
    }
  }

  const entries = [...selected.values()].map((value) => value.entry).sort((left, right) => compareText(left.speciesId, right.speciesId));
  const usageKeys = new Map<number, string>();
  for (const entry of entries) {
    const body = JSON.parse(Buffer.from(entry.responseBodyBase64, "base64").toString("utf8")) as {
      usageKey?: number;
      matchType?: string;
      confidence?: number;
      canonicalName?: string;
    };
    assert(Number.isInteger(body.usageKey), `GBIF taxonomy entry ${entry.speciesId} lacks a usage key.`);
    assert(body.matchType === "EXACT" && (body.confidence ?? 0) >= 95, `GBIF taxonomy entry ${entry.speciesId} is not an exact high-confidence match.`);
    assert(body.canonicalName?.toLocaleLowerCase("en-US") === entry.scientificName.toLocaleLowerCase("en-US"), `GBIF canonical name changed for ${entry.speciesId}.`);
    const duplicateSpecies = usageKeys.get(body.usageKey!);
    assert(!duplicateSpecies, `GBIF usage key ${body.usageKey} is shared by ${duplicateSpecies} and ${entry.speciesId}.`);
    usageKeys.set(body.usageKey!, entry.speciesId);
  }

  const cache: CacheFile = {
    schemaVersion: 1,
    cacheId: input.cacheId,
    createdAt,
    sourceId: "gbif-preserved-specimens",
    compatibleAdapterVersions: ["1.3.1"],
    missingSpecies: [],
    entries,
  };
  const contents = `${JSON.stringify(cache, null, 2)}\n`;
  writeFileSync(outputPath, contents, { flag: "wx" });
  const verifiedOutput = loadGbifTaxonomyCache({
    repositoryRoot: root,
    cachePath: outputPath,
    adapterVersion: "1.3.1",
    expectedSpecies: entries.map((entry) => ({ speciesId: entry.speciesId, scientificName: entry.scientificName })),
  });
  assert(verifiedOutput.missingSpecies.length === 0 && verifiedOutput.selectedEntries.length === entries.length, "Merged GBIF taxonomy cache verification failed.");
  return {
    outputPath: path.relative(root, outputPath).replaceAll("\\", "/"),
    cacheId: input.cacheId,
    cacheSha256: sha256(contents),
    bytes: Buffer.byteLength(contents),
    entries: entries.length,
    sourceRuns: new Set(entries.map((entry) => entry.provenance.runId)).size,
    inputHashes,
  };
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    const name = key.slice(2);
    values.set(name, [...(values.get(name) ?? []), value]);
  }
  const required = (name: string) => {
    const value = values.get(name)?.at(-1);
    assert(value, `--${name} is required.`);
    return value;
  };
  return {
    inputPaths: values.get("input") ?? [],
    outputPath: required("output"),
    cacheId: required("cache-id"),
    createdAt: required("created-at"),
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const options = parseArgs(process.argv.slice(2));
  const result = mergeGbifTaxonomyCaches({ repositoryRoot: process.cwd(), ...options });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
