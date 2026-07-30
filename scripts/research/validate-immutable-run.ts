import { readFileSync } from "node:fs";
import path from "node:path";

import { validateImmutableResearchRunDirectory } from "@/lib/research/validate-run";

function parseArgs(values: string[]) {
  const result = new Map<string, string>();
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key?.startsWith("--")) {
      throw new Error(`Unexpected argument: ${key ?? "<missing>"}`);
    }
    const value = values[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${key} requires a value.`);
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

function pairKeysFromArgs(args: Map<string, string>) {
  const readFromStdin = args.get("pair-keys-stdin");
  if (readFromStdin !== undefined) {
    if (readFromStdin !== "true") {
      throw new Error("--pair-keys-stdin must be true when supplied.");
    }
    const value: unknown = JSON.parse(readFileSync(0, "utf8"));
    if (
      !Array.isArray(value)
      || value.length === 0
      || value.some((entry) => typeof entry !== "string" || entry.length === 0)
    ) {
      throw new Error("Standard-input pair keys must be a nonempty JSON string array.");
    }
    return value as string[];
  }
  return required(args, "pair-keys").split(",").filter(Boolean);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const repositoryRoot = path.resolve(required(args, "repository-root"));
  const validationRoot = path.resolve(required(args, "validation-root"));
  const runDirectory = path.resolve(required(args, "run-directory"));
  const sourceVerificationPath = path.resolve(
    required(args, "source-verification"),
  );
  const pairKeys = pairKeysFromArgs(args);
  const bundle = validateImmutableResearchRunDirectory({
    repositoryRoot,
    validationRoot,
    runDirectory,
    sourceVerificationPath,
    expected: {
      runId: required(args, "run-id"),
      sourceId: required(args, "source-id"),
      stateCode: required(args, "state-code"),
      pairKeys,
      codeCommit: required(args, "code-commit"),
      workerTaskId: required(args, "worker-task-id"),
    },
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    runId: bundle.receipt.run_id,
    sourceId: bundle.receipt.source_id,
    stateCode: bundle.receipt.requested_scope.state_code,
    pairCount: bundle.receipt.requested_scope.pair_keys.length,
    artifactCount: bundle.receipt.artifacts.length,
    outputCount: bundle.receipt.outputs.length,
    counts: bundle.receipt.counts,
  }, null, 2)}\n`);
} catch (error) {
  process.stdout.write(`${JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2)}\n`);
  process.exitCode = 1;
}
