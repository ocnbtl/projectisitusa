import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/iu;

const DEPLOYMENT_INDEPENDENT_PATHS = [
  /^docs\//u,
  /^ops\//u,
  /^public\/generated\/research\//u,
  /^src\/data\/generated\/research\//u,
  /^src\/data\/research\/national-acquisitions\//u,
  /^src\/data\/research\/runs\//u,
];

function normalizeRepositoryPath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function isDeploymentIndependentPath(filePath) {
  const normalized = normalizeRepositoryPath(filePath);
  return DEPLOYMENT_INDEPENDENT_PATHS.some((pattern) => pattern.test(normalized));
}

export function classifyVercelBuild(changedPaths) {
  const normalized = changedPaths.map(normalizeRepositoryPath).filter(Boolean);
  const buildRelevantPaths = normalized.filter((filePath) => !isDeploymentIndependentPath(filePath));
  return {
    changedPaths: normalized,
    buildRelevantPaths,
    ignoreBuild: normalized.length > 0 && buildRelevantPaths.length === 0,
  };
}

export function changedPathsBetween(baseSha, headSha, cwd = process.cwd()) {
  if (!COMMIT_SHA_PATTERN.test(baseSha ?? "") || !COMMIT_SHA_PATTERN.test(headSha ?? "")) {
    throw new Error("Vercel build comparison requires full Git commit SHAs.");
  }

  const result = spawnSync(
    "git",
    ["diff", "--name-only", "-z", baseSha, headSha, "--"],
    { cwd: path.resolve(cwd), encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0) {
    throw new Error(`Git diff failed while classifying the Vercel build: ${result.stderr.trim()}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

export function decideVercelBuild(environment = process.env, cwd = process.cwd()) {
  const baseSha = environment.VERCEL_GIT_PREVIOUS_SHA;
  const headSha = environment.VERCEL_GIT_COMMIT_SHA;
  if (!COMMIT_SHA_PATTERN.test(baseSha ?? "") || !COMMIT_SHA_PATTERN.test(headSha ?? "")) {
    return {
      ignoreBuild: false,
      reason: "A full previous and current Vercel Git SHA was not available.",
      changedPaths: [],
      buildRelevantPaths: [],
    };
  }

  const classification = classifyVercelBuild(changedPathsBetween(baseSha, headSha, cwd));
  return {
    ...classification,
    reason: classification.ignoreBuild
      ? "Only deployment-independent research or operations files changed."
      : classification.buildRelevantPaths.length > 0
        ? `Build-relevant files changed: ${classification.buildRelevantPaths.slice(0, 5).join(", ")}`
        : "No safely ignorable Git changes were detected.",
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  try {
    const decision = decideVercelBuild();
    console.log(
      `${decision.ignoreBuild ? "Skipping" : "Running"} Vercel build: ${decision.reason}`,
    );
    process.exitCode = decision.ignoreBuild ? 0 : 1;
  } catch (error) {
    console.error(
      `Running Vercel build because change classification failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}
