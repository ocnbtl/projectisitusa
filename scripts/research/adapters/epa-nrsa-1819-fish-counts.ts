import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildEpaNrsa1819Result, EPA_NRSA_ADAPTER, EPA_NRSA_SOURCE, EPA_NRSA_1819_VERSION } from '@/lib/research/epa-nrsa-1819-fish-counts';
import type { ResearchSourceAdapter } from '@/lib/research/source-adapter';
export const epaNrsa1819FishAdapter: ResearchSourceAdapter = {
  adapterId: EPA_NRSA_ADAPTER, adapterVersion: EPA_NRSA_1819_VERSION, sourceId: EPA_NRSA_SOURCE,
  async run(context) {
    const result = buildEpaNrsa1819Result(context, p => readFileSync(path.join(process.cwd(), p)));
    return {...result, completedAt: new Date().toISOString()};
  },
};
