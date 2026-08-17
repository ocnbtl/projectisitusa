import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ProtocolCellProjection } from "@/lib/research/protocol-cells";
import { passesApplicableProtocolCompletionGate } from "@/lib/research/readiness-gates";
import type { ResearchStateSummary } from "@/lib/research/types";
import type { StateResearchConfigFile } from "@/lib/research/state-research-config";

type JobsFile = { jobs: Array<{ jobId: string; state: string; stateOrSourceScope?: { states?: string[] } }> };
type LeasesFile = { leases: Array<{ leaseId: string; state: string; stateOrSourceScope?: { states?: string[] } }> };
type QueueFile = { items: Array<{ decision: string; manualInterventions?: number; conflicts?: number }> };
type StateRegistryFile = {
  nationalV1: {
    certificationOrder: string[];
    activeCertificationStateCode: string;
    activeCertificationCohort: number;
    nextCertificationCohort: number;
    certificationCohorts: Array<{ cohort: number; stateCodes: string[] }>;
  };
  jurisdictions: Array<{ stateCode: string; countyEquivalentCount: number; nationalV1Scope: boolean }>;
};
type SkillEvaluation = {
  result: string;
  broadDispatchAllowed: boolean;
  staticValidation?: {
    regression?: {
      wallSeconds?: number;
      peakMemoryMb?: number;
      manualInterventions?: number;
    };
  };
  metrics?: {
    validPairsScreened?: number;
    validatedResearchThroughputPairsPerHour?: number | null;
    manualInterventions?: number;
    mergeConflicts?: number;
  };
};
type OperationsDashboard = {
  throughput: {
    manifests: number;
    validPairsScreened: number;
    wallSeconds: number;
    validPairsPerHour: number;
  };
};
type ReleaseVerificationFile = {
  schemaVersion: 1;
  receipts: Array<{
    verificationId: string;
    verifiedAt: string;
    commitSha: string;
    githubMainSha: string;
    githubDeploymentId: number;
    vercelDeploymentId: string;
    vercelDeploymentUrl: string;
    productionUrl: string;
    target: "production";
    state: "READY" | "ERROR" | "CANCELED";
    routeChecks: Array<{ path: string; status: number }>;
    evidenceScope: string;
    resourceCapacity?: {
      availableDiskBytes: number;
      availableMemoryPercent: number;
      maximumSafeWorkersAtRecordedCapacity: number;
      observedAt: string | null;
      qualification: string;
    };
  }>;
};
type HistoricalNationalPilotEvaluation = {
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
type NationalSourceEvaluation = {
  result: string;
  partition: {
    requestedPairs: number;
    completeOutcomes: number;
    blockedOutcomes: number;
  };
  workerCanaries: {
    issued: number;
    accepted: number;
    partial: number;
    failed: number;
    acceptedPairs: number;
    acceptedWallSeconds: number;
    acceptedPairsPerHour: number;
    manualInterventions: number;
    mergeConflicts: number;
  };
  disk: {
    lowestRecordedAvailableBytes: number;
    maximumSafeWorkersAtRecordedCapacity: number;
  };
  throughput: {
    acquisitionWallSeconds: number;
    endToEndValidatedCompletePairsPerHour: number | null;
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
  "evaluations/skill-evaluation-postfreeze-recovery-2026-07-26-r2.json",
);
const skillEvaluation = existsSync(evaluationPath)
  ? readJson<SkillEvaluation>(evaluationPath)
  : null;
const operationsDashboardPath = path.join(operationsRoot, "dashboard.json");
const operationsDashboard = existsSync(operationsDashboardPath)
  ? readJson<OperationsDashboard>(operationsDashboardPath)
  : null;
const nationalSourceEvaluationPath = path.join(
  operationsRoot,
  "evaluations/usfs-fia-national-2026-07-26.json",
);
const nationalSourceEvaluation = existsSync(nationalSourceEvaluationPath)
  ? readJson<NationalSourceEvaluation>(nationalSourceEvaluationPath)
  : null;
const historicalNationalPilotEvaluationPath = path.join(
  operationsRoot,
  "evaluations/usgs-nas-pilot-2026-07-15.json",
);
const historicalNationalPilotEvaluation = existsSync(historicalNationalPilotEvaluationPath)
  ? readJson<HistoricalNationalPilotEvaluation>(historicalNationalPilotEvaluationPath)
  : null;
const releaseVerificationPath = path.join(
  operationsRoot,
  "release-verification.json",
);
const releaseVerification = existsSync(releaseVerificationPath)
  ? readJson<ReleaseVerificationFile>(releaseVerificationPath)
  : null;
const latestVerifiedRelease = [...(releaseVerification?.receipts ?? [])]
  .sort((left, right) => right.verifiedAt.localeCompare(left.verifiedAt))[0] ?? null;

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
    const regulatedAndHighCells = protocol.cells.filter(
      (cell) =>
        cell.applicabilityStatus === "applicable" &&
        ["regulated", "high"].includes(cell.priority),
    );
    const regulatedAndHighCompleteCells = regulatedAndHighCells.filter(
      (cell) => cell.completionStatus === "complete",
    );
    const regulatedAndHighCompletePercent = regulatedAndHighCells.length === 0
      ? 0
      : round(
          (regulatedAndHighCompleteCells.length / regulatedAndHighCells.length) * 100,
          2,
        );
    const priorityGate =
      protocol.priorityClassificationComplete &&
      (regulatedAndHighCells.length === 0 ||
        regulatedAndHighCompleteCells.length === regulatedAndHighCells.length);
    const buildTimeGates = {
      authoritativeCertificationScope:
        summary.scope.certificationScope === "state-baseline" &&
        summary.scope.speciesMode === "catalog-all",
      stateApplicabilityEvidenceConsistent:
        summary.scope.applicableSpeciesCount ===
          summary.stateSpeciesResearch.applicabilityDecisionCounts.applicable &&
        summary.scope.notApplicableSpeciesCount ===
          summary.stateSpeciesResearch.applicabilityDecisionCounts[
            "not-applicable"
          ] &&
        summary.scope.unknownSpeciesCount ===
          summary.stateSpeciesResearch.applicabilityDecisionCounts.unknown &&
        summary.scope.blockedSpeciesCount ===
          summary.stateSpeciesResearch.applicabilityDecisionCounts.blocked,
      fullCatalogResearchAccounted:
        summary.stateSpeciesResearch.fullCatalogResearchAccounted,
      publicAndResearchProjectionsAgree: publicParity,
      deferredCandidatesResolvedOrBlocked:
        summary.migrationCandidates.remainingSourceAssertionCount === 0,
      baselineResearchCoverageCompleteOrBlocked:
        summary.stateSpeciesResearch.fullCatalogResearchAccounted,
      applicableProtocolCellsAtLeast90:
        passesApplicableProtocolCompletionGate(protocol.summary),
      regulatedAndHighPriorityComplete: priorityGate,
      requiredCurrentSourceFamiliesProcessed:
        protocol.summary.requiredCurrentSourcesProcessed,
      conflictsAdjudicated: summary.summary.conflictCount === 0,
    };
    const buildTimeBlockers = Object.entries(buildTimeGates)
      .filter(([, value]) => !value)
      .map(([name]) => name);
    return {
      stateCode: entry.stateCode,
      scope: summary.scope,
      pairStatusCounts: summary.summary,
      fullCatalogApplicability: {
        denominator: summary.scope.stateSpeciesDenominator,
        applicable: summary.scope.applicableSpeciesCount,
        notApplicable: summary.scope.notApplicableSpeciesCount,
        unknown: summary.scope.unknownSpeciesCount,
        blocked: summary.scope.blockedSpeciesCount,
        explicitOverrides: summary.scope.explicitApplicabilityDecisionCount,
        complete: summary.scope.fullCatalogApplicabilityComplete,
      },
      stateSpeciesResearch: summary.stateSpeciesResearch,
      boundedAcquisitionScope: summary.summary.boundedAcquisition,
      baselineResearchCoveragePercent: summary.summary.researchCoveragePercent,
      explicitOutcomeCoveragePercent: summary.summary.explicitOutcomeCoveragePercent,
      protocolCompletePairCoveragePercent: protocolCompletePairCoverage,
      protocolCellCounts: protocol.summary,
      regulatedAndHighPriorityCompletion: {
        applicableCells: regulatedAndHighCells.length,
        completeCells: regulatedAndHighCompleteCells.length,
        completePercent: regulatedAndHighCompletePercent,
      },
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
      buildTimeGates,
      buildTimeBlockers,
      buildTimeReady: buildTimeBlockers.length === 0,
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
const measuredRate =
  nationalSourceEvaluation?.throughput.endToEndValidatedCompletePairsPerHour ??
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
const nationalV1JurisdictionCodes = stateRegistry.jurisdictions
  .filter((entry) => entry.nationalV1Scope)
  .map((entry) => entry.stateCode)
  .sort();
const applicabilityClassifiedJurisdictionCodes = states
  .filter((entry) => entry.fullCatalogApplicability.complete)
  .map((entry) => entry.stateCode)
  .sort();
const applicabilityUnclassifiedJurisdictionCodes = nationalV1JurisdictionCodes
  .filter((stateCode) => !applicabilityClassifiedJurisdictionCodes.includes(stateCode));
const researchAccountedJurisdictionCodes = states
  .filter((entry) => entry.stateSpeciesResearch.fullCatalogResearchAccounted)
  .map((entry) => entry.stateCode)
  .sort();
const activeCertificationCohort = stateRegistry.nationalV1.certificationCohorts.find(
  (entry) => entry.cohort === stateRegistry.nationalV1.activeCertificationCohort,
);
const nextCertificationCohort = stateRegistry.nationalV1.certificationCohorts.find(
  (entry) => entry.cohort === stateRegistry.nationalV1.nextCertificationCohort,
);
assert(activeCertificationCohort, "Active certification cohort is missing from the state registry.");
assert(nextCertificationCohort, "Next certification cohort is missing from the state registry.");
const denominator = states.reduce(
  (total, state) => {
    total.fullStateSpeciesDenominator +=
      state.fullCatalogApplicability.denominator;
    total.applicableStateSpeciesDecisions +=
      state.fullCatalogApplicability.applicable;
    total.notApplicableStateSpeciesDecisions +=
      state.fullCatalogApplicability.notApplicable;
    total.unknownStateSpeciesDecisions +=
      state.fullCatalogApplicability.unknown;
    total.blockedStateSpeciesDecisions +=
      state.fullCatalogApplicability.blocked;
    total.explicitStateSpeciesOverrides +=
      state.fullCatalogApplicability.explicitOverrides;
    total.derivedApplicableStateSpeciesDecisions +=
      state.stateSpeciesResearch.derivedApplicableSpeciesCount;
    total.researchedUnresolvedStateSpeciesDecisions +=
      state.stateSpeciesResearch.counts["researched-unresolved"];
    total.researchedBlockedStateSpeciesDecisions +=
      state.stateSpeciesResearch.counts["researched-blocked"];
    total.partiallyResearchedStateSpeciesDecisions +=
      state.stateSpeciesResearch.counts["partially-researched"];
    total.untouchedStateSpeciesDecisions +=
      state.stateSpeciesResearch.counts["not-researched"];
    total.fullCountySpeciesDenominator += state.pairStatusCounts.totalPairs;
    total.resolvableCountySpeciesPairs +=
      state.pairStatusCounts.resolvablePairCount;
    total.notApplicableCountySpeciesPairs +=
      state.pairStatusCounts.notApplicablePairCount;
    total.blockedCountySpeciesPairs +=
      state.pairStatusCounts.blockedPairCount;
    total.verifiedPresent += state.pairStatusCounts.verifiedPresent;
    total.verifiedAbsent += state.pairStatusCounts.verifiedAbsent;
    total.notDetected += state.pairStatusCounts.notDetected;
    total.researchedUnresolved += state.pairStatusCounts.researchedUnresolved;
    total.notResearched += state.pairStatusCounts.notResearched;
    total.boundedAcquisitionSpecies +=
      state.boundedAcquisitionScope.speciesCount;
    total.boundedAcquisitionPairs +=
      state.boundedAcquisitionScope.totalPairs;
    return total;
  },
  {
    fullStateSpeciesDenominator: 0,
    applicableStateSpeciesDecisions: 0,
    notApplicableStateSpeciesDecisions: 0,
    unknownStateSpeciesDecisions: 0,
    blockedStateSpeciesDecisions: 0,
    explicitStateSpeciesOverrides: 0,
    derivedApplicableStateSpeciesDecisions: 0,
    researchedUnresolvedStateSpeciesDecisions: 0,
    researchedBlockedStateSpeciesDecisions: 0,
    partiallyResearchedStateSpeciesDecisions: 0,
    untouchedStateSpeciesDecisions: 0,
    fullCountySpeciesDenominator: 0,
    resolvableCountySpeciesPairs: 0,
    notApplicableCountySpeciesPairs: 0,
    blockedCountySpeciesPairs: 0,
    verifiedPresent: 0,
    verifiedAbsent: 0,
    notDetected: 0,
    researchedUnresolved: 0,
    notResearched: 0,
    boundedAcquisitionSpecies: 0,
    boundedAcquisitionPairs: 0,
  },
);

const dashboard = {
  schemaVersion: 2,
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
    workerAttemptFailures: leases.filter((entry) => entry.state === "failed").length,
    rejectedWorkerSubmissions:
      queue.filter((entry) => ["changes-requested", "rejected"].includes(entry.decision)).length,
    acceptedWorkerIntegrations: integratedQueueItems,
    workerCompletionRatePercent:
      completedWorkerLeases === 0
        ? 0
        : round((integratedQueueItems / completedWorkerLeases) * 100),
    workerManifestCount: operationsDashboard?.throughput.manifests ?? 0,
    workerManifestPairsScreened:
      operationsDashboard?.throughput.validPairsScreened ?? 0,
    workerManifestWallSeconds:
      operationsDashboard?.throughput.wallSeconds ?? 0,
    workerManifestPairsPerHour:
      operationsDashboard?.throughput.validPairsPerHour ?? 0,
    measuredWallSeconds:
      nationalSourceEvaluation?.workerCanaries.acceptedWallSeconds ??
      skillEvaluation?.staticValidation?.regression?.wallSeconds ??
      0,
    memoryHighWaterMb:
      skillEvaluation?.staticValidation?.regression?.peakMemoryMb ?? 0,
    manualInterventions:
      nationalSourceEvaluation?.workerCanaries.manualInterventions ??
      skillEvaluation?.metrics?.manualInterventions ??
      queue.reduce((total, entry) => total + (entry.manualInterventions ?? 0), 0),
    mergeConflicts:
      nationalSourceEvaluation?.workerCanaries.mergeConflicts ??
      skillEvaluation?.metrics?.mergeConflicts ??
      queue.reduce((total, entry) => total + (entry.conflicts ?? 0), 0),
    validatedStagingPairs:
      nationalSourceEvaluation?.workerCanaries.acceptedPairs ??
      skillEvaluation?.metrics?.validPairsScreened ??
      0,
    validatedStagingThroughputPairsPerHour:
      nationalSourceEvaluation?.workerCanaries.acceptedPairsPerHour ??
      skillEvaluation?.metrics?.validatedResearchThroughputPairsPerHour ??
      0,
    skillEvaluationResult: skillEvaluation?.result ?? "not-run",
    broadDispatchAllowed: skillEvaluation?.broadDispatchAllowed ?? false,
    nationalPilotResult: nationalSourceEvaluation?.result ?? "not-run",
    nationalPilotRequestedPairs: nationalSourceEvaluation?.partition.requestedPairs ?? 0,
    nationalPilotCompleteOutcomes: nationalSourceEvaluation?.partition.completeOutcomes ?? 0,
    nationalPilotBlockedOutcomes: nationalSourceEvaluation?.partition.blockedOutcomes ?? 0,
    nationalPilotWallSeconds: 0,
    nationalPilotThroughputPairsPerHour:
      nationalSourceEvaluation?.throughput.endToEndValidatedCompletePairsPerHour ?? 0,
    nationalPilotManualInterventions:
      nationalSourceEvaluation?.workerCanaries.manualInterventions ?? 0,
    nationalPilotProcessFailures: nationalSourceEvaluation?.workerCanaries.failed ?? 0,
    currentEvaluationRecordedFreeDiskMiB:
      latestVerifiedRelease?.resourceCapacity
        ? round(latestVerifiedRelease.resourceCapacity.availableDiskBytes / 1_048_576, 1)
        : nationalSourceEvaluation
        ? round(nationalSourceEvaluation.disk.lowestRecordedAvailableBytes / 1_048_576, 1)
        : null,
    maximumSafeWorkersAtRecordedCapacity:
      latestVerifiedRelease?.resourceCapacity?.maximumSafeWorkersAtRecordedCapacity ??
      nationalSourceEvaluation?.disk.maximumSafeWorkersAtRecordedCapacity ??
      0,
    historicalMinimumObservedFreeDiskMiB:
      historicalNationalPilotEvaluation?.interventions.minimumObservedFreeDiskMiB ?? null,
  },
  releaseVerification: {
    currentBuildState: "pending-external-verification",
    requiredChecks: [
      "deterministic-integrity",
      "production-browser-qa",
      "github-main-commit-match",
      "vercel-production-commit-match",
      "live-route-parity",
    ],
    latestVerifiedPriorRelease: latestVerifiedRelease,
    selfAttestationAllowed: false,
    note:
      "Build-time readiness and deployed-release evidence are separate. A committed artifact cannot attest to a future deployment of its own commit.",
  },
  national: {
    denominator,
    certification: {
      activeCohort: activeCertificationCohort.cohort,
      activeStateCode: stateRegistry.nationalV1.activeCertificationStateCode,
      activeStates: activeCertificationCohort.stateCodes.map((stateCode) => {
        const state = states.find((entry) => entry.stateCode === stateCode);
        assert(state, `Active certification state ${stateCode} is not configured.`);
        return {
          stateCode,
          buildTimeReady: state.buildTimeReady,
          blockers: state.buildTimeBlockers,
        };
      }),
      nextCohort: nextCertificationCohort.cohort,
      nextStates: nextCertificationCohort.stateCodes,
      cohorts: stateRegistry.nationalV1.certificationCohorts,
      promotionPolicy:
        "Promote the next cohort when the active cohort is certified. Blocked states retain their blockers while independent states and the next cohort continue.",
    },
    buildTimeReadyStates: states
      .filter((entry) => entry.buildTimeReady)
      .map((entry) => entry.stateCode),
    completedStates: [],
    remainingConfiguredStates: states
      .filter((entry) => !entry.buildTimeReady)
      .map((entry) => entry.stateCode),
    applicabilityClassificationScope:
      "Full-catalog state-species applicability only. Source applicability and bounded source screening remain separate.",
    sourceScopeConfiguredJurisdictions: states.length,
    applicabilityClassifiedJurisdictions: applicabilityClassifiedJurisdictionCodes.length,
    applicabilityUnclassifiedJurisdictions: applicabilityUnclassifiedJurisdictionCodes.length,
    applicabilityUnclassifiedJurisdictionCodes,
    applicabilityScopeCompleteForAllJurisdictions:
      applicabilityUnclassifiedJurisdictionCodes.length === 0,
    researchAccountedJurisdictions: researchAccountedJurisdictionCodes.length,
    researchUnaccountedJurisdictions:
      nationalV1JurisdictionCodes.length -
      researchAccountedJurisdictionCodes.length,
    researchAccountedJurisdictionCodes,
    remainingApplicableProtocolCountyScreens,
    measuredRatePairsPerHour: measuredRate,
    measuredRateEvidence: {
      estimateType:
        measuredRate > 0
          ? "current-national-source-end-to-end-point-estimate"
          : "not-durably-measured",
      confidenceInterval: null,
      confidenceQualification:
        measuredRate > 0
          ? "No statistical confidence interval is available from one accepted end-to-end national-source run."
          : "The current FIA partition did not retain one durable end-to-end timer, so no national-source rate is claimed.",
    },
    concurrencyAssumption: 1,
    hoursPerDayAssumption,
    forecastDaysAtMeasuredRate: forecastDays === null ? null : round(forecastDays, 1),
    forecastDaysConfidenceInterval: null,
    targetMaximumDays,
    targetGapDays:
      forecastDays === null ? null : round(Math.max(0, forecastDays - targetMaximumDays), 1),
    forecastQualification:
      measuredRate > 0
        ? "Capacity forecast for versioned automated national-source screens at the validated pilot rate. It is not a national certification forecast because state-specific, manual, blocked, freshness, production QA, and integration workloads remain separately unmeasured."
        : nationalSourceEvaluation?.forecast.qualification ??
          "No accepted integrated national-source throughput measurement is available.",
    historicalPilotForecast: historicalNationalPilotEvaluation
      ? {
          status: "superseded-by-current-applicability-classification",
          qualificationAtMeasurement: historicalNationalPilotEvaluation.forecast.qualification,
          currentApplicabilityUnclassifiedJurisdictions:
            applicabilityUnclassifiedJurisdictionCodes.length,
          note:
            "The historical qualification is retained as dated evaluation evidence. Its 47-jurisdiction applicability statement is not a current fact.",
        }
      : null,
  },
};

writeFileSync(
  path.join(operationsRoot, "readiness-dashboard.json"),
  `${JSON.stringify(dashboard, null, 2)}\n`,
);
console.log(JSON.stringify(dashboard.national, null, 2));
