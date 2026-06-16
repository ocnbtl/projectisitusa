import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  CountyRecord,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "APHIS Federal Quarantine county layer";
const PROGRAM_NAME = "Citrus Greening (HLB)";
const SCIENTIFIC_NAME = "Liberibacter asiaticus";
const SERVICE_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1";
const QUERY_URL =
  `${SERVICE_URL}/query?where=Quarantine_State_Abbr%3D%27AL%27&outFields=Quarantine_County,Quarantine_Program,Quarantine_Status,Quarantine_County_FIPS&returnGeometry=false&f=json`;
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/aphis-hlb-alabama-quarantine-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

type ArcGisFeatureResponse = {
  features?: Array<{
    attributes?: {
      Quarantine_County?: string | null;
      Quarantine_Program?: string | null;
      Quarantine_Status?: string | null;
      Quarantine_County_FIPS?: string | null;
    };
  }>;
  error?: {
    code?: number;
    message?: string;
    details?: string[];
  };
};

type AcceptedRow = {
  countyName: string;
  countyFips: string;
  program: typeof PROGRAM_NAME;
  status: "Active Federal Quarantine";
};

type AphisHlbSnapshotFile = {
  source: typeof SOURCE_NAME;
  citation: string[];
  accessedAt: string;
  serviceUrl: typeof SERVICE_URL;
  queryUrl: typeof QUERY_URL;
  filters: {
    state: "AL";
    program: typeof PROGRAM_NAME;
    status: "Active Federal Quarantine";
    evidenceScope: "regulatory quarantine county";
  };
  caveats: string[];
  species: Array<{
    speciesId: string;
    scientificName: typeof SCIENTIFIC_NAME;
    commonName: string;
    acceptedRecordCount: number;
    countyFips: string[];
    records: AcceptedRow[];
  }>;
  summary: {
    reviewedProgramCount: 1;
    importedSpeciesCount: number;
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
    ["-sL", "--retry", "2", "--max-time", "90", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(response) as T;
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

function countyPresenceSpeciesId(record: Species) {
  return record.profileType === "registry" && record.registry?.occurrenceId
    ? record.registry.occurrenceId
    : record.id;
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

function isAlabamaCountyFips(value: string, counties: Record<string, CountyRecord>) {
  const county = counties[value];
  return county?.stateCode === "AL";
}

async function main() {
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const counties = readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const target = species.find(
    (record) => record.scientificName.toLowerCase() === SCIENTIFIC_NAME.toLowerCase(),
  );
  if (!target) {
    throw new Error(`Could not find ${SCIENTIFIC_NAME} in generated species.`);
  }

  const speciesId = countyPresenceSpeciesId(target);
  const validCountyPresenceIds = new Set(species.map(countyPresenceSpeciesId));
  const payload = curlJson<ArcGisFeatureResponse>(QUERY_URL);
  if (payload.error) {
    throw new Error(
      `APHIS query failed: ${payload.error.code ?? ""} ${payload.error.message ?? ""}`,
    );
  }

  const acceptedRows: AcceptedRow[] = [];
  let skippedRows = 0;
  for (const feature of payload.features ?? []) {
    const attributes = feature.attributes ?? {};
    const countyFips = attributes.Quarantine_County_FIPS?.trim() ?? "";
    const countyName = attributes.Quarantine_County?.trim() ?? "";
    const program = attributes.Quarantine_Program?.trim() ?? "";
    const status = attributes.Quarantine_Status?.trim() ?? "";

    if (
      program !== PROGRAM_NAME ||
      status !== "Active Federal Quarantine" ||
      !isAlabamaCountyFips(countyFips, counties)
    ) {
      skippedRows += 1;
      continue;
    }

    acceptedRows.push({
      countyName,
      countyFips,
      program: PROGRAM_NAME,
      status: "Active Federal Quarantine",
    });
  }

  const countyFips = [...new Set(acceptedRows.map((row) => row.countyFips))].sort();
  const recordsBySpeciesId = new Map<string, CountyCoverageSpeciesSnapshot>();
  for (const record of snapshot.species) {
    const generatedSpecies = species.find((candidate) => candidate.id === record.speciesId);
    const normalizedSpeciesId = validCountyPresenceIds.has(record.speciesId)
      ? record.speciesId
      : generatedSpecies
        ? countyPresenceSpeciesId(generatedSpecies)
        : record.speciesId;
    if (!validCountyPresenceIds.has(normalizedSpeciesId)) continue;
    recordsBySpeciesId.set(normalizedSpeciesId, {
      speciesId: normalizedSpeciesId,
      countyFips: [...new Set(record.countyFips)].sort(),
      countyDataSources: uniqueSources(
        record.countyDataSources.filter(
          (source) => !(source.source === SOURCE_NAME && source.externalId === SCIENTIFIC_NAME),
        ),
      ),
    });
  }

  const existing = recordsBySpeciesId.get(speciesId);
  const beforeCountyFips = new Set(existing?.countyFips ?? []);
  const mergedCountyFips = new Set(existing?.countyFips ?? []);
  for (const fips of countyFips) {
    mergedCountyFips.add(fips);
  }

  recordsBySpeciesId.set(speciesId, {
    speciesId,
    countyFips: [...mergedCountyFips].sort(),
    countyDataSources: uniqueSources([
      ...(existing?.countyDataSources ?? []),
      {
        source: SOURCE_NAME,
        matchType: "scientific-exact",
        externalId: SCIENTIFIC_NAME,
        url: SERVICE_URL,
      },
    ]),
  });

  const records = [...recordsBySpeciesId.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const mappedSpeciesIds = new Set(records.map((record) => record.speciesId));
  const unmatchedSpeciesIds = [...validCountyPresenceIds]
    .filter((candidateSpeciesId) => !mappedSpeciesIds.has(candidateSpeciesId))
    .sort();
  const citationLine =
    "USDA APHIS. 2026. PPQ federal quarantine county FeatureServer layer. Available online at https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1.";
  const citation = snapshot.citation.includes(citationLine)
    ? snapshot.citation
    : [...snapshot.citation, citationLine];

  const merged: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation,
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds,
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  const sourceSnapshot: AphisHlbSnapshotFile = {
    source: SOURCE_NAME,
    citation: [citationLine],
    accessedAt: merged.snapshotDate,
    serviceUrl: SERVICE_URL,
    queryUrl: QUERY_URL,
    filters: {
      state: "AL",
      program: PROGRAM_NAME,
      status: "Active Federal Quarantine",
      evidenceScope: "regulatory quarantine county",
    },
    caveats: [
      "APHIS quarantine rows are regulatory county evidence for the named program, not a specimen or lab result record.",
      "Rows are treated as verified-present support only for active Alabama county quarantine records with valid county FIPS.",
      "Missing APHIS rows are not interpreted as absence or non-detection.",
    ],
    species: [
      {
        speciesId,
        scientificName: SCIENTIFIC_NAME,
        commonName: target.commonName,
        acceptedRecordCount: acceptedRows.length,
        countyFips,
        records: acceptedRows.sort((left, right) => left.countyFips.localeCompare(right.countyFips)),
      },
    ],
    summary: {
      reviewedProgramCount: 1,
      importedSpeciesCount: countyFips.length > 0 ? 1 : 0,
      acceptedRecordCount: acceptedRows.length,
      countySpeciesPairs: countyFips.length,
    },
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  await writeFile(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`);

  const netNewCountyPairs = countyFips.filter((fips) => !beforeCountyFips.has(fips)).length;
  console.log(
    `Merged APHIS HLB quarantine coverage: ${countyFips.length} Alabama counties from ${acceptedRows.length} active rows, ${netNewCountyPairs} net new counties for ${speciesId}.`,
  );
  console.log(`Skipped ${skippedRows} non-HLB or non-active APHIS Alabama rows.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
