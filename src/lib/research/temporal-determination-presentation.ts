import type { ResearchPairRecord } from "./types";

type TemporalPair = Pick<ResearchPairRecord,
  "historicalOccurrenceStatus" | "currentDeterminationStatus" | "conflict"
>;

export function describeTemporalDetermination(pair: TemporalPair) {
  const current = pair.currentDeterminationStatus;
  if (!current && !pair.historicalOccurrenceStatus) return null;
  const history = pair.historicalOccurrenceStatus === "recorded-present";
  if (pair.conflict) {
    return {
      currentLabel: "Conflicting evidence",
      historyLabel: history ? "Previously recorded" : "No historical occurrence recorded",
      explanation: "The evidence cannot support a settled current determination. Review the source records below.",
      showInResults: true,
    };
  }
  if (current === "officially-eradicated" || current === "officially-absent") {
    return {
      currentLabel: current === "officially-eradicated" ? "Officially eradicated" : "Officially absent",
      historyLabel: history ? "Previously recorded" : "No historical occurrence recorded",
      explanation: history
        ? "An earlier occurrence is retained alongside the later agency determination. The presence count includes this historical record; it does not establish current presence."
        : "This is an explicit agency determination for the published research date and geographic scope. It is not inferred from missing records.",
      showInResults: true,
    };
  }
  return {
    currentLabel: current === "present" ? "Present" : "No current agency determination",
    historyLabel: history ? "Previously recorded" : "No historical occurrence recorded",
    explanation: "An occurrence record and a current agency determination answer different questions. Missing or expired current evidence does not establish absence.",
    showInResults: false,
  };
}
