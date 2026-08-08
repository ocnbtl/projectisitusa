import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, any>;

const root = process.cwd();
const jobsPath = path.join(root, "ops/national-research/jobs.json");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : "";
  assert(value, `--${name} is required.`);
  return value;
}

const baseSha = argument("base-sha");
assert(/^[a-f0-9]{40}$/u.test(baseSha), "--base-sha must be a full Git SHA.");
assert(
  execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() === baseSha,
  "Canonical HEAD differs from --base-sha.",
);
assert(
  !execFileSync("git", ["-C", root, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).trim(),
  "Canonical worktree must be clean before preparing retry contracts.",
);

const document = JSON.parse(readFileSync(jobsPath, "utf8")) as JsonRecord;
const retryIds = [
  "gbif-archive-recovery-20260808-r51-vt-001",
  "gbif-archive-recovery-20260808-r51-nh-001",
];

for (const jobId of retryIds) {
  const job = document.jobs.find((entry: JsonRecord) => entry.jobId === jobId) as JsonRecord | undefined;
  assert(job?.state === "failed", `${jobId} is not a failed retry candidate.`);
  const contract = job.executionContract as JsonRecord;
  assert(contract?.archiveReplay, `${jobId} lacks an archive replay contract.`);
  const dryRunArguments = [
    "--import", "tsx", "scripts/research/run-source.ts",
    "--source", String(job.stateOrSourceScope.sourceFamilies[0]),
    "--state", String(job.stateOrSourceScope.states[0]),
    "--candidate-file", String(contract.candidateFile),
    "--candidate-limit", String(contract.candidateLimit),
    "--started-at", String(contract.startedAt),
    "--output-root", String(contract.outputRoot),
    "--archive-replay-commit", String(contract.archiveReplay.commit),
    "--archive-replay-run-id", String(contract.archiveReplay.runId),
    "--semantic-dry-run", "true",
  ];
  const dryRun = JSON.parse(execFileSync(process.execPath, dryRunArguments, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  })) as JsonRecord;
  assert(dryRun.result === "pass" && dryRun.networkRequestsIssued === 0, `${jobId} dry-run failed.`);
  assert(
    JSON.stringify([...dryRun.selectedPairKeys].sort()) === JSON.stringify([...job.taxaOrPairScope.pairs].sort()),
    `${jobId} retry pair membership changed.`,
  );
  assert(
    dryRun.expectedProviderRequests.providerNetworkRequests === 0,
    `${jobId} retry would access the provider.`,
  );
  assert(
    job.permittedPaths.includes(`${dryRun.expectedRunPath}/**`),
    `${jobId} deterministic run path changed.`,
  );

  const priorBase = String(job.baseSha);
  job.taxaOrPairScope = {
    taxa: dryRun.selectedTaxa,
    pairs: dryRun.selectedPairKeys,
  };
  job.baseSha = baseSha;
  job.expectedReceiptCodeCommit = baseSha;
  job.branch = `codex/${jobId}-retry1`;
  job.worktree = `C:\\Code\\project-isitusa-worktrees\\${jobId}-retry1`;
  job.recoveryState = "pair-order-validation-retry-with-verified-archive-replay";
  job.completionCriteria = [
    ...job.completionCriteria.map((entry: string) => entry.replaceAll(priorBase, baseSha)),
    "prove the lease pair array is byte-for-byte ordered like the canonical receipt pair scope",
  ];
  job.executionContract = {
    ...contract,
    expectedProviderRequests: dryRun.expectedProviderRequests,
    attemptTelemetryPath: `C:\\Code\\project-isitusa-worker-staging\\${jobId}-retry1\\attempt-telemetry.json`,
  };
}

writeFileSync(jobsPath, `${JSON.stringify(document, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  baseSha,
  jobs: retryIds.map((jobId) => {
    const job = document.jobs.find((entry: JsonRecord) => entry.jobId === jobId);
    return {
      jobId,
      branch: job.branch,
      worktree: job.worktree,
      orderedPairCount: job.taxaOrPairScope.pairs.length,
      providerNetworkRequests: job.executionContract.expectedProviderRequests.providerNetworkRequests,
    };
  }),
}, null, 2)}\n`);
