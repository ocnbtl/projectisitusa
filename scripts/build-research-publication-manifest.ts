import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  buildResearchPublicationManifest,
  manifestBytes,
  validateResearchPublicationManifest,
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
  const sourceCommitDate = git("show", "-s", "--format=%cI", "HEAD");
  const manifest = await buildResearchPublicationManifest({ root: ROOT, sourceCommit, sourceCommitDate });
  validateResearchPublicationManifest(manifest);
  const expected = manifestBytes(manifest);

  if (mode === "write") {
    mkdirSync(path.dirname(output), { recursive: true });
    const temporary = `${output}.tmp`;
    writeFileSync(temporary, expected, { flag: "w" });
    renameSync(temporary, output);
    console.log(
      `Wrote ${path.relative(ROOT, output)} for ${manifest.artifactCount.toLocaleString()} artifacts, ${manifest.uniqueObjectCount.toLocaleString()} unique objects, and ${manifest.uniqueObjectBytes.toLocaleString()} unique bytes.`,
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
