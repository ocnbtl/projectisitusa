import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { z } from "zod";

import { validateResearchDataDelivery } from "@/lib/research/research-data-delivery";
import deliveryConfig from "@/data/research/research-data-delivery.json";
import { createResearchProjectionFetcher } from "@/lib/research/public-projection-fetch";

import {
  buildResearchPublicationManifest,
  validateResearchPublicationManifest,
  manifestBytes,
  publicationStoredBytes,
  selectPublicationSamples,
  publicationUploadBytes,
  verifyPublicationObjectBytes,
  collectPublicationRepresentations,
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
import { buildR2ReachabilityReport, planR2CandidateRelease } from "./research/r2-reachability";

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

  const compressed = await buildResearchPublicationManifest({ ...input, compressNewObjects: true });
  assert.deepEqual(compressed, await buildResearchPublicationManifest({ ...input, compressNewObjects: true }));
  assert.equal(compressed.sourceTreeSha256, first.sourceTreeSha256);
  assert.notEqual(compressed.releaseId, first.releaseId, "Storage representation changes require a new release identity.");
  assert.deepEqual(compressed.artifacts.map((artifact) => artifact.objectKey), first.artifacts.map((artifact) => artifact.objectKey));
  assert.equal(compressed.artifactBytes, first.artifactBytes, "Legacy public totals continue describing decoded JSON.");
  validateResearchPublicationManifest(compressed);
  z.fromJSONSchema(manifestSchema).parse(compressed);
  assert.deepEqual(await buildResearchPublicationManifest({ ...input, knownObjects: compressed.artifacts }), compressed,
    "Offline checks preserve sealed historical gzip representations.");
  const mixed = await buildResearchPublicationManifest({ ...input, compressNewObjects: true, knownObjects: [first.artifacts[0]],
    existingObjectKeys: new Set([first.artifacts[0].objectKey]) });
  assert.equal(mixed.artifacts[0].contentEncoding, undefined);
  assert.equal(mixed.artifacts.at(-1)!.contentEncoding, "gzip");
  await assert.rejects(buildResearchPublicationManifest({ ...input, compressNewObjects: true,
    existingObjectKeys: new Set([first.artifacts[0].objectKey]) }), /no validated representation/u);
  assert.throws(() => collectPublicationRepresentations([...first.artifacts, ...compressed.artifacts]), /Conflicting immutable/u);
  const broken = structuredClone(compressed);
  delete broken.artifacts[0].storedBytes;
  assert.throws(() => validateResearchPublicationManifest(broken), /storage representation/u);
  assert.throws(() => z.fromJSONSchema(manifestSchema).parse(broken), "The registered schema must reject partial gzip descriptors.");
  for (const field of ["contentEncoding", "storedSha256", "storedBytes"] as const) {
    const partial = structuredClone(compressed); delete partial.artifacts[0][field];
    assert.throws(() => z.fromJSONSchema(manifestSchema).parse(partial), field);
    assert.throws(() => validateResearchPublicationManifest(partial), field);
  }
  const mixedSamples = Array.from({ length: 12 }, (_, index) => index === 1 ? compressed.artifacts[0] : first.artifacts[0]);
  assert(selectPublicationSamples(mixedSamples).some((artifact) => artifact.contentEncoding === "gzip"));
  assert.equal(selectPublicationSamples(mixedSamples).length, 3);
  const sample = compressed.artifacts.at(-1)!;
  const sampleDecoded = readFileSync(path.join(root, sample.localPath));
  const sampleStored = publicationUploadBytes(sample, sampleDecoded);
  assert.deepEqual(verifyPublicationObjectBytes(sample, sampleStored, "gzip"), sampleDecoded);
  assert.throws(() => verifyPublicationObjectBytes(sample, sampleStored), /encoding differs/u);
  assert.throws(() => verifyPublicationObjectBytes(sample, Buffer.from("corrupt"), "gzip"), /stored bytes/u);
  assert.throws(() => verifyPublicationObjectBytes({ ...sample, sha256: "0".repeat(64) }, sampleStored, "gzip"), /decoded bytes/u);
  const olderEncoding = gzipSync(sampleDecoded, { level: 9 });
  const olderRepresentation = { ...sample, storedBytes: olderEncoding.length, storedSha256: createHash("sha256").update(olderEncoding).digest("hex") };
  const reusedOlder = await buildResearchPublicationManifest({ ...input, compressNewObjects: true, knownObjects: [olderRepresentation] });
  assert.equal(reusedOlder.artifacts.at(-1)!.storedSha256, olderRepresentation.storedSha256);

  // Real HTTP exercises automatic decoding; an in-memory Response with a header does not.
  const packedManifest = manifestBytes(compressed);
  const packedPointer = { schemaVersion: 1, kind: "isitusa-research-projection-pointer", releaseId: compressed.releaseId,
    releaseManifestKey: `releases/${compressed.releaseId}/manifest.json`,
    releaseManifestSha256: createHash("sha256").update(packedManifest).digest("hex"), sourceCommit: compressed.sourceCommit,
    promotedAt: "2026-08-19T01:00:00.000Z" };
  let sendEncoding = true;
  const server = createServer((request, response) => {
    const key = (request.url ?? "").replace(/^\/research-data\//u, "");
    if (key === "current.json") return void response.end(JSON.stringify(packedPointer));
    if (key === packedPointer.releaseManifestKey) return void response.end(packedManifest);
    const artifact = compressed.artifacts.find((item) => item.objectKey === key);
    if (!artifact) { response.statusCode = 404; response.end(); return; }
    const stored = publicationUploadBytes(artifact, readFileSync(path.join(root, artifact.localPath)));
    response.setHeader("Content-Length", stored.length);
    if (sendEncoding) response.setHeader("Content-Encoding", "gzip");
    response.end(stored);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const fetcher = createResearchProjectionFetcher(deliveryConfig, (url, init) => fetch(new URL(String(url), origin), init));
    assert.deepEqual(await fetcher("AL/summary.json"), { state: "AL" });
    sendEncoding = false;
    await assert.rejects(fetcher("AL/summary.json"), /hash differs/iu);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }

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
  const reachabilityInput = {
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
  };
  const reachability = buildR2ReachabilityReport(reachabilityInput);
  assert.equal(reachability.reachability.currentReleaseObjects.bytes, 3);
  assert.equal(reachability.reachability.rollbackOnlyObjects.bytes, 7);
  assert.equal(reachability.reachability.historicalOnlyObjects.bytes, 5);
  assert.equal(reachability.reachability.unreferencedContentObjects.bytes, 6);
  assert.equal(reachability.rollbackWindow.retainedReleaseIds.length, 3);
  assert.equal(reachability.deletion.performed, false);

  assert.equal(reachability.deletion.reviewOnlyHistoricalRemovalBytes, 25);
  assert.equal(reachability.deletion.reviewOnlyHistoricalRemoval.some((row) => row.key.endsWith("orphan6")), false);
  assert.equal(reachability.deletion.reviewOnlyHistoricalRemoval.some((row) => row.key.includes("rollback")), false);
  const reusedHistory = buildR2ReachabilityReport({ ...reachabilityInput, candidateManifest: releases[3].manifest });
  assert.equal(reusedHistory.deletion.reviewOnlyHistoricalRemovalBytes, 0, "Both candidate content and its existing immutable manifest must remain protected.");
  assert.equal(reusedHistory.deletion.reviewOnlyHistoricalRemoval.some((row) => row.key.endsWith("history5")), false, "Candidate references protect older content from the removal review.");
  assert.equal(reusedHistory.candidateRelease?.reusedObjects, 1);
  const candidateInput = {
    manifest: first,
    bucketObjects: [object("current.json", 100)],
    currentClassARequests: 100,
    currentClassBRequests: 200,
    reviewOnlyHistoricalRemovalBytes: 0,
  };
  const candidatePlan = planR2CandidateRelease(candidateInput);
  const compressedPlan = planR2CandidateRelease({ ...candidateInput, manifest: compressed });
  assert.equal(planR2CandidateRelease({ ...candidateInput, currentClassBRequests: R2_CLASS_B_SAFETY_REQUESTS - first.uniqueObjectCount - 8 }).publicationWithoutDeletionAllowedByBudget, false, "Both public routes must fit the request budget.");
  assert.equal(compressedPlan.missingBytes, [...new Map(compressed.artifacts.map((artifact) => [artifact.objectKey, artifact])).values()]
    .reduce((sum, artifact) => sum + publicationStoredBytes(artifact), 0));
  assert.equal(candidatePlan.missingObjects, 2, "Identical candidate files must deduplicate.");
  assert.equal(candidatePlan.publicationWithoutDeletionAllowedByBudget, true);
  const fullBucket = planR2CandidateRelease({ ...candidateInput, bucketObjects: [object("current.json", R2_STORAGE_SAFETY_BYTES)] });
  assert.equal(fullBucket.publicationWithoutDeletionAllowedByBudget, false);
  assert(fullBucket.bytesOverStorageStop > 0);
  const classAFull = planR2CandidateRelease({ ...candidateInput, currentClassARequests: R2_CLASS_A_SAFETY_REQUESTS });
  assert.equal(classAFull.publicationWithoutDeletionAllowedByBudget, false);
  const classBFull = planR2CandidateRelease({ ...candidateInput, currentClassBRequests: R2_CLASS_B_SAFETY_REQUESTS });
  assert.equal(classBFull.publicationWithoutDeletionAllowedByBudget, false);
  const reused = planR2CandidateRelease({ ...candidateInput, bucketObjects: [object(first.artifacts[0].objectKey, first.artifacts[0].bytes)] });
  assert.equal(reused.reusedObjects, 1);
  assert.throws(() => planR2CandidateRelease({ ...candidateInput, bucketObjects: [object(first.artifacts[0].objectKey, first.artifacts[0].bytes + 1)] }), /byte count differs/u);

  const corrupted = structuredClone(first);
  corrupted.artifacts[0].bytes += 1;
  assert.throws(() => validateResearchPublicationManifest(corrupted), /collision|totals do not reconcile|invalid/u);
    console.log("Research publication manifest tests passed.");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

void main();
