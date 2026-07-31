import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import stateRegistry from "@/data/research/state-registry.json";
import { canonicalCandidatePairKeys } from "@/lib/research/candidate-pairs";
import { stableJson } from "@/lib/research/run-files";

type CandidateFile = {
  schemaVersion: 1;
  stateCode: string;
  batchId: string;
  candidates: Array<{
    sourceId: string;
    speciesId: string;
    countyFips: string;
  }>;
};

type JobsFile = {
  schemaVersion: 1;
  jobs: Array<Record<string, unknown> & { jobId: string }>;
};

const ROOT = process.cwd();
const SOURCE_ID = "gbif-preserved-specimens";
const ORCHESTRATOR = path.join(
  ROOT,
  ".agents/skills/isitusa-national-orchestrator/scripts/orchestrate.mjs",
);
const JOBS_PATH = path.join(ROOT, "ops/national-research/jobs.json");
const OPERATIONS_ROOT = path.join(ROOT, "ops/national-research");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function valuesFor(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === `--${name}`) values.push(args[index + 1] ?? "");
  }
  return values;
}

function valueFor(args: string[], name: string): string {
  const values = valuesFor(args, name);
  assert(values.length === 1 && values[0], `Exactly one --${name} is required.`);
  return values[0];
}

function runTimestamp(value: string) {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function validateOperations(now: string) {
  const result = spawnSync(
    process.execPath,
    [ORCHESTRATOR, "validate", "--root", OPERATIONS_ROOT, "--now", now],
    { cwd: ROOT, encoding: "utf8" },
  );
  if (result.status !== 0) {
    throw new Error(
      `Orchestration validation failed: ${result.stderr || result.stdout}`,
    );
  }
}

const args = process.argv.slice(2);
assert(args.includes("--write"), "Usage requires --write.");
const planDirectory = path.resolve(ROOT, valueFor(args, "plan-dir"));
assert(
  planDirectory.startsWith(`${ROOT}${path.sep}`),
  "--plan-dir must remain inside the repository.",
);
const expiresAt = new Date(valueFor(args, "expires-at")).toISOString();
const now = new Date(valueFor(args, "now")).toISOString();
const entries = valuesFor(args, "entry");
assert(entries.length > 0, "At least one --entry is required.");
const baseSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: ROOT,
  encoding: "utf8",
}).trim();
assert(/^[a-f0-9]{40}$/.test(baseSha), "Current HEAD is not a full Git SHA.");
const originalBytes = readFileSync(JOBS_PATH);
const jobs = JSON.parse(originalBytes.toString("utf8")) as JobsFile;
validateOperations(now);

const jurisdictions = new Map(
  stateRegistry.jurisdictions.map((entry) => [entry.stateCode, entry]),
);
const newJobs = entries.map((serializedEntry) => {
  const [stateCodeInput, batchId, startedAtInput, priorityInput] =
    serializedEntry.split(",");
  const stateCode = stateCodeInput?.toUpperCase() ?? "";
  const state = jurisdictions.get(stateCode);
  assert(state?.nationalV1Scope, `Unknown national jurisdiction ${stateCode}.`);
  assert(
    /^[a-z0-9][a-z0-9-]*$/.test(batchId ?? ""),
    `Invalid batch ID ${batchId}.`,
  );
  const startedAt = new Date(startedAtInput ?? "").toISOString();
  assert(
    Date.parse(startedAt) <= Date.parse(now),
    `Started-at for ${batchId} cannot be in the future.`,
  );
  const priority = Number(priorityInput);
  assert(Number.isInteger(priority), `Priority for ${batchId} must be an integer.`);
  assert(
    !jobs.jobs.some((job) => job.jobId === batchId),
    `Job ${batchId} already exists.`,
  );

  const candidatePath = path.join(planDirectory, `${batchId}.json`);
  const candidate = JSON.parse(
    readFileSync(candidatePath, "utf8"),
  ) as CandidateFile;
  assert(candidate.batchId === batchId, `${batchId} candidate identity differs.`);
  assert(candidate.stateCode === stateCode, `${batchId} candidate state differs.`);
  assert(candidate.candidates.length > 0, `${batchId} has no candidates.`);
  assert(
    candidate.candidates.every((entry) => entry.sourceId === SOURCE_ID),
    `${batchId} contains a different source.`,
  );

  const pairs = canonicalCandidatePairKeys(candidate.candidates);
  assert(new Set(pairs).size === pairs.length, `${batchId} contains duplicate pairs.`);
  const taxa = [...new Set(candidate.candidates.map((entry) => entry.speciesId))]
    .sort(compareText);
  const parameters = {
    stateCode,
    stateProvince: state.sourceStateNames.gbif,
    candidateLimit: pairs.length,
    candidatePairs: pairs,
    basisOfRecord: "PRESERVED_SPECIMEN",
    occurrenceStatus: "PRESENT",
    minimumMatchConfidence: 95,
    pageLimit: 300,
  };
  const parameterHash = sha256(stableJson(parameters));
  const runId = `${runTimestamp(startedAt)}__${SOURCE_ID}__${parameterHash.slice(0, 12)}`;
  const branch = `codex/${batchId}`;
  const worktree = `C:\\Code\\project-isitusa-worktrees\\${batchId}`;
  const runPath = `src/data/research/runs/${runId}`;

  return {
    jobId: batchId,
    workerType: "state-source",
    stateOrSourceScope: {
      states: [stateCode],
      sourceFamilies: [SOURCE_ID],
    },
    taxaOrPairScope: { taxa, pairs },
    scopeClaims: taxa.map(
      (speciesId) =>
        `state/${stateCode}/source/${SOURCE_ID}/taxon/${speciesId}`,
    ),
    branch,
    worktree,
    baseSha,
    expectedReceiptCodeCommit: baseSha,
    permittedPaths: [`${runPath}/**`],
    prohibitedPaths: [
      ".agents/skills/**",
      "AGENTS.md",
      "package.json",
      "package-lock.json",
      "ops/national-research/**",
      "src/data/research/schemas/**",
      "src/data/research/source-registry.json",
      "src/data/research/state-list-source-registry.json",
      "src/data/research/research-protocols.json",
      "src/data/research/state-registry.json",
      "src/data/research/county-equivalent-registry.json",
      "src/data/research/state-research-config.json",
      "src/data/research/state-applicability/**",
      "scripts/**",
      "src/lib/**",
      "src/data/generated/**",
      "public/generated/**",
      "app/**",
      "src/components/**",
      ".vercel/**",
      "vercel.json",
    ],
    skillPins: [
      {
        name: "isitusa-national-orchestrator",
        version: "frozen-windows-bulk-validation-2026-07-30-r2",
        gitCommit: "e3513cc6bde303432320d1d3904ea638eec6333c",
        contentHash:
          "9f934116bc4f1ad80b3b61d805f4ad4c0070773ed3040c28e96098c74d888757",
      },
      {
        name: "isitusa-evidence-worker",
        version: "frozen-windows-bulk-validation-2026-07-30-r2",
        gitCommit: "e3513cc6bde303432320d1d3904ea638eec6333c",
        contentHash:
          "52f13ef7e2574a6428701c0fcc9d0512e313fe639adf826888490ce5a38a6b8b",
      },
    ],
    expectedOutputs: [
      "manifest",
      "artifacts",
      "assertions",
      "reviews",
      "rejections",
      "outcomes",
      "receipt",
      "source-verification",
    ],
    retryPolicy: {
      maxAttempts: 3,
      backoffSeconds: [5, 30, 120],
      resumeRequired: true,
    },
    resourcePolicy: {
      maxArtifactBytes: 20_000_000,
      maxWallMinutes: 60,
      maxMemoryMb: 1024,
    },
    expiresAt,
    recoveryState: "none",
    completionCriteria: [
      `run the registered statewide GBIF preserved-specimen adapter from ${path.relative(ROOT, candidatePath).split(path.sep).join("/")} with started-at ${startedAt}`,
      `screen all ${pairs.length} leased ${stateCode} county-species pairs using provider-declared county geography only`,
      "complete bounded pagination for every state-species query and preserve retry state",
      "emit no-qualifying-evidence outcomes only after complete pagination and never absence, not-detected, or not-applicable",
      "emit canonical artifacts, events, receipt, source-verification record, and complete worker manifest",
      "commit immutable-run content first and the finalized manifest second",
      `pass the pinned worker validator and git diff --check ${baseSha}...HEAD`,
    ],
    dependencies: [],
    priority,
    state: "planned",
  };
});

const nextJobs: JobsFile = {
  ...jobs,
  jobs: [...jobs.jobs, ...newJobs],
};
try {
  writeFileSync(JOBS_PATH, `${JSON.stringify(nextJobs, null, 2)}\n`);
  validateOperations(now);
} catch (error) {
  writeFileSync(JOBS_PATH, originalBytes);
  validateOperations(now);
  throw error;
}

process.stdout.write(
  `${JSON.stringify(
    {
      baseSha,
      registered: newJobs.map((job) => ({
        jobId: job.jobId,
        stateCode: job.stateOrSourceScope.states[0],
        taxa: job.taxaOrPairScope.taxa.length,
        pairs: job.taxaOrPairScope.pairs.length,
        runPath: job.permittedPaths[0],
      })),
    },
    null,
    2,
  )}\n`,
);
