import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildResearchPublicationManifest,
  manifestBytes,
  validateResearchPublicationManifest,
  publicationStoredBytes,
  type ResearchPublicationArtifact,
} from "./research/research-publication";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "ops/national-research/publication/research-data-manifest.json");

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: ROOT, encoding: "utf8" }).trim();
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  const output = path.resolve(argument("--output") ?? OUTPUT);
  execFileSync("git", ["diff", "--quiet", "HEAD", "--", "public/generated/research"], { cwd: ROOT });
  const sourceCommit = git("log", "-1", "--format=%H", "--", "public/generated/research").toLowerCase();
  const sourceCommitDate = git("show", "-s", "--format=%cI", sourceCommit);
  let knownObjects: ResearchPublicationArtifact[] = [];
  let existingObjectKeys: Set<string> | undefined;
  const inventoryPath = argument("--r2-inventory");
  const compressNewObjects = process.argv.includes("--gzip");
  if (compressNewObjects && !inventoryPath) throw new Error("--gzip requires a fresh read-only --r2-inventory export.");
  if (inventoryPath) {
    const inventory = JSON.parse(readFileSync(path.resolve(inventoryPath), "utf8").replace(/^\uFEFF/u, ""));
    if (inventory.kind !== "isitusa-r2-publication-inventory" || inventory.schemaVersion !== 1
      || !Array.isArray(inventory.bucketObjects) || !Array.isArray(inventory.releases)) throw new Error("Invalid R2 publication inventory.");
    const age = Date.now() - Date.parse(inventory.observedAt);
    if (!Number.isFinite(age) || age < 0 || age > 24 * 60 * 60 * 1000) throw new Error("R2 publication inventory is older than the one-day planning limit.");
    knownObjects = inventory.releases.flatMap((release: { manifest: unknown }) => validateResearchPublicationManifest(release.manifest).artifacts);
    const listed = new Map<string, number>(inventory.bucketObjects.map((object: { key: string; bytes: number }) => [object.key, object.bytes]));
    for (const artifact of knownObjects) {
      if (listed.get(artifact.objectKey) !== publicationStoredBytes(artifact)) throw new Error("R2 inventory representation size differs.");
    }
    existingObjectKeys = new Set(listed.keys());
  } else if (mode === "check" && existsSync(output)) {
    // Replay the sealed storage plan offline; never recompress retained objects during standard checks.
    knownObjects = validateResearchPublicationManifest(JSON.parse(readFileSync(output, "utf8"))).artifacts;
  }
  const manifest = await buildResearchPublicationManifest({ root: ROOT, sourceCommit, sourceCommitDate,
    compressNewObjects, knownObjects, existingObjectKeys });
  validateResearchPublicationManifest(manifest);
  const expected = manifestBytes(manifest);

  if (mode === "write") {
    mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.tmp`;
    writeFileSync(temporary, expected, { flag: "w" });
    renameSync(temporary, output);
    console.log(
      `Wrote ${path.relative(ROOT, output)} for ${manifest.artifactCount.toLocaleString()} artifacts, ${manifest.uniqueObjectCount.toLocaleString()} unique objects, ${manifest.uniqueObjectBytes.toLocaleString()} decoded bytes and ${[...new Map(manifest.artifacts.map((artifact) => [artifact.objectKey, artifact])).values()].reduce((sum, artifact) => sum + publicationStoredBytes(artifact), 0).toLocaleString()} stored bytes.`,
    );
    return;
  }

  if (!existsSync(output)) {
    throw new Error(`Research publication manifest is missing: ${path.relative(ROOT, output)}. Run with --write.`);
  }
  const actual = readFileSync(output);
  if (!actual.equals(expected)) {
    throw new Error(`Research publication manifest is stale: ${path.relative(ROOT, output)}. Run with --write.`);
  }
  console.log(`Research publication manifest is current for ${manifest.releaseId}.`);
}

void main();
