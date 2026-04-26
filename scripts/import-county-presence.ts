import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "csv-parse";
import { parse as parseSync } from "csv-parse/sync";
import { createInterface } from "node:readline";

import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";

import { speciesSeed } from "@/data/source/species";
import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import { stateSpeciesDenominators } from "@/data/source/state-species-denominators";
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
const AFPE_DATASET_URL = "https://purr.purdue.edu/publications/4479";
const AFPE_BUNDLE_URL =
  "https://purr.purdue.edu/publications/4479/serve/1?render=archive";
const AFPE_ARCHIVE_PATH = resolve("/tmp", "afpe-pest-2023-counties.zip");
const AFPE_COUNTIES_CSV_PATH =
  "10_4231_HWQF-V087/AFPE_PEST_2023_counties.csv";
const AFPE_DATA_DICTIONARY_CSV_PATH =
  "10_4231_HWQF-V087/AFPE_PEST_2023_counties_data_dictionary.csv";
const APHIS_FEDERAL_QUARANTINE_SERVICE_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1";
const APHIS_FEDERAL_QUARANTINE_ALABAMA_QUERY_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1/query?where=Quarantine_State_Abbr%3D%27AL%27&outFields=Quarantine_County,Quarantine_Program,Quarantine_Status,Quarantine_County_FIPS&returnGeometry=false&f=json";
const ALIPC_LIST_URL = "https://www.invasiveplantatlas.org/list.html?id=71";
const ALABAMA_PLANT_ATLAS_BASE_URL = "http://floraofalabama.org";
const ALABAMA_PLANT_ATLAS_SOURCE_URL = `${ALABAMA_PLANT_ATLAS_BASE_URL}/Default.aspx`;
const ALABAMA_PLANT_ATLAS_API_BASE_URL =
  "https://dev.alabama.plantatlas.usf.edu/api/services/app/PlantSpecies";
const ALIPC_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/state-denominator-snapshots/alipc-2012.json",
);
const OUTPUT_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const US_RIIS_PATH = resolve(
  process.cwd(),
  "src/data/source/usriis-snapshot.json",
);
const GBIF_ALABAMA_SPECIMEN_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/gbif-alabama-preserved-specimens-snapshot.json",
);
const IDIGBIO_ALABAMA_SPECIMEN_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/idigbio-alabama-preserved-specimens-snapshot.json",
);

type EddMapsSummaryResponse = {
  columns: string[];
  data: Array<[number, number, string, string]>;
};
type ImportTarget = {
  speciesId: string;
  scientificName: string;
  curatedSubjectId?: number;
  category?: string;
  kingdom?: string;
};

type AlipcSnapshotFile = {
  species: Array<{
    subjectId: number;
    commonName: string;
    scientificName: string;
  }>;
};

type EddMapsPresenceResponse = {
  us?: Record<string, unknown>;
};

type AlabamaPlantAtlasSearchResponse = {
  result?: Array<{
    id: number;
    text: string;
  }>;
};

type AlabamaPlantAtlasFipsResponse = {
  result?: string[];
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

type AfpeDataDictionaryRow = {
  field: string;
  Description: string;
};

type AfpeCountyRow = Record<string, string | undefined> & {
  STATE?: string;
  FIPS?: string;
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

function canonicalPlantAtlasScientificName(value: string) {
  return canonicalScientificName(value).replace(/×/g, "x");
}

function curlJson<T>(
  url: string,
  options: { method?: "GET" | "POST"; timeoutSeconds?: string } = {},
) {
  const args = [
    "-sL",
    "--max-time",
    options.timeoutSeconds ?? "45",
    "-A",
    USER_AGENT,
  ];

  if (options.method === "POST") {
    args.push("-X", "POST", "-H", "Content-Type: application/json", "--data", "{}");
  }

  args.push(url);

  const response = execFileSync("curl", args, { encoding: "utf8" });
  return JSON.parse(response) as T;
}

function unzipArchiveFile(archivePath: string, filePath: string) {
  return execFileSync("unzip", ["-p", archivePath, filePath], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
}

const TARGET_SCIENTIFIC_NAME_ALIASES: Record<string, string> = {
  "euphorbia esula": "euphorbia virgata",
};

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
const ALIPC_LIST_ID = "ALIPC-2012";
const AFPE_CODE_TO_SCIENTIFIC_NAME: Record<string, string> = {
  DCA12138: "Popillia japonica",
  DCA22023: "Cryphonectria parasitica",
  DCA21019: "Phytophthora cinnamomi",
  DCA24031: "Raffaelea lauricola",
  DCA25020: "Discula destructiva",
  DCA14079: "Icerya purchasi",
  DCA15087: "Agrilus planipennis",
  DCA14089: "Aspidiotus duplex",
  DCA24022: "Ophiostoma ulmi",
  DCA12216: "Homadaula albizziae",
  DCA15101: "Anarsia lineatella",
  DCA22053: "Ophiognomonia clavigignenti-juglandacearum",
  DCA17023: "Dryocosmus kuriphilus",
};
const APHIS_FEDERAL_QUARANTINE_PROGRAM_TO_SCIENTIFIC_NAME: Record<string, string> = {
  "Asian Citrus Psyllid": "Diaphorina citri",
  "Imported Fire Ant": "Solenopsis invicta",
  "Sweet Orange Scab": "Elsinoe australis",
};

function resolveNasScientificName(value: string) {
  const normalized = canonicalScientificName(value);
  return NAS_SCIENTIFIC_NAME_ALIASES[normalized] ?? normalized;
}

function resolveTargetScientificName(value: string) {
  const normalized = canonicalScientificName(value);
  return TARGET_SCIENTIFIC_NAME_ALIASES[normalized] ?? normalized;
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
      resolveTargetScientificName(record.scientificName),
    );
    const speciesId = curated?.id ?? record.occurrenceId;
    targets.set(speciesId, {
      speciesId,
      scientificName: record.scientificName,
      curatedSubjectId: curated?.eddMapsSubjectId,
      category: curated?.category,
      kingdom: record.kingdom,
    });
  }

  for (const species of speciesSeed) {
    if (!targets.has(species.id)) {
      targets.set(species.id, {
        speciesId: species.id,
        scientificName: species.scientificName,
        curatedSubjectId: species.eddMapsSubjectId,
        category: species.category,
      });
    }
  }

  return [...targets.values()];
}

function buildTargetLookup(targets: ImportTarget[]) {
  const lookup = new Map<string, ImportTarget>();

  for (const target of targets) {
    lookup.set(resolveTargetScientificName(target.scientificName), target);
  }

  for (const [aliasName, acceptedName] of Object.entries(TARGET_SCIENTIFIC_NAME_ALIASES)) {
    const target = lookup.get(acceptedName);
    if (target) {
      lookup.set(aliasName, target);
    }
  }

  return lookup;
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

function buildAlipcAlabamaTargets(targetLookup: Map<string, ImportTarget>) {
  const snapshot = readJsonFile<AlipcSnapshotFile>(ALIPC_SNAPSHOT_PATH);
  const snapshotByScientificName = new Map(
    snapshot.species.map((species) => [
      canonicalScientificName(species.scientificName),
      species,
    ]),
  );

  const seenSpeciesIds = new Set<string>();
  const targets: Array<ImportTarget & { subjectId: number; sourceCommonName: string }> = [];
  let ambiguousRows = 0;
  let unmatchedRows = 0;

  for (const entry of stateSpeciesDenominators.filter(
    (denominator) => denominator.stateCode === "AL" && denominator.listId === ALIPC_LIST_ID,
  )) {
    if (entry.scientificName.toLowerCase().includes("spp")) {
      ambiguousRows += 1;
      continue;
    }

    const candidateNames = [entry.scientificName, ...(entry.reviewedAliases ?? [])];
    const snapshotEntry = candidateNames
      .map((name) => snapshotByScientificName.get(canonicalScientificName(name)))
      .find((candidate): candidate is AlipcSnapshotFile["species"][number] => Boolean(candidate));
    const target = candidateNames
      .map((name) => targetLookup.get(canonicalScientificName(name)))
      .find((candidate): candidate is ImportTarget => Boolean(candidate));

    if (!snapshotEntry || !target) {
      unmatchedRows += 1;
      continue;
    }

    if (seenSpeciesIds.has(target.speciesId)) {
      continue;
    }

    seenSpeciesIds.add(target.speciesId);
    targets.push({
      ...target,
      subjectId: snapshotEntry.subjectId,
      sourceCommonName: snapshotEntry.commonName,
    });
  }

  console.log(
    `Prepared ${targets.length} ALIPC EDDMapS targets (${unmatchedRows} unmatched, ${ambiguousRows} ambiguous skipped).`,
  );

  return targets;
}

async function loadAlipcEddMapsAlabamaCountyCoverage(
  targetLookup: Map<string, ImportTarget>,
  lower48CountyFips: Set<string>,
) {
  const imported = new Map<string, ImportedCountyCoverage>();
  const targets = buildAlipcAlabamaTargets(targetLookup);
  let matchedCountyRows = 0;
  let skippedNonAlabamaRows = 0;

  await mapPool(targets, 4, async (target) => {
    const response = execFileSync(
      "curl",
      [
        "-sL",
        "--max-time",
        "45",
        "-A",
        USER_AGENT,
        `https://maps.eddmaps.org/presence/data.cfm?sub=${target.subjectId}&countries=us`,
      ],
      { encoding: "utf8" },
    );
    const payload = JSON.parse(response) as EddMapsPresenceResponse;
    const rawCountyFips = Object.keys(payload.us ?? {});
    const countyFips = [
      ...new Set(
        rawCountyFips
          .map((fips) => fips.padStart(5, "0"))
          .filter((fips) => fips.startsWith("01") && lower48CountyFips.has(fips)),
      ),
    ];

    skippedNonAlabamaRows += rawCountyFips.filter(
      (fips) => !fips.padStart(5, "0").startsWith("01"),
    ).length;
    matchedCountyRows += countyFips.length;

    if (countyFips.length === 0) {
      console.log(
        `Loaded ALIPC EDDMapS coverage for ${target.scientificName}: 0 Alabama counties`,
      );
      return;
    }

    imported.set(target.speciesId, {
      countyFips: new Set(countyFips),
      countyDataSources: [
        {
          source: "EDDMapS ALIPC list",
          matchType: "scientific-exact",
          externalId: String(target.subjectId),
          url: `${ALIPC_LIST_URL}#sub=${target.subjectId}`,
        },
      ],
    });

    console.log(
      `Loaded ALIPC EDDMapS coverage for ${target.scientificName}: ${countyFips.length} Alabama counties`,
    );
  });

  console.log(
    `Loaded ${imported.size} species from ALIPC EDDMapS Alabama coverage with ${matchedCountyRows} matched county rows (${skippedNonAlabamaRows} non-Alabama rows ignored).`,
  );

  return imported;
}

function buildAlabamaPlantAtlasTargets(
  targets: ImportTarget[],
  targetLookup: Map<string, ImportTarget>,
) {
  const seenSpeciesIds = new Set<string>();
  const plantTargets = new Map<string, ImportTarget & { queryNames: string[] }>();

  for (const target of targets) {
    if (target.kingdom !== "Plantae" && target.category !== "plants") {
      continue;
    }

    plantTargets.set(target.speciesId, {
      ...target,
      queryNames: [target.scientificName],
    });
  }

  for (const entry of stateSpeciesDenominators.filter(
    (denominator) => denominator.stateCode === "AL",
  )) {
    if (entry.scientificName.toLowerCase().includes("spp")) {
      continue;
    }

    const queryNames = [entry.scientificName, ...(entry.reviewedAliases ?? [])];
    const target = queryNames
      .map((name) => targetLookup.get(canonicalScientificName(name)))
      .find((candidate): candidate is ImportTarget => Boolean(candidate));

    if (!target || !plantTargets.has(target.speciesId)) {
      continue;
    }

    const plantTarget = plantTargets.get(target.speciesId)!;
    for (const queryName of queryNames) {
      if (!plantTarget.queryNames.includes(queryName)) {
        plantTarget.queryNames.push(queryName);
      }
    }
  }

  const atlasTargets = [...plantTargets.values()]
    .filter((target) => {
      if (seenSpeciesIds.has(target.speciesId)) {
        return false;
      }
      seenSpeciesIds.add(target.speciesId);
      return true;
    })
    .sort((left, right) => left.scientificName.localeCompare(right.scientificName));

  console.log(
    `Prepared ${atlasTargets.length} Alabama Plant Atlas catalog plant targets.`,
  );

  return atlasTargets;
}

function findAlabamaPlantAtlasExactMatch(queryName: string) {
  const payload = curlJson<AlabamaPlantAtlasSearchResponse>(
    `${ALABAMA_PLANT_ATLAS_API_BASE_URL}/SearchSciName?q=${encodeURIComponent(queryName)}`,
    { method: "POST" },
  );
  const expectedName = canonicalPlantAtlasScientificName(queryName);

  return (
    (payload.result ?? []).find(
      (entry) => canonicalPlantAtlasScientificName(entry.text) === expectedName,
    ) ?? null
  );
}

function loadAlabamaPlantAtlasCountyFips(
  plantId: number,
  lower48CountyFips: Set<string>,
) {
  const payload = curlJson<AlabamaPlantAtlasFipsResponse>(
    `${ALABAMA_PLANT_ATLAS_API_BASE_URL}/GetDistributionFIPSForSpecies?id=${plantId}`,
  );

  return [
    ...new Set(
      (payload.result ?? [])
        .map((fips) => fips.padStart(5, "0"))
        .filter((fips) => fips.startsWith("01") && lower48CountyFips.has(fips)),
    ),
  ].sort();
}

async function loadAlabamaPlantAtlasCountyCoverage(
  targets: ImportTarget[],
  targetLookup: Map<string, ImportTarget>,
  lower48CountyFips: Set<string>,
) {
  const imported = new Map<string, ImportedCountyCoverage>();
  const atlasTargets = buildAlabamaPlantAtlasTargets(targets, targetLookup);
  let matchedSpecies = 0;
  let matchedCountyRows = 0;
  let speciesWithoutExactMatch = 0;
  let speciesWithoutCountyFips = 0;

  await mapPool(atlasTargets, 4, async (target) => {
    let exactMatch: { id: number; text: string } | null = null;

    for (const queryName of target.queryNames) {
      exactMatch = findAlabamaPlantAtlasExactMatch(queryName);
      if (exactMatch) {
        break;
      }
    }

    if (!exactMatch) {
      speciesWithoutExactMatch += 1;
      return;
    }

    const countyFips = loadAlabamaPlantAtlasCountyFips(exactMatch.id, lower48CountyFips);
    matchedCountyRows += countyFips.length;

    if (countyFips.length === 0) {
      speciesWithoutCountyFips += 1;
      return;
    }

    matchedSpecies += 1;
    imported.set(target.speciesId, {
      countyFips: new Set(countyFips),
      countyDataSources: [
        {
          source: "Alabama Plant Atlas",
          matchType: "scientific-exact",
          externalId: String(exactMatch.id),
          url: `${ALABAMA_PLANT_ATLAS_BASE_URL}/Plant.aspx?id=${exactMatch.id}`,
        },
      ],
    });
  });

  console.log(
    `Loaded ${matchedSpecies} species from Alabama Plant Atlas county maps with ${matchedCountyRows} matched county rows (${speciesWithoutExactMatch} species without exact Plant Atlas matches, ${speciesWithoutCountyFips} exact matches without Alabama county FIPS).`,
  );

  return imported;
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

async function loadAlienForestPestExplorerCountyCoverage(
  targetLookup: Map<string, ImportTarget>,
  lower48CountyFips: Set<string>,
) {
  downloadFile(AFPE_BUNDLE_URL, AFPE_ARCHIVE_PATH, { reuseExisting: true });

  const dictionary = parseSync(
    unzipArchiveFile(AFPE_ARCHIVE_PATH, AFPE_DATA_DICTIONARY_CSV_PATH),
    { columns: true, bom: true, skip_empty_lines: true },
  ) as AfpeDataDictionaryRow[];
  const rows = parseSync(
    unzipArchiveFile(AFPE_ARCHIVE_PATH, AFPE_COUNTIES_CSV_PATH),
    { columns: true, bom: true, skip_empty_lines: true },
  ) as AfpeCountyRow[];
  const dictionaryByCode = new Map(
    dictionary
      .filter((row) => row.field.startsWith("DCA"))
      .map((row) => [row.field, row.Description]),
  );
  const alabamaRows = rows.filter((row) => row.STATE === "01");

  const imported = new Map<string, ImportedCountyCoverage>();
  let matchedCountyRows = 0;
  const skippedCodes: string[] = [];

  for (const [code, scientificName] of Object.entries(AFPE_CODE_TO_SCIENTIFIC_NAME)) {
    const target = targetLookup.get(canonicalScientificName(scientificName));
    if (!target) {
      skippedCodes.push(`${code} missing catalog target`);
      continue;
    }

    const sourceCommonName = dictionaryByCode.get(code);
    if (!sourceCommonName) {
      skippedCodes.push(`${code} missing AFPE dictionary row`);
      continue;
    }

    const countyFips = new Set(
      alabamaRows
        .filter((row) => row[code] === "1")
        .map((row) => row.FIPS?.padStart(5, "0") ?? "")
        .filter((fips) => fips.startsWith("01") && lower48CountyFips.has(fips)),
    );

    matchedCountyRows += countyFips.size;
    if (countyFips.size === 0) {
      continue;
    }

    imported.set(target.speciesId, {
      countyFips,
      countyDataSources: [
        {
          source: "USFS Alien Forest Pest Explorer",
          matchType: "scientific-exact",
          externalId: code,
          url: AFPE_DATASET_URL,
        },
      ],
    });

    console.log(
      `Loaded AFPE coverage for ${sourceCommonName} (${scientificName}): ${countyFips.size} Alabama counties`,
    );
  }

  console.log(
    `Loaded ${imported.size} species from Alien Forest Pest Explorer county detections with ${matchedCountyRows} matched Alabama county rows (${skippedCodes.length} skipped code mappings).`,
  );

  if (skippedCodes.length > 0) {
    console.log(`Skipped AFPE code mappings: ${skippedCodes.join(", ")}`);
  }

  return imported;
}

function loadGbifAlabamaPreservedSpecimenCoverage() {
  const imported = new Map<string, ImportedCountyCoverage>();
  if (!existsSync(GBIF_ALABAMA_SPECIMEN_SNAPSHOT_PATH)) {
    console.log("Skipped GBIF Alabama preserved specimen coverage: snapshot missing.");
    return imported;
  }

  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(
    GBIF_ALABAMA_SPECIMEN_SNAPSHOT_PATH,
  );
  let countyRows = 0;

  for (const record of snapshot.species) {
    const countyFips = new Set(record.countyFips);
    countyRows += countyFips.size;
    imported.set(record.speciesId, {
      countyFips,
      countyDataSources: record.countyDataSources,
    });
  }

  console.log(
    `Loaded ${imported.size} species from GBIF Alabama preserved specimen snapshot with ${countyRows} county rows.`,
  );

  return imported;
}

function loadIdigbioAlabamaPreservedSpecimenCoverage() {
  const imported = new Map<string, ImportedCountyCoverage>();
  if (!existsSync(IDIGBIO_ALABAMA_SPECIMEN_SNAPSHOT_PATH)) {
    console.log("Skipped iDigBio Alabama preserved specimen coverage: snapshot missing.");
    return imported;
  }

  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(
    IDIGBIO_ALABAMA_SPECIMEN_SNAPSHOT_PATH,
  );
  let countyRows = 0;

  for (const record of snapshot.species) {
    const countyFips = new Set(record.countyFips);
    countyRows += countyFips.size;
    imported.set(record.speciesId, {
      countyFips,
      countyDataSources: record.countyDataSources,
    });
  }

  console.log(
    `Loaded ${imported.size} species from iDigBio Alabama preserved specimen snapshot with ${countyRows} county rows.`,
  );

  return imported;
}

async function loadAphisFederalQuarantineCountyCoverage(
  targetLookup: Map<string, ImportTarget>,
  lower48CountyFips: Set<string>,
) {
  const response = execFileSync(
    "curl",
    [
      "-sL",
      "--max-time",
      "45",
      "-A",
      USER_AGENT,
      APHIS_FEDERAL_QUARANTINE_ALABAMA_QUERY_URL,
    ],
    { encoding: "utf8" },
  );

  const payload = JSON.parse(response) as ArcGisFeatureResponse;
  const imported = new Map<string, ImportedCountyCoverage>();
  let matchedCountyRows = 0;
  let skippedRows = 0;

  for (const feature of payload.features ?? []) {
    const attributes = feature.attributes ?? {};
    const status =
      typeof attributes.Quarantine_Status === "string"
        ? attributes.Quarantine_Status
        : "";
    const program =
      typeof attributes.Quarantine_Program === "string"
        ? attributes.Quarantine_Program
        : "";
    const scientificName =
      APHIS_FEDERAL_QUARANTINE_PROGRAM_TO_SCIENTIFIC_NAME[program];
    const target = scientificName
      ? targetLookup.get(canonicalScientificName(scientificName))
      : null;
    const countyFips = parseArcGisCountyFips(attributes.Quarantine_County_FIPS);

    if (
      !target ||
      !countyFips ||
      !lower48CountyFips.has(countyFips) ||
      !status.toLowerCase().includes("active")
    ) {
      skippedRows += 1;
      continue;
    }

    matchedCountyRows += 1;
    const existing = imported.get(target.speciesId) ?? {
      countyFips: new Set<string>(),
      countyDataSources: [
        {
          source: "APHIS Federal Quarantine county layer",
          matchType: "scientific-exact",
          externalId: scientificName,
          url: APHIS_FEDERAL_QUARANTINE_SERVICE_URL,
        },
      ],
    };
    existing.countyFips.add(countyFips);
    imported.set(target.speciesId, existing);
  }

  console.log(
    `Loaded ${imported.size} species from APHIS federal quarantine county rows with ${matchedCountyRows} Alabama county rows (${skippedRows} rows skipped).`,
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
  const alipcEddMapsCountyCoverage = await loadAlipcEddMapsAlabamaCountyCoverage(
    targetLookup,
    lower48CountyFips,
  );
  const alabamaPlantAtlasCountyCoverage = await loadAlabamaPlantAtlasCountyCoverage(
    targets,
    targetLookup,
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
  const alienForestPestExplorerCoverage =
    await loadAlienForestPestExplorerCountyCoverage(targetLookup, lower48CountyFips);
  const gbifAlabamaPreservedSpecimenCoverage =
    loadGbifAlabamaPreservedSpecimenCoverage();
  const idigbioAlabamaPreservedSpecimenCoverage =
    loadIdigbioAlabamaPreservedSpecimenCoverage();
  const aphisFederalQuarantineCoverage =
    await loadAphisFederalQuarantineCountyCoverage(targetLookup, lower48CountyFips);

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
            "EDDMapS ALIPC list",
            "Alabama Plant Atlas",
            "Alabama Forestry Commission Cogongrass GIS",
            "APHIS Emerald Ash Borer county layer",
            "Laurel Wilt public county layer",
            "USFS Alien Forest Pest Explorer",
            "GBIF preserved specimen records",
            "iDigBio preserved specimen records",
            "APHIS Federal Quarantine county layer",
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

    const alipcEddMapsCoverage = alipcEddMapsCountyCoverage.get(target.speciesId);
    if (alipcEddMapsCoverage) {
      for (const fips of alipcEddMapsCoverage.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(...alipcEddMapsCoverage.countyDataSources);
    }

    const alabamaPlantAtlasCoverage = alabamaPlantAtlasCountyCoverage.get(target.speciesId);
    if (alabamaPlantAtlasCoverage) {
      for (const fips of alabamaPlantAtlasCoverage.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(...alabamaPlantAtlasCoverage.countyDataSources);
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

    const alienForestPestExplorerCoverageForSpecies =
      alienForestPestExplorerCoverage.get(target.speciesId);
    if (alienForestPestExplorerCoverageForSpecies) {
      for (const fips of alienForestPestExplorerCoverageForSpecies.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(
        ...alienForestPestExplorerCoverageForSpecies.countyDataSources,
      );
    }

    const gbifAlabamaPreservedSpecimenCoverageForSpecies =
      gbifAlabamaPreservedSpecimenCoverage.get(target.speciesId);
    if (gbifAlabamaPreservedSpecimenCoverageForSpecies) {
      for (const fips of gbifAlabamaPreservedSpecimenCoverageForSpecies.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(
        ...gbifAlabamaPreservedSpecimenCoverageForSpecies.countyDataSources,
      );
    }

    const idigbioAlabamaPreservedSpecimenCoverageForSpecies =
      idigbioAlabamaPreservedSpecimenCoverage.get(target.speciesId);
    if (idigbioAlabamaPreservedSpecimenCoverageForSpecies) {
      for (const fips of idigbioAlabamaPreservedSpecimenCoverageForSpecies.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(
        ...idigbioAlabamaPreservedSpecimenCoverageForSpecies.countyDataSources,
      );
    }

    const aphisFederalQuarantineCoverageForSpecies =
      aphisFederalQuarantineCoverage.get(target.speciesId);
    if (aphisFederalQuarantineCoverageForSpecies) {
      for (const fips of aphisFederalQuarantineCoverageForSpecies.countyFips) {
        countyFips.add(fips);
      }
      countyDataSources.push(
        ...aphisFederalQuarantineCoverageForSpecies.countyDataSources,
      );
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
      "Alabama Invasive Plant Council. 2012. List of Alabama's invasive plants by land-use and water-use categories, mirrored by Invasive Plant Atlas of the United States. EDDMapS county presence queried by subject ID from https://www.invasiveplantatlas.org/list.html?id=71.",
      "Alabama Plant Atlas. 2026. County distribution maps based on vouchered Alabama Herbarium Consortium specimens. Available online at http://floraofalabama.org/.",
      "Alabama Forestry Commission. 2026. Cogongrass occurrence GIS service. Available online at https://gis.forestry.alabama.gov/arcgis/rest/services/AFCEnterprise/Cogongrass/MapServer.",
      "USDA APHIS. 2026. Emerald ash borer known infested counties FeatureServer layer. Available online at https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_EAB_Known_Infested_Counties_Feature_Layer_View/FeatureServer/9.",
      "USDA Forest Service. 2026. Laurel wilt public county distribution FeatureServer layer. Available online at https://services2.arcgis.com/iXA1dC6ldRMKRwra/arcgis/rest/services/Laurel_WIlt_Disease_Distribution_Public_View/FeatureServer/1.",
      "Fei, S.; Morin, R.; Li, Y.; Kong, N. N.; Crocker, S.; Krist, F.; Liebhold, A.; Grong, K. A. 2024. Alien Forest Pest Detection by Counties in the United States. Purdue University Research Repository. doi:10.4231/HWQF-V087.",
      "GBIF.org. 2026. GBIF occurrence search. Preserved specimen records for Alabama, United States. Available online at https://www.gbif.org/occurrence/search.",
      "iDigBio. 2026. iDigBio Search API. Preserved specimen records for Alabama, United States. Available online at https://search.idigbio.org/v2/search/records.",
      "USDA APHIS. 2026. PPQ federal quarantine county FeatureServer layer. Available online at https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1.",
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
