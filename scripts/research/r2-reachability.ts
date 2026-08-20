import { createHash } from "node:crypto";

import type { ResearchPublicationManifest } from "./research-publication";
import {
  RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS,
  RESEARCH_PROMOTION_POLICY_VERSION,
  RESEARCH_ROLLBACK_RELEASE_COUNT,
  type ResearchPublicationPointer,
} from "./publication-cadence";
import {
  R2_CLASS_A_SAFETY_REQUESTS,
  R2_CLASS_B_SAFETY_REQUESTS,
  R2_STORAGE_SAFETY_BYTES,
} from "./r2-free-tier-budget";

export const R2_REACHABILITY_REPORT_SCHEMA_VERSION = 1 as const;
export const R2_REACHABILITY_REPORT_KIND = "isitusa-r2-reachability-report" as const;

export interface R2BucketObjectRecord {
  key: string;
  bytes: number;
  lastModified: string | null;
}

export interface R2ReleaseInventoryRecord {
  manifestKey: string;
  manifestBytes: number;
  manifestSha256: string;
  manifest: ResearchPublicationManifest;
}

interface KeySummary {
  objectCount: number;
  bytes: number;
  inventorySha256: string;
  sampleKeys: string[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

function summarizeKeys(keys: Iterable<string>, inventory: Map<string, R2BucketObjectRecord>): KeySummary {
  const rows = [...new Set(keys)].sort(compareText).map((key) => {
    const object = inventory.get(key);
    if (!object) throw new Error(`Reachability references a missing R2 object: ${key}`);
    return { key, bytes: object.bytes };
  });
  const sampleKeys = rows.length <= 10
    ? rows.map(({ key }) => key)
    : [...rows.slice(0, 5), ...rows.slice(-5)].map(({ key }) => key);
  return {
    objectCount: rows.length,
    bytes: rows.reduce((total, row) => total + row.bytes, 0),
    inventorySha256: createHash("sha256").update(JSON.stringify(rows)).digest("hex"),
    sampleKeys,
  };
}

function releaseSort(left: R2ReleaseInventoryRecord, right: R2ReleaseInventoryRecord): number {
  const dateOrder = Date.parse(right.manifest.sourceCommitDate) - Date.parse(left.manifest.sourceCommitDate);
  return dateOrder || compareText(left.manifest.releaseId, right.manifest.releaseId);
}

export function buildR2ReachabilityReport(input: {
  observedAt: string;
  dashboardObservedAt: string;
  bucket: string;
  currentClassARequests: number;
  currentClassBRequests: number;
  reportClassARequests: number;
  reportClassBRequests: number;
  bucketObjects: R2BucketObjectRecord[];
  currentPointer: ResearchPublicationPointer;
  releases: R2ReleaseInventoryRecord[];
}) {
  if (!Number.isFinite(Date.parse(input.observedAt)) || !Number.isFinite(Date.parse(input.dashboardObservedAt))) {
    throw new Error("R2 reachability observation timestamps must be valid ISO date-times.");
  }
  assertNonNegativeSafeInteger(input.currentClassARequests, "Current Class A requests");
  assertNonNegativeSafeInteger(input.currentClassBRequests, "Current Class B requests");
  assertNonNegativeSafeInteger(input.reportClassARequests, "Report Class A requests");
  assertNonNegativeSafeInteger(input.reportClassBRequests, "Report Class B requests");

  const inventory = new Map<string, R2BucketObjectRecord>();
  for (const object of input.bucketObjects) {
    if (!object.key || inventory.has(object.key)) throw new Error(`Duplicate or empty R2 key: ${object.key}`);
    assertNonNegativeSafeInteger(object.bytes, `R2 object bytes for ${object.key}`);
    inventory.set(object.key, object);
  }
  const releasesById = new Map(input.releases.map((release) => [release.manifest.releaseId, release]));
  if (releasesById.size !== input.releases.length) throw new Error("R2 release inventory contains duplicate release IDs.");
  const currentRelease = releasesById.get(input.currentPointer.releaseId);
  if (!currentRelease) throw new Error("Current R2 pointer release manifest was not found in the bucket.");
  if (
    currentRelease.manifestKey !== input.currentPointer.releaseManifestKey ||
    currentRelease.manifestSha256 !== input.currentPointer.releaseManifestSha256 ||
    currentRelease.manifest.sourceCommit !== input.currentPointer.sourceCommit
  ) {
    throw new Error("Current R2 pointer and immutable release manifest do not reconcile.");
  }

  const sortedHistorical = input.releases
    .filter((release) => release.manifest.releaseId !== input.currentPointer.releaseId)
    .sort(releaseSort);
  const rollbackReleases = [currentRelease, ...sortedHistorical.slice(0, RESEARCH_ROLLBACK_RELEASE_COUNT)];
  const rollbackReleaseIds = new Set(rollbackReleases.map((release) => release.manifest.releaseId));
  const historicalReleases = sortedHistorical.filter((release) => !rollbackReleaseIds.has(release.manifest.releaseId));

  const allReferencedKeys = new Set<string>();
  const rollbackReferencedKeys = new Set<string>();
  const currentReferencedKeys = new Set(currentRelease.manifest.artifacts.map((artifact) => artifact.objectKey));
  for (const release of input.releases) {
    const listedManifest = inventory.get(release.manifestKey);
    if (!listedManifest || listedManifest.bytes !== release.manifestBytes) {
      throw new Error(`R2 release manifest listing differs: ${release.manifestKey}`);
    }
    for (const artifact of release.manifest.artifacts) {
      const listed = inventory.get(artifact.objectKey);
      if (!listed || listed.bytes !== artifact.bytes) {
        throw new Error(`R2 artifact listing differs from release manifest: ${artifact.objectKey}`);
      }
      allReferencedKeys.add(artifact.objectKey);
      if (rollbackReleaseIds.has(release.manifest.releaseId)) rollbackReferencedKeys.add(artifact.objectKey);
    }
  }

  const contentKeys = [...inventory.keys()].filter((key) => key.startsWith("objects/sha256/"));
  const releaseManifestKeys = [...inventory.keys()].filter((key) => /^releases\/[^/]+\/manifest\.json$/u.test(key));
  const pointerKeys = [...inventory.keys()].filter((key) => key === "current.json");
  const classifiedKeys = new Set([...contentKeys, ...releaseManifestKeys, ...pointerKeys]);
  const otherKeys = [...inventory.keys()].filter((key) => !classifiedKeys.has(key));
  const rollbackOnlyKeys = [...rollbackReferencedKeys].filter((key) => !currentReferencedKeys.has(key));
  const historicalOnlyKeys = [...allReferencedKeys].filter((key) => !rollbackReferencedKeys.has(key));
  const unreferencedKeys = contentKeys.filter((key) => !allReferencedKeys.has(key));
  const outsideRollbackManifestKeys = historicalReleases.map((release) => release.manifestKey);
  const bucketSummary = summarizeKeys(inventory.keys(), inventory);
  const projectedClassARequests = input.currentClassARequests + input.reportClassARequests;
  const projectedClassBRequests = input.currentClassBRequests + input.reportClassBRequests;

  return {
    schemaVersion: R2_REACHABILITY_REPORT_SCHEMA_VERSION,
    kind: R2_REACHABILITY_REPORT_KIND,
    observedAt: new Date(input.observedAt).toISOString(),
    mode: "read-only-list-and-get",
    bucket: input.bucket,
    policy: {
      promotionPolicyVersion: RESEARCH_PROMOTION_POLICY_VERSION,
      minimumPromotionIntervalHours: RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS,
      rollbackReleaseCount: RESEARCH_ROLLBACK_RELEASE_COUNT,
      automaticDeletionAllowed: false,
      deletionRequiresExplicitAuthority: true,
    },
    current: {
      releaseId: input.currentPointer.releaseId,
      releaseManifestKey: input.currentPointer.releaseManifestKey,
      sourceCommit: input.currentPointer.sourceCommit,
      promotedAt: input.currentPointer.promotedAt,
    },
    rollbackWindow: {
      retainedReleaseIds: rollbackReleases.map((release) => release.manifest.releaseId),
      historicalReleaseIdsOutsideWindow: historicalReleases.map((release) => release.manifest.releaseId),
    },
    usageSample: {
      dashboardObservedAt: new Date(input.dashboardObservedAt).toISOString(),
      currentClassARequests: input.currentClassARequests,
      currentClassBRequests: input.currentClassBRequests,
      reportClassARequests: input.reportClassARequests,
      reportClassBRequests: input.reportClassBRequests,
      projectedClassARequests,
      projectedClassBRequests,
      classASafetyRequests: R2_CLASS_A_SAFETY_REQUESTS,
      classBSafetyRequests: R2_CLASS_B_SAFETY_REQUESTS,
    },
    storage: {
      retainedBytes: bucketSummary.bytes,
      storageSafetyBytes: R2_STORAGE_SAFETY_BYTES,
      headroomBytes: R2_STORAGE_SAFETY_BYTES - bucketSummary.bytes,
      percentOfSafetyBudget: Number(((bucketSummary.bytes / R2_STORAGE_SAFETY_BYTES) * 100).toFixed(3)),
    },
    inventory: {
      bucket: bucketSummary,
      contentAddressedObjects: summarizeKeys(contentKeys, inventory),
      releaseManifests: summarizeKeys(releaseManifestKeys, inventory),
      pointers: summarizeKeys(pointerKeys, inventory),
      otherObjects: summarizeKeys(otherKeys, inventory),
    },
    reachability: {
      currentReleaseObjects: summarizeKeys(currentReferencedKeys, inventory),
      rollbackOnlyObjects: summarizeKeys(rollbackOnlyKeys, inventory),
      historicalOnlyObjects: summarizeKeys(historicalOnlyKeys, inventory),
      unreferencedContentObjects: summarizeKeys(unreferencedKeys, inventory),
      historicalReleaseManifestsOutsideWindow: summarizeKeys(outsideRollbackManifestKeys, inventory),
    },
    deletion: {
      performed: false,
      automaticallyEligibleObjects: 0,
      candidateObjectCount: historicalOnlyKeys.length + unreferencedKeys.length + outsideRollbackManifestKeys.length,
      candidateBytes:
        summarizeKeys(historicalOnlyKeys, inventory).bytes +
        summarizeKeys(unreferencedKeys, inventory).bytes +
        summarizeKeys(outsideRollbackManifestKeys, inventory).bytes,
      qualification:
        "Candidates are inventory evidence only. No object is approved for deletion without explicit authority, a fresh report, and rollback verification.",
    },
    safety: {
      storageWithinProjectStop: bucketSummary.bytes <= R2_STORAGE_SAFETY_BYTES,
      classAWithinProjectStop: projectedClassARequests <= R2_CLASS_A_SAFETY_REQUESTS,
      classBWithinProjectStop: projectedClassBRequests <= R2_CLASS_B_SAFETY_REQUESTS,
      pointerManifestReconciled: true,
      referencedObjectBytesReconciled: true,
    },
  };
}
