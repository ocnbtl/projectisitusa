import assert from "node:assert/strict";

import {
  classifyVercelBuild,
  decideVercelBuild,
  isDeploymentIndependentPath,
} from "./should-ignore-vercel-build.mjs";

assert.equal(isDeploymentIndependentPath("ops/national-research/owner.json"), true);
assert.equal(isDeploymentIndependentPath("docs/research/generated/AL-progress.json"), true);
assert.equal(isDeploymentIndependentPath("public/generated/research/AL/summary.json"), true);
assert.equal(isDeploymentIndependentPath("src/data/generated/research/AL/summary.json"), true);
assert.equal(
  isDeploymentIndependentPath("src/data/research/runs/example/outcomes.ndjson"),
  true,
);
assert.equal(
  isDeploymentIndependentPath("src/data/research/national-acquisitions/example/receipt.json"),
  true,
);

for (const buildRelevantPath of [
  "app/page.tsx",
  "next.config.ts",
  "package.json",
  "public/generated/species.json",
  "scripts/compile-research-index.ts",
  "src/data/generated/species.json",
  "src/data/research/research-data-delivery.json",
  "src/data/research/source-registry.json",
]) {
  assert.equal(isDeploymentIndependentPath(buildRelevantPath), false, buildRelevantPath);
}

assert.deepEqual(
  classifyVercelBuild([
    "ops/national-research/owner.json",
    "src\\data\\generated\\research\\MD\\summary.json",
  ]),
  {
    changedPaths: [
      "ops/national-research/owner.json",
      "src/data/generated/research/MD/summary.json",
    ],
    buildRelevantPaths: [],
    ignoreBuild: true,
  },
);
assert.equal(classifyVercelBuild([]).ignoreBuild, false);
assert.deepEqual(
  classifyVercelBuild(["ops/national-research/owner.json", "app/page.tsx"])
    .buildRelevantPaths,
  ["app/page.tsx"],
);
assert.equal(
  decideVercelBuild({
    VERCEL_GIT_PREVIOUS_SHA: "missing",
    VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
  }).ignoreBuild,
  false,
);

const historicalReceiptOnly = decideVercelBuild({
  VERCEL_GIT_PREVIOUS_SHA: "96f427da8aa646ae95370673d6bb9d3569cd5b9d",
  VERCEL_GIT_COMMIT_SHA: "db9124af94ddcbc455a75ed7c0725556391ebba3",
});
assert.equal(historicalReceiptOnly.ignoreBuild, true);
assert.deepEqual(historicalReceiptOnly.buildRelevantPaths, []);

const historicalProjectionOnly = decideVercelBuild({
  VERCEL_GIT_PREVIOUS_SHA: "dc21a45686a814512a3e470a905dfc8fb31c7f2d",
  VERCEL_GIT_COMMIT_SHA: "1f093b3150f7fdbff5405e7e05ac5d93b65f059d",
});
assert.equal(historicalProjectionOnly.ignoreBuild, true);
assert.deepEqual(historicalProjectionOnly.buildRelevantPaths, []);

const historicalApplicationChange = decideVercelBuild({
  VERCEL_GIT_PREVIOUS_SHA: "b2dd11ac1e954ed7e58a6d0f69d7549c9f281b78",
  VERCEL_GIT_COMMIT_SHA: "f905a3cbc6ae0d56414799a27f43c5e7b2968286",
});
assert.equal(historicalApplicationChange.ignoreBuild, false);
assert.ok(historicalApplicationChange.buildRelevantPaths.includes("next.config.ts"));

console.log("Vercel ignored-build classification tests passed.");
