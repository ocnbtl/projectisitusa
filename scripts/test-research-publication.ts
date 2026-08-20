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
import {
  evaluateResearchPromotionCadence,
  RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS,
  validateResearchPublicationPointer,
} from "./research/publication-cadence";
import { buildR2ReachabilityReport } from "./research/r2-reachability";

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
    () => validateResearchDataDelivery({ ...delivery, r2: { ...delivery.r2, pointerPath: "../current.json" } }),
    /invalid identity/iu,
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

  const pointer = validateResearchPublicationPointer({
    schemaVersion: 1,
    kind: "isitusa-research-projection-pointer",
    releaseId: "research-aaaaaaaaaaaa-bbbbbbbbbbbbbbbb",
    releaseManifestKey: "releases/research-aaaaaaaaaaaa-bbbbbbbbbbbbbbbb/manifest.json",
    releaseManifestSha256: "c".repeat(64),
    sourceCommit: "a".repeat(40),
    promotedAt: "2026-08-01T00:00:00.000Z",
  });
  assert.equal(RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS, 168);
  assert.equal(
    evaluateResearchPromotionCadence({ now: new Date("2026-08-01T00:00:00.000Z"), previousPointer: null })
      .previousReleaseId,
    null,
  );
  assert.throws(
    () => evaluateResearchPromotionCadence({ now: new Date("2026-08-07T23:59:59.999Z"), previousPointer: pointer }),
    /blocks another pointer update/u,
  );
  assert.equal(
    evaluateResearchPromotionCadence({ now: new Date("2026-08-08T00:00:00.000Z"), previousPointer: pointer })
      .overrideUsed,
    false,
  );
  const overriddenCadence = evaluateResearchPromotionCadence({
    now: new Date("2026-08-02T00:00:00.000Z"),
    previousPointer: pointer,
    overrideReason: "Urgent correction to published scientific evidence.",
  });
  assert.equal(overriddenCadence.overrideUsed, true);

  const release = (releaseId: string, sourceCommitDate: string, keys: string[]) => ({
    manifestKey: `releases/${releaseId}/manifest.json`,
    manifestBytes: 20,
    manifestSha256: releaseId === pointer.releaseId ? "c".repeat(64) : "d".repeat(64),
    manifest: {
      ...first,
      releaseId,
      sourceCommit: releaseId === pointer.releaseId ? "a".repeat(40) : "b".repeat(40),
      sourceCommitDate,
      artifacts: keys.map((key, index) => ({
        ...first.artifacts[0],
        logicalPath: `public/generated/research/fixture/${releaseId}-${index}.json`,
        localPath: `public/generated/research/fixture/${releaseId}-${index}.json`,
        objectKey: key,
        bytes: Number(key.at(-1)),
      })),
    },
  });
  const releaseIds = [
    pointer.releaseId,
    "research-bbbbbbbbbbbb-cccccccccccccccc",
    "research-cccccccccccc-dddddddddddddddd",
    "research-dddddddddddd-eeeeeeeeeeeeeeee",
  ];
  const releases = [
    release(releaseIds[0], "2026-08-04T00:00:00.000Z", ["objects/sha256/aa/current1", "objects/sha256/aa/current2"]),
    release(releaseIds[1], "2026-08-03T00:00:00.000Z", ["objects/sha256/aa/current2", "objects/sha256/bb/rollback3"]),
    release(releaseIds[2], "2026-08-02T00:00:00.000Z", ["objects/sha256/cc/rollback4"]),
    release(releaseIds[3], "2026-08-01T00:00:00.000Z", ["objects/sha256/dd/history5"]),
  ];
  const object = (key: string, bytes: number) => ({ key, bytes, lastModified: null });
  const reachability = buildR2ReachabilityReport({
    observedAt: "2026-08-19T00:00:00.000Z",
    dashboardObservedAt: "2026-08-19T00:00:00.000Z",
    bucket: "fixture",
    currentClassARequests: 100,
    currentClassBRequests: 200,
    reportClassARequests: 1,
    reportClassBRequests: 5,
    currentPointer: pointer,
    releases,
    bucketObjects: [
      object("current.json", 10),
      ...releases.map(({ manifestKey }) => object(manifestKey, 20)),
      object("objects/sha256/aa/current1", 1),
      object("objects/sha256/aa/current2", 2),
      object("objects/sha256/bb/rollback3", 3),
      object("objects/sha256/cc/rollback4", 4),
      object("objects/sha256/dd/history5", 5),
      object("objects/sha256/ee/orphan6", 6),
    ],
  });
  assert.equal(reachability.reachability.currentReleaseObjects.bytes, 3);
  assert.equal(reachability.reachability.rollbackOnlyObjects.bytes, 7);
  assert.equal(reachability.reachability.historicalOnlyObjects.bytes, 5);
  assert.equal(reachability.reachability.unreferencedContentObjects.bytes, 6);
  assert.equal(reachability.rollbackWindow.retainedReleaseIds.length, 3);
  assert.equal(reachability.deletion.performed, false);

  const corrupted = structuredClone(first);
  corrupted.artifacts[0].bytes += 1;
  assert.throws(() => validateResearchPublicationManifest(corrupted), /collision|totals do not reconcile|invalid/u);
    console.log("Research publication manifest tests passed.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main();
