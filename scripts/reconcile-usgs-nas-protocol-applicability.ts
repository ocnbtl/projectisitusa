import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ResearchProtocolsFile } from "@/lib/research/protocol-cells";

const ROOT = process.cwd();
const SOURCE_ID = "usgs-nas";
const PLAN_DIRECTORY = path.join(
  ROOT,
  "src/data/research/national-acquisition-plans",
);
const PROTOCOL_PATH = path.join(
  ROOT,
  "src/data/research/research-protocols.json",
);

type Plan = {
  schemaVersion: 1;
  planId: string;
  sourceId: "usgs-nas";
  archiveVersion: "1.344";
  screens: Array<{
    stateCode: string;
    speciesId: string;
    scientificName: string;
  }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

const planFiles = readdirSync(PLAN_DIRECTORY)
  .filter((entry) => /^usgs-nas-.*\.json$/.test(entry))
  .sort(compareText);
assert(planFiles.length > 0, "No USGS NAS national plans were found.");

const pairSet = new Set<string>();
for (const filename of planFiles) {
  const plan = JSON.parse(
    readFileSync(path.join(PLAN_DIRECTORY, filename), "utf8"),
  ) as Plan;
  assert(
    plan.schemaVersion === 1 &&
      plan.sourceId === SOURCE_ID &&
      plan.archiveVersion === "1.344",
    `Unsupported USGS NAS plan contract: ${filename}.`,
  );
  for (const screen of plan.screens) {
    pairSet.add(`${screen.stateCode}:${screen.speciesId}`);
  }
}

const protocols = JSON.parse(
  readFileSync(PROTOCOL_PATH, "utf8"),
) as ResearchProtocolsFile;
let removedBroadBindings = 0;
let exactBindings = 0;

for (const protocol of protocols.protocols) {
  if (!protocol.sourceUniverse.includes(SOURCE_ID)) continue;
  const retainedRules = [];
  for (const rule of protocol.rules) {
    if (rule.ruleId === "usgs-nas-exact-plan-scope-v1") continue;
    if (!rule.applicableSourceIds.includes(SOURCE_ID)) {
      retainedRules.push(rule);
      continue;
    }
    removedBroadBindings += 1;
    const remainingSourceIds = rule.applicableSourceIds.filter(
      (sourceId) => sourceId !== SOURCE_ID,
    );
    if (remainingSourceIds.length > 0) {
      retainedRules.push({
        ...rule,
        applicableSourceIds: remainingSourceIds,
      });
    }
  }
  const stateCodes = new Set(protocol.stateCodes);
  const values = [...pairSet]
    .filter((pair) => stateCodes.has(pair.slice(0, 2)))
    .sort(compareText);
  if (values.length > 0) {
    retainedRules.push({
      ruleId: "usgs-nas-exact-plan-scope-v1",
      speciesSelector: {
        kind: "state-species-pair" as const,
        values,
      },
      applicableSourceIds: [SOURCE_ID],
      basis: [
        {
          kind: "hash-pinned-national-plan-set",
          reference: planFiles
            .map((filename) => `src/data/research/national-acquisition-plans/${filename}`)
            .join(","),
          note: "USGS NAS source applicability is limited to the exact versioned archive screens in the reviewed national plans. Omitted state-species combinations are not applicable to this source protocol and remain separate state-applicability decisions.",
        },
      ],
    });
  }
  protocol.rules = retainedRules;
  exactBindings += values.length;
}

protocols.updatedAt = "2026-07-26";
writeFileSync(PROTOCOL_PATH, `${JSON.stringify(protocols, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      sourceId: SOURCE_ID,
      archiveVersion: "1.344",
      planFiles: planFiles.length,
      distinctStateSpeciesScreens: pairSet.size,
      exactProtocolBindings: exactBindings,
      removedBroadRuleBindings: removedBroadBindings,
    },
    null,
    2,
  ),
);
