import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { mergeGbifTaxonomyCaches } from "./research/merge-gbif-taxonomy-caches";

type Cache = {
  entries: Array<{ speciesId: string; retrievedAt: string; responseBodySha256: string }>;
};

const root = process.cwd();
const inputPaths = [
  path.join(root, "src/data/research/caches/gbif-taxonomy-20260808-r54.json"),
  path.join(root, "src/data/research/caches/gbif-taxonomy-20260809-r55.json"),
];
const temporaryRoot = mkdtempSync(path.join(root, ".cache/research/test-gbif-cache-merge-"));
try {
  const outputPath = path.join(temporaryRoot, "gbif-taxonomy-test-merge.json");
  const result = mergeGbifTaxonomyCaches({
    repositoryRoot: root,
    inputPaths,
    outputPath,
    cacheId: "gbif-taxonomy-test-merge",
    createdAt: "2026-08-18T00:00:00.000Z",
  });
  const inputs = inputPaths.map((inputPath) => JSON.parse(readFileSync(inputPath, "utf8")) as Cache);
  const expectedLatest = new Map<string, Cache["entries"][number]>();
  for (const input of inputs) {
    for (const entry of input.entries) {
      const previous = expectedLatest.get(entry.speciesId);
      if (!previous || Date.parse(entry.retrievedAt) > Date.parse(previous.retrievedAt)) expectedLatest.set(entry.speciesId, entry);
    }
  }
  const merged = JSON.parse(readFileSync(outputPath, "utf8")) as Cache;
  assert.equal(result.entries, expectedLatest.size);
  assert.equal(merged.entries.length, expectedLatest.size);
  for (const entry of merged.entries) {
    assert.equal(entry.responseBodySha256, expectedLatest.get(entry.speciesId)?.responseBodySha256);
  }
  process.stdout.write(`${JSON.stringify({ entries: result.entries, sha256: result.cacheSha256 })}\n`);
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
