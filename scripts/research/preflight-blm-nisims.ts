import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

import countyTopology from "@/data/source/county-equivalents-topology.json";
import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import { listCountyEquivalents } from "@/lib/research/geography-registry";

type CatalogSpecies = { id: string; scientificName: string };
type NisimsRow = {
  id: string;
  license: string;
  datasetName: string;
  basisOfRecord: string;
  occurrenceID: string;
  organismQuantity: string;
  organismQuantityType: string;
  establishmentMeans: string;
  occurrenceStatus: string;
  occurrenceRemarks: string;
  eventDate: string;
  year: string;
  countryCode: string;
  stateProvince: string;
  decimalLatitude: string;
  decimalLongitude: string;
  georeferenceRemarks: string;
  taxonID: string;
  scientificName: string;
  kingdom: string;
};
type CountyProjection = {
  stateCode: string;
  countyFips: string;
  pairs: Array<{ speciesId: string; displayStatus: string }>;
};
type ReadinessDashboard = {
  national: { denominator: { verifiedPresent: number; verifiedAbsent: number } };
};

const ROOT = process.cwd();
const SOURCE_ID = "blm-nisims";
const DATASET_KEY = "cc63e998-fe1b-468d-94f1-6afcf494d0e4";
const EXPECTED_LICENSE = "http://creativecommons.org/publicdomain/zero/1.0/legalcode";
const EXPECTED_DATASET = "BLM - National Invasive Species Information Management System - Plants";
const DATASET_DOI = "10.15468/y4xndh";
const DATASET_URL = "https://ipt.gbif.us/archive.do?r=blm_nisims";
const METADATA_URL = "https://ipt.gbif.us/eml.do?r=blm_nisims";
const USAGE_POLICY_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const DATASET_VERSION = "1.2";
const DATASET_LAST_MODIFIED = "2023-01-04T17:25:43Z";
const ARCHIVE_BYTES = 7449124;
const ARCHIVE_SHA256 = "60f8d6e8974b3b95e89e8d291db3cd1472548c18e85f8c3f3468abcd7c3d726c";
const ARCHIVE_VERIFIED_AT = "2026-09-03T17:16:55.091Z";
const PREFLIGHT_EVALUATION_ID = "blm-nisims-preflight-20260904-r1";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
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
  return {
    sourceDirectory: path.resolve(sourceDirectory),
    planOutputDirectory: planOutputDirectory ? path.resolve(planOutputDirectory) : null,
  };
}

function readJson<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function buildCountyFeaturesByState() {
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: Array<{ id: string | number }> } };
  };
  const collection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  const byState = new Map<
    string,
    Array<{ countyFips: string; feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> }>
  >();
  collection.features.forEach((countyFeature, index) => {
    const countyFips = String(topology.objects.counties.geometries[index].id).padStart(5, "0");
    const stateCode = STATE_FIPS_TO_INFO[countyFips.slice(0, 2)]?.code;
    if (!stateCode) return;
    const current = byState.get(stateCode) ?? [];
    current.push({ countyFips, feature: countyFeature });
    byState.set(stateCode, current);
  });
  return byState;
}

function main() {
  const startedAt = Date.now();
  const { sourceDirectory, planOutputDirectory } = parseArguments(process.argv.slice(2));
  const occurrencePath = path.join(sourceDirectory, "occurrence.txt");
  const emlPath = path.join(sourceDirectory, "eml.xml");
  const metaPath = path.join(sourceDirectory, "meta.xml");
  const occurrenceBytes = readFileSync(occurrencePath);
  const rows = parse(occurrenceBytes, {
    bom: true,
    columns: true,
    delimiter: "\t",
    skip_empty_lines: true,
  }) as NisimsRow[];

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
  const legalCountyNameByFips = new Map(
    Object.values(STATE_FIPS_TO_INFO).flatMap((state) =>
      listCountyEquivalents(state.code).map((county) => [county.countyFips, county.legalName] as const),
    ),
  );

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
    if (row.basisOfRecord !== "HumanObservation") {
      reject("basis-not-human-observation");
      continue;
    }
    if (normalizedName(row.countryCode) !== "us") {
      reject("country-not-us");
      continue;
    }
    if (normalizedName(row.establishmentMeans) !== "introduced") {
      reject("establishment-not-introduced");
      continue;
    }
    if (normalizedName(row.occurrenceStatus) !== "present") {
      reject("occurrence-not-present");
      continue;
    }
    const quantity = Number(row.organismQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || normalizedName(row.organismQuantityType) !== "percent cover") {
      reject("nonpositive-or-invalid-cover");
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
    const stateCode = stateCodeByName.get(normalizedName(row.stateProvince));
    if (!stateCode) {
      reject("state-unresolved");
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
      sourceCounty: legalCountyNameByFips.get(matches[0].countyFips) ?? "",
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
  const determinationByPair = new Map<string, string>();
  const absentConflicts = new Set<string>();
  for (const countyFips of candidateCounties) {
    const stateCode = STATE_FIPS_TO_INFO[countyFips.slice(0, 2)]?.code;
    assert(stateCode, `Candidate county ${countyFips} has no configured state.`);
    const shard = readJson<CountyProjection>(
      path.join(ROOT, "public/generated/research", stateCode, "counties", `${countyFips}.json`),
    );
    assert(shard.stateCode === stateCode && shard.countyFips === countyFips, `Projection identity differs for ${countyFips}.`);
    for (const pair of shard.pairs) {
      const key = `${countyFips}:${pair.speciesId}`;
      determinationByPair.set(key, pair.displayStatus);
      if (pair.displayStatus === "verified-absent") absentConflicts.add(key);
    }
  }
  const presentOverlaps = grossPairs.filter((key) => determinationByPair.get(key) === "verified-present");
  const notPresent = grossPairs.filter((key) => determinationByPair.get(key) !== "verified-present");
  const netEligiblePairs = notPresent.filter((key) => !absentConflicts.has(key));
  const conflictPairs = notPresent.filter((key) => absentConflicts.has(key));

  const byState = new Map<string, { gross: number; presentOverlap: number; absentConflict: number; netEligible: number }>();
  for (const key of grossPairs) {
    const stateCode = STATE_FIPS_TO_INFO[key.slice(0, 2)]?.code ?? "UNKNOWN";
    const current = byState.get(stateCode) ?? { gross: 0, presentOverlap: 0, absentConflict: 0, netEligible: 0 };
    current.gross += 1;
    if (determinationByPair.get(key) === "verified-present") current.presentOverlap += 1;
    else if (absentConflicts.has(key)) current.absentConflict += 1;
    else current.netEligible += 1;
    byState.set(stateCode, current);
  }

  const bySpecies = new Map<string, { scientificName: string; gross: number; presentOverlap: number; absentConflict: number; netEligible: number }>();
  for (const key of grossPairs) {
    const speciesId = key.slice(6);
    const scientificName = pairRecords.get(key)?.[0]?.scientificName ?? "";
    const current = bySpecies.get(speciesId) ?? { scientificName, gross: 0, presentOverlap: 0, absentConflict: 0, netEligible: 0 };
    current.gross += 1;
    if (determinationByPair.get(key) === "verified-present") current.presentOverlap += 1;
    else if (absentConflicts.has(key)) current.absentConflict += 1;
    else current.netEligible += 1;
    bySpecies.set(speciesId, current);
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
      verifiedAbsentConflicts: conflictPairs.length,
      sameSourceSnapshotCompletedOverlaps: 0,
      priorPlanOverlaps: 0,
      withinPlanDuplicates: mappedRecords.length - grossPairs.length,
      netEligiblePairs: netEligiblePairs.length,
    },
    pairHashes: {
      grossPairSetSha256: sha256(`${grossPairs.join("\n")}\n`),
      presentOverlapSetSha256: sha256(`${presentOverlaps.join("\n")}\n`),
      absentConflictSetSha256: sha256(`${conflictPairs.join("\n")}\n`),
      netEligiblePairSetSha256: sha256(`${netEligiblePairs.join("\n")}\n`),
    },
    rejections: Object.fromEntries(Object.entries(rejectionCounts).sort(([left], [right]) => compareText(left, right))),
    states: Object.fromEntries([...byState.entries()].sort(([left], [right]) => compareText(left, right))),
    species: Object.fromEntries(
      [...bySpecies.entries()]
        .sort(([, left], [, right]) => right.netEligible - left.netEligible || compareText(left.scientificName, right.scientificName))
        .map(([speciesId, counts]) => [speciesId, counts]),
    ),
    sampleNetEligiblePairs: netEligiblePairs.slice(0, 25),
    elapsedMs: Date.now() - startedAt,
  };
  if (planOutputDirectory) {
    mkdirSync(planOutputDirectory, { recursive: true });
    const generatedAt = new Date().toISOString();
    const targetsByState = new Map<string, Array<(typeof mappedRecords)[number] & { pairKey: string }>>();
    for (const key of netEligiblePairs) {
      const witness = pairRecords.get(key)?.[0];
      assert(witness, `Missing retained NISIMS witness for ${key}.`);
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
          verifiedAbsentConflicts: conflictPairs.length,
          selectedNetPairs: targets.length,
        },
      };
      writeFileSync(path.join(planOutputDirectory, `${planId}.json`), `${JSON.stringify(plan, null, 2)}\n`);
    }
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
