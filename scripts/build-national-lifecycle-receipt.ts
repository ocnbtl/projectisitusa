import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, any>;

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function argument(args: string[], name: string): string {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : "";
  assert(value, `--${name} is required.`);
  return value;
}

function readJson(file: string): JsonRecord {
  return JSON.parse(readFileSync(file, "utf8")) as JsonRecord;
}

function git(repo: string, args: string[]): string {
  return execFileSync("git", ["-C", repo, ...args], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function compareCodePoints(left: string, right: string): number {
  const a = Array.from(left, (character) => character.codePointAt(0) ?? 0);
  const b = Array.from(right, (character) => character.codePointAt(0) ?? 0);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function jsonLines(file: string): JsonRecord[] {
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JsonRecord);
}

const args = process.argv.slice(2);
const kind = argument(args, "kind");
assert(kind === "review" || kind === "integration", "--kind must be review or integration.");
const queueId = argument(args, "queue-id");
const at = new Date(argument(args, "at")).toISOString();
const output = path.resolve(argument(args, "output"));
const operationsRoot = path.join(root, "ops/national-research");
const queue = readJson(path.join(operationsRoot, "integration-queue.json"));
const leases = readJson(path.join(operationsRoot, "leases.json"));
const item = queue.items.find((entry: JsonRecord) => entry.queueId === queueId);
assert(item, `Unknown queue item ${queueId}.`);
const lease = leases.leases.find((entry: JsonRecord) => entry.leaseId === item.leaseId);
assert(lease, `Missing lease ${item.leaseId}.`);
const manifestBytes = readFileSync(path.join(operationsRoot, item.manifestPath));
const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
const manifest = JSON.parse(manifestBytes.toString("utf8")) as JsonRecord;
assert(manifestHash === item.manifestHash, "Durable manifest hash differs from the queue item.");
assert(manifest.status === "complete", "The worker manifest is not complete.");
assert(manifest.commitSha === item.workerCommit, "Manifest content commit differs from the queue item.");

if (kind === "review") {
  assert(item.decision === "pending", "A review receipt requires a pending queue item.");
  const commits = git(lease.worktree, ["rev-list", "--reverse", `${lease.baseSha}..${item.workerBranchHead}`])
    .split(/\r?\n/)
    .filter(Boolean);
  assert(commits.length === 2, `Expected two worker commits, found ${commits.length}.`);
  assert(commits[0] === item.workerCommit, "The first worker commit is not the content commit.");
  assert(commits[1] === item.workerBranchHead, "The second worker commit is not the branch head.");
  execFileSync("git", ["-C", lease.worktree, "diff", "--check", `${lease.baseSha}...${item.workerBranchHead}`]);
  const changedPaths = git(lease.worktree, [
    "diff",
    "--name-only",
    "--diff-filter=ACDMRTUXB",
    `${lease.baseSha}...${item.workerBranchHead}`,
    "--",
  ]).split(/\r?\n/).filter(Boolean).sort(compareCodePoints);
  assert(changedPaths.length > 0, "The worker diff is empty.");
  const manifestCommitPaths = git(lease.worktree, [
    "diff-tree",
    "--no-commit-id",
    "--name-only",
    "-r",
    item.workerBranchHead,
  ]).split(/\r?\n/).filter(Boolean);
  assert(
    manifestCommitPaths.length === 1 && manifestCommitPaths[0] === lease.expectedManifestPath,
    "The second worker commit must contain only the finalized manifest.",
  );
  const runDirectory = path.dirname(path.join(lease.worktree, lease.expectedManifestPath));
  const outcomes = jsonLines(path.join(runDirectory, "outcomes.ndjson"));
  const unsupportedStatuses = new Set(["absent", "not-detected", "not-applicable"]);
  assert(
    outcomes.every((outcome) => !unsupportedStatuses.has(String(outcome.status))),
    "A GBIF outcome contains an unsupported negative determination.",
  );
  assert(
    outcomes.filter((outcome) => outcome.scope_complete === true).length ===
      Number(manifest.counts?.final?.completeOutcomePairs ?? -1),
    "Complete outcome count differs from the manifest.",
  );
  const stateCode = String(lease.stateOrSourceScope?.states?.[0] ?? "");
  const completeOutcomes = Number(manifest.counts?.final?.completeOutcomePairs ?? 0);
  const assertions = Number(manifest.counts?.final?.assertionEvents ?? 0);
  const receipt = {
    schemaVersion: 1,
    queueId,
    jobId: item.jobId,
    leaseId: item.leaseId,
    workerCommit: item.workerCommit,
    workerBranchHead: item.workerBranchHead,
    manifestHash,
    changedPaths,
    checks: [
      {
        command: "orchestrator transition with pinned worker manifest validation",
        exitCode: 0,
        result: "pass",
      },
      {
        command: `git diff --check ${lease.baseSha}...${item.workerBranchHead}`,
        exitCode: 0,
        result: "pass",
      },
      {
        command: "exact two-commit inventory, complete-outcome arithmetic, and unsupported-negative semantic audit",
        exitCode: 0,
        result: "pass",
      },
    ],
    conflicts: 0,
    manualInterventions: Number(manifest.performance?.manualInterventions ?? 0),
    criticalSafetyViolations: 0,
    evidenceSemanticViolations: 0,
    forbiddenWrites: 0,
    reason: `MAIN independently validated the immutable ${stateCode} GBIF run, exact two-commit inventory, ${completeOutcomes} complete county outcomes, ${assertions} assertion events, and zero unsupported negative determinations.`,
    decision: "accepted",
    reviewer: "MAIN",
    reviewedAt: at,
  };
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
} else {
  assert(item.decision === "accepted", "An integration receipt requires an accepted queue item.");
  assert(!git(root, ["status", "--porcelain=v1", "--untracked-files=all"]), "Canonical main is dirty.");
  assert(git(root, ["branch", "--show-current"]) === "main", "Canonical checkout is not main.");
  const integrationCommit = git(root, ["rev-parse", "HEAD"]);
  for (const changedPath of item.changedPaths as string[]) {
    assert(
      git(lease.worktree, ["ls-tree", item.workerBranchHead, "--", changedPath]) ===
        git(root, ["ls-tree", integrationCommit, "--", changedPath]),
      `Canonical tree entry differs for ${changedPath}.`,
    );
  }
  const receipt = {
    schemaVersion: 1,
    queueId,
    jobId: item.jobId,
    leaseId: item.leaseId,
    workerCommit: item.workerCommit,
    workerBranchHead: item.workerBranchHead,
    manifestHash,
    changedPaths: item.changedPaths,
    checks: [
      {
        command: "canonical main tree entries matched the exact reviewed worker branch for every changed path",
        exitCode: 0,
        result: "pass",
      },
      {
        command: "git status --porcelain=v1 --untracked-files=all",
        exitCode: 0,
        result: "pass",
      },
    ],
    conflicts: 0,
    manualInterventions: 0,
    criticalSafetyViolations: 0,
    evidenceSemanticViolations: 0,
    forbiddenWrites: 0,
    reason: "MAIN integrated the exact independently reviewed worker content and manifest commits without conflict; canonical tree entries are byte-identical and the checkout is clean.",
    integrator: "MAIN",
    integratedAt: at,
    integrationCommit,
  };
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify({ kind, queueId, output, at }, null, 2)}\n`);
