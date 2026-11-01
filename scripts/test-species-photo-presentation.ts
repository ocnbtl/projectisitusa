import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { getDisplaySpecies, PHOTO_REVIEW_HOLDS, PHOTO_PROVENANCE_HOLDS, VERIFIED_PHOTO_REPLACEMENTS } from "../src/lib/ui/species-editorial";
import { approvedSpeciesDisplayName } from "../src/lib/data/species-display-name";
import type { Species } from "../src/lib/data/types";

const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const folder = "ops/national-research/ui-work/species-detail-polish-20261028/";
const followup = "ops/national-research/ui-work/photo-followup-20261028/";
const provenance = [...read(folder + "photo-provenance.json"), ...read(followup + "photo-provenance.json")];
const outcomes = read(folder + "photo-outcomes.json");
const followupOutcomes = read(followup + "photo-outcomes.json");
const additions = read("src/content/species-photo-additions.json");
const catalog: Species[] = read("src/data/generated/species.json");
const originalHolds = new Set<string>(read("src/content/species-photo-review.json").holds);
assert.match(VERIFIED_PHOTO_REPLACEMENTS["salix-x-sepulcralis"].credit, /Copyright 2007 Jeffrey O\. Gustafson/);
assert.match(VERIFIED_PHOTO_REPLACEMENTS["brachypeplus-basalis"].credit, /© unmotivated_frog/);
assert.match(VERIFIED_PHOTO_REPLACEMENTS["ovachlamys-fulgens"].credit, /cropped 1:1/);
assert.equal(VERIFIED_PHOTO_REPLACEMENTS["ovachlamys-fulgens"].license, "https://creativecommons.org/licenses/by/3.0/us/deed.en");
for (const [id, replacement] of Object.entries(VERIFIED_PHOTO_REPLACEMENTS)) {
  assert.ok(catalog.some(species => species.id === id), `Known replacement species: ${id}`);
  assert.ok(originalHolds.has(id), `Replacement is scoped to a reviewed original-image hold: ${id}`);
  assert.ok(!PHOTO_PROVENANCE_HOLDS.has(id), `Verified replacement is displayed: ${id}`);
  assert.match(replacement.sourceUrl ?? "", /^https:\/\//);
  assert.ok(replacement.credit && replacement.license && replacement.alt, `Complete photo attribution: ${id}`);
  for (const asset of [replacement.src, replacement.thumbnail].filter(Boolean)) {
    const url = new URL(asset!);
    assert.equal(url.protocol, "https:");
    assert.ok(["upload.wikimedia.org", "thumb.wikimedia.org", "inaturalist-open-data.s3.amazonaws.com"].includes(url.hostname));
    if (url.hostname === "inaturalist-open-data.s3.amazonaws.com") {
      const photoId = url.pathname.match(/^\/photos\/(\d+)\//)?.[1];
      assert.ok(photoId);
      assert.equal(replacement.sourceUrl, `https://www.inaturalist.org/photos/${photoId}`);
    }
  }
}
const missing = catalog.filter(s => !s.image || PHOTO_REVIEW_HOLDS.has(s.id));
assert.equal(outcomes.length, missing.length);
assert.deepEqual(new Set(outcomes.map((x: { id: string }) => x.id)), new Set(missing.map(s => s.id)));
assert.equal(new Set(provenance.map((x: { id: string }) => x.id)).size, provenance.length);
assert.equal(Object.keys(additions).length, provenance.length);
assert.deepEqual(new Set(followupOutcomes.map((x: { id: string }) => x.id)), new Set(outcomes.filter((x: { outcome: string }) => x.outcome === "unresolved").map((x: { id: string }) => x.id)));
for (const outcome of followupOutcomes) {
  assert.equal(Boolean(additions[outcome.id]), outcome.outcome === "published");
}
const credits = read("src/content/species-photo-credits.json");
const legacy = read(followup + "legacy-resolutions.json");
assert.equal(legacy.length, 6);
for (const resolution of legacy) {
  const image = additions[resolution.id] ?? credits[resolution.id];
  assert.match(image.sourceUrl, /^https:\/\//);
  assert.ok(image.credit && image.license);
}
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
  if (p.thumbnailSha256) assert.equal(createHash("sha256").update(readFileSync("public" + p.thumbnail)).digest("hex"), p.thumbnailSha256);
  assert.equal(additions[p.id].sourceUrl, p.sourceUrl);
}
for (const species of catalog) {
  const before = JSON.stringify(species);
  const display = getDisplaySpecies(species);
  assert.equal(JSON.stringify(species), before, "Presentation must not mutate catalog evidence");
  const { image: originalImage, ...originalFacts } = species;
  const { image: displayedImage, ...displayedFacts } = display;
  assert.deepEqual(displayedFacts, { ...originalFacts, commonName: approvedSpeciesDisplayName(species.id, species.scientificName, species.commonName) }, "Photo changes must preserve all species facts and approved naming corrections");
  if (VERIFIED_PHOTO_REPLACEMENTS[species.id]) assert.deepEqual(displayedImage, VERIFIED_PHOTO_REPLACEMENTS[species.id]);
  else if (PHOTO_PROVENANCE_HOLDS.has(species.id)) assert.equal(displayedImage, undefined);
  else if (additions[species.id]) assert.deepEqual(displayedImage, additions[species.id]);
  else if (PHOTO_REVIEW_HOLDS.has(species.id)) assert.equal(displayedImage, undefined);
  else assert.equal(displayedImage?.src, originalImage?.src);
}
console.log(`Photo checks passed: ${missing.length} historical gaps audited, ${provenance.length} original additions preserved, ${Object.keys(VERIFIED_PHOTO_REPLACEMENTS).length} verified replacements, ${PHOTO_PROVENANCE_HOLDS.size} active holds; all catalog facts preserved.`);
