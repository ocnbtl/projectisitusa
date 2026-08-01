import fs from "node:fs";
import path from "node:path";

import { canonicalCandidatePairKeys } from "@/lib/research/candidate-pairs";
import { getStateDefinition } from "@/lib/research/geography-registry";
import { sha256, stableJson } from "@/lib/research/run-files";

type CandidateFile = {
  schemaVersion: 1;
  stateCode: string;
  candidateCount: number;
  distinctPairCount: number;
  stateSpeciesScreenCount: number;
  batchId: string;
  archiveReplay: {
    commit: string;
    runId: string;
  };
  candidates: Array<{
    sourceId: "gbif-preserved-specimens";
    speciesId: string;
    countyFips: string;
  }>;
};

type JobsFile = {
  schemaVersion: 1;
  jobs: Array<Record<string, unknown>>;
};

function argumentValue(args: string[], name: string) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredArgument(args: string[], name: string) {
  const value = argumentValue(args, name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function positiveInteger(value: string, name: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return parsed;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function runTimestamp(value: string) {
  return value.replace(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
}

const args = process.argv.slice(2);
assert(args.includes("--write"), "Registration requires --write.");
const candidatePath = path.resolve(requiredArgument(args, "candidate"));
const jobsPath = path.resolve(
  argumentValue(args, "jobs") ?? "ops/national-research/jobs.json",
);
const baseSha = requiredArgument(args, "base-sha");
const branch = requiredArgument(args, "branch");
const worktree = path.resolve(requiredArgument(args, "worktree"));
const outputRunId = requiredArgument(args, "output-run-id");
const startedAt = requiredArgument(args, "started-at");
const expiresAt = requiredArgument(args, "expires-at");
const priority = positiveInteger(requiredArgument(args, "priority"), "priority");
assert(/^[a-f0-9]{40}$/u.test(baseSha), "--base-sha must be a full Git SHA.");
assert(branch.startsWith("codex/"), "--branch must use the codex/ prefix.");
assert(
  /^[0-9]{8}T[0-9]{6}Z__gbif-preserved-specimens__[a-f0-9]{12}$/u.test(
    outputRunId,
  ),
  "--output-run-id has an invalid immutable-run identity.",
);
assert(
  Number.isFinite(Date.parse(startedAt)) &&
    Number.isFinite(Date.parse(expiresAt)) &&
    Date.parse(expiresAt) > Date.parse(startedAt),
  "Started and expiration timestamps are invalid.",
);

const candidate = JSON.parse(
  fs.readFileSync(candidatePath, "utf8"),
) as CandidateFile;
assert(
  candidate.schemaVersion === 1 &&
    /^[A-Z]{2}$/u.test(candidate.stateCode) &&
    candidate.batchId.length > 0 &&
    candidate.candidateCount > 0 &&
    candidate.candidateCount === candidate.distinctPairCount &&
    candidate.candidates.length === candidate.candidateCount &&
    /^[a-f0-9]{40}$/u.test(candidate.archiveReplay.commit) &&
    candidate.archiveReplay.runId.length > 0,
  "Archived-recovery candidate is invalid.",
);
const pairKeys = candidate.candidates
  .map((entry) => {
    assert(
      entry.sourceId === "gbif-preserved-specimens" &&
        /^[0-9]{5}$/u.test(entry.countyFips) &&
        entry.speciesId.length > 0,
      "Archived-recovery candidate row is invalid.",
    );
    return `${entry.countyFips}:${entry.speciesId}`;
  })
  .sort(compareText);
assert(
  new Set(pairKeys).size === pairKeys.length,
  "Archived-recovery candidate contains duplicate pairs.",
);
const taxa = [
  ...new Set(candidate.candidates.map((entry) => entry.speciesId)),
].sort(compareText);
assert(
  taxa.length === candidate.stateSpeciesScreenCount,
  "Archived-recovery candidate state-species count changed.",
);
const state = getStateDefinition(candidate.stateCode);
assert(
  state?.nationalV1Scope && state.sourceStateNames.gbif,
  `Archived-recovery candidate has no GBIF state identity for ${candidate.stateCode}.`,
);
const candidatePairs = canonicalCandidatePairKeys(
  candidate.candidates.map((entry) => ({
    countyFips: entry.countyFips,
    speciesId: entry.speciesId,
  })),
);
const parameters = {
  stateCode: candidate.stateCode,
  stateProvince: state.sourceStateNames.gbif,
  candidateLimit: candidate.candidateCount,
  candidatePairs,
  basisOfRecord: "PRESERVED_SPECIMEN",
  occurrenceStatus: "PRESENT",
  minimumMatchConfidence: 95,
  pageLimit: 300,
};
const parameterHash = sha256(stableJson(parameters));
const expectedOutputRunId = `${runTimestamp(startedAt)}__gbif-preserved-specimens__${parameterHash.slice(0, 12)}`;
assert(
  outputRunId === expectedOutputRunId,
  `--output-run-id ${outputRunId} differs from canonical ${expectedOutputRunId}.`,
);
const relativeCandidate = path
  .relative(process.cwd(), candidatePath)
  .split(path.sep)
  .join("/");
const jobsFile = JSON.parse(fs.readFileSync(jobsPath, "utf8")) as JobsFile;
assert(
  jobsFile.schemaVersion === 1 && Array.isArray(jobsFile.jobs),
  "Job registry is invalid.",
);
assert(
  !jobsFile.jobs.some((job) => job.jobId === candidate.batchId),
  `Job ${candidate.batchId} already exists.`,
);

const job = {
  jobId: candidate.batchId,
  workerType: "state-source",
  stateOrSourceScope: {
    states: [candidate.stateCode],
    sourceFamilies: ["gbif-preserved-specimens"],
  },
  taxaOrPairScope: {
    taxa,
    pairs: pairKeys,
  },
  scopeClaims: taxa.map(
    (speciesId) =>
      `state/${candidate.stateCode}/source/gbif-preserved-specimens/taxon/${speciesId}`,
  ),
  branch,
  worktree,
  baseSha,
  expectedReceiptCodeCommit: baseSha,
  permittedPaths: [`src/data/research/runs/${outputRunId}/**`],
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
    maxArtifactBytes: 20000000,
    maxWallMinutes: 60,
    maxMemoryMb: 1024,
  },
  expiresAt,
  recoveryState: "replay-verified-archive",
  completionCriteria: [
    `run the registered statewide GBIF preserved-specimen adapter from ${relativeCandidate} with started-at ${startedAt}, --archive-replay-commit ${candidate.archiveReplay.commit}, and --archive-replay-run-id ${candidate.archiveReplay.runId}`,
    `screen all ${candidate.candidateCount} leased ${candidate.stateCode} county-species pairs using provider-declared county geography only`,
    "issue zero live provider requests and verify every reused response artifact against its archived receipt hash and byte count",
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
jobsFile.jobs.push(job);
fs.writeFileSync(jobsPath, `${JSON.stringify(jobsFile, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify(
    {
      jobId: candidate.batchId,
      stateCode: candidate.stateCode,
      stateSpeciesScreenCount: taxa.length,
      pairCount: pairKeys.length,
      archiveCommit: candidate.archiveReplay.commit,
      archiveRunId: candidate.archiveReplay.runId,
      baseSha,
      outputRunId,
      parameterHash,
      state: "planned",
    },
    null,
    2,
  )}\n`,
);
