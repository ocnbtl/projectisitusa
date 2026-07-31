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
  stableJson,
} from "@/lib/research/run-files";

type ArchiveDescriptor = {
  schemaVersion: 1;
  planId: string;
  createdAt: string;
  sourceId: "gbif-preserved-specimens";
  archives: Array<{
    archiveCommit: string;
    archiveRunId: string;
    stateCode: string;
  }>;
};

type SourceVerification = {
  runId: string;
  sourceId: string;
  stateCode: string;
  pairKeys: string[];
  parameterHash: string;
  acquisition: {
    requests: Array<{
      requestGroupId: string;
      url: string;
      status: number;
      retrievedAt: string;
      receivedRecordCount: number;
    }>;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error(`Invalid argument sequence near ${key ?? "end"}.`);
    }
    values.set(key.slice(2), value);
  }
  const descriptor = values.get("descriptor");
  const outputDirectory = values.get("output-dir");
  if (!descriptor || !outputDirectory) {
    throw new Error("--descriptor and --output-dir are required.");
  }
  return {
    descriptorPath: path.resolve(descriptor),
    outputDirectory: path.resolve(outputDirectory),
  };
}

function readGitObject(
  root: string,
  commit: string,
  filepath: string,
): Buffer {
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

function verifyReference(
  root: string,
  commit: string,
  reference: { path: string; sha256: string; bytes: number },
): Buffer {
  const contents = readGitObject(root, commit, reference.path);
  assert(
    contents.length === reference.bytes,
    `Archived reference ${reference.path} byte count changed.`,
  );
  assert(
    sha256(contents) === reference.sha256,
    `Archived reference ${reference.path} hash changed.`,
  );
  return contents;
}

function parseNdjson<T>(contents: Buffer): T[] {
  return contents
    .toString("utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function isSpeciesArtifact(filename: string, speciesId: string) {
  return (
    filename === `gbif-species-match-${speciesId}.json.gz` ||
    (filename.startsWith(`gbif-occurrences-${speciesId}-`) &&
      filename.endsWith(".json.gz"))
  );
}

function writeJson(filepath: string, value: unknown) {
  fs.writeFileSync(filepath, `${JSON.stringify(value, null, 2)}\n`);
}

export function buildGbifArchivedRecoveryPlan(input: {
  root: string;
  descriptorPath: string;
  outputDirectory: string;
}) {
  const descriptorContents = fs.readFileSync(input.descriptorPath);
  const descriptor = JSON.parse(
    descriptorContents.toString("utf8"),
  ) as ArchiveDescriptor;
  assert(
    descriptor.schemaVersion === 1 &&
      descriptor.sourceId === "gbif-preserved-specimens" &&
      descriptor.planId.length > 0 &&
      !Number.isNaN(Date.parse(descriptor.createdAt)) &&
      descriptor.archives.length > 0,
    "Archived recovery descriptor is invalid.",
  );
  assert(
    input.descriptorPath.startsWith(`${input.root}${path.sep}`) &&
      input.outputDirectory.startsWith(`${input.root}${path.sep}`),
    "Archived recovery inputs and outputs must remain inside the repository.",
  );
  const archiveIdentities = descriptor.archives.map(
    (archive) => `${archive.archiveCommit}:${archive.archiveRunId}`,
  );
  assert(
    new Set(archiveIdentities).size === archiveIdentities.length,
    "Archived recovery descriptor contains duplicate runs.",
  );
  const completedPairs = new Set(
    listImmutableResearchRuns(input.root)
      .flatMap((bundle) => bundle.outcomes)
      .filter(
        (outcome) =>
          outcome.source_id === descriptor.sourceId &&
          outcome.scope_complete,
      )
      .map(
        (outcome) =>
          `${outcome.state_code}:${outcome.county_fips}:${outcome.species_id}`,
      ),
  );
  fs.mkdirSync(input.outputDirectory, { recursive: true });
  const archivePlans = descriptor.archives.map((archive, index) => {
    assert(
      /^[a-f0-9]{40}$/u.test(archive.archiveCommit),
      `Archive ${index + 1} lacks a full commit SHA.`,
    );
    assert(
      /^[A-Z]{2}$/u.test(archive.stateCode),
      `Archive ${index + 1} has an invalid state code.`,
    );
    const runRoot = `src/data/research/runs/${archive.archiveRunId}`;
    const receiptContents = readGitObject(
      input.root,
      archive.archiveCommit,
      `${runRoot}/receipt.json`,
    );
    const receipt = JSON.parse(
      receiptContents.toString("utf8"),
    ) as ImmutableResearchRunReceipt;
    assert(
      receipt.run_id === archive.archiveRunId &&
        receipt.source_id === descriptor.sourceId &&
        receipt.requested_scope.state_code === archive.stateCode,
      `Archive ${index + 1} receipt identity changed.`,
    );
    const outputByName = new Map(
      receipt.outputs.map((reference) => [
        path.posix.basename(reference.path),
        reference,
      ]),
    );
    const outcomesReference = outputByName.get("outcomes.ndjson");
    const sourceVerificationReference = outputByName.get(
      "source-verification.json",
    );
    assert(
      outcomesReference && sourceVerificationReference,
      `Archive ${index + 1} lacks required outputs.`,
    );
    const outcomesContents = verifyReference(
      input.root,
      archive.archiveCommit,
      outcomesReference,
    );
    const outcomes = parseNdjson<ResearchPairOutcome>(outcomesContents);
    const sourceVerificationContents = verifyReference(
      input.root,
      archive.archiveCommit,
      sourceVerificationReference,
    );
    const sourceVerification = JSON.parse(
      sourceVerificationContents.toString("utf8"),
    ) as SourceVerification;
    assert(
      sourceVerification.runId === receipt.run_id &&
        sourceVerification.sourceId === receipt.source_id &&
        sourceVerification.stateCode === receipt.requested_scope.state_code &&
        sourceVerification.parameterHash === receipt.parameter_hash &&
        stableJson(sourceVerification.pairKeys) ===
          stableJson(receipt.requested_scope.pair_keys),
      `Archive ${index + 1} source verification changed.`,
    );
    assert(
      sourceVerification.acquisition.requests.length ===
        receipt.upstream_requests.length &&
        sourceVerification.acquisition.requests.every(
          (request, requestIndex) =>
            request.url === receipt.upstream_requests[requestIndex]?.url &&
            request.status ===
              receipt.upstream_requests[requestIndex]?.status &&
            request.retrievedAt ===
              receipt.upstream_requests[requestIndex]?.retrieved_at &&
            request.receivedRecordCount ===
              receipt.upstream_requests[requestIndex]?.record_count,
        ),
      `Archive ${index + 1} request verification changed.`,
    );
    const completeOutcomes = outcomes.filter((outcome) => {
      assert(
        outcome.run_id === receipt.run_id &&
          outcome.source_id === receipt.source_id &&
          outcome.state_code === archive.stateCode,
        `Archive ${index + 1} contains a foreign outcome.`,
      );
      return outcome.scope_complete;
    });
    assert(
      new Set(
        completeOutcomes.map(
          (outcome) =>
            `${outcome.county_fips}:${outcome.species_id}`,
        ),
      ).size === completeOutcomes.length,
      `Archive ${index + 1} contains duplicate complete outcomes.`,
    );
    const selectedOutcomes = completeOutcomes.filter((outcome) => {
      const key = `${outcome.state_code}:${outcome.county_fips}:${outcome.species_id}`;
      if (completedPairs.has(key)) return false;
      completedPairs.add(key);
      return true;
    });
    const selectedPairKeys = selectedOutcomes
      .map((outcome) => `${outcome.county_fips}:${outcome.species_id}`)
      .sort(compareText);
    const selectedSpeciesIds = [
      ...new Set(selectedOutcomes.map((outcome) => outcome.species_id)),
    ].sort(compareText);
    const selectedArtifacts = receipt.artifacts.filter((reference) => {
      const filename = path.posix.basename(reference.path);
      return selectedSpeciesIds.some((speciesId) =>
        isSpeciesArtifact(filename, speciesId),
      );
    });
    const selectedRequests = sourceVerification.acquisition.requests.filter(
      (request) =>
        selectedSpeciesIds.some(
          (speciesId) =>
            request.requestGroupId === `species-match-${speciesId}` ||
            request.requestGroupId ===
              `statewide-occurrences-${speciesId}`,
        ),
    );
    assert(
      selectedRequests.length === selectedArtifacts.length,
      `Archive ${index + 1} request and artifact selections differ.`,
    );
    const batchId = `${descriptor.planId}-${archive.stateCode.toLowerCase()}-${String(index + 1).padStart(3, "0")}`;
    const candidateFile = `${batchId}.json`;
    const candidateValue = {
      schemaVersion: 1,
      stateCode: archive.stateCode,
      candidateCount: selectedOutcomes.length,
      distinctPairCount: new Set(selectedPairKeys).size,
      stateSpeciesScreenCount: selectedSpeciesIds.length,
      batchId,
      archiveReplay: {
        commit: archive.archiveCommit,
        runId: archive.archiveRunId,
      },
      candidates: selectedOutcomes
        .map((outcome) => ({
          sourceId: descriptor.sourceId,
          speciesId: outcome.species_id,
          countyFips: outcome.county_fips,
        }))
        .sort(
          (left, right) =>
            compareText(left.speciesId, right.speciesId) ||
            compareText(left.countyFips, right.countyFips),
        ),
    };
    assert(
      candidateValue.candidateCount === candidateValue.distinctPairCount,
      `Archive ${index + 1} produced duplicate candidates.`,
    );
    writeJson(
      path.join(input.outputDirectory, candidateFile),
      candidateValue,
    );
    return {
      archiveIndex: index + 1,
      archiveCommit: archive.archiveCommit,
      archiveRunId: archive.archiveRunId,
      archiveReceiptStatus: receipt.status,
      stateCode: archive.stateCode,
      receiptSha256: sha256(receiptContents),
      outcomesSha256: sha256(outcomesContents),
      sourceVerificationSha256: sha256(sourceVerificationContents),
      originalRequestedPairCount: receipt.requested_scope.pair_keys.length,
      originalCompletePairCount: completeOutcomes.length,
      originalIncompletePairCount: outcomes.length - completeOutcomes.length,
      preventedAlreadyCompletePairCount:
        completeOutcomes.length - selectedOutcomes.length,
      selectedPairCount: selectedOutcomes.length,
      selectedStateSpeciesScreenCount: selectedSpeciesIds.length,
      selectedProviderRequestCount: selectedRequests.length,
      selectedArtifactCount: selectedArtifacts.length,
      selectedArtifactBytes: selectedArtifacts.reduce(
        (sum, reference) => sum + reference.bytes,
        0,
      ),
      candidateFile,
      candidateSha256: sha256(
        `${JSON.stringify(candidateValue, null, 2)}\n`,
      ),
    };
  });
  const plan = {
    schemaVersion: 1,
    planId: descriptor.planId,
    sourceId: descriptor.sourceId,
    createdAt: descriptor.createdAt,
    descriptor: {
      path: path
        .relative(input.root, input.descriptorPath)
        .split(path.sep)
        .join("/"),
      sha256: sha256(descriptorContents),
    },
    deduplication: {
      currentCompletePairCountBeforePlanning:
        completedPairs.size -
        archivePlans.reduce(
          (sum, archive) => sum + archive.selectedPairCount,
          0,
        ),
      preventedAlreadyCompletePairCount: archivePlans.reduce(
        (sum, archive) =>
          sum + archive.preventedAlreadyCompletePairCount,
        0,
      ),
    },
    totals: {
      archives: archivePlans.length,
      selectedStateSpeciesScreenCount: archivePlans.reduce(
        (sum, archive) =>
          sum + archive.selectedStateSpeciesScreenCount,
        0,
      ),
      selectedPairCount: archivePlans.reduce(
        (sum, archive) => sum + archive.selectedPairCount,
        0,
      ),
      selectedProviderRequestCount: archivePlans.reduce(
        (sum, archive) =>
          sum + archive.selectedProviderRequestCount,
        0,
      ),
      selectedArtifactCount: archivePlans.reduce(
        (sum, archive) => sum + archive.selectedArtifactCount,
        0,
      ),
      selectedArtifactBytes: archivePlans.reduce(
        (sum, archive) => sum + archive.selectedArtifactBytes,
        0,
      ),
    },
    archives: archivePlans,
  };
  const planPath = path.join(
    input.outputDirectory,
    `${descriptor.planId}-plan.json`,
  );
  writeJson(planPath, plan);
  return { planPath, plan };
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const options = parseArguments(process.argv.slice(2));
  const result = buildGbifArchivedRecoveryPlan({
    root: process.cwd(),
    descriptorPath: options.descriptorPath,
    outputDirectory: options.outputDirectory,
  });
  console.log(
    JSON.stringify(
      {
        planPath: path.relative(process.cwd(), result.planPath),
        ...result.plan.totals,
      },
      null,
      2,
    ),
  );
}
