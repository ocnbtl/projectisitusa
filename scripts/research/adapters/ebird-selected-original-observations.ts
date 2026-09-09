import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildEbirdSelectedResult, EBIRD_SELECTED_VERSION } from '@/lib/research/ebird-selected-original-observations';
import { EBIRD_ADAPTER, EBIRD_SOURCE } from '@/lib/research/ebird-original-observations';
import type { ResearchSourceAdapter } from '@/lib/research/source-adapter';
export const ebirdSelectedOriginalAdapter: ResearchSourceAdapter = {
  adapterId: EBIRD_ADAPTER, adapterVersion: EBIRD_SELECTED_VERSION, sourceId: EBIRD_SOURCE,
  async run(context) {
    const result = buildEbirdSelectedResult(context, p => readFileSync(path.join(process.cwd(), p)));
    return {...result, completedAt: new Date().toISOString()};
  },
};
