import type { ResearchPairRecord } from "./types";

type TemporalPair = Pick<ResearchPairRecord,
  "historicalOccurrenceStatus" | "currentDeterminationStatus" | "currentDeterminationBasis" | "conflict"
>;

export interface TemporalDeterminationDescription {
  currentLabel: string;
  historyLabel: string;
  explanation: string;
  showInResults: boolean;
  attribution?: string;
  pairStatusLabel?: string;
}

export function describeTemporalDetermination(pair: TemporalPair): TemporalDeterminationDescription | null {
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
  const basis = pair.currentDeterminationBasis;
  if (current === "officially-absent" && basis?.kind === "official-known-distribution") {
    return {
      currentLabel: "Official status: no known detections",
      pairStatusLabel: "Official status: no known detections",
      attribution: `${basis.authority} ${basis.speciesName} report for the period ending ${basis.authorityStatusAsOf}`,
      historyLabel: history ? "Previously recorded" : "No historical occurrence recorded",
      explanation: "This county inherits the agency's reported known distribution through its reviewed geographic scope. It does not establish universal absence of the organism or show that the county was surveyed. The report-period end is distinct from its unknown publication date and biological onset; later downloads and administrative edits do not renew the project review expiry. See the source evidence below.",
      showInResults: true,
    };
  }
  if (current === "officially-absent" && basis?.kind === "official-disease-distribution") {
    return {
      currentLabel: "Official disease status: absent",
      pairStatusLabel: "Official disease status: absent",
      attribution: `${basis.authority} ${basis.diseaseName} statement dated ${basis.declarationPublishedAt}`,
      historyLabel: history ? "Previously recorded" : "No historical occurrence recorded",
      explanation: "This county inherits the agency's stated disease distribution through its reviewed geographic scope. It does not establish universal absence of the organism, including asymptomatic or transported material, and is not a county survey. Biological onset is unknown; the statement date and project review expiry have separate meanings. See the source evidence below.",
      showInResults: true,
    };
  }
  if (current === "officially-eradicated" || current === "officially-absent") {
    return {
      currentLabel: current === "officially-eradicated" ? "Officially eradicated" : "Officially absent",
      historyLabel: history ? "Previously recorded" : "No historical occurrence recorded",
      explanation: history
        ? "An earlier occurrence is retained alongside the later agency determination. The presence count includes this historical record; it does not establish current presence."
        : "This current assessment is based on an explicit authority statement. Its dates, geographic scope and any county derivation are described in the evidence below. It is not inferred from missing records.",
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
