import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadGbifTaxonomyCache } from "./research/gbif-taxonomy-cache";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const root = mkdtempSync(path.join(tmpdir(), "isitusa-gbif-taxonomy-cache-"));
  try {
  const response = Buffer.from('{"usageKey":123,"matchType":"EXACT","confidence":100}');
  const sourceVerification = Buffer.from('{"runId":"test-run","sourceId":"gbif-preserved-specimens"}');
  writeFileSync(path.join(root, "source-verification.json"), sourceVerification);
  writeFileSync(path.join(root, "artifact.json"), response);
  const cachePath = path.join(root, "cache.json");
  writeFileSync(cachePath, `${JSON.stringify({
    schemaVersion: 1,
    cacheId: "test-cache",
    createdAt: "2026-08-07T00:00:00.000Z",
    sourceId: "gbif-preserved-specimens",
    compatibleAdapterVersions: ["1.3.1"],
    entries: [{
      speciesId: "test-species",
      scientificName: "Test species",
      requestUrl: "https://api.gbif.org/v1/species/match?name=Test+species&rank=SPECIES&strict=true",
      status: 200,
      retrievedAt: "2026-08-07T00:00:00.000Z",
      responseBodyBase64: response.toString("base64"),
      responseBodySha256: createHash("sha256").update(response).digest("hex"),
      provenance: {
        runId: "test-run",
        codeCommit: "a".repeat(40),
        adapterVersion: "1.3.1",
        sourceVerificationPath: "source-verification.json",
        sourceVerificationSha256: createHash("sha256").update(sourceVerification).digest("hex"),
        artifactPath: "artifact.json",
        artifactSha256: createHash("sha256").update(response).digest("hex"),
        artifactBytes: response.length,
      },
    }],
  }, null, 2)}\n`);
  const replay = loadGbifTaxonomyCache({
    repositoryRoot: root,
    cachePath,
    adapterVersion: "1.3.1",
    expectedSpecies: [{ speciesId: "test-species", scientificName: "Test species" }],
  });
  const url = replay.selectedEntries[0]?.requestUrl ?? "";
  assert(replay.has(url), "The selected taxonomy response was not addressable by URL.");
    const restored = await replay.response(url).text();
    assert(restored === response.toString("utf8"), "The cached response bytes changed.");
    console.log(JSON.stringify({ cacheId: replay.cacheId, selected: replay.selectedEntries.length }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
