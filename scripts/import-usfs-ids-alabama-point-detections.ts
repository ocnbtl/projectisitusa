import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

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
const SOURCE_NAME = "USDA Forest Service Insect and Disease Survey point detections";
const SERVICE_URL =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InsectandDiseaseSurvey_01/MapServer";
const POINT_LAYER_URL = `${SERVICE_URL}/0`;
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/usfs-ids-alabama-point-detections-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");

const IDS_TARGETS = [
  {
    dcaCommonName: "emerald ash borer",
    dcaCode: 15087,
    scientificName: "Agrilus planipennis",
  },
  {
    dcaCommonName: "brown spot needle blight",
    dcaCode: 25054,
    scientificName: "Lecanosticta acicola",
  },
  {
    dcaCommonName: "laurel wilt",
    dcaCode: 24031,
    scientificName: "Raffaelea lauricola",
  },
] as const;

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

type ArcGisFeatureResponse = {
  features?: Array<{
    attributes?: {
      objectid?: number | null;
      damage_point_id?: string | null;
      dca_code?: number | null;
      dca_common_name?: string | null;
      host?: string | null;
      host_group?: string | null;
      damage_type?: string | null;
      survey_year?: number | null;
      status?: number | null;
      data_source_name?: string | null;
      ids_data_source?: string | null;
      observation_id?: string | null;
    };
    geometry?: {
      x?: number | null;
      y?: number | null;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    details?: string[];
  };
};

type IdsTarget = (typeof IDS_TARGETS)[number];

type IdsPointRecord = {
  objectid: number | null;
  damagePointId: string;
  dcaCode: number;
  dcaCommonName: string;
  damageType: string;
  surveyYear: number | null;
  status: number | null;
  dataSourceName: string;
  idsDataSource: string;
  observationId: string;
  countyFips: string;
  latitude: number;
  longitude: number;
};

type ImportedCoverage = {
  scientificName: string;
  commonName: string;
  dcaCommonName: string;
  dcaCode: number;
  relatedSpeciesIds: string[];
  countyFips: Set<string>;
  records: IdsPointRecord[];
  representativeRecords: Map<string, IdsPointRecord>;
};

type IdsSourceSnapshotSpecies = {
  speciesId: string;
  scientificName: string;
  commonName: string;
  dcaCommonName: string;
  dcaCode: number;
  acceptedRecordCount: number;
  countyFips: string[];
  representativeRecords: IdsPointRecord[];
};

type IdsSourceSnapshotFile = {
  source: string;
  citation: string[];
  accessedAt: string;
  serviceUrl: typeof SERVICE_URL;
  pointLayerUrl: typeof POINT_LAYER_URL;
  filters: {
    layer: "IDS POINTS";
    dcaCommonNames: string[];
    geometry: "point";
    coordinateResolution: "point coordinates must resolve to exactly one Alabama county";
  };
  reviewedButSkippedLabels: string[];
  species: IdsSourceSnapshotSpecies[];
  summary: {
    reviewedTargetCount: number;
    exactCatalogTargetCount: number;
    importedSpeciesCount: number;
    rawFeatureCount: number;
    acceptedRecordCount: number;
    countySpeciesPairs: number;
  };
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function curlJson<T>(url: string) {
  const response = execFileSync(
    "curl",
    ["-sL", "--retry", "2", "--max-time", "180", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
  );
  return JSON.parse(response) as T;
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

function fetchIdsRows(target: IdsTarget) {
  const params = new URLSearchParams({
    f: "json",
    where: `LOWER(dca_common_name)='${target.dcaCommonName}'`,
    outFields:
      "objectid,damage_point_id,dca_code,dca_common_name,host,host_group,damage_type,survey_year,status,data_source_name,ids_data_source,observation_id",
    returnGeometry: "true",
    outSR: "4326",
    resultRecordCount: "10000",
  });
  const response = curlJson<ArcGisFeatureResponse>(`${POINT_LAYER_URL}/query?${params}`);
  if (response.error) {
    throw new Error(
      `USFS IDS query failed for ${target.dcaCommonName}: ${response.error.message ?? response.error.code}`,
    );
  }

  return response.features ?? [];
}

function collectImportedCoverage(
  species: Species[],
  countyFeatures: CountyFeature[],
) {
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalScientificName(record.scientificName), record]),
  );
  const imported = new Map<string, ImportedCoverage>();
  const skippedTargets: string[] = [];
  let rawFeatureCount = 0;
  let acceptedRecordCount = 0;

  for (const target of IDS_TARGETS) {
    const speciesRecord = speciesByScientificName.get(
      canonicalScientificName(target.scientificName),
    );
    if (!speciesRecord) {
      skippedTargets.push(target.dcaCommonName);
      continue;
    }

    const speciesId = countyPresenceSpeciesId(speciesRecord);
    const coverage: ImportedCoverage = {
      scientificName: speciesRecord.scientificName,
      commonName: speciesRecord.commonName,
      dcaCommonName: target.dcaCommonName,
      dcaCode: target.dcaCode,
      relatedSpeciesIds: relatedCountyPresenceSpeciesIds(speciesRecord),
      countyFips: new Set<string>(),
      records: [],
      representativeRecords: new Map<string, IdsPointRecord>(),
    };

    const rows = fetchIdsRows(target);
    rawFeatureCount += rows.length;
    for (const featureRecord of rows) {
      const attributes = featureRecord.attributes;
      const longitude = featureRecord.geometry?.x;
      const latitude = featureRecord.geometry?.y;
      if (
        !attributes ||
        attributes.dca_code !== target.dcaCode ||
        attributes.dca_common_name?.toLowerCase() !== target.dcaCommonName ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude)
      ) {
        continue;
      }

      const countyFips = resolveCoordinateCountyFips(
        latitude as number,
        longitude as number,
        countyFeatures,
      );
      if (!countyFips) continue;

      const record: IdsPointRecord = {
        objectid: attributes.objectid ?? null,
        damagePointId: attributes.damage_point_id ?? "",
        dcaCode: attributes.dca_code,
        dcaCommonName: attributes.dca_common_name,
        damageType: attributes.damage_type ?? "",
        surveyYear: attributes.survey_year ?? null,
        status: attributes.status ?? null,
        dataSourceName: attributes.data_source_name ?? "",
        idsDataSource: attributes.ids_data_source ?? "",
        observationId: attributes.observation_id ?? "",
        countyFips,
        latitude: latitude as number,
        longitude: longitude as number,
      };
      acceptedRecordCount += 1;
      coverage.records.push(record);
      coverage.countyFips.add(countyFips);
      if (!coverage.representativeRecords.has(countyFips)) {
        coverage.representativeRecords.set(countyFips, record);
      }
    }

    if (coverage.records.length > 0) {
      imported.set(speciesId, coverage);
    }
  }

  return { imported, skippedTargets, rawFeatureCount, acceptedRecordCount };
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const countyFeatures = buildCountyFeatures();
  const { imported, skippedTargets, rawFeatureCount, acceptedRecordCount } =
    collectImportedCoverage(species, countyFeatures);
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
          externalId: `${coverage.dcaCommonName}; DCA ${coverage.dcaCode}; ${coverage.records.length} IDS point detections across ${coverage.countyFips.size} Alabama counties`,
          url: POINT_LAYER_URL,
        },
      ]),
    });
  }

  const records = [...outputRecords.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const citationText =
    "USDA Forest Service. 2026. Enterprise Data Warehouse Insect and Disease Survey IDS POINTS layer. Available online at https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_InsectandDiseaseSurvey_01/MapServer/0.";
  const nextSnapshot: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation: [
      ...snapshot.citation.filter(
        (entry) => !entry.includes("Insect and Disease Survey IDS POINTS"),
      ),
      citationText,
    ],
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds: snapshot.unmatchedSpeciesIds.filter(
      (speciesId) => !outputRecords.has(speciesId),
    ),
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  const sourceSnapshotSpecies: IdsSourceSnapshotSpecies[] = [...imported.entries()]
    .map(([speciesId, coverage]) => ({
      speciesId,
      scientificName: coverage.scientificName,
      commonName: coverage.commonName,
      dcaCommonName: coverage.dcaCommonName,
      dcaCode: coverage.dcaCode,
      acceptedRecordCount: coverage.records.length,
      countyFips: [...coverage.countyFips].sort(),
      representativeRecords: [...coverage.representativeRecords.values()].sort(
        (left, right) => left.countyFips.localeCompare(right.countyFips),
      ),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const sourceSnapshot: IdsSourceSnapshotFile = {
    source: SOURCE_NAME,
    citation: [
      citationText,
      "The IDS service describes locations of insect, disease, and abiotic forest damage. Project Isitusa imports only reviewed exact DCA label to catalog-species point detections with coordinates resolving to Alabama counties.",
    ],
    accessedAt,
    serviceUrl: SERVICE_URL,
    pointLayerUrl: POINT_LAYER_URL,
    filters: {
      layer: "IDS POINTS",
      dcaCommonNames: IDS_TARGETS.map((target) => target.dcaCommonName),
      geometry: "point",
      coordinateResolution: "point coordinates must resolve to exactly one Alabama county",
    },
    reviewedButSkippedLabels: [
      "fire",
      "drought",
      "salt damage",
      "wind-tornado/hurricane",
      "unknown",
      "unknown bark beetle",
      "ips engraver beetles",
      "southern pine beetle",
      "black turpentine beetle",
    ],
    species: sourceSnapshotSpecies,
    summary: {
      reviewedTargetCount: IDS_TARGETS.length,
      exactCatalogTargetCount: IDS_TARGETS.length - skippedTargets.length,
      importedSpeciesCount: sourceSnapshotSpecies.length,
      rawFeatureCount,
      acceptedRecordCount,
      countySpeciesPairs: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.countyFips.length,
        0,
      ),
    },
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  await writeFile(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);
  console.log(`Saved USFS IDS point detections snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Saved USFS IDS source audit to ${SOURCE_SNAPSHOT_PATH}`);
  console.log(
    `Accepted ${acceptedRecordCount} Alabama IDS point detections for ${sourceSnapshotSpecies.length} exact catalog species.`,
  );
  console.log(
    `Gross county-species source pairs: ${sourceSnapshot.summary.countySpeciesPairs}`,
  );
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
  if (skippedTargets.length > 0) {
    console.log(`Skipped IDS targets without exact catalog matches: ${skippedTargets.join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
