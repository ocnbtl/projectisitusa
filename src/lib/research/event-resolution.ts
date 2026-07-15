import type {
  EvidenceReviewEvent,
  ResearchSourceDefinition,
  ReviewStatus,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { stableJson } from "@/lib/research/run-files";

const REVIEW_RANK = new Map<ReviewStatus, number>([
  ["not-reviewed", 0],
  ["machine-validated", 1],
  ["agent-reviewed", 2],
  ["human-approved", 3],
  ["rejected", -1],
  ["retracted", -2],
]);

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cutoffTimestamp(asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`Invalid research as-of date: ${asOf}`);
  }
  return Date.parse(`${asOf}T23:59:59.999Z`);
}

function atOrBeforeAsOf(value: string, cutoff: number) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid research event timestamp: ${value}`);
  }
  return timestamp <= cutoff;
}

function requiredReviewRank(source: ResearchSourceDefinition) {
  const gate = source.researchAdapter?.publicationReviewGate;
  if (!gate) {
    throw new Error(`Source ${source.id} has no publication review gate for run evidence.`);
  }
  return REVIEW_RANK.get(gate)!;
}

export interface ResolvedRunEvidence {
  publishedAssertions: RunEvidenceAssertionEvent[];
  reviewStatusByAssertionId: Map<string, ReviewStatus>;
  counts: {
    assertionEvents: number;
    reviewedAccepted: number;
    reviewedRejected: number;
    unreviewed: number;
    retracted: number;
    superseded: number;
    published: number;
  };
}

export function resolveRunEvidence(
  assertions: RunEvidenceAssertionEvent[],
  reviewEvents: EvidenceReviewEvent[],
  sources: ResearchSourceDefinition[],
  asOf: string,
): ResolvedRunEvidence {
  const cutoff = cutoffTimestamp(asOf);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const assertionById = new Map<string, RunEvidenceAssertionEvent>();

  for (const assertion of assertions) {
    if (Number.isNaN(Date.parse(assertion.created_at))) {
      throw new Error(`Assertion ${assertion.eventId} has an invalid timestamp.`);
    }
    const existing = assertionById.get(assertion.eventId);
    if (existing && stableJson(existing) !== stableJson(assertion)) {
      throw new Error(`Conflicting assertion bodies share event ID ${assertion.eventId}.`);
    }
    const source = sourceById.get(assertion.source_id);
    if (!source) throw new Error(`Assertion ${assertion.eventId} has unknown source ${assertion.source_id}.`);
    if (!source.evidenceCapabilities.includes(assertion.claim_type)) {
      throw new Error(`Assertion ${assertion.eventId} uses unsupported claim ${assertion.claim_type}.`);
    }
    assertionById.set(assertion.eventId, assertion);
  }

  const eventsByAssertion = new Map<string, EvidenceReviewEvent[]>();
  const eventById = new Map<string, EvidenceReviewEvent>();
  for (const event of reviewEvents) {
    if (Number.isNaN(Date.parse(event.created_at))) {
      throw new Error(`Review ${event.eventId} has an invalid timestamp.`);
    }
    const existing = eventById.get(event.eventId);
    if (existing && stableJson(existing) !== stableJson(event)) {
      throw new Error(`Conflicting review bodies share event ID ${event.eventId}.`);
    }
    eventById.set(event.eventId, event);
    const assertion = assertionById.get(event.references.assertion_event_id);
    if (!assertion) {
      throw new Error(`Review ${event.eventId} references unknown assertion ${event.references.assertion_event_id}.`);
    }
    if (
      event.source_id !== assertion.source_id ||
      event.state_code !== assertion.state_code ||
      event.county_fips !== assertion.county_fips ||
      event.species_id !== assertion.species_id
    ) {
      throw new Error(`Review ${event.eventId} does not match its assertion scope.`);
    }
    if (Date.parse(event.created_at) < Date.parse(assertion.created_at)) {
      throw new Error(`Review ${event.eventId} predates its assertion.`);
    }
    if (event.event_type === "evidence.reviewed" && !["accepted", "rejected"].includes(event.decision)) {
      throw new Error(`Review ${event.eventId} has an incompatible decision.`);
    }
    if (event.event_type === "evidence.retracted" && event.decision !== "retracted") {
      throw new Error(`Retraction ${event.eventId} has an incompatible decision.`);
    }
    if (event.event_type === "evidence.superseded") {
      if (event.decision !== "superseded" || !event.references.replacement_assertion_event_id) {
        throw new Error(`Superseding event ${event.eventId} lacks a replacement assertion.`);
      }
      if (!assertionById.has(event.references.replacement_assertion_event_id)) {
        throw new Error(`Superseding event ${event.eventId} references an unknown replacement.`);
      }
      const replacement = assertionById.get(event.references.replacement_assertion_event_id)!;
      if (
        replacement.source_id !== assertion.source_id ||
        replacement.state_code !== assertion.state_code ||
        replacement.county_fips !== assertion.county_fips ||
        replacement.species_id !== assertion.species_id
      ) {
        throw new Error(`Superseding event ${event.eventId} replacement does not match the original scope.`);
      }
    }
    const values = eventsByAssertion.get(assertion.eventId) ?? [];
    values.push(event);
    eventsByAssertion.set(assertion.eventId, values);
  }

  const reviewStatusByAssertionId = new Map<string, ReviewStatus>();
  const publishedAssertions: RunEvidenceAssertionEvent[] = [];
  const counts = {
    assertionEvents: assertionById.size,
    reviewedAccepted: 0,
    reviewedRejected: 0,
    unreviewed: 0,
    retracted: 0,
    superseded: 0,
    published: 0,
  };

  for (const assertion of [...assertionById.values()].sort((left, right) => compareText(left.eventId, right.eventId))) {
    if (!atOrBeforeAsOf(assertion.created_at, cutoff)) continue;
    const events = (eventsByAssertion.get(assertion.eventId) ?? [])
      .filter((event) => atOrBeforeAsOf(event.created_at, cutoff))
      .sort(
        (left, right) =>
          compareText(left.created_at, right.created_at) || compareText(left.eventId, right.eventId),
      );
    let status: ReviewStatus = "not-reviewed";
    let active = false;
    for (const event of events) {
      if (event.event_type === "evidence.retracted") {
        status = "retracted";
        active = false;
        continue;
      }
      if (event.event_type === "evidence.superseded") {
        status = "retracted";
        active = false;
        continue;
      }
      if (event.decision === "rejected") {
        status = "rejected";
        active = false;
        continue;
      }
      status = event.review_level;
      const source = sourceById.get(assertion.source_id)!;
      const eligible = (REVIEW_RANK.get(status) ?? 0) >= requiredReviewRank(source);
      if (event.publication_eligible !== eligible) {
        throw new Error(`Review ${event.eventId} publication eligibility disagrees with the source gate.`);
      }
      active = eligible;
    }
    reviewStatusByAssertionId.set(assertion.eventId, status);
    if (status === "not-reviewed") counts.unreviewed += 1;
    else if (status === "rejected") counts.reviewedRejected += 1;
    else if (status === "retracted") {
      if (events.at(-1)?.event_type === "evidence.superseded") counts.superseded += 1;
      else counts.retracted += 1;
    } else if (active) counts.reviewedAccepted += 1;
    if (active) publishedAssertions.push(assertion);
  }

  counts.published = publishedAssertions.length;
  return { publishedAssertions, reviewStatusByAssertionId, counts };
}
