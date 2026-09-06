import { z } from "zod";
import planSchema from "@/data/research/schemas/question-plan.schema.json";
import proofSchema from "@/data/research/schemas/question-coverage-proof.schema.json";
import assessmentSchema from "@/data/research/schemas/question-assessment.schema.json";
import { sha256, stableJson } from "@/lib/research/run-files";

const parseSchema = (schema: unknown) => z.fromJSONSchema(schema as Parameters<typeof z.fromJSONSchema>[0]);
const planValidator = parseSchema(planSchema);
const proofValidator = parseSchema(proofSchema);
const assessmentValidator = parseSchema(assessmentSchema);

export const QUESTION_ASSESSMENT_METHOD_VERSION = "1.0.0" as const;

export type ResearchQuestionId =
  | "documented-historical-occurrence"
  | "wild-occurrence-in-period"
  | "established-population-in-period"
  | "official-status-as-of";

export type QuestionAnswer =
  | "documented-occurrence"
  | "wild-occurrence-recorded"
  | "established-population"
  | "officially-eradicated"
  | "officially-absent";

export type ResearchQuestionDefinition = {
  id: ResearchQuestionId;
  required: boolean;
  predicate: string;
  period: { start: string | null; end: string };
  supportMethods: string[];
};

export type PairQuestionPlan = {
  schemaVersion: 1;
  planId: string;
  version: string;
  countyFips: string;
  speciesId: string;
  asOf: string;
  inputScopeSha256: string;
  questions: ResearchQuestionDefinition[];
  requirements: Array<{
    id: string;
    questionId: ResearchQuestionId;
    sourceFamily: string;
    rationale: string;
    evaluatedCoverageMethods: string[];
  }>;
  stoppingRules: Array<{
    id: string;
    questionId: ResearchQuestionId;
    kind: "sufficient-evidence" | "completed-accessible-plan" | "reviewed-access-gaps";
    rationale: string;
    requiredRequirementIds: string[];
  }>;
  reopeningConditions: string[];
};

export type QuestionCoverageProof = {
  schemaVersion: 1;
  proofId: string;
  planSha256: string;
  pairKey: string;
  questionId: ResearchQuestionId;
  requirementId: string | null;
  kind: "support" | "reviewed-scope-no-answer" | "reviewed-inapplicable-scope" | "reviewed-access-gap" | "contradiction-review";
  methodId: string;
  answer: QuestionAnswer | null;
  sourceId: string | null;
  runIds: string[];
  assertionEventIds: string[];
  reviewEventIds: string[];
  outcomeIds: string[];
  artifacts: Array<{ path: string; sha256: string; bytes: number }>;
  evaluatedAt: string;
  explanation: string;
};

export type ResearchQuestionAssessment = {
  schemaVersion: 1;
  eventType: "research.question-assessed";
  assessmentId: string;
  planId: string;
  planSha256: string;
  pairKey: string;
  questionId: ResearchQuestionId;
  disposition: "supported" | "assessed-unresolved" | "assessed-with-gaps";
  answer: QuestionAnswer | null;
  stoppingRuleId: string;
  proofIds: string[];
  assessedAt: string;
  actor: { type: "agent" | "human"; id: string };
  supersedes: string | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function questionPlanSha256(plan: PairQuestionPlan) {
  return sha256(stableJson(plan));
}

export function validateQuestionPlan(plan: PairQuestionPlan) {
  planValidator.parse(plan);
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(value + "T00:00:00Z")) && new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value;
  assert(validDate(plan.asOf), "Question-plan as-of date is invalid.");
  for (const question of plan.questions) {
    assert(validDate(question.period.end) && question.period.end <= plan.asOf
      && (question.period.start === null || (validDate(question.period.start) && question.period.start <= question.period.end)), "Question period is invalid or outside its reporting date.");
  }
  assert(/^[0-9]{5}$/u.test(plan.countyFips) && /^[a-z0-9-]+$/u.test(plan.speciesId), "Invalid question-plan pair.");
  assert(/^[0-9a-f]{64}$/u.test(plan.inputScopeSha256), "Question-plan input scope must be pinned.");
  assert(plan.questions.length > 0 && new Set(plan.questions.map((q) => q.id)).size === plan.questions.length, "Question definitions are missing or duplicated.");
  assert(new Set(plan.requirements.map((r) => r.id)).size === plan.requirements.length, "Question requirements repeat.");
  assert(new Set(plan.stoppingRules.map((r) => r.id)).size === plan.stoppingRules.length, "Question stopping rules repeat.");
  assert(plan.reopeningConditions.every((value) => value.trim().length > 0), "Question plan lacks reopening conditions.");
  for (const rule of plan.stoppingRules) {
    assert(plan.questions.some((q) => q.id === rule.questionId), "Stopping rule references an unknown question.");
    assert(rule.rationale.trim().length > 0, "Stopping rule lacks a rationale.");
    const required = plan.requirements.filter((r) => r.questionId === rule.questionId).map((r) => r.id).sort();
    assert(new Set(rule.requiredRequirementIds).size === rule.requiredRequirementIds.length, "Stopping rule repeats a requirement.");
    if (rule.kind !== "sufficient-evidence") {
      assert(required.length > 0 && JSON.stringify([...rule.requiredRequirementIds].sort()) === JSON.stringify(required), "Finite completion requires the complete nonempty declared source plan.");
    } else {
      assert(rule.requiredRequirementIds.length === 0, "Sufficient evidence resolves its question without unfinished source obligations.");
    }
  }
  for (const requirement of plan.requirements) {
    assert(plan.questions.some((q) => q.id === requirement.questionId), "Requirement references an unknown question.");
    assert(requirement.rationale.trim().length > 0, "Question requirement lacks a rationale.");
  }
}

/** Proof creation belongs to evaluated source-specific artifact readers, never source-screen counters. */
export function validateQuestionAssessment(
  plan: PairQuestionPlan,
  assessment: ResearchQuestionAssessment,
  availableProofs: QuestionCoverageProof[],
) {
  validateQuestionPlan(plan);
  assessmentValidator.parse(assessment);
  const digest = questionPlanSha256(plan);
  const key = plan.countyFips + ":" + plan.speciesId;
  assert(assessment.planId === plan.planId && assessment.planSha256 === digest && assessment.pairKey === key, "Assessment plan or pair differs.");
  assert(Number.isFinite(Date.parse(assessment.assessedAt)) && assessment.assessedAt.slice(0, 10) >= plan.asOf, "Assessment reporting chronology differs.");
  const question = plan.questions.find((q) => q.id === assessment.questionId);
  assert(question, "Assessment question is outside its plan.");
  const rule = plan.stoppingRules.find((r) => r.id === assessment.stoppingRuleId && r.questionId === question.id);
  assert(rule, "Assessment stopping rule is outside its question.");
  assert(new Set(assessment.proofIds).size === assessment.proofIds.length && assessment.proofIds.length > 0, "Assessment proof set is empty or duplicated.");
  const proofById = new Map(availableProofs.map((proof) => [proof.proofId, proof]));
  assert(proofById.size === availableProofs.length, "Available proof identities repeat.");
  const proofs = assessment.proofIds.map((id) => {
    const proof = proofById.get(id);
    if (proof) proofValidator.parse(proof);
    assert(proof && proof.planSha256 === digest && proof.pairKey === key && proof.questionId === question.id, "Assessment proof is missing or has incompatible scope.");
    assert(proof.explanation.trim().length > 0 && proof.artifacts.length > 0, "Assessment proof lacks retained evidence or explanation.");
    assert(proof.artifacts.every((a) => /^[0-9a-f]{64}$/u.test(a.sha256) && Number.isSafeInteger(a.bytes) && a.bytes > 0 && !/^(?:[A-Za-z]:|[\\\\/])/u.test(a.path) && !a.path.split(/[\\\\/]/u).includes("..")), "Assessment proof artifact identity is invalid.");
    assert(Number.isFinite(Date.parse(proof.evaluatedAt)) && Date.parse(proof.evaluatedAt) <= Date.parse(assessment.assessedAt), "Assessment precedes proof evaluation.");
    if (proof.kind === "support") {
      assert(proof.requirementId === null && question.supportMethods.includes(proof.methodId), "Support proof uses an unevaluated method or a coverage obligation.");
      assert(proof.answer === assessment.answer && assessment.disposition === "supported", "Support proofs contradict the assessment disposition or answer.");
    } else {
      const requirement = plan.requirements.find((r) => r.questionId === question.id && r.id === proof.requirementId);
      assert(requirement && requirement.evaluatedCoverageMethods.includes(proof.methodId), "Coverage proof has an unevaluated method or unknown question requirement.");
      assert(proof.answer === null, "Coverage and contradiction review are not biological answers.");
    }
    return proof;
  });
  if (assessment.disposition === "supported") {
    assert(rule.kind === "sufficient-evidence" && assessment.answer !== null, "Supported assessment has an incompatible stopping rule.");
    const supporting = proofs.filter((p) => p.kind === "support" && p.answer === assessment.answer);
    assert(supporting.length > 0 && supporting.every((p) => question.supportMethods.includes(p.methodId)
      && p.sourceId && p.assertionEventIds.length > 0 && p.reviewEventIds.length > 0), "Supported assessment lacks an evaluated, reviewed witness.");
    const compatible: Record<ResearchQuestionId, QuestionAnswer[]> = {
      "documented-historical-occurrence": ["documented-occurrence"],
      "wild-occurrence-in-period": ["wild-occurrence-recorded"],
      "established-population-in-period": ["established-population"],
      "official-status-as-of": ["officially-eradicated", "officially-absent"],
    };
    assert(compatible[question.id].includes(assessment.answer), "Answer does not resolve the declared biological question.");
  } else {
    assert(assessment.answer === null, "An unresolved or gap assessment cannot invent a biological answer.");
    assert(rule.kind === (assessment.disposition === "assessed-unresolved" ? "completed-accessible-plan" : "reviewed-access-gaps"), "Completion disposition differs from its stopping rule.");
    assert(rule.requiredRequirementIds.length > 0 && new Set(rule.requiredRequirementIds).size === rule.requiredRequirementIds.length, "Finite completion requires explicit nonempty source obligations.");
    for (const requirementId of rule.requiredRequirementIds) {
      const requirement = plan.requirements.find((r) => r.id === requirementId && r.questionId === question.id);
      assert(requirement, "Stopping rule references an unknown question requirement.");
      const coverage = proofs.filter((p) => p.requirementId === requirementId);
      assert(coverage.some((p) => requirement.evaluatedCoverageMethods.includes(p.methodId)
        && (["reviewed-scope-no-answer", "reviewed-inapplicable-scope", "contradiction-review"].includes(p.kind)
          || (assessment.disposition === "assessed-with-gaps" && p.kind === "reviewed-access-gap"))), "Required question-specific scope is unfinished.");
    }
    assert(proofs.some((p) => p.kind === "contradiction-review"
      && plan.requirements.some((r) => r.questionId === question.id && r.id === p.requirementId && r.evaluatedCoverageMethods.includes(p.methodId))), "Finite completion lacks targeted contradiction review.");
    if (assessment.disposition === "assessed-with-gaps") assert(proofs.some((p) => p.kind === "reviewed-access-gap"), "Gap completion lacks an explicit reviewed gap.");
    else assert(!proofs.some((p) => p.kind === "reviewed-access-gap"), "Unresolved completion cannot hide an access gap.");
  }
  return assessment;
}

export function resolveCurrentQuestionAssessments(
  plan: PairQuestionPlan,
  assessments: ResearchQuestionAssessment[],
  proofs: QuestionCoverageProof[],
) {
  validateQuestionPlan(plan);
  assert(new Set(assessments.map((a) => a.assessmentId)).size === assessments.length, "Assessment event identities repeat.");
  for (const assessment of assessments) {
    if (assessment.supersedes !== null) {
      const previous = assessments.find((a) => a.assessmentId === assessment.supersedes);
      assert(previous && previous.pairKey === assessment.pairKey && previous.questionId === assessment.questionId && previous.assessedAt <= assessment.assessedAt && previous.assessmentId !== assessment.assessmentId, "Supersession must reference an earlier assessment of the same pair and question.");
    }
  }
  const current = assessments.filter((a) => a.planSha256 === questionPlanSha256(plan));
  for (const assessment of current) validateQuestionAssessment(plan, assessment, proofs);
  const byQuestion = new Map<ResearchQuestionId, ResearchQuestionAssessment>();
  for (const assessment of [...current].sort((a, b) => a.assessedAt.localeCompare(b.assessedAt) || a.assessmentId.localeCompare(b.assessmentId))) {
    const previous = byQuestion.get(assessment.questionId);
    assert(!previous || assessment.supersedes === previous.assessmentId, "A replacement question assessment must explicitly supersede its predecessor.");
    byQuestion.set(assessment.questionId, assessment);
  }
  return [...byQuestion.values()];
}

export function summarizeQuestionAssessmentDecisions(plan: PairQuestionPlan, decisions: ResearchQuestionAssessment[]) {
  const byQuestion = new Map(decisions.map((a) => [a.questionId, a]));
  assert(byQuestion.size === decisions.length, "Current question decisions repeat.");
  const required = plan.questions.filter((q) => q.required);
  const completed = required.flatMap((q) => byQuestion.has(q.id) ? [byQuestion.get(q.id)!] : []);
  return {
    requiredQuestions: required.length,
    assessedQuestions: completed.length,
    supportedQuestions: completed.filter((a) => a.disposition === "supported").length,
    unresolvedQuestions: completed.filter((a) => a.disposition === "assessed-unresolved").length,
    questionsCompletedWithGaps: completed.filter((a) => a.disposition === "assessed-with-gaps").length,
    researchComplete: required.length > 0 && completed.length === required.length,
    allRequiredAnswersSupported: required.length > 0 && completed.length === required.length && completed.every((a) => a.disposition === "supported"),
    outstandingQuestionIds: required.filter((q) => !byQuestion.has(q.id)).map((q) => q.id),
  };
}

export function summarizePairQuestionAssessments(plan: PairQuestionPlan, assessments: ResearchQuestionAssessment[], proofs: QuestionCoverageProof[]) {
  return summarizeQuestionAssessmentDecisions(plan, resolveCurrentQuestionAssessments(plan, assessments, proofs));
}
