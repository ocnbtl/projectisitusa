import delivery from "@/data/research/research-data-delivery.json";
import { validateResearchDataDelivery } from "@/lib/research/research-data-delivery";

const validatedDelivery = validateResearchDataDelivery(delivery);

interface PublishedArtifact {
  logicalPath: string;
  objectKey: string;
  sha256: string;
  bytes: number;
}

interface PublishedManifest {
  schemaVersion: 1;
  kind: "isitusa-research-projection-release";
  releaseId: string;
  artifacts: PublishedArtifact[];
}

let manifestPromise: Promise<Map<string, PublishedArtifact>> | null = null;

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

async function loadManifest(): Promise<Map<string, PublishedArtifact>> {
  if (validatedDelivery.mode !== "r2" || !validatedDelivery.r2.releaseId) {
    throw new Error("R2 research delivery is not active.");
  }
  const response = await fetch(`/research-data/releases/${encodeURIComponent(validatedDelivery.r2.releaseId)}/manifest.json`, {
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(`Research release manifest request failed with status ${response.status}.`);
  }
  const manifest = (await response.json()) as PublishedManifest;
  if (
    manifest.schemaVersion !== 1 ||
    manifest.kind !== "isitusa-research-projection-release" ||
    manifest.releaseId !== validatedDelivery.r2.releaseId ||
    !Array.isArray(manifest.artifacts)
  ) {
    throw new Error("Research release manifest has an invalid identity.");
  }
  const entries = new Map<string, PublishedArtifact>();
  for (const artifact of manifest.artifacts) {
    if (
      typeof artifact.logicalPath !== "string" ||
      typeof artifact.objectKey !== "string" ||
      !/^[0-9a-f]{64}$/u.test(artifact.sha256) ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 0 ||
      entries.has(artifact.logicalPath)
    ) {
      throw new Error("Research release manifest contains an invalid artifact.");
    }
    entries.set(artifact.logicalPath, artifact);
  }
  return entries;
}

export async function fetchResearchProjectionJson(
  relativePath: string,
  init: RequestInit = {},
): Promise<unknown> {
  assertSafeResearchPath(relativePath);
  if (validatedDelivery.mode !== "r2") {
    const response = await fetch(`/generated/research/${relativePath}`, init);
    if (!response.ok) {
      throw new Error(`Research projection request failed with status ${response.status}.`);
    }
    return response.json() as Promise<unknown>;
  }

  manifestPromise ??= loadManifest();
  const manifest = await manifestPromise;
  const logicalPath = `public/generated/research/${relativePath}`;
  const artifact = manifest.get(logicalPath);
  if (!artifact) {
    throw new Error(`Research release does not declare ${logicalPath}.`);
  }
  const response = await fetch(`/research-data/${artifact.objectKey}`, { ...init, cache: "force-cache" });
  if (!response.ok) {
    throw new Error(`Research object request failed with status ${response.status}.`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== artifact.bytes) {
    throw new Error(`Research object byte count differs for ${logicalPath}.`);
  }
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  if (bytesToHex(digest) !== artifact.sha256) {
    throw new Error(`Research object hash differs for ${logicalPath}.`);
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
