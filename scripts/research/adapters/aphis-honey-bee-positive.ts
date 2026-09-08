import { readFileSync } from "node:fs";
import path from "node:path";
import { buildHoneyPositiveResult, HONEY_POSITIVE_ADAPTER, HONEY_POSITIVE_SOURCE, HONEY_POSITIVE_VERSION } from "@/lib/research/honey-bee-positive-review";
import type { ResearchSourceAdapter } from "@/lib/research/source-adapter";
export const aphisHoneyBeePositiveAdapter: ResearchSourceAdapter = {
  adapterId: HONEY_POSITIVE_ADAPTER, adapterVersion: HONEY_POSITIVE_VERSION, sourceId: HONEY_POSITIVE_SOURCE,
  async run(context) {
    const result = buildHoneyPositiveResult(context, p => readFileSync(path.join(process.cwd(), p)));
    return {...result, completedAt: new Date().toISOString()};
  },
};
