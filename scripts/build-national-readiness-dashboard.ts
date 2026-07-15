import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ProtocolCellProjection } from "@/lib/research/protocol-cells";
import type { ResearchStateSummary } from "@/lib/research/types";
import type { StateResearchConfigFile } from "@/lib/research/state-research-config";

type JobsFile = { jobs: Array<{ jobId: string; state: string; stateOrSourceScope?: { states?: string[] } }> };
type LeasesFile = { leases: Array<{ leaseId: string; state: string; stateOrSourceScope?: { states?: string[] } }> };
type QueueFile = { items: Array<{ decision: string; manualInterventions?: number; conflicts?: number }> };
type StateRegistryFile = {
  jurisdictions: Array<{ stateCode: string; countyEquivalentCount: number; nationalV1Scope: boolean }>;
};
type SkillEvaluation = {
  result: string;
  broadDispatchAllowed: boolean;
  realPilot?: {
    validPairsScreened?: number;
    workerWallSeconds?: number;
    observedPeakMemoryMb?: number;
    manualInterventions?: number;
    mergeConflicts?: number;
    validatedResearchThroughputPairsPerHour?: number;
  };
};
type NationalPilotEvaluation = {
  result: string;
  partition: {
    requestedPairs: number;
    completeOutcomes: number;
    blockedOutcomes: number;
  };
  safety: {
    workerFailures: number;
    mergeConflicts: number;
  };
  interventions: {
    manualInterventions: number;
    processFailuresBeforeValidatedIntegration: number;
    minimumObservedFreeDiskMiB: number;
  };
  throughput: {
    endToEndWallSeconds: number;
    endToEndValidatedCompletePairsPerHour: number;
  };
  forecast: {
    qualification: string;
  };
};

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

const argumentsList = process.argv.slice(2);
assert(
  argumentsList.length === 2 &&
    argumentsList[0] === "--as-of" &&
    /^\d{4}-\d{2}-\d{2}$/.test(argumentsList[1] ?? ""),
  "build-national-readiness-dashboard requires --as-of <YYYY-MM-DD>.",
);
const asOf = argumentsList[1]!;
const generatedAt = `${asOf}T00:00:00.000Z`;
const operationsRoot = path.join(ROOT, "ops/national-research");
const config = readJson<StateResearchConfigFile>(
  path.join(ROOT, "src/data/research/state-research-config.json"),
);
const stateRegistry = readJson<StateRegistryFile>(
  path.join(ROOT, "src/data/research/state-registry.json"),
);
const jobs = readJson<JobsFile>(path.join(operationsRoot, "jobs.json")).jobs;
const leases = readJson<LeasesFile>(path.join(operationsRoot, "leases.json")).leases;
const queue = readJson<QueueFile>(path.join(operationsRoot, "integration-queue.json")).items;
const evaluationPath = path.join(
  operationsRoot,
  "evaluations/skill-evaluation-2026-07-15.json",
);
const skillEvaluation = existsSync(evaluationPath)
  ? readJson<SkillEvaluation>(evaluationPath)
  : null;
const nationalPilotEvaluationPath = path.join(
  operationsRoot,
  "evaluations/usgs-nas-pilot-2026-07-15.json",
);
const nationalPilotEvaluation = existsSync(nationalPilotEvaluationPath)
  ? readJson<NationalPilotEvaluation>(nationalPilotEvaluationPath)
  : null;

const states = config.states
  .filter((entry) => entry.publicResearchProjection)
  .map((entry) => {
    const sourceSummaryPath = path.join(
      ROOT,
      "src/data/generated/research",
      entry.stateCode,
      "summary.json",
    );
    const publicSummaryPath = path.join(
      ROOT,
      "public/generated/research",
      entry.stateCode,
      "summary.json",
    );
    const protocolPath = path.join(
      ROOT,
      "src/data/generated/research",
      entry.stateCode,
      "protocol-cells.json",
    );
    const summary = readJson<ResearchStateSummary>(sourceSummaryPath);
    const protocol = readJson<ProtocolCellProjection>(protocolPath);
    const publicParity =
      readFileSync(sourceSummaryPath, "utf8") === readFileSync(publicSummaryPath, "utf8");
    const protocolCountyScreens = protocol.cells
      .filter((cell) => cell.applicabilityStatus === "applicable")
      .reduce((total, cell) => total + cell.targetCountyCount, 0);
    const completeProtocolCountyScreens = protocol.cells
      .filter((cell) => cell.applicabilityStatus === "applicable")
      .reduce((total, cell) => total + cell.completeOutcomeCountyCount, 0);
    const protocolCompletePairCoverage = protocolCountyScreens === 0
      ? 0
      : round((completeProtocolCountyScreens / protocolCountyScreens) * 100, 4);
    const priorityGate =
      protocol.priorityClassificationComplete &&
      (protocol.summary.regulatedAndHighApplicableCells === 0 ||
        protocol.summary.regulatedAndHighCurrentCompletePercent === 100);
    const gates = {
      authoritativeCertificationScope:
        summary.scope.certificationScope === "state-baseline" &&
        summary.scope.speciesMode === "catalog-all",
      publicAndResearchProjectionsAgree: publicParity,
      deferredCandidatesResolvedOrBlocked:
        summary.migrationCandidates.remainingSourceAssertionCount === 0,
      baselineResearchCoverageComplete: summary.summary.researchCoveragePercent === 100,
      applicableProtocolCellsAtLeast90:
        protocol.summary.currentCompletePercent >= 90,
      regulatedAndHighPriorityCurrentComplete: priorityGate,
      requiredCurrentSourceFamiliesProcessed:
        protocol.summary.requiredCurrentSourcesProcessed,
      conflictsAdjudicated: summary.summary.conflictCount === 0,
      deterministicIntegrityVerified: false,
      productionQaVerified: false,
    };
    const blockers = Object.entries(gates)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    return {
      stateCode: entry.stateCode,
      scope: summary.scope,
      pairStatusCounts: summary.summary,
      baselineResearchCoveragePercent: summary.summary.researchCoveragePercent,
      explicitOutcomeCoveragePercent: summary.summary.explicitOutcomeCoveragePercent,
      protocolCompletePairCoveragePercent: protocolCompletePairCoverage,
      protocolCellCounts: protocol.summary,
      categoryCompletion: protocol.categoryCompletion,
      priorityCompletion: protocol.priorityCompletion,
      freshness: {
        currentCells: protocol.summary.currentCells,
        staleCells: protocol.summary.staleCells,
        undatedCells: protocol.summary.undatedCells,
      },
      deferred: summary.migrationCandidates,
      conflicts: summary.summary.conflictCount,
      publicParity,
      gates,
      blockers,
      ready: blockers.length === 0,
    };
  });

const countBy = <T>(values: T[], select: (value: T) => string) =>
  Object.fromEntries(
    [...new Set(values.map(select))].sort().map((key) => [
      key,
      values.filter((value) => select(value) === key).length,
    ]),
  );
const jobsByState: Record<string, number> = {};
for (const job of jobs) {
  for (const stateCode of job.stateOrSourceScope?.states ?? []) {
    jobsByState[stateCode] = (jobsByState[stateCode] ?? 0) + 1;
  }
}
const completedWorkerLeases = leases.filter((entry) => entry.state === "completed").length;
const integratedQueueItems = queue.filter((entry) => entry.decision === "integrated").length;
const pilot = skillEvaluation?.realPilot;
const measuredRate =
  nationalPilotEvaluation?.throughput.endToEndValidatedCompletePairsPerHour ??
  pilot?.validatedResearchThroughputPairsPerHour ??
  0;
const remainingApplicableProtocolCountyScreens = states.reduce(
  (total, state) =>
    total +
    (state.protocolCellCounts.applicableCells === 0
      ? 0
      : readJson<ProtocolCellProjection>(
          path.join(
            ROOT,
            "src/data/generated/research",
            state.stateCode,
            "protocol-cells.json",
          ),
        ).cells
          .filter((cell) => cell.applicabilityStatus === "applicable")
          .reduce((subtotal, cell) => subtotal + cell.incompleteCountyCount, 0)),
  0,
);
const hoursPerDayAssumption = 16;
const forecastDays = measuredRate > 0
  ? remainingApplicableProtocolCountyScreens / measuredRate / hoursPerDayAssumption
  : null;
const targetMaximumDays = 28;

const dashboard = {
  schemaVersion: 1,
  asOf,
  generatedAt,
  geography: {
    states: stateRegistry.jurisdictions.filter(
      (entry) => entry.nationalV1Scope && entry.stateCode !== "DC",
    ).length,
    federalDistricts: stateRegistry.jurisdictions.filter(
      (entry) => entry.nationalV1Scope && entry.stateCode === "DC",
    ).length,
    jurisdictions: stateRegistry.jurisdictions.filter((entry) => entry.nationalV1Scope).length,
    countyEquivalents: stateRegistry.jurisdictions
      .filter((entry) => entry.nationalV1Scope)
      .reduce((total, entry) => total + entry.countyEquivalentCount, 0),
    currentlyConfiguredStates: states.length,
  },
  states,
  operations: {
    jobsByState,
    jobsByStatus: countBy(jobs, (entry) => entry.state),
    leasesByStatus: countBy(leases, (entry) => entry.state),
    queueDecisions: countBy(queue, (entry) => entry.decision),
    activeJobs: jobs.filter((entry) => entry.state === "leased").length,
    completedJobs: jobs.filter((entry) => entry.state === "completed").length,
    blockedJobs: jobs.filter((entry) => entry.state === "blocked").length,
    activeLeases: leases.filter((entry) => entry.state === "active").length,
    completedWorkerLeases,
    workerFailures: queue.filter((entry) => ["changes-requested", "rejected"].includes(entry.decision)).length,
    workerCompletionRatePercent:
      completedWorkerLeases === 0
        ? 0
        : round((integratedQueueItems / completedWorkerLeases) * 100),
    measuredWallSeconds: pilot?.workerWallSeconds ?? 0,
    memoryHighWaterMb: pilot?.observedPeakMemoryMb ?? 0,
    manualInterventions:
      pilot?.manualInterventions ??
      queue.reduce((total, entry) => total + (entry.manualInterventions ?? 0), 0),
    mergeConflicts:
      pilot?.mergeConflicts ?? queue.reduce((total, entry) => total + (entry.conflicts ?? 0), 0),
    validatedStagingPairs: pilot?.validPairsScreened ?? 0,
    validatedStagingThroughputPairsPerHour: measuredRate,
    skillEvaluationResult: skillEvaluation?.result ?? "not-run",
    broadDispatchAllowed: skillEvaluation?.broadDispatchAllowed ?? false,
    nationalPilotResult: nationalPilotEvaluation?.result ?? "not-run",
    nationalPilotRequestedPairs: nationalPilotEvaluation?.partition.requestedPairs ?? 0,
    nationalPilotCompleteOutcomes: nationalPilotEvaluation?.partition.completeOutcomes ?? 0,
    nationalPilotBlockedOutcomes: nationalPilotEvaluation?.partition.blockedOutcomes ?? 0,
    nationalPilotWallSeconds: nationalPilotEvaluation?.throughput.endToEndWallSeconds ?? 0,
    nationalPilotThroughputPairsPerHour:
      nationalPilotEvaluation?.throughput.endToEndValidatedCompletePairsPerHour ?? 0,
    nationalPilotManualInterventions:
      nationalPilotEvaluation?.interventions.manualInterventions ?? 0,
    nationalPilotProcessFailures:
      nationalPilotEvaluation?.interventions.processFailuresBeforeValidatedIntegration ?? 0,
    minimumObservedFreeDiskMiB:
      nationalPilotEvaluation?.interventions.minimumObservedFreeDiskMiB ?? null,
  },
  national: {
    completedStates: states.filter((entry) => entry.ready).map((entry) => entry.stateCode),
    remainingConfiguredStates: states.filter((entry) => !entry.ready).map((entry) => entry.stateCode),
    applicabilityScopeCompleteForAllJurisdictions: false,
    remainingApplicableProtocolCountyScreens,
    measuredRatePairsPerHour: measuredRate,
    concurrencyAssumption: 1,
    hoursPerDayAssumption,
    forecastDaysAtMeasuredRate: forecastDays === null ? null : round(forecastDays, 1),
    targetMaximumDays,
    targetGapDays:
      forecastDays === null ? null : round(Math.max(0, forecastDays - targetMaximumDays), 1),
    forecastQualification:
      nationalPilotEvaluation?.forecast.qualification ??
      "No accepted integrated national-source throughput measurement is available.",
  },
};

writeFileSync(
  path.join(operationsRoot, "readiness-dashboard.json"),
  `${JSON.stringify(dashboard, null, 2)}\n`,
);
console.log(JSON.stringify(dashboard.national, null, 2));
