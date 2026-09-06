import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { retainZipResponse, taxonomyReferenceRegistrySchema, validateAcquisitionId, validateZipEntryNames } from "./research/acquire-taxonomy-reference";

async function main() {
  const registry = JSON.parse(readFileSync("src/data/research/taxonomy-reference-registry.json", "utf8").replace(/^\uFEFF/u, ""));
  assert.equal(taxonomyReferenceRegistrySchema.parse(registry).sources[0]!.purpose, "taxonomy-reference-only");
  assert.throws(() => taxonomyReferenceRegistrySchema.parse({ ...registry, evidenceAssertions: 1 }));
  assert.throws(() => taxonomyReferenceRegistrySchema.parse({ ...registry, sources: [{ ...registry.sources[0], purpose: "county-presence" }] }));
  for (const id of ["../escape", "C:\\outside", "", "Mixed", "a/b"]) assert.throws(() => validateAcquisitionId(id));
  assert.equal(validateAcquisitionId("wcvp-20260906-r4"), "wcvp-20260906-r4");
  for (const entries of [[], ["a", "a"], ["../a"], ["C:/outside"], ["/outside"], ["a/../../outside"]]) assert.throws(() => validateZipEntryNames(entries));
  validateZipEntryNames(["README.txt", "wcvp_names.csv"]);
  const directory = mkdtempSync(path.join(tmpdir(), "isitusa-reference-transport-"));
  const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4]);
  const file = (name: string) => path.join(directory, name);
  const result = await retainZipResponse(new Response(bytes, { headers: { "content-length": String(bytes.length) } }), file("good.partial"), 100);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex")); assert.deepEqual(readFileSync(file("good.partial")), bytes);
  await assert.rejects(retainZipResponse(new Response(bytes), file("good.partial"), 100), /EEXIST/u);
  await assert.rejects(retainZipResponse(new Response(bytes, { status: 429 }), file("error.partial"), 100), /HTTP 200/u);
  await assert.rejects(retainZipResponse(new Response(bytes, { status: 302 }), file("redirect.partial"), 100), /HTTP 200/u);
  await assert.rejects(retainZipResponse(new Response(bytes, { headers: { "content-encoding": "gzip" } }), file("encoding.partial"), 100), /Encoded transport/u);
  await assert.rejects(retainZipResponse(new Response(bytes, { headers: { "content-length": "1001" } }), file("declared.partial"), 100), /declared archive/u);
  await assert.rejects(retainZipResponse(new Response(bytes), file("actual.partial"), 7), /byte budget/u);
  await assert.rejects(retainZipResponse(new Response(bytes, { headers: { "content-length": "10" } }), file("truncated.partial"), 100), /declared size/u);
  await assert.rejects(retainZipResponse(new Response("<html>maintenance</html>"), file("html.partial"), 100), /not a ZIP/u);
  console.log("Taxonomy reference transport: exact bytes and hash, immutable destination, size caps, truncation, HTTP error/redirect, encoding, HTML, registry purpose and unsafe paths passed. No network requests or acceptance method.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
