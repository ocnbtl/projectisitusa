import { readFileSync } from "node:fs";
import path from "node:path";
import { buildEpaNrsaResult, EPA_NRSA_ADAPTER, EPA_NRSA_SOURCE, EPA_NRSA_VERSION } from "@/lib/research/epa-nrsa-fish-counts";
import type { ResearchSourceAdapter } from "@/lib/research/source-adapter";
export const epaNrsaFishAdapter: ResearchSourceAdapter = {
  adapterId: EPA_NRSA_ADAPTER, adapterVersion: EPA_NRSA_VERSION, sourceId: EPA_NRSA_SOURCE,
  async run(context) {
    const result = buildEpaNrsaResult(context, p => readFileSync(path.join(process.cwd(), p)));
    return { ...result, completedAt: new Date().toISOString() };
  },
};
