import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import catalogJson from "@/data/generated/species.json";
import contextReview from "../fixtures/wcvp-specimen-context-review-20260906-r4.json";
import { specimenRowSha256 } from "./specimen-record-metadata";
import { createWcvpCandidateResolver, type WcvpName } from "./wcvp-infraspecific-candidates";

export const RETAINED_TAXONOMY_RECOVERY = {
  version: 1,
  referenceId: "kew-wcvp-v16-nybg-infraspecific-20260906-r4",
  referenceSha256: "c7197ad84e68644447029e386cfb14b1f08eedac3c7db70675f6659d86bc4df7",
  inventorySha256: "79e8c9e69bf17a22034569de8515fe9c1ae2ad6a8f6a5f1d07b69d8e3a2a8ab0",
} as const;
export type RetainedTaxonomyRecovery = typeof RETAINED_TAXONOMY_RECOVERY;
export const RETAINED_TAXONOMY_REFERENCE_PATH = "ops/national-research/evaluations/artifacts/wcvp-taxonomy-diagnostic-20260906-r4.json.gz";
export const RETAINED_TAXONOMY_INVENTORY_PATH = "ops/national-research/evaluations/artifacts/nybg-infraspecific-inventory-20260906-r4.json.gz";
export const RETAINED_TAXONOMY_CITATION = "Govaerts R (ed.). 2026. WCVP: World Checklist of Vascular Plants. Royal Botanic Gardens, Kew. https://doi.org/10.34885/egs6-cp24. Version 16, extracted 2026-06-04; accessed 2026-09-06. CC BY 3.0 http://creativecommons.org/licenses/by/3.0. Names and parent links selected and mapped by Isitusa; no endorsement.";
export const RETAINED_TAXONOMY_METHOD = "WCVP v16 exact authoritative name and authorship or explicit source autonym parent, with accepted-concept containment in one catalog taxon; reviewed immutable NYBG inventory and context";
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
type Catalog = Array<{ id: string; scientificName: string }>;

/** The reference index is complete only for this reviewed inventory and catalog, not arbitrary names. */
export function createRetainedTaxonomyResolver(referenceBytes: Buffer, inventoryBytes: Buffer, catalog: Catalog) {
  if (sha256(referenceBytes) !== RETAINED_TAXONOMY_RECOVERY.referenceSha256
    || sha256(inventoryBytes) !== RETAINED_TAXONOMY_RECOVERY.inventorySha256) throw new Error("Taxonomy reference or inventory hash differs.");
  const concepts = catalog.map(({ id, scientificName }) => ({ id, scientificName })).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (sha256(JSON.stringify(concepts)) !== "3b1c954610670aced856639a5083fcca137c41cae79c89fecc71c887313e3688") throw new Error("Taxonomy catalog concepts changed; reference review must be repeated.");
  const reference = JSON.parse(gunzipSync(referenceBytes, { maxOutputLength: 4 * 1024 * 1024 }).toString("utf8")) as {
    index: { selectedRows: Record<string, { row: WcvpName }> };
  };
  const inventory = JSON.parse(gunzipSync(inventoryBytes, { maxOutputLength: 2 * 1024 * 1024 }).toString("utf8")) as {
    representativeRecords: Record<string, { sourceRowSha256: string; sourceRow: Record<string, string> }>;
  };
  const witnesses = new Set(Object.values(inventory.representativeRecords).map(record => {
    if (specimenRowSha256(record.sourceRow) !== record.sourceRowSha256) throw new Error("Taxonomy inventory source row hash differs.");
    return record.sourceRowSha256;
  }));
  const holds = new Map(contextReview.holds.map(item => [item.sourceRowSha256, item.reason]));
  const resolve = createWcvpCandidateResolver(Object.values(reference.index.selectedRows).map(value => value.row), catalog);
  return (row: Record<string, string | undefined>) => {
    const hash = specimenRowSha256(row);
    if (!witnesses.has(hash)) return { status: "held" as const, reason: "source-witness-outside-reviewed-taxonomy-inventory" };
    const hold = holds.get(hash);
    if (hold) return { status: "held" as const, reason: hold };
    return resolve(row);
  };
}

export function loadRetainedTaxonomyResolver(parameters: RetainedTaxonomyRecovery, sourceId: string) {
  if (sourceId !== "nybg-preserved-specimens"
    || Object.keys(parameters).length !== Object.keys(RETAINED_TAXONOMY_RECOVERY).length
    || Object.entries(RETAINED_TAXONOMY_RECOVERY).some(([key, value]) => (parameters as Record<string, unknown>)[key] !== value)) {
    throw new Error("Taxonomy recovery source or reviewed profile differs.");
  }
  return createRetainedTaxonomyResolver(readFileSync(RETAINED_TAXONOMY_REFERENCE_PATH), readFileSync(RETAINED_TAXONOMY_INVENTORY_PATH), catalogJson);
}
