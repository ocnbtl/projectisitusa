import type {
  EvidenceAssertion,
  EvidenceReviewEvent,
  ResearchSourceDefinition,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { resolveRunEvidence } from "@/lib/research/event-resolution";

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cutoffTimestamp(asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`Invalid research as-of date: ${asOf}`);
  }
  return Date.parse(`${asOf}T23:59:59.999Z`);
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

  const runEvidence: EvidenceAssertion[] = resolvedRunEvidence.publishedAssertions.map((entry) => {
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
    };
  });

  return {
    evidence: [...input.bootstrapEvidence, ...runEvidence],
    runEvidence,
    resolvedRunEvidence,
  };
}
