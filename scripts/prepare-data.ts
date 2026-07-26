import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildPrepareDataPlan,
  parsePrepareDataOptions,
} from "@/lib/research/prepare-data-plan";
import type { StateResearchConfigFile } from "@/lib/research/state-research-config";

const ROOT = process.cwd();

function runScript(relativePath: string, arguments_: string[]) {
  execFileSync(process.execPath, ["--import", "tsx", path.join(ROOT, relativePath), ...arguments_], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

const { asOf } = parsePrepareDataOptions(process.argv.slice(2));
const config = JSON.parse(
  readFileSync(path.join(ROOT, "src/data/research/state-research-config.json"), "utf8"),
) as StateResearchConfigFile;
const plan = buildPrepareDataPlan(config, asOf);

console.log(
  JSON.stringify(
    {
      asOf,
      authoritativeStates: plan
        .filter((step) => step.kind === "authoritative-research")
        .map((step) => step.stateCode),
      steps: plan.length,
    },
    null,
    2,
  ),
);

for (const step of plan) {
  runScript(step.script, step.arguments);
}
