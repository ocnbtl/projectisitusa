import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z } from "zod";

import { gbifPreservedSpecimensAdapter } from "./adapters/gbif-preserved-specimens";

import type { ResearchSourceAdapter } from "@/lib/research/source-adapter";
import type {
  ImmutableResearchRunReceipt,
  ResearchRunFileReference,
  ResearchSourceRegistry,
} from "@/lib/research/types";
import {
  listImmutableResearchRuns,
  sha256,
  stableJson,
} from "@/lib/research/run-files";
import {
  validateResearchRunInMemory,
  verifyStagedResearchRun,
} from "@/lib/research/validate-run";

type Candidate = {
  sourceId: string;
  speciesId: string;
  countyFips: string;
};

type CandidateFile = {
  candidates: Candidate[];
};

type Species = { id: string; scientificName: string };
type County = { countyFips: string; name: string; stateCode: string };

const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, "src/data/research");

type CommittedInputSnapshot = {
  commit: string;
  fileHashes: Map<string, string>;
};

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string[]>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${token}.`);
    }
    const key = token.slice(2);
    values.set(key, [...(values.get(key) ?? []), value]);
    index += 1;
  }

  const sourceId = values.get("source")?.at(-1) ?? "";
  const stateCode = values.get("state")?.at(-1) ?? "";
  const candidateLimit = Number(values.get("candidate-limit")?.at(-1) ?? 10);
  const pairs = (values.get("pairs") ?? [])
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
  const startedAt = values.get("started-at")?.at(-1);

  if (!sourceId) throw new Error("--source is required.");
  if (stateCode !== "AL") throw new Error("The current runner supports --state AL only.");
  if (!Number.isInteger(candidateLimit) || candidateLimit < 1 || candidateLimit > 100) {
    throw new Error("--candidate-limit must be an integer from 1 through 100.");
  }
  if (startedAt && Number.isNaN(Date.parse(startedAt))) {
    throw new Error("--started-at must be an ISO date-time when provided.");
  }

  return { sourceId, stateCode, candidateLimit, pairs, startedAt };
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function relativeGitPath(filepath: string) {
  return path.relative(ROOT, filepath).split(path.sep).join("/");
}

function captureCommittedInputSnapshot(filepaths: string[]): CommittedInputSnapshot {
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  if (status) {
    throw new Error(
      "Research acquisition requires a clean worktree. Commit or remove pending changes before running an adapter.",
    );
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const fileHashes = new Map<string, string>();
  for (const filepath of filepaths) {
    const relativePath = relativeGitPath(filepath);
    const current = readFileSync(filepath);
    const committed = execFileSync("git", ["show", `${commit}:${relativePath}`], {
      cwd: ROOT,
    });
    if (sha256(current) !== sha256(committed)) {
      throw new Error(`${relativePath} does not match acquisition commit ${commit}.`);
    }
    fileHashes.set(filepath, sha256(current));
  }
  return { commit, fileHashes };
}

function verifyCommittedInputSnapshot(snapshot: CommittedInputSnapshot) {
  const currentCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  if (currentCommit !== snapshot.commit) {
    throw new Error("Repository HEAD changed during research acquisition.");
  }
  const status = execFileSync(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim();
  if (status) {
    throw new Error("The worktree changed during research acquisition.");
  }
  for (const [filepath, expectedHash] of snapshot.fileHashes) {
    if (sha256(readFileSync(filepath)) !== expectedHash) {
      throw new Error(`${relativeGitPath(filepath)} changed during research acquisition.`);
    }
  }
}

function asNdjson(values: unknown[]) {
  return values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "\n";
}

function fileReference(
  relativePath: string,
  contents: string,
  mediaType: string,
): ResearchRunFileReference {
  return {
    path: relativePath,
    sha256: sha256(contents),
    bytes: Buffer.byteLength(contents),
    media_type: mediaType,
  };
}

function runTimestamp(value: string) {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function resolveAdapter(sourceId: string): ResearchSourceAdapter {
  if (sourceId === gbifPreservedSpecimensAdapter.sourceId) {
    return gbifPreservedSpecimensAdapter;
  }
  throw new Error(`No registered runner implementation exists for ${sourceId}.`);
}

function selectCandidates(
  sourceId: string,
  requestedPairKeys: string[],
  limit: number,
) {
  const candidates = readJson<CandidateFile>(
    path.join(RESEARCH_DIR, "migration-candidates.json"),
  ).candidates
    .filter((entry) => entry.sourceId === sourceId)
    .sort(
      (left, right) =>
        compareText(left.countyFips, right.countyFips) ||
        compareText(left.speciesId, right.speciesId),
    );
  const candidateByPair = new Map(
    candidates.map((entry) => [`${entry.countyFips}:${entry.speciesId}`, entry]),
  );

  if (requestedPairKeys.length) {
    return [...new Set(requestedPairKeys)].sort(compareText).map((pairKey) => {
      const candidate = candidateByPair.get(pairKey);
      if (!candidate) {
        throw new Error(`${pairKey} is not a deferred ${sourceId} candidate.`);
      }
      return candidate;
    });
  }

  const completedPairs = new Set(
    listImmutableResearchRuns(ROOT)
      .flatMap((bundle) => bundle.outcomes)
      .filter((outcome) => outcome.source_id === sourceId && outcome.scope_complete)
      .map((outcome) => `${outcome.county_fips}:${outcome.species_id}`),
  );
  const pending = candidates.filter(
    (entry) => !completedPairs.has(`${entry.countyFips}:${entry.speciesId}`),
  );
  const groupsBySpecies = new Map<string, Candidate[]>();
  for (const candidate of pending) {
    const values = groupsBySpecies.get(candidate.speciesId) ?? [];
    values.push(candidate);
    groupsBySpecies.set(candidate.speciesId, values);
  }
  const groups = [...groupsBySpecies.entries()].sort(
    ([leftSpecies, left], [rightSpecies, right]) =>
      right.length - left.length || compareText(leftSpecies, rightSpecies),
  );
  const selected: Candidate[] = [];
  for (const [, group] of groups) {
    if (selected.length + group.length > limit) continue;
    selected.push(...group);
    if (selected.length === limit) break;
  }
  if (selected.length === 0 && pending.length > 0) {
    return pending.slice(0, limit);
  }
  return selected.sort(
    (left, right) =>
      compareText(left.speciesId, right.speciesId) ||
      compareText(left.countyFips, right.countyFips),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const registryPath = path.join(RESEARCH_DIR, "source-registry.json");
  const registryText = readFileSync(registryPath, "utf8");
  const registry = JSON.parse(registryText) as ResearchSourceRegistry;
  const source = registry.sources.find((entry) => entry.id === options.sourceId);
  if (!source?.researchAdapter) {
    throw new Error(`${options.sourceId} has no registered research adapter.`);
  }
  const researchAdapter = source.researchAdapter;

  const adapter = resolveAdapter(options.sourceId);
  if (researchAdapter.id !== adapter.adapterId) {
    throw new Error(`Registry adapter ${researchAdapter.id} does not match ${adapter.adapterId}.`);
  }
  if (!researchAdapter.allowedVersions.includes(adapter.adapterVersion)) {
    throw new Error(`Adapter version ${adapter.adapterVersion} is not allowed for ${options.sourceId}.`);
  }
  const adapterPath = path.join(ROOT, researchAdapter.module);
  const parameterSchemaPath = path.join(ROOT, researchAdapter.parameterSchema);
  if (!existsSync(parameterSchemaPath)) {
    throw new Error(`Missing registered parameter schema ${researchAdapter.parameterSchema}.`);
  }
  const inputSnapshot = captureCommittedInputSnapshot([
    registryPath,
    adapterPath,
    parameterSchemaPath,
    path.join(ROOT, "scripts/research/run-source.ts"),
    path.join(ROOT, "src/lib/research/source-adapter.ts"),
    path.join(ROOT, "src/lib/research/run-files.ts"),
    path.join(ROOT, "src/lib/research/types.ts"),
    path.join(ROOT, "src/lib/research/validate-run.ts"),
  ]);

  const candidates = selectCandidates(
    options.sourceId,
    options.pairs,
    options.candidateLimit,
  );
  if (!candidates.length) {
    throw new Error(`No unreviewed ${options.sourceId} candidates remain in the requested scope.`);
  }

  const speciesById = new Map(
    readJson<Species[]>(path.join(ROOT, "src/data/generated/species.json"))
      .map((entry) => [entry.id, entry]),
  );
  const countyByFips = new Map(
    Object.values(
      readJson<Record<string, County>>(path.join(ROOT, "src/data/generated/counties.json")),
    )
      .filter((entry) => entry.stateCode === options.stateCode)
      .map((entry) => [entry.countyFips, entry]),
  );
  const requestedPairs = candidates.map((candidate) => {
    const species = speciesById.get(candidate.speciesId);
    const county = countyByFips.get(candidate.countyFips);
    if (!species) throw new Error(`Unknown candidate species ${candidate.speciesId}.`);
    if (!county) throw new Error(`Unknown candidate county ${candidate.countyFips}.`);
    return {
      countyFips: county.countyFips,
      countyName: county.name,
      speciesId: species.id,
      scientificName: species.scientificName,
    };
  });

  const parameters = {
    stateCode: options.stateCode,
    candidateLimit: requestedPairs.length,
    candidatePairs: requestedPairs.map((pair) => `${pair.countyFips}:${pair.speciesId}`),
    basisOfRecord: "PRESERVED_SPECIMEN",
    occurrenceStatus: "PRESENT",
    minimumMatchConfidence: 95,
    pageLimit: 300,
  };
  const parameterSchema = JSON.parse(readFileSync(parameterSchemaPath, "utf8")) as Parameters<
    typeof z.fromJSONSchema
  >[0];
  z.fromJSONSchema(parameterSchema).parse(parameters);
  const parameterHash = sha256(stableJson(parameters));
  const startedAt = options.startedAt
    ? new Date(options.startedAt).toISOString()
    : new Date().toISOString();
  const runId = `${runTimestamp(startedAt)}__${options.sourceId}__${parameterHash.slice(0, 12)}`;
  const finalDirectory = path.join(RESEARCH_DIR, "runs", runId);
  if (existsSync(finalDirectory)) {
    throw new Error(`Immutable run directory already exists: ${path.relative(ROOT, finalDirectory)}`);
  }

  const result = await adapter.run({
    runId,
    sourceId: options.sourceId,
    stateCode: options.stateCode,
    requestedPairs,
    runStartedAt: startedAt,
    parameters,
  });
  verifyCommittedInputSnapshot(inputSnapshot);
  const status: ImmutableResearchRunReceipt["status"] =
    result.outcomes.length === 0
      ? "failed"
      : result.errors.length === 0 && result.outcomes.every((outcome) => outcome.scope_complete)
        ? "complete"
        : "partial";

  const outputContents = new Map<string, { contents: string; mediaType: string }>([
    ["assertions.ndjson", { contents: asNdjson(result.assertions), mediaType: "application/x-ndjson" }],
    ["reviews.ndjson", { contents: asNdjson(result.reviews), mediaType: "application/x-ndjson" }],
    ["rejections.ndjson", { contents: asNdjson(result.rejections), mediaType: "application/x-ndjson" }],
    ["outcomes.ndjson", { contents: asNdjson(result.outcomes), mediaType: "application/x-ndjson" }],
  ]);
  const runRelativeDirectory = path.posix.join("src/data/research/runs", runId);
  const outputs = [...outputContents.entries()].map(([filename, value]) =>
    fileReference(
      path.posix.join(runRelativeDirectory, filename),
      value.contents,
      value.mediaType,
    ),
  );
  const artifacts = result.artifacts.map((artifact) => {
    if (path.basename(artifact.filename) !== artifact.filename) {
      throw new Error(`Unsafe artifact filename: ${artifact.filename}`);
    }
    return fileReference(
      path.posix.join(runRelativeDirectory, "artifacts", artifact.filename),
      artifact.contents,
      artifact.mediaType,
    );
  });

  const receipt: ImmutableResearchRunReceipt = {
    schemaVersion: 1,
    run_id: runId,
    status,
    started_at: startedAt,
    finished_at: result.completedAt,
    actor_type: "adapter",
    actor_id: `${adapter.adapterId}@${adapter.adapterVersion}`,
    source_id: options.sourceId,
    source_registry_hash: inputSnapshot.fileHashes.get(registryPath)!,
    adapter_id: adapter.adapterId,
    adapter_version: adapter.adapterVersion,
    adapter_code_hash: inputSnapshot.fileHashes.get(adapterPath)!,
    code_commit: inputSnapshot.commit,
    parameter_hash: parameterHash,
    parameters,
    requested_scope: {
      state_code: options.stateCode,
      county_fips: [...new Set(requestedPairs.map((pair) => pair.countyFips))].sort(compareText),
      species_ids: [...new Set(requestedPairs.map((pair) => pair.speciesId))].sort(compareText),
      pair_keys: parameters.candidatePairs,
      date_range: { start: null, end: null },
    },
    upstream_requests: result.upstreamRequests.map((request) => ({
      url: request.url,
      status: request.status,
      retrieved_at: request.retrievedAt,
      record_count: request.recordCount,
    })),
    artifacts,
    outputs,
    counts: {
      requested_pairs: requestedPairs.length,
      candidate_records: result.candidateRecordCount,
      assertion_events: result.assertions.length,
      review_events: result.reviews.length,
      rejection_records: result.rejections.length,
      duplicate_records: result.duplicateRecordCount,
      error_count: result.errors.length,
      pair_outcomes: result.outcomes.length,
    },
    errors: result.errors,
    known_caveats: [source.caveat],
    source_warnings: result.warnings,
    deviations: [],
    rerun_command: `npm run research:run -- --source ${options.sourceId} --state ${options.stateCode} --pairs ${parameters.candidatePairs.join(",")}`,
  };

  validateResearchRunInMemory({
    root: ROOT,
    sourceId: options.sourceId,
    source,
    stateCode: options.stateCode,
    runId,
    requestedPairKeys: parameters.candidatePairs,
    result,
    receipt,
    outputContents: new Map(
      [...outputContents.entries()].map(([filename, value]) => [filename, value.contents]),
    ),
  });

  mkdirSync(path.dirname(finalDirectory), { recursive: true });
  const temporaryDirectory = mkdtempSync(
    path.join(path.dirname(finalDirectory), ".pending-research-run-"),
  );
  try {
    mkdirSync(path.join(temporaryDirectory, "artifacts"), { recursive: true });
    for (const [filename, value] of outputContents) {
      writeFileSync(path.join(temporaryDirectory, filename), value.contents);
    }
    for (const artifact of result.artifacts) {
      writeFileSync(path.join(temporaryDirectory, "artifacts", artifact.filename), artifact.contents);
    }
    writeFileSync(
      path.join(temporaryDirectory, "receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );
    verifyStagedResearchRun(temporaryDirectory, receipt);
    const stagedReceipt = JSON.parse(
      readFileSync(path.join(temporaryDirectory, "receipt.json"), "utf8"),
    ) as ImmutableResearchRunReceipt;
    if (stableJson(stagedReceipt) !== stableJson(receipt)) {
      throw new Error("Staged receipt bytes do not reproduce the validated receipt.");
    }
    renameSync(temporaryDirectory, finalDirectory);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log(JSON.stringify({ directory: path.relative(ROOT, finalDirectory), ...receipt.counts, status }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
