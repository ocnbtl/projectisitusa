import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadImmutableResearchRun, sha256 } from "@/lib/research/run-files";
import type { ResearchCountyFile, ResearchStateSummary } from "@/lib/research/types";
import { ALB_BASELINE_COMMIT, ALB_REVIEW_PATH, ALB_SPECIES_ID } from "./alb-eradication-review";
import { ALB_APPROVAL_RECEIPT_PATH, loadApprovedAlbBatch } from "./alb-approved-batch";

const root = process.cwd();
const outputPath = "ops/national-research/evaluations/aphis-alb-eradication-implementation-20260905-r2.json";
const codeCommit = "2b39357d5057b5793c46b0d5b64934ccdfeda07b";
const prefix = "20260905T035643894Z__aphis-asian-longhorned-beetle-program-update-2026__";
const mode = process.argv[2] ?? "--check";
assert(["--write", "--check"].includes(mode));
const read = <T,>(p: string): T => JSON.parse(readFileSync(path.join(root, p), "utf8")) as T;
const baseline = <T,>(p: string): T => JSON.parse(execFileSync("git", ["-c", "safe.directory=C:/Code/project-isitusa", "show", `${ALB_BASELINE_COMMIT}:${p}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 }).toString("utf8")) as T;
if (mode === "--write") execFileSync("git", ["-c", "safe.directory=C:/Code/project-isitusa", "diff", "--quiet", "HEAD", "--", "public/generated/research"], { cwd: root });
const projectionCommit = mode === "--write"
  ? execFileSync("git", ["-c", "safe.directory=C:/Code/project-isitusa", "log", "-1", "--format=%H", "--", "public/generated/research"], { cwd: root, encoding: "utf8" }).trim()
  : read<{ projectionCommit: string }>(outputPath).projectionCommit;
assert(/^[a-f0-9]{40}$/u.test(projectionCommit), "The ALB audit requires an exact committed projection snapshot.");
// Preserve this batch's measured delta when later research changes the live checkout.
const projection = <T,>(p: string): T => JSON.parse(execFileSync("git", ["-c", "safe.directory=C:/Code/project-isitusa", "show", `${projectionCommit}:${p}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 }).toString("utf8")) as T;
const { review, receipt, receiptSha256 } = loadApprovedAlbBatch(root);
const dirs = readdirSync(path.join(root, "src/data/research/runs"), { withFileTypes: true }).filter(d => d.isDirectory() && d.name.startsWith(prefix)).map(d => d.name).sort();
assert.equal(dirs.length, 2);
const bundles = dirs.map(d => loadImmutableResearchRun(root, path.join(root, "src/data/research/runs", d)));
const assertions = bundles.flatMap(b => b.assertions);
const reviews = bundles.flatMap(b => b.reviews);
const outcomes = bundles.flatMap(b => b.outcomes);
assert(bundles.every(b => b.receipt.code_commit === codeCommit && b.receipt.adapter_version === "1.1.0"));
assert(bundles.every(b => b.receipt.started_at === receipt.recordedAt && b.receipt.upstream_requests.length === 0 && b.rejections.length === 0));
assert.equal(assertions.length, 101);
assert.deepEqual(assertions.map(a => a.county_fips).sort(), review.scope.eligibleCountyFips);
assert(assertions.every(a => a.species_id === ALB_SPECIES_ID && a.claim_type === "officially-absent"));
assert.equal(reviews.length, 101);
assert(reviews.every(r => r.actor_id === "Ocean" && r.review_level === "human-approved" && r.decision === "accepted" && r.publication_eligible));
assert.equal(outcomes.length, 101);
assert(outcomes.every(o => o.status === "evidence-found" && o.scope_complete));
for (const parent of review.proposedParentRecords) {
  assert.deepEqual(assertions.filter(a => a.parent_jurisdiction_evidence_id === parent.id).map(a => a.county_fips).sort(), parent.jurisdiction.countyFips);
}

const states = read<{ nationalV1: { certificationOrder: string[] } }>("src/data/research/state-registry.json").nationalV1.certificationOrder;
const summaries = states.map(state => projection<ResearchStateSummary>(`src/data/generated/research/${state}/summary.json`));
assert.equal(summaries.length, 51);
assert(summaries.every(s => s.asOf === "2026-09-05" && s.summary.conflictCount === 0));
const counts = summaries.reduce((c, s) => ({
  verifiedPresent: c.verifiedPresent + s.summary.verifiedPresent,
  verifiedAbsent: c.verifiedAbsent + s.summary.verifiedAbsent,
  denominator: c.denominator + s.summary.totalPairs,
}), { verifiedPresent: 0, verifiedAbsent: 0, denominator: 0 });
assert.equal(counts.verifiedPresent, review.baseline.verifiedPresent);
assert.equal(counts.verifiedAbsent, review.baseline.verifiedAbsent + 101);
assert.equal(counts.denominator, review.baseline.denominator);
const eligible = [];
const held = [];
for (const row of review.audit) {
  const pair = projection<ResearchCountyFile>(row.projectionPath).pairs.find(p => p.speciesId === ALB_SPECIES_ID);
  const before = baseline<ResearchCountyFile>(row.projectionPath).pairs.find(p => p.speciesId === ALB_SPECIES_ID);
  assert(pair && before);
  if (review.scope.eligibleCountyFips.includes(row.countyFips)) {
    assert.equal(before.displayStatus, "researched-unresolved");
    assert.equal(pair.displayStatus, "verified-absent");
    assert.equal(pair.currentDeterminationStatus, "officially-eradicated");
    assert.equal(pair.historicalOccurrenceStatus, "none");
    assert.equal(pair.conflict, false);
    assert.equal(pair.evidence.filter(e => e.assertion === "officially-absent").length, 1);
    assert.equal(pair.evidence.filter(e => e.assertion === "recorded-present").length, 0);
    eligible.push(`${row.countyFips}:${ALB_SPECIES_ID}`);
  } else {
    assert.deepEqual(pair, before, `Held pair ${row.countyFips} changed.`);
    assert.equal(pair.displayStatus, "verified-present");
    assert(pair.evidence.some(e => e.assertion === "recorded-present" && !e.observedAt));
    held.push(`${row.countyFips}:${ALB_SPECIES_ID}`);
  }
}
assert.equal(eligible.length, 101);
assert.equal(held.length, 7);
const result = {
  schemaVersion: 1, evaluationId: "aphis-alb-eradication-implementation-20260905-r2", status: "verified-local-batch", asOf: "2026-09-05", projectionCommit,
  approval: { artifactPath: ALB_REVIEW_PATH, artifactSha256: sha256(readFileSync(path.join(root, ALB_REVIEW_PATH))), receiptPath: ALB_APPROVAL_RECEIPT_PATH, receiptSha256, actorId: receipt.actorId, userMessageVerbatim: receipt.userMessageVerbatim },
  immutableRuns: { codeCommit, runIds: dirs, assertionEvents: assertions.length, humanApprovedReviews: reviews.length, completedOutcomes: outcomes.length, rejections: 0, upstreamRequests: 0 },
  baseline: review.baseline,
  final: { ...counts, determinations: counts.verifiedPresent + counts.verifiedAbsent },
  net: { verifiedPresent: 0, verifiedAbsent: 101, determinations: 101 },
  exactNewDeterminationPairs: eligible,
  exactNewDeterminationPairsSha256: sha256(JSON.stringify(eligible)),
  heldPairsUnchanged: held,
  checks: { all51StatesAtSameAsOf: true, zeroConflicts: true, heldPairsDeepEqualBaseline: true, acceptedPresenceRemoved: 0, fullDenominatorConserved: true, partialCountyScopesAdded: 0 },
  publication: { localOnly: true, r2Uploads: 0, r2Promotions: 0, r2Deletions: 0 },
};
const contents = `${JSON.stringify(result, null, 2)}\n`;
if (mode === "--write") writeFileSync(path.join(root, outputPath), contents);
else assert.equal(readFileSync(path.join(root, outputPath), "utf8"), contents, "ALB implementation audit is not byte stable.");
console.log(JSON.stringify({ mode, outputPath, sha256: sha256(contents), final: result.final, net: result.net, heldUnchanged: 7 }));
