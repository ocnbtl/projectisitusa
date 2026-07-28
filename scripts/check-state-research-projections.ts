import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type {
  EvidenceAssertion,
  EvidenceReviewEvent,
  ResearchCountyFile,
  ResearchRejectionRecord,
  ResearchRunReceipt,
  ResearchSourceRegistry,
  ResearchStateSummary,
} from "@/lib/research/types";
import { compileAdditiveResearchEvidence } from "@/lib/research/compile-evidence";
import { listCountyEquivalents } from "@/lib/research/geography-registry";
import {
  listImmutableResearchRuns,
  readNdjson,
  stableJson,
} from "@/lib/research/run-files";
import {
  resolveBoundedAcquisitionSpeciesIds,
  resolveStateResearchScope,
  selectStateResearchConfig,
  type StateApplicabilityFile,
  type StateResearchConfigFile,
} from "@/lib/research/state-research-config";
import { selectImmutableResearchRunsForState } from "@/lib/research/state-run-selection";
import { deriveStateSpeciesResolution } from "@/lib/research/state-species-resolution";
import type { ProtocolCellProjection } from "@/lib/research/protocol-cells";
import type { StateApplicabilitySourceRegistry } from "@/lib/research/state-applicability-sources";

type Species = { id: string };
type LegacyRunsFile = { schemaVersion: 1; runs: ResearchRunReceipt[] };
type MigrationCandidatesFile = {
  stateCode?: string;
  candidateCount: number;
  distinctPairCount: number;
  candidates: Array<{ sourceId: string; countyFips: string; speciesId: string }>;
};

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

function assertUnique(values: string[], label: string) {
  assert(new Set(values).size === values.length, `${label} contains duplicates.`);
}

const projectionSchema = z.fromJSONSchema(
  readJson(path.join(ROOT, "src/data/research/schemas/research-projection.schema.json")),
);
const protocolProjectionSchema = z.fromJSONSchema(
  readJson(path.join(ROOT, "src/data/research/schemas/protocol-cell-projection.schema.json")),
);
const protocolsSchema = z.fromJSONSchema(
  readJson(path.join(ROOT, "src/data/research/schemas/research-protocols.schema.json")),
);
protocolsSchema.parse(readJson(path.join(ROOT, "src/data/research/research-protocols.json")));
const configFile = readJson<StateResearchConfigFile>(
  path.join(ROOT, "src/data/research/state-research-config.json"),
);
const catalogSpeciesIds = readJson<Species[]>(
  path.join(ROOT, "src/data/generated/species.json"),
).map((entry) => entry.id);
const registry = readJson<ResearchSourceRegistry>(
  path.join(ROOT, "src/data/research/source-registry.json"),
);
const sourceIds = new Set(registry.sources.map((entry) => entry.id));
const applicabilitySourceRegistry = readJson<StateApplicabilitySourceRegistry>(
  path.join(ROOT, "src/data/research/state-applicability-source-registry.json"),
);
for (const source of applicabilitySourceRegistry.sources) {
  sourceIds.add(source.id);
}
const allImmutableRuns = listImmutableResearchRuns(ROOT);
const bootstrapEvidence = readNdjson<EvidenceAssertion>(
  path.join(ROOT, "src/data/research/evidence-assertions.ndjson"),
);
const legacyRuns = readJson<LegacyRunsFile>(
  path.join(ROOT, "src/data/research/research-runs.json"),
).runs;
const laterReviews = readNdjson<EvidenceReviewEvent>(
  path.join(ROOT, "src/data/research/review-events.ndjson"),
);
const laterRejections = readNdjson<ResearchRejectionRecord>(
  path.join(ROOT, "src/data/research/rejections.ndjson"),
);

const results: Array<Record<string, unknown>> = [];
for (const configuredState of configFile.states.filter(
  (entry) => entry.publicResearchProjection,
)) {
  const stateCode = configuredState.stateCode;
  const sourceSummaryPath = path.join(
    ROOT,
    "src/data/generated/research",
    stateCode,
    "summary.json",
  );
  const publicSummaryPath = path.join(
    ROOT,
    "public/generated/research",
    stateCode,
    "summary.json",
  );
  const publicCountyDirectory = path.join(
    ROOT,
    "public/generated/research",
    stateCode,
    "counties",
  );
  const protocolCellsPath = path.join(
    ROOT,
    "src/data/generated/research",
    stateCode,
    "protocol-cells.json",
  );
  assert(existsSync(sourceSummaryPath), `Missing ${stateCode} source research summary.`);
  assert(existsSync(publicSummaryPath), `Missing ${stateCode} public research summary.`);
  assert(existsSync(publicCountyDirectory), `Missing ${stateCode} public county research directory.`);
  assert(existsSync(protocolCellsPath), `Missing ${stateCode} protocol-cell projection.`);
  assert(
    readFileSync(sourceSummaryPath, "utf8") === readFileSync(publicSummaryPath, "utf8"),
    `${stateCode} source and public research summaries differ.`,
  );
  const summary = readJson<ResearchStateSummary>(sourceSummaryPath);
  projectionSchema.parse(summary);
  assert(summary.stateCode === stateCode, `${stateCode} summary has a different state.`);

  const config = selectStateResearchConfig(configFile, stateCode);
  const applicability = config.speciesScope.applicabilityPath
    ? readJson<StateApplicabilityFile>(path.join(ROOT, config.speciesScope.applicabilityPath))
    : null;
  const resolvedScope = resolveStateResearchScope({
    configFile,
    stateCode,
    catalogSpeciesIds,
    asOf: summary.asOf,
    applicability,
  });
  const immutableRuns = selectImmutableResearchRunsForState(
    allImmutableRuns,
    stateCode,
    summary.asOf,
  );
  const selectedSpeciesIds = new Set(resolveBoundedAcquisitionSpeciesIds({
    catalogSpeciesIds,
    stateScopeSpeciesIds: resolvedScope.speciesIds,
    outcomeSpeciesIds: immutableRuns.flatMap((bundle) =>
      bundle.outcomes.map((entry) => entry.species_id)
    ),
  }));
  const protocolCells = readJson<ProtocolCellProjection>(protocolCellsPath);
  protocolProjectionSchema.parse(protocolCells);
  assert(protocolCells.stateCode === stateCode, `${stateCode} protocol cells have a different state.`);
  assert(protocolCells.asOf === summary.asOf, `${stateCode} protocol cells have a different as-of date.`);
  assert(
    protocolCells.summary.totalCells === protocolCells.cells.length &&
      protocolCells.summary.applicableCells + protocolCells.summary.notApplicableCells === protocolCells.cells.length,
    `${stateCode} protocol-cell totals are stale.`,
  );
  assertUnique(protocolCells.cells.map((entry) => entry.cellKey), `${stateCode} protocol cells`);

  const countyFips = listCountyEquivalents(stateCode)
    .map((entry) => entry.countyFips)
    .sort();
  const countyFipsSet = new Set(countyFips);
  const countyFilenames = readdirSync(publicCountyDirectory)
    .filter((entry) => entry.endsWith(".json"))
    .sort();
  assert(
    countyFilenames.join("\n") === countyFips.map((entry) => `${entry}.json`).join("\n"),
    `${stateCode} county research files do not exactly match active county equivalents.`,
  );

  const runAssertions = immutableRuns
    .flatMap((bundle) => bundle.assertions)
    .filter((entry) => selectedSpeciesIds.has(entry.species_id));
  const reviewEvents = [
    ...immutableRuns
      .flatMap((bundle) => bundle.reviews)
      .filter((entry) => selectedSpeciesIds.has(entry.species_id)),
    ...laterReviews.filter(
      (entry) =>
        entry.state_code === stateCode &&
        selectedSpeciesIds.has(entry.species_id) &&
        Date.parse(entry.created_at) <= Date.parse(`${summary.asOf}T23:59:59.999Z`),
    ),
  ];
  const stateBootstrapEvidence = config.bootstrapLedgerAllowed
    ? bootstrapEvidence.filter(
        (entry) =>
          entry.stateCode === stateCode && selectedSpeciesIds.has(entry.speciesId),
      )
    : [];
  const compiled = compileAdditiveResearchEvidence({
    bootstrapEvidence: stateBootstrapEvidence,
    runAssertions,
    reviewEvents,
    sources: registry.sources,
    asOf: summary.asOf,
  });
  const runRejections = immutableRuns
    .flatMap((bundle) => bundle.rejections)
    .filter((entry) => selectedSpeciesIds.has(entry.normalized_target.species_id));
  const globalRejections = laterRejections.filter(
    (entry) =>
      entry.normalized_target.state_code === stateCode &&
      selectedSpeciesIds.has(entry.normalized_target.species_id) &&
      Date.parse(entry.created_at) <= Date.parse(`${summary.asOf}T23:59:59.999Z`),
  );
  const outcomes = immutableRuns
    .flatMap((bundle) => bundle.outcomes)
    .filter((entry) => selectedSpeciesIds.has(entry.species_id));
  const explicitOutcomePairs = new Set(
    outcomes
      .filter(
        (entry) =>
          entry.scope_complete &&
          ["evidence-found", "no-qualifying-evidence"].includes(entry.status),
      )
      .map((entry) => pairKey(entry.county_fips, entry.species_id)),
  );
  const stateLegacyRuns = legacyRuns.filter(
    (entry) => entry.stateCode === stateCode,
  );
  const researchedPairKeys = new Set(
    compiled.evidence.map((entry) =>
      pairKey(entry.countyFips, entry.speciesId),
    ),
  );
  for (const run of stateLegacyRuns.filter(
    (entry) => entry.scope === "statewide-source-screen",
  )) {
    for (const speciesId of run.targetSpeciesIds) {
      for (const county of countyFips) {
        researchedPairKeys.add(pairKey(county, speciesId));
      }
    }
  }
  for (const outcome of outcomes) {
    if (
      outcome.scope_complete &&
      ["evidence-found", "no-qualifying-evidence"].includes(outcome.status)
    ) {
      researchedPairKeys.add(
        pairKey(outcome.county_fips, outcome.species_id),
      );
    }
  }
  const blockedPairKeys = new Set(
    outcomes
      .filter(
        (outcome) =>
          outcome.status === "blocked" &&
          !researchedPairKeys.has(
            pairKey(outcome.county_fips, outcome.species_id),
          ),
      )
      .map((outcome) => pairKey(outcome.county_fips, outcome.species_id)),
  );
  const stateSpeciesResolution = deriveStateSpeciesResolution({
    catalogSpeciesIds,
    countyFips,
    explicitApplicabilityBySpeciesId:
      resolvedScope.applicabilityBySpeciesId,
    acceptedPresentSpeciesIds: new Set(
      compiled.evidence
        .filter((entry) => entry.assertion === "recorded-present")
        .map((entry) => entry.speciesId),
    ),
    researchedPairKeys,
    blockedPairKeys,
  });
  const {
    applicabilityBySpeciesId: effectiveApplicabilityBySpeciesId,
    applicabilityDecisionCounts,
    ...expectedStateSpeciesResearch
  } = stateSpeciesResolution;
  const expectedScope = {
    publicationMode: config.mode,
    speciesMode: config.speciesScope.mode,
    certificationScope:
      config.mode === "authoritative" ? "state-baseline" : "bounded-pilot",
    applicabilityPath: config.speciesScope.applicabilityPath,
    applicabilityAsOf: resolvedScope.applicabilityAsOf,
    catalogSpeciesCount: catalogSpeciesIds.length,
    stateSpeciesDenominator: catalogSpeciesIds.length,
    applicableSpeciesCount: applicabilityDecisionCounts.applicable,
    notApplicableSpeciesCount:
      applicabilityDecisionCounts["not-applicable"],
    unknownSpeciesCount: applicabilityDecisionCounts.unknown,
    blockedSpeciesCount: applicabilityDecisionCounts.blocked,
    explicitApplicabilityDecisionCount:
      resolvedScope.explicitApplicabilityDecisionCount,
    derivedApplicableSpeciesCount:
      stateSpeciesResolution.derivedApplicableSpeciesCount,
    resolvedStateSpeciesDecisionCount:
      resolvedScope.resolvedStateSpeciesDecisionCount,
    boundedAcquisitionSpeciesCount: selectedSpeciesIds.size,
    defaultApplicability: resolvedScope.defaultApplicability,
    fullCatalogApplicabilityComplete:
      applicabilityDecisionCounts.unknown === 0 &&
      applicabilityDecisionCounts.blocked === 0,
    fullCatalogResearchAccounted:
      stateSpeciesResolution.fullCatalogResearchAccounted,
    undeterminedSpeciesPolicy: config.speciesScope.undeterminedSpeciesPolicy,
    compatibilityPublication: config.compatibilityPublication,
    protocolModel:
      config.mode === "authoritative"
        ? "explicit-source-species-legacy-migration"
        : "explicit-source-species-active",
  };
  assert(
    stableJson(summary.scope) === stableJson(expectedScope),
    `${stateCode} projection scope differs from its state config and reviewed evidence.`,
  );
  assert(
    stableJson(summary.stateSpeciesResearch) ===
      stableJson({
        ...expectedStateSpeciesResearch,
        applicabilityDecisionCounts,
      }),
    `${stateCode} state-species research resolution is stale.`,
  );

  const aggregate = {
    verifiedPresent: 0,
    verifiedAbsent: 0,
    notDetected: 0,
    researchedUnresolved: 0,
    notResearched: 0,
    explicitOutcomePairs: 0,
  };
  const projectedEvidenceIds = new Set<string>();
  for (const filename of countyFilenames) {
    const county = readJson<ResearchCountyFile>(
      path.join(publicCountyDirectory, filename),
    );
    projectionSchema.parse(county);
    assert(county.stateCode === stateCode, `${filename} has a different state.`);
    assert(countyFipsSet.has(county.countyFips), `${filename} has inactive geography.`);
    assert(county.asOf === summary.asOf, `${filename} has a different as-of date.`);
    assert(
      stableJson(county.scope) === stableJson(summary.scope),
      `${filename} has a different projection scope.`,
    );
    const pairSpeciesIds = county.pairs.map((entry) => entry.speciesId);
    assertUnique(pairSpeciesIds, `${filename} species rows`);
    assert(
      [...pairSpeciesIds].sort().join("\n") ===
        [...selectedSpeciesIds].sort().join("\n"),
      `${filename} does not contain the exact bounded acquisition scope.`,
    );
    const fullStatusTotal =
      county.summary.verifiedPresent +
      county.summary.verifiedAbsent +
      county.summary.notDetected +
      county.summary.researchedUnresolved +
      county.summary.notResearched;
    assert(
      fullStatusTotal === county.summary.resolvablePairs,
      `${filename} full-catalog status counts are incomplete.`,
    );
    const bounded = county.summary.boundedAcquisition;
    const boundedStatusTotal =
      bounded.verifiedPresent +
      bounded.verifiedAbsent +
      bounded.notDetected +
      bounded.researchedUnresolved +
      bounded.notResearched;
    assert(
      bounded.speciesCount === selectedSpeciesIds.size &&
        bounded.totalPairs === selectedSpeciesIds.size &&
        boundedStatusTotal === selectedSpeciesIds.size,
      `${filename} bounded acquisition status counts are incomplete.`,
    );
    assert(
      county.pairResolution.explicitPairCount === county.pairs.length,
      `${filename} sparse pair descriptor is stale.`,
    );
    for (const pair of county.pairs) {
      const expectedApplicability =
        effectiveApplicabilityBySpeciesId.get(pair.speciesId) ??
        resolvedScope.defaultApplicability;
      assert(
        pair.applicabilityStatus === expectedApplicability,
        `${filename} ${pair.speciesId} applicability differs from reviewed evidence.`,
      );
      if (pair.displayStatus === "verified-present") {
        assert(
          pair.applicabilityStatus === "applicable",
          `${filename} ${pair.speciesId} is verified present but not state applicable.`,
        );
      }
      for (const evidence of pair.evidence) {
        assert(sourceIds.has(evidence.sourceId), `${filename} references an unknown source.`);
        projectedEvidenceIds.add(evidence.evidenceId);
      }
    }
    aggregate.verifiedPresent += county.summary.verifiedPresent;
    aggregate.verifiedAbsent += county.summary.verifiedAbsent;
    aggregate.notDetected += county.summary.notDetected;
    aggregate.researchedUnresolved += county.summary.researchedUnresolved;
    aggregate.notResearched += county.summary.notResearched;
    aggregate.explicitOutcomePairs += county.summary.explicitOutcomePairs;
  }

  const totals = summary.summary;
  assert(totals.speciesCount === catalogSpeciesIds.length, `${stateCode} catalog species count is stale.`);
  assert(totals.countyCount === countyFips.length, `${stateCode} county count is stale.`);
  assert(
    totals.totalPairs === catalogSpeciesIds.length * countyFips.length,
    `${stateCode} full denominator pair count is stale.`,
  );
  assert(
    totals.boundedAcquisition.speciesCount === selectedSpeciesIds.size &&
      totals.boundedAcquisition.totalPairs ===
        selectedSpeciesIds.size * countyFips.length,
    `${stateCode} bounded acquisition denominator is stale.`,
  );
  for (const field of [
    "verifiedPresent",
    "verifiedAbsent",
    "notDetected",
    "researchedUnresolved",
    "notResearched",
  ] as const) {
    assert(aggregate[field] === totals[field], `${stateCode} ${field} county total is stale.`);
  }
  assert(
    aggregate.explicitOutcomePairs === totals.explicitOutcomePairCount &&
      explicitOutcomePairs.size === totals.explicitOutcomePairCount,
    `${stateCode} explicit outcome total is stale.`,
  );
  assert(totals.conflictCount === 0, `${stateCode} has an unadjudicated determination conflict.`);
  assert(
    totals.bootstrapEvidenceRecordCount === stateBootstrapEvidence.length &&
      totals.runEvidenceRecordCount === compiled.runEvidence.length &&
      totals.evidenceRecordCount === stateBootstrapEvidence.length + compiled.runEvidence.length,
    `${stateCode} evidence counts are stale.`,
  );
  assert(
    totals.rejectionRecordCount === runRejections.length + globalRejections.length,
    `${stateCode} rejection count is stale.`,
  );
  assert(
    totals.researchRunCount === stateLegacyRuns.length + immutableRuns.length,
    `${stateCode} research run count is stale.`,
  );
  const projectedRunEvidenceIds = new Set(
    compiled.projectedRunAssertions.map((entry) => entry.eventId),
  );
  for (const assertion of runAssertions) {
    assert(
      projectedEvidenceIds.has(assertion.eventId) ===
        projectedRunEvidenceIds.has(assertion.eventId),
      `${stateCode} assertion ${assertion.eventId} publication differs from review resolution.`,
    );
  }

  const migration = readJson<MigrationCandidatesFile>(
    path.join(ROOT, config.migrationCandidatesPath),
  );
  assert(
    !migration.stateCode || migration.stateCode === stateCode,
    `${stateCode} migration candidate file has a different state.`,
  );
  assert(migration.candidateCount === migration.candidates.length, `${stateCode} migration candidate count is stale.`);
  assert(
    migration.distinctPairCount ===
      new Set(migration.candidates.map((entry) => pairKey(entry.countyFips, entry.speciesId))).size,
    `${stateCode} migration candidate pair count is stale.`,
  );

  results.push({
    stateCode,
    publicationMode: config.mode,
    speciesCount: totals.speciesCount,
    countyEquivalentCount: totals.countyCount,
    totalPairs: totals.totalPairs,
    evidenceRecordCount: totals.evidenceRecordCount,
    rejectionRecordCount: totals.rejectionRecordCount,
    explicitOutcomePairCount: totals.explicitOutcomePairCount,
  });
}

console.log(JSON.stringify({ stateProjectionCount: results.length, states: results }, null, 2));
