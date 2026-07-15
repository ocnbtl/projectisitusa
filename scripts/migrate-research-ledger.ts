import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { countyPresenceOverrides } from "@/data/source/county-presence-overrides";
import { countySpeciesStatusOverrides } from "@/data/source/county-species-status-overrides";
import type {
  EvidenceAssertion,
  EvidenceScope,
  ResearchRunReceipt,
  ResearchSourceDefinition,
  ResearchSourceRegistry,
} from "@/lib/research/types";

type SpeciesRecord = {
  id: string;
  slug: string;
  scientificName: string;
  registry?: { occurrenceId?: string };
};

type CountyRecord = {
  countyFips: string;
  name: string;
  stateCode: string;
};

type MatrixCounty = {
  countyFips: string;
  presentVerifiedSpeciesIds: string[];
  verifiedAbsentSpeciesIds: string[];
  notDetectedSpeciesIds: string[];
};

type MatrixFile = {
  stateCode: string;
  generatedFrom: { countyPresenceSnapshotDate: string };
  counties: MatrixCounty[];
};

type SnapshotSpecies = {
  speciesId?: string;
  scientificName?: string;
  countyFips?: string[];
  sourceUrl?: string;
  queryUrl?: string;
  countyDataSources?: Array<{ source?: string; externalId?: string; url?: string }>;
  [key: string]: unknown;
};

type SourceSnapshot = {
  source: string;
  citation?: string | string[];
  accessedAt?: string;
  snapshotDate?: string;
  queryUrl?: string;
  serviceUrl?: string;
  endpoint?: string;
  filters?: unknown;
  targetScientificNames?: string[];
  species?: SnapshotSpecies[];
};

const ROOT = process.cwd();
const STATE_CODE = "AL";
const RESEARCH_DIR = path.join(ROOT, "src/data/research");
const SOURCE_DIR = path.join(ROOT, "src/data/source");
const LEDGER_PATH = path.join(RESEARCH_DIR, "evidence-assertions.ndjson");
const RUNS_PATH = path.join(RESEARCH_DIR, "research-runs.json");
const REPORT_PATH = path.join(RESEARCH_DIR, "migration-report.json");
const CANDIDATES_PATH = path.join(RESEARCH_DIR, "migration-candidates.json");
const FREEZE_PATH = path.join(RESEARCH_DIR, "bootstrap-ledger-freeze.json");

if (process.argv.slice(2).join(" ") !== "--initialize-from-legacy") {
  throw new Error(
    "research:migrate is initialization-only and requires --initialize-from-legacy. Routine refresh must run research:compile instead.",
  );
}
if (existsSync(FREEZE_PATH)) {
  throw new Error(
    "The bootstrap ledger is frozen. Reinitialization would reclassify reviewed evidence and is prohibited without an explicit architecture review.",
  );
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function normalize(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function stableId(prefix: string, parts: Array<string | number | undefined>) {
  const digest = createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex")
    .slice(0, 20);
  return `${prefix}-${digest}`;
}

function sortUnique(values: string[]) {
  return [...new Set(values)].sort();
}

function latestDate(values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1);
}

function asDate(value: unknown): string | undefined {
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value.trim();
}

function nestedRecords(entry: SnapshotSpecies) {
  for (const key of [
    "records",
    "observations",
    "representativeSpecimens",
    "representativeObservations",
    "representativeRecords",
  ]) {
    const value = entry[key];
    if (Array.isArray(value)) {
      return value.filter((record): record is Record<string, unknown> => Boolean(record && typeof record === "object"));
    }
  }
  return [];
}

function recordIdentifier(record: Record<string, unknown> | undefined) {
  if (!record) {
    return undefined;
  }
  for (const key of [
    "uuid",
    "occurrenceId",
    "occurrenceKey",
    "gbifKey",
    "id",
    "objectid",
    "damagePointId",
    "routeDataId",
    "activityId",
    "catalogNumber",
  ]) {
    const value = record[key];
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }
  return undefined;
}

function recordDate(record: Record<string, unknown> | undefined) {
  if (!record) {
    return undefined;
  }
  for (const key of [
    "observedOn",
    "eventDate",
    "activityStartDate",
    "endDate",
    "date",
    "surveyYear",
    "year",
  ]) {
    const value = asDate(record[key]);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function recordUrl(sourceId: string, record: Record<string, unknown> | undefined) {
  if (!record) {
    return undefined;
  }
  if (typeof record.uri === "string" && /^https?:\/\//.test(record.uri)) {
    return record.uri;
  }
  if (sourceId.startsWith("gbif-") && (typeof record.gbifKey === "string" || typeof record.gbifKey === "number")) {
    return `https://www.gbif.org/occurrence/${String(record.gbifKey)}`;
  }
  return undefined;
}

function filtersFrom(snapshot: SourceSnapshot) {
  if (!snapshot.filters) {
    return [];
  }
  if (Array.isArray(snapshot.filters)) {
    return snapshot.filters.map(String);
  }
  if (typeof snapshot.filters === "object") {
    return Object.entries(snapshot.filters)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`);
  }
  return [String(snapshot.filters)];
}

const species = readJson<SpeciesRecord[]>(path.join(ROOT, "src/data/generated/species.json"));
const countiesIndex = readJson<Record<string, CountyRecord>>(path.join(ROOT, "src/data/generated/counties.json"));
const matrix = readJson<MatrixFile>(path.join(ROOT, "docs/county-coverage/states/AL.json"));
const registry = readJson<ResearchSourceRegistry>(path.join(RESEARCH_DIR, "source-registry.json"));
const alabamaCountyFips = new Set(
  Object.values(countiesIndex)
    .filter((county) => county.stateCode === STATE_CODE)
    .map((county) => county.countyFips),
);
const countyNames = new Map(Object.values(countiesIndex).map((county) => [county.countyFips, county.name]));
const matrixPresentPairs = new Set(
  matrix.counties.flatMap((county) =>
    county.presentVerifiedSpeciesIds.map((speciesId) => `${county.countyFips}:${speciesId}`),
  ),
);

const speciesByKey = new Map<string, SpeciesRecord>();
for (const entry of species) {
  for (const key of [entry.id, entry.slug, entry.registry?.occurrenceId, entry.scientificName]) {
    if (key) {
      speciesByKey.set(normalize(key), entry);
    }
  }
}

function resolveSpecies(id: string | undefined, scientificName?: string) {
  return speciesByKey.get(normalize(id)) ?? speciesByKey.get(normalize(scientificName));
}

const sourcesByLabel = new Map<string, ResearchSourceDefinition>();
for (const source of registry.sources) {
  for (const label of [source.label, ...source.aliases]) {
    sourcesByLabel.set(normalize(label), source);
  }
}

function resolveSource(label: string) {
  const exact = sourcesByLabel.get(normalize(label));
  if (exact) {
    return exact;
  }
  if (/national honey bee survey/i.test(label)) {
    return registry.sources.find((source) => source.id === "aphis-honey-bee")!;
  }
  if (/invasive carp edna/i.test(label)) {
    return registry.sources.find((source) => source.id === "usfws-invasive-carp-edna")!;
  }
  return registry.sources.find((source) => source.id === "manual-authoritative")!;
}

const evidence: EvidenceAssertion[] = [];
const evidenceKeys = new Set<string>();

function addEvidence(assertion: Omit<EvidenceAssertion, "evidenceId">) {
  const identity = [
    assertion.stateCode,
    assertion.countyFips,
    assertion.speciesId,
    assertion.assertion,
    assertion.sourceId,
    assertion.externalRecordId,
    assertion.url,
  ].join("|");
  if (evidenceKeys.has(identity)) {
    return;
  }
  evidenceKeys.add(identity);
  evidence.push({
    evidenceId: stableId("ev", [identity]),
    ...assertion,
  });
}

const runs: ResearchRunReceipt[] = [];
const snapshotFiles = readdirSync(SOURCE_DIR)
  .filter((filename) => filename.endsWith("snapshot.json"))
  .filter((filename) => filename !== "county-presence-snapshot.json" && filename !== "usriis-snapshot.json")
  .sort();

let sourceSpecificEvidenceCount = 0;
const deferredSnapshotPairs: Array<{
  sourceId: string;
  sourceLabel: string;
  speciesId: string;
  countyFips: string;
  artifactPath: string;
  reason: string;
}> = [];

for (const filename of snapshotFiles) {
  const artifactPath = `src/data/source/${filename}`;
  const snapshot = readJson<SourceSnapshot>(path.join(SOURCE_DIR, filename));
  const source = resolveSource(snapshot.source);
  if (source.id === "manual-authoritative") {
    throw new Error(`No source registry entry matches snapshot source: ${snapshot.source}`);
  }

  const acceptedSpeciesIds: string[] = [];
  let acceptedPairCount = 0;

  for (const snapshotSpecies of snapshot.species ?? []) {
    const resolved = resolveSpecies(snapshotSpecies.speciesId, snapshotSpecies.scientificName);
    if (!resolved) {
      continue;
    }
    acceptedSpeciesIds.push(resolved.id);

    for (const countyFips of sortUnique(snapshotSpecies.countyFips ?? [])) {
      if (!alabamaCountyFips.has(countyFips)) {
        continue;
      }
      if (!matrixPresentPairs.has(`${countyFips}:${resolved.id}`)) {
        deferredSnapshotPairs.push({
          sourceId: source.id,
          sourceLabel: source.label,
          speciesId: resolved.id,
          countyFips,
          artifactPath,
          reason:
            "The source snapshot contains this positive pair, but the current authoritative matrix does not. Review through the source-family workflow before promotion.",
        });
        continue;
      }
      const matchingRecord = nestedRecords(snapshotSpecies).find(
        (record) => String(record.countyFips ?? "") === countyFips,
      );
      const sourceRef = snapshotSpecies.countyDataSources?.[0];
      const eddMapsSubjectUrl =
        source.id === "eddmaps" &&
        (typeof snapshotSpecies.subjectId === "string" || typeof snapshotSpecies.subjectId === "number")
          ? `https://www.eddmaps.org/species/subject.cfm?sub=${String(snapshotSpecies.subjectId)}`
          : undefined;
      const url =
        recordUrl(source.id, matchingRecord) ??
        snapshotSpecies.sourceUrl ??
        snapshotSpecies.queryUrl ??
        sourceRef?.url ??
        eddMapsSubjectUrl ??
        snapshot.queryUrl ??
        snapshot.endpoint ??
        snapshot.serviceUrl ??
        source.homepage;
      const externalRecordId = recordIdentifier(matchingRecord) ?? sourceRef?.externalId;
      addEvidence({
        stateCode: STATE_CODE,
        countyFips,
        speciesId: resolved.id,
        assertion: "recorded-present",
        scope: matchingRecord ? "point" : "county",
        sourceId: source.id,
        sourceLabel: source.label,
        url,
        externalRecordId,
        observedAt: recordDate(matchingRecord),
        accessedAt: snapshot.accessedAt ?? snapshot.snapshotDate,
        lineage: matchingRecord ? "source-record" : "source-species-county",
        caveat: source.caveat,
      });
      acceptedPairCount += 1;
      sourceSpecificEvidenceCount += 1;
    }
  }

  const targetSpeciesIds = snapshot.targetScientificNames?.length
    ? snapshot.targetScientificNames
        .map((name) => resolveSpecies(undefined, name)?.id)
        .filter((id): id is string => Boolean(id))
    : acceptedSpeciesIds;
  const accessedAt = snapshot.accessedAt ?? snapshot.snapshotDate ?? null;
  runs.push({
    runId: stableId("run", [source.id, artifactPath, accessedAt ?? undefined]),
    sourceId: source.id,
    sourceLabel: source.label,
    stateCode: STATE_CODE,
    status: "complete",
    scope: "statewide-source-screen",
    accessedAt,
    targetSpeciesIds: sortUnique(targetSpeciesIds),
    acceptedSpeciesIds: sortUnique(acceptedSpeciesIds),
    acceptedPairCount,
    filters: filtersFrom(snapshot),
    artifactPath,
    caveat: source.caveat,
  });
}

const manualSource = registry.sources.find((source) => source.id === "manual-authoritative")!;
let manualEvidenceCount = 0;
for (const override of countyPresenceOverrides) {
  const resolved = resolveSpecies(override.speciesId);
  if (!resolved) {
    throw new Error(`Manual presence override references unknown species: ${override.speciesId}`);
  }
  for (const countyFips of override.countyFips) {
    if (!alabamaCountyFips.has(countyFips)) {
      continue;
    }
    const countyName = normalize(countyNames.get(countyFips));
    const sourceRef =
      override.countyDataSources.find((candidate) => normalize(candidate.externalId).includes(countyName)) ??
      override.countyDataSources[0];
    if (!sourceRef) {
      throw new Error(`Manual presence override has no source: ${override.speciesId}:${countyFips}`);
    }
    addEvidence({
      stateCode: STATE_CODE,
      countyFips,
      speciesId: resolved.id,
      assertion: "recorded-present",
      scope: "county",
      sourceId: manualSource.id,
      sourceLabel: sourceRef.source,
      url: sourceRef.url,
      externalRecordId: sourceRef.externalId,
      reviewedAt: matrix.generatedFrom.countyPresenceSnapshotDate,
      lineage: "manual-review",
      caveat: "Manual authoritative county evidence preserved from the existing reviewed override file.",
    });
    manualEvidenceCount += 1;
  }
}

for (const override of countySpeciesStatusOverrides) {
  if (!alabamaCountyFips.has(override.countyFips)) {
    continue;
  }
  const resolved = resolveSpecies(override.speciesId);
  if (!resolved) {
    throw new Error(`Non-presence override references unknown species: ${override.speciesId}`);
  }
  const source = resolveSource(override.source.label);
  const scope: EvidenceScope = override.evidenceScope === "survey-area" ? "survey-area" : "county";
  addEvidence({
    stateCode: STATE_CODE,
    countyFips: override.countyFips,
    speciesId: resolved.id,
    assertion: override.status === "verified-absent" ? "officially-absent" : "not-detected",
    scope,
    sourceId: source.id,
    sourceLabel: override.source.label,
    url: override.source.url,
    reviewedAt: override.reviewedAt,
    lineage: "manual-review",
    caveat: override.notes,
  });
  manualEvidenceCount += 1;
}

const coveredPresentPairs = new Set(
  evidence
    .filter((entry) => entry.assertion === "recorded-present")
    .map((entry) => `${entry.countyFips}:${entry.speciesId}`),
);
const legacySource = registry.sources.find((source) => source.id === "legacy-merged-presence")!;
let legacyFallbackCount = 0;

for (const county of matrix.counties) {
  for (const speciesId of county.presentVerifiedSpeciesIds) {
    const pairKey = `${county.countyFips}:${speciesId}`;
    if (coveredPresentPairs.has(pairKey)) {
      continue;
    }
    addEvidence({
      stateCode: STATE_CODE,
      countyFips: county.countyFips,
      speciesId,
      assertion: "recorded-present",
      scope: "legacy-county-pair",
      sourceId: legacySource.id,
      sourceLabel: legacySource.label,
      url: legacySource.homepage,
      reviewedAt: matrix.generatedFrom.countyPresenceSnapshotDate,
      lineage: "legacy-merged",
      caveat: legacySource.caveat,
    });
    legacyFallbackCount += 1;
  }
}

const migrationDate = latestDate([
  matrix.generatedFrom.countyPresenceSnapshotDate,
  ...runs.map((run) => run.accessedAt ?? undefined),
])!;
const manualAcceptedSpecies = sortUnique(
  evidence.filter((entry) => entry.sourceId === manualSource.id).map((entry) => entry.speciesId),
);
const manualAcceptedPairs = new Set(
  evidence.filter((entry) => entry.sourceId === manualSource.id).map((entry) => `${entry.countyFips}:${entry.speciesId}`),
).size;
runs.push({
  runId: stableId("run", [manualSource.id, migrationDate]),
  sourceId: manualSource.id,
  sourceLabel: manualSource.label,
  stateCode: STATE_CODE,
  status: "legacy-import",
  scope: "evidence-only",
  accessedAt: migrationDate,
  targetSpeciesIds: manualAcceptedSpecies,
  acceptedSpeciesIds: manualAcceptedSpecies,
  acceptedPairCount: manualAcceptedPairs,
  filters: ["Reviewed override records only"],
  artifactPath: "src/data/source/county-presence-overrides.ts and src/data/source/county-species-status-overrides.ts",
  caveat: manualSource.caveat,
});
runs.push({
  runId: stableId("run", [legacySource.id, migrationDate]),
  sourceId: legacySource.id,
  sourceLabel: legacySource.label,
  stateCode: STATE_CODE,
  status: "legacy-import",
  scope: "legacy-migration",
  accessedAt: migrationDate,
  targetSpeciesIds: [],
  acceptedSpeciesIds: sortUnique(
    evidence.filter((entry) => entry.sourceId === legacySource.id).map((entry) => entry.speciesId),
  ),
  acceptedPairCount: legacyFallbackCount,
  filters: ["Existing verified-present Alabama pairs without reconstructed exact source lineage"],
  artifactPath: "src/data/source/county-presence-snapshot.json",
  caveat: legacySource.caveat,
});

evidence.sort(
  (left, right) =>
    left.countyFips.localeCompare(right.countyFips) ||
    left.speciesId.localeCompare(right.speciesId) ||
    left.assertion.localeCompare(right.assertion) ||
    left.sourceId.localeCompare(right.sourceId) ||
    left.evidenceId.localeCompare(right.evidenceId),
);
runs.sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.runId.localeCompare(right.runId));

const presentPairs = new Set(
  evidence.filter((entry) => entry.assertion === "recorded-present").map((entry) => `${entry.countyFips}:${entry.speciesId}`),
);
const absentPairs = new Set(
  evidence.filter((entry) => entry.assertion === "officially-absent").map((entry) => `${entry.countyFips}:${entry.speciesId}`),
);
const notDetectedPairs = new Set(
  evidence.filter((entry) => entry.assertion === "not-detected").map((entry) => `${entry.countyFips}:${entry.speciesId}`),
);
const expectedPresent = matrix.counties.reduce((sum, county) => sum + county.presentVerifiedSpeciesIds.length, 0);
const expectedAbsent = matrix.counties.reduce((sum, county) => sum + county.verifiedAbsentSpeciesIds.length, 0);
const expectedNotDetected = matrix.counties.reduce((sum, county) => sum + county.notDetectedSpeciesIds.length, 0);

if (
  presentPairs.size !== expectedPresent ||
  absentPairs.size !== expectedAbsent ||
  notDetectedPairs.size !== expectedNotDetected
) {
  throw new Error(
    `Migration parity failed. Expected ${expectedPresent}/${expectedAbsent}/${expectedNotDetected}, got ${presentPairs.size}/${absentPairs.size}/${notDetectedPairs.size}.`,
  );
}

const report = {
  schemaVersion: 1,
  stateCode: STATE_CODE,
  generatedAt: migrationDate,
  sourceSpecificEvidenceCount,
  manualEvidenceCount,
  legacyFallbackCount,
  deferredSnapshotPositivePairCount: new Set(
    deferredSnapshotPairs.map((entry) => `${entry.countyFips}:${entry.speciesId}`),
  ).size,
  deferredSnapshotSpeciesCount: new Set(deferredSnapshotPairs.map((entry) => entry.speciesId)).size,
  deferredSnapshotCountyCount: new Set(deferredSnapshotPairs.map((entry) => entry.countyFips)).size,
  totalEvidenceRecords: evidence.length,
  distinctDeterminations: {
    recordedPresent: presentPairs.size,
    officiallyAbsent: absentPairs.size,
    notDetected: notDetectedPairs.size,
  },
  researchRuns: runs.length,
  statewideScreenedSpeciesCount: new Set(
    runs.filter((run) => run.scope === "statewide-source-screen").flatMap((run) => run.targetSpeciesIds),
  ).size,
  parity: {
    expectedRecordedPresent: expectedPresent,
    expectedOfficiallyAbsent: expectedAbsent,
    expectedNotDetected,
    exact: true,
  },
  caveat:
    "Legacy fallback assertions preserve existing positive determinations whose exact source-to-county lineage cannot be reconstructed. Replace them only through a complete source-family rebuild.",
};

mkdirSync(RESEARCH_DIR, { recursive: true });
writeFileSync(LEDGER_PATH, `${evidence.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
writeFileSync(RUNS_PATH, `${JSON.stringify({ schemaVersion: 1, runs }, null, 2)}\n`);
writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(
  CANDIDATES_PATH,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      stateCode: STATE_CODE,
      generatedAt: migrationDate,
      candidateCount: deferredSnapshotPairs.length,
      distinctPairCount: new Set(
        deferredSnapshotPairs.map((entry) => `${entry.countyFips}:${entry.speciesId}`),
      ).size,
      candidates: deferredSnapshotPairs.sort(
        (left, right) =>
          left.countyFips.localeCompare(right.countyFips) ||
          left.speciesId.localeCompare(right.speciesId) ||
          left.sourceId.localeCompare(right.sourceId),
      ),
    },
    null,
    2,
  )}\n`,
);

console.log(JSON.stringify(report, null, 2));
