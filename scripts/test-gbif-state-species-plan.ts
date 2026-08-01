import { readFileSync } from "node:fs";

import { buildGbifStateSpeciesPlan } from "./plan-gbif-state-species-batches";

import {
  listImmutableResearchRuns,
  stableJson,
} from "@/lib/research/run-files";

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
  stateCode: "TN",
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
  first.selectedStateSpeciesScreenCount > 0 &&
    first.selectedStateSpeciesScreenCount <= input.limit &&
    first.selectedCountyOutcomeCount > 0 &&
    first.selectedCountyOutcomeCount <= 950,
  "The Tennessee planner did not emit a nonempty bounded state-species selection.",
);
assert(
  first.expectedNetNewPairCount > 0 &&
    first.expectedNetNewPairCount <= first.selectedCountyOutcomeCount,
  "The Tennessee planner did not report a bounded positive net-new pair estimate.",
);
assert(
  first.inputHashes.countyResearchProjections.length === 64 &&
    first.rankingInputs.countyProjectionFileCount === first.countyCount,
  "The planner did not hash every current county projection used for net-new ranking.",
);
assert(
  first.selected.every(
    (entry, index, entries) =>
      index === 0 ||
      entries[index - 1].notResearchedCountyCount >=
        entry.notResearchedCountyCount,
  ),
  "The planner did not rank state-species targets by net-new pair value first.",
);
assert(
  first.selected.every(
    (entry) =>
      entry.stateCode === "TN" &&
      entry.protocolCompletionStatus !== "complete" &&
      entry.researchStatus === "applicable" &&
      entry.speciesId !== "schedonorus-arundinaceus" &&
      entry.scientificName.trim().split(/\s+/).length === 2,
  ),
  "The planner admitted a completed, taxonomy-blocked, non-applicable, or non-binomial target.",
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
      file.candidateCount <=
        file.stateSpeciesScreenCount * first.countyCount &&
      file.candidateCount <= 5_000 &&
      file.candidateCount === file.distinctPairCount,
  ),
  "A planned batch exceeds the runner or state-species denominator, or contains duplicate pairs.",
);
assert(
  pairKeys.length === first.selectedCountyOutcomeCount,
  "The plan county-outcome total differs from its candidate files.",
);
const completePairs = new Set(
  listImmutableResearchRuns(process.cwd())
    .flatMap((bundle) => bundle.outcomes)
    .filter(
      (outcome) =>
        outcome.state_code === "TN" &&
        outcome.source_id === "gbif-preserved-specimens" &&
        outcome.scope_complete,
    )
    .map(
      (outcome) => `${outcome.county_fips}:${outcome.species_id}`,
    ),
);
assert(
  pairKeys.every((pairKey) => !completePairs.has(pairKey)),
  "The planner emitted a county-species pair already complete in an immutable run.",
);
assert(
  first.deduplication.immutableCompletePairCount === completePairs.size &&
    first.deduplication.preventedCompletedPairCount >= 0 &&
    first.deduplication.fullyCompletedStateSpeciesExcluded >= 0 &&
    first.deduplication.taxonomyBlockedStateSpeciesExcluded >= 1,
  "The planner did not report its immutable-run deduplication accounting.",
);

console.log(
  JSON.stringify(
    {
      deterministic: true,
      stateSpeciesScreens: first.selectedStateSpeciesScreenCount,
      countyOutcomes: first.selectedCountyOutcomeCount,
      expectedNetNewPairs: first.expectedNetNewPairCount,
      countyCount: first.countyCount,
      batchCount: first.batches.length,
      overlappingPairs: 0,
    },
    null,
    2,
  ),
);
