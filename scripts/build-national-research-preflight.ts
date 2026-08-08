import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

type JsonRecord = Record<string, any>;

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function argument(args: string[], name: string) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : "";
  assert(value, `--${name} is required.`);
  return value;
}

function readJson(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as JsonRecord;
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function sorted(values: string[]) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

const args = process.argv.slice(2);
const jobId = argument(args, "job-id");
const workerRoot = path.resolve(argument(args, "worker-root"));
const resourcePath = path.resolve(argument(args, "resources"));
const outputPath = path.resolve(argument(args, "output"));
const createdAt = new Date(argument(args, "created-at")).toISOString();
assert(outputPath.startsWith(`${root}${path.sep}`), "Preflight output must remain in the repository.");

const jobs = readJson(path.join(root, "ops/national-research/jobs.json"));
const leases = readJson(path.join(root, "ops/national-research/leases.json"));
const queue = readJson(path.join(root, "ops/national-research/integration-queue.json"));
const job = jobs.jobs.find((entry: JsonRecord) => entry.jobId === jobId);
assert(job, `Unknown job ${jobId}.`);
assert(job.state === "planned", `Job ${jobId} is not planned.`);
const contract = job.executionContract as JsonRecord;
assert(contract, `Job ${jobId} lacks an executionContract.`);
assert(workerRoot === path.resolve(job.worktree), "Worker root differs from the registered job worktree.");
assert(
  execFileSync("git", ["-C", workerRoot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim() === job.baseSha,
  "Worker worktree HEAD differs from the job base.",
);
assert(
  execFileSync("git", ["-C", workerRoot, "branch", "--show-current"], { encoding: "utf8" }).trim() === job.branch,
  "Worker branch differs from the registered job branch.",
);
assert(
  !execFileSync("git", ["-C", workerRoot, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).trim(),
  "Worker worktree is dirty before semantic dry-run.",
);
const nodePath = String(contract.dependencyResolution.nodePath);
const dryRunArguments = [
  "--import",
  "tsx",
  "scripts/research/run-source.ts",
  "--source",
  String(job.stateOrSourceScope.sourceFamilies[0]),
  "--state",
  String(job.stateOrSourceScope.states[0]),
  "--candidate-file",
  String(contract.candidateFile),
  "--candidate-limit",
  String(contract.candidateLimit),
  "--started-at",
  String(contract.startedAt),
  "--output-root",
  String(contract.outputRoot),
  ...(contract.taxonomyCache
    ? ["--gbif-taxonomy-cache", String(contract.taxonomyCache)]
    : []),
  ...(contract.archiveReplay
    ? [
        "--archive-replay-commit",
        String(contract.archiveReplay.commit),
        "--archive-replay-run-id",
        String(contract.archiveReplay.runId),
      ]
    : []),
  "--semantic-dry-run",
  "true",
];
assert(existsSync(nodePath), "The pinned Node executable is missing.");
assert(existsSync(path.join(workerRoot, "node_modules/tsx/package.json")), "tsx does not resolve inside the worker worktree.");
assert(
  execFileSync(nodePath, ["--version"], { encoding: "utf8" }).trim() === contract.dependencyResolution.nodeVersion,
  "The pinned Node version changed.",
);
const dryRunText = execFileSync(nodePath, dryRunArguments, {
  cwd: workerRoot,
  encoding: "utf8",
  maxBuffer: 50 * 1024 * 1024,
});
const dryRun = JSON.parse(dryRunText) as JsonRecord;
const dryRunRelativePath = `ops/national-research/preflights/dry-runs/${jobId}.json`;
const dryRunPath = path.join(root, dryRunRelativePath);
mkdirSync(path.dirname(dryRunPath), { recursive: true });
const dryRunSerialized = `${JSON.stringify(dryRun, null, 2)}\n`;
writeFileSync(dryRunPath, dryRunSerialized);
const dryRunBytes = Buffer.from(dryRunSerialized);
const resourcesBytes = readFileSync(resourcePath);
const resources = JSON.parse(resourcesBytes.toString("utf8")) as JsonRecord;
assert(dryRun.result === "pass" && dryRun.networkRequestsIssued === 0, "Semantic dry-run did not pass without network access.");
assert(dryRun.baseSha === job.baseSha, "Dry-run base SHA differs from the job base.");
assert(dryRun.sourceId === job.stateOrSourceScope.sourceFamilies[0], "Dry-run source differs from the job source.");
assert(dryRun.stateCode === job.stateOrSourceScope.states[0], "Dry-run state differs from the job state.");
assert(
  JSON.stringify(sorted(dryRun.selectedPairKeys)) === JSON.stringify(sorted(job.taxaOrPairScope.pairs)),
  "Dry-run pair scope differs from the leased job scope.",
);
assert(
  JSON.stringify(sorted(dryRun.selectedTaxa)) === JSON.stringify(sorted(job.taxaOrPairScope.taxa)),
  "Dry-run taxon scope differs from the leased job scope.",
);
assert(dryRun.candidateFile.selectedPairCount === job.taxaOrPairScope.pairs.length, "Dry-run pair count differs from the job.");
assert(dryRun.candidateLimit.value === contract.candidateLimit, "Dry-run candidate limit differs from the execution contract.");
assert(dryRun.candidateLimit.meaning.includes("candidate-pair"), "Candidate limit semantics are not explicit.");
const permittedRun = String(job.permittedPaths.find((entry: string) => entry.endsWith("/**")) ?? "").slice(0, -3);
assert(permittedRun && permittedRun === dryRun.expectedRunPath, "Dry-run output path differs from the permitted immutable run.");
assert(contract.startedAt === dryRun.startedAt, "Dry-run start time differs from the execution contract.");

const candidatePath = path.join(root, dryRun.candidateFile.path);
const candidateBytes = readFileSync(candidatePath);
assert(sha256(candidateBytes) === dryRun.candidateFile.sha256, "Candidate-file hash differs from the dry-run.");
const candidate = JSON.parse(candidateBytes.toString("utf8")) as JsonRecord;
assert(candidate.candidates.length === dryRun.candidateFile.declaredCandidateCount, "Candidate-file declared count changed.");

const registryPath = path.join(root, "src/data/research/source-registry.json");
const registryBytes = readFileSync(registryPath);
const source = (JSON.parse(registryBytes.toString("utf8")) as JsonRecord).sources.find(
  (entry: JsonRecord) => entry.id === dryRun.sourceId,
);
assert(source?.status === "operational" && source.researchAdapter, "The source is not registered and operational.");
const freezePath = path.join(root, "ops/national-research/receipts/skill-freezes/isitusa-national-skills-windows-bulk-validation-2026-07-30-r2.json");
const freezeBytes = readFileSync(freezePath);
const freeze = JSON.parse(freezeBytes.toString("utf8")) as JsonRecord;
assert(freeze.status === "frozen", "The pinned skill receipt is not frozen.");
const frozenSkillByName = new Map(
  (freeze.skills as JsonRecord[]).map((entry) => [entry.name, entry]),
);
for (const pin of job.skillPins as JsonRecord[]) {
  assert(pin.version === freeze.version, `Skill ${pin.name} version differs from the freeze receipt.`);
  assert(pin.gitCommit === freeze.gitCommit, `Skill ${pin.name} commit differs from the freeze receipt.`);
  assert(pin.contentHash === frozenSkillByName.get(pin.name)?.contentHash, `Skill ${pin.name} hash differs from the freeze receipt.`);
}

assert(Number(resources.workerCount) >= 1, "Resource snapshot lacks a worker count.");
assert(Number(resources.projectedPostWorkerFreeCommitMiB) >= 3072, "Projected commit headroom is below 3 GiB.");
assert(Number(resources.projectedPostWorkerFreePhysicalMiB) >= Number(resources.totalPhysicalMiB) * 0.1, "Projected physical memory is below the 10% floor.");
assert(Number(resources.freeDiskMiB) >= Math.max(20480, Number(resources.totalDiskMiB) * 0.15), "Disk headroom is below policy.");
const telemetryPath = path.resolve(String(contract.attemptTelemetryPath));
assert(!telemetryPath.startsWith(`${workerRoot}${path.sep}`), "Attempt telemetry staging is inside the worker worktree.");
mkdirSync(path.dirname(telemetryPath), { recursive: true });
const stagingProbe = `${telemetryPath}.preflight-probe`;
writeFileSync(stagingProbe, "preflight-write-probe\n");
unlinkSync(stagingProbe);

const targetPairs = new Set(job.taxaOrPairScope.pairs as string[]);
let completePriorPairs = 0;
let incompletePriorPairs = 0;
let matchingRunReceipts = 0;
const runRoot = path.join(root, "src/data/research/runs");
for (const runId of readdirSync(runRoot)) {
  const receiptPath = path.join(runRoot, runId, "receipt.json");
  const outcomesPath = path.join(runRoot, runId, "outcomes.ndjson");
  if (!existsSync(receiptPath) || !existsSync(outcomesPath)) continue;
  const receipt = readJson(receiptPath);
  if (receipt.source_id !== dryRun.sourceId || receipt.requested_scope?.state_code !== dryRun.stateCode) continue;
  if (receipt.parameter_hash === dryRun.parameterHash) matchingRunReceipts += 1;
  for (const line of readFileSync(outcomesPath, "utf8").split(/\r?\n/u).filter(Boolean)) {
    const outcome = JSON.parse(line) as JsonRecord;
    const key = `${outcome.county_fips}:${outcome.species_id}`;
    if (!targetPairs.has(key)) continue;
    if (outcome.scope_complete === true) completePriorPairs += 1;
    else incompletePriorPairs += 1;
  }
}
assert(completePriorPairs === 0, "The job would repeat already-complete county-species pairs.");
assert(matchingRunReceipts === 0 && !existsSync(path.join(root, permittedRun)), "The deterministic immutable run path already exists.");
const priorLeases = leases.leases.filter((entry: JsonRecord) => entry.jobId === jobId);
const priorQueueItems = queue.items.filter((entry: JsonRecord) => entry.jobId === jobId);

const baseTreeChecks = [
  dryRun.candidateFile.path,
  "scripts/research/run-source.ts",
  "scripts/research/gbif-taxonomy-cache.ts",
  "src/data/research/source-registry.json",
  ...(dryRun.taxonomyCache ? [dryRun.taxonomyCache.path] : []),
].map((filePath) => ({
  path: filePath,
  blob: execFileSync("git", ["-C", root, "rev-parse", `${job.baseSha}:${filePath}`], { encoding: "utf8" }).trim(),
}));

const preflight = {
  schemaVersion: 1,
  preflightId: `${jobId}-${createdAt.replace(/[-:.]/gu, "")}`,
  createdAt,
  result: "pass",
  jobId,
  exactBaseSha: job.baseSha,
  currentFrozenSkills: {
    receiptPath: path.relative(root, freezePath).split(path.sep).join("/"),
    receiptSha256: sha256(freezeBytes),
    version: freeze.version,
    commit: freeze.gitCommit,
    hashes: Object.fromEntries(
      (freeze.skills as JsonRecord[]).map((entry) => [entry.name, entry.contentHash]),
    ),
    jobPins: job.skillPins,
  },
  sourceRegistration: {
    registryPath: path.relative(root, registryPath).split(path.sep).join("/"),
    registrySha256: sha256(registryBytes),
    id: source.id,
    status: source.status,
    authority: source.authority,
    parameters: dryRun.sourceParameters,
    rateLimitRequestsPerSecond: source.researchAdapter.rateLimitRequestsPerSecond,
    negativeSemantics: source.negativeSemantics,
  },
  orderedScope: {
    states: job.stateOrSourceScope.states,
    taxa: dryRun.selectedTaxa,
    pairs: dryRun.selectedPairKeys,
    pairCount: dryRun.selectedPairKeys.length,
    pairHash: dryRun.selectedPairHash,
  },
  candidateFile: dryRun.candidateFile,
  limitFlags: {
    candidateLimit: dryRun.candidateLimit,
    pageLimit: {
      value: dryRun.sourceParameters.pageLimit,
      meaning: "maximum provider records per occurrence page, not a result or pair limit",
    },
    artifactBytes: {
      value: job.resourcePolicy.maxArtifactBytes,
      meaning: "maximum retained artifact bytes before incomplete scope is blocked",
    },
    wallMinutes: {
      value: job.resourcePolicy.maxWallMinutes,
      meaning: "maximum worker wall time before safe stop and resume",
    },
  },
  expandedCommand: dryRun.expandedCommand,
  expectedProviderRequests: dryRun.expectedProviderRequests,
  deterministicRun: {
    startedAt: contract.startedAt,
    parameterHash: dryRun.parameterHash,
    suffix: dryRun.deterministicRunSuffix,
    path: dryRun.expectedRunPath,
  },
  expectedReceiptCodeCommit: job.expectedReceiptCodeCommit,
  paths: {
    permitted: job.permittedPaths,
    prohibited: job.prohibitedPaths,
    baseTreeChecks,
  },
  dependencyResolution: contract.dependencyResolution,
  writableStaging: {
    attemptTelemetryPath: contract.attemptTelemetryPath,
    outputRoot: dryRun.outputRoot,
  },
  deduplicationIdentity: {
    sourceId: dryRun.sourceId,
    stateCode: dryRun.stateCode,
    orderedPairHash: dryRun.selectedPairHash,
    parameterHash: dryRun.parameterHash,
    runPath: dryRun.expectedRunPath,
  },
  existingCacheAndPartialRunSearch: {
    taxonomyCache: dryRun.taxonomyCache,
    archiveReplay: contract.archiveReplay ?? null,
    completePriorPairs,
    incompletePriorPairs,
    matchingRunReceipts,
    deterministicRunPathExists: false,
    priorLeases: priorLeases.map((entry: JsonRecord) => ({ leaseId: entry.leaseId, state: entry.state, attempt: entry.attempt })),
    priorQueueItems: priorQueueItems.map((entry: JsonRecord) => ({ queueId: entry.queueId, decision: entry.decision })),
  },
  resources,
  retryAndResume: job.retryPolicy,
  semanticDryRun: {
    path: dryRunRelativePath,
    sha256: sha256(dryRunBytes),
    networkRequestsIssued: 0,
    result: "pass",
  },
  semanticAttestation: {
    absenceFromSilence: false,
    notDetectedFromSilence: false,
    notApplicableFromSilence: false,
    incompletePaginationCanCompleteScope: false,
  },
};
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(preflight, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  output: path.relative(root, outputPath).split(path.sep).join("/"),
  preflightId: preflight.preflightId,
  result: preflight.result,
  pairs: dryRun.selectedPairKeys.length,
  cachedTaxonomyResponses: dryRun.expectedProviderRequests.cachedTaxonomyResponses,
  archiveReplayResponses: dryRun.expectedProviderRequests.archiveReplayResponses,
  plannedLiveRequests: dryRun.expectedProviderRequests.providerNetworkRequests,
}, null, 2)}\n`);
