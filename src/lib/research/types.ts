import type { SpeciesCategory } from "@/lib/data/types";

export type EvidenceAssertionType =
  | "recorded-present"
  | "officially-absent"
  | "not-detected";

export type EvidenceScope =
  | "point"
  | "survey-area"
  | "county"
  | "regulatory-area"
  | "legacy-county-pair";

export type EvidenceLineage =
  | "source-record"
  | "source-species-county"
  | "manual-review"
  | "legacy-merged";

export type DeterminationStatus =
  | "recorded-present"
  | "officially-absent"
  | "none";

export type SurveyStatus = "detected" | "not-detected" | "not-surveyed";

export type ResearchStatus =
  | "resolved"
  | "source-screened"
  | "not-started";

export type FreshnessStatus = "current" | "aging" | "stale" | "undated";

export type PairDisplayStatus =
  | "verified-present"
  | "verified-absent"
  | "not-detected"
  | "researched-unresolved"
  | "not-researched";

export type SourceTier =
  | "official-national"
  | "official-state"
  | "academic"
  | "structured-aggregator"
  | "community-occurrence"
  | "manual-authority"
  | "legacy";

export interface ResearchSourceDefinition {
  id: string;
  label: string;
  aliases: string[];
  authority: string;
  tier: SourceTier;
  homepage: string;
  access: "api" | "download" | "arcgis" | "manual" | "legacy-snapshot";
  geographicScope: string[];
  evidenceCapabilities: EvidenceAssertionType[];
  negativeSemantics: "none" | "explicit-survey-only" | "explicit-authority-only";
  refreshCadenceDays: number | null;
  status: "operational" | "manual" | "legacy-migration";
  adapter: string | null;
  caveat: string;
}

export interface ResearchSourceRegistry {
  schemaVersion: 1;
  updatedAt: string;
  sources: ResearchSourceDefinition[];
}

export interface EvidenceAssertion {
  evidenceId: string;
  stateCode: string;
  countyFips: string;
  speciesId: string;
  assertion: EvidenceAssertionType;
  scope: EvidenceScope;
  sourceId: string;
  sourceLabel: string;
  url: string;
  externalRecordId?: string;
  observedAt?: string;
  reviewedAt?: string;
  accessedAt?: string;
  lineage: EvidenceLineage;
  caveat: string;
}

export interface ResearchRunReceipt {
  runId: string;
  sourceId: string;
  sourceLabel: string;
  stateCode: string;
  status: "complete" | "legacy-import";
  scope: "statewide-source-screen" | "evidence-only" | "legacy-migration";
  accessedAt: string | null;
  targetSpeciesIds: string[];
  acceptedSpeciesIds: string[];
  acceptedPairCount: number;
  filters: string[];
  artifactPath: string;
  caveat: string;
}

export interface PairEvidenceSummary {
  evidenceId: string;
  sourceId: string;
  sourceLabel: string;
  url: string;
  assertion: EvidenceAssertionType;
  scope: EvidenceScope;
  observedAt?: string;
  reviewedAt?: string;
  caveat: string;
  lineage: EvidenceLineage;
}

export interface ResearchPairRecord {
  speciesId: string;
  commonName: string;
  scientificName: string;
  category: SpeciesCategory;
  displayStatus: PairDisplayStatus;
  determinationStatus: DeterminationStatus;
  surveyStatus: SurveyStatus;
  researchStatus: ResearchStatus;
  freshnessStatus: FreshnessStatus;
  conflict: boolean;
  evidence: PairEvidenceSummary[];
  screenedBySourceIds: string[];
}

export interface ResearchStatusCounts {
  verifiedPresent: number;
  verifiedAbsent: number;
  notDetected: number;
  researchedUnresolved: number;
  notResearched: number;
  researchCoveragePercent: number;
}

export interface ResearchCountyFile {
  schemaVersion: 1;
  stateCode: string;
  countyFips: string;
  countyName: string;
  generatedAt: string;
  summary: ResearchStatusCounts;
  pairs: ResearchPairRecord[];
}

export interface ResearchQueueEntry {
  speciesId: string;
  commonName: string;
  scientificName: string;
  category: SpeciesCategory;
  notResearchedCountyCount: number;
  researchedUnresolvedCountyCount: number;
  missingProtocolSourceIds: string[];
  priorityScore: number;
}

export interface ResearchStateSummary {
  schemaVersion: 1;
  stateCode: string;
  stateName: string;
  generatedAt: string;
  sourceSnapshotDate: string;
  summary: {
    speciesCount: number;
    countyCount: number;
    totalPairs: number;
    verifiedPresent: number;
    verifiedAbsent: number;
    notDetected: number;
    researchedUnresolved: number;
    notResearched: number;
    determinationCoveragePercent: number;
    researchCoveragePercent: number;
    conflictCount: number;
  };
  counties: Array<
    {
      countyFips: string;
      name: string;
    } & ResearchStatusCounts
  >;
  sources: Array<{
    id: string;
    label: string;
    authority: string;
    tier: SourceTier;
    status: ResearchSourceDefinition["status"];
    lastRunAt: string | null;
    evidencePairCount: number;
    screenedSpeciesCount: number;
  }>;
  queue: ResearchQueueEntry[];
  statusDefinitions: Record<PairDisplayStatus, string>;
}
