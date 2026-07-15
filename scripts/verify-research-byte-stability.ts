import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SHARED_OUTPUT_FILES = [
  "src/data/generated/presence.json",
  "public/generated/presence.json",
  "src/data/generated/explorer-presence.json",
  "public/generated/explorer-presence.json",
  "src/data/generated/species.json",
  "public/generated/species.json",
  "src/data/generated/explorer-species.json",
  "public/generated/explorer-species.json",
  "src/data/generated/snapshot.json",
  "public/generated/snapshot.json",
];

type StateResearchConfigFile = {
  states: Array<{ stateCode: string; compatibilityPublication: boolean }>;
};

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseOptions(argv: string[]) {
  const stateIndex = argv.indexOf("--state");
  const asOfIndex = argv.indexOf("--as-of");
  const stateCode = argv[stateIndex + 1]?.toUpperCase();
  const asOf = argv[asOfIndex + 1];
  if (argv.length !== 4 || !/^[A-Z]{2}$/.test(stateCode ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? "")) {
    throw new Error("research:verify requires --state <XX> --as-of <YYYY-MM-DD>.");
  }
  return { stateCode: stateCode!, asOf: asOf! };
}

function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => compareText(left.name, right.name))
    .flatMap((entry) => {
      const filepath = path.join(directory, entry.name);
      return entry.isDirectory() ? listFiles(filepath) : statSync(filepath).isFile() ? [filepath] : [];
    });
}

function snapshot(outputRoots: string[], outputFiles: string[]) {
  return new Map(
    [
      ...outputRoots.flatMap((relativeRoot) => listFiles(path.join(ROOT, relativeRoot))),
      ...outputFiles.map((relativePath) => path.join(ROOT, relativePath)).filter(existsSync),
    ].map((filepath) => [
        path.relative(ROOT, filepath).split(path.sep).join("/"),
        createHash("sha256").update(readFileSync(filepath)).digest("hex"),
      ]),
  );
}

function runCompiler(stateCode: string, asOf: string) {
  execFileSync(
    process.execPath,
    ["--import", "tsx", path.join(ROOT, "scripts/compile-research-index.ts"), "--state", stateCode, "--as-of", asOf],
    { cwd: ROOT, stdio: "inherit" },
  );
}

function assertEqual(left: Map<string, string>, right: Map<string, string>, label: string) {
  const paths = [...new Set([...left.keys(), ...right.keys()])].sort(compareText);
  const changed = paths.filter((filepath) => left.get(filepath) !== right.get(filepath));
  if (changed.length > 0) {
    throw new Error(`${label}: ${changed.join(", ")}`);
  }
  return paths.length;
}

const { stateCode, asOf } = parseOptions(process.argv.slice(2));
const config = JSON.parse(
  readFileSync(path.join(ROOT, "src/data/research/state-research-config.json"), "utf8"),
) as StateResearchConfigFile;
const stateConfig = config.states.find((entry) => entry.stateCode === stateCode);
if (!stateConfig) throw new Error(`No research config exists for ${stateCode}.`);
const targetRoots = [
  `src/data/generated/research/${stateCode}`,
  `public/generated/research/${stateCode}`,
];
const targetFiles = [
  `docs/research/generated/${stateCode}-progress.json`,
  `docs/research/generated/${stateCode}-work-queue.json`,
  `docs/research/generated/${stateCode}-progress.md`,
  ...(stateConfig.compatibilityPublication
    ? [...SHARED_OUTPUT_FILES, `docs/county-coverage/states/${stateCode}.json`, `docs/county-coverage/states/${stateCode}.md`]
    : []),
];
const protectedBefore = snapshot([], SHARED_OUTPUT_FILES);
runCompiler(stateCode, asOf);
if (!stateConfig.compatibilityPublication) {
  const protectedAfterFirst = snapshot([], SHARED_OUTPUT_FILES);
  assertEqual(protectedBefore, protectedAfterFirst, `Research-only compiler changed shared runtime outputs for ${stateCode}`);
}
const first = snapshot(targetRoots, targetFiles);
runCompiler(stateCode, asOf);
const second = snapshot(targetRoots, targetFiles);
const fileCount = assertEqual(first, second, `Research compiler is not byte stable for ${stateCode}`);
console.log(JSON.stringify({ stateCode, asOf, byteStable: true, protectedSharedOutputs: !stateConfig.compatibilityPublication, fileCount }, null, 2));
