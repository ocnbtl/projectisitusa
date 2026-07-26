import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parsePrepareDataOptions } from "@/lib/research/prepare-data-plan";
import type { StateResearchConfigFile } from "@/lib/research/state-research-config";

const ROOT = process.cwd();
const { asOf } = parsePrepareDataOptions(process.argv.slice(2));
const config = JSON.parse(
  readFileSync(
    path.join(ROOT, "src/data/research/state-research-config.json"),
    "utf8",
  ),
) as StateResearchConfigFile;
const stateCodes = config.states
  .filter((entry) => entry.publicResearchProjection)
  .map((entry) => entry.stateCode)
  .sort();

for (const stateCode of stateCodes) {
  execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      path.join(ROOT, "scripts/compile-research-index.ts"),
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

process.stdout.write(
  `${JSON.stringify(
    {
      asOf,
      stateCount: stateCodes.length,
      states: stateCodes,
      sequential: true,
    },
    null,
    2,
  )}\n`,
);
