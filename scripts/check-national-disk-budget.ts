import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ConcurrencyTier = {
  minimumFreeBytes: number;
  maximumWorkers: number;
};

export type NationalResourcePolicy = {
  schemaVersion: number;
  filesystemPath: string;
  minimumFreeBytesBeforeDispatch: number;
  minimumFreeBytesAfterWorker: number;
  minimumFreeBytesBeforeHeavyTask: number;
  reservedBytesPerWorker: number;
  maximumArtifactBytesPerWorker: number;
  maximumNationalAcquisitionArtifactBytes: number;
  maximumWorkerMemoryMb: number;
  maximumWorkerWallMinutes: number;
  heavyTaskConcurrency: number;
  lightweightConcurrencyTiers: ConcurrencyTier[];
  disposablePaths: string[];
  protectedPaths: string[];
};

export type DiskBudgetInput = {
  phase: "preflight" | "postflight";
  operation: "dispatch" | "heavy" | "network" | "national-network";
  availableBytes: number;
  workers: number;
  artifactBudgetBytes: number;
};

export type DiskBudgetResult = {
  ok: boolean;
  phase: DiskBudgetInput["phase"];
  operation: DiskBudgetInput["operation"];
  availableBytes: number;
  requiredBytes: number;
  projectedHeadroomBytes: number;
  requestedWorkers: number;
  maximumWorkersAtCurrentCapacity: number;
  artifactBudgetBytes: number;
  errors: string[];
};

const isFiniteNonnegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0;

export function validateNationalResourcePolicy(policy: NationalResourcePolicy): string[] {
  const errors: string[] = [];
  const byteFields: Array<keyof NationalResourcePolicy> = [
    "minimumFreeBytesBeforeDispatch",
    "minimumFreeBytesAfterWorker",
    "minimumFreeBytesBeforeHeavyTask",
    "reservedBytesPerWorker",
    "maximumArtifactBytesPerWorker",
    "maximumNationalAcquisitionArtifactBytes",
  ];

  if (policy.schemaVersion !== 1) errors.push("Unsupported resource policy schema version.");
  if (!path.isAbsolute(policy.filesystemPath)) errors.push("Resource policy filesystemPath must be absolute.");
  for (const field of byteFields) {
    if (!isFiniteNonnegativeInteger(policy[field])) errors.push(`${field} must be a nonnegative integer.`);
  }
  if (!Number.isInteger(policy.maximumWorkerMemoryMb) || policy.maximumWorkerMemoryMb <= 0) {
    errors.push("maximumWorkerMemoryMb must be a positive integer.");
  }
  if (!Number.isInteger(policy.maximumWorkerWallMinutes) || policy.maximumWorkerWallMinutes <= 0) {
    errors.push("maximumWorkerWallMinutes must be a positive integer.");
  }
  if (policy.heavyTaskConcurrency !== 1) errors.push("Heavy task concurrency must remain exactly one.");
  if (!Array.isArray(policy.lightweightConcurrencyTiers) || policy.lightweightConcurrencyTiers.length === 0) {
    errors.push("At least one lightweight concurrency tier is required.");
  } else {
    let previousMinimum = -1;
    let previousMaximum = 0;
    for (const tier of policy.lightweightConcurrencyTiers) {
      if (!isFiniteNonnegativeInteger(tier.minimumFreeBytes)) errors.push("Tier minimumFreeBytes is invalid.");
      if (!Number.isInteger(tier.maximumWorkers) || tier.maximumWorkers <= 0 || tier.maximumWorkers > 10) {
        errors.push("Tier maximumWorkers must be between one and ten.");
      }
      if (tier.minimumFreeBytes <= previousMinimum) errors.push("Concurrency tiers must have increasing free-space thresholds.");
      if (tier.maximumWorkers < previousMaximum) errors.push("Concurrency tiers cannot reduce the worker limit.");
      previousMinimum = tier.minimumFreeBytes;
      previousMaximum = tier.maximumWorkers;
    }
  }
  if (!Array.isArray(policy.disposablePaths) || !Array.isArray(policy.protectedPaths)) {
    errors.push("Disposable and protected path lists are required.");
  }
  return errors;
}

export function maximumWorkersForBytes(policy: NationalResourcePolicy, availableBytes: number): number {
  let maximumWorkers = 0;
  for (const tier of policy.lightweightConcurrencyTiers) {
    if (availableBytes >= tier.minimumFreeBytes) maximumWorkers = tier.maximumWorkers;
  }
  return maximumWorkers;
}

export function evaluateDiskBudget(
  policy: NationalResourcePolicy,
  input: DiskBudgetInput,
): DiskBudgetResult {
  const errors = validateNationalResourcePolicy(policy);
  if (!isFiniteNonnegativeInteger(input.availableBytes)) errors.push("availableBytes must be a nonnegative integer.");
  if (!isFiniteNonnegativeInteger(input.workers)) errors.push("workers must be a nonnegative integer.");
  if (!isFiniteNonnegativeInteger(input.artifactBudgetBytes)) {
    errors.push("artifactBudgetBytes must be a nonnegative integer.");
  }

  const maximumWorkersAtCurrentCapacity = maximumWorkersForBytes(policy, input.availableBytes);
  let requiredBytes = policy.minimumFreeBytesAfterWorker;

  if (input.phase === "preflight" && input.operation === "dispatch") {
    requiredBytes =
      policy.minimumFreeBytesBeforeDispatch +
      input.workers * policy.reservedBytesPerWorker +
      input.artifactBudgetBytes;
    if (input.workers < 1) errors.push("Dispatch preflight requires at least one worker.");
    if (input.workers > maximumWorkersAtCurrentCapacity) {
      errors.push(
        `Requested ${input.workers} workers but current free space permits at most ${maximumWorkersAtCurrentCapacity}.`,
      );
    }
    if (input.artifactBudgetBytes > input.workers * policy.maximumArtifactBytesPerWorker) {
      errors.push("Declared artifact budgets exceed the per-worker policy.");
    }
  } else if (input.phase === "preflight" && input.operation === "heavy") {
    requiredBytes = policy.minimumFreeBytesBeforeHeavyTask;
    if (input.workers > policy.heavyTaskConcurrency) {
      errors.push("Heavy compilers, builds, and archive expansion must run sequentially.");
    }
  } else if (input.phase === "preflight" && input.operation === "network") {
    requiredBytes = policy.minimumFreeBytesBeforeDispatch + input.artifactBudgetBytes;
    if (input.artifactBudgetBytes > policy.maximumArtifactBytesPerWorker) {
      errors.push("Network acquisition artifact budget exceeds the bounded policy.");
    }
  } else if (input.phase === "preflight" && input.operation === "national-network") {
    requiredBytes = policy.minimumFreeBytesBeforeDispatch + input.artifactBudgetBytes;
    if (input.workers !== 0) {
      errors.push("MAIN national acquisition preflight does not accept worker reservations.");
    }
    if (input.artifactBudgetBytes > policy.maximumNationalAcquisitionArtifactBytes) {
      errors.push("National acquisition artifact budget exceeds the bounded policy.");
    }
  }

  if (input.availableBytes < requiredBytes) {
    errors.push(`Free-space floor failed: ${input.availableBytes} available, ${requiredBytes} required.`);
  }

  return {
    ok: errors.length === 0,
    phase: input.phase,
    operation: input.operation,
    availableBytes: input.availableBytes,
    requiredBytes,
    projectedHeadroomBytes: input.availableBytes - requiredBytes,
    requestedWorkers: input.workers,
    maximumWorkersAtCurrentCapacity,
    artifactBudgetBytes: input.artifactBudgetBytes,
    errors,
  };
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a nonnegative integer.`);
  return parsed;
}

function readAvailableBytes(filesystemPath: string): number {
  const stat = fs.statfsSync(filesystemPath, { bigint: true });
  return Number(stat.bavail * stat.bsize);
}

function argumentValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function runCli(): void {
  const args = process.argv.slice(2);
  const policyPath = path.resolve(
    argumentValue(args, "--policy") ?? "ops/national-research/resource-policy.json",
  );
  const policy = JSON.parse(fs.readFileSync(policyPath, "utf8")) as NationalResourcePolicy;
  const phase = (argumentValue(args, "--phase") ?? "preflight") as DiskBudgetInput["phase"];
  const operation = (argumentValue(args, "--operation") ?? "dispatch") as DiskBudgetInput["operation"];
  if (!["preflight", "postflight"].includes(phase)) throw new Error("Unsupported disk-check phase.");
  if (!["dispatch", "heavy", "network", "national-network"].includes(operation)) {
    throw new Error("Unsupported disk-check operation.");
  }
  const workers = parsePositiveInteger(argumentValue(args, "--workers") ?? "0", "workers");
  const artifactBudgetBytes = parsePositiveInteger(
    argumentValue(args, "--artifact-budget-bytes") ?? "0",
    "artifact-budget-bytes",
  );
  const availableBytes = readAvailableBytes(policy.filesystemPath);
  const result = evaluateDiskBudget(policy, {
    phase,
    operation,
    availableBytes,
    workers,
    artifactBudgetBytes,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli();
}
