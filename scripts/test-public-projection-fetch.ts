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
    ["https://data.isitusa.com/current.json", JSON.stringify(pointer)],
    [`https://data.isitusa.com/${pointer.releaseManifestKey}`, manifestBody],
    [`https://data.isitusa.com/${objectKey}`, objectBody],
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
    "https://data.isitusa.com/current.json",
    `https://data.isitusa.com/${pointer.releaseManifestKey}`,
    `https://data.isitusa.com/${objectKey}`,
  ]);

  const badManifestRequest = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "https://data.isitusa.com/current.json") return new Response(JSON.stringify(pointer));
    if (url === `https://data.isitusa.com/${pointer.releaseManifestKey}`) {
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

  for (const stallAt of ["pointer", "manifest"] as const) {
    let stall = true;
    let observedSignal: AbortSignal | null = null;
    const retryingFetcher = createResearchProjectionFetcher(delivery, async (input, init) => {
      const url = String(input);
      if (stall && (stallAt === "pointer" ? url.endsWith("current.json") : url.endsWith("manifest.json"))) {
        stall = false;
        observedSignal = init?.signal ?? null;
        return new Promise<Response>(() => {});
      }
      return request(input);
    }, 20);
    await assert.rejects(retryingFetcher("MD/summary.json"), /timed out/iu);
    assert.equal((observedSignal as AbortSignal | null)?.aborted, true);
    assert.deepEqual(await retryingFetcher("MD/summary.json"), { stateCode: "MD" });
  }
  console.log("Public R2 projection fetch tests passed, including stalled pointer/manifest retry.");
}

void main();
