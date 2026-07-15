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
  CountyRecord,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "GBIF eBird Observation Dataset";
const GBIF_API_BASE_URL = "https://api.gbif.org/v1";
const EBIRD_EOD_DATASET_KEY = "4fa7b334-ce0d-4e88-aaae-2e0c138d049e";
const PAGE_LIMIT = 300;
const MAX_RECORDS_PER_SPECIES = 9000;
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/gbif-ebird-alabama-birds-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

const PILOT_TARGET_SCIENTIFIC_NAMES = [
  "Sturnus vulgaris",
  "Passer domesticus",
  "Streptopelia decaocto",
  "Columba livia",
  "Myiopsitta monachus",
  "Alopochen aegyptiaca",
  "Aratinga erythrogenys",
  "Brotogeris versicolurus",
  "Cygnus olor",
  "Pycnonotus jocosus",
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

type GbifSpeciesMatchResponse = {
  usageKey?: number;
  acceptedUsageKey?: number;
  speciesKey?: number;
  matchType?: string;
  confidence?: number;
  status?: string;
  canonicalName?: string;
};

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
  stateProvince?: string;
  county?: string;
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
};

type GbifImportTarget = {
  speciesId: string;
  scientificName: string;
  speciesKey: number;
  relatedSpeciesIds: string[];
};

type ImportedObservation = {
  gbifKey: number;
  eventDate?: string;
  countyFips: string;
  latitude: number;
  longitude: number;
  county?: string;
  locality?: string;
  recordedBy?: string;
  license?: string;
  issues: string[];
};

type ImportedCoverage = {
  scientificName: string;
  speciesKey: number;
  relatedSpeciesIds: string[];
  countyFips: Set<string>;
  representativeObservations: Map<string, ImportedObservation>;
  acceptedOccurrenceCount: number;
  scannedOccurrenceCount: number;
  totalGbifOccurrenceCount: number;
  skippedOccurrenceCount: number;
};

type EbirdSourceSnapshotSpecies = {
  speciesId: string;
  scientificName: string;
  speciesKey: number;
  totalGbifOccurrenceCount: number;
  scannedOccurrenceCount: number;
  acceptedOccurrenceCount: number;
  skippedOccurrenceCount: number;
  countyFips: string[];
  representativeObservations: ImportedObservation[];
};

type EbirdSourceSnapshotFile = {
  source: string;
  citation: string[];
  accessedAt: string;
  datasetKey: string;
  filters: {
    country: "US";
    stateProvince: "Alabama";
    basisOfRecord: "HUMAN_OBSERVATION";
    occurrenceStatus: "PRESENT";
    hasCoordinate: true;
    hasGeospatialIssue: false;
    coordinateResolution: "point must resolve to exactly one Alabama county";
    maxRecordsPerSpecies: number;
  };
  targetScientificNames: string[];
  species: EbirdSourceSnapshotSpecies[];
  summary: {
    targetSpeciesCount: number;
    importedSpeciesCount: number;
    acceptedOccurrenceCount: number;
    countySpeciesPairs: number;
  };
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

function normalizeCountyName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[.'`()-]/g, " ")
    .replace(
      /\b(county|parish|borough|census area|municipality|city and borough|city and county|city|co)\b/g,
      " ",
    )
    .replace(/\bsaint\b/g, "st")
    .replace(/\s+/g, " ")
    .trim();
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

function buildCountyLookups() {
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
  const countyNameLookup = new Map<string, string[]>();
  countyCollection.features.forEach((countyFeature, index) => {
    const geometry = topology.objects.counties.geometries[index];
    const countyFips = geometry.id;
    const stateCode = stateCodeByFips[countyFips.slice(0, 2)];
    if (stateCode !== "AL") return;

    const name = geometry.properties?.name ?? countyFeature.properties?.name ?? "";
    countyFeatures.push({
      ...countyFeature,
      properties: {
        ...(countyFeature.properties ?? {}),
        countyFips,
        name,
      },
    });

    const normalized = normalizeCountyName(name);
    const matches = countyNameLookup.get(normalized) ?? [];
    if (!matches.includes(countyFips)) matches.push(countyFips);
    countyNameLookup.set(normalized, matches);
  });

  return { countyFeatures, countyNameLookup };
}

function resolveCountyFips(
  record: GbifOccurrenceRecord,
  countyFeatures: CountyFeature[],
  countyNameLookup: Map<string, string[]>,
) {
  if (record.county) {
    const matches = countyNameLookup.get(normalizeCountyName(record.county)) ?? [];
    if (matches.length === 1) {
      return matches[0];
    }
  }

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

function findGbifSpeciesKey(species: Species) {
  const payload = curlJson<GbifSpeciesMatchResponse>(
    `${GBIF_API_BASE_URL}/species/match?name=${encodeURIComponent(species.scientificName)}&rank=SPECIES&strict=true`,
  );

  const speciesKey = payload.speciesKey ?? payload.acceptedUsageKey ?? payload.usageKey;
  if (!speciesKey) return null;
  if (payload.matchType !== "EXACT") return null;
  if ((payload.confidence ?? 0) < 95) return null;
  if (
    payload.canonicalName &&
    canonicalScientificName(payload.canonicalName) !==
      canonicalScientificName(species.scientificName)
  ) {
    return null;
  }

  return {
    speciesId: countyPresenceSpeciesId(species),
    scientificName: species.scientificName,
    speciesKey,
    relatedSpeciesIds: relatedCountyPresenceSpeciesIds(species),
  } satisfies GbifImportTarget;
}

function acceptedOccurrenceRecord(
  record: GbifOccurrenceRecord,
  target: GbifImportTarget,
  countyFeatures: CountyFeature[],
  countyNameLookup: Map<string, string[]>,
) {
  if (record.datasetKey !== EBIRD_EOD_DATASET_KEY) return null;
  if (record.basisOfRecord !== "HUMAN_OBSERVATION") return null;
  if (record.occurrenceStatus !== "PRESENT") return null;
  if (record.countryCode !== "US") return null;
  if (record.stateProvince?.trim().toLowerCase() !== "alabama") return null;
  if (record.hasGeospatialIssue) return null;

  const acceptedScientificName = record.acceptedScientificName ?? record.scientificName ?? "";
  if (
    !canonicalScientificName(acceptedScientificName).startsWith(
      canonicalScientificName(target.scientificName),
    )
  ) {
    return null;
  }

  if (
    typeof record.decimalLatitude !== "number" ||
    typeof record.decimalLongitude !== "number" ||
    typeof record.key !== "number"
  ) {
    return null;
  }

  const countyFips = resolveCountyFips(record, countyFeatures, countyNameLookup);
  if (!countyFips) return null;

  return {
    gbifKey: record.key,
    eventDate: record.eventDate,
    countyFips,
    latitude: record.decimalLatitude,
    longitude: record.decimalLongitude,
    county: record.county,
    locality: record.locality,
    recordedBy: record.recordedBy,
    license: record.license,
    issues: record.issues ?? [],
  } satisfies ImportedObservation;
}

function loadEbirdCoverageForTarget(
  target: GbifImportTarget,
  countyFeatures: CountyFeature[],
  countyNameLookup: Map<string, string[]>,
) {
  const coverage: ImportedCoverage = {
    scientificName: target.scientificName,
    speciesKey: target.speciesKey,
    relatedSpeciesIds: target.relatedSpeciesIds,
    countyFips: new Set(),
    representativeObservations: new Map(),
    acceptedOccurrenceCount: 0,
    scannedOccurrenceCount: 0,
    totalGbifOccurrenceCount: 0,
    skippedOccurrenceCount: 0,
  };

  let offset = 0;
  while (offset < MAX_RECORDS_PER_SPECIES) {
    const params = new URLSearchParams({
      datasetKey: EBIRD_EOD_DATASET_KEY,
      country: "US",
      stateProvince: "Alabama",
      occurrenceStatus: "PRESENT",
      basisOfRecord: "HUMAN_OBSERVATION",
      taxonKey: String(target.speciesKey),
      hasCoordinate: "true",
      hasGeospatialIssue: "false",
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    const payload = curlJson<GbifOccurrenceSearchResponse>(
      `${GBIF_API_BASE_URL}/occurrence/search?${params.toString()}`,
    );
    coverage.totalGbifOccurrenceCount = payload.count;

    for (const record of payload.results) {
      coverage.scannedOccurrenceCount += 1;
      const observation = acceptedOccurrenceRecord(
        record,
        target,
        countyFeatures,
        countyNameLookup,
      );
      if (!observation) {
        coverage.skippedOccurrenceCount += 1;
        continue;
      }

      coverage.acceptedOccurrenceCount += 1;
      coverage.countyFips.add(observation.countyFips);
      if (!coverage.representativeObservations.has(observation.countyFips)) {
        coverage.representativeObservations.set(observation.countyFips, observation);
      }
    }

    if (
      payload.endOfRecords ||
      payload.results.length === 0 ||
      coverage.countyFips.size === 67
    ) {
      break;
    }

    offset += payload.results.length;
  }

  console.log(
    `Loaded GBIF eBird observations for ${target.scientificName}: ${coverage.countyFips.size} Alabama counties from ${coverage.acceptedOccurrenceCount} accepted records (${coverage.scannedOccurrenceCount}/${coverage.totalGbifOccurrenceCount} records scanned, ${coverage.skippedOccurrenceCount} skipped).`,
  );

  return coverage;
}

function collectImportedCoverage(species: Species[]) {
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalScientificName(record.scientificName), record]),
  );
  const { countyFeatures, countyNameLookup } = buildCountyLookups();
  const imported = new Map<string, ImportedCoverage>();

  let exactCatalogTargets = 0;
  let exactGbifTargets = 0;
  for (const scientificName of PILOT_TARGET_SCIENTIFIC_NAMES) {
    const speciesRecord = speciesByScientificName.get(canonicalScientificName(scientificName));
    if (!speciesRecord) {
      console.log(`Skipped GBIF eBird target without exact catalog match: ${scientificName}`);
      continue;
    }

    exactCatalogTargets += 1;
    const target = findGbifSpeciesKey(speciesRecord);
    if (!target) {
      console.log(`Skipped GBIF eBird target without exact GBIF species match: ${scientificName}`);
      continue;
    }

    exactGbifTargets += 1;
    const coverage = loadEbirdCoverageForTarget(
      target,
      countyFeatures,
      countyNameLookup,
    );
    if (coverage.countyFips.size > 0) {
      imported.set(target.speciesId, coverage);
    }
  }

  const countyPairs = [...imported.values()].reduce(
    (total, coverage) => total + coverage.countyFips.size,
    0,
  );
  console.log(
    `Reviewed ${PILOT_TARGET_SCIENTIFIC_NAMES.length} GBIF eBird pilot species; ${exactCatalogTargets} exact current-catalog targets; ${exactGbifTargets} exact GBIF species matches.`,
  );
  console.log(
    `Loaded ${imported.size} species from GBIF eBird observations with ${countyPairs} Alabama county-species pairs.`,
  );

  return imported;
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const imported = collectImportedCoverage(species);
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
          externalId: `GBIF speciesKey ${coverage.speciesKey}; ${coverage.acceptedOccurrenceCount} accepted observations scanned across ${coverage.countyFips.size} Alabama counties`,
          url: `https://www.gbif.org/occurrence/search?dataset_key=${EBIRD_EOD_DATASET_KEY}&taxon_key=${coverage.speciesKey}&country=US&state_province=Alabama&basis_of_record=HUMAN_OBSERVATION`,
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
      ...snapshot.citation.filter((entry) => !entry.includes("eBird Observation Dataset")),
      "Imani, J.; Audette, C.; Auer, T.; et al. 2025. EOD - eBird Observation Dataset. Cornell Lab of Ornithology. Occurrence dataset https://doi.org/10.15468/aomfnb accessed via GBIF.org on 2026-06-15.",
    ],
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds: snapshot.unmatchedSpeciesIds.filter(
      (speciesId) => !outputRecords.has(speciesId),
    ),
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  const sourceSnapshotSpecies: EbirdSourceSnapshotSpecies[] = [...imported.entries()]
    .map(([speciesId, coverage]) => ({
      speciesId,
      scientificName: coverage.scientificName,
      speciesKey: coverage.speciesKey,
      totalGbifOccurrenceCount: coverage.totalGbifOccurrenceCount,
      scannedOccurrenceCount: coverage.scannedOccurrenceCount,
      acceptedOccurrenceCount: coverage.acceptedOccurrenceCount,
      skippedOccurrenceCount: coverage.skippedOccurrenceCount,
      countyFips: [...coverage.countyFips].sort(),
      representativeObservations: [...coverage.representativeObservations.values()].sort(
        (left, right) => left.countyFips.localeCompare(right.countyFips),
      ),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const sourceSnapshot: EbirdSourceSnapshotFile = {
    source: SOURCE_NAME,
    citation: [
      "Imani, J.; Audette, C.; Auer, T.; et al. 2025. EOD - eBird Observation Dataset. Cornell Lab of Ornithology. Occurrence dataset https://doi.org/10.15468/aomfnb accessed via GBIF.org.",
      "Cornell Lab of Ornithology. 2026. Download eBird Data Products. Available online at https://science.ebird.org/en/use-ebird-data/download-ebird-data-products.",
    ],
    accessedAt,
    datasetKey: EBIRD_EOD_DATASET_KEY,
    filters: {
      country: "US",
      stateProvince: "Alabama",
      basisOfRecord: "HUMAN_OBSERVATION",
      occurrenceStatus: "PRESENT",
      hasCoordinate: true,
      hasGeospatialIssue: false,
      coordinateResolution: "point must resolve to exactly one Alabama county",
      maxRecordsPerSpecies: MAX_RECORDS_PER_SPECIES,
    },
    targetScientificNames: PILOT_TARGET_SCIENTIFIC_NAMES,
    species: sourceSnapshotSpecies,
    summary: {
      targetSpeciesCount: PILOT_TARGET_SCIENTIFIC_NAMES.length,
      importedSpeciesCount: sourceSnapshotSpecies.length,
      acceptedOccurrenceCount: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.acceptedOccurrenceCount,
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
  console.log(`Saved GBIF eBird observations snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Saved GBIF eBird observations source audit to ${SOURCE_SNAPSHOT_PATH}`);
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
