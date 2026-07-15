import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();

function parseOptions(argv: string[]) {
  const stateIndex = argv.indexOf("--state");
  const asOfIndex = argv.indexOf("--as-of");
  const stateCode = argv[stateIndex + 1]?.toUpperCase();
  const asOf = argv[asOfIndex + 1];
  if (argv.length !== 4 || !/^[A-Z]{2}$/.test(stateCode ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(asOf ?? "")) {
    throw new Error("research:refresh requires --state <XX> --as-of <YYYY-MM-DD>.");
  }
  return { stateCode: stateCode!, asOf: asOf! };
}

function runScript(relativePath: string, arguments_: string[] = []) {
  execFileSync(process.execPath, ["--import", "tsx", path.join(ROOT, relativePath), ...arguments_], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

const { stateCode, asOf } = parseOptions(process.argv.slice(2));
runScript("scripts/compile-research-index.ts", ["--state", stateCode, "--as-of", asOf]);
runScript("scripts/build-research-db.ts", ["--state", stateCode]);
