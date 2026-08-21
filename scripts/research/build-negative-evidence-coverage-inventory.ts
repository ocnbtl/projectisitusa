import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sha256, stableJson } from "./national-gbif-download";

type JsonRecord = Record<string, unknown>;

type PairState = {
  pairKey: string;
  stateCode: string;
  countyFips: string;
  speciesId: string;
  displayStatus: string;
  researchStatus: string;
  evidenceAssertions: number;
  unresearched: boolean;
  blocked: boolean;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asObject(value: unknown, label: string): JsonRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as JsonRecord;
}

function readJson(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as JsonRecord;
}

function stringValue(value: unknown, label: string) {
  assert(typeof value === "string" && value.length > 0, `${label} must be a nonempty string.`);
  return value;
}

function integerValue(value: unknown, label: string) {
  assert(typeof value === "number" && Number.isInteger(value) && value >= 0, `${label} must be a nonnegative integer.`);
  return value;
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const required = ["portfolio", "aphis-pilot", "absence-discovery", "output", "evaluation-id", "evaluated-at", "baseline-sha"];
  assert(required.every((key) => values.has(key)), `Missing required argument; expected ${required.join(", ")}.`);
  return {
    portfolioPath: path.resolve(values.get("portfolio")!),
    aphisPilotPath: path.resolve(values.get("aphis-pilot")!),
    absenceDiscoveryPath: path.resolve(values.get("absence-discovery")!),
    outputPath: path.resolve(values.get("output")!),
    evaluationId: values.get("evaluation-id")!,
    evaluatedAt: values.get("evaluated-at")!,
    baselineSha: values.get("baseline-sha")!,
  };
}

function relativePath(root: string, filepath: string) {
  return path.relative(root, filepath).replaceAll("\\", "/");
}

function pairState(root: string, stateCode: string, countyFips: string, speciesId: string): PairState {
  const shard = readJson(path.join(root, "public", "generated", "research", stateCode, "counties", `${countyFips}.json`));
  assert(Array.isArray(shard.pairs), `County shard ${stateCode}/${countyFips} lacks pairs.`);
  const raw = shard.pairs.find((value) => asObject(value, "county pair").speciesId === speciesId);
  if (!raw) {
    return {
      pairKey: `${countyFips}:${speciesId}`,
      stateCode,
      countyFips,
      speciesId,
      displayStatus: "not-researched",
      researchStatus: "not-started",
      evidenceAssertions: 0,
      unresearched: true,
      blocked: false,
    };
  }
  const pair = asObject(raw, `${countyFips}:${speciesId}`);
  const displayStatus = stringValue(pair.displayStatus, `${countyFips}:${speciesId}.displayStatus`);
  const researchStatus = stringValue(pair.researchStatus, `${countyFips}:${speciesId}.researchStatus`);
  return {
    pairKey: `${countyFips}:${speciesId}`,
    stateCode,
    countyFips,
    speciesId,
    displayStatus,
    researchStatus,
    evidenceAssertions: Array.isArray(pair.evidence) ? pair.evidence.length : 0,
    unresearched: displayStatus === "not-researched" && researchStatus === "not-started",
    blocked: displayStatus === "not-researched" && researchStatus === "blocked",
  };
}

function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  assert(!existsSync(args.outputPath), "Negative-evidence coverage inventory refuses to overwrite an existing artifact.");
  const registryPath = path.join(root, "src/data/research/source-registry.json");
  const registry = readJson(registryPath);
  const portfolio = readJson(args.portfolioPath);
  const aphisPilot = readJson(args.aphisPilotPath);
  const absenceDiscovery = readJson(args.absenceDiscoveryPath);
  assert(Array.isArray(registry.sources), "Source registry lacks sources.");
  const sourceById = new Map(registry.sources.map((value) => {
    const source = asObject(value, "source registry entry");
    return [stringValue(source.id, "source ID"), source];
  }));
  const matrix = asObject(portfolio.currentGeneratedMatrix, "portfolio.currentGeneratedMatrix");
  const nationalUnresearchedPairs = integerValue(matrix.notResearched, "currentGeneratedMatrix.notResearched");
  const knownPairs = {
    aphis: [pairState(root, "AL", "01025", "varroa-destructor")],
    monterey: [
      pairState(root, "CA", "06053", "hydrilla"),
      pairState(root, "CA", "06053", "centaurea-diffusa"),
    ],
  };
  const sourceRows = [
    {
      sourceId: "aphis-honey-bee",
      contractState: "operational-versioned-explicit-survey",
      negativeClaimType: "not-detected",
      denominatorState: "one-pair-pilot-only-broader-national-target-scope-unmeasured",
      knownTargetPairs: knownPairs.aphis.length,
      knownUnresearchedPairs: knownPairs.aphis.filter((entry) => entry.unresearched).length,
      knownBlockedPairs: knownPairs.aphis.filter((entry) => entry.blocked).length,
      knownAlreadyResearchedPairs: knownPairs.aphis.filter((entry) => !entry.unresearched && !entry.blocked).length,
      knownPairs: knownPairs.aphis,
      nationalUnresearchedCoveragePercent: 0,
      immediatelyExecutableNetNewPairs: 0,
      nextContractWork: "Measure the bounded national zero-result target scope before proposing another acquisition; preserve survey-area semantics and exact source county text.",
    },
    {
      sourceId: "manual-authoritative",
      contractState: "manual-two-pair-independent-review-incomplete",
      negativeClaimType: "historical-officially-absent-candidate",
      denominatorState: "two-known-candidates-only-no-automated-national-contract",
      knownTargetPairs: knownPairs.monterey.length,
      knownUnresearchedPairs: knownPairs.monterey.filter((entry) => entry.unresearched).length,
      knownBlockedPairs: knownPairs.monterey.filter((entry) => entry.blocked).length,
      knownAlreadyResearchedPairs: knownPairs.monterey.filter((entry) => !entry.unresearched && !entry.blocked).length,
      knownPairs: knownPairs.monterey,
      nationalUnresearchedCoveragePercent: 0,
      immediatelyExecutableNetNewPairs: 0,
      nextContractWork: "Retain dated official bytes and run independent later-presence review only as a bounded historical-provenance pilot; both candidate pairs are already verified-present and cannot move the unresearched axis.",
    },
    {
      sourceId: "usfws-invasive-carp-edna",
      contractState: "manual-registry-entry-no-research-adapter",
      negativeClaimType: "not-detected",
      denominatorState: "unknown-target-completeness-no-versioned-pair-scope",
      knownTargetPairs: null,
      knownUnresearchedPairs: null,
      knownBlockedPairs: null,
      knownAlreadyResearchedPairs: null,
      knownPairs: [],
      nationalUnresearchedCoveragePercent: null,
      immediatelyExecutableNetNewPairs: 0,
      nextContractWork: "Define exact target taxa, sample geography, negative-result fields, sampling time, and county-resolution rules before any coverage count.",
    },
    {
      sourceId: "water-quality-portal",
      contractState: "legacy-positive-importer-no-versioned-negative-research-adapter",
      negativeClaimType: "not-detected",
      denominatorState: "unknown-protocol-and-target-completeness",
      knownTargetPairs: null,
      knownUnresearchedPairs: null,
      knownBlockedPairs: null,
      knownAlreadyResearchedPairs: null,
      knownPairs: [],
      nationalUnresearchedCoveragePercent: null,
      immediatelyExecutableNetNewPairs: 0,
      nextContractWork: "Specify explicit target analytes or taxa, detection limits, zero-result semantics, sampled geometry, and frozen query completeness.",
    },
    {
      sourceId: "usgs-bbs",
      contractState: "legacy-route-start-importer-no-versioned-negative-research-adapter",
      negativeClaimType: "not-detected",
      denominatorState: "unknown-route-effort-target-completeness-and-county-coverage",
      knownTargetPairs: null,
      knownUnresearchedPairs: null,
      knownBlockedPairs: null,
      knownAlreadyResearchedPairs: null,
      knownPairs: [],
      nationalUnresearchedCoveragePercent: null,
      immediatelyExecutableNetNewPairs: 0,
      nextContractWork: "Define complete route-year target lists, effort gates, route-to-county scope, and non-detection compatibility before counting eligible pairs.",
    },
    {
      sourceId: "neon-tall",
      contractState: "legacy-site-importer-no-versioned-negative-research-adapter",
      negativeClaimType: "not-detected",
      denominatorState: "unknown-plot-effort-target-completeness-and-county-coverage",
      knownTargetPairs: null,
      knownUnresearchedPairs: null,
      knownBlockedPairs: null,
      knownAlreadyResearchedPairs: null,
      knownPairs: [],
      nationalUnresearchedCoveragePercent: null,
      immediatelyExecutableNetNewPairs: 0,
      nextContractWork: "Define complete plot-event target lists, effort and detection contracts, plot-to-county scope, and sampled-area caveats.",
    },
  ].map((entry) => {
    const registered = sourceById.get(entry.sourceId);
    assert(registered, `Negative-evidence matrix source ${entry.sourceId} is not registered.`);
    const capabilities = registered.evidenceCapabilities;
    assert(Array.isArray(capabilities) && capabilities.includes(entry.negativeClaimType === "historical-officially-absent-candidate" ? "officially-absent" : "not-detected"), `Source ${entry.sourceId} lacks its negative capability.`);
    return {
      ...entry,
      registryStatus: registered.status,
      negativeSemantics: registered.negativeSemantics,
    };
  });
  const aphisAccepted = asObject(aphisPilot.acceptedEvidence, "APHIS pilot acceptedEvidence");
  assert(`${aphisAccepted.countyFips}:${aphisAccepted.speciesId}` === knownPairs.aphis[0]!.pairKey, "APHIS pilot pair differs from the generated matrix lookup.");
  const findings = asObject(absenceDiscovery.findings, "absence discovery findings");
  assert(integerValue(findings.exactCatalogCountyEradicationCandidates, "exact county candidates") === knownPairs.monterey.length, "Monterey candidate count differs.");

  const output = {
    schemaVersion: 1,
    evaluationId: args.evaluationId,
    evaluatedAt: args.evaluatedAt,
    baselineSha: args.baselineSha,
    objective: "Inventory negative-capable source contracts against the exact current unresearched pair corpus without treating missing source rows as absence or non-detection.",
    inputs: [registryPath, args.portfolioPath, args.aphisPilotPath, args.absenceDiscoveryPath].map((filepath) => ({
      path: relativePath(root, filepath),
      sha256: sha256(readFileSync(filepath)),
    })),
    currentGeneratedMatrix: {
      generatedContentCommit: matrix.generatedContentCommit,
      denominator: matrix.denominator,
      verifiedPresent: matrix.verifiedPresent,
      verifiedAbsent: matrix.verifiedAbsent,
      notDetected: matrix.notDetected,
      researchedUnresolved: matrix.researchedUnresolved,
      notResearched: nationalUnresearchedPairs,
      conserved: matrix.conserved,
    },
    sourceToUnresearchedPairMatrix: sourceRows,
    exactKnownCandidateScope: {
      sourceCount: sourceRows.filter((entry) => entry.knownTargetPairs !== null).length,
      targetPairs: sourceRows.reduce((sum, entry) => sum + (entry.knownTargetPairs ?? 0), 0),
      unresearchedPairs: sourceRows.reduce((sum, entry) => sum + (entry.knownUnresearchedPairs ?? 0), 0),
      blockedPairs: sourceRows.reduce((sum, entry) => sum + (entry.knownBlockedPairs ?? 0), 0),
      alreadyResearchedPairs: sourceRows.reduce((sum, entry) => sum + (entry.knownAlreadyResearchedPairs ?? 0), 0),
      immediatelyExecutableNetNewPairs: sourceRows.reduce((sum, entry) => sum + entry.immediatelyExecutableNetNewPairs, 0),
    },
    registryConsistencyFinding: {
      sourceId: "usfs-ids",
      evidenceCapabilities: asObject(sourceById.get("usfs-ids"), "usfs-ids").evidenceCapabilities,
      negativeSemantics: asObject(sourceById.get("usfs-ids"), "usfs-ids").negativeSemantics,
      finding: "The registry says explicit-survey-only but exposes only recorded-present capability. The source is excluded from negative coverage until the registry and a tested target-completeness contract agree.",
    },
    comparisonLanes: [
      {
        sourceId: "idigbio-preserved-specimens",
        status: "historical-replay-exhausted-national-contract-blocked",
        completedPairs: 155,
        currentExecutableNetNewPairs: 0,
      },
      {
        sourceId: "usda-nrcs-plants",
        status: "pure-exact-scope-exhausted-mixed-taxonomy-review-remains",
        currentExecutableNetNewPairs: 0,
        remainingMixedMappings: 8,
      },
      {
        sourceId: "aphis-federal-quarantine",
        status: "mapped-national-scope-exhausted-no-negative-capability",
        currentExecutableNetNewPairs: 0,
      },
    ],
    decision: {
      negativeLaneGate: "NO-GO-AS-MATERIAL-YIELD-LANE",
      reason: "The only exact known negative candidate scope contains three already-researched pairs and zero unresearched pairs. Four broader negative-capable sources lack versioned target-completeness contracts, so their unresearched denominators are unknown rather than zero.",
      nextSafeEngineeringAction: "Implement one bounded, fixture-tested negative-evidence target-completeness contract before any provider acquisition proposal; do not use the two Monterey historical candidates as a net-unique yield lane because current presence already controls both pairs.",
      providerRequestAuthorized: false,
      evidenceAssertionAuthorized: false,
      generationAuthorized: false,
      publicationAuthorized: false,
      r2PromotionAuthorized: false,
    },
    semantics: {
      unknownDenominatorIsZero: false,
      sourceSilenceIsAbsence: false,
      sourceSilenceIsNonDetection: false,
      sampledAreaNonDetectionIsCountyAbsence: false,
      historicalEradicationOverridesLaterPresence: false,
      alreadyResearchedPairIsNetUniqueMovement: false,
    },
    operations: {
      networkRequests: 0,
      providerGets: 0,
      providerPosts: 0,
      datasetMovement: 0,
      evidenceAssertionsCreated: 0,
      generationCommands: 0,
      publicationMutations: 0,
      r2Mutations: 0,
    },
    checks: {
      currentMatrixConserved: matrix.conserved === true,
      allNegativeSourcesRegistered: sourceRows.length === 6,
      knownCandidatePairClassesConserved: sourceRows.every((entry) => entry.knownTargetPairs === null || entry.knownTargetPairs === (entry.knownUnresearchedPairs ?? 0) + (entry.knownBlockedPairs ?? 0) + (entry.knownAlreadyResearchedPairs ?? 0)),
      acceptedAphisPairReconciled: true,
      montereyCandidatesReconciled: true,
      unknownCoverageNotCoercedToZero: sourceRows.filter((entry) => entry.knownTargetPairs === null).every((entry) => entry.nationalUnresearchedCoveragePercent === null),
      externalMutationCountIsZero: true,
    },
  };
  assert(Object.values(output.checks).every(Boolean), "Negative-evidence inventory checks did not all pass.");
  mkdirSync(path.dirname(args.outputPath), { recursive: true });
  const contents = stableJson(output);
  writeFileSync(args.outputPath, contents, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: relativePath(root, args.outputPath),
    outputSha256: sha256(contents),
    negativeLaneGate: output.decision.negativeLaneGate,
    exactKnownTargetPairs: output.exactKnownCandidateScope.targetPairs,
    exactKnownUnresearchedPairs: output.exactKnownCandidateScope.unresearchedPairs,
    unknownCoverageSources: sourceRows.filter((entry) => entry.knownTargetPairs === null).length,
    providerPosts: 0,
    datasetMovement: 0,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
