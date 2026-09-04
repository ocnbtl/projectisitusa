import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { listCountyEquivalents } from "@/lib/research/geography-registry";

import {
  loadNationalGbifDownloadPlan,
  resolveNationalGbifTaxa,
} from "./research/national-gbif-download";

import {
  buildNationalGbifDualObjectiveSelection,
  GBIF_DUAL_OBJECTIVE_STRATEGY,
  loadNationalGbifYieldPrior,
  NationalGbifYieldPriorSchema,
  type NationalGbifPlanningTaxon,
} from "./research/national-gbif-selection-planner";
import { NationalGbifYieldRescoreSchema } from "./research/build-national-gbif-yield-rescore";

const taxa: NationalGbifPlanningTaxon[] = [
  { speciesId: "alpha", scientificName: "Alpha example", taxonKey: 1, grossPairs: 100, notResearchedPairs: 100, blockedPairs: 0, alreadyResearchedPairs: 0 },
  { speciesId: "beta", scientificName: "Beta example", taxonKey: 2, grossPairs: 100, notResearchedPairs: 100, blockedPairs: 0, alreadyResearchedPairs: 0 },
  { speciesId: "delta", scientificName: "Delta example", taxonKey: 4, grossPairs: 100, notResearchedPairs: 100, blockedPairs: 0, alreadyResearchedPairs: 0 },
  { speciesId: "gamma", scientificName: "Gamma example", taxonKey: 3, grossPairs: 100, notResearchedPairs: 90, blockedPairs: 5, alreadyResearchedPairs: 5 },
];

const prior = NationalGbifYieldPriorSchema.parse({
  schemaVersion: 1,
  priorId: "gbif-yield-prior-rounds-70-77-20260819-r1",
  generatedAt: "2026-08-20T00:30:00.000Z",
  sourceAudit: {
    rounds: [70, 72, 74, 75, 76, 77],
    selectedPairs: 155_284,
    presentPairs: 6_808,
    weightedYieldBps: 438,
    implementationPath: "scripts/research/audit-national-gbif-marginal-yield.ts",
    implementationSha256: "c".repeat(64),
    resultSha256: "d".repeat(64),
  },
  universe: {
    planId: "gbif-national-download-v1-fixture",
    planSha256: "a".repeat(64),
    speciesCount: 4,
    catalogPath: "src/data/generated/species.json",
    catalogSha256: "e".repeat(64),
  },
  smoothing: { method: "empirical-bayes-binomial-v1", globalPriorPairs: 25_000, minimumScopePairs: 3_000 },
  scopePriors: [
    { scope: "display-group", key: "Beetles", selectedPairs: 12_000, presentPairs: 800, rawYieldBps: 667, smoothedYieldBps: 512 },
    { scope: "display-group", key: "Fish", selectedPairs: 8_000, presentPairs: 80, rawYieldBps: 100, smoothedYieldBps: 356 },
    { scope: "display-group", key: "Trees", selectedPairs: 10_000, presentPairs: 200, rawYieldBps: 200, smoothedYieldBps: 370 },
    { scope: "global", key: "*", selectedPairs: 155_284, presentPairs: 6_808, rawYieldBps: 438, smoothedYieldBps: 438 },
  ],
  taxonPriors: [
    { speciesId: "alpha", category: "plants", displayGroup: "Trees", scope: "display-group", scopeKey: "Trees", observedPairs: 10_000, observedPresentPairs: 200, expectedPresentBps: 370 },
    { speciesId: "beta", category: "insects", displayGroup: "Beetles", scope: "display-group", scopeKey: "Beetles", observedPairs: 12_000, observedPresentPairs: 800, expectedPresentBps: 512 },
    { speciesId: "delta", category: "plants", displayGroup: "Trees", scope: "display-group", scopeKey: "Trees", observedPairs: 10_000, observedPresentPairs: 200, expectedPresentBps: 370 },
    { speciesId: "gamma", category: "wildlife", displayGroup: "Fish", scope: "display-group", scopeKey: "Fish", observedPairs: 8_000, observedPresentPairs: 80, expectedPresentBps: 356 },
  ],
  semantics: { planningHeuristicOnly: true, guaranteesFutureYield: false, createsAbsence: false, createsNotDetected: false },
});
assert.throws(
  () => NationalGbifYieldPriorSchema.parse({
    ...prior,
    taxonPriors: prior.taxonPriors.map((entry) => entry.speciesId === "alpha"
      ? { ...entry, expectedPresentBps: entry.expectedPresentBps + 1 }
      : entry),
  }),
  /does not reconcile to its selected scope/u,
);

const model = {
  strategy: GBIF_DUAL_OBJECTIVE_STRATEGY,
  yieldPriorPath: "ops/national-research/evaluations/fixture.json",
  yieldPriorSha256: "b".repeat(64),
  movementWeightBps: 6_000,
  likelyYieldWeightBps: 4_000,
  explorationTargetBps: 2_000,
} as const;

const first = buildNationalGbifDualObjectiveSelection(taxa, prior, 250, model);
const second = buildNationalGbifDualObjectiveSelection([...taxa].reverse(), prior, 250, model);
assert.deepEqual(second, first);
assert.equal(first.exploitationTargetPairs, 200);
assert.equal(first.exploitationPairs, 200);
assert.equal(first.explorationPairs, 90);
assert.equal(first.expectedNetMovement, 290);
assert.deepEqual(first.selectedSpeciesIds, ["alpha", "beta", "gamma"]);
assert.equal(first.rankedEligibleTaxa[0]?.speciesId, "beta");
assert.equal(first.rankedEligibleTaxa.find((entry) => entry.speciesId === "gamma")?.selectionLane, "exploration");
assert.equal(first.rankedEligibleTaxa.find((entry) => entry.speciesId === "gamma")?.explorationBreadthScore, 2);
assert(!first.selectedSpeciesIds.includes("delta"));
assert.throws(
  () => buildNationalGbifDualObjectiveSelection(taxa, prior, 401, model),
  /cannot clear the selection threshold/u,
);
assert.throws(
  () => buildNationalGbifDualObjectiveSelection(taxa, prior, 250, { ...model, likelyYieldWeightBps: 3_999 }),
  /weights must sum/u,
);

const root = process.cwd();
const universePlan = loadNationalGbifDownloadPlan(path.join(
  root,
  "src/data/research/national-acquisition-plans/gbif-national-download-v1-retained-r77-v2.json",
));
const universeTaxa = resolveNationalGbifTaxa(root, universePlan);
const corpusCounts = new Map(universeTaxa.map((taxon) => [taxon.speciesId, {
  speciesId: taxon.speciesId,
  scientificName: taxon.scientificName,
  taxonKey: taxon.taxonKey,
  grossPairs: 0,
  notResearchedPairs: 0,
  blockedPairs: 0,
  alreadyResearchedPairs: 0,
}]));
for (const stateCode of universePlan.nationalV1StateCodes) {
  for (const county of listCountyEquivalents(stateCode)) {
    const shard = JSON.parse(readFileSync(path.join(
      root,
      "public/generated/research",
      stateCode,
      "counties",
      `${county.countyFips}.json`,
    ), "utf8")) as {
      pairs: Array<{ speciesId: string; displayStatus: string; researchStatus: string }>;
    };
    const pairBySpecies = new Map(shard.pairs.map((entry) => [entry.speciesId, entry]));
    for (const taxon of corpusCounts.values()) {
      taxon.grossPairs += 1;
      const pair = pairBySpecies.get(taxon.speciesId);
      if (!pair || (pair.displayStatus === "not-researched" && pair.researchStatus === "not-started")) {
        taxon.notResearchedPairs += 1;
      } else if (pair.displayStatus === "not-researched" && pair.researchStatus === "blocked") {
        taxon.blockedPairs += 1;
      } else {
        taxon.alreadyResearchedPairs += 1;
      }
    }
  }
}
const actualPrior = loadNationalGbifYieldPrior(
  path.join(root, "ops/national-research/evaluations/post-round-77-gbif-yield-prior-20260819-r1.json"),
  "9dd5d57a68949650cb7b1ff15bc654509bd92ba0062bf8349da39269b4dece37",
);
const actual = buildNationalGbifDualObjectiveSelection([...corpusCounts.values()], actualPrior, 25_000, {
  strategy: GBIF_DUAL_OBJECTIVE_STRATEGY,
  yieldPriorPath: "ops/national-research/evaluations/post-round-77-gbif-yield-prior-20260819-r1.json",
  yieldPriorSha256: "9dd5d57a68949650cb7b1ff15bc654509bd92ba0062bf8349da39269b4dece37",
  movementWeightBps: 6_000,
  likelyYieldWeightBps: 4_000,
  explorationTargetBps: 2_000,
});
assert.equal(actualPrior.sourceAudit.weightedYieldBps, 438);
assert.equal(actualPrior.taxonPriors.length, 47);
assert.deepEqual(actual.selectedSpeciesIds, [
  "aculops-fuchsiae",
  "acyrthosiphon-primulae",
  "aedeomyia-squamipennis",
  "aedes-notoscriptus",
  "aeromonas-salmonicida",
  "agrilus-cuprescens",
  "agrilus-cyanescens",
  "agrilus-ribesi",
]);
assert.equal(actual.exploitationPairs, 22_008);
assert.equal(actual.explorationPairs, 3_144);
assert.equal(actual.selectedTaxa.filter((entry) => entry.selectionLane === "exploration").length, 1);
assert(actual.selectedTaxa.every((entry) => entry.notResearchedPairs > 0));
process.stdout.write(`${JSON.stringify({
  selectedSpeciesIds: actual.selectedSpeciesIds,
  exploitationPairs: actual.exploitationPairs,
  explorationPairs: actual.explorationPairs,
}, null, 2)}\n`);

const postRound78Prior = loadNationalGbifYieldPrior(
  path.join(root, "ops/national-research/evaluations/post-round-78-gbif-yield-prior-20260820-r1.json"),
  "1a4c7d6eea0c1ad3a362743e11403ae80d2ac4693e6a3a5f24fe809ab97d2987",
);
const postRound78 = buildNationalGbifDualObjectiveSelection([...corpusCounts.values()], postRound78Prior, 25_000, {
  strategy: GBIF_DUAL_OBJECTIVE_STRATEGY,
  yieldPriorPath: "ops/national-research/evaluations/post-round-78-gbif-yield-prior-20260820-r1.json",
  yieldPriorSha256: "1a4c7d6eea0c1ad3a362743e11403ae80d2ac4693e6a3a5f24fe809ab97d2987",
  movementWeightBps: 6_000,
  likelyYieldWeightBps: 4_000,
  explorationTargetBps: 2_000,
});
assert.equal(postRound78Prior.sourceAudit.weightedYieldBps, 388);
assert.equal(postRound78Prior.taxonPriors.length, 47);
assert.deepEqual(postRound78.selectedSpeciesIds, [
  "aculops-fuchsiae",
  "acyrthosiphon-primulae",
  "aeromonas-salmonicida",
  "albizia-procera",
  "allantophomopsiella-pseudotsugae",
  "amaranthus-dubius",
  "amaranthus-graecizans",
  "amylostereum-areolatum",
]);
assert.equal(postRound78.exploitationPairs, 21_892);
assert.equal(postRound78.explorationPairs, 3_144);
assert.equal(postRound78.selectedTaxa.filter((entry) => entry.selectionLane === "exploration").length, 1);
assert.equal(postRound78.exploitationPairs + postRound78.explorationPairs, postRound78.expectedNetMovement);
assert(postRound78.expectedNetMovement >= 25_000);
assert(postRound78.selectedTaxa.every((entry) => entry.notResearchedPairs > 0));
const postRound78Artifact = NationalGbifYieldRescoreSchema.parse(JSON.parse(readFileSync(
  path.join(root, "ops/national-research/evaluations/post-round-78-gbif-exact-cache-rescore-20260820-r1.json"),
  "utf8",
)));
assert.equal(postRound78Artifact.baselineSha, "e98bc299a736e14a42e9a93ecd3026d071dc8edb");
assert.equal(postRound78Artifact.generatedContentCommit, "0afdc8a161d39476c712897c8974e33ede30eb5a");
assert.equal(postRound78Artifact.universe.countyCount, 3_144);
assert.equal(postRound78Artifact.universe.taxonCount, 47);
assert.equal(postRound78Artifact.universe.grossPairs, 147_768);
assert.equal(postRound78Artifact.corpus.notResearchedPairs, 97_464);
assert.equal(postRound78Artifact.corpus.blockedPairs, 0);
assert.equal(postRound78Artifact.corpus.alreadyResearchedPairs, 50_304);
assert.deepEqual(postRound78Artifact.selection.selectedTaxa.map((entry) => entry.speciesId), [
  "aceria-litchii",
  "adiantum-macrophyllum",
  "agdestis-clematidea",
  "aglaonema-commutatum",
  "alpinia-zerumbet",
  "alternanthera-brasiliana",
  "alternanthera-ficoidea",
  "alyssum-strigosum",
]);
assert.equal(postRound78Artifact.selection.expectedNetMovement, 25_152);
process.stdout.write(`${JSON.stringify({
  postRound78SelectedSpeciesIds: postRound78.selectedSpeciesIds,
  exploitationPairs: postRound78.exploitationPairs,
  explorationPairs: postRound78.explorationPairs,
}, null, 2)}\n`);

const postRound79Prior = loadNationalGbifYieldPrior(
  path.join(root, "ops/national-research/evaluations/post-round-79-gbif-yield-prior-20260821-r1.json"),
  "7b67b4817338bb07e784fd14b3efdd8fab814ab8ede920e32641405f4b45f04c",
);
const postRound79 = buildNationalGbifDualObjectiveSelection([...corpusCounts.values()], postRound79Prior, 25_000, {
  strategy: GBIF_DUAL_OBJECTIVE_STRATEGY,
  yieldPriorPath: "ops/national-research/evaluations/post-round-79-gbif-yield-prior-20260821-r1.json",
  yieldPriorSha256: "7b67b4817338bb07e784fd14b3efdd8fab814ab8ede920e32641405f4b45f04c",
  movementWeightBps: 6_000,
  likelyYieldWeightBps: 4_000,
  explorationTargetBps: 2_000,
});
assert.equal(postRound79Prior.sourceAudit.weightedYieldBps, 342);
assert.equal(postRound79Prior.taxonPriors.length, 47);
assert.deepEqual(postRound79.selectedSpeciesIds, [
  "aculops-fuchsiae",
  "acyrthosiphon-primulae",
  "aeromonas-salmonicida",
  "albizia-procera",
  "aleurocanthus-woglumi",
  "allantophomopsiella-pseudotsugae",
  "amaranthus-dubius",
  "amylostereum-areolatum",
]);
assert.equal(postRound79.exploitationPairs, 22_002);
assert.equal(postRound79.explorationPairs, 3_144);
assert.equal(postRound79.selectedTaxa.filter((entry) => entry.selectionLane === "exploration").length, 1);
assert.equal(postRound79.exploitationPairs + postRound79.explorationPairs, postRound79.expectedNetMovement);
assert(postRound79.expectedNetMovement >= 25_000);
assert(postRound79.selectedTaxa.every((entry) => entry.notResearchedPairs > 0));
const postRound79Artifact = NationalGbifYieldRescoreSchema.parse(JSON.parse(readFileSync(
  path.join(root, "ops/national-research/evaluations/post-round-79-gbif-exact-cache-rescore-20260821-r1.json"),
  "utf8",
)));
assert.equal(postRound79Artifact.baselineSha, "a455665766e705efa2076cf1e856ac0115afe8c6");
assert.equal(postRound79Artifact.generatedContentCommit, "a455665766e705efa2076cf1e856ac0115afe8c6");
assert.equal(postRound79Artifact.universe.countyCount, 3_144);
assert.equal(postRound79Artifact.universe.taxonCount, 47);
assert.equal(postRound79Artifact.universe.grossPairs, 147_768);
assert.equal(postRound79Artifact.corpus.notResearchedPairs, 72_312);
assert.equal(postRound79Artifact.corpus.blockedPairs, 0);
assert.equal(postRound79Artifact.corpus.alreadyResearchedPairs, 75_456);
assert.deepEqual(postRound79Artifact.selection.selectedTaxa.map((entry) => entry.speciesId), [
  "aculops-fuchsiae",
  "acyrthosiphon-primulae",
  "aeromonas-salmonicida",
  "albizia-procera",
  "allantophomopsiella-pseudotsugae",
  "amaranthus-dubius",
  "amaranthus-graecizans",
  "amylostereum-areolatum",
]);
assert.equal(postRound79Artifact.selection.expectedNetMovement, 25_152);
process.stdout.write(`${JSON.stringify({
  postRound79SelectedSpeciesIds: postRound79.selectedSpeciesIds,
  exploitationPairs: postRound79.exploitationPairs,
  explorationPairs: postRound79.explorationPairs,
}, null, 2)}\n`);

process.stdout.write("National GBIF dual-objective selection planner tests passed.\n");
