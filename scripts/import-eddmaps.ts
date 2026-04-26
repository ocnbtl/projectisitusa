import { execFile as execFileCallback, execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { speciesSeed } from "@/data/source/species";
import type { EddMapsSnapshotFile } from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const EDDMAPS_SUBJECTS_URL =
  "https://api.bugwoodcloud.org/v2/occurrence/summary/subject?list=17";
const execFile = promisify(execFileCallback);
const outputPath = resolve(
  process.cwd(),
  "src/data/source/eddmaps-snapshot.json",
);
const generatedSpeciesPath = resolve(
  process.cwd(),
  "src/data/generated/species.json",
);

type GeneratedSpecies = {
  id: string;
  scientificName: string;
  profileType?: string;
  registry?: {
    occurrenceId?: string;
  };
};

type EddMapsSummaryResponse = {
  lastupdated?: string;
  columns: string[];
  data: Array<[number, number, string, string]>;
};

type EddMapsPresenceResponse = {
  us?: Record<
    string,
    {
      reportCount?: number;
      negative?: number;
      id?: string;
    }
  >;
};

type EddMapsTarget = {
  speciesId: string;
  subjectId: number;
  scientificName: string;
  reportCount: number;
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function canonicalScientificName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function countyPresenceSpeciesId(record: GeneratedSpecies) {
  return record.profileType === "registry" && record.registry?.occurrenceId
    ? record.registry.occurrenceId
    : record.id;
}

function curlJson<T>(url: string, timeoutSeconds = "60") {
  const response = execFileSync(
    "curl",
    ["-sL", "--max-time", timeoutSeconds, "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  return JSON.parse(response) as T;
}

async function curlJsonAsync<T>(url: string, timeoutSeconds = "45", attempt = 1): Promise<T> {
  try {
    const { stdout } = await execFile(
      "curl",
      ["-sL", "--max-time", timeoutSeconds, "-A", USER_AGENT, url],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
    return JSON.parse(stdout) as T;
  } catch (error) {
    if (attempt < 2) {
      return curlJsonAsync<T>(url, timeoutSeconds, attempt + 1);
    }
    throw error;
  }
}

async function mapPool<T, R>(
  values: T[],
  concurrency: number,
  worker: (value: T, index: number) => Promise<R>,
) {
  const results: R[] = [];
  let cursor = 0;

  async function runNext() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => runNext()),
  );

  return results;
}

function buildTargets(summary: EddMapsSummaryResponse) {
  const species = readJsonFile<GeneratedSpecies[]>(generatedSpeciesPath);
  const catalogByScientificName = new Map<string, GeneratedSpecies[]>();

  for (const record of species) {
    const key = canonicalScientificName(record.scientificName);
    const records = catalogByScientificName.get(key) ?? [];
    records.push(record);
    catalogByScientificName.set(key, records);
  }

  const curatedSubjectIds = new Map(
    speciesSeed
      .filter((record) => typeof record.eddMapsSubjectId === "number")
      .map((record) => [record.id, record.eddMapsSubjectId as number]),
  );
  const summaryBySubjectId = new Map(
    summary.data.map((row) => [
      row[1],
      {
        reportCount: row[0],
        subjectId: row[1],
        commonName: row[2],
        scientificName: row[3],
      },
    ]),
  );
  const summaryByScientificName = new Map<
    string,
    Array<{
      reportCount: number;
      subjectId: number;
      commonName: string;
      scientificName: string;
    }>
  >();

  for (const row of summaryBySubjectId.values()) {
    if (!row.scientificName) continue;
    const key = canonicalScientificName(row.scientificName);
    const rows = summaryByScientificName.get(key) ?? [];
    rows.push(row);
    summaryByScientificName.set(key, rows);
  }

  const targets = new Map<string, EddMapsTarget>();
  let ambiguousCatalogNames = 0;
  let ambiguousSubjectNames = 0;
  let exactMatchedRows = 0;

  for (const [scientificName, summaryRows] of summaryByScientificName) {
    const catalogMatches = catalogByScientificName.get(scientificName) ?? [];
    if (catalogMatches.length === 0) continue;
    if (catalogMatches.length > 1) {
      ambiguousCatalogNames += 1;
      continue;
    }
    if (summaryRows.length > 1) {
      ambiguousSubjectNames += 1;
      continue;
    }

    const match = catalogMatches[0];
    const summaryRow = summaryRows[0];
    exactMatchedRows += 1;
    targets.set(countyPresenceSpeciesId(match), {
      speciesId: countyPresenceSpeciesId(match),
      subjectId: summaryRow.subjectId,
      scientificName: match.scientificName,
      reportCount: summaryRow.reportCount,
    });
  }

  for (const [speciesId, subjectId] of curatedSubjectIds) {
    const summaryRow = summaryBySubjectId.get(subjectId);
    const catalogRecord = species.find((record) => record.id === speciesId);
    if (!summaryRow || !catalogRecord) continue;
    targets.set(speciesId, {
      speciesId,
      subjectId,
      scientificName: catalogRecord.scientificName,
      reportCount: summaryRow.reportCount,
    });
  }

  console.log(
    `Prepared ${targets.size} EDDMapS county targets (${exactMatchedRows} exact summary matches, ${curatedSubjectIds.size} curated subject IDs, ${ambiguousCatalogNames} ambiguous catalog names, ${ambiguousSubjectNames} ambiguous EDDMapS names skipped).`,
  );

  return [...targets.values()].sort((a, b) => b.reportCount - a.reportCount);
}

async function main() {
  const summary = curlJson<EddMapsSummaryResponse>(EDDMAPS_SUBJECTS_URL);
  const targets = buildTargets(summary);

  const species = await mapPool(targets, 6, async (target, index) => {
    const payload = await curlJsonAsync<EddMapsPresenceResponse>(
      `https://maps.eddmaps.org/presence/data.cfm?sub=${target.subjectId}&countries=us`,
      "45",
    );
    const countyFips = [
      ...new Set(
        Object.entries(payload.us ?? {})
          .filter(([, value]) => (value.reportCount ?? 0) > 0 && value.negative !== 1)
          .map(([fips, value]) => (value.id ?? fips).trim().padStart(5, "0"))
          .filter((fips) => /^\d{5}$/.test(fips)),
      ),
    ].sort();

    if ((index + 1) % 100 === 0 || index === targets.length - 1) {
      console.log(`[${index + 1}/${targets.length}] ${target.scientificName}`);
    }

    return {
      speciesId: target.speciesId,
      subjectId: target.subjectId,
      countyFips,
    };
  });

  const snapshot: EddMapsSnapshotFile = {
    source: "EDDMaps county presence snapshot",
    citation:
      "EDDMapS. 2026. Early Detection & Distribution Mapping System. The University of Georgia - Center for Invasive Species and Ecosystem Health. Available online at https://www.eddmaps.org/.",
    snapshotDate: new Date().toISOString(),
    species: species.filter((record) => record.countyFips.length > 0),
  };

  const countyRows = snapshot.species.reduce(
    (total, record) => total + record.countyFips.length,
    0,
  );

  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(
    `Saved EDDMapS snapshot for ${snapshot.species.length} species and ${countyRows} county rows to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
