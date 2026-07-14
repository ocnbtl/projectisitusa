import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { SpeciesCategory } from "@/lib/data/types";
import type {
  EvidenceAssertion,
  FreshnessStatus,
  PairDisplayStatus,
  ResearchCountyFile,
  ResearchPairRecord,
  ResearchQueueEntry,
  ResearchRunReceipt,
  ResearchSourceRegistry,
  ResearchStateSummary,
} from "@/lib/research/types";

type SpeciesRecord = {
  id: string;
  commonName: string;
  scientificName: string;
  category: SpeciesCategory;
};

type CountyRecord = {
  countyFips: string;
  name: string;
  stateCode: string;
  stateName: string;
};

type MatrixFile = {
  generatedFrom: { countyPresenceSnapshotDate: string };
};

type ResearchRunsFile = {
  schemaVersion: 1;
  runs: ResearchRunReceipt[];
};

type ResearchProtocolsFile = {
  schemaVersion: 1;
  protocols: Array<{
    id: string;
    categories: SpeciesCategory[];
    requiredSourceIds: string[];
    status: "draft" | "active";
  }>;
};

const ROOT = process.cwd();
const STATE_CODE = "AL";
const GENERATED_AT_FALLBACK = "2026-07-14";
const SRC_OUTPUT = path.join(ROOT, "src/data/generated/research/AL");
const PUBLIC_OUTPUT = path.join(ROOT, "public/generated/research/AL");
const DOCS_OUTPUT = path.join(ROOT, "docs/research/generated");

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function readNdjson<T>(filepath: string): T[] {
  return readFileSync(filepath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function sortUnique(values: string[]) {
  return [...new Set(values)].sort();
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

function dateTimestamp(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const yearOnly = /^\d{4}$/.test(value) ? `${value}-01-01` : value;
  const timestamp = Date.parse(yearOnly);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function freshnessFor(evidence: EvidenceAssertion[], generatedAt: string): FreshnessStatus {
  const latest = evidence
    .flatMap((entry) => [entry.observedAt, entry.reviewedAt, entry.accessedAt])
    .map(dateTimestamp)
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => right - left)[0];
  const generatedTimestamp = dateTimestamp(generatedAt);
  if (latest === undefined || generatedTimestamp === undefined) {
    return "undated";
  }
  const ageDays = Math.max(0, (generatedTimestamp - latest) / 86_400_000);
  if (ageDays <= 365) {
    return "current";
  }
  if (ageDays <= 730) {
    return "aging";
  }
  return "stale";
}

function writeJson(filepath: string, value: unknown, pretty = false) {
  mkdirSync(path.dirname(filepath), { recursive: true });
  writeFileSync(filepath, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`);
}

const species = readJson<SpeciesRecord[]>(path.join(ROOT, "src/data/generated/species.json")).sort((left, right) =>
  left.id.localeCompare(right.id),
);
const counties = Object.values(
  readJson<Record<string, CountyRecord>>(path.join(ROOT, "src/data/generated/counties.json")),
)
  .filter((county) => county.stateCode === STATE_CODE)
  .sort((left, right) => left.countyFips.localeCompare(right.countyFips));
const registry = readJson<ResearchSourceRegistry>(path.join(ROOT, "src/data/research/source-registry.json"));
const protocols = readJson<ResearchProtocolsFile>(path.join(ROOT, "src/data/research/research-protocols.json"));
const runs = readJson<ResearchRunsFile>(path.join(ROOT, "src/data/research/research-runs.json")).runs;
const evidence = readNdjson<EvidenceAssertion>(path.join(ROOT, "src/data/research/evidence-assertions.ndjson"));
const matrix = readJson<MatrixFile>(path.join(ROOT, "docs/county-coverage/states/AL.json"));
const sourceSnapshotDate = matrix.generatedFrom.countyPresenceSnapshotDate;
const generatedAt =
  [...runs.map((run) => run.accessedAt).filter((value): value is string => Boolean(value)), sourceSnapshotDate]
    .sort()
    .at(-1) ?? GENERATED_AT_FALLBACK;

const evidenceByPair = new Map<string, EvidenceAssertion[]>();
for (const assertion of evidence) {
  const key = pairKey(assertion.countyFips, assertion.speciesId);
  const existing = evidenceByPair.get(key) ?? [];
  existing.push(assertion);
  evidenceByPair.set(key, existing);
}
for (const assertions of evidenceByPair.values()) {
  assertions.sort(
    (left, right) =>
      left.assertion.localeCompare(right.assertion) ||
      left.sourceId.localeCompare(right.sourceId) ||
      left.evidenceId.localeCompare(right.evidenceId),
  );
}

const screensBySpecies = new Map<string, Set<string>>();
for (const run of runs.filter((entry) => entry.scope === "statewide-source-screen")) {
  for (const speciesId of run.targetSpeciesIds) {
    const sourceIds = screensBySpecies.get(speciesId) ?? new Set<string>();
    sourceIds.add(run.sourceId);
    screensBySpecies.set(speciesId, sourceIds);
  }
}

const countyFiles: ResearchCountyFile[] = [];
const queueCounts = new Map<
  string,
  { notResearched: number; researchedUnresolved: number }
>();
let verifiedPresent = 0;
let verifiedAbsent = 0;
let notDetected = 0;
let researchedUnresolved = 0;
let notResearched = 0;
let conflictCount = 0;

for (const county of counties) {
  let countyVerifiedPresent = 0;
  let countyVerifiedAbsent = 0;
  let countyNotDetected = 0;
  let countyResearchedUnresolved = 0;
  let countyNotResearched = 0;

  const pairs: ResearchPairRecord[] = species.map((speciesEntry) => {
    const pairEvidence = evidenceByPair.get(pairKey(county.countyFips, speciesEntry.id)) ?? [];
    const hasPresent = pairEvidence.some((entry) => entry.assertion === "recorded-present");
    const hasAbsence = pairEvidence.some((entry) => entry.assertion === "officially-absent");
    const hasNotDetected = pairEvidence.some((entry) => entry.assertion === "not-detected");
    const screenedBySourceIds = sortUnique([...(screensBySpecies.get(speciesEntry.id) ?? [])]);
    const conflict = hasPresent && hasAbsence;
    let displayStatus: PairDisplayStatus;

    if (hasPresent) {
      displayStatus = "verified-present";
      countyVerifiedPresent += 1;
      verifiedPresent += 1;
    } else if (hasAbsence) {
      displayStatus = "verified-absent";
      countyVerifiedAbsent += 1;
      verifiedAbsent += 1;
    } else if (hasNotDetected) {
      displayStatus = "not-detected";
      countyNotDetected += 1;
      notDetected += 1;
    } else if (screenedBySourceIds.length > 0) {
      displayStatus = "researched-unresolved";
      countyResearchedUnresolved += 1;
      researchedUnresolved += 1;
    } else {
      displayStatus = "not-researched";
      countyNotResearched += 1;
      notResearched += 1;
    }

    if (conflict) {
      conflictCount += 1;
    }
    if (displayStatus === "researched-unresolved" || displayStatus === "not-researched") {
      const counts = queueCounts.get(speciesEntry.id) ?? { notResearched: 0, researchedUnresolved: 0 };
      if (displayStatus === "not-researched") {
        counts.notResearched += 1;
      } else {
        counts.researchedUnresolved += 1;
      }
      queueCounts.set(speciesEntry.id, counts);
    }

    return {
      speciesId: speciesEntry.id,
      commonName: speciesEntry.commonName,
      scientificName: speciesEntry.scientificName,
      category: speciesEntry.category,
      displayStatus,
      determinationStatus: hasPresent ? "recorded-present" : hasAbsence ? "officially-absent" : "none",
      surveyStatus: hasPresent ? "detected" : hasNotDetected ? "not-detected" : "not-surveyed",
      researchStatus:
        hasPresent || hasAbsence || hasNotDetected
          ? "resolved"
          : screenedBySourceIds.length > 0
            ? "source-screened"
            : "not-started",
      freshnessStatus: freshnessFor(pairEvidence, generatedAt),
      conflict,
      evidence: pairEvidence.map((entry) => ({
        evidenceId: entry.evidenceId,
        sourceId: entry.sourceId,
        sourceLabel: entry.sourceLabel,
        url: entry.url,
        assertion: entry.assertion,
        scope: entry.scope,
        observedAt: entry.observedAt,
        reviewedAt: entry.reviewedAt ?? entry.accessedAt,
        caveat: entry.caveat,
        lineage: entry.lineage,
      })),
      screenedBySourceIds,
    };
  });

  const researchedPairs =
    countyVerifiedPresent + countyVerifiedAbsent + countyNotDetected + countyResearchedUnresolved;
  countyFiles.push({
    schemaVersion: 1,
    stateCode: STATE_CODE,
    countyFips: county.countyFips,
    countyName: county.name,
    generatedAt,
    summary: {
      verifiedPresent: countyVerifiedPresent,
      verifiedAbsent: countyVerifiedAbsent,
      notDetected: countyNotDetected,
      researchedUnresolved: countyResearchedUnresolved,
      notResearched: countyNotResearched,
      researchCoveragePercent: roundPercent((researchedPairs / species.length) * 100),
    },
    pairs,
  });
}

const protocolByCategory = new Map<SpeciesCategory, ResearchProtocolsFile["protocols"][number]>();
for (const protocol of protocols.protocols) {
  for (const category of protocol.categories) {
    protocolByCategory.set(category, protocol);
  }
}

const queue: ResearchQueueEntry[] = species
  .map((speciesEntry) => {
    const counts = queueCounts.get(speciesEntry.id) ?? { notResearched: 0, researchedUnresolved: 0 };
    const screenedSources = screensBySpecies.get(speciesEntry.id) ?? new Set<string>();
    const missingProtocolSourceIds = (protocolByCategory.get(speciesEntry.category)?.requiredSourceIds ?? []).filter(
      (sourceId) => !screenedSources.has(sourceId),
    );
    return {
      speciesId: speciesEntry.id,
      commonName: speciesEntry.commonName,
      scientificName: speciesEntry.scientificName,
      category: speciesEntry.category,
      notResearchedCountyCount: counts.notResearched,
      researchedUnresolvedCountyCount: counts.researchedUnresolved,
      missingProtocolSourceIds,
      priorityScore:
        counts.notResearched * 1_000 + counts.researchedUnresolved * 10 + missingProtocolSourceIds.length,
    };
  })
  .sort(
    (left, right) =>
      right.priorityScore - left.priorityScore ||
      left.scientificName.localeCompare(right.scientificName) ||
      left.speciesId.localeCompare(right.speciesId),
  );

const sourceSummaries = registry.sources.map((source) => {
  const sourceRuns = runs.filter((run) => run.sourceId === source.id);
  const sourceEvidencePairs = new Set(
    evidence
      .filter((entry) => entry.sourceId === source.id)
      .map((entry) => pairKey(entry.countyFips, entry.speciesId)),
  );
  return {
    id: source.id,
    label: source.label,
    authority: source.authority,
    tier: source.tier,
    status: source.status,
    lastRunAt:
      sourceRuns.map((run) => run.accessedAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    evidencePairCount: sourceEvidencePairs.size,
    screenedSpeciesCount: new Set(
      sourceRuns.filter((run) => run.scope === "statewide-source-screen").flatMap((run) => run.targetSpeciesIds),
    ).size,
  };
});

const totalPairs = counties.length * species.length;
const determinationCount = verifiedPresent + verifiedAbsent;
const researchedCount = totalPairs - notResearched;
const summary: ResearchStateSummary = {
  schemaVersion: 1,
  stateCode: STATE_CODE,
  stateName: counties[0]?.stateName ?? "Alabama",
  generatedAt,
  sourceSnapshotDate,
  summary: {
    speciesCount: species.length,
    countyCount: counties.length,
    totalPairs,
    verifiedPresent,
    verifiedAbsent,
    notDetected,
    researchedUnresolved,
    notResearched,
    determinationCoveragePercent: roundPercent((determinationCount / totalPairs) * 100),
    researchCoveragePercent: roundPercent((researchedCount / totalPairs) * 100),
    conflictCount,
  },
  counties: countyFiles.map((county) => ({
    countyFips: county.countyFips,
    name: county.countyName,
    ...county.summary,
  })),
  sources: sourceSummaries,
  queue,
  statusDefinitions: {
    "verified-present": "At least one reputable source supports a recorded presence in the county.",
    "verified-absent": "An authoritative source explicitly supports absence for the county and species.",
    "not-detected": "A documented survey or monitoring effort searched and did not detect the species. This is not absence.",
    "researched-unresolved": "At least one source family was screened, but no defensible present, absent, or not-detected determination was established.",
    "not-researched": "No recorded source-family screen or determination exists for this county-species pair.",
  },
};

writeJson(path.join(SRC_OUTPUT, "summary.json"), summary, true);
writeJson(path.join(PUBLIC_OUTPUT, "summary.json"), summary, true);
for (const county of countyFiles) {
  writeJson(path.join(PUBLIC_OUTPUT, "counties", `${county.countyFips}.json`), county);
}

const progress = {
  schemaVersion: 1,
  stateCode: STATE_CODE,
  generatedAt,
  summary: summary.summary,
  statusDefinitions: summary.statusDefinitions,
  sourceOperations: sourceSummaries,
  nextQueue: queue.slice(0, 100),
};
writeJson(path.join(DOCS_OUTPUT, "AL-progress.json"), progress, true);
writeJson(path.join(DOCS_OUTPUT, "AL-work-queue.json"), { schemaVersion: 1, stateCode: STATE_CODE, generatedAt, queue }, true);

const progressMarkdown = [
  "# Alabama Research Progress",
  "",
  `Generated: \`${generatedAt}\``,
  "",
  "## Exact Counts",
  "",
  `- Species: \`${summary.summary.speciesCount}\``,
  `- Counties: \`${summary.summary.countyCount}\``,
  `- County-species pairs: \`${summary.summary.totalPairs}\``,
  `- Verified present: \`${summary.summary.verifiedPresent}\``,
  `- Verified absent: \`${summary.summary.verifiedAbsent}\``,
  `- Not detected: \`${summary.summary.notDetected}\``,
  `- Researched unresolved: \`${summary.summary.researchedUnresolved}\``,
  `- Not researched: \`${summary.summary.notResearched}\``,
  `- Determination coverage: \`${summary.summary.determinationCoveragePercent.toFixed(2)}%\``,
  `- Research coverage: \`${summary.summary.researchCoveragePercent.toFixed(2)}%\``,
  `- Conflicts: \`${summary.summary.conflictCount}\``,
  "",
  "Determination coverage counts only verified present and verified absent pairs. Research coverage also counts explicit not-detected evidence and source-family screens. A source screen is not an absence determination.",
  "",
  "## Highest Priority Species",
  "",
  "| Species | Category | Not researched counties | Researched unresolved counties | Missing protocol sources |",
  "| --- | --- | ---: | ---: | ---: |",
  ...queue.slice(0, 25).map(
    (entry) =>
      `| ${entry.commonName} (\`${entry.speciesId}\`) | ${entry.category} | ${entry.notResearchedCountyCount} | ${entry.researchedUnresolvedCountyCount} | ${entry.missingProtocolSourceIds.length} |`,
  ),
  "",
  "## Source Operations",
  "",
  "| Source | Status | Last run | Evidence pairs | Screened species |",
  "| --- | --- | --- | ---: | ---: |",
  ...sourceSummaries.map(
    (source) =>
      `| ${source.label} | ${source.status} | ${source.lastRunAt ?? "not run"} | ${source.evidencePairCount} | ${source.screenedSpeciesCount} |`,
  ),
];
mkdirSync(DOCS_OUTPUT, { recursive: true });
writeFileSync(path.join(DOCS_OUTPUT, "AL-progress.md"), `${progressMarkdown.join("\n")}\n`);

console.log(JSON.stringify(summary.summary, null, 2));
