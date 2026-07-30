import assert from "node:assert/strict";
import fs from "node:fs";
import {
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
  0,
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
assert.match(blockedCurrentMemoryWave.errors.join(" "), /at most 0/);
assert.match(blockedCurrentMemoryWave.errors.join(" "), /RAM headroom failed/);

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

const memoryBlockedSharedHeavy = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "heavy",
  ...desktopDisk,
  totalMemoryBytes: 33450536960,
  availableMemoryBytes: 7340032000,
  workers: 1,
  artifactBudgetBytes: 0,
});
assert.equal(memoryBlockedSharedHeavy.ok, false);
assert.match(memoryBlockedSharedHeavy.errors.join(" "), /RAM headroom failed/);

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
assert.match(failedPostflight.errors.join(" "), /RAM headroom floor failed/);

console.log("National disk budget tests passed.");
