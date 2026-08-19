import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXCLUDED_VERCEL_BUILD_PATHS,
  REQUIRED_VERCEL_RUNTIME_PATHS,
  prepareVercelBuild,
} from "./prepare-vercel-build.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vercelIgnorePaths = readFileSync(path.join(repositoryRoot, ".vercelignore"), "utf8")
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter((line) => line !== "" && !line.startsWith("#"));
assert.deepEqual(
  vercelIgnorePaths,
  EXCLUDED_VERCEL_BUILD_PATHS,
  ".vercelignore and the build-workspace contract must stay synchronized",
);

const root = mkdtempSync(path.join(tmpdir(), "isitusa-vercel-build-"));

try {
  for (const relativePath of REQUIRED_VERCEL_RUNTIME_PATHS) {
    const absolutePath = path.join(root, relativePath);
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, "{}\n");
  }
  for (const relativePath of EXCLUDED_VERCEL_BUILD_PATHS) {
    const fixturePath = path.join(root, relativePath, "fixture.txt");
    mkdirSync(path.dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, "retained in Git; pruned only from the Vercel workspace\n");
  }

  const localResult = prepareVercelBuild(root, {});
  assert.deepEqual(localResult, { mode: "local" });
  for (const relativePath of EXCLUDED_VERCEL_BUILD_PATHS) {
    assert.equal(existsSync(path.join(root, relativePath)), true);
  }

  const vercelResult = prepareVercelBuild(root, { VERCEL: "1" });
  assert.deepEqual(vercelResult, {
    mode: "vercel",
    requiredRuntimeFileCount: REQUIRED_VERCEL_RUNTIME_PATHS.length,
    excludedPathCount: EXCLUDED_VERCEL_BUILD_PATHS.length,
    removedPathCount: EXCLUDED_VERCEL_BUILD_PATHS.length,
  });
  for (const relativePath of EXCLUDED_VERCEL_BUILD_PATHS) {
    assert.equal(existsSync(path.join(root, relativePath)), false);
  }

  const missingRuntimeFile = path.join(root, REQUIRED_VERCEL_RUNTIME_PATHS[0]);
  rmSync(missingRuntimeFile);
  assert.throws(
    () => prepareVercelBuild(root, { VERCEL: "1" }),
    /Required Vercel runtime file is missing/,
  );
  assert.equal(existsSync(missingRuntimeFile), false);
  console.log("Vercel publish preparation tests passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
