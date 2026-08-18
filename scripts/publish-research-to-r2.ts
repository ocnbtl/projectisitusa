import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import path from "node:path";

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import {
  hashFile,
  manifestBytes,
  readResearchPublicationManifest,
  RESEARCH_MANIFEST_CACHE_CONTROL,
  RESEARCH_POINTER_CACHE_CONTROL,
  type ResearchPublicationArtifact,
} from "./research/research-publication";

const ROOT = process.cwd();
const DEFAULT_MANIFEST = path.join(ROOT, "ops/national-research/publication/research-data-manifest.json");
const DEFAULT_BUCKET = "project-isitusa-research";
const FREE_STORAGE_SAFETY_BYTES = 9 * 1024 * 1024 * 1024;
const FREE_CLASS_A_SAFETY_REQUESTS = 900_000;
const FREE_CLASS_B_SAFETY_REQUESTS = 9_000_000;

type Mode = "plan" | "publish" | "verify";
type Verification = "head" | "full";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for R2 network operations.`);
  return value;
}

function isMissingObject(error: unknown): boolean {
  const candidate = error as { name?: string; $metadata?: { httpStatusCode?: number } };
  return candidate?.name === "NotFound" || candidate?.$metadata?.httpStatusCode === 404;
}

function assertFreeTierGuard(input: {
  projectedStorageBytes: number;
  classARequests: number;
  classBRequests: number;
}) {
  if (input.projectedStorageBytes > FREE_STORAGE_SAFETY_BYTES) {
    throw new Error(`Projected R2 storage ${input.projectedStorageBytes.toLocaleString()} exceeds the 9 GiB project safety budget.`);
  }
  if (input.classARequests > FREE_CLASS_A_SAFETY_REQUESTS) {
    throw new Error(`Projected R2 Class A requests ${input.classARequests.toLocaleString()} exceed the project safety budget.`);
  }
  if (input.classBRequests > FREE_CLASS_B_SAFETY_REQUESTS) {
    throw new Error(`Projected R2 Class B requests ${input.classBRequests.toLocaleString()} exceed the project safety budget.`);
  }
}

async function parallelForEach<T>(values: T[], concurrency: number, work: (value: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (next < values.length) {
        const index = next;
        next += 1;
        await work(values[index], index);
      }
    }),
  );
}

async function streamHash(body: unknown): Promise<{ bytes: number; sha256: string }> {
  if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) {
    throw new Error("R2 GetObject did not return a stream body.");
  }
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    hash.update(buffer);
  }
  return { bytes, sha256: hash.digest("hex") };
}

async function listBucket(client: S3Client, bucket: string) {
  const objects = new Map<string, number>();
  let continuationToken: string | undefined;
  let requestCount = 0;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    }));
    requestCount += 1;
    for (const object of page.Contents ?? []) {
      if (object.Key && Number.isSafeInteger(object.Size)) objects.set(object.Key, object.Size!);
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return { objects, requestCount };
}

async function verifyLocalArtifacts(artifacts: ResearchPublicationArtifact[]) {
  let verifiedBytes = 0;
  for (const artifact of artifacts) {
    const localPath = path.resolve(ROOT, artifact.localPath);
    const hashed = await hashFile(localPath);
    if (hashed.bytes !== artifact.bytes || hashed.sha256 !== artifact.sha256) {
      throw new Error(`Local publication artifact differs from the manifest: ${artifact.localPath}`);
    }
    verifiedBytes += hashed.bytes;
  }
  return verifiedBytes;
}

async function verifyRemoteObject(
  client: S3Client,
  bucket: string,
  artifact: ResearchPublicationArtifact,
  verification: Verification,
) {
  if (verification === "head") {
    const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: artifact.objectKey }));
    if (head.ContentLength !== artifact.bytes || head.Metadata?.sha256 !== artifact.sha256) {
      throw new Error(`R2 object metadata differs: ${artifact.objectKey}`);
    }
    return;
  }
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: artifact.objectKey }));
  const hashed = await streamHash(result.Body);
  if (hashed.bytes !== artifact.bytes || hashed.sha256 !== artifact.sha256) {
    throw new Error(`R2 object bytes or hash differ: ${artifact.objectKey}`);
  }
}

async function verifyPublicSamples(origin: string, releaseKey: string, artifacts: ResearchPublicationArtifact[]) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("Public R2 origin must be an HTTPS origin without a path, query, or fragment.");
  }
  const manifestResponse = await fetch(new URL(releaseKey, base));
  if (!manifestResponse.ok) {
    throw new Error(`Public R2 release manifest returned ${manifestResponse.status}.`);
  }
  const samples = [artifacts[0], artifacts[Math.floor(artifacts.length / 2)], artifacts.at(-1)!];
  for (const artifact of samples) {
    const response = await fetch(new URL(artifact.objectKey, base));
    if (!response.ok) throw new Error(`Public R2 sample returned ${response.status}: ${artifact.objectKey}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
      throw new Error(`Public R2 sample differs: ${artifact.objectKey}`);
    }
  }
}

async function main() {
  const mode = (argument("--mode") ?? "plan") as Mode;
  const verification = (argument("--verification") ?? "head") as Verification;
  if (!["plan", "publish", "verify"].includes(mode)) throw new Error(`Unsupported R2 mode: ${mode}`);
  if (!["head", "full"].includes(verification)) throw new Error(`Unsupported R2 verification: ${verification}`);
  const concurrency = Number(argument("--concurrency") ?? "4");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 8) {
    throw new Error("R2 concurrency must be an integer from 1 through 8.");
  }
  const manifestPath = path.resolve(argument("--manifest") ?? DEFAULT_MANIFEST);
  const manifest = readResearchPublicationManifest(manifestPath);
  const uniqueArtifacts = [...new Map(manifest.artifacts.map((artifact) => [artifact.objectKey, artifact])).values()];
  const releaseKey = `releases/${manifest.releaseId}/manifest.json`;
  const pointerKey = "current.json";

  assertFreeTierGuard({
    projectedStorageBytes: manifest.uniqueObjectBytes + manifestBytes(manifest).length,
    classARequests: uniqueArtifacts.length + 2,
    classBRequests: uniqueArtifacts.length * (verification === "full" ? 2 : 1) + 10,
  });
  console.log(JSON.stringify({
    mode,
    releaseId: manifest.releaseId,
    artifactCount: manifest.artifactCount,
    uniqueObjectCount: manifest.uniqueObjectCount,
    uniqueObjectBytes: manifest.uniqueObjectBytes,
    maximumNewClassARequests: uniqueArtifacts.length + 2,
    maximumVerificationClassBRequests: uniqueArtifacts.length + 10,
    freeTierSafetyStorageBytes: FREE_STORAGE_SAFETY_BYTES,
  }, null, 2));
  if (mode === "plan") return;

  const accountId = requiredEnvironment("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnvironment("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnvironment("R2_SECRET_ACCESS_KEY");
  const bucket = process.env.R2_BUCKET ?? DEFAULT_BUCKET;
  const client = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
  });

  const localBytes = await verifyLocalArtifacts(manifest.artifacts);
  console.log(`Verified ${localBytes.toLocaleString()} local bytes against the release manifest.`);
  const listing = await listBucket(client, bucket);
  const existingStorageBytes = [...listing.objects.values()].reduce((total, bytes) => total + bytes, 0);
  const missing = uniqueArtifacts.filter((artifact) => {
    const existingBytes = listing.objects.get(artifact.objectKey);
    if (existingBytes !== undefined && existingBytes !== artifact.bytes) {
      throw new Error(`Existing R2 content-addressed object has the wrong byte count: ${artifact.objectKey}`);
    }
    return existingBytes === undefined;
  });
  const missingBytes = missing.reduce((total, artifact) => total + artifact.bytes, 0);
  const projectedStorageBytes = existingStorageBytes + missingBytes + manifestBytes(manifest).length + 1024;
  assertFreeTierGuard({
    projectedStorageBytes,
    classARequests: listing.requestCount + missing.length + 2,
    classBRequests: uniqueArtifacts.length + 10,
  });
  console.log(`R2 shadow plan: ${missing.length.toLocaleString()} new objects, ${missingBytes.toLocaleString()} new bytes, ${projectedStorageBytes.toLocaleString()} projected retained bytes.`);

  if (mode === "publish") {
    let uploaded = 0;
    await parallelForEach(missing, concurrency, async (artifact) => {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: artifact.objectKey,
        Body: createReadStream(path.resolve(ROOT, artifact.localPath)),
        ContentLength: artifact.bytes,
        ContentType: artifact.contentType,
        CacheControl: artifact.cacheControl,
        Metadata: { sha256: artifact.sha256 },
        IfNoneMatch: "*",
      }));
      uploaded += 1;
      if (uploaded % 100 === 0 || uploaded === missing.length) {
        console.log(`Uploaded ${uploaded.toLocaleString()} of ${missing.length.toLocaleString()} missing objects.`);
      }
    });
    const releaseBytes = manifestBytes(manifest);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: releaseKey,
      Body: releaseBytes,
      ContentLength: releaseBytes.length,
      ContentType: "application/json; charset=utf-8",
      CacheControl: RESEARCH_MANIFEST_CACHE_CONTROL,
      Metadata: { sha256: createHash("sha256").update(releaseBytes).digest("hex") },
    }));
  }

  let verified = 0;
  await parallelForEach(uniqueArtifacts, concurrency, async (artifact) => {
    await verifyRemoteObject(client, bucket, artifact, verification);
    verified += 1;
    if (verified % 250 === 0 || verified === uniqueArtifacts.length) {
      console.log(`Verified ${verified.toLocaleString()} of ${uniqueArtifacts.length.toLocaleString()} R2 objects.`);
    }
  });
  const releaseObject = await client.send(new GetObjectCommand({ Bucket: bucket, Key: releaseKey }));
  const releaseBody = await streamHash(releaseObject.Body);
  const expectedReleaseBytes = manifestBytes(manifest);
  if (
    releaseBody.bytes !== expectedReleaseBytes.length ||
    releaseBody.sha256 !== createHash("sha256").update(expectedReleaseBytes).digest("hex")
  ) {
    throw new Error("R2 release manifest differs from the local manifest.");
  }

  if (process.argv.includes("--promote")) {
    if (mode !== "publish") throw new Error("--promote requires --mode publish.");
    const pointer = Buffer.from(`${JSON.stringify({
      schemaVersion: 1,
      kind: "isitusa-research-projection-pointer",
      releaseId: manifest.releaseId,
      releaseManifestKey: releaseKey,
      releaseManifestSha256: releaseBody.sha256,
      sourceCommit: manifest.sourceCommit,
      promotedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: pointerKey,
      Body: pointer,
      ContentLength: pointer.length,
      ContentType: "application/json; charset=utf-8",
      CacheControl: RESEARCH_POINTER_CACHE_CONTROL,
    }));
    console.log(`Promoted R2 pointer to ${manifest.releaseId}.`);
  }

  const publicOrigin = argument("--public-origin");
  if (publicOrigin) await verifyPublicSamples(publicOrigin, releaseKey, manifest.artifacts);
  console.log(`R2 ${mode} completed for ${manifest.releaseId} with ${verification} verification.`);
}

void main();
