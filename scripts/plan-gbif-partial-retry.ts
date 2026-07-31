import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type {
  ImmutableResearchRunReceipt,
  ResearchPairOutcome,
} from "@/lib/research/types";
import {
  listImmutableResearchRuns,
  sha256,
} from "@/lib/research/run-files";

const SOURCE_ID = "gbif-preserved-specimens";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function argumentValue(args: string[], name: string) {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
}

function requiredArgument(args: string[], name: string) {
  const value = argumentValue(args, name);
  if (!value) throw new Error(`--${name} is required.`);
  return value;
}

function readGitObject(
  root: string,
  commit: string,
  filepath: string,
): Buffer {
  assert(
    /^[a-f0-9]{40}$/u.test(commit),
    "Archive commit must be a full Git SHA.",
  );
  assert(
    filepath.length > 0 &&
      !path.posix.isAbsolute(filepath) &&
      !path.win32.isAbsolute(filepath) &&
      !filepath.split(/[\\/]/u).includes(".."),
    `Unsafe archived path ${filepath}.`,
  );
  return execFileSync(
    "git",
    ["-C", root, "show", `${commit}:${filepath}`],
    { maxBuffer: 64 * 1024 * 1024 },
  );
}

export function buildGbifPartialRetry(input: {
  root: string;
  archiveCommit: string;
  archiveRunId: string;
  batchId: string;
  outputPath: string;
}) {
  assert(
    /^[0-9]{8}T[0-9]{6}Z__gbif-preserved-specimens__[a-f0-9]{12}$/u.test(
      input.archiveRunId,
    ),
    "Archive run ID is invalid.",
  );
  assert(
    /^[a-z0-9][a-z0-9-]*$/u.test(input.batchId),
    "Batch ID is invalid.",
  );
  assert(
    input.outputPath.startsWith(`${input.root}${path.sep}`),
    "Output must remain inside the repository.",
  );

  const runRoot = `src/data/research/runs/${input.archiveRunId}`;
  const receiptBytes = readGitObject(
    input.root,
    input.archiveCommit,
    `${runRoot}/receipt.json`,
  );
  const receipt = JSON.parse(
    receiptBytes.toString("utf8"),
  ) as ImmutableResearchRunReceipt;
  assert(
    receipt.run_id === input.archiveRunId &&
      receipt.source_id === SOURCE_ID &&
      /^[A-Z]{2}$/u.test(receipt.requested_scope.state_code),
    "Archived receipt identity is invalid.",
  );

  const outcomesReference = receipt.outputs.find(
    (reference) => path.posix.basename(reference.path) === "outcomes.ndjson",
  );
  assert(outcomesReference, "Archived receipt lacks outcomes.ndjson.");
  const outcomesBytes = readGitObject(
    input.root,
    input.archiveCommit,
    outcomesReference.path,
  );
  assert(
    outcomesBytes.length === outcomesReference.bytes &&
      sha256(outcomesBytes) === outcomesReference.sha256,
    "Archived outcome bytes differ from their receipt descriptor.",
  );
  const outcomes = outcomesBytes
    .toString("utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ResearchPairOutcome);
  const archivedIncomplete = outcomes.filter(
    (outcome) => !outcome.scope_complete,
  );
  const completedPairKeys = new Set(
    listImmutableResearchRuns(input.root)
      .flatMap((bundle) => bundle.outcomes)
      .filter(
        (outcome) =>
          outcome.source_id === SOURCE_ID &&
          outcome.state_code === receipt.requested_scope.state_code &&
          outcome.scope_complete,
      )
      .map(
        (outcome) => `${outcome.county_fips}:${outcome.species_id}`,
      ),
  );
  const incomplete = archivedIncomplete
    .filter(
      (outcome) =>
        !completedPairKeys.has(
          `${outcome.county_fips}:${outcome.species_id}`,
        ),
    )
    .sort(
      (left, right) =>
        compareText(left.species_id, right.species_id) ||
        compareText(left.county_fips, right.county_fips),
    );
  assert(incomplete.length > 0, "Archived run has no incomplete outcomes.");
  assert(
    incomplete.every(
      (outcome) =>
        outcome.source_id === SOURCE_ID &&
        outcome.state_code === receipt.requested_scope.state_code &&
        /^[0-9]{5}$/u.test(outcome.county_fips) &&
        outcome.species_id.length > 0,
    ),
    "Archived incomplete outcome scope is invalid.",
  );
  const pairKeys = incomplete.map(
    (outcome) => `${outcome.county_fips}:${outcome.species_id}`,
  );
  assert(
    new Set(pairKeys).size === pairKeys.length,
    "Archived incomplete outcomes contain duplicate pairs.",
  );

  const value = {
    schemaVersion: 1,
    stateCode: receipt.requested_scope.state_code,
    batchId: input.batchId,
    candidateCount: incomplete.length,
    recoveryFrom: {
      archiveCommit: input.archiveCommit,
      archiveRunId: input.archiveRunId,
      receiptSha256: sha256(receiptBytes),
      outcomesSha256: sha256(outcomesBytes),
      originalRequestedPairCount: outcomes.length,
      originalCompletePairCount: outcomes.length - incomplete.length,
      originalIncompletePairCount: archivedIncomplete.length,
      preventedAlreadyCompletePairCount:
        archivedIncomplete.length - incomplete.length,
    },
    candidates: incomplete.map((outcome) => ({
      sourceId: SOURCE_ID,
      speciesId: outcome.species_id,
      countyFips: outcome.county_fips,
    })),
  };
  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true });
  fs.writeFileSync(
    input.outputPath,
    `${JSON.stringify(value, null, 2)}\n`,
  );
  return value;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const args = process.argv.slice(2);
  const root = process.cwd();
  const result = buildGbifPartialRetry({
    root,
    archiveCommit: requiredArgument(args, "archive-commit"),
    archiveRunId: requiredArgument(args, "archive-run-id"),
    batchId: requiredArgument(args, "batch-id"),
    outputPath: path.resolve(requiredArgument(args, "output")),
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        output: path.relative(root, path.resolve(requiredArgument(args, "output"))),
        stateCode: result.stateCode,
        candidateCount: result.candidateCount,
        recoveryFrom: result.recoveryFrom,
      },
      null,
      2,
    )}\n`,
  );
}
