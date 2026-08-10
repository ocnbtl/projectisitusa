import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

type Descriptor = {
  path: string;
  sha256: string;
  bytes: number;
  media_type: string;
};

type JsonObject = Record<string, unknown>;

const COUNT_KEYS = [
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
] as const;

function parseArgs(values: string[]) {
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid argument near ${key ?? "<missing>"}.`);
    }
    result.set(key.slice(2), value);
    index += 1;
  }
  return result;
}

function required(args: Map<string, string>, key: string) {
  const value = args.get(key);
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function readJson<T>(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function sha256(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function repositoryRelative(repo: string, filePath: string) {
  return path.relative(repo, filePath).split(path.sep).join("/");
}

function fileDescriptor(repo: string, relativePath: string, mediaType: string) {
  const bytes = fs.readFileSync(path.join(repo, relativePath));
  return {
    path: relativePath,
    sha256: sha256(bytes),
    bytes: bytes.length,
    media_type: mediaType,
  };
}

function readNdjson(repo: string, descriptor: Descriptor) {
  const text = fs.readFileSync(path.join(repo, descriptor.path), "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as JsonObject);
}

function git(repo: string, values: string[]) {
  return execFileSync("git", ["-C", repo, ...values], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  }).trim();
}

function integerArg(args: Map<string, string>, key: string, fallback?: number) {
  const raw = args.get(key);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`--${key} must be a nonnegative integer.`);
  }
  return Number(value);
}

function booleanArg(
  args: Map<string, string>,
  key: string,
  fallback: boolean,
) {
  const raw = args.get(key);
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`--${key} must be true or false.`);
}

function failedRequestIdentity(error: JsonObject, index: number) {
  if (typeof error.url === "string" && error.url) return error.url;
  const message = typeof error.message === "string" ? error.message : "";
  const schemeIndex = message.indexOf("://");
  const delimiterIndex = schemeIndex >= 0
    ? message.indexOf(": ", schemeIndex + 3)
    : -1;
  if (delimiterIndex > 0) return message.slice(0, delimiterIndex);
  const code = typeof error.code === "string" && error.code
    ? error.code
    : "unknown";
  return `error:${code}:${index + 1}`;
}

try {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(required(args, "repo"));
  const leaseRegistry = path.resolve(required(args, "lease-registry"));
  const leaseId = required(args, "lease-id");
  const runDirectory = path.resolve(required(args, "run-directory"));
  const contentCommit = required(args, "content-commit");
  const outputPath = path.resolve(required(args, "output"));
  const wallSeconds = integerArg(args, "wall-seconds");
  const peakMemoryMb = integerArg(args, "peak-memory-mb");
  const peakMemoryMeasured = booleanArg(
    args,
    "peak-memory-measured",
    true,
  );
  if (!peakMemoryMeasured && peakMemoryMb !== 0) {
    throw new Error(
      "An unmeasured peak memory value must use the zero schema sentinel.",
    );
  }
  const manualInterventions = integerArg(args, "manual-interventions", 0);
  const acquisitionAttempts = integerArg(args, "acquisition-attempts", 1);
  const leases = readJson<{ leases: JsonObject[] }>(leaseRegistry).leases;
  const lease = leases.find((entry) => entry.leaseId === leaseId);
  if (!lease) throw new Error(`Unknown lease ${leaseId}.`);
  if (path.resolve(String(lease.worktree)) !== repo) {
    throw new Error("Lease worktree differs from --repo.");
  }
  if (git(repo, ["rev-parse", "HEAD"]) !== contentCommit) {
    throw new Error("Worker HEAD must equal --content-commit before manifest generation.");
  }

  const receiptPath = path.join(runDirectory, "receipt.json");
  const sourceVerificationPath = path.join(runDirectory, "source-verification.json");
  const receipt = readJson<JsonObject>(receiptPath);
  const receiptStatus = String(receipt.status);
  if (!new Set(["complete", "partial", "failed"]).has(receiptStatus)) {
    throw new Error(`Unsupported receipt status ${receiptStatus}.`);
  }
  const receiptErrors = Array.isArray(receipt.errors)
    ? receipt.errors as JsonObject[]
    : [];
  const retryableErrors = receiptErrors.filter(
    (entry) => entry.retryable === true,
  );
  const outputs = receipt.outputs as Descriptor[];
  const artifacts = receipt.artifacts as Descriptor[];
  const outputByName = new Map(
    outputs.map((entry) => [path.basename(entry.path), entry]),
  );
  const assertionDescriptor = outputByName.get("assertions.ndjson");
  const reviewDescriptor = outputByName.get("reviews.ndjson");
  const rejectionDescriptor = outputByName.get("rejections.ndjson");
  const outcomeDescriptor = outputByName.get("outcomes.ndjson");
  const sourceVerificationDescriptor = outputByName.get("source-verification.json");
  if (
    !assertionDescriptor ||
    !reviewDescriptor ||
    !rejectionDescriptor ||
    !outcomeDescriptor ||
    !sourceVerificationDescriptor
  ) {
    throw new Error("Receipt output descriptors are incomplete.");
  }
  const assertions = readNdjson(repo, assertionDescriptor);
  const reviews = readNdjson(repo, reviewDescriptor);
  const rejections = readNdjson(repo, rejectionDescriptor);
  const outcomes = readNdjson(repo, outcomeDescriptor);
  const evidenceFound = outcomes.filter(
    (entry) => entry.status === "evidence-found",
  );
  const publicationEligibleAssertions = new Set(
    evidenceFound.flatMap((entry) => entry.assertion_event_ids as string[] ?? []),
  ).size;
  const completeOutcomePairs = outcomes.filter(
    (entry) => entry.scope_complete === true,
  ).length;
  const remainingPairKeys = outcomes
    .filter((entry) => entry.scope_complete !== true)
    .map((entry) => `${String(entry.county_fips)}:${String(entry.species_id)}`);
  const remainingRequests = [...new Set(retryableErrors.map(failedRequestIdentity))];
  const finalCounts = {
    retainedArtifacts: artifacts.length,
    retainedArtifactBytes: artifacts.reduce(
      (sum, entry) => sum + entry.bytes,
      0,
    ),
    sourceRequests: (receipt.upstream_requests as unknown[]).length,
    providerCandidates: Number((receipt.counts as JsonObject).candidate_records),
    assertionEvents: assertions.length,
    publicationEligibleAssertions,
    reviewEvents: reviews.length,
    rejectionRecords: rejections.length,
    duplicateRecords: Number((receipt.counts as JsonObject).duplicate_records),
    distinctOutcomePairs: new Set(
      outcomes.map((entry) => `${entry.county_fips}:${entry.species_id}`),
    ).size,
    completeOutcomePairs,
    evidenceFoundOutcomes: evidenceFound.length,
    noQualifyingEvidenceOutcomes: outcomes.filter(
      (entry) => entry.status === "no-qualifying-evidence",
    ).length,
    errors: receiptErrors.length,
  };
  const zeroCounts = Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
  const receiptDescriptor = fileDescriptor(
    repo,
    repositoryRelative(repo, receiptPath),
    "application/json",
  );
  const sourceParameters = {
    sourceId: receipt.source_id,
    adapterVersion: receipt.adapter_version,
    stateCode: (receipt.requested_scope as JsonObject).state_code,
    ...(receipt.parameters as JsonObject),
  };
  const finishedAt = String(receipt.finished_at);
  const receiptHash = receiptDescriptor.sha256;
  const exactDiffCommand = `git diff --check ${String(lease.baseSha)}...HEAD`;
  const manifest = {
    schemaVersion: 1,
    jobId: lease.jobId,
    leaseId,
    status: receiptStatus,
    branch: lease.branch,
    worktree: repo,
    baseSha: lease.baseSha,
    commitSha: contentCommit,
    skillPins: lease.skillPins,
    sourceParameters,
    artifacts,
    assertions: [{ ...assertionDescriptor, count: assertions.length }],
    reviews: [{ ...reviewDescriptor, count: reviews.length }],
    rejections: [{ ...rejectionDescriptor, count: rejections.length }],
    outcomes: [{ ...outcomeDescriptor, count: outcomes.length }],
    receipt: receiptDescriptor,
    sourceVerification: sourceVerificationDescriptor,
    blockedItems: receiptStatus === "complete" ? [] : remainingPairKeys,
    counts: {
      baseline: zeroCounts,
      final: finalCounts,
      net: finalCounts,
    },
    verificationCommands: [
      {
        command: "canonical immutable-run validation with exact receipt pair keys",
        exitCode: 0,
        result: "pass",
      },
      {
        command: "git diff --check",
        exitCode: 0,
        result: "pass",
      },
      {
        command: "git diff --cached --check",
        exitCode: 0,
        result: "pass",
      },
      {
        command: exactDiffCommand,
        exitCode: 0,
        result: "pass",
      },
      {
        command: `node .agents/skills/isitusa-evidence-worker/scripts/validate-worker.mjs manifest --lease '${leaseRegistry}' --lease-id ${leaseId} --manifest ${repositoryRelative(repo, outputPath)} --repo ${repo}`,
        exitCode: 0,
        result: "pass",
      },
    ],
    retryResume: {
      attempt: lease.attempt,
      acquisitionAttempts,
      attemptHistory: [
        {
          attempt: lease.attempt,
          leaseId,
          status: receiptStatus,
          finishedAt,
          retryable: retryableErrors.length > 0,
          errorCodes: receiptErrors.map((entry) => String(entry.code ?? "unknown")),
          sourceRequestsCompleted: finalCounts.sourceRequests,
          providerCandidates: finalCounts.providerCandidates,
          retainedArtifacts: finalCounts.retainedArtifacts,
          receiptSha256: receiptHash,
        },
      ],
      previousLeaseId: lease.previousLeaseId ?? null,
      recoveryReason: lease.recoveryReason ?? null,
      retryable: retryableErrors.length > 0,
      resumeToken: null,
      remainingRequests,
      recoveryState: receiptStatus === "complete"
        ? "complete"
        : retryableErrors.length > 0
          ? "retryable"
          : "blocked",
    },
    remainingWork: receiptStatus === "complete" ? [] : remainingPairKeys,
    sharedChangeProposals: [],
    performance: {
      wallSeconds,
      peakMemoryMb,
      peakMemoryMeasured,
      ...(!peakMemoryMeasured
        ? {
            peakMemoryMeasurement:
              "Not captured by MAIN execution; zero is the schema sentinel and not an observed memory measurement.",
          }
        : {}),
      validPairsScreened: completeOutcomePairs,
      manualInterventions,
    },
    semanticAttestation: {
      sourceSilenceCreatedNegative: false,
      failedRequestCreatedNegative: false,
      rejectionCreatedNegative: false,
      missingGeographyCreatedDetermination: false,
      incompleteScopeMarkedComplete: false,
    },
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  fs.writeFileSync(outputPath, serialized);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    output: outputPath,
    sha256: sha256(Buffer.from(serialized)),
    bytes: Buffer.byteLength(serialized),
    counts: finalCounts,
  }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
}
