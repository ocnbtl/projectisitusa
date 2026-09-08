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
  "src/data/runtime/image-assets.json",
  "src/data/runtime/data-assets.json",
]);

export const EXCLUDED_VERCEL_BUILD_PATHS = Object.freeze([
  "public/generated/research",
  "src/data/generated/research",
  "src/data/research/runs",
  "src/data/research/question-assessments",
  "src/data/research/official-occurrence-records",
  "src/data/research/national-acquisitions",
  "src/data/research/taxonomy-references",
  "ops",
  "docs",
]);

export const GENERATED_BUILD_INPUT_PATHS = Object.freeze(["public/species", "public/generated"]);

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

  // The preceding asset build checks every derivative and both data declarations.
  // Keep source images in the canonical checkout; prune only the disposable Vercel build.
  const inputPathsRemoved = [];
  for (const relativePath of GENERATED_BUILD_INPUT_PATHS) {
    const absolutePath = path.join(projectRoot, relativePath);
    assertChildPath(projectRoot, absolutePath);
    if (existsSync(absolutePath)) {
      rmSync(absolutePath, { recursive: true, force: false });
      inputPathsRemoved.push(relativePath);
    }
  }

  return {
    mode: "vercel",
    inputPathsRemoved,
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
