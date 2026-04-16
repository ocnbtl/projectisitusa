import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const NAS_SPECIES_URL = "https://nas.er.usgs.gov/api/v2/species";
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

type NasSpeciesResponse = {
  results: Array<{
    speciesID: number;
    genus: string;
    species: string;
    subspecies?: string;
    variety?: string;
  }>;
};

type NasOccurrenceResponse = {
  endOfRecords: string;
  count: number;
  limit: number;
  results: Array<{
    state: string;
    county: string;
  }>;
};

type ImportTarget = {
  speciesId: string;
  scientificName: string;
  curatedSubjectId?: number;
};

type CountyGeometry = {
  id: string;
  properties?: {
    name?: string;
  };
};

function curlJson<T>(url: string) {
  const output = execFileSync(
    "curl",
    ["-sL", "-A", USER_AGENT, url],
    {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );

  return JSON.parse(output) as T;
}

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function canonicalScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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
  const { countyIndex, lookup: countyLookup } = buildCountyLookup();
  const lower48CountyFips = new Set(Object.keys(countyIndex));

  const eddMapsSummary = curlJson<EddMapsSummaryResponse>(EDDMAPS_SUBJECTS_URL);
  const eddMapsScientificNameMap = new Map<string, number[]>();

  for (const [, subjectNumber, , scientificName] of eddMapsSummary.data) {
    const key = canonicalScientificName(scientificName);
    if (!key) continue;
    const subjectIds = eddMapsScientificNameMap.get(key) ?? [];
    if (!subjectIds.includes(subjectNumber)) {
      subjectIds.push(subjectNumber);
    }
    eddMapsScientificNameMap.set(key, subjectIds);
  }

  const nasSpecies = curlJson<NasSpeciesResponse>(NAS_SPECIES_URL);
  const nasScientificNameMap = new Map<string, number[]>();

  for (const record of nasSpecies.results) {
    const key = canonicalScientificName(
      [record.genus, record.species, record.subspecies, record.variety]
        .filter(Boolean)
        .join(" "),
    );
    if (!key) continue;

    const ids = nasScientificNameMap.get(key) ?? [];
    if (!ids.includes(record.speciesID)) {
      ids.push(record.speciesID);
    }
    nasScientificNameMap.set(key, ids);
  }

  console.log(`Loaded ${targets.length} import targets.`);

  const importedSpecies = await mapPool(targets, 8, async (target, index) => {
    const scientificNameKey = canonicalScientificName(target.scientificName);
    const eddMapsSubjectIds = [
      ...(typeof target.curatedSubjectId === "number" ? [target.curatedSubjectId] : []),
      ...(eddMapsScientificNameMap.get(scientificNameKey) ?? []),
    ].filter((value, currentIndex, list) => list.indexOf(value) === currentIndex);
    const nasSpeciesIds = nasScientificNameMap.get(scientificNameKey) ?? [];

    const countyFips = new Set<string>();
    const countyDataSources: CountyDataSourceRef[] = [];

    for (const subjectId of eddMapsSubjectIds) {
      try {
        const presence = curlJson<Record<string, Record<string, { id: string }>>>(
          `https://maps.eddmaps.org/presence/data.cfm?sub=${subjectId}&countries=us`,
        );
        for (const countyCode of Object.keys(presence.us ?? {})) {
          if (lower48CountyFips.has(countyCode)) {
            countyFips.add(countyCode);
          }
        }
        countyDataSources.push({
          source: "EDDMaps",
          matchType:
            subjectId === target.curatedSubjectId ? "manual-curated" : "scientific-exact",
          externalId: String(subjectId),
          url: `https://www.eddmaps.org/distribution/uscounty.cfm?sub=${subjectId}`,
        });
      } catch (error) {
        console.warn(
          `EDDMaps county fetch failed for ${target.scientificName} (${subjectId})`,
          error,
        );
      }
    }

    for (const speciesId of nasSpeciesIds) {
      try {
        let offset = 0;
        let done = false;

        while (!done) {
          const response = curlJson<NasOccurrenceResponse>(
            `https://nas.er.usgs.gov/api/v2/occurrence/search?species_ID=${speciesId}&limit=10000&offset=${offset}`,
          );

          for (const occurrence of response.results) {
            const countyFipsMatch = resolveCountyFips(
              occurrence.state,
              occurrence.county,
              countyLookup,
            );

            if (countyFipsMatch) {
              countyFips.add(countyFipsMatch);
            }
          }

          done = response.endOfRecords === "true";
          offset += response.limit ?? 10000;
        }

        countyDataSources.push({
          source: "USGS NAS",
          matchType: "scientific-exact",
          externalId: String(speciesId),
          url: `https://nas.er.usgs.gov/api/v2/occurrence/search?species_ID=${speciesId}`,
        });
      } catch (error) {
        console.warn(
          `USGS NAS county fetch failed for ${target.scientificName} (${speciesId})`,
          error,
        );
      }
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
