import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  EddMapsSnapshotFile,
  Species,
} from "@/lib/data/types";

const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const EDDMAPS_PATH = resolve(process.cwd(), "src/data/source/eddmaps-snapshot.json");
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
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

function countyPresenceSpeciesId(record: Species) {
  return record.profileType === "registry" && record.registry?.occurrenceId
    ? record.registry.occurrenceId
    : record.id;
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

async function main() {
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const eddMaps = readJsonFile<EddMapsSnapshotFile>(EDDMAPS_PATH);
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const counties = readJsonFile<Record<string, unknown>>(COUNTIES_PATH);
  const countyPresenceIdByGeneratedId = new Map(
    species.map((record) => [record.id, countyPresenceSpeciesId(record)]),
  );
  const validCountyPresenceIds = new Set(countyPresenceIdByGeneratedId.values());
  const validCountyFips = new Set(
    Object.keys(counties).filter((fips) => !fips.startsWith("02") && !fips.startsWith("15")),
  );
  const recordsBySpeciesId = new Map<string, CountyCoverageSpeciesSnapshot>();

  for (const record of snapshot.species) {
    const speciesId = countyPresenceIdByGeneratedId.get(record.speciesId) ?? record.speciesId;
    if (!validCountyPresenceIds.has(speciesId)) continue;

    const existing = recordsBySpeciesId.get(speciesId);
    recordsBySpeciesId.set(speciesId, {
      speciesId,
      countyFips: [
        ...new Set(
          [...(existing?.countyFips ?? []), ...record.countyFips].filter((fips) =>
            validCountyFips.has(fips),
          ),
        ),
      ].sort(),
      countyDataSources: uniqueSources([
        ...(existing?.countyDataSources ?? []),
        ...record.countyDataSources,
      ]),
    });
  }

  let addedSpecies = 0;
  let addedCountyRows = 0;
  let addedAlabamaCountyRows = 0;

  for (const eddMapsRecord of eddMaps.species) {
    const speciesId =
      countyPresenceIdByGeneratedId.get(eddMapsRecord.speciesId) ?? eddMapsRecord.speciesId;
    if (!validCountyPresenceIds.has(speciesId)) continue;

    const existing = recordsBySpeciesId.get(speciesId);
    const countyFips = new Set(existing?.countyFips ?? []);
    const beforeSize = countyFips.size;

    for (const fips of eddMapsRecord.countyFips) {
      const normalizedFips = fips.padStart(5, "0");
      if (validCountyFips.has(normalizedFips)) {
        countyFips.add(normalizedFips);
      }
    }

    const eddMapsSource: CountyDataSourceRef = {
      source: "EDDMaps",
      matchType: "scientific-exact",
      externalId: String(eddMapsRecord.subjectId),
      url: `https://www.eddmaps.org/species/subject.cfm?sub=${eddMapsRecord.subjectId}`,
    };
    const countyDataSources = uniqueSources([
      ...(existing?.countyDataSources.filter((source) => source.source !== "EDDMaps") ?? []),
      eddMapsSource,
    ]);

    if (!existing) {
      addedSpecies += 1;
    }

    const after = [...countyFips].sort();
    const addedRows = after.length - beforeSize;
    addedCountyRows += addedRows;
    addedAlabamaCountyRows += after.filter(
      (fips) => fips.startsWith("01") && !(existing?.countyFips ?? []).includes(fips),
    ).length;

    recordsBySpeciesId.set(speciesId, {
      speciesId,
      countyFips: after,
      countyDataSources,
    });
  }

  const records = [...recordsBySpeciesId.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((a, b) => a.speciesId.localeCompare(b.speciesId));
  const mappedSpeciesIds = new Set(records.map((record) => record.speciesId));
  const unmatchedSpeciesIds = [...validCountyPresenceIds]
    .filter((speciesId) => !mappedSpeciesIds.has(speciesId))
    .sort();

  const merged: CountyCoverageSnapshotFile = {
    ...snapshot,
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds,
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `Merged EDDMapS snapshot into county presence: ${addedSpecies} new species, ${addedCountyRows} new county rows, ${addedAlabamaCountyRows} new Alabama county rows.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
