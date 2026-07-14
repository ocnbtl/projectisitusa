import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import type {
  EvidenceAssertion,
  ResearchCountyFile,
  ResearchRunReceipt,
  ResearchSourceRegistry,
  ResearchStateSummary,
} from "@/lib/research/types";

type SpeciesRecord = { id: string };
type CountyRecord = { countyFips: string; stateCode: string };
type MatrixFile = {
  summary: {
    totalDeterminations: number;
    presentVerifiedDeterminations: number;
    verifiedAbsentDeterminations: number;
    notDetectedDeterminations: number;
  };
  counties: Array<{
    countyFips: string;
    presentVerifiedSpeciesIds: string[];
    verifiedAbsentSpeciesIds: string[];
    notDetectedSpeciesIds: string[];
  }>;
};
type RunsFile = { schemaVersion: 1; runs: ResearchRunReceipt[] };

const ROOT = process.cwd();

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function readNdjson<T>(filepath: string): T[] {
  return readFileSync(filepath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

function assertUnique(values: string[], label: string) {
  assert(new Set(values).size === values.length, `${label} contains duplicate values.`);
}

const registryPath = path.join(ROOT, "src/data/research/source-registry.json");
const evidencePath = path.join(ROOT, "src/data/research/evidence-assertions.ndjson");
const runsPath = path.join(ROOT, "src/data/research/research-runs.json");
const summaryPath = path.join(ROOT, "src/data/generated/research/AL/summary.json");
const publicSummaryPath = path.join(ROOT, "public/generated/research/AL/summary.json");
const publicCountyDir = path.join(ROOT, "public/generated/research/AL/counties");

for (const filepath of [registryPath, evidencePath, runsPath, summaryPath, publicSummaryPath]) {
  assert(existsSync(filepath), `Missing required research artifact: ${path.relative(ROOT, filepath)}`);
}

const speciesIds = new Set(
  readJson<SpeciesRecord[]>(path.join(ROOT, "src/data/generated/species.json")).map((entry) => entry.id),
);
const alabamaCountyFips = new Set(
  Object.values(readJson<Record<string, CountyRecord>>(path.join(ROOT, "src/data/generated/counties.json")))
    .filter((county) => county.stateCode === "AL")
    .map((county) => county.countyFips),
);
const matrix = readJson<MatrixFile>(path.join(ROOT, "docs/county-coverage/states/AL.json"));
const registry = readJson<ResearchSourceRegistry>(registryPath);
const evidence = readNdjson<EvidenceAssertion>(evidencePath);
const runs = readJson<RunsFile>(runsPath).runs;
const summary = readJson<ResearchStateSummary>(summaryPath);

assert(registry.schemaVersion === 1, "Unsupported source registry schema version.");
assertUnique(registry.sources.map((source) => source.id), "Source IDs");
const registryLabels = registry.sources.flatMap((source) => [source.label, ...source.aliases]).map((label) => label.toLowerCase());
assertUnique(registryLabels, "Source labels and aliases");
const sourceById = new Map(registry.sources.map((source) => [source.id, source]));

assertUnique(evidence.map((entry) => entry.evidenceId), "Evidence IDs");
for (const entry of evidence) {
  assert(entry.stateCode === "AL", `Evidence ${entry.evidenceId} has unexpected state ${entry.stateCode}.`);
  assert(alabamaCountyFips.has(entry.countyFips), `Evidence ${entry.evidenceId} has unknown county ${entry.countyFips}.`);
  assert(speciesIds.has(entry.speciesId), `Evidence ${entry.evidenceId} has unknown species ${entry.speciesId}.`);
  const source = sourceById.get(entry.sourceId);
  assert(source, `Evidence ${entry.evidenceId} has unknown source ${entry.sourceId}.`);
  assert(
    source.evidenceCapabilities.includes(entry.assertion),
    `Evidence ${entry.evidenceId} uses unsupported assertion ${entry.assertion} for ${entry.sourceId}.`,
  );
  assert(/^https?:\/\//.test(entry.url), `Evidence ${entry.evidenceId} has a non-HTTP source URL.`);
}

assertUnique(runs.map((run) => run.runId), "Research run IDs");
for (const run of runs) {
  assert(sourceById.has(run.sourceId), `Research run ${run.runId} has unknown source ${run.sourceId}.`);
  for (const speciesId of [...run.targetSpeciesIds, ...run.acceptedSpeciesIds]) {
    assert(speciesIds.has(speciesId), `Research run ${run.runId} has unknown species ${speciesId}.`);
  }
  assertUnique(run.targetSpeciesIds, `Research run ${run.runId} target species`);
  assertUnique(run.acceptedSpeciesIds, `Research run ${run.runId} accepted species`);
}

const presentPairs = new Set(
  evidence.filter((entry) => entry.assertion === "recorded-present").map((entry) => pairKey(entry.countyFips, entry.speciesId)),
);
const absentPairs = new Set(
  evidence.filter((entry) => entry.assertion === "officially-absent").map((entry) => pairKey(entry.countyFips, entry.speciesId)),
);
const notDetectedPairs = new Set(
  evidence.filter((entry) => entry.assertion === "not-detected").map((entry) => pairKey(entry.countyFips, entry.speciesId)),
);
const matrixPresentPairs = new Set(
  matrix.counties.flatMap((county) => county.presentVerifiedSpeciesIds.map((speciesId) => pairKey(county.countyFips, speciesId))),
);
const matrixAbsentPairs = new Set(
  matrix.counties.flatMap((county) => county.verifiedAbsentSpeciesIds.map((speciesId) => pairKey(county.countyFips, speciesId))),
);
const matrixNotDetectedPairs = new Set(
  matrix.counties.flatMap((county) => county.notDetectedSpeciesIds.map((speciesId) => pairKey(county.countyFips, speciesId))),
);

assert(presentPairs.size === matrixPresentPairs.size, "Recorded-present evidence does not match the current matrix count.");
assert(absentPairs.size === matrixAbsentPairs.size, "Officially-absent evidence does not match the current matrix count.");
assert(notDetectedPairs.size === matrixNotDetectedPairs.size, "Not-detected evidence does not match the current matrix count.");
for (const key of matrixPresentPairs) assert(presentPairs.has(key), `Missing present evidence for ${key}.`);
for (const key of matrixAbsentPairs) assert(absentPairs.has(key), `Missing absence evidence for ${key}.`);
for (const key of matrixNotDetectedPairs) assert(notDetectedPairs.has(key), `Missing not-detected evidence for ${key}.`);

const totals = summary.summary;
assert(summary.stateCode === "AL", "Generated summary is not Alabama.");
assert(totals.speciesCount === speciesIds.size, "Generated summary species count is stale.");
assert(totals.countyCount === alabamaCountyFips.size, "Generated summary county count is stale.");
assert(totals.totalPairs === totals.speciesCount * totals.countyCount, "Generated total pair count is invalid.");
assert(
  totals.verifiedPresent +
    totals.verifiedAbsent +
    totals.notDetected +
    totals.researchedUnresolved +
    totals.notResearched ===
    totals.totalPairs,
  "Generated status counts do not sum to the total pair count.",
);
assert(totals.verifiedPresent === matrix.summary.presentVerifiedDeterminations, "Generated present count changed matrix semantics.");
assert(totals.verifiedAbsent === matrix.summary.verifiedAbsentDeterminations, "Generated absence count changed matrix semantics.");
assert(totals.notDetected === matrix.summary.notDetectedDeterminations, "Generated not-detected count changed matrix semantics.");
assert(totals.conflictCount === 0, "Generated research index contains present versus absence conflicts.");
assert(
  readFileSync(summaryPath, "utf8") === readFileSync(publicSummaryPath, "utf8"),
  "Source and public research summaries differ.",
);

const publicCountyFiles = readdirSync(publicCountyDir).filter((filename) => filename.endsWith(".json")).sort();
assert(publicCountyFiles.length === alabamaCountyFips.size, "Wrong number of public county research files.");

let countyPresent = 0;
let countyAbsent = 0;
let countyNotDetected = 0;
let countyResearchedUnresolved = 0;
let countyNotResearched = 0;
for (const filename of publicCountyFiles) {
  const publicPath = path.join(publicCountyDir, filename);
  const county = readJson<ResearchCountyFile>(publicPath);
  assert(alabamaCountyFips.has(county.countyFips), `${filename} has an unknown county FIPS.`);
  assert(county.pairs.length === speciesIds.size, `${filename} does not contain every catalog species.`);
  assertUnique(county.pairs.map((pair) => pair.speciesId), `${filename} species rows`);
  const sum =
    county.summary.verifiedPresent +
    county.summary.verifiedAbsent +
    county.summary.notDetected +
    county.summary.researchedUnresolved +
    county.summary.notResearched;
  assert(sum === speciesIds.size, `${filename} status counts do not sum to the species count.`);
  for (const pair of county.pairs) {
    assert(speciesIds.has(pair.speciesId), `${filename} has unknown species ${pair.speciesId}.`);
    if (["verified-present", "verified-absent", "not-detected"].includes(pair.displayStatus)) {
      assert(pair.evidence.length > 0, `${filename}:${pair.speciesId} has a determination without evidence.`);
    }
  }
  countyPresent += county.summary.verifiedPresent;
  countyAbsent += county.summary.verifiedAbsent;
  countyNotDetected += county.summary.notDetected;
  countyResearchedUnresolved += county.summary.researchedUnresolved;
  countyNotResearched += county.summary.notResearched;
}

assert(countyPresent === totals.verifiedPresent, "County files disagree with statewide present count.");
assert(countyAbsent === totals.verifiedAbsent, "County files disagree with statewide absence count.");
assert(countyNotDetected === totals.notDetected, "County files disagree with statewide not-detected count.");
assert(countyResearchedUnresolved === totals.researchedUnresolved, "County files disagree with statewide researched-unresolved count.");
assert(countyNotResearched === totals.notResearched, "County files disagree with statewide not-researched count.");

console.log(
  JSON.stringify(
    {
      sourceCount: registry.sources.length,
      researchRunCount: runs.length,
      evidenceRecordCount: evidence.length,
      ...totals,
    },
    null,
    2,
  ),
);
