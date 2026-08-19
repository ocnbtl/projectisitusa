import { existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const REQUIRED_VERCEL_RUNTIME_PATHS = Object.freeze([
  "src/data/research/research-data-delivery.json",
  "src/data/research/state-research-config.json",
  "src/data/research/state-registry.json",
  "src/data/generated/species.json",
  "src/data/generated/explorer-species.json",
  "src/data/generated/counties.json",
  "src/data/generated/county-details.json",
  "src/data/generated/explorer-presence.json",
  "src/data/generated/snapshot.json",
]);

export const EXCLUDED_VERCEL_BUILD_PATHS = Object.freeze([
  "public/generated/research",
  "src/data/generated/research",
  "src/data/research/runs",
  "src/data/research/national-acquisitions",
  "ops",
  "docs",
]);

function assertRequiredRuntimeFile(projectRoot, relativePath) {
  const absolutePath = path.join(projectRoot, relativePath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`Required Vercel runtime file is missing: ${relativePath}`);
  }
}

function assertChildPath(projectRoot, candidate) {
  const relative = path.relative(projectRoot, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to prune a path outside the Vercel project root: ${candidate}`);
  }
}

export function prepareVercelBuild(root, environment = process.env) {
  const projectRoot = path.resolve(root);

  if (environment.VERCEL !== "1") {
    return { mode: "local" };
  }

  for (const relativePath of REQUIRED_VERCEL_RUNTIME_PATHS) {
    assertRequiredRuntimeFile(projectRoot, relativePath);
  }

  const removedPaths = [];
  for (const relativePath of EXCLUDED_VERCEL_BUILD_PATHS) {
    const absolutePath = path.join(projectRoot, relativePath);
    assertChildPath(projectRoot, absolutePath);
    if (existsSync(absolutePath)) {
      rmSync(absolutePath, { recursive: true, force: false });
      removedPaths.push(relativePath);
    }
  }

  return {
    mode: "vercel",
    requiredRuntimeFileCount: REQUIRED_VERCEL_RUNTIME_PATHS.length,
    excludedPathCount: EXCLUDED_VERCEL_BUILD_PATHS.length,
    removedPathCount: removedPaths.length,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = prepareVercelBuild(process.cwd());
  if (result.mode === "vercel") {
    console.log(
      `Prepared trimmed Vercel workspace (${result.requiredRuntimeFileCount} runtime files present; ${result.removedPathCount}/${result.excludedPathCount} deployment-independent paths pruned).`,
    );
  }
}
