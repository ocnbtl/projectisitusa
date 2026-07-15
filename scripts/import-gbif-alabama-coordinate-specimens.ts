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
const SOURCE_NAME = "GBIF coordinate-resolved preserved specimen records";
const GBIF_API_BASE_URL = "https://api.gbif.org/v1";
const GBIF_OCCURRENCE_SOURCE_URL = "https://www.gbif.org/occurrence/search";
const ALABAMA_BBOX_WKT =
  "POLYGON((-88.6 30.1,-84.7 30.1,-84.7 35.1,-88.6 35.1,-88.6 30.1))";
const PAGE_LIMIT = 300;
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/gbif-alabama-coordinate-specimens-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");

const TARGETS = [
  { scientificName: "Odontomachus haematodus", speciesKey: 5035385 },
  { scientificName: "Pheidole navigans", speciesKey: 9239368 },
  { scientificName: "Paratrechina vividula", speciesKey: 1325436 },
  { scientificName: "Pheidole obscurithorax", speciesKey: 8223587 },
  { scientificName: "Linepithema humile", speciesKey: 1316908 },
  { scientificName: "Aedes albopictus", speciesKey: 1651430 },
  { scientificName: "Corbicula fluminea", speciesKey: 8190231 },
  { scientificName: "Lygodium japonicum", speciesKey: 2650436 },
  { scientificName: "Solenopsis invicta", speciesKey: 5035230 },
  { scientificName: "Polygonum aviculare", speciesKey: 7821030 },
  { scientificName: "Briza minor", speciesKey: 2702793 },
  { scientificName: "Euphorbia cyparissias", speciesKey: 3070106 },
  { scientificName: "Lolium temulentum", speciesKey: 2706242 },
  { scientificName: "Abutilon theophrasti", speciesKey: 3152614 },
  { scientificName: "Harmonia axyridis", speciesKey: 4989904 },
  { scientificName: "Culex coronator", speciesKey: 1653144 },
  { scientificName: "Hemidactylus turcicus", speciesKey: 5221528 },
  { scientificName: "Cactoblastis cactorum", speciesKey: 1870532 },
  { scientificName: "Hypoponera opaciceps", speciesKey: 1326617 },
  { scientificName: "Brachymyrmex patagonicus", speciesKey: 1317320 },
  { scientificName: "Wahlenbergia marginata", speciesKey: 5413733 },
  { scientificName: "Cyprinus carpio", speciesKey: 4286975 },
  { scientificName: "Oreochromis niloticus", speciesKey: 4285694 },
  { scientificName: "Solenopsis richteri", speciesKey: 5035017 },
  { scientificName: "Xylosandrus crassiusculus", speciesKey: 8152712 },
  { scientificName: "Solanum sisymbriifolium", speciesKey: 2932184 },
  { scientificName: "Mitracarpus hirtus", speciesKey: 2912993 },
  { scientificName: "Acanthospermum australe", speciesKey: 3100364 },
  { scientificName: "Bothriochloa ischaemum", speciesKey: 2704102 },
  { scientificName: "Panicum repens", speciesKey: 8275925 },
  { scientificName: "Vernicia fordii", speciesKey: 3074906 },
  { scientificName: "Hydrilla verticillata", speciesKey: 5329570 },
  { scientificName: "Mus musculus", speciesKey: 7429082 },
  { scientificName: "Sesbania punicea", speciesKey: 2970728 },
  { scientificName: "Cyperus esculentus", speciesKey: 2716226 },
  { scientificName: "Dactyloctenium aegyptium", speciesKey: 2706188 },
  { scientificName: "Echinochloa crus-galli", speciesKey: 2702808 },
  { scientificName: "Lepidium didymum", speciesKey: 5377060 },
  { scientificName: "Fimbristylis littoralis", speciesKey: 2709087 },
  { scientificName: "Cuphea carthagenensis", speciesKey: 3188685 },
  { scientificName: "Cyperus rotundus", speciesKey: 2714818 },
  { scientificName: "Trifolium arvense", speciesKey: 5359246 },
  { scientificName: "Sporobolus indicus", speciesKey: 2704757 },
  { scientificName: "Bromus catharticus", speciesKey: 2703723 },
  { scientificName: "Soliva sessilis", speciesKey: 3092691 },
  { scientificName: "Popillia japonica", speciesKey: 4425774 },
  { scientificName: "Geranium dissectum", speciesKey: 2890040 },
  { scientificName: "Raphanus raphanistrum", speciesKey: 3040983 },
  { scientificName: "Clematis terniflora", speciesKey: 3033546 },
  { scientificName: "Cyperus iria", speciesKey: 2715729 },
  { scientificName: "Crotalaria spectabilis", speciesKey: 2942727 },
  { scientificName: "Triadica sebifera", speciesKey: 3054399 },
  { scientificName: "Cyclospermum leptophyllum", speciesKey: 8350395 },
  { scientificName: "Alternanthera philoxeroides", speciesKey: 3084923 },
  { scientificName: "Verbena rigida", speciesKey: 2925496 },
  { scientificName: "Ipomoea quamoclit", speciesKey: 2928562 },
  { scientificName: "Rumex crispus", speciesKey: 8195144 },
  { scientificName: "Poa annua", speciesKey: 2704179 },
  { scientificName: "Eleusine indica", speciesKey: 2705953 },
  { scientificName: "Microstegium vimineum", speciesKey: 5289808 },
  { scientificName: "Paspalum dilatatum", speciesKey: 2705565 },
  { scientificName: "Arenaria serpyllifolia", speciesKey: 8089871 },
  { scientificName: "Ranunculus sardous", speciesKey: 3033483 },
  { scientificName: "Youngia japonica", speciesKey: 5387974 },
  { scientificName: "Medicago lupulina", speciesKey: 2965201 },
  { scientificName: "Sonchus asper", speciesKey: 3105782 },
  { scientificName: "Wisteria sinensis", speciesKey: 8149049 },
  { scientificName: "Vicia villosa", speciesKey: 9182154 },
] as const;

const EXCLUDED_CONTEXT_PATTERN =
  /\b(cultivated|cultivation|planted|planting|garden|greenhouse|nursery|arboretum|botanical garden|campus landscape|landscaped|lab\.? colony|laboratory colony)\b/i;

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
  occurrenceID?: string;
  basisOfRecord?: string;
  occurrenceStatus?: string;
  countryCode?: string;
  scientificName?: string;
  acceptedScientificName?: string;
  decimalLatitude?: number;
  decimalLongitude?: number;
  hasGeospatialIssue?: boolean;
  issues?: string[];
  institutionCode?: string;
  collectionCode?: string;
  catalogNumber?: string;
  eventDate?: string;
  locality?: string;
  occurrenceRemarks?: string;
  habitat?: string;
  establishmentMeans?: string;
  recordedBy?: string;
  license?: string;
};

type ImportedSpecimen = {
  gbifKey: number;
  occurrenceId?: string;
  eventDate?: string;
  countyFips: string;
  latitude: number;
  longitude: number;
  acceptedScientificName?: string;
  institutionCode?: string;
  collectionCode?: string;
  catalogNumber?: string;
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
  representativeSpecimens: Map<string, ImportedSpecimen>;
  acceptedSpecimenCount: number;
  scannedOccurrenceCount: number;
  totalGbifOccurrenceCount: number;
  skippedOccurrenceCount: number;
};

type SourceSnapshotSpecies = {
  speciesId: string;
  scientificName: string;
  speciesKey: number;
  totalGbifOccurrenceCount: number;
  scannedOccurrenceCount: number;
  acceptedSpecimenCount: number;
  skippedOccurrenceCount: number;
  countyFips: string[];
  representativeSpecimens: ImportedSpecimen[];
};

type SourceSnapshotFile = {
  source: string;
  citation: string[];
  accessedAt: string;
  filters: {
    country: "US";
    geometry: "Alabama bounding box, then local Alabama county polygon resolution";
    basisOfRecord: "PRESERVED_SPECIMEN";
    occurrenceStatus: "PRESENT";
    hasCoordinate: true;
    hasGeospatialIssue: false;
    taxonMatch: "exact current catalog species and exact GBIF speciesKey";
    excludedContexts: "cultivated, planted, garden, nursery, arboretum, landscaped, and lab-colony context text";
  };
  targetScientificNames: string[];
  species: SourceSnapshotSpecies[];
  summary: {
    targetSpeciesCount: number;
    importedSpeciesCount: number;
    acceptedSpecimenCount: number;
    countySpeciesPairs: number;
  };
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function curlJson<T>(url: string) {
  const response = execFileSync(
    "curl",
    ["-sL", "--retry", "3", "--max-time", "90", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
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

function acceptedSpecimenRecord(
  record: GbifOccurrenceRecord,
  scientificName: string,
  countyFeatures: CountyFeature[],
) {
  if (record.basisOfRecord !== "PRESERVED_SPECIMEN") return null;
  if (record.occurrenceStatus !== "PRESENT") return null;
  if (record.countryCode !== "US") return null;
  if (record.hasGeospatialIssue) return null;
  if (typeof record.key !== "number") return null;
  if (
    !canonicalScientificName(record.acceptedScientificName ?? record.scientificName ?? "").startsWith(
      canonicalScientificName(scientificName),
    )
  ) {
    return null;
  }
  const contextText = [
    record.locality,
    record.occurrenceRemarks,
    record.habitat,
    record.establishmentMeans,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  if (EXCLUDED_CONTEXT_PATTERN.test(contextText)) return null;

  const countyFips = resolveCountyFips(record, countyFeatures);
  if (!countyFips) return null;

  return {
    gbifKey: record.key,
    occurrenceId: asciiText(record.occurrenceID),
    eventDate: asciiText(record.eventDate),
    countyFips,
    latitude: record.decimalLatitude as number,
    longitude: record.decimalLongitude as number,
    acceptedScientificName: asciiText(record.acceptedScientificName),
    institutionCode: asciiText(record.institutionCode),
    collectionCode: asciiText(record.collectionCode),
    catalogNumber: asciiText(record.catalogNumber),
    locality: asciiText(record.locality),
    recordedBy: asciiText(record.recordedBy),
    license: asciiText(record.license),
    issues: record.issues ?? [],
  } satisfies ImportedSpecimen;
}

function loadCoverageForTarget(
  speciesRecord: Species,
  speciesKey: number,
  countyFeatures: CountyFeature[],
) {
  const coverage: ImportedCoverage = {
    scientificName: speciesRecord.scientificName,
    speciesKey,
    relatedSpeciesIds: relatedCountyPresenceSpeciesIds(speciesRecord),
    countyFips: new Set(),
    representativeSpecimens: new Map(),
    acceptedSpecimenCount: 0,
    scannedOccurrenceCount: 0,
    totalGbifOccurrenceCount: 0,
    skippedOccurrenceCount: 0,
  };

  let offset = 0;
  while (true) {
    const params = new URLSearchParams({
      country: "US",
      occurrenceStatus: "PRESENT",
      basisOfRecord: "PRESERVED_SPECIMEN",
      taxonKey: String(speciesKey),
      hasCoordinate: "true",
      hasGeospatialIssue: "false",
      geometry: ALABAMA_BBOX_WKT,
      limit: String(PAGE_LIMIT),
      offset: String(offset),
    });
    const payload = curlJson<GbifOccurrenceSearchResponse>(
      `${GBIF_API_BASE_URL}/occurrence/search?${params.toString()}`,
    );
    coverage.totalGbifOccurrenceCount = payload.count;

    for (const record of payload.results) {
      coverage.scannedOccurrenceCount += 1;
      const specimen = acceptedSpecimenRecord(
        record,
        speciesRecord.scientificName,
        countyFeatures,
      );
      if (!specimen) {
        coverage.skippedOccurrenceCount += 1;
        continue;
      }

      coverage.acceptedSpecimenCount += 1;
      coverage.countyFips.add(specimen.countyFips);
      if (!coverage.representativeSpecimens.has(specimen.countyFips)) {
        coverage.representativeSpecimens.set(specimen.countyFips, specimen);
      }
    }

    if (payload.endOfRecords || payload.results.length === 0) {
      break;
    }
    offset += payload.results.length;
  }

  console.log(
    `Loaded GBIF coordinate specimens for ${speciesRecord.scientificName}: ${coverage.countyFips.size} Alabama counties from ${coverage.acceptedSpecimenCount} accepted records (${coverage.scannedOccurrenceCount}/${coverage.totalGbifOccurrenceCount} records scanned, ${coverage.skippedOccurrenceCount} skipped).`,
  );

  return coverage;
}

function collectImportedCoverage(species: Species[]) {
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalScientificName(record.scientificName), record]),
  );
  const countyFeatures = buildCountyFeatures();
  const imported = new Map<string, ImportedCoverage>();

  let exactCatalogTargets = 0;
  for (const target of TARGETS) {
    const speciesRecord = speciesByScientificName.get(
      canonicalScientificName(target.scientificName),
    );
    if (!speciesRecord) {
      console.log(
        `Skipped GBIF coordinate specimen target without exact catalog match: ${target.scientificName}`,
      );
      continue;
    }

    exactCatalogTargets += 1;
    const coverage = loadCoverageForTarget(
      speciesRecord,
      target.speciesKey,
      countyFeatures,
    );
    if (coverage.countyFips.size > 0) {
      imported.set(countyPresenceSpeciesId(speciesRecord), coverage);
    }
  }

  const countyPairs = [...imported.values()].reduce(
    (total, coverage) => total + coverage.countyFips.size,
    0,
  );
  console.log(
    `Reviewed ${TARGETS.length} GBIF coordinate specimen targets; ${exactCatalogTargets} exact current-catalog targets.`,
  );
  console.log(
    `Loaded ${imported.size} species from GBIF coordinate specimens with ${countyPairs} Alabama county-species pairs.`,
  );

  return imported;
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
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
        (relatedSpeciesId) =>
          existingBySpeciesId
            .get(relatedSpeciesId)
            ?.countyFips.filter((countyFips) => countyFips.startsWith("01")) ?? [],
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
          externalId: `GBIF coordinate specimens; speciesKey ${coverage.speciesKey}; ${coverage.acceptedSpecimenCount} accepted specimens across ${coverage.countyFips.size} Alabama counties`,
          url: `${GBIF_OCCURRENCE_SOURCE_URL}?taxon_key=${coverage.speciesKey}&country=US&basis_of_record=PRESERVED_SPECIMEN`,
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
      ...snapshot.citation.filter(
        (entry) =>
          !entry.toLowerCase().includes("coordinate-resolved preserved specimen"),
      ),
      "GBIF.org. 2026. GBIF occurrence search. Coordinate-resolved preserved specimen records for Alabama, United States. Available online at https://www.gbif.org/occurrence/search.",
    ],
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds: snapshot.unmatchedSpeciesIds.filter(
      (speciesId) => !outputRecords.has(speciesId),
    ),
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  const sourceSnapshotSpecies: SourceSnapshotSpecies[] = [...imported.entries()]
    .map(([speciesId, coverage]) => ({
      speciesId,
      scientificName: coverage.scientificName,
      speciesKey: coverage.speciesKey,
      totalGbifOccurrenceCount: coverage.totalGbifOccurrenceCount,
      scannedOccurrenceCount: coverage.scannedOccurrenceCount,
      acceptedSpecimenCount: coverage.acceptedSpecimenCount,
      skippedOccurrenceCount: coverage.skippedOccurrenceCount,
      countyFips: [...coverage.countyFips].sort(),
      representativeSpecimens: [...coverage.representativeSpecimens.values()].sort(
        (left, right) => left.countyFips.localeCompare(right.countyFips),
      ),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const sourceSnapshot: SourceSnapshotFile = {
    source: SOURCE_NAME,
    citation: [
      "GBIF.org. 2026. GBIF occurrence search. Coordinate-resolved preserved specimen records for Alabama, United States. Available online at https://www.gbif.org/occurrence/search.",
    ],
    accessedAt,
    filters: {
      country: "US",
      geometry: "Alabama bounding box, then local Alabama county polygon resolution",
      basisOfRecord: "PRESERVED_SPECIMEN",
      occurrenceStatus: "PRESENT",
      hasCoordinate: true,
      hasGeospatialIssue: false,
      taxonMatch: "exact current catalog species and exact GBIF speciesKey",
      excludedContexts: "cultivated, planted, garden, nursery, arboretum, landscaped, and lab-colony context text",
    },
    targetScientificNames: TARGETS.map((target) => target.scientificName),
    species: sourceSnapshotSpecies,
    summary: {
      targetSpeciesCount: TARGETS.length,
      importedSpeciesCount: sourceSnapshotSpecies.length,
      acceptedSpecimenCount: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.acceptedSpecimenCount,
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
  console.log(`Saved GBIF coordinate specimen snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Saved GBIF coordinate specimen source audit to ${SOURCE_SNAPSHOT_PATH}`);
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
