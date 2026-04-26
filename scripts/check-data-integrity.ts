import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { countyPresenceOverrides } from "@/data/source/county-presence-overrides";
import { countySpeciesStatusOverrides } from "@/data/source/county-species-status-overrides";
import type {
  CountyCoverageSnapshotFile,
  CountyDataSourceName,
  CountySpeciesNonPresenceStatus,
} from "@/lib/data/types";

type SpeciesRecord = {
  id: string;
  slug: string;
  registry?: {
    occurrenceId: string;
    hasCountyData: boolean;
    mappedCountyCount?: number;
    countyDataSources?: Array<{
      source: CountyDataSourceName;
      externalId: string;
      url: string;
    }>;
  };
};

type CountyRecord = {
  countyFips: string;
  stateCode: string;
};

type CountyPresenceRecord = {
  countyFips: string;
  speciesIds: string[];
};

type RuntimeSnapshot = {
  coverageSummary: {
    catalogSpeciesCount: number;
    mappedSpeciesCount: number;
    unmatchedSpeciesCount: number;
    sourceSpeciesCounts: Partial<Record<CountyDataSourceName, number>>;
  };
};

type StateCoverageMatrix = {
  stateCode: string;
  summary: {
    countyCount: number;
    speciesCount: number;
    totalDeterminations: number;
    presentVerifiedDeterminations: number;
    verifiedAbsentDeterminations: number;
    notDetectedDeterminations: number;
    knownDeterminations: number;
    unknownDeterminations: number;
    knownPercent: number;
  };
  counties: Array<{
    countyFips: string;
    presentVerifiedSpeciesIds: string[];
    verifiedAbsentSpeciesIds: string[];
    notDetectedSpeciesIds: string[];
    knownDeterminations: number;
    unknownDeterminations: number;
    knownPercent: number;
  }>;
  species: Array<{
    speciesId: string;
    presentVerifiedCountyFips: string[];
    verifiedAbsentCountyFips: string[];
    notDetectedCountyFips: string[];
    knownCountyCount: number;
    unknownCountyCount: number;
  }>;
};

type CheckContext = {
  species: SpeciesRecord[];
  speciesIds: Set<string>;
  validSourceSpeciesIds: Set<string>;
  counties: Record<string, CountyRecord>;
  countyFips: Set<string>;
  presence: Record<string, CountyPresenceRecord>;
  explorerPresence: Record<string, number[]>;
  runtimeSnapshot: RuntimeSnapshot;
  sourceSnapshot: CountyCoverageSnapshotFile;
};

type CheckResult = {
  name: string;
  detail: string;
};

const errors: string[] = [];
const results: CheckResult[] = [];

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(resolve(process.cwd(), filepath), "utf8")) as T;
}

function fail(message: string) {
  errors.push(message);
}

function pass(name: string, detail: string) {
  results.push({ name, detail });
}

function duplicateValues(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return [...duplicates].sort();
}

function setKey(values: string[]) {
  return [...values].sort().join("\u0000");
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function assertNoDuplicates(values: string[], label: string) {
  const duplicates = duplicateValues(values);
  if (duplicates.length > 0) {
    fail(`${label} has duplicate values: ${duplicates.slice(0, 20).join(", ")}`);
  }
}

function checkSpeciesIdentity(ctx: CheckContext) {
  assertNoDuplicates(ctx.species.map((entry) => entry.id), "Generated species IDs");
  assertNoDuplicates(ctx.species.map((entry) => entry.slug), "Generated species slugs");

  pass("species identity", `${ctx.species.length} species with unique IDs and slugs`);
}

function checkRuntimePresence(ctx: CheckContext) {
  let presentDeterminations = 0;
  const mappedSpeciesIds = new Set<string>();

  for (const [countyFips, record] of Object.entries(ctx.presence)) {
    if (!ctx.countyFips.has(countyFips)) {
      fail(`Generated presence has unknown county FIPS: ${countyFips}`);
    }
    if (record.countyFips !== countyFips) {
      fail(`Generated presence key ${countyFips} does not match record countyFips ${record.countyFips}`);
    }

    assertNoDuplicates(record.speciesIds, `Generated presence species IDs for ${countyFips}`);

    for (const speciesId of record.speciesIds) {
      if (!ctx.speciesIds.has(speciesId)) {
        fail(`Generated presence for ${countyFips} references unknown species: ${speciesId}`);
      }
      mappedSpeciesIds.add(speciesId);
      presentDeterminations += 1;
    }
  }

  const summary = ctx.runtimeSnapshot.coverageSummary;
  if (summary.catalogSpeciesCount !== ctx.species.length) {
    fail(`Runtime catalogSpeciesCount ${summary.catalogSpeciesCount} does not match generated species ${ctx.species.length}`);
  }
  if (summary.mappedSpeciesCount !== mappedSpeciesIds.size) {
    fail(`Runtime mappedSpeciesCount ${summary.mappedSpeciesCount} does not match presence species count ${mappedSpeciesIds.size}`);
  }
  if (summary.unmatchedSpeciesCount !== ctx.species.length - mappedSpeciesIds.size) {
    fail(`Runtime unmatchedSpeciesCount ${summary.unmatchedSpeciesCount} does not match generated species minus mapped species`);
  }

  pass(
    "runtime presence",
    `${mappedSpeciesIds.size} mapped species and ${presentDeterminations} county-species presence rows`,
  );
}

function checkExplorerPresence(ctx: CheckContext) {
  for (const [countyFips, speciesIndexes] of Object.entries(ctx.explorerPresence)) {
    if (!ctx.countyFips.has(countyFips)) {
      fail(`Explorer presence has unknown county FIPS: ${countyFips}`);
    }

    const runtimeRecord = ctx.presence[countyFips];
    if (!runtimeRecord) {
      fail(`Explorer presence has county ${countyFips} missing from runtime presence`);
      continue;
    }

    const resolvedSpeciesIds: string[] = [];
    for (const index of speciesIndexes) {
      if (!Number.isInteger(index) || index < 0 || index >= ctx.species.length) {
        fail(`Explorer presence for ${countyFips} has invalid species index: ${index}`);
        continue;
      }
      resolvedSpeciesIds.push(ctx.species[index]!.id);
    }

    if (setKey(resolvedSpeciesIds) !== setKey(runtimeRecord.speciesIds)) {
      fail(`Explorer presence for ${countyFips} does not match runtime presence species IDs`);
    }
  }

  pass("explorer presence", `${Object.keys(ctx.explorerPresence).length} county index rows match runtime presence`);
}

function checkSourceSnapshot(ctx: CheckContext) {
  assertNoDuplicates(
    ctx.sourceSnapshot.species.map((entry) => entry.speciesId),
    "County source snapshot species IDs",
  );

  const mappedSourceSpecies = ctx.sourceSnapshot.species.filter((entry) => entry.countyFips.length > 0);
  const sourceCounts: Partial<Record<CountyDataSourceName, number>> = {};

  for (const entry of ctx.sourceSnapshot.species) {
    if (!ctx.validSourceSpeciesIds.has(entry.speciesId)) {
      fail(`County source snapshot references unknown species or registry occurrence ID: ${entry.speciesId}`);
    }

    assertNoDuplicates(entry.countyFips, `County source snapshot county FIPS for ${entry.speciesId}`);

    for (const countyFips of entry.countyFips) {
      if (!ctx.countyFips.has(countyFips)) {
        fail(`County source snapshot species ${entry.speciesId} references unknown county FIPS: ${countyFips}`);
      }
    }

    for (const source of new Set(entry.countyDataSources.map((item) => item.source))) {
      sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
    }
  }

  const summary = ctx.sourceSnapshot.coverageSummary;
  if (summary.catalogSpeciesCount !== ctx.species.length) {
    fail(`Source snapshot catalogSpeciesCount ${summary.catalogSpeciesCount} does not match generated species ${ctx.species.length}`);
  }
  if (summary.mappedSpeciesCount !== mappedSourceSpecies.length) {
    fail(`Source snapshot mappedSpeciesCount ${summary.mappedSpeciesCount} does not match mapped source species ${mappedSourceSpecies.length}`);
  }
  if (summary.unmatchedSpeciesCount !== summary.catalogSpeciesCount - mappedSourceSpecies.length) {
    fail(`Source snapshot unmatchedSpeciesCount ${summary.unmatchedSpeciesCount} does not match catalog minus mapped source species`);
  }

  const expectedSources = Object.entries(sourceCounts).sort();
  const actualSources = Object.entries(summary.sourceSpeciesCounts).sort();
  if (JSON.stringify(actualSources) !== JSON.stringify(expectedSources)) {
    fail("Source snapshot sourceSpeciesCounts do not match species countyDataSources");
  }

  pass("source snapshot", `${mappedSourceSpecies.length} mapped source species with valid county FIPS`);
}

function checkRuntimeSourceCounts(ctx: CheckContext) {
  const runtimeSourceCounts: Partial<Record<CountyDataSourceName, number>> = {};
  for (const species of ctx.species) {
    for (const source of new Set((species.registry?.countyDataSources ?? []).map((entry) => entry.source))) {
      runtimeSourceCounts[source] = (runtimeSourceCounts[source] ?? 0) + 1;
    }
  }

  const expectedSources = Object.entries(runtimeSourceCounts).sort();
  const actualSources = Object.entries(ctx.runtimeSnapshot.coverageSummary.sourceSpeciesCounts).sort();
  if (JSON.stringify(actualSources) !== JSON.stringify(expectedSources)) {
    fail("Runtime snapshot sourceSpeciesCounts do not match generated species countyDataSources");
  }

  pass("runtime source counts", `${expectedSources.length} runtime source families match generated species metadata`);
}

function checkPresenceOverrides(ctx: CheckContext) {
  for (const override of countyPresenceOverrides) {
    if (!ctx.validSourceSpeciesIds.has(override.speciesId)) {
      fail(`County presence override references unknown species or registry occurrence ID: ${override.speciesId}`);
    }
    assertNoDuplicates(override.countyFips, `County presence override county FIPS for ${override.speciesId}`);
    for (const countyFips of override.countyFips) {
      if (!ctx.countyFips.has(countyFips)) {
        fail(`County presence override for ${override.speciesId} references unknown county FIPS: ${countyFips}`);
      }
    }
  }

  pass("presence overrides", `${countyPresenceOverrides.length} manual presence override records checked`);
}

function addStatus(
  statusesByCountySpecies: Map<string, Set<CountySpeciesNonPresenceStatus>>,
  countyFips: string,
  speciesId: string,
  status: CountySpeciesNonPresenceStatus,
) {
  const key = `${countyFips}:${speciesId}`;
  const statuses = statusesByCountySpecies.get(key) ?? new Set<CountySpeciesNonPresenceStatus>();
  statuses.add(status);
  statusesByCountySpecies.set(key, statuses);
}

function checkStatusOverrides(ctx: CheckContext) {
  const statusesByCountySpecies = new Map<string, Set<CountySpeciesNonPresenceStatus>>();

  for (const override of countySpeciesStatusOverrides) {
    if (!ctx.speciesIds.has(override.speciesId)) {
      fail(`County status override references unknown species: ${override.speciesId}`);
    }
    if (!ctx.countyFips.has(override.countyFips)) {
      fail(`County status override references unknown county FIPS: ${override.countyFips}`);
    }
    if (override.status !== "verified-absent" && override.status !== "not-detected") {
      fail(`County status override has unsupported status: ${override.countyFips}:${override.speciesId}:${override.status}`);
    }
    if (!override.source.url || !override.source.label) {
      fail(`County status override is missing source metadata: ${override.countyFips}:${override.speciesId}`);
    }

    const presentSpecies = ctx.presence[override.countyFips]?.speciesIds ?? [];
    if (presentSpecies.includes(override.speciesId)) {
      fail(`County status override conflicts with verified presence: ${override.countyFips}:${override.speciesId}`);
    }

    addStatus(statusesByCountySpecies, override.countyFips, override.speciesId, override.status);
  }

  for (const [key, statuses] of statusesByCountySpecies) {
    if (statuses.size > 1) {
      fail(`County status override has conflicting statuses for ${key}: ${[...statuses].join(", ")}`);
    }
  }

  pass("status overrides", `${countySpeciesStatusOverrides.length} non-presence status override records checked`);
}

function checkStateMatrix(ctx: CheckContext, filepath: string) {
  const matrix = readJson<StateCoverageMatrix>(filepath);
  const stateCountyFips = new Set(
    Object.values(ctx.counties)
      .filter((county) => county.stateCode === matrix.stateCode)
      .map((county) => county.countyFips),
  );

  let presentVerifiedDeterminations = 0;
  let verifiedAbsentDeterminations = 0;
  let notDetectedDeterminations = 0;
  let knownDeterminations = 0;
  let unknownDeterminations = 0;

  if (matrix.summary.countyCount !== stateCountyFips.size) {
    fail(`${filepath} countyCount ${matrix.summary.countyCount} does not match generated counties for ${matrix.stateCode}`);
  }
  if (matrix.summary.speciesCount !== ctx.species.length) {
    fail(`${filepath} speciesCount ${matrix.summary.speciesCount} does not match generated species`);
  }
  if (matrix.summary.totalDeterminations !== stateCountyFips.size * ctx.species.length) {
    fail(`${filepath} totalDeterminations does not match county count times species count`);
  }

  for (const county of matrix.counties) {
    if (!stateCountyFips.has(county.countyFips)) {
      fail(`${filepath} has county outside state ${matrix.stateCode}: ${county.countyFips}`);
    }

    assertNoDuplicates(county.presentVerifiedSpeciesIds, `${filepath} present species for ${county.countyFips}`);
    assertNoDuplicates(county.verifiedAbsentSpeciesIds, `${filepath} absent species for ${county.countyFips}`);
    assertNoDuplicates(county.notDetectedSpeciesIds, `${filepath} not-detected species for ${county.countyFips}`);

    const overlapChecks = [
      ["verified-present and verified-absent", county.presentVerifiedSpeciesIds, county.verifiedAbsentSpeciesIds],
      ["verified-present and not-detected", county.presentVerifiedSpeciesIds, county.notDetectedSpeciesIds],
      ["verified-absent and not-detected", county.verifiedAbsentSpeciesIds, county.notDetectedSpeciesIds],
    ] as const;
    for (const [label, left, right] of overlapChecks) {
      const overlap = left.filter((speciesId) => right.includes(speciesId));
      if (overlap.length > 0) {
        fail(`${filepath} ${county.countyFips} has species in both ${label}: ${overlap.join(", ")}`);
      }
    }

    const countyKnown =
      county.presentVerifiedSpeciesIds.length +
      county.verifiedAbsentSpeciesIds.length +
      county.notDetectedSpeciesIds.length;
    if (county.knownDeterminations !== countyKnown) {
      fail(`${filepath} ${county.countyFips} knownDeterminations does not match status arrays`);
    }
    if (county.unknownDeterminations !== ctx.species.length - countyKnown) {
      fail(`${filepath} ${county.countyFips} unknownDeterminations does not match species count minus known`);
    }
    if (county.knownPercent !== roundPercent((countyKnown / ctx.species.length) * 100)) {
      fail(`${filepath} ${county.countyFips} knownPercent does not match known divided by species count`);
    }

    for (const speciesId of [
      ...county.presentVerifiedSpeciesIds,
      ...county.verifiedAbsentSpeciesIds,
      ...county.notDetectedSpeciesIds,
    ]) {
      if (!ctx.speciesIds.has(speciesId)) {
        fail(`${filepath} county ${county.countyFips} references unknown species: ${speciesId}`);
      }
    }

    presentVerifiedDeterminations += county.presentVerifiedSpeciesIds.length;
    verifiedAbsentDeterminations += county.verifiedAbsentSpeciesIds.length;
    notDetectedDeterminations += county.notDetectedSpeciesIds.length;
    knownDeterminations += county.knownDeterminations;
    unknownDeterminations += county.unknownDeterminations;
  }

  for (const species of matrix.species) {
    if (!ctx.speciesIds.has(species.speciesId)) {
      fail(`${filepath} species matrix references unknown species: ${species.speciesId}`);
    }
    for (const countyFips of [
      ...species.presentVerifiedCountyFips,
      ...species.verifiedAbsentCountyFips,
      ...species.notDetectedCountyFips,
    ]) {
      if (!stateCountyFips.has(countyFips)) {
        fail(`${filepath} species ${species.speciesId} references county outside ${matrix.stateCode}: ${countyFips}`);
      }
    }

    const speciesKnown =
      species.presentVerifiedCountyFips.length +
      species.verifiedAbsentCountyFips.length +
      species.notDetectedCountyFips.length;
    if (species.knownCountyCount !== speciesKnown) {
      fail(`${filepath} species ${species.speciesId} knownCountyCount does not match status arrays`);
    }
    if (species.unknownCountyCount !== stateCountyFips.size - speciesKnown) {
      fail(`${filepath} species ${species.speciesId} unknownCountyCount does not match county count minus known`);
    }
  }

  const summaryChecks: Array<[string, number, number]> = [
    ["presentVerifiedDeterminations", matrix.summary.presentVerifiedDeterminations, presentVerifiedDeterminations],
    ["verifiedAbsentDeterminations", matrix.summary.verifiedAbsentDeterminations, verifiedAbsentDeterminations],
    ["notDetectedDeterminations", matrix.summary.notDetectedDeterminations, notDetectedDeterminations],
    ["knownDeterminations", matrix.summary.knownDeterminations, knownDeterminations],
    ["unknownDeterminations", matrix.summary.unknownDeterminations, unknownDeterminations],
  ];

  for (const [label, actual, expected] of summaryChecks) {
    if (actual !== expected) {
      fail(`${filepath} summary ${label} ${actual} does not match summed county value ${expected}`);
    }
  }
  if (matrix.summary.knownPercent !== roundPercent((knownDeterminations / matrix.summary.totalDeterminations) * 100)) {
    fail(`${filepath} summary knownPercent does not match known divided by total determinations`);
  }

  pass("state matrix", `${matrix.stateCode} matrix has ${knownDeterminations} known determinations`);
}

const ctx: CheckContext = {
  species: readJson<SpeciesRecord[]>("src/data/generated/species.json"),
  speciesIds: new Set(),
  validSourceSpeciesIds: new Set(),
  counties: readJson<Record<string, CountyRecord>>("src/data/generated/counties.json"),
  countyFips: new Set(),
  presence: readJson<Record<string, CountyPresenceRecord>>("src/data/generated/presence.json"),
  explorerPresence: readJson<Record<string, number[]>>("src/data/generated/explorer-presence.json"),
  runtimeSnapshot: readJson<RuntimeSnapshot>("src/data/generated/snapshot.json"),
  sourceSnapshot: readJson<CountyCoverageSnapshotFile>("src/data/source/county-presence-snapshot.json"),
};

ctx.speciesIds = new Set(ctx.species.map((entry) => entry.id));
ctx.validSourceSpeciesIds = new Set([
  ...ctx.species.map((entry) => entry.id),
  ...ctx.species.flatMap((entry) => entry.registry?.occurrenceId ? [entry.registry.occurrenceId] : []),
]);
ctx.countyFips = new Set(Object.keys(ctx.counties));

checkSpeciesIdentity(ctx);
checkRuntimePresence(ctx);
checkExplorerPresence(ctx);
checkSourceSnapshot(ctx);
checkRuntimeSourceCounts(ctx);
checkPresenceOverrides(ctx);
checkStatusOverrides(ctx);
checkStateMatrix(ctx, "docs/county-coverage/states/AL.json");

if (errors.length > 0) {
  console.error(`Data integrity check failed with ${errors.length} error(s):`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Data integrity check passed:");
for (const result of results) {
  console.log(`- ${result.name}: ${result.detail}`);
}
