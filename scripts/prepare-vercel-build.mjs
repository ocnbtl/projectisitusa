import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function assertChildPath(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove a path outside the project root: ${candidate}`);
  }
}

export function prepareVercelBuild(root, environment = process.env) {
  const projectRoot = path.resolve(root);
  const authoritativeRoot = path.join(projectRoot, "src", "data", "generated", "research");
  const publicMirrorRoot = path.join(projectRoot, "public", "generated", "research");

  if (environment.VERCEL !== "1") {
    return { mode: "local", removedPublicMirror: false };
  }

  if (!existsSync(authoritativeRoot) || readdirSync(authoritativeRoot).length === 0) {
    throw new Error(`Research summary projection is missing or empty: ${authoritativeRoot}`);
  }

  assertChildPath(projectRoot, publicMirrorRoot);
  const removedPublicMirror = existsSync(publicMirrorRoot);
  if (removedPublicMirror) {
    rmSync(publicMirrorRoot, { recursive: true, force: false });
  }

  return { mode: "vercel", removedPublicMirror };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const result = prepareVercelBuild(process.cwd());
  if (result.mode === "vercel") {
    console.log(
      `Prepared Vercel build for pointer-resolved research projection (public mirror removed: ${result.removedPublicMirror}).`,
    );
  }
}
