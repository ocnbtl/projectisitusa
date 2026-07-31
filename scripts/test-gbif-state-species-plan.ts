import { readFileSync } from "node:fs";

import { buildGbifStateSpeciesPlan } from "./plan-gbif-state-species-batches";

import { stableJson } from "@/lib/research/run-files";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  readFileSync("scripts/plan-gbif-state-species-batches.ts", "utf8").includes(
    '"public/generated/research"',
  ),
  "The GBIF planner must rank current evidence from the published county projections.",
);

const input = {
  root: process.cwd(),
  planId: "synthetic-determinism-check",
  stateCode: "AL",
  limit: 10,
  speciesPerBatch: 4,
};
const first = buildGbifStateSpeciesPlan(input);
const second = buildGbifStateSpeciesPlan(input);

assert(
  stableJson(first) === stableJson(second),
  "Repeated GBIF state-species planning was not deterministic.",
);
assert(
  first.selectedStateSpeciesScreenCount === 10 &&
    first.selectedCountyOutcomeCount === 670,
  "The Alabama planner did not expand ten state-species screens to all 67 counties.",
);
assert(
  first.selected.every(
    (entry) =>
      entry.stateCode === "AL" &&
      entry.protocolCompletionStatus !== "complete" &&
      entry.researchStatus === "applicable" &&
      entry.scientificName.trim().split(/\s+/).length === 2,
  ),
  "The planner admitted a completed, non-applicable, or non-binomial target.",
);
const pairKeys = first.candidateFiles.flatMap((file) =>
  file.candidates.map(
    (entry) => `${entry.countyFips}:${entry.speciesId}`,
  )
);
assert(
  new Set(pairKeys).size === pairKeys.length,
  "The planner emitted overlapping county-species pairs.",
);
assert(
  first.candidateFiles.every(
    (file) =>
      file.candidateCount ===
        file.stateSpeciesScreenCount * first.countyCount &&
      file.candidateCount === file.distinctPairCount,
  ),
  "A planned batch does not contain every active county exactly once per species.",
);

console.log(
  JSON.stringify(
    {
      deterministic: true,
      stateSpeciesScreens: first.selectedStateSpeciesScreenCount,
      countyOutcomes: first.selectedCountyOutcomeCount,
      countyCount: first.countyCount,
      batchCount: first.batches.length,
      overlappingPairs: 0,
    },
    null,
    2,
  ),
);
