import { readFileSync } from "node:fs";

import {
  buildGbifStateSpeciesPlan,
  completedGbifPairKeys,
} from "./plan-gbif-state-species-batches";

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

const exhaustedStateInput = {
  root: process.cwd(),
  planId: "synthetic-determinism-check",
  stateCode: "TN",
  limit: 10,
  speciesPerBatch: 4,
};
const exhaustedFirst = buildGbifStateSpeciesPlan(exhaustedStateInput);
const exhaustedSecond = buildGbifStateSpeciesPlan(exhaustedStateInput);

assert(
  stableJson(exhaustedFirst) === stableJson(exhaustedSecond),
  "Repeated GBIF state-species planning was not deterministic.",
);
assert(
  exhaustedFirst.selectedStateSpeciesScreenCount > 0 ||
    (exhaustedFirst.selectedStateSpeciesScreenCount === 0 &&
      exhaustedFirst.selectedCountyOutcomeCount === 0 &&
      exhaustedFirst.expectedNetNewPairCount === 0 &&
      exhaustedFirst.selected.length === 0 &&
      exhaustedFirst.candidateFiles.length === 0 &&
      exhaustedFirst.batches.length === 0),
  "An exhausted Tennessee plan did not return an honest empty result.",
);

const stateRegistry = JSON.parse(
  readFileSync("src/data/research/state-registry.json", "utf8"),
) as { nationalV1: { certificationOrder: string[] } };
let input: typeof exhaustedStateInput | null = null;
let first: ReturnType<typeof buildGbifStateSpeciesPlan> | null = null;
for (const stateCode of stateRegistry.nationalV1.certificationOrder) {
  const candidateInput = {
    ...exhaustedStateInput,
    planId: `synthetic-determinism-check-${stateCode.toLowerCase()}`,
    stateCode,
  };
  const candidatePlan = buildGbifStateSpeciesPlan(candidateInput);
  if (
    candidatePlan.selectedStateSpeciesScreenCount > 0 &&
    candidatePlan.expectedNetNewPairCount > 0
  ) {
    input = candidateInput;
    first = candidatePlan;
    break;
  }
}
assert(
  input && first,
  "No jurisdiction exposed a nonempty GBIF planner scope with net-new pairs.",
);
const second = buildGbifStateSpeciesPlan(input);

assert(
  stableJson(first) === stableJson(second),
  "Repeated nonempty GBIF state-species planning was not deterministic.",
);
assert(
  first.selectedStateSpeciesScreenCount <= input.limit &&
    first.selectedCountyOutcomeCount > 0 &&
    first.selectedCountyOutcomeCount <= 950,
  "The planner did not emit a nonempty bounded state-species selection.",
);
assert(
  first.expectedNetNewPairCount > 0 &&
    first.expectedNetNewPairCount <= first.selectedCountyOutcomeCount,
  "The planner did not report a bounded positive net-new pair estimate.",
);
assert(
  /^[0-9a-f]{64}$/.test(first.inputHashes.countyResearchProjections) &&
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
      entry.stateCode === input.stateCode &&
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
const completePairs = completedGbifPairKeys(process.cwd(), input.stateCode);
assert(
  pairKeys.every((pairKey) => !completePairs.has(pairKey)),
  "The planner emitted a county-species pair already complete in an immutable run.",
);
assert(
  first.deduplication.immutableCompletePairCount === completePairs.size &&
    first.deduplication.preventedCompletedPairCount >= 0 &&
    first.deduplication.fullyCompletedStateSpeciesExcluded >= 0 &&
    first.deduplication.taxonomyBlockedStateSpeciesExcluded >= 0,
  "The planner did not report its immutable-run deduplication accounting.",
);

const taxonomyCachePath =
  "src/data/research/caches/gbif-taxonomy-20260809-r55.json";
const taxonomyCache = JSON.parse(readFileSync(taxonomyCachePath, "utf8")) as {
  entries: Array<{ speciesId: string }>;
};
const cachedSpeciesIds = new Set(
  taxonomyCache.entries.map((entry) => entry.speciesId),
);
const cacheAware = buildGbifStateSpeciesPlan({
  root: process.cwd(),
  planId: "synthetic-cache-aware-check",
  stateCode: "RI",
  limit: 5_000,
  speciesPerBatch: 1,
  taxonomyCachePath,
  requirePositiveNet: true,
});
const cacheAwareSelectionIsHonestEmpty =
  cacheAware.selectedStateSpeciesScreenCount === 0 &&
  cacheAware.selected.length === 0 &&
  cacheAware.selectedCountyOutcomeCount === 0 &&
  cacheAware.expectedNetNewPairCount === 0 &&
  cacheAware.batches.length === 0 &&
  cacheAware.candidateFiles.length === 0 &&
  cacheAware.deduplication.cachedEligibleStateSpeciesScreenCount === 0;
assert(
  cacheAware.selected.every(
    (entry) =>
      entry.notResearchedCountyCount > 0 &&
      cachedSpeciesIds.has(entry.speciesId),
  ) &&
    (cacheAware.selectedStateSpeciesScreenCount > 0 ||
      cacheAwareSelectionIsHonestEmpty),
  "The cache-aware planner admitted an uncached or zero-net state-species screen.",
);
assert(
  cacheAware.inputHashes.taxonomyCache &&
    cacheAware.rankingInputs.cachedTaxonomyEntryCount ===
      taxonomyCache.entries.length &&
    cacheAware.deduplication.cachedEligibleStateSpeciesScreenCount ===
      cacheAware.selectedStateSpeciesScreenCount,
  "The cache-aware planner did not preserve its cache provenance and selection accounting.",
);

console.log(
  JSON.stringify(
    {
      deterministic: true,
      exhaustedTennessee:
        exhaustedFirst.selectedStateSpeciesScreenCount === 0,
      selectedStateCode: input.stateCode,
      stateSpeciesScreens: first.selectedStateSpeciesScreenCount,
      countyOutcomes: first.selectedCountyOutcomeCount,
      expectedNetNewPairs: first.expectedNetNewPairCount,
      countyCount: first.countyCount,
      batchCount: first.batches.length,
      overlappingPairs: 0,
      cacheAwareStateExhausted:
        cacheAware.selectedStateSpeciesScreenCount === 0,
    },
    null,
    2,
  ),
);
