import assert from "node:assert/strict";
import fs from "node:fs";
import { getRegistryReference } from "../src/lib/data/species-registry-reference";
const species = JSON.parse(fs.readFileSync("src/data/generated/species.json", "utf8"));
let migrated = 0;
for (const row of species) {
  const original = row.registry?.authorityUrl;
  if (!original) continue;
  const before = JSON.stringify(row);
  const result = getRegistryReference(original);
  if (original.startsWith("https://plants.usda.gov/home/plantProfile?symbol=")) {
    const symbol = new URL(original).searchParams.get("symbol");
    assert.equal(result.url, `https://plants.sc.egov.usda.gov/plant-profile/${symbol}`);
    migrated += 1;
  }
  assert.equal(JSON.stringify(row), before, "Source provenance must remain untouched");
  if (result.url) assert.match(result.url, /^https?:\/\//);
}
assert.equal(migrated, 1517);
assert.deepEqual(getRegistryReference("https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_hovu.pdf"), { url: "https://plants.usda.gov/DocumentLibrary/plantguide/pdf/pg_hovu.pdf" });
assert.deepEqual(getRegistryReference("https://plants.usda.gov.evil.example/home/plantProfile?symbol=NADO"), { url: "https://plants.usda.gov.evil.example/home/plantProfile?symbol=NADO" });
assert.equal(getRegistryReference("javascript:alert(1)").url, null);
assert.equal(getRegistryReference("not a URL").url, null);
console.log(`Registry reference checks passed: ${migrated} same-symbol USDA migrations; source facts preserved.`);
