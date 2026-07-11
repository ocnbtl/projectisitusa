import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  NAS_ALABAMA_API_SUPPLEMENTS,
  NAS_ALABAMA_OCCURRENCE_API_BASE_URL,
  NAS_ALABAMA_OCCURRENCE_SOURCE_NAME,
} from "@/data/source/nas-alabama-api-supplements";
import { speciesSeed } from "@/data/source/species";
import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  CountyRecord,
  UsRiisSnapshotFile,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const LEGACY_SOURCE_NAME = "USGS NAS live collection pages";
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SOURCE_SNAPSHOT_PATH = resolve(
  process.cwd(),
  "src/data/source/usgs-nas-alabama-api-supplement-snapshot.json",
);
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");
const US_RIIS_PATH = resolve(process.cwd(), "src/data/source/usriis-snapshot.json");

type NasOccurrence = {
  key?: number;
  scientificName?: string;
  state?: string;
  county?: string;
  locality?: string;
  date?: string;
  year?: number;
  status?: string;
  recordType?: string;
};

type NasOccurrenceSearchResponse = {
  count?: number;
  results?: NasOccurrence[];
};

type AcceptedRecord = {
  occurrenceKey: number | null;
  countyFips: string;
  countyName: string;
  locality: string;
  date: string;
  year: number | null;
  status: string;
  recordType: string;
};

type SkippedRecord = {
  occurrenceKey: number | null;
  countyName: string;
  locality: string;
  status: string;
  reason: string;
};

type ImportedCoverage = {
  scientificName: string;
  targetSpeciesId: string;
  nasSpeciesId: number;
  apiResultCount: number;
  records: AcceptedRecord[];
  skippedRecords: SkippedRecord[];
  countyFips: Set<string>;
  sourceUrl: string;
};

type NasApiSupplementSnapshot = {
  source: typeof NAS_ALABAMA_OCCURRENCE_SOURCE_NAME;
  citation: string[];
  accessedAt: string;
  endpoint: typeof NAS_ALABAMA_OCCURRENCE_API_BASE_URL;
  targetScientificNames: string[];
  filters: {
    state: "Alabama";
    county: "explicit named Alabama county resolving to one county FIPS";
    status: "failed rows skipped; Blue Tilapia restricted to established rows";
    locality: "explicit Florida locality contradiction skipped";
    evidenceScope: "occurrence or collection evidence only";
  };
  caveats: string[];
  species: Array<{
    speciesId: string;
    scientificName: string;
    nasSpeciesId: number;
    apiResultCount: number;
    acceptedRecordCount: number;
    skippedRecordCount: number;
    countyFips: string[];
    sourceUrl: string;
    records: AcceptedRecord[];
    skippedRecords: SkippedRecord[];
  }>;
  summary: {
    targetSpeciesCount: number;
    importedSpeciesCount: number;
    apiResultCount: number;
    acceptedRecordCount: number;
    skippedRecordCount: number;
    countySpeciesPairs: number;
    netNewCountySpeciesPairs: number;
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
    .replace(/\b(county|parish|borough|census area|municipality|city and borough|city and county|city)\b/g, " ")
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

function buildCoverageSummary(
  records: CountyCoverageSpeciesSnapshot[],
  catalogSpeciesCount: number,
) {
  const mappedRecords = records.filter((record) => record.countyFips.length > 0);
  const sourceSpeciesCounts: CountyCoverageSnapshotFile["coverageSummary"]["sourceSpeciesCounts"] = {};

  for (const record of mappedRecords) {
    for (const sourceName of new Set(record.countyDataSources.map((source) => source.source))) {
      sourceSpeciesCounts[sourceName] = (sourceSpeciesCounts[sourceName] ?? 0) + 1;
    }
  }

  return {
    catalogSpeciesCount,
    mappedSpeciesCount: mappedRecords.length,
    unmatchedSpeciesCount: Math.max(0, catalogSpeciesCount - mappedRecords.length),
    sourceSpeciesCounts,
  };
}

function buildAlabamaCountyLookup(counties: Record<string, CountyRecord>) {
  const lookup = new Map<string, string>();
  for (const county of Object.values(counties)) {
    if (county.stateCode === "AL") {
      lookup.set(normalizeCountyName(county.name), county.countyFips);
    }
  }
  return lookup;
}

function buildTargetLookup(usRiis: UsRiisSnapshotFile) {
  const curatedByScientificName = new Map(
    speciesSeed.map((species) => [canonicalScientificName(species.scientificName), species]),
  );
  const targets = new Map<string, { scientificName: string; speciesId: string }>();

  for (const record of usRiis.species) {
    const curated = curatedByScientificName.get(canonicalScientificName(record.scientificName));
    targets.set(canonicalScientificName(record.scientificName), {
      scientificName: record.scientificName,
      speciesId: curated?.id ?? record.occurrenceId,
    });
  }

  for (const species of speciesSeed) {
    const key = canonicalScientificName(species.scientificName);
    if (!targets.has(key)) {
      targets.set(key, { scientificName: species.scientificName, speciesId: species.id });
    }
  }

  return targets;
}

function collectImportedCoverage(
  counties: Record<string, CountyRecord>,
  usRiis: UsRiisSnapshotFile,
) {
  const countyLookup = buildAlabamaCountyLookup(counties);
  const targets = buildTargetLookup(usRiis);
  const imported = new Map<string, ImportedCoverage>();

  for (const supplement of NAS_ALABAMA_API_SUPPLEMENTS) {
    const target = targets.get(canonicalScientificName(supplement.scientificName));
    if (!target) {
      throw new Error(`Missing exact catalog target for NAS supplement ${supplement.scientificName}.`);
    }

    const sourceUrl = `${NAS_ALABAMA_OCCURRENCE_API_BASE_URL}?species_ID=${supplement.speciesId}&state=AL`;
    const response = curlJson<NasOccurrenceSearchResponse>(sourceUrl);
    const records: AcceptedRecord[] = [];
    const skippedRecords: SkippedRecord[] = [];
    const countyFips = new Set<string>();

    for (const row of response.results ?? []) {
      const state = (row.state ?? "").trim().toLowerCase();
      const countyName = (row.county ?? "").trim();
      const locality = (row.locality ?? "").trim();
      const status = (row.status ?? "").trim().toLowerCase();
      const skip = (reason: string) => {
        skippedRecords.push({
          occurrenceKey: row.key ?? null,
          countyName,
          locality,
          status,
          reason,
        });
      };

      if (state !== "alabama" || !countyName) {
        skip("No explicit Alabama county");
        continue;
      }
      if (status === "failed") {
        skip("NAS status is failed");
        continue;
      }
      if (supplement.allowedStatuses && !supplement.allowedStatuses.includes(status)) {
        skip("NAS status is outside the target's reviewed allowed statuses");
        continue;
      }
      if (supplement.excludedLocalityPatterns?.some((pattern) => pattern.test(locality))) {
        skip("Locality explicitly conflicts with the Alabama county assignment");
        continue;
      }

      const countyFipsValue = countyLookup.get(normalizeCountyName(countyName));
      if (!countyFipsValue) {
        skip("County name did not resolve to one Alabama county FIPS");
        continue;
      }

      records.push({
        occurrenceKey: row.key ?? null,
        countyFips: countyFipsValue,
        countyName,
        locality,
        date: row.date ?? "",
        year: row.year ?? null,
        status,
        recordType: row.recordType ?? "",
      });
      countyFips.add(countyFipsValue);
    }

    if (records.length > 0) {
      imported.set(target.speciesId, {
        scientificName: target.scientificName,
        targetSpeciesId: target.speciesId,
        nasSpeciesId: supplement.speciesId,
        apiResultCount: response.count ?? response.results?.length ?? 0,
        records,
        skippedRecords,
        countyFips,
        sourceUrl,
      });
    }
  }

  return imported;
}

async function main() {
  const counties = readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const usRiis = readJsonFile<UsRiisSnapshotFile>(US_RIIS_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const imported = collectImportedCoverage(counties, usRiis);
  const existingBySpeciesId = new Map(
    snapshot.species.map((record) => [record.speciesId, record]),
  );
  const outputRecords = new Map<string, CountyCoverageSpeciesSnapshot>();

  for (const record of snapshot.species) {
    outputRecords.set(record.speciesId, {
      ...record,
      countyDataSources: record.countyDataSources.filter(
        (source) =>
          source.source !== NAS_ALABAMA_OCCURRENCE_SOURCE_NAME && source.source !== LEGACY_SOURCE_NAME,
      ),
    });
  }

  let netNewCountySpeciesPairs = 0;
  for (const [speciesId, coverage] of imported) {
    const existing = existingBySpeciesId.get(speciesId);
    const countyFips = new Set(existing?.countyFips ?? []);
    for (const fips of coverage.countyFips) {
      if (!countyFips.has(fips)) {
        netNewCountySpeciesPairs += 1;
      }
      countyFips.add(fips);
    }

    outputRecords.set(speciesId, {
      speciesId,
      countyFips: [...countyFips].sort(),
      countyDataSources: uniqueSources([
        ...(existing?.countyDataSources ?? []).filter(
          (source) =>
            source.source !== NAS_ALABAMA_OCCURRENCE_SOURCE_NAME && source.source !== LEGACY_SOURCE_NAME,
        ),
        {
          source: NAS_ALABAMA_OCCURRENCE_SOURCE_NAME,
          matchType: "scientific-exact",
          externalId: `SpeciesID ${coverage.nasSpeciesId}; ${coverage.records.length} accepted records across ${coverage.countyFips.size} Alabama counties`,
          url: coverage.sourceUrl,
        },
      ]),
    });
  }

  const records = [...outputRecords.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const citationLine =
    "U.S. Geological Survey. 2026. Nonindigenous Aquatic Species Database occurrence API for targeted Alabama ANS reconciliation gaps. Available online at https://nas.er.usgs.gov/api/v2/occurrence/search.";
  const citation = [
    ...snapshot.citation.filter(
      (entry) =>
        !entry.includes("Nonindigenous Aquatic Species Database live collection pages") &&
        !entry.includes("Nonindigenous Aquatic Species Database occurrence API"),
    ),
    citationLine,
  ];
  const nextSnapshot: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation,
    snapshotDate: new Date().toISOString(),
    species: records,
    coverageSummary: buildCoverageSummary(records, snapshot.coverageSummary.catalogSpeciesCount),
  };

  const sourceSnapshot: NasApiSupplementSnapshot = {
    source: NAS_ALABAMA_OCCURRENCE_SOURCE_NAME,
    citation: [citationLine],
    accessedAt: nextSnapshot.snapshotDate,
    endpoint: NAS_ALABAMA_OCCURRENCE_API_BASE_URL,
    targetScientificNames: NAS_ALABAMA_API_SUPPLEMENTS.map(
      (supplement) => supplement.scientificName,
    ),
    filters: {
      state: "Alabama",
      county: "explicit named Alabama county resolving to one county FIPS",
      status: "failed rows skipped; Blue Tilapia restricted to established rows",
      locality: "explicit Florida locality contradiction skipped",
      evidenceScope: "occurrence or collection evidence only",
    },
    caveats: [
      "An accepted NAS record verifies an occurrence or collection at the named county, not countywide distribution, abundance, invasive impact, a complete inventory, absence, or non-detection.",
      "NAS warns that its data vary in accuracy, scale, completeness, extent of coverage, and origin. This bounded supplement therefore excludes failed records and the reviewed Florida locality contradiction.",
      "Status values other than failed are retained only as occurrence evidence, except Blue Tilapia which is restricted to NAS established or locally established rows.",
    ],
    species: [...imported.values()]
      .map((coverage) => ({
        speciesId: coverage.targetSpeciesId,
        scientificName: coverage.scientificName,
        nasSpeciesId: coverage.nasSpeciesId,
        apiResultCount: coverage.apiResultCount,
        acceptedRecordCount: coverage.records.length,
        skippedRecordCount: coverage.skippedRecords.length,
        countyFips: [...coverage.countyFips].sort(),
        sourceUrl: coverage.sourceUrl,
        records: [...coverage.records].sort((left, right) =>
          `${left.countyFips}:${left.occurrenceKey}`.localeCompare(
            `${right.countyFips}:${right.occurrenceKey}`,
          ),
        ),
        skippedRecords: [...coverage.skippedRecords].sort((left, right) =>
          `${left.reason}:${left.occurrenceKey}`.localeCompare(`${right.reason}:${right.occurrenceKey}`),
        ),
      }))
      .sort((left, right) => left.scientificName.localeCompare(right.scientificName)),
    summary: {
      targetSpeciesCount: NAS_ALABAMA_API_SUPPLEMENTS.length,
      importedSpeciesCount: imported.size,
      apiResultCount: [...imported.values()].reduce(
        (total, coverage) => total + coverage.apiResultCount,
        0,
      ),
      acceptedRecordCount: [...imported.values()].reduce(
        (total, coverage) => total + coverage.records.length,
        0,
      ),
      skippedRecordCount: [...imported.values()].reduce(
        (total, coverage) => total + coverage.skippedRecords.length,
        0,
      ),
      countySpeciesPairs: [...imported.values()].reduce(
        (total, coverage) => total + coverage.countyFips.size,
        0,
      ),
      netNewCountySpeciesPairs,
    },
  };

  await Promise.all([
    writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(nextSnapshot, null, 2)}\n`),
    writeFile(SOURCE_SNAPSHOT_PATH, `${JSON.stringify(sourceSnapshot, null, 2)}\n`),
  ]);

  console.log(
    `Reviewed ${NAS_ALABAMA_API_SUPPLEMENTS.length} exact NAS API targets; imported ${imported.size} species.`,
  );
  console.log(
    `Accepted ${sourceSnapshot.summary.acceptedRecordCount} API records and ${sourceSnapshot.summary.countySpeciesPairs} Alabama county-species source pairs; ${sourceSnapshot.summary.skippedRecordCount} records skipped.`,
  );
  console.log(
    `Added ${netNewCountySpeciesPairs} county-species pairs beyond the current merged source snapshot.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
