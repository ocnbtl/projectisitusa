import delivery from "@/data/research/research-data-delivery.json";
import {
  type ResearchDataDelivery,
  validateResearchDataDelivery,
} from "@/lib/research/research-data-delivery";

const RELEASE_ID_PATTERN = /^research-[0-9a-f]{12}-[0-9a-f]{16}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/u;

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface PublishedArtifact {
  logicalPath: string;
  objectKey: string;
  sha256: string;
  bytes: number;
}

export interface PublishedPointer {
  schemaVersion: 1;
  kind: "isitusa-research-projection-pointer";
  releaseId: string;
  releaseManifestKey: string;
  releaseManifestSha256: string;
  sourceCommit: string;
  promotedAt: string;
}

export interface PublishedManifest {
  schemaVersion: 1;
  kind: "isitusa-research-projection-release";
  releaseId: string;
  sourceCommit: string;
  artifactCount: number;
  artifacts: PublishedArtifact[];
}

function assertSafeResearchPath(relativePath: string): void {
  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    relativePath.includes("\\") ||
    relativePath.split("/").includes("..") ||
    !relativePath.endsWith(".json")
  ) {
    throw new Error(`Unsafe research projection path: ${relativePath}`);
  }
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function verifiedResponseBytes(response: Response, expectedSha256: string): Promise<ArrayBuffer> {
  if (!response.ok) {
    throw new Error(`Research data request failed with status ${response.status}.`);
  }
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  if (bytesToHex(digest) !== expectedSha256) {
    throw new Error("Research data hash differs from its published declaration.");
  }
  return bytes;
}

function parseJsonBytes(bytes: ArrayBuffer): unknown {
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

export function validatePublishedPointer(value: unknown): PublishedPointer {
  if (!value || typeof value !== "object") {
    throw new Error("Research release pointer must be an object.");
  }
  const pointer = value as PublishedPointer;
  if (
    pointer.schemaVersion !== 1 ||
    pointer.kind !== "isitusa-research-projection-pointer" ||
    !RELEASE_ID_PATTERN.test(pointer.releaseId) ||
    pointer.releaseManifestKey !== `releases/${pointer.releaseId}/manifest.json` ||
    !SHA256_PATTERN.test(pointer.releaseManifestSha256) ||
    !COMMIT_SHA_PATTERN.test(pointer.sourceCommit) ||
    typeof pointer.promotedAt !== "string" ||
    !Number.isFinite(Date.parse(pointer.promotedAt))
  ) {
    throw new Error("Research release pointer has an invalid identity.");
  }
  return pointer;
}

export function validatePublishedManifest(
  value: unknown,
  pointer: PublishedPointer,
): PublishedManifest {
  if (!value || typeof value !== "object") {
    throw new Error("Research release manifest must be an object.");
  }
  const manifest = value as PublishedManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== "isitusa-research-projection-release" ||
    manifest.releaseId !== pointer.releaseId ||
    manifest.sourceCommit !== pointer.sourceCommit ||
    !Array.isArray(manifest.artifacts) ||
    manifest.artifactCount !== manifest.artifacts.length
  ) {
    throw new Error("Research release manifest has an invalid identity.");
  }

  const logicalPaths = new Set<string>();
  for (const artifact of manifest.artifacts) {
    const expectedObjectKey = SHA256_PATTERN.test(artifact.sha256)
      ? `objects/sha256/${artifact.sha256.slice(0, 2)}/${artifact.sha256}.json`
      : "";
    if (
      typeof artifact.logicalPath !== "string" ||
      !artifact.logicalPath.startsWith("public/generated/research/") ||
      artifact.logicalPath.includes("\\") ||
      artifact.logicalPath.split("/").includes("..") ||
      !artifact.logicalPath.endsWith(".json") ||
      artifact.objectKey !== expectedObjectKey ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 0 ||
      logicalPaths.has(artifact.logicalPath)
    ) {
      throw new Error("Research release manifest contains an invalid artifact.");
    }
    logicalPaths.add(artifact.logicalPath);
  }
  return manifest;
}

async function loadManifest(
  validatedDelivery: ResearchDataDelivery,
  request: FetchLike,
): Promise<Map<string, PublishedArtifact>> {
  if (validatedDelivery.mode !== "r2") {
    throw new Error("R2 research delivery is not active.");
  }
  const pointerResponse = await request(
    `/research-data/${validatedDelivery.r2.pointerPath}`,
    { cache: "no-store" },
  );
  if (!pointerResponse.ok) {
    throw new Error(`Research release pointer request failed with status ${pointerResponse.status}.`);
  }
  const pointer = validatePublishedPointer(await pointerResponse.json());
  const manifestResponse = await request(`/research-data/${pointer.releaseManifestKey}`, {
    cache: "force-cache",
  });
  const manifestBytes = await verifiedResponseBytes(
    manifestResponse,
    pointer.releaseManifestSha256,
  );
  const manifest = validatePublishedManifest(parseJsonBytes(manifestBytes), pointer);
  return new Map(manifest.artifacts.map((artifact) => [artifact.logicalPath, artifact]));
}

export function createResearchProjectionFetcher(
  inputDelivery: unknown,
  request: FetchLike = fetch,
) {
  const validatedDelivery = validateResearchDataDelivery(inputDelivery);
  let manifestPromise: Promise<Map<string, PublishedArtifact>> | null = null;

  function resolvedManifest() {
    manifestPromise ??= loadManifest(validatedDelivery, request).catch((error) => {
      manifestPromise = null;
      throw error;
    });
    return manifestPromise;
  }

  return async function fetchProjection(
    relativePath: string,
    init: RequestInit = {},
  ): Promise<unknown> {
    assertSafeResearchPath(relativePath);
    if (validatedDelivery.mode !== "r2") {
      const response = await request(`/generated/research/${relativePath}`, init);
      if (!response.ok) {
        throw new Error(`Research projection request failed with status ${response.status}.`);
      }
      return response.json() as Promise<unknown>;
    }

    const manifest = await resolvedManifest();
    const logicalPath = `public/generated/research/${relativePath}`;
    const artifact = manifest.get(logicalPath);
    if (!artifact) {
      throw new Error(`Research release does not declare ${logicalPath}.`);
    }
    const response = await request(`/research-data/${artifact.objectKey}`, {
      ...init,
      cache: "force-cache",
    });
    const bytes = await verifiedResponseBytes(response, artifact.sha256);
    if (bytes.byteLength !== artifact.bytes) {
      throw new Error(`Research object byte count differs for ${logicalPath}.`);
    }
    return parseJsonBytes(bytes);
  };
}

export const fetchResearchProjectionJson = createResearchProjectionFetcher(delivery);
