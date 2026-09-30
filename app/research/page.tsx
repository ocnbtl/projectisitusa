import type { Metadata } from "next";

import { ResearchControlCenter } from "@/components/research-control-center";
import stateResearchConfig from "@/data/research/state-research-config.json";
import stateRegistry from "@/data/research/state-registry.json";

export const metadata: Metadata = {
  title: "Research | isitusa",
  description: "Follow our progress, explore county evidence, and see the sources behind invasive species records.",
};

export default function ResearchPage() {
  const publishedStateCodes = new Set(
    stateResearchConfig.states
      .filter((entry) => entry.publicResearchProjection)
      .map((entry) => entry.stateCode),
  );
  const availableStates = stateRegistry.jurisdictions
    .filter((entry) => publishedStateCodes.has(entry.stateCode))
    .sort(
      (left, right) =>
        (left.certificationOrder ?? Number.MAX_SAFE_INTEGER) -
          (right.certificationOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.stateCode.localeCompare(right.stateCode),
    )
    .map((entry) => ({ stateCode: entry.stateCode, stateName: entry.stateName }));
  return <ResearchControlCenter availableStates={availableStates} />;
}
