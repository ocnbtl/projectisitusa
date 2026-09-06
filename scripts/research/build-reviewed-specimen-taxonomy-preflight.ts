import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import type { Preflight } from "./build-retained-herbarium-state-plans";
import { parseSpecimenDate, validateSpecimenRecoveryWitness } from "./specimen-record-metadata";
import { stableJson } from "@/lib/research/run-files";
import { loadRetainedTaxonomyResolver, RETAINED_TAXONOMY_RECOVERY, RETAINED_TAXONOMY_INVENTORY_PATH, RETAINED_TAXONOMY_METHOD } from "./retained-specimen-taxonomy";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const arg = (name: string) => { const i = process.argv.indexOf(name); assert(i >= 0 && process.argv[i + 1], name + " is required."); return process.argv[i + 1]!; };
const asOf = arg("--as-of"), output = arg("--output");
parseSpecimenDate({}, asOf);
const started = Date.now(), evaluatedAt = new Date().toISOString();
assert(asOf <= evaluatedAt.slice(0, 10), "Reporting date follows review.");
const bytes = readFileSync(RETAINED_TAXONOMY_INVENTORY_PATH);
assert(hash(bytes) === RETAINED_TAXONOMY_RECOVERY.inventorySha256, "Retained inventory hash differs.");
const inventory = JSON.parse(gunzipSync(bytes).toString("utf8")) as Preflight;
assert(inventory.kind === "isitusa-source-infraspecific-inventory" && inventory.sourceId === "nybg-preserved-specimens", "Inventory kind or source differs.");
const resolve = loadRetainedTaxonomyResolver(RETAINED_TAXONOMY_RECOVERY, inventory.sourceId);
const status = new Map<string, string>();
for (const state of readdirSync("public/generated/research").filter(name => /^[A-Z]{2}$/u.test(name)).sort()) {
  const root = path.join("public/generated/research", state, "counties");
  for (const name of readdirSync(root).filter(value => /^[0-9]{5}\.json$/u.test(value)).sort()) {
    const county = JSON.parse(readFileSync(path.join(root, name), "utf8")) as { countyFips: string; stateCode: string; pairs: Array<{ speciesId: string; displayStatus: string }> };
    assert(county.stateCode === state && county.countyFips === name.slice(0, 5), "Baseline geography differs.");
    for (const pair of county.pairs) if (["verified-present", "verified-absent"].includes(pair.displayStatus)) status.set(county.countyFips + ":" + pair.speciesId, pair.displayStatus);
  }
}
const eligible: Preflight["representativeRecords"] = {}, holds: Array<{ sourcePair: string; sourceRowSha256: string; reason: string }> = [];
const gross: string[] = [], present: string[] = [], absent: string[] = [], states: Preflight["states"] = {};
const speciesCounts = new Map<string, { speciesId: string; scientificName: string; gross: number; presentOverlap: number; absentConflict: number; netEligible: number }>();
for (const sourcePair of inventory.netEligiblePairs) {
  const record = inventory.representativeRecords[sourcePair]!;
  validateSpecimenRecoveryWitness(record, { version: 1, asOf, extractedAt: inventory.evaluatedAt, preflightSha256: hash(bytes), witnessSetSha256: hash(stableJson([record])) });
  const result = resolve(record.sourceRow!);
  if (result.status !== "mapped-candidate") { holds.push({ sourcePair, sourceRowSha256: record.sourceRowSha256!, reason: result.reason }); continue; }
  const pair = record.countyFips + ":" + result.speciesId;
  assert(!gross.includes(pair), "Mapped pair repeats; an explicit witness-selection rule is required.");
  gross.push(pair);
  const group = states[record.stateCode] ??= { gross: 0, presentOverlap: 0, absentConflict: 0, netEligible: 0 };
  const taxon = speciesCounts.get(result.speciesId) ?? { speciesId: result.speciesId, scientificName: result.catalogScientificName, gross: 0, presentOverlap: 0, absentConflict: 0, netEligible: 0 };
  group.gross++; taxon.gross++;
  if (status.get(pair) === "verified-present") { present.push(pair); group.presentOverlap++; taxon.presentOverlap++; }
  else if (status.get(pair) === "verified-absent") { absent.push(pair); group.absentConflict++; taxon.absentConflict++; }
  else { eligible[pair] = { ...record, speciesId: result.speciesId, scientificName: result.catalogScientificName }; group.netEligible++; taxon.netEligible++; }
  speciesCounts.set(result.speciesId, taxon);
}
const pairs = Object.keys(eligible).sort();
const result = {
  ...inventory,
  kind: "isitusa-source-yield-preflight",
  inventoryQualification: undefined,
  evaluatedAt,
  baseline: { commit: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), determinedPairSetSha256: hash([...status.keys()].sort().join("\n")) },
  semantics: { ...inventory.semantics, assertion: "recorded-present", taxonomy: RETAINED_TAXONOMY_METHOD, scope: "Reviewed subset of retained inventory witnesses; no new complete-archive taxonomy screen or request is claimed." },
  metadataRecovery: { ...inventory.metadataRecovery!, asOf },
  taxonomyRecovery: RETAINED_TAXONOMY_RECOVERY,
  parentInventory: { path: RETAINED_TAXONOMY_INVENTORY_PATH, storedSha256: hash(bytes), evaluatedAt: inventory.evaluatedAt, baseline: inventory.baseline, counts: inventory.counts },
  counts: { ...inventory.counts, reviewedInventoryRecords: inventory.netEligiblePairs.length, heldInventoryRecords: holds.length,
    acceptedUniqueRecords: gross.length, grossUniqueCountySpeciesPairs: gross.length, existingVerifiedPresentOverlaps: present.length,
    verifiedAbsentConflicts: absent.length, withinPlanDuplicates: 0, netEligiblePairs: pairs.length },
  pairHashes: { gross: hash(gross.sort().join("\n")), presentOverlap: hash(present.sort().join("\n")), absentConflict: hash(absent.sort().join("\n")), netEligible: hash(pairs.join("\n")) },
  states, topSpecies: [...speciesCounts.values()].sort((a,b) => b.netEligible - a.netEligible || a.speciesId.localeCompare(b.speciesId)),
  taxonomyReviewHolds: holds,
  netEligiblePairs: pairs,
  representativeRecords: eligible,
  elapsedMs: Date.now() - started
};
writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ baseline: result.baseline, counts: result.counts, states, pairHashes: result.pairHashes, output, sourceRequests: 0 }, null, 2));
