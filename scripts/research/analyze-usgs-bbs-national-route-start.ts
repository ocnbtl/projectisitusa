import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { parse } from "csv-parse/sync";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

import countyTopology from "@/data/source/county-equivalents-topology.json";
import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";

type CatalogSpecies = {
  id: string;
  scientificName: string;
  registry?: { className?: string };
};

type BbsSpeciesRow = {
  AOU: string;
  Genus: string;
  Species: string;
};

type RouteRow = {
  CountryNum: string;
  StateNum: string;
  Route: string;
  RouteName: string;
  Active: string;
  Latitude: string;
  Longitude: string;
};

type WeatherRow = {
  RouteDataID: string;
  CountryNum: string;
  StateNum: string;
  Route: string;
  Year: string;
  RunType: string;
};

type PresenceFile = Record<string, { speciesIds: string[] }>;

type Route = {
  routeKey: string;
  routeName: string;
  countyFips: string;
  stateCode: string;
  latitude: number;
  longitude: number;
};

type Target = {
  speciesId: string;
  scientificName: string;
  aou: string;
};

type Representative = {
  routeDataId: string;
  routeKey: string;
  routeName: string;
  year: number;
  aou: string;
  stop1Count: number;
  countyFips: string;
  stateCode: string;
  latitude: number;
  longitude: number;
};

function parseArguments(argv: string[]) {
  const sourceDirectoryIndex = argv.indexOf("--source-directory");
  const sourceDirectory = argv[sourceDirectoryIndex + 1];
  if (sourceDirectoryIndex < 0 || !sourceDirectory) {
    throw new Error("--source-directory is required.");
  }
  const stateIndex = argv.indexOf("--state");
  const stateCode = stateIndex >= 0 ? argv[stateIndex + 1]?.toUpperCase() : undefined;
  if (stateIndex >= 0 && !stateCode?.match(/^[A-Z]{2}$/u)) {
    throw new Error("--state must be a two-letter code when provided.");
  }
  const planOutputIndex = argv.indexOf("--plan-output");
  const planOutput = planOutputIndex >= 0 ? argv[planOutputIndex + 1] : undefined;
  const planIdIndex = argv.indexOf("--plan-id");
  const planId = planIdIndex >= 0 ? argv[planIdIndex + 1] : undefined;
  if (Boolean(planOutput) !== Boolean(planId) || (planOutput && !stateCode)) {
    throw new Error("--plan-output, --plan-id, and --state must be provided together.");
  }
  return {
    sourceDirectory: path.resolve(sourceDirectory),
    stateCode,
    planOutput: planOutput ? path.resolve(planOutput) : undefined,
    planId,
  };
}

function readJson<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function parseCsv<T>(filePath: string) {
  return parse(readFileSync(filePath), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

function canonicalName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function routeKey(stateNum: string, route: string) {
  return `${stateNum.trim().padStart(2, "0")}:${route.trim().padStart(3, "0")}`;
}

function buildCountyFeatures() {
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: Array<{ id: string | number }> } };
  };
  const collection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

  return collection.features.map((countyFeature, index) => ({
    countyFips: String(topology.objects.counties.geometries[index].id).padStart(5, "0"),
    feature: countyFeature,
  }));
}

function main() {
  const root = process.cwd();
  const {
    sourceDirectory,
    stateCode: outputStateCode,
    planOutput,
    planId,
  } = parseArguments(process.argv.slice(2));
  const catalog = readJson<CatalogSpecies[]>(path.join(root, "src/data/generated/species.json"));
  const currentPresence = readJson<PresenceFile>(path.join(root, "src/data/generated/presence.json"));
  const bbsSpecies = parseCsv<BbsSpeciesRow>(path.join(sourceDirectory, "SpeciesList.csv"));
  const bbsByScientificName = new Map(
    bbsSpecies.map((row) => [canonicalName(`${row.Genus} ${row.Species}`), row]),
  );
  const catalogBirds = catalog
    .filter((record) => record.registry?.className === "Aves")
    .sort((left, right) => left.scientificName.localeCompare(right.scientificName));
  const targets = new Map<string, Target>();
  const unmatchedCatalogBirds: string[] = [];
  for (const record of catalogBirds) {
    const row = bbsByScientificName.get(canonicalName(record.scientificName));
    if (!row) {
      unmatchedCatalogBirds.push(record.scientificName);
      continue;
    }
    targets.set(row.AOU.trim().padStart(5, "0"), {
      speciesId: record.id,
      scientificName: record.scientificName,
      aou: row.AOU.trim().padStart(5, "0"),
    });
  }

  const countyFeatures = buildCountyFeatures();
  const routes = parseCsv<RouteRow>(path.join(sourceDirectory, "Routes.csv"));
  const routeLookup = new Map<string, Route>();
  let unitedStatesRoutes = 0;
  let unresolvedUnitedStatesRoutes = 0;
  for (const row of routes) {
    if (row.CountryNum.trim() !== "840") continue;
    unitedStatesRoutes += 1;
    const latitude = Number(row.Latitude.trim());
    const longitude = Number(row.Longitude.trim());
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      unresolvedUnitedStatesRoutes += 1;
      continue;
    }
    const matches = countyFeatures.filter(({ feature: countyFeature }) =>
      geoContains(countyFeature, [longitude, latitude]),
    );
    if (matches.length !== 1) {
      unresolvedUnitedStatesRoutes += 1;
      continue;
    }
    const countyFips = matches[0].countyFips;
    const stateCode = STATE_FIPS_TO_INFO[countyFips.slice(0, 2)]?.code;
    if (!stateCode) {
      unresolvedUnitedStatesRoutes += 1;
      continue;
    }
    const key = routeKey(row.StateNum, row.Route);
    routeLookup.set(key, {
      routeKey: key,
      routeName: row.RouteName.trim(),
      countyFips,
      stateCode,
      latitude,
      longitude,
    });
  }

  const weather = parseCsv<WeatherRow>(path.join(sourceDirectory, "Weather.csv"));
  const standardRuns = new Map<string, { route: Route; year: number }>();
  for (const row of weather) {
    if (row.CountryNum.trim() !== "840" || row.RunType.trim() !== "1") continue;
    const route = routeLookup.get(routeKey(row.StateNum, row.Route));
    const year = Number(row.Year.trim());
    if (!route || !Number.isInteger(year)) continue;
    standardRuns.set(row.RouteDataID.trim(), { route, year });
  }

  const zipPath = path.join(sourceDirectory, "50-StopData.zip");
  const unzip = spawn("tar", ["-xOf", zipPath], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  unzip.stderr.setEncoding("utf8");
  unzip.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const unzipCompletion = new Promise<number | null>((resolvePromise, reject) => {
    unzip.on("error", reject);
    unzip.on("close", resolvePromise);
  });
  const lines = createInterface({ input: unzip.stdout, crlfDelay: Infinity });
  const pairRecords = new Map<string, { target: Target; representative: Representative; rows: number }>();
  let archiveRows = 0;
  let targetRows = 0;
  let standardTargetRows = 0;
  let acceptedRows = 0;

  const finish = async () => {
    for await (const line of lines) {
      if (!line || line.startsWith("RouteDataID,")) continue;
      archiveRows += 1;
      const columns = line.split(",");
      if (columns.length < 8 || columns[1].trim() !== "840") continue;
      const target = targets.get(columns[6].trim().padStart(5, "0"));
      if (!target) continue;
      targetRows += 1;
      const standardRun = standardRuns.get(columns[0].trim());
      if (!standardRun) continue;
      standardTargetRows += 1;
      const stop1Count = Number(columns[7].trim());
      if (!Number.isFinite(stop1Count) || stop1Count <= 0) continue;
      acceptedRows += 1;
      const { route, year } = standardRun;
      const pairKey = `${route.countyFips}:${target.speciesId}`;
      const representative: Representative = {
        routeDataId: columns[0].trim(),
        routeKey: route.routeKey,
        routeName: route.routeName,
        year,
        aou: target.aou,
        stop1Count,
        countyFips: route.countyFips,
        stateCode: route.stateCode,
        latitude: route.latitude,
        longitude: route.longitude,
      };
      const existing = pairRecords.get(pairKey);
      pairRecords.set(pairKey, {
        target,
        representative:
          !existing || representative.year > existing.representative.year
            ? representative
            : existing.representative,
        rows: (existing?.rows ?? 0) + 1,
      });
    }

    const exitCode = await unzipCompletion;
    if (exitCode !== 0) {
      throw new Error(`tar exited with ${exitCode}: ${stderr.trim()}`);
    }

    const countyProjectionCache = new Map<string, Map<string, string>>();
    const researchStatus = (countyFips: string, speciesId: string) => {
      let bySpecies = countyProjectionCache.get(countyFips);
      if (!bySpecies) {
        const stateCode = STATE_FIPS_TO_INFO[countyFips.slice(0, 2)]?.code;
        const countyPath = stateCode
          ? path.join(root, `public/generated/research/${stateCode}/counties/${countyFips}.json`)
          : "";
        const county = countyPath
          ? readJson<{ species?: Array<{ speciesId: string; displayStatus: string }> }>(countyPath)
          : {};
        bySpecies = new Map(
          (county.species ?? []).map((entry) => [entry.speciesId, entry.displayStatus]),
        );
        countyProjectionCache.set(countyFips, bySpecies);
      }
      return bySpecies.get(speciesId) ?? "not-researched";
    };
    const pairs = [...pairRecords.entries()]
      .map(([pairKey, value]) => ({
        pairKey,
        speciesId: value.target.speciesId,
        scientificName: value.target.scientificName,
        rows: value.rows,
        alreadyPresent:
          ((
            currentPresence[value.representative.countyFips] ??
            currentPresence[String(Number(value.representative.countyFips))]
          )?.speciesIds.includes(value.target.speciesId) ?? false) ||
          researchStatus(value.representative.countyFips, value.target.speciesId) ===
            "verified-present",
        ...value.representative,
      }))
      .sort((left, right) => left.pairKey.localeCompare(right.pairKey));
    const netPairs = pairs.filter((entry) => !entry.alreadyPresent);
    const byState = [...new Set(pairs.map((entry) => entry.stateCode))]
      .sort()
      .map((stateCode) => {
        const statePairs = pairs.filter((entry) => entry.stateCode === stateCode);
        return {
          stateCode,
          grossPairs: statePairs.length,
          netNewPairs: statePairs.filter((entry) => !entry.alreadyPresent).length,
          acceptedRows: statePairs.reduce((sum, entry) => sum + entry.rows, 0),
        };
      })
      .sort((left, right) => right.netNewPairs - left.netNewPairs || left.stateCode.localeCompare(right.stateCode));
    const bySpecies = [...targets.values()]
      .map((target) => {
        const speciesPairs = pairs.filter((entry) => entry.speciesId === target.speciesId);
        return {
          speciesId: target.speciesId,
          scientificName: target.scientificName,
          aou: target.aou,
          grossPairs: speciesPairs.length,
          netNewPairs: speciesPairs.filter((entry) => !entry.alreadyPresent).length,
          acceptedRows: speciesPairs.reduce((sum, entry) => sum + entry.rows, 0),
        };
      })
      .sort((left, right) => right.netNewPairs - left.netNewPairs || left.speciesId.localeCompare(right.speciesId));

    const report = {
          sourceDirectory,
          semantics: {
            country: "United States only",
            runType: "1 (standard run) only",
            stop: "Stop1 only",
            minimumStopCount: 1,
            geography: "route-start coordinate must resolve to exactly one active county equivalent",
            negativeEvidence: false,
          },
          catalog: {
            birdSpecies: catalogBirds.length,
            exactBbsMatches: targets.size,
            unmatchedCatalogBirds,
          },
          routes: {
            unitedStatesRoutes,
            resolvedUnitedStatesRoutes: routeLookup.size,
            unresolvedUnitedStatesRoutes,
            standardRuns: standardRuns.size,
          },
          scan: {
            archiveRows,
            targetRows,
            standardTargetRows,
            acceptedRows,
            grossCountySpeciesPairs: pairs.length,
            alreadyPresentPairs: pairs.length - netPairs.length,
            netNewPairs: netPairs.length,
          },
          byState,
          bySpecies,
          netPairs: outputStateCode
            ? netPairs.filter((entry) => entry.stateCode === outputStateCode)
            : netPairs,
        };
    if (planOutput && planId && outputStateCode) {
      const selectedPairs = netPairs.filter((entry) => entry.stateCode === outputStateCode);
      const plan = {
        schemaVersion: 1,
        planId,
        sourceId: "usgs-bbs",
        stateCode: outputStateCode,
        candidates: selectedPairs.map((entry) => ({
          sourceId: "usgs-bbs",
          countyFips: entry.countyFips,
          speciesId: entry.speciesId,
        })),
        bbsPilot: {
          mode: "hash-pinned-standard-stop1-positive",
          scienceBaseItemId: "6a0b0b0ab66b0188da36aedd",
          scienceBaseItemUrl:
            "https://www.sciencebase.gov/catalog/item/6a0b0b0ab66b0188da36aedd",
          rawDataPageUrl: "https://www.pwrc.usgs.gov/BBS/RawData/",
          releaseTitle: "2026 Release - North American Breeding Bird Survey Dataset (1966 - 2025)",
          citation:
            "Ziolkowski Jr., D.J., Lutmerding, M., Skalos, S.M., English, W.B., and Hudson, M-A.R., 2026, North American Breeding Bird Survey Dataset 1966 - 2025: U.S. Geological Survey data release, https://doi.org/10.5066/P144YU3S.",
          releaseYearRange: { start: 1966, end: 2025 },
          minimumRequestIntervalMs: 250,
          maxResponseBytes: 80000000,
          filters: {
            countryNum: "840",
            runType: "1",
            stop: "Stop1",
            minimumStopCount: 1,
            geography:
              "route-start coordinate must resolve to exactly one active county equivalent",
          },
          files: [
            { name: "Routes.csv", size: 392008, md5: "5fd8404fd91eb6cdbc3577542ea99380" },
            { name: "Weather.csv", size: 14126685, md5: "8ba88dec90dd4b9df03bb2200c750bd6" },
            { name: "50-StopData.zip", size: 68998320, md5: "af3a5533a78a386760540f70d80cb240" },
            { name: "SpeciesList.csv", size: 73748, md5: "ae778053cf2db6013f9a24d4e91cae98" },
          ],
          exactTargets: [...targets.values()].sort((left, right) =>
            left.speciesId.localeCompare(right.speciesId),
          ),
          unmatchedCatalogBirds,
          expectedStateAcceptedRows: selectedPairs.reduce((sum, entry) => sum + entry.rows, 0),
          expectedStateGrossPairs: pairs.filter((entry) => entry.stateCode === outputStateCode).length,
          expectedStateNetNewPairs: selectedPairs.length,
          nationalPreflight: {
            archiveRows,
            acceptedRows,
            grossCountySpeciesPairs: pairs.length,
            netNewPairs: netPairs.length,
            resolvedUnitedStatesRoutes: routeLookup.size,
            unresolvedUnitedStatesRoutes,
            standardRuns: standardRuns.size,
          },
        },
      };
      writeFileSync(planOutput, `${JSON.stringify(plan, null, 2)}\n`);
    }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  };

  void finish().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

main();
