import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  assertLegacyMatrixWriteAllowed,
  buildPrepareDataPlan,
  parsePrepareDataOptions,
} from "@/lib/research/prepare-data-plan";
import type { StateResearchConfigFile } from "@/lib/research/state-research-config";

const ROOT = process.cwd();

function expectFailure(callback: () => unknown, pattern: RegExp) {
  assert.throws(callback, pattern);
}

assert.deepEqual(parsePrepareDataOptions(["--as-of", "2026-07-16"]), {
  asOf: "2026-07-16",
});
expectFailure(() => parsePrepareDataOptions([]), /requires --as-of/);
expectFailure(
  () => parsePrepareDataOptions(["--as-of", "2026-07-16", "--as-of", "2026-07-17"]),
  /Duplicate prepare:data argument/,
);
expectFailure(() => parsePrepareDataOptions(["--state", "AL"]), /requires --as-of/);
expectFailure(() => parsePrepareDataOptions(["--as-of", "2026-02-30"]), /valid calendar date/);

const config: StateResearchConfigFile = {
  schemaVersion: 1,
  states: [
    {
      stateCode: "ZZ",
      mode: "authoritative",
      speciesScope: {
        mode: "catalog-all",
        applicabilityPath: null,
        undeterminedSpeciesPolicy: "included-grandfathered-baseline",
      },
      bootstrapLedgerAllowed: true,
      compatibilityPublication: true,
      migrationCandidatesPath: "zz.json",
      publicResearchProjection: true,
    },
    {
      stateCode: "AK",
      mode: "research-only",
      speciesScope: {
        mode: "explicit",
        applicabilityPath: "ak.json",
        undeterminedSpeciesPolicy: "excluded",
      },
      bootstrapLedgerAllowed: false,
      compatibilityPublication: false,
      migrationCandidatesPath: "ak-candidates.json",
      publicResearchProjection: true,
    },
    {
      stateCode: "AL",
      mode: "authoritative",
      speciesScope: {
        mode: "catalog-all",
        applicabilityPath: null,
        undeterminedSpeciesPolicy: "included-grandfathered-baseline",
      },
      bootstrapLedgerAllowed: true,
      compatibilityPublication: true,
      migrationCandidatesPath: "al.json",
      publicResearchProjection: true,
    },
  ],
};

const plan = buildPrepareDataPlan(config, "2026-07-16");
assert.deepEqual(plan, [
  {
    kind: "legacy-base",
    script: "scripts/build-data.ts",
    arguments: [],
  },
  {
    kind: "authoritative-research",
    stateCode: "AL",
    script: "scripts/compile-research-index.ts",
    arguments: ["--state", "AL", "--as-of", "2026-07-16"],
  },
  {
    kind: "authoritative-research",
    stateCode: "ZZ",
    script: "scripts/compile-research-index.ts",
    arguments: ["--state", "ZZ", "--as-of", "2026-07-16"],
  },
]);
assert.deepEqual(buildPrepareDataPlan(config, "2026-07-16"), plan);
assert.equal(
  plan.some((step) => /matrix|import|network|research-db/.test(step.script)),
  false,
);

expectFailure(
  () => buildPrepareDataPlan({ schemaVersion: 1, states: [config.states[1]!] }, "2026-07-16"),
  /at least one compatibility publication state/,
);
expectFailure(() => assertLegacyMatrixWriteAllowed(config, "AL"), /compiler-owned/);
assert.doesNotThrow(() => assertLegacyMatrixWriteAllowed(config, "AK"));

const packageJson = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};
assert.equal(packageJson.scripts["prepare:data"], "node --import tsx scripts/prepare-data.ts");
assert.equal(packageJson.scripts["refresh:data"], "node --import tsx scripts/refresh-data.ts");
assert.equal(
  packageJson.scripts["check:prepare-data-plan"],
  "node --import tsx scripts/test-prepare-data-plan.ts",
);
assert.match(packageJson.scripts["check:research-integrity"] ?? "", /check:prepare-data-plan/);

console.log(
  JSON.stringify(
    {
      prepareDataPlan: "passed",
      authoritativeStates: plan
        .filter((step) => step.kind === "authoritative-research")
        .map((step) => step.stateCode),
      deterministic: true,
      legacyMatrixGuard: true,
    },
    null,
    2,
  ),
);
