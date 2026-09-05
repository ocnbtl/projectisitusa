import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

import { validateResearchPublicationPointer } from "./research/publication-cadence";
import {
  buildR2ReachabilityReport,
  type R2BucketObjectRecord,
  type R2ReleaseInventoryRecord,
} from "./research/r2-reachability";
import { assertR2FreeTierSafety } from "./research/r2-free-tier-budget";
import { validateResearchPublicationManifest } from "./research/research-publication";

const DEFAULT_BUCKET = "project-isitusa-research";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the read-only R2 reachability report.`);
  return value;
}

function requiredNonNegativeIntegerArgument(name: string): number {
  const raw = argument(name);
  if (raw === null || !/^\d+$/u.test(raw)) {
    throw new Error(`${name} must be supplied as a non-negative integer from current Cloudflare usage.`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} exceeds the safe integer range.`);
  return value;
}

function requiredDateArgument(name: string): string {
  const raw = argument(name);
  if (raw === null || !Number.isFinite(Date.parse(raw))) throw new Error(`${name} must be an ISO date-time.`);
  return new Date(raw).toISOString();
}

async function bodyBytes(body: unknown): Promise<Buffer> {
  if (!body || typeof body !== "object" || !(Symbol.asyncIterator in body)) {
    throw new Error("R2 GetObject did not return a stream body.");
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function listBucket(client: S3Client, bucket: string) {
  const objects: R2BucketObjectRecord[] = [];
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
      if (!object.Key || !Number.isSafeInteger(object.Size)) continue;
      objects.push({
        key: object.Key,
        bytes: object.Size!,
        lastModified: object.LastModified?.toISOString() ?? null,
      });
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return { objects, requestCount };
}

async function getObjectBytes(client: S3Client, bucket: string, key: string): Promise<Buffer> {
  const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return bodyBytes(result.Body);
}

async function main() {
  const currentClassARequests = requiredNonNegativeIntegerArgument("--monthly-class-a-used");
  const currentClassBRequests = requiredNonNegativeIntegerArgument("--monthly-class-b-used");
  const dashboardObservedAt = requiredDateArgument("--dashboard-observed-at");
  const accountId = requiredEnvironment("R2_ACCOUNT_ID");
  const accessKeyId = requiredEnvironment("R2_ACCESS_KEY_ID");
  const secretAccessKey = requiredEnvironment("R2_SECRET_ACCESS_KEY");
  const bucket = process.env.R2_BUCKET ?? DEFAULT_BUCKET;
  const client = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    credentials: { accessKeyId, secretAccessKey },
  });

  const listing = await listBucket(client, bucket);
  const releaseManifestKeys = listing.objects
    .map(({ key }) => key)
    .filter((key) => /^releases\/[^/]+\/manifest\.json$/u.test(key))
    .sort();
  if (releaseManifestKeys.length === 0) throw new Error("R2 bucket contains no immutable release manifests.");

  let classBRequests = 0;
  const pointerBytes = await getObjectBytes(client, bucket, "current.json");
  classBRequests += 1;
  const currentPointer = validateResearchPublicationPointer(JSON.parse(pointerBytes.toString("utf8")));
  const releases: R2ReleaseInventoryRecord[] = [];
  for (const manifestKey of releaseManifestKeys) {
    const bytes = await getObjectBytes(client, bucket, manifestKey);
    classBRequests += 1;
    releases.push({
      manifestKey,
      manifestBytes: bytes.length,
      manifestSha256: createHash("sha256").update(bytes).digest("hex"),
      manifest: validateResearchPublicationManifest(JSON.parse(bytes.toString("utf8"))),
    });
  }

  const retainedBytes = listing.objects.reduce((total, object) => total + object.bytes, 0);
  assertR2FreeTierSafety({
    projectedStorageBytes: retainedBytes,
    currentClassARequests,
    currentClassBRequests,
    newClassARequests: listing.requestCount,
    newClassBRequests: classBRequests,
  });
  const candidatePath = argument("--candidate-manifest");
  const candidateManifest = candidatePath ? validateResearchPublicationManifest(JSON.parse(readFileSync(candidatePath, "utf8"))) : undefined;
  const report = buildR2ReachabilityReport({
    observedAt: new Date().toISOString(),
    dashboardObservedAt,
    bucket,
    currentClassARequests,
    currentClassBRequests,
    reportClassARequests: listing.requestCount,
    reportClassBRequests: classBRequests,
    bucketObjects: listing.objects,
    currentPointer,
    releases,
    candidateManifest,
  });
  console.log(JSON.stringify(report, null, 2));
}

void main();
