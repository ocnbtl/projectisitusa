import type { PairQuestionAssessmentProjection, QuestionAssessmentCoverage } from "./question-assessment-ledger";

export function describeResearchQuestions(
  coverage: QuestionAssessmentCoverage,
  assessment: PairQuestionAssessmentProjection | undefined,
) {
  const labels = {
    "documented-historical-occurrence": "Documented occurrence",
    "wild-occurrence-in-period": "Wild occurrence during the period",
    "established-population-in-period": "Established population during the period",
    "official-status-as-of": "Official absence or eradication",
  };
  const answerLabels = {
    "documented-occurrence": "Occurrence documented",
    "wild-occurrence-recorded": "Wild occurrence recorded",
    "established-population": "Established population supported",
    "officially-eradicated": "Officially eradicated",
    "officially-absent": "Officially absent",
  };
  return coverage.definitions.map((definition) => {
    const result = assessment?.answers.find((answer) => answer.questionId === definition.id);
    const reopened = assessment?.reopenedQuestionIds.includes(definition.id) ?? false;
    const periodLabel = definition.period.start === null ? "Through " + definition.period.end
      : definition.period.start === definition.period.end ? "As of " + definition.period.end
      : definition.period.start + " to " + definition.period.end;
    const statusLabel = result?.disposition === "supported" && result.answer ? answerLabels[result.answer]
      : result?.disposition === "assessed-unresolved" ? "Assessed; unresolved"
      : result?.disposition === "assessed-with-gaps" ? "Assessed with access gaps"
      : reopened ? "Needs review" : "Not assessed";
    return { id: definition.id, label: labels[definition.id], predicate: definition.predicate, periodLabel, statusLabel,
      explanation: result?.explanation ?? (reopened ? "The previous assessment needs review after an evidence or plan change." : "No assessment has been recorded for this question."),
      citations: result?.citations ?? [],
    };
  });
}
