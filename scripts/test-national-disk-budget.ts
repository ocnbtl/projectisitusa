import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyCapacityTier,
  evaluateDiskBudget,
  maximumWorkersForResources,
  type NationalResourcePolicy,
  validateNationalResourcePolicy,
} from "./check-national-disk-budget";

const policy = JSON.parse(
  fs.readFileSync("ops/national-research/resource-policy.json", "utf8"),
) as NationalResourcePolicy;

assert.deepEqual(validateNationalResourcePolicy(policy), []);
const desktopDisk = {
  availableBytes: 1179952852992,
  totalBytes: 1999284203520,
};
assert.equal(
  maximumWorkersForResources(policy, "acquisition", {
    ...desktopDisk,
    totalMemoryBytes: 33450536960,
    availableMemoryBytes: 7340032000,
  }),
  2,
);
assert.equal(
  maximumWorkersForResources(policy, "acquisition", {
    ...desktopDisk,
    totalMemoryBytes: 33450536960,
    availableMemoryBytes: 16106127360,
  }),
  6,
);
assert.equal(
  maximumWorkersForResources(policy, "lightweight", {
    ...desktopDisk,
    totalMemoryBytes: 33450536960,
    availableMemoryBytes: 16106127360,
  }),
  12,
);
assert.equal(
  maximumWorkersForResources(policy, "artifact", {
    ...desktopDisk,
    totalMemoryBytes: 33450536960,
    availableMemoryBytes: 16106127360,
  }),
  3,
);
assert.deepEqual(
  classifyCapacityTier(policy, {
    totalMemoryBytes: 33450536960,
    availableMemoryBytes: 7340032000,
  }).tier,
  "yellow",
);
assert.deepEqual(
  classifyCapacityTier(policy, {
    totalMemoryBytes: 33450536960,
    availableMemoryBytes: 958275584,
    commitChargePercent: 91.96,
    pageReadsPerSecond: 428.28,
    pageWritesPerSecond: 0,
  }).tier,
  "red",
);

const fourWorkerCalibration = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "dispatch",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 15032385536,
  workers: 4,
  artifactBudgetBytes: 83886080,
});
assert.equal(fourWorkerCalibration.ok, true);
assert.equal(fourWorkerCalibration.maximumWorkersAtCurrentCapacity, 6);

const blockedCurrentMemoryWave = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "dispatch",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 7340032000,
  workers: 4,
  artifactBudgetBytes: 83886080,
});
assert.equal(blockedCurrentMemoryWave.ok, false);
assert.match(blockedCurrentMemoryWave.errors.join(" "), /at most 2/);
assert.match(blockedCurrentMemoryWave.errors.join(" "), /RAM headroom failed/);

const yellowTwoWorkerWave = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "dispatch",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 7340032000,
  workers: 2,
  artifactBudgetBytes: 41943040,
});
assert.equal(yellowTwoWorkerWave.ok, true);
assert.equal(yellowTwoWorkerWave.capacityTier, "yellow");
assert.equal(yellowTwoWorkerWave.maximumWorkersAtCurrentCapacity, 2);

const oversizedArtifacts = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "dispatch",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 15032385536,
  workers: 2,
  artifactBudgetBytes: 52428800,
});
assert.equal(oversizedArtifacts.ok, false);
assert.match(oversizedArtifacts.errors.join(" "), /per-worker policy/);

const sequentialHeavy = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "heavy",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 15032385536,
  workers: 1,
  artifactBudgetBytes: 0,
});
assert.equal(sequentialHeavy.ok, true);

const yellowSharedHeavy = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "heavy",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 7340032000,
  workers: 1,
  artifactBudgetBytes: 0,
});
assert.equal(yellowSharedHeavy.ok, true);
assert.equal(yellowSharedHeavy.capacityTier, "yellow");

const redSharedHeavy = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "heavy",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 958275584,
  commitChargePercent: 91.96,
  pageReadsPerSecond: 428.28,
  pageWritesPerSecond: 0,
  workers: 1,
  artifactBudgetBytes: 0,
});
assert.equal(redSharedHeavy.ok, false);
assert.equal(redSharedHeavy.capacityTier, "red");
assert.match(redSharedHeavy.errors.join(" "), /Red resource tier pauses shared/);

const parallelHeavy = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "heavy",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 15032385536,
  workers: 2,
  artifactBudgetBytes: 0,
});
assert.equal(parallelHeavy.ok, false);
assert.match(parallelHeavy.errors.join(" "), /sequentially/);

const boundedWorkerNetwork = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "network",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 15032385536,
  workers: 1,
  artifactBudgetBytes: policy.maximumArtifactBytesPerWorker,
});
assert.equal(boundedWorkerNetwork.ok, true);

const boundedNationalNetwork = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "national-network",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 15032385536,
  workers: 0,
  artifactBudgetBytes: 134217728,
});
assert.equal(boundedNationalNetwork.ok, true);

const oversizedNationalNetwork = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "national-network",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 15032385536,
  workers: 0,
  artifactBudgetBytes: policy.maximumNationalAcquisitionArtifactBytes + 1,
});
assert.equal(oversizedNationalNetwork.ok, false);
assert.match(oversizedNationalNetwork.errors.join(" "), /National acquisition artifact budget/);

const nationalNetworkWithWorkerReservation = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "national-network",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 15032385536,
  workers: 1,
  artifactBudgetBytes: 134217728,
});
assert.equal(nationalNetworkWithWorkerReservation.ok, false);
assert.match(nationalNetworkWithWorkerReservation.errors.join(" "), /does not accept worker reservations/);

const failedPostflight = evaluateDiskBudget(policy, {
  phase: "postflight",
  operation: "dispatch",
  availableBytes: 2147483648,
  totalBytes: 1999284203520,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 7340032000,
  workers: 0,
  artifactBudgetBytes: 0,
});
assert.equal(failedPostflight.ok, false);
assert.match(failedPostflight.errors.join(" "), /Free-space floor failed/);
assert.doesNotMatch(failedPostflight.errors.join(" "), /red tier/);

const redPostflight = evaluateDiskBudget(policy, {
  phase: "postflight",
  operation: "dispatch",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 958275584,
  commitChargePercent: 91.96,
  pageReadsPerSecond: 428.28,
  pageWritesPerSecond: 0,
  workers: 0,
  artifactBudgetBytes: 0,
});
assert.equal(redPostflight.ok, false);
assert.match(redPostflight.errors.join(" "), /entered the red tier/);

console.log("National disk budget tests passed.");
