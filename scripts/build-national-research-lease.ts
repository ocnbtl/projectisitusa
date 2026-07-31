import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type Job = {
  jobId: string;
  state: string;
  expiresAt: string;
  stateOrSourceScope: unknown;
  taxaOrPairScope: unknown;
  scopeClaims: string[];
  branch: string;
  worktree: string;
  baseSha: string;
  expectedReceiptCodeCommit?: string;
  permittedPaths: string[];
  prohibitedPaths: string[];
  skillPins: unknown[];
  expectedOutputs: string[];
  retryPolicy: unknown;
  resourcePolicy: unknown;
  completionCriteria: string[];
};

type Lease = { leaseId: string; jobId: string; attempt: number };
type JobsFile = { jobs: Job[] };
type LeasesFile = { leases: Lease[] };

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function argument(args: string[], name: string): string {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : "";
  assert(value, `--${name} is required.`);
  return value;
}

const args = process.argv.slice(2);
const jobId = argument(args, "job-id");
const leaseId = argument(args, "lease-id");
const workerTaskId = argument(args, "worker-task-id");
const claimedAt = new Date(argument(args, "claimed-at")).toISOString();
const outputPath = path.resolve(argument(args, "output"));
const jobs = JSON.parse(
  readFileSync(path.join(ROOT, "ops/national-research/jobs.json"), "utf8"),
) as JobsFile;
const leases = JSON.parse(
  readFileSync(path.join(ROOT, "ops/national-research/leases.json"), "utf8"),
) as LeasesFile;
const job = jobs.jobs.find((entry) => entry.jobId === jobId);
assert(job, `Unknown job ${jobId}.`);
assert(job.state === "planned", `Job ${jobId} is not planned.`);
assert(
  !leases.leases.some((entry) => entry.leaseId === leaseId),
  `Lease ${leaseId} already exists.`,
);
const priorAttempts = leases.leases
  .filter((entry) => entry.jobId === jobId)
  .sort((left, right) => right.attempt - left.attempt);
const attempt = (priorAttempts[0]?.attempt ?? 0) + 1;
const permittedRun = job.permittedPaths.find((entry) => entry.endsWith("/**"));
assert(permittedRun, `Job ${jobId} lacks one immutable run path.`);
const expectedManifestPath = `${permittedRun.slice(0, -3)}/manifest.json`;

const lease = {
  leaseId,
  jobId,
  attempt,
  previousLeaseId: priorAttempts[0]?.leaseId ?? null,
  workerTaskId,
  state: "active",
  claimedAt,
  expiresAt: job.expiresAt,
  recoveryAt: null,
  recoveryReason: null,
  stateOrSourceScope: job.stateOrSourceScope,
  taxaOrPairScope: job.taxaOrPairScope,
  scopeClaims: job.scopeClaims,
  branch: job.branch,
  worktree: job.worktree,
  baseSha: job.baseSha,
  expectedReceiptCodeCommit:
    job.expectedReceiptCodeCommit ?? job.baseSha,
  permittedPaths: job.permittedPaths,
  prohibitedPaths: job.prohibitedPaths,
  skillPins: job.skillPins,
  expectedOutputs: job.expectedOutputs,
  expectedManifestPath,
  retryPolicy: job.retryPolicy,
  resourcePolicy: job.resourcePolicy,
  completionCriteria: job.completionCriteria,
};
writeFileSync(outputPath, `${JSON.stringify(lease, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify(
    {
      outputPath,
      leaseId,
      jobId,
      attempt,
      expectedManifestPath,
    },
    null,
    2,
  )}\n`,
);
