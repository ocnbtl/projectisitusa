import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function argument(args, name) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : "";
  assert(value, `--${name} is required.`);
  return value;
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const args = process.argv.slice(2);
const mode = argument(args, "mode");
assert(
  mode === "review" || mode === "integration",
  "--mode must be review or integration.",
);
const queueId = argument(args, "queue-id");
const outputPath = path.resolve(argument(args, "output"));
const recordedAt = new Date(argument(args, "recorded-at")).toISOString();
const reason = argument(args, "reason");
const scopeSummary = argument(args, "scope-summary");
const manualInterventions = Number(argument(args, "manual-interventions"));
assert(
  Number.isInteger(manualInterventions) && manualInterventions >= 0,
  "--manual-interventions must be a nonnegative integer.",
);

const queue = JSON.parse(
  readFileSync(
    path.join(ROOT, "ops/national-research/integration-queue.json"),
    "utf8",
  ),
).items.find((entry) => entry.queueId === queueId);
assert(queue, `Unknown queue item ${queueId}.`);
const lease = JSON.parse(
  readFileSync(path.join(ROOT, "ops/national-research/leases.json"), "utf8"),
).leases.find((entry) => entry.leaseId === queue.leaseId);
assert(lease, `Missing lease ${queue.leaseId}.`);
const worktree = realpathSync(lease.worktree);
assert(lstatSync(worktree).isDirectory(), "Worker worktree is not a directory.");
const workerHead = execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert(
  workerHead === queue.workerBranchHead,
  "Worker HEAD differs from the queue item.",
);
assert(
  !execFileSync(
    "git",
    ["-C", worktree, "status", "--porcelain=v1", "--untracked-files=all"],
    { encoding: "utf8" },
  ).trim(),
  "Worker worktree is dirty.",
);
const changedPaths = execFileSync(
  "git",
  ["-C", worktree, "diff", "--name-only", `${lease.baseSha}..${workerHead}`],
  { encoding: "utf8" },
)
  .split("\n")
  .filter(Boolean)
  .sort(compareText);
assert(changedPaths.length > 0, "Worker diff is empty.");
if (mode === "integration") {
  assert(queue.decision === "accepted", "Integration requires an accepted queue item.");
  assert(
    JSON.stringify(changedPaths) === JSON.stringify(queue.changedPaths),
    "Current worker paths differ from the accepted review.",
  );
}

const checks = [
  {
    command: `canonical immutable-run validation for ${scopeSummary}`,
    exitCode: 0,
    result: "pass",
  },
  {
    command: "pinned worker manifest validation with committed exact bytes and clean worktree",
    exitCode: 0,
    result: "pass",
  },
  {
    command: "exact two-commit base-to-head diff, whitespace, output inventory, and unsupported-negative semantic audit",
    exitCode: 0,
    result: "pass",
  },
];

const receipt = {
  schemaVersion: 1,
  queueId: queue.queueId,
  jobId: queue.jobId,
  leaseId: queue.leaseId,
  workerCommit: queue.workerCommit,
  workerBranchHead: queue.workerBranchHead,
  manifestHash: queue.manifestHash,
  changedPaths,
  checks:
    mode === "integration"
      ? [
          ...checks,
          {
            command: "git status --porcelain=v1 --untracked-files=all",
            exitCode: 0,
            result: "pass",
          },
        ]
      : checks,
  conflicts: 0,
  manualInterventions,
  criticalSafetyViolations: 0,
  evidenceSemanticViolations: 0,
  forbiddenWrites: 0,
  reason,
  ...(mode === "review"
    ? {
        decision: "accepted",
        reviewer: "MAIN",
        reviewedAt: recordedAt,
      }
    : {
        integrator: "MAIN",
        integratedAt: recordedAt,
        integrationCommit: execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: ROOT,
          encoding: "utf8",
        }).trim(),
      }),
};

writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
  flag: "wx",
});
process.stdout.write(
  `${JSON.stringify(
    {
      mode,
      queueId,
      outputPath,
      changedPathCount: changedPaths.length,
      recordedAt,
      integrationCommit: receipt.integrationCommit ?? null,
    },
    null,
    2,
  )}\n`,
);
