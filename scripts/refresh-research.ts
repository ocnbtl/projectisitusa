import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();

function parseAsOf(argv: string[]) {
  if (argv.length !== 2 || argv[0] !== "--as-of" || !/^\d{4}-\d{2}-\d{2}$/.test(argv[1])) {
    throw new Error("research:refresh requires --as-of <YYYY-MM-DD>.");
  }
  return argv[1];
}

function runScript(relativePath: string, arguments_: string[] = []) {
  execFileSync(process.execPath, ["--import", "tsx", path.join(ROOT, relativePath), ...arguments_], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

const asOf = parseAsOf(process.argv.slice(2));
runScript("scripts/compile-research-index.ts", ["--as-of", asOf]);
runScript("scripts/build-research-db.ts");
