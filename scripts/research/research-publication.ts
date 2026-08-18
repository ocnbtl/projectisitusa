import { createHash } from "node:crypto";
import {
  createReadStream,
  lstatSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import path from "node:path";

import { stableJson } from "@/lib/research/run-files";

export const RESEARCH_PUBLICATION_SCHEMA_VERSION = 1 as const;
export const RESEARCH_PUBLICATION_KIND = "isitusa-research-projection-release" as const;
export const RESEARCH_OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const RESEARCH_MANIFEST_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const RESEARCH_POINTER_CACHE_CONTROL = "public, max-age=60, must-revalidate";

export interface ResearchPublicationArtifact {
  logicalPath: string;
  localPath: string;
  objectKey: string;
  sha256: string;
  bytes: number;
  contentType: "application/json; charset=utf-8";
  cacheControl: typeof RESEARCH_OBJECT_CACHE_CONTROL;
}

export interface ResearchPublicationManifest {
  schemaVersion: typeof RESEARCH_PUBLICATION_SCHEMA_VERSION;
  kind: typeof RESEARCH_PUBLICATION_KIND;
  releaseId: string;
  sourceCommit: string;
  sourceCommitDate: string;
  sourceRoot: "public/generated/research";
  sourceTreeSha256: string;
  artifactCount: number;
  artifactBytes: number;
  uniqueObjectCount: number;
  uniqueObjectBytes: number;
  artifacts: ResearchPublicationArtifact[];
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function repositoryPath(root: string, filepath: string): string {
  const relative = path.relative(root, filepath).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`Publication path escapes the repository: ${filepath}`);
  }
  return relative;
}

function listFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const filepath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Research publication cannot include a symbolic link: ${filepath}`);
    }
    if (entry.isDirectory()) {
      files.push(...listFiles(filepath));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Research publication contains a non-file entry: ${filepath}`);
    }
    files.push(filepath);
  }
  return files.sort(compareText);
}

export async function hashFile(filepath: string): Promise<{ bytes: number; sha256: string }> {
  const stats = lstatSync(filepath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Cannot hash a non-regular publication file: ${filepath}`);
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filepath)) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  if (bytes !== stats.size) {
    throw new Error(`Publication file changed while hashing: ${filepath}`);
  }
  return { bytes, sha256: hash.digest("hex") };
}

export async function buildResearchPublicationManifest(input: {
  root: string;
  sourceCommit: string;
  sourceCommitDate: string;
}): Promise<ResearchPublicationManifest> {
  if (!/^[0-9a-f]{40}$/u.test(input.sourceCommit)) {
    throw new Error("Research publication sourceCommit must be a full lowercase Git SHA.");
  }
  if (!Number.isFinite(Date.parse(input.sourceCommitDate))) {
    throw new Error("Research publication sourceCommitDate must be an ISO date-time.");
  }

  const sourceRoot = path.join(input.root, "public", "generated", "research");
  const files = listFiles(sourceRoot);
  if (files.length === 0) {
    throw new Error("Research publication source tree is empty.");
  }

  const artifacts: ResearchPublicationArtifact[] = [];
  for (const filepath of files) {
    if (path.extname(filepath).toLowerCase() !== ".json") {
      throw new Error(`Research publication only permits JSON projections: ${filepath}`);
    }
    const hashed = await hashFile(filepath);
    const localPath = repositoryPath(input.root, filepath);
    artifacts.push({
      logicalPath: localPath,
      localPath,
      objectKey: `objects/sha256/${hashed.sha256.slice(0, 2)}/${hashed.sha256}.json`,
      sha256: hashed.sha256,
      bytes: hashed.bytes,
      contentType: "application/json; charset=utf-8",
      cacheControl: RESEARCH_OBJECT_CACHE_CONTROL,
    });
  }

  const treeIdentity = artifacts.map(({ logicalPath, sha256, bytes }) => ({ logicalPath, sha256, bytes }));
  const sourceTreeSha256 = createHash("sha256").update(stableJson(treeIdentity)).digest("hex");
  const releaseIdentity = createHash("sha256")
    .update(stableJson({ sourceCommit: input.sourceCommit, sourceTreeSha256 }))
    .digest("hex");
  const uniqueObjects = new Map<string, ResearchPublicationArtifact>();
  for (const artifact of artifacts) {
    const existing = uniqueObjects.get(artifact.objectKey);
    if (existing && (existing.sha256 !== artifact.sha256 || existing.bytes !== artifact.bytes)) {
      throw new Error(`Content-addressed object collision at ${artifact.objectKey}.`);
    }
    uniqueObjects.set(artifact.objectKey, artifact);
  }

  return {
    schemaVersion: RESEARCH_PUBLICATION_SCHEMA_VERSION,
    kind: RESEARCH_PUBLICATION_KIND,
    releaseId: `research-${input.sourceCommit.slice(0, 12)}-${releaseIdentity.slice(0, 16)}`,
    sourceCommit: input.sourceCommit,
    sourceCommitDate: new Date(input.sourceCommitDate).toISOString(),
    sourceRoot: "public/generated/research",
    sourceTreeSha256,
    artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((total, artifact) => total + artifact.bytes, 0),
    uniqueObjectCount: uniqueObjects.size,
    uniqueObjectBytes: [...uniqueObjects.values()].reduce((total, artifact) => total + artifact.bytes, 0),
    artifacts,
  };
}

export function validateResearchPublicationManifest(value: unknown): ResearchPublicationManifest {
  if (!value || typeof value !== "object") {
    throw new Error("Research publication manifest must be an object.");
  }
  const manifest = value as ResearchPublicationManifest;
  if (
    manifest.schemaVersion !== RESEARCH_PUBLICATION_SCHEMA_VERSION ||
    manifest.kind !== RESEARCH_PUBLICATION_KIND ||
    !/^research-[0-9a-f]{12}-[0-9a-f]{16}$/u.test(manifest.releaseId) ||
    !/^[0-9a-f]{40}$/u.test(manifest.sourceCommit) ||
    !/^[0-9a-f]{64}$/u.test(manifest.sourceTreeSha256) ||
    manifest.sourceRoot !== "public/generated/research" ||
    !Array.isArray(manifest.artifacts)
  ) {
    throw new Error("Research publication manifest identity is invalid.");
  }
  const paths = new Set<string>();
  let bytes = 0;
  const objects = new Map<string, { sha256: string; bytes: number }>();
  for (const artifact of manifest.artifacts) {
    if (
      !artifact.logicalPath.startsWith("public/generated/research/") ||
      artifact.logicalPath !== artifact.localPath ||
      paths.has(artifact.logicalPath) ||
      !/^[0-9a-f]{64}$/u.test(artifact.sha256) ||
      artifact.objectKey !== `objects/sha256/${artifact.sha256.slice(0, 2)}/${artifact.sha256}.json` ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 0 ||
      artifact.contentType !== "application/json; charset=utf-8" ||
      artifact.cacheControl !== RESEARCH_OBJECT_CACHE_CONTROL
    ) {
      throw new Error(`Research publication artifact is invalid: ${artifact.logicalPath ?? "unknown"}.`);
    }
    paths.add(artifact.logicalPath);
    bytes += artifact.bytes;
    const existing = objects.get(artifact.objectKey);
    if (existing && (existing.sha256 !== artifact.sha256 || existing.bytes !== artifact.bytes)) {
      throw new Error(`Research publication object collision: ${artifact.objectKey}.`);
    }
    objects.set(artifact.objectKey, { sha256: artifact.sha256, bytes: artifact.bytes });
  }
  if (
    manifest.artifactCount !== manifest.artifacts.length ||
    manifest.artifactBytes !== bytes ||
    manifest.uniqueObjectCount !== objects.size ||
    manifest.uniqueObjectBytes !== [...objects.values()].reduce((total, object) => total + object.bytes, 0)
  ) {
    throw new Error("Research publication manifest totals do not reconcile.");
  }
  const treeIdentity = manifest.artifacts.map(({ logicalPath, sha256, bytes: artifactBytes }) => ({
    logicalPath,
    sha256,
    bytes: artifactBytes,
  }));
  const treeHash = createHash("sha256").update(stableJson(treeIdentity)).digest("hex");
  if (treeHash !== manifest.sourceTreeSha256) {
    throw new Error("Research publication source tree hash does not reconcile.");
  }
  const releaseIdentity = createHash("sha256")
    .update(stableJson({ sourceCommit: manifest.sourceCommit, sourceTreeSha256: manifest.sourceTreeSha256 }))
    .digest("hex");
  if (manifest.releaseId !== `research-${manifest.sourceCommit.slice(0, 12)}-${releaseIdentity.slice(0, 16)}`) {
    throw new Error("Research publication release ID does not reconcile.");
  }
  return manifest;
}

export function manifestBytes(manifest: ResearchPublicationManifest): Buffer {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function readResearchPublicationManifest(filepath: string): ResearchPublicationManifest {
  return validateResearchPublicationManifest(JSON.parse(readFileSync(filepath, "utf8")));
}
