import assert from "node:assert/strict";
import { describeResearchQuestions } from "../src/lib/research/question-assessment-presentation";
import { QUESTION_POLICY, type QuestionAssessmentCoverage, type PairQuestionAssessmentProjection } from "../src/lib/research/question-assessment-ledger";

const coverage: QuestionAssessmentCoverage = {
  schemaVersion: 1, policyId: QUESTION_POLICY.id, assessmentAsOf: QUESTION_POLICY.asOf,
  definitions: QUESTION_POLICY.questions as QuestionAssessmentCoverage["definitions"],
  pairDenominator: 2504, requiredQuestionCount: 10016, assessedQuestionCount: 0, supportedQuestionCount: 0,
  unresolvedQuestionCount: 0, questionCountCompletedWithGaps: 0, reopenedQuestionCount: 0, fullyAssessedPairCount: 0,
};
const unanswered = describeResearchQuestions(coverage, undefined);
assert.equal(unanswered.length, 4);
assert(unanswered.every((q) => q.statusLabel === "Not assessed" && q.citations.length === 0));
assert.equal(unanswered.find((q) => q.id === "wild-occurrence-in-period")?.periodLabel, "2026-01-01 to 2026-09-06");
const partial: PairQuestionAssessmentProjection = {
  policyId: QUESTION_POLICY.id, assessmentAsOf: QUESTION_POLICY.asOf, requiredQuestions: 4, assessedQuestions: 1,
  researchComplete: false, reopenedQuestionIds: ["official-status-as-of"],
  answers: [{ questionId: "documented-historical-occurrence", disposition: "supported", answer: "documented-occurrence",
    assessmentId: "test-event", assessedAt: "2026-09-06T08:00:00.000Z", explanation: "Historical record; date unknown.", citations: [] }],
};
const shown = describeResearchQuestions(coverage, partial);
assert.equal(shown[0].statusLabel, "Occurrence documented");
assert.equal(shown[1].statusLabel, "Not assessed");
assert.equal(shown[3].statusLabel, "Needs review");
const unresolved = structuredClone(partial);
unresolved.answers[0].answer = null;
unresolved.answers[0].disposition = "assessed-unresolved";
assert.equal(describeResearchQuestions(coverage, unresolved)[0].statusLabel, "Assessed; unresolved");
unresolved.answers[0].disposition = "assessed-with-gaps";
assert.equal(describeResearchQuestions(coverage, unresolved)[0].statusLabel, "Assessed with access gaps");
console.log("Question presentation: dated periods, unanswered questions, reopening and non-biological unresolved/gap labels passed.");
