import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import delivery from "@/data/research/research-data-delivery.json";
import {
  createResearchProjectionFetcher,
  validatePublishedManifest,
  validatePublishedPointer,
} from "@/lib/research/public-projection-fetch";
import { validateResearchDataDelivery } from "@/lib/research/research-data-delivery";

const releaseId = "research-aaaaaaaaaaaa-bbbbbbbbbbbbbbbb";
const sourceCommit = "c".repeat(40);
const logicalPath = "public/generated/research/MD/summary.json";
const objectBody = Buffer.from('{"stateCode":"MD"}\n');
const objectSha256 = createHash("sha256").update(objectBody).digest("hex");
const objectKey = `objects/sha256/${objectSha256.slice(0, 2)}/${objectSha256}.json`;
const manifest = {
  schemaVersion: 1 as const,
  kind: "isitusa-research-projection-release" as const,
  releaseId,
  sourceCommit,
  artifactCount: 1,
  artifacts: [
    {
      logicalPath,
      objectKey,
      sha256: objectSha256,
      bytes: objectBody.length,
    },
  ],
};
const manifestBody = Buffer.from(`${JSON.stringify(manifest)}\n`);
const manifestSha256 = createHash("sha256").update(manifestBody).digest("hex");
const pointer = {
  schemaVersion: 1 as const,
  kind: "isitusa-research-projection-pointer" as const,
  releaseId,
  releaseManifestKey: `releases/${releaseId}/manifest.json`,
  releaseManifestSha256: manifestSha256,
  sourceCommit,
  promotedAt: "2026-08-19T01:11:37.072Z",
};

async function main() {
  validateResearchDataDelivery(delivery);
  validatePublishedPointer(pointer);
  validatePublishedManifest(manifest, pointer);

  const calls: string[] = [];
  const bodies = new Map<string, BodyInit>([
    ["/research-data/current.json", JSON.stringify(pointer)],
    [`/research-data/${pointer.releaseManifestKey}`, manifestBody],
    [`/research-data/${objectKey}`, objectBody],
  ]);
  const request = async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const body = bodies.get(url);
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body);
  };
  const fetchProjection = createResearchProjectionFetcher(delivery, request);
  assert.deepEqual(await fetchProjection("MD/summary.json"), { stateCode: "MD" });
  assert.deepEqual(calls, [
    "/research-data/current.json",
    `/research-data/${pointer.releaseManifestKey}`,
    `/research-data/${objectKey}`,
  ]);

  const badManifestRequest = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/research-data/current.json") return new Response(JSON.stringify(pointer));
    if (url === `/research-data/${pointer.releaseManifestKey}`) {
      return new Response(`${JSON.stringify({ ...manifest, sourceCommit: "d".repeat(40) })}\n`);
    }
    return new Response(objectBody);
  };
  await assert.rejects(
    createResearchProjectionFetcher(delivery, badManifestRequest)("MD/summary.json"),
    /hash differs/iu,
  );
  await assert.rejects(fetchProjection("../MD/summary.json"), /unsafe research projection path/iu);

  const githubDelivery = { ...delivery, mode: "github" as const };
  const githubFetcher = createResearchProjectionFetcher(githubDelivery, async (input) => {
    assert.equal(String(input), "/generated/research/MD/summary.json");
    return new Response(objectBody);
  });
  assert.deepEqual(await githubFetcher("MD/summary.json"), { stateCode: "MD" });

  assert.throws(
    () => validatePublishedPointer({ ...pointer, releaseManifestKey: "../manifest.json" }),
    /invalid identity/iu,
  );
  assert.throws(
    () => validatePublishedManifest({ ...manifest, artifactCount: 2 }, pointer),
    /invalid identity/iu,
  );

  console.log("Public R2 projection fetch tests passed.");
}

void main();
