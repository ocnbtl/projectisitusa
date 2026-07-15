#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORCHESTRATOR = path.join(REPO_ROOT, ".agents/skills/isitusa-national-orchestrator/scripts/orchestrate.mjs");
const WORKER_VALIDATOR = path.join(REPO_ROOT, ".agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs");
const ORCHESTRATOR_SKILL = path.join(REPO_ROOT, ".agents/skills/isitusa-national-orchestrator");
const WORKER_SKILL = path.join(REPO_ROOT, ".agents/skills/isitusa-evidence-worker");
const NOW = "2026-07-15T12:00:00Z";
const EXPIRES = "2026-07-16T12:00:00Z";
const REQUIRED_PROHIBITED = [
  ".agents/skills/**",
  "AGENTS.md",
  "package.json",
  "package-lock.json",
  "src/data/research/schemas/**",
  "src/data/research/source-registry.json",
  "src/data/research/research-protocols.json",
  "scripts/compile-research-index.ts",
  "scripts/check-research-integrity.ts",
  "src/data/generated/**",
  "public/generated/**",
  "app/**",
  "src/components/**",
  ".vercel/**",
  "vercel.json",
];

const started = process.hrtime.bigint();
let peakMemoryBytes = process.memoryUsage().rss;
const cases = [];

function sampleMemory() {
  peakMemoryBytes = Math.max(peakMemoryBytes, process.memoryUsage().rss);
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function listFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === ".DS_Store") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  walk(root);
  return files;
}

function hashTree(root) {
  const hash = crypto.createHash("sha256");
  for (const file of listFiles(root)) {
    hash.update(path.relative(root, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function run(command, args, cwd) {
  sampleMemory();
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  sampleMemory();
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runGit(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeNdjson(file, records) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "");
}

function record(name, expected, result, detail) {
  const passed = expected === "pass" ? result.status === 0 : result.status !== 0;
  cases.push({ name, expected, passed, exitCode: result.status, detail });
  if (!passed) {
    process.stderr.write(`${name} failed expectation ${expected}\n${result.stdout}\n${result.stderr}\n`);
  }
}

function pins() {
  return [
    { name: "isitusa-national-orchestrator", version: "candidate-cycle-3", gitCommit: null, contentHash: hashTree(ORCHESTRATOR_SKILL), path: ORCHESTRATOR_SKILL },
    { name: "isitusa-evidence-worker", version: "candidate-cycle-3", gitCommit: null, contentHash: hashTree(WORKER_SKILL), path: WORKER_SKILL },
  ];
}

function makeJob({ jobId, baseSha, branch, worktree, claims }) {
  return {
    jobId,
    workerType: "evidence-review",
    stateOrSourceScope: { states: ["AL"], sourceFamilies: ["synthetic-source"] },
    taxaOrPairScope: { taxa: ["species-a"], pairs: ["01001:species-a"] },
    scopeClaims: claims,
    baseSha,
    branch,
    worktree,
    permittedPaths: ["worker-output/**"],
    prohibitedPaths: REQUIRED_PROHIBITED,
    skillPins: pins(),
    expectedOutputs: ["manifest", "artifacts", "assertions", "reviews", "rejections", "outcomes", "receipt"],
    retryPolicy: { maxAttempts: 3, backoffSeconds: [1, 2, 4], resumeRequired: true },
    resourcePolicy: { maxArtifactBytes: 1000000, maxWallMinutes: 10, maxMemoryMb: 512 },
    expiresAt: EXPIRES,
    recoveryState: "none",
    completionCriteria: ["one pair outcome", "one complete manifest"],
    dependencies: [],
    priority: 100,
    state: "planned",
  };
}

function makeLease(job, overrides = {}) {
  return {
    leaseId: `lease-${job.jobId}-1`,
    jobId: job.jobId,
    attempt: 1,
    state: "active",
    claimedAt: NOW,
    expiresAt: EXPIRES,
    workerTaskId: `worker-${job.jobId}`,
    expectedManifestPath: "worker-output/manifest.json",
    previousLeaseId: null,
    recoveryReason: null,
    recoveryAt: null,
    baseSha: job.baseSha,
    branch: job.branch,
    worktree: job.worktree,
    stateOrSourceScope: job.stateOrSourceScope,
    taxaOrPairScope: job.taxaOrPairScope,
    scopeClaims: job.scopeClaims,
    permittedPaths: job.permittedPaths,
    prohibitedPaths: job.prohibitedPaths,
    skillPins: job.skillPins,
    expectedOutputs: job.expectedOutputs,
    retryPolicy: job.retryPolicy,
    resourcePolicy: job.resourcePolicy,
    completionCriteria: job.completionCriteria,
    ...overrides,
  };
}

function setupGitFixture(root) {
  const repo = path.join(root, "repo");
  const worktree = path.join(root, "worktree");
  fs.mkdirSync(repo, { recursive: true });
  runGit(repo, ["init", "-b", "main"]);
  runGit(repo, ["config", "user.email", "fixture@example.com"]);
  runGit(repo, ["config", "user.name", "Fixture"]);
  fs.writeFileSync(path.join(repo, "seed.txt"), "seed\n");
  fs.writeFileSync(path.join(repo, ".gitattributes"), "worker-output/*.headers.txt binary\n");
  runGit(repo, ["add", "seed.txt", ".gitattributes"]);
  runGit(repo, ["commit", "-m", "seed"]);
  const baseSha = runGit(repo, ["rev-parse", "HEAD"]);
  runGit(repo, ["worktree", "add", "-b", "codex/test-job", worktree, baseSha]);
  return { repo, worktree, baseSha };
}

function assertion(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "assertion-1",
    event_type: "evidence.asserted",
    created_at: NOW,
    actor_type: "adapter",
    actor_id: "synthetic-adapter",
    run_id: "run-1",
    source_id: "synthetic-source",
    state_code: "AL",
    county_fips: "01001",
    species_id: "species-a",
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "county",
    source_record_id: "record-1",
    source_url: "https://example.org/record-1",
    source_record_date: "2026-07-01",
    retrieved_at: NOW,
    taxon_match: { method: "exact", target_scientific_name: "Species alpha", source_scientific_name: "Species alpha", source_taxon_key: "taxon-1" },
    geography_match: { method: "explicit-county", source_state: "Alabama", source_county: "Autauga", county_fips: "01001" },
    temporal_scope: "2026-07-01",
    spatial_scope: "Autauga County, Alabama",
    survey_scope: null,
    normalized_payload_hash: "a".repeat(64),
    caveats: [],
    notes: ["Synthetic positive fixture."],
    ...overrides,
  };
}

function review(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "review-1",
    event_type: "evidence.reviewed",
    created_at: NOW,
    actor_type: "agent",
    actor_id: "worker-test-job",
    run_id: "run-1",
    source_id: "synthetic-source",
    state_code: "AL",
    county_fips: "01001",
    species_id: "species-a",
    references: { assertion_event_id: "assertion-1" },
    review_level: "agent-reviewed",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: ["exact-match"],
    notes: [],
    ...overrides,
  };
}

function outcome(overrides = {}) {
  return {
    schemaVersion: 1,
    outcome_id: "outcome-1",
    run_id: "run-1",
    source_id: "synthetic-source",
    state_code: "AL",
    county_fips: "01001",
    species_id: "species-a",
    status: "evidence-found",
    scope_complete: true,
    recorded_at: NOW,
    assertion_event_ids: ["assertion-1"],
    rejection_ids: [],
    query_urls: ["https://example.org/query"],
    notes: [],
    ...overrides,
  };
}

function buildValidWorkerOutput(worktree, lease) {
  const outputRoot = path.join(worktree, "worker-output");
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, "raw.json"), "{\"record\":1}\n");
  writeNdjson(path.join(outputRoot, "assertions.ndjson"), [assertion()]);
  writeNdjson(path.join(outputRoot, "reviews.ndjson"), [review()]);
  writeNdjson(path.join(outputRoot, "rejections.ndjson"), []);
  writeNdjson(path.join(outputRoot, "outcomes.ndjson"), [outcome()]);
  runGit(worktree, ["add", "worker-output/raw.json", "worker-output/assertions.ndjson", "worker-output/reviews.ndjson", "worker-output/rejections.ndjson", "worker-output/outcomes.ndjson"]);
  runGit(worktree, ["commit", "-m", "worker artifacts"]);
  const contentCommit = runGit(worktree, ["rev-parse", "HEAD"]);
  const manifest = {
    schemaVersion: 1,
    jobId: lease.jobId,
    leaseId: lease.leaseId,
    status: "complete",
    branch: lease.branch,
    worktree,
    baseSha: lease.baseSha,
    commitSha: contentCommit,
    skillPins: lease.skillPins,
    sourceParameters: { negativeSemantics: "none", geographyPolicyApproved: false, query: "synthetic" },
    artifacts: [{ path: "worker-output/raw.json", sha256: sha256File(path.join(outputRoot, "raw.json")), bytes: fs.statSync(path.join(outputRoot, "raw.json")).size }],
    assertions: [{ path: "worker-output/assertions.ndjson", count: 1 }],
    reviews: [{ path: "worker-output/reviews.ndjson", count: 1 }],
    rejections: [{ path: "worker-output/rejections.ndjson", count: 0 }],
    outcomes: [{ path: "worker-output/outcomes.ndjson", count: 1 }],
    blockedItems: [],
    counts: { baseline: { evidence: 0, outcomes: 0 }, final: { evidence: 1, outcomes: 1 }, net: { evidence: 1, outcomes: 1 } },
    verificationCommands: [
      { command: "node synthetic-check.mjs", exitCode: 0, result: "pass" },
      { command: `git diff --check ${lease.baseSha}...HEAD`, exitCode: 0, result: "pass" },
    ],
    retryResume: { attempt: 1, retryable: false, resumeToken: null, remainingRequests: [] },
    remainingWork: [],
    sharedChangeProposals: [],
    performance: { wallSeconds: 2, peakMemoryMb: 64, validPairsScreened: 1, manualInterventions: 0 },
    semanticAttestation: {
      sourceSilenceCreatedNegative: false,
      failedRequestCreatedNegative: false,
      rejectionCreatedNegative: false,
      missingGeographyCreatedDetermination: false,
      incompleteScopeMarkedComplete: false,
    },
  };
  writeJson(path.join(outputRoot, "manifest.json"), manifest);
  runGit(worktree, ["add", "worker-output/manifest.json"]);
  runGit(worktree, ["commit", "-m", "worker manifest"]);
  return { manifest, manifestPath: path.join(outputRoot, "manifest.json") };
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "isitusa-skill-regression-"));

try {
  const { worktree, baseSha } = setupGitFixture(fixtureRoot);
  const job = makeJob({ jobId: "test-job", baseSha, branch: "codex/test-job", worktree, claims: ["state/AL/source/synthetic-source/taxon/species-a"] });
  const lease = makeLease(job);
  const leasePath = path.join(fixtureRoot, "lease.json");
  writeJson(leasePath, lease);

  let result = run("node", [WORKER_VALIDATOR, "preflight", "--lease", leasePath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("valid_preflight", "pass", result, "A clean isolated worker with exact pins is accepted.");

  const wrongBasePath = path.join(fixtureRoot, "wrong-base.json");
  writeJson(wrongBasePath, { ...lease, baseSha: "0".repeat(40) });
  result = run("node", [WORKER_VALIDATOR, "preflight", "--lease", wrongBasePath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("incorrect_base_commit", "reject", result, "A lease with the wrong base SHA is rejected.");

  const mainPath = path.join(fixtureRoot, "main-branch.json");
  writeJson(mainPath, { ...lease, branch: "main" });
  result = run("node", [WORKER_VALIDATOR, "preflight", "--lease", mainPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("worker_attempts_main", "reject", result, "A worker lease naming main is rejected.");

  const stalePinPath = path.join(fixtureRoot, "stale-pin.json");
  writeJson(stalePinPath, { ...lease, skillPins: lease.skillPins.map((pin, index) => index === 0 ? { ...pin, contentHash: "0".repeat(64) } : pin) });
  result = run("node", [WORKER_VALIDATOR, "preflight", "--lease", stalePinPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("stale_skill_version", "reject", result, "A stale pinned content hash is rejected.");

  const valid = buildValidWorkerOutput(worktree, lease);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("complete_manifest", "pass", result, "A complete positive-evidence manifest passes.");
  const deterministicFirst = result.stdout;
  const deterministicSecond = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("deterministic_manifest_validation", "pass", { ...deterministicSecond, status: deterministicSecond.status === 0 && deterministicSecond.stdout === deterministicFirst ? 0 : 1 }, "Repeated validation emits identical JSON.");

  const originalManifest = fs.readFileSync(valid.manifestPath);
  const originalAssertions = fs.readFileSync(path.join(worktree, "worker-output/assertions.ndjson"));

  const rawHeaderBytes = Buffer.from("HTTP/2 200\r\nx-provider: value  \r\n\r\n", "utf8");
  fs.writeFileSync(path.join(worktree, "worker-output/raw.headers.txt"), rawHeaderBytes);
  fs.writeFileSync(path.join(worktree, "worker-output/bad-text.txt"), "ordinary text with trailing spaces  \n");
  runGit(worktree, ["add", "worker-output/raw.headers.txt", "worker-output/bad-text.txt"]);
  runGit(worktree, ["commit", "-m", "adversarial whitespace artifacts"]);
  const committedHeaderBytes = execFileSync("git", ["-C", worktree, "show", "HEAD:worker-output/raw.headers.txt"]);
  record(
    "binary_header_bytes_preserved",
    "pass",
    { status: committedHeaderBytes.equals(rawHeaderBytes) ? 0 : 1, stdout: "", stderr: "" },
    "A repository-declared binary header retains the exact provider bytes in Git.",
  );
  writeJson(valid.manifestPath, { ...valid.manifest, verificationCommands: [{ command: "git diff --check", exitCode: 0, result: "pass" }] });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("committed_whitespace_false_attestation", "reject", result, "A generic clean-worktree attestation cannot hide committed text whitespace while immutable binary header bytes remain exempt.");
  fs.unlinkSync(path.join(worktree, "worker-output/bad-text.txt"));
  fs.writeFileSync(valid.manifestPath, originalManifest);
  runGit(worktree, ["add", "worker-output/bad-text.txt", "worker-output/manifest.json"]);
  runGit(worktree, ["commit", "-m", "correct whitespace attestation fixture"]);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("binary_header_exact_attestation", "pass", result, "The exact base-to-head attestation passes after ordinary text whitespace is corrected without changing raw header bytes.");

  fs.mkdirSync(path.join(worktree, "public/generated"), { recursive: true });
  fs.writeFileSync(path.join(worktree, "public/generated/forbidden.json"), "{}\n");
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("worker_shared_projection_write", "reject", result, "A worker shared projection write is rejected.");
  fs.unlinkSync(path.join(worktree, "public/generated/forbidden.json"));

  const silenceAssertion = assertion({
    claim_type: "officially-absent",
    evidence_kind: "absence-statement",
    notes: ["Empty query returned no records."],
  });
  writeNdjson(path.join(worktree, "worker-output/assertions.ndjson"), [silenceAssertion]);
  const silenceManifest = { ...valid.manifest, sourceParameters: { negativeSemantics: "none", geographyPolicyApproved: false }, semanticAttestation: { ...valid.manifest.semanticAttestation, sourceSilenceCreatedNegative: true } };
  writeJson(valid.manifestPath, silenceManifest);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("source_silence_negative", "reject", result, "Source silence cannot create absence.");

  const unsupportedNegative = assertion({
    claim_type: "not-detected",
    evidence_kind: "occurrence",
    survey_scope: null,
    notes: ["No records."],
  });
  writeNdjson(path.join(worktree, "worker-output/assertions.ndjson"), [unsupportedNegative]);
  writeJson(valid.manifestPath, { ...valid.manifest, sourceParameters: { negativeSemantics: "none", geographyPolicyApproved: false } });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("unsupported_negative_evidence", "reject", result, "Unsupported not-detected evidence is rejected.");

  const duplicate = assertion({ eventId: "assertion-2" });
  writeNdjson(path.join(worktree, "worker-output/assertions.ndjson"), [assertion(), duplicate]);
  writeJson(valid.manifestPath, { ...valid.manifest, assertions: [{ path: "worker-output/assertions.ndjson", count: 2 }] });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("duplicate_records", "reject", result, "Duplicate source identities are rejected.");

  fs.writeFileSync(path.join(worktree, "worker-output/assertions.ndjson"), originalAssertions);
  const incompletePath = path.join(fixtureRoot, "incomplete-manifest.json");
  writeJson(incompletePath, { schemaVersion: 1, jobId: lease.jobId, leaseId: lease.leaseId });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", incompletePath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("incomplete_manifest", "reject", result, "Missing completion fields are rejected.");

  const interrupted = { ...valid.manifest, retryResume: { attempt: 1, retryable: true, resumeToken: "page-2", remainingRequests: ["page-2"] } };
  writeJson(valid.manifestPath, interrupted);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("interrupted_marked_complete", "reject", result, "Interrupted retryable acquisition cannot be complete.");

  const resumable = {
    ...valid.manifest,
    status: "partial",
    blockedItems: ["remaining page"],
    remainingWork: ["resume page-2"],
    retryResume: { attempt: 1, retryable: true, resumeToken: "page-2", remainingRequests: ["page-2"] },
  };
  writeJson(valid.manifestPath, resumable);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("retry_resumability", "pass", result, "Partial work with an exact resume point passes.");
  fs.writeFileSync(valid.manifestPath, originalManifest);

  const orchestrationRoot = path.join(fixtureRoot, "orchestration");
  const secondJob = makeJob({ jobId: "test-job-two", baseSha, branch: "codex/test-job-two", worktree: path.join(fixtureRoot, "worktree-two"), claims: ["state/AL/source/*/taxon/species-a"] });
  const firstLeased = { ...job, state: "leased", currentLeaseId: lease.leaseId };
  const secondLease = makeLease(secondJob, { leaseId: "lease-test-job-two-1", workerTaskId: "worker-test-job-two" });
  writeJson(path.join(orchestrationRoot, "jobs.json"), { schemaVersion: 1, jobs: [firstLeased, { ...secondJob, state: "leased", currentLeaseId: secondLease.leaseId }] });
  writeJson(path.join(orchestrationRoot, "leases.json"), { schemaVersion: 1, leases: [lease, secondLease] });
  writeJson(path.join(orchestrationRoot, "integration-queue.json"), { schemaVersion: 1, items: [] });
  result = run("node", [ORCHESTRATOR, "validate", "--root", orchestrationRoot, "--now", NOW], REPO_ROOT);
  record("overlapping_leases", "reject", result, "Hierarchical overlapping active claims are rejected.");

  const retryRoot = path.join(fixtureRoot, "retry-orchestration");
  const retryJob = {
    ...makeJob({ jobId: job.jobId, baseSha: "f".repeat(40), branch: "codex/test-job-retry", worktree: path.join(fixtureRoot, "worktree-retry"), claims: job.scopeClaims }),
    state: "blocked",
    currentLeaseId: lease.leaseId,
  };
  const completedFirstLease = { ...lease, state: "completed", transitionedAt: NOW };
  const retryLease = makeLease(retryJob, {
    leaseId: "lease-test-job-2",
    attempt: 2,
    previousLeaseId: lease.leaseId,
    recoveryReason: "Retry under a corrected base and pinned skill version.",
    recoveryAt: NOW,
    workerTaskId: "worker-test-job-retry",
  });
  writeJson(path.join(retryRoot, "jobs.json"), { schemaVersion: 1, jobs: [retryJob] });
  writeJson(path.join(retryRoot, "leases.json"), { schemaVersion: 1, leases: [completedFirstLease] });
  writeJson(path.join(retryRoot, "integration-queue.json"), { schemaVersion: 1, items: [] });
  const retryLeasePath = path.join(fixtureRoot, "retry-lease.json");
  writeJson(retryLeasePath, retryLease);
  result = run("node", [ORCHESTRATOR, "claim", "--root", retryRoot, "--job", retryJob.jobId, "--lease", retryLeasePath, "--now", NOW], REPO_ROOT);
  record("retry_new_base_and_skill_snapshot", "pass", result, "A closed historical lease keeps its immutable snapshot while a bounded retry advances the current job and active lease.");

  const deterministicRoot = path.join(fixtureRoot, "deterministic-orchestration");
  writeJson(path.join(deterministicRoot, "jobs.json"), { schemaVersion: 1, jobs: [] });
  writeJson(path.join(deterministicRoot, "leases.json"), { schemaVersion: 1, leases: [] });
  writeJson(path.join(deterministicRoot, "integration-queue.json"), { schemaVersion: 1, items: [] });
  result = run("node", [ORCHESTRATOR, "dashboard", "--root", deterministicRoot, "--as-of", NOW], REPO_ROOT);
  const firstDashboard = fs.readFileSync(path.join(deterministicRoot, "dashboard.json"));
  const secondDashboardRun = run("node", [ORCHESTRATOR, "dashboard", "--root", deterministicRoot, "--as-of", NOW], REPO_ROOT);
  const secondDashboard = fs.readFileSync(path.join(deterministicRoot, "dashboard.json"));
  record("deterministic_dashboard", "pass", { ...secondDashboardRun, status: result.status === 0 && secondDashboardRun.status === 0 && firstDashboard.equals(secondDashboard) ? 0 : 1 }, "Dashboard bytes are stable for the same state and as-of time.");
} finally {
  sampleMemory();
}

const wallSeconds = Number(process.hrtime.bigint() - started) / 1e9;
const passed = cases.filter((item) => item.passed).length;
const failed = cases.length - passed;
const report = {
  schemaVersion: 1,
  suite: "national-research-skill-regression",
  candidateCycle: 3,
  checkedAt: new Date().toISOString(),
  result: failed === 0 ? "pass" : "fail",
  counts: { total: cases.length, passed, failed, criticalSafetyViolations: failed },
  performance: { wallSeconds: Number(wallSeconds.toFixed(3)), peakMemoryMb: Number((peakMemoryBytes / 1024 / 1024).toFixed(3)), manualInterventions: 0 },
  cases,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = failed === 0 ? 0 : 1;
