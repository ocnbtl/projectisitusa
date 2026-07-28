import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  realpathSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

import type {
  EvidenceReviewEvent,
  ImmutableResearchRunBundle,
  ImmutableResearchRunReceipt,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  ResearchRunFileReference,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertRunStartNotFuture(
  startedAt: string,
  now = new Date(),
) {
  const startedAtMilliseconds = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMilliseconds)) {
    throw new Error(`Invalid research run start time: ${startedAt}.`);
  }
  if (startedAtMilliseconds > now.getTime()) {
    throw new Error(
      `Research run start time ${startedAt} is later than the current host time ${now.toISOString()}.`,
    );
  }
}

function compareCodePoints(left: string, right: string): number {
  const leftCodePoints = Array.from(left, (character) =>
    character.codePointAt(0)!,
  );
  const rightCodePoints = Array.from(right, (character) =>
    character.codePointAt(0)!,
  );
  const sharedLength = Math.min(leftCodePoints.length, rightCodePoints.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const difference = leftCodePoints[index] - rightCodePoints[index];
    if (difference !== 0) {
      return difference;
    }
  }

  return leftCodePoints.length - rightCodePoints.length;
}

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCodePoints(left, right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(`Cannot serialize ${typeof value} as stable JSON.`);
  }
  return serialized;
}

export function readNdjson<T>(filepath: string): T[] {
  if (!existsSync(filepath)) {
    throw new Error(`Missing NDJSON file: ${filepath}`);
  }

  return parseNdjson<T>(readFileSync(filepath, "utf8"), filepath);
}

function parseNdjson<T>(contents: string | Buffer, filepath: string): T[] {
  return contents
    .toString()
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Invalid NDJSON in ${filepath} at non-empty line ${index + 1}: ${detail}`,
        );
      }
    });
}

function isWithin(parent: string, candidate: string): boolean {
  const relative = path.relative(parent, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
}

function validateRelativeReference(referencePath: string): void {
  if (!referencePath || referencePath.includes("\0")) {
    throw new Error("Run file reference path must be a non-empty safe path.");
  }
  if (
    path.posix.isAbsolute(referencePath) ||
    path.win32.isAbsolute(referencePath)
  ) {
    throw new Error(`Run file reference must be relative: ${referencePath}`);
  }
  if (referencePath.split(/[\\/]/u).includes("..")) {
    throw new Error(`Run file reference cannot contain '..': ${referencePath}`);
  }
}

function resolveRunFile(
  repositoryRoot: string,
  runDirectory: string,
  referencePath: string,
): string {
  validateRelativeReference(referencePath);

  const absoluteRepositoryRoot = path.resolve(repositoryRoot);
  const absoluteRunDirectory = path.resolve(runDirectory);
  if (!isWithin(absoluteRepositoryRoot, absoluteRunDirectory)) {
    throw new Error(
      `Research run directory is outside the repository: ${runDirectory}`,
    );
  }

  const filepath = path.resolve(absoluteRepositoryRoot, referencePath);
  if (
    !isWithin(absoluteRepositoryRoot, filepath) ||
    !isWithin(absoluteRunDirectory, filepath) ||
    filepath === absoluteRunDirectory
  ) {
    throw new Error(
      `Run file reference escapes its immutable run directory: ${referencePath}`,
    );
  }

  return filepath;
}

function canonicalRunRelativePath(
  repositoryRoot: string,
  runDirectory: string,
  referencePath: string,
): string {
  return path
    .relative(
      path.resolve(runDirectory),
      resolveRunFile(repositoryRoot, runDirectory, referencePath),
    )
    .split(path.sep)
    .join("/");
}

export function fileReference(
  repositoryRoot: string,
  filepath: string,
  mediaType: string,
): ResearchRunFileReference {
  const absoluteFilepath = path.resolve(filepath);
  if (!isWithin(path.resolve(repositoryRoot), absoluteFilepath)) {
    throw new Error(
      `Cannot reference a file outside the repository: ${filepath}`,
    );
  }
  const contents = readFileSync(filepath);
  return {
    path: path
      .relative(repositoryRoot, absoluteFilepath)
      .split(path.sep)
      .join("/"),
    sha256: sha256(contents),
    bytes: contents.length,
    media_type: mediaType,
  };
}

export function verifyFileReference(
  repositoryRoot: string,
  runDirectory: string,
  reference: ResearchRunFileReference,
): Buffer {
  const filepath = resolveRunFile(
    repositoryRoot,
    runDirectory,
    reference.path,
  );
  if (!existsSync(filepath)) {
    throw new Error(`Missing run file: ${reference.path}`);
  }

  const realRepositoryRoot = realpathSync(repositoryRoot);
  const realRunDirectory = realpathSync(runDirectory);
  const realFilepath = realpathSync(filepath);
  if (
    !isWithin(realRepositoryRoot, realRunDirectory) ||
    !isWithin(realRepositoryRoot, realFilepath) ||
    !isWithin(realRunDirectory, realFilepath) ||
    realFilepath === realRunDirectory
  ) {
    throw new Error(
      `Run file reference resolves outside its immutable run directory: ${reference.path}`,
    );
  }

  const linkStats = lstatSync(filepath);
  if (!linkStats.isFile() || linkStats.isSymbolicLink()) {
    throw new Error(`Run file reference is not a regular non-symlink file: ${reference.path}`);
  }
  const stats = statSync(filepath);
  if (stats.size !== reference.bytes) {
    throw new Error(`Run file byte count changed: ${reference.path}`);
  }
  const contents = readFileSync(filepath);
  const actualHash = sha256(contents);
  if (actualHash !== reference.sha256) {
    throw new Error(`Run file hash changed: ${reference.path}`);
  }
  return contents;
}

const CONVENTIONAL_RUN_OUTPUTS = [
  "assertions.ndjson",
  "reviews.ndjson",
  "rejections.ndjson",
  "outcomes.ndjson",
] as const;

function assertRunIds(
  runId: string,
  label: string,
  records: Array<{ run_id: string }>,
): void {
  records.forEach((record, index) => {
    if (record.run_id !== runId) {
      throw new Error(
        `Research run ${runId} has a run_id mismatch in ${label} record ${index + 1}: ${record.run_id}.`,
      );
    }
  });
}

function assertReceiptCount(
  runId: string,
  label: string,
  declared: number,
  actual: number,
): void {
  if (declared !== actual) {
    throw new Error(
      `Research run ${runId} declares ${declared} ${label}, but ${actual} were parsed.`,
    );
  }
}

export function loadImmutableResearchRun(
  root: string,
  runDirectory: string,
): ImmutableResearchRunBundle {
  const absoluteDirectory = path.resolve(runDirectory);
  const directory = path.basename(absoluteDirectory);
  const receiptPath = path.join(absoluteDirectory, "receipt.json");
  if (!existsSync(receiptPath)) {
    throw new Error(`Research run ${directory} is missing receipt.json.`);
  }
  const receiptStats = lstatSync(receiptPath);
  if (!receiptStats.isFile() || receiptStats.isSymbolicLink()) {
    throw new Error(`Research run ${directory} receipt is not a regular non-symlink file.`);
  }
  const receipt = JSON.parse(
    readFileSync(receiptPath, "utf8"),
  ) as ImmutableResearchRunReceipt;
  if (receipt.run_id !== directory) {
    throw new Error(
      `Research run directory ${directory} does not match receipt ${receipt.run_id}.`,
    );
  }

  if (!Array.isArray(receipt.artifacts) || !Array.isArray(receipt.outputs)) {
    throw new Error(
      `Research run ${directory} receipt must declare artifacts and outputs arrays.`,
    );
  }

  const verifiedFiles = new Map<string, Buffer>();
  const declaredPaths = new Set<string>();
  for (const [kind, references] of [
    ["artifact", receipt.artifacts],
    ["output", receipt.outputs],
  ] as const) {
    for (const reference of references) {
      const relativePath = canonicalRunRelativePath(
        root,
        absoluteDirectory,
        reference.path,
      );
      if (declaredPaths.has(relativePath)) {
        throw new Error(
          `Research run ${directory} declares the same file more than once: ${relativePath}.`,
        );
      }
      declaredPaths.add(relativePath);
      verifiedFiles.set(
        relativePath,
        verifyFileReference(root, absoluteDirectory, reference),
      );

      if (
        kind === "artifact" &&
        CONVENTIONAL_RUN_OUTPUTS.includes(
          relativePath as (typeof CONVENTIONAL_RUN_OUTPUTS)[number],
        )
      ) {
        throw new Error(
          `Research run ${directory} declares conventional output ${relativePath} as an artifact.`,
        );
      }
    }
  }

  const declaredOutputPaths = new Set(
    receipt.outputs.map((reference) =>
      canonicalRunRelativePath(root, absoluteDirectory, reference.path),
    ),
  );
  for (const filename of CONVENTIONAL_RUN_OUTPUTS) {
    const conventionalPath = path.join(absoluteDirectory, filename);
    if (!existsSync(conventionalPath)) {
      throw new Error(
        `Research run ${directory} is missing conventional output ${filename}.`,
      );
    }
    if (!declaredOutputPaths.has(filename)) {
      throw new Error(
        `Research run ${directory} does not declare conventional output ${filename}.`,
      );
    }
  }

  const assertions = parseNdjson<RunEvidenceAssertionEvent>(
    verifiedFiles.get("assertions.ndjson")!,
    path.join(absoluteDirectory, "assertions.ndjson"),
  );
  const reviews = parseNdjson<EvidenceReviewEvent>(
    verifiedFiles.get("reviews.ndjson")!,
    path.join(absoluteDirectory, "reviews.ndjson"),
  );
  const rejections = parseNdjson<ResearchRejectionRecord>(
    verifiedFiles.get("rejections.ndjson")!,
    path.join(absoluteDirectory, "rejections.ndjson"),
  );
  const outcomes = parseNdjson<ResearchPairOutcome>(
    verifiedFiles.get("outcomes.ndjson")!,
    path.join(absoluteDirectory, "outcomes.ndjson"),
  );

  assertRunIds(directory, "assertions.ndjson", assertions);
  assertRunIds(directory, "reviews.ndjson", reviews);
  assertRunIds(directory, "rejections.ndjson", rejections);
  assertRunIds(directory, "outcomes.ndjson", outcomes);
  assertReceiptCount(
    directory,
    "assertion events",
    receipt.counts.assertion_events,
    assertions.length,
  );
  assertReceiptCount(
    directory,
    "review events",
    receipt.counts.review_events,
    reviews.length,
  );
  assertReceiptCount(
    directory,
    "rejection records",
    receipt.counts.rejection_records,
    rejections.length,
  );
  assertReceiptCount(
    directory,
    "pair outcomes",
    receipt.counts.pair_outcomes,
    outcomes.length,
  );

  return {
    directory: absoluteDirectory,
    receipt,
    assertions,
    reviews,
    rejections,
    outcomes,
  };
}

export function listImmutableResearchRuns(root: string): ImmutableResearchRunBundle[] {
  const runsDirectory = path.join(root, "src/data/research/runs");
  if (!existsSync(runsDirectory)) {
    return [];
  }

  return readdirSync(runsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".pending-research-run-"))
    .map((entry) => entry.name)
    .sort(compareCodePoints)
    .map((directory) => loadImmutableResearchRun(root, path.join(runsDirectory, directory)));
}
