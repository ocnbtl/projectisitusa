import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { z } from "zod";

import { validateResearchDataDelivery } from "@/lib/research/research-data-delivery";

import {
  buildResearchPublicationManifest,
  validateResearchPublicationManifest,
} from "./research/research-publication";
import {
  assertR2FreeTierSafety,
  R2_CLASS_A_SAFETY_REQUESTS,
  R2_CLASS_B_SAFETY_REQUESTS,
  R2_STORAGE_SAFETY_BYTES,
} from "./research/r2-free-tier-budget";

async function main() {
  const root = mkdtempSync(path.join(tmpdir(), "isitusa-publication-test-"));
  try {
  const source = path.join(root, "public/generated/research/AL/counties");
  mkdirSync(source, { recursive: true });
  writeFileSync(path.join(source, "01001.json"), "{\"county\":\"Autauga\"}\n");
  writeFileSync(path.join(source, "01003.json"), "{\"county\":\"Autauga\"}\n");
  writeFileSync(path.join(root, "public/generated/research/AL/summary.json"), "{\"state\":\"AL\"}\n");
  const input = {
    root,
    sourceCommit: "a".repeat(40),
    sourceCommitDate: "2026-08-18T00:00:00.000Z",
  };
  const first = await buildResearchPublicationManifest(input);
  const second = await buildResearchPublicationManifest(input);
  assert.deepEqual(first, second);
  assert.equal(first.artifactCount, 3);
  assert.equal(first.uniqueObjectCount, 2);
  assert.match(first.releaseId, /^research-a{12}-[0-9a-f]{16}$/u);
  validateResearchPublicationManifest(first);
  const manifestSchema = JSON.parse(
    readFileSync(path.join(process.cwd(), "src/data/research/schemas/research-publication-manifest.schema.json"), "utf8"),
  ) as Parameters<typeof z.fromJSONSchema>[0];
  z.fromJSONSchema(manifestSchema).parse(first);

  const deliverySchema = JSON.parse(
    readFileSync(path.join(process.cwd(), "src/data/research/schemas/research-data-delivery.schema.json"), "utf8"),
  ) as Parameters<typeof z.fromJSONSchema>[0];
  const deliveryValidator = z.fromJSONSchema(deliverySchema);
  const delivery = JSON.parse(
    readFileSync(path.join(process.cwd(), "src/data/research/research-data-delivery.json"), "utf8"),
  );
  deliveryValidator.parse(delivery);
  assert.throws(
    () => validateResearchDataDelivery({ ...delivery, mode: "r2", r2: { ...delivery.r2, releaseId: null } }),
    /invalid|expected|string|requires a pinned release ID/iu,
  );

  assert.doesNotThrow(() => assertR2FreeTierSafety({
    projectedStorageBytes: R2_STORAGE_SAFETY_BYTES,
    currentClassARequests: 100,
    currentClassBRequests: 100,
    newClassARequests: R2_CLASS_A_SAFETY_REQUESTS - 100,
    newClassBRequests: R2_CLASS_B_SAFETY_REQUESTS - 100,
  }));
  assert.throws(() => assertR2FreeTierSafety({
    projectedStorageBytes: R2_STORAGE_SAFETY_BYTES + 1,
    currentClassARequests: 0,
    currentClassBRequests: 0,
    newClassARequests: 0,
    newClassBRequests: 0,
  }), /8 GB project safety budget/u);
  assert.throws(() => assertR2FreeTierSafety({
    projectedStorageBytes: 1,
    currentClassARequests: R2_CLASS_A_SAFETY_REQUESTS,
    currentClassBRequests: 0,
    newClassARequests: 1,
    newClassBRequests: 0,
  }), /Class A requests exceed/u);
  assert.throws(() => assertR2FreeTierSafety({
    projectedStorageBytes: 1,
    currentClassARequests: 0,
    currentClassBRequests: R2_CLASS_B_SAFETY_REQUESTS,
    newClassARequests: 0,
    newClassBRequests: 1,
  }), /Class B requests exceed/u);

  const corrupted = structuredClone(first);
  corrupted.artifacts[0].bytes += 1;
  assert.throws(() => validateResearchPublicationManifest(corrupted), /collision|totals do not reconcile|invalid/u);
    console.log("Research publication manifest tests passed.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main();
