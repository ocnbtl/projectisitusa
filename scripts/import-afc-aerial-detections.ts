import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  CountyRecord,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "Alabama Forestry Commission Aerial Detection layer";
const SOURCE_URL =
  "https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise/AerialDetectionP/FeatureServer/0";
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

const AFC_DETECTION_TYPE_TO_SCIENTIFIC_NAME: Record<string, string> = {
  EAB: "Agrilus planipennis",
  Cogongrass: "Imperata cylindrica",
  "Laurel Wilt Disease": "Raffaelea lauricola",
};

type ArcGisFeatureResponse = {
  features?: Array<{
    attributes?: {
      TypeDetected?: string | null;
      County?: string | null;
      FiscalYear?: string | null;
      SurveyedDate?: number | null;
      NoOfTrees?: number | null;
      GroundCover?: string | null;
      OBJECTID?: number | null;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    details?: string[];
  };
};

type ImportedCoverage = {
  countyFips: Set<string>;
  countyDataSources: CountyDataSourceRef[];
  rows: number;
  unresolvedCountyNames: Set<string>;
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
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

function buildCountyLookup(counties: Record<string, CountyRecord>) {
  const lookup = new Map<string, string>();

  for (const county of Object.values(counties)) {
    if (county.stateCode !== "AL") continue;
    lookup.set(normalizeCountyName(county.name), county.countyFips);
  }

  return lookup;
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

function curlJson<T>(url: string) {
  const response = execFileSync(
    "curl",
    ["-sL", "--max-time", "45", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(response) as T;
}

function fetchDetectionRows(typeDetected: string) {
  const where = encodeURIComponent(`TypeDetected='${typeDetected}'`);
  const url =
    `${SOURCE_URL}/query?where=${where}` +
    "&outFields=TypeDetected,County,FiscalYear,SurveyedDate,NoOfTrees,GroundCover,OBJECTID" +
    "&returnGeometry=false&f=json&resultRecordCount=32000";
  const response = curlJson<ArcGisFeatureResponse>(url);
  if (response.error) {
    throw new Error(
      `AFC Aerial Detection query failed for ${typeDetected}: ${response.error.message ?? response.error.code}`,
    );
  }

  return response.features ?? [];
}

function collectImportedCoverage(
  species: Species[],
  counties: Record<string, CountyRecord>,
) {
  const speciesByScientificName = new Map(
    species.map((record) => [record.scientificName.toLowerCase(), record]),
  );
  const countyLookup = buildCountyLookup(counties);
  const imported = new Map<string, ImportedCoverage>();
  const skippedTypes: string[] = [];

  for (const [typeDetected, scientificName] of Object.entries(
    AFC_DETECTION_TYPE_TO_SCIENTIFIC_NAME,
  )) {
    const speciesRecord = speciesByScientificName.get(scientificName.toLowerCase());
    if (!speciesRecord) {
      skippedTypes.push(typeDetected);
      continue;
    }

    const speciesId = countyPresenceSpeciesId(speciesRecord);
    const coverage: ImportedCoverage = {
      countyFips: new Set<string>(),
      countyDataSources: [
        {
          source: SOURCE_NAME,
          matchType: "scientific-exact",
          externalId: `${typeDetected} (${scientificName})`,
          url: SOURCE_URL,
        },
      ],
      rows: 0,
      unresolvedCountyNames: new Set<string>(),
    };

    for (const feature of fetchDetectionRows(typeDetected)) {
      const countyName = feature.attributes?.County?.trim();
      if (!countyName) continue;

      const countyFips = countyLookup.get(normalizeCountyName(countyName));
      if (!countyFips) {
        coverage.unresolvedCountyNames.add(countyName);
        continue;
      }

      coverage.rows += 1;
      coverage.countyFips.add(countyFips);
    }

    imported.set(speciesId, coverage);
  }

  return { imported, skippedTypes };
}

async function main() {
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const counties = readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const countyPresenceIdByGeneratedId = new Map(
    species.map((record) => [record.id, countyPresenceSpeciesId(record)]),
  );
  const validCountyPresenceIds = new Set(countyPresenceIdByGeneratedId.values());
  const { imported, skippedTypes } = collectImportedCoverage(species, counties);

  const recordsBySpeciesId = new Map<string, CountyCoverageSpeciesSnapshot>();
  for (const record of snapshot.species) {
    const normalizedSpeciesId =
      countyPresenceIdByGeneratedId.get(record.speciesId) ?? record.speciesId;
    if (!validCountyPresenceIds.has(normalizedSpeciesId)) continue;
    recordsBySpeciesId.set(normalizedSpeciesId, {
      speciesId: normalizedSpeciesId,
      countyFips: [...new Set(record.countyFips)].sort(),
      countyDataSources: uniqueSources(
        record.countyDataSources.filter((source) => source.source !== SOURCE_NAME),
      ),
    });
  }

  const report = [];
  for (const [speciesId, coverage] of imported) {
    const existing = recordsBySpeciesId.get(speciesId);
    const beforeCountyCount = existing?.countyFips.length ?? 0;
    const mergedCountyFips = new Set(existing?.countyFips ?? []);
    for (const fips of coverage.countyFips) {
      mergedCountyFips.add(fips);
    }

    recordsBySpeciesId.set(speciesId, {
      speciesId,
      countyFips: [...mergedCountyFips].sort(),
      countyDataSources: uniqueSources([
        ...(existing?.countyDataSources ?? []),
        ...coverage.countyDataSources,
      ]),
    });

    report.push({
      speciesId,
      rows: coverage.rows,
      sourceCountyCount: coverage.countyFips.size,
      netNewCountyCount: Math.max(0, mergedCountyFips.size - beforeCountyCount),
      unresolvedCountyNames: [...coverage.unresolvedCountyNames].sort(),
    });
  }

  const records = [...recordsBySpeciesId.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const mappedSpeciesIds = new Set(records.map((record) => record.speciesId));
  const unmatchedSpeciesIds = [...validCountyPresenceIds]
    .filter((candidateSpeciesId) => !mappedSpeciesIds.has(candidateSpeciesId))
    .sort();
  const citationText =
    "Alabama Forestry Commission. 2026. Aerial Detection FeatureServer layer for forest health and invasive plant detections. Available online at https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise/AerialDetectionP/FeatureServer/0.";
  const citation = snapshot.citation.includes(citationText)
    ? snapshot.citation
    : [...snapshot.citation, citationText];

  const merged: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation,
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds,
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(merged, null, 2)}\n`);

  console.log(
    `Merged ${SOURCE_NAME} coverage for ${imported.size} exact catalog species from ${Object.keys(AFC_DETECTION_TYPE_TO_SCIENTIFIC_NAME).length} reviewed detection types.`,
  );
  for (const item of report) {
    console.log(
      `${item.speciesId}: ${item.sourceCountyCount} source counties from ${item.rows} rows, ${item.netNewCountyCount} net new counties.`,
    );
    if (item.unresolvedCountyNames.length > 0) {
      console.log(
        `${item.speciesId}: unresolved county values ${item.unresolvedCountyNames.join(", ")}`,
      );
    }
  }
  if (skippedTypes.length > 0) {
    console.log(`Skipped detection types without catalog species: ${skippedTypes.join(", ")}`);
  }
  console.log(
    "Reviewed but not imported: SPB, IPS, Needle Blight, and Sawfly because the layer codes are not exact current catalog species matches.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
