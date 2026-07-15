#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const EXPECTED_OUTPUT_CATEGORIES = [
  "manifest",
  "artifacts",
  "assertions",
  "reviews",
  "rejections",
  "outcomes",
  "receipt",
  "source-verification",
];
const REQUIRED_SKILL_NAMES = [
  "isitusa-national-orchestrator",
  "isitusa-evidence-worker",
];

const JOB_STATES = new Set([
  "planned",
  "leased",
  "submitted",
  "integrating",
  "completed",
  "blocked",
  "failed",
  "cancelled",
]);
const LEASE_STATES = new Set([
  "active",
  "completed",
  "expired",
  "recovered",
  "failed",
  "cancelled",
]);
const WORKER_TYPES = new Set([
  "national-source",
  "state-source",
  "evidence-review",
  "partition",
  "protocol",
  "bounded-infrastructure",
]);
const QUEUE_DECISIONS = new Set([
  "pending",
  "accepted",
  "changes-requested",
  "rejected",
  "integrated",
  "superseded",
]);
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

function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) result[key] = true;
    else {
      result[key] = value;
      index += 1;
    }
  }
  return result;
}

function output(payload, exitCode = 0) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exitCode = exitCode;
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) {
    if (fallback !== undefined) return structuredClone(fallback);
    throw new Error(`Missing JSON file: ${file}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  fs.renameSync(temporary, file);
}

function atomicWriteBytes(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, bytes, { flag: "wx" });
  fs.renameSync(temporary, file);
}

function acquireLock(root) {
  fs.mkdirSync(root, { recursive: true });
  const file = path.join(root, ".orchestration.lock");
  const descriptor = fs.openSync(file, "wx");
  return () => {
    fs.closeSync(descriptor);
    fs.unlinkSync(file);
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSha(value, length) {
  return typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
}

function nonemptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string" && item.length > 0);
}

function isSafeRelativePath(value) {
  return typeof value === "string" &&
    value.length > 0 &&
    !value.includes("\\") &&
    !path.posix.isAbsolute(value) &&
    !path.win32.isAbsolute(value) &&
    path.posix.normalize(value) === value &&
    value.split("/").every((segment) => segment && segment !== "." && segment !== "..");
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function validateExpectedOutputs(value, label, errors, warnings, requireComplete) {
  if (!nonemptyStrings(value)) {
    errors.push(`${label}.expectedOutputs must be nonempty.`);
    return;
  }
  if (new Set(value).size !== value.length) errors.push(`${label}.expectedOutputs contains duplicates.`);
  for (const category of value) {
    if (!EXPECTED_OUTPUT_CATEGORIES.includes(category)) errors.push(`${label}.expectedOutputs contains unknown category ${category}.`);
  }
  const missing = EXPECTED_OUTPUT_CATEGORIES.filter((category) => !value.includes(category));
  if (missing.length > 0) {
    const message = `${label}.expectedOutputs is missing required categories: ${missing.join(", ")}.`;
    if (requireComplete) errors.push(message);
    else warnings.push(`Historical terminal contract: ${message}`);
  }
}

function normalizeClaim(claim) {
  if (typeof claim !== "string" || claim.startsWith("/") || claim.endsWith("/")) {
    throw new Error(`Invalid scope claim: ${String(claim)}`);
  }
  const segments = claim.split("/");
  if (segments.some((segment) => !segment || segment === ".." || (segment.includes("*") && segment !== "*"))) {
    throw new Error(`Invalid scope claim: ${claim}`);
  }
  return segments;
}

function claimsOverlap(left, right) {
  const a = normalizeClaim(left);
  const b = normalizeClaim(right);
  if (a.length !== b.length) return false;
  return a.every((segment, index) => segment === "*" || b[index] === "*" || segment === b[index]);
}

function globToRegex(pattern) {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else source += "[^/]*";
    } else source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${source}$`);
}

function patternCovers(pattern, target) {
  return pattern === target || globToRegex(pattern).test(target.replace(/\*\*/g, "probe/deep").replace(/\*/g, "probe"));
}

function pinKey(pin) {
  return JSON.stringify({
    name: pin.name,
    version: pin.version,
    gitCommit: pin.gitCommit ?? null,
    contentHash: pin.contentHash,
  });
}

function validatePin(pin, label, errors) {
  if (!isObject(pin)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if (typeof pin.name !== "string" || !pin.name) errors.push(`${label}.name is required.`);
  if (typeof pin.version !== "string" || !pin.version) errors.push(`${label}.version is required.`);
  if (!isSha(pin.contentHash, 64)) errors.push(`${label}.contentHash must be a SHA-256.`);
  const candidate = typeof pin.version === "string" && pin.version.startsWith("candidate-");
  if (candidate) {
    if (pin.gitCommit !== null && pin.gitCommit !== undefined && !isSha(pin.gitCommit, 40)) {
      errors.push(`${label}.gitCommit must be null or a Git SHA for a candidate version.`);
    }
  } else if (!isSha(pin.gitCommit, 40)) {
    errors.push(`${label}.gitCommit is required for a frozen version.`);
  }
}

function validateSkillPins(value, label, errors, warnings, requireInternal) {
  if (!Array.isArray(value) || value.length < 2) {
    errors.push(`${label}.skillPins must pin both project skills.`);
    return;
  }
  const names = value.map((pin) => pin?.name);
  if (new Set(names).size !== names.length) errors.push(`${label}.skillPins contains duplicate skill names.`);
  for (const name of REQUIRED_SKILL_NAMES) if (!names.includes(name)) errors.push(`${label}.skillPins is missing ${name}.`);
  value.forEach((pin, pinIndex) => {
    validatePin(pin, `${label}.skillPins[${pinIndex}]`, errors);
    if (pin?.path !== undefined) {
      const message = `${label}.skillPins[${pinIndex}].path is forbidden; pins resolve inside the leased worktree.`;
      if (requireInternal) errors.push(message);
      else warnings.push(`Historical terminal contract: ${message}`);
    }
  });
}

function validatePolicies(value, label, errors) {
  if (!isObject(value.retryPolicy) || !Number.isInteger(value.retryPolicy.maxAttempts) || value.retryPolicy.maxAttempts < 1 || !Array.isArray(value.retryPolicy.backoffSeconds) || value.retryPolicy.backoffSeconds.some((entry) => !Number.isFinite(entry) || entry < 0) || typeof value.retryPolicy.resumeRequired !== "boolean") errors.push(`${label}.retryPolicy is invalid.`);
  if (!isObject(value.resourcePolicy) || !Number.isFinite(value.resourcePolicy.maxArtifactBytes) || value.resourcePolicy.maxArtifactBytes < 0 || !Number.isFinite(value.resourcePolicy.maxWallMinutes) || value.resourcePolicy.maxWallMinutes <= 0 || !Number.isFinite(value.resourcePolicy.maxMemoryMb) || value.resourcePolicy.maxMemoryMb <= 0) errors.push(`${label}.resourcePolicy is invalid.`);
  if (Number.isFinite(value.resourcePolicy?.maxMemoryMb) && value.resourcePolicy.maxMemoryMb > 2048) errors.push(`${label}.resourcePolicy.maxMemoryMb exceeds the bounded worker limit.`);
}

function validateJob(job, index, errors, warnings) {
  const label = `jobs[${index}]`;
  if (!isObject(job)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if (typeof job.jobId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(job.jobId)) errors.push(`${label}.jobId is invalid.`);
  if (!WORKER_TYPES.has(job.workerType)) errors.push(`${label}.workerType is invalid.`);
  if (!isObject(job.stateOrSourceScope)) errors.push(`${label}.stateOrSourceScope is required.`);
  if (!isObject(job.taxaOrPairScope)) errors.push(`${label}.taxaOrPairScope is required.`);
  if (!nonemptyStrings(job.scopeClaims)) errors.push(`${label}.scopeClaims must be nonempty.`);
  else for (const claim of job.scopeClaims) {
    try { normalizeClaim(claim); } catch (error) { errors.push(`${label}: ${error.message}`); }
  }
  if (!isSha(job.baseSha, 40)) errors.push(`${label}.baseSha must be a Git SHA.`);
  if (typeof job.branch !== "string" || !job.branch.startsWith("codex/")) errors.push(`${label}.branch must start with codex/.`);
  if (typeof job.worktree !== "string" || !path.isAbsolute(job.worktree)) errors.push(`${label}.worktree must be absolute.`);
  if (!nonemptyStrings(job.permittedPaths)) errors.push(`${label}.permittedPaths must be nonempty.`);
  if (!nonemptyStrings(job.prohibitedPaths)) errors.push(`${label}.prohibitedPaths must be nonempty.`);
  else for (const required of REQUIRED_PROHIBITED) {
    if (!job.prohibitedPaths.some((pattern) => patternCovers(pattern, required) || pattern === required)) {
      errors.push(`${label}.prohibitedPaths must include ${required}.`);
    }
  }
  if (Array.isArray(job.permittedPaths) && Array.isArray(job.prohibitedPaths)) {
    for (const permitted of job.permittedPaths) {
      for (const prohibited of job.prohibitedPaths) {
        if (patternCovers(permitted, prohibited) || patternCovers(prohibited, permitted)) {
          errors.push(`${label} path ownership overlaps: ${permitted} and ${prohibited}.`);
        }
      }
    }
  }
  validateSkillPins(
    job.skillPins,
    label,
    errors,
    warnings,
    new Set(["planned", "leased"]).has(job.state),
  );
  validateExpectedOutputs(job.expectedOutputs, label, errors, warnings, new Set(["planned", "leased"]).has(job.state));
  validatePolicies(job, label, errors);
  if (!Number.isFinite(Date.parse(job.expiresAt))) errors.push(`${label}.expiresAt must be an ISO date-time.`);
  if (typeof job.recoveryState !== "string") errors.push(`${label}.recoveryState is required.`);
  if (!nonemptyStrings(job.completionCriteria)) errors.push(`${label}.completionCriteria must be nonempty.`);
  if (!Array.isArray(job.dependencies)) errors.push(`${label}.dependencies must be an array.`);
  if (!Number.isInteger(job.priority)) errors.push(`${label}.priority must be an integer.`);
  if (!JOB_STATES.has(job.state)) errors.push(`${label}.state is invalid.`);
}

function validateLease(lease, index, jobsById, errors, warnings) {
  const label = `leases[${index}]`;
  if (!isObject(lease)) {
    errors.push(`${label} must be an object.`);
    return;
  }
  if (typeof lease.leaseId !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(lease.leaseId)) errors.push(`${label}.leaseId is invalid.`);
  if (!jobsById.has(lease.jobId)) errors.push(`${label}.jobId does not exist.`);
  if (!Number.isInteger(lease.attempt) || lease.attempt < 1) errors.push(`${label}.attempt must be positive.`);
  if (!LEASE_STATES.has(lease.state)) errors.push(`${label}.state is invalid.`);
  if (!Number.isFinite(Date.parse(lease.claimedAt))) errors.push(`${label}.claimedAt is invalid.`);
  if (!Number.isFinite(Date.parse(lease.expiresAt))) errors.push(`${label}.expiresAt is invalid.`);
  if (typeof lease.workerTaskId !== "string" || !lease.workerTaskId) errors.push(`${label}.workerTaskId is required.`);
  if (!isSafeRelativePath(lease.expectedManifestPath)) errors.push(`${label}.expectedManifestPath must be a normalized relative path.`);
  if (!isSha(lease.baseSha, 40)) errors.push(`${label}.baseSha must be a Git SHA.`);
  if (typeof lease.branch !== "string" || !lease.branch.startsWith("codex/")) errors.push(`${label}.branch must start with codex/.`);
  if (typeof lease.worktree !== "string" || !path.isAbsolute(lease.worktree)) errors.push(`${label}.worktree must be absolute.`);
  if (!isObject(lease.stateOrSourceScope)) errors.push(`${label}.stateOrSourceScope is required.`);
  if (!isObject(lease.taxaOrPairScope)) errors.push(`${label}.taxaOrPairScope is required.`);
  if (!nonemptyStrings(lease.scopeClaims)) errors.push(`${label}.scopeClaims must be nonempty.`);
  if (!nonemptyStrings(lease.permittedPaths)) errors.push(`${label}.permittedPaths must be nonempty.`);
  if (!nonemptyStrings(lease.prohibitedPaths)) errors.push(`${label}.prohibitedPaths must be nonempty.`);
  validateSkillPins(
    lease.skillPins,
    label,
    errors,
    warnings,
    lease.state === "active",
  );
  validateExpectedOutputs(lease.expectedOutputs, label, errors, warnings, lease.state === "active");
  if (!nonemptyStrings(lease.completionCriteria)) errors.push(`${label}.completionCriteria must be nonempty.`);
  validatePolicies(lease, label, errors);
  const job = jobsById.get(lease.jobId);
  if (job && lease.state === "active") {
    for (const field of ["baseSha", "branch", "worktree"]) {
      if (lease[field] !== job[field]) errors.push(`${label}.${field} differs from its job.`);
    }
    for (const field of ["scopeClaims", "permittedPaths", "prohibitedPaths", "expectedOutputs", "completionCriteria"]) {
      if (JSON.stringify(lease[field]) !== JSON.stringify(job[field])) errors.push(`${label}.${field} differs from its job.`);
    }
    if (JSON.stringify((lease.skillPins ?? []).map(pinKey)) !== JSON.stringify((job.skillPins ?? []).map(pinKey))) {
      errors.push(`${label}.skillPins differs from its job.`);
    }
  }
}

function statePaths(root) {
  return {
    jobs: path.join(root, "jobs.json"),
    leases: path.join(root, "leases.json"),
    queue: path.join(root, "integration-queue.json"),
    dashboard: path.join(root, "dashboard.json"),
  };
}

function loadState(root) {
  const files = statePaths(root);
  return {
    files,
    jobsDoc: readJson(files.jobs, { schemaVersion: 1, jobs: [] }),
    leasesDoc: readJson(files.leases, { schemaVersion: 1, leases: [] }),
    queueDoc: readJson(files.queue, { schemaVersion: 1, items: [] }),
  };
}

function validateState(root, nowText) {
  const state = loadState(root);
  const errors = [];
  const warnings = [];
  if (state.jobsDoc.schemaVersion !== 1 || !Array.isArray(state.jobsDoc.jobs)) errors.push("jobs.json must contain schemaVersion 1 and jobs[].");
  if (state.leasesDoc.schemaVersion !== 1 || !Array.isArray(state.leasesDoc.leases)) errors.push("leases.json must contain schemaVersion 1 and leases[].");
  if (state.queueDoc.schemaVersion !== 1 || !Array.isArray(state.queueDoc.items)) errors.push("integration-queue.json must contain schemaVersion 1 and items[].");
  const jobs = Array.isArray(state.jobsDoc.jobs) ? state.jobsDoc.jobs : [];
  const leases = Array.isArray(state.leasesDoc.leases) ? state.leasesDoc.leases : [];
  const queue = Array.isArray(state.queueDoc.items) ? state.queueDoc.items : [];
  jobs.forEach((job, index) => validateJob(job, index, errors, warnings));
  const jobIds = jobs.map((job) => job.jobId);
  if (new Set(jobIds).size !== jobIds.length) errors.push("Duplicate job IDs are forbidden.");
  const jobsById = new Map(jobs.map((job) => [job.jobId, job]));
  leases.forEach((lease, index) => validateLease(lease, index, jobsById, errors, warnings));
  const leaseIds = leases.map((lease) => lease.leaseId);
  if (new Set(leaseIds).size !== leaseIds.length) errors.push("Duplicate lease IDs are forbidden.");
  const leasesById = new Map(leases.map((lease) => [lease.leaseId, lease]));
  const attempts = new Set();
  for (const lease of leases) {
    const attemptKey = `${lease.jobId}:${lease.attempt}`;
    if (attempts.has(attemptKey)) errors.push(`Duplicate lease attempt ${attemptKey}.`);
    attempts.add(attemptKey);
    const job = jobsById.get(lease.jobId);
    if (job && lease.attempt > job.retryPolicy?.maxAttempts) errors.push(`Lease ${lease.leaseId} exceeds job retryPolicy.maxAttempts.`);
    if (lease.attempt === 1 && lease.previousLeaseId !== null) errors.push(`First attempt ${lease.leaseId} must not reference a previous lease.`);
    if (lease.attempt > 1) {
      const previous = leasesById.get(lease.previousLeaseId);
      if (!previous) errors.push(`Retry lease ${lease.leaseId} references a missing previous lease.`);
      else {
        if (previous.jobId !== lease.jobId) errors.push(`Retry lease ${lease.leaseId} references a previous lease for another job.`);
        if (previous.attempt !== lease.attempt - 1) errors.push(`Retry lease ${lease.leaseId} does not follow the previous attempt.`);
        if (previous.state === "active") errors.push(`Retry lease ${lease.leaseId} cannot follow an active lease.`);
      }
      if (typeof lease.recoveryReason !== "string" || !lease.recoveryReason) errors.push(`Retry lease ${lease.leaseId} requires a recovery reason.`);
      if (!Number.isFinite(Date.parse(lease.recoveryAt))) errors.push(`Retry lease ${lease.leaseId} requires a recovery time.`);
    }
  }
  const active = leases.filter((lease) => lease.state === "active");
  const now = Date.parse(nowText);
  if (!Number.isFinite(now)) errors.push("Validation time must be an ISO date-time.");
  for (const lease of active) {
    if (Number.isFinite(now) && Date.parse(lease.expiresAt) <= now) errors.push(`Active lease ${lease.leaseId} is expired.`);
  }
  for (let left = 0; left < active.length; left += 1) {
    for (let right = left + 1; right < active.length; right += 1) {
      for (const a of active[left].scopeClaims ?? []) {
        for (const b of active[right].scopeClaims ?? []) {
          try {
            if (claimsOverlap(a, b)) errors.push(`Active lease collision: ${active[left].leaseId} ${a} overlaps ${active[right].leaseId} ${b}.`);
          } catch (error) {
            errors.push(error.message);
          }
        }
      }
    }
  }
  const queueIds = new Set();
  for (const [index, item] of queue.entries()) {
    if (!isObject(item) || typeof item.queueId !== "string") errors.push(`queue[${index}] is invalid.`);
    else if (queueIds.has(item.queueId)) errors.push(`Duplicate queue ID ${item.queueId}.`);
    else queueIds.add(item.queueId);
    if (!QUEUE_DECISIONS.has(item.decision)) errors.push(`queue[${index}].decision is invalid.`);
    if (!jobsById.has(item.jobId)) errors.push(`queue[${index}].jobId does not exist.`);
    const strictManifest =
      typeof item.manifestPath === "string" &&
      isSafeRelativePath(item.manifestPath) &&
      item.manifestPath.startsWith("manifests/");
    if (item.decision === "pending" && !strictManifest) {
      errors.push(`queue[${index}] pending manifestPath must be a durable manifests/ path.`);
    } else if (!strictManifest) {
      warnings.push(`Historical queue item ${item.queueId ?? index} has a non-durable manifest path.`);
    }
    if (strictManifest) {
      const manifestFile = path.resolve(root, item.manifestPath);
      try {
        const stats = fs.lstatSync(manifestFile);
        if (!stats.isFile() || stats.isSymbolicLink() || !isWithin(root, manifestFile)) {
          throw new Error("manifest is not a contained regular file");
        }
        const bytes = fs.readFileSync(manifestFile);
        const hash = crypto.createHash("sha256").update(bytes).digest("hex");
        if (item.manifestBytes !== bytes.length || item.manifestHash !== hash) {
          errors.push(`queue[${index}] durable manifest descriptor does not match its bytes.`);
        }
        const manifest = JSON.parse(bytes.toString("utf8"));
        const lease = leasesById.get(item.leaseId);
        const job = jobsById.get(item.jobId);
        if (!lease || lease.jobId !== item.jobId) errors.push(`queue[${index}] lease identity is invalid.`);
        if (manifest.jobId !== item.jobId || manifest.leaseId !== item.leaseId) errors.push(`queue[${index}] manifest identity is invalid.`);
        if (manifest.commitSha !== item.workerCommit) errors.push(`queue[${index}] workerCommit differs from the manifest.`);
        if (!isSha(item.workerBranchHead, 40)) errors.push(`queue[${index}].workerBranchHead is invalid.`);
        if (item.decision === "pending") {
          if (lease?.state !== "completed" || job?.state !== "submitted" || manifest.status !== "complete") {
            errors.push(`queue[${index}] pending lifecycle state is invalid.`);
          }
          const resultManifest = lease?.resultManifest;
          for (const field of ["path", "sha256", "bytes", "status", "workerCommit", "workerBranchHead"]) {
            if (resultManifest?.[field] !== ({
              path: item.manifestPath,
              sha256: item.manifestHash,
              bytes: item.manifestBytes,
              status: manifest.status,
              workerCommit: item.workerCommit,
              workerBranchHead: item.workerBranchHead,
            })[field]) errors.push(`queue[${index}] differs from lease.resultManifest.${field}.`);
          }
          try {
            const worktree = fs.realpathSync(lease.worktree);
            const head = execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
            if (head !== item.workerBranchHead) throw new Error("worker HEAD differs from the queue receipt");
            if (execFileSync("git", ["-C", worktree, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).trim()) {
              throw new Error("worker worktree is dirty");
            }
            execFileSync("git", ["-C", worktree, "merge-base", "--is-ancestor", item.workerCommit, item.workerBranchHead]);
            const committedManifest = execFileSync("git", ["-C", worktree, "show", `${item.workerBranchHead}:${lease.expectedManifestPath}`]);
            if (!committedManifest.equals(bytes)) throw new Error("committed manifest bytes differ from the durable receipt");
          } catch (error) {
            errors.push(`queue[${index}] worker branch receipt is invalid: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      } catch (error) {
        errors.push(`queue[${index}] durable manifest is invalid: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  for (const lease of leases) {
    if (lease.state !== "active" && !lease.resultManifest) {
      warnings.push(`Historical terminal lease ${lease.leaseId} has no durable result manifest.`);
    }
  }
  for (const job of jobs) {
    for (const dependency of job.dependencies ?? []) if (!jobsById.has(dependency)) errors.push(`Job ${job.jobId} depends on missing job ${dependency}.`);
    if (job.state === "leased") {
      const current = leasesById.get(job.currentLeaseId);
      if (!current || current.jobId !== job.jobId || current.state !== "active") errors.push(`Leased job ${job.jobId} does not reference its active current lease.`);
    }
  }
  return {
    state,
    result: {
      valid: errors.length === 0,
      checkedAt: nowText,
      errors,
      warnings,
      counts: { jobs: jobs.length, leases: leases.length, activeLeases: active.length, queueItems: queue.length },
    },
  };
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
  const files = listFiles(root);
  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    hash.update(relative);
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return { contentHash: hash.digest("hex"), fileCount: files.length };
}

function verifyPinnedSkillTree(root, skillName, expectedHash) {
  const skillRoot = path.resolve(root, ".agents", "skills", skillName);
  if (!isWithin(path.resolve(root), skillRoot) || !fs.existsSync(skillRoot)) {
    throw new Error(`Pinned skill ${skillName} is missing from ${root}.`);
  }
  function rejectLinks(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Pinned skill ${skillName} contains a symlink.`);
      if (entry.isDirectory()) rejectLinks(absolute);
      else if (!entry.isFile()) throw new Error(`Pinned skill ${skillName} contains an unsupported entry.`);
    }
  }
  rejectLinks(skillRoot);
  const actual = hashTree(skillRoot).contentHash;
  if (actual !== expectedHash) {
    throw new Error(`Pinned skill hash mismatch for ${skillName}: ${actual}.`);
  }
  return skillRoot;
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

try {
  if (command === "hash-tree") {
    const target = path.resolve(String(args.path ?? ""));
    if (!fs.statSync(target).isDirectory()) throw new Error("--path must name a directory.");
    output({ ok: true, path: target, ...hashTree(target) });
  } else {
    const root = path.resolve(String(args.root ?? "ops/national-research"));
    const now = String(args.now ?? new Date().toISOString());
    if (command === "validate") {
      const { result } = validateState(root, now);
      output({ ok: result.valid, command, root, ...result }, result.valid ? 0 : 1);
    } else if (command === "claim") {
      if (!args.job || !args.lease) throw new Error("claim requires --job and --lease.");
      const release = acquireLock(root);
      try {
        const { state, result } = validateState(root, now);
        if (!result.valid) throw new Error(`Current orchestration state is invalid: ${result.errors.join(" | ")}`);
        const job = state.jobsDoc.jobs.find((item) => item.jobId === args.job);
        if (!job) throw new Error(`Unknown job: ${args.job}`);
        if (!new Set(["planned", "failed", "blocked"]).has(job.state)) throw new Error(`Job ${job.jobId} cannot be leased from state ${job.state}.`);
        const lease = readJson(path.resolve(String(args.lease)));
        if (lease.jobId !== job.jobId || lease.state !== "active") throw new Error("Lease job or active state is invalid.");
        const nextLeases = { ...state.leasesDoc, leases: [...state.leasesDoc.leases, lease] };
        const nextJobs = { ...state.jobsDoc, jobs: state.jobsDoc.jobs.map((item) => item.jobId === job.jobId ? { ...item, state: "leased", currentLeaseId: lease.leaseId } : item) };
        let post;
        try {
          atomicWrite(state.files.leases, nextLeases);
          atomicWrite(state.files.jobs, nextJobs);
          post = validateState(root, now).result;
          if (!post.valid) throw new Error(`Claim produced invalid state: ${post.errors.join(" | ")}`);
        } catch (error) {
          atomicWrite(state.files.leases, state.leasesDoc);
          atomicWrite(state.files.jobs, state.jobsDoc);
          const rollback = validateState(root, now).result;
          if (!rollback.valid) throw new Error(`${error instanceof Error ? error.message : String(error)} | Claim rollback failed: ${rollback.errors.join(" | ")}`);
          throw error;
        }
        output({ ok: true, command, jobId: job.jobId, leaseId: lease.leaseId, validation: post });
      } finally { release(); }
    } else if (command === "transition") {
      if (!args.lease || !args.state) throw new Error("transition requires --lease and --state.");
      if (!new Set(["completed", "expired", "recovered", "failed", "cancelled"]).has(args.state)) throw new Error("Unsupported transition state.");
      const release = acquireLock(root);
      try {
        const { state, result } = validateState(root, now);
        if (!result.valid) throw new Error(`Current orchestration state is invalid: ${result.errors.join(" | ")}`);
        const lease = state.leasesDoc.leases.find((item) => item.leaseId === args.lease);
        if (!lease || lease.state !== "active") throw new Error("Only an active lease can transition.");
        let manifest = null;
        let validatedManifestPath = null;
        let validatedManifestBytes = null;
        let validatedManifestHash = null;
        let workerBranchHead = null;
        if (args.state === "completed" && !args.manifest) throw new Error("A completed lease requires --manifest.");
        if (args.manifest) {
          const worktree = fs.realpathSync(lease.worktree);
          const expectedManifestPath = path.resolve(worktree, lease.expectedManifestPath);
          if (!isWithin(worktree, expectedManifestPath)) throw new Error("Lease expected manifest path escapes the worker worktree.");
          const expectedManifestStats = fs.lstatSync(expectedManifestPath);
          if (!expectedManifestStats.isFile() || expectedManifestStats.isSymbolicLink()) throw new Error("Worker manifest must be a regular non-symlink file.");
          const suppliedManifestPath = fs.realpathSync(path.resolve(String(args.manifest)));
          if (suppliedManifestPath !== fs.realpathSync(expectedManifestPath)) throw new Error("Supplied manifest path differs from lease.expectedManifestPath.");
          validatedManifestPath = suppliedManifestPath;
          validatedManifestBytes = fs.readFileSync(validatedManifestPath);
          validatedManifestHash = crypto.createHash("sha256").update(validatedManifestBytes).digest("hex");
          manifest = JSON.parse(validatedManifestBytes.toString("utf8"));
          if (manifest.jobId !== lease.jobId || manifest.leaseId !== lease.leaseId) throw new Error("Manifest does not match the lease.");
          const allowedManifestStatuses = args.state === "completed"
            ? new Set(["complete"])
            : args.state === "failed"
              ? new Set(["partial", "failed"])
              : new Set(["partial", "blocked", "failed"]);
          if (!allowedManifestStatuses.has(manifest.status)) throw new Error(`Manifest status ${manifest.status} is invalid for transition ${args.state}.`);
          const pinsByName = new Map((lease.skillPins ?? []).map((pin) => [pin.name, pin]));
          const orchestratorPin = pinsByName.get("isitusa-national-orchestrator");
          const workerPin = pinsByName.get("isitusa-evidence-worker");
          if (!orchestratorPin || !workerPin) throw new Error("Lease does not pin both project skills.");
          verifyPinnedSkillTree(PROJECT_ROOT, "isitusa-national-orchestrator", orchestratorPin.contentHash);
          const workerSkillRoot = verifyPinnedSkillTree(worktree, "isitusa-evidence-worker", workerPin.contentHash);
          const workerValidator = path.join(workerSkillRoot, "scripts", "validate-worker.mjs");
          const workerValidatorStats = fs.lstatSync(workerValidator);
          if (!workerValidatorStats.isFile() || workerValidatorStats.isSymbolicLink()) throw new Error("Pinned worker validator is not a regular file.");
          const workerHeadBefore = execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
          const validationArgs = [
            workerValidator,
            "manifest",
            "--lease",
            state.files.leases,
            "--lease-id",
            lease.leaseId,
            "--manifest",
            validatedManifestPath,
            "--repo",
            worktree,
            "--now",
            now,
          ];
          if (process.env.ISITUSA_SKILL_TEST_VALIDATION_ROOT) {
            validationArgs.push("--validation-root", process.env.ISITUSA_SKILL_TEST_VALIDATION_ROOT);
          }
          const validation = spawnSync(
            process.execPath,
            validationArgs,
            { cwd: worktree, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
          );
          let validationPayload = null;
          try {
            validationPayload = JSON.parse(validation.stdout || "null");
          } catch {
            throw new Error(`Worker validator emitted invalid JSON: ${validation.stdout || validation.stderr}`);
          }
          if (validation.status !== 0 || validationPayload?.ok !== true) {
            throw new Error(`Worker manifest validation failed: ${validationPayload?.error ?? (validationPayload?.errors ?? []).join(" | ") ?? validation.stderr}`);
          }
          if (validationPayload.jobId !== lease.jobId || validationPayload.leaseId !== lease.leaseId) throw new Error("Worker validator returned the wrong lease identity.");
          const workerHeadAfter = execFileSync("git", ["-C", worktree, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
          if (workerHeadAfter !== workerHeadBefore) throw new Error("Worker HEAD changed during manifest validation.");
          if (!fs.readFileSync(validatedManifestPath).equals(validatedManifestBytes)) throw new Error("Worker manifest bytes changed during validation.");
          if (execFileSync("git", ["-C", worktree, "status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" }).trim()) {
            throw new Error("Worker worktree is dirty after manifest validation.");
          }
          const committedManifest = execFileSync("git", ["-C", worktree, "show", `${workerHeadAfter}:${lease.expectedManifestPath}`]);
          if (!committedManifest.equals(validatedManifestBytes)) throw new Error("Worker manifest is not committed exactly at worker HEAD.");
          workerBranchHead = workerHeadAfter;
        }
        const durableRelativePath = manifest ? `manifests/${lease.jobId}__${lease.leaseId}.json` : null;
        const durableManifestPath = durableRelativePath ? path.join(root, durableRelativePath) : null;
        const resultManifest = manifest ? {
          path: durableRelativePath,
          sha256: validatedManifestHash,
          bytes: validatedManifestBytes.length,
          status: manifest.status,
          workerCommit: manifest.commitSha,
          workerBranchHead,
        } : null;
        const leaseUpdate = {
          ...lease,
          state: args.state,
          transitionedAt: now,
          ...(resultManifest ? { resultManifest } : {}),
        };
        const jobState = args.state === "completed" ? "submitted" : args.state === "cancelled" ? "cancelled" : args.state === "failed" ? "failed" : "blocked";
        const nextLeases = { ...state.leasesDoc, leases: state.leasesDoc.leases.map((item) => item.leaseId === lease.leaseId ? leaseUpdate : item) };
        const nextJobs = { ...state.jobsDoc, jobs: state.jobsDoc.jobs.map((item) => item.jobId === lease.jobId ? { ...item, state: jobState } : item) };
        let nextQueue = state.queueDoc;
        if (manifest && args.state === "completed") {
          nextQueue = { ...state.queueDoc, items: [...state.queueDoc.items, {
            queueId: `queue-${lease.leaseId}`,
            jobId: lease.jobId,
            leaseId: lease.leaseId,
            decision: "pending",
            submittedAt: now,
            manifestPath: durableRelativePath,
            manifestHash: validatedManifestHash,
            manifestBytes: validatedManifestBytes.length,
            workerCommit: manifest.commitSha,
            workerBranchHead,
          }] };
        }
        let post;
        const originalStateBytes = {
          leases: fs.readFileSync(state.files.leases),
          jobs: fs.readFileSync(state.files.jobs),
          queue: fs.readFileSync(state.files.queue),
        };
        let createdDurableManifest = false;
        try {
          if (durableManifestPath) {
            if (fs.existsSync(durableManifestPath)) {
              const existing = fs.readFileSync(durableManifestPath);
              if (!existing.equals(validatedManifestBytes)) throw new Error("Durable manifest path already contains different bytes.");
            } else {
              atomicWriteBytes(durableManifestPath, validatedManifestBytes);
              createdDurableManifest = true;
            }
          }
          atomicWrite(state.files.leases, nextLeases);
          atomicWrite(state.files.jobs, nextJobs);
          atomicWrite(state.files.queue, nextQueue);
          post = validateState(root, now).result;
          if (!post.valid) throw new Error(`Transition produced invalid state: ${post.errors.join(" | ")}`);
        } catch (error) {
          atomicWriteBytes(state.files.leases, originalStateBytes.leases);
          atomicWriteBytes(state.files.jobs, originalStateBytes.jobs);
          atomicWriteBytes(state.files.queue, originalStateBytes.queue);
          if (createdDurableManifest && durableManifestPath && fs.existsSync(durableManifestPath)) fs.unlinkSync(durableManifestPath);
          const rollback = validateState(root, now).result;
          if (!rollback.valid) throw new Error(`${error instanceof Error ? error.message : String(error)} | Transition rollback failed: ${rollback.errors.join(" | ")}`);
          throw error;
        }
        output({ ok: true, command, leaseId: lease.leaseId, state: args.state, validation: post });
      } finally { release(); }
    } else if (command === "dashboard") {
      if (!args["as-of"]) throw new Error("dashboard requires --as-of.");
      const asOf = String(args["as-of"]);
      if (!Number.isFinite(Date.parse(asOf))) throw new Error("--as-of must be an ISO date-time.");
      const { state, result } = validateState(root, asOf);
      if (!result.valid) throw new Error(`Cannot generate dashboard from invalid state: ${result.errors.join(" | ")}`);
      const countBy = (items, field) => Object.fromEntries([...new Set(items.map((item) => item[field]))].sort().map((value) => [value, items.filter((item) => item[field] === value).length]));
      const manifests = [];
      const manifestDirectory = path.join(root, "manifests");
      if (fs.existsSync(manifestDirectory)) for (const file of fs.readdirSync(manifestDirectory).filter((name) => name.endsWith(".json")).sort()) manifests.push(readJson(path.join(manifestDirectory, file)));
      const validPairsScreened = manifests.reduce((total, manifest) => total + Number(manifest.performance?.validPairsScreened ?? 0), 0);
      const wallSeconds = manifests.reduce((total, manifest) => total + Number(manifest.performance?.wallSeconds ?? 0), 0);
      const dashboard = {
        schemaVersion: 1,
        asOf,
        jobs: { total: state.jobsDoc.jobs.length, byState: countBy(state.jobsDoc.jobs, "state") },
        leases: { total: state.leasesDoc.leases.length, byState: countBy(state.leasesDoc.leases, "state") },
        integrationQueue: { total: state.queueDoc.items.length, byDecision: countBy(state.queueDoc.items, "decision") },
        throughput: { manifests: manifests.length, validPairsScreened, wallSeconds, validPairsPerHour: wallSeconds > 0 ? Number((validPairsScreened * 3600 / wallSeconds).toFixed(4)) : 0 },
      };
      atomicWrite(state.files.dashboard, dashboard);
      output({ ok: true, command, dashboard });
    } else {
      output({ ok: false, error: "Usage: orchestrate.mjs <validate|claim|transition|dashboard|hash-tree> [options]" }, 1);
    }
  }
} catch (error) {
  output({ ok: false, command: command ?? null, error: error instanceof Error ? error.message : String(error) }, 1);
}
