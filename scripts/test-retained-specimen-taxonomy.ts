import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import catalog from "@/data/generated/species.json";
import schemaJson from "@/data/research/schemas/retained-herbarium-preserved-specimens-parameters.schema.json";
import { stableJson } from "@/lib/research/run-files";
import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import { createRetainedTaxonomyResolver, loadRetainedTaxonomyResolver, RETAINED_TAXONOMY_RECOVERY, RETAINED_TAXONOMY_REFERENCE_PATH, RETAINED_TAXONOMY_INVENTORY_PATH } from "./research/retained-specimen-taxonomy";
import { nybgPreservedSpecimensAdapter, type RetainedHerbariumTarget } from "./research/adapters/retained-herbarium-preserved-specimens";
import { specimenRowSha256 } from "./research/specimen-record-metadata";

const reference = readFileSync(RETAINED_TAXONOMY_REFERENCE_PATH), inventoryBytes = readFileSync(RETAINED_TAXONOMY_INVENTORY_PATH);
const inventory = JSON.parse(gunzipSync(inventoryBytes).toString("utf8"));
const resolve = createRetainedTaxonomyResolver(reference, inventoryBytes, catalog);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const schema = z.fromJSONSchema(schemaJson as unknown as Parameters<typeof z.fromJSONSchema>[0]);
function fixture(pair: string): SourceAdapterContext {
  const target = { pairKey: pair, ...structuredClone(inventory.representativeRecords[pair]) } as RetainedHerbariumTarget;
  return { runId: "20260906T180000Z__nybg-preserved-specimens__taxonomyfixture", sourceId: "nybg-preserved-specimens", stateCode: target.stateCode,
    runStartedAt: "2026-09-06T11:00:00.000Z",
    requestedPairs: [{ countyFips: target.countyFips, countyName: target.sourceCounty, speciesId: target.speciesId, scientificName: target.scientificName }],
    parameters: { stateCode: target.stateCode, mode: "retained-archive-witnesses", profile: "nybg",
      datasetUrl: "https://sweetgum.nybg.org:8443/ipt/archive.do?r=occurrences", metadataUrl: "https://sweetgum.nybg.org:8443/ipt/eml.do?r=occurrences", usagePolicyUrl: "https://sweetgum.nybg.org/science/digital-collections/",
      datasetVersion: "1.103", publicationDate: "2026-08-25", datasetLastModified: "Tue, 25 Aug 2026 05:05:10 GMT", datasetEtag: null,
      archiveBytes: 736185551, archiveSha256: "84a5f69d746f1ec44fa89c63a9baf0fc5cb923dbb9330f91b6ac8660b159a483",
      occurrenceBytes: 3243235286, occurrenceSha256: "69c609fcb3da364149784f9afa9b78a6be61b95318b8e7e768244c1bebc35154",
      archiveAcquiredAt: "2026-09-04T04:13:16.000Z", preflightEvaluationId: "nybg-preserved-specimens-preflight-20260906-r5",
      targetPairSetSha256: hash(pair), targets: [target], candidatePairs: [pair],
      metadataRecovery: { version: 1, asOf: "2026-09-06", extractedAt: inventory.evaluatedAt, preflightSha256: "0".repeat(64), witnessSetSha256: hash(stableJson([target])) },
      taxonomyRecovery: { ...RETAINED_TAXONOMY_RECOVERY }
    } };
}
async function main() {
  assert.throws(() => createRetainedTaxonomyResolver(Buffer.from("changed"), inventoryBytes, catalog), /hash differs/u);
  assert.throws(() => createRetainedTaxonomyResolver(reference, Buffer.from("changed"), catalog), /hash differs/u);
  assert.throws(() => createRetainedTaxonomyResolver(reference, inventoryBytes, catalog.slice(1)), /catalog concepts changed/u);
  assert.throws(() => loadRetainedTaxonomyResolver(RETAINED_TAXONOMY_RECOVERY, "smithsonian-nmnh-preserved-specimens"), /source or reviewed profile/u);
  let accepted = 0, held = 0;
  for (const record of Object.values(inventory.representativeRecords) as RetainedHerbariumTarget[]) {
    const result = resolve(record.sourceRow!); if (result.status === "mapped-candidate") accepted++; else held++;
  }
  assert.equal(accepted, 165); assert.equal(held, 151);
  for (const [pair, record] of Object.entries(inventory.representativeRecords) as Array<[string, RetainedHerbariumTarget]>) {
    if (resolve(record.sourceRow!).status !== "mapped-candidate") continue;
    const input = fixture(pair); schema.parse(input.parameters); const result = await nybgPreservedSpecimensAdapter.run(input);
    assert.equal(result.assertions.length, 1); assert.equal(result.upstreamRequests.length, 0);
    assert.equal(result.assertions[0].taxon_match.source_scientific_name, inventory.representativeRecords[pair].sourceRow.scientificName);
    assert.equal(result.assertions[0].source_record_date, inventory.representativeRecords[pair].eventDate);
    assert.equal(result.assertions[0].claim_type, "recorded-present");
    assert(result.assertions[0].notes.some(note => note.includes("CC BY 3.0")));
    assert(result.reviews[0].reason_codes.includes("authoritative-infraspecific-concept-containment"));
    assert(result.artifacts.some(a => a.filename === "nybg-taxonomy-mappings.json"));
  }
  for (const pair of ["16015:hordeum-marinum", "16027:hordeum-marinum", "42059:medicago-sativa", "12086:koelreuteria-elegans", "22071:koelreuteria-elegans", "48041:koelreuteria-elegans", "20045:acer-platanoides"]) {
    await assert.rejects(() => nybgPreservedSpecimensAdapter.run(fixture(pair)), /Taxonomy recovery witness held/u);
  }
  for (const change of ["stripped-mode", "wrong-reference", "wrong-target", "new-witness", "cultivation", "geography"] as const) {
    const input = fixture("04005:hordeum-marinum"), target = (input.parameters.targets as RetainedHerbariumTarget[])[0]!;
    if (change === "stripped-mode") delete input.parameters.taxonomyRecovery;
    if (change === "wrong-reference") (input.parameters.taxonomyRecovery as Record<string, unknown>).referenceSha256 = "0".repeat(64);
    if (change === "wrong-target") target.scientificName = "Hordeum murinum";
    if (change === "new-witness") target.sourceRow!.catalogNumber = "invented";
    if (change === "cultivation") target.sourceRow!.fieldNotes = "Cultivated in a greenhouse";
    if (change === "geography") target.sourceCounty = "Mohave Co.";
    target.sourceRowSha256 = specimenRowSha256(target.sourceRow!);
    (input.parameters.metadataRecovery as Record<string, unknown>).witnessSetSha256 = hash(stableJson([target]));
    await assert.rejects(() => nybgPreservedSpecimensAdapter.run(input), /Taxonomy|taxonomy|Recovery|recovery/u, change);
    if (change === "wrong-reference") assert.equal(schema.safeParse(input.parameters).success, false);
  }
  const missingMetadata = fixture("04005:hordeum-marinum"); delete missingMetadata.parameters.metadataRecovery;
  assert.equal(schema.safeParse(missingMetadata.parameters).success, false);
  await assert.rejects(() => nybgPreservedSpecimensAdapter.run(missingMetadata), /requires retained raw metadata/u);
  console.log("Retained taxonomy acceptance: 165 candidate witnesses and 151 holds; reference/inventory/catalog tampering, out-of-scope source, original names and dates, attribution, per-run mapping lineage, context holds, and non-taxonomy protections passed. No evidence runs written.");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
