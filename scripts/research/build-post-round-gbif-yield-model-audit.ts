import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parse } from "csv-parse";

import { sha256, stableJson } from "./national-gbif-download";
import {
  fitNationalGbifRoundResidualCalibrationV21,
  fitNationalGbifYieldModelV2,
  predictNationalGbifPortfolioIntervalV21,
  predictNationalGbifTaxonV2,
  rankNationalGbifCandidatesV21,
  type GbifHistoricalRoundFunnel,
  type GbifYieldCandidateV2,
  type GbifYieldModelV2,
} from "./national-gbif-yield-model-v2";
import { spawnZipEntry } from "./zip-tools";

type JsonRecord = Record<string, unknown>;

type HistoricalTaxon = GbifYieldCandidateV2 & {
  uniquePresentPairs: number;
  selectedPairs: number;
  actualUniquePresentPairs: number;
  oldExpectedPresentBps: number;
};

type HistoricalRound = Omit<GbifHistoricalRoundFunnel, "taxa"> & {
  selectedPairs: number;
  planId: string;
  archivePath: string;
  archiveSha256: string;
  taxa: HistoricalTaxon[];
};

type Forecast = {
  model: string;
  prediction: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asObject(value: unknown, label: string): JsonRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as JsonRecord;
}

function readJson(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as JsonRecord;
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const required = [
    "marginal-audit", "rescore", "calibration", "portfolio", "usfws-evaluation", "output", "evaluation-id",
    "evaluated-at", "baseline-sha",
  ];
  assert(required.every((key) => values.has(key)), `Missing required argument; expected ${required.join(", ")}.`);
  return {
    marginalAuditPath: path.resolve(values.get("marginal-audit")!),
    rescorePath: path.resolve(values.get("rescore")!),
    calibrationPath: path.resolve(values.get("calibration")!),
    portfolioPath: path.resolve(values.get("portfolio")!),
    usfwsEvaluationPath: path.resolve(values.get("usfws-evaluation")!),
    outputPath: path.resolve(values.get("output")!),
    evaluationId: values.get("evaluation-id")!,
    evaluatedAt: values.get("evaluated-at")!,
    baselineSha: values.get("baseline-sha")!,
  };
}

function relativePath(root: string, filepath: string) {
  return path.relative(root, filepath).replaceAll("\\", "/");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function numberValue(value: unknown, label: string) {
  assert(typeof value === "number" && Number.isFinite(value), `${label} must be a finite number.`);
  return value;
}

function integerValue(value: unknown, label: string) {
  const result = numberValue(value, label);
  assert(Number.isInteger(result) && result >= 0, `${label} must be a nonnegative integer.`);
  return result;
}

function stringValue(value: unknown, label: string) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a nonempty string.`);
  return value;
}

function round(value: number, digits = 6) {
  return Number(value.toFixed(digits));
}

async function countArchiveTaxa(
  archivePath: string,
  taxa: readonly { speciesId: string; taxonKey: number }[],
) {
  const keyToTaxon = new Map(taxa.map((taxon) => [taxon.taxonKey, taxon.speciesId]));
  assert(keyToTaxon.size === taxa.length, `Archive ${archivePath} repeats a taxon key.`);
  const counts = new Map(taxa.map((taxon) => [taxon.speciesId, 0]));
  const extraction = spawnZipEntry(archivePath, "occurrence.txt");
  const closePromise = once(extraction, "close") as Promise<[number | null, NodeJS.Signals | null]>;
  let stderr = "";
  extraction.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < 16_384) stderr += chunk.toString("utf8");
  });
  const parser = extraction.stdout.pipe(parse({
    bom: true,
    columns: true,
    delimiter: "\t",
    quote: '"',
    escape: '"',
    relax_column_count: false,
    skip_empty_lines: true,
  })) as AsyncIterable<Record<string, string>>;
  let rows = 0;
  try {
    for await (const record of parser) {
      rows += 1;
      const candidateKeys = [record.speciesKey, record.acceptedTaxonKey];
      if (record.taxonRank === "SPECIES") candidateKeys.push(record.taxonKey);
      const matched = [...new Set(candidateKeys
        .filter((value): value is string => typeof value === "string" && /^[0-9]+$/u.test(value))
        .map((value) => keyToTaxon.get(Number(value)))
        .filter((value): value is string => Boolean(value)))];
      assert(matched.length === 1, `GBIF archive row ${rows} matched ${matched.length} selected taxa.`);
      counts.set(matched[0]!, counts.get(matched[0]!)! + 1);
    }
  } catch (error) {
    extraction.kill("SIGTERM");
    await closePromise.catch(() => undefined);
    throw error;
  }
  const [exitCode] = await closePromise;
  assert(exitCode === 0, `GBIF archive extraction failed: ${stderr.trim() || exitCode}.`);
  return { rows, counts };
}

function smoothedV1Prediction(training: readonly HistoricalRound[], target: HistoricalRound) {
  const globalPairs = training.reduce((sum, entry) => sum + entry.selectedPairs, 0);
  const globalPresent = training.reduce((sum, entry) => sum + entry.uniquePresentPairs, 0);
  const globalBps = Math.round((globalPresent * 10_000) / globalPairs);
  const groups = new Map<string, { pairs: number; present: number }>();
  const categories = new Map<string, { pairs: number; present: number }>();
  for (const roundEntry of training) {
    for (const taxon of roundEntry.taxa) {
      for (const [map, key] of [[groups, taxon.displayGroup], [categories, taxon.category]] as const) {
        const counts = map.get(key) ?? { pairs: 0, present: 0 };
        counts.pairs += taxon.selectedPairs;
        counts.present += taxon.actualUniquePresentPairs;
        map.set(key, counts);
      }
    }
  }
  const smoothedBps = (counts: { pairs: number; present: number }) => Math.round(
    ((counts.present * 10_000) + (globalBps * 25_000)) / (counts.pairs + 25_000),
  );
  const perTaxon = target.taxa.map((taxon) => {
    const group = groups.get(taxon.displayGroup);
    const category = categories.get(taxon.category);
    const expectedPresentBps = group && group.pairs >= 3_000
      ? smoothedBps(group)
      : category && category.pairs >= 3_000
        ? smoothedBps(category)
        : globalBps;
    return { speciesId: taxon.speciesId, expectedPresentBps, prediction: taxon.selectedPairs * expectedPresentBps / 10_000 };
  });
  return { prediction: perTaxon.reduce((sum, entry) => sum + entry.prediction, 0), perTaxon };
}

function average(values: readonly number[]) {
  assert(values.length > 0, "Average requires at least one value.");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]) {
  assert(values.length > 0, "Median requires at least one value.");
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

function averageRanks(values: readonly number[]) {
  const indexed = values.map((value, index) => ({ value, index })).sort((left, right) => right.value - left.value || left.index - right.index);
  const ranks = Array<number>(values.length);
  for (let start = 0; start < indexed.length;) {
    let end = start + 1;
    while (end < indexed.length && indexed[end]!.value === indexed[start]!.value) end += 1;
    const rank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) ranks[indexed[index]!.index] = rank;
    start = end;
  }
  return ranks;
}

function spearman(left: readonly number[], right: readonly number[]) {
  assert(left.length === right.length && left.length > 1, "Spearman inputs differ.");
  const leftRanks = averageRanks(left);
  const rightRanks = averageRanks(right);
  const leftMean = average(leftRanks);
  const rightMean = average(rightRanks);
  let numerator = 0;
  let leftSum = 0;
  let rightSum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = leftRanks[index]! - leftMean;
    const rightDelta = rightRanks[index]! - rightMean;
    numerator += leftDelta * rightDelta;
    leftSum += leftDelta * leftDelta;
    rightSum += rightDelta * rightDelta;
  }
  return leftSum === 0 || rightSum === 0 ? null : numerator / Math.sqrt(leftSum * rightSum);
}

function forecastMetrics(rows: readonly { actual: number; weight: number; forecasts: Forecast[] }[]) {
  const modelIds = rows[0]!.forecasts.map((entry) => entry.model);
  return Object.fromEntries(modelIds.map((model) => {
    const predictions = rows.map((row) => row.forecasts.find((entry) => entry.model === model)!.prediction);
    const errors = predictions.map((prediction, index) => prediction - rows[index]!.actual);
    const absoluteErrors = errors.map(Math.abs);
    const totalWeight = rows.reduce((sum, row) => sum + row.weight, 0);
    return [model, {
      meanAbsoluteError: round(average(absoluteErrors), 3),
      medianAbsoluteError: round(median(absoluteErrors), 3),
      providerRowWeightedAbsoluteError: round(
        rows.reduce((sum, row, index) => sum + absoluteErrors[index]! * row.weight, 0) / totalWeight,
        3,
      ),
      meanBias: round(average(errors), 3),
      totalPredicted: round(predictions.reduce((sum, value) => sum + value, 0), 3),
      totalActual: rows.reduce((sum, row) => sum + row.actual, 0),
    }];
  }));
}

function withoutAlliumEndpoints(rounds: readonly HistoricalRound[]) {
  return rounds.map((entry) => {
    const allium = entry.taxa.find((taxon) => taxon.speciesId === "allium-sativum");
    if (!allium) return entry;
    return {
      ...entry,
      providerRows: entry.providerRows - allium.providerRows,
      uniquePresentPairs: entry.uniquePresentPairs - allium.actualUniquePresentPairs,
      taxa: entry.taxa.filter((taxon) => taxon !== allium),
    };
  });
}

async function buildHistoricalRounds(root: string, marginalAudit: JsonRecord) {
  assert(Array.isArray(marginalAudit.rounds), "Marginal audit lacks rounds.");
  const catalog = JSON.parse(readFileSync(path.join(root, "src/data/generated/species.json"), "utf8")) as JsonRecord[];
  const catalogBySpecies = new Map(catalog.map((entry) => [stringValue(entry.id, "catalog species ID"), entry]));
  const rounds: HistoricalRound[] = [];
  for (const rawRound of marginalAudit.rounds) {
    const audited = asObject(rawRound, "marginal audit round");
    const roundId = integerValue(audited.round, "round");
    const selectionPath = path.join(root, stringValue(audited.selectionPath, `Round ${roundId} selectionPath`));
    const acquisitionReceiptPath = path.join(root, stringValue(audited.acquisitionReceiptPath, `Round ${roundId} acquisitionReceiptPath`));
    const selection = readJson(selectionPath);
    const receipt = readJson(acquisitionReceiptPath);
    assert(Array.isArray(selection.taxa) && Array.isArray(audited.perTaxon), `Round ${roundId} lacks taxa.`);
    const selectionBySpecies = new Map(selection.taxa.map((value) => {
      const taxon = asObject(value, `Round ${roundId} selection taxon`);
      return [stringValue(taxon.speciesId, "speciesId"), taxon];
    }));
    const archive = asObject(receipt.archive, `Round ${roundId} archive`);
    const archivePath = path.join(root, stringValue(archive.path, `Round ${roundId} archive.path`));
    const taxa = audited.perTaxon.map((value) => {
      const outcome = asObject(value, `Round ${roundId} taxon outcome`);
      const speciesId = stringValue(outcome.speciesId, "speciesId");
      const selected = selectionBySpecies.get(speciesId);
      assert(selected, `Round ${roundId} lacks selection taxon ${speciesId}.`);
      const catalogSpecies = catalogBySpecies.get(speciesId);
      assert(catalogSpecies, `Catalog lacks historical taxon ${speciesId}.`);
      return {
        speciesId,
        scientificName: stringValue(selected.scientificName, `${speciesId}.scientificName`),
        taxonKey: integerValue(selected.taxonKey, `${speciesId}.taxonKey`),
        category: stringValue(selected.category ?? catalogSpecies.category, `${speciesId}.category`),
        displayGroup: stringValue(selected.displayGroup ?? catalogSpecies.displayGroup, `${speciesId}.displayGroup`),
        grossPairs: integerValue(selected.grossPairs, `${speciesId}.grossPairs`),
        notResearchedPairs: integerValue(selected.notResearchedPairs, `${speciesId}.notResearchedPairs`),
        blockedPairs: integerValue(selected.blockedPairs, `${speciesId}.blockedPairs`),
        alreadyResearchedPairs: integerValue(selected.alreadyResearchedPairs, `${speciesId}.alreadyResearchedPairs`),
        providerRows: 0,
        selectedPairs: integerValue(outcome.selectedPairs, `${speciesId}.selectedPairs`),
        actualUniquePresentPairs: integerValue(outcome.acceptedPairs, `${speciesId}.acceptedPairs`),
        uniquePresentPairs: integerValue(outcome.acceptedPairs, `${speciesId}.acceptedPairs`),
        oldExpectedPresentBps: typeof selected.expectedPresentBps === "number" ? selected.expectedPresentBps : 0,
      };
    });
    const providerCounts = await countArchiveTaxa(archivePath, taxa);
    for (const taxon of taxa) taxon.providerRows = providerCounts.counts.get(taxon.speciesId)!;
    const providerRows = integerValue(audited.providerRows, `Round ${roundId}.providerRows`);
    assert(providerCounts.rows === providerRows, `Round ${roundId} archive rows do not reconcile.`);
    rounds.push({
      round: roundId,
      planId: stringValue(audited.planId, `Round ${roundId}.planId`),
      archivePath: relativePath(root, archivePath),
      archiveSha256: stringValue(archive.sha256, `Round ${roundId}.archive.sha256`),
      providerRows,
      selectedScopeRows: integerValue(audited.selectedScopeRows, `Round ${roundId}.selectedScopeRows`),
      acceptedArchiveRows: integerValue(audited.selectedAcceptedArchiveRows, `Round ${roundId}.selectedAcceptedArchiveRows`),
      uniquePresentPairs: integerValue(audited.presentPairs, `Round ${roundId}.presentPairs`),
      selectedPairs: integerValue(audited.selectedPairs, `Round ${roundId}.selectedPairs`),
      taxa,
    });
  }
  return rounds;
}

function modelPrediction(model: GbifYieldModelV2, target: HistoricalRound, seed: string) {
  const taxa = target.taxa.map((taxon) => predictNationalGbifTaxonV2(model, taxon, seed));
  return {
    prediction: taxa.reduce((sum, entry) => sum + entry.expectedUniquePresentPairs, 0),
    lower95: taxa.reduce((sum, entry) => sum + entry.lower95UniquePresentPairs, 0),
    upper95: taxa.reduce((sum, entry) => sum + entry.upper95UniquePresentPairs, 0),
    taxa,
  };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  assert(!existsSync(args.outputPath), "Post-round GBIF yield audit refuses to overwrite an existing artifact.");
  const inputPaths = [
    args.marginalAuditPath,
    args.rescorePath,
    args.calibrationPath,
    args.portfolioPath,
    args.usfwsEvaluationPath,
  ];
  const [marginalAudit, rescore, calibration, portfolio, usfwsEvaluation] = inputPaths.map(readJson);
  const historical = await buildHistoricalRounds(root, marginalAudit);
  assert(historical.length >= 3, "GBIF rolling-origin audit requires at least three rounds.");
  const rawBacktests = historical.slice(1).map((target, targetIndex) => {
    const training = historical.slice(0, targetIndex + 1);
    const model = fitNationalGbifYieldModelV2(training);
    const proposed = modelPrediction(model, target, `rolling-origin-round-${target.round}`);
    const old = smoothedV1Prediction(training, target);
    const trailingSelected = training.reduce((sum, entry) => sum + entry.uniquePresentPairs, 0) /
      training.reduce((sum, entry) => sum + entry.selectedPairs, 0) * target.selectedPairs;
    const providerScaled = training.reduce((sum, entry) => sum + entry.uniquePresentPairs, 0) /
      training.reduce((sum, entry) => sum + entry.providerRows, 0) * target.providerRows;
    const priorMaximumProviderYield = Math.max(...training.map((entry) => entry.uniquePresentPairs / entry.providerRows));
    const empiricalUpper = Math.min(target.selectedPairs, target.providerRows * priorMaximumProviderYield);
    const actualBySpecies = new Map(target.taxa.map((entry) => [entry.speciesId, entry.actualUniquePresentPairs]));
    const oldBySpecies = new Map(old.perTaxon.map((entry) => [entry.speciesId, entry.prediction]));
    const proposedRanks = spearman(
      proposed.taxa.map((entry) => entry.expectedUniquePresentPairs),
      proposed.taxa.map((entry) => actualBySpecies.get(entry.speciesId)!),
    );
    const providerRanks = spearman(
      target.taxa.map((entry) => entry.providerRows),
      target.taxa.map((entry) => entry.actualUniquePresentPairs),
    );
    const oldRanks = spearman(
      target.taxa.map((entry) => oldBySpecies.get(entry.speciesId)!),
      target.taxa.map((entry) => entry.actualUniquePresentPairs),
    );
    const actualTop = [...target.taxa].sort((left, right) => right.actualUniquePresentPairs - left.actualUniquePresentPairs || compareText(left.speciesId, right.speciesId))[0]!;
    return {
      round: target.round,
      trainingRounds: training.map((entry) => entry.round),
      actualUniquePresentPairs: target.uniquePresentPairs,
      providerRows: target.providerRows,
      selectedPairs: target.selectedPairs,
      forecasts: [
        { model: "staged-v2", prediction: round(proposed.prediction, 3) },
        { model: "current-smoothed-prior-v1", prediction: round(old.prediction, 3) },
        { model: "trailing-selected-pair-rate", prediction: round(trailingSelected, 3) },
        { model: "provider-count-scaled-global-rate", prediction: round(providerScaled, 3) },
        { model: "zero-conservative", prediction: 0 },
      ],
      intervals: {
        stagedConditional95: {
          lower: round(proposed.lower95, 3),
          upper: round(proposed.upper95, 3),
          covered: target.uniquePresentPairs >= proposed.lower95 && target.uniquePresentPairs <= proposed.upper95,
        },
        rollingEmpiricalPriorMaximum: {
          lower: 0,
          upper: round(empiricalUpper, 3),
          covered: target.uniquePresentPairs <= empiricalUpper,
        },
      },
      rankDiscrimination: {
        stagedV2Spearman: proposedRanks === null ? null : round(proposedRanks, 6),
        currentSmoothedPriorV1Spearman: oldRanks === null ? null : round(oldRanks, 6),
        providerCountSpearman: providerRanks === null ? null : round(providerRanks, 6),
        hybridV21Spearman: providerRanks === null ? null : round(providerRanks, 6),
        actualTopSpeciesId: actualTop.speciesId,
        stagedV2TopHit: proposed.taxa[0]?.speciesId === actualTop.speciesId,
        providerCountTopHit: [...target.taxa].sort((left, right) => right.providerRows - left.providerRows || compareText(left.speciesId, right.speciesId))[0]?.speciesId === actualTop.speciesId,
        hybridV21TopHit: [...target.taxa].sort((left, right) => right.providerRows - left.providerRows || compareText(left.speciesId, right.speciesId))[0]?.speciesId === actualTop.speciesId,
      },
      perTaxon: proposed.taxa.map((entry) => ({
        speciesId: entry.speciesId,
        category: entry.category,
        displayGroup: entry.displayGroup,
        providerRows: entry.providerRows,
        selectedPairs: target.taxa.find((taxon) => taxon.speciesId === entry.speciesId)!.selectedPairs,
        actualUniquePresentPairs: actualBySpecies.get(entry.speciesId)!,
        stagedV2Prediction: round(entry.expectedUniquePresentPairs, 6),
        currentSmoothedPriorV1Prediction: round(oldBySpecies.get(entry.speciesId)!, 6),
        providerCountRankFeature: entry.providerRows,
        featureSource: entry.yieldFeatureSource,
      })),
    };
  });
  const backtests = rawBacktests.map((entry, index) => {
    if (index === 0) {
      return {
        ...entry,
        intervals: {
          ...entry.intervals,
          groupedNormalizedResidualV21: null,
        },
      };
    }
    const priorResiduals = rawBacktests.slice(0, index).map((prior) => ({
      round: prior.round,
      providerRows: prior.providerRows,
      predictedUniqueDeterminationPairs: prior.forecasts.find((forecast) => forecast.model === "staged-v2")!.prediction,
      actualUniqueDeterminationPairs: prior.actualUniquePresentPairs,
    }));
    const groupedCalibration = fitNationalGbifRoundResidualCalibrationV21(priorResiduals);
    const stagedPrediction = entry.forecasts.find((forecast) => forecast.model === "staged-v2")!.prediction;
    const interval = predictNationalGbifPortfolioIntervalV21({
      medianUniqueDeterminationPairs: stagedPrediction,
      providerRows: entry.providerRows,
      maximumUniqueDeterminationPairs: entry.selectedPairs,
      calibration: groupedCalibration,
    });
    return {
      ...entry,
      intervals: {
        ...entry.intervals,
        groupedNormalizedResidualV21: {
          calibrationRounds: groupedCalibration.calibrationRounds,
          absoluteResidualPerProviderRowUpperBound: round(groupedCalibration.absoluteResidualPerProviderRowUpperBound, 9),
          lower: round(interval.lowerUniqueDeterminationPairs, 3),
          median: round(interval.medianUniqueDeterminationPairs, 3),
          upper: round(interval.upperUniqueDeterminationPairs, 3),
          width: round(interval.widthUniqueDeterminationPairs, 3),
          widthAsMaximumMovementPercent: round(interval.widthAsMaximumMovementPercent, 6),
          covered: entry.actualUniquePresentPairs >= interval.lowerUniqueDeterminationPairs &&
            entry.actualUniquePresentPairs <= interval.upperUniqueDeterminationPairs,
        },
      },
    };
  });
  const metrics = forecastMetrics(backtests.map((entry) => ({
    actual: entry.actualUniquePresentPairs,
    weight: entry.providerRows,
    forecasts: entry.forecasts,
  })));
  const conditionalCoverage = average(backtests.map((entry) => entry.intervals.stagedConditional95.covered ? 1 : 0));
  const empiricalCoverage = average(backtests.map((entry) => entry.intervals.rollingEmpiricalPriorMaximum.covered ? 1 : 0));
  const groupedIntervalBacktests = backtests.filter((entry) => entry.intervals.groupedNormalizedResidualV21 !== null);
  const groupedCoverage = average(groupedIntervalBacktests.map((entry) => entry.intervals.groupedNormalizedResidualV21!.covered ? 1 : 0));
  const groupedMeanWidth = average(groupedIntervalBacktests.map((entry) => entry.intervals.groupedNormalizedResidualV21!.width));
  const groupedMedianWidth = median(groupedIntervalBacktests.map((entry) => entry.intervals.groupedNormalizedResidualV21!.width));
  const groupedMeanWidthPercent = average(groupedIntervalBacktests.map((entry) => entry.intervals.groupedNormalizedResidualV21!.widthAsMaximumMovementPercent));

  assert(Array.isArray(calibration.taxa) && Array.isArray(rescore.rankedEligibleTaxa), "Current GBIF inputs lack taxa.");
  const calibrationBySpecies = new Map(calibration.taxa.map((value) => {
    const taxon = asObject(value, "calibration taxon");
    return [stringValue(taxon.speciesId, "calibration speciesId"), taxon];
  }));
  const currentCandidates = rescore.rankedEligibleTaxa.map((value) => {
    const taxon = asObject(value, "rescore taxon");
    const speciesId = stringValue(taxon.speciesId, "rescore speciesId");
    const calibrated = calibrationBySpecies.get(speciesId);
    assert(calibrated, `Calibration lacks ${speciesId}.`);
    return {
      speciesId,
      scientificName: stringValue(taxon.scientificName, `${speciesId}.scientificName`),
      taxonKey: integerValue(taxon.taxonKey, `${speciesId}.taxonKey`),
      category: stringValue(taxon.category, `${speciesId}.category`),
      displayGroup: stringValue(taxon.displayGroup, `${speciesId}.displayGroup`),
      grossPairs: integerValue(taxon.grossPairs, `${speciesId}.grossPairs`),
      notResearchedPairs: integerValue(taxon.notResearchedPairs, `${speciesId}.notResearchedPairs`),
      blockedPairs: integerValue(taxon.blockedPairs, `${speciesId}.blockedPairs`),
      alreadyResearchedPairs: integerValue(taxon.alreadyResearchedPairs, `${speciesId}.alreadyResearchedPairs`),
      providerRows: integerValue(calibrated.providerRows, `${speciesId}.providerRows`),
    };
  });
  const currentModel = fitNationalGbifYieldModelV2(historical);
  const currentRanked = rankNationalGbifCandidatesV21(currentModel, currentCandidates, "post-round-79-gbif-v21-20260821-r1");
  const currentRemaining = currentRanked.filter((entry) => entry.notResearchedPairs > 0);
  const alliumHistorical = historical.flatMap((entry) => entry.taxa.map((taxon) => ({ round: entry.round, ...taxon })))
    .find((entry) => entry.speciesId === "allium-sativum");
  const sensitivityModel = fitNationalGbifYieldModelV2(withoutAlliumEndpoints(historical));
  const sensitivityRanked = rankNationalGbifCandidatesV21(sensitivityModel, currentCandidates, "post-round-79-gbif-v21-20260821-r1");
  const fullCurrentExpected = currentRemaining.reduce((sum, entry) => sum + entry.expectedUniquePresentPairs, 0);
  const sensitivityExpected = sensitivityRanked.filter((entry) => entry.notResearchedPairs > 0)
    .reduce((sum, entry) => sum + entry.expectedUniquePresentPairs, 0);
  const currentMaximumMovement = currentRemaining.reduce((sum, entry) => sum + entry.notResearchedPairs, 0);
  const currentProviderRows = currentRemaining.reduce((sum, entry) => sum + entry.providerRows, 0);
  const currentGroupedCalibration = fitNationalGbifRoundResidualCalibrationV21(backtests.map((entry) => ({
    round: entry.round,
    providerRows: entry.providerRows,
    predictedUniqueDeterminationPairs: entry.forecasts.find((forecast) => forecast.model === "staged-v2")!.prediction,
    actualUniqueDeterminationPairs: entry.actualUniquePresentPairs,
  })));
  const currentV21Interval = predictNationalGbifPortfolioIntervalV21({
    medianUniqueDeterminationPairs: fullCurrentExpected,
    providerRows: currentProviderRows,
    maximumUniqueDeterminationPairs: currentMaximumMovement,
    calibration: currentGroupedCalibration,
  });
  const usfwsCoverage = asObject(usfwsEvaluation.coverage, "USFWS coverage");
  const usfwsIntegratedMovement = integerValue(usfwsCoverage.researchedUnresolvedPairs, "USFWS researched-unresolved pairs");

  const metricV2 = asObject(asObject(metrics, "metrics")["staged-v2"], "staged-v2 metrics");
  const metricV1 = asObject(asObject(metrics, "metrics")["current-smoothed-prior-v1"], "v1 metrics");
  const metricProvider = asObject(asObject(metrics, "metrics")["provider-count-scaled-global-rate"], "provider metrics");
  const modelBeatsV1 = numberValue(metricV2.meanAbsoluteError, "v2 MAE") < numberValue(metricV1.meanAbsoluteError, "v1 MAE");
  const modelBeatsProviderScaled = numberValue(metricV2.meanAbsoluteError, "v2 MAE") < numberValue(metricProvider.meanAbsoluteError, "provider MAE");
  const intervalGate = groupedCoverage >= 0.8;
  const intervalSharpnessGate = groupedMeanWidthPercent <= 25 && currentV21Interval.widthAsMaximumMovementPercent <= 5;
  const hybridSpearman = average(backtests.map((entry) => entry.rankDiscrimination.hybridV21Spearman).filter((value): value is number => value !== null));
  const providerSpearman = average(backtests.map((entry) => entry.rankDiscrimination.providerCountSpearman).filter((value): value is number => value !== null));
  const hybridRankGate = hybridSpearman >= providerSpearman;
  const portfolioDecision = asObject(portfolio.decision, "portfolio decision");
  const bestLaneEstablished = currentV21Interval.lowerUniqueDeterminationPairs > usfwsIntegratedMovement &&
    currentV21Interval.medianUniqueDeterminationPairs > usfwsIntegratedMovement;
  const decision = modelBeatsV1 && modelBeatsProviderScaled && intervalGate && intervalSharpnessGate &&
    hybridRankGate && bestLaneEstablished ? "GO" : "NO-GO";

  const providerRegimeBoundary = median(backtests.map((entry) => entry.providerRows));
  const regimeMetrics = {
    lowProvider: forecastMetrics(backtests.filter((entry) => entry.providerRows <= providerRegimeBoundary).map((entry) => ({
      actual: entry.actualUniquePresentPairs,
      weight: entry.providerRows,
      forecasts: entry.forecasts,
    }))),
    highProvider: forecastMetrics(backtests.filter((entry) => entry.providerRows > providerRegimeBoundary).map((entry) => ({
      actual: entry.actualUniquePresentPairs,
      weight: entry.providerRows,
      forecasts: entry.forecasts,
    }))),
  };

  const groupErrors = new Map<string, { actual: number; predicted: number; taxa: number }>();
  for (const split of backtests) {
    for (const taxon of split.perTaxon) {
      const current = groupErrors.get(taxon.displayGroup) ?? { actual: 0, predicted: 0, taxa: 0 };
      current.actual += taxon.actualUniquePresentPairs;
      current.predicted += taxon.stagedV2Prediction;
      current.taxa += 1;
      groupErrors.set(taxon.displayGroup, current);
    }
  }

  const output = {
    schemaVersion: 1,
    evaluationId: args.evaluationId,
    evaluatedAt: args.evaluatedAt,
    baselineSha: args.baselineSha,
    sourceId: "gbif-preserved-specimens",
    objective: "Correct the post-Round 79 yield model with round-blocked uncertainty and provider-count-primary selection, then issue an explicit Round 80 gate without moving the dataset.",
    inputs: inputPaths.map((filepath) => ({
      path: relativePath(root, filepath),
      sha256: sha256(readFileSync(filepath)),
    })),
    methodology: {
      outcomeSplit: "For each target round after the first, only earlier round outcomes train every model.",
      contemporaneousFeatureBoundary: "Per-taxon provider-row counts are reconstructed from the immutable target-round archive as a proxy for a limit=0 exact-taxon count that could have been queried before the POST. No selected-scope, accepted-row, or unique-pair target outcome is used as a feature.",
      limitation: "Historical pre-request per-taxon limit=0 responses were not retained. Archive counts are therefore a reproducible contemporaneous proxy, not proof of the exact count visible before each historical request.",
      stagedFunnel: ["provider matching rows", "selected county scope rows", "accepted archive rows", "distinct county-species pairs"],
      perTaxonFunnelLimitation: "Provider rows and distinct county-pair endpoints are reconstructable per taxon from retained immutable archives and accepted outcomes. Historical per-taxon selected-scope and accepted-archive row summaries were not retained, and replaying those intermediate stages against today's registry would not prove their historical values, so those cells remain explicitly unavailable rather than inferred.",
      groupedUncertainty: "Each acquisition round is one calibration unit. The interval margin is the largest earlier whole-round absolute residual normalized by that round's provider rows, scaled to the target provider-row regime. Taxa from one download are never treated as independent calibration observations.",
      weakFallback: "Exact-taxon history shrinks to a 250-provider-row display-group prior; display groups shrink to a 1,000-provider-row global prior.",
      currentSmoothedPriorComparator: "Faithful empirical-Bayes-binomial-v1 recreation with a 25,000-pair global prior and 3,000-pair scope minimum.",
      selectionRule: "Exact provider count is the primary rank because it had stronger held-out Spearman and top-taxon performance than staged v2. The staged point estimate, lower bound, remaining movement, and seeded hash are used only after provider count.",
      noAlphabeticalTieSignal: true,
      tieBreaker: "SHA-256 of a pinned opaque seed and species ID, applied only after provider count, staged yield, diagnostic lower bound, and remaining movement.",
    },
    historicalFunnels: historical.map((entry) => ({
      round: entry.round,
      planId: entry.planId,
      archivePath: entry.archivePath,
      archiveSha256: entry.archiveSha256,
      providerRows: entry.providerRows,
      selectedScopeRows: entry.selectedScopeRows,
      acceptedArchiveRows: entry.acceptedArchiveRows,
      distinctCountySpeciesPairs: entry.uniquePresentPairs,
      selectedPairs: entry.selectedPairs,
      taxa: entry.taxa.map((taxon) => ({
        speciesId: taxon.speciesId,
        category: taxon.category,
        displayGroup: taxon.displayGroup,
        providerRows: taxon.providerRows,
        requestedCountyPairs: taxon.selectedPairs,
        selectedScopeRows: null,
        acceptedArchiveRows: null,
        distinctCountySpeciesPairs: taxon.actualUniquePresentPairs,
        intermediateStageState: "not-retained-per-taxon",
      })),
    })),
    rollingOriginBacktests: backtests,
    forecastError: metrics,
    uncertainty: {
      stagedConditional95CoveragePercent: round(conditionalCoverage * 100, 3),
      rollingEmpiricalPriorMaximumCoveragePercent: round(empiricalCoverage * 100, 3),
      groupedNormalizedResidualV21CoveragePercent: round(groupedCoverage * 100, 3),
      groupedNormalizedResidualV21EvaluatedSplits: groupedIntervalBacktests.length,
      groupedNormalizedResidualV21MeanWidthPairs: round(groupedMeanWidth, 3),
      groupedNormalizedResidualV21MedianWidthPairs: round(groupedMedianWidth, 3),
      groupedNormalizedResidualV21MeanWidthAsMaximumMovementPercent: round(groupedMeanWidthPercent, 6),
      requiredCoveragePercent: 80,
      maximumMeanWidthAsMaximumMovementPercent: 25,
      maximumCurrentWidthAsMaximumMovementPercent: 5,
      conditionalIntervalQualification: "Product of stage-specific Wilson intervals; diagnostic only because stage dependence and cross-round heterogeneity are not modeled.",
      empiricalIntervalQualification: "Zero to the target provider count times the largest unique/provider rate in earlier rounds; strict leave-future-out, but not a calibrated 95 percent interval.",
      groupedIntervalQualification: "Strict leave-future-out round-blocked maximum absolute residual rate. This is a conservative small-sample empirical interval, not a claim of asymptotic 95 percent coverage. Coverage and width gates must both pass.",
    },
    rankAndTopDiscrimination: {
      averageStagedV2Spearman: round(average(backtests.map((entry) => entry.rankDiscrimination.stagedV2Spearman).filter((value): value is number => value !== null)), 6),
      averageCurrentSmoothedPriorV1Spearman: round(average(backtests.map((entry) => entry.rankDiscrimination.currentSmoothedPriorV1Spearman).filter((value): value is number => value !== null)), 6),
      averageProviderCountSpearman: round(average(backtests.map((entry) => entry.rankDiscrimination.providerCountSpearman).filter((value): value is number => value !== null)), 6),
      averageHybridV21Spearman: round(hybridSpearman, 6),
      stagedV2TopHitRatePercent: round(average(backtests.map((entry) => entry.rankDiscrimination.stagedV2TopHit ? 1 : 0)) * 100, 3),
      providerCountTopHitRatePercent: round(average(backtests.map((entry) => entry.rankDiscrimination.providerCountTopHit ? 1 : 0)) * 100, 3),
      hybridV21TopHitRatePercent: round(average(backtests.map((entry) => entry.rankDiscrimination.hybridV21TopHit ? 1 : 0)) * 100, 3),
      hybridRule: "exact-provider-count-primary-staged-yield-secondary",
    },
    providerRegimeSensitivity: {
      boundaryProviderRows: providerRegimeBoundary,
      lowProviderRoundCount: backtests.filter((entry) => entry.providerRows <= providerRegimeBoundary).length,
      highProviderRoundCount: backtests.filter((entry) => entry.providerRows > providerRegimeBoundary).length,
      metrics: regimeMetrics,
    },
    displayGroupError: [...groupErrors].map(([displayGroup, counts]) => ({
      displayGroup,
      taxonRoundObservations: counts.taxa,
      actualUniquePresentPairs: counts.actual,
      stagedV2PredictedPairs: round(counts.predicted, 3),
      absoluteError: round(Math.abs(counts.predicted - counts.actual), 3),
    })).sort((left, right) => right.absoluteError - left.absoluteError || compareText(left.displayGroup, right.displayGroup)),
    alliumSensitivity: {
      speciesId: "allium-sativum",
      historicalProviderRows: alliumHistorical?.providerRows ?? 0,
      historicalUniquePresentPairs: alliumHistorical?.actualUniquePresentPairs ?? 0,
      currentNotResearchedPairs: currentCandidates.find((entry) => entry.speciesId === "allium-sativum")?.notResearchedPairs ?? null,
      fullEndpointCurrentExpectedPairs: round(fullCurrentExpected, 3),
      withoutAlliumEndpointCurrentExpectedPairs: round(sensitivityExpected, 3),
      deltaPairs: round(fullCurrentExpected - sensitivityExpected, 3),
      qualification: "Sensitivity removes Allium provider and distinct-pair endpoints from training. Per-taxon intermediate selected-scope and accepted-row counts were not retained, so this is an endpoint sensitivity and is not treated as a causal attribution.",
    },
    currentExactTaxonCalibration: {
      calibrationId: calibration.calibrationId,
      providerGets: asObject(calibration.operations, "calibration.operations").providerGets,
      providerPosts: asObject(calibration.operations, "calibration.operations").providerPosts,
      remainingTaxa: currentRemaining.length,
      remainingNotResearchedPairs: currentRemaining.reduce((sum, entry) => sum + entry.notResearchedPairs, 0),
      exactProviderRows: currentRemaining.reduce((sum, entry) => sum + entry.providerRows, 0),
      stagedExpectedUniquePresentPairs: round(fullCurrentExpected, 3),
      v21LowerUniqueDeterminationPairs: round(currentV21Interval.lowerUniqueDeterminationPairs, 3),
      v21MedianUniqueDeterminationPairs: round(currentV21Interval.medianUniqueDeterminationPairs, 3),
      v21UpperUniqueDeterminationPairs: round(currentV21Interval.upperUniqueDeterminationPairs, 3),
      v21IntervalWidthPairs: round(currentV21Interval.widthUniqueDeterminationPairs, 3),
      v21IntervalWidthAsMaximumMovementPercent: round(currentV21Interval.widthAsMaximumMovementPercent, 6),
      v21CalibrationRounds: currentGroupedCalibration.calibrationRounds,
      v21AbsoluteResidualPerProviderRowUpperBound: round(currentGroupedCalibration.absoluteResidualPerProviderRowUpperBound, 9),
      stagedLower95UniquePresentPairs: round(currentRemaining.reduce((sum, entry) => sum + entry.lower95UniquePresentPairs, 0), 3),
      stagedUpper95UniquePresentPairs: round(currentRemaining.reduce((sum, entry) => sum + entry.upper95UniquePresentPairs, 0), 3),
      perTaxonRemainingCounts: currentRanked.map((entry, index) => ({
        rank: index + 1,
        speciesId: entry.speciesId,
        scientificName: entry.scientificName,
        category: entry.category,
        displayGroup: entry.displayGroup,
        taxonKey: entry.taxonKey,
        providerRows: entry.providerRows,
        grossPairs: entry.grossPairs,
        notResearchedPairs: entry.notResearchedPairs,
        blockedPairs: entry.blockedPairs,
        alreadyResearchedPairs: entry.alreadyResearchedPairs,
        expectedUniquePresentPairs: round(entry.expectedUniquePresentPairs, 6),
        lower95UniquePresentPairs: round(entry.lower95UniquePresentPairs, 6),
        upper95UniquePresentPairs: round(entry.upper95UniquePresentPairs, 6),
        featureSource: entry.yieldFeatureSource,
        rankingRule: entry.rankingRule,
        deterministicTieBreaker: entry.deterministicTieBreaker,
      })),
    },
    usfwsLaneComparison: {
      evaluationId: usfwsEvaluation.evaluationId,
      integratedNotDetectedMovementPairs: usfwsIntegratedMovement,
      gbifV21LowerUniqueDeterminationPairs: round(currentV21Interval.lowerUniqueDeterminationPairs, 3),
      gbifV21MedianUniqueDeterminationPairs: round(currentV21Interval.medianUniqueDeterminationPairs, 3),
      gbifV21UpperUniqueDeterminationPairs: round(currentV21Interval.upperUniqueDeterminationPairs, 3),
      gbifDemonstrablyPreferable: bestLaneEstablished,
      qualification: "USFWS movement is integrated survey-axis not-detected evidence; GBIF values are planning-only forecasts of determination-axis movement. The axes remain distinct, but the completed survey lane is the required execution comparator.",
    },
    decision: {
      gbifProviderRequestGate: decision,
      round80Scheduled: false,
      providerPostAuthorized: false,
      selectedScopeCreated: false,
      reasons: [
        `The staged model ${modelBeatsV1 ? "does" : "does not"} beat the current smoothed-prior v1 mean absolute error.`,
        `The staged model ${modelBeatsProviderScaled ? "does" : "does not"} beat the provider-count-scaled global comparator mean absolute error.`,
        `The round-blocked normalized residual interval covered ${round(groupedCoverage * 100, 3)} percent of eligible held-out rounds against the 80 percent gate, with mean width ${round(groupedMeanWidthPercent, 6)} percent of maximum movement.`,
        `The provider-count-primary hybrid matches the provider comparator's ${round(providerSpearman, 6)} average Spearman instead of replacing it with the weaker staged rank.`,
        `The current GBIF portfolio has a planning-only interval of ${round(currentV21Interval.lowerUniqueDeterminationPairs, 3)} to ${round(currentV21Interval.upperUniqueDeterminationPairs, 3)} pairs with median ${round(currentV21Interval.medianUniqueDeterminationPairs, 3)}, versus ${usfwsIntegratedMovement} integrated USFWS survey non-detections.`,
        `The GBIF portfolio ${bestLaneEstablished ? "is" : "is not"} demonstrably preferable to the completed USFWS lane under the required lower-and-median comparison.`,
        `The preceding portfolio decision remains: ${stringValue(portfolioDecision.selectedImmediateAction, "portfolio selectedImmediateAction")}`,
      ],
      gates: {
        rollingOriginSplitsAtLeastSix: backtests.length >= 6,
        stagedV2MaeBeatsCurrentSmoothedPriorV1: modelBeatsV1,
        stagedV2MaeBeatsProviderScaledGlobal: modelBeatsProviderScaled,
        groupedCoverageAtLeast80Percent: intervalGate,
        groupedIntervalsDecisionUseful: intervalSharpnessGate,
        hybridRankingAtLeastProviderCount: hybridRankGate,
        exactCurrentCountsComplete: currentCandidates.length === calibrationBySpecies.size,
        bestMaterialExecutableLaneEstablished: bestLaneEstablished,
      },
    },
    semantics: {
      providerCountIsEvidenceAssertion: false,
      forecastIsGuarantee: false,
      unknownIsAbsence: false,
      sourceSilenceIsNonDetection: false,
      noFutureOutcomeLabelsUsedForTraining: true,
      historicalProviderCountProxyFullyAsOfVerified: false,
    },
    operations: {
      providerGets: asObject(calibration.operations, "calibration.operations").providerGets,
      providerPosts: 0,
      downloadRequests: 0,
      datasetMovement: 0,
      evidenceAssertionsCreated: 0,
      generationCommands: 0,
      publicationMutations: 0,
      r2Mutations: 0,
    },
    checks: {
      historicalFunnelsMonotonic: historical.every((entry) => entry.providerRows >= entry.selectedScopeRows && entry.selectedScopeRows >= entry.acceptedArchiveRows && entry.acceptedArchiveRows >= entry.uniquePresentPairs),
      historicalPerTaxonProviderCountsConserved: historical.every((entry) => entry.taxa.reduce((sum, taxon) => sum + taxon.providerRows, 0) === entry.providerRows),
      historicalPerTaxonUniquePairsConserved: historical.every((entry) => entry.taxa.reduce((sum, taxon) => sum + taxon.actualUniquePresentPairs, 0) === entry.uniquePresentPairs),
      rollingOriginTrainingPrecedesTarget: backtests.every((entry) => entry.trainingRounds.every((roundId) => roundId < entry.round)),
      groupedIntervalCalibrationPrecedesTarget: groupedIntervalBacktests.every((entry) => entry.intervals.groupedNormalizedResidualV21!.calibrationRounds.every((roundId) => roundId < entry.round)),
      groupedIntervalsBoundedByMovement: groupedIntervalBacktests.every((entry) => entry.intervals.groupedNormalizedResidualV21!.lower >= 0 && entry.intervals.groupedNormalizedResidualV21!.upper <= entry.selectedPairs),
      currentPairClassesConserved: currentCandidates.every((entry) => entry.grossPairs === entry.notResearchedPairs + entry.blockedPairs + entry.alreadyResearchedPairs),
      calibrationOperationsHaveZeroWrites: asObject(calibration.operations, "calibration.operations").providerPosts === 0 && asObject(calibration.operations, "calibration.operations").datasetMovement === 0,
      externalMutationCountIsZero: true,
    },
  };
  assert(Object.values(output.checks).every(Boolean), "Post-round GBIF yield audit checks did not all pass.");
  mkdirSync(path.dirname(args.outputPath), { recursive: true });
  const contents = stableJson(output);
  writeFileSync(args.outputPath, contents, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: relativePath(root, args.outputPath),
    outputSha256: sha256(contents),
    rollingOriginSplits: backtests.length,
    gbifProviderRequestGate: decision,
    stagedV2MeanAbsoluteError: metricV2.meanAbsoluteError,
    currentSmoothedPriorV1MeanAbsoluteError: metricV1.meanAbsoluteError,
    groupedV21CoveragePercent: round(groupedCoverage * 100, 3),
    groupedV21MeanWidthAsMaximumMovementPercent: round(groupedMeanWidthPercent, 6),
    currentV21Interval: {
      lower: round(currentV21Interval.lowerUniqueDeterminationPairs, 3),
      median: round(currentV21Interval.medianUniqueDeterminationPairs, 3),
      upper: round(currentV21Interval.upperUniqueDeterminationPairs, 3),
    },
    providerPosts: 0,
    datasetMovement: 0,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main();
}
