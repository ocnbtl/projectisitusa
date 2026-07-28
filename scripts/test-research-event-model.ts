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

function acceptedReview(
  assertionEvent: RunEvidenceAssertionEvent,
  createdAt = "2026-07-14T12:01:00.000Z",
): EvidenceReviewEvent {
  return {
    schemaVersion: 1,
    eventId: `review-${assertionEvent.eventId}`,
    event_type: "evidence.reviewed",
    created_at: createdAt,
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

const repeatedAccepted: RunEvidenceAssertionEvent = {
  ...accepted,
  eventId: "accepted-assertion-repeat",
  run_id: "synthetic-run-repeat",
  created_at: "2026-07-14T12:02:00.000Z",
  retrieved_at: "2026-07-14T12:02:00.000Z",
};
const repeatedProjection = compileAdditiveResearchEvidence({
  bootstrapEvidence: [],
  runAssertions: [accepted, repeatedAccepted],
  reviewEvents: [
    acceptedReview(accepted),
    acceptedReview(repeatedAccepted, "2026-07-14T12:03:00.000Z"),
  ],
  sources: [source],
  asOf: "2026-07-14",
});
assert(
  repeatedProjection.resolvedRunEvidence.publishedAssertions.length === 2,
  "Repeated immutable assertion events were not preserved.",
);
assert(
  repeatedProjection.runEvidence.length === 1 &&
    repeatedProjection.runEvidence[0]?.evidenceId === repeatedAccepted.eventId,
  "Repeated source-record claims were not deduplicated to the latest projection.",
);

const legacyExactCountyMethod: RunEvidenceAssertionEvent = {
  ...accepted,
  geography_match: {
    ...accepted.geography_match,
    method: "Exact normalized Alabama county text matched to requested local county FIPS",
  },
};
const registeredExactCountyMethod: RunEvidenceAssertionEvent = {
  ...repeatedAccepted,
  geography_match: {
    ...repeatedAccepted.geography_match,
    method: "Registered exact county-equivalent name matched to requested Census county FIPS",
  },
};
const exactCountyMethodProjection = compileAdditiveResearchEvidence({
  bootstrapEvidence: [],
  runAssertions: [legacyExactCountyMethod, registeredExactCountyMethod],
  reviewEvents: [
    acceptedReview(legacyExactCountyMethod),
    acceptedReview(registeredExactCountyMethod, "2026-07-14T12:03:00.000Z"),
  ],
  sources: [source],
  asOf: "2026-07-14",
});
assert(
  exactCountyMethodProjection.runEvidence.length === 1 &&
    exactCountyMethodProjection.runEvidence[0]?.evidenceId === registeredExactCountyMethod.eventId,
  "Equivalent provider-declared exact-county method labels were treated as changed claim semantics.",
);

let derivedGeographyBlocked = false;
try {
  const coordinateDerived: RunEvidenceAssertionEvent = {
    ...registeredExactCountyMethod,
    geography_match: {
      ...registeredExactCountyMethod.geography_match,
      method: "Coordinate point-in-polygon county inference",
    },
  };
  compileAdditiveResearchEvidence({
    bootstrapEvidence: [],
    runAssertions: [legacyExactCountyMethod, coordinateDerived],
    reviewEvents: [
      acceptedReview(legacyExactCountyMethod),
      acceptedReview(coordinateDerived, "2026-07-14T12:03:00.000Z"),
    ],
    sources: [source],
    asOf: "2026-07-14",
  });
} catch {
  derivedGeographyBlocked = true;
}
assert(
  derivedGeographyBlocked,
  "A coordinate-derived geography method replaced exact provider county geography without superseding review.",
);

let changedPayloadBlocked = false;
try {
  compileAdditiveResearchEvidence({
    bootstrapEvidence: [],
    runAssertions: [
      accepted,
      { ...repeatedAccepted, normalized_payload_hash: "b".repeat(64) },
    ],
    reviewEvents: [
      acceptedReview(accepted),
      acceptedReview(repeatedAccepted, "2026-07-14T12:03:00.000Z"),
    ],
    sources: [source],
    asOf: "2026-07-14",
  });
} catch {
  changedPayloadBlocked = true;
}
assert(
  changedPayloadBlocked,
  "Changed source-record payloads published without explicit superseding review.",
);

let changedSemanticsBlocked = false;
try {
  compileAdditiveResearchEvidence({
    bootstrapEvidence: [],
    runAssertions: [
      accepted,
      { ...repeatedAccepted, caveats: ["Changed publication caveat."] },
    ],
    reviewEvents: [
      acceptedReview(accepted),
      acceptedReview(repeatedAccepted, "2026-07-14T12:03:00.000Z"),
    ],
    sources: [source],
    asOf: "2026-07-14",
  });
} catch {
  changedSemanticsBlocked = true;
}
assert(
  changedSemanticsBlocked,
  "Changed source-record semantics published without explicit superseding review.",
);

console.log(
  JSON.stringify(
    {
      acceptedRunEvidencePublished: true,
      unreviewedRunEvidencePublished: false,
      acceptedRunEvidenceSurvivesBootstrapRefresh: true,
      repeatedRunEventsPreserved: true,
      repeatedSourceRecordProjectionDeduplicated: true,
      equivalentExactCountyMethodLabelsDeduplicated: true,
      derivedGeographyRequiresSupersedingReview: true,
      changedPayloadRequiresSupersedingReview: true,
      changedSemanticsRequireSupersedingReview: true,
    },
    null,
    2,
  ),
);
