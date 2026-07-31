import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ConcurrencyTier = {
  minimumTotalMemoryBytes: number;
  minimumFreeDiskBytes: number;
  maximumWorkers: number;
};

type WorkerClass = "acquisition" | "lightweight" | "artifact";
export type CapacityTier = "green" | "yellow" | "red";

type CapacityTierThresholds = {
  greenMinimumAvailableRamPercent: number;
  redBelowAvailableRamPercent: number;
  redAtOrAboveCommitChargePercent: number;
  redAtOrAbovePageReadsPerSecond: number;
  redAtOrAbovePageWritesPerSecond: number;
};

type WorkerClassCaps = Record<WorkerClass, number>;

export type NationalResourcePolicy = {
  schemaVersion: number;
  filesystemPath: string;
  minimumDiskHeadroomPercent: number;
  absoluteMinimumFreeBytes: number;
  preferredRamHeadroomPercent: number;
  minimumOperationalRamHeadroomPercent: number;
  reservedDiskBytesPerWorker: number;
  maximumArtifactBytesPerWorker: number;
  maximumNationalAcquisitionArtifactBytes: number;
  workerMemoryReservationsMb: Record<WorkerClass, number>;
  maximumWorkerWallMinutes: number;
  sharedHeavyTaskConcurrency: number;
  mainIntegrationConcurrency: number;
  capacityTierThresholds: CapacityTierThresholds;
  yellowConcurrencyCaps: WorkerClassCaps;
  redConcurrencyCaps: WorkerClassCaps;
  heavyAcquisitionConcurrencyTiers: ConcurrencyTier[];
  lightweightConcurrencyTiers: ConcurrencyTier[];
  artifactProcessingConcurrencyTiers: ConcurrencyTier[];
  providerPolicies: Record<string, unknown>;
  telemetryPolicy: Record<string, unknown>;
  disposablePaths: string[];
  protectedPaths: string[];
};

export type DiskBudgetInput = {
  phase: "preflight" | "postflight";
  operation:
    | "dispatch"
    | "lightweight-dispatch"
    | "artifact-dispatch"
    | "heavy"
    | "network"
    | "national-network";
  availableBytes: number;
  totalBytes: number;
  availableMemoryBytes: number;
  totalMemoryBytes: number;
  workers: number;
  artifactBudgetBytes: number;
  commitChargePercent?: number;
  pageReadsPerSecond?: number;
  pageWritesPerSecond?: number;
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
  minimumDiskHeadroomBytes: number;
  requiredAvailableMemoryBytes: number;
  projectedAvailableMemoryBytes: number;
  workerClass: WorkerClass | null;
  capacityTier: CapacityTier;
  capacityTierReasons: string[];
  errors: string[];
};

const isFiniteNonnegativeInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) >= 0;

export function validateNationalResourcePolicy(policy: NationalResourcePolicy): string[] {
  const errors: string[] = [];
  const byteFields: Array<keyof NationalResourcePolicy> = [
    "absoluteMinimumFreeBytes",
    "reservedDiskBytesPerWorker",
    "maximumArtifactBytesPerWorker",
    "maximumNationalAcquisitionArtifactBytes",
  ];

  if (policy.schemaVersion !== 3) errors.push("Unsupported resource policy schema version.");
  if (!path.isAbsolute(policy.filesystemPath)) errors.push("Resource policy filesystemPath must be absolute.");
  for (const field of byteFields) {
    if (!isFiniteNonnegativeInteger(policy[field])) errors.push(`${field} must be a nonnegative integer.`);
  }
  if (
    !Number.isFinite(policy.minimumDiskHeadroomPercent) ||
    policy.minimumDiskHeadroomPercent <= 0 ||
    policy.minimumDiskHeadroomPercent >= 100
  ) {
    errors.push("minimumDiskHeadroomPercent must be between zero and 100.");
  }
  if (
    !Number.isFinite(policy.preferredRamHeadroomPercent) ||
    policy.preferredRamHeadroomPercent <= 0 ||
    policy.preferredRamHeadroomPercent >= 100
  ) {
    errors.push("preferredRamHeadroomPercent must be between zero and 100.");
  }
  if (
    !Number.isFinite(policy.minimumOperationalRamHeadroomPercent) ||
    policy.minimumOperationalRamHeadroomPercent <= 0 ||
    policy.minimumOperationalRamHeadroomPercent >= policy.preferredRamHeadroomPercent
  ) {
    errors.push(
      "minimumOperationalRamHeadroomPercent must be positive and below preferredRamHeadroomPercent.",
    );
  }
  for (const workerClass of ["acquisition", "lightweight", "artifact"] as const) {
    const reservation = policy.workerMemoryReservationsMb?.[workerClass];
    if (!Number.isInteger(reservation) || reservation <= 0) {
      errors.push(`workerMemoryReservationsMb.${workerClass} must be a positive integer.`);
    }
  }
  if (!Number.isInteger(policy.maximumWorkerWallMinutes) || policy.maximumWorkerWallMinutes <= 0) {
    errors.push("maximumWorkerWallMinutes must be a positive integer.");
  }
  if (policy.sharedHeavyTaskConcurrency !== 1) {
    errors.push("Shared compilers, generators, builds, and deployments must remain exactly sequential.");
  }
  if (policy.mainIntegrationConcurrency !== 1) {
    errors.push("MAIN integration concurrency must remain exactly one.");
  }
  const thresholds = policy.capacityTierThresholds;
  if (!thresholds || typeof thresholds !== "object") {
    errors.push("capacityTierThresholds is required.");
  } else {
    const thresholdEntries = Object.entries(thresholds);
    for (const [label, value] of thresholdEntries) {
      if (!Number.isFinite(value) || value < 0) {
        errors.push(`capacityTierThresholds.${label} must be a nonnegative number.`);
      }
    }
    if (
      thresholds.greenMinimumAvailableRamPercent !== policy.preferredRamHeadroomPercent ||
      thresholds.redBelowAvailableRamPercent !== policy.minimumOperationalRamHeadroomPercent
    ) {
      errors.push("Capacity-tier RAM thresholds must match the policy headroom percentages.");
    }
  }
  for (const [label, caps, maximums] of [
    ["yellowConcurrencyCaps", policy.yellowConcurrencyCaps, { acquisition: 2, lightweight: 6, artifact: 1 }],
    ["redConcurrencyCaps", policy.redConcurrencyCaps, { acquisition: 0, lightweight: 0, artifact: 0 }],
  ] as const) {
    if (!caps || typeof caps !== "object") {
      errors.push(`${label} is required.`);
      continue;
    }
    for (const workerClass of ["acquisition", "lightweight", "artifact"] as const) {
      if (!Number.isInteger(caps[workerClass]) || caps[workerClass] < 0 || caps[workerClass] > maximums[workerClass]) {
        errors.push(`${label}.${workerClass} is outside the allowed adaptive envelope.`);
      }
    }
  }
  const tierSets: Array<[string, ConcurrencyTier[] | undefined, number]> = [
    ["heavyAcquisitionConcurrencyTiers", policy.heavyAcquisitionConcurrencyTiers, 8],
    ["lightweightConcurrencyTiers", policy.lightweightConcurrencyTiers, 16],
    ["artifactProcessingConcurrencyTiers", policy.artifactProcessingConcurrencyTiers, 4],
  ];
  for (const [label, tiers, maximumAllowed] of tierSets) {
    if (!Array.isArray(tiers) || tiers.length === 0) {
      errors.push(`At least one ${label} entry is required.`);
      continue;
    }
    let previousMemory = -1;
    let previousDisk = -1;
    let previousMaximum = 0;
    for (const tier of tiers) {
      if (!isFiniteNonnegativeInteger(tier.minimumTotalMemoryBytes)) {
        errors.push(`${label} minimumTotalMemoryBytes is invalid.`);
      }
      if (!isFiniteNonnegativeInteger(tier.minimumFreeDiskBytes)) {
        errors.push(`${label} minimumFreeDiskBytes is invalid.`);
      }
      if (
        !Number.isInteger(tier.maximumWorkers) ||
        tier.maximumWorkers <= 0 ||
        tier.maximumWorkers > maximumAllowed
      ) {
        errors.push(`${label} maximumWorkers must be between one and ${maximumAllowed}.`);
      }
      if (tier.minimumTotalMemoryBytes <= previousMemory) {
        errors.push(`${label} memory thresholds must increase.`);
      }
      if (tier.minimumFreeDiskBytes <= previousDisk) {
        errors.push(`${label} disk thresholds must increase.`);
      }
      if (tier.maximumWorkers < previousMaximum) {
        errors.push(`${label} cannot reduce the worker limit.`);
      }
      previousMemory = tier.minimumTotalMemoryBytes;
      previousDisk = tier.minimumFreeDiskBytes;
      previousMaximum = tier.maximumWorkers;
    }
  }
  if (!policy.providerPolicies || typeof policy.providerPolicies !== "object") {
    errors.push("providerPolicies is required.");
  }
  if (!policy.telemetryPolicy || typeof policy.telemetryPolicy !== "object") {
    errors.push("telemetryPolicy is required.");
  }
  if (!Array.isArray(policy.disposablePaths) || !Array.isArray(policy.protectedPaths)) {
    errors.push("Disposable and protected path lists are required.");
  }
  return errors;
}

function tiersForClass(policy: NationalResourcePolicy, workerClass: WorkerClass): ConcurrencyTier[] {
  if (workerClass === "acquisition") return policy.heavyAcquisitionConcurrencyTiers;
  if (workerClass === "artifact") return policy.artifactProcessingConcurrencyTiers;
  return policy.lightweightConcurrencyTiers;
}

function diskHeadroomBytes(policy: NationalResourcePolicy, totalBytes: number): number {
  return Math.max(
    policy.absoluteMinimumFreeBytes,
    Math.ceil((totalBytes * policy.minimumDiskHeadroomPercent) / 100),
  );
}

function ramHeadroomBytes(
  policy: NationalResourcePolicy,
  totalMemoryBytes: number,
  capacityTier: CapacityTier,
): number {
  const percentage =
    capacityTier === "green"
      ? policy.preferredRamHeadroomPercent
      : policy.minimumOperationalRamHeadroomPercent;
  return Math.ceil((totalMemoryBytes * percentage) / 100);
}

export function classifyCapacityTier(
  policy: NationalResourcePolicy,
  resources: Pick<
    DiskBudgetInput,
    | "availableMemoryBytes"
    | "totalMemoryBytes"
    | "commitChargePercent"
    | "pageReadsPerSecond"
    | "pageWritesPerSecond"
  >,
): { tier: CapacityTier; reasons: string[] } {
  const availableRamPercent =
    resources.totalMemoryBytes > 0
      ? (resources.availableMemoryBytes / resources.totalMemoryBytes) * 100
      : 0;
  const thresholds = policy.capacityTierThresholds;
  const redReasons: string[] = [];
  if (availableRamPercent < thresholds.redBelowAvailableRamPercent) {
    redReasons.push(
      `available RAM ${availableRamPercent.toFixed(2)} percent is below ${thresholds.redBelowAvailableRamPercent} percent`,
    );
  }
  if (
    resources.commitChargePercent !== undefined &&
    resources.commitChargePercent >= thresholds.redAtOrAboveCommitChargePercent
  ) {
    redReasons.push(
      `commit charge ${resources.commitChargePercent.toFixed(2)} percent is at or above ${thresholds.redAtOrAboveCommitChargePercent} percent`,
    );
  }
  if (
    resources.pageReadsPerSecond !== undefined &&
    resources.pageReadsPerSecond >= thresholds.redAtOrAbovePageReadsPerSecond
  ) {
    redReasons.push(
      `page reads ${resources.pageReadsPerSecond.toFixed(2)} per second are at or above ${thresholds.redAtOrAbovePageReadsPerSecond}`,
    );
  }
  if (
    resources.pageWritesPerSecond !== undefined &&
    resources.pageWritesPerSecond >= thresholds.redAtOrAbovePageWritesPerSecond
  ) {
    redReasons.push(
      `page writes ${resources.pageWritesPerSecond.toFixed(2)} per second are at or above ${thresholds.redAtOrAbovePageWritesPerSecond}`,
    );
  }
  if (redReasons.length > 0) return { tier: "red", reasons: redReasons };
  if (availableRamPercent >= thresholds.greenMinimumAvailableRamPercent) {
    return {
      tier: "green",
      reasons: [
        `available RAM ${availableRamPercent.toFixed(2)} percent meets the preferred ${thresholds.greenMinimumAvailableRamPercent} percent target`,
      ],
    };
  }
  return {
    tier: "yellow",
    reasons: [
      `available RAM ${availableRamPercent.toFixed(2)} percent is below the preferred ${thresholds.greenMinimumAvailableRamPercent} percent target but above the red threshold`,
    ],
  };
}

export function maximumWorkersForResources(
  policy: NationalResourcePolicy,
  workerClass: WorkerClass,
  resources: Pick<
    DiskBudgetInput,
    | "availableBytes"
    | "totalBytes"
    | "availableMemoryBytes"
    | "totalMemoryBytes"
    | "commitChargePercent"
    | "pageReadsPerSecond"
    | "pageWritesPerSecond"
  >,
): number {
  const { tier: capacityTier } = classifyCapacityTier(policy, resources);
  if (capacityTier === "red") return policy.redConcurrencyCaps[workerClass];
  let tierMaximum = 0;
  for (const tier of tiersForClass(policy, workerClass)) {
    if (
      resources.availableBytes >= tier.minimumFreeDiskBytes &&
      resources.totalMemoryBytes >= tier.minimumTotalMemoryBytes
    ) {
      tierMaximum = tier.maximumWorkers;
    }
  }
  const availableDiskForWorkers = Math.max(
    0,
    resources.availableBytes - diskHeadroomBytes(policy, resources.totalBytes),
  );
  const diskMaximum = Math.floor(availableDiskForWorkers / policy.reservedDiskBytesPerWorker);
  const availableMemoryForWorkers = Math.max(
    0,
    resources.availableMemoryBytes -
      ramHeadroomBytes(policy, resources.totalMemoryBytes, capacityTier),
  );
  const memoryReservationBytes = policy.workerMemoryReservationsMb[workerClass] * 1024 * 1024;
  const memoryMaximum = Math.floor(availableMemoryForWorkers / memoryReservationBytes);
  const adaptiveMaximum =
    capacityTier === "yellow"
      ? policy.yellowConcurrencyCaps[workerClass]
      : tierMaximum;
  return Math.max(0, Math.min(tierMaximum, adaptiveMaximum, diskMaximum, memoryMaximum));
}

export function evaluateDiskBudget(
  policy: NationalResourcePolicy,
  input: DiskBudgetInput,
): DiskBudgetResult {
  const errors = validateNationalResourcePolicy(policy);
  if (!isFiniteNonnegativeInteger(input.availableBytes)) errors.push("availableBytes must be a nonnegative integer.");
  if (!isFiniteNonnegativeInteger(input.totalBytes) || input.totalBytes === 0) {
    errors.push("totalBytes must be a positive integer.");
  }
  if (!isFiniteNonnegativeInteger(input.availableMemoryBytes)) {
    errors.push("availableMemoryBytes must be a nonnegative integer.");
  }
  if (!isFiniteNonnegativeInteger(input.totalMemoryBytes) || input.totalMemoryBytes === 0) {
    errors.push("totalMemoryBytes must be a positive integer.");
  }
  if (!isFiniteNonnegativeInteger(input.workers)) errors.push("workers must be a nonnegative integer.");
  if (!isFiniteNonnegativeInteger(input.artifactBudgetBytes)) {
    errors.push("artifactBudgetBytes must be a nonnegative integer.");
  }

  const workerClass: WorkerClass | null =
    input.operation === "dispatch" || input.operation === "network"
      ? "acquisition"
      : input.operation === "lightweight-dispatch"
        ? "lightweight"
        : input.operation === "artifact-dispatch"
          ? "artifact"
          : null;
  const resourceSnapshot = {
    availableBytes: input.availableBytes,
    totalBytes: input.totalBytes,
    availableMemoryBytes: input.availableMemoryBytes,
    totalMemoryBytes: input.totalMemoryBytes,
    commitChargePercent: input.commitChargePercent,
    pageReadsPerSecond: input.pageReadsPerSecond,
    pageWritesPerSecond: input.pageWritesPerSecond,
  };
  const { tier: capacityTier, reasons: capacityTierReasons } = classifyCapacityTier(
    policy,
    resourceSnapshot,
  );
  const maximumWorkersAtCurrentCapacity = workerClass
    ? maximumWorkersForResources(policy, workerClass, resourceSnapshot)
    : 0;
  const minimumDiskHeadroomBytes = diskHeadroomBytes(policy, input.totalBytes);
  const minimumRamHeadroomBytes = ramHeadroomBytes(
    policy,
    input.totalMemoryBytes,
    capacityTier,
  );
  const memoryReservationBytes = workerClass
    ? policy.workerMemoryReservationsMb[workerClass] * 1024 * 1024
    : 0;
  const requiredAvailableMemoryBytes =
    minimumRamHeadroomBytes + input.workers * memoryReservationBytes;
  const projectedAvailableMemoryBytes =
    input.availableMemoryBytes - input.workers * memoryReservationBytes;
  let requiredBytes = minimumDiskHeadroomBytes;

  if (
    input.phase === "preflight" &&
    ["dispatch", "lightweight-dispatch", "artifact-dispatch"].includes(input.operation)
  ) {
    requiredBytes =
      minimumDiskHeadroomBytes +
      input.workers * policy.reservedDiskBytesPerWorker +
      input.artifactBudgetBytes;
    if (input.workers < 1) errors.push("Dispatch preflight requires at least one worker.");
    if (input.workers > maximumWorkersAtCurrentCapacity) {
      errors.push(
        `Requested ${input.workers} workers but current resources permit at most ${maximumWorkersAtCurrentCapacity}.`,
      );
    }
    if (input.artifactBudgetBytes > input.workers * policy.maximumArtifactBytesPerWorker) {
      errors.push("Declared artifact budgets exceed the per-worker policy.");
    }
  } else if (input.phase === "preflight" && input.operation === "heavy") {
    requiredBytes = minimumDiskHeadroomBytes;
    if (input.workers > policy.sharedHeavyTaskConcurrency) {
      errors.push("Heavy compilers, builds, and archive expansion must run sequentially.");
    }
    if (capacityTier === "red") {
      errors.push("Red resource tier pauses shared compilers, builds, and archive expansion.");
    }
  } else if (input.phase === "preflight" && input.operation === "network") {
    requiredBytes = minimumDiskHeadroomBytes + input.artifactBudgetBytes;
    if (input.workers > maximumWorkersAtCurrentCapacity) {
      errors.push(
        `Requested ${input.workers} workers but current resources permit at most ${maximumWorkersAtCurrentCapacity}.`,
      );
    }
    if (input.artifactBudgetBytes > policy.maximumArtifactBytesPerWorker) {
      errors.push("Network acquisition artifact budget exceeds the bounded policy.");
    }
  } else if (input.phase === "preflight" && input.operation === "national-network") {
    requiredBytes = minimumDiskHeadroomBytes + input.artifactBudgetBytes;
    if (input.workers !== 0) {
      errors.push("MAIN national acquisition preflight does not accept worker reservations.");
    }
    if (input.artifactBudgetBytes > policy.maximumNationalAcquisitionArtifactBytes) {
      errors.push("National acquisition artifact budget exceeds the bounded policy.");
    }
    if (capacityTier === "red") {
      errors.push("Red resource tier pauses MAIN national acquisition.");
    }
  }

  if (input.availableBytes < requiredBytes) {
    errors.push(`Free-space floor failed: ${input.availableBytes} available, ${requiredBytes} required.`);
  }
  if (input.phase === "preflight" && input.availableMemoryBytes < requiredAvailableMemoryBytes) {
    errors.push(
      workerClass
        ? `RAM headroom failed: ${input.availableMemoryBytes} available, ${requiredAvailableMemoryBytes} required for ${input.workers} ${workerClass} workers.`
        : `RAM headroom failed: ${input.availableMemoryBytes} available, ${requiredAvailableMemoryBytes} required before ${input.operation}.`,
    );
  }
  if (input.phase === "postflight" && capacityTier === "red") {
    errors.push(
      `Postflight resources entered the red tier: ${capacityTierReasons.join("; ")}.`,
    );
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
    minimumDiskHeadroomBytes,
    requiredAvailableMemoryBytes,
    projectedAvailableMemoryBytes,
    workerClass,
    capacityTier,
    capacityTierReasons,
    errors,
  };
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${label} must be a nonnegative integer.`);
  return parsed;
}

function parseOptionalNonnegativeNumber(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a nonnegative number.`);
  }
  return parsed;
}

function readFilesystemCapacity(filesystemPath: string): { availableBytes: number; totalBytes: number } {
  const stat = fs.statfsSync(filesystemPath, { bigint: true });
  return {
    availableBytes: Number(stat.bavail * stat.bsize),
    totalBytes: Number(stat.blocks * stat.bsize),
  };
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
  if (
    ![
      "dispatch",
      "lightweight-dispatch",
      "artifact-dispatch",
      "heavy",
      "network",
      "national-network",
    ].includes(operation)
  ) {
    throw new Error("Unsupported disk-check operation.");
  }
  const workers = parsePositiveInteger(argumentValue(args, "--workers") ?? "0", "workers");
  const artifactBudgetBytes = parsePositiveInteger(
    argumentValue(args, "--artifact-budget-bytes") ?? "0",
    "artifact-budget-bytes",
  );
  const filesystem = readFilesystemCapacity(policy.filesystemPath);
  const result = evaluateDiskBudget(policy, {
    phase,
    operation,
    availableBytes: filesystem.availableBytes,
    totalBytes: filesystem.totalBytes,
    availableMemoryBytes: os.freemem(),
    totalMemoryBytes: os.totalmem(),
    workers,
    artifactBudgetBytes,
    commitChargePercent: parseOptionalNonnegativeNumber(
      argumentValue(args, "--commit-charge-percent"),
      "commit-charge-percent",
    ),
    pageReadsPerSecond: parseOptionalNonnegativeNumber(
      argumentValue(args, "--page-reads-per-second"),
      "page-reads-per-second",
    ),
    pageWritesPerSecond: parseOptionalNonnegativeNumber(
      argumentValue(args, "--page-writes-per-second"),
      "page-writes-per-second",
    ),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli();
}
