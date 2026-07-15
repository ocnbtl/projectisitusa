import type {
  EvidenceReviewEvent,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";

export interface SourceAdapterContext {
  runId: string;
  sourceId: string;
  stateCode: string;
  requestedPairs: Array<{
    countyFips: string;
    countyName: string;
    speciesId: string;
    scientificName: string;
  }>;
  runStartedAt: string;
  parameters: Record<string, unknown>;
}

export interface SourceAdapterResult {
  completedAt: string;
  assertions: RunEvidenceAssertionEvent[];
  reviews: EvidenceReviewEvent[];
  rejections: ResearchRejectionRecord[];
  outcomes: ResearchPairOutcome[];
  artifacts: Array<{
    filename: string;
    mediaType: string;
    contents: string;
  }>;
  upstreamRequests: Array<{
    url: string;
    status: number;
    retrievedAt: string;
    recordCount: number;
  }>;
  candidateRecordCount: number;
  duplicateRecordCount: number;
  errors: Array<{ code: string; message: string; retryable: boolean }>;
  warnings: string[];
}

/**
 * New source families implement this contract. Adapters emit normalized run
 * records; the runner owns immutable file and receipt creation. Neither layer
 * edits a matrix, generated truth, or merged presence snapshot directly.
 */
export interface ResearchSourceAdapter {
  adapterId: string;
  adapterVersion: string;
  sourceId: string;
  run(context: SourceAdapterContext): Promise<SourceAdapterResult>;
}
