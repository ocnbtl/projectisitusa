import type {
  EvidenceAssertion,
  EvidenceReviewEvent,
  ResearchSourceDefinition,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { resolveRunEvidence } from "@/lib/research/event-resolution";
import { stableJson } from "@/lib/research/run-files";

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cutoffTimestamp(asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`Invalid research as-of date: ${asOf}`);
  }
  return Date.parse(`${asOf}T23:59:59.999Z`);
}

function sourceRecordClaimKey(entry: RunEvidenceAssertionEvent) {
  return [
    entry.source_id,
    entry.source_record_id,
    entry.state_code,
    entry.county_fips,
    entry.species_id,
    entry.claim_type,
  ].join("|");
}

function canonicalGeographyMethod(method: string) {
  if (
    method === "Exact normalized Alabama county text matched to requested local county FIPS" ||
    method === "Registered exact county-equivalent name matched to requested Census county FIPS"
  ) {
    return "provider-declared-exact-county-equivalent-name";
  }
  return method;
}

function semanticClaimFingerprint(entry: RunEvidenceAssertionEvent) {
  const {
    actor_id: _actorId,
    actor_type: _actorType,
    created_at: _createdAt,
    eventId: _eventId,
    retrieved_at: _retrievedAt,
    run_id: _runId,
    ...semanticClaim
  } = entry;
  return stableJson({
    ...semanticClaim,
    geography_match: {
      ...entry.geography_match,
      method: canonicalGeographyMethod(entry.geography_match.method),
    },
  });
}

function stableClaimKey(entry: RunEvidenceAssertionEvent) {
  return `${sourceRecordClaimKey(entry)}|${semanticClaimFingerprint(entry)}`;
}

function projectDistinctRunAssertions(assertions: RunEvidenceAssertionEvent[]) {
  const semanticClaimsBySourceRecord = new Map<string, Set<string>>();
  for (const assertion of assertions) {
    const key = sourceRecordClaimKey(assertion);
    const semanticClaims = semanticClaimsBySourceRecord.get(key) ?? new Set<string>();
    semanticClaims.add(semanticClaimFingerprint(assertion));
    semanticClaimsBySourceRecord.set(key, semanticClaims);
  }
  for (const [key, semanticClaims] of semanticClaimsBySourceRecord) {
    if (semanticClaims.size > 1) {
      throw new Error(
        `Active source-record claim ${key} has changed semantics without an explicit superseding or retraction event.`,
      );
    }
  }

  const selectedByClaim = new Map<string, RunEvidenceAssertionEvent>();
  for (const assertion of assertions) {
    const key = stableClaimKey(assertion);
    const current = selectedByClaim.get(key);
    if (
      !current ||
      compareText(current.created_at, assertion.created_at) < 0 ||
      (current.created_at === assertion.created_at &&
        compareText(current.eventId, assertion.eventId) < 0)
    ) {
      selectedByClaim.set(key, assertion);
    }
  }
  return [...selectedByClaim.values()].sort((left, right) =>
    compareText(left.eventId, right.eventId),
  );
}

export function compileAdditiveResearchEvidence(input: {
  bootstrapEvidence: EvidenceAssertion[];
  runAssertions: RunEvidenceAssertionEvent[];
  reviewEvents: EvidenceReviewEvent[];
  sources: ResearchSourceDefinition[];
  asOf: string;
}) {
  const resolvedRunEvidence = resolveRunEvidence(
    input.runAssertions,
    input.reviewEvents,
    input.sources,
    input.asOf,
  );
  const projectedRunAssertions = projectDistinctRunAssertions(
    resolvedRunEvidence.publishedAssertions,
  );
  const sourceLabelById = new Map(input.sources.map((source) => [source.id, source.label]));
  const cutoff = cutoffTimestamp(input.asOf);
  const acceptedReviewsByAssertion = new Map<string, EvidenceReviewEvent[]>();

  for (const review of input.reviewEvents) {
    if (
      review.event_type !== "evidence.reviewed" ||
      review.decision !== "accepted" ||
      Date.parse(review.created_at) > cutoff
    ) {
      continue;
    }
    const values = acceptedReviewsByAssertion.get(review.references.assertion_event_id) ?? [];
    values.push(review);
    acceptedReviewsByAssertion.set(review.references.assertion_event_id, values);
  }

  const runEvidence: EvidenceAssertion[] = projectedRunAssertions.map((entry) => {
    const acceptedReviews = acceptedReviewsByAssertion.get(entry.eventId) ?? [];
    acceptedReviews.sort(
      (left, right) =>
        compareText(left.created_at, right.created_at) || compareText(left.eventId, right.eventId),
    );
    return {
      evidenceId: entry.eventId,
      stateCode: entry.state_code,
      countyFips: entry.county_fips,
      speciesId: entry.species_id,
      assertion: entry.claim_type,
      scope: entry.scope,
      sourceId: entry.source_id,
      sourceLabel: sourceLabelById.get(entry.source_id) ?? entry.source_id,
      url: entry.source_url,
      externalRecordId: entry.source_record_id,
      observedAt: entry.source_record_date ?? undefined,
      reviewedAt: acceptedReviews.at(-1)?.created_at,
      accessedAt: entry.retrieved_at,
      lineage: "source-record" as const,
      caveat: entry.caveats.join(" "),
      parentJurisdictionEvidenceId: entry.parent_jurisdiction_evidence_id,
    };
  });

  return {
    evidence: [...input.bootstrapEvidence, ...runEvidence],
    runEvidence,
    projectedRunAssertions,
    resolvedRunEvidence,
  };
}
