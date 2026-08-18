import { once } from "node:events";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Transform } from "node:stream";

import { parse } from "csv-parse";

import type { SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import {
  getStateDefinition,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";

import {
  candidateGeography,
  candidateTaxon,
  makeGbifAssertionAndReview,
  makeGbifOutcome,
  makeGbifRejection,
  occurrenceRejection,
  recordLocator,
  sourceRecordId,
  type GbifMatch,
  type GbifOccurrenceRecord,
  type GbifRequestedPair,
} from "./adapters/gbif-preserved-specimens";
import {
  compareText,
  sha256,
  type GbifNationalTaxon,
  type NationalGbifDownloadPlan,
} from "./national-gbif-download";
import { listZipEntries, readZipEntry, spawnZipEntry } from "./zip-tools";

const REQUIRED_OCCURRENCE_FIELDS = [
  "gbifID",
  "datasetKey",
  "basisOfRecord",
  "occurrenceStatus",
  "countryCode",
  "stateProvince",
  "county",
  "scientificName",
  "taxonRank",
  "taxonKey",
  "acceptedTaxonKey",
  "speciesKey",
  "locality",
  "occurrenceRemarks",
  "habitat",
  "establishmentMeans",
  "degreeOfEstablishment",
  "preparations",
] as const;
const REQUIRED_VERBATIM_FIELDS = [
  "gbifID",
  "countryCode",
  "stateProvince",
  "county",
  "locality",
] as const;
const MAX_DWCA_RECORD_BYTES = 4 * 1024 * 1024;
const MAX_DWCA_TABLE_BYTES = 2 * 1024 * 1024 * 1024;

type RawDwcaRecord = Record<string, string>;

type StateReplayInput = {
  context: SourceAdapterContext;
  requestedPairs: GbifRequestedPair[];
};

type SelectedRecord = {
  record: GbifOccurrenceRecord;
  match: GbifMatch;
};

type RejectionAggregate = {
  record: GbifOccurrenceRecord;
  pair: GbifRequestedPair;
  match: GbifMatch;
  reason: ReturnType<typeof occurrenceRejection> extends infer T
    ? Exclude<T, null>
    : never;
  count: number;
  targetCountyFips: string | null;
};

type StateWork = {
  input: StateReplayInput;
  pairByKey: Map<string, GbifRequestedPair>;
  firstPairBySpecies: Map<string, GbifRequestedPair>;
  selectedByPair: Map<string, SelectedRecord>;
  rejectionByGroup: Map<string, RejectionAggregate>;
  candidateRecords: number;
  overlapRecords: number;
};

export type GbifArchiveInspection = {
  entries: string[];
  metaSha256: string;
  occurrenceHeaderSha256: string;
  verbatimHeaderSha256: string;
  occurrenceRows: number;
  verbatimRows: number;
  uniqueOccurrenceIds: number;
};

export type NationalGbifReplay = {
  inspection: GbifArchiveInspection;
  resultsByState: Map<string, SourceAdapterResult>;
  reconciliation: {
    providerTotalRecords: number;
    occurrenceRows: number;
    verbatimRows: number;
    uniqueOccurrenceIds: number;
    selectedScopeRows: number;
    overlapRows: number;
    taxonomyRejectedRows: number;
    geographyRejectedRows: number;
    selectedEvidencePairs: number;
    selectedNoEvidencePairs: number;
    selectedPairCount: number;
    assertionEvents: number;
    reviewEvents: number;
    representativeRejections: number;
    duplicateRecords: number;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function canonicalText(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function pairKey(value: { countyFips: string; speciesId: string }) {
  return `${value.countyFips}:${value.speciesId}`;
}

function parseInteger(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseNumber(value: string | undefined) {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value: string | undefined) {
  if (!value?.trim()) return undefined;
  if (value.toLocaleLowerCase("en-US") === "true") return true;
  if (value.toLocaleLowerCase("en-US") === "false") return false;
  throw new Error(`GBIF boolean field contains invalid value ${JSON.stringify(value)}.`);
}

function parseRequiredBoolean(value: string | undefined, label: string) {
  const parsed = parseBoolean(value);
  assert(parsed !== undefined, `GBIF required boolean field ${label} is blank.`);
  return parsed;
}

function splitIssues(value: string | undefined) {
  return value?.split(/[;,|]/gu).map((entry) => entry.trim()).filter(Boolean) ?? [];
}

function occurrenceRecord(raw: RawDwcaRecord): GbifOccurrenceRecord {
  return {
    key: parseInteger(raw.key),
    gbifID: raw.gbifID || undefined,
    datasetKey: raw.datasetKey || undefined,
    occurrenceID: raw.occurrenceID || undefined,
    basisOfRecord: raw.basisOfRecord || undefined,
    occurrenceStatus: raw.occurrenceStatus || undefined,
    country: raw.country || undefined,
    countryCode: raw.countryCode || undefined,
    stateProvince: raw.stateProvince || undefined,
    county: raw.county || undefined,
    verbatimStateProvince: raw.verbatimStateProvince || undefined,
    verbatimLocality: raw.verbatimLocality || undefined,
    locality: raw.locality || undefined,
    scientificName: raw.scientificName || undefined,
    acceptedScientificName: raw.acceptedScientificName || undefined,
    species: raw.species || undefined,
    taxonRank: raw.taxonRank || undefined,
    taxonKey: parseInteger(raw.taxonKey),
    acceptedTaxonKey: parseInteger(raw.acceptedTaxonKey),
    speciesKey: parseInteger(raw.speciesKey),
    taxonomicStatus: raw.taxonomicStatus || undefined,
    hasGeospatialIssue: parseRequiredBoolean(
      raw.hasGeospatialIssue ?? raw.hasGeospatialIssues,
      "hasGeospatialIssue or hasGeospatialIssues",
    ),
    issues: splitIssues(raw.issue || raw.issues),
    decimalLatitude: parseNumber(raw.decimalLatitude),
    decimalLongitude: parseNumber(raw.decimalLongitude),
    coordinateUncertaintyInMeters: parseNumber(raw.coordinateUncertaintyInMeters),
    institutionCode: raw.institutionCode || undefined,
    collectionCode: raw.collectionCode || undefined,
    catalogNumber: raw.catalogNumber || undefined,
    eventDate: raw.eventDate || undefined,
    verbatimEventDate: raw.verbatimEventDate || undefined,
    year: parseInteger(raw.year),
    month: parseInteger(raw.month),
    day: parseInteger(raw.day),
    occurrenceRemarks: raw.occurrenceRemarks || undefined,
    habitat: raw.habitat || undefined,
    establishmentMeans: raw.establishmentMeans || undefined,
    degreeOfEstablishment: raw.degreeOfEstablishment || undefined,
    preparations: raw.preparations || undefined,
  };
}

function safeArchiveEntries(archivePath: string) {
  const entries = listZipEntries(archivePath).sort(compareText);
  assert(entries.length > 0, "GBIF archive contains no entries.");
  assert(new Set(entries).size === entries.length, "GBIF archive contains duplicate entry names.");
  for (const entry of entries) {
    assert(
      !entry.includes("\\") &&
        !entry.startsWith("/") &&
        !/^[A-Za-z]:/u.test(entry) &&
        !entry.split("/").includes(".."),
      `GBIF archive contains unsafe entry ${entry}.`,
    );
  }
  for (const required of ["meta.xml", "occurrence.txt", "verbatim.txt"]) {
    assert(entries.includes(required), `GBIF archive lacks required ${required}.`);
  }
  return entries;
}

function xmlAttributes(value: string) {
  return Object.fromEntries(
    [...value.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)="([^"]*)"/gu)]
      .map((match) => [match[1]!, match[2]!] as const),
  );
}

function localTerm(value: string) {
  return value.split(/[\/#]/gu).filter(Boolean).at(-1) ?? value;
}

function parseTableMeta(meta: string, expectedLocation: "occurrence.txt" | "verbatim.txt") {
  const matches = [...meta.matchAll(/<(core|extension)\b([^>]*)>([\s\S]*?)<\/\1>/gu)]
    .filter((match) => match[3]!.match(/<location>\s*([^<]+?)\s*<\/location>/u)?.[1] === expectedLocation);
  assert(matches.length === 1, `GBIF meta.xml must describe ${expectedLocation} exactly once.`);
  const tableMatch = matches[0]!;
  const attributes = xmlAttributes(tableMatch[2]!);
  assert(attributes.encoding?.toUpperCase() === "UTF-8", `GBIF ${expectedLocation} encoding is not UTF-8.`);
  assert(attributes.fieldsTerminatedBy === "\\t", `GBIF ${expectedLocation} delimiter is not tab.`);
  assert(attributes.ignoreHeaderLines === "1", `GBIF ${expectedLocation} must contain one header line.`);
  const terms = new Map<number, string>();
  for (const match of tableMatch[3]!.matchAll(/<(id|coreid|field)\b([^>]*)\/?>(?:<\/\1>)?/gu)) {
    const field = xmlAttributes(match[2]!);
    if (field.index === undefined) {
      assert(
        match[1] === "field" && Object.hasOwn(field, "default"),
        "GBIF meta.xml contains an invalid field index.",
      );
      assert(localTerm(field.term ?? ""), "GBIF meta.xml default field lacks a term.");
      continue;
    }
    const index = Number(field.index);
    assert(Number.isInteger(index) && index >= 0, "GBIF meta.xml contains an invalid field index.");
    const term = match[1] === "field" ? localTerm(field.term ?? "") : "gbifID";
    assert(term, `GBIF meta.xml field ${index} lacks a term.`);
    if (terms.has(index)) {
      assert(terms.get(index) === term, `GBIF meta.xml conflicts at field index ${index}.`);
      continue;
    }
    terms.set(index, term);
  }
  assert(terms.size > 0, `GBIF meta.xml contains no ${expectedLocation} fields.`);
  return terms;
}

function openTable(
  archivePath: string,
  entry: string,
  byteBudget: number,
  onHeader: (header: string[]) => void,
) {
  const extraction = spawnZipEntry(archivePath, entry);
  const closePromise = once(extraction, "close") as Promise<[number | null, NodeJS.Signals | null]>;
  let stderr = "";
  extraction.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < 16_384) stderr += chunk.toString("utf8");
  });
  let headerValidated = false;
  let extractedBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      extractedBytes += chunk.length;
      if (extractedBytes > byteBudget) {
        callback(new Error(`GBIF ${entry} exceeds the ${byteBudget}-byte decompressed table budget.`));
        return;
      }
      callback(null, chunk);
    },
  });
  const parser = extraction.stdout.pipe(limiter).pipe(parse({
    bom: true,
    columns: (header: string[]) => {
      onHeader(header);
      headerValidated = true;
      return header;
    },
    delimiter: "\t",
    quote: '"',
    escape: '"',
    relax_column_count: false,
    skip_empty_lines: true,
    max_record_size: MAX_DWCA_RECORD_BYTES,
  })) as AsyncIterable<RawDwcaRecord>;
  return {
    extraction,
    closePromise,
    parser: parser[Symbol.asyncIterator](),
    stderr: () => stderr,
    headerValidated: () => headerValidated,
  };
}

async function streamTablesLockstep(
  archivePath: string,
  occurrenceHeader: (header: string[]) => void,
  verbatimHeader: (header: string[]) => void,
  onRecord: (occurrence: RawDwcaRecord, verbatim: RawDwcaRecord, index: number) => void | Promise<void>,
  maxRows: number,
) {
  const byteBudget = Math.min(
    MAX_DWCA_TABLE_BYTES,
    Math.max(16 * 1024 * 1024, maxRows * 4_096),
  );
  const replayDirectory = mkdtempSync(path.join(tmpdir(), "isitusa-gbif-replay-"));
  const database = new DatabaseSync(path.join(replayDirectory, "verbatim.sqlite"));
  try {
    database.exec(`
      PRAGMA journal_mode = OFF;
      PRAGMA synchronous = OFF;
      PRAGMA temp_store = FILE;
      PRAGMA page_size = 4096;
      PRAGMA max_page_count = 524288;
      CREATE TABLE verbatim_rows (
        gbif_id TEXT PRIMARY KEY,
        country_code TEXT NOT NULL,
        state_province TEXT NOT NULL,
        county TEXT NOT NULL,
        locality TEXT NOT NULL,
        verbatim_locality TEXT NOT NULL,
        matched INTEGER NOT NULL DEFAULT 0 CHECK (matched IN (0, 1))
      ) WITHOUT ROWID;
    `);
    const insertVerbatim = database.prepare(`
      INSERT INTO verbatim_rows (
        gbif_id, country_code, state_province, county, locality, verbatim_locality
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const verbatim = openTable(archivePath, "verbatim.txt", byteBudget, verbatimHeader);
    let verbatimCount = 0;
    database.exec("BEGIN IMMEDIATE");
    try {
      while (true) {
        const next = await verbatim.parser.next();
        if (next.done) break;
        verbatimCount += 1;
        assert(verbatimCount <= maxRows, `GBIF verbatim row count exceeds the ${maxRows}-row guard.`);
        const raw = next.value;
        const gbifId = raw.gbifID?.trim();
        assert(gbifId && /^[0-9]+$/u.test(gbifId), "GBIF verbatim row lacks numeric gbifID.");
        try {
          insertVerbatim.run(
            gbifId,
            raw.countryCode ?? "",
            raw.stateProvince ?? "",
            raw.county ?? "",
            raw.locality ?? "",
            raw.verbatimLocality ?? "",
          );
        } catch {
          throw new Error(`GBIF verbatim archive repeats record ${gbifId}.`);
        }
      }
      const [verbatimExit] = await verbatim.closePromise;
      assert(verbatimExit === 0, `GBIF archive extraction failed for verbatim.txt: ${verbatim.stderr().trim() || verbatimExit}.`);
      assert(verbatim.headerValidated(), "GBIF verbatim.txt lacks a header.");
      database.exec("COMMIT");
    } catch (error) {
      verbatim.extraction.kill("SIGTERM");
      await verbatim.closePromise.catch(() => undefined);
      database.exec("ROLLBACK");
      throw error;
    }

    const selectVerbatim = database.prepare(`
      SELECT
        country_code AS countryCode,
        state_province AS stateProvince,
        county,
        locality,
        verbatim_locality AS verbatimLocality,
        matched
      FROM verbatim_rows
      WHERE gbif_id = ?
    `);
    const markMatched = database.prepare("UPDATE verbatim_rows SET matched = 1 WHERE gbif_id = ? AND matched = 0");
    const occurrence = openTable(archivePath, "occurrence.txt", byteBudget, occurrenceHeader);
    let occurrenceCount = 0;
    database.exec("BEGIN IMMEDIATE");
    try {
      while (true) {
        const next = await occurrence.parser.next();
        if (next.done) break;
        occurrenceCount += 1;
        assert(occurrenceCount <= maxRows, `GBIF occurrence row count exceeds the ${maxRows}-row guard.`);
        const raw = next.value;
        const gbifId = raw.gbifID?.trim();
        assert(gbifId && /^[0-9]+$/u.test(gbifId), "GBIF occurrence row lacks numeric gbifID.");
        const verbatimRaw = selectVerbatim.get(gbifId) as (RawDwcaRecord & { matched: number }) | undefined;
        assert(verbatimRaw, `GBIF occurrence record ${gbifId} has no verbatim row.`);
        assert(verbatimRaw.matched === 0, `GBIF occurrence archive repeats record ${gbifId}.`);
        const { matched: _matched, ...verbatimFields } = verbatimRaw;
        await onRecord(raw, { gbifID: gbifId, ...verbatimFields }, occurrenceCount);
        const marked = markMatched.run(gbifId);
        assert(marked.changes === 1, `GBIF occurrence record ${gbifId} could not be marked as matched.`);
      }
      const [occurrenceExit] = await occurrence.closePromise;
      assert(occurrenceExit === 0, `GBIF archive extraction failed for occurrence.txt: ${occurrence.stderr().trim() || occurrenceExit}.`);
      assert(occurrence.headerValidated(), "GBIF occurrence.txt lacks a header.");
      database.exec("COMMIT");
    } catch (error) {
      occurrence.extraction.kill("SIGTERM");
      await occurrence.closePromise.catch(() => undefined);
      database.exec("ROLLBACK");
      throw error;
    }
    const unmatched = database.prepare("SELECT COUNT(*) AS count FROM verbatim_rows WHERE matched = 0").get() as { count: number };
    assert(occurrenceCount === verbatimCount, "GBIF occurrence and verbatim tables have different row counts.");
    assert(unmatched.count === 0, `GBIF verbatim table contains ${unmatched.count} records without occurrence rows.`);
    return occurrenceCount;
  } finally {
    database.close();
    const resolvedDirectory = path.resolve(replayDirectory);
    assert(
      path.dirname(resolvedDirectory) === path.resolve(tmpdir()) &&
        path.basename(resolvedDirectory).startsWith("isitusa-gbif-replay-"),
      "GBIF replay temporary directory escaped the operating-system temp root.",
    );
    rmSync(resolvedDirectory, { recursive: true, force: true });
  }
}

async function streamTable(
  archivePath: string,
  entry: string,
  onHeader: (header: string[]) => void,
  onRecord: (record: RawDwcaRecord, index: number) => void | Promise<void>,
) {
  const extraction = spawnZipEntry(archivePath, entry);
  const closePromise = once(extraction, "close") as Promise<[number | null, NodeJS.Signals | null]>;
  let stderr = "";
  extraction.stderr.on("data", (chunk: Buffer) => {
    if (stderr.length < 16_384) stderr += chunk.toString("utf8");
  });
  let headerValidated = false;
  const parser = extraction.stdout.pipe(parse({
    bom: true,
    columns: (header: string[]) => {
      onHeader(header);
      headerValidated = true;
      return header;
    },
    delimiter: "\t",
    quote: '"',
    escape: '"',
    relax_column_count: false,
    skip_empty_lines: true,
  })) as AsyncIterable<RawDwcaRecord>;
  let count = 0;
  try {
    for await (const record of parser) {
      count += 1;
      await onRecord(record, count);
    }
  } catch (error) {
    extraction.kill("SIGTERM");
    await closePromise.catch(() => undefined);
    throw error;
  }
  const [exitCode] = await closePromise;
  assert(exitCode === 0, `GBIF archive extraction failed for ${entry}: ${stderr.trim() || exitCode}.`);
  assert(headerValidated, `GBIF ${entry} lacks a header.`);
  return count;
}

function taxonForRecord(
  record: GbifOccurrenceRecord,
  taxonByKey: Map<number, GbifNationalTaxon>,
) {
  const keys = [record.speciesKey, record.acceptedTaxonKey]
    .filter((value): value is number => Number.isInteger(value));
  if (record.taxonRank === "SPECIES" && Number.isInteger(record.taxonKey)) {
    keys.push(record.taxonKey!);
  }
  const matches = [...new Set(keys.map((key) => taxonByKey.get(key)).filter(Boolean))] as GbifNationalTaxon[];
  return matches.length === 1 ? matches[0]! : null;
}

function preferredRecord(left: GbifOccurrenceRecord | undefined, right: GbifOccurrenceRecord) {
  if (!left) return right;
  const leftId = sourceRecordId(left);
  const rightId = sourceRecordId(right);
  if (!leftId || !rightId) return left;
  const numericLeft = BigInt(leftId);
  const numericRight = BigInt(rightId);
  return numericRight < numericLeft ? right : left;
}

function addRejectionAggregate(
  work: StateWork,
  groupKey: string,
  value: Omit<RejectionAggregate, "count">,
) {
  const prior = work.rejectionByGroup.get(groupKey);
  if (prior) {
    prior.count += 1;
    if (preferredRecord(prior.record, value.record) === value.record) prior.record = value.record;
    return;
  }
  work.rejectionByGroup.set(groupKey, { ...value, count: 1 });
}

export async function replayNationalGbifArchive(input: {
  archivePath: string;
  plan: NationalGbifDownloadPlan;
  taxa: GbifNationalTaxon[];
  stateInputs: StateReplayInput[];
  completedAt: string;
  downloadKey: string;
  sourceUrl: string;
  providerTotalRecords: number;
}): Promise<NationalGbifReplay> {
  assert(existsSync(input.archivePath) && statSync(input.archivePath).isFile(), "GBIF archive is missing.");
  const entries = safeArchiveEntries(input.archivePath);
  const metaBytes = readZipEntry(input.archivePath, "meta.xml", 4 * 1024 * 1024);
  const metaText = metaBytes.toString("utf8");
  const occurrenceMetaTerms = parseTableMeta(metaText, "occurrence.txt");
  const verbatimMetaTerms = parseTableMeta(metaText, "verbatim.txt");
  const taxonByKey = new Map(input.taxa.map((taxon) => [taxon.taxonKey, taxon]));
  const workByState = new Map<string, StateWork>();
  const stateByProviderName = new Map<string, string>();
  for (const stateCode of input.plan.nationalV1StateCodes) {
    const state = getStateDefinition(stateCode);
    assert(state, `Missing state definition ${stateCode}.`);
    const providerName = canonicalText(state.sourceStateNames.gbif);
    assert(!stateByProviderName.has(providerName), `GBIF provider state name is ambiguous: ${providerName}.`);
    stateByProviderName.set(providerName, stateCode);
  }
  for (const stateInput of input.stateInputs) {
    const stateCode = stateInput.context.stateCode;
    const state = getStateDefinition(stateCode);
    assert(state, `Missing state definition ${stateCode}.`);
    const pairByKey = new Map(stateInput.requestedPairs.map((pair) => [pairKey(pair), pair]));
    assert(pairByKey.size === stateInput.requestedPairs.length, `GBIF ${stateCode} selection repeats pair keys.`);
    const firstPairBySpecies = new Map<string, GbifRequestedPair>();
    for (const pair of stateInput.requestedPairs) {
      if (!firstPairBySpecies.has(pair.speciesId)) firstPairBySpecies.set(pair.speciesId, pair);
    }
    workByState.set(stateCode, {
      input: stateInput,
      pairByKey,
      firstPairBySpecies,
      selectedByPair: new Map(),
      rejectionByGroup: new Map(),
      candidateRecords: 0,
      overlapRecords: 0,
    });
    assert(
      stateByProviderName.get(canonicalText(state.sourceStateNames.gbif)) === stateCode,
      `GBIF replay state ${stateCode} is outside the plan jurisdiction registry.`,
    );
  }

  const occurrenceIds = new Set<string>();
  let taxonomyRejectedRows = 0;
  let geographyRejectedRows = 0;
  let selectedScopeRows = 0;
  let overlapRows = 0;
  let occurrenceHeaderSha256 = "";
  let verbatimHeaderSha256 = "";
  const occurrenceRows = await streamTablesLockstep(
    input.archivePath,
    (header) => {
      assert(new Set(header).size === header.length, "GBIF occurrence header contains duplicate fields.");
      for (const required of REQUIRED_OCCURRENCE_FIELDS) {
        assert(header.includes(required), `GBIF occurrence header lacks ${required}.`);
        assert(
          occurrenceMetaTerms.get(header.indexOf(required)) === required,
          `GBIF occurrence meta.xml does not declare required field ${required} at its header index.`,
        );
      }
      const geospatialIssueFields = ["hasGeospatialIssue", "hasGeospatialIssues"]
        .filter((field) => header.includes(field));
      assert(
        geospatialIssueFields.length === 1,
        "GBIF occurrence header must contain exactly one hasGeospatialIssue or hasGeospatialIssues field.",
      );
      const geospatialIssueField = geospatialIssueFields[0]!;
      assert(
        occurrenceMetaTerms.get(header.indexOf(geospatialIssueField)) === geospatialIssueField,
        `GBIF occurrence meta.xml does not declare required field ${geospatialIssueField} at its header index.`,
      );
      const issueField = header.includes("issue") ? "issue" : header.includes("issues") ? "issues" : null;
      assert(issueField, "GBIF occurrence header lacks issue or issues.");
      assert(
        occurrenceMetaTerms.get(header.indexOf(issueField)) === issueField,
        `GBIF occurrence meta.xml does not declare required field ${issueField} at its header index.`,
      );
      for (const [index, term] of occurrenceMetaTerms) {
        assert(header[index] === term, `GBIF occurrence meta/header mismatch at field ${index}: ${term} versus ${header[index] ?? "missing"}.`);
      }
      occurrenceHeaderSha256 = sha256(`${header.join("\t")}\n`);
    },
    (header) => {
      assert(new Set(header).size === header.length, "GBIF verbatim header contains duplicate fields.");
      for (const required of REQUIRED_VERBATIM_FIELDS) {
        assert(header.includes(required), `GBIF verbatim header lacks ${required}.`);
        assert(
          verbatimMetaTerms.get(header.indexOf(required)) === required,
          `GBIF verbatim meta.xml does not declare required field ${required} at its header index.`,
        );
      }
      for (const [index, term] of verbatimMetaTerms) {
        assert(header[index] === term, `GBIF verbatim meta/header mismatch at field ${index}: ${term} versus ${header[index] ?? "missing"}.`);
      }
      verbatimHeaderSha256 = sha256(`${header.join("\t")}\n`);
    },
    (raw, verbatimRaw) => {
      const record = occurrenceRecord(raw);
      const recordId = sourceRecordId(record);
      assert(recordId, "GBIF occurrence row lacks a numeric stable identifier.");
      const verbatimId = verbatimRaw.gbifID?.trim();
      assert(verbatimId && /^[0-9]+$/u.test(verbatimId), "GBIF verbatim row lacks numeric gbifID.");
      assert(verbatimId === recordId, `GBIF occurrence and verbatim rows disagree at record ${recordId}.`);
      assert(!occurrenceIds.has(recordId), `GBIF occurrence archive repeats record ${recordId}.`);
      occurrenceIds.add(recordId);
      assert(occurrenceIds.size <= input.plan.maxOccurrenceRows!, "GBIF occurrence row guard exceeded.");
      const taxon = taxonForRecord(record, taxonByKey);
      if (!taxon) {
        taxonomyRejectedRows += 1;
        return;
      }
      const verbatimState = verbatimRaw.stateProvince?.trim() ?? "";
      const verbatimCounty = verbatimRaw.county?.trim() ?? "";
      const verbatimCountryCode = verbatimRaw.countryCode?.trim() ?? "";
      const stateCode = stateByProviderName.get(canonicalText(verbatimState));
      if (
        !stateCode ||
        !verbatimCounty ||
        canonicalText(verbatimCountryCode) !== canonicalText(input.plan.countryCode) ||
        canonicalText(record.stateProvince ?? "") !== canonicalText(verbatimState) ||
        canonicalText(record.county ?? "") !== canonicalText(verbatimCounty) ||
        canonicalText(record.countryCode ?? "") !== canonicalText(verbatimCountryCode)
      ) {
        geographyRejectedRows += 1;
        return;
      }
      record.verbatimStateProvince = verbatimState;
      record.verbatimLocality = verbatimRaw.verbatimLocality || verbatimRaw.locality || undefined;
      const countyResolution = resolveCountyEquivalent({
        stateCode,
        countyName: verbatimCounty,
        sourceId: "gbif-preserved-specimens",
      });
      const match: GbifMatch = {
        speciesKey: taxon.taxonKey,
        canonicalName: taxon.scientificName,
        confidence: taxon.confidence,
      };
      if (countyResolution.status !== "resolved") {
        geographyRejectedRows += 1;
        const work = workByState.get(stateCode);
        const representative = work?.firstPairBySpecies.get(taxon.speciesId);
        if (work && representative) {
          addRejectionAggregate(work, `${taxon.speciesId}:geography`, {
            record,
            pair: representative,
            match,
            reason: {
              reason: countyResolution.reasonCode === "missing-geography" ? "geography-missing" : "geography-ambiguous",
              notes: [countyResolution.detail],
            },
            targetCountyFips: null,
          });
        }
        return;
      }
      const work = workByState.get(stateCode);
      if (!work) {
        overlapRows += 1;
        return;
      }
      work.candidateRecords += 1;
      const key = `${countyResolution.county.countyFips}:${taxon.speciesId}`;
      const pair = work.pairByKey.get(key);
      if (!pair) {
        overlapRows += 1;
        work.overlapRecords += 1;
        return;
      }
      selectedScopeRows += 1;
      const rejected = occurrenceRejection(record, pair, match);
      if (rejected) {
        addRejectionAggregate(work, `${key}:${rejected.reason}`, {
          record,
          pair,
          match,
          reason: rejected,
          targetCountyFips: pair.countyFips,
        });
        return;
      }
      const prior = work.selectedByPair.get(key)?.record;
      const selected = preferredRecord(prior, record);
      if (selected === record) work.selectedByPair.set(key, { record, match });
    },
    input.plan.maxOccurrenceRows!,
  );
  assert(occurrenceRows === input.providerTotalRecords, `GBIF occurrence rows ${occurrenceRows} differ from provider total ${input.providerTotalRecords}.`);
  assert(
    selectedScopeRows <= input.plan.maxSelectedEvidenceRecords!,
    `GBIF selected-scope record count exceeds the ${input.plan.maxSelectedEvidenceRecords}-record guard.`,
  );
  assert(
    taxonomyRejectedRows + geographyRejectedRows + selectedScopeRows + overlapRows === occurrenceRows,
    "GBIF occurrence row classes do not reconcile to the archive total.",
  );

  const uniqueOccurrenceIds = occurrenceIds.size;
  const verbatimRows = occurrenceRows;

  const resultsByState = new Map<string, SourceAdapterResult>();
  let assertionEvents = 0;
  let reviewEvents = 0;
  let representativeRejections = 0;
  let selectedEvidencePairs = 0;
  let selectedNoEvidencePairs = 0;
  let selectedPairCount = 0;
  const queryUrl = input.sourceUrl;
  for (const [stateCode, work] of [...workByState.entries()].sort(([left], [right]) => compareText(left, right))) {
    const assertions: SourceAdapterResult["assertions"] = [];
    const reviews: SourceAdapterResult["reviews"] = [];
    const rejections: SourceAdapterResult["rejections"] = [];
    const rejectionIdsByPair = new Map<string, string[]>();
    for (const [groupKey, aggregate] of [...work.rejectionByGroup.entries()].sort(([left], [right]) => compareText(left, right))) {
      const rejection = makeGbifRejection(
        work.input.context,
        aggregate.pair,
        input.completedAt,
        recordLocator(aggregate.record, `${queryUrl}#${groupKey}`),
        candidateTaxon(aggregate.record) ?? "missing",
        candidateGeography(aggregate.record),
        aggregate.reason.reason,
        [...aggregate.reason.notes, `Representative of ${aggregate.count} archive row(s) in this bounded rejection group.`],
        { groupKey, count: aggregate.count, sourceRecordId: sourceRecordId(aggregate.record) },
        aggregate.targetCountyFips,
      );
      rejections.push(rejection);
      representativeRejections += 1;
      if (aggregate.targetCountyFips) {
        const ids = rejectionIdsByPair.get(pairKey(aggregate.pair)) ?? [];
        ids.push(rejection.rejection_id);
        rejectionIdsByPair.set(pairKey(aggregate.pair), ids);
      }
    }
    const outcomes: SourceAdapterResult["outcomes"] = [];
    for (const pair of [...work.pairByKey.values()].sort((left, right) => compareText(pairKey(left), pairKey(right)))) {
      selectedPairCount += 1;
      const key = pairKey(pair);
      const selected = work.selectedByPair.get(key);
      const rejectionIds = rejectionIdsByPair.get(key) ?? [];
      if (selected) {
        const normalized = makeGbifAssertionAndReview(
          work.input.context,
          pair,
          selected.match,
          selected.record,
          input.completedAt,
        );
        assertions.push(normalized.assertion);
        reviews.push(normalized.review);
        assertionEvents += 1;
        reviewEvents += 1;
        selectedEvidencePairs += 1;
        outcomes.push(makeGbifOutcome(
          work.input.context,
          pair,
          input.completedAt,
          "evidence-found",
          true,
          [normalized.assertion.eventId],
          rejectionIds,
          [queryUrl],
          ["The complete national GBIF archive contained at least one publishable preserved specimen record for this selected pair."],
        ));
      } else {
        selectedNoEvidencePairs += 1;
        outcomes.push(makeGbifOutcome(
          work.input.context,
          pair,
          input.completedAt,
          "no-qualifying-evidence",
          true,
          [],
          rejectionIds,
          [queryUrl],
          [
            "The complete national GBIF archive contained no publishable record for this selected pair.",
            "This is a research outcome only and never establishes absence or non-detection.",
          ],
        ));
      }
    }
    resultsByState.set(stateCode, {
      completedAt: input.completedAt,
      assertions: assertions.sort((left, right) => compareText(left.eventId, right.eventId)),
      reviews: reviews.sort((left, right) => compareText(left.eventId, right.eventId)),
      rejections: rejections.sort((left, right) => compareText(left.rejection_id, right.rejection_id)),
      outcomes: outcomes.sort((left, right) => compareText(left.outcome_id, right.outcome_id)),
      artifacts: [],
      upstreamRequests: [],
      candidateRecordCount: work.candidateRecords,
      duplicateRecordCount: 0,
      errors: [],
      warnings: work.overlapRecords > 0
        ? [`Retained ${work.overlapRecords} exact archive row(s) outside the baseline not-researched selection without emitting duplicate pair outcomes.`]
        : [],
    });
  }
  assert(selectedPairCount === input.plan.expectedNotResearchedPairsAtBaseline, "GBIF replay selected-pair count differs from plan.");
  assert(assertionEvents + selectedNoEvidencePairs === selectedPairCount, "GBIF selected outcomes do not reconcile.");
  return {
    inspection: {
      entries,
      metaSha256: sha256(metaBytes),
      occurrenceHeaderSha256,
      verbatimHeaderSha256,
      occurrenceRows,
      verbatimRows,
      uniqueOccurrenceIds,
    },
    resultsByState,
    reconciliation: {
      providerTotalRecords: input.providerTotalRecords,
      occurrenceRows,
      verbatimRows,
      uniqueOccurrenceIds,
      selectedScopeRows,
      overlapRows,
      taxonomyRejectedRows,
      geographyRejectedRows,
      selectedEvidencePairs,
      selectedNoEvidencePairs,
      selectedPairCount,
      assertionEvents,
      reviewEvents,
      representativeRejections,
      duplicateRecords: 0,
    },
  };
}
