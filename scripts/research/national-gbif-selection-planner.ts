import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { z } from "zod";

export const GBIF_DUAL_OBJECTIVE_STRATEGY = "movement-yield-exploration-v2" as const;

const SpeciesIdSchema = z.string().regex(/^[a-z0-9-]+$/u);
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

const YieldScopeSchema = z.union([
  z.literal("display-group"),
  z.literal("category"),
  z.literal("global"),
]);

export const NationalGbifYieldPriorSchema = z.object({
  schemaVersion: z.literal(1),
  priorId: z.string().regex(/^gbif-yield-prior-rounds-[0-9-]+-[0-9]{8}-r[0-9]+$/u),
  generatedAt: z.string().datetime(),
  sourceAudit: z.object({
    rounds: z.array(z.number().int().positive()).min(1),
    selectedPairs: z.number().int().positive(),
    presentPairs: z.number().int().nonnegative(),
    weightedYieldBps: z.number().int().min(0).max(10_000),
    implementationPath: z.literal("scripts/research/audit-national-gbif-marginal-yield.ts"),
    implementationSha256: Sha256Schema,
    resultSha256: Sha256Schema,
  }).strict(),
  universe: z.object({
    planId: z.string().regex(/^gbif-national-download-v1-[a-z0-9-]+$/u),
    planSha256: Sha256Schema,
    speciesCount: z.number().int().positive().max(500),
    catalogPath: z.literal("src/data/generated/species.json"),
    catalogSha256: Sha256Schema,
  }).strict(),
  smoothing: z.object({
    method: z.literal("empirical-bayes-binomial-v1"),
    globalPriorPairs: z.number().int().positive(),
    minimumScopePairs: z.number().int().positive(),
  }).strict(),
  scopePriors: z.array(z.object({
    scope: YieldScopeSchema,
    key: z.string().min(1),
    selectedPairs: z.number().int().nonnegative(),
    presentPairs: z.number().int().nonnegative(),
    rawYieldBps: z.number().int().min(0).max(10_000),
    smoothedYieldBps: z.number().int().min(0).max(10_000),
  }).strict()).min(1),
  taxonPriors: z.array(z.object({
    speciesId: SpeciesIdSchema,
    category: z.string().min(1),
    displayGroup: z.string().min(1),
    scope: YieldScopeSchema,
    scopeKey: z.string().min(1),
    observedPairs: z.number().int().nonnegative(),
    observedPresentPairs: z.number().int().nonnegative(),
    expectedPresentBps: z.number().int().min(0).max(10_000),
  }).strict()).min(1).max(500),
  semantics: z.object({
    planningHeuristicOnly: z.literal(true),
    guaranteesFutureYield: z.literal(false),
    createsAbsence: z.literal(false),
    createsNotDetected: z.literal(false),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (new Set(value.sourceAudit.rounds).size !== value.sourceAudit.rounds.length) {
    context.addIssue({ code: "custom", message: "GBIF yield-prior audit rounds must be unique." });
  }
  if (value.sourceAudit.presentPairs > value.sourceAudit.selectedPairs) {
    context.addIssue({ code: "custom", message: "GBIF yield-prior present pairs exceed selected pairs." });
  }
  if (
    value.sourceAudit.weightedYieldBps !==
    Math.round((value.sourceAudit.presentPairs * 10_000) / value.sourceAudit.selectedPairs)
  ) {
    context.addIssue({ code: "custom", message: "GBIF yield-prior weighted yield does not reconcile to its audited pairs." });
  }
  const speciesIds = value.taxonPriors.map((entry) => entry.speciesId);
  if (
    speciesIds.length !== value.universe.speciesCount ||
    new Set(speciesIds).size !== speciesIds.length ||
    [...speciesIds].sort(compareText).join("\n") !== speciesIds.join("\n")
  ) {
    context.addIssue({ code: "custom", message: "GBIF yield-prior taxa must exactly match its sorted universe count." });
  }
  const scopeKeys = value.scopePriors.map((entry) => `${entry.scope}:${entry.key}`);
  if (new Set(scopeKeys).size !== scopeKeys.length) {
    context.addIssue({ code: "custom", message: "GBIF yield-prior scope keys must be unique." });
  }
  const global = value.scopePriors.find((entry) => entry.scope === "global" && entry.key === "*");
  if (
    !global ||
    value.scopePriors.filter((entry) => entry.scope === "global").length !== 1 ||
    global.selectedPairs !== value.sourceAudit.selectedPairs ||
    global.presentPairs !== value.sourceAudit.presentPairs ||
    global.rawYieldBps !== value.sourceAudit.weightedYieldBps ||
    global.smoothedYieldBps !== value.sourceAudit.weightedYieldBps
  ) {
    context.addIssue({ code: "custom", message: "GBIF yield-prior global scope does not reconcile to its audit." });
  }
  const scopeByKey = new Map(value.scopePriors.map((entry) => [`${entry.scope}:${entry.key}`, entry]));
  for (const prior of value.scopePriors) {
    if (prior.presentPairs > prior.selectedPairs) {
      context.addIssue({ code: "custom", message: `GBIF ${prior.scope} prior ${prior.key} has more present than selected pairs.` });
    }
    const rawYieldBps = prior.selectedPairs === 0 ? 0 : Math.round((prior.presentPairs * 10_000) / prior.selectedPairs);
    const smoothedYieldBps = prior.scope === "global"
      ? value.sourceAudit.weightedYieldBps
      : Math.round(
        ((prior.presentPairs * 10_000) + (value.sourceAudit.weightedYieldBps * value.smoothing.globalPriorPairs)) /
          (prior.selectedPairs + value.smoothing.globalPriorPairs),
      );
    if (prior.rawYieldBps !== rawYieldBps || prior.smoothedYieldBps !== smoothedYieldBps) {
      context.addIssue({ code: "custom", message: `GBIF ${prior.scope} prior ${prior.key} has invalid yield math.` });
    }
  }
  for (const prior of value.taxonPriors) {
    if (prior.observedPresentPairs > prior.observedPairs) {
      context.addIssue({ code: "custom", message: `GBIF taxon prior ${prior.speciesId} has more present than observed pairs.` });
    }
    const source = scopeByKey.get(`${prior.scope}:${prior.scopeKey}`);
    const scopeMatchesTaxon = prior.scope === "display-group"
      ? prior.scopeKey === prior.displayGroup
      : prior.scope === "category"
        ? prior.scopeKey === prior.category
        : prior.scopeKey === "*";
    if (
      !source ||
      !scopeMatchesTaxon ||
      prior.observedPairs !== source.selectedPairs ||
      prior.observedPresentPairs !== source.presentPairs ||
      prior.expectedPresentBps !== source.smoothedYieldBps ||
      (prior.scope !== "global" && prior.observedPairs < value.smoothing.minimumScopePairs)
    ) {
      context.addIssue({ code: "custom", message: `GBIF taxon prior ${prior.speciesId} does not reconcile to its selected scope.` });
    }
  }
});

export type NationalGbifYieldPrior = z.infer<typeof NationalGbifYieldPriorSchema>;

export const NationalGbifSelectionModelSchema = z.object({
  strategy: z.literal(GBIF_DUAL_OBJECTIVE_STRATEGY),
  yieldPriorPath: z.string().regex(/^ops\/national-research\/evaluations\/[a-z0-9.-]+\.json$/u),
  yieldPriorSha256: Sha256Schema,
  movementWeightBps: z.number().int().min(1).max(9_999),
  likelyYieldWeightBps: z.number().int().min(1).max(9_999),
  explorationTargetBps: z.number().int().min(1).max(4_999),
}).strict().superRefine((value, context) => {
  if (value.movementWeightBps + value.likelyYieldWeightBps !== 10_000) {
    context.addIssue({ code: "custom", message: "GBIF selection objective weights must sum to 10,000 bps." });
  }
});

export type NationalGbifSelectionModel = z.infer<typeof NationalGbifSelectionModelSchema>;

export type NationalGbifPlanningTaxon = {
  speciesId: string;
  scientificName: string;
  taxonKey: number;
  grossPairs: number;
  notResearchedPairs: number;
  blockedPairs: number;
  alreadyResearchedPairs: number;
};

export type NationalGbifRankedTaxon = NationalGbifPlanningTaxon & {
  category: string;
  displayGroup: string;
  yieldPriorScope: "display-group" | "category" | "global";
  yieldPriorScopeKey: string;
  yieldPriorObservedPairs: number;
  yieldPriorPresentPairs: number;
  expectedPresentBps: number;
  movementScoreBps: number;
  likelyYieldScoreBps: number;
  compositeScoreBps: number;
  exploitationRank: number;
  explorationRank: number | null;
  explorationBreadthScore: 0 | 1 | 2;
  selectionLane: "exploitation" | "exploration" | null;
};

export type NationalGbifDualObjectiveSelection = {
  rankedEligibleTaxa: NationalGbifRankedTaxon[];
  selectedTaxa: NationalGbifRankedTaxon[];
  selectedSpeciesIds: string[];
  exploitationTargetPairs: number;
  exploitationPairs: number;
  explorationPairs: number;
  expectedNetMovement: number;
};

export function loadNationalGbifYieldPrior(filepath: string, expectedSha256?: string) {
  const bytes = readFileSync(filepath);
  if (expectedSha256 && sha256(bytes) !== expectedSha256) {
    throw new Error("GBIF yield-prior hash differs from the committed plan.");
  }
  return NationalGbifYieldPriorSchema.parse(JSON.parse(bytes.toString("utf8")));
}

function scoreBps(value: number, maximum: number) {
  return maximum === 0 ? 0 : Math.round((value * 10_000) / maximum);
}

export function buildNationalGbifDualObjectiveSelection(
  taxa: readonly NationalGbifPlanningTaxon[],
  prior: NationalGbifYieldPrior,
  threshold: number,
  rawModel: NationalGbifSelectionModel,
): NationalGbifDualObjectiveSelection {
  const model = NationalGbifSelectionModelSchema.parse(rawModel);
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 30_000) {
    throw new Error("GBIF dual-objective threshold must be an integer from 1 through 30,000.");
  }
  if (taxa.length !== prior.universe.speciesCount) {
    throw new Error("GBIF dual-objective taxa differ from the yield-prior universe count.");
  }
  const priorBySpecies = new Map(prior.taxonPriors.map((entry) => [entry.speciesId, entry]));
  if (priorBySpecies.size !== taxa.length || taxa.some((taxon) => !priorBySpecies.has(taxon.speciesId))) {
    throw new Error("GBIF dual-objective taxa differ from the yield-prior universe.");
  }
  for (const taxon of taxa) {
    if (
      !Number.isInteger(taxon.notResearchedPairs) ||
      taxon.notResearchedPairs < 0 ||
      taxon.grossPairs !== taxon.notResearchedPairs + taxon.blockedPairs + taxon.alreadyResearchedPairs
    ) {
      throw new Error(`GBIF planning taxon ${taxon.speciesId} has invalid pair counts.`);
    }
  }
  const maximumMovement = Math.max(...taxa.map((entry) => entry.notResearchedPairs));
  const maximumExpectedYield = Math.max(...prior.taxonPriors.map((entry) => entry.expectedPresentBps));
  const ranked = taxa.map((taxon) => {
    const taxonPrior = priorBySpecies.get(taxon.speciesId)!;
    const movementScoreBps = scoreBps(taxon.notResearchedPairs, maximumMovement);
    const likelyYieldScoreBps = scoreBps(taxonPrior.expectedPresentBps, maximumExpectedYield);
    return {
      ...taxon,
      category: taxonPrior.category,
      displayGroup: taxonPrior.displayGroup,
      yieldPriorScope: taxonPrior.scope,
      yieldPriorScopeKey: taxonPrior.scopeKey,
      yieldPriorObservedPairs: taxonPrior.observedPairs,
      yieldPriorPresentPairs: taxonPrior.observedPresentPairs,
      expectedPresentBps: taxonPrior.expectedPresentBps,
      movementScoreBps,
      likelyYieldScoreBps,
      compositeScoreBps: Math.round(
        (movementScoreBps * model.movementWeightBps + likelyYieldScoreBps * model.likelyYieldWeightBps) / 10_000,
      ),
      exploitationRank: 0,
      explorationRank: null,
      explorationBreadthScore: 0 as const,
      selectionLane: null,
    };
  }).sort((left, right) =>
    right.compositeScoreBps - left.compositeScoreBps ||
    right.movementScoreBps - left.movementScoreBps ||
    right.likelyYieldScoreBps - left.likelyYieldScoreBps ||
    compareText(left.speciesId, right.speciesId),
  ).map((entry, index) => ({ ...entry, exploitationRank: index + 1 }));

  const availableMovement = ranked.reduce((sum, entry) => sum + entry.notResearchedPairs, 0);
  if (availableMovement < threshold) {
    throw new Error("GBIF retained exact-cache universe cannot clear the selection threshold.");
  }
  const exploitationTargetPairs = Math.ceil((threshold * (10_000 - model.explorationTargetBps)) / 10_000);
  const exploitation: NationalGbifRankedTaxon[] = [];
  let exploitationPairs = 0;
  for (const taxon of ranked) {
    if (exploitationPairs >= exploitationTargetPairs) break;
    if (taxon.notResearchedPairs === 0) continue;
    exploitation.push(taxon);
    exploitationPairs += taxon.notResearchedPairs;
  }

  const exploitationIds = new Set(exploitation.map((entry) => entry.speciesId));
  const exploitationCategories = new Set(exploitation.map((entry) => entry.category));
  const exploitationGroups = new Set(exploitation.map((entry) => entry.displayGroup));
  const explorationRanking = ranked
    .filter((entry) => entry.notResearchedPairs > 0 && !exploitationIds.has(entry.speciesId))
    .map((entry) => ({
      ...entry,
      explorationBreadthScore: (
        !exploitationGroups.has(entry.displayGroup) ? 2 :
        !exploitationCategories.has(entry.category) ? 1 : 0
      ) as 0 | 1 | 2,
    }))
    .sort((left, right) =>
      right.explorationBreadthScore - left.explorationBreadthScore ||
      left.yieldPriorObservedPairs - right.yieldPriorObservedPairs ||
      right.notResearchedPairs - left.notResearchedPairs ||
      compareText(left.speciesId, right.speciesId),
    )
    .map((entry, index) => ({ ...entry, explorationRank: index + 1 }));

  const exploration: NationalGbifRankedTaxon[] = [];
  let expectedNetMovement = exploitationPairs;
  for (const taxon of explorationRanking) {
    if (expectedNetMovement >= threshold) break;
    exploration.push(taxon);
    expectedNetMovement += taxon.notResearchedPairs;
  }
  if (expectedNetMovement < threshold) {
    throw new Error("GBIF dual-objective exploitation and exploration lanes cannot clear the threshold.");
  }

  const exploitationBySpecies = new Map(exploitation.map((entry) => [entry.speciesId, entry]));
  const explorationBySpecies = new Map(exploration.map((entry) => [entry.speciesId, entry]));
  const explorationRankBySpecies = new Map(explorationRanking.map((entry) => [entry.speciesId, entry]));
  const rankedEligibleTaxa = ranked.map((entry) => {
    const explorationEntry = explorationRankBySpecies.get(entry.speciesId);
    return {
      ...entry,
      explorationRank: explorationEntry?.explorationRank ?? null,
      explorationBreadthScore: explorationEntry?.explorationBreadthScore ?? 0,
      selectionLane: exploitationBySpecies.has(entry.speciesId)
        ? "exploitation" as const
        : explorationBySpecies.has(entry.speciesId)
          ? "exploration" as const
          : null,
    };
  });
  const selectedTaxa = rankedEligibleTaxa
    .filter((entry) => entry.selectionLane !== null)
    .sort((left, right) => compareText(left.speciesId, right.speciesId));
  const selectedSpeciesIds = selectedTaxa.map((entry) => entry.speciesId);
  return {
    rankedEligibleTaxa,
    selectedTaxa,
    selectedSpeciesIds,
    exploitationTargetPairs,
    exploitationPairs,
    explorationPairs: expectedNetMovement - exploitationPairs,
    expectedNetMovement,
  };
}
