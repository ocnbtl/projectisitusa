import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, any>;

const root = process.cwd();
const jobsPath = path.join(root, "ops/national-research/jobs.json");
const cachePath = "src/data/research/caches/gbif-taxonomy-20260807-r51.json";
const planRoot = "ops/national-research/plans/round-51-20260808-recovery";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function argument(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : "";
  assert(value, `--${name} is required.`);
  return value;
}

function readJson(filePath: string): JsonRecord {
  return JSON.parse(readFileSync(filePath, "utf8")) as JsonRecord;
}

const baseSha = argument("base-sha");
assert(/^[a-f0-9]{40}$/u.test(baseSha), "--base-sha must be a full commit SHA.");
assert(
  execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() === baseSha,
  "Canonical HEAD differs from --base-sha.",
);

const jobsDocument = readJson(jobsPath);
const templates = new Map(
  ["VT", "NH"].map((stateCode) => {
    const job = jobsDocument.jobs.find((entry: JsonRecord) =>
      entry.jobId === `gbif-bulk-20260806-r50-${stateCode.toLowerCase()}-001`);
    assert(job?.state === "failed", `Missing failed ${stateCode} source job.`);
    return [stateCode, job] as const;
  }),
);

const specifications = [
  {
    jobId: "gbif-archive-recovery-20260808-r51-vt-001",
    stateCode: "VT",
    candidateFile: `${planRoot}/gbif-archive-recovery-20260808-r51-vt-001.json`,
    startedAt: "2026-08-08T02:10:00.000Z",
    archiveReplay: {
      commit: "8cceb5094233dc8a0ceb26fded4ffeb2969e3099",
      runId: "20260807T013017Z__gbif-preserved-specimens__caaebde83e5b",
    },
    priority: 1200,
  },
  {
    jobId: "gbif-archive-recovery-20260808-r51-nh-001",
    stateCode: "NH",
    candidateFile: `${planRoot}/gbif-archive-recovery-20260808-r51-nh-002.json`,
    startedAt: "2026-08-08T02:10:01.000Z",
    archiveReplay: {
      commit: "b7ed5e503eb6327de3b7d217cdcf8cc560d1dfeb",
      runId: "20260807T013011Z__gbif-preserved-specimens__c545e19aedcd",
    },
    priority: 1190,
  },
  {
    jobId: "gbif-live-retry-20260808-r51-vt-001",
    stateCode: "VT",
    candidateFile: `${planRoot}/gbif-live-retry-20260808-r51-vt-001.json`,
    startedAt: "2026-08-08T02:10:02.000Z",
    priority: 1180,
  },
  {
    jobId: "gbif-live-retry-20260808-r51-nh-001",
    stateCode: "NH",
    candidateFile: `${planRoot}/gbif-live-retry-20260808-r51-nh-001.json`,
    startedAt: "2026-08-08T02:10:03.000Z",
    priority: 1170,
  },
];

for (const specification of specifications) {
  assert(
    !jobsDocument.jobs.some((entry: JsonRecord) => entry.jobId === specification.jobId),
    `Job already exists: ${specification.jobId}`,
  );
  const candidate = readJson(path.join(root, specification.candidateFile));
  const pairs = candidate.candidates.map(
    (entry: JsonRecord) => `${entry.countyFips}:${entry.speciesId}`,
  );
  const taxa = [...new Set(candidate.candidates.map((entry: JsonRecord) => entry.speciesId as string))].sort();
  assert(candidate.candidateCount === pairs.length && new Set(pairs).size === pairs.length, "Candidate scope is inconsistent.");
  const dryRunArguments = [
    "--import", "tsx", "scripts/research/run-source.ts",
    "--source", "gbif-preserved-specimens",
    "--state", specification.stateCode,
    "--candidate-file", specification.candidateFile,
    "--candidate-limit", String(pairs.length),
    "--started-at", specification.startedAt,
    "--output-root", "src/data/research/runs",
    ...(specification.archiveReplay ? [] : ["--gbif-taxonomy-cache", cachePath]),
    ...(specification.archiveReplay
      ? ["--archive-replay-commit", specification.archiveReplay.commit, "--archive-replay-run-id", specification.archiveReplay.runId]
      : []),
    "--semantic-dry-run", "true",
  ];
  const dryRun = JSON.parse(execFileSync(process.execPath, dryRunArguments, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  })) as JsonRecord;
  assert(dryRun.result === "pass" && dryRun.networkRequestsIssued === 0, "Semantic dry-run failed.");
  assert(JSON.stringify([...dryRun.selectedPairKeys].sort()) === JSON.stringify([...pairs].sort()), "Dry-run pair scope changed.");
  const template = templates.get(specification.stateCode)!;
  const branch = `codex/${specification.jobId}`;
  const worktree = `C:\\Code\\project-isitusa-worktrees\\${specification.jobId}`;
  jobsDocument.jobs.push({
    jobId: specification.jobId,
    workerType: "state-source",
    stateOrSourceScope: { states: [specification.stateCode], sourceFamilies: ["gbif-preserved-specimens"] },
    taxaOrPairScope: { taxa, pairs },
    scopeClaims: taxa.map((taxon) => `state/${specification.stateCode}/source/gbif-preserved-specimens/taxon/${taxon}`),
    branch,
    worktree,
    baseSha,
    expectedReceiptCodeCommit: baseSha,
    permittedPaths: [`${dryRun.expectedRunPath}/**`],
    prohibitedPaths: template.prohibitedPaths,
    skillPins: template.skillPins,
    expectedOutputs: template.expectedOutputs,
    retryPolicy: template.retryPolicy,
    resourcePolicy: template.resourcePolicy,
    expiresAt: "2026-08-08T04:30:00.000Z",
    recoveryState: specification.archiveReplay ? "verified-partial-artifact-replay" : "exact-http-429-missing-query-retry",
    completionCriteria: [
      `screen exactly ${pairs.length} ${specification.stateCode} county-species pairs from ${specification.candidateFile}`,
      specification.archiveReplay
        ? `replay only verified artifacts from ${specification.archiveReplay.commit}:${specification.archiveReplay.runId} with zero provider requests`
        : "retry only the single previously rate-limited occurrence query in a one-provider lane",
      "preserve complete pagination and emit no unsupported negative determination",
      "capture attempt telemetry outside the immutable run before any artifact or provider access",
      "commit immutable-run content first and the finalized manifest second",
      `pass the pinned worker validator and git diff --check ${baseSha}...HEAD`,
    ],
    dependencies: [],
    priority: specification.priority,
    state: "planned",
    executionContract: {
      schemaVersion: 1,
      roundId: "round-51-partial-recovery-20260808",
      portfolioRank: 1200 - specification.priority + 1,
      candidateFile: specification.candidateFile,
      candidateLimit: pairs.length,
      candidateLimitMeaning: "maximum county-species candidate-pair count, not a taxon count",
      startedAt: specification.startedAt,
      outputRoot: "src/data/research/runs",
      taxonomyCache: specification.archiveReplay ? null : cachePath,
      attemptTelemetryPath: `C:\\Code\\project-isitusa-worker-staging\\${specification.jobId}\\attempt-telemetry.json`,
      expectedProviderRequests: dryRun.expectedProviderRequests,
      ...(specification.archiveReplay ? { archiveReplay: specification.archiveReplay } : {}),
      dependencyResolution: template.executionContract.dependencyResolution,
    },
  });
}

writeFileSync(jobsPath, `${JSON.stringify(jobsDocument, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ baseSha, jobs: specifications.map((entry) => entry.jobId) }, null, 2)}\n`);
