import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  APPROVAL_ARTIFACT_PATH,
  APPROVAL_ARTIFACT_SHA256,
  APPROVAL_RECEIPT_PATH,
  OFFICIAL_ERADICATION_ADAPTER_ID,
  OFFICIAL_ERADICATION_ADAPTER_VERSION,
  OFFICIAL_ERADICATION_BATCH_ID,
  officialEradicationAdapter,
} from "./adapters/official-eradication-determination";
import {
  asNdjson,
  captureCommittedInputSnapshot,
  compareText,
  relativeGitPath,
  runFileReference,
  runTimestamp,
  verifyCommittedInputSnapshot,
} from "./national-usgs-nas-common";

import { listCountyEquivalents } from "@/lib/research/geography-registry";
import {
  loadImmutableResearchRun,
  sha256,
  stableJson,
} from "@/lib/research/run-files";
import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import type {
  ImmutableResearchRunReceipt,
  ResearchSourceRegistry,
} from "@/lib/research/types";
import {
  validateResearchRunInMemory,
  verifyStagedResearchRun,
} from "@/lib/research/validate-run";

const ROOT = process.cwd();
const RESEARCH_DIR = path.join(ROOT, "src/data/research");
const RUNS_ROOT = path.join(RESEARCH_DIR, "runs");
const PARAMETER_SCHEMA_PATH = path.join(
  RESEARCH_DIR,
  "schemas/official-eradication-determination-parameters.schema.json",
);
const ADAPTER_PATH = path.join(
  ROOT,
  "scripts/research/adapters/official-eradication-determination.ts",
);
const SCRIPT_PATH = path.join(
  ROOT,
  "scripts/research/run-approved-jurisdiction-eradication-batch.ts",
);

type ApprovalReceipt = {
  status: "human-approved";
  actorId: "Ocean";
  recordedAt: string;
  approvedArtifact: { path: string; sha256: string };
};

type Species = { id: string; scientificName: string };

type RunSpec = {
  sourceId: string;
  stateCode: string;
  speciesId: string;
  parentJurisdictionEvidenceId: string | null;
  countyFips: string[];
  historicalOccurrencePairKeys: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function parseArguments(argv: string[]) {
  assert(argv.length === 2 && argv[0] === "--recorded-at", "Use --recorded-at <ISO date-time>.");
  const milliseconds = Date.parse(argv[1]!);
  assert(Number.isFinite(milliseconds), "--recorded-at must be an ISO date-time.");
  assert(milliseconds <= Date.now(), "--recorded-at cannot be in the future.");
  return { recordedAt: new Date(milliseconds).toISOString() };
}

function directoryContents(directory: string, prefix = "") {
  const contents = new Map<string, string>();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const [filename, value] of directoryContents(absolute, relative)) {
        contents.set(filename, value);
      }
    } else {
      contents.set(relative, readFileSync(absolute, "utf8"));
    }
  }
  return contents;
}

function exactFileSet(directory: string, expected: string[]) {
  const actual = [...directoryContents(directory).keys()].sort(compareText);
  assert(stableJson(actual) === stableJson([...expected].sort(compareText)), `Staged eradication run file set differs: ${actual.join(", ")}.`);
}

function buildSpecs() {
  const vespaSpecs = [
    ...new Set(
      readJson<{ jurisdictions: Array<{ stateCode: string; nationalV1Scope: boolean }> }>(
        path.join(RESEARCH_DIR, "state-registry.json"),
      ).jurisdictions
        .filter((state) => state.nationalV1Scope)
        .map((state) => state.stateCode),
    ),
  ].sort(compareText).map((stateCode) => ({
    sourceId: "aphis-northern-giant-hornet-eradication-2024",
    stateCode,
    speciesId: "vespa-mandarinia",
    parentJurisdictionEvidenceId: "vespa-mandarinia-us-officially-eradicated-2024",
    countyFips: listCountyEquivalents(stateCode).map((county) => county.countyFips).sort(compareText),
    historicalOccurrencePairKeys: [],
  } satisfies RunSpec));
  const additional: RunSpec[] = [
    {
      sourceId: "wsda-northern-giant-hornet-eradication-2024",
      stateCode: "WA",
      speciesId: "vespa-mandarinia",
      parentJurisdictionEvidenceId: null,
      countyFips: ["53073"],
      historicalOccurrencePairKeys: ["53073:vespa-mandarinia"],
    },
    {
      sourceId: "aphis-asian-longhorned-beetle-program-update-2026",
      stateCode: "NJ",
      speciesId: "asian-longhorned-beetle",
      parentJurisdictionEvidenceId: "asian-longhorned-beetle-nj-officially-eradicated-2013",
      countyFips: ["34017", "34023", "34039"],
      historicalOccurrencePairKeys: [],
    },
    {
      sourceId: "njdep-asian-longhorned-beetle-eradication-current",
      stateCode: "NJ",
      speciesId: "asian-longhorned-beetle",
      parentJurisdictionEvidenceId: null,
      countyFips: ["34017", "34023", "34039"],
      historicalOccurrencePairKeys: [
        "34017:asian-longhorned-beetle",
        "34023:asian-longhorned-beetle",
        "34039:asian-longhorned-beetle",
      ],
    },
  ];
  return [...vespaSpecs, ...additional].sort(
    (left, right) =>
      compareText(left.sourceId, right.sourceId) ||
      compareText(left.stateCode, right.stateCode),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const approvalRequestPath = path.join(ROOT, APPROVAL_ARTIFACT_PATH);
  const approvalReceiptPath = path.join(ROOT, APPROVAL_RECEIPT_PATH);
  const registryPath = path.join(RESEARCH_DIR, "source-registry.json");
  const jurisdictionRegistryPath = path.join(RESEARCH_DIR, "jurisdiction-evidence-registry.json");
  const countyRegistryPath = path.join(RESEARCH_DIR, "county-equivalent-registry.json");
  const stateRegistryPath = path.join(RESEARCH_DIR, "state-registry.json");
  const speciesPath = path.join(ROOT, "src/data/generated/species.json");
  const approvalReceiptBytes = readFileSync(approvalReceiptPath);
  const approvalReceiptSha256 = sha256(approvalReceiptBytes);
  const approvalReceipt = JSON.parse(approvalReceiptBytes.toString("utf8")) as ApprovalReceipt;
  assert(sha256(readFileSync(approvalRequestPath)) === APPROVAL_ARTIFACT_SHA256, "Approved request artifact hash changed.");
  assert(approvalReceipt.status === "human-approved" && approvalReceipt.actorId === "Ocean", "Approval receipt is not the expected human approval.");
  assert(approvalReceipt.approvedArtifact.path === APPROVAL_ARTIFACT_PATH && approvalReceipt.approvedArtifact.sha256 === APPROVAL_ARTIFACT_SHA256, "Approval receipt references another artifact.");
  assert(approvalReceipt.recordedAt === options.recordedAt, "Recorded batch time differs from the approval receipt.");
  const inputPaths = [
    approvalRequestPath,
    approvalReceiptPath,
    registryPath,
    jurisdictionRegistryPath,
    countyRegistryPath,
    stateRegistryPath,
    speciesPath,
    PARAMETER_SCHEMA_PATH,
    ADAPTER_PATH,
    SCRIPT_PATH,
    path.join(ROOT, "src/data/research/schemas/evidence-assertion.schema.json"),
    path.join(ROOT, "src/data/research/schemas/review-event.schema.json"),
    path.join(ROOT, "src/data/research/schemas/pair-outcome.schema.json"),
    path.join(ROOT, "src/data/research/schemas/rejection-record.schema.json"),
    path.join(ROOT, "src/data/research/schemas/run-receipt.schema.json"),
    path.join(ROOT, "src/lib/research/source-adapter.ts"),
    path.join(ROOT, "src/lib/research/run-files.ts"),
    path.join(ROOT, "src/lib/research/types.ts"),
    path.join(ROOT, "src/lib/research/validate-run.ts"),
    path.join(ROOT, "src/lib/research/geography-registry.ts"),
    path.join(ROOT, "src/lib/research/jurisdiction-evidence.ts"),
  ];
  const snapshot = captureCommittedInputSnapshot(ROOT, inputPaths);
  const registry = readJson<ResearchSourceRegistry>(registryPath);
  const parameterSchema = readJson<Parameters<typeof z.fromJSONSchema>[0]>(PARAMETER_SCHEMA_PATH);
  const parameterValidator = z.fromJSONSchema(parameterSchema);
  const speciesById = new Map(readJson<Species[]>(speciesPath).map((species) => [species.id, species]));
  const specs = buildSpecs();
  assert(specs.length === 54, `Expected 54 state-scoped runs, found ${specs.length}.`);
  const cacheRoot = path.join(ROOT, ".cache/research/jurisdiction-eradication-batch", snapshot.commit);
  rmSync(cacheRoot, { recursive: true, force: true });
  mkdirSync(cacheRoot, { recursive: true });
  const sourceRegistryHash = snapshot.fileHashes.get(registryPath)!;
  const adapterCodeHash = snapshot.fileHashes.get(ADAPTER_PATH)!;
  const scriptHash = snapshot.fileHashes.get(SCRIPT_PATH)!;
  const generated: Array<{
    runId: string;
    finalDirectory: string;
    stagedDirectory: string;
    receipt: ImmutableResearchRunReceipt;
    contents: Map<string, string>;
  }> = [];

  for (const spec of specs) {
    const source = registry.sources.find((entry) => entry.id === spec.sourceId);
    assert(source?.researchAdapter, `Missing registered adapter for ${spec.sourceId}.`);
    assert(source.researchAdapter.id === OFFICIAL_ERADICATION_ADAPTER_ID, `Registered adapter differs for ${spec.sourceId}.`);
    assert(source.researchAdapter.allowedVersions.includes(OFFICIAL_ERADICATION_ADAPTER_VERSION), `Adapter version is not registered for ${spec.sourceId}.`);
    const species = speciesById.get(spec.speciesId);
    assert(species, `Unknown species ${spec.speciesId}.`);
    const counties = new Map(listCountyEquivalents(spec.stateCode).map((county) => [county.countyFips, county]));
    const requestedPairs = spec.countyFips.map((countyFips) => {
      const county = counties.get(countyFips);
      assert(county, `Unknown ${spec.stateCode} county ${countyFips}.`);
      return {
        countyFips,
        countyName: county.legalName,
        speciesId: species.id,
        scientificName: species.scientificName,
      };
    });
    const candidatePairs = requestedPairs.map((pair) => `${pair.countyFips}:${pair.speciesId}`);
    const parameters = {
      stateCode: spec.stateCode,
      mode: "human-approved-official-eradication",
      batchId: OFFICIAL_ERADICATION_BATCH_ID,
      approvalArtifactPath: APPROVAL_ARTIFACT_PATH,
      approvalArtifactSha256: APPROVAL_ARTIFACT_SHA256,
      approvalReceiptPath: APPROVAL_RECEIPT_PATH,
      approvalReceiptSha256,
      sourceDocumentId: spec.sourceId,
      parentJurisdictionEvidenceId: spec.parentJurisdictionEvidenceId,
      candidateLimit: candidatePairs.length,
      candidatePairs,
      historicalOccurrencePairKeys: spec.historicalOccurrencePairKeys,
      humanReviewActorId: "Ocean",
      humanReviewTimestamp: options.recordedAt,
    };
    parameterValidator.parse(parameters);
    const parameterHash = sha256(stableJson(parameters));
    const runIdentityHash = sha256(stableJson({ parameterHash, adapterCodeHash, scriptHash }));
    const runId = `${runTimestamp(options.recordedAt)}__${spec.sourceId}__${runIdentityHash.slice(0, 12)}`;
    const finalDirectory = path.join(RUNS_ROOT, runId);
    const stagedDirectory = path.join(cacheRoot, runId);
    const adapter = officialEradicationAdapter(spec.sourceId);
    const result = await adapter.run({
      runId,
      sourceId: spec.sourceId,
      stateCode: spec.stateCode,
      requestedPairs,
      runStartedAt: options.recordedAt,
      parameters,
    });
    const outputContents = new Map<string, { contents: string; mediaType: string }>([
      ["assertions.ndjson", { contents: asNdjson(result.assertions), mediaType: "application/x-ndjson" }],
      ["reviews.ndjson", { contents: asNdjson(result.reviews), mediaType: "application/x-ndjson" }],
      ["rejections.ndjson", { contents: asNdjson(result.rejections), mediaType: "application/x-ndjson" }],
      ["outcomes.ndjson", { contents: asNdjson(result.outcomes), mediaType: "application/x-ndjson" }],
    ]);
    const runRelativeDirectory = relativeGitPath(ROOT, finalDirectory);
    const outputs = [...outputContents.entries()].map(([filename, value]) =>
      runFileReference(path.posix.join(runRelativeDirectory, filename), value.contents, value.mediaType),
    );
    const artifacts = result.artifacts.map((artifact) =>
      runFileReference(
        path.posix.join(runRelativeDirectory, "artifacts", artifact.filename),
        Buffer.isBuffer(artifact.contents)
          ? artifact.contents.toString("utf8")
          : artifact.contents,
        artifact.mediaType,
      ),
    );
    const receipt: ImmutableResearchRunReceipt = {
      schemaVersion: 1,
      run_id: runId,
      status: "complete",
      started_at: options.recordedAt,
      finished_at: result.completedAt,
      actor_type: "adapter",
      actor_id: `${OFFICIAL_ERADICATION_ADAPTER_ID}@${OFFICIAL_ERADICATION_ADAPTER_VERSION}`,
      source_id: spec.sourceId,
      source_registry_hash: sourceRegistryHash,
      adapter_id: OFFICIAL_ERADICATION_ADAPTER_ID,
      adapter_version: OFFICIAL_ERADICATION_ADAPTER_VERSION,
      adapter_code_hash: adapterCodeHash,
      code_commit: snapshot.commit,
      parameter_hash: parameterHash,
      parameters,
      requested_scope: {
        state_code: spec.stateCode,
        county_fips: [...spec.countyFips],
        species_ids: [spec.speciesId],
        pair_keys: candidatePairs,
        date_range: { start: null, end: null },
      },
      upstream_requests: [],
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
      deviations: [
        "No live provider request was issued; the approved batch replays retained, hash-pinned official artifacts reviewed immediately before human approval.",
        "Push, R2 publication, pointer promotion, deployment, and release are excluded from this local batch.",
      ],
      rerun_command: `npm run research:run:approved-eradication -- --recorded-at ${options.recordedAt}`,
    };
    const validationResult: SourceAdapterResult = result;
    validateResearchRunInMemory({
      root: ROOT,
      sourceId: spec.sourceId,
      source,
      stateCode: spec.stateCode,
      runId,
      requestedPairKeys: candidatePairs,
      result: validationResult,
      receipt,
      outputContents: new Map([...outputContents.entries()].map(([filename, value]) => [filename, value.contents])),
    });
    const contents = new Map<string, string>([
      ...[...outputContents.entries()].map(([filename, value]) => [filename, value.contents] as const),
      ...result.artifacts.map((artifact) => [`artifacts/${artifact.filename}`, String(artifact.contents)] as const),
      ["receipt.json", `${JSON.stringify(receipt, null, 2)}\n`],
    ]);
    mkdirSync(path.join(stagedDirectory, "artifacts"), { recursive: true });
    for (const [filename, contentsValue] of contents) {
      writeFileSync(path.join(stagedDirectory, filename), contentsValue);
    }
    exactFileSet(stagedDirectory, [...contents.keys()]);
    verifyStagedResearchRun(stagedDirectory, receipt);
    generated.push({ runId, finalDirectory, stagedDirectory, receipt, contents });
  }

  const totals = generated.reduce(
    (result, run) => ({
      pairs: result.pairs + run.receipt.counts.requested_pairs,
      assertions: result.assertions + run.receipt.counts.assertion_events,
      reviews: result.reviews + run.receipt.counts.review_events,
      outcomes: result.outcomes + run.receipt.counts.pair_outcomes,
    }),
    { pairs: 0, assertions: 0, reviews: 0, outcomes: 0 },
  );
  assert(totals.pairs === 3151, `Expected 3151 source-pair screens, generated ${totals.pairs}.`);
  assert(totals.assertions === 3151 && totals.reviews === 3151, "Approved assertion or review count differs.");
  assert(totals.outcomes === 3151, "Approved outcome count differs.");
  const newRuns: typeof generated = [];
  for (const run of generated) {
    if (!existsSync(run.finalDirectory)) {
      newRuns.push(run);
      continue;
    }
    const existingBundle = loadImmutableResearchRun(ROOT, run.finalDirectory);
    assert(existingBundle.receipt.run_id === run.runId, `Existing run ${run.runId} failed immutable discovery.`);
    assert(
      stableJson([...directoryContents(run.finalDirectory).entries()].sort()) === stableJson([...run.contents.entries()].sort()),
      `Existing run ${run.runId} differs from deterministic replay.`,
    );
  }
  verifyCommittedInputSnapshot(ROOT, snapshot);
  const moved: typeof newRuns = [];
  try {
    mkdirSync(RUNS_ROOT, { recursive: true });
    for (const run of newRuns) {
      assert(!existsSync(run.finalDirectory), `Run appeared during staging: ${run.runId}.`);
      renameSync(run.stagedDirectory, run.finalDirectory);
      moved.push(run);
    }
    for (const run of generated) {
      const bundle = loadImmutableResearchRun(ROOT, run.finalDirectory);
      assert(bundle.receipt.run_id === run.runId, `Generated run ${run.runId} is missing.`);
    }
  } catch (error) {
    for (const run of [...moved].reverse()) {
      if (existsSync(run.finalDirectory) && !existsSync(run.stagedDirectory)) renameSync(run.finalDirectory, run.stagedDirectory);
    }
    throw error;
  }
  rmSync(cacheRoot, { recursive: true, force: true });
  process.stdout.write(`${JSON.stringify({
    batchId: OFFICIAL_ERADICATION_BATCH_ID,
    codeCommit: snapshot.commit,
    recordedAt: options.recordedAt,
    runCount: generated.length,
    newRunCount: newRuns.length,
    sourcePairScreens: totals.pairs,
    currentDeterminationAssertions: 3147,
    historicalOccurrenceAssertions: 4,
    assertionEvents: totals.assertions,
    reviewEvents: totals.reviews,
    outcomeEvents: totals.outcomes,
    networkRequests: 0,
    r2Mutations: 0,
    deploymentMutations: 0,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
