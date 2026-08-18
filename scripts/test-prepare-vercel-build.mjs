import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { prepareVercelBuild } from "./prepare-vercel-build.mjs";

const root = mkdtempSync(path.join(tmpdir(), "isitusa-vercel-build-"));

try {
  const authoritativeRoot = path.join(root, "src", "data", "generated", "research", "AL");
  const publicMirrorRoot = path.join(root, "public", "generated", "research", "AL");
  mkdirSync(authoritativeRoot, { recursive: true });
  mkdirSync(publicMirrorRoot, { recursive: true });
  writeFileSync(path.join(authoritativeRoot, "summary.json"), "{}\n");
  writeFileSync(path.join(publicMirrorRoot, "summary.json"), "{}\n");

  const localResult = prepareVercelBuild(root, {});
  assert.deepEqual(localResult, { mode: "local", removedPublicMirror: false });
  assert.equal(
    prepareVercelBuild(root, {
      VERCEL: "1",
      VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
    }).removedPublicMirror,
    true,
  );
  assert.equal(existsSync(path.join(root, "public", "generated", "research")), false);
  assert.equal(existsSync(path.join(authoritativeRoot, "summary.json")), true);
  assert.throws(
    () => prepareVercelBuild(root, { VERCEL: "1", VERCEL_GIT_COMMIT_SHA: "not-a-commit" }),
    /full Git commit SHA/,
  );

  console.log("Vercel publish preparation tests passed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
