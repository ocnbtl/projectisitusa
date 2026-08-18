import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  buildSourceCoverageIndex,
  sourceCoverageIndexBytes,
} from "./research/source-coverage-index";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "ops/national-research/source-coverage-index.json");

function schemaValidator() {
  const schema = JSON.parse(
    readFileSync(path.join(ROOT, "src/data/research/schemas/source-coverage-index.schema.json"), "utf8"),
  ) as Parameters<typeof z.fromJSONSchema>[0];
  return z.fromJSONSchema(schema);
}

async function main() {
  const mode = process.argv.includes("--write") ? "write" : "check";
  execFileSync("git", ["diff", "--quiet", "HEAD", "--", "src/data/research/runs", "src/data/research/source-registry.json"], { cwd: ROOT });
  const generatedFromCommit = execFileSync(
    "git",
    ["log", "-1", "--format=%H", "--", "src/data/research/runs", "src/data/research/source-registry.json"],
    { cwd: ROOT, encoding: "utf8" },
  ).trim().toLowerCase();
  const index = await buildSourceCoverageIndex({ root: ROOT, generatedFromCommit });
  schemaValidator().parse(index);
  const expected = sourceCoverageIndexBytes(index);

  if (mode === "write") {
    mkdirSync(path.dirname(OUTPUT), { recursive: true });
    const temporary = `${OUTPUT}.tmp`;
    writeFileSync(temporary, expected, { flag: "w" });
    renameSync(temporary, OUTPUT);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT)} with ${index.runCount.toLocaleString()} validated run coverage entries across ${index.sourceCount.toLocaleString()} sources.`);
    return;
  }
  if (!existsSync(OUTPUT)) {
    throw new Error(`Source coverage index is missing: ${path.relative(ROOT, OUTPUT)}. Run with --write.`);
  }
  if (!readFileSync(OUTPUT).equals(expected)) {
    throw new Error(`Source coverage index is stale: ${path.relative(ROOT, OUTPUT)}. Run with --write.`);
  }
  console.log(`Source coverage index ${index.indexId} is current and hash-reconciled.`);
}

void main();
