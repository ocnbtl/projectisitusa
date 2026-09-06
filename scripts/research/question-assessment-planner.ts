import { assertRunStartNotFuture } from "../../src/lib/research/run-files";
import {
  buildQuestionAssessmentProjection, deriveSupportedQuestionProofs, makePairQuestionPlan,
  makeSupportedQuestionAssessment, readQuestionAssessmentBatches, type QuestionEvidenceContext,
} from "../../src/lib/research/question-assessment-ledger";
import type { PairQuestionPlan, QuestionCoverageProof, ResearchQuestionAssessment } from "../../src/lib/research/question-assessments";

/** Reconcile retained answers before generating new immutable events. No evidence or files are mutated. */
export function planSupportedQuestionAssessments(context: QuestionEvidenceContext, evaluatedAt: string,
  batches = readQuestionAssessmentBatches(context.root, context.stateCode, context.asOf)) {
  assertRunStartNotFuture(evaluatedAt);
  if (evaluatedAt.slice(0, 10) < context.asOf) throw new Error("Question evaluation predates its reporting date.");
  const history = batches.flatMap((batch) => batch.assessments);
  if (history.some((assessment) => Date.parse(assessment.assessedAt) > Date.parse(evaluatedAt))) {
    throw new Error("Question evaluation predates retained assessment history.");
  }
  const projection = buildQuestionAssessmentProjection(context, batches);
  if (!projection) throw new Error("No evaluated question policy applies to this scope.");
  const latest = new Map<string, ResearchQuestionAssessment>();
  for (const assessment of [...history].sort((a, b) => Date.parse(a.assessedAt) - Date.parse(b.assessedAt))) {
    latest.set(assessment.pairKey + ":" + assessment.questionId, assessment);
  }
  const plans: PairQuestionPlan[] = [], proofs: QuestionCoverageProof[] = [], assessments: ResearchQuestionAssessment[] = [];
  let skippedSupportedAnswers = 0;
  for (const county of context.counties) {
    for (const species of [...context.catalogSpecies].sort((a, b) => a.id.localeCompare(b.id))) {
      const plan = makePairQuestionPlan(species, county);
      const pairKey = county.countyFips + ":" + species.id;
      const answered = new Set((projection.pairs.get(pairKey)?.answers ?? []).map((answer) => answer.questionId));
      skippedSupportedAnswers += answered.size;
      if (plan.questions.filter((question) => question.supportMethods.length > 0).every((question) => answered.has(question.id))) continue;
      const found = deriveSupportedQuestionProofs(context, plan, evaluatedAt).filter((proof) => !answered.has(proof.questionId));
      if (!found.length) continue;
      plans.push(plan);
      for (const proof of found) {
        proofs.push(proof);
        assessments.push(makeSupportedQuestionAssessment(plan, proof, latest.get(pairKey + ":" + proof.questionId) ?? null));
      }
    }
  }
  const replacements = assessments.filter((assessment) => assessment.supersedes !== null).length;
  return {
    plans, proofs, assessments,
    baseline: {
      batchIds: batches.map((batch) => batch.receipt.batchId), assessmentEvents: history.length,
      validSupportedAnswers: projection.summary.supportedQuestionCount,
      reopenedQuestions: projection.summary.reopenedQuestionCount,
      requiredQuestionCount: projection.summary.requiredQuestionCount,
    },
    skippedSupportedAnswers, firstAssessmentEvents: assessments.length - replacements, replacementEvents: replacements,
    reopenedQuestionsRemaining: projection.summary.reopenedQuestionCount - replacements,
  };
}
