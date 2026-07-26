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
const RECOVERY_VERSION = "candidate-postfreeze-lineage-r2";
const NOW = "2026-07-15T12:00:00Z";
const EXPIRES = "2026-07-16T12:00:00Z";
const SOURCE_ID = "gbif-preserved-specimens";
const RUN_ID = "worker-output";
const STATE_CODE = "AL";
const COUNTY_FIPS = "01001";
const SPECIES_ID = "dreissena-bugensis";
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

function sha256Value(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function compareCodePoints(left, right) {
  const leftCodePoints = Array.from(left, (character) => character.codePointAt(0));
  const rightCodePoints = Array.from(right, (character) => character.codePointAt(0));
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftCodePoints[index] - rightCodePoints[index];
    if (difference !== 0) return difference;
  }
  return leftCodePoints.length - rightCodePoints.length;
}

function fileDescriptor(file, relativePath, mediaType) {
  return {
    path: relativePath,
    sha256: sha256File(file),
    bytes: fs.statSync(file).size,
    media_type: mediaType,
  };
}

function listFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".DS_Store") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  walk(root);
  return files.sort((left, right) => compareCodePoints(
    path.relative(root, left).split(path.sep).join("/"),
    path.relative(root, right).split(path.sep).join("/"),
  ));
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
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ISITUSA_SKILL_TEST_VALIDATION_ROOT: REPO_ROOT },
  });
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
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

function recordRejectsWith(name, result, fragment, detail) {
  const combined = `${result.stdout}\n${result.stderr}`;
  const passed = result.status !== 0 && combined.includes(fragment);
  cases.push({ name, expected: "reject", passed, exitCode: result.status, detail });
  if (!passed) {
    process.stderr.write(`${name} did not reject with ${fragment}\n${result.stdout}\n${result.stderr}\n`);
  }
}

function pins() {
  return [
    { name: "isitusa-national-orchestrator", version: RECOVERY_VERSION, gitCommit: null, contentHash: hashTree(ORCHESTRATOR_SKILL) },
    { name: "isitusa-evidence-worker", version: RECOVERY_VERSION, gitCommit: null, contentHash: hashTree(WORKER_SKILL) },
  ];
}

function makeJob({ jobId, baseSha, branch, worktree, claims, expectedReceiptCodeCommit = baseSha }) {
  return {
    jobId,
    workerType: "evidence-review",
    stateOrSourceScope: { states: [STATE_CODE], sourceFamilies: [SOURCE_ID] },
    taxaOrPairScope: { taxa: [SPECIES_ID], pairs: [`${COUNTY_FIPS}:${SPECIES_ID}`] },
    scopeClaims: claims,
    baseSha,
    expectedReceiptCodeCommit,
    branch,
    worktree,
    permittedPaths: ["worker-output/**"],
    prohibitedPaths: REQUIRED_PROHIBITED,
    skillPins: pins(),
    expectedOutputs: ["manifest", "artifacts", "assertions", "reviews", "rejections", "outcomes", "receipt", "source-verification"],
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
    expectedReceiptCodeCommit: job.expectedReceiptCodeCommit,
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
  fs.writeFileSync(
    path.join(repo, ".gitignore"),
    "worker-output/.ignored-secret\nops/national-research/.orchestration.lock\n",
  );
  const provenanceFiles = [
    "src/data/research/source-registry.json",
    "scripts/research/adapters/gbif-preserved-specimens.ts",
  ];
  const validationFiles = [
    "scripts/research/validate-immutable-run.ts",
    "src/data/generated/species.json",
    "src/data/research/county-equivalent-registry.json",
    "src/data/research/state-registry.json",
    "tsconfig.json",
  ];
  const validationTrees = [
    "src/data/research/schemas",
    "src/lib/research",
  ];
  for (const filepath of provenanceFiles) {
    const destination = path.join(repo, filepath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, filepath), destination);
  }
  for (const filepath of validationFiles) {
    const destination = path.join(repo, filepath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, filepath), destination);
  }
  for (const directory of validationTrees) {
    fs.cpSync(path.join(REPO_ROOT, directory), path.join(repo, directory), { recursive: true });
  }
  fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(repo, "node_modules"), "dir");
  for (const skillName of ["isitusa-national-orchestrator", "isitusa-evidence-worker"]) {
    fs.cpSync(
      path.join(REPO_ROOT, ".agents", "skills", skillName),
      path.join(repo, ".agents", "skills", skillName),
      { recursive: true },
    );
  }
  runGit(repo, ["add", "seed.txt", ".gitattributes", ".gitignore", ".agents/skills", "node_modules", ...provenanceFiles, ...validationFiles, ...validationTrees]);
  runGit(repo, ["commit", "-m", "seed"]);
  const acquisitionSha = runGit(repo, ["rev-parse", "HEAD"]);
  fs.writeFileSync(path.join(repo, "validator-seed.txt"), "validator\n");
  runGit(repo, ["add", "validator-seed.txt"]);
  runGit(repo, ["commit", "-m", "validator seed"]);
  const baseSha = runGit(repo, ["rev-parse", "HEAD"]);
  runGit(repo, ["worktree", "add", "-b", "codex/test-job", worktree, baseSha]);
  return { repo, worktree, baseSha, acquisitionSha };
}

function assertion(overrides = {}) {
  return {
    schemaVersion: 1,
    eventId: "assertion-1",
    event_type: "evidence.asserted",
    created_at: NOW,
    actor_type: "adapter",
    actor_id: `${SOURCE_ID}@1.0.2`,
    run_id: RUN_ID,
    source_id: SOURCE_ID,
    state_code: STATE_CODE,
    county_fips: COUNTY_FIPS,
    species_id: SPECIES_ID,
    claim_type: "recorded-present",
    evidence_kind: "preserved-specimen",
    scope: "point",
    source_record_id: "record-1",
    source_url: "https://example.org/record-1",
    source_record_date: "2026-07-01",
    retrieved_at: NOW,
    taxon_match: { method: "exact canonical binomial", target_scientific_name: "Dreissena bugensis", source_scientific_name: "Dreissena bugensis", source_taxon_key: "taxon-1" },
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
    run_id: RUN_ID,
    source_id: SOURCE_ID,
    state_code: STATE_CODE,
    county_fips: COUNTY_FIPS,
    species_id: SPECIES_ID,
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
    run_id: RUN_ID,
    source_id: SOURCE_ID,
    state_code: STATE_CODE,
    county_fips: COUNTY_FIPS,
    species_id: SPECIES_ID,
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

function buildValidWorkerOutput(worktree, lease, options = {}) {
  const outputRoot = path.join(worktree, "worker-output");
  fs.mkdirSync(outputRoot, { recursive: true });
  const rawPath = path.join(outputRoot, "raw.json");
  const rawHeadersPath = path.join(outputRoot, "raw.headers.txt");
  const assertionsPath = path.join(outputRoot, "assertions.ndjson");
  const reviewsPath = path.join(outputRoot, "reviews.ndjson");
  const rejectionsPath = path.join(outputRoot, "rejections.ndjson");
  const outcomesPath = path.join(outputRoot, "outcomes.ndjson");
  const sourceVerificationPath = path.join(outputRoot, "source-verification.json");
  const receiptPath = path.join(outputRoot, "receipt.json");
  fs.writeFileSync(rawPath, options.rawBytes ?? "{\"record\":1}\n");
  fs.writeFileSync(rawHeadersPath, Buffer.from("HTTP/2 200\r\nx-provider: value  \r\n\r\n", "utf8"));
  writeNdjson(assertionsPath, [assertion()]);
  writeNdjson(reviewsPath, [review()]);
  writeNdjson(rejectionsPath, []);
  writeNdjson(outcomesPath, [outcome()]);
  const artifactReferences = [
    fileDescriptor(rawPath, "worker-output/raw.json", "application/json"),
    fileDescriptor(rawHeadersPath, "worker-output/raw.headers.txt", "application/octet-stream"),
  ];
  const parameters = {
    stateCode: STATE_CODE,
    candidateLimit: 1,
    candidatePairs: [`${COUNTY_FIPS}:${SPECIES_ID}`],
    basisOfRecord: "PRESERVED_SPECIMEN",
    occurrenceStatus: "PRESENT",
    minimumMatchConfidence: 95,
    pageLimit: 300,
  };
  const sourceVerification = {
    schemaVersion: 1,
    verifiedAt: NOW,
    runId: RUN_ID,
    sourceId: SOURCE_ID,
    stateCode: STATE_CODE,
    pairKeys: [`${COUNTY_FIPS}:${SPECIES_ID}`],
    parameterHash: sha256Value(stableJson(parameters)),
    authority: {
      name: "Global Biodiversity Information Facility",
      sourceUrl: "https://www.gbif.org/",
      publisher: "Synthetic regression fixture",
    },
    terms: {
      license: "CC0-1.0",
      termsUrl: "https://www.gbif.org/terms",
      retentionAllowed: true,
    },
    availability: {
      status: "available",
      checkedAt: NOW,
      freshnessDate: "2026-07-01",
    },
    geography: {
      method: "explicit-county-text",
      countyEquivalentSupported: true,
      coordinatePolicy: "not-used",
    },
    taxonomy: {
      method: "strict-exact-species-match",
      targetSpeciesIds: [SPECIES_ID],
    },
    acquisition: {
      snapshotComplete: true,
      paginationComplete: true,
      stableIdentityFields: ["source_record_id"],
      requests: [
        {
          requestGroupId: "complete-screen",
          url: "https://example.org/query",
          purpose: "complete source screen",
          attempts: 1,
          status: 200,
          retrievedAt: NOW,
          declaredRecordCount: 1,
          receivedRecordCount: 1,
          pagination: {
            mode: "single",
            pageIndex: 0,
            offset: null,
            limit: null,
            cursor: null,
            nextCursor: null,
            endOfRecords: true,
          },
        },
      ],
    },
    negativeEvidence: {
      supportsVerifiedAbsence: false,
      supportsNotDetected: false,
      limitations: ["Source silence supports neither absence nor non-detection."],
    },
    retainedEvidence: artifactReferences.map(({ path: value, sha256, bytes }) => ({ path: value, sha256, bytes })),
    caveats: ["Synthetic validation fixture only."],
  };
  writeJson(sourceVerificationPath, sourceVerification);
  const outputReferences = [
    fileDescriptor(assertionsPath, "worker-output/assertions.ndjson", "application/x-ndjson"),
    fileDescriptor(reviewsPath, "worker-output/reviews.ndjson", "application/x-ndjson"),
    fileDescriptor(rejectionsPath, "worker-output/rejections.ndjson", "application/x-ndjson"),
    fileDescriptor(outcomesPath, "worker-output/outcomes.ndjson", "application/x-ndjson"),
    fileDescriptor(sourceVerificationPath, "worker-output/source-verification.json", "application/json"),
  ];
  const receipt = {
    schemaVersion: 1,
    run_id: RUN_ID,
    status: "complete",
    started_at: NOW,
    finished_at: NOW,
    actor_type: "agent",
    actor_id: lease.workerTaskId,
    source_id: SOURCE_ID,
    source_registry_hash: sha256File(path.join(REPO_ROOT, "src/data/research/source-registry.json")),
    adapter_id: SOURCE_ID,
    adapter_version: "1.0.2",
    adapter_code_hash: sha256File(path.join(REPO_ROOT, "scripts/research/adapters/gbif-preserved-specimens.ts")),
    code_commit: lease.expectedReceiptCodeCommit ?? lease.baseSha,
    parameter_hash: sha256Value(stableJson(parameters)),
    parameters,
    requested_scope: {
      state_code: STATE_CODE,
      county_fips: [COUNTY_FIPS],
      species_ids: [SPECIES_ID],
      pair_keys: [`${COUNTY_FIPS}:${SPECIES_ID}`],
      date_range: { start: null, end: null },
    },
    upstream_requests: [
      { url: "https://example.org/query", status: 200, retrieved_at: NOW, record_count: 1 },
    ],
    artifacts: artifactReferences,
    outputs: outputReferences,
    counts: {
      requested_pairs: 1,
      candidate_records: 1,
      assertion_events: 1,
      review_events: 1,
      rejection_records: 0,
      duplicate_records: 0,
      error_count: 0,
      pair_outcomes: 1,
    },
    errors: [],
    known_caveats: ["Synthetic validation fixture only."],
    source_warnings: [],
    deviations: [],
    rerun_command: "node scripts/test-national-research-skills.mjs",
  };
  writeJson(receiptPath, receipt);
  runGit(worktree, ["add", "worker-output"]);
  runGit(worktree, ["commit", "-m", "worker artifacts"]);
  const contentCommit = runGit(worktree, ["rev-parse", "HEAD"]);
  const manifestArtifactReferences = artifactReferences.map(({ path: value, sha256, bytes }) => ({ path: value, sha256, bytes }));
  const retainedArtifactBytes = manifestArtifactReferences.reduce((total, entry) => total + entry.bytes, 0);
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
    sourceParameters: {
      sourceId: SOURCE_ID,
      adapterVersion: "1.0.2",
      stateCode: STATE_CODE,
      negativeSemantics: "none",
      geographyPolicyApproved: false,
      ...parameters,
    },
    artifacts: manifestArtifactReferences,
    assertions: [{ path: "worker-output/assertions.ndjson", count: 1 }],
    reviews: [{ path: "worker-output/reviews.ndjson", count: 1 }],
    rejections: [{ path: "worker-output/rejections.ndjson", count: 0 }],
    outcomes: [{ path: "worker-output/outcomes.ndjson", count: 1 }],
    receipt: { path: "worker-output/receipt.json", sha256: sha256File(receiptPath), bytes: fs.statSync(receiptPath).size },
    sourceVerification: { path: "worker-output/source-verification.json", sha256: sha256File(sourceVerificationPath), bytes: fs.statSync(sourceVerificationPath).size },
    blockedItems: [],
    counts: {
      baseline: { retainedArtifacts: 0, retainedArtifactBytes: 0, sourceRequests: 0, providerCandidates: 0, assertionEvents: 0, publicationEligibleAssertions: 0, reviewEvents: 0, rejectionRecords: 0, duplicateRecords: 0, distinctOutcomePairs: 0, completeOutcomePairs: 0, evidenceFoundOutcomes: 0, noQualifyingEvidenceOutcomes: 0, errors: 0 },
      final: { retainedArtifacts: manifestArtifactReferences.length, retainedArtifactBytes, sourceRequests: 1, providerCandidates: 1, assertionEvents: 1, publicationEligibleAssertions: 1, reviewEvents: 1, rejectionRecords: 0, duplicateRecords: 0, distinctOutcomePairs: 1, completeOutcomePairs: 1, evidenceFoundOutcomes: 1, noQualifyingEvidenceOutcomes: 0, errors: 0 },
      net: { retainedArtifacts: manifestArtifactReferences.length, retainedArtifactBytes, sourceRequests: 1, providerCandidates: 1, assertionEvents: 1, publicationEligibleAssertions: 1, reviewEvents: 1, rejectionRecords: 0, duplicateRecords: 0, distinctOutcomePairs: 1, completeOutcomePairs: 1, evidenceFoundOutcomes: 1, noQualifyingEvidenceOutcomes: 0, errors: 0 },
    },
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
  return { manifest, manifestPath: path.join(outputRoot, "manifest.json"), receipt, receiptPath, sourceVerification, sourceVerificationPath, outputRoot };
}

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "isitusa-skill-regression-"));

try {
  const { repo, worktree, baseSha } = setupGitFixture(fixtureRoot);
  runGit(worktree, ["sparse-checkout", "init", "--cone"]);
  runGit(worktree, ["sparse-checkout", "set", ".agents/skills", "public/generated", "scripts/research", "src/data/generated", "src/data/research", "src/lib/research", "worker-output"]);
  const job = makeJob({ jobId: "test-job", baseSha, branch: "codex/test-job", worktree, claims: [`state/${STATE_CODE}/source/${SOURCE_ID}/taxon/${SPECIES_ID}`] });
  const lease = makeLease(job);
  const leasePath = path.join(fixtureRoot, "lease.json");
  writeJson(leasePath, lease);

  let result = run("node", [WORKER_VALIDATOR, "preflight", "--lease", leasePath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("valid_preflight", "pass", result, "A clean isolated worker with exact pins is accepted.");

  const committedPinPath = path.join(fixtureRoot, "committed-pin.json");
  writeJson(committedPinPath, {
    ...lease,
    skillPins: lease.skillPins.map((pin) => ({ ...pin, gitCommit: baseSha })),
  });
  result = run("node", [WORKER_VALIDATOR, "preflight", "--lease", committedPinPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("pinned_commit_hash_matches_sparse_checkout", "pass", result, "A sparse linked worktree hashes checked-out and committed skill files in the same bytewise path order.");

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

  const externalPinPath = path.join(fixtureRoot, "external-pin.json");
  writeJson(externalPinPath, { ...lease, skillPins: lease.skillPins.map((pin) => ({ ...pin, path: path.join(REPO_ROOT, ".agents", "skills", pin.name) })) });
  result = run("node", [WORKER_VALIDATOR, "preflight", "--lease", externalPinPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("external_skill_pin_path", result, "path is forbidden", "A lease cannot redirect a skill pin outside its isolated worktree.");

  const valid = buildValidWorkerOutput(worktree, lease);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("complete_manifest", "pass", result, "A complete positive-evidence manifest passes.");
  const deterministicFirst = result.stdout;
  const deterministicSecond = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("deterministic_manifest_validation", "pass", { ...deterministicSecond, status: deterministicSecond.status === 0 && deterministicSecond.stdout === deterministicFirst ? 0 : 1 }, "Repeated validation emits identical JSON.");

  const lineageFixture = setupGitFixture(path.join(fixtureRoot, "recovery-lineage"));
  const lineageJob = makeJob({
    jobId: "test-job",
    baseSha: lineageFixture.baseSha,
    expectedReceiptCodeCommit: lineageFixture.acquisitionSha,
    branch: "codex/test-job",
    worktree: lineageFixture.worktree,
    claims: [`state/${STATE_CODE}/source/${SOURCE_ID}/taxon/${SPECIES_ID}`],
  });
  const lineageLease = makeLease(lineageJob);
  const lineageLeasePath = path.join(fixtureRoot, "recovery-lineage-lease.json");
  writeJson(lineageLeasePath, lineageLease);
  const lineageValid = buildValidWorkerOutput(lineageFixture.worktree, lineageLease);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", lineageLeasePath, "--manifest", lineageValid.manifestPath, "--repo", lineageFixture.worktree, "--now", NOW], REPO_ROOT);
  record("recovered_run_preserves_acquisition_code_commit", "pass", result, "A recovery lease can pin an older acquisition commit without rewriting the immutable receipt to the validator base.");

  const unpinnedLineageLeasePath = path.join(fixtureRoot, "recovery-lineage-unpinned.json");
  const { expectedReceiptCodeCommit: _omittedReceiptCommit, ...unpinnedLineageLease } = lineageLease;
  writeJson(unpinnedLineageLeasePath, unpinnedLineageLease);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", unpinnedLineageLeasePath, "--manifest", lineageValid.manifestPath, "--repo", lineageFixture.worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("recovered_run_requires_explicit_acquisition_commit_pin", result, "Receipt code commit differs", "An older receipt commit is rejected unless the recovery lease pins it explicitly.");

  const unrelatedLineageLeasePath = path.join(fixtureRoot, "recovery-lineage-unrelated.json");
  writeJson(unrelatedLineageLeasePath, {
    ...lineageLease,
    expectedReceiptCodeCommit: "f".repeat(40),
  });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", unrelatedLineageLeasePath, "--manifest", lineageValid.manifestPath, "--repo", lineageFixture.worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("recovered_run_rejects_unrelated_acquisition_commit", result, "not an ancestor", "A recovery lease cannot pin an unavailable or unrelated acquisition commit.");

  const largeFixture = setupGitFixture(path.join(fixtureRoot, "large-content"));
  const largeJob = makeJob({
    jobId: "test-job",
    baseSha: largeFixture.baseSha,
    branch: "codex/test-job",
    worktree: largeFixture.worktree,
    claims: [`state/${STATE_CODE}/source/${SOURCE_ID}/taxon/${SPECIES_ID}`],
  });
  largeJob.resourcePolicy.maxArtifactBytes = 2000000;
  const largeLease = makeLease(largeJob);
  const largeLeasePath = path.join(fixtureRoot, "large-content-lease.json");
  writeJson(largeLeasePath, largeLease);
  const largeRawBytes = Buffer.from(
    `{"record":"${"x".repeat(1200000)}"}\n`,
    "utf8",
  );
  const largeValid = buildValidWorkerOutput(
    largeFixture.worktree,
    largeLease,
    { rawBytes: largeRawBytes },
  );
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", largeLeasePath, "--manifest", largeValid.manifestPath, "--repo", largeFixture.worktree, "--now", NOW], REPO_ROOT);
  record("committed_artifact_over_1_mib_within_lease_limit", "pass", result, "A committed provider artifact above Node's default buffer passes within the pinned lease byte limit.");

  const largeRawPath = path.join(largeFixture.worktree, "worker-output/raw.json");
  const largeOriginalManifest = fs.readFileSync(largeValid.manifestPath);
  const sameLengthMutation = Buffer.from(largeRawBytes);
  sameLengthMutation[20] = sameLengthMutation[20] === 120 ? 121 : 120;
  fs.writeFileSync(largeRawPath, sameLengthMutation);
  runGit(largeFixture.worktree, ["add", "worker-output/raw.json"]);
  runGit(largeFixture.worktree, ["commit", "-m", "same length content mismatch"]);
  const hashMismatchCommit = runGit(largeFixture.worktree, ["rev-parse", "HEAD"]);
  fs.writeFileSync(largeRawPath, largeRawBytes);
  writeJson(largeValid.manifestPath, {
    ...largeValid.manifest,
    commitSha: hashMismatchCommit,
  });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", largeLeasePath, "--manifest", largeValid.manifestPath, "--repo", largeFixture.worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("committed_artifact_hash_mismatch", result, "artifacts[0] hash differs from manifest.commitSha", "Committed same-length artifact mutations are detected by content hash.");
  fs.writeFileSync(largeValid.manifestPath, largeOriginalManifest);
  runGit(largeFixture.worktree, ["add", "worker-output/raw.json"]);
  runGit(largeFixture.worktree, ["commit", "-m", "restore large artifact after hash test"]);

  fs.writeFileSync(largeRawPath, Buffer.concat([largeRawBytes, Buffer.from(" ")]));
  runGit(largeFixture.worktree, ["add", "worker-output/raw.json"]);
  runGit(largeFixture.worktree, ["commit", "-m", "different length content mismatch"]);
  const byteMismatchCommit = runGit(largeFixture.worktree, ["rev-parse", "HEAD"]);
  fs.writeFileSync(largeRawPath, largeRawBytes);
  writeJson(largeValid.manifestPath, {
    ...largeValid.manifest,
    commitSha: byteMismatchCommit,
  });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", largeLeasePath, "--manifest", largeValid.manifestPath, "--repo", largeFixture.worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("committed_artifact_byte_mismatch", result, "artifacts[0] bytes differ from manifest.commitSha", "Committed different-length artifact mutations are detected by byte count.");
  fs.writeFileSync(largeValid.manifestPath, largeOriginalManifest);
  runGit(largeFixture.worktree, ["add", "worker-output/raw.json"]);
  runGit(largeFixture.worktree, ["commit", "-m", "restore large artifact after byte test"]);

  fs.unlinkSync(largeRawPath);
  runGit(largeFixture.worktree, ["add", "worker-output/raw.json"]);
  runGit(largeFixture.worktree, ["commit", "-m", "remove committed large artifact"]);
  const unavailableCommit = runGit(largeFixture.worktree, ["rev-parse", "HEAD"]);
  fs.writeFileSync(largeRawPath, largeRawBytes);
  writeJson(largeValid.manifestPath, {
    ...largeValid.manifest,
    commitSha: unavailableCommit,
  });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", largeLeasePath, "--manifest", largeValid.manifestPath, "--repo", largeFixture.worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("committed_artifact_unavailable_at_manifest_commit", result, "artifacts[0] is not available at manifest.commitSha", "A worktree file cannot conceal a missing artifact at the reported content commit.");

  const originalManifest = fs.readFileSync(valid.manifestPath);
  const originalReceipt = fs.readFileSync(valid.receiptPath);
  const originalSourceVerification = fs.readFileSync(valid.sourceVerificationPath);
  const originalAssertions = fs.readFileSync(path.join(worktree, "worker-output/assertions.ndjson"));
  const originalOutcomes = fs.readFileSync(path.join(worktree, "worker-output/outcomes.ndjson"));

  const updateReceiptDescriptor = (manifestValue) => ({
    ...manifestValue,
    receipt: {
      path: "worker-output/receipt.json",
      sha256: sha256File(valid.receiptPath),
      bytes: fs.statSync(valid.receiptPath).size,
    },
  });
  const updateReceiptOutput = (receiptValue, relativePath, absolutePath) => {
    const updated = structuredClone(receiptValue);
    updated.outputs = updated.outputs.map((descriptor) => descriptor.path === relativePath
      ? fileDescriptor(absolutePath, relativePath, descriptor.media_type)
      : descriptor);
    return updated;
  };

  const completionGateRoot = path.join(repo, "ops", "national-research");
  writeJson(path.join(completionGateRoot, "jobs.json"), { schemaVersion: 1, jobs: [{ ...job, state: "leased", currentLeaseId: lease.leaseId }] });
  writeJson(path.join(completionGateRoot, "leases.json"), { schemaVersion: 1, leases: [lease] });
  writeJson(path.join(completionGateRoot, "integration-queue.json"), { schemaVersion: 1, items: [] });
  const completionJobsBefore = fs.readFileSync(path.join(completionGateRoot, "jobs.json"));
  const completionLeasesBefore = fs.readFileSync(path.join(completionGateRoot, "leases.json"));
  const completionQueueBefore = fs.readFileSync(path.join(completionGateRoot, "integration-queue.json"));
  const pinnedWorkerValidatorPath = path.join(worktree, ".agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs");
  const pinnedWorkerValidatorBytes = fs.readFileSync(pinnedWorkerValidatorPath);
  fs.appendFileSync(pinnedWorkerValidatorPath, "\n// tampered validator fixture\n");
  result = run("node", [ORCHESTRATOR, "transition", "--root", completionGateRoot, "--lease", lease.leaseId, "--state", "completed", "--manifest", valid.manifestPath, "--now", NOW], REPO_ROOT);
  const pinTamperPreserved = result.status !== 0
    && completionJobsBefore.equals(fs.readFileSync(path.join(completionGateRoot, "jobs.json")))
    && completionLeasesBefore.equals(fs.readFileSync(path.join(completionGateRoot, "leases.json")))
    && completionQueueBefore.equals(fs.readFileSync(path.join(completionGateRoot, "integration-queue.json")));
  recordRejectsWith("tampered_pinned_worker_validator", { ...result, status: pinTamperPreserved ? result.status : 0 }, "Pinned skill hash mismatch", "MAIN rejects a changed worker validator before executing it and preserves orchestration state.");
  fs.writeFileSync(pinnedWorkerValidatorPath, pinnedWorkerValidatorBytes);

  const uncommittedManifest = structuredClone(valid.manifest);
  uncommittedManifest.performance.wallSeconds = 3;
  writeJson(valid.manifestPath, uncommittedManifest);
  result = run("node", [ORCHESTRATOR, "transition", "--root", completionGateRoot, "--lease", lease.leaseId, "--state", "completed", "--manifest", valid.manifestPath, "--now", NOW], REPO_ROOT);
  const dirtyManifestPreserved = result.status !== 0
    && completionJobsBefore.equals(fs.readFileSync(path.join(completionGateRoot, "jobs.json")))
    && completionLeasesBefore.equals(fs.readFileSync(path.join(completionGateRoot, "leases.json")))
    && completionQueueBefore.equals(fs.readFileSync(path.join(completionGateRoot, "integration-queue.json")))
    && !fs.existsSync(path.join(completionGateRoot, "manifests"));
  recordRejectsWith("uncommitted_completion_manifest", { ...result, status: dirtyManifestPreserved ? result.status : 0 }, "worktree is dirty", "A semantically valid but uncommitted manifest cannot close a lease or create a durable receipt.");
  fs.writeFileSync(valid.manifestPath, originalManifest);

  writeJson(valid.receiptPath, { ...valid.receipt, workerOnlyMetadata: { leaseId: lease.leaseId } });
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [ORCHESTRATOR, "transition", "--root", completionGateRoot, "--lease", lease.leaseId, "--state", "completed", "--manifest", valid.manifestPath, "--now", NOW], REPO_ROOT);
  const completionRollbackPreserved = result.status !== 0
    && completionJobsBefore.equals(fs.readFileSync(path.join(completionGateRoot, "jobs.json")))
    && completionLeasesBefore.equals(fs.readFileSync(path.join(completionGateRoot, "leases.json")))
    && completionQueueBefore.equals(fs.readFileSync(path.join(completionGateRoot, "integration-queue.json")));
  record("invalid_completion_manifest_rolls_back", "pass", { ...result, status: completionRollbackPreserved ? 0 : 1 }, "A canonical receipt failure cannot mutate the job, lease, or integration queue.");
  fs.writeFileSync(valid.receiptPath, originalReceipt);
  fs.writeFileSync(valid.manifestPath, originalManifest);
  result = run("node", [ORCHESTRATOR, "transition", "--root", completionGateRoot, "--lease", lease.leaseId, "--state", "completed", "--manifest", valid.manifestPath, "--now", NOW], REPO_ROOT);
  const completedJob = readJson(path.join(completionGateRoot, "jobs.json")).jobs[0];
  const completedLease = readJson(path.join(completionGateRoot, "leases.json")).leases[0];
  const completionQueue = readJson(path.join(completionGateRoot, "integration-queue.json")).items;
  const durableManifestPath = path.join(completionGateRoot, completionQueue[0]?.manifestPath ?? "missing");
  const completionAccepted = result.status === 0
    && completedJob.state === "submitted"
    && completedLease.state === "completed"
    && completionQueue.length === 1
    && completionQueue[0].decision === "pending"
    && completionQueue[0].workerBranchHead === runGit(worktree, ["rev-parse", "HEAD"])
    && fs.existsSync(durableManifestPath)
    && fs.readFileSync(durableManifestPath).equals(originalManifest)
    && completedLease.resultManifest?.path === completionQueue[0].manifestPath
    && completedLease.resultManifest?.sha256 === completionQueue[0].manifestHash;
  record("valid_completion_manifest_queues", "pass", { ...result, status: completionAccepted ? 0 : 1 }, "The same transaction accepts a canonically valid complete worker result.");

  const queueValidationFirst = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  const queueValidationSecond = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  record("deterministic_durable_queue_validation", "pass", { ...queueValidationSecond, status: queueValidationFirst.status === 0 && queueValidationSecond.status === 0 && queueValidationFirst.stdout === queueValidationSecond.stdout ? 0 : 1 }, "Repeated validation of the durable pending integration receipt is deterministic.");

  const durableManifestBytes = fs.readFileSync(durableManifestPath);
  fs.appendFileSync(durableManifestPath, " ");
  result = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  recordRejectsWith("durable_manifest_byte_tamper", result, "durable manifest descriptor does not match", "A changed durable manifest byte is detected.");
  fs.writeFileSync(durableManifestPath, durableManifestBytes);

  const completionQueueDocument = readJson(path.join(completionGateRoot, "integration-queue.json"));
  const wrongBranchHeadQueue = structuredClone(completionQueueDocument);
  wrongBranchHeadQueue.items[0].workerBranchHead = "0".repeat(40);
  writeJson(path.join(completionGateRoot, "integration-queue.json"), wrongBranchHeadQueue);
  result = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  recordRejectsWith("durable_queue_branch_head_tamper", result, "worker branch receipt is invalid", "The queue receipt cannot substitute a different worker branch head.");
  writeJson(path.join(completionGateRoot, "integration-queue.json"), completionQueueDocument);

  const queueId = completionQueue[0].queueId;
  const workerBranchHead = completionQueue[0].workerBranchHead;
  const reviewedChangedPaths = runGit(worktree, ["diff", "--name-only", `${baseSha}..${workerBranchHead}`])
    .split("\n")
    .filter(Boolean)
    .sort(compareCodePoints);
  const reviewReceiptPath = path.join(fixtureRoot, "review-receipt.json");
  const makeReviewReceipt = (overrides = {}) => ({
    schemaVersion: 1,
    queueId,
    jobId: job.jobId,
    leaseId: lease.leaseId,
    decision: "accepted",
    reviewer: "MAIN",
    reviewedAt: NOW,
    workerCommit: valid.manifest.commitSha,
    workerBranchHead,
    manifestHash: completionQueue[0].manifestHash,
    changedPaths: reviewedChangedPaths,
    checks: [
      { command: "canonical immutable run validation", exitCode: 0, result: "pass" },
      { command: "worker manifest validation", exitCode: 0, result: "pass" },
      { command: `git diff --check ${baseSha}...${workerBranchHead}`, exitCode: 0, result: "pass" },
    ],
    conflicts: 0,
    manualInterventions: 0,
    criticalSafetyViolations: 0,
    evidenceSemanticViolations: 0,
    forbiddenWrites: 0,
    reason: "The independently reviewed worker result satisfies the complete leased contract.",
    ...overrides,
  });

  const reviewStateBefore = {
    jobs: fs.readFileSync(path.join(completionGateRoot, "jobs.json")),
    queue: fs.readFileSync(path.join(completionGateRoot, "integration-queue.json")),
  };
  writeJson(reviewReceiptPath, makeReviewReceipt({ unexpected: true }));
  result = run("node", [ORCHESTRATOR, "review", "--root", completionGateRoot, "--queue", queueId, "--decision", "accepted", "--receipt", reviewReceiptPath, "--now", NOW], REPO_ROOT);
  const unsupportedReviewPreserved = result.status !== 0
    && reviewStateBefore.jobs.equals(fs.readFileSync(path.join(completionGateRoot, "jobs.json")))
    && reviewStateBefore.queue.equals(fs.readFileSync(path.join(completionGateRoot, "integration-queue.json")));
  recordRejectsWith("unsupported_review_receipt_field", { ...result, status: unsupportedReviewPreserved ? result.status : 0 }, "unsupported field", "A closed review receipt rejects undeclared metadata and preserves lifecycle state.");

  writeJson(reviewReceiptPath, makeReviewReceipt({ criticalSafetyViolations: 1 }));
  result = run("node", [ORCHESTRATOR, "review", "--root", completionGateRoot, "--queue", queueId, "--decision", "accepted", "--receipt", reviewReceiptPath, "--now", NOW], REPO_ROOT);
  recordRejectsWith("accepted_review_with_critical_violation", result, "zero critical safety violations", "Acceptance cannot conceal a critical safety violation.");

  writeJson(reviewReceiptPath, makeReviewReceipt({ changedPaths: reviewedChangedPaths.slice(1) }));
  result = run("node", [ORCHESTRATOR, "review", "--root", completionGateRoot, "--queue", queueId, "--decision", "accepted", "--receipt", reviewReceiptPath, "--now", NOW], REPO_ROOT);
  recordRejectsWith("review_changed_path_mismatch", result, "changedPaths differs", "The review receipt must report the exact base-to-head worker diff.");

  writeJson(reviewReceiptPath, makeReviewReceipt());
  result = run("node", [ORCHESTRATOR, "review", "--root", completionGateRoot, "--queue", queueId, "--decision", "accepted", "--receipt", reviewReceiptPath, "--now", NOW], REPO_ROOT);
  const acceptedJob = readJson(path.join(completionGateRoot, "jobs.json")).jobs[0];
  const acceptedQueue = readJson(path.join(completionGateRoot, "integration-queue.json")).items[0];
  const durableReviewReceiptPath = path.join(completionGateRoot, acceptedQueue.reviewReceipt?.path ?? "missing");
  const reviewAccepted = result.status === 0
    && acceptedJob.state === "integrating"
    && acceptedQueue.decision === "accepted"
    && acceptedQueue.reviewedAt === NOW
    && fs.existsSync(durableReviewReceiptPath)
    && fs.readFileSync(durableReviewReceiptPath).equals(fs.readFileSync(reviewReceiptPath));
  record("transactional_review_acceptance", "pass", { ...result, status: reviewAccepted ? 0 : 1 }, "A valid independent review atomically archives its receipt and advances the queue and job.");

  const acceptedValidationFirst = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  const acceptedValidationSecond = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  record("deterministic_accepted_queue_validation", "pass", { ...acceptedValidationSecond, status: acceptedValidationFirst.status === 0 && acceptedValidationSecond.status === 0 && acceptedValidationFirst.stdout === acceptedValidationSecond.stdout ? 0 : 1 }, "Repeated accepted-queue validation is deterministic.");

  runGit(repo, ["add", "ops/national-research"]);
  runGit(repo, ["commit", "-m", "record accepted worker review"]);

  runGit(repo, ["cherry-pick", valid.manifest.commitSha]);
  runGit(repo, ["cherry-pick", workerBranchHead]);
  const integrationCommit = runGit(repo, ["rev-parse", "HEAD"]);
  const integrationReceiptPath = path.join(fixtureRoot, "integration-receipt.json");
  const makeIntegrationReceipt = (overrides = {}) => ({
    schemaVersion: 1,
    queueId,
    jobId: job.jobId,
    leaseId: lease.leaseId,
    integrator: "MAIN",
    integratedAt: NOW,
    integrationCommit,
    workerCommit: valid.manifest.commitSha,
    workerBranchHead,
    manifestHash: completionQueue[0].manifestHash,
    changedPaths: reviewedChangedPaths,
    checks: [
      { command: "canonical immutable run validation after integration", exitCode: 0, result: "pass" },
      { command: "git diff --check after integration", exitCode: 0, result: "pass" },
    ],
    conflicts: 0,
    manualInterventions: 0,
    criticalSafetyViolations: 0,
    evidenceSemanticViolations: 0,
    forbiddenWrites: 0,
    reason: "Canonical commit bytes match every reviewed worker output path.",
    ...overrides,
  });

  const integrationStateBefore = {
    jobs: fs.readFileSync(path.join(completionGateRoot, "jobs.json")),
    queue: fs.readFileSync(path.join(completionGateRoot, "integration-queue.json")),
  };
  writeJson(integrationReceiptPath, makeIntegrationReceipt({ integrationCommit: "0".repeat(40) }));
  result = run("node", [ORCHESTRATOR, "integrate", "--root", completionGateRoot, "--queue", queueId, "--receipt", integrationReceiptPath, "--repo", repo, "--now", NOW], REPO_ROOT);
  const rejectedIntegrationPreserved = result.status !== 0
    && integrationStateBefore.jobs.equals(fs.readFileSync(path.join(completionGateRoot, "jobs.json")))
    && integrationStateBefore.queue.equals(fs.readFileSync(path.join(completionGateRoot, "integration-queue.json")));
  recordRejectsWith("wrong_integration_commit_rolls_back", { ...result, status: rejectedIntegrationPreserved ? result.status : 0 }, "integrationCommit differs", "An integration receipt cannot claim a different canonical commit and failed integration preserves state.");

  writeJson(integrationReceiptPath, makeIntegrationReceipt());
  result = run("node", [ORCHESTRATOR, "integrate", "--root", completionGateRoot, "--queue", queueId, "--receipt", integrationReceiptPath, "--repo", repo, "--now", NOW], REPO_ROOT);
  const integratedJob = readJson(path.join(completionGateRoot, "jobs.json")).jobs[0];
  const integratedQueue = readJson(path.join(completionGateRoot, "integration-queue.json")).items[0];
  const durableIntegrationReceiptPath = path.join(completionGateRoot, integratedQueue.integrationReceipt?.path ?? "missing");
  const integrationAccepted = result.status === 0
    && integratedJob.state === "completed"
    && integratedQueue.decision === "integrated"
    && integratedQueue.integrationCommit === integrationCommit
    && fs.existsSync(durableIntegrationReceiptPath)
    && fs.readFileSync(durableIntegrationReceiptPath).equals(fs.readFileSync(integrationReceiptPath));
  record("transactional_integration_completion", "pass", { ...result, status: integrationAccepted ? 0 : 1 }, "A byte-identical canonical integration atomically archives its receipt and completes the job.");
  record("canonical_in_repo_transaction_lock", "pass", { ...result, status: integrationAccepted && completionGateRoot.startsWith(`${repo}${path.sep}`) ? 0 : 1 }, "An in-repository orchestration root can integrate on clean main because its transient lock is ignored.");

  const integratedValidationFirst = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  const integratedValidationSecond = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  record("deterministic_integrated_queue_validation", "pass", { ...integratedValidationSecond, status: integratedValidationFirst.status === 0 && integratedValidationSecond.status === 0 && integratedValidationFirst.stdout === integratedValidationSecond.stdout ? 0 : 1 }, "Repeated integrated-queue validation is deterministic.");

  if (fs.existsSync(durableIntegrationReceiptPath)) {
    const durableIntegrationReceiptBytes = fs.readFileSync(durableIntegrationReceiptPath);
    fs.appendFileSync(durableIntegrationReceiptPath, " ");
    result = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
    recordRejectsWith("durable_integration_receipt_tamper", result, "integration receipt descriptor does not match", "Changed integration receipt bytes are detected.");
    fs.writeFileSync(durableIntegrationReceiptPath, durableIntegrationReceiptBytes);
  } else {
    record("durable_integration_receipt_tamper", "pass", { status: 1, stdout: "", stderr: "Missing durable integration receipt." }, "Changed integration receipt bytes are detected.");
  }

  const integratedJobsDocument = readJson(path.join(completionGateRoot, "jobs.json"));
  writeJson(path.join(completionGateRoot, "jobs.json"), { ...integratedJobsDocument, jobs: [{ ...integratedJobsDocument.jobs[0], state: "submitted" }] });
  result = run("node", [ORCHESTRATOR, "validate", "--root", completionGateRoot, "--now", NOW], REPO_ROOT);
  recordRejectsWith("integrated_queue_job_lifecycle_mismatch", result, "integrated lifecycle state is invalid", "An integrated queue item cannot coexist with a submitted job.");
  writeJson(path.join(completionGateRoot, "jobs.json"), integratedJobsDocument);

  const rejectedReceiptPath = path.join(REPO_ROOT, "ops/national-research/fixtures/rejected-cycle3-receipt.json");
  const rejectedReceipt = fs.readFileSync(rejectedReceiptPath);
  if (rejectedReceipt.length !== 9734 || sha256Value(rejectedReceipt) !== "944021a590a4b4ff764983d4cefd9e645d5d5a2ffab6e74655ef9c2c46e296de") {
    throw new Error("Portable rejected cycle-three receipt fixture changed.");
  }
  fs.writeFileSync(valid.receiptPath, rejectedReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("historical_malformed_receipt", "reject", result, "The exact rejected cycle-three receipt fails the canonical receipt contract.");

  fs.writeFileSync(valid.receiptPath, originalReceipt);
  const unsupportedReceipt = { ...valid.receipt, workerOnlyMetadata: { leaseId: lease.leaseId } };
  writeJson(valid.receiptPath, unsupportedReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("unsupported_receipt_field", "reject", result, "A receipt field outside the closed canonical schema is rejected.");

  const forgedReceiptActor = { ...valid.receipt, actor_type: "human", actor_id: "unattributed-human" };
  writeJson(valid.receiptPath, forgedReceiptActor);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("forged_receipt_actor", result, "forbidden worker actor type", "A worker receipt cannot forge a human actor.");

  fs.writeFileSync(valid.receiptPath, originalReceipt);
  writeJson(valid.manifestPath, Object.fromEntries(Object.entries(valid.manifest).filter(([key]) => key !== "receipt")));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("missing_receipt_descriptor", "reject", result, "A required receipt descriptor cannot be omitted.");

  writeJson(valid.manifestPath, Object.fromEntries(Object.entries(valid.manifest).filter(([key]) => key !== "sourceVerification")));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("missing_source_verification_descriptor", "reject", result, "A required source-verification descriptor cannot be omitted.");

  writeJson(valid.manifestPath, { ...valid.manifest, receipt: { ...valid.manifest.receipt, path: "worker-output/missing-receipt.json" } });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("receipt_descriptor_path_mismatch", "reject", result, "A receipt descriptor path mismatch is rejected.");

  writeJson(valid.manifestPath, { ...valid.manifest, receipt: { ...valid.manifest.receipt, sha256: "0".repeat(64) } });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("receipt_descriptor_hash_mismatch", "reject", result, "A receipt descriptor hash mismatch is rejected.");

  writeJson(valid.manifestPath, { ...valid.manifest, receipt: { ...valid.manifest.receipt, bytes: valid.manifest.receipt.bytes + 1 } });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("receipt_descriptor_byte_mismatch", "reject", result, "A receipt descriptor byte mismatch is rejected.");

  writeJson(valid.manifestPath, { ...valid.manifest, sourceVerification: { ...valid.manifest.sourceVerification, sha256: "0".repeat(64) } });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("source_verification_hash_mismatch", "reject", result, "A source-verification descriptor hash mismatch is rejected.");

  writeJson(valid.manifestPath, { ...valid.manifest, sourceVerification: { ...valid.manifest.sourceVerification, path: "worker-output/missing-source-verification.json" } });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("source_verification_path_mismatch", "reject", result, "A source-verification descriptor path mismatch is rejected.");

  writeJson(valid.manifestPath, { ...valid.manifest, sourceVerification: { ...valid.manifest.sourceVerification, bytes: valid.manifest.sourceVerification.bytes + 1 } });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("source_verification_byte_mismatch", "reject", result, "A source-verification descriptor byte mismatch is rejected.");

  const unknownExpectedOutputLeasePath = path.join(fixtureRoot, "unknown-expected-output.json");
  writeJson(unknownExpectedOutputLeasePath, { ...lease, expectedOutputs: [...lease.expectedOutputs, "unvalidated-extra"] });
  fs.writeFileSync(valid.manifestPath, originalManifest);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", unknownExpectedOutputLeasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("unknown_expected_output_category", "reject", result, "Every lease output category must use the validated vocabulary.");

  const missingExpectedOutputLeasePath = path.join(fixtureRoot, "missing-expected-output.json");
  writeJson(missingExpectedOutputLeasePath, { ...lease, expectedOutputs: lease.expectedOutputs.filter((category) => category !== "source-verification") });
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", missingExpectedOutputLeasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("missing_expected_output_category", "reject", result, "Every required lease output category must be declared and validated.");

  const wrongReceiptCounts = structuredClone(valid.receipt);
  wrongReceiptCounts.counts.assertion_events = 2;
  writeJson(valid.receiptPath, wrongReceiptCounts);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("receipt_event_count_mismatch", "reject", result, "Receipt event counts must equal emitted records.");

  for (const [name, field, value, fragment] of [
    ["receipt_review_count_mismatch", "review_events", 2, "review events"],
    ["receipt_rejection_count_mismatch", "rejection_records", 1, "rejection records"],
    ["receipt_outcome_count_mismatch", "pair_outcomes", 2, "pair outcomes"],
    ["receipt_error_count_mismatch", "error_count", 1, "error count"],
  ]) {
    const mismatched = structuredClone(valid.receipt);
    mismatched.counts[field] = value;
    writeJson(valid.receiptPath, mismatched);
    writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
    result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
    recordRejectsWith(name, result, fragment, `Receipt ${field} must match the emitted worker data.`);
  }

  const missingReceiptArtifact = structuredClone(valid.receipt);
  missingReceiptArtifact.artifacts = missingReceiptArtifact.artifacts.slice(0, 1);
  writeJson(valid.receiptPath, missingReceiptArtifact);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("receipt_artifact_set_mismatch", result, "retained evidence does not match receipt artifacts", "Receipt artifacts must equal source-verification lineage and manifest descriptors.");

  const wrongReceiptIdentity = structuredClone(valid.receipt);
  wrongReceiptIdentity.run_id = "wrong-run";
  writeJson(valid.receiptPath, wrongReceiptIdentity);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("receipt_event_identity_mismatch", "reject", result, "Receipt and event run identities must agree.");

  writeNdjson(path.join(worktree, "worker-output/assertions.ndjson"), [assertion({ source_id: "foreign-source" })]);
  let identityReceipt = updateReceiptOutput(valid.receipt, "worker-output/assertions.ndjson", path.join(worktree, "worker-output/assertions.ndjson"));
  writeJson(valid.receiptPath, identityReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("event_source_identity_mismatch", result, "wrong source", "Event and receipt source identities must agree.");

  writeNdjson(path.join(worktree, "worker-output/assertions.ndjson"), [assertion({ state_code: "AZ" })]);
  identityReceipt = updateReceiptOutput(valid.receipt, "worker-output/assertions.ndjson", path.join(worktree, "worker-output/assertions.ndjson"));
  writeJson(valid.receiptPath, identityReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("event_state_identity_mismatch", result, "wrong state", "Event and receipt state identities must agree.");

  writeNdjson(path.join(worktree, "worker-output/assertions.ndjson"), [assertion({ species_id: "foreign-species" })]);
  identityReceipt = updateReceiptOutput(valid.receipt, "worker-output/assertions.ndjson", path.join(worktree, "worker-output/assertions.ndjson"));
  writeJson(valid.receiptPath, identityReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("event_pair_scope_mismatch", result, "outside the requested pairs", "Event taxon and geography identities must remain inside leased pair scope.");

  fs.writeFileSync(path.join(worktree, "worker-output/assertions.ndjson"), originalAssertions);
  const wrongSourceVerification = structuredClone(valid.sourceVerification);
  wrongSourceVerification.sourceId = "foreign-source";
  writeJson(valid.sourceVerificationPath, wrongSourceVerification);
  identityReceipt = updateReceiptOutput(valid.receipt, "worker-output/source-verification.json", valid.sourceVerificationPath);
  writeJson(valid.receiptPath, identityReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor({
    ...valid.manifest,
    sourceVerification: { path: "worker-output/source-verification.json", sha256: sha256File(valid.sourceVerificationPath), bytes: fs.statSync(valid.sourceVerificationPath).size },
  }));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("source_verification_identity_mismatch", result, "Source verification source does not match the receipt", "Source verification and receipt source identities must agree.");

  const validateSourceVerificationMutation = (name, mutate, fragment, detail, receiptMutate = (value) => value) => {
    const sourceVerificationValue = structuredClone(valid.sourceVerification);
    mutate(sourceVerificationValue);
    writeJson(valid.sourceVerificationPath, sourceVerificationValue);
    let receiptValue = receiptMutate(structuredClone(valid.receipt));
    receiptValue = updateReceiptOutput(receiptValue, "worker-output/source-verification.json", valid.sourceVerificationPath);
    writeJson(valid.receiptPath, receiptValue);
    writeJson(valid.manifestPath, updateReceiptDescriptor({
      ...valid.manifest,
      sourceVerification: { path: "worker-output/source-verification.json", sha256: sha256File(valid.sourceVerificationPath), bytes: fs.statSync(valid.sourceVerificationPath).size },
    }));
    const mutationResult = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
    recordRejectsWith(name, mutationResult, fragment, detail);
  };
  validateSourceVerificationMutation("source_verification_run_identity_mismatch", (value) => { value.runId = "foreign-run"; }, "run, state, pair scope, or parameters", "Source verification run identity must match the receipt.");
  validateSourceVerificationMutation("source_verification_state_identity_mismatch", (value) => { value.stateCode = "AZ"; }, "run, state, pair scope, or parameters", "Source verification state identity must match the receipt.");
  validateSourceVerificationMutation("source_verification_pair_identity_mismatch", (value) => { value.pairKeys = [`01003:${SPECIES_ID}`]; }, "run, state, pair scope, or parameters", "Source verification pair identity must match the receipt.");
  validateSourceVerificationMutation("source_verification_parameter_hash_mismatch", (value) => { value.parameterHash = "0".repeat(64); }, "run, state, pair scope, or parameters", "Source verification parameter hash must match the receipt.");
  validateSourceVerificationMutation("pagination_declared_count_mismatch", (value) => { value.acquisition.requests[0].declaredRecordCount = 2; }, "received count differs from its declared count", "A complete page group must reconcile its declared and received record counts.");
  validateSourceVerificationMutation("pagination_missing_terminal_page", (value) => { value.acquisition.requests[0].pagination.endOfRecords = false; }, "lacks one terminal final page", "A complete acquisition must retain an explicit terminal page.");
  validateSourceVerificationMutation(
    "failed_upstream_request_marked_complete",
    (value) => { value.acquisition.requests[0].status = 500; },
    "Complete receipt contains a failed upstream request",
    "A failed provider request cannot support a complete screen.",
    (value) => { value.upstream_requests[0].status = 500; return value; },
  );

  fs.writeFileSync(valid.sourceVerificationPath, originalSourceVerification);
  const wrongParameterScope = structuredClone(valid.receipt);
  wrongParameterScope.parameters.candidatePairs = [`01003:${SPECIES_ID}`];
  wrongParameterScope.parameter_hash = sha256Value(stableJson(wrongParameterScope.parameters));
  writeJson(valid.receiptPath, wrongParameterScope);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("receipt_parameter_scope_mismatch", result, "Source verification run, state, pair scope, or parameters do not match the receipt", "Receipt parameters and source verification must agree before pair-scope publication.");

  const wrongStateParameter = structuredClone(valid.receipt);
  wrongStateParameter.parameters.stateCode = "AZ";
  wrongStateParameter.parameter_hash = sha256Value(stableJson(wrongStateParameter.parameters));
  const wrongStateParameterVerification = structuredClone(valid.sourceVerification);
  wrongStateParameterVerification.parameterHash = wrongStateParameter.parameter_hash;
  writeJson(valid.sourceVerificationPath, wrongStateParameterVerification);
  writeJson(valid.receiptPath, updateReceiptOutput(wrongStateParameter, "worker-output/source-verification.json", valid.sourceVerificationPath));
  writeJson(valid.manifestPath, updateReceiptDescriptor({ ...valid.manifest, sourceVerification: { path: "worker-output/source-verification.json", sha256: sha256File(valid.sourceVerificationPath), bytes: fs.statSync(valid.sourceVerificationPath).size } }));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("receipt_cross_state_parameter", result, "parameter stateCode does not match", "A receipt cannot query a different state than its requested pairs.");

  const wrongStateProvince = structuredClone(valid.receipt);
  wrongStateProvince.parameters.stateProvince = "Arizona";
  wrongStateProvince.parameter_hash = sha256Value(stableJson(wrongStateProvince.parameters));
  const wrongStateProvinceVerification = structuredClone(valid.sourceVerification);
  wrongStateProvinceVerification.parameterHash = wrongStateProvince.parameter_hash;
  writeJson(valid.sourceVerificationPath, wrongStateProvinceVerification);
  writeJson(valid.receiptPath, updateReceiptOutput(wrongStateProvince, "worker-output/source-verification.json", valid.sourceVerificationPath));
  writeJson(valid.manifestPath, updateReceiptDescriptor({ ...valid.manifest, sourceVerification: { path: "worker-output/source-verification.json", sha256: sha256File(valid.sourceVerificationPath), bytes: fs.statSync(valid.sourceVerificationPath).size } }));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("receipt_cross_state_provider_parameter", result, "parameter stateProvince does not match", "Provider state text must match the registry state name.");

  fs.writeFileSync(valid.sourceVerificationPath, originalSourceVerification);
  const validateAssertionMutation = (name, overrides, fragment, detail) => {
    writeNdjson(path.join(worktree, "worker-output/assertions.ndjson"), [assertion(overrides)]);
    const receiptValue = updateReceiptOutput(valid.receipt, "worker-output/assertions.ndjson", path.join(worktree, "worker-output/assertions.ndjson"));
    writeJson(valid.receiptPath, receiptValue);
    writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
    const mutationResult = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
    recordRejectsWith(name, mutationResult, fragment, detail);
  };
  validateAssertionMutation("wrong_provider_county_text", { geography_match: { ...assertion().geography_match, source_county: "Maricopa County" } }, "source county does not resolve", "Provider county text must resolve to the declared county FIPS.");
  validateAssertionMutation("wrong_provider_state_text", { geography_match: { ...assertion().geography_match, source_state: "Arizona" } }, "source state does not match", "Provider state text must match the run state.");
  validateAssertionMutation("wrong_target_taxon_name", { taxon_match: { ...assertion().taxon_match, target_scientific_name: "Homo sapiens" } }, "target scientific name differs", "Target taxon text must match the species catalog ID.");
  validateAssertionMutation("wrong_source_taxon_name", { taxon_match: { ...assertion().taxon_match, source_scientific_name: "Homo sapiens" } }, "source scientific name violates", "Provider taxon text must satisfy the registered exact-binomial policy.");
  validateAssertionMutation("forged_assertion_actor", { actor_type: "human", actor_id: "unattributed-human" }, "forbidden worker actor type", "Worker evidence cannot forge a human actor.");

  fs.writeFileSync(path.join(worktree, "worker-output/assertions.ndjson"), originalAssertions);
  writeNdjson(path.join(worktree, "worker-output/reviews.ndjson"), [review({ review_level: "human-approved" })]);
  identityReceipt = updateReceiptOutput(valid.receipt, "worker-output/reviews.ndjson", path.join(worktree, "worker-output/reviews.ndjson"));
  writeJson(valid.receiptPath, identityReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("forged_human_review_level", result, "falsely claims human approval", "A worker agent cannot assign itself human review authority.");

  writeNdjson(path.join(worktree, "worker-output/reviews.ndjson"), [review({ decision: "rejected", publication_eligible: false, reason_codes: ["rejected-fixture"] })]);
  identityReceipt = updateReceiptOutput(valid.receipt, "worker-output/reviews.ndjson", path.join(worktree, "worker-output/reviews.ndjson"));
  writeJson(valid.receiptPath, identityReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("evidence_found_with_rejected_review", result, "publication-eligible assertions", "Evidence-found requires final publication-eligible review resolution.");

  writeNdjson(path.join(worktree, "worker-output/reviews.ndjson"), [review()]);
  writeNdjson(path.join(worktree, "worker-output/outcomes.ndjson"), [outcome({ status: "no-qualifying-evidence", assertion_event_ids: [] })]);
  identityReceipt = updateReceiptOutput(valid.receipt, "worker-output/reviews.ndjson", path.join(worktree, "worker-output/reviews.ndjson"));
  identityReceipt = updateReceiptOutput(identityReceipt, "worker-output/outcomes.ndjson", path.join(worktree, "worker-output/outcomes.ndjson"));
  writeJson(valid.receiptPath, identityReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("no_evidence_omits_published_assertion", result, "has publication-eligible evidence", "No-evidence outcomes cannot omit an active published assertion.");

  writeNdjson(path.join(worktree, "worker-output/reviews.ndjson"), [review()]);
  fs.writeFileSync(path.join(worktree, "worker-output/outcomes.ndjson"), originalOutcomes);

  const wrongOutputHashReceipt = structuredClone(valid.receipt);
  wrongOutputHashReceipt.outputs[0].sha256 = "0".repeat(64);
  writeJson(valid.receiptPath, wrongOutputHashReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("receipt_output_hash_mismatch", "reject", result, "Receipt output hashes must equal the emitted bytes.");

  fs.unlinkSync(path.join(worktree, "worker-output/assertions.ndjson"));
  fs.writeFileSync(valid.receiptPath, originalReceipt);
  fs.writeFileSync(valid.manifestPath, originalManifest);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("missing_declared_worker_output", "reject", result, "A receipt-declared event output cannot be missing.");
  fs.writeFileSync(path.join(worktree, "worker-output/assertions.ndjson"), originalAssertions);

  const extraOutputPath = path.join(worktree, "worker-output/extra-output.json");
  fs.writeFileSync(extraOutputPath, "{}\n");
  const extraOutputReceipt = structuredClone(valid.receipt);
  extraOutputReceipt.outputs.push(fileDescriptor(extraOutputPath, "worker-output/extra-output.json", "application/json"));
  writeJson(valid.receiptPath, extraOutputReceipt);
  writeJson(valid.manifestPath, updateReceiptDescriptor(valid.manifest));
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("extra_receipt_worker_output", result, "unreported or unsupported output", "A receipt output outside the complete manifest contract is rejected.");
  fs.unlinkSync(extraOutputPath);

  fs.writeFileSync(valid.receiptPath, originalReceipt);
  const wrongManifestCounts = structuredClone(valid.manifest);
  wrongManifestCounts.counts.final.retainedArtifacts = 99;
  wrongManifestCounts.counts.net.retainedArtifacts = 99;
  writeJson(valid.manifestPath, wrongManifestCounts);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("manifest_artifact_count_mismatch", "reject", result, "Manifest operational counts must match validated receipt and file totals.");

  fs.writeFileSync(path.join(worktree, "worker-output/stealth.json"), "{}\n");
  fs.writeFileSync(valid.manifestPath, originalManifest);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("unreported_worker_output", "reject", result, "A permitted but unreported worker output file is rejected.");
  fs.unlinkSync(path.join(worktree, "worker-output/stealth.json"));

  fs.writeFileSync(path.join(worktree, "worker-output/.ignored-secret"), "ignored but present\n");
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("ignored_unreported_worker_output", result, "Worker run file is not reported by the manifest", "Git ignore rules cannot hide an unreported worker run file.");
  fs.unlinkSync(path.join(worktree, "worker-output/.ignored-secret"));

  fs.writeFileSync(valid.receiptPath, originalReceipt);
  fs.writeFileSync(valid.sourceVerificationPath, originalSourceVerification);
  fs.writeFileSync(valid.manifestPath, originalManifest);

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

  const partialOutcome = outcome({
    status: "needs-followup",
    scope_complete: false,
    notes: ["The next provider page remains pending after an interrupted request."],
  });
  writeNdjson(path.join(worktree, "worker-output/outcomes.ndjson"), [partialOutcome]);
  const partialSourceVerification = structuredClone(valid.sourceVerification);
  partialSourceVerification.acquisition.snapshotComplete = false;
  partialSourceVerification.acquisition.paginationComplete = false;
  writeJson(valid.sourceVerificationPath, partialSourceVerification);
  const partialReceipt = structuredClone(valid.receipt);
  partialReceipt.status = "partial";
  partialReceipt.errors = [{ code: "pagination-interrupted", message: "Provider pagination stopped before the next page was retained.", retryable: true }];
  partialReceipt.counts.error_count = 1;
  partialReceipt.outputs = partialReceipt.outputs.map((descriptor) => {
    if (descriptor.path === "worker-output/outcomes.ndjson") {
      return fileDescriptor(path.join(worktree, descriptor.path), descriptor.path, descriptor.media_type);
    }
    if (descriptor.path === "worker-output/source-verification.json") {
      return fileDescriptor(valid.sourceVerificationPath, descriptor.path, descriptor.media_type);
    }
    return descriptor;
  });
  writeJson(valid.receiptPath, partialReceipt);
  runGit(worktree, ["add", "worker-output/outcomes.ndjson", "worker-output/source-verification.json", "worker-output/receipt.json"]);
  runGit(worktree, ["commit", "-m", "honest partial worker output"]);
  const partialContentCommit = runGit(worktree, ["rev-parse", "HEAD"]);
  const resumable = structuredClone(valid.manifest);
  resumable.status = "partial";
  resumable.commitSha = partialContentCommit;
  resumable.receipt = { path: "worker-output/receipt.json", sha256: sha256File(valid.receiptPath), bytes: fs.statSync(valid.receiptPath).size };
  resumable.sourceVerification = { path: "worker-output/source-verification.json", sha256: sha256File(valid.sourceVerificationPath), bytes: fs.statSync(valid.sourceVerificationPath).size };
  resumable.blockedItems = ["Provider pagination interrupted before page 2."];
  resumable.remainingWork = ["Resume provider pagination at page 2."];
  resumable.retryResume = { attempt: 1, retryable: true, resumeToken: "page-2", remainingRequests: ["page-2"] };
  resumable.counts.final.completeOutcomePairs = 0;
  resumable.counts.net.completeOutcomePairs = 0;
  resumable.counts.final.evidenceFoundOutcomes = 0;
  resumable.counts.net.evidenceFoundOutcomes = 0;
  resumable.counts.final.publicationEligibleAssertions = 0;
  resumable.counts.net.publicationEligibleAssertions = 0;
  resumable.counts.final.errors = 1;
  resumable.counts.net.errors = 1;
  resumable.performance.validPairsScreened = 0;
  writeJson(valid.manifestPath, resumable);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  record("retry_resumability", "pass", result, "Partial work with an exact resume point passes.");
  runGit(worktree, ["add", "worker-output/manifest.json"]);
  runGit(worktree, ["commit", "-m", "partial worker manifest"]);
  const partialManifestBytes = fs.readFileSync(valid.manifestPath);
  const partialOrchestrationRoot = path.join(fixtureRoot, "partial-orchestration");
  writeJson(path.join(partialOrchestrationRoot, "jobs.json"), { schemaVersion: 1, jobs: [{ ...job, state: "leased", currentLeaseId: lease.leaseId }] });
  writeJson(path.join(partialOrchestrationRoot, "leases.json"), { schemaVersion: 1, leases: [lease] });
  writeJson(path.join(partialOrchestrationRoot, "integration-queue.json"), { schemaVersion: 1, items: [] });
  result = run("node", [ORCHESTRATOR, "transition", "--root", partialOrchestrationRoot, "--lease", lease.leaseId, "--state", "failed", "--manifest", valid.manifestPath, "--now", NOW], REPO_ROOT);
  const partialLease = readJson(path.join(partialOrchestrationRoot, "leases.json")).leases[0];
  const partialQueue = readJson(path.join(partialOrchestrationRoot, "integration-queue.json")).items;
  const partialDurablePath = path.join(partialOrchestrationRoot, partialLease.resultManifest?.path ?? "missing");
  const partialArchived = result.status === 0
    && partialLease.state === "failed"
    && partialLease.resultManifest?.status === "partial"
    && partialQueue.length === 0
    && fs.existsSync(partialDurablePath)
    && fs.readFileSync(partialDurablePath).equals(partialManifestBytes);
  record("partial_manifest_archived_without_queue", "pass", { ...result, status: partialArchived ? 0 : 1 }, "A validated interrupted result is durably archived for recovery without entering the integration queue.");
  fs.writeFileSync(path.join(worktree, "worker-output/outcomes.ndjson"), originalOutcomes);
  fs.writeFileSync(valid.receiptPath, originalReceipt);
  fs.writeFileSync(valid.sourceVerificationPath, originalSourceVerification);
  fs.writeFileSync(valid.manifestPath, originalManifest);
  runGit(worktree, ["add", "worker-output/outcomes.ndjson", "worker-output/receipt.json", "worker-output/source-verification.json", "worker-output/manifest.json"]);
  runGit(worktree, ["commit", "-m", "restore complete worker fixture"]);

  fs.mkdirSync(path.join(worktree, "public/generated"), { recursive: true });
  fs.writeFileSync(path.join(worktree, "public/generated/temporary-forbidden.json"), "{}\n");
  runGit(worktree, ["add", "public/generated/temporary-forbidden.json"]);
  runGit(worktree, ["commit", "-m", "attempt historical forbidden write"]);
  fs.unlinkSync(path.join(worktree, "public/generated/temporary-forbidden.json"));
  runGit(worktree, ["add", "public/generated/temporary-forbidden.json"]);
  runGit(worktree, ["commit", "-m", "remove historical forbidden write"]);
  result = run("node", [WORKER_VALIDATOR, "manifest", "--lease", leasePath, "--manifest", valid.manifestPath, "--repo", worktree, "--now", NOW], REPO_ROOT);
  recordRejectsWith("historical_forbidden_write", result, "Changed path is prohibited: public/generated/temporary-forbidden.json", "A forbidden path remains a safety violation even when a later commit deletes it.");

  const orchestrationRoot = path.join(fixtureRoot, "orchestration");
  const secondJob = makeJob({ jobId: "test-job-two", baseSha, branch: "codex/test-job-two", worktree: path.join(fixtureRoot, "worktree-two"), claims: [`state/${STATE_CODE}/source/*/taxon/${SPECIES_ID}`] });
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

  const rollbackRoot = path.join(fixtureRoot, "rollback-orchestration");
  const rollbackJob = makeJob({ jobId: "rollback-job", baseSha, branch: "codex/rollback-job", worktree: path.join(fixtureRoot, "rollback-worktree"), claims: [`state/AR/source/${SOURCE_ID}/taxon/${SPECIES_ID}`] });
  writeJson(path.join(rollbackRoot, "jobs.json"), { schemaVersion: 1, jobs: [rollbackJob] });
  writeJson(path.join(rollbackRoot, "leases.json"), { schemaVersion: 1, leases: [] });
  writeJson(path.join(rollbackRoot, "integration-queue.json"), { schemaVersion: 1, items: [] });
  const rollbackJobsBefore = fs.readFileSync(path.join(rollbackRoot, "jobs.json"));
  const rollbackLeasesBefore = fs.readFileSync(path.join(rollbackRoot, "leases.json"));
  const invalidClaimPath = path.join(fixtureRoot, "invalid-claim-lease.json");
  writeJson(invalidClaimPath, makeLease(rollbackJob, { branch: "codex/mismatched-branch" }));
  result = run("node", [ORCHESTRATOR, "claim", "--root", rollbackRoot, "--job", rollbackJob.jobId, "--lease", invalidClaimPath, "--now", NOW], REPO_ROOT);
  const rollbackPreserved = result.status !== 0
    && rollbackJobsBefore.equals(fs.readFileSync(path.join(rollbackRoot, "jobs.json")))
    && rollbackLeasesBefore.equals(fs.readFileSync(path.join(rollbackRoot, "leases.json")));
  record("failed_claim_rolls_back", "pass", { ...result, status: rollbackPreserved ? 0 : 1 }, "A rejected claim restores the exact pre-command jobs and leases documents.");

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
  candidateVersion: RECOVERY_VERSION,
  checkedAt: new Date().toISOString(),
  result: failed === 0 ? "pass" : "fail",
  counts: { total: cases.length, passed, failed, criticalSafetyViolations: failed },
  performance: { wallSeconds: Number(wallSeconds.toFixed(3)), peakMemoryMb: Number((peakMemoryBytes / 1024 / 1024).toFixed(3)), manualInterventions: 0 },
  cases,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.exitCode = failed === 0 ? 0 : 1;
