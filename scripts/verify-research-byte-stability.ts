import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const OUTPUT_ROOTS = [
  "src/data/generated/research/AL",
  "public/generated/research/AL",
  "docs/research/generated",
];

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseAsOf(argv: string[]) {
  if (argv.length !== 2 || argv[0] !== "--as-of" || !/^\d{4}-\d{2}-\d{2}$/.test(argv[1])) {
    throw new Error("research:verify requires --as-of <YYYY-MM-DD>.");
  }
  return argv[1];
}

function listFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareText(left.name, right.name))
    .flatMap((entry) => {
      const filepath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(filepath) : statSync(filepath).isFile() ? [filepath] : [];
    });
}

function snapshot() {
  return new Map(
    OUTPUT_ROOTS.flatMap((relativeRoot) => listFiles(path.join(ROOT, relativeRoot))).map((filepath) => [
      path.relative(ROOT, filepath).split(path.sep).join("/"),
      createHash("sha256").update(readFileSync(filepath)).digest("hex"),
    ]),
  );
}

function runCompiler(asOf: string) {
  execFileSync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts/compile-research-index.ts"), "--as-of", asOf],
    { cwd: ROOT, stdio: "inherit" },
  );
}

function assertEqual(left: Map<string, string>, right: Map<string, string>) {
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort(compareText);
  const changed = paths.filter((filepath) => left.get(filepath) !== right.get(filepath));
  if (changed.length > 0) {
    throw new Error(`Research compiler is not byte stable for: ${changed.join(", ")}`);
  }
  return paths.length;
}

const asOf = parseAsOf(process.argv.slice(2));
runCompiler(asOf);
const first = snapshot();
runCompiler(asOf);
const second = snapshot();
const fileCount = assertEqual(first, second);
console.log(JSON.stringify({ asOf, byteStable: true, fileCount }, null, 2));
