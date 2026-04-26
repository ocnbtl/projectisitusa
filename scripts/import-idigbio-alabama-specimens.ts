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
  CountyDataSourceRef,
  CountyRecord,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const IDIGBIO_API_BASE_URL = "https://search.idigbio.org/v2/search/records";
const IDIGBIO_SOURCE_URL = "https://portal.idigbio.org/portal/search";
const GENERATED_SPECIES_PATH = resolve(
  process.cwd(),
  "src/data/generated/species.json",
);
const OUTPUT_PATH = resolve(
  process.cwd(),
  "src/data/source/idigbio-alabama-preserved-specimens-snapshot.json",
);
const PAGE_LIMIT = 300;
const CONCURRENCY = 5;
const MAX_RECORDS_PER_SPECIES = 5000;
const ACCEPTED_BASIS_OF_RECORD = new Set(["preservedspecimen"]);
const CULTIVATION_PATTERN =
  /\b(cultivated|cultivation|planted|planting|garden|greenhouse|nursery|arboretum|botanical garden|campus landscape|landscaped)\b/i;

type GeneratedSpecies = {
  id: string;
  commonName: string;
  scientificName: string;
  registry?: {
    occurrenceId?: string;
  };
};

type CountyGeometry = {
  id: string;
  properties?: {
    name?: string;
  };
};

type IdigbioSearchResponse = {
  itemCount: number;
  items: IdigbioRecord[];
};

type IdigbioRecord = {
  uuid: string;
  indexTerms?: {
    basisofrecord?: string;
    catalognumber?: string;
    collectioncode?: string;
    country?: string;
    county?: string;
    geopoint?: {
      lat?: number;
      lon?: number;
    };
    institutioncode?: string;
    locality?: string;
    scientificname?: string;
    stateprovince?: string;
  };
};

type IdigbioGeopoint = NonNullable<IdigbioRecord["indexTerms"]>["geopoint"];

type CountyFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { name?: string; countyFips: string }
>;

type ImportedCoverage = {
  countyFips: Set<string>;
  source: CountyDataSourceRef;
  occurrenceKeys: Set<string>;
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function curlJson<T>(url: string) {
  const response = execFileSync(
    "curl",
    ["-sL", "--retry", "2", "--max-time", "60", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer: 30 * 1024 * 1024 },
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
  const countyFeatures: CountyFeature[] = [];
  const lookup = new Map<string, string[]>();

  countyCollection.features.forEach((countyFeature, index) => {
    const geometry = topology.objects.counties.geometries[index];
    const countyFips = geometry.id;
    const stateCode = stateCodeByFips[countyFips.slice(0, 2)];
    if (stateCode !== "AL") {
      return;
    }

    const name = geometry.properties?.name ?? countyFeature.properties?.name ?? "Unknown";
    countyIndex[countyFips] = {
      countyFips,
      name,
      stateCode,
      stateName: "Alabama",
      neighborFips: [],
      center: [0, 0],
    };

    countyFeatures.push({
      ...countyFeature,
      properties: {
        ...(countyFeature.properties ?? {}),
        countyFips,
        name,
      },
    });

    for (const alias of new Set([name, normalizeCountyName(name)])) {
      if (!alias) continue;
      const key = normalizeCountyName(alias);
      const list = lookup.get(key) ?? [];
      if (!list.includes(countyFips)) {
        list.push(countyFips);
      }
      lookup.set(key, list);
    }
  });

  return { countyFeatures, countyIndex, lookup };
}

function resolveAlabamaCountyFips(
  countyName: string | undefined,
  countyLookup: Map<string, string[]>,
) {
  if (!countyName) return null;

  const matches = countyLookup.get(normalizeCountyName(countyName)) ?? [];
  return matches.length === 1 ? matches[0] : null;
}

function resolveCoordinateCountyFips(
  geopoint: IdigbioGeopoint | undefined,
  countyFeatures: CountyFeature[],
) {
  if (
    !geopoint ||
    typeof geopoint.lat !== "number" ||
    typeof geopoint.lon !== "number"
  ) {
    return null;
  }

  for (const countyFeature of countyFeatures) {
    if (geoContains(countyFeature, [geopoint.lon, geopoint.lat])) {
      return countyFeature.properties.countyFips;
    }
  }

  return null;
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

function speciesIdForCountySnapshot(species: GeneratedSpecies) {
  return species.registry?.occurrenceId ?? species.id;
}

function occurrenceLooksCultivated(record: IdigbioRecord) {
  const values = [record.indexTerms?.locality];
  return values.some((value) => value && CULTIVATION_PATTERN.test(value));
}

function acceptedOccurrenceCountyFips(
  record: IdigbioRecord,
  scientificName: string,
  countyLookup: Map<string, string[]>,
  countyFeatures: CountyFeature[],
) {
  const terms = record.indexTerms;
  if (!terms) return null;
  if (!ACCEPTED_BASIS_OF_RECORD.has(terms.basisofrecord ?? "")) return null;
  if (terms.country !== "united states") return null;
  if (terms.stateprovince !== "alabama") return null;
  if (canonicalScientificName(terms.scientificname ?? "") !== scientificName) return null;
  if (occurrenceLooksCultivated(record)) return null;

  const countyFromName = resolveAlabamaCountyFips(terms.county, countyLookup);
  const countyFromCoordinates = resolveCoordinateCountyFips(
    terms.geopoint,
    countyFeatures,
  );

  if (
    countyFromName &&
    countyFromCoordinates &&
    countyFromName !== countyFromCoordinates
  ) {
    return null;
  }

  return countyFromName ?? countyFromCoordinates;
}

function buildIdigbioUrl(scientificName: string, offset: number) {
  const query = {
    basisofrecord: "preservedspecimen",
    country: "united states",
    scientificname: scientificName,
    stateprovince: "alabama",
  };
  const fields = [
    "uuid",
    "scientificname",
    "stateprovince",
    "country",
    "county",
    "geopoint",
    "basisofrecord",
    "locality",
    "institutioncode",
    "collectioncode",
    "catalognumber",
  ];

  return `${IDIGBIO_API_BASE_URL}?rq=${encodeURIComponent(
    JSON.stringify(query),
  )}&fields=${encodeURIComponent(
    JSON.stringify(fields),
  )}&limit=${PAGE_LIMIT}&offset=${offset}`;
}

function loadIdigbioAlabamaCoverageForSpecies(
  species: GeneratedSpecies,
  countyLookup: Map<string, string[]>,
  countyFeatures: CountyFeature[],
) {
  const scientificName = canonicalScientificName(species.scientificName);
  const source: CountyDataSourceRef = {
    source: "iDigBio preserved specimen records",
    matchType: "scientific-exact",
    externalId: species.scientificName,
    url: `${IDIGBIO_SOURCE_URL}?rq=${encodeURIComponent(
      JSON.stringify({
        basisofrecord: "preservedspecimen",
        country: "united states",
        scientificname: scientificName,
        stateprovince: "alabama",
      }),
    )}`,
  };
  const coverage: ImportedCoverage = {
    countyFips: new Set<string>(),
    occurrenceKeys: new Set<string>(),
    source,
  };

  let offset = 0;
  let totalRows = 0;
  let acceptedRows = 0;
  let unresolvedRows = 0;

  while (offset < MAX_RECORDS_PER_SPECIES) {
    const payload = curlJson<IdigbioSearchResponse>(
      buildIdigbioUrl(scientificName, offset),
    );
    totalRows = payload.itemCount;

    for (const record of payload.items ?? []) {
      const countyFips = acceptedOccurrenceCountyFips(
        record,
        scientificName,
        countyLookup,
        countyFeatures,
      );
      if (!countyFips) {
        unresolvedRows += 1;
        continue;
      }

      acceptedRows += 1;
      coverage.countyFips.add(countyFips);
      coverage.occurrenceKeys.add(record.uuid);
    }

    if ((payload.items ?? []).length < PAGE_LIMIT) {
      break;
    }

    offset += PAGE_LIMIT;
  }

  if (coverage.countyFips.size > 0) {
    console.log(
      `Loaded iDigBio Alabama specimens for ${species.scientificName}: ${coverage.countyFips.size} counties from ${acceptedRows} accepted records (${totalRows} queried, ${unresolvedRows} skipped).`,
    );
  }

  return coverage;
}

async function main() {
  const generatedSpecies = readJsonFile<GeneratedSpecies[]>(GENERATED_SPECIES_PATH);
  const { countyFeatures, countyIndex, lookup: countyLookup } = buildCountyLookup();
  const targetBySpeciesId = new Map<string, GeneratedSpecies>();

  for (const species of generatedSpecies) {
    targetBySpeciesId.set(speciesIdForCountySnapshot(species), species);
  }

  console.log(
    `Checking ${targetBySpeciesId.size} catalog species against iDigBio Alabama preserved specimen records.`,
  );

  const coverageBySpecies = await mapPool(
    [...targetBySpeciesId.entries()],
    CONCURRENCY,
    async ([speciesId, species], index) => {
      const coverage = loadIdigbioAlabamaCoverageForSpecies(
        species,
        countyLookup,
        countyFeatures,
      );
      if ((index + 1) % 100 === 0) {
        console.log(`Checked ${index + 1}/${targetBySpeciesId.size} iDigBio targets.`);
      }
      return [speciesId, coverage] as const;
    },
  );

  const species = coverageBySpecies
    .filter(([, coverage]) => coverage.countyFips.size > 0)
    .map(([speciesId, coverage]) => ({
      speciesId,
      countyFips: [...coverage.countyFips].sort(),
      countyDataSources: [coverage.source],
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));

  const speciesWithCoverage = new Set(species.map((record) => record.speciesId));
  const unmatchedSpeciesIds = [...targetBySpeciesId.keys()]
    .filter((speciesId) => !speciesWithCoverage.has(speciesId))
    .sort();

  const snapshot: CountyCoverageSnapshotFile = {
    source: "iDigBio Alabama preserved specimen snapshot",
    citation: [
      "iDigBio. 2026. iDigBio Search API. Preserved specimen records for Alabama, United States. Available online at https://search.idigbio.org/v2/search/records.",
    ],
    snapshotDate: new Date().toISOString(),
    species,
    unmatchedSpeciesIds,
    coverageSummary: {
      catalogSpeciesCount: targetBySpeciesId.size,
      mappedSpeciesCount: species.length,
      unmatchedSpeciesCount: unmatchedSpeciesIds.length,
      sourceSpeciesCounts: {
        "iDigBio preserved specimen records": species.length,
      },
    },
  };

  const totalCountyRows = species.reduce(
    (total, record) => total + record.countyFips.length,
    0,
  );

  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Saved iDigBio Alabama preserved specimen snapshot for ${species.length} species and ${totalCountyRows} county rows across ${Object.keys(countyIndex).length} Alabama counties to ${OUTPUT_PATH}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
