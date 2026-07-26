import assert from "node:assert/strict";
import fs from "node:fs";
import {
  evaluateDiskBudget,
  maximumWorkersForBytes,
  type NationalResourcePolicy,
  validateNationalResourcePolicy,
} from "./check-national-disk-budget";

const policy = JSON.parse(
  fs.readFileSync("ops/national-research/resource-policy.json", "utf8"),
) as NationalResourcePolicy;

assert.deepEqual(validateNationalResourcePolicy(policy), []);
assert.equal(maximumWorkersForBytes(policy, 3221225471), 0);
assert.equal(maximumWorkersForBytes(policy, 3221225472), 2);
assert.equal(maximumWorkersForBytes(policy, 8589934592), 5);
assert.equal(maximumWorkersForBytes(policy, 17179869184), 10);

const twoWorkerCanary = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "dispatch",
  availableBytes: 4563402752,
  workers: 2,
  artifactBudgetBytes: 31457280,
});
assert.equal(twoWorkerCanary.ok, true);
assert.equal(twoWorkerCanary.maximumWorkersAtCurrentCapacity, 2);

const unsafeFiveWorkerWave = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "dispatch",
  availableBytes: 4563402752,
  workers: 5,
  artifactBudgetBytes: 52428800,
});
assert.equal(unsafeFiveWorkerWave.ok, false);
assert.match(unsafeFiveWorkerWave.errors.join(" "), /at most 2/);

const oversizedArtifacts = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "dispatch",
  availableBytes: 17179869184,
  workers: 2,
  artifactBudgetBytes: 52428800,
});
assert.equal(oversizedArtifacts.ok, false);
assert.match(oversizedArtifacts.errors.join(" "), /per-worker policy/);

const sequentialHeavy = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "heavy",
  availableBytes: 5368709120,
  workers: 1,
  artifactBudgetBytes: 0,
});
assert.equal(sequentialHeavy.ok, true);

const parallelHeavy = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "heavy",
  availableBytes: 5368709120,
  workers: 2,
  artifactBudgetBytes: 0,
});
assert.equal(parallelHeavy.ok, false);
assert.match(parallelHeavy.errors.join(" "), /sequentially/);

const boundedWorkerNetwork = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "network",
  availableBytes: 8589934592,
  workers: 1,
  artifactBudgetBytes: policy.maximumArtifactBytesPerWorker,
});
assert.equal(boundedWorkerNetwork.ok, true);

const boundedNationalNetwork = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "national-network",
  availableBytes: 8589934592,
  workers: 0,
  artifactBudgetBytes: 134217728,
});
assert.equal(boundedNationalNetwork.ok, true);

const oversizedNationalNetwork = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "national-network",
  availableBytes: 8589934592,
  workers: 0,
  artifactBudgetBytes: policy.maximumNationalAcquisitionArtifactBytes + 1,
});
assert.equal(oversizedNationalNetwork.ok, false);
assert.match(oversizedNationalNetwork.errors.join(" "), /National acquisition artifact budget/);

const nationalNetworkWithWorkerReservation = evaluateDiskBudget(policy, {
  phase: "preflight",
  operation: "national-network",
  availableBytes: 8589934592,
  workers: 1,
  artifactBudgetBytes: 134217728,
});
assert.equal(nationalNetworkWithWorkerReservation.ok, false);
assert.match(nationalNetworkWithWorkerReservation.errors.join(" "), /does not accept worker reservations/);

const failedPostflight = evaluateDiskBudget(policy, {
  phase: "postflight",
  operation: "dispatch",
  availableBytes: 2147483648,
  workers: 0,
  artifactBudgetBytes: 0,
});
assert.equal(failedPostflight.ok, false);
assert.match(failedPostflight.errors.join(" "), /Free-space floor failed/);

console.log("National disk budget tests passed.");
