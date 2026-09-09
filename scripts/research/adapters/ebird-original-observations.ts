import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildEbirdResult, EBIRD_ADAPTER, EBIRD_SOURCE, EBIRD_VERSION } from '@/lib/research/ebird-original-observations';
import type { ResearchSourceAdapter } from '@/lib/research/source-adapter';
export const ebirdOriginalAdapter: ResearchSourceAdapter = {
  adapterId: EBIRD_ADAPTER, adapterVersion: EBIRD_VERSION, sourceId: EBIRD_SOURCE,
  async run(context) {
    const result = buildEbirdResult(context, p => readFileSync(path.join(process.cwd(), p)));
    return {...result, completedAt: new Date().toISOString()};
  },
};
