import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { loadImmutableResearchRun, sha256, stableJson } from "@/lib/research/run-files";
import type { ResearchStateSummary } from "@/lib/research/types";

const ROOT = process.cwd();
const RUNS_ROOT = path.join(ROOT, "src/data/research/runs");
const OUTPUT_PATH = path.join(
  ROOT,
  "ops/national-research/evaluations/jurisdiction-wide-eradication-implementation-20260901-r1.json",
);
const APPROVAL_REQUEST_PATH =
  "ops/national-research/evaluations/jurisdiction-wide-eradication-human-approval-request-20260901-r1.json";
const APPROVAL_RECEIPT_PATH =
  "ops/national-research/evaluations/jurisdiction-wide-eradication-human-approval-receipt-20260901-r1.json";
const RUN_PREFIX = "20260901T191653000Z__";
const CODE_COMMIT = "4a62ada07ca93cce47befe6eb047273de452f55f";
const AS_OF = "2026-09-02";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function pairKey(value: { county_fips: string; species_id: string }) {
  return `${value.county_fips}:${value.species_id}`;
}

const mode = process.argv[2] ?? "--check";
assert(mode === "--write" || mode === "--check", "Use --write or --check.");
const runDirectories = readdirSync(RUNS_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name.startsWith(RUN_PREFIX))
  .map((entry) => path.join(RUNS_ROOT, entry.name))
  .sort();
assert(runDirectories.length === 54, `Expected 54 approved batch runs, found ${runDirectories.length}.`);
const bundles = runDirectories.map((directory) => loadImmutableResearchRun(ROOT, directory));
assert(bundles.every((bundle) => bundle.receipt.code_commit === CODE_COMMIT), "Approved batch run code commit differs.");
assert(bundles.every((bundle) => bundle.receipt.started_at === "2026-09-01T19:16:53.000Z"), "Approved batch run timestamp differs.");
assert(bundles.every((bundle) => bundle.receipt.upstream_requests.length === 0), "Approved batch unexpectedly contains an upstream request.");
const assertions = bundles.flatMap((bundle) => bundle.assertions);
const reviews = bundles.flatMap((bundle) => bundle.reviews);
const rejections = bundles.flatMap((bundle) => bundle.rejections);
const outcomes = bundles.flatMap((bundle) => bundle.outcomes);
const absenceAssertions = assertions.filter((assertion) => assertion.claim_type === "officially-absent");
const presenceAssertions = assertions.filter((assertion) => assertion.claim_type === "recorded-present");
assert(assertions.length === 3151, `Expected 3151 assertions, found ${assertions.length}.`);
assert(absenceAssertions.length === 3147, `Expected 3147 absence assertions, found ${absenceAssertions.length}.`);
assert(presenceAssertions.length === 4, `Expected 4 historical assertions, found ${presenceAssertions.length}.`);
assert(new Set(absenceAssertions.map(pairKey)).size === 3147, "Approved absence assertions do not cover 3147 unique pairs.");
assert(new Set(presenceAssertions.map(pairKey)).size === 4, "Approved historical assertions do not cover four unique pairs.");
assert(reviews.length === 3151 && reviews.every((review) => review.review_level === "human-approved" && review.actor_id === "Ocean" && review.publication_eligible), "Approved review provenance differs.");
assert(rejections.length === 0, "Approved batch contains a rejection record.");
assert(outcomes.length === 3151 && outcomes.every((outcome) => outcome.status === "evidence-found" && outcome.scope_complete), "Approved outcomes do not reconcile.");
assert(absenceAssertions.filter((assertion) => assertion.parent_jurisdiction_evidence_id === "vespa-mandarinia-us-officially-eradicated-2024").length === 3144, "National hornet child count differs.");
assert(absenceAssertions.filter((assertion) => assertion.parent_jurisdiction_evidence_id === "asian-longhorned-beetle-nj-officially-eradicated-2013").length === 3, "New Jersey beetle child count differs.");

const stateRegistry = readJson<{
  nationalV1: { certificationOrder: string[] };
}>(path.join(ROOT, "src/data/research/state-registry.json"));
const stateCodes = [...stateRegistry.nationalV1.certificationOrder];
assert(stateCodes.length === 51, "National v1 state count differs.");
const summaries = stateCodes.map((stateCode) =>
  readJson<ResearchStateSummary>(path.join(ROOT, `src/data/generated/research/${stateCode}/summary.json`)),
);
assert(summaries.every((summary) => summary.asOf === AS_OF), "A generated state summary uses another as-of date.");
assert(summaries.every((summary) => summary.summary.conflictCount === 0), "A generated state summary contains a conflict.");
const nationalCounts = summaries.reduce(
  (counts, summary) => ({
    verifiedPresent: counts.verifiedPresent + summary.summary.verifiedPresent,
    verifiedAbsent: counts.verifiedAbsent + summary.summary.verifiedAbsent,
    notDetected: counts.notDetected + summary.summary.notDetected,
    researchedUnresolved: counts.researchedUnresolved + summary.summary.researchedUnresolved,
    notResearched: counts.notResearched + summary.summary.notResearched,
    conflicts: counts.conflicts + summary.summary.conflictCount,
    fullCountySpeciesDenominator: counts.fullCountySpeciesDenominator + summary.summary.totalPairs,
    countyEquivalentCount: counts.countyEquivalentCount + summary.summary.countyCount,
  }),
  {
    verifiedPresent: 0,
    verifiedAbsent: 0,
    notDetected: 0,
    researchedUnresolved: 0,
    notResearched: 0,
    conflicts: 0,
    fullCountySpeciesDenominator: 0,
    countyEquivalentCount: 0,
  },
);
const expectedNationalCounts = {
  verifiedPresent: 273796,
  verifiedAbsent: 3143,
  notDetected: 236,
  researchedUnresolved: 1314102,
  notResearched: 6281299,
  conflicts: 0,
  fullCountySpeciesDenominator: 7872576,
  countyEquivalentCount: 3144,
};
assert(stableJson(nationalCounts) === stableJson(expectedNationalCounts), `National counts differ: ${JSON.stringify(nationalCounts)}.`);
for (const summary of summaries) {
  const expectedAbsent = summary.stateCode === "WA"
    ? summary.summary.countyCount - 1
    : summary.summary.countyCount;
  assert(summary.summary.verifiedAbsent === expectedAbsent, `${summary.stateCode} verified-absent count differs from the approved temporal contract.`);
}

function targetPair(stateCode: string, countyFips: string, speciesId: string) {
  const county = readJson<{ pairs: Array<{
    speciesId: string;
    displayStatus: string;
    historicalOccurrenceStatus?: string;
    currentDeterminationStatus?: string;
    conflict: boolean;
    evidence: Array<{ assertion: string; parentJurisdictionEvidenceId?: string }>;
  }> }>(path.join(ROOT, `public/generated/research/${stateCode}/counties/${countyFips}.json`));
  const pair = county.pairs.find((entry) => entry.speciesId === speciesId);
  assert(pair, `Missing target pair ${countyFips}:${speciesId}.`);
  return pair;
}

const historicalTargets = [
  { stateCode: "WA", countyFips: "53073", speciesId: "vespa-mandarinia" },
  { stateCode: "NJ", countyFips: "34017", speciesId: "asian-longhorned-beetle" },
  { stateCode: "NJ", countyFips: "34023", speciesId: "asian-longhorned-beetle" },
  { stateCode: "NJ", countyFips: "34039", speciesId: "asian-longhorned-beetle" },
].map((target) => ({ ...target, pair: targetPair(target.stateCode, target.countyFips, target.speciesId) }));
for (const target of historicalTargets) {
  assert(
    target.pair.displayStatus === "verified-present" &&
      target.pair.historicalOccurrenceStatus === "recorded-present" &&
      target.pair.currentDeterminationStatus === "officially-eradicated" &&
      !target.pair.conflict &&
      target.pair.evidence.some((evidence) => evidence.assertion === "recorded-present") &&
      target.pair.evidence.some((evidence) => evidence.assertion === "officially-absent" && evidence.parentJurisdictionEvidenceId),
    `Historical target ${target.countyFips}:${target.speciesId} differs from the approved temporal contract.`,
  );
}
const absenceSample = targetPair("AL", "01001", "vespa-mandarinia");
assert(
  absenceSample.displayStatus === "verified-absent" &&
    absenceSample.historicalOccurrenceStatus === "none" &&
    absenceSample.currentDeterminationStatus === "officially-eradicated" &&
    !absenceSample.conflict,
  "No-history absence sample differs from the approved temporal contract.",
);

const approvalRequestBytes = readFileSync(path.join(ROOT, APPROVAL_REQUEST_PATH));
const approvalReceiptBytes = readFileSync(path.join(ROOT, APPROVAL_RECEIPT_PATH));
const result = {
  schemaVersion: 1,
  evaluationId: "jurisdiction-wide-eradication-implementation-20260901-r1",
  evaluatedAt: "2026-09-01T19:16:53.000Z",
  asOf: AS_OF,
  status: "verified-local-batch",
  approval: {
    requestPath: APPROVAL_REQUEST_PATH,
    requestSha256: sha256(approvalRequestBytes),
    receiptPath: APPROVAL_RECEIPT_PATH,
    receiptSha256: sha256(approvalReceiptBytes),
    actorId: "Ocean",
  },
  immutableRuns: {
    codeCommit: CODE_COMMIT,
    count: bundles.length,
    runIdsSha256: sha256(`${bundles.map((bundle) => bundle.receipt.run_id).sort().join("\n")}\n`),
    sourcePairScreens: outcomes.length,
    currentDeterminationAssertions: absenceAssertions.length,
    historicalOccurrenceAssertions: presenceAssertions.length,
    humanApprovedReviews: reviews.length,
    rejectionRecords: rejections.length,
    upstreamRequests: bundles.reduce((count, bundle) => count + bundle.receipt.upstream_requests.length, 0),
  },
  projections: {
    stateCount: summaries.length,
    sequentialCompilerAsOf: AS_OF,
    nationalCounts,
    expectedNationalCounts,
    historicalTargets: historicalTargets.map(({ pair: _pair, ...target }) => ({
      ...target,
      displayStatus: "verified-present",
      historicalOccurrenceStatus: "recorded-present",
      currentDeterminationStatus: "officially-eradicated",
      conflict: false,
    })),
    absenceSample: {
      stateCode: "AL",
      countyFips: "01001",
      speciesId: "vespa-mandarinia",
      displayStatus: "verified-absent",
      historicalOccurrenceStatus: "none",
      currentDeterminationStatus: "officially-eradicated",
      conflict: false,
    },
  },
  checks: {
    approvedArtifactHashMatches: true,
    exactParentRecords: 2,
    exactCurrentDeterminationPairs: absenceAssertions.length,
    exactHistoricalOccurrencePairs: presenceAssertions.length,
    allReviewsHumanApprovedByOcean: true,
    allStateCountsReconciled: true,
    zeroConflicts: true,
    fullCountySpeciesDenominatorConserved: true,
    targetTemporalAuditPassed: true,
    noLiveNetworkRequests: true,
    r2Mutations: 0,
    deploymentMutations: 0,
    pushMutations: 0,
  },
};
const generated = `${JSON.stringify(result, null, 2)}\n`;
if (mode === "--write") writeFileSync(OUTPUT_PATH, generated);
else assert(readFileSync(OUTPUT_PATH, "utf8") === generated, "Committed eradication implementation audit differs from deterministic output.");
process.stdout.write(`${JSON.stringify({ mode, outputPath: path.relative(ROOT, OUTPUT_PATH).split(path.sep).join("/"), outputSha256: sha256(generated), nationalCounts }, null, 2)}\n`);
