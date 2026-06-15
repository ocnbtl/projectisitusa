import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse as parseSync } from "csv-parse/sync";

import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  CountyRecord,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "USDA Forest Service FIA DataMart invasive plant tables";
const DATAMART_URL = "https://apps.fs.usda.gov/fia/datamart/datamart.html";
const FIA_AL_INVASIVE_SUBPLOT_URL =
  "https://apps.fs.usda.gov/fia/datamart/CSV/AL_INVASIVE_SUBPLOT_SPP.csv";
const FIA_REF_PLANT_DICTIONARY_URL =
  "https://apps.fs.usda.gov/fia/datamart/CSV/REF_PLANT_DICTIONARY.csv";
const FIA_REF_INVASIVE_SPECIES_URL =
  "https://apps.fs.usda.gov/fia/datamart/CSV/REF_INVASIVE_SPECIES.csv";
const FIA_AL_INVASIVE_SUBPLOT_PATH = resolve("/tmp", "AL_INVASIVE_SUBPLOT_SPP.csv");
const FIA_REF_PLANT_DICTIONARY_PATH = resolve("/tmp", "REF_PLANT_DICTIONARY.csv");
const FIA_REF_INVASIVE_SPECIES_PATH = resolve("/tmp", "REF_INVASIVE_SPECIES.csv");
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

type FiaInvasiveSubplotRow = {
  STATECD?: string;
  COUNTYCD?: string;
  VEG_FLDSPCD?: string;
  VEG_SPCD?: string;
};

type FiaPlantDictionaryRow = {
  SYMBOL?: string;
  SCIENTIFIC_NAME?: string;
  NEW_SCIENTIFIC_NAME?: string;
};

type FiaInvasiveSpeciesRefRow = {
  STATECD?: string;
  SYMBOL?: string;
};

type ImportedCoverage = {
  scientificName: string;
  symbols: Set<string>;
  countyFips: Set<string>;
  rows: number;
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function downloadFile(url: string, outputPath: string) {
  execFileSync(
    "curl",
    ["-sL", "--max-time", "180", "-A", USER_AGENT, "-o", outputPath, url],
    { stdio: "inherit" },
  );
}

function parseCsvFile<T>(filePath: string) {
  return parseSync(readFileSync(filePath, "utf8"), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
  }) as T[];
}

function normalizeScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
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

function countyFipsFromFiaCountyCode(value: string | undefined) {
  if (!value) return null;
  const countyCode = Number.parseInt(value, 10);
  if (!Number.isFinite(countyCode) || countyCode <= 0) return null;
  return `01${String(countyCode).padStart(3, "0")}`;
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

function buildExactSymbolMatches(
  species: Species[],
  dictionaryRows: FiaPlantDictionaryRow[],
  invasiveRefRows: FiaInvasiveSpeciesRefRow[],
) {
  const speciesByScientificName = new Map(
    species.map((record) => [normalizeScientificName(record.scientificName), record]),
  );
  const alInvasiveSymbols = new Set(
    invasiveRefRows
      .filter((row) => row.STATECD === "1" && row.SYMBOL)
      .map((row) => row.SYMBOL as string),
  );
  const matchesBySymbol = new Map<
    string,
    Array<{ speciesId: string; scientificName: string }>
  >();

  for (const row of dictionaryRows) {
    const symbol = row.SYMBOL?.trim();
    if (!symbol || !alInvasiveSymbols.has(symbol)) continue;

    const scientificName = (row.NEW_SCIENTIFIC_NAME || row.SCIENTIFIC_NAME)?.trim();
    if (!scientificName) continue;

    const speciesRecord = speciesByScientificName.get(
      normalizeScientificName(scientificName),
    );
    if (!speciesRecord) continue;

    const existing = matchesBySymbol.get(symbol) ?? [];
    const speciesId = countyPresenceSpeciesId(speciesRecord);
    if (!existing.some((match) => match.speciesId === speciesId)) {
      existing.push({ speciesId, scientificName: speciesRecord.scientificName });
      matchesBySymbol.set(symbol, existing);
    }
  }

  return new Map(
    [...matchesBySymbol.entries()].filter(([, matches]) => matches.length === 1),
  );
}

function collectImportedCoverage(
  species: Species[],
  counties: Record<string, CountyRecord>,
  invasiveRows: FiaInvasiveSubplotRow[],
  dictionaryRows: FiaPlantDictionaryRow[],
  invasiveRefRows: FiaInvasiveSpeciesRefRow[],
) {
  const validAlCountyFips = new Set(
    Object.values(counties)
      .filter((county) => county.stateCode === "AL")
      .map((county) => county.countyFips),
  );
  const exactSymbolMatches = buildExactSymbolMatches(
    species,
    dictionaryRows,
    invasiveRefRows,
  );
  const imported = new Map<string, ImportedCoverage>();
  const reviewedSymbols = new Set<string>();
  const skippedSymbols = new Set<string>();
  let skippedRows = 0;

  for (const row of invasiveRows) {
    if (row.STATECD !== "1") continue;

    const symbol = row.VEG_SPCD?.trim() || row.VEG_FLDSPCD?.trim();
    if (!symbol) {
      skippedRows += 1;
      continue;
    }
    reviewedSymbols.add(symbol);

    const matches = exactSymbolMatches.get(symbol);
    if (!matches || matches.length !== 1) {
      skippedSymbols.add(symbol);
      continue;
    }

    const countyFips = countyFipsFromFiaCountyCode(row.COUNTYCD);
    if (!countyFips || !validAlCountyFips.has(countyFips)) {
      skippedRows += 1;
      continue;
    }

    const match = matches[0];
    const coverage = imported.get(match.speciesId) ?? {
      scientificName: match.scientificName,
      symbols: new Set<string>(),
      countyFips: new Set<string>(),
      rows: 0,
    };
    coverage.symbols.add(symbol);
    coverage.countyFips.add(countyFips);
    coverage.rows += 1;
    imported.set(match.speciesId, coverage);
  }

  return { imported, reviewedSymbols, skippedSymbols, skippedRows };
}

async function main() {
  downloadFile(FIA_AL_INVASIVE_SUBPLOT_URL, FIA_AL_INVASIVE_SUBPLOT_PATH);
  downloadFile(FIA_REF_PLANT_DICTIONARY_URL, FIA_REF_PLANT_DICTIONARY_PATH);
  downloadFile(FIA_REF_INVASIVE_SPECIES_URL, FIA_REF_INVASIVE_SPECIES_PATH);

  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const counties = readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const invasiveRows = parseCsvFile<FiaInvasiveSubplotRow>(
    FIA_AL_INVASIVE_SUBPLOT_PATH,
  );
  const dictionaryRows = parseCsvFile<FiaPlantDictionaryRow>(
    FIA_REF_PLANT_DICTIONARY_PATH,
  );
  const invasiveRefRows = parseCsvFile<FiaInvasiveSpeciesRefRow>(
    FIA_REF_INVASIVE_SPECIES_PATH,
  );
  const countyPresenceIdByGeneratedId = new Map(
    species.map((record) => [record.id, countyPresenceSpeciesId(record)]),
  );
  const validCountyPresenceIds = new Set(countyPresenceIdByGeneratedId.values());
  const { imported, reviewedSymbols, skippedSymbols, skippedRows } =
    collectImportedCoverage(
      species,
      counties,
      invasiveRows,
      dictionaryRows,
      invasiveRefRows,
    );

  const recordsBySpeciesId = new Map<string, CountyCoverageSpeciesSnapshot>();
  for (const record of snapshot.species) {
    const normalizedSpeciesId =
      countyPresenceIdByGeneratedId.get(record.speciesId) ?? record.speciesId;
    if (!validCountyPresenceIds.has(normalizedSpeciesId)) continue;
    recordsBySpeciesId.set(normalizedSpeciesId, {
      speciesId: normalizedSpeciesId,
      countyFips: [...new Set(record.countyFips)].sort(),
      countyDataSources: uniqueSources(
        record.countyDataSources.filter((source) => source.source !== SOURCE_NAME),
      ),
    });
  }

  const report = [];
  for (const [speciesId, coverage] of imported) {
    const existing = recordsBySpeciesId.get(speciesId);
    const beforeCountyCount = existing?.countyFips.length ?? 0;
    const mergedCountyFips = new Set(existing?.countyFips ?? []);
    for (const fips of coverage.countyFips) {
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
          externalId: `${[...coverage.symbols].sort().join(", ")} (${coverage.scientificName})`,
          url: DATAMART_URL,
        },
      ]),
    });

    report.push({
      speciesId,
      scientificName: coverage.scientificName,
      symbols: [...coverage.symbols].sort(),
      rows: coverage.rows,
      sourceCountyCount: coverage.countyFips.size,
      netNewCountyCount: Math.max(0, mergedCountyFips.size - beforeCountyCount),
    });
  }

  const records = [...recordsBySpeciesId.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const mappedSpeciesIds = new Set(records.map((record) => record.speciesId));
  const unmatchedSpeciesIds = [...validCountyPresenceIds]
    .filter((candidateSpeciesId) => !mappedSpeciesIds.has(candidateSpeciesId))
    .sort();
  const citationText =
    "USDA Forest Service Forest Inventory and Analysis. 2026. FIA DataMart Alabama invasive subplot species table, plant dictionary, and invasive species reference table. Available online at https://apps.fs.usda.gov/fia/datamart/datamart.html.";
  const citation = snapshot.citation.includes(citationText)
    ? snapshot.citation
    : [...snapshot.citation, citationText];

  const merged: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation,
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds,
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(merged, null, 2)}\n`);

  const netNewCount = report.reduce((total, item) => total + item.netNewCountyCount, 0);
  console.log(
    `Merged ${SOURCE_NAME} coverage for ${imported.size} exact catalog species from ${reviewedSymbols.size} reviewed FIA symbols.`,
  );
  console.log(
    `Skipped ${skippedSymbols.size} FIA symbols without exact current catalog species matches and ${skippedRows} malformed or unresolved rows.`,
  );
  console.log(`Added ${netNewCount} net new source-snapshot county-species pairs.`);
  for (const item of report.sort((left, right) =>
    left.scientificName.localeCompare(right.scientificName),
  )) {
    console.log(
      `${item.speciesId}: ${item.sourceCountyCount} source counties from ${item.rows} rows, ${item.netNewCountyCount} net new counties (${item.symbols.join(", ")}).`,
    );
  }
  if (skippedSymbols.size > 0) {
    console.log(`Skipped FIA symbols: ${[...skippedSymbols].sort().join(", ")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
