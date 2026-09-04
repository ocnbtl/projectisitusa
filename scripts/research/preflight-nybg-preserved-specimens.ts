import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { once } from "node:events";

import { parse } from "csv-parse";

import countyRegistryJson from "@/data/research/county-equivalent-registry.json";
import stateRegistryJson from "@/data/research/state-registry.json";
import { resolveCountyEquivalent } from "@/lib/research/geography-registry";

import { listZipEntries, readZipEntry, spawnZipEntry } from "./zip-tools";

type CatalogSpecies = { id: string; scientificName: string; category: string };
type CountyProjection = {
  stateCode: string;
  countyFips: string;
  pairs: Array<{ speciesId: string; displayStatus: string }>;
};
type SourceRow = Record<string, string>;
type AcceptedRecord = {
  recordId: string;
  occurrenceId: string;
  countyFips: string;
  stateCode: string;
  sourceState: string;
  sourceCounty: string;
  speciesId: string;
  scientificName: string;
  eventDate: string;
  year: number;
  institutionCode: string;
  collectionCode: string;
  catalogNumber: string;
  rightsHolder: string;
  references: string;
};

const ROOT = process.cwd();
const SOURCE_ID = "nybg-preserved-specimens";
const DATASET_URL = "https://sweetgum.nybg.org:8443/ipt/archive.do?r=occurrences";
const METADATA_URL = "https://sweetgum.nybg.org:8443/ipt/eml.do?r=occurrences";
const POLICY_URL = "https://sweetgum.nybg.org/science/digital-collections/";
const CC0_LEGALCODE = "http://creativecommons.org/publicdomain/zero/1.0/legalcode";
const MAX_YEAR = 2026;
const CULTIVATED_OR_CAPTIVE_PATTERN =
  /\b(captive|captivity|cultivated|cultivation|cultured|garden|greenhouse|managed|nursery|planted|planting|arboretum|botanical garden|campus landscape|landscaped|zoo|aquarium)\b/iu;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalizedText(value: string | undefined) {
  return (value ?? "").normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

function parseArguments(argv: string[]) {
  const archiveIndex = argv.indexOf("--archive");
  const outputIndex = argv.indexOf("--output");
  const archive = argv[archiveIndex + 1];
  const output = argv[outputIndex + 1];
  assert(archiveIndex >= 0 && archive, "--archive is required.");
  assert(outputIndex >= 0 && output, "--output is required.");
  return { archive: path.resolve(archive), output: path.resolve(output) };
}

function readJson<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function validEventYear(row: SourceRow) {
  const eventDate = row.eventDate?.trim() ?? "";
  const yearText = row.year?.trim() ?? "";
  const eventMatch = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/u.exec(eventDate);
  const eventYear = eventMatch ? Number(eventMatch[1]) : null;
  const explicitYear = /^\d{4}$/u.test(yearText) ? Number(yearText) : null;
  const year = eventYear ?? explicitYear;
  if (year === null || year < 1500 || year > MAX_YEAR) return null;
  if (eventYear !== null && explicitYear !== null && eventYear !== explicitYear) return null;
  if (eventMatch?.[2] && (Number(eventMatch[2]) < 1 || Number(eventMatch[2]) > 12)) return null;
  if (eventMatch?.[3] && (Number(eventMatch[3]) < 1 || Number(eventMatch[3]) > 31)) return null;
  return year;
}

function normalizedCountyName(value: string | undefined) {
  return (value ?? "").trim().replace(/\s+Co\.?$/iu, " County");
}

async function main() {
  const startedAt = Date.now();
  const { archive, output } = parseArguments(process.argv.slice(2));
  const entries = listZipEntries(archive);
  for (const expected of ["occurrence.txt", "meta.xml", "eml.xml"]) {
    assert(entries.includes(expected), `Archive is missing ${expected}.`);
  }

  const eml = readZipEntry(archive, "eml.xml", 2 * 1024 * 1024);
  assert(eml.toString("utf8").includes(CC0_LEGALCODE), "NYBG EML does not contain the required CC0 dedication.");

  const catalog = readJson<CatalogSpecies[]>(path.join(ROOT, "src/data/generated/species.json"));
  const catalogGroups = new Map<string, CatalogSpecies[]>();
  for (const species of catalog) {
    const key = normalizedText(species.scientificName);
    if (key.split(" ").length !== 2) continue;
    catalogGroups.set(key, [...(catalogGroups.get(key) ?? []), species]);
  }
  const exactCatalog = new Map(
    [...catalogGroups.entries()]
      .filter(([name, matches]) => name && matches.length === 1)
      .map(([name, matches]) => [name, matches[0]]),
  );
  const ambiguousCatalogNames = new Set(
    [...catalogGroups.entries()].filter(([, matches]) => matches.length !== 1).map(([name]) => name),
  );

  const stateByName = new Map<string, string>();
  for (const state of (stateRegistryJson as {
    jurisdictions: Array<{ stateCode: string; stateName: string; nationalV1Scope: boolean; sourceStateNames: Record<string, string> }>;
  }).jurisdictions.filter((entry) => entry.nationalV1Scope)) {
    for (const name of [state.stateName, ...Object.values(state.sourceStateNames)]) {
      stateByName.set(normalizedText(name), state.stateCode);
    }
  }

  const rejectionCounts: Record<string, number> = {};
  const geographyRejectionCounts = new Map<string, number>();
  const reject = (reason: string) => {
    rejectionCounts[reason] = (rejectionCounts[reason] ?? 0) + 1;
  };
  const sourceTaxa = new Set<string>();
  const exactCatalogTaxa = new Set<string>();
  const acceptedPairByOccurrenceId = new Map<string, string>();
  const representativeByPair = new Map<string, AcceptedRecord>();
  let sourceRows = 0;
  let acceptedUniqueRecords = 0;
  let occurrenceBytes = 0;
  const occurrenceHash = createHash("sha256");

  const unzip = spawnZipEntry(archive, "occurrence.txt");
  let unzipError = "";
  unzip.stderr.setEncoding("utf8");
  unzip.stderr.on("data", (chunk: string) => { unzipError += chunk; });
  unzip.stdout.on("data", (chunk: Buffer) => {
    occurrenceBytes += chunk.length;
    occurrenceHash.update(chunk);
  });
  const closePromise = once(unzip, "close") as Promise<[number | null, NodeJS.Signals | null]>;
  const parser = unzip.stdout.pipe(parse({
    bom: true,
    columns: true,
    delimiter: "\t",
    quote: null,
    relax_column_count: true,
    skip_empty_lines: true,
  }));

  for await (const raw of parser) {
    const row = raw as SourceRow;
    sourceRows += 1;
    const sourceName = normalizedText(`${row.genus ?? ""} ${row.specificEpithet ?? ""}`);
    if (sourceName) sourceTaxa.add(sourceName);
    if (normalizedText(row.basisOfRecord).replace(/[^a-z]/gu, "") !== "preservedspecimen") {
      reject("basis-not-preserved-specimen");
      continue;
    }
    const country = normalizedText(row.country);
    if (!["united states", "united states of america", "u.s.a.", "usa"].includes(country)) {
      reject("country-not-us");
      continue;
    }
    const stateCode = stateByName.get(normalizedText(row.stateProvince));
    if (!stateCode) {
      reject("state-unresolved");
      continue;
    }
    const recordId = row.id?.trim();
    const occurrenceId = row.occurrenceID?.trim();
    if (!recordId || !occurrenceId) {
      reject("stable-record-identity-missing");
      continue;
    }
    if (normalizedText(row.taxonRank) !== "species" || normalizedText(row.identificationQualifier)) {
      reject("taxon-rank-or-qualifier-invalid");
      continue;
    }
    if (ambiguousCatalogNames.has(sourceName)) {
      reject("catalog-name-ambiguous");
      continue;
    }
    const species = exactCatalog.get(sourceName);
    if (!species || species.category !== "plants") {
      reject("taxon-not-exact-catalog-plant");
      continue;
    }
    exactCatalogTaxa.add(sourceName);
    const eventYear = validEventYear(row);
    if (eventYear === null) {
      reject("event-date-invalid");
      continue;
    }
    const sourceCounty = normalizedCountyName(row.county);
    const geography = resolveCountyEquivalent({ stateCode, countyName: sourceCounty, sourceId: SOURCE_ID });
    if (geography.status !== "resolved") {
      reject(`county-${geography.reasonCode}`);
      const geographyKey = `${stateCode}\t${row.county?.trim() || "<missing>"}\t${geography.reasonCode}`;
      geographyRejectionCounts.set(geographyKey, (geographyRejectionCounts.get(geographyKey) ?? 0) + 1);
      continue;
    }
    const cultivationText = [row.locality, row.occurrenceRemarks, row.habitat, row.establishmentMeans].filter(Boolean).join(" ");
    if (CULTIVATED_OR_CAPTIVE_PATTERN.test(cultivationText)) {
      reject("cultivated-or-captive-text");
      continue;
    }

    const pairKey = `${geography.county.countyFips}:${species.id}`;
    const priorPairKey = acceptedPairByOccurrenceId.get(occurrenceId);
    if (priorPairKey) {
      reject(priorPairKey === pairKey ? "duplicate-record-identity" : "duplicate-record-identity-conflict");
      continue;
    }
    acceptedPairByOccurrenceId.set(occurrenceId, pairKey);
    acceptedUniqueRecords += 1;
    if (!representativeByPair.has(pairKey)) {
      representativeByPair.set(pairKey, {
        recordId,
        occurrenceId,
        countyFips: geography.county.countyFips,
        stateCode,
        sourceState: row.stateProvince.trim(),
        sourceCounty: row.county.trim(),
        speciesId: species.id,
        scientificName: species.scientificName,
        eventDate: row.eventDate?.trim() || String(eventYear),
        year: eventYear,
        institutionCode: row.institutionCode?.trim() || "",
        collectionCode: row.collectionCode?.trim() || "",
        catalogNumber: row.catalogNumber?.trim() || "",
        rightsHolder: row.rightsHolder?.trim() || "",
        references: row.references?.trim() || "",
      });
    }
  }
  const [exitCode, signal] = await closePromise;
  assert(exitCode === 0, `Archive extraction failed (${exitCode ?? signal}): ${unzipError.trim()}`);
  assert((rejectionCounts["duplicate-record-identity-conflict"] ?? 0) === 0, "Conflicting duplicate occurrence identities were found.");

  const grossPairs = [...representativeByPair.keys()].sort(compareText);
  const presentOverlaps: string[] = [];
  const absentConflicts: string[] = [];
  const netEligiblePairs: string[] = [];
  const byState = new Map<string, { gross: number; presentOverlap: number; absentConflict: number; netEligible: number }>();
  const bySpecies = new Map<string, { scientificName: string; gross: number; presentOverlap: number; absentConflict: number; netEligible: number }>();
  const candidateCounties = [...new Set(grossPairs.map((key) => key.slice(0, 5)))].sort(compareText);
  const statusByPair = new Map<string, string>();
  for (const countyFips of candidateCounties) {
    const county = (countyRegistryJson as { countyEquivalents: Array<{ countyFips: string; stateCode: string }> }).countyEquivalents.find(
      (entry) => entry.countyFips === countyFips,
    );
    assert(county, `Missing active county ${countyFips}.`);
    const shard = readJson<CountyProjection>(path.join(ROOT, "public/generated/research", county.stateCode, "counties", `${countyFips}.json`));
    assert(shard.countyFips === countyFips && shard.stateCode === county.stateCode, `Projection identity differs for ${countyFips}.`);
    for (const pair of shard.pairs) {
      if (pair.displayStatus === "verified-present" || pair.displayStatus === "verified-absent") {
        statusByPair.set(`${countyFips}:${pair.speciesId}`, pair.displayStatus);
      }
    }
  }
  for (const pairKey of grossPairs) {
    const record = representativeByPair.get(pairKey);
    assert(record, `Missing representative record for ${pairKey}.`);
    const status = statusByPair.get(pairKey);
    if (status === "verified-present") presentOverlaps.push(pairKey);
    else if (status === "verified-absent") absentConflicts.push(pairKey);
    else netEligiblePairs.push(pairKey);
    const stateCounts = byState.get(record.stateCode) ?? { gross: 0, presentOverlap: 0, absentConflict: 0, netEligible: 0 };
    stateCounts.gross += 1;
    if (status === "verified-present") stateCounts.presentOverlap += 1;
    else if (status === "verified-absent") stateCounts.absentConflict += 1;
    else stateCounts.netEligible += 1;
    byState.set(record.stateCode, stateCounts);
    const speciesCounts = bySpecies.get(record.speciesId) ?? { scientificName: record.scientificName, gross: 0, presentOverlap: 0, absentConflict: 0, netEligible: 0 };
    speciesCounts.gross += 1;
    if (status === "verified-present") speciesCounts.presentOverlap += 1;
    else if (status === "verified-absent") speciesCounts.absentConflict += 1;
    else speciesCounts.netEligible += 1;
    bySpecies.set(record.speciesId, speciesCounts);
  }

  const meta = readZipEntry(archive, "meta.xml", 2 * 1024 * 1024);
  const result = {
    schemaVersion: 1,
    kind: "isitusa-source-yield-preflight",
    sourceId: SOURCE_ID,
    evaluatedAt: new Date().toISOString(),
    datasetIdentity: {
      url: DATASET_URL,
      metadataUrl: METADATA_URL,
      policyUrl: POLICY_URL,
      version: "1.103",
      publicationDate: "2026-08-25",
      archiveBytes: statSync(archive).size,
      archiveSha256: await sha256File(archive),
      occurrenceBytes,
      occurrenceSha256: occurrenceHash.digest("hex"),
      metaBytes: meta.length,
      metaSha256: sha256(meta),
      emlBytes: eml.length,
      emlSha256: sha256(eml),
    },
    baseline: {
      commit: process.env.ISITUSA_BASELINE_COMMIT ?? null,
      determinedPairSetSha256: process.env.ISITUSA_BASELINE_PAIR_SET_SHA256 ?? null,
    },
    semantics: {
      assertion: "recorded-present",
      basisOfRecord: "PreservedSpecimen",
      rights: "The versioned archive EML dedicates the complete occurrence dataset to CC0 1.0.",
      taxonomy: "Unique exact canonical binomial catalog plant match with source rank species and no identification qualifier.",
      geography: "Exact active county-equivalent alias inside an explicit national-v1 US jurisdiction; coordinates are not used.",
      cultivation: "Rows matching the conservative cultivated/captive text pattern in locality, occurrenceRemarks, habitat, or establishmentMeans are rejected.",
      negativeSemantics: "Source silence and rejected rows create no absence or non-detection assertion.",
    },
    counts: {
      sourceRows,
      sourceTaxa: sourceTaxa.size,
      exactCatalogTaxa: exactCatalogTaxa.size,
      acceptedUniqueRecords,
      grossUniqueCountySpeciesPairs: grossPairs.length,
      existingVerifiedPresentOverlaps: presentOverlaps.length,
      verifiedAbsentConflicts: absentConflicts.length,
      sameSourceSnapshotCompletedOverlaps: 0,
      priorPlanOverlaps: 0,
      withinPlanDuplicates: acceptedUniqueRecords - grossPairs.length,
      netEligiblePairs: netEligiblePairs.length,
    },
    pairHashes: {
      gross: sha256(grossPairs.join("\n")),
      presentOverlap: sha256(presentOverlaps.join("\n")),
      absentConflict: sha256(absentConflicts.join("\n")),
      netEligible: sha256(netEligiblePairs.join("\n")),
    },
    rejectionCounts: Object.fromEntries(Object.entries(rejectionCounts).sort(([left], [right]) => compareText(left, right))),
    topGeographyRejections: [...geographyRejectionCounts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((left, right) => right.count - left.count || compareText(left.key, right.key))
      .slice(0, 200),
    states: Object.fromEntries([...byState.entries()].sort(([left], [right]) => compareText(left, right))),
    topSpecies: [...bySpecies.entries()]
      .map(([speciesId, counts]) => ({ speciesId, ...counts }))
      .sort((left, right) => right.netEligible - left.netEligible || compareText(left.speciesId, right.speciesId))
      .slice(0, 100),
    netEligiblePairs,
    representativeRecords: Object.fromEntries(netEligiblePairs.map((pairKey) => [pairKey, representativeByPair.get(pairKey)])),
    elapsedMs: Date.now() - startedAt,
  };
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({
    sourceRows: result.counts.sourceRows,
    acceptedUniqueRecords: result.counts.acceptedUniqueRecords,
    grossPairs: result.counts.grossUniqueCountySpeciesPairs,
    presentOverlaps: result.counts.existingVerifiedPresentOverlaps,
    absentConflicts: result.counts.verifiedAbsentConflicts,
    netEligiblePairs: result.counts.netEligiblePairs,
    elapsedMs: result.elapsedMs,
    output,
  }, null, 2));
}

void main();
