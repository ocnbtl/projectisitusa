import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";

import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import type {
  CountyCoverageSnapshotFile,
  CountyDataSourceRef,
  CountyRecord,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const GBIF_API_BASE_URL = "https://api.gbif.org/v1";
const GBIF_OCCURRENCE_SOURCE_URL = "https://www.gbif.org/occurrence/search";
const GENERATED_SPECIES_PATH = resolve(
  process.cwd(),
  "src/data/generated/species.json",
);
const OUTPUT_PATH = resolve(
  process.cwd(),
  "src/data/source/gbif-alabama-preserved-specimens-snapshot.json",
);
const PAGE_LIMIT = 300;
const CONCURRENCY = 5;
const ACCEPTED_BASIS_OF_RECORD = new Set(["PRESERVED_SPECIMEN"]);
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
  occurrenceID?: string;
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
  hasGeospatialIssue?: boolean;
  issues?: string[];
  institutionCode?: string;
  collectionCode?: string;
  catalogNumber?: string;
  locality?: string;
  occurrenceRemarks?: string;
  habitat?: string;
  establishmentMeans?: string;
};

type GbifImportTarget = {
  speciesId: string;
  scientificName: string;
  speciesKey: number;
};

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
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
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

  return { countyIndex, lookup };
}

function resolveAlabamaCountyFips(
  countyName: string | undefined,
  countyLookup: Map<string, string[]>,
) {
  if (!countyName) return null;

  const matches = countyLookup.get(normalizeCountyName(countyName)) ?? [];
  return matches.length === 1 ? matches[0] : null;
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

function findGbifSpeciesKey(species: GeneratedSpecies) {
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
    speciesId: speciesIdForCountySnapshot(species),
    scientificName: species.scientificName,
    speciesKey,
  } satisfies GbifImportTarget;
}

function occurrenceLooksCultivated(record: GbifOccurrenceRecord) {
  const values = [
    record.locality,
    record.occurrenceRemarks,
    record.habitat,
    record.establishmentMeans,
  ];

  return values.some((value) => value && CULTIVATION_PATTERN.test(value));
}

function occurrenceKey(record: GbifOccurrenceRecord) {
  return (
    record.occurrenceID ??
    [
      record.datasetKey,
      record.institutionCode,
      record.collectionCode,
      record.catalogNumber,
      record.key,
    ]
      .filter(Boolean)
      .join(":")
  );
}

function acceptedOccurrenceRecord(
  record: GbifOccurrenceRecord,
  target: GbifImportTarget,
  countyLookup: Map<string, string[]>,
) {
  if (!ACCEPTED_BASIS_OF_RECORD.has(record.basisOfRecord ?? "")) return null;
  if (record.occurrenceStatus !== "PRESENT") return null;
  if (record.countryCode !== "US") return null;
  if (record.stateProvince?.trim().toLowerCase() !== "alabama") return null;
  if (occurrenceLooksCultivated(record)) return null;

  const acceptedScientificName =
    record.acceptedScientificName ?? record.scientificName ?? "";
  if (
    !canonicalScientificName(acceptedScientificName).startsWith(
      canonicalScientificName(target.scientificName),
    )
  ) {
    return null;
  }

  return resolveAlabamaCountyFips(record.county, countyLookup);
}

function loadGbifAlabamaCoverageForTarget(
  target: GbifImportTarget,
  countyLookup: Map<string, string[]>,
) {
  const coverage: ImportedCoverage = {
    countyFips: new Set<string>(),
    occurrenceKeys: new Set<string>(),
    source: {
      source: "GBIF preserved specimen records",
      matchType: "scientific-exact",
      externalId: String(target.speciesKey),
      url: `${GBIF_OCCURRENCE_SOURCE_URL}?taxon_key=${target.speciesKey}&country=US&state_province=Alabama&basis_of_record=PRESERVED_SPECIMEN`,
    },
  };

  let offset = 0;
  let totalRows = 0;
  let acceptedRows = 0;
  let unresolvedRows = 0;

  while (true) {
    const payload = curlJson<GbifOccurrenceSearchResponse>(
      `${GBIF_API_BASE_URL}/occurrence/search?country=US&stateProvince=Alabama&basisOfRecord=PRESERVED_SPECIMEN&occurrenceStatus=PRESENT&taxonKey=${target.speciesKey}&limit=${PAGE_LIMIT}&offset=${offset}`,
    );

    totalRows = payload.count;
    for (const record of payload.results) {
      const countyFips = acceptedOccurrenceRecord(record, target, countyLookup);
      if (!countyFips) {
        unresolvedRows += 1;
        continue;
      }

      acceptedRows += 1;
      coverage.countyFips.add(countyFips);
      coverage.occurrenceKeys.add(occurrenceKey(record));
    }

    if (payload.endOfRecords || payload.results.length === 0) {
      break;
    }

    offset += payload.results.length;
  }

  if (coverage.countyFips.size > 0) {
    console.log(
      `Loaded GBIF Alabama specimens for ${target.scientificName}: ${coverage.countyFips.size} counties from ${acceptedRows} accepted records (${totalRows} queried, ${unresolvedRows} skipped).`,
    );
  }

  return coverage;
}

async function main() {
  const generatedSpecies = readJsonFile<GeneratedSpecies[]>(GENERATED_SPECIES_PATH);
  const { countyIndex, lookup: countyLookup } = buildCountyLookup();
  const targetBySpeciesId = new Map<string, GeneratedSpecies>();

  for (const species of generatedSpecies) {
    targetBySpeciesId.set(speciesIdForCountySnapshot(species), species);
  }

  console.log(
    `Matching ${targetBySpeciesId.size} catalog species against the GBIF backbone.`,
  );

  const targets = (
    await mapPool([...targetBySpeciesId.values()], CONCURRENCY, async (species, index) => {
      const target = findGbifSpeciesKey(species);
      if ((index + 1) % 100 === 0) {
        console.log(`Matched ${index + 1}/${targetBySpeciesId.size} GBIF names.`);
      }
      return target;
    })
  ).filter((target): target is GbifImportTarget => Boolean(target));

  console.log(
    `Prepared ${targets.length} exact GBIF species targets for Alabama specimen import.`,
  );

  const coverageBySpecies = await mapPool(
    targets,
    CONCURRENCY,
    async (target, index) => {
      const coverage = loadGbifAlabamaCoverageForTarget(target, countyLookup);
      if ((index + 1) % 100 === 0) {
        console.log(`Checked ${index + 1}/${targets.length} GBIF occurrence targets.`);
      }
      return [target.speciesId, coverage] as const;
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

  const unmatchedSpeciesIds = [...targetBySpeciesId.keys()]
    .filter((speciesId) => !species.some((record) => record.speciesId === speciesId))
    .sort();

  const snapshot: CountyCoverageSnapshotFile = {
    source: "GBIF Alabama preserved specimen snapshot",
    citation: [
      "GBIF.org. 2026. GBIF occurrence search. Preserved specimen records for Alabama, United States. Available online at https://www.gbif.org/occurrence/search.",
    ],
    snapshotDate: new Date().toISOString(),
    species,
    unmatchedSpeciesIds,
    coverageSummary: {
      catalogSpeciesCount: targetBySpeciesId.size,
      mappedSpeciesCount: species.length,
      unmatchedSpeciesCount: unmatchedSpeciesIds.length,
      sourceSpeciesCounts: {
        "GBIF preserved specimen records": species.length,
      },
    },
  };

  const totalCountyRows = species.reduce(
    (total, record) => total + record.countyFips.length,
    0,
  );

  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Saved GBIF Alabama preserved specimen snapshot for ${species.length} species and ${totalCountyRows} county rows across ${Object.keys(countyIndex).length} Alabama counties to ${OUTPUT_PATH}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
