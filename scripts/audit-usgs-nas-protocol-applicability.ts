import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOURCE_ID = "usgs-nas";
const ARCHIVE_VERSION = "1.344";
const BASELINE_COMMIT = "baa9435781facf5c3fc74399219ca11b3fe196e8";
const OUTPUT_PATH = path.join(
  ROOT,
  "ops/national-research/evaluations/usgs-nas-applicability-2026-07-26.json",
);

type Outcome = {
  outcome_id: string;
  source_id: string;
  state_code: string;
  county_fips: string;
  species_id: string;
  status: "evidence-found" | "no-qualifying-evidence" | "blocked" | "failed";
  scope_complete: boolean;
  recorded_at: string;
};

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(bytes: string) {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function gitJson<T>(relativePath: string): T {
  return JSON.parse(
    execFileSync("git", ["show", `${BASELINE_COMMIT}:${relativePath}`], {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
    }),
  ) as T;
}

const planDirectory = path.join(
  ROOT,
  "src/data/research/national-acquisition-plans",
);
const planFiles = readdirSync(planDirectory)
  .filter((entry) => /^usgs-nas-.*\.json$/.test(entry))
  .sort(compareText);
const plannedStateSpecies = new Set<string>();
for (const filename of planFiles) {
  const plan = readJson<{
    sourceId: string;
    archiveVersion: string;
    screens: Array<{ stateCode: string; speciesId: string }>;
  }>(path.join(planDirectory, filename));
  if (plan.sourceId !== SOURCE_ID || plan.archiveVersion !== ARCHIVE_VERSION) {
    throw new Error(`Unexpected USGS NAS plan contract in ${filename}.`);
  }
  for (const screen of plan.screens) {
    plannedStateSpecies.add(`${screen.stateCode}:${screen.speciesId}`);
  }
}

const countyRegistry = readJson<{
  countyEquivalents: Array<{ countyFips: string; stateCode: string; status: string }>;
}>(path.join(ROOT, "src/data/research/county-equivalent-registry.json"));
const countiesByState = new Map<string, string[]>();
for (const county of countyRegistry.countyEquivalents) {
  if (county.status !== "active") continue;
  const values = countiesByState.get(county.stateCode) ?? [];
  values.push(county.countyFips);
  countiesByState.set(county.stateCode, values);
}
for (const values of countiesByState.values()) values.sort(compareText);

const plannedPairKeys = new Set<string>();
for (const stateSpecies of plannedStateSpecies) {
  const separator = stateSpecies.indexOf(":");
  const stateCode = stateSpecies.slice(0, separator);
  const speciesId = stateSpecies.slice(separator + 1);
  for (const countyFips of countiesByState.get(stateCode) ?? []) {
    plannedPairKeys.add(`${stateCode}:${countyFips}:${speciesId}`);
  }
}

const latestOutcomes = new Map<string, Outcome>();
const runDirectory = path.join(ROOT, "src/data/research/runs");
for (const runId of readdirSync(runDirectory).sort(compareText)) {
  const outcomePath = path.join(runDirectory, runId, "outcomes.ndjson");
  let rows: string;
  try {
    rows = readFileSync(outcomePath, "utf8");
  } catch {
    continue;
  }
  for (const line of rows.split("\n").filter(Boolean)) {
    const outcome = JSON.parse(line) as Outcome;
    if (outcome.source_id !== SOURCE_ID) continue;
    const key = `${outcome.state_code}:${outcome.county_fips}:${outcome.species_id}`;
    if (!plannedPairKeys.has(key)) continue;
    const previous = latestOutcomes.get(key);
    if (
      !previous ||
      outcome.recorded_at > previous.recorded_at ||
      (outcome.recorded_at === previous.recorded_at &&
        outcome.outcome_id > previous.outcome_id)
    ) {
      latestOutcomes.set(key, outcome);
    }
  }
}

const outcomeStatusCounts = {
  evidenceFound: 0,
  noQualifyingEvidence: 0,
  blocked: 0,
  failed: 0,
};
const blockedCells = new Map<string, string[]>();
let completePairScreens = 0;
for (const [key, outcome] of latestOutcomes) {
  if (outcome.status === "evidence-found") outcomeStatusCounts.evidenceFound += 1;
  if (outcome.status === "no-qualifying-evidence") {
    outcomeStatusCounts.noQualifyingEvidence += 1;
  }
  if (outcome.status === "blocked") outcomeStatusCounts.blocked += 1;
  if (outcome.status === "failed") outcomeStatusCounts.failed += 1;
  if (outcome.scope_complete) completePairScreens += 1;
  if (outcome.status === "blocked") {
    const [stateCode, countyFips, speciesId] = key.split(":");
    const cellKey = `${stateCode}:${speciesId}`;
    const values = blockedCells.get(cellKey) ?? [];
    values.push(countyFips!);
    blockedCells.set(cellKey, values);
  }
}

const configuredStates = readJson<{ states: Array<{ stateCode: string }> }>(
  path.join(ROOT, "src/data/research/state-research-config.json"),
);
const stateCodes = configuredStates.states
  .map((entry) => entry.stateCode)
  .sort(compareText);
const baseline = {
  applicableStateSpeciesCells: 0,
  targetCountyPairScreens: 0,
  completeCountyPairScreens: 0,
  blockedCountyPairScreens: 0,
  incompleteCountyPairScreens: 0,
};
for (const stateCode of stateCodes) {
  const projection = gitJson<{
    cells: Array<{
      sourceId: string;
      applicabilityStatus: string;
      targetCountyCount: number;
      completeOutcomeCountyCount: number;
      blockedOutcomeCountyCount: number;
      incompleteCountyCount: number;
    }>;
  }>(`src/data/generated/research/${stateCode}/protocol-cells.json`);
  for (const cell of projection.cells) {
    if (
      cell.sourceId !== SOURCE_ID ||
      cell.applicabilityStatus !== "applicable"
    ) {
      continue;
    }
    baseline.applicableStateSpeciesCells += 1;
    baseline.targetCountyPairScreens += cell.targetCountyCount;
    baseline.completeCountyPairScreens += cell.completeOutcomeCountyCount;
    baseline.blockedCountyPairScreens += cell.blockedOutcomeCountyCount;
    baseline.incompleteCountyPairScreens += cell.incompleteCountyCount;
  }
}

const final = {
  applicableStateSpeciesCells: plannedStateSpecies.size,
  targetCountyPairScreens: plannedPairKeys.size,
  reportedCountyPairOutcomes: latestOutcomes.size,
  completeCountyPairScreens: completePairScreens,
  blockedCountyPairScreens: outcomeStatusCounts.blocked,
  incompleteCountyPairScreens: plannedPairKeys.size - completePairScreens,
  unreportedCountyPairScreens: plannedPairKeys.size - latestOutcomes.size,
};
const artifact = {
  schemaVersion: 1,
  evaluationId: "usgs-nas-applicability-2026-07-26",
  sourceId: SOURCE_ID,
  archiveVersion: ARCHIVE_VERSION,
  archiveSha256:
    "563b13cbf2f83337c9528898ecb0a7de0719e3b68518147d638e60bc8c585f28",
  archiveReacquired: false,
  evaluatedAt: "2026-07-26T12:15:00Z",
  historicalBaseline: {
    commit: BASELINE_COMMIT,
    ...baseline,
  },
  correctedApplicability: final,
  net: {
    applicableStateSpeciesCells:
      final.applicableStateSpeciesCells - baseline.applicableStateSpeciesCells,
    targetCountyPairScreens:
      final.targetCountyPairScreens - baseline.targetCountyPairScreens,
    completeCountyPairScreens:
      final.completeCountyPairScreens - baseline.completeCountyPairScreens,
    blockedCountyPairScreens:
      final.blockedCountyPairScreens - baseline.blockedCountyPairScreens,
    incompleteCountyPairScreens:
      final.incompleteCountyPairScreens - baseline.incompleteCountyPairScreens,
  },
  outcomeStatusCounts,
  blockedStateSpeciesCells: [...blockedCells]
    .sort(([left], [right]) => compareText(left, right))
    .map(([stateSpecies, countyFips]) => ({
      stateSpecies,
      countyFips: countyFips.sort(compareText),
      blockedCountyCount: countyFips.length,
    })),
  planFiles,
  planSetSha256: sha256(`${planFiles.join("\n")}\n`),
  semanticAttestation: {
    correctedApplicabilityCreatesEvidence: false,
    sourceSilenceCreatesAbsence: false,
    sourceSilenceCreatesNotDetected: false,
    blockedGeographyPreserved: true,
    coordinateDerivedCountyRoutingUsed: false,
  },
};

if (final.reportedCountyPairOutcomes !== final.targetCountyPairScreens) {
  throw new Error(
    `USGS NAS planned screens are not fully reported: ${final.reportedCountyPairOutcomes}/${final.targetCountyPairScreens}.`,
  );
}
if (
  final.completeCountyPairScreens + final.blockedCountyPairScreens !==
  final.targetCountyPairScreens
) {
  throw new Error("USGS NAS complete and blocked outcomes do not cover the plan.");
}

writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
