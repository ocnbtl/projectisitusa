import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse } from "csv-parse/sync";
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
const SOURCE_NAME = "NEON TALL plant presence and percent cover";
const PRODUCT_ID = "DP1.10058.001";
const RELEASE = "RELEASE-2026";
const SITE_ID = "TALL";
const PRODUCT_URL = `https://data.neonscience.org/data-products/${PRODUCT_ID}`;
const PRODUCT_API_URL = `https://data.neonscience.org/api/v0/products/${PRODUCT_ID}`;
const DATA_API_BASE_URL = `https://data.neonscience.org/api/v0/data/${PRODUCT_ID}/${SITE_ID}`;
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/neon-tall-alabama-plants-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");

type NeonProductResponse = {
  data: {
    productCodeLong: string;
    productName: string;
    productDescription: string;
    siteCodes: Array<{
      siteCode: string;
      availableMonths: string[];
      availableReleases?: Array<{
        release: string;
        availableMonths: string[];
      }>;
    }>;
  };
};

type NeonDataResponse = {
  data: {
    files: Array<{
      name: string;
      url: string;
    }>;
  };
};

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

type NeonPlantRow = {
  siteID?: string;
  decimalLatitude?: string;
  decimalLongitude?: string;
  plotID?: string;
  subplotID?: string;
  endDate?: string;
  divDataType?: string;
  targetTaxaPresent?: string;
  taxonID?: string;
  scientificName?: string;
  taxonRank?: string;
  family?: string;
  nativeStatusCode?: string;
  identificationQualifier?: string;
  percentCover?: string;
};

type NeonAcceptedRecord = {
  month: string;
  plotID: string;
  subplotID: string;
  endDate: string;
  taxonID: string;
  neonScientificName: string;
  nativeStatusCode: string;
  percentCover: string;
  countyFips: string;
  latitude: number;
  longitude: number;
};

type ImportedCoverage = {
  scientificName: string;
  commonName: string;
  relatedSpeciesIds: string[];
  countyFips: Set<string>;
  records: NeonAcceptedRecord[];
  representativeRecords: Map<string, NeonAcceptedRecord>;
};

type NeonSourceSnapshotSpecies = {
  speciesId: string;
  scientificName: string;
  commonName: string;
  acceptedRecordCount: number;
  countyFips: string[];
  representativeRecords: NeonAcceptedRecord[];
};

type NeonSourceSnapshotFile = {
  source: string;
  citation: string[];
  accessedAt: string;
  productId: typeof PRODUCT_ID;
  siteId: typeof SITE_ID;
  release: typeof RELEASE;
  filters: {
    divDataType: "plantSpecies";
    taxonRank: "species";
    nativeStatusCode: "I";
    identificationQualifier: "blank";
    coordinateResolution: "row coordinates must resolve to exactly one Alabama county";
    sourceFilePattern: "div_1m2Data expanded CSV";
  };
  species: NeonSourceSnapshotSpecies[];
  summary: {
    monthsReviewed: number;
    rowsReviewed: number;
    plantSpeciesRows: number;
    skippedQualifiedRows: number;
    acceptedRecordCount: number;
    importedSpeciesCount: number;
    countySpeciesPairs: number;
  };
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function curlJson<T>(url: string, maxBuffer = 25 * 1024 * 1024) {
  return JSON.parse(
    execFileSync(
      "curl",
      ["-sL", "--retry", "2", "--max-time", "180", "-A", USER_AGENT, url],
      { encoding: "utf8", maxBuffer },
    ),
  ) as T;
}

function curlText(url: string, maxBuffer = 50 * 1024 * 1024) {
  return execFileSync(
    "curl",
    ["-sL", "--retry", "2", "--max-time", "180", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer },
  );
}

function canonicalCatalogName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function canonicalNeonBinomial(value: string) {
  const [genus, species] = value.trim().replace(/\s+/g, " ").split(" ");
  if (!genus || !species) return "";
  return `${genus} ${species}`.toLowerCase();
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

function parseCsv<T>(csv: string) {
  return parse(csv, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

function productMonths(product: NeonProductResponse) {
  const site = product.data.siteCodes.find((entry) => entry.siteCode === SITE_ID);
  if (!site) {
    throw new Error(`NEON product ${PRODUCT_ID} does not list site ${SITE_ID}`);
  }

  const releasedMonths = site.availableReleases?.find(
    (entry) => entry.release === RELEASE,
  )?.availableMonths;
  if (!releasedMonths || releasedMonths.length === 0) {
    throw new Error(`NEON product ${PRODUCT_ID} has no ${RELEASE} months for ${SITE_ID}`);
  }

  return releasedMonths.sort();
}

function findExpandedOneMeterFile(data: NeonDataResponse, month: string) {
  const file = data.data.files.find(
    (entry) =>
      entry.name.includes("div_1m2Data") &&
      entry.name.includes("expanded") &&
      entry.name.endsWith(".csv"),
  );

  if (!file) {
    throw new Error(`No expanded div_1m2Data CSV found for ${SITE_ID} ${month}`);
  }

  return file;
}

async function collectImportedCoverage(
  species: Species[],
  countyFeatures: CountyFeature[],
  months: string[],
) {
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalCatalogName(record.scientificName), record]),
  );
  const imported = new Map<string, ImportedCoverage>();
  let rowsReviewed = 0;
  let plantSpeciesRows = 0;
  let skippedQualifiedRows = 0;

  for (const month of months) {
    const data = curlJson<NeonDataResponse>(`${DATA_API_BASE_URL}/${month}`);
    const file = findExpandedOneMeterFile(data, month);
    const rows = parseCsv<NeonPlantRow>(curlText(file.url));
    rowsReviewed += rows.length;

    for (const row of rows) {
      if (row.siteID !== SITE_ID) continue;
      if (row.divDataType !== "plantSpecies") continue;
      plantSpeciesRows += 1;
      if (row.taxonRank !== "species") continue;
      if (row.identificationQualifier?.trim()) {
        skippedQualifiedRows += 1;
        continue;
      }
      if (row.nativeStatusCode !== "I") continue;
      if (!row.scientificName) continue;

      const speciesRecord = speciesByScientificName.get(
        canonicalNeonBinomial(row.scientificName),
      );
      if (!speciesRecord) continue;

      const latitude = Number(row.decimalLatitude);
      const longitude = Number(row.decimalLongitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

      const countyFips = resolveCoordinateCountyFips(
        latitude,
        longitude,
        countyFeatures,
      );
      if (!countyFips) continue;

      const speciesId = countyPresenceSpeciesId(speciesRecord);
      const coverage = imported.get(speciesId) ?? {
        scientificName: speciesRecord.scientificName,
        commonName: speciesRecord.commonName,
        relatedSpeciesIds: relatedCountyPresenceSpeciesIds(speciesRecord),
        countyFips: new Set<string>(),
        records: [],
        representativeRecords: new Map<string, NeonAcceptedRecord>(),
      };
      const acceptedRecord: NeonAcceptedRecord = {
        month,
        plotID: row.plotID ?? "",
        subplotID: row.subplotID ?? "",
        endDate: row.endDate ?? "",
        taxonID: row.taxonID ?? "",
        neonScientificName: row.scientificName,
        nativeStatusCode: row.nativeStatusCode,
        percentCover: row.percentCover ?? "",
        countyFips,
        latitude,
        longitude,
      };

      coverage.records.push(acceptedRecord);
      coverage.countyFips.add(countyFips);
      if (!coverage.representativeRecords.has(countyFips)) {
        coverage.representativeRecords.set(countyFips, acceptedRecord);
      }
      imported.set(speciesId, coverage);
    }
  }

  return { imported, rowsReviewed, plantSpeciesRows, skippedQualifiedRows };
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const product = curlJson<NeonProductResponse>(PRODUCT_API_URL);
  const months = productMonths(product);
  const countyFeatures = buildCountyFeatures();
  const { imported, rowsReviewed, plantSpeciesRows, skippedQualifiedRows } =
    await collectImportedCoverage(species, countyFeatures, months);
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
          externalId: `${coverage.scientificName}; ${coverage.records.length} introduced plant records across ${coverage.countyFips.size} TALL plot counties`,
          url: PRODUCT_URL,
        },
      ]),
    });
  }

  const records = [...outputRecords.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const citationText =
    "National Ecological Observatory Network. Plant presence and percent cover, DP1.10058.001, RELEASE-2026. Available online at https://data.neonscience.org/data-products/DP1.10058.001.";
  const nextSnapshot: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation: [
      ...snapshot.citation.filter(
        (entry) => !entry.includes("Plant presence and percent cover"),
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

  const sourceSnapshotSpecies: NeonSourceSnapshotSpecies[] = [...imported.entries()]
    .map(([speciesId, coverage]) => ({
      speciesId,
      scientificName: coverage.scientificName,
      commonName: coverage.commonName,
      acceptedRecordCount: coverage.records.length,
      countyFips: [...coverage.countyFips].sort(),
      representativeRecords: [...coverage.representativeRecords.values()].sort(
        (left, right) => left.countyFips.localeCompare(right.countyFips),
      ),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const sourceSnapshot: NeonSourceSnapshotFile = {
    source: SOURCE_NAME,
    citation: [
      citationText,
      product.data.productDescription,
    ],
    accessedAt,
    productId: PRODUCT_ID,
    siteId: SITE_ID,
    release: RELEASE,
    filters: {
      divDataType: "plantSpecies",
      taxonRank: "species",
      nativeStatusCode: "I",
      identificationQualifier: "blank",
      coordinateResolution: "row coordinates must resolve to exactly one Alabama county",
      sourceFilePattern: "div_1m2Data expanded CSV",
    },
    species: sourceSnapshotSpecies,
    summary: {
      monthsReviewed: months.length,
      rowsReviewed,
      plantSpeciesRows,
      skippedQualifiedRows,
      acceptedRecordCount: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.acceptedRecordCount,
        0,
      ),
      importedSpeciesCount: sourceSnapshotSpecies.length,
      countySpeciesPairs: sourceSnapshotSpecies.reduce(
        (total, record) => total + record.countyFips.length,
        0,
      ),
    },
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  await writeFile(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);
  console.log(`Saved NEON TALL plant snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Saved NEON source audit to ${SOURCE_SNAPSHOT_PATH}`);
  console.log(`Reviewed ${months.length} TALL months and ${rowsReviewed} div_1m2Data rows.`);
  console.log(
    `Accepted ${sourceSnapshot.summary.acceptedRecordCount} records for ${sourceSnapshot.summary.importedSpeciesCount} exact catalog species.`,
  );
  console.log(
    `Gross county-species source pairs: ${sourceSnapshot.summary.countySpeciesPairs}`,
  );
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
