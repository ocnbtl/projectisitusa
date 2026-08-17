import assert from "node:assert/strict";
import path from "node:path";

import {
  NationalGbifDownloadPlanSchema,
  buildGbifDownloadRequest,
  downloadStatusDisposition,
  gbifCredentialReadiness,
  loadNationalGbifDownloadPlan,
  redactGbifDownloadRequest,
  resolveNationalGbifTaxa,
  stableJson,
} from "./research/national-gbif-download";

const root = path.resolve(".");
const planPath = path.join(root, "src/data/research/national-acquisition-plans/gbif-national-download-v1-retained-r55.json");
const plan = loadNationalGbifDownloadPlan(planPath);
NationalGbifDownloadPlanSchema.parse(plan);
const taxa = resolveNationalGbifTaxa(root, plan);
assert.equal(taxa.length, 53);
assert.equal(new Set(taxa.map((entry) => entry.taxonKey)).size, taxa.length);

const request = buildGbifDownloadRequest(plan, taxa, "operator@example.org");
const taxonPredicate = request.predicate.predicates.find((entry) => entry.key === "TAXON_KEY");
assert(taxonPredicate && "values" in taxonPredicate);
assert.equal(taxonPredicate.values.length, taxa.length);
assert.deepEqual(request.predicate.predicates.slice(0, 3), [
  { type: "equals", key: "COUNTRY", value: "US" },
  { type: "equals", key: "BASIS_OF_RECORD", value: "PRESERVED_SPECIMEN" },
  { type: "equals", key: "OCCURRENCE_STATUS", value: "PRESENT" },
]);
const redacted = stableJson(redactGbifDownloadRequest(request));
assert(!redacted.includes("operator@example.org"));
assert(redacted.includes("[redacted]"));
assert.throws(() => buildGbifDownloadRequest(plan, taxa, "invalid"), /valid notification address/u);

const missing = gbifCredentialReadiness({});
assert.equal(missing.ready, false);
assert.deepEqual(missing.missing, ["GBIF_EMAIL", "GBIF_PASSWORD", "GBIF_USERNAME"]);
const ready = gbifCredentialReadiness({
  GBIF_USERNAME: "operator",
  GBIF_PASSWORD: "secret",
  GBIF_EMAIL: "operator@example.org",
});
assert.equal(ready.ready, true);
assert.deepEqual(ready.missing, []);
assert.equal(downloadStatusDisposition("SUCCEEDED"), "succeeded");
assert.equal(downloadStatusDisposition("FAILED"), "failed");
assert.equal(downloadStatusDisposition("RUNNING"), "pending");

console.log(JSON.stringify({
  ok: true,
  planId: plan.planId,
  taxa: taxa.length,
  deterministicPredicate: true,
  credentialRedaction: true,
  negativeSemantics: "preserved",
}, null, 2));
