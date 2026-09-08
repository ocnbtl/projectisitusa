import { readFileSync } from "node:fs";
import path from "node:path";
import type { ResearchSourceAdapter } from "@/lib/research/source-adapter";
import { OFFICIAL_OCCURRENCE_ADAPTER, OFFICIAL_OCCURRENCE_SOURCE, OFFICIAL_OCCURRENCE_VERSION, buildOfficialOccurrenceResult } from "@/lib/research/official-occurrence-review";

export const officialOccurrenceAdapter: ResearchSourceAdapter = {
  adapterId: OFFICIAL_OCCURRENCE_ADAPTER, adapterVersion: OFFICIAL_OCCURRENCE_VERSION, sourceId: OFFICIAL_OCCURRENCE_SOURCE,
  async run(context) {
    if (Date.parse(context.runStartedAt) > Date.now()) throw new Error("Official occurrence run cannot start in the future.");
    return { ...buildOfficialOccurrenceResult(context, p => readFileSync(path.join(process.cwd(), p))), completedAt: new Date().toISOString() };
  },
};
