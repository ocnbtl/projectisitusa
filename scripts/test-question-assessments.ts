
import assert from "node:assert/strict";
import {
  questionPlanSha256, validateQuestionAssessment, summarizePairQuestionAssessments,
  type PairQuestionPlan, type QuestionCoverageProof, type ResearchQuestionAssessment,
} from "../src/lib/research/question-assessments";

const plan: PairQuestionPlan = {
  schemaVersion: 1, planId: "dc-test-plan", version: "1", countyFips: "11001", speciesId: "test-species",
  asOf: "2026-09-06", inputScopeSha256: "a".repeat(64),
  questions: [
    { id: "documented-historical-occurrence", required: true, predicate: "A documented historical occurrence exists.",
      period: { start: null, end: "2026-09-06" }, supportMethods: ["retained-historical-witness-v1"] },
    { id: "wild-occurrence-in-period", required: true, predicate: "An explicitly wild occurrence was recorded during the stated period.",
      period: { start: "2026-01-01", end: "2026-09-06" }, supportMethods: ["retained-wild-witness-v1"] },
  ],
  requirements: [
    { id: "museum", questionId: "documented-historical-occurrence", sourceFamily: "preserved-specimens", rationale: "Licensed specimen evidence is relevant to historical occurrence.", evaluatedCoverageMethods: ["full-question-artifact-review-v1"] },
    { id: "observations", questionId: "documented-historical-occurrence", sourceFamily: "human-observations", rationale: "Licensed observations are relevant to historical occurrence.", evaluatedCoverageMethods: ["full-question-artifact-review-v1", "reviewed-access-gap-v1"] },
    { id: "contradictions", questionId: "documented-historical-occurrence", sourceFamily: "targeted-contradiction-review", rationale: "Check relevant existing evidence and exclusions.", evaluatedCoverageMethods: ["retained-contradiction-review-v1"] },
  ],
  stoppingRules: [
    { id: "historical-supported", questionId: "documented-historical-occurrence", kind: "sufficient-evidence", rationale: "The synthetic test declares this exact stopping branch.", requiredRequirementIds: [] },
    { id: "historical-unresolved", questionId: "documented-historical-occurrence", kind: "completed-accessible-plan", rationale: "The synthetic test declares this exact stopping branch.", requiredRequirementIds: ["museum", "observations", "contradictions"] },
    { id: "historical-gap", questionId: "documented-historical-occurrence", kind: "reviewed-access-gaps", rationale: "The synthetic test declares this exact stopping branch.", requiredRequirementIds: ["museum", "observations", "contradictions"] },
    { id: "wild-supported", questionId: "wild-occurrence-in-period", kind: "sufficient-evidence", rationale: "The synthetic test declares this exact stopping branch.", requiredRequirementIds: [] },
  ], reopeningConditions: ["New source evidence", "Changed question period", "Taxonomy or geography correction", "Material method revision"],
};
const digest = questionPlanSha256(plan);
function proof(id: string, overrides: Partial<QuestionCoverageProof> = {}): QuestionCoverageProof {
  return { schemaVersion: 1, proofId: id, planSha256: digest, pairKey: "11001:test-species",
    questionId: "documented-historical-occurrence", requirementId: null, kind: "support", methodId: "retained-historical-witness-v1",
    answer: "documented-occurrence", sourceId: "test-source", runIds: ["immutable-test-run"], assertionEventIds: ["assertion"], reviewEventIds: ["review"],
    outcomeIds: [], artifacts: [{ path: "fixture/raw-record.json", sha256: "b".repeat(64), bytes: 100 }],
    evaluatedAt: "2026-09-06T00:00:00Z", explanation: "Synthetic test fixture; no source claims or live assessments.", ...overrides };
}
function assessment(overrides: Partial<ResearchQuestionAssessment> = {}): ResearchQuestionAssessment {
  return { schemaVersion: 1, eventType: "research.question-assessed", assessmentId: "assessment-1",
    planId: plan.planId, planSha256: digest, pairKey: "11001:test-species", questionId: "documented-historical-occurrence",
    disposition: "supported", answer: "documented-occurrence", stoppingRuleId: "historical-supported",
    proofIds: ["support"], assessedAt: "2026-09-06T01:00:00Z", actor: { type: "agent", id: "synthetic-test" }, supersedes: null, ...overrides };
}
const support = proof("support");
validateQuestionAssessment(plan, assessment(), [support]);
assert.deepEqual(summarizePairQuestionAssessments(plan, [assessment()], [support]), {
  requiredQuestions: 2, assessedQuestions: 1, supportedQuestions: 1, unresolvedQuestions: 0, questionsCompletedWithGaps: 0,
  researchComplete: false, allRequiredAnswersSupported: false, outstandingQuestionIds: ["wild-occurrence-in-period"],
});
const scoped = (id: string, requirementId: string, kind: QuestionCoverageProof["kind"] = "reviewed-scope-no-answer") =>
  proof(id, { requirementId, kind, answer: null, methodId: kind === "contradiction-review" ? "retained-contradiction-review-v1" : "full-question-artifact-review-v1",
    assertionEventIds: [], reviewEventIds: [], outcomeIds: ["reviewed-outcome-" + id] });
const coverage = [scoped("museum-proof", "museum"), scoped("observation-proof", "observations"), scoped("contradiction-proof", "contradictions", "contradiction-review")];
const unresolved = assessment({ disposition: "assessed-unresolved", answer: null, stoppingRuleId: "historical-unresolved", proofIds: coverage.map(p => p.proofId) });
validateQuestionAssessment(plan, unresolved, coverage);
assert.equal(summarizePairQuestionAssessments(plan, [unresolved], coverage).researchComplete, false);
assert.throws(() => validateQuestionAssessment(plan, { ...unresolved, proofIds: ["museum-proof"] }, coverage), /unfinished/u);
assert.throws(() => validateQuestionAssessment(plan, { ...unresolved, answer: "officially-absent" }, coverage), /cannot invent/u);
assert.throws(() => validateQuestionAssessment(plan, { ...unresolved, proofIds: [] }, coverage), /empty|Too small/u);
const genericScreen = scoped("observation-proof", "observations");
genericScreen.methodId = "source-screen-scope-complete-boolean";
assert.throws(() => validateQuestionAssessment(plan, unresolved, [coverage[0], genericScreen, coverage[2]]), /unevaluated/u);
const gap = proof("gap-proof", { requirementId: "observations", kind: "reviewed-access-gap", answer: null, methodId: "reviewed-access-gap-v1",
  assertionEventIds: [], reviewEventIds: [], outcomeIds: [], explanation: "The particular access gap was reviewed under this test's declared finite branch." });
const withGap = assessment({ disposition: "assessed-with-gaps", answer: null, stoppingRuleId: "historical-gap", proofIds: ["museum-proof", "gap-proof", "contradiction-proof"] });
validateQuestionAssessment(plan, withGap, [coverage[0], gap, coverage[2]]);
assert.throws(() => validateQuestionAssessment(plan, { ...withGap, disposition: "assessed-unresolved", stoppingRuleId: "historical-unresolved" }, [coverage[0], gap, coverage[2]]), /unfinished/u);
assert.throws(() => validateQuestionAssessment(plan, assessment({ answer: "wild-occurrence-recorded" }), [proof("support", { answer: "wild-occurrence-recorded" })]), /declared biological question/u);
const wildProof = proof("wild-proof", { questionId: "wild-occurrence-in-period", methodId: "retained-wild-witness-v1", answer: "wild-occurrence-recorded" });
const wild = assessment({ assessmentId: "wild-assessment", questionId: "wild-occurrence-in-period", answer: "wild-occurrence-recorded", stoppingRuleId: "wild-supported", proofIds: ["wild-proof"] });
assert.equal(summarizePairQuestionAssessments(plan, [unresolved, wild], [...coverage, wildProof]).researchComplete, true);
assert.equal(summarizePairQuestionAssessments(plan, [unresolved, wild], [...coverage, wildProof]).allRequiredAnswersSupported, false);
assert.throws(() => validateQuestionAssessment(plan, wild, [proof("wild-proof")]), /incompatible scope/u);
assert.throws(() => validateQuestionAssessment(plan, assessment(), [proof("support", { reviewEventIds: [] })]), /reviewed witness/u);
assert.throws(() => validateQuestionAssessment(plan, assessment(), [proof("support", { artifacts: [] })]), /retained evidence|Too small/u);
assert.throws(() => validateQuestionAssessment(plan, assessment(), [proof("support", { evaluatedAt: "2026-09-07T00:00:00Z" })]), /precedes/u);
assert.throws(() => summarizePairQuestionAssessments(plan, [assessment(), assessment({ assessmentId: "replacement" })], [support]), /supersede/u);
assert.equal(summarizePairQuestionAssessments(plan, [assessment(), assessment({ assessmentId: "replacement", supersedes: "assessment-1", assessedAt: "2026-09-06T02:00:00Z" })], [support]).assessedQuestions, 1);
assert.throws(() => summarizePairQuestionAssessments(plan, [assessment({ supersedes: "missing-event" })], [support]), /Supersession/u);
assert.throws(() => validateQuestionAssessment(plan, assessment(), [proof("support", { artifacts: [{ path: "../outside.json", sha256: "b".repeat(64), bytes: 100 }] })]), /artifact identity/u);
const incompleteBranch = structuredClone(plan);
incompleteBranch.stoppingRules.find(r => r.id === "historical-unresolved")!.requiredRequirementIds = ["museum"];
assert.throws(() => validateQuestionAssessment(incompleteBranch, unresolved, coverage), /complete nonempty/u);
const reopened = structuredClone(plan);
reopened.version = "2";
reopened.inputScopeSha256 = "c".repeat(64);
assert.equal(summarizePairQuestionAssessments(reopened, [assessment()], [support]).assessedQuestions, 0);
assert.deepEqual(summarizePairQuestionAssessments(reopened, [assessment()], [support]).outstandingQuestionIds, plan.questions.map(q => q.id));
const emptyRule = structuredClone(plan);
emptyRule.stoppingRules.find(r => r.id === "historical-unresolved")!.requiredRequirementIds = [];
assert.throws(() => validateQuestionAssessment(emptyRule, { ...unresolved, planSha256: questionPlanSha256(emptyRule) },
  coverage.map(p => ({ ...p, planSha256: questionPlanSha256(emptyRule) }))), /nonempty/u);
console.log("Question assessments: evidence-specific answers, finite completion, explicit gaps, source-screen rejection, supersession and reopening passed.");
