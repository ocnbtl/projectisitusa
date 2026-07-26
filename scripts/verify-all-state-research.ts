import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parsePrepareDataOptions } from "@/lib/research/prepare-data-plan";
import type { StateResearchConfigFile } from "@/lib/research/state-research-config";

const ROOT = process.cwd();

const { asOf } = parsePrepareDataOptions(process.argv.slice(2));
const configFile = JSON.parse(
  readFileSync(path.join(ROOT, "src/data/research/state-research-config.json"), "utf8"),
) as StateResearchConfigFile;
const stateCodes = configFile.states
  .filter((entry) => entry.publicResearchProjection)
  .map((entry) => entry.stateCode)
  .sort();

if (stateCodes.length === 0) {
  throw new Error("research:verify:all requires at least one public research projection state.");
}

for (const stateCode of stateCodes) {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(ROOT, "scripts/verify-research-byte-stability.ts"),
      "--state",
      stateCode,
      "--as-of",
      asOf,
    ],
    {
      cwd: ROOT,
      stdio: "inherit",
    },
  );
}

console.log(
  JSON.stringify(
    {
      asOf,
      stateCount: stateCodes.length,
      states: stateCodes,
      byteStable: true,
    },
    null,
    2,
  ),
);
