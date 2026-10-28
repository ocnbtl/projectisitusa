import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { getDisplaySpecies, PHOTO_REVIEW_HOLDS } from "../src/lib/ui/species-editorial";
import type { Species } from "../src/lib/data/types";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const folder = "ops/national-research/ui-work/species-detail-polish-20261028/";
const provenance = read(folder + "photo-provenance.json");
const outcomes = read(folder + "photo-outcomes.json");
const additions = read("src/content/species-photo-additions.json");
const catalog: Species[] = read("src/data/generated/species.json");
const missing = catalog.filter(s => !s.image || PHOTO_REVIEW_HOLDS.has(s.id));
assert.equal(outcomes.length, missing.length);
assert.deepEqual(new Set(outcomes.map((x: { id: string }) => x.id)), new Set(missing.map(s => s.id)));
assert.equal(new Set(provenance.map((x: { id: string }) => x.id)).size, provenance.length);
assert.equal(Object.keys(additions).length, provenance.length);
for (const p of provenance) {
  assert.equal(p.visualReview, "approved");
  assert.ok(["cc0", "cc-by", "cc-by-sa", "public-domain"].includes(p.license));
  assert.match(p.sourceUrl, /^https:\/\//);
  assert.ok(p.credit && p.changes);
  for (const asset of [p.src, p.thumbnail]) {
    assert.match(asset, /^\/species-photos\/[a-z0-9-]+\.webp$/);
    assert.ok(existsSync("public" + asset), asset);
  }
  assert.equal(createHash("sha256").update(readFileSync("public" + p.src)).digest("hex"), p.outputSha256);
  assert.equal(additions[p.id].sourceUrl, p.sourceUrl);
}
for (const species of catalog) {
  const before = JSON.stringify(species);
  const display = getDisplaySpecies(species);
  assert.equal(JSON.stringify(species), before, "Presentation must not mutate catalog evidence");
  const { image: originalImage, ...originalFacts } = species;
  const { image: displayedImage, ...displayedFacts } = display;
  assert.deepEqual(displayedFacts, originalFacts, "Photo changes must preserve all species facts");
  if (additions[species.id]) assert.deepEqual(displayedImage, additions[species.id]);
  else if (PHOTO_REVIEW_HOLDS.has(species.id)) assert.equal(displayedImage, undefined);
  else assert.equal(displayedImage?.src, originalImage?.src);
}
console.log(`Photo checks passed: ${missing.length} gaps audited, ${provenance.length} approved images, all catalog facts preserved.`);
