import { execFileSync } from "node:child_process";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import type {
  ImmutableResearchRunReceipt,
  ResearchPairOutcome,
} from "@/lib/research/types";
import { sha256, stableJson } from "@/lib/research/run-files";

type SourceVerificationRequest = {
  requestGroupId: string;
  url: string;
  status: number;
  retrievedAt: string;
  receivedRecordCount: number;
};

type ArchivedSourceVerification = {
  runId: string;
  sourceId: string;
  stateCode: string;
  pairKeys: string[];
  parameterHash: string;
  acquisition: {
    requests: SourceVerificationRequest[];
  };
};

export type GbifArchivedReplay = {
  archiveCommit: string;
  archiveRunId: string;
  archiveReceiptStatus: ImmutableResearchRunReceipt["status"];
  requestedPairCount: number;
  reusedArtifactCount: number;
  preventedProviderRequestCount: number;
  requestUrls: string[];
  fetch: typeof fetch;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readGitObject(
  repositoryRoot: string,
  commit: string,
  filepath: string,
): Buffer {
  assert(
    filepath.length > 0 &&
      !path.posix.isAbsolute(filepath) &&
      !path.win32.isAbsolute(filepath) &&
      !filepath.split(/[\\/]/u).includes(".."),
    `Unsafe archived research path: ${filepath}.`,
  );
  try {
    return execFileSync(
      "git",
      ["-C", repositoryRoot, "show", `${commit}:${filepath}`],
      { maxBuffer: 64 * 1024 * 1024 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot read archived research object ${commit}:${filepath}: ${detail}`,
    );
  }
}

function readJson<T>(
  repositoryRoot: string,
  commit: string,
  filepath: string,
): T {
  return JSON.parse(
    readGitObject(repositoryRoot, commit, filepath).toString("utf8"),
  ) as T;
}

function readNdjson<T>(contents: Buffer): T[] {
  return contents
    .toString("utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function verifyReference(
  repositoryRoot: string,
  commit: string,
  reference: { path: string; sha256: string; bytes: number },
): Buffer {
  const contents = readGitObject(repositoryRoot, commit, reference.path);
  assert(
    contents.length === reference.bytes,
    `Archived artifact ${reference.path} byte count changed.`,
  );
  assert(
    sha256(contents) === reference.sha256,
    `Archived artifact ${reference.path} hash changed.`,
  );
  return contents;
}

export function artifactFilenameForRequest(
  request: Pick<SourceVerificationRequest, "requestGroupId" | "url">,
): string {
  const matchPrefix = "species-match-";
  if (request.requestGroupId.startsWith(matchPrefix)) {
    const speciesId = request.requestGroupId.slice(matchPrefix.length);
    assert(speciesId.length > 0, "Archived species-match request lacks a species ID.");
    return `gbif-species-match-${speciesId}.json.gz`;
  }
  const occurrencePrefix = "statewide-occurrences-";
  if (request.requestGroupId.startsWith(occurrencePrefix)) {
    const speciesId = request.requestGroupId.slice(occurrencePrefix.length);
    assert(speciesId.length > 0, "Archived occurrence request lacks a species ID.");
    const offset = Number(new URL(request.url).searchParams.get("offset"));
    assert(
      Number.isInteger(offset) && offset >= 0,
      `Archived occurrence request has an invalid offset: ${request.url}.`,
    );
    return `gbif-occurrences-${speciesId}-${String(offset).padStart(6, "0")}.json.gz`;
  }
  throw new Error(
    `Unsupported archived GBIF request group ${request.requestGroupId}.`,
  );
}

export function loadGbifArchivedReplay(input: {
  repositoryRoot: string;
  archiveCommit: string;
  archiveRunId: string;
  stateCode: string;
  sourceId: string;
  requestedPairKeys: string[];
}): GbifArchivedReplay {
  assert(
    /^[a-f0-9]{40}$/u.test(input.archiveCommit),
    "The archived replay commit must be a full Git SHA.",
  );
  const runRoot = `src/data/research/runs/${input.archiveRunId}`;
  const receipt = readJson<ImmutableResearchRunReceipt>(
    input.repositoryRoot,
    input.archiveCommit,
    `${runRoot}/receipt.json`,
  );
  assert(
    receipt.run_id === input.archiveRunId,
    "Archived receipt run ID does not match the requested replay run.",
  );
  assert(
    receipt.source_id === input.sourceId &&
      receipt.requested_scope.state_code === input.stateCode,
    "Archived receipt source or state does not match the replay request.",
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
  assert(outcomesReference, "Archived receipt lacks outcomes.ndjson.");
  assert(
    sourceVerificationReference,
    "Archived receipt lacks source-verification.json.",
  );
  const outcomes = readNdjson<ResearchPairOutcome>(
    verifyReference(
      input.repositoryRoot,
      input.archiveCommit,
      outcomesReference,
    ),
  );
  const sourceVerification = JSON.parse(
    verifyReference(
      input.repositoryRoot,
      input.archiveCommit,
      sourceVerificationReference,
    ).toString("utf8"),
  ) as ArchivedSourceVerification;
  assert(
    sourceVerification.runId === receipt.run_id &&
      sourceVerification.sourceId === receipt.source_id &&
      sourceVerification.stateCode === receipt.requested_scope.state_code &&
      sourceVerification.parameterHash === receipt.parameter_hash &&
      stableJson(sourceVerification.pairKeys) ===
        stableJson(receipt.requested_scope.pair_keys),
    "Archived source verification does not match its receipt.",
  );
  assert(
    sourceVerification.acquisition.requests.length ===
      receipt.upstream_requests.length &&
      sourceVerification.acquisition.requests.every(
        (request, index) =>
          request.url === receipt.upstream_requests[index]?.url &&
          request.status === receipt.upstream_requests[index]?.status &&
          request.retrievedAt ===
            receipt.upstream_requests[index]?.retrieved_at &&
          request.receivedRecordCount ===
            receipt.upstream_requests[index]?.record_count,
      ),
    "Archived source-verification requests do not match the receipt.",
  );

  const outcomeByPair = new Map(
    outcomes.map((outcome) => [
      `${outcome.county_fips}:${outcome.species_id}`,
      outcome,
    ]),
  );
  const requestedPairKeys = [...new Set(input.requestedPairKeys)].sort();
  assert(requestedPairKeys.length > 0, "Archived replay scope is empty.");
  for (const pairKey of requestedPairKeys) {
    assert(
      receipt.requested_scope.pair_keys.includes(pairKey),
      `Archived receipt did not request replay pair ${pairKey}.`,
    );
    const outcome = outcomeByPair.get(pairKey);
    assert(outcome, `Archived run lacks an outcome for replay pair ${pairKey}.`);
    assert(
      outcome.scope_complete,
      `Archived outcome ${outcome.outcome_id} is incomplete and cannot be replayed as complete.`,
    );
  }

  const requestedSpeciesIds = new Set(
    requestedPairKeys.map((pairKey) => pairKey.slice(pairKey.indexOf(":") + 1)),
  );
  const selectedRequests = sourceVerification.acquisition.requests.filter(
    (request) => {
      const groupId = request.requestGroupId;
      return [...requestedSpeciesIds].some(
        (speciesId) =>
          groupId === `species-match-${speciesId}` ||
          groupId === `statewide-occurrences-${speciesId}`,
      );
    },
  );
  assert(
    selectedRequests.length > 0,
    "Archived replay scope has no retained provider requests.",
  );
  const requestByUrl = new Map(
    selectedRequests.map((request) => [request.url, request]),
  );
  assert(
    requestByUrl.size === selectedRequests.length,
    "Archived replay requests contain duplicate URLs.",
  );
  const artifactByName = new Map(
    receipt.artifacts.map((reference) => [
      path.posix.basename(reference.path),
      reference,
    ]),
  );
  const consumedUrls = new Set<string>();
  const consumedArtifacts = new Set<string>();
  const replayFetch: typeof fetch = (async (resource) => {
    const url =
      typeof resource === "string" || resource instanceof URL
        ? String(resource)
        : resource.url;
    const request = requestByUrl.get(url);
    assert(request, `Archived replay does not contain provider request ${url}.`);
    const filename = artifactFilenameForRequest(request);
    const artifact = artifactByName.get(filename);
    assert(artifact, `Archived replay lacks retained artifact ${filename}.`);
    const compressed = verifyReference(
      input.repositoryRoot,
      input.archiveCommit,
      artifact,
    );
    consumedUrls.add(url);
    consumedArtifacts.add(filename);
    return new Response(new Uint8Array(gunzipSync(compressed)), {
      status: request.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  return {
    archiveCommit: input.archiveCommit,
    archiveRunId: input.archiveRunId,
    archiveReceiptStatus: receipt.status,
    requestedPairCount: requestedPairKeys.length,
    get reusedArtifactCount() {
      return consumedArtifacts.size;
    },
    get preventedProviderRequestCount() {
      return consumedUrls.size;
    },
    requestUrls: selectedRequests.map((request) => request.url),
    fetch: replayFetch,
  };
}
