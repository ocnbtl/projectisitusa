import { createHash } from "node:crypto";

export const GBIF_YIELD_MODEL_V2_ID = "staged-exact-count-empirical-bayes-v2" as const;

export type GbifHistoricalTaxonFunnel = {
  speciesId: string;
  category: string;
  displayGroup: string;
  providerRows: number;
  uniquePresentPairs: number;
};

export type GbifHistoricalRoundFunnel = {
  round: number;
  providerRows: number;
  selectedScopeRows: number;
  acceptedArchiveRows: number;
  uniquePresentPairs: number;
  taxa: GbifHistoricalTaxonFunnel[];
};

export type GbifYieldCandidateV2 = {
  speciesId: string;
  scientificName: string;
  taxonKey: number;
  category: string;
  displayGroup: string;
  grossPairs: number;
  notResearchedPairs: number;
  blockedPairs: number;
  alreadyResearchedPairs: number;
  providerRows: number;
};

export type GbifStageEstimate = {
  numerator: number;
  denominator: number;
  meanBps: number;
  lower95Bps: number;
  upper95Bps: number;
};

export type GbifYieldModelV2 = {
  modelId: typeof GBIF_YIELD_MODEL_V2_ID;
  trainingRounds: number[];
  stageEstimates: {
    providerToSelectedScope: GbifStageEstimate;
    selectedScopeToAcceptedArchive: GbifStageEstimate;
    acceptedArchiveToUniquePair: GbifStageEstimate;
  };
  globalUniquePerProviderBps: number;
  groupPriorProviderRows: number;
  exactTaxonPriorProviderRows: number;
  displayGroupRates: Record<string, {
    providerRows: number;
    uniquePresentPairs: number;
    smoothedUniquePerProviderBps: number;
  }>;
  exactTaxonRates: Record<string, {
    providerRows: number;
    uniquePresentPairs: number;
    smoothedUniquePerProviderBps: number;
  }>;
};

export type GbifYieldPredictionV2 = GbifYieldCandidateV2 & {
  modelId: typeof GBIF_YIELD_MODEL_V2_ID;
  expectedSelectedScopeRows: number;
  expectedAcceptedArchiveRows: number;
  expectedUniquePresentPairs: number;
  lower95UniquePresentPairs: number;
  upper95UniquePresentPairs: number;
  uniquePerProviderBps: number;
  yieldFeatureSource: "exact-taxon-history" | "display-group-history" | "global-history";
  deterministicTieBreaker: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function bps(value: number) {
  return Math.round(clamp(value, 0, 1) * 10_000);
}

function wilson(successes: number, trials: number, z = 1.959963984540054) {
  assert(Number.isInteger(successes) && Number.isInteger(trials), "Wilson counts must be integers.");
  assert(successes >= 0 && trials > 0 && successes <= trials, "Wilson counts are invalid.");
  const proportion = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = (proportion + z2 / (2 * trials)) / denominator;
  const radius = z * Math.sqrt(
    (proportion * (1 - proportion) / trials) + (z2 / (4 * trials * trials)),
  ) / denominator;
  return { lower: clamp(center - radius, 0, 1), upper: clamp(center + radius, 0, 1) };
}

function stageEstimate(numerator: number, denominator: number): GbifStageEstimate {
  assert(
    Number.isInteger(numerator) && Number.isInteger(denominator) &&
      denominator > 0 && numerator >= 0 && numerator <= denominator,
    "GBIF funnel stage counts are invalid.",
  );
  const interval = wilson(numerator, denominator);
  return {
    numerator,
    denominator,
    meanBps: bps((numerator + 0.5) / (denominator + 1)),
    lower95Bps: bps(interval.lower),
    upper95Bps: bps(interval.upper),
  };
}

function rateFromBps(value: number) {
  return value / 10_000;
}

function sortedRecord<T>(values: Map<string, T>) {
  return Object.fromEntries([...values].sort(([left], [right]) => compareText(left, right)));
}

function validateRound(round: GbifHistoricalRoundFunnel) {
  assert(Number.isInteger(round.round) && round.round > 0, "GBIF training round is invalid.");
  assert(
    Number.isInteger(round.providerRows) && Number.isInteger(round.selectedScopeRows) &&
      Number.isInteger(round.acceptedArchiveRows) && Number.isInteger(round.uniquePresentPairs),
    `GBIF Round ${round.round} funnel counts must be integers.`,
  );
  assert(
    round.providerRows >= round.selectedScopeRows &&
      round.selectedScopeRows >= round.acceptedArchiveRows &&
      round.acceptedArchiveRows >= round.uniquePresentPairs &&
      round.uniquePresentPairs >= 0,
    `GBIF Round ${round.round} funnel is not monotonic.`,
  );
  assert(
    round.taxa.reduce((sum, taxon) => sum + taxon.providerRows, 0) === round.providerRows,
    `GBIF Round ${round.round} per-taxon provider rows do not reconcile.`,
  );
  assert(
    round.taxa.reduce((sum, taxon) => sum + taxon.uniquePresentPairs, 0) === round.uniquePresentPairs,
    `GBIF Round ${round.round} per-taxon unique pairs do not reconcile.`,
  );
}

export function fitNationalGbifYieldModelV2(
  rounds: readonly GbifHistoricalRoundFunnel[],
): GbifYieldModelV2 {
  assert(rounds.length > 0, "GBIF yield model v2 requires at least one training round.");
  const roundIds = rounds.map((round) => round.round);
  assert(new Set(roundIds).size === roundIds.length, "GBIF yield model v2 training rounds repeat.");
  for (const round of rounds) validateRound(round);
  const providerRows = rounds.reduce((sum, round) => sum + round.providerRows, 0);
  const selectedScopeRows = rounds.reduce((sum, round) => sum + round.selectedScopeRows, 0);
  const acceptedArchiveRows = rounds.reduce((sum, round) => sum + round.acceptedArchiveRows, 0);
  const uniquePresentPairs = rounds.reduce((sum, round) => sum + round.uniquePresentPairs, 0);
  const providerToSelectedScope = stageEstimate(selectedScopeRows, providerRows);
  const selectedScopeToAcceptedArchive = stageEstimate(acceptedArchiveRows, selectedScopeRows);
  const acceptedArchiveToUniquePair = stageEstimate(uniquePresentPairs, acceptedArchiveRows);
  const globalUniquePerProvider = uniquePresentPairs / providerRows;
  const groupPriorProviderRows = 1_000;
  const exactTaxonPriorProviderRows = 250;
  const groupCounts = new Map<string, { providerRows: number; uniquePresentPairs: number }>();
  const taxonCounts = new Map<string, { providerRows: number; uniquePresentPairs: number; displayGroup: string }>();
  for (const round of rounds) {
    for (const taxon of round.taxa) {
      const group = groupCounts.get(taxon.displayGroup) ?? { providerRows: 0, uniquePresentPairs: 0 };
      group.providerRows += taxon.providerRows;
      group.uniquePresentPairs += taxon.uniquePresentPairs;
      groupCounts.set(taxon.displayGroup, group);
      const exact = taxonCounts.get(taxon.speciesId) ?? {
        providerRows: 0,
        uniquePresentPairs: 0,
        displayGroup: taxon.displayGroup,
      };
      assert(exact.displayGroup === taxon.displayGroup, `GBIF taxon ${taxon.speciesId} changed display group.`);
      exact.providerRows += taxon.providerRows;
      exact.uniquePresentPairs += taxon.uniquePresentPairs;
      taxonCounts.set(taxon.speciesId, exact);
    }
  }
  const displayGroupRates = new Map<string, {
    providerRows: number;
    uniquePresentPairs: number;
    smoothedUniquePerProviderBps: number;
  }>();
  for (const [displayGroup, counts] of groupCounts) {
    const smoothed = (
      counts.uniquePresentPairs + globalUniquePerProvider * groupPriorProviderRows
    ) / (counts.providerRows + groupPriorProviderRows);
    displayGroupRates.set(displayGroup, {
      ...counts,
      smoothedUniquePerProviderBps: bps(smoothed),
    });
  }
  const exactTaxonRates = new Map<string, {
    providerRows: number;
    uniquePresentPairs: number;
    smoothedUniquePerProviderBps: number;
  }>();
  for (const [speciesId, counts] of taxonCounts) {
    const groupRate = rateFromBps(
      displayGroupRates.get(counts.displayGroup)?.smoothedUniquePerProviderBps ?? bps(globalUniquePerProvider),
    );
    const smoothed = (
      counts.uniquePresentPairs + groupRate * exactTaxonPriorProviderRows
    ) / (counts.providerRows + exactTaxonPriorProviderRows);
    exactTaxonRates.set(speciesId, {
      providerRows: counts.providerRows,
      uniquePresentPairs: counts.uniquePresentPairs,
      smoothedUniquePerProviderBps: bps(smoothed),
    });
  }
  return {
    modelId: GBIF_YIELD_MODEL_V2_ID,
    trainingRounds: [...roundIds],
    stageEstimates: {
      providerToSelectedScope,
      selectedScopeToAcceptedArchive,
      acceptedArchiveToUniquePair,
    },
    globalUniquePerProviderBps: bps(globalUniquePerProvider),
    groupPriorProviderRows,
    exactTaxonPriorProviderRows,
    displayGroupRates: sortedRecord(displayGroupRates),
    exactTaxonRates: sortedRecord(exactTaxonRates),
  };
}

export function deterministicGbifTieBreaker(seed: string, speciesId: string) {
  assert(seed.length > 0 && speciesId.length > 0, "GBIF tie-break seed and species ID are required.");
  return createHash("sha256").update(`${seed}\0${speciesId}`).digest("hex");
}

export function predictNationalGbifTaxonV2(
  model: GbifYieldModelV2,
  candidate: GbifYieldCandidateV2,
  tieBreakSeed: string,
): GbifYieldPredictionV2 {
  assert(Number.isInteger(candidate.providerRows) && candidate.providerRows >= 0, "GBIF provider count is invalid.");
  assert(
    candidate.grossPairs === candidate.notResearchedPairs + candidate.blockedPairs + candidate.alreadyResearchedPairs,
    `GBIF candidate ${candidate.speciesId} pair classes do not conserve.`,
  );
  const stages = model.stageEstimates;
  const globalRate = rateFromBps(model.globalUniquePerProviderBps);
  const exact = model.exactTaxonRates[candidate.speciesId];
  const group = model.displayGroupRates[candidate.displayGroup];
  const featureRate = exact
    ? rateFromBps(exact.smoothedUniquePerProviderBps)
    : group
      ? rateFromBps(group.smoothedUniquePerProviderBps)
      : globalRate;
  const featureSource = exact
    ? "exact-taxon-history" as const
    : group
      ? "display-group-history" as const
      : "global-history" as const;
  const adjustment = globalRate === 0 ? 1 : clamp(featureRate / globalRate, 0.25, 2.5);
  const selectedRate = rateFromBps(stages.providerToSelectedScope.meanBps);
  const acceptedRate = rateFromBps(stages.selectedScopeToAcceptedArchive.meanBps);
  const uniqueRate = rateFromBps(stages.acceptedArchiveToUniquePair.meanBps);
  const expectedSelectedScopeRows = candidate.providerRows * selectedRate;
  const expectedAcceptedArchiveRows = expectedSelectedScopeRows * acceptedRate;
  const expectedUniquePresentPairs = Math.min(
    candidate.notResearchedPairs,
    expectedAcceptedArchiveRows * uniqueRate * adjustment,
  );
  const lowerRate =
    rateFromBps(stages.providerToSelectedScope.lower95Bps) *
    rateFromBps(stages.selectedScopeToAcceptedArchive.lower95Bps) *
    rateFromBps(stages.acceptedArchiveToUniquePair.lower95Bps) * adjustment;
  const upperRate =
    rateFromBps(stages.providerToSelectedScope.upper95Bps) *
    rateFromBps(stages.selectedScopeToAcceptedArchive.upper95Bps) *
    rateFromBps(stages.acceptedArchiveToUniquePair.upper95Bps) * adjustment;
  return {
    ...candidate,
    modelId: model.modelId,
    expectedSelectedScopeRows,
    expectedAcceptedArchiveRows,
    expectedUniquePresentPairs,
    lower95UniquePresentPairs: Math.max(0, candidate.providerRows * lowerRate),
    upper95UniquePresentPairs: Math.min(candidate.notResearchedPairs, candidate.providerRows * upperRate),
    uniquePerProviderBps: bps(globalRate * adjustment),
    yieldFeatureSource: featureSource,
    deterministicTieBreaker: deterministicGbifTieBreaker(tieBreakSeed, candidate.speciesId),
  };
}

export function rankNationalGbifCandidatesV2(
  model: GbifYieldModelV2,
  candidates: readonly GbifYieldCandidateV2[],
  tieBreakSeed: string,
) {
  return candidates.map((candidate) => predictNationalGbifTaxonV2(model, candidate, tieBreakSeed))
    .sort((left, right) =>
      right.expectedUniquePresentPairs - left.expectedUniquePresentPairs ||
      right.lower95UniquePresentPairs - left.lower95UniquePresentPairs ||
      right.providerRows - left.providerRows ||
      right.notResearchedPairs - left.notResearchedPairs ||
      compareText(left.deterministicTieBreaker, right.deterministicTieBreaker),
    );
}
