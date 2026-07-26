import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parsePrepareDataOptions } from "@/lib/research/prepare-data-plan";
import {
  selectStateResearchConfig,
  type StateResearchConfigFile,
} from "@/lib/research/state-research-config";

const ROOT = process.cwd();

function parseOptions(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--state", "--as-of"]).has(flag) || !value || value.startsWith("--")) {
      throw new Error("refresh:data requires --state <XX> --as-of <YYYY-MM-DD>.");
    }
    if (values.has(flag)) throw new Error(`Duplicate refresh:data argument: ${flag}.`);
    values.set(flag, value);
  }
  const stateCode = values.get("--state")?.toUpperCase();
  if (!stateCode || !/^[A-Z]{2}$/.test(stateCode)) {
    throw new Error("refresh:data requires --state <XX> --as-of <YYYY-MM-DD>.");
  }
  const { asOf } = parsePrepareDataOptions(["--as-of", values.get("--as-of") ?? ""]);
  return { stateCode, asOf };
}

function runScript(relativePath: string, arguments_: string[] = []) {
  execFileSync(process.execPath, ["--import", "tsx", path.join(ROOT, relativePath), ...arguments_], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

const { stateCode, asOf } = parseOptions(process.argv.slice(2));
const configFile = JSON.parse(
  readFileSync(path.join(ROOT, "src/data/research/state-research-config.json"), "utf8"),
) as StateResearchConfigFile;
const stateConfig = selectStateResearchConfig(configFile, stateCode);

runScript("scripts/import-usriis.ts");
runScript("scripts/import-county-presence.ts");
runScript("scripts/prepare-data.ts", ["--as-of", asOf]);
if (!stateConfig.compatibilityPublication) {
  runScript("scripts/compile-research-index.ts", ["--state", stateCode, "--as-of", asOf]);
}
runScript("scripts/build-research-db.ts", ["--state", stateCode]);
