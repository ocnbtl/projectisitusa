import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { QUESTION_POLICY, buildQuestionAssessmentProjection, readQuestionAssessmentBatches } from "../src/lib/research/question-assessment-ledger";
import { loadQuestionEvidenceContext } from "./research/question-assessment-context";
import { stableJson } from "../src/lib/research/run-files";
import type { ResearchCountyFile, ResearchStateSummary } from "../src/lib/research/types";

const root = process.cwd();
for (const stateCode of QUESTION_POLICY.stateCodes) {
  const batches = readQuestionAssessmentBatches(root, stateCode, QUESTION_POLICY.asOf);
  if (!batches.length) { console.log(stateCode + ": no integrated question assessments; method checks only."); continue; }
  const context = loadQuestionEvidenceContext(root, stateCode, QUESTION_POLICY.asOf);
  const expected = buildQuestionAssessmentProjection(context)!;
  assert.equal(expected.summary.requiredQuestionCount, context.counties.length * context.catalogSpecies.length * QUESTION_POLICY.questions.filter((q) => q.required).length);
  const filename = path.join(root, "public/generated/research", stateCode, "summary.json");
  assert(existsSync(filename), "Question state projection is missing.");
  const summary = JSON.parse(readFileSync(filename, "utf8")) as ResearchStateSummary;
  assert.equal(stableJson(summary.questionAssessment), stableJson(expected.summary), "Question state coverage differs from the admitted ledger.");
  let materializedAnswers = 0;
  for (const county of context.counties) {
    const data = JSON.parse(readFileSync(path.join(root, "public/generated/research", stateCode, "counties", county.countyFips + ".json"), "utf8")) as ResearchCountyFile;
    assert.equal(stableJson(data.questionAssessment), stableJson(expected.counties.get(county.countyFips)), "Question county coverage differs from the admitted ledger.");
    for (const pair of data.pairs) {
      const assessment = expected.pairs.get(county.countyFips + ":" + pair.speciesId);
      assert.equal(stableJson(pair.questionAssessment ?? null), stableJson(assessment ?? null), "Question pair answers differ from the admitted ledger.");
      materializedAnswers += pair.questionAssessment?.assessedQuestions ?? 0;
    }
  }
  assert.equal(materializedAnswers, expected.summary.assessedQuestionCount, "Public sparse pairs omit admitted question answers.");
  console.log(JSON.stringify({ stateCode, assessmentAsOf: QUESTION_POLICY.asOf, batches: batches.length,
    questionDenominator: expected.summary.requiredQuestionCount, assessed: expected.summary.assessedQuestionCount,
    supported: expected.summary.supportedQuestionCount, unresolved: expected.summary.unresolvedQuestionCount,
    withGaps: expected.summary.questionCountCompletedWithGaps, reopened: expected.summary.reopenedQuestionCount,
    fullyAssessedPairs: expected.summary.fullyAssessedPairCount }));
}
