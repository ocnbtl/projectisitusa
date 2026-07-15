#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

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

function isSha(value, length) {
  return typeof value === "string" && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
}

function git(repo, args) {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function canonicalPath(value) {
  return fs.realpathSync(path.resolve(value));
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
    hash.update(path.relative(root, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
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

function verifyLease(lease, repo, now, requireCleanBase) {
  const errors = [];
  if (!isObject(lease)) return ["Lease must be an object."];
  const allowedStates = requireCleanBase ? new Set(["active"]) : new Set(["active", "completed"]);
  if (!allowedStates.has(lease.state)) errors.push(`Lease state ${lease.state} is not valid for ${requireCleanBase ? "preflight" : "manifest validation"}.`);
  if (lease.state === "active" && (!Number.isFinite(Date.parse(lease.expiresAt)) || Date.parse(lease.expiresAt) <= Date.parse(now))) errors.push("Lease is expired or has an invalid expiration.");
  if (typeof lease.branch !== "string" || !lease.branch.startsWith("codex/")) errors.push("Lease branch must start with codex/.");
  if (!isSha(lease.baseSha, 40)) errors.push("Lease baseSha is invalid.");
  if (!Array.isArray(lease.permittedPaths) || lease.permittedPaths.length === 0) errors.push("Lease permittedPaths is empty.");
  if (!Array.isArray(lease.prohibitedPaths) || lease.prohibitedPaths.length === 0) errors.push("Lease prohibitedPaths is empty.");
  if (!Array.isArray(lease.scopeClaims) || lease.scopeClaims.length === 0) errors.push("Lease scopeClaims is empty.");
  if (!Array.isArray(lease.skillPins) || lease.skillPins.length < 2) errors.push("Lease must pin both project skills.");
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
    if (requireCleanBase && git(repo, ["status", "--porcelain"])) errors.push("Preflight worktree is not clean.");
  } catch (error) {
    errors.push(`Git preflight failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  for (const [index, pin] of (lease.skillPins ?? []).entries()) {
    if (!isObject(pin) || typeof pin.name !== "string" || !isSha(pin.contentHash, 64)) {
      errors.push(`skillPins[${index}] is invalid.`);
      continue;
    }
    const skillPath = path.resolve(pin.path ?? path.join(repo, ".agents", "skills", pin.name));
    if (!fs.existsSync(skillPath) || !fs.statSync(skillPath).isDirectory()) {
      errors.push(`Pinned skill is missing: ${skillPath}`);
      continue;
    }
    const actual = hashTree(skillPath);
    if (actual !== pin.contentHash) errors.push(`Pinned skill hash mismatch for ${pin.name}: ${actual}.`);
  }
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

function validateCounts(counts, errors) {
  if (!isObject(counts) || !isObject(counts.baseline) || !isObject(counts.final) || !isObject(counts.net)) {
    errors.push("counts must contain baseline, final, and net objects.");
    return;
  }
  const keys = [...new Set([...Object.keys(counts.baseline), ...Object.keys(counts.final), ...Object.keys(counts.net)])].sort();
  for (const key of keys) {
    const baseline = counts.baseline[key];
    const final = counts.final[key];
    const net = counts.net[key];
    if (![baseline, final, net].every(Number.isInteger)) errors.push(`counts.${key} values must be integers.`);
    else if (final - baseline !== net) errors.push(`counts.${key} net does not equal final minus baseline.`);
  }
}

function validateAssertions(records, sourceParameters, errors) {
  const eventIds = new Set();
  const identities = new Set();
  for (const [index, record] of records.entries()) {
    const label = `assertion[${index}]`;
    if (!isObject(record)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    for (const field of ["eventId", "source_id", "run_id", "state_code", "county_fips", "species_id", "claim_type", "evidence_kind", "scope", "source_record_id", "source_url", "retrieved_at", "taxon_match", "geography_match", "temporal_scope", "spatial_scope", "normalized_payload_hash"]) {
      if (!(field in record)) errors.push(`${label}.${field} is required.`);
    }
    if (eventIds.has(record.eventId)) errors.push(`Duplicate assertion event ID: ${record.eventId}.`);
    eventIds.add(record.eventId);
    const identity = [record.source_id, record.source_record_id, record.species_id, record.county_fips, record.claim_type, record.normalized_payload_hash].join("|");
    if (identities.has(identity)) errors.push(`Duplicate assertion source identity: ${identity}.`);
    identities.add(identity);
    if (!record.geography_match?.source_county) errors.push(`${label}.geography_match.source_county is required.`);
    if (record.geography_match?.county_fips !== record.county_fips) errors.push(`${label}.geography_match.county_fips must exactly equal assertion county_fips.`);
    if (/coordinate/i.test(String(record.geography_match?.method ?? "")) && sourceParameters.geographyPolicyApproved !== true) errors.push(`${label} uses coordinate routing without an approved geography policy.`);
    const supportText = [...(record.caveats ?? []), ...(record.notes ?? []), String(record.survey_scope ?? "")].join(" ");
    if (record.claim_type === "officially-absent") {
      if (sourceParameters.negativeSemantics !== "explicit-authority-only") errors.push(`${label} uses unsupported authoritative negative semantics.`);
      if (record.evidence_kind !== "absence-statement") errors.push(`${label} absence must use evidence_kind absence-statement.`);
      if (!new Set(["county", "regulatory-area"]).has(record.scope)) errors.push(`${label} absence scope is not authoritative county scope.`);
      if (!/explicit/i.test(supportText) || !/absen/i.test(supportText)) errors.push(`${label} lacks retained explicit absence support.`);
      if (!record.temporal_scope || !record.spatial_scope) errors.push(`${label} absence lacks time or spatial scope.`);
    }
    if (record.claim_type === "not-detected") {
      if (sourceParameters.negativeSemantics !== "explicit-survey-only") errors.push(`${label} uses unsupported survey negative semantics.`);
      if (record.evidence_kind !== "survey-non-detection") errors.push(`${label} not-detected must use survey-non-detection evidence.`);
      if (!record.survey_scope) errors.push(`${label} not-detected lacks survey scope.`);
      for (const expression of [/target/i, /method|program/i, /effort|sample/i, /negative|not detected|zero/i]) {
        if (!expression.test(supportText)) errors.push(`${label} survey support is missing ${expression}.`);
      }
    }
  }
  return eventIds;
}

function validateOutcomes(records, assertionIds, rejectionIds, errors) {
  const outcomeIds = new Set();
  for (const [index, record] of records.entries()) {
    const label = `outcome[${index}]`;
    if (!isObject(record)) {
      errors.push(`${label} must be an object.`);
      continue;
    }
    if (outcomeIds.has(record.outcome_id)) errors.push(`Duplicate outcome ID: ${record.outcome_id}.`);
    outcomeIds.add(record.outcome_id);
    const assertions = record.assertion_event_ids ?? [];
    const rejections = record.rejection_ids ?? [];
    const queries = record.query_urls ?? [];
    for (const id of assertions) if (!assertionIds.has(id)) errors.push(`${label} references unknown assertion ${id}.`);
    for (const id of rejections) if (!rejectionIds.has(id)) errors.push(`${label} references unknown rejection ${id}.`);
    if (record.status === "evidence-found") {
      if (record.scope_complete !== true || assertions.length === 0 || queries.length === 0) errors.push(`${label} evidence-found is incomplete.`);
    } else if (record.status === "no-qualifying-evidence") {
      if (record.scope_complete !== true || assertions.length !== 0 || queries.length === 0) errors.push(`${label} no-qualifying-evidence is not a complete real screen.`);
    } else if (new Set(["needs-followup", "blocked"]).has(record.status)) {
      if (record.scope_complete !== false) errors.push(`${label} blocked or follow-up scope must be incomplete.`);
    } else errors.push(`${label} status is invalid; use evidence-found, no-qualifying-evidence, needs-followup, or blocked.`);
  }
}

function validateManifest(lease, manifest, repo, now) {
  const errors = [];
  if (!isObject(manifest)) return { errors: ["Manifest must be an object."] };
  requireFields(manifest, [
    "schemaVersion", "jobId", "leaseId", "status", "branch", "worktree", "baseSha", "commitSha", "skillPins",
    "sourceParameters", "artifacts", "assertions", "reviews", "rejections", "outcomes", "blockedItems", "counts",
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
  const changed = changedPaths(repo, lease.baseSha);
  for (const file of changed) {
    if (!matchesAny(file, lease.permittedPaths)) errors.push(`Changed path is not permitted: ${file}.`);
    if (matchesAny(file, lease.prohibitedPaths)) errors.push(`Changed path is prohibited: ${file}.`);
  }
  for (const artifact of manifest.artifacts ?? []) {
    if (!isObject(artifact) || typeof artifact.path !== "string" || !isSha(artifact.sha256, 64) || !Number.isInteger(artifact.bytes) || artifact.bytes < 0) {
      errors.push("Artifact descriptor is invalid.");
      continue;
    }
    const absolute = path.resolve(repo, artifact.path);
    if (!absolute.startsWith(`${path.resolve(repo)}${path.sep}`) || !fs.existsSync(absolute)) errors.push(`Artifact is missing or outside worktree: ${artifact.path}.`);
    else {
      if (fs.statSync(absolute).size !== artifact.bytes) errors.push(`Artifact byte count mismatch: ${artifact.path}.`);
      if (hashFile(absolute) !== artifact.sha256) errors.push(`Artifact hash mismatch: ${artifact.path}.`);
    }
  }
  const assertions = (manifest.assertions ?? []).flatMap((item, index) => readNdjson(repo, item, `assertions[${index}]`, errors));
  const reviews = (manifest.reviews ?? []).flatMap((item, index) => readNdjson(repo, item, `reviews[${index}]`, errors));
  const rejections = (manifest.rejections ?? []).flatMap((item, index) => readNdjson(repo, item, `rejections[${index}]`, errors));
  const outcomes = (manifest.outcomes ?? []).flatMap((item, index) => readNdjson(repo, item, `outcomes[${index}]`, errors));
  const assertionIds = validateAssertions(assertions, manifest.sourceParameters ?? {}, errors);
  const rejectionIds = new Set();
  for (const [index, record] of rejections.entries()) {
    if (!record.rejection_id) errors.push(`rejection[${index}].rejection_id is required.`);
    else if (rejectionIds.has(record.rejection_id)) errors.push(`Duplicate rejection ID: ${record.rejection_id}.`);
    else rejectionIds.add(record.rejection_id);
  }
  const reviewIds = new Set();
  for (const [index, record] of reviews.entries()) {
    if (!record.eventId) errors.push(`review[${index}].eventId is required.`);
    else if (reviewIds.has(record.eventId)) errors.push(`Duplicate review ID: ${record.eventId}.`);
    else reviewIds.add(record.eventId);
    if (!record.references?.assertion_event_id) errors.push(`review[${index}].references.assertion_event_id is required.`);
    else if (!assertionIds.has(record.references.assertion_event_id)) errors.push(`review[${index}].references.assertion_event_id ${record.references.assertion_event_id} does not match any emitted assertion eventId.`);
  }
  validateOutcomes(outcomes, assertionIds, rejectionIds, errors);
  if (!isObject(manifest.retryResume) || !Number.isInteger(manifest.retryResume.attempt) || manifest.retryResume.attempt !== lease.attempt) errors.push("retryResume attempt differs from lease attempt.");
  if (manifest.retryResume?.retryable === true) {
    if (manifest.status === "complete") errors.push("A retryable interrupted manifest cannot be complete.");
    if (!manifest.retryResume.resumeToken && !(manifest.retryResume.remainingRequests ?? []).length) errors.push("Retryable work lacks a resume token or remaining requests.");
  }
  if (!isObject(manifest.performance) || !Number.isFinite(manifest.performance.wallSeconds) || !Number.isFinite(manifest.performance.peakMemoryMb) || !Number.isInteger(manifest.performance.validPairsScreened) || !Number.isInteger(manifest.performance.manualInterventions)) errors.push("manifest.performance is incomplete.");
  if (manifest.performance?.peakMemoryMb > lease.resourcePolicy?.maxMemoryMb) errors.push("Worker peak memory exceeded the lease limit.");
  if (!isObject(manifest.semanticAttestation)) errors.push("semanticAttestation is required.");
  else for (const field of ATTESTATIONS) if (manifest.semanticAttestation[field] !== false) errors.push(`semanticAttestation.${field} must be false.`);
  const failedCommands = (manifest.verificationCommands ?? []).filter((item) => !isObject(item) || item.exitCode !== 0 || item.result !== "pass" || typeof item.command !== "string" || !item.command);
  if (manifest.status === "complete") {
    if ((manifest.blockedItems ?? []).length > 0) errors.push("A complete manifest cannot contain blocked items.");
    if ((manifest.remainingWork ?? []).length > 0) errors.push("A complete manifest cannot contain remaining work.");
    if (failedCommands.length > 0 || (manifest.verificationCommands ?? []).length === 0) errors.push("A complete manifest requires passing verification commands.");
    const exactDiffCommand = `git diff --check ${lease.baseSha}...HEAD`;
    const recordedExactDiff = (manifest.verificationCommands ?? []).some((item) => item?.command === exactDiffCommand && item.exitCode === 0 && item.result === "pass");
    if (!recordedExactDiff) errors.push(`A complete manifest must record the exact passing command: ${exactDiffCommand}`);
  }
  validateGitWhitespace(repo, lease.baseSha, errors);
  try {
    const head = git(repo, ["rev-parse", "HEAD"]);
    git(repo, ["merge-base", "--is-ancestor", manifest.commitSha, head]);
    const dirty = git(repo, ["status", "--porcelain"]);
    if (!dirty && manifest.status === "complete" && manifest.commitSha === lease.baseSha) errors.push("Final complete manifest commit cannot equal the lease base SHA.");
  } catch (error) {
    errors.push("manifest.commitSha is not an ancestor of the worker branch HEAD.");
  }
  return { errors, changedPaths: changed, recordCounts: { assertions: assertions.length, reviews: reviews.length, rejections: rejections.length, outcomes: outcomes.length } };
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
      const manifest = readJson(path.resolve(String(args.manifest)));
      const result = validateManifest(lease, manifest, repo, now);
      output({ ok: result.errors.length === 0, command, jobId: lease.jobId, leaseId: lease.leaseId, errors: result.errors, changedPaths: result.changedPaths, recordCounts: result.recordCounts }, result.errors.length === 0 ? 0 : 1);
    }
  }
} catch (error) {
  output({ ok: false, command: command ?? null, error: error instanceof Error ? error.message : String(error) }, 1);
}
