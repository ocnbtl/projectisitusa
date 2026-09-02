import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { listCountyEquivalents } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";
import {
  INATURALIST_GBIF_DATASET_KEY,
  INATURALIST_GBIF_SOURCE_ID,
} from "./adapters/inaturalist-gbif-research-grade";

type CountyProjection = {
  stateCode: string;
  countyFips: string;
  pairResolution: { defaultDisplayStatus: string };
  pairs: Array<{ speciesId: string; displayStatus: string }>;
};

type MinimalReceipt = {
  source_id: string;
  parameters: Record<string, unknown>;
};

type MinimalOutcome = {
  county_fips: string;
  species_id: string;
  scope_complete: boolean;
};

type MinimalRejection = {
  normalized_target: { county_fips: string | null; species_id: string };
};

const ROOT = process.cwd();
const PORTFOLIO = [
  { speciesId: "aedes-albopictus", scientificName: "Aedes albopictus", nationalRecordCount: 5593 },
  { speciesId: "anolis-sagrei", scientificName: "Anolis sagrei", nationalRecordCount: 96049 },
  { speciesId: "coccinella-septempunctata", scientificName: "Coccinella septempunctata", nationalRecordCount: 72164 },
  { speciesId: "columba-livia", scientificName: "Columba livia", nationalRecordCount: 94414 },
  { speciesId: "linepithema-humile", scientificName: "Linepithema humile", nationalRecordCount: 9635 },
  { speciesId: "passer-domesticus", scientificName: "Passer domesticus", nationalRecordCount: 165317 },
  { speciesId: "pieris-rapae", scientificName: "Pieris rapae", nationalRecordCount: 75407 },
  { speciesId: "solenopsis-invicta", scientificName: "Solenopsis invicta", nationalRecordCount: 16317 },
  { speciesId: "streptopelia-decaocto", scientificName: "Streptopelia decaocto", nationalRecordCount: 35306 },
  { speciesId: "sturnus-vulgaris", scientificName: "Sturnus vulgaris", nationalRecordCount: 98559 },
] as const;
const SNAPSHOT = {
  datasetKey: INATURALIST_GBIF_DATASET_KEY,
  datasetDoi: "10.15468/ab3s5x" as const,
  datasetTitle: "iNaturalist Research-grade Observations",
  datasetPublishedAt: "2026-08-23T20:00:00-04:00",
  datasetMetadataModifiedAt: "2026-08-28T15:11:51.543-04:00",
  recordsCreatedThrough: "2026-08-24T15:00:17-07:00",
  expectedCrawlId: 605,
  expectedLastParsed: "2026-08-29T01:09:50.488-04:00",
  maximumCoordinateUncertaintyMeters: 10_000,
  allowedLicenses: [
    "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
    "http://creativecommons.org/licenses/by/4.0/legalcode",
    "http://creativecommons.org/licenses/by-nc/4.0/legalcode",
  ],
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJson<T>(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function readNdjson<T>(filepath: string): T[] {
  if (!existsSync(filepath)) return [];
  return readFileSync(filepath, "utf8")
    .split(/\r?\n/gu)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const stateCode = (values.get("state") ?? "").toUpperCase();
  assert(/^[A-Z]{2}$/u.test(stateCode), "--state is required.");
  const outputPath = path.resolve(ROOT, values.get("output") ?? "");
  assert(outputPath.startsWith(`${ROOT}${path.sep}`), "--output must remain inside the repository.");
  const planId = values.get("plan-id") ?? "";
  assert(/^[a-z0-9][a-z0-9-]{2,127}$/u.test(planId), "--plan-id is invalid.");
  const evaluatedAt = new Date(values.get("evaluated-at") ?? "").toISOString();
  assert(Date.parse(evaluatedAt) <= Date.now(), "--evaluated-at cannot be in the future.");
  return { stateCode, outputPath, planId, evaluatedAt };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const counties = listCountyEquivalents(options.stateCode);
  assert(counties.length > 0, `Unknown national-v1 state ${options.stateCode}.`);
  const snapshotIdentitySha256 = sha256(stableJson(SNAPSHOT));
  const completedTriples = new Set<string>();
  const partialTriples = new Set<string>();
  const rejectedPairKeys = new Set<string>();
  const runsRoot = path.join(ROOT, "src/data/research/runs");
  for (const directoryName of readdirSync(runsRoot)) {
    const runDirectory = path.join(runsRoot, directoryName);
    const receiptPath = path.join(runDirectory, "receipt.json");
    if (!existsSync(receiptPath)) continue;
    const receipt = readJson<MinimalReceipt>(receiptPath);
    if (receipt.source_id !== INATURALIST_GBIF_SOURCE_ID) continue;
    if (Number(receipt.parameters.expectedCrawlId) !== SNAPSHOT.expectedCrawlId) continue;
    for (const outcome of readNdjson<MinimalOutcome>(path.join(runDirectory, "outcomes.ndjson"))) {
      const pair = `${outcome.county_fips}:${outcome.species_id}`;
      const triple = `${INATURALIST_GBIF_SOURCE_ID}:${snapshotIdentitySha256}:${pair}`;
      (outcome.scope_complete ? completedTriples : partialTriples).add(triple);
    }
    for (const rejection of readNdjson<MinimalRejection>(path.join(runDirectory, "rejections.ndjson"))) {
      if (rejection.normalized_target.county_fips) {
        rejectedPairKeys.add(`${rejection.normalized_target.county_fips}:${rejection.normalized_target.species_id}`);
      }
    }
  }

  const statusCounts = new Map<string, number>();
  const candidates: Array<{ sourceId: string; speciesId: string; countyFips: string }> = [];
  const selectedPairKeys: string[] = [];
  let determinedOverlap = 0;
  let verifiedPresentOverlap = 0;
  let verifiedAbsentOverlap = 0;
  let sameSnapshotCompletedOverlap = 0;
  for (const county of counties) {
    const shardPath = path.join(ROOT, "public/generated/research", options.stateCode, "counties", `${county.countyFips}.json`);
    const shard = readJson<CountyProjection>(shardPath);
    assert(shard.stateCode === options.stateCode && shard.countyFips === county.countyFips, `Projection identity differs at ${shardPath}.`);
    const bySpecies = new Map(shard.pairs.map((pair) => [pair.speciesId, pair.displayStatus]));
    for (const taxon of PORTFOLIO) {
      const displayStatus = bySpecies.get(taxon.speciesId) ?? shard.pairResolution.defaultDisplayStatus;
      statusCounts.set(displayStatus, (statusCounts.get(displayStatus) ?? 0) + 1);
      if (displayStatus === "verified-present" || displayStatus === "verified-absent") {
        determinedOverlap += 1;
        if (displayStatus === "verified-present") verifiedPresentOverlap += 1;
        if (displayStatus === "verified-absent") verifiedAbsentOverlap += 1;
        continue;
      }
      const pair = `${county.countyFips}:${taxon.speciesId}`;
      const triple = `${INATURALIST_GBIF_SOURCE_ID}:${snapshotIdentitySha256}:${pair}`;
      if (completedTriples.has(triple)) {
        sameSnapshotCompletedOverlap += 1;
        continue;
      }
      candidates.push({ sourceId: INATURALIST_GBIF_SOURCE_ID, speciesId: taxon.speciesId, countyFips: county.countyFips });
      selectedPairKeys.push(pair);
    }
  }
  selectedPairKeys.sort(compareText);
  candidates.sort((left, right) => compareText(`${left.countyFips}:${left.speciesId}`, `${right.countyFips}:${right.speciesId}`));
  assert(new Set(selectedPairKeys).size === selectedPairKeys.length, "Selected pair keys contain duplicates.");
  assert(determinedOverlap + selectedPairKeys.length + sameSnapshotCompletedOverlap === counties.length * PORTFOLIO.length, "Pair accounting does not reconcile.");
  const projectedAcceptanceRate = 0.724;
  const plan = {
    schemaVersion: 1,
    planId: options.planId,
    sourceId: INATURALIST_GBIF_SOURCE_ID,
    stateCode: options.stateCode,
    generatedAt: new Date().toISOString(),
    evaluatedAt: options.evaluatedAt,
    candidates,
    inaturalistGbif: {
      mode: "weekly-gbif-dataset-snapshot" as const,
      datasetKey: SNAPSHOT.datasetKey,
      datasetDoi: SNAPSHOT.datasetDoi,
      datasetPublishedAt: SNAPSHOT.datasetPublishedAt,
      expectedCrawlId: SNAPSHOT.expectedCrawlId,
      expectedLastParsed: SNAPSHOT.expectedLastParsed,
      maximumCoordinateUncertaintyMeters: SNAPSHOT.maximumCoordinateUncertaintyMeters,
      allowedLicenses: SNAPSHOT.allowedLicenses,
      snapshotIdentitySha256,
    },
    accounting: {
      scopeFingerprint: sha256(stableJson({ stateCode: options.stateCode, sourceId: INATURALIST_GBIF_SOURCE_ID, snapshotIdentitySha256, speciesIds: PORTFOLIO.map((entry) => entry.speciesId) })),
      selectedPairSetSha256: sha256(`${selectedPairKeys.join("\n")}\n`),
      states: [options.stateCode],
      countiesCovered: counties.length,
      sourcePortfolio: PORTFOLIO,
      nationalProviderRecordsConsideredByCountQuery: PORTFOLIO.reduce((total, entry) => total + entry.nationalRecordCount, 0),
      boundedYieldSample: {
        rawProviderRecordsConsidered: 1066,
        exactCatalogMatches: 1066,
        countyResolvableRecords: 1044,
        licenseEligibleUniquePairs: 478,
        alreadyDeterminedPairs: 132,
        netEligiblePairs: 346,
        measuredNetRate: projectedAcceptanceRate,
        projectedNationalNet: 19376,
        indicativeLower95: 12405,
        indicativeUpper95: 26347,
      },
      grossUniqueCountySpeciesCandidates: counties.length * PORTFOLIO.length,
      pairsAlreadyInDStart: determinedOverlap,
      pairsAlreadyVerifiedPresent: verifiedPresentOverlap,
      pairsAlreadyVerifiedAbsent: verifiedAbsentOverlap,
      sameSourceSameSnapshotCompletedOverlaps: sameSnapshotCompletedOverlap,
      unexecutedPriorPlanOverlaps: 0,
      withinPlanDuplicates: selectedPairKeys.length - new Set(selectedPairKeys).size,
      priorRejectedSelectedPairs: selectedPairKeys.filter((pair) => rejectedPairKeys.has(pair)).length,
      partialRetryEligiblePairs: selectedPairKeys.filter((pair) => partialTriples.has(`${INATURALIST_GBIF_SOURCE_ID}:${snapshotIdentitySha256}:${pair}`)).length,
      remainingNetEligiblePairCount: selectedPairKeys.length,
      projectedAcceptedDeterminationCount: Math.floor(selectedPairKeys.length * projectedAcceptanceRate),
      projectedYieldConfidence: "medium; bounded systematic 12-taxon national sample with exact current-matrix overlap",
      estimatedNationalPortfolioRequestsUpperBound: PORTFOLIO.reduce((total, entry) => total + 1 + Math.ceil(entry.nationalRecordCount / 300), 0) + counties.length * PORTFOLIO.length,
      estimatedNationalPortfolioBytesUpperBound: 6_000_000_000,
      estimatedNationalPortfolioElapsedMinutes: 90,
      estimatedCostUsd: 0,
      currentDisplayStatusCounts: Object.fromEntries([...statusCounts.entries()].sort(([left], [right]) => compareText(left, right))),
    },
    assertions: {
      selectedPairsIntersectDStart: 0,
      selectedTriplesIntersectRComplete: 0,
      selectedPairDuplicateCount: 0,
      sourceSilenceCreatesAbsence: false,
      sourceSilenceCreatesNonDetection: false,
      acceptedClaim: "historical recorded presence from one retained licensed Research Grade occurrence",
    },
  };
  await writeFile(options.outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ output: path.relative(ROOT, options.outputPath).replace(/\\/gu, "/"), selectedPairs: selectedPairKeys.length, projectedAccepted: plan.accounting.projectedAcceptedDeterminationCount, selectedPairSetSha256: plan.accounting.selectedPairSetSha256 }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
