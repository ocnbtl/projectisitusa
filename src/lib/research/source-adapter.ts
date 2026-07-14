import type {
  EvidenceAssertion,
  ResearchRunReceipt,
  ResearchSourceDefinition,
} from "@/lib/research/types";

export interface SourceAdapterContext {
  stateCode: string;
  requestedSpeciesIds: string[];
  runStartedAt: string;
}

export interface SourceAdapterResult {
  evidence: EvidenceAssertion[];
  rejectedRecords: Array<{
    externalRecordId?: string;
    reason: string;
  }>;
  receipt: ResearchRunReceipt;
}

/**
 * New source families implement this contract. Adapters emit evidence and a
 * run receipt; they never edit a matrix or merged presence snapshot directly.
 */
export interface ResearchSourceAdapter {
  source: ResearchSourceDefinition;
  run(context: SourceAdapterContext): Promise<SourceAdapterResult>;
}
