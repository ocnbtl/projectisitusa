import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
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
  CountyRecord,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "Water Quality Portal biological results";
const WQP_RESULT_BASE_URL = "https://www.waterqualitydata.us/data/Result/search";
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/wqp-alabama-biological-results-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

const PILOT_TARGET_SCIENTIFIC_NAMES = [
  "Daphnia lumholtzi",
  "Cyprinus carpio",
  "Ctenopharyngodon idella",
  "Corbicula fluminea",
];

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

type WqpRow = Record<string, string | undefined>;

type ImportedRecord = {
  activityId: string;
  monitoringLocationId: string;
  organizationIdentifier: string;
  organizationFormalName: string;
  projectIdentifier: string;
  activityStartDate: string;
  countyFips: string;
  latitude: number;
  longitude: number;
  assemblageSampledName: string;
  biologicalIntentName: string;
  characteristicName: string;
  resultMeasureValue: number;
  resultMeasureUnitCode: string;
  resultStatusIdentifier: string;
  providerName: string;
};

type ImportedCoverage = {
  scientificName: string;
  relatedSpeciesIds: string[];
  sourceUrl: string;
  records: ImportedRecord[];
  countyFips: Set<string>;
  totalRows: number;
  skippedRows: number;
};

type WqpSourceSnapshotSpecies = {
  speciesId: string;
  scientificName: string;
  totalRows: number;
  acceptedRecordCount: number;
  skippedRows: number;
  countyFips: string[];
  queryUrl: string;
  records: ImportedRecord[];
};

type WqpSourceSnapshotFile = {
  source: string;
  citation: string[];
  accessedAt: string;
  filters: {
    statecode: "US:01";
    dataProfile: "biological";
    sampleMedia: "Biological";
    subjectTaxonomicName: "exact current catalog scientific name";
    characteristicName: "Count";
    minResultMeasureValue: 0;
    resultStatusIdentifier: string[];
    coordinateResolution: "point must resolve to exactly one Alabama county";
  };
  targetScientificNames: string[];
  species: WqpSourceSnapshotSpecies[];
  summary: {
    targetSpeciesCount: number;
    importedSpeciesCount: number;
    acceptedRecordCount: number;
    countySpeciesPairs: number;
  };
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function curlText(url: string) {
  return execFileSync(
    "curl",
    ["-sL", "--retry", "2", "--max-time", "90", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
  );
}

function buildUrl(scientificName: string) {
  const params = new URLSearchParams({
    statecode: "US:01",
    dataProfile: "biological",
    sampleMedia: "Biological",
    subjectTaxonomicName: scientificName,
    mimeType: "csv",
    zip: "no",
    sorted: "no",
  });

  return `${WQP_RESULT_BASE_URL}?${params.toString()}`;
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
  latitudeText: string | undefined,
  longitudeText: string | undefined,
  countyFeatures: CountyFeature[],
) {
  const latitude = Number(latitudeText);
  const longitude = Number(longitudeText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  for (const countyFeature of countyFeatures) {
    if (geoContains(countyFeature, [longitude, latitude])) {
      return { countyFips: countyFeature.properties.countyFips, latitude, longitude };
    }
  }

  return null;
}

function isAcceptedStatus(value: string | undefined) {
  return value === "Final" || value === "Accepted";
}

function acceptedWqpRecord(
  row: WqpRow,
  scientificName: string,
  countyFeatures: CountyFeature[],
) {
  if (row.ActivityMediaName !== "Biological") return null;
  if (canonicalScientificName(row.SubjectTaxonomicName ?? "") !== canonicalScientificName(scientificName)) {
    return null;
  }
  if ((row.UnidentifiedSpeciesIdentifier ?? "").trim()) return null;
  if ((row.ResultDetectionConditionText ?? "").trim()) return null;
  if (row.CharacteristicName !== "Count") return null;
  if ((row["ResultMeasure/MeasureUnitCode"] ?? "").toLowerCase() !== "count") return null;
  if (!isAcceptedStatus(row.ResultStatusIdentifier)) return null;

  const resultMeasureValue = Number(row.ResultMeasureValue);
  if (!Number.isFinite(resultMeasureValue) || resultMeasureValue <= 0) return null;

  const coordinateMatch = resolveCoordinateCountyFips(
    row["ActivityLocation/LatitudeMeasure"],
    row["ActivityLocation/LongitudeMeasure"],
    countyFeatures,
  );
  if (!coordinateMatch) return null;

  return {
    activityId: row.ActivityIdentifier ?? "",
    monitoringLocationId: row.MonitoringLocationIdentifier ?? "",
    organizationIdentifier: row.OrganizationIdentifier ?? "",
    organizationFormalName: row.OrganizationFormalName ?? "",
    projectIdentifier: row.ProjectIdentifier ?? "",
    activityStartDate: row.ActivityStartDate ?? "",
    countyFips: coordinateMatch.countyFips,
    latitude: coordinateMatch.latitude,
    longitude: coordinateMatch.longitude,
    assemblageSampledName: row.AssemblageSampledName ?? "",
    biologicalIntentName: row.BiologicalIntentName ?? "",
    characteristicName: row.CharacteristicName ?? "",
    resultMeasureValue,
    resultMeasureUnitCode: row["ResultMeasure/MeasureUnitCode"] ?? "",
    resultStatusIdentifier: row.ResultStatusIdentifier ?? "",
    providerName: row.ProviderName ?? "",
  } satisfies ImportedRecord;
}

function collectImportedCoverage(species: Species[], counties: Record<string, CountyRecord>) {
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalScientificName(record.scientificName), record]),
  );
  const validAlCountyFips = new Set(
    Object.values(counties)
      .filter((county) => county.stateCode === "AL")
      .map((county) => county.countyFips),
  );
  const countyFeatures = buildCountyFeatures();
  const imported = new Map<string, ImportedCoverage>();

  let exactCatalogTargets = 0;
  let totalRows = 0;
  let acceptedRows = 0;
  let skippedRows = 0;

  for (const scientificName of PILOT_TARGET_SCIENTIFIC_NAMES) {
    const speciesRecord = speciesByScientificName.get(canonicalScientificName(scientificName));
    if (!speciesRecord) {
      console.log(`Skipped WQP target without exact catalog match: ${scientificName}`);
      continue;
    }

    exactCatalogTargets += 1;
    const sourceUrl = buildUrl(scientificName);
    const rows = parse(curlText(sourceUrl), {
      columns: true,
      skip_empty_lines: true,
    }) as WqpRow[];
    const speciesId = countyPresenceSpeciesId(speciesRecord);
    const coverage: ImportedCoverage = {
      scientificName: speciesRecord.scientificName,
      relatedSpeciesIds: relatedCountyPresenceSpeciesIds(speciesRecord),
      sourceUrl,
      records: [],
      countyFips: new Set(),
      totalRows: rows.length,
      skippedRows: 0,
    };
    const seen = new Set<string>();

    totalRows += rows.length;
    for (const row of rows) {
      const acceptedRecord = acceptedWqpRecord(row, speciesRecord.scientificName, countyFeatures);
      if (!acceptedRecord || !validAlCountyFips.has(acceptedRecord.countyFips)) {
        coverage.skippedRows += 1;
        skippedRows += 1;
        continue;
      }

      const dedupeKey = [
        acceptedRecord.activityId,
        acceptedRecord.monitoringLocationId,
        acceptedRecord.activityStartDate,
        acceptedRecord.countyFips,
      ].join("::");
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      acceptedRows += 1;
      coverage.records.push(acceptedRecord);
      coverage.countyFips.add(acceptedRecord.countyFips);
    }

    if (coverage.countyFips.size > 0) {
      imported.set(speciesId, coverage);
      console.log(
        `Loaded WQP biological results for ${coverage.scientificName}: ${coverage.countyFips.size} Alabama counties from ${coverage.records.length} accepted count records (${coverage.totalRows} rows queried, ${coverage.skippedRows} skipped).`,
      );
    } else {
      console.log(
        `No county-resolved WQP biological count records imported for ${speciesRecord.scientificName} (${coverage.totalRows} rows queried, ${coverage.skippedRows} skipped).`,
      );
    }
  }

  const countyPairs = [...imported.values()].reduce(
    (total, coverage) => total + coverage.countyFips.size,
    0,
  );
  console.log(
    `Reviewed ${PILOT_TARGET_SCIENTIFIC_NAMES.length} WQP pilot species; ${exactCatalogTargets} exact current-catalog targets.`,
  );
  console.log(
    `Reviewed ${totalRows} WQP biological rows; accepted ${acceptedRows}; skipped ${skippedRows}.`,
  );
  console.log(
    `Loaded ${imported.size} species from WQP biological results with ${countyPairs} Alabama county-species pairs.`,
  );

  return imported;
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const counties = readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const imported = collectImportedCoverage(species, counties);
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
          externalId: `${coverage.scientificName}; ${coverage.records.length} accepted count records across ${coverage.countyFips.size} Alabama counties`,
          url: coverage.sourceUrl,
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
      ...snapshot.citation.filter((entry) => !entry.includes("Water Quality Portal")),
      "National Water Quality Monitoring Council. 2026. Water Quality Portal biological result services, filtered to Alabama exact SubjectTaxonomicName rows with positive Count results. Available online at https://www.waterqualitydata.us/data/Result/search.",
    ],
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds: snapshot.unmatchedSpeciesIds.filter(
      (speciesId) => !outputRecords.has(speciesId),
    ),
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  const sourceSnapshotSpecies: WqpSourceSnapshotSpecies[] = [...imported.entries()]
    .map(([speciesId, coverage]) => ({
      speciesId,
      scientificName: coverage.scientificName,
      totalRows: coverage.totalRows,
      acceptedRecordCount: coverage.records.length,
      skippedRows: coverage.skippedRows,
      countyFips: [...coverage.countyFips].sort(),
      queryUrl: coverage.sourceUrl,
      records: [...coverage.records].sort((left, right) =>
        `${left.countyFips}:${left.activityId}`.localeCompare(
          `${right.countyFips}:${right.activityId}`,
        ),
      ),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const sourceSnapshot: WqpSourceSnapshotFile = {
    source: SOURCE_NAME,
    citation: [
      "National Water Quality Monitoring Council. 2026. Water Quality Portal. Available online at https://www.waterqualitydata.us/.",
      "National Water Quality Monitoring Council. 2026. WQP Web Services Guide. Available online at https://www.waterqualitydata.us/webservices_documentation/.",
    ],
    accessedAt,
    filters: {
      statecode: "US:01",
      dataProfile: "biological",
      sampleMedia: "Biological",
      subjectTaxonomicName: "exact current catalog scientific name",
      characteristicName: "Count",
      minResultMeasureValue: 0,
      resultStatusIdentifier: ["Final", "Accepted"],
      coordinateResolution: "point must resolve to exactly one Alabama county",
    },
    targetScientificNames: PILOT_TARGET_SCIENTIFIC_NAMES,
    species: sourceSnapshotSpecies,
    summary: {
      targetSpeciesCount: PILOT_TARGET_SCIENTIFIC_NAMES.length,
      importedSpeciesCount: sourceSnapshotSpecies.length,
      acceptedRecordCount: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.acceptedRecordCount,
        0,
      ),
      countySpeciesPairs: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.countyFips.length,
        0,
      ),
    },
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  await writeFile(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);
  console.log(`Saved WQP biological results snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Saved WQP biological results source audit to ${SOURCE_SNAPSHOT_PATH}`);
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
