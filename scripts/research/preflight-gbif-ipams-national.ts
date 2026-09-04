import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

import countyTopology from "@/data/source/county-equivalents-topology.json";
import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";

type CatalogSpecies = { id: string; scientificName: string };
type IpamsRow = {
  id: string;
  type: string;
  license: string;
  datasetName: string;
  basisOfRecord: string;
  occurrenceID: string;
  establishmentMeans: string;
  eventDate: string;
  countryCode: string;
  stateProvince: string;
  county: string;
  decimalLatitude: string;
  decimalLongitude: string;
  scientificName: string;
};
type CountyProjection = {
  stateCode: string;
  countyFips: string;
  pairs: Array<{ speciesId: string; displayStatus: string; screenedBySourceIds?: string[] }>;
};
type ReadinessDashboard = {
  national: { denominator: { verifiedPresent: number; verifiedAbsent: number } };
};

const ROOT = process.cwd();
const SOURCE_ID = "gbif-ipams";
const DATASET_KEY = "d587c7e5-d442-437a-a6d7-d1a78ecf2300";
const EXPECTED_LICENSE = "https://creativecommons.org/publicdomain/zero/1.0/legalcode";
const EXPECTED_DATASET = "Invasive Plant Atlas of the MidSouth (IPAMS)";
const DATASET_DOI = "10.15468/3j3ueb";
const DATASET_URL = "https://ipt.gbif.us/archive.do?r=ipams";
const METADATA_URL = "https://ipt.gbif.us/eml.do?r=ipams";
const USAGE_POLICY_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const DATASET_VERSION = "1.4";
const DATASET_LAST_MODIFIED = "2020-07-31T18:39:03Z";
const ARCHIVE_BYTES = 898409;
const ARCHIVE_SHA256 = "d9fed59d6b61541b9234c330990703fc823ad0a919acf8b2639f19a0b9a64e4b";
const ARCHIVE_VERIFIED_AT = "2026-09-03T17:16:55.091Z";
const PREFLIGHT_EVALUATION_ID = "gbif-ipams-preflight-20260904-r1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizedName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArguments(argv: string[]) {
  const directoryIndex = argv.indexOf("--source-directory");
  const sourceDirectory = argv[directoryIndex + 1];
  assert(directoryIndex >= 0 && sourceDirectory, "--source-directory is required.");
  const planOutputIndex = argv.indexOf("--plan-output-directory");
  const planOutputDirectory = planOutputIndex >= 0 ? argv[planOutputIndex + 1] : undefined;
  assert(planOutputIndex < 0 || planOutputDirectory, "--plan-output-directory requires a value.");
  const excludePlanIndex = argv.indexOf("--exclude-plan-directory");
  const excludePlanDirectory = excludePlanIndex >= 0 ? argv[excludePlanIndex + 1] : undefined;
  assert(excludePlanIndex < 0 || excludePlanDirectory, "--exclude-plan-directory requires a value.");
  const excludeSourceIndex = argv.indexOf("--exclude-source-id");
  const excludeSourceId = excludeSourceIndex >= 0 ? argv[excludeSourceIndex + 1] : undefined;
  assert(excludeSourceIndex < 0 || excludeSourceId, "--exclude-source-id requires a value.");
  assert(Boolean(excludePlanDirectory) === Boolean(excludeSourceId), "Cross-source exclusion requires both directory and source ID.");
  return {
    sourceDirectory: path.resolve(sourceDirectory),
    planOutputDirectory: planOutputDirectory ? path.resolve(planOutputDirectory) : null,
    excludePlanDirectory: excludePlanDirectory ? path.resolve(excludePlanDirectory) : null,
    excludeSourceId: excludeSourceId ?? null,
  };
}

function readJson<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function establishmentApplies(value: string, stateCode: string) {
  const normalized = normalizedName(value);
  if (stateCode === "AK") return normalized.includes("alaska");
  if (stateCode === "HI") return normalized.includes("hawaii");
  return normalized.includes("lower conterminous united states");
}

function buildCountyFeaturesByState() {
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: Array<{ id: string | number; properties?: { name?: string } }> } };
  };
  const collection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name?: string }>;
  const byState = new Map<
    string,
    Array<{
      countyFips: string;
      countyName: string;
      feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name?: string }>;
    }>
  >();
  collection.features.forEach((countyFeature, index) => {
    const geometry = topology.objects.counties.geometries[index];
    const countyFips = String(geometry.id).padStart(5, "0");
    const stateCode = STATE_FIPS_TO_INFO[countyFips.slice(0, 2)]?.code;
    const countyName = geometry.properties?.name ?? countyFeature.properties?.name;
    if (!stateCode || !countyName) return;
    const current = byState.get(stateCode) ?? [];
    current.push({ countyFips, countyName, feature: countyFeature });
    byState.set(stateCode, current);
  });
  return byState;
}

function main() {
  const startedAt = Date.now();
  const { sourceDirectory, planOutputDirectory, excludePlanDirectory, excludeSourceId } = parseArguments(process.argv.slice(2));
  const occurrencePath = path.join(sourceDirectory, "occurrence.txt");
  const emlPath = path.join(sourceDirectory, "eml.xml");
  const metaPath = path.join(sourceDirectory, "meta.xml");
  const occurrenceBytes = readFileSync(occurrencePath);
  const rows = parse(occurrenceBytes, {
    bom: true,
    columns: true,
    delimiter: "\t",
    relax_quotes: true,
    skip_empty_lines: true,
  }) as IpamsRow[];

  const catalog = readJson<CatalogSpecies[]>(path.join(ROOT, "src/data/generated/species.json"));
  const catalogGroups = new Map<string, CatalogSpecies[]>();
  for (const species of catalog) {
    const key = normalizedName(species.scientificName);
    catalogGroups.set(key, [...(catalogGroups.get(key) ?? []), species]);
  }
  const exactCatalog = new Map(
    [...catalogGroups.entries()]
      .filter(([, matches]) => matches.length === 1)
      .map(([name, matches]) => [name, matches[0]]),
  );
  const ambiguousCatalogNames = new Set(
    [...catalogGroups.entries()].filter(([, matches]) => matches.length !== 1).map(([name]) => name),
  );
  const readiness = readJson<ReadinessDashboard>(path.join(ROOT, "ops/national-research/readiness-dashboard.json"));
  const stateCodeByName = new Map(
    Object.values(STATE_FIPS_TO_INFO).map((state) => [normalizedName(state.name), state.code]),
  );
  const countiesByState = buildCountyFeaturesByState();
  const rejectionCounts: Record<string, number> = {};
  const reject = (reason: string) => {
    rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
  };
  const allSourceTaxa = new Set<string>();
  const exactSourceTaxa = new Set<string>();
  const mappedRecords: Array<{
    occurrenceId: string;
    countyFips: string;
    stateCode: string;
    speciesId: string;
    scientificName: string;
    eventDate: string;
    latitude: number;
    longitude: number;
    sourceState: string;
    sourceCounty: string;
  }> = [];

  for (const row of rows) {
    allSourceTaxa.add(normalizedName(row.scientificName));
    if (row.datasetName !== EXPECTED_DATASET) {
      reject("dataset-mismatch");
      continue;
    }
    if (row.license !== EXPECTED_LICENSE) {
      reject("license-mismatch");
      continue;
    }
    if (normalizedName(row.type) !== "dataset" || normalizedName(row.basisOfRecord) !== "humanobservation") {
      reject("record-kind-not-human-observation");
      continue;
    }
    if (normalizedName(row.countryCode) !== "us") {
      reject("country-not-us");
      continue;
    }
    const stateCode = stateCodeByName.get(normalizedName(row.stateProvince));
    if (
      !stateCode ||
      !countiesByState.has(stateCode) ||
      !existsSync(path.join(ROOT, "public/generated/research", stateCode, "counties"))
    ) {
      reject("state-unresolved-or-out-of-scope");
      continue;
    }
    if (!establishmentApplies(row.establishmentMeans, stateCode)) {
      reject("establishment-not-nonnative-in-record-region");
      continue;
    }
    const name = normalizedName(row.scientificName);
    if (ambiguousCatalogNames.has(name)) {
      reject("catalog-name-ambiguous");
      continue;
    }
    const species = exactCatalog.get(name);
    if (!species) {
      reject("taxon-not-exact-catalog");
      continue;
    }
    exactSourceTaxa.add(name);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(row.eventDate)) {
      reject("event-date-invalid");
      continue;
    }
    const latitude = Number(row.decimalLatitude);
    const longitude = Number(row.decimalLongitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      reject("coordinates-invalid");
      continue;
    }
    const matches = (countiesByState.get(stateCode) ?? []).filter(({ feature: countyFeature }) =>
      geoContains(countyFeature, [longitude, latitude]),
    );
    if (matches.length !== 1) {
      reject(matches.length === 0 ? "coordinate-outside-declared-state" : "coordinate-county-ambiguous");
      continue;
    }
    if (normalizedName(matches[0].countyName) !== normalizedName(row.county)) {
      reject("coordinate-source-county-disagreement");
      continue;
    }
    if (!row.occurrenceID || row.id !== row.occurrenceID) {
      reject("occurrence-identity-invalid");
      continue;
    }
    mappedRecords.push({
      occurrenceId: row.occurrenceID,
      countyFips: matches[0].countyFips,
      stateCode,
      speciesId: species.id,
      scientificName: species.scientificName,
      eventDate: row.eventDate,
      latitude,
      longitude,
      sourceState: row.stateProvince,
      sourceCounty: row.county,
    });
  }

  mappedRecords.sort((left, right) =>
    compareText(
      `${left.countyFips}:${left.speciesId}:${left.occurrenceId}`,
      `${right.countyFips}:${right.speciesId}:${right.occurrenceId}`,
    ),
  );
  const pairRecords = new Map<string, typeof mappedRecords>();
  for (const record of mappedRecords) {
    const key = `${record.countyFips}:${record.speciesId}`;
    pairRecords.set(key, [...(pairRecords.get(key) ?? []), record]);
  }
  const grossPairs = [...pairRecords.keys()].sort(compareText);
  const candidateCounties = [...new Set(grossPairs.map((key) => key.slice(0, 5)))].sort(compareText);
  const displayStatusByPair = new Map<string, string>();
  const screenedByIpams = new Set<string>();
  for (const countyFips of candidateCounties) {
    const stateCode = STATE_FIPS_TO_INFO[countyFips.slice(0, 2)]?.code;
    assert(stateCode, `Candidate county ${countyFips} has no configured state.`);
    const shard = readJson<CountyProjection>(
      path.join(ROOT, "public/generated/research", stateCode, "counties", `${countyFips}.json`),
    );
    for (const pair of shard.pairs) {
      const key = `${countyFips}:${pair.speciesId}`;
      displayStatusByPair.set(key, pair.displayStatus);
      if (pair.screenedBySourceIds?.includes(SOURCE_ID)) screenedByIpams.add(key);
    }
  }
  const presentOverlaps = grossPairs.filter((key) => displayStatusByPair.get(key) === "verified-present");
  const absentConflicts = grossPairs.filter((key) => displayStatusByPair.get(key) === "verified-absent");
  const netEligiblePairs = grossPairs.filter(
    (key) => displayStatusByPair.get(key) !== "verified-present" && displayStatusByPair.get(key) !== "verified-absent",
  );
  const excludedCrossSourcePairs = new Set<string>();
  if (excludePlanDirectory && excludeSourceId) {
    for (const filename of readdirSync(excludePlanDirectory).filter((entry) =>
      entry.startsWith(`${excludeSourceId}-`) && entry.endsWith(".json"),
    )) {
      const plan = readJson<{ candidates?: Array<{ countyFips: string; speciesId: string }> }>(path.join(excludePlanDirectory, filename));
      for (const candidate of plan.candidates ?? []) excludedCrossSourcePairs.add(`${candidate.countyFips}:${candidate.speciesId}`);
    }
  }
  const selectedNetEligiblePairs = netEligiblePairs.filter((key) => !excludedCrossSourcePairs.has(key));
  const sameSourceOverlaps = grossPairs.filter((key) => screenedByIpams.has(key));

  const byState = new Map<string, { gross: number; presentOverlap: number; absentConflict: number; netEligible: number }>();
  for (const key of grossPairs) {
    const stateCode = STATE_FIPS_TO_INFO[key.slice(0, 2)]?.code ?? "UNKNOWN";
    const current = byState.get(stateCode) ?? { gross: 0, presentOverlap: 0, absentConflict: 0, netEligible: 0 };
    current.gross += 1;
    if (displayStatusByPair.get(key) === "verified-present") current.presentOverlap += 1;
    else if (displayStatusByPair.get(key) === "verified-absent") current.absentConflict += 1;
    else current.netEligible += 1;
    byState.set(stateCode, current);
  }

  const result = {
    schemaVersion: 1,
    kind: "isitusa-source-yield-preflight",
    sourceId: SOURCE_ID,
    datasetKey: DATASET_KEY,
    sourceDirectory,
    sourceArtifacts: {
      occurrence: { bytes: occurrenceBytes.length, sha256: sha256(occurrenceBytes) },
      eml: { bytes: readFileSync(emlPath).length, sha256: sha256(readFileSync(emlPath)) },
      meta: { bytes: readFileSync(metaPath).length, sha256: sha256(readFileSync(metaPath)) },
      countyTopology: {
        path: "src/data/source/county-equivalents-topology.json",
        sha256: sha256(readFileSync(path.join(ROOT, "src/data/source/county-equivalents-topology.json"))),
      },
    },
    baseline: {
      commit: process.env.ISITUSA_BASELINE_COMMIT ?? null,
      verifiedPresentPairCount: readiness.national.denominator.verifiedPresent,
      verifiedAbsentPairCount: readiness.national.denominator.verifiedAbsent,
    },
    counts: {
      sourceRows: rows.length,
      sourceTaxa: allSourceTaxa.size,
      exactCatalogTaxa: exactSourceTaxa.size,
      acceptedMappedRecords: mappedRecords.length,
      grossUniqueCountySpeciesPairs: grossPairs.length,
      existingVerifiedPresentOverlaps: presentOverlaps.length,
      verifiedAbsentConflicts: absentConflicts.length,
      sameSourceSnapshotCompletedOverlaps: sameSourceOverlaps.length,
      withinPlanDuplicates: mappedRecords.length - grossPairs.length,
      netEligiblePairs: netEligiblePairs.length,
      excludedEarlierSourcePairs: netEligiblePairs.length - selectedNetEligiblePairs.length,
      selectedNetEligiblePairs: selectedNetEligiblePairs.length,
    },
    pairHashes: {
      grossPairSetSha256: sha256(`${grossPairs.join("\n")}\n`),
      presentOverlapSetSha256: sha256(`${presentOverlaps.join("\n")}\n`),
      absentConflictSetSha256: sha256(`${absentConflicts.join("\n")}\n`),
      sameSourceOverlapSetSha256: sha256(`${sameSourceOverlaps.join("\n")}\n`),
      netEligiblePairSetSha256: sha256(`${netEligiblePairs.join("\n")}\n`),
      selectedNetEligiblePairSetSha256: sha256(`${selectedNetEligiblePairs.join("\n")}\n`),
    },
    rejections: Object.fromEntries(Object.entries(rejectionCounts).sort(([left], [right]) => compareText(left, right))),
    states: Object.fromEntries([...byState.entries()].sort(([left], [right]) => compareText(left, right))),
    sampleNetEligiblePairs: netEligiblePairs.slice(0, 25),
    elapsedMs: Date.now() - startedAt,
  };
  if (planOutputDirectory) {
    mkdirSync(planOutputDirectory, { recursive: true });
    const generatedAt = new Date().toISOString();
    const targetsByState = new Map<string, Array<(typeof mappedRecords)[number] & { pairKey: string }>>();
    for (const key of selectedNetEligiblePairs) {
      const witness = pairRecords.get(key)?.[0];
      assert(witness, `Missing retained IPAMS witness for ${key}.`);
      const targets = targetsByState.get(witness.stateCode) ?? [];
      targets.push({ pairKey: key, ...witness });
      targetsByState.set(witness.stateCode, targets);
    }
    for (const [stateCode, unsortedTargets] of [...targetsByState.entries()].sort(([left], [right]) => compareText(left, right))) {
      const targets = unsortedTargets.sort((left, right) => compareText(left.pairKey, right.pairKey));
      const candidatePairs = targets.map((target) => target.pairKey);
      const planId = `${SOURCE_ID}-${stateCode.toLocaleLowerCase("en-US")}-20260904-r1`;
      const plan = {
        schemaVersion: 1,
        planId,
        sourceId: SOURCE_ID,
        stateCode,
        generatedAt,
        evaluatedAt: generatedAt,
        dStartCommit: process.env.ISITUSA_BASELINE_COMMIT ?? null,
        candidates: targets.map((target) => ({ sourceId: SOURCE_ID, speciesId: target.speciesId, countyFips: target.countyFips })),
        retainedGbifObservations: {
          mode: "retained-archive-witnesses",
          profile: SOURCE_ID,
          datasetKey: DATASET_KEY,
          datasetDoi: DATASET_DOI,
          datasetUrl: DATASET_URL,
          metadataUrl: METADATA_URL,
          usagePolicyUrl: USAGE_POLICY_URL,
          datasetVersion: DATASET_VERSION,
          datasetLastModified: DATASET_LAST_MODIFIED,
          archiveBytes: ARCHIVE_BYTES,
          archiveSha256: ARCHIVE_SHA256,
          occurrenceBytes: occurrenceBytes.length,
          occurrenceSha256: sha256(occurrenceBytes),
          emlSha256: sha256(readFileSync(emlPath)),
          metaSha256: sha256(readFileSync(metaPath)),
          archiveVerifiedAt: ARCHIVE_VERIFIED_AT,
          preflightEvaluationId: PREFLIGHT_EVALUATION_ID,
          targetPairSetSha256: sha256(candidatePairs.join("\n")),
          targets,
        },
        antiDuplication: {
          exactCurrentProjectionSubtraction: true,
          existingVerifiedPresentOverlaps: presentOverlaps.length,
          priorSameSourceSnapshotOverlaps: sameSourceOverlaps.length,
          excludedEarlierSourcePairs: netEligiblePairs.length - selectedNetEligiblePairs.length,
          verifiedAbsentConflicts: absentConflicts.length,
          selectedNetPairs: targets.length,
        },
      };
      writeFileSync(path.join(planOutputDirectory, `${planId}.json`), `${JSON.stringify(plan, null, 2)}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
