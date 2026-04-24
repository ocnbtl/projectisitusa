import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { createInterface } from "node:readline";

import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";

import { speciesSeed } from "@/data/source/species";
import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import type {
  CountyCoverageSnapshotFile,
  CountyDataSourceRef,
  CountyMatchType,
  CountyRecord,
  UsRiisSnapshotFile,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const EDDMAPS_SUBJECTS_URL =
  "https://api.bugwoodcloud.org/v2/occurrence/summary/subject?list=17";
const NAS_ARCHIVE_URL = "https://nas.er.usgs.gov/ipt/archive.do?r=nas&v=1.331";
const NAS_ARCHIVE_PATH = resolve("/tmp", "usgs-nas-dwca.zip");
const SERNEC_PORTAL_URL =
  "https://sernecportal.org/portal/collections/harvestparams.php";
const SERNEC_TABLE_URL =
  "https://sernecportal.org/portal/collections/listtabledisplay.php";
const AFC_COGONGRASS_SERVICE_URL =
  "https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise/Cogongrass/MapServer";
const AFC_COGONGRASS_COUNTY_QUERY_URL =
  "https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise/Cogongrass/MapServer/2/query?where=1%3D1&returnDistinctValues=true&returnGeometry=false&outFields=County&f=json";
const APHIS_EAB_SERVICE_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_EAB_Known_Infested_Counties_Feature_Layer_View/FeatureServer/9";
const APHIS_EAB_ALABAMA_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_EAB_Known_Infested_Counties_Feature_Layer_View/FeatureServer/9/query?where=STATE_NAME%3D%27Alabama%27&returnGeometry=false&outFields=NAME,STATE_NAME,FIPS,Year_txt&orderByFields=NAME&f=json";
const LAUREL_WILT_SERVICE_URL =
  "https://services2.arcgis.com/iXA1dC6ldRMKRwra/arcgis/rest/services/Laurel_WIlt_Disease_Distribution_Public_View/FeatureServer/1";
const LAUREL_WILT_ALABAMA_QUERY_URL =
  "https://services2.arcgis.com/iXA1dC6ldRMKRwra/arcgis/rest/services/Laurel_WIlt_Disease_Distribution_Public_View/FeatureServer/1/query?where=STATE_NAME%3D%27Alabama%27%20AND%20lw_detection_year%20IS%20NOT%20NULL&outFields=NAME,STATE_NAME,STATE_FIPS,CNTY_FIPS,FIPS,lw_detection_year,DetectionDate&orderByFields=FIPS&returnGeometry=false&f=json";
const OUTPUT_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const US_RIIS_PATH = resolve(
  process.cwd(),
  "src/data/source/usriis-snapshot.json",
);

type EddMapsSummaryResponse = {
  columns: string[];
  data: Array<[number, number, string, string]>;
};
type ImportTarget = {
  speciesId: string;
  scientificName: string;
  curatedSubjectId?: number;
};

type NasArchiveOccurrence = {
  countryCode?: string;
  stateProvince?: string;
  county?: string;
  scientificName?: string;
};

type SernecAlabamaTarget = {
  speciesId: string;
  scientificName: string;
};

type ArcGisDistinctValueResponse = {
  features?: Array<{
    attributes?: {
      County?: string;
    };
  }>;
};

type ArcGisFeatureResponse = {
  features?: Array<{
    attributes?: Record<string, string | number | null | undefined>;
  }>;
};

type CountyGeometry = {
  id: string;
  properties?: {
    name?: string;
  };
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function downloadFile(
  url: string,
  outputPath: string,
  options?: { reuseExisting?: boolean },
) {
  if (options?.reuseExisting && existsSync(outputPath) && statSync(outputPath).size > 0) {
    console.log(`Reusing cached download at ${outputPath}`);
    return;
  }

  execFileSync(
    "curl",
    ["-sL", "--max-time", "120", "-A", USER_AGENT, "-o", outputPath, url],
    {
      stdio: "inherit",
    },
  );
}

function canonicalScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const NAS_SCIENTIFIC_NAME_ALIASES: Record<string, string> = {
  "hydrilla verticillata verticillata": "hydrilla verticillata",
};

const SERNEC_ALABAMA_SPECIES_IDS = [
  "lonicera-japonica",
  "kudzu",
  "ligustrum-sinense",
  "albizia-julibrissin",
  "lygodium-japonicum",
  "triadica-sebifera",
  "imperata-cylindrica",
  "microstegium-vimineum",
  "rosa-multiflora",
  "nandina-domestica",
  "elaeagnus-umbellata",
  "lespedeza-cuneata",
  "melia-azedarach",
  "sorghum-halepense",
  "broussonetia-papyrifera",
  "wisteria-sinensis",
  "tree-of-heaven",
  "paulownia-tomentosa",
  "cyperus-rotundus",
  "allium-vineale",
  "pyrus-calleryana",
  "hedera-helix",
  "clematis-terniflora",
  "arthraxon-hispidus",
  "ligustrum-japonicum",
  "lespedeza-bicolor",
  "cynodon-dactylon",
  "morus-alba",
  "euonymus-fortunei",
  "miscanthus-sinensis",
] as const;

const AFC_COGONGRASS_COUNTY_ALIASES: Record<string, string> = {
  StClair: "St. Clair",
  "Saint Clair": "St. Clair",
};

const AFC_COGONGRASS_EXCLUDED_COUNTY_VALUES = new Set(["MS", "Forestry"]);

function resolveNasScientificName(value: string) {
  const normalized = canonicalScientificName(value);
  return NAS_SCIENTIFIC_NAME_ALIASES[normalized] ?? normalized;
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

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractSernecTable(html: string) {
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    throw new Error("SERNEC response did not contain a result table.");
  }

  const tableHtml = tableMatch[0];
  const headers = [...tableHtml.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) =>
    stripHtml(match[1]),
  );
  if (headers.length === 0) {
    throw new Error("SERNEC response did not expose table headers.");
  }

  const rows: string[][] = [];
  for (const rowMatch of tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
      stripHtml(match[1]),
    );
    if (cells.length > 0) {
      rows.push(cells);
    }
  }

  return { headers, rows };
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
    if (!stateCode || ["AK", "HI", "PR", "GU", "AS", "MP", "VI"].includes(stateCode)) {
      return;
    }

    const name = geometry.properties?.name ?? countyFeature.properties?.name ?? "Unknown";
    countyIndex[countyFips] = {
      countyFips,
      name,
      stateCode,
      stateName: STATE_FIPS_TO_INFO[countyFips.slice(0, 2)]?.name ?? stateCode,
      neighborFips: [],
      center: [0, 0],
    };

    const aliases = new Set([
      name,
      normalizeCountyName(name),
      `${normalizeCountyName(name)} county`,
    ]);

    if (name.toLowerCase().endsWith(" city")) {
      aliases.add(normalizeCountyName(name.replace(/ city$/i, "")));
    }

    for (const alias of aliases) {
      if (!alias) continue;
      const key = `${stateCode}:${alias}`;
      const list = lookup.get(key) ?? [];
      if (!list.includes(countyFips)) {
        list.push(countyFips);
      }
      lookup.set(key, list);
    }
  });

  return { countyIndex, lookup };
}

function resolveCountyFips(
  stateCode: string,
  countyName: string,
  countyLookup: Map<string, string[]>,
) {
  const normalized = normalizeCountyName(countyName);
  if (!normalized) return null;

  const matches = countyLookup.get(`${stateCode}:${normalized}`) ?? [];
  if (matches.length === 1) return matches[0];

  const withCounty = countyLookup.get(`${stateCode}:${normalized} county`) ?? [];
  if (withCounty.length === 1) return withCounty[0];

  return null;
}

function buildTargets(usRiis: UsRiisSnapshotFile): ImportTarget[] {
  const curatedByScientificName = new Map(
    speciesSeed.map((species) => [
      canonicalScientificName(species.scientificName),
      species,
    ]),
  );

  const targets = new Map<string, ImportTarget>();

  for (const record of usRiis.species) {
    const curated = curatedByScientificName.get(
      canonicalScientificName(record.scientificName),
    );
    const speciesId = curated?.id ?? record.occurrenceId;
    targets.set(speciesId, {
      speciesId,
      scientificName: record.scientificName,
      curatedSubjectId: curated?.eddMapsSubjectId,
    });
  }

  for (const species of speciesSeed) {
    if (!targets.has(species.id)) {
      targets.set(species.id, {
        speciesId: species.id,
        scientificName: species.scientificName,
        curatedSubjectId: species.eddMapsSubjectId,
      });
    }
  }

  return [...targets.values()];
}

function buildTargetLookup(targets: ImportTarget[]) {
  return new Map(
    targets.map((target) => [
      canonicalScientificName(target.scientificName),
      target,
    ]),
  );
}

type ImportedCountyCoverage = {
  countyFips: Set<string>;
  countyDataSources: CountyDataSourceRef[];
};

function requireTargetSpeciesId(
  targetLookup: Map<string, ImportTarget>,
  scientificName: string,
) {
  const target = targetLookup.get(canonicalScientificName(scientificName));
  if (!target) {
    throw new Error(`Missing county-import target for ${scientificName}.`);
  }

  return target.speciesId;
}

function parseArcGisCountyFips(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value)).padStart(5, "0");
  }

  if (typeof value !== "string") {
    return null;
  }

  const digitsOnly = value.trim().match(/^\d+$/)?.[0];
  if (!digitsOnly) {
    return null;
  }

  return digitsOnly.padStart(5, "0");
}

async function loadNasArchiveCountyCoverage(
  targetLookup: Map<string, ImportTarget>,
  countyLookup: Map<string, string[]>,
  lower48CountyFips: Set<string>,
) {
  downloadFile(NAS_ARCHIVE_URL, NAS_ARCHIVE_PATH, { reuseExisting: true });

  const unzipProcess = spawn("unzip", ["-p", NAS_ARCHIVE_PATH, "occurrence.txt"], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stderrLines: string[] = [];
  const stderr = createInterface({ input: unzipProcess.stderr });
  stderr.on("line", (line) => {
    stderrLines.push(line);
  });

  const parser = unzipProcess.stdout.pipe(
    parse({
      columns: true,
      delimiter: "\t",
      quote: false,
      relax_column_count: true,
      skip_empty_lines: true,
    }),
  ) as AsyncIterable<NasArchiveOccurrence>;

  const imported = new Map<string, ImportedCountyCoverage>();
  let matchedRows = 0;
  let aliasMatchedRows = 0;
  let unresolvedCountyRows = 0;

  for await (const row of parser) {
    if (row.countryCode !== "US" || !row.stateProvince || !row.county || !row.scientificName) {
      continue;
    }

    const stateCode = row.stateProvince.trim().toUpperCase();
    const resolvedScientificName = resolveNasScientificName(row.scientificName);
    const target = targetLookup.get(resolvedScientificName);
    if (!target) continue;

    const countyFipsMatch = resolveCountyFips(stateCode, row.county, countyLookup);
    if (!countyFipsMatch || !lower48CountyFips.has(countyFipsMatch)) {
      unresolvedCountyRows += 1;
      continue;
    }

    matchedRows += 1;
    if (resolvedScientificName !== canonicalScientificName(row.scientificName)) {
      aliasMatchedRows += 1;
    }

    const existing = imported.get(target.speciesId) ?? {
      countyFips: new Set<string>(),
      countyDataSources: [],
    };
    existing.countyFips.add(countyFipsMatch);
    imported.set(target.speciesId, existing);
  }

  const [exitCode] = (await once(unzipProcess, "close")) as [number];
  if (exitCode !== 0) {
    throw new Error(
      `USGS NAS archive extraction failed with code ${exitCode}: ${stderrLines.join("\n")}`,
    );
  }

  for (const [speciesId, coverage] of imported) {
    coverage.countyDataSources.push({
      source: "USGS NAS",
      matchType: "scientific-exact",
      externalId: speciesId,
      url: NAS_ARCHIVE_URL,
    });
  }

  console.log(
    `Loaded ${imported.size} species from the USGS NAS archive with ${matchedRows} matched county rows (${aliasMatchedRows} alias-matched, ${unresolvedCountyRows} unresolved county rows skipped).`,
  );

  return imported;
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

function buildSernecAlabamaTargets(targets: ImportTarget[]) {
  const targetsById = new Map(targets.map((target) => [target.speciesId, target]));

  return SERNEC_ALABAMA_SPECIES_IDS.flatMap((speciesId) => {
    const target = targetsById.get(speciesId);
    if (!target) {
      console.warn(`Skipped SERNEC Alabama supplement for missing target ${speciesId}.`);
      return [];
    }

    return [
      {
        speciesId: target.speciesId,
        scientificName: target.scientificName,
      } satisfies SernecAlabamaTarget,
    ];
  });
}

async function loadSernecAlabamaCountyCoverage(
  targets: ImportTarget[],
  countyLookup: Map<string, string[]>,
  lower48CountyFips: Set<string>,
) {
  const imported = new Map<string, ImportedCountyCoverage>();
  const sernecTargets = buildSernecAlabamaTargets(targets);
  let matchedRows = 0;
  let unresolvedCountyRows = 0;

  await mapPool(sernecTargets, 3, async (target) => {
    const html = execFileSync(
      "curl",
      [
        "-sL",
        "--max-time",
        "45",
        "-A",
        USER_AGENT,
        "-X",
        "POST",
        SERNEC_TABLE_URL,
        "--data-urlencode",
        `searchvar=db=all&state=Alabama&taxa=${target.scientificName}&taxontype=2&comingFrom=harvestparams`,
      ],
      { encoding: "utf8" },
    );

    const { headers, rows } = extractSernecTable(html);
    const stateIndex = headers.findIndex((header) =>
      header.toLowerCase().includes("state"),
    );
    const countyIndex = headers.findIndex((header) => header.toLowerCase() === "county");

    if (stateIndex === -1 || countyIndex === -1) {
      throw new Error(
        `SERNEC table format changed for ${target.scientificName}; could not find state/county columns.`,
      );
    }

    const coverage = imported.get(target.speciesId) ?? {
      countyFips: new Set<string>(),
      countyDataSources: [],
    };

    for (const row of rows) {
      const stateName = row[stateIndex]?.trim().toLowerCase();
      const countyName = row[countyIndex]?.trim();
      if (stateName !== "alabama" || !countyName) continue;

      const countyFips = resolveCountyFips("AL", countyName, countyLookup);
      if (!countyFips || !lower48CountyFips.has(countyFips)) {
        unresolvedCountyRows += 1;
        continue;
      }

      coverage.countyFips.add(countyFips);
      matchedRows += 1;
    }

    if (coverage.countyFips.size > 0) {
      coverage.countyDataSources.push({
        source: "SERNEC",
        matchType: "scientific-exact",
        externalId: target.scientificName,
        url: SERNEC_PORTAL_URL,
      });
      imported.set(target.speciesId, coverage);
    }

    console.log(
      `Loaded SERNEC Alabama coverage for ${target.scientificName}: ${coverage.countyFips.size} counties`,
    );
  });

  console.log(
    `Loaded ${imported.size} species from SERNEC Alabama specimen queries with ${matchedRows} matched county rows (${unresolvedCountyRows} unresolved county rows skipped).`,
  );

  return imported;
}

async function loadAfcCogongrassCountyCoverage(
  countyLookup: Map<string, string[]>,
  lower48CountyFips: Set<string>,
) {
  const response = execFileSync(
    "curl",
    ["-sL", "--max-time", "45", "-A", USER_AGENT, AFC_COGONGRASS_COUNTY_QUERY_URL],
    { encoding: "utf8" },
  );

  const payload = JSON.parse(response) as ArcGisDistinctValueResponse;
  const rawCountyValues = payload.features
    ?.map((feature) => feature.attributes?.County?.trim())
    .filter((value): value is string => Boolean(value)) ?? [];

  const countyFips = new Set<string>();
  const skippedValues = new Set<string>();

  for (const rawValue of rawCountyValues) {
    if (AFC_COGONGRASS_EXCLUDED_COUNTY_VALUES.has(rawValue)) {
      skippedValues.add(rawValue);
      continue;
    }

    const normalizedValue = AFC_COGONGRASS_COUNTY_ALIASES[rawValue] ?? rawValue;
    const resolved = resolveCountyFips("AL", normalizedValue, countyLookup);
    if (!resolved || !lower48CountyFips.has(resolved)) {
      skippedValues.add(rawValue);
      continue;
    }

    countyFips.add(resolved);
  }

  const imported = new Map<string, ImportedCountyCoverage>();
  if (countyFips.size > 0) {
    imported.set("imperata-cylindrica", {
      countyFips,
      countyDataSources: [
        {
          source: "Alabama Forestry Commission Cogongrass GIS",
          matchType: "scientific-exact",
          externalId: "Imperata cylindrica",
          url: AFC_COGONGRASS_SERVICE_URL,
        },
      ],
    });
  }

  console.log(
    `Loaded AFC cogongrass county coverage: ${countyFips.size} counties (${rawCountyValues.length} raw distinct values, ${skippedValues.size} skipped values).`,
  );

  if (skippedValues.size > 0) {
    console.log(
      `Skipped AFC cogongrass county values: ${[...skippedValues].sort().join(", ")}`,
    );
  }

  return imported;
}

async function loadAphisEabCountyCoverage(
  targetLookup: Map<string, ImportTarget>,
  countyLookup: Map<string, string[]>,
  lower48CountyFips: Set<string>,
) {
  const response = execFileSync(
    "curl",
    ["-sL", "--max-time", "45", "-A", USER_AGENT, APHIS_EAB_ALABAMA_QUERY_URL],
    { encoding: "utf8" },
  );

  const payload = JSON.parse(response) as ArcGisFeatureResponse;
  const speciesId = requireTargetSpeciesId(targetLookup, "Agrilus planipennis");
  const countyFips = new Set<string>();
  let unresolvedRows = 0;

  for (const feature of payload.features ?? []) {
    const attributes = feature.attributes ?? {};
    const countyName = typeof attributes.NAME === "string" ? attributes.NAME : null;
    const resolvedFips =
      parseArcGisCountyFips(attributes.FIPS) ??
      (countyName ? resolveCountyFips("AL", countyName, countyLookup) : null);

    if (!resolvedFips || !lower48CountyFips.has(resolvedFips)) {
      unresolvedRows += 1;
      continue;
    }

    countyFips.add(resolvedFips);
  }

  const imported = new Map<string, ImportedCountyCoverage>();
  if (countyFips.size > 0) {
    imported.set(speciesId, {
      countyFips,
      countyDataSources: [
        {
          source: "APHIS Emerald Ash Borer county layer",
          matchType: "scientific-exact",
          externalId: "Agrilus planipennis",
          url: APHIS_EAB_SERVICE_URL,
        },
      ],
    });
  }

  console.log(
    `Loaded APHIS emerald ash borer county coverage: ${countyFips.size} Alabama counties (${unresolvedRows} unresolved rows skipped).`,
  );

  return imported;
}

async function loadLaurelWiltCountyCoverage(
  targetLookup: Map<string, ImportTarget>,
  countyLookup: Map<string, string[]>,
  lower48CountyFips: Set<string>,
) {
  const response = execFileSync(
    "curl",
    ["-sL", "--max-time", "45", "-A", USER_AGENT, LAUREL_WILT_ALABAMA_QUERY_URL],
    { encoding: "utf8" },
  );

  const payload = JSON.parse(response) as ArcGisFeatureResponse;
  const speciesId = requireTargetSpeciesId(targetLookup, "Raffaelea lauricola");
  const countyFips = new Set<string>();
  let unresolvedRows = 0;

  for (const feature of payload.features ?? []) {
    const attributes = feature.attributes ?? {};
    const countyName = typeof attributes.NAME === "string" ? attributes.NAME : null;
    const resolvedFips =
      parseArcGisCountyFips(attributes.FIPS) ??
      (countyName ? resolveCountyFips("AL", countyName, countyLookup) : null);

    if (!resolvedFips || !lower48CountyFips.has(resolvedFips)) {
      unresolvedRows += 1;
      continue;
    }

    countyFips.add(resolvedFips);
  }

  const imported = new Map<string, ImportedCountyCoverage>();
  if (countyFips.size > 0) {
    imported.set(speciesId, {
      countyFips,
      countyDataSources: [
        {
          source: "Laurel Wilt public county layer",
          matchType: "scientific-exact",
          externalId: "Raffaelea lauricola",
          url: LAUREL_WILT_SERVICE_URL,
        },
      ],
    });
  }

  console.log(
    `Loaded laurel wilt county coverage: ${countyFips.size} Alabama counties (${unresolvedRows} unresolved rows skipped).`,
  );

  return imported;
}

async function main() {
  const usRiis = readJsonFile<UsRiisSnapshotFile>(US_RIIS_PATH);
  const targets = buildTargets(usRiis);
  const targetLookup = buildTargetLookup(targets);
  const { countyIndex, lookup: countyLookup } = buildCountyLookup();
  const lower48CountyFips = new Set(Object.keys(countyIndex));
  const existingSnapshot = readJsonFile<CountyCoverageSnapshotFile>(OUTPUT_PATH);
  const existingCoverageBySpeciesId = new Map(
    existingSnapshot.species.map((record) => [record.speciesId, record]),
  );

  const nasCountyCoverage = await loadNasArchiveCountyCoverage(
    targetLookup,
    countyLookup,
    lower48CountyFips,
  );
  const sernecCountyCoverage = await loadSernecAlabamaCountyCoverage(
    targets,
    countyLookup,
    lower48CountyFips,
  );
  const afcCogongrassCoverage = await loadAfcCogongrassCountyCoverage(
    countyLookup,
    lower48CountyFips,
  );
  const aphisEabCoverage = await loadAphisEabCountyCoverage(
    targetLookup,
    countyLookup,
    lower48CountyFips,
  );
  const laurelWiltCoverage = await loadLaurelWiltCountyCoverage(
    targetLookup,
    countyLookup,
    lower48CountyFips,
  );

  console.log(`Loaded ${targets.length} import targets.`);

  const importedSpecies = targets.map((target, index) => {
    const existingCoverage = existingCoverageBySpeciesId.get(target.speciesId);
    const countyFips = new Set<string>();
    const countyDataSources: CountyDataSourceRef[] = [
      ...((existingCoverage?.countyDataSources ?? []).filter(
        (source) =>
          ![
            "USGS NAS",
            "SERNEC",
            "Alabama Forestry Commission Cogongrass GIS",
            "APHIS Emerald Ash Borer county layer",
            "Laurel Wilt public county layer",
          ].includes(source.source),
      )),
    ];

    for (const fips of existingCoverage?.countyFips ?? []) {
      countyFips.add(fips);
    }

    const archiveCoverage = nasCountyCoverage.get(target.speciesId);
    if (archiveCoverage) {
      for (const fips of archiveCoverage.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(...archiveCoverage.countyDataSources);
    }

    const sernecCoverage = sernecCountyCoverage.get(target.speciesId);
    if (sernecCoverage) {
      for (const fips of sernecCoverage.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(...sernecCoverage.countyDataSources);
    }

    const afcCoverage = afcCogongrassCoverage.get(target.speciesId);
    if (afcCoverage) {
      for (const fips of afcCoverage.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(...afcCoverage.countyDataSources);
    }

    const eabCoverage = aphisEabCoverage.get(target.speciesId);
    if (eabCoverage) {
      for (const fips of eabCoverage.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(...eabCoverage.countyDataSources);
    }

    const laurelWiltCoverageForSpecies = laurelWiltCoverage.get(target.speciesId);
    if (laurelWiltCoverageForSpecies) {
      for (const fips of laurelWiltCoverageForSpecies.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(...laurelWiltCoverageForSpecies.countyDataSources);
    }

    const uniqueSources = countyDataSources.filter(
      (source, sourceIndex, sources) =>
        sources.findIndex(
          (candidate) =>
            candidate.source === source.source &&
            candidate.externalId === source.externalId,
        ) === sourceIndex,
    );

    console.log(
      `[${index + 1}/${targets.length}] ${target.scientificName}: ${countyFips.size} counties, ${uniqueSources.length} sources`,
    );

    return {
      speciesId: target.speciesId,
      countyFips: [...countyFips].sort(),
      countyDataSources: uniqueSources,
    };
  });

  const speciesWithCountyData = importedSpecies.filter(
    (record) => record.countyFips.length > 0,
  );
  const unmatchedSpeciesIds = targets
    .map((target) => target.speciesId)
    .filter(
      (speciesId) =>
        !speciesWithCountyData.some((record) => record.speciesId === speciesId),
    )
    .sort();

  const sourceSpeciesCounts: CountyCoverageSnapshotFile["coverageSummary"]["sourceSpeciesCounts"] =
    {};

  for (const species of speciesWithCountyData) {
    for (const source of species.countyDataSources) {
      sourceSpeciesCounts[source.source] =
        (sourceSpeciesCounts[source.source] ?? 0) + 1;
    }
  }

  const snapshot: CountyCoverageSnapshotFile = {
    source: "Merged county presence snapshot",
    citation: [
      "EDDMapS. 2026. Early Detection & Distribution Mapping System. The University of Georgia - Center for Invasive Species and Ecosystem Health. Available online at https://www.eddmaps.org/.",
      "U.S. Geological Survey. 2026. Nonindigenous Aquatic Species Database. Gainesville, Florida. Accessed 2026-04-14.",
      "SERNEC Portal. 2026. Public specimen search for Alabama county-level plant occurrence records. Available online at https://sernecportal.org/portal/collections/harvestparams.php.",
      "Alabama Forestry Commission. 2026. Cogongrass occurrence GIS service. Available online at https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise/Cogongrass/MapServer.",
      "USDA APHIS. 2026. Emerald ash borer known infested counties FeatureServer layer. Available online at https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_EAB_Known_Infested_Counties_Feature_Layer_View/FeatureServer/9.",
      "USDA Forest Service. 2026. Laurel wilt public county distribution FeatureServer layer. Available online at https://services2.arcgis.com/iXA1dC6ldRMKRwra/arcgis/rest/services/Laurel_WIlt_Disease_Distribution_Public_View/FeatureServer/1.",
    ],
    snapshotDate: new Date().toISOString(),
    species: speciesWithCountyData,
    unmatchedSpeciesIds,
    coverageSummary: {
      catalogSpeciesCount: targets.length,
      mappedSpeciesCount: speciesWithCountyData.length,
      unmatchedSpeciesCount: unmatchedSpeciesIds.length,
      sourceSpeciesCounts,
    },
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Saved merged county snapshot for ${speciesWithCountyData.length} species to ${OUTPUT_PATH}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
