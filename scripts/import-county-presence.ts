import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { createInterface } from "node:readline";

import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";

import { speciesSeed } from "@/data/source/species";
import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import type {
  CountyCoverageSnapshotFile,
  CountyDataSourceRef,
  CountyMatchType,
  CountyRecord,
  UsRiisSnapshotFile,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const EDDMAPS_SUBJECTS_URL =
  "https://api.bugwoodcloud.org/v2/occurrence/summary/subject?list=17";
const NAS_ARCHIVE_URL = "https://nas.er.usgs.gov/ipt/archive.do?r=nas&v=1.331";
const NAS_ARCHIVE_PATH = resolve("/tmp", "usgs-nas-dwca.zip");
const OUTPUT_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const US_RIIS_PATH = resolve(
  process.cwd(),
  "src/data/source/usriis-snapshot.json",
);

type EddMapsSummaryResponse = {
  columns: string[];
  data: Array<[number, number, string, string]>;
};
type ImportTarget = {
  speciesId: string;
  scientificName: string;
  curatedSubjectId?: number;
};

type NasArchiveOccurrence = {
  countryCode?: string;
  stateProvince?: string;
  county?: string;
  scientificName?: string;
};

type CountyGeometry = {
  id: string;
  properties?: {
    name?: string;
  };
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function downloadFile(url: string, outputPath: string) {
  execFileSync(
    "curl",
    ["-sL", "-A", USER_AGENT, "-o", outputPath, url],
    {
      stdio: "inherit",
    },
  );
}

function canonicalScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const NAS_SCIENTIFIC_NAME_ALIASES: Record<string, string> = {
  "hydrilla verticillata verticillata": "hydrilla verticillata",
};

function resolveNasScientificName(value: string) {
  const normalized = canonicalScientificName(value);
  return NAS_SCIENTIFIC_NAME_ALIASES[normalized] ?? normalized;
}

function normalizeCountyName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[.'`()-]/g, " ")
    .replace(
      /\b(county|parish|borough|census area|municipality|city and borough|city and county|city)\b/g,
      " ",
    )
    .replace(/\bsaint\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
}

function buildCountyLookup() {
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

  const countyIndex: Record<string, CountyRecord> = {};
  const lookup = new Map<string, string[]>();

  countyCollection.features.forEach((countyFeature, index) => {
    const geometry = topology.objects.counties.geometries[index];
    const countyFips = geometry.id;
    const stateCode = stateCodeByFips[countyFips.slice(0, 2)];
    if (!stateCode || ["AK", "HI", "PR", "GU", "AS", "MP", "VI"].includes(stateCode)) {
      return;
    }

    const name = geometry.properties?.name ?? countyFeature.properties?.name ?? "Unknown";
    countyIndex[countyFips] = {
      countyFips,
      name,
      stateCode,
      stateName: STATE_FIPS_TO_INFO[countyFips.slice(0, 2)]?.name ?? stateCode,
      neighborFips: [],
      center: [0, 0],
    };

    const aliases = new Set([
      name,
      normalizeCountyName(name),
      `${normalizeCountyName(name)} county`,
    ]);

    if (name.toLowerCase().endsWith(" city")) {
      aliases.add(normalizeCountyName(name.replace(/ city$/i, "")));
    }

    for (const alias of aliases) {
      if (!alias) continue;
      const key = `${stateCode}:${alias}`;
      const list = lookup.get(key) ?? [];
      if (!list.includes(countyFips)) {
        list.push(countyFips);
      }
      lookup.set(key, list);
    }
  });

  return { countyIndex, lookup };
}

function resolveCountyFips(
  stateCode: string,
  countyName: string,
  countyLookup: Map<string, string[]>,
) {
  const normalized = normalizeCountyName(countyName);
  if (!normalized) return null;

  const matches = countyLookup.get(`${stateCode}:${normalized}`) ?? [];
  if (matches.length === 1) return matches[0];

  const withCounty = countyLookup.get(`${stateCode}:${normalized} county`) ?? [];
  if (withCounty.length === 1) return withCounty[0];

  return null;
}

function buildTargets(usRiis: UsRiisSnapshotFile): ImportTarget[] {
  const curatedByScientificName = new Map(
    speciesSeed.map((species) => [
      canonicalScientificName(species.scientificName),
      species,
    ]),
  );

  const targets = new Map<string, ImportTarget>();

  for (const record of usRiis.species) {
    const curated = curatedByScientificName.get(
      canonicalScientificName(record.scientificName),
    );
    const speciesId = curated?.id ?? record.occurrenceId;
    targets.set(speciesId, {
      speciesId,
      scientificName: record.scientificName,
      curatedSubjectId: curated?.eddMapsSubjectId,
    });
  }

  for (const species of speciesSeed) {
    if (!targets.has(species.id)) {
      targets.set(species.id, {
        speciesId: species.id,
        scientificName: species.scientificName,
        curatedSubjectId: species.eddMapsSubjectId,
      });
    }
  }

  return [...targets.values()];
}

function buildTargetLookup(targets: ImportTarget[]) {
  return new Map(
    targets.map((target) => [
      canonicalScientificName(target.scientificName),
      target,
    ]),
  );
}

type ImportedCountyCoverage = {
  countyFips: Set<string>;
  countyDataSources: CountyDataSourceRef[];
};

async function loadNasArchiveCountyCoverage(
  targetLookup: Map<string, ImportTarget>,
  countyLookup: Map<string, string[]>,
  lower48CountyFips: Set<string>,
) {
  downloadFile(NAS_ARCHIVE_URL, NAS_ARCHIVE_PATH);

  const unzipProcess = spawn("unzip", ["-p", NAS_ARCHIVE_PATH, "occurrence.txt"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stderrLines: string[] = [];
  const stderr = createInterface({ input: unzipProcess.stderr });
  stderr.on("line", (line) => {
    stderrLines.push(line);
  });

  const parser = unzipProcess.stdout.pipe(
    parse({
      columns: true,
      delimiter: "\t",
      quote: false,
      relax_column_count: true,
      skip_empty_lines: true,
    }),
  ) as AsyncIterable<NasArchiveOccurrence>;

  const imported = new Map<string, ImportedCountyCoverage>();
  let matchedRows = 0;
  let aliasMatchedRows = 0;
  let unresolvedCountyRows = 0;

  for await (const row of parser) {
    if (row.countryCode !== "US" || !row.stateProvince || !row.county || !row.scientificName) {
      continue;
    }

    const stateCode = row.stateProvince.trim().toUpperCase();
    const resolvedScientificName = resolveNasScientificName(row.scientificName);
    const target = targetLookup.get(resolvedScientificName);
    if (!target) continue;

    const countyFipsMatch = resolveCountyFips(stateCode, row.county, countyLookup);
    if (!countyFipsMatch || !lower48CountyFips.has(countyFipsMatch)) {
      unresolvedCountyRows += 1;
      continue;
    }

    matchedRows += 1;
    if (resolvedScientificName !== canonicalScientificName(row.scientificName)) {
      aliasMatchedRows += 1;
    }

    const existing = imported.get(target.speciesId) ?? {
      countyFips: new Set<string>(),
      countyDataSources: [],
    };
    existing.countyFips.add(countyFipsMatch);
    imported.set(target.speciesId, existing);
  }

  const [exitCode] = (await once(unzipProcess, "close")) as [number];
  if (exitCode !== 0) {
    throw new Error(
      `USGS NAS archive extraction failed with code ${exitCode}: ${stderrLines.join("\n")}`,
    );
  }

  for (const [speciesId, coverage] of imported) {
    coverage.countyDataSources.push({
      source: "USGS NAS",
      matchType: "scientific-exact",
      externalId: speciesId,
      url: NAS_ARCHIVE_URL,
    });
  }

  console.log(
    `Loaded ${imported.size} species from the USGS NAS archive with ${matchedRows} matched county rows (${aliasMatchedRows} alias-matched, ${unresolvedCountyRows} unresolved county rows skipped).`,
  );

  return imported;
}

async function mapPool<TInput, TOutput>(
  values: TInput[],
  limit: number,
  mapper: (value: TInput, index: number) => Promise<TOutput>,
) {
  const results: TOutput[] = new Array(values.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );

  return results;
}

async function main() {
  const usRiis = readJsonFile<UsRiisSnapshotFile>(US_RIIS_PATH);
  const targets = buildTargets(usRiis);
  const targetLookup = buildTargetLookup(targets);
  const { countyIndex, lookup: countyLookup } = buildCountyLookup();
  const lower48CountyFips = new Set(Object.keys(countyIndex));
  const existingSnapshot = readJsonFile<CountyCoverageSnapshotFile>(OUTPUT_PATH);
  const existingCoverageBySpeciesId = new Map(
    existingSnapshot.species.map((record) => [record.speciesId, record]),
  );

  const nasCountyCoverage = await loadNasArchiveCountyCoverage(
    targetLookup,
    countyLookup,
    lower48CountyFips,
  );

  console.log(`Loaded ${targets.length} import targets.`);

  const importedSpecies = targets.map((target, index) => {
    const existingCoverage = existingCoverageBySpeciesId.get(target.speciesId);
    const countyFips = new Set<string>();
    const countyDataSources: CountyDataSourceRef[] = [
      ...((existingCoverage?.countyDataSources ?? []).filter(
        (source) => source.source !== "USGS NAS",
      )),
    ];

    for (const fips of existingCoverage?.countyFips ?? []) {
      countyFips.add(fips);
    }

    const archiveCoverage = nasCountyCoverage.get(target.speciesId);
    if (archiveCoverage) {
      for (const fips of archiveCoverage.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(...archiveCoverage.countyDataSources);
    }

    const uniqueSources = countyDataSources.filter(
      (source, sourceIndex, sources) =>
        sources.findIndex(
          (candidate) =>
            candidate.source === source.source &&
            candidate.externalId === source.externalId,
        ) === sourceIndex,
    );

    console.log(
      `[${index + 1}/${targets.length}] ${target.scientificName}: ${countyFips.size} counties, ${uniqueSources.length} sources`,
    );

    return {
      speciesId: target.speciesId,
      countyFips: [...countyFips].sort(),
      countyDataSources: uniqueSources,
    };
  });

  const speciesWithCountyData = importedSpecies.filter(
    (record) => record.countyFips.length > 0,
  );
  const unmatchedSpeciesIds = targets
    .map((target) => target.speciesId)
    .filter(
      (speciesId) =>
        !speciesWithCountyData.some((record) => record.speciesId === speciesId),
    )
    .sort();

  const sourceSpeciesCounts: CountyCoverageSnapshotFile["coverageSummary"]["sourceSpeciesCounts"] =
    {};

  for (const species of speciesWithCountyData) {
    for (const source of species.countyDataSources) {
      sourceSpeciesCounts[source.source] =
        (sourceSpeciesCounts[source.source] ?? 0) + 1;
    }
  }

  const snapshot: CountyCoverageSnapshotFile = {
    source: "Merged county presence snapshot",
    citation: [
      "EDDMapS. 2026. Early Detection & Distribution Mapping System. The University of Georgia - Center for Invasive Species and Ecosystem Health. Available online at https://www.eddmaps.org/.",
      "U.S. Geological Survey. 2026. Nonindigenous Aquatic Species Database. Gainesville, Florida. Accessed 2026-04-14.",
    ],
    snapshotDate: new Date().toISOString(),
    species: speciesWithCountyData,
    unmatchedSpeciesIds,
    coverageSummary: {
      catalogSpeciesCount: targets.length,
      mappedSpeciesCount: speciesWithCountyData.length,
      unmatchedSpeciesCount: unmatchedSpeciesIds.length,
      sourceSpeciesCounts,
    },
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Saved merged county snapshot for ${speciesWithCountyData.length} species to ${OUTPUT_PATH}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
