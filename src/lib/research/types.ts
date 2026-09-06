import type { PairQuestionAssessmentProjection, QuestionAssessmentCoverage } from "@/lib/research/question-assessment-ledger";
export type { PairQuestionPlan, QuestionCoverageProof, ResearchQuestionAssessment } from "@/lib/research/question-assessments";
import type { SpeciesCategory } from "@/lib/data/types";
import type {
  StateSpeciesApplicability,
  StateSpeciesResearchCounts,
  StateSpeciesResolutionOverride,
} from "@/lib/research/state-species-resolution";

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

export type HistoricalOccurrenceStatus = "recorded-present" | "none";

export type CurrentDeterminationStatus =
  | "present"
  | "officially-eradicated"
  | "officially-absent"
  | "none";

export type JurisdictionDeterminationType =
  | "officially-eradicated"
  | "officially-absent";

export type SurveyStatus =
  | "detected"
  | "not-detected"
  | "inconclusive"
  | "unassessed";

export type ResearchStatus =
  | "resolved"
  | "source-screened"
  | "not-started"
  | "reviewed-evidence-found"
  | "reviewed-no-qualifying-evidence"
  | "needs-followup"
  | "blocked";

export type FreshnessStatus = "current" | "aging" | "stale" | "undated";

export type EvidenceKind =
  | "occurrence"
  | "preserved-specimen"
  | "regulatory"
  | "survey-detection"
  | "survey-non-detection"
  | "absence-statement";

export type ReviewStatus =
  | "not-reviewed"
  | "machine-validated"
  | "agent-reviewed"
  | "human-approved"
  | "rejected"
  | "retracted";

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
  dataFreshThrough?: string;
  status: "operational" | "manual" | "legacy-migration";
  adapter: string | null;
  caveat: string;
  researchAdapter?: {
    id: string;
    module: string;
    allowedVersions: string[];
    parameterSchema: string;
    publicationReviewGate: "machine-validated" | "agent-reviewed" | "human-approved";
    taxonMatchingPolicy: string;
    geographyMatchingPolicy: string;
    artifactRetention: "versioned" | "hash-only" | "not-retained";
    claimPersistence: "historical" | "current-only";
    rateLimitRequestsPerSecond: number;
  };
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
  parentJurisdictionEvidenceId?: string;
}

export interface JurisdictionEvidenceSourceDocument {
  sourceId: string;
  url: string;
  artifactPath: string;
  artifactSha256: string;
  supportText: string;
  supportTextSha256: string;
  publishedAt: string | null;
  modifiedAt: string | null;
}

export interface JurisdictionEvidenceRecord {
  schemaVersion: 1;
  id: string;
  speciesId: string;
  statementType: JurisdictionDeterminationType;
  sourceDocuments: JurisdictionEvidenceSourceDocument[];
  jurisdiction: {
    level: "nation" | "state" | "county-set";
    id: string;
    stateCode: string | null;
    countyFips: string[];
    countyFipsSha256: string;
    exclusions: string[];
  };
  effectiveAt: string;
  /** Earliest possible eradication date when the authority reports an interval. */
  conflictCheckFrom?: string;
  reaffirmedAt: string | null;
  validThrough: string;
  review: {
    gate: "human-approved";
    status: "human-approved";
    actorId: string;
    reviewedAt: string;
  };
  caveats: string[];
}

export interface JurisdictionEvidenceRegistry {
  schemaVersion: 1;
  updatedAt: string;
  records: JurisdictionEvidenceRecord[];
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
  parentJurisdictionEvidenceId?: string;
}

export interface ResearchPairRecord {
  questionAssessment?: PairQuestionAssessmentProjection;
  speciesId: string;
  commonName: string;
  scientificName: string;
  category: SpeciesCategory;
  applicabilityStatus: "applicable" | "not-applicable" | "unknown" | "blocked";
  displayStatus: PairDisplayStatus;
  determinationStatus: DeterminationStatus;
  historicalOccurrenceStatus?: HistoricalOccurrenceStatus;
  currentDeterminationStatus?: CurrentDeterminationStatus;
  surveyStatus: SurveyStatus;
  researchStatus: ResearchStatus;
  freshnessStatus: FreshnessStatus;
  reviewStatus: ReviewStatus;
  conflict: boolean;
  evidence: PairEvidenceSummary[];
  screenedBySourceIds: string[];
}

export interface BoundedAcquisitionStatusCounts {
  speciesCount: number;
  totalPairs: number;
  verifiedPresent: number;
  verifiedAbsent: number;
  notDetected: number;
  researchedUnresolved: number;
  notResearched: number;
  researchCoveragePercent: number;
  explicitOutcomePairs: number;
  explicitOutcomeCoveragePercent: number;
}

export interface ResearchStatusCounts {
  catalogSpeciesCount: number;
  fullCountySpeciesDenominator: number;
  resolvablePairs: number;
  notApplicablePairs: number;
  blockedPairs: number;
  verifiedPresent: number;
  verifiedAbsent: number;
  notDetected: number;
  researchedUnresolved: number;
  notResearched: number;
  researchCoveragePercent: number;
  explicitOutcomePairs: number;
  explicitOutcomeCoveragePercent: number;
  boundedAcquisition: BoundedAcquisitionStatusCounts;
}

export interface ResearchProjectionScope {
  publicationMode: "authoritative" | "research-only";
  speciesMode: "catalog-all" | "sparse-default";
  certificationScope: "state-baseline" | "bounded-pilot";
  applicabilityPath: string;
  applicabilityAsOf: string;
  catalogSpeciesCount: number;
  stateSpeciesDenominator: number;
  applicableSpeciesCount: number;
  notApplicableSpeciesCount: number;
  unknownSpeciesCount: number;
  blockedSpeciesCount: number;
  explicitApplicabilityDecisionCount: number;
  derivedApplicableSpeciesCount: number;
  resolvedStateSpeciesDecisionCount: number;
  boundedAcquisitionSpeciesCount: number;
  defaultApplicability: "unknown";
  fullCatalogApplicabilityComplete: boolean;
  fullCatalogResearchAccounted: boolean;
  undeterminedSpeciesPolicy: "included-as-unknown";
  compatibilityPublication: boolean;
  protocolModel:
    | "explicit-source-species-legacy-migration"
    | "explicit-source-species-active";
}

export interface ResearchCountyFile {
  questionAssessment?: QuestionAssessmentCoverage;
  schemaVersion: 4;
  stateCode: string;
  countyFips: string;
  countyName: string;
  asOf: string;
  generatedAt: string;
  scope: ResearchProjectionScope;
  summary: ResearchStatusCounts;
  pairResolution: {
    catalogSpeciesPath: "/generated/species.json";
    defaultApplicability: "unknown";
    defaultDisplayStatus: "not-researched";
    explicitPairCount: number;
    applicabilityOverrides: Array<{
      speciesId: string;
      applicability: "applicable" | "not-applicable" | "unknown" | "blocked";
    }>;
  };
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
  questionAssessment?: QuestionAssessmentCoverage;
  schemaVersion: 4;
  stateCode: string;
  stateName: string;
  asOf: string;
  generatedAt: string;
  sourceSnapshotDate: string;
  scope: ResearchProjectionScope;
  stateSpeciesResearch: {
    schemaVersion: 1;
    defaultStatus: "not-researched";
    denominator: number;
    countyEquivalentCount: number;
    applicabilityDecisionCounts: Record<StateSpeciesApplicability, number>;
    derivedApplicableSpeciesCount: number;
    counts: StateSpeciesResearchCounts;
    fullyAccountedSpeciesCount: number;
    partiallyAccountedSpeciesCount: number;
    untouchedSpeciesCount: number;
    fullCatalogResearchAccounted: boolean;
    overrides: StateSpeciesResolutionOverride[];
  };
  summary: {
    speciesCount: number;
    countyCount: number;
    totalPairs: number;
    resolvablePairCount: number;
    notApplicablePairCount: number;
    blockedPairCount: number;
    verifiedPresent: number;
    verifiedAbsent: number;
    notDetected: number;
    researchedUnresolved: number;
    notResearched: number;
    determinationCoveragePercent: number;
    researchCoveragePercent: number;
    explicitOutcomePairCount: number;
    explicitOutcomeCoveragePercent: number;
    conflictCount: number;
    evidenceRecordCount: number;
    bootstrapEvidenceRecordCount: number;
    runEvidenceRecordCount: number;
    rejectionRecordCount: number;
    researchRunCount: number;
    boundedAcquisition: BoundedAcquisitionStatusCounts;
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
  migrationCandidates: {
    sourceAssertionCount: number;
    distinctPairCount: number;
    reviewedSourceAssertionCount: number;
    remainingSourceAssertionCount: number;
    reviewedDistinctPairCount: number;
    remainingDistinctPairCount: number;
  };
  statusDefinitions: Record<PairDisplayStatus, string>;
}

export type ResearchActorType = "adapter" | "agent" | "human" | "migration";

export interface ResearchActor {
  actor_type: ResearchActorType;
  actor_id: string;
}

export interface RunEvidenceAssertionEvent extends ResearchActor {
  schemaVersion: 1;
  eventId: string;
  event_type: "evidence.asserted";
  created_at: string;
  run_id: string;
  source_id: string;
  state_code: string;
  county_fips: string;
  species_id: string;
  claim_type: EvidenceAssertionType;
  evidence_kind: EvidenceKind;
  scope: EvidenceScope;
  source_record_id: string;
  source_url: string;
  source_record_date: string | null;
  retrieved_at: string;
  taxon_match: {
    method: string;
    target_scientific_name: string;
    source_scientific_name: string;
    source_taxon_key: string | null;
  };
  geography_match: {
    method: string;
    source_state: string;
    source_county: string;
    county_fips: string;
    source_coordinate_count?: number;
    source_coordinates_sha256?: string;
    topology_path?: string;
    topology_sha256?: string;
  };
  temporal_scope: string;
  spatial_scope: string;
  survey_scope: string | null;
  normalized_payload_hash: string;
  caveats: string[];
  notes: string[];
  parent_jurisdiction_evidence_id?: string;
}

export type ReviewEventType =
  | "evidence.reviewed"
  | "evidence.retracted"
  | "evidence.superseded";

export interface EvidenceReviewEvent extends ResearchActor {
  schemaVersion: 1;
  eventId: string;
  event_type: ReviewEventType;
  created_at: string;
  run_id: string;
  source_id: string;
  state_code: string;
  county_fips: string;
  species_id: string;
  references: {
    assertion_event_id: string;
    replacement_assertion_event_id?: string;
  };
  review_level: "machine-validated" | "agent-reviewed" | "human-approved";
  decision: "accepted" | "rejected" | "retracted" | "superseded";
  publication_eligible: boolean;
  reason_codes: string[];
  notes: string[];
}

export type RejectionReasonCode =
  | "taxon-mismatch"
  | "taxon-ambiguous"
  | "geography-missing"
  | "geography-ambiguous"
  | "retired-geography"
  | "outside-scope"
  | "cultivated-or-captive"
  | "record-failed"
  | "source-contradiction"
  | "duplicate"
  | "insufficient-negative-scope"
  | "unsupported-claim-type";

export interface ResearchRejectionRecord extends ResearchActor {
  schemaVersion: 1;
  rejection_id: string;
  created_at: string;
  run_id: string;
  source_id: string;
  candidate_locator: string;
  candidate_taxon: string;
  candidate_geography: string | null;
  normalized_target: {
    state_code: string;
    species_id: string;
    county_fips: string | null;
  };
  reason_code: RejectionReasonCode;
  supporting_notes: string[];
}

export type PairOutcomeStatus =
  | "evidence-found"
  | "no-qualifying-evidence"
  | "needs-followup"
  | "blocked";

export interface ResearchPairOutcome {
  schemaVersion: 1;
  outcome_id: string;
  run_id: string;
  source_id: string;
  state_code: string;
  county_fips: string;
  species_id: string;
  status: PairOutcomeStatus;
  scope_complete: boolean;
  recorded_at: string;
  assertion_event_ids: string[];
  rejection_ids: string[];
  query_urls: string[];
  notes: string[];
}

export interface ResearchRunFileReference {
  path: string;
  sha256: string;
  bytes: number;
  media_type: string;
}

export interface ImmutableResearchRunReceipt extends ResearchActor {
  schemaVersion: 1;
  run_id: string;
  status: "complete" | "partial" | "failed";
  started_at: string;
  finished_at: string;
  source_id: string;
  source_registry_hash: string;
  adapter_id: string;
  adapter_version: string;
  adapter_code_hash: string;
  code_commit: string;
  parameter_hash: string;
  parameters: Record<string, unknown>;
  requested_scope: {
    state_code: string;
    county_fips: string[];
    species_ids: string[];
    pair_keys: string[];
    date_range: { start: string | null; end: string | null };
  };
  upstream_requests: Array<{
    url: string;
    status: number;
    retrieved_at: string;
    record_count: number;
  }>;
  artifacts: ResearchRunFileReference[];
  outputs: ResearchRunFileReference[];
  counts: {
    requested_pairs: number;
    candidate_records: number;
    assertion_events: number;
    review_events: number;
    rejection_records: number;
    duplicate_records: number;
    error_count: number;
    pair_outcomes: number;
  };
  errors: Array<{ code: string; message: string; retryable: boolean }>;
  known_caveats: string[];
  source_warnings: string[];
  deviations: string[];
  rerun_command: string;
}

export interface ImmutableResearchRunBundle {
  directory: string;
  receipt: ImmutableResearchRunReceipt;
  assertions: RunEvidenceAssertionEvent[];
  reviews: EvidenceReviewEvent[];
  rejections: ResearchRejectionRecord[];
  outcomes: ResearchPairOutcome[];
}
