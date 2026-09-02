import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import { getStateDefinition, listCountyEquivalents } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";
import {
  EDDMAPS_SOURCE_ID,
  EDDMAPS_SNAPSHOT_PATH,
  type EddMapsReplayTarget,
} from "./adapters/eddmaps-snapshot-replay";

type Snapshot = {
  source: string;
  citation: string;
  snapshotDate: string;
  species: Array<{
    speciesId: string;
    subjectId: number;
    countyFips: string[];
  }>;
};

type CatalogSpecies = {
  id: string;
  scientificName: string;
  profileType?: string;
  registry?: { occurrenceId?: string };
};

type CountyProjection = {
  countyFips: string;
  pairs: Array<{
    speciesId: string;
    displayStatus: string;
  }>;
};

const ROOT = process.cwd();
const OFFICIAL_USE_BASIS_URLS = [
  "https://www.eddmaps.org/about/index.cfm",
  "https://www.eddmaps.org/about/appropriate_data.cfm",
  "https://www.eddmaps.org/about/collect_data.cfm",
] as const;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJson<T>(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value && !value.startsWith("--"), `Invalid planner argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const supported = new Set(["state", "evaluated-at", "output", "plan-id", "max-candidates"]);
  for (const key of values.keys()) assert(supported.has(key), `Unsupported planner argument --${key}.`);
  const stateCode = (values.get("state") ?? "").toUpperCase();
  assert(getStateDefinition(stateCode)?.nationalV1Scope, `Unknown national-v1 state ${stateCode || "missing"}.`);
  const evaluatedAt = new Date(values.get("evaluated-at") ?? "").toISOString();
  assert(Date.parse(evaluatedAt) <= Date.now(), "--evaluated-at cannot be in the future.");
  const outputPath = path.resolve(ROOT, values.get("output") ?? "");
  assert(outputPath.startsWith(`${ROOT}${path.sep}`), "--output must remain inside the repository.");
  const planId = values.get("plan-id") ?? "";
  assert(/^[a-z0-9][a-z0-9-]{2,127}$/u.test(planId), "--plan-id must contain 3 through 128 lowercase letters, digits, or hyphens.");
  const maxCandidates = Number(values.get("max-candidates") ?? 5000);
  assert(Number.isInteger(maxCandidates) && maxCandidates >= 1 && maxCandidates <= 5000, "--max-candidates must be from 1 through 5000.");
  return { stateCode, evaluatedAt, outputPath, planId, maxCandidates };
}

function countyPresenceSpeciesId(species: CatalogSpecies) {
  return species.profileType === "registry" && species.registry?.occurrenceId
    ? species.registry.occurrenceId
    : species.id;
}

export function selectEddMapsReplayTargets(
  targets: Array<EddMapsReplayTarget & { baselineStatus: string }>,
  maximum: number,
) {
  return [...targets]
    .sort((left, right) =>
      compareText(left.baselineStatus, right.baselineStatus) ||
      compareText(left.countyFips, right.countyFips) ||
      compareText(left.speciesId, right.speciesId),
    )
    .slice(0, maximum);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const snapshotPath = path.join(ROOT, EDDMAPS_SNAPSHOT_PATH);
  const snapshotBytes = readFileSync(snapshotPath);
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as Snapshot;
  assert(Date.parse(snapshot.snapshotDate) <= Date.parse(options.evaluatedAt), "EDDMapS snapshot is newer than the evaluation time.");
  const catalog = readJson<CatalogSpecies[]>(path.join(ROOT, "src/data/generated/species.json"));
  const catalogBySnapshotSpeciesId = new Map<string, CatalogSpecies>();
  for (const species of catalog) {
    const snapshotSpeciesId = countyPresenceSpeciesId(species);
    assert(!catalogBySnapshotSpeciesId.has(snapshotSpeciesId), `Duplicate EDDMapS catalog identity ${snapshotSpeciesId}.`);
    catalogBySnapshotSpeciesId.set(snapshotSpeciesId, species);
  }
  const countyFips = new Set(listCountyEquivalents(options.stateCode).map((county) => county.countyFips));
  const statusByPair = new Map<string, string>();
  for (const fips of [...countyFips].sort(compareText)) {
    const projectionPath = path.join(ROOT, `public/generated/research/${options.stateCode}/counties/${fips}.json`);
    const projection = readJson<CountyProjection>(projectionPath);
    assert(projection.countyFips === fips, `Projection county differs for ${fips}.`);
    for (const pair of projection.pairs) {
      statusByPair.set(`${fips}:${pair.speciesId}`, pair.displayStatus);
    }
  }

  const eligible: Array<EddMapsReplayTarget & { baselineStatus: string }> = [];
  const excluded = new Map<string, number>();
  let sourceRowsInState = 0;
  let unmatchedSnapshotSpecies = 0;
  let invalidCountyRows = 0;
  let outsideCurrentStateMatrixRows = 0;
  for (const snapshotSpecies of snapshot.species) {
    const species = catalogBySnapshotSpeciesId.get(snapshotSpecies.speciesId);
    if (!species) {
      unmatchedSnapshotSpecies += 1;
      continue;
    }
    for (const fips of snapshotSpecies.countyFips) {
      if (!fips.startsWith(getStateDefinition(options.stateCode)!.stateFips)) continue;
      sourceRowsInState += 1;
      if (!countyFips.has(fips)) {
        invalidCountyRows += 1;
        continue;
      }
      const pairKey = `${fips}:${species.id}`;
      const status = statusByPair.get(pairKey);
      if (!status) {
        outsideCurrentStateMatrixRows += 1;
        continue;
      }
      if (status === "verified-present" || status === "verified-absent") {
        excluded.set(status, (excluded.get(status) ?? 0) + 1);
        continue;
      }
      assert(
        status === "researched-unresolved" || status === "not-researched" || status === "not-detected",
        `Unsupported EDDMapS baseline status ${status} for ${pairKey}.`,
      );
      eligible.push({
        pairKey,
        countyFips: fips,
        speciesId: species.id,
        scientificName: species.scientificName,
        snapshotSpeciesId: snapshotSpecies.speciesId,
        subjectId: snapshotSpecies.subjectId,
        baselineStatus: status,
      });
    }
  }
  const uniqueEligible = [...new Map(eligible.map((entry) => [entry.pairKey, entry])).values()];
  const selected = selectEddMapsReplayTargets(uniqueEligible, options.maxCandidates);
  const targets = selected.map(({ baselineStatus: _baselineStatus, ...target }) => target);
  const baselineStatusCounts = Object.fromEntries(
    [...new Set(selected.map((entry) => entry.baselineStatus))]
      .sort(compareText)
      .map((status) => [status, selected.filter((entry) => entry.baselineStatus === status).length]),
  );
  const plan = {
    schemaVersion: 1,
    planId: options.planId,
    sourceId: EDDMAPS_SOURCE_ID,
    stateCode: options.stateCode,
    generatedAt: new Date().toISOString(),
    evaluatedAt: options.evaluatedAt,
    candidates: targets.map((target) => ({
      sourceId: EDDMAPS_SOURCE_ID,
      speciesId: target.speciesId,
      countyFips: target.countyFips,
    })),
    eddmapsReplay: {
      mode: "committed-snapshot-replay",
      snapshotPath: EDDMAPS_SNAPSHOT_PATH,
      snapshotSha256: sha256(snapshotBytes),
      snapshotDate: snapshot.snapshotDate,
      citation: snapshot.citation,
      officialUseBasisUrls: [...OFFICIAL_USE_BASIS_URLS],
      targets,
    },
    discovery: {
      sourceRowsInState,
      uniqueEligibleNetDeterminationCandidates: uniqueEligible.length,
      selectedNetDeterminationCandidates: selected.length,
      selectedBaselineStatusCounts: baselineStatusCounts,
      excludedExistingDeterminations: Object.fromEntries([...excluded.entries()].sort(([left], [right]) => compareText(left, right))),
      unmatchedSnapshotSpecies,
      invalidCountyRows,
      outsideCurrentStateMatrixRows,
      providerRequests: 0,
      sourceBytes: snapshotBytes.length,
      externalMutationCount: 0,
      semantics: {
        plannerCreatesEvidence: false,
        sourceSilenceCreatesAbsence: false,
        sourceSilenceCreatesNonDetection: false,
        acceptedClaim: "historical recorded presence from an undated positive aggregate",
      },
    },
  };
  await writeFile(options.outputPath, `${stableJson(plan)}\n`);
  const outputBytes = readFileSync(options.outputPath);
  console.log(JSON.stringify({
    outputPath: path.relative(ROOT, options.outputPath).split(path.sep).join("/"),
    outputSha256: sha256(outputBytes),
    sourceRowsInState,
    eligibleNetDeterminationCandidates: uniqueEligible.length,
    selectedNetDeterminationCandidates: selected.length,
    selectedBaselineStatusCounts: baselineStatusCounts,
    outsideCurrentStateMatrixRows,
    providerRequests: 0,
  }, null, 2));
}

if (process.argv[1]?.endsWith("plan-eddmaps-snapshot-state.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
