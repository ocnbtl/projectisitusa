import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { resolve } from "node:path";

import { parse } from "csv-parse/sync";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";

import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "USGS North American Breeding Bird Survey route-start detections";
const SCIENCEBASE_ITEM_ID = "6a0b0b0ab66b0188da36aedd";
const SCIENCEBASE_ITEM_URL = `https://www.sciencebase.gov/catalog/item/${SCIENCEBASE_ITEM_ID}`;
const SCIENCEBASE_ITEM_JSON_URL = `${SCIENCEBASE_ITEM_URL}?format=json`;
const TEMP_DIR = resolve("/tmp", `isitusa-bbs-${SCIENCEBASE_ITEM_ID}`);
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/bbs-alabama-route-start-birds-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");

const PILOT_TARGET_SCIENTIFIC_NAMES = [
  "Sturnus vulgaris",
  "Passer domesticus",
  "Streptopelia decaocto",
  "Columba livia",
  "Cygnus olor",
  "Myiopsitta monachus",
  "Alopochen aegyptiaca",
  "Pycnonotus jocosus",
];

type ScienceBaseItem = {
  title: string;
  citation: string;
  files: {
    name: string;
    downloadUri: string;
  }[];
};

type CountyGeometry = {
  id: string;
  properties?: {
    name?: string;
  };
};

type CountyFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { name?: string; countyFips: string }
>;

type RouteRow = {
  CountryNum: string;
  StateNum: string;
  Route: string;
  RouteName: string;
  Active: string;
  Latitude: string;
  Longitude: string;
};

type SpeciesRow = {
  AOU: string;
  Genus: string;
  Species: string;
};

type WeatherRow = {
  RouteDataID: string;
  CountryNum: string;
  StateNum: string;
  Route: string;
  RunType: string;
};

type BbsTarget = {
  speciesId: string;
  scientificName: string;
  commonName: string;
  aou: string;
  relatedSpeciesIds: string[];
};

type BbsRoute = {
  route: string;
  routeName: string;
  active: string;
  countyFips: string;
  latitude: number;
  longitude: number;
};

type BbsDetectionRecord = {
  routeDataId: string;
  route: string;
  routeName: string;
  year: number;
  aou: string;
  stop1Count: number;
  countyFips: string;
  routeStartLatitude: number;
  routeStartLongitude: number;
};

type ImportedCoverage = {
  scientificName: string;
  commonName: string;
  aou: string;
  relatedSpeciesIds: string[];
  countyFips: Set<string>;
  records: BbsDetectionRecord[];
  representativeRecords: Map<string, BbsDetectionRecord>;
};

type BbsSourceSnapshotSpecies = {
  speciesId: string;
  scientificName: string;
  commonName: string;
  aou: string;
  acceptedRecordCount: number;
  countyFips: string[];
  representativeRecords: BbsDetectionRecord[];
};

type BbsSourceSnapshotFile = {
  source: string;
  citation: string[];
  accessedAt: string;
  scienceBaseItemId: string;
  filters: {
    countryNum: "840";
    stateNum: "02";
    runType: "1";
    stop: "Stop1";
    minStopCount: 1;
    coordinateResolution: "route start point must resolve to exactly one Alabama county";
  };
  targetScientificNames: string[];
  species: BbsSourceSnapshotSpecies[];
  summary: {
    targetSpeciesCount: number;
    exactCatalogTargets: number;
    exactBbsSpeciesTargets: number;
    importedSpeciesCount: number;
    acceptedRecordCount: number;
    countySpeciesPairs: number;
    standardAlabamaRuns: number;
    resolvedAlabamaRoutes: number;
  };
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function curlText(url: string, maxBuffer = 20 * 1024 * 1024) {
  return execFileSync(
    "curl",
    ["-sL", "--retry", "2", "--max-time", "180", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer },
  );
}

function downloadFile(url: string, outputPath: string) {
  execFileSync(
    "curl",
    [
      "-sL",
      "--retry",
      "2",
      "--max-time",
      "240",
      "-A",
      USER_AGENT,
      "-o",
      outputPath,
      url,
    ],
    { encoding: "utf8", maxBuffer: 1024 * 1024 },
  );
}

function ensureDownloaded(fileName: string, url: string) {
  const outputPath = resolve(TEMP_DIR, fileName);
  if (!existsSync(outputPath)) {
    downloadFile(url, outputPath);
  }
  return outputPath;
}

function canonicalScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function countyPresenceSpeciesId(record: Species) {
  return record.profileType === "registry" && record.registry?.occurrenceId
    ? record.registry.occurrenceId
    : record.id;
}

function relatedCountyPresenceSpeciesIds(record: Species) {
  return [
    ...new Set([record.id, record.registry?.occurrenceId, countyPresenceSpeciesId(record)].filter(
      (value): value is string => Boolean(value),
    )),
  ];
}

function uniqueSources(sources: CountyDataSourceRef[]) {
  return [
    ...new Map(
      sources.map((source) => [
        `${source.source}::${source.matchType}::${source.externalId}::${source.url}`,
        source,
      ]),
    ).values(),
  ];
}

function buildCoverageSummary(
  records: CountyCoverageSpeciesSnapshot[],
  catalogSpeciesCount: number,
) {
  const mappedRecords = records.filter((record) => record.countyFips.length > 0);
  const mappedSpeciesIds = new Set(mappedRecords.map((record) => record.speciesId));
  const sourceSpeciesCounts: CountyCoverageSnapshotFile["coverageSummary"]["sourceSpeciesCounts"] = {};

  for (const record of mappedRecords) {
    const sourceNames = new Set(record.countyDataSources.map((source) => source.source));
    for (const sourceName of sourceNames) {
      sourceSpeciesCounts[sourceName] = (sourceSpeciesCounts[sourceName] ?? 0) + 1;
    }
  }

  return {
    catalogSpeciesCount,
    mappedSpeciesCount: mappedSpeciesIds.size,
    unmatchedSpeciesCount: Math.max(0, catalogSpeciesCount - mappedSpeciesIds.size),
    sourceSpeciesCounts,
  };
}

function buildCountyFeatures() {
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: CountyGeometry[] } };
  };
  const countyCollection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    { name?: string }
  >;
  const stateCodeByFips = Object.fromEntries(
    Object.entries(STATE_FIPS_TO_INFO).map(([fips, info]) => [fips, info.code]),
  );

  const countyFeatures: CountyFeature[] = [];
  countyCollection.features.forEach((countyFeature, index) => {
    const geometry = topology.objects.counties.geometries[index];
    const countyFips = geometry.id;
    const stateCode = stateCodeByFips[countyFips.slice(0, 2)];
    if (stateCode !== "AL") return;

    countyFeatures.push({
      ...countyFeature,
      properties: {
        ...(countyFeature.properties ?? {}),
        countyFips,
        name: geometry.properties?.name ?? countyFeature.properties?.name,
      },
    });
  });

  return countyFeatures;
}

function resolveCoordinateCountyFips(
  latitude: number,
  longitude: number,
  countyFeatures: CountyFeature[],
) {
  for (const countyFeature of countyFeatures) {
    if (geoContains(countyFeature, [longitude, latitude])) {
      return countyFeature.properties.countyFips;
    }
  }

  return null;
}

function parseCsvFile<T>(filePath: string) {
  return parse(readFileSync(filePath), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

function findScienceBaseFile(item: ScienceBaseItem, fileName: string) {
  const file = item.files.find((entry) => entry.name === fileName);
  if (!file) {
    throw new Error(`BBS ScienceBase file missing: ${fileName}`);
  }

  return file.downloadUri;
}

function loadBbsFiles() {
  mkdirSync(TEMP_DIR, { recursive: true });
  const item = JSON.parse(curlText(SCIENCEBASE_ITEM_JSON_URL)) as ScienceBaseItem;

  return {
    item,
    routesPath: ensureDownloaded("Routes.csv", findScienceBaseFile(item, "Routes.csv")),
    speciesPath: ensureDownloaded(
      "SpeciesList.csv",
      findScienceBaseFile(item, "SpeciesList.csv"),
    ),
    weatherPath: ensureDownloaded("Weather.csv", findScienceBaseFile(item, "Weather.csv")),
    stopDataZipPath: ensureDownloaded(
      "50-StopData.zip",
      findScienceBaseFile(item, "50-StopData.zip"),
    ),
  };
}

function buildRouteLookup(routesPath: string, countyFeatures: CountyFeature[]) {
  const routes = parseCsvFile<RouteRow>(routesPath);
  const routeLookup = new Map<string, BbsRoute>();

  for (const route of routes) {
    if (route.CountryNum !== "840" || route.StateNum !== "02") continue;

    const latitude = Number(route.Latitude);
    const longitude = Number(route.Longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

    const countyFips = resolveCoordinateCountyFips(latitude, longitude, countyFeatures);
    if (!countyFips) continue;

    routeLookup.set(route.Route.padStart(3, "0"), {
      route: route.Route.padStart(3, "0"),
      routeName: route.RouteName,
      active: route.Active,
      countyFips,
      latitude,
      longitude,
    });
  }

  return routeLookup;
}

function buildSpeciesTargets(species: Species[], bbsSpeciesPath: string) {
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalScientificName(record.scientificName), record]),
  );
  const bbsRows = parseCsvFile<SpeciesRow>(bbsSpeciesPath);
  const bbsByScientificName = new Map(
    bbsRows.map((row) => [
      canonicalScientificName(`${row.Genus} ${row.Species}`),
      row,
    ]),
  );
  const targets = new Map<string, BbsTarget>();

  let exactCatalogTargets = 0;
  let exactBbsSpeciesTargets = 0;
  for (const scientificName of PILOT_TARGET_SCIENTIFIC_NAMES) {
    const speciesRecord = speciesByScientificName.get(canonicalScientificName(scientificName));
    if (!speciesRecord) {
      console.log(`Skipped BBS target without exact catalog match: ${scientificName}`);
      continue;
    }

    exactCatalogTargets += 1;
    const bbsRow = bbsByScientificName.get(canonicalScientificName(scientificName));
    if (!bbsRow) {
      console.log(`Skipped BBS target without exact BBS species-list match: ${scientificName}`);
      continue;
    }

    exactBbsSpeciesTargets += 1;
    targets.set(bbsRow.AOU, {
      speciesId: countyPresenceSpeciesId(speciesRecord),
      scientificName: speciesRecord.scientificName,
      commonName: speciesRecord.commonName,
      aou: bbsRow.AOU,
      relatedSpeciesIds: relatedCountyPresenceSpeciesIds(speciesRecord),
    });
  }

  return { targets, exactCatalogTargets, exactBbsSpeciesTargets };
}

function buildStandardAlabamaRuns(weatherPath: string, routeLookup: Map<string, BbsRoute>) {
  const rows = parseCsvFile<WeatherRow>(weatherPath);
  const runs = new Set<string>();

  for (const row of rows) {
    const route = row.Route.padStart(3, "0");
    if (
      row.CountryNum === "840" &&
      row.StateNum === "02" &&
      row.RunType === "1" &&
      routeLookup.has(route)
    ) {
      runs.add(`${row.RouteDataID}::${route}`);
    }
  }

  return runs;
}

async function scanStopData(
  stopDataZipPath: string,
  targets: Map<string, BbsTarget>,
  routeLookup: Map<string, BbsRoute>,
  standardRuns: Set<string>,
) {
  const imported = new Map<string, ImportedCoverage>();
  const unzip = spawn("unzip", ["-p", stopDataZipPath]);
  const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity });

  let totalRows = 0;
  let alabamaRows = 0;
  let targetRows = 0;
  let acceptedRows = 0;

  for await (const line of lines) {
    if (!line || line.startsWith("RouteDataID,")) continue;

    totalRows += 1;
    const columns = line.split(",");
    if (columns[1] !== "840" || columns[2] !== "02") continue;

    alabamaRows += 1;
    const target = targets.get(columns[6]);
    if (!target) continue;

    targetRows += 1;
    const route = columns[3].trim().padStart(3, "0");
    if (!standardRuns.has(`${columns[0]}::${route}`)) continue;

    const stop1Count = Number(columns[7].trim());
    if (!Number.isFinite(stop1Count) || stop1Count <= 0) continue;

    const routeRecord = routeLookup.get(route);
    if (!routeRecord) continue;

    acceptedRows += 1;
    const coverage = imported.get(target.speciesId) ?? {
      scientificName: target.scientificName,
      commonName: target.commonName,
      aou: target.aou,
      relatedSpeciesIds: target.relatedSpeciesIds,
      countyFips: new Set<string>(),
      records: [],
      representativeRecords: new Map<string, BbsDetectionRecord>(),
    };
    const record: BbsDetectionRecord = {
      routeDataId: columns[0],
      route,
      routeName: routeRecord.routeName,
      year: Number(columns[5]),
      aou: target.aou,
      stop1Count,
      countyFips: routeRecord.countyFips,
      routeStartLatitude: routeRecord.latitude,
      routeStartLongitude: routeRecord.longitude,
    };

    coverage.records.push(record);
    coverage.countyFips.add(record.countyFips);
    if (!coverage.representativeRecords.has(record.countyFips)) {
      coverage.representativeRecords.set(record.countyFips, record);
    }
    imported.set(target.speciesId, coverage);
  }

  await new Promise<void>((resolvePromise, reject) => {
    unzip.on("close", (code) => {
      if (code === 0) {
        resolvePromise();
      } else {
        reject(new Error(`unzip exited with status ${code}`));
      }
    });
    unzip.on("error", reject);
  });

  console.log(
    `Reviewed ${totalRows} BBS 50-stop rows; ${alabamaRows} Alabama rows; ${targetRows} target rows; accepted ${acceptedRows} Stop1 detections.`,
  );
  console.log(
    `Loaded ${imported.size} species from BBS route-start detections with ${[...imported.values()].reduce(
      (total, coverage) => total + coverage.countyFips.size,
      0,
    )} Alabama county-species pairs.`,
  );

  return imported;
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const { item, routesPath, speciesPath, weatherPath, stopDataZipPath } = loadBbsFiles();
  const countyFeatures = buildCountyFeatures();
  const routeLookup = buildRouteLookup(routesPath, countyFeatures);
  const { targets, exactCatalogTargets, exactBbsSpeciesTargets } = buildSpeciesTargets(
    species,
    speciesPath,
  );
  const standardRuns = buildStandardAlabamaRuns(weatherPath, routeLookup);
  const imported = await scanStopData(
    stopDataZipPath,
    targets,
    routeLookup,
    standardRuns,
  );
  const accessedAt = new Date().toISOString();
  const existingBySpeciesId = new Map(
    snapshot.species.map((record) => [record.speciesId, record]),
  );
  const outputRecords = new Map<string, CountyCoverageSpeciesSnapshot>();

  for (const record of snapshot.species) {
    outputRecords.set(record.speciesId, {
      ...record,
      countyDataSources: record.countyDataSources.filter(
        (source) => source.source !== SOURCE_NAME,
      ),
    });
  }

  let netNewCountyPairs = 0;
  for (const [speciesId, coverage] of imported) {
    const existing = existingBySpeciesId.get(speciesId);
    const existingCountyFips = new Set(
      coverage.relatedSpeciesIds.flatMap(
        (relatedSpeciesId) => existingBySpeciesId.get(relatedSpeciesId)?.countyFips ?? [],
      ),
    );
    const countyFips = new Set(existing?.countyFips ?? []);
    for (const fips of coverage.countyFips) {
      if (!existingCountyFips.has(fips)) {
        netNewCountyPairs += 1;
      }
      countyFips.add(fips);
    }

    outputRecords.set(speciesId, {
      speciesId,
      countyFips: [...countyFips].sort(),
      countyDataSources: uniqueSources([
        ...(existing?.countyDataSources ?? []).filter(
          (source) => source.source !== SOURCE_NAME,
        ),
        {
          source: SOURCE_NAME,
          matchType: "scientific-exact",
          externalId: `${coverage.scientificName}; AOU ${coverage.aou}; ${coverage.records.length} standard Stop1 detections across ${coverage.countyFips.size} Alabama route-start counties`,
          url: SCIENCEBASE_ITEM_URL,
        },
      ]),
    });
  }

  const records = [...outputRecords.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const nextSnapshot: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation: [
      ...snapshot.citation.filter((entry) => !entry.includes("Breeding Bird Survey")),
      item.citation,
    ],
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds: snapshot.unmatchedSpeciesIds.filter(
      (speciesId) => !outputRecords.has(speciesId),
    ),
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  const sourceSnapshotSpecies: BbsSourceSnapshotSpecies[] = [...imported.entries()]
    .map(([speciesId, coverage]) => ({
      speciesId,
      scientificName: coverage.scientificName,
      commonName: coverage.commonName,
      aou: coverage.aou,
      acceptedRecordCount: coverage.records.length,
      countyFips: [...coverage.countyFips].sort(),
      representativeRecords: [...coverage.representativeRecords.values()].sort(
        (left, right) => left.countyFips.localeCompare(right.countyFips),
      ),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const sourceSnapshot: BbsSourceSnapshotFile = {
    source: SOURCE_NAME,
    citation: [
      item.citation,
      "U.S. Geological Survey. 2026. North American Breeding Bird Survey raw data page. Available online at https://www.pwrc.usgs.gov/bbs/RawData/.",
    ],
    accessedAt,
    scienceBaseItemId: SCIENCEBASE_ITEM_ID,
    filters: {
      countryNum: "840",
      stateNum: "02",
      runType: "1",
      stop: "Stop1",
      minStopCount: 1,
      coordinateResolution: "route start point must resolve to exactly one Alabama county",
    },
    targetScientificNames: PILOT_TARGET_SCIENTIFIC_NAMES,
    species: sourceSnapshotSpecies,
    summary: {
      targetSpeciesCount: PILOT_TARGET_SCIENTIFIC_NAMES.length,
      exactCatalogTargets,
      exactBbsSpeciesTargets,
      importedSpeciesCount: sourceSnapshotSpecies.length,
      acceptedRecordCount: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.acceptedRecordCount,
        0,
      ),
      countySpeciesPairs: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.countyFips.length,
        0,
      ),
      standardAlabamaRuns: standardRuns.size,
      resolvedAlabamaRoutes: routeLookup.size,
    },
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  await writeFile(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);
  console.log(`Saved BBS route-start detections snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Saved BBS source audit to ${SOURCE_SNAPSHOT_PATH}`);
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
