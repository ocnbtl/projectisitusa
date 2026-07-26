import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  CountyPresence,
  CountyRecord as PublicCountyRecord,
  ExplorerSpecies,
  Species,
  SpeciesCategory,
} from "@/lib/data/types";
import type {
  EvidenceReviewEvent,
  EvidenceAssertion,
  FreshnessStatus,
  PairDisplayStatus,
  ResearchCountyFile,
  ResearchPairRecord,
  ResearchProjectionScope,
  ResearchQueueEntry,
  ResearchRejectionRecord,
  ResearchRunReceipt,
  ResearchSourceRegistry,
  ResearchStateSummary,
  ReviewStatus,
} from "@/lib/research/types";
import { compileAdditiveResearchEvidence } from "@/lib/research/compile-evidence";
import {
  assertProjectionParity,
  buildCompatibilityMatrix,
  buildExplorerPresence,
  recomputeCatalogCoverage,
  renderCompatibilityMatrixMarkdown,
  replaceStatePresenceFromResearch,
  serializePresenceOutsideState,
} from "@/lib/research/compatibility-projection";
import { listImmutableResearchRuns, readNdjson as readRunNdjson } from "@/lib/research/run-files";
import { selectImmutableResearchRunsForState } from "@/lib/research/state-run-selection";
import {
  buildProtocolCellProjection,
  type ResearchProtocolsFile,
} from "@/lib/research/protocol-cells";
import {
  resolveStateResearchScope,
  selectStateResearchConfig,
  type StateApplicabilityFile,
  type StateResearchConfigFile,
} from "@/lib/research/state-research-config";

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

type ResearchRunsFile = {
  schemaVersion: 1;
  runs: ResearchRunReceipt[];
};

type MigrationCandidatesFile = {
  schemaVersion?: 1;
  stateCode?: string;
  candidateCount: number;
  distinctPairCount: number;
  candidates: Array<{ sourceId: string; countyFips: string; speciesId: string }>;
};

type StateRegistryFile = {
  schemaVersion: 1;
  jurisdictions: Array<{
    stateCode: string;
    stateName: string;
    countyEquivalentCount: number;
    nationalV1Scope: boolean;
  }>;
};

type CountyEquivalentRegistryFile = {
  schemaVersion: 1;
  countyEquivalents: Array<{
    countyFips: string;
    stateCode: string;
    stateName: string;
    status: "active" | "retired";
  }>;
};

const ROOT = process.cwd();
const DOCS_OUTPUT = path.join(ROOT, "docs/research/generated");

function parseCompilerOptions(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!new Set(["--state", "--as-of"]).has(flag) || !value || value.startsWith("--")) {
      throw new Error("research:compile requires --state <XX> --as-of <YYYY-MM-DD>.");
    }
    if (values.has(flag)) throw new Error(`Duplicate research compiler argument: ${flag}.`);
    values.set(flag, value);
  }
  const stateCode = values.get("--state")?.toUpperCase();
  const asOf = values.get("--as-of");
  if (!stateCode || !/^[A-Z]{2}$/.test(stateCode) || !asOf || !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error("research:compile requires --state <XX> --as-of <YYYY-MM-DD>.");
  }
  return { stateCode, asOf };
}

const { stateCode: STATE_CODE, asOf: AS_OF } = parseCompilerOptions(process.argv.slice(2));
const AS_OF_CUTOFF = Date.parse(`${AS_OF}T23:59:59.999Z`);
const SRC_OUTPUT = path.join(ROOT, "src/data/generated/research", STATE_CODE);
const PUBLIC_OUTPUT = path.join(ROOT, "public/generated/research", STATE_CODE);

function atOrBeforeAsOf(value: string) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid research timestamp: ${value}`);
  }
  return timestamp <= AS_OF_CUTOFF;
}

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

function roundDetailedPercent(value: number) {
  return Number(value.toFixed(4));
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

const stateRegistry = readJson<StateRegistryFile>(path.join(ROOT, "src/data/research/state-registry.json"));
const jurisdiction = stateRegistry.jurisdictions.find((entry) => entry.stateCode === STATE_CODE);
if (!jurisdiction?.nationalV1Scope) {
  throw new Error(`State ${STATE_CODE} is not an active national v1 jurisdiction.`);
}
const configFile = readJson<StateResearchConfigFile>(
  path.join(ROOT, "src/data/research/state-research-config.json"),
);
const catalogSpecies = readJson<Species[]>(path.join(ROOT, "src/data/generated/species.json"));
const catalogById = new Map(catalogSpecies.map((entry) => [entry.id, entry]));
const configuredState = selectStateResearchConfig(configFile, STATE_CODE);
const applicability: StateApplicabilityFile | null = configuredState.speciesScope.applicabilityPath
  ? readJson<StateApplicabilityFile>(path.join(ROOT, configuredState.speciesScope.applicabilityPath))
  : null;
const {
  config: stateConfig,
  speciesIds: selectedSpeciesIds,
  applicabilityAsOf,
} = resolveStateResearchScope({
  configFile,
  stateCode: STATE_CODE,
  catalogSpeciesIds: catalogSpecies.map((entry) => entry.id),
  asOf: AS_OF,
  applicability,
});
const species = selectedSpeciesIds
  .map((speciesId) => catalogById.get(speciesId)!)
  .sort((left, right) => left.id.localeCompare(right.id));
const projectionScope: ResearchProjectionScope = {
  publicationMode: stateConfig.mode,
  speciesMode: stateConfig.speciesScope.mode,
  certificationScope: stateConfig.mode === "authoritative" ? "state-baseline" : "bounded-pilot",
  applicabilityPath: stateConfig.speciesScope.applicabilityPath,
  applicabilityAsOf,
  applicableSpeciesCount: species.length,
  undeterminedSpeciesPolicy: stateConfig.speciesScope.undeterminedSpeciesPolicy,
  compatibilityPublication: stateConfig.compatibilityPublication,
  protocolModel: stateConfig.mode === "authoritative"
    ? "explicit-source-species-legacy-migration"
    : "explicit-source-species-active",
};
const explorerSpecies = readJson<ExplorerSpecies[]>(
  path.join(ROOT, "src/data/generated/explorer-species.json"),
);
const countiesIndex = readJson<Record<string, CountyRecord & PublicCountyRecord>>(
  path.join(ROOT, "src/data/generated/counties.json"),
);
const counties = Object.values(countiesIndex)
  .filter((county) => county.stateCode === STATE_CODE)
  .sort((left, right) => left.countyFips.localeCompare(right.countyFips));
const countyRegistry = readJson<CountyEquivalentRegistryFile>(
  path.join(ROOT, "src/data/research/county-equivalent-registry.json"),
);
const registeredCountyFips = countyRegistry.countyEquivalents
  .filter((county) => county.stateCode === STATE_CODE && county.status === "active")
  .map((county) => county.countyFips)
  .sort();
const generatedCountyFips = counties.map((county) => county.countyFips);
if (registeredCountyFips.join("\n") !== generatedCountyFips.join("\n")) {
  throw new Error(`Generated counties do not exactly match the active ${STATE_CODE} county-equivalent registry.`);
}
if (counties.length !== jurisdiction.countyEquivalentCount) {
  throw new Error(`State ${STATE_CODE} expected ${jurisdiction.countyEquivalentCount} active county equivalents, found ${counties.length}.`);
}
const currentPresence = readJson<Record<string, CountyPresence>>(
  path.join(ROOT, "src/data/generated/presence.json"),
);
const datasetSnapshot = readJson<{
  snapshotDate: string;
  sourceRefs: string[];
  coverageSummary?: {
    catalogSpeciesCount: number;
    mappedSpeciesCount: number;
    unmatchedSpeciesCount: number;
    sourceSpeciesCounts: Partial<Record<string, number>>;
  };
}>(path.join(ROOT, "src/data/generated/snapshot.json"));
const registry = readJson<ResearchSourceRegistry>(path.join(ROOT, "src/data/research/source-registry.json"));
const registeredSourceIds = new Set(registry.sources.map((source) => source.id));
for (const entry of applicability?.species ?? []) {
  for (const basis of entry.basis) {
    if (!registeredSourceIds.has(basis.sourceId)) throw new Error(`Applicability for ${STATE_CODE} references unknown source ${basis.sourceId}.`);
  }
}
const protocols = readJson<ResearchProtocolsFile>(path.join(ROOT, "src/data/research/research-protocols.json"));
const selectedSpeciesIdSet = new Set(species.map((entry) => entry.id));
const activeCountyFips = new Set(registeredCountyFips);
const runs = readJson<ResearchRunsFile>(path.join(ROOT, "src/data/research/research-runs.json")).runs
  .filter((run) => run.stateCode === STATE_CODE);
const bootstrapEvidence = stateConfig.bootstrapLedgerAllowed
  ? readNdjson<EvidenceAssertion>(path.join(ROOT, "src/data/research/evidence-assertions.ndjson"))
      .filter((entry) => entry.stateCode === STATE_CODE && selectedSpeciesIdSet.has(entry.speciesId))
  : [];
const immutableRuns = selectImmutableResearchRunsForState(
  listImmutableResearchRuns(ROOT),
  STATE_CODE,
  AS_OF,
);
for (const bundle of immutableRuns) {
  for (const [label, records] of [
    ["assertion", bundle.assertions],
    ["review", bundle.reviews],
    ["rejection", bundle.rejections],
    ["outcome", bundle.outcomes],
  ] as const) {
    for (const record of records) {
      const recordState = "state_code" in record ? record.state_code : record.normalized_target.state_code;
      const countyFips = "county_fips" in record ? record.county_fips : record.normalized_target.county_fips;
      if (recordState !== STATE_CODE) throw new Error(`Immutable run ${bundle.receipt.run_id} ${label} has foreign state ${recordState}.`);
      if (countyFips && !activeCountyFips.has(countyFips)) throw new Error(`Immutable run ${bundle.receipt.run_id} ${label} references inactive ${STATE_CODE} county ${countyFips}.`);
    }
  }
}
const runAssertions = immutableRuns.flatMap((bundle) =>
  bundle.assertions.filter((entry) => selectedSpeciesIdSet.has(entry.species_id)),
);
const runReviewEvents = immutableRuns.flatMap((bundle) =>
  bundle.reviews.filter((entry) => selectedSpeciesIdSet.has(entry.species_id)),
);
const lateReviewEvents = readRunNdjson<EvidenceReviewEvent>(
  path.join(ROOT, "src/data/research/review-events.ndjson"),
).filter((event) => event.state_code === STATE_CODE && selectedSpeciesIdSet.has(event.species_id) && atOrBeforeAsOf(event.created_at));
const globalRejections = readRunNdjson<ResearchRejectionRecord>(
  path.join(ROOT, "src/data/research/rejections.ndjson"),
).filter((record) => record.normalized_target.state_code === STATE_CODE && selectedSpeciesIdSet.has(record.normalized_target.species_id) && atOrBeforeAsOf(record.created_at));
const runRejections = immutableRuns.flatMap((bundle) =>
  bundle.rejections.filter((entry) => selectedSpeciesIdSet.has(entry.normalized_target.species_id)),
);
const outcomes = immutableRuns.flatMap((bundle) =>
  bundle.outcomes.filter((entry) => selectedSpeciesIdSet.has(entry.species_id)),
);
const { evidence, runEvidence, projectedRunAssertions, resolvedRunEvidence } =
  compileAdditiveResearchEvidence({
  bootstrapEvidence,
  runAssertions,
  reviewEvents: [...runReviewEvents, ...lateReviewEvents],
  sources: registry.sources,
  asOf: AS_OF,
  });
const migrationCandidates = readJson<MigrationCandidatesFile>(
  path.join(ROOT, stateConfig.migrationCandidatesPath),
);
if (migrationCandidates.stateCode && migrationCandidates.stateCode !== STATE_CODE) {
  throw new Error(`Migration candidate state ${migrationCandidates.stateCode} does not match ${STATE_CODE}.`);
}
if (migrationCandidates.candidateCount !== migrationCandidates.candidates.length) {
  throw new Error(`Migration candidate count does not match entries for ${STATE_CODE}.`);
}
const migrationPairCount = new Set(
  migrationCandidates.candidates.map((candidate) => pairKey(candidate.countyFips, candidate.speciesId)),
).size;
if (migrationPairCount !== migrationCandidates.distinctPairCount) {
  throw new Error(`Migration distinct pair count does not match entries for ${STATE_CODE}.`);
}
for (const candidate of migrationCandidates.candidates) {
  if (!registeredSourceIds.has(candidate.sourceId)) throw new Error(`Migration candidate references unknown source ${candidate.sourceId}.`);
  if (!selectedSpeciesIdSet.has(candidate.speciesId)) throw new Error(`Migration candidate references out-of-scope species ${candidate.speciesId}.`);
  if (!activeCountyFips.has(candidate.countyFips)) throw new Error(`Migration candidate references inactive ${STATE_CODE} county ${candidate.countyFips}.`);
}
const sourceSnapshotDate = datasetSnapshot.snapshotDate;
const generatedAt = `${AS_OF}T00:00:00.000Z`;
const applicabilityPriorityBySpecies = new Map(
  (applicability?.species ?? []).map((entry) => [entry.speciesId, entry.priority]),
);
const protocolCellProjection = buildProtocolCellProjection({
  stateCode: STATE_CODE,
  asOf: AS_OF,
  generatedAt,
  species: species.map((entry) => ({
    id: entry.id,
    category: entry.category,
    priority: applicabilityPriorityBySpecies.get(entry.id),
  })),
  countyFips: registeredCountyFips,
  protocols,
  sources: registry.sources,
  immutableRuns,
});

const reviewStatusByEvidenceId = new Map<string, ReviewStatus>();
for (const entry of bootstrapEvidence) {
  reviewStatusByEvidenceId.set(
    entry.evidenceId,
    entry.lineage === "manual-review"
      ? "human-approved"
      : entry.lineage === "legacy-merged"
        ? "agent-reviewed"
        : "machine-validated",
  );
}
for (const [eventId, status] of resolvedRunEvidence.reviewStatusByAssertionId) {
  reviewStatusByEvidenceId.set(eventId, status);
}
const evidenceKindById = new Map(
  projectedRunAssertions.map((entry) => [entry.eventId, entry.evidence_kind]),
);

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

const outcomesByPair = new Map<string, typeof outcomes>();
for (const outcome of outcomes) {
  const key = pairKey(outcome.county_fips, outcome.species_id);
  const values = outcomesByPair.get(key) ?? [];
  values.push(outcome);
  outcomesByPair.set(key, values);
}
for (const values of outcomesByPair.values()) {
  values.sort(
    (left, right) =>
      left.recorded_at.localeCompare(right.recorded_at) ||
      left.outcome_id.localeCompare(right.outcome_id),
  );
}

function pairReviewStatus(pairEvidence: EvidenceAssertion[]): ReviewStatus {
  const ranking = new Map<ReviewStatus, number>([
    ["not-reviewed", 0],
    ["machine-validated", 1],
    ["agent-reviewed", 2],
    ["human-approved", 3],
    ["rejected", -1],
    ["retracted", -2],
  ]);
  return pairEvidence
    .map((entry) => reviewStatusByEvidenceId.get(entry.evidenceId) ?? "not-reviewed")
    .sort((left, right) => (ranking.get(right) ?? 0) - (ranking.get(left) ?? 0))[0] ?? "not-reviewed";
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
let explicitOutcomePairCount = 0;
let conflictCount = 0;

for (const county of counties) {
  let countyVerifiedPresent = 0;
  let countyVerifiedAbsent = 0;
  let countyNotDetected = 0;
  let countyResearchedUnresolved = 0;
  let countyNotResearched = 0;
  let countyExplicitOutcomePairs = 0;

  const pairs: ResearchPairRecord[] = species.map((speciesEntry) => {
    const key = pairKey(county.countyFips, speciesEntry.id);
    const pairEvidence = evidenceByPair.get(key) ?? [];
    const pairOutcomes = outcomesByPair.get(key) ?? [];
    const latestOutcome = pairOutcomes.at(-1);
    const hasExplicitCompleteOutcome = pairOutcomes.some(
      (outcome) =>
        outcome.scope_complete &&
        ["evidence-found", "no-qualifying-evidence"].includes(outcome.status),
    );
    const hasPresent = pairEvidence.some((entry) => entry.assertion === "recorded-present");
    const hasAbsence = pairEvidence.some((entry) => entry.assertion === "officially-absent");
    const hasNotDetected = pairEvidence.some((entry) => entry.assertion === "not-detected");
    const hasSurveyDetection = pairEvidence.some(
      (entry) => evidenceKindById.get(entry.evidenceId) === "survey-detection",
    );
    const screenedBySourceIds = sortUnique([
      ...(screensBySpecies.get(speciesEntry.id) ?? []),
      ...pairOutcomes
        .filter((outcome) => outcome.status !== "blocked")
        .map((outcome) => outcome.source_id),
    ]);
    const conflict = hasPresent && hasAbsence;
    let displayStatus: PairDisplayStatus;

    if (hasExplicitCompleteOutcome) {
      countyExplicitOutcomePairs += 1;
      explicitOutcomePairCount += 1;
    }

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
      surveyStatus: hasSurveyDetection ? "detected" : hasNotDetected ? "not-detected" : "unassessed",
      researchStatus:
        hasPresent || hasAbsence || hasNotDetected
          ? "reviewed-evidence-found"
          : latestOutcome?.status === "no-qualifying-evidence" && latestOutcome.scope_complete
            ? "reviewed-no-qualifying-evidence"
            : latestOutcome?.status === "needs-followup"
              ? "needs-followup"
              : latestOutcome?.status === "blocked"
                ? "blocked"
          : screenedBySourceIds.length > 0
            ? "source-screened"
            : "not-started",
      freshnessStatus: freshnessFor(pairEvidence, generatedAt),
      reviewStatus: pairReviewStatus(pairEvidence),
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
    schemaVersion: 3,
    stateCode: STATE_CODE,
    countyFips: county.countyFips,
    countyName: county.name,
    asOf: AS_OF,
    generatedAt,
    scope: projectionScope,
    summary: {
      verifiedPresent: countyVerifiedPresent,
      verifiedAbsent: countyVerifiedAbsent,
      notDetected: countyNotDetected,
      researchedUnresolved: countyResearchedUnresolved,
      notResearched: countyNotResearched,
      researchCoveragePercent: roundPercent((researchedPairs / species.length) * 100),
      explicitOutcomePairs: countyExplicitOutcomePairs,
      explicitOutcomeCoveragePercent: roundDetailedPercent(
        (countyExplicitOutcomePairs / species.length) * 100,
      ),
    },
    pairs,
  });
}

const protocolCellsBySpecies = new Map<string, typeof protocolCellProjection.cells>();
for (const cell of protocolCellProjection.cells) {
  const values = protocolCellsBySpecies.get(cell.speciesId) ?? [];
  values.push(cell);
  protocolCellsBySpecies.set(cell.speciesId, values);
}

const queue: ResearchQueueEntry[] = species
  .map((speciesEntry) => {
    const counts = queueCounts.get(speciesEntry.id) ?? { notResearched: 0, researchedUnresolved: 0 };
    const missingProtocolSourceIds = (protocolCellsBySpecies.get(speciesEntry.id) ?? [])
      .filter(
        (cell) =>
          cell.applicabilityStatus === "applicable" &&
          (cell.completionStatus !== "complete" || cell.freshnessStatus !== "current"),
      )
      .map((cell) => cell.sourceId)
      .sort();
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
  const sourceImmutableRuns = immutableRuns.filter((bundle) => bundle.receipt.source_id === source.id);
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
      [
        ...sourceRuns.map((run) => run.accessedAt).filter((value): value is string => Boolean(value)),
        ...sourceImmutableRuns.map((bundle) => bundle.receipt.finished_at),
      ].sort().at(-1) ?? null,
    evidencePairCount: sourceEvidencePairs.size,
    screenedSpeciesCount: new Set(
      [
        ...sourceRuns
          .filter((run) => run.scope === "statewide-source-screen")
          .flatMap((run) => run.targetSpeciesIds),
        ...sourceImmutableRuns.flatMap((bundle) => bundle.receipt.requested_scope.species_ids),
      ],
    ).size,
  };
});

const totalPairs = counties.length * species.length;
const determinationCount = verifiedPresent + verifiedAbsent;
const researchedCount = totalPairs - notResearched;
const completedCandidateSourceKeys = new Set(
  outcomes
    .filter(
      (outcome) =>
        outcome.scope_complete &&
        ["evidence-found", "no-qualifying-evidence"].includes(outcome.status),
    )
    .map((outcome) => `${outcome.source_id}:${outcome.county_fips}:${outcome.species_id}`),
);
const reviewedCandidateSourceAssertions = migrationCandidates.candidates.filter((candidate) =>
  completedCandidateSourceKeys.has(`${candidate.sourceId}:${candidate.countyFips}:${candidate.speciesId}`),
);
const reviewedCandidatePairKeys = new Set(
  reviewedCandidateSourceAssertions.map((candidate) => pairKey(candidate.countyFips, candidate.speciesId)),
);

if (conflictCount > 0) {
  throw new Error(`Research compilation found ${conflictCount} present-versus-absence conflicts.`);
}

const summary: ResearchStateSummary = {
  schemaVersion: 3,
  stateCode: STATE_CODE,
  stateName: jurisdiction.stateName,
  asOf: AS_OF,
  generatedAt,
  sourceSnapshotDate,
  scope: projectionScope,
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
    explicitOutcomePairCount,
    explicitOutcomeCoveragePercent: roundDetailedPercent(
      (explicitOutcomePairCount / totalPairs) * 100,
    ),
    conflictCount,
    evidenceRecordCount: bootstrapEvidence.length + runEvidence.length,
    bootstrapEvidenceRecordCount: bootstrapEvidence.length,
    runEvidenceRecordCount: runEvidence.length,
    rejectionRecordCount: runRejections.length + globalRejections.length,
    researchRunCount: runs.length + immutableRuns.length,
  },
  counties: countyFiles.map((county) => ({
    countyFips: county.countyFips,
    name: county.countyName,
    ...county.summary,
  })),
  sources: sourceSummaries,
  queue,
  migrationCandidates: {
    sourceAssertionCount: migrationCandidates.candidateCount,
    distinctPairCount: migrationCandidates.distinctPairCount,
    reviewedSourceAssertionCount: reviewedCandidateSourceAssertions.length,
    remainingSourceAssertionCount:
      migrationCandidates.candidateCount - reviewedCandidateSourceAssertions.length,
    reviewedDistinctPairCount: reviewedCandidatePairKeys.size,
    remainingDistinctPairCount: migrationCandidates.distinctPairCount - reviewedCandidatePairKeys.size,
  },
  statusDefinitions: {
    "verified-present": "At least one reputable source supports a recorded presence in the county.",
    "verified-absent": "An authoritative source explicitly supports absence for the county and species.",
    "not-detected": "A documented survey or monitoring effort searched and did not detect the species. This is not absence.",
    "researched-unresolved": "At least one source family was screened, but no defensible present, absent, or not-detected determination was established.",
    "not-researched": "No recorded source-family screen or determination exists for this county-species pair.",
  },
};

const researchWritePaths = [
  path.join(SRC_OUTPUT, "summary.json"),
  path.join(SRC_OUTPUT, "protocol-cells.json"),
  path.join(PUBLIC_OUTPUT, "summary.json"),
  ...countyFiles.map((county) => path.join(PUBLIC_OUTPUT, "counties", `${county.countyFips}.json`)),
  path.join(DOCS_OUTPUT, `${STATE_CODE}-progress.json`),
  path.join(DOCS_OUTPUT, `${STATE_CODE}-work-queue.json`),
  path.join(DOCS_OUTPUT, `${STATE_CODE}-progress.md`),
];
if (stateConfig.mode === "research-only") {
  const allowedRoots = [SRC_OUTPUT, PUBLIC_OUTPUT, DOCS_OUTPUT].map((root) => `${path.resolve(root)}${path.sep}`);
  const forbidden = researchWritePaths.filter((filepath) =>
    !allowedRoots.some((root) => path.resolve(filepath).startsWith(root)),
  );
  if (forbidden.length > 0 || stateConfig.compatibilityPublication) {
    throw new Error(`Research-only write plan for ${STATE_CODE} contains shared compatibility output.`);
  }
}
writeJson(path.join(SRC_OUTPUT, "summary.json"), summary, true);
writeJson(path.join(SRC_OUTPUT, "protocol-cells.json"), protocolCellProjection);
writeJson(path.join(PUBLIC_OUTPUT, "summary.json"), summary, true);
for (const county of countyFiles) {
  writeJson(path.join(PUBLIC_OUTPUT, "counties", `${county.countyFips}.json`), county);
}
const countyOutput = path.join(PUBLIC_OUTPUT, "counties");
if (existsSync(countyOutput)) {
  const expectedCountyFiles = new Set(countyFiles.map((county) => `${county.countyFips}.json`));
  for (const filename of readdirSync(countyOutput).filter((entry) => entry.endsWith(".json"))) {
    if (!expectedCountyFiles.has(filename)) unlinkSync(path.join(countyOutput, filename));
  }
}

if (stateConfig.compatibilityPublication) {
  const targetCountyFips = new Set(counties.map((county) => county.countyFips));
  if (projectionScope.speciesMode !== "catalog-all" || countyFiles.length !== targetCountyFips.size) {
    throw new Error(`Compatibility publication for ${STATE_CODE} requires complete catalog and county scope.`);
  }
  const protectedPresenceBefore = serializePresenceOutsideState({
    stateCode: STATE_CODE,
    counties: countiesIndex,
    presence: currentPresence,
  });
  const compatibilityPresence = replaceStatePresenceFromResearch({
    stateCode: STATE_CODE,
    asOf: AS_OF,
    counties: countiesIndex,
    currentPresence,
    countyFiles,
  });
  const protectedPresenceAfter = serializePresenceOutsideState({
    stateCode: STATE_CODE,
    counties: countiesIndex,
    presence: compatibilityPresence,
  });
  if (protectedPresenceAfter !== protectedPresenceBefore) {
    throw new Error(`Compatibility compilation for ${STATE_CODE} changed non-target state presence.`);
  }
  const explorerPresence = buildExplorerPresence(compatibilityPresence, explorerSpecies);
  const catalogCoverage = recomputeCatalogCoverage({
    presence: compatibilityPresence,
    species: catalogSpecies,
    explorerSpecies,
    snapshot: datasetSnapshot,
  });
  const compatibilityPresentCount = assertProjectionParity({
    stateCode: STATE_CODE,
    counties: countiesIndex,
    countyFiles,
    presence: compatibilityPresence,
    explorerPresence,
    explorerSpecies: catalogCoverage.explorerSpecies,
  });
  if (compatibilityPresentCount !== summary.summary.verifiedPresent) {
    throw new Error(
      `Compatibility present count ${compatibilityPresentCount} does not match research count ${summary.summary.verifiedPresent}.`,
    );
  }
  const compatibilityMatrix = buildCompatibilityMatrix({
    stateCode: STATE_CODE,
    stateName: summary.stateName,
    sourceSnapshotDate,
    species: catalogCoverage.species,
    countyFiles,
  });
  for (const root of [path.join(ROOT, "src/data/generated"), path.join(ROOT, "public/generated")]) {
    writeJson(path.join(root, "presence.json"), compatibilityPresence, true);
    writeJson(path.join(root, "explorer-presence.json"), explorerPresence, true);
    writeJson(path.join(root, "species.json"), catalogCoverage.species, true);
    writeJson(path.join(root, "explorer-species.json"), catalogCoverage.explorerSpecies, true);
    writeJson(path.join(root, "snapshot.json"), catalogCoverage.snapshot, true);
  }
  const matrixOutput = path.join(ROOT, "docs/county-coverage/states");
  writeJson(path.join(matrixOutput, `${STATE_CODE}.json`), compatibilityMatrix, true);
  mkdirSync(matrixOutput, { recursive: true });
  writeFileSync(
    path.join(matrixOutput, `${STATE_CODE}.md`),
    renderCompatibilityMatrixMarkdown(compatibilityMatrix),
  );
}

const progress = {
  schemaVersion: 3,
  stateCode: STATE_CODE,
  asOf: AS_OF,
  generatedAt,
  scope: projectionScope,
  summary: summary.summary,
  migrationCandidates: summary.migrationCandidates,
  statusDefinitions: summary.statusDefinitions,
  sourceOperations: sourceSummaries,
  protocol: {
    protocolId: protocolCellProjection.protocolId,
    protocolStatus: protocolCellProjection.protocolStatus,
    priorityClassificationComplete: protocolCellProjection.priorityClassificationComplete,
    ...protocolCellProjection.summary,
    categoryCompletion: protocolCellProjection.categoryCompletion,
    priorityCompletion: protocolCellProjection.priorityCompletion,
    requiredSourceStatus: protocolCellProjection.requiredSourceStatus,
  },
  nextQueue: queue.slice(0, 100),
};
writeJson(path.join(DOCS_OUTPUT, `${STATE_CODE}-progress.json`), progress, true);
writeJson(
  path.join(DOCS_OUTPUT, `${STATE_CODE}-work-queue.json`),
  {
    schemaVersion: 3,
    stateCode: STATE_CODE,
    asOf: AS_OF,
    generatedAt,
    scope: projectionScope,
    protocol: protocolCellProjection.summary,
    queue,
  },
  true,
);

const progressMarkdown = [
  `# ${summary.stateName} Research Progress`,
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
  `- Explicit outcome coverage: \`${summary.summary.explicitOutcomeCoveragePercent.toFixed(4)}%\``,
  `- Applicable protocol cells: \`${protocolCellProjection.summary.applicableCells}\``,
  `- Current complete protocol cells: \`${protocolCellProjection.summary.currentCells}\``,
  `- Protocol completion: \`${protocolCellProjection.summary.applicableCompletionPercent.toFixed(2)}%\``,
  `- Current protocol completion: \`${protocolCellProjection.summary.currentCompletePercent.toFixed(2)}%\``,
  `- Evidence records: \`${summary.summary.evidenceRecordCount}\``,
  `- Research runs: \`${summary.summary.researchRunCount}\``,
  `- Rejection records: \`${summary.summary.rejectionRecordCount}\``,
  `- Deferred source assertions remaining: \`${summary.migrationCandidates.remainingSourceAssertionCount}\``,
  `- Deferred distinct pairs remaining: \`${summary.migrationCandidates.remainingDistinctPairCount}\``,
  `- Conflicts: \`${summary.summary.conflictCount}\``,
  "",
  "Determination coverage counts only verified present and verified absent pairs. Research coverage also counts explicit not-detected evidence and source-family screens. Explicit outcome coverage counts completed immutable pair outcomes. None of these metrics implies absence.",
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
writeFileSync(path.join(DOCS_OUTPUT, `${STATE_CODE}-progress.md`), `${progressMarkdown.join("\n")}\n`);

console.log(JSON.stringify(summary.summary, null, 2));
