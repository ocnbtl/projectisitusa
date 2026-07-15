import type {
  EvidenceAssertion,
  EvidenceReviewEvent,
  ResearchSourceDefinition,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { compileAdditiveResearchEvidence } from "@/lib/research/compile-evidence";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source: ResearchSourceDefinition = {
  id: "synthetic-source",
  label: "Synthetic source",
  aliases: [],
  authority: "Integrity fixture",
  tier: "structured-aggregator",
  homepage: "https://example.test",
  access: "api",
  geographicScope: ["AL"],
  evidenceCapabilities: ["recorded-present"],
  negativeSemantics: "none",
  refreshCadenceDays: null,
  status: "operational",
  adapter: null,
  caveat: "Synthetic integrity fixture only.",
  researchAdapter: {
    id: "synthetic-source",
    module: "fixture.ts",
    allowedVersions: ["1.0.0"],
    parameterSchema: "fixture.schema.json",
    publicationReviewGate: "machine-validated",
    taxonMatchingPolicy: "exact",
    geographyMatchingPolicy: "exact",
    artifactRetention: "versioned",
    claimPersistence: "historical",
    rateLimitRequestsPerSecond: 1,
  },
};

function assertion(eventId: string, speciesId: string): RunEvidenceAssertionEvent {
  return {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: "2026-07-14T12:00:00.000Z",
    actor_type: "adapter",
    actor_id: "synthetic-source@1.0.0",
    run_id: "synthetic-run",
    source_id: source.id,
    state_code: "AL",
    county_fips: "01001",
    species_id: speciesId,
    claim_type: "recorded-present",
    evidence_kind: "preserved-specimen",
    scope: "county",
    source_record_id: eventId,
    source_url: `https://example.test/records/${eventId}`,
    source_record_date: "2025-06-01",
    retrieved_at: "2026-07-14T12:00:00.000Z",
    taxon_match: {
      method: "exact",
      target_scientific_name: "Example species",
      source_scientific_name: "Example species",
      source_taxon_key: "1",
    },
    geography_match: {
      method: "exact-county-name",
      source_state: "Alabama",
      source_county: "Autauga",
      county_fips: "01001",
    },
    temporal_scope: "historical occurrence",
    spatial_scope: "county",
    survey_scope: null,
    normalized_payload_hash: "a".repeat(64),
    caveats: [],
    notes: [],
  };
}

function acceptedReview(assertionEvent: RunEvidenceAssertionEvent): EvidenceReviewEvent {
  return {
    schemaVersion: 1,
    eventId: `review-${assertionEvent.eventId}`,
    event_type: "evidence.reviewed",
    created_at: "2026-07-14T12:01:00.000Z",
    actor_type: "adapter",
    actor_id: "synthetic-source@1.0.0",
    run_id: assertionEvent.run_id,
    source_id: assertionEvent.source_id,
    state_code: assertionEvent.state_code,
    county_fips: assertionEvent.county_fips,
    species_id: assertionEvent.species_id,
    references: { assertion_event_id: assertionEvent.eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: ["exact-taxon-and-county-match"],
    notes: [],
  };
}

const accepted = assertion("accepted-assertion", "accepted-species");
const unreviewed = assertion("unreviewed-assertion", "unreviewed-species");
const bootstrap: EvidenceAssertion = {
  evidenceId: "bootstrap-assertion",
  stateCode: "AL",
  countyFips: "01001",
  speciesId: "bootstrap-species",
  assertion: "recorded-present",
  scope: "legacy-county-pair",
  sourceId: "synthetic-source",
  sourceLabel: "Synthetic source",
  url: "https://example.test/bootstrap",
  lineage: "legacy-merged",
  caveat: "Synthetic integrity fixture only.",
};

const initial = compileAdditiveResearchEvidence({
  bootstrapEvidence: [bootstrap],
  runAssertions: [accepted, unreviewed],
  reviewEvents: [acceptedReview(accepted)],
  sources: [source],
  asOf: "2026-07-14",
});
assert(initial.evidence.some((entry) => entry.evidenceId === bootstrap.evidenceId), "Bootstrap evidence was lost.");
assert(initial.evidence.some((entry) => entry.evidenceId === accepted.eventId), "Accepted run evidence was not published.");
assert(!initial.evidence.some((entry) => entry.evidenceId === unreviewed.eventId), "Unreviewed run evidence was published.");

const afterBootstrapRefresh = compileAdditiveResearchEvidence({
  bootstrapEvidence: [],
  runAssertions: [accepted, unreviewed],
  reviewEvents: [acceptedReview(accepted)],
  sources: [source],
  asOf: "2026-07-14",
});
assert(
  afterBootstrapRefresh.evidence.some((entry) => entry.evidenceId === accepted.eventId),
  "A bootstrap refresh erased accepted immutable-run evidence.",
);
assert(
  !afterBootstrapRefresh.evidence.some((entry) => entry.evidenceId === unreviewed.eventId),
  "A bootstrap refresh caused unreviewed immutable-run evidence to publish.",
);

console.log(
  JSON.stringify(
    {
      acceptedRunEvidencePublished: true,
      unreviewedRunEvidencePublished: false,
      acceptedRunEvidenceSurvivesBootstrapRefresh: true,
    },
    null,
    2,
  ),
);
