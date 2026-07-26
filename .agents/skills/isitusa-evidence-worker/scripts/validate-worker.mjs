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
const OPERATIONAL_COUNT_KEYS = [
  "retainedArtifacts",
  "retainedArtifactBytes",
  "sourceRequests",
  "providerCandidates",
  "assertionEvents",
  "publicationEligibleAssertions",
  "reviewEvents",
  "rejectionRecords",
  "duplicateRecords",
  "distinctOutcomePairs",
  "completeOutcomePairs",
  "evidenceFoundOutcomes",
  "noQualifyingEvidenceOutcomes",
  "errors",
];
const REQUIRED_SKILL_NAMES = [
  "isitusa-national-orchestrator",
  "isitusa-evidence-worker",
];

const ATTESTATIONS = [
  "sourceSilenceCreatedNegative",
  "failedRequestCreatedNegative",
  "rejectionCreatedNegative",
  "missingGeographyCreatedDetermination",
  "incompleteScopeMarkedComplete",
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

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readLease(file, leaseId) {
  const value = readJson(file);
  if (Array.isArray(value.leases)) {
    if (!leaseId) throw new Error("A lease document requires --lease-id.");
    const lease = value.leases.find((item) => item.leaseId === leaseId);
    if (!lease) throw new Error(`Lease not found: ${leaseId}`);
    return lease;
  }
  return value;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isSha(value, length) {
  return typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function canonicalPath(value) {
  return fs.realpathSync(path.resolve(value));
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

function inventoryRunFiles(repo, runRoot, errors) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        errors.push(`Worker run directory contains a symlink: ${repositoryRelative(repo, absolute)}.`);
        files.push(repositoryRelative(repo, absolute));
      } else if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) files.push(repositoryRelative(repo, absolute));
      else errors.push(`Worker run directory contains an unsupported entry: ${repositoryRelative(repo, absolute)}.`);
    }
  }
  if (fs.existsSync(runRoot) && fs.statSync(runRoot).isDirectory()) walk(runRoot);
  return files.sort();
}

function hashTree(root) {
  const hash = crypto.createHash("sha256");
  const files = listFiles(root);
  for (const file of files) {
    hash.update(path.relative(root, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hashGitTree(repo, commit, skillName) {
  const prefix = `.agents/skills/${skillName}`;
  const files = git(repo, ["ls-tree", "-r", "--name-only", commit, "--", prefix])
    .split("\n")
    .filter(Boolean)
    .sort(compareCodePoints);
  if (files.length === 0) throw new Error(`Pinned skill ${skillName} is absent at ${commit}.`);
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.posix.relative(prefix, file));
    hash.update("\0");
    hash.update(execFileSync("git", ["-C", repo, "show", `${commit}:${file}`]));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

function descriptorCore(value) {
  return { path: value.path, sha256: value.sha256, bytes: value.bytes };
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function equalDescriptor(left, right) {
  return JSON.stringify(descriptorCore(left)) === JSON.stringify(descriptorCore(right));
}

function repositoryRelative(repo, absolute) {
  return path.relative(repo, absolute).split(path.sep).join("/");
}

function validateFileDescriptor(repo, runRoot, descriptor, label, errors) {
  if (!isObject(descriptor) || typeof descriptor.path !== "string" || !isSha(descriptor.sha256, 64) || !Number.isInteger(descriptor.bytes) || descriptor.bytes < 0) {
    errors.push(`${label} descriptor is invalid.`);
    return null;
  }
  const absolute = path.resolve(repo, descriptor.path);
  if (!isWithin(path.resolve(repo), absolute) || !isWithin(path.resolve(runRoot), absolute)) {
    errors.push(`${label} is outside the worker run directory: ${descriptor.path}.`);
    return null;
  }
  if (!fs.existsSync(absolute)) {
    errors.push(`${label} file is missing: ${descriptor.path}.`);
    return null;
  }
  const stats = fs.lstatSync(absolute);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    errors.push(`${label} is not a regular non-symlink file: ${descriptor.path}.`);
    return null;
  }
  const realRepo = fs.realpathSync(repo);
  const realRunRoot = fs.realpathSync(runRoot);
  const realFile = fs.realpathSync(absolute);
  if (!isWithin(realRepo, realFile) || !isWithin(realRunRoot, realFile)) {
    errors.push(`${label} resolves outside the worker run directory: ${descriptor.path}.`);
    return null;
  }
  if (stats.size !== descriptor.bytes) errors.push(`${label} byte count mismatch: ${descriptor.path}.`);
  if (hashFile(absolute) !== descriptor.sha256) errors.push(`${label} hash mismatch: ${descriptor.path}.`);
  return absolute;
}

function resolveTsxImport(repo, validationRoot) {
  const candidates = [
    path.join(validationRoot, "node_modules/tsx/dist/loader.mjs"),
    path.join(PROJECT_ROOT, "node_modules/tsx/dist/loader.mjs"),
  ];
  try {
    const commonDir = fs.realpathSync(path.resolve(repo, git(repo, ["rev-parse", "--git-common-dir"])));
    candidates.push(path.join(path.dirname(commonDir), "node_modules/tsx/dist/loader.mjs"));
  } catch {
    // Git validation reports repository failures separately.
  }
  const resolved = candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (!resolved) throw new Error("Cannot locate the pinned repository's tsx runtime loader.");
  return resolved;
}

function runCanonicalValidation({ repo, validationRoot, runRoot, sourceVerificationPath, lease, receipt }) {
  const sourceIds = lease.stateOrSourceScope?.sourceFamilies ?? [];
  const stateCodes = lease.stateOrSourceScope?.states ?? [];
  const pairKeys = lease.taxaOrPairScope?.pairs ?? [];
  if (sourceIds.length !== 1 || stateCodes.length !== 1 || pairKeys.length === 0) {
    return { error: "Canonical validation requires one source, one state, and at least one exact pair in the lease." };
  }
  const tsxImport = resolveTsxImport(repo, validationRoot);
  const nodeModulesRoot = path.dirname(path.dirname(path.dirname(tsxImport)));
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      tsxImport,
      path.join(validationRoot, "scripts/research/validate-immutable-run.ts"),
      "--repository-root",
      repo,
      "--validation-root",
      validationRoot,
      "--run-directory",
      runRoot,
      "--source-verification",
      sourceVerificationPath,
      "--run-id",
      path.basename(runRoot),
      "--source-id",
      sourceIds[0],
      "--state-code",
      stateCodes[0],
      "--pair-keys",
      pairKeys.join(","),
      "--code-commit",
      lease.expectedReceiptCodeCommit ?? lease.baseSha,
      "--worker-task-id",
      lease.workerTaskId,
    ],
    {
      cwd: validationRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_PATH: [nodeModulesRoot, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
      },
    },
  );
  let payload = null;
  try {
    payload = JSON.parse(result.stdout || "null");
  } catch {
    return { error: `Canonical validator emitted invalid JSON: ${result.stdout || result.stderr}` };
  }
  if (result.status !== 0 || payload?.ok !== true) {
    return { error: payload?.error ?? result.stderr ?? "Canonical validator failed." };
  }
  if (payload.runId !== receipt.run_id) {
    return { error: "Canonical validator returned an unexpected run identity." };
  }
  return { payload };
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

function matchesAny(file, patterns) {
  return patterns.some((pattern) => globToRegex(pattern).test(file));
}

function pinKey(pin) {
  return JSON.stringify({ name: pin.name, version: pin.version, gitCommit: pin.gitCommit ?? null, contentHash: pin.contentHash });
}

function changedPaths(repo, baseSha) {
  const paths = new Set();
  for (const args of [
    ["diff", "--name-only", `${baseSha}...HEAD`],
    ["diff", "--name-only"],
    ["diff", "--name-only", "--cached"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const value = git(repo, args);
    for (const file of value.split("\n").filter(Boolean)) paths.add(file);
  }
  return [...paths].sort();
}

function touchedPaths(repo, baseSha) {
  const paths = new Set(changedPaths(repo, baseSha));
  const history = git(repo, ["log", "--format=", "--name-only", `${baseSha}..HEAD`]);
  for (const file of history.split("\n").filter(Boolean)) paths.add(file);
  return [...paths].sort();
}

function verifyLease(lease, repo, now, requireCleanBase) {
  const errors = [];
  if (!isObject(lease)) return ["Lease must be an object."];
  const allowedStates = requireCleanBase ? new Set(["active"]) : new Set(["active", "completed"]);
  if (!allowedStates.has(lease.state)) errors.push(`Lease state ${lease.state} is not valid for ${requireCleanBase ? "preflight" : "manifest validation"}.`);
  if (lease.state === "active" && (!Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= Date.parse(now))) errors.push("Lease is expired or has an invalid expiration.");
  if (typeof lease.branch !== "string" || !lease.branch.startsWith("codex/")) errors.push("Lease branch must start with codex/.");
  if (!isSha(lease.baseSha, 40)) errors.push("Lease baseSha is invalid.");
  if (lease.expectedReceiptCodeCommit !== undefined && !isSha(lease.expectedReceiptCodeCommit, 40)) errors.push("Lease expectedReceiptCodeCommit is invalid.");
  if (!Array.isArray(lease.permittedPaths) || lease.permittedPaths.length === 0) errors.push("Lease permittedPaths is empty.");
  if (!Array.isArray(lease.prohibitedPaths) || lease.prohibitedPaths.length === 0) errors.push("Lease prohibitedPaths is empty.");
  if (!Array.isArray(lease.scopeClaims) || lease.scopeClaims.length === 0) errors.push("Lease scopeClaims is empty.");
  if (!Array.isArray(lease.skillPins) || lease.skillPins.length < 2) errors.push("Lease must pin both project skills.");
  else {
    const pinNames = lease.skillPins.map((pin) => pin?.name);
    if (new Set(pinNames).size !== pinNames.length) errors.push("Lease skillPins contains duplicate skill names.");
    for (const name of REQUIRED_SKILL_NAMES) if (!pinNames.includes(name)) errors.push(`Lease skillPins is missing ${name}.`);
  }
  if (typeof lease.expectedManifestPath !== "string" || !lease.expectedManifestPath || path.isAbsolute(lease.expectedManifestPath) || lease.expectedManifestPath.includes("\\") || path.posix.normalize(lease.expectedManifestPath) !== lease.expectedManifestPath || lease.expectedManifestPath.split("/").some((segment) => !segment || segment === "." || segment === "..")) errors.push("Lease expectedManifestPath must be a normalized relative path.");
  if (!Array.isArray(lease.expectedOutputs)) errors.push("Lease expectedOutputs must be an array.");
  else {
    if (new Set(lease.expectedOutputs).size !== lease.expectedOutputs.length) errors.push("Lease expectedOutputs contains duplicates.");
    for (const category of lease.expectedOutputs) {
      if (!EXPECTED_OUTPUT_CATEGORIES.includes(category)) errors.push(`Lease expectedOutputs contains unknown category ${category}.`);
    }
    for (const category of EXPECTED_OUTPUT_CATEGORIES) {
      if (!lease.expectedOutputs.includes(category)) errors.push(`Lease expectedOutputs is missing required category ${category}.`);
    }
  }
  let branch = null;
  let head = null;
  try {
    const top = canonicalPath(git(repo, ["rev-parse", "--show-toplevel"]));
    const canonicalRepo = canonicalPath(repo);
    if (top !== canonicalRepo) errors.push(`Repository top ${top} does not equal worktree ${canonicalRepo}.`);
    const gitDir = fs.realpathSync(path.resolve(repo, git(repo, ["rev-parse", "--git-dir"])));
    const commonDir = fs.realpathSync(path.resolve(repo, git(repo, ["rev-parse", "--git-common-dir"])));
    if (gitDir === commonDir) errors.push("Worker repository is not an isolated linked worktree.");
    branch = git(repo, ["branch", "--show-current"]);
    head = git(repo, ["rev-parse", "HEAD"]);
    if (branch !== lease.branch) errors.push(`Current branch ${branch} does not match lease branch ${lease.branch}.`);
    if (requireCleanBase && head !== lease.baseSha) errors.push(`Current HEAD ${head} does not match lease base ${lease.baseSha}.`);
    if (!requireCleanBase) {
      try { git(repo, ["merge-base", "--is-ancestor", lease.baseSha, head]); }
      catch { errors.push(`Lease base ${lease.baseSha} is not an ancestor of worker HEAD ${head}.`); }
    }
    if (isSha(lease.expectedReceiptCodeCommit, 40)) {
      try { git(repo, ["merge-base", "--is-ancestor", lease.expectedReceiptCodeCommit, lease.baseSha]); }
      catch { errors.push(`Lease expected receipt code commit ${lease.expectedReceiptCodeCommit} is not an ancestor of worker base ${lease.baseSha}.`); }
    }
    if (requireCleanBase && git(repo, ["status", "--porcelain"])) errors.push("Preflight worktree is not clean.");
  } catch (error) {
    errors.push(`Git preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const [index, pin] of (lease.skillPins ?? []).entries()) {
    if (!isObject(pin) || typeof pin.name !== "string" || typeof pin.version !== "string" || !pin.version || !isSha(pin.contentHash, 64)) {
      errors.push(`skillPins[${index}] is invalid.`);
      continue;
    }
    const candidate = pin.version.startsWith("candidate-");
    if ((!candidate && !isSha(pin.gitCommit, 40)) || (candidate && pin.gitCommit !== null && pin.gitCommit !== undefined && !isSha(pin.gitCommit, 40))) {
      errors.push(`skillPins[${index}].gitCommit is invalid for version ${pin.version}.`);
    }
    if (pin.path !== undefined) errors.push(`skillPins[${index}].path is forbidden; pins resolve inside the leased worktree.`);
    const skillPath = path.resolve(repo, ".agents", "skills", pin.name);
    if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) {
      errors.push(`Pinned skill is missing: ${skillPath}`);
      continue;
    }
    const actual = hashTree(skillPath);
    if (actual !== pin.contentHash) errors.push(`Pinned skill hash mismatch for ${pin.name}: ${actual}.`);
    if (isSha(pin.gitCommit, 40)) {
      try {
        git(repo, ["merge-base", "--is-ancestor", pin.gitCommit, lease.baseSha]);
        const committedHash = hashGitTree(repo, pin.gitCommit, pin.name);
        if (committedHash !== pin.contentHash) errors.push(`Pinned skill commit hash mismatch for ${pin.name}: ${committedHash}.`);
      } catch (error) {
        errors.push(`Pinned skill commit validation failed for ${pin.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  if (!isObject(lease.retryPolicy) || !Number.isInteger(lease.retryPolicy.maxAttempts) || lease.retryPolicy.maxAttempts < 1 || !Number.isInteger(lease.attempt) || lease.attempt < 1 || lease.attempt > lease.retryPolicy.maxAttempts) errors.push("Lease retry policy or attempt is invalid.");
  if (!isObject(lease.resourcePolicy) || !Number.isFinite(lease.resourcePolicy.maxArtifactBytes) || lease.resourcePolicy.maxArtifactBytes < 0 || !Number.isFinite(lease.resourcePolicy.maxWallMinutes) || lease.resourcePolicy.maxWallMinutes <= 0 || !Number.isFinite(lease.resourcePolicy.maxMemoryMb) || lease.resourcePolicy.maxMemoryMb <= 0) errors.push("Lease resource policy is invalid.");
  return { errors, branch, head };
}

function requireFields(object, fields, label, errors) {
  for (const field of fields) if (!(field in object)) errors.push(`${label}.${field} is required.`);
}

function validateGitWhitespace(repo, baseSha, errors) {
  const checks = [
    { label: "Committed base-to-head whitespace check", args: ["diff", "--check", `${baseSha}...HEAD`] },
    { label: "Unstaged whitespace check", args: ["diff", "--check"] },
    { label: "Staged whitespace check", args: ["diff", "--cached", "--check"] },
  ];
  for (const check of checks) {
    try {
      git(repo, check.args);
    } catch (error) {
      const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
      const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
      const detail = [stdout, stderr].filter(Boolean).join(" | ");
      errors.push(`${check.label} failed${detail ? `: ${detail}` : "."}`);
    }
  }
}

function readNdjson(repo, descriptor, label, errors) {
  if (!isObject(descriptor) || typeof descriptor.path !== "string" || !Number.isInteger(descriptor.count) || descriptor.count < 0) {
    errors.push(`${label} descriptor is invalid.`);
    return [];
  }
  const absolute = path.resolve(repo, descriptor.path);
  if (!absolute.startsWith(`${path.resolve(repo)}${path.sep}`) || !fs.existsSync(absolute)) {
    errors.push(`${label} file is missing or outside the worktree: ${descriptor.path}.`);
    return [];
  }
  const text = fs.readFileSync(absolute, "utf8");
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length !== descriptor.count) errors.push(`${label} count ${descriptor.count} does not match ${lines.length} lines.`);
  const records = [];
  for (const [index, line] of lines.entries()) {
    try { records.push(JSON.parse(line)); }
    catch (error) { errors.push(`${label} line ${index + 1} is invalid JSON.`); }
  }
  return records;
}

function readJsonForValidation(file, label, errors) {
  try {
    return readJson(file);
  } catch (error) {
    errors.push(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function validateContentCommit(
  repo,
  commitSha,
  descriptors,
  maxContentBytes,
  errors,
) {
  for (const [label, descriptor] of descriptors) {
    if (descriptor.bytes > maxContentBytes) {
      errors.push(
        `${label} exceeds the lease content byte limit at manifest.commitSha: ${descriptor.path}.`,
      );
      continue;
    }
    try {
      const contents = execFileSync(
        "git",
        ["-C", repo, "show", `${commitSha}:${descriptor.path}`],
        { maxBuffer: maxContentBytes },
      );
      if (contents.length !== descriptor.bytes) errors.push(`${label} bytes differ from manifest.commitSha: ${descriptor.path}.`);
      if (crypto.createHash("sha256").update(contents).digest("hex") !== descriptor.sha256) {
        errors.push(`${label} hash differs from manifest.commitSha: ${descriptor.path}.`);
      }
    } catch (error) {
      errors.push(`${label} is not available at manifest.commitSha: ${descriptor.path}.`);
    }
  }
}

function validateCounts(counts, errors) {
  if (!isObject(counts) || !isObject(counts.baseline) || !isObject(counts.final) || !isObject(counts.net)) {
    errors.push("counts must contain baseline, final, and net objects.");
    return;
  }
  const keys = [...new Set([...Object.keys(counts.baseline), ...Object.keys(counts.final), ...Object.keys(counts.net)])].sort();
  const expectedKeys = [...OPERATIONAL_COUNT_KEYS].sort();
  if (stableJson(keys) !== stableJson(expectedKeys)) errors.push("counts must report exactly every operational count key.");
  for (const key of expectedKeys) {
    const baseline = counts.baseline[key];
    const final = counts.final[key];
    const net = counts.net[key];
    if (![baseline, final, net].every(Number.isInteger)) errors.push(`counts.${key} values must be integers.`);
    else if (baseline < 0 || final < 0 || net < 0) errors.push(`counts.${key} values must be nonnegative.`);
    else if (final - baseline !== net) errors.push(`counts.${key} net does not equal final minus baseline.`);
  }
}

function validateManifest(lease, manifest, manifestPath, repo, validationRoot, now) {
  const errors = [];
  if (!isObject(manifest)) return { errors: ["Manifest must be an object."] };
  requireFields(manifest, [
    "schemaVersion", "jobId", "leaseId", "status", "branch", "worktree", "baseSha", "commitSha", "skillPins",
    "sourceParameters", "artifacts", "assertions", "reviews", "rejections", "outcomes", "receipt", "sourceVerification", "blockedItems", "counts",
    "verificationCommands", "retryResume", "remainingWork", "sharedChangeProposals", "performance", "semanticAttestation",
  ], "manifest", errors);
  if (manifest.schemaVersion !== 1) errors.push("manifest.schemaVersion must be 1.");
  for (const field of ["jobId", "leaseId", "branch", "baseSha"]) if (manifest[field] !== lease[field]) errors.push(`manifest.${field} differs from the lease.`);
  try {
    if (canonicalPath(manifest.worktree ?? "") !== canonicalPath(repo) || canonicalPath(lease.worktree) !== canonicalPath(repo)) errors.push("Manifest or lease worktree differs from --repo.");
  } catch (error) {
    errors.push("Manifest or lease worktree cannot be resolved.");
  }
  if (!new Set(["complete", "partial", "blocked", "failed"]).has(manifest.status)) errors.push("manifest.status is invalid.");
  if (!isSha(manifest.commitSha, 40)) errors.push("manifest.commitSha is invalid.");
  if (JSON.stringify((manifest.skillPins ?? []).map(pinKey)) !== JSON.stringify((lease.skillPins ?? []).map(pinKey))) errors.push("Manifest skill pins differ from the lease.");
  if (!isObject(manifest.sourceParameters)) errors.push("manifest.sourceParameters must be an object.");
  for (const field of ["artifacts", "assertions", "reviews", "rejections", "outcomes", "blockedItems", "verificationCommands", "remainingWork", "sharedChangeProposals"]) {
    if (!Array.isArray(manifest[field])) errors.push(`manifest.${field} must be an array.`);
  }
  validateCounts(manifest.counts, errors);
  const leaseCheck = verifyLease(lease, repo, now, false);
  errors.push(...leaseCheck.errors);
  const absoluteManifestPath = path.resolve(manifestPath);
  const expectedManifestPath = path.resolve(repo, lease.expectedManifestPath ?? "");
  if (absoluteManifestPath !== expectedManifestPath) {
    errors.push(`Manifest path does not match lease.expectedManifestPath: ${repositoryRelative(repo, absoluteManifestPath)}.`);
  }
  if (!isWithin(path.resolve(repo), absoluteManifestPath)) errors.push("Manifest path is outside the worker worktree.");
  const runRoot = path.dirname(absoluteManifestPath);
  if (!isWithin(path.resolve(repo), runRoot) || runRoot === path.resolve(repo)) errors.push("Worker run directory is invalid.");
  const changed = changedPaths(repo, lease.baseSha);
  const touched = touchedPaths(repo, lease.baseSha);
  for (const file of touched) {
    if (!matchesAny(file, lease.permittedPaths)) errors.push(`Changed path is not permitted: ${file}.`);
    if (matchesAny(file, lease.prohibitedPaths)) errors.push(`Changed path is prohibited: ${file}.`);
  }
  const reportedPaths = new Map();
  function reportPath(value, label) {
    if (typeof value !== "string" || !value) return;
    const existing = reportedPaths.get(value);
    if (existing) errors.push(`Worker output path is reported more than once by ${existing} and ${label}: ${value}.`);
    else reportedPaths.set(value, label);
  }
  const manifestRelativePath = repositoryRelative(repo, absoluteManifestPath);
  reportPath(manifestRelativePath, "manifest");
  const contentDescriptors = [];
  const manifestArtifacts = asArray(manifest.artifacts);
  for (const [index, artifact] of manifestArtifacts.entries()) {
    const label = `artifacts[${index}]`;
    const absolute = validateFileDescriptor(repo, runRoot, artifact, label, errors);
    reportPath(artifact?.path, label);
    if (absolute) contentDescriptors.push([label, descriptorCore(artifact)]);
  }
  const receiptPath = validateFileDescriptor(repo, runRoot, manifest.receipt, "receipt", errors);
  const sourceVerificationPath = validateFileDescriptor(repo, runRoot, manifest.sourceVerification, "sourceVerification", errors);
  reportPath(manifest.receipt?.path, "receipt");
  reportPath(manifest.sourceVerification?.path, "sourceVerification");
  if (receiptPath) contentDescriptors.push(["receipt", descriptorCore(manifest.receipt)]);
  if (sourceVerificationPath) contentDescriptors.push(["sourceVerification", descriptorCore(manifest.sourceVerification)]);
  const receipt = receiptPath ? readJsonForValidation(receiptPath, "receipt", errors) : null;
  const sourceVerification = sourceVerificationPath ? readJsonForValidation(sourceVerificationPath, "sourceVerification", errors) : null;
  if (receiptPath && path.basename(receiptPath) !== "receipt.json") errors.push("Receipt descriptor must point to receipt.json.");
  if (sourceVerificationPath && path.basename(sourceVerificationPath) !== "source-verification.json") errors.push("Source-verification descriptor must point to source-verification.json.");
  if (receipt && sourceVerification) {
    const canonical = runCanonicalValidation({ repo, validationRoot, runRoot, sourceVerificationPath, lease, receipt });
    if (canonical.error) errors.push(`Canonical immutable-run validation failed: ${canonical.error}`);
  }
  const eventCategories = [
    ["assertions", "assertions.ndjson"],
    ["reviews", "reviews.ndjson"],
    ["rejections", "rejections.ndjson"],
    ["outcomes", "outcomes.ndjson"],
  ];
  const receiptOutputByPath = new Map();
  if (Array.isArray(receipt?.outputs)) {
    for (const [index, descriptor] of receipt.outputs.entries()) {
      if (!isObject(descriptor) || typeof descriptor.path !== "string") continue;
      if (receiptOutputByPath.has(descriptor.path)) errors.push(`Receipt output path is duplicated: ${descriptor.path}.`);
      receiptOutputByPath.set(descriptor.path, descriptor);
      if (path.basename(descriptor.path) === "receipt.json") errors.push("Receipt cannot declare itself as an output.");
      if (!validateFileDescriptor(repo, runRoot, descriptor, `receipt.outputs[${index}]`, errors)) continue;
    }
  }
  const expectedReceiptOutputPaths = new Set();
  for (const [category, filename] of eventCategories) {
    const descriptors = asArray(manifest[category]);
    if (descriptors.length !== 1) errors.push(`manifest.${category} must contain exactly one descriptor.`);
    for (const [index, descriptor] of descriptors.entries()) {
      const label = `${category}[${index}]`;
      reportPath(descriptor?.path, label);
      if (path.basename(String(descriptor?.path ?? "")) !== filename) errors.push(`${label} must point to ${filename}.`);
      const receiptOutput = receiptOutputByPath.get(descriptor?.path);
      if (!receiptOutput) errors.push(`${label} is not declared by the receipt.`);
      else {
        expectedReceiptOutputPaths.add(receiptOutput.path);
        const absolute = validateFileDescriptor(repo, runRoot, receiptOutput, label, errors);
        if (absolute) contentDescriptors.push([label, descriptorCore(receiptOutput)]);
      }
    }
  }
  if (manifest.sourceVerification?.path) expectedReceiptOutputPaths.add(manifest.sourceVerification.path);
  const sourceVerificationReceiptOutput = receiptOutputByPath.get(manifest.sourceVerification?.path);
  if (!sourceVerificationReceiptOutput) errors.push("Source-verification file is not declared by the receipt.");
  else if (!equalDescriptor(sourceVerificationReceiptOutput, manifest.sourceVerification)) errors.push("Source-verification manifest descriptor differs from the receipt output descriptor.");
  for (const outputPath of receiptOutputByPath.keys()) {
    if (!expectedReceiptOutputPaths.has(outputPath)) errors.push(`Receipt declares an unreported or unsupported output: ${outputPath}.`);
  }
  if (Array.isArray(receipt?.artifacts)) {
    if (receipt.artifacts.length !== manifestArtifacts.length) errors.push("Manifest artifact set differs from the receipt artifact set.");
    for (const descriptor of receipt.artifacts) {
      const match = manifestArtifacts.find((entry) => entry?.path === descriptor?.path);
      if (!match || !equalDescriptor(match, descriptor)) errors.push(`Manifest artifact descriptor differs from the receipt: ${descriptor?.path ?? "<missing>"}.`);
    }
  }
  const assertions = asArray(manifest.assertions).flatMap((item, index) => readNdjson(repo, item, `assertions[${index}]`, errors));
  const reviews = asArray(manifest.reviews).flatMap((item, index) => readNdjson(repo, item, `reviews[${index}]`, errors));
  const rejections = asArray(manifest.rejections).flatMap((item, index) => readNdjson(repo, item, `rejections[${index}]`, errors));
  const outcomes = asArray(manifest.outcomes).flatMap((item, index) => readNdjson(repo, item, `outcomes[${index}]`, errors));
  const receiptCounts = receipt?.counts;
  const completeOutcomePairs = outcomes.filter((entry) => entry.scope_complete === true).length;
  const evidenceFoundOutcomes = outcomes.filter((entry) => entry.status === "evidence-found").length;
  const noQualifyingEvidenceOutcomes = outcomes.filter((entry) => entry.status === "no-qualifying-evidence").length;
  const publicationEligibleAssertions = new Set(
    outcomes
      .filter((entry) => entry.status === "evidence-found")
      .flatMap((entry) => entry.assertion_event_ids ?? []),
  ).size;
  const actualOperationalCounts = receipt && receiptCounts ? {
    retainedArtifacts: receipt.artifacts?.length ?? 0,
    retainedArtifactBytes: (receipt.artifacts ?? []).reduce((total, entry) => total + (entry.bytes ?? 0), 0),
    sourceRequests: receipt.upstream_requests?.length ?? 0,
    providerCandidates: receiptCounts.candidate_records,
    assertionEvents: assertions.length,
    publicationEligibleAssertions,
    reviewEvents: reviews.length,
    rejectionRecords: rejections.length,
    duplicateRecords: receiptCounts.duplicate_records,
    distinctOutcomePairs: new Set(outcomes.map((entry) => `${entry.county_fips}:${entry.species_id}`)).size,
    completeOutcomePairs,
    evidenceFoundOutcomes,
    noQualifyingEvidenceOutcomes,
    errors: receipt.errors?.length ?? 0,
  } : null;
  if (actualOperationalCounts && isObject(manifest.counts?.final)) {
    for (const key of OPERATIONAL_COUNT_KEYS) {
      if (manifest.counts.final[key] !== actualOperationalCounts[key]) {
        errors.push(`counts.final.${key} does not match validated worker output.`);
      }
    }
  }
  if (receipt) {
    if (receipt.status === "complete" && manifest.status !== "complete") errors.push("A complete receipt requires a complete manifest.");
    if (receipt.status === "partial" && !new Set(["partial", "blocked"]).has(manifest.status)) errors.push("A partial receipt requires a partial or blocked manifest.");
    if (receipt.status === "failed" && manifest.status !== "failed") errors.push("A failed receipt requires a failed manifest.");
    if (manifest.status === "complete" && receipt.status !== "complete") errors.push("A complete manifest requires a complete receipt.");
    if (isObject(manifest.sourceParameters)) {
      if (manifest.sourceParameters.sourceId !== receipt.source_id) errors.push("sourceParameters.sourceId differs from the receipt.");
      if (manifest.sourceParameters.adapterVersion !== receipt.adapter_version) errors.push("sourceParameters.adapterVersion differs from the receipt.");
      if (manifest.sourceParameters.stateCode !== receipt.requested_scope?.state_code) errors.push("sourceParameters.stateCode differs from the receipt.");
      for (const [key, value] of Object.entries(receipt.parameters ?? {})) {
        if (stableJson(manifest.sourceParameters[key]) !== stableJson(value)) errors.push(`sourceParameters.${key} differs from receipt.parameters.`);
      }
    }
  }
  if (!isObject(manifest.retryResume) || !Number.isInteger(manifest.retryResume.attempt) || manifest.retryResume.attempt !== lease.attempt) errors.push("retryResume attempt differs from lease attempt.");
  if (!Array.isArray(manifest.retryResume?.remainingRequests) || manifest.retryResume.remainingRequests.some((entry) => typeof entry !== "string" || !entry)) errors.push("retryResume.remainingRequests must contain nonempty request identifiers.");
  if (manifest.retryResume?.retryable === true) {
    if (manifest.status === "complete") errors.push("A retryable interrupted manifest cannot be complete.");
    if (!manifest.retryResume.resumeToken && !asArray(manifest.retryResume.remainingRequests).length) errors.push("Retryable work lacks a resume token or remaining requests.");
  }
  const receiptHasRetryableError = (receipt?.errors ?? []).some((entry) => entry.retryable === true);
  if (receiptHasRetryableError !== (manifest.retryResume?.retryable === true)) errors.push("retryResume.retryable does not match receipt errors.");
  if (!isObject(manifest.performance) || !Number.isFinite(manifest.performance.wallSeconds) || manifest.performance.wallSeconds < 0 || !Number.isFinite(manifest.performance.peakMemoryMb) || manifest.performance.peakMemoryMb < 0 || !Number.isInteger(manifest.performance.validPairsScreened) || manifest.performance.validPairsScreened < 0 || !Number.isInteger(manifest.performance.manualInterventions) || manifest.performance.manualInterventions < 0) errors.push("manifest.performance is incomplete or negative.");
  if (manifest.performance?.peakMemoryMb > lease.resourcePolicy?.maxMemoryMb) errors.push("Worker peak memory exceeded the lease limit.");
  if (manifest.performance?.wallSeconds > (lease.resourcePolicy?.maxWallMinutes ?? 0) * 60) errors.push("Worker wall time exceeded the lease limit.");
  if (actualOperationalCounts?.retainedArtifactBytes > lease.resourcePolicy?.maxArtifactBytes) errors.push("Worker retained artifacts exceeded the lease byte limit.");
  if (actualOperationalCounts && manifest.performance?.validPairsScreened !== actualOperationalCounts.completeOutcomePairs) errors.push("performance.validPairsScreened does not match complete outcome pairs.");
  if (!isObject(manifest.semanticAttestation)) errors.push("semanticAttestation is required.");
  else for (const field of ATTESTATIONS) if (manifest.semanticAttestation[field] !== false) errors.push(`semanticAttestation.${field} must be false.`);
  const verificationCommands = asArray(manifest.verificationCommands);
  const failedCommands = verificationCommands.filter((item) => !isObject(item) || item.exitCode !== 0 || item.result !== "pass" || typeof item.command !== "string" || !item.command);
  if (manifest.status === "complete") {
    if (asArray(manifest.blockedItems).length > 0) errors.push("A complete manifest cannot contain blocked items.");
    if (asArray(manifest.remainingWork).length > 0) errors.push("A complete manifest cannot contain remaining work.");
    if (failedCommands.length > 0 || verificationCommands.length === 0) errors.push("A complete manifest requires passing verification commands.");
    const exactDiffCommand = `git diff --check ${lease.baseSha}...HEAD`;
    const recordedExactDiff = verificationCommands.some((item) => item?.command === exactDiffCommand && item.exitCode === 0 && item.result === "pass");
    if (!recordedExactDiff) errors.push(`A complete manifest must record the exact passing command: ${exactDiffCommand}`);
  }
  validateGitWhitespace(repo, lease.baseSha, errors);
  try {
    const head = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["merge-base", "--is-ancestor", manifest.commitSha, head]);
    git(repo, ["merge-base", "--is-ancestor", lease.baseSha, manifest.commitSha]);
    if (manifest.status === "complete" && manifest.commitSha === lease.baseSha) errors.push("Final complete manifest commit cannot equal the lease base SHA.");
  } catch (error) {
    errors.push("manifest.commitSha must descend from the lease base and be an ancestor of worker HEAD.");
  }
  for (const file of changed) {
    if (!reportedPaths.has(file)) errors.push(`Changed worker output is not reported by the manifest: ${file}.`);
  }
  for (const file of inventoryRunFiles(repo, runRoot, errors)) {
    if (!reportedPaths.has(file)) errors.push(`Worker run file is not reported by the manifest: ${file}.`);
  }
  for (const [file, label] of reportedPaths.entries()) {
    if (!changed.includes(file)) errors.push(`${label} is reported but is not changed from the lease base: ${file}.`);
  }
  if (isSha(manifest.commitSha, 40)) {
    validateContentCommit(
      repo,
      manifest.commitSha,
      contentDescriptors,
      lease.resourcePolicy.maxArtifactBytes,
      errors,
    );
  }
  return { errors, changedPaths: changed, touchedPaths: touched, recordCounts: { assertions: assertions.length, reviews: reviews.length, rejections: rejections.length, outcomes: outcomes.length } };
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

try {
  if (!new Set(["preflight", "manifest", "hash-tree"]).has(command)) throw new Error("Usage: validate-worker.mjs <preflight|manifest|hash-tree> [options]");
  if (command === "hash-tree") {
    const target = path.resolve(String(args.path ?? ""));
    output({ ok: true, path: target, contentHash: hashTree(target), fileCount: listFiles(target).length });
  } else {
    if (!args.lease || !args.repo) throw new Error(`${command} requires --lease and --repo.`);
    const lease = readLease(path.resolve(String(args.lease)), args["lease-id"]);
    const repo = path.resolve(String(args.repo));
    const now = String(args.now ?? new Date().toISOString());
    if (!Number.isFinite(Date.parse(now))) throw new Error("--now must be an ISO date-time.");
    if (command === "preflight") {
      const result = verifyLease(lease, repo, now, true);
      output({ ok: result.errors.length === 0, command, jobId: lease.jobId, leaseId: lease.leaseId, branch: result.branch, head: result.head, errors: result.errors }, result.errors.length === 0 ? 0 : 1);
    } else {
      if (!args.manifest) throw new Error("manifest requires --manifest.");
      const manifestPath = path.resolve(String(args.manifest));
      const manifest = readJson(manifestPath);
      const validationRoot = path.resolve(String(args["validation-root"] ?? repo));
      const result = validateManifest(lease, manifest, manifestPath, repo, validationRoot, now);
      output({ ok: result.errors.length === 0, command, jobId: lease.jobId, leaseId: lease.leaseId, errors: result.errors, changedPaths: result.changedPaths, touchedPaths: result.touchedPaths, recordCounts: result.recordCounts }, result.errors.length === 0 ? 0 : 1);
    }
  }
} catch (error) {
  output({ ok: false, command: command ?? null, error: error instanceof Error ? error.message : String(error) }, 1);
}
