import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import countyTopology from "@/data/source/county-equivalents-topology.json";

import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "GBIF Invasive Plant Atlas of the MidSouth records";
const GBIF_API_BASE_URL = "https://api.gbif.org/v1";
const IPAMS_DATASET_KEY = "d587c7e5-d442-437a-a6d7-d1a78ecf2300";
const ALABAMA_BBOX_WKT =
  "POLYGON((-88.6 30.1,-84.7 30.1,-84.7 35.1,-88.6 35.1,-88.6 30.1))";
const PAGE_LIMIT = 300;
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/gbif-ipams-alabama-plants-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");

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

type GbifOccurrenceSearchResponse = {
  offset: number;
  limit: number;
  endOfRecords: boolean;
  count: number;
  results: GbifOccurrenceRecord[];
};

type GbifOccurrenceRecord = {
  key?: number;
  datasetKey?: string;
  basisOfRecord?: string;
  occurrenceStatus?: string;
  countryCode?: string;
  scientificName?: string;
  acceptedScientificName?: string;
  taxonKey?: number;
  acceptedTaxonKey?: number;
  speciesKey?: number;
  decimalLatitude?: number;
  decimalLongitude?: number;
  hasGeospatialIssue?: boolean;
  issues?: string[];
  eventDate?: string;
  locality?: string;
  recordedBy?: string;
  license?: string;
  references?: string;
  gbifID?: string;
};

type ImportedObservation = {
  gbifKey: number;
  eventDate?: string;
  countyFips: string;
  latitude: number;
  longitude: number;
  scientificName: string;
  acceptedScientificName?: string;
  locality?: string;
  recordedBy?: string;
  license?: string;
  references?: string;
  issues: string[];
};

type ImportedCoverage = {
  scientificName: string;
  speciesKey?: number;
  relatedSpeciesIds: string[];
  countyFips: Set<string>;
  representativeObservations: Map<string, ImportedObservation>;
  acceptedOccurrenceCount: number;
};

type IpamsSourceSnapshotSpecies = {
  speciesId: string;
  scientificName: string;
  speciesKey?: number;
  acceptedOccurrenceCount: number;
  countyFips: string[];
  representativeObservations: ImportedObservation[];
};

type IpamsSourceSnapshotFile = {
  source: string;
  citation: string[];
  accessedAt: string;
  datasetKey: string;
  filters: {
    country: "US";
    geometry: "Alabama bounding box, then local Alabama county polygon resolution";
    basisOfRecord: "HUMAN_OBSERVATION";
    occurrenceStatus: "PRESENT";
    hasCoordinate: true;
    hasGeospatialIssue: false;
    taxonMatch: "accepted GBIF scientific name starts with exact current catalog plant binomial";
  };
  summary: {
    scannedOccurrenceCount: number;
    insideAlabamaOccurrenceCount: number;
    acceptedOccurrenceCount: number;
    importedSpeciesCount: number;
    countySpeciesPairs: number;
  };
  species: IpamsSourceSnapshotSpecies[];
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function curlJson<T>(url: string, maxBuffer = 20 * 1024 * 1024) {
  const response = execFileSync(
    "curl",
    ["-sL", "--retry", "2", "--max-time", "90", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer },
  );
  return JSON.parse(response) as T;
}

function canonicalScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function asciiText(value: string | null | undefined) {
  return value?.replace(/[\u2013\u2014]/g, "-") ?? undefined;
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

function resolveCountyFips(
  record: GbifOccurrenceRecord,
  countyFeatures: CountyFeature[],
) {
  if (
    typeof record.decimalLatitude !== "number" ||
    typeof record.decimalLongitude !== "number"
  ) {
    return null;
  }

  for (const countyFeature of countyFeatures) {
    if (geoContains(countyFeature, [record.decimalLongitude, record.decimalLatitude])) {
      return countyFeature.properties.countyFips;
    }
  }

  return null;
}

function buildPlantTargetLookup(species: Species[]) {
  return species
    .filter((record) => record.category === "plants")
    .map((record) => ({
      canonicalName: canonicalScientificName(record.scientificName),
      record,
    }))
    .sort((left, right) => right.canonicalName.length - left.canonicalName.length);
}

function matchCatalogPlant(
  record: GbifOccurrenceRecord,
  targets: ReturnType<typeof buildPlantTargetLookup>,
) {
  const acceptedScientificName = canonicalScientificName(
    record.acceptedScientificName ?? record.scientificName ?? "",
  );
  if (!acceptedScientificName) return null;

  return (
    targets.find(
      (target) =>
        acceptedScientificName === target.canonicalName ||
        acceptedScientificName.startsWith(`${target.canonicalName} `),
    )?.record ?? null
  );
}

function acceptedOccurrenceRecord(
  record: GbifOccurrenceRecord,
  speciesRecord: Species,
  countyFeatures: CountyFeature[],
) {
  if (record.datasetKey !== IPAMS_DATASET_KEY) return null;
  if (record.basisOfRecord !== "HUMAN_OBSERVATION") return null;
  if (record.occurrenceStatus !== "PRESENT") return null;
  if (record.countryCode !== "US") return null;
  if (record.hasGeospatialIssue) return null;
  if (typeof record.key !== "number") return null;

  const countyFips = resolveCountyFips(record, countyFeatures);
  if (!countyFips) return null;

  return {
    gbifKey: record.key,
    eventDate: asciiText(record.eventDate),
    countyFips,
    latitude: record.decimalLatitude as number,
    longitude: record.decimalLongitude as number,
    scientificName: speciesRecord.scientificName,
    acceptedScientificName: asciiText(record.acceptedScientificName),
    locality: asciiText(record.locality),
    recordedBy: asciiText(record.recordedBy),
    license: asciiText(record.license),
    references: asciiText(record.references),
    issues: record.issues ?? [],
  } satisfies ImportedObservation;
}

function collectImportedCoverage(species: Species[]) {
  const countyFeatures = buildCountyFeatures();
  const plantTargets = buildPlantTargetLookup(species);
  const imported = new Map<string, ImportedCoverage>();

  let scannedOccurrenceCount = 0;
  let insideAlabamaOccurrenceCount = 0;
  let acceptedOccurrenceCount = 0;
  let offset = 0;

  while (true) {
    const params = new URLSearchParams({
      datasetKey: IPAMS_DATASET_KEY,
      country: "US",
      occurrenceStatus: "PRESENT",
      basisOfRecord: "HUMAN_OBSERVATION",
      hasCoordinate: "true",
      hasGeospatialIssue: "false",
      geometry: ALABAMA_BBOX_WKT,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    const payload = curlJson<GbifOccurrenceSearchResponse>(
      `${GBIF_API_BASE_URL}/occurrence/search?${params.toString()}`,
    );

    for (const record of payload.results) {
      scannedOccurrenceCount += 1;
      const countyFips = resolveCountyFips(record, countyFeatures);
      if (!countyFips) continue;
      insideAlabamaOccurrenceCount += 1;

      const speciesRecord = matchCatalogPlant(record, plantTargets);
      if (!speciesRecord) continue;

      const observation = acceptedOccurrenceRecord(record, speciesRecord, countyFeatures);
      if (!observation) continue;

      acceptedOccurrenceCount += 1;
      const speciesId = countyPresenceSpeciesId(speciesRecord);
      const coverage =
        imported.get(speciesId) ??
        ({
          scientificName: speciesRecord.scientificName,
          speciesKey: record.speciesKey ?? record.acceptedTaxonKey ?? record.taxonKey,
          relatedSpeciesIds: relatedCountyPresenceSpeciesIds(speciesRecord),
          countyFips: new Set<string>(),
          representativeObservations: new Map<string, ImportedObservation>(),
          acceptedOccurrenceCount: 0,
        } satisfies ImportedCoverage);

      coverage.acceptedOccurrenceCount += 1;
      coverage.countyFips.add(countyFips);
      if (!coverage.representativeObservations.has(countyFips)) {
        coverage.representativeObservations.set(countyFips, observation);
      }
      imported.set(speciesId, coverage);
    }

    if (payload.endOfRecords || payload.results.length === 0) {
      break;
    }
    offset += payload.results.length;
  }

  const countyPairs = [...imported.values()].reduce(
    (total, coverage) => total + coverage.countyFips.size,
    0,
  );
  console.log(
    `Scanned ${scannedOccurrenceCount} GBIF IPAMS records; ${insideAlabamaOccurrenceCount} resolved inside Alabama counties; accepted ${acceptedOccurrenceCount}.`,
  );
  console.log(
    `Loaded ${imported.size} species from GBIF IPAMS with ${countyPairs} Alabama county-species pairs.`,
  );

  return {
    imported,
    scannedOccurrenceCount,
    insideAlabamaOccurrenceCount,
    acceptedOccurrenceCount,
  };
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const {
    imported,
    scannedOccurrenceCount,
    insideAlabamaOccurrenceCount,
    acceptedOccurrenceCount,
  } = collectImportedCoverage(species);
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
          externalId: `GBIF IPAMS dataset ${IPAMS_DATASET_KEY}; ${coverage.acceptedOccurrenceCount} accepted observations across ${coverage.countyFips.size} Alabama counties`,
          url: `https://www.gbif.org/occurrence/search?dataset_key=${IPAMS_DATASET_KEY}&country=US&basis_of_record=HUMAN_OBSERVATION&occurrence_status=present`,
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
      ...snapshot.citation.filter((entry) => !entry.includes("Invasive Plant Atlas of the MidSouth")),
      "Invasive Plant Atlas of the MidSouth. Occurrence dataset d587c7e5-d442-437a-a6d7-d1a78ecf2300 accessed via GBIF.org.",
    ],
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds: snapshot.unmatchedSpeciesIds.filter(
      (speciesId) => !outputRecords.has(speciesId),
    ),
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  const sourceSnapshotSpecies: IpamsSourceSnapshotSpecies[] = [...imported.entries()]
    .map(([speciesId, coverage]) => ({
      speciesId,
      scientificName: coverage.scientificName,
      speciesKey: coverage.speciesKey,
      acceptedOccurrenceCount: coverage.acceptedOccurrenceCount,
      countyFips: [...coverage.countyFips].sort(),
      representativeObservations: [...coverage.representativeObservations.values()].sort(
        (left, right) => left.countyFips.localeCompare(right.countyFips),
      ),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const sourceSnapshot: IpamsSourceSnapshotFile = {
    source: SOURCE_NAME,
    citation: [
      "Invasive Plant Atlas of the MidSouth. Occurrence dataset d587c7e5-d442-437a-a6d7-d1a78ecf2300 accessed via GBIF.org.",
      "GBIF.org. 2026. GBIF occurrence search. Available online at https://www.gbif.org/occurrence/search.",
    ],
    accessedAt,
    datasetKey: IPAMS_DATASET_KEY,
    filters: {
      country: "US",
      geometry: "Alabama bounding box, then local Alabama county polygon resolution",
      basisOfRecord: "HUMAN_OBSERVATION",
      occurrenceStatus: "PRESENT",
      hasCoordinate: true,
      hasGeospatialIssue: false,
      taxonMatch: "accepted GBIF scientific name starts with exact current catalog plant binomial",
    },
    summary: {
      scannedOccurrenceCount,
      insideAlabamaOccurrenceCount,
      acceptedOccurrenceCount,
      importedSpeciesCount: sourceSnapshotSpecies.length,
      countySpeciesPairs: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.countyFips.length,
        0,
      ),
    },
    species: sourceSnapshotSpecies,
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  await writeFile(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);
  console.log(`Saved GBIF IPAMS snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Saved GBIF IPAMS source audit to ${SOURCE_SNAPSHOT_PATH}`);
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
