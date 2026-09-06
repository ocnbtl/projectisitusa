import assert from "node:assert/strict";
import {
  QUESTION_POLICY, readQuestionAssessmentBatches, buildQuestionAssessmentProjection,
  makePairQuestionPlan, makeSupportedQuestionAssessment,
} from "../src/lib/research/question-assessment-ledger";
import { resolveCurrentQuestionAssessments } from "../src/lib/research/question-assessments";
import { loadQuestionEvidenceContext } from "./research/question-assessment-context";
import { planSupportedQuestionAssessments } from "./research/question-assessment-planner";

const context = loadQuestionEvidenceContext(process.cwd(), "DC", QUESTION_POLICY.asOf);
const batches = readQuestionAssessmentBatches(context.root, context.stateCode, context.asOf);
const timestamp = new Date().toISOString();
const unchanged = planSupportedQuestionAssessments(context, timestamp, batches);
const currentProjection = buildQuestionAssessmentProjection(context, batches)!;
const validAnswerKeys = new Set([...currentProjection.pairs].flatMap(([pairKey, pair]) => pair.answers.map((answer) => pairKey + ":" + answer.questionId)));
assert(unchanged.assessments.every((assessment) => !validAnswerKeys.has(assessment.pairKey + ":" + assessment.questionId)));
assert.equal(unchanged.skippedSupportedAnswers, currentProjection.summary.supportedQuestionCount);
assert.equal(unchanged.baseline.assessmentEvents, batches.reduce((count, batch) => count + batch.assessments.length, 0));
assert.throws(() => planSupportedQuestionAssessments(context, "2026-09-06T08:00:00.000Z", batches), /predates retained/u);

// Use existing retained Aedes evidence for delta and replacement cases, never synthetic field observations.
const species = context.catalogSpecies.find((entry) => entry.id === "aedes-albopictus")!;
const scoped = { ...context, catalogSpecies: [species] };
const pairKey = "11001:aedes-albopictus";
const scopedBatches = batches.map((batch) => ({ ...batch,
  plans: batch.plans.filter((plan) => plan.speciesId === species.id),
  proofs: batch.proofs.filter((proof) => proof.pairKey === pairKey),
  assessments: batch.assessments.filter((assessment) => assessment.pairKey === pairKey),
})).filter((batch) => batch.assessments.length > 0);
assert.equal(planSupportedQuestionAssessments(scoped, timestamp, scopedBatches).assessments.length, 0);
const first = planSupportedQuestionAssessments(scoped, timestamp, []);
assert.equal(first.firstAssessmentEvents, 2);
assert.equal(first.replacementEvents, 0);
assert(first.assessments.every((assessment) => assessment.supersedes === null));
const historicalOnly = scopedBatches.map((batch) => ({ ...batch,
  proofs: batch.proofs.filter((proof) => proof.questionId === "documented-historical-occurrence"),
  assessments: batch.assessments.filter((assessment) => assessment.questionId === "documented-historical-occurrence"),
}));
const partial = planSupportedQuestionAssessments(scoped, timestamp, historicalOnly);
assert.equal(partial.assessments.length, 1);
assert.equal(partial.assessments[0].questionId, "wild-occurrence-in-period");
assert.equal(partial.skippedSupportedAnswers, 1);
assert.equal(partial.assessments[0].supersedes, null);

const noWitness = { ...scoped, activeAssertions: scoped.activeAssertions.filter((entry) => entry.species_id !== species.id) };
const reopened = planSupportedQuestionAssessments(noWitness, timestamp, scopedBatches);
assert.equal(reopened.assessments.length, 0);
assert.equal(reopened.baseline.validSupportedAnswers, 0);
assert.equal(reopened.reopenedQuestionsRemaining, 2);

const maple = context.catalogSpecies.find((entry) => entry.id === "acer-platanoides")!;
const mapleContext = { ...context, catalogSpecies: [maple] };
const mapleBatches = batches.map((batch) => ({ ...batch,
  plans: batch.plans.filter((plan) => plan.speciesId === maple.id),
  proofs: batch.proofs.filter((proof) => proof.pairKey === "11001:" + maple.id),
  assessments: batch.assessments.filter((assessment) => assessment.pairKey === "11001:" + maple.id),
})).filter((batch) => batch.assessments.length > 0);
const mapleHistorical = mapleBatches.flatMap((batch) => batch.assessments).find((assessment) => assessment.questionId === "documented-historical-occurrence")!;
const mapleProof = mapleBatches.flatMap((batch) => batch.proofs).find((proof) => mapleHistorical.proofIds.includes(proof.proofId))!;
const alternateContext = { ...mapleContext, activeAssertions: mapleContext.activeAssertions.filter((entry) => !mapleProof.assertionEventIds.includes(entry.eventId)) };
const alternate = planSupportedQuestionAssessments(alternateContext, timestamp, mapleBatches);
assert.equal(alternate.assessments.length, 1, "Retained alternate maple occurrence should repair the invalidated historical witness.");
assert.equal(alternate.assessments[0].supersedes, mapleHistorical.assessmentId);
assert.equal(alternate.skippedSupportedAnswers, 0);
assert.equal(alternate.reopenedQuestionsRemaining, 0);
const priorHistorical = scopedBatches.flatMap((batch) => batch.assessments).find((assessment) => assessment.questionId === "documented-historical-occurrence")!;
const priorProof = scopedBatches.flatMap((batch) => batch.proofs).find((proof) => priorHistorical.proofIds.includes(proof.proofId))!;

const changed = { ...scoped, counties: scoped.counties.map((county) => ({ ...county, geographyScopeSha256: "b".repeat(64) })) };
const revised = planSupportedQuestionAssessments(changed, timestamp, scopedBatches);
assert.equal(revised.assessments.length, 2);
assert.equal(revised.firstAssessmentEvents, 0);
assert.equal(revised.replacementEvents, 2);
const previous = scopedBatches.flatMap((batch) => batch.assessments);
assert(revised.assessments.every((assessment) => previous.some((prior) => prior.assessmentId === assessment.supersedes && prior.questionId === assessment.questionId)));
const augmented = [...scopedBatches, { ...scopedBatches[0], receipt: { ...scopedBatches[0].receipt, batchId: "synthetic-resume-regression" },
  plans: revised.plans, proofs: revised.proofs, assessments: revised.assessments }];
assert.equal(planSupportedQuestionAssessments(changed, timestamp, augmented).assessments.length, 0);
assert.equal(buildQuestionAssessmentProjection(scoped, augmented)!.summary.supportedQuestionCount, 0, "Returning to an older plan must not revive superseded answers.");
const oldPlan = makePairQuestionPlan(species, scoped.counties[0]);
assert.equal(resolveCurrentQuestionAssessments(oldPlan, [...previous, ...revised.assessments], [...scopedBatches.flatMap((batch) => batch.proofs), ...revised.proofs]).length, 0);
const sameInstant = { ...priorProof, evaluatedAt: priorHistorical.assessedAt };
assert.throws(() => makeSupportedQuestionAssessment(oldPlan, sameInstant, priorHistorical), /must follow an earlier/u);
console.log("Question planner: unchanged resume, partial progress, evidence loss, alternate witness, changed geography, cross-plan supersession, time regression and no revival passed.");
