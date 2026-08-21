import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";

import { sha256 } from "@/lib/research/run-files";

import {
  USFWS_EDNA_ADAPTER_VERSION,
  USFWS_EDNA_SOURCE_ID,
} from "./adapters/usfws-invasive-carp-edna-snapshot";

export type NationalUsfwsEdnaArtifact = {
  path: string;
  sha256: string;
  bytes: number;
  mediaType: string;
  role: string;
  recordCount?: number | null;
};

export type NationalUsfwsEdnaAcquisitionReceipt = {
  acquisitionId: string;
  acquisition_id: string;
  sourceId: typeof USFWS_EDNA_SOURCE_ID;
  source_id: typeof USFWS_EDNA_SOURCE_ID;
  status: "complete-provider-write-free-coverage-preflight";
  baselineSha: string;
  code_commit: string;
  observedAt: string;
  finishedAt: string;
  sourceIdentity: {
    objectIdCount: number;
    objectIdSetSha256: string;
  };
  deterministicAcquisition: {
    stableWindow: boolean;
    chunks: unknown[];
  };
  coverage: {
    rawRows: number;
    acceptedSamples: number;
    rejectedRows: number;
    candidatePairs: number;
    netNewPairs: number;
    researchedUnresolvedPairs: number;
    alreadyNotDetectedPairs: number;
    verifiedPresentOverlaps: number;
    blockedPairs: number;
  };
  artifacts: NationalUsfwsEdnaArtifact[];
  operations: {
    providerPosts: number;
    assertionsCreated: number;
    reviewsCreated: number;
    outcomesCreated: number;
    generationCommands: number;
    publicationMutations: number;
    r2Mutations: number;
  };
};

export type NationalUsfwsEdnaReference = {
  schemaVersion: 1;
  acquisitionId: string;
  acquisitionReceiptPath: string;
  acquisitionReceiptSha256: string;
  recordsPath: string;
  recordsSha256: string;
  coveragePath: string;
  coverageSha256: string;
  sourceId: typeof USFWS_EDNA_SOURCE_ID;
  adapterVersion: typeof USFWS_EDNA_ADAPTER_VERSION;
  adapterCodeSha256: string;
  partitionScriptSha256: string;
  topologyPath: string;
  topologySha256: string;
  stateCode: string;
  selectedPairClassification: "researched-unresolved-candidate";
  selectedPairCount: number;
  selectedSampleCount: number;
  selectedSamplesSha256: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function within(parent: string, candidate: string) {
  const relative = path.relative(parent, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function assertSha256(value: string, label: string) {
  assert(/^[a-f0-9]{64}$/u.test(value), `${label} is not SHA-256.`);
}

export function validateNationalUsfwsEdnaReference(reference: NationalUsfwsEdnaReference) {
  assert(reference.schemaVersion === 1, "USFWS reference schema version changed.");
  assert(reference.sourceId === USFWS_EDNA_SOURCE_ID, "USFWS reference source changed.");
  assert(reference.adapterVersion === USFWS_EDNA_ADAPTER_VERSION, "USFWS reference adapter version changed.");
  assert(/^[A-Z]{2}$/u.test(reference.stateCode), "USFWS reference state is invalid.");
  assert(reference.selectedPairClassification === "researched-unresolved-candidate", "USFWS reference selection class changed.");
  assert(Number.isInteger(reference.selectedPairCount) && reference.selectedPairCount > 0, "USFWS reference pair count is invalid.");
  assert(Number.isInteger(reference.selectedSampleCount) && reference.selectedSampleCount > 0, "USFWS reference sample count is invalid.");
  for (const [label, value] of [
    ["acquisition receipt", reference.acquisitionReceiptSha256],
    ["records", reference.recordsSha256],
    ["coverage", reference.coverageSha256],
    ["adapter", reference.adapterCodeSha256],
    ["partition script", reference.partitionScriptSha256],
    ["topology", reference.topologySha256],
    ["selected samples", reference.selectedSamplesSha256],
  ] as const) assertSha256(value, `USFWS reference ${label}`);
  for (const value of [
    reference.acquisitionReceiptPath,
    reference.recordsPath,
    reference.coveragePath,
    reference.topologyPath,
  ]) {
    assert(value.length > 0 && !path.posix.isAbsolute(value) && !value.split("/").includes(".."), "USFWS reference path is unsafe.");
  }
}

export function verifyNationalUsfwsEdnaAcquisition(root: string, acquisitionDirectory: string) {
  const absoluteRoot = path.resolve(root);
  const absoluteDirectory = path.resolve(acquisitionDirectory);
  assert(within(absoluteRoot, absoluteDirectory), "USFWS acquisition is outside the repository.");
  const receiptPath = path.join(absoluteDirectory, "receipt.json");
  assert(existsSync(receiptPath), "USFWS acquisition receipt is missing.");
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as NationalUsfwsEdnaAcquisitionReceipt;
  const directoryId = path.basename(absoluteDirectory);
  assert(receipt.acquisitionId === directoryId && receipt.acquisition_id === directoryId, "USFWS acquisition identity differs from its directory.");
  assert(receipt.sourceId === USFWS_EDNA_SOURCE_ID && receipt.source_id === USFWS_EDNA_SOURCE_ID, "USFWS acquisition source changed.");
  assert(receipt.status === "complete-provider-write-free-coverage-preflight", "USFWS acquisition is not complete.");
  assert(/^[a-f0-9]{40}$/u.test(receipt.code_commit) && receipt.baselineSha === receipt.code_commit, "USFWS acquisition code commit is invalid.");
  assert(new Date(receipt.observedAt).toISOString() === receipt.observedAt, "USFWS observation timestamp is invalid.");
  assert(new Date(receipt.finishedAt).toISOString() === receipt.finishedAt, "USFWS completion timestamp is invalid.");
  assert(Date.parse(receipt.finishedAt) >= Date.parse(receipt.observedAt), "USFWS completion predates observation.");
  assert(receipt.deterministicAcquisition.stableWindow === true, "USFWS acquisition stable-window gate failed.");
  assert(receipt.sourceIdentity.objectIdCount === receipt.coverage.rawRows, "USFWS object-ID and row counts differ.");
  assertSha256(receipt.sourceIdentity.objectIdSetSha256, "USFWS object-ID set");
  assert(receipt.coverage.acceptedSamples + receipt.coverage.rejectedRows === receipt.coverage.rawRows, "USFWS row classes do not reconcile.");
  assert(
    receipt.coverage.netNewPairs +
      receipt.coverage.researchedUnresolvedPairs +
      receipt.coverage.alreadyNotDetectedPairs +
      receipt.coverage.verifiedPresentOverlaps +
      receipt.coverage.blockedPairs === receipt.coverage.candidatePairs,
    "USFWS pair classes do not reconcile.",
  );
  assert(
    receipt.operations.providerPosts === 0 &&
      receipt.operations.assertionsCreated === 0 &&
      receipt.operations.reviewsCreated === 0 &&
      receipt.operations.outcomesCreated === 0 &&
      receipt.operations.generationCommands === 0 &&
      receipt.operations.publicationMutations === 0 &&
      receipt.operations.r2Mutations === 0,
    "USFWS coverage acquisition was not evidence-neutral and provider-write-free.",
  );
  const expectedRoles = new Set([
    "layer-metadata-before",
    "layer-metadata-after",
    "item-metadata-before",
    "item-metadata-after",
    "item-data",
    "object-id-set",
    "source-records",
    "coverage-projection",
    "target-and-method-contract",
    "data-dictionary-contract",
    "historical-method-contract",
  ]);
  assert(receipt.artifacts.length === expectedRoles.size, "USFWS acquisition artifact count changed.");
  const artifactsByRole = new Map<string, { artifact: NationalUsfwsEdnaArtifact; path: string }>();
  const realDirectory = realpathSync(absoluteDirectory);
  for (const artifact of receipt.artifacts) {
    assert(expectedRoles.delete(artifact.role), `USFWS acquisition artifact role is duplicate or unknown: ${artifact.role}.`);
    assert(!path.posix.isAbsolute(artifact.path) && !artifact.path.split("/").includes(".."), `USFWS acquisition artifact path is unsafe: ${artifact.path}.`);
    const filepath = path.resolve(absoluteDirectory, artifact.path);
    assert(within(absoluteDirectory, filepath) && existsSync(filepath), `USFWS acquisition artifact is missing: ${artifact.path}.`);
    const stats = lstatSync(filepath);
    assert(stats.isFile() && !stats.isSymbolicLink(), `USFWS acquisition artifact is not a regular file: ${artifact.path}.`);
    assert(within(realDirectory, realpathSync(filepath)), `USFWS acquisition artifact escapes its directory: ${artifact.path}.`);
    const bytes = readFileSync(filepath);
    assert(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256, `USFWS acquisition artifact changed: ${artifact.path}.`);
    artifactsByRole.set(artifact.role, { artifact, path: filepath });
  }
  assert(expectedRoles.size === 0, `USFWS acquisition is missing artifact roles: ${[...expectedRoles].join(", ")}.`);
  return {
    receipt,
    receiptPath,
    receiptSha256: sha256(receiptBytes),
    artifactsByRole,
  };
}
