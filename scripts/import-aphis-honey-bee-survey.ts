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
const SOURCE_NAME = "APHIS National Honey Bee Survey";
const SOURCE_URL = "https://www.usbeedata.org/state_reports/public_download/";
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

type AphisHoneyBeeSurveyRow = {
  sample_year?: string;
  state_code?: string;
  sampling_county_from_gps?: string;
  varroa_per_100_bees?: string;
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
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

function extractDownloadUrl(html: string) {
  const hrefMatch = html.match(
    /href=["']([^"']*UploadCSVFile_[^"']+)["'][^>]*>\s*Download\s*</i,
  );
  const rawUrl = hrefMatch?.[1];
  if (!rawUrl) {
    throw new Error("APHIS Honey Bee Survey page did not expose a CSV download link.");
  }

  return decodeHtmlEntities(rawUrl);
}

function downloadRows() {
  const pageHtml = execFileSync(
    "curl",
    ["-sL", "--max-time", "45", "-A", USER_AGENT, SOURCE_URL],
    { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
  );
  const csvUrl = extractDownloadUrl(pageHtml);
  const csvText = execFileSync(
    "curl",
    ["-sL", "--max-time", "120", "-A", USER_AGENT, csvUrl],
    { encoding: "utf8", maxBuffer: 25 * 1024 * 1024 },
  );
  const lines = csvText.split(/\r?\n/);

  return {
    generatedLine: lines[0]?.trim() ?? "",
    coverageLine: lines[1]?.trim() ?? "",
    rows: parseSync(lines.slice(2).join("\n"), {
      columns: true,
      skip_empty_lines: true,
    }) as AphisHoneyBeeSurveyRow[],
  };
}

function buildCountyLookup(counties: Record<string, CountyRecord>) {
  const lookup = new Map<string, string>();

  for (const county of Object.values(counties)) {
    if (county.stateCode !== "AL") continue;
    lookup.set(normalizeCountyName(county.name), county.countyFips);
  }

  return lookup;
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

async function main() {
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const counties = readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const countyPresenceIdByGeneratedId = new Map(
    species.map((record) => [record.id, countyPresenceSpeciesId(record)]),
  );
  const validCountyPresenceIds = new Set(countyPresenceIdByGeneratedId.values());
  const varroaSpecies = species.find(
    (record) => record.scientificName.toLowerCase() === "varroa destructor",
  );
  if (!varroaSpecies) {
    throw new Error("Could not find Varroa destructor in generated species.");
  }
  const speciesId = countyPresenceSpeciesId(varroaSpecies);
  const countyLookup = buildCountyLookup(counties);
  const { generatedLine, coverageLine, rows } = downloadRows();
  const countyFips = new Set<string>();
  const unresolvedCountyNames = new Set<string>();
  let positiveRows = 0;
  let zeroRows = 0;
  let skippedRows = 0;

  for (const row of rows) {
    if (row.state_code !== "AL") continue;

    const countyName = row.sampling_county_from_gps?.trim();
    const rawVarroaCount = row.varroa_per_100_bees?.trim();
    if (!countyName || !rawVarroaCount) {
      skippedRows += 1;
      continue;
    }

    const varroaCount = Number(rawVarroaCount);
    if (!Number.isFinite(varroaCount)) {
      skippedRows += 1;
      continue;
    }

    if (varroaCount === 0) {
      zeroRows += 1;
      continue;
    }

    if (varroaCount < 0) {
      skippedRows += 1;
      continue;
    }

    const resolvedFips = countyLookup.get(normalizeCountyName(countyName));
    if (!resolvedFips) {
      unresolvedCountyNames.add(countyName);
      skippedRows += 1;
      continue;
    }

    countyFips.add(resolvedFips);
    positiveRows += 1;
  }

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

  const existing = recordsBySpeciesId.get(speciesId);
  const beforeCountyCount = existing?.countyFips.length ?? 0;
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
        externalId: "Varroa destructor",
        url: SOURCE_URL,
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
  const citation = snapshot.citation.includes(
    "USDA APHIS National Honey Bee Survey. 2026. Public county-resolved survey event data for honey bee samples, including Varroa mite counts per 100 bees. Available online at https://www.usbeedata.org/state_reports/public_download/.",
  )
    ? snapshot.citation
    : [
        ...snapshot.citation,
        "USDA APHIS National Honey Bee Survey. 2026. Public county-resolved survey event data for honey bee samples, including Varroa mite counts per 100 bees. Available online at https://www.usbeedata.org/state_reports/public_download/.",
      ];

  const merged: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation,
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds,
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(
    `Merged ${SOURCE_NAME} Varroa coverage: ${countyFips.size} Alabama counties from ${positiveRows} positive rows, ${Math.max(0, mergedCountyFips.size - beforeCountyCount)} net new counties for ${speciesId}.`,
  );
  console.log(
    `Skipped ${zeroRows} zero-count rows for presence and ${skippedRows} other rows. Source metadata: ${generatedLine} ${coverageLine}`.trim(),
  );
  if (unresolvedCountyNames.size > 0) {
    console.log(
      `Unresolved Alabama county values: ${[...unresolvedCountyNames].sort().join(", ")}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
