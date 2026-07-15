import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import type {
  ImmutableResearchRunReceipt,
  ResearchSourceDefinition,
} from "@/lib/research/types";
import { resolveRunEvidence } from "@/lib/research/event-resolution";
import { sha256, stableJson } from "@/lib/research/run-files";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function schemaValidator(root: string, filename: string, stripConditionals = false) {
  const schema = JSON.parse(
    readFileSync(path.join(root, "src/data/research/schemas", filename), "utf8"),
  ) as Record<string, unknown>;
  if (stripConditionals) delete schema.allOf;
  return z.fromJSONSchema(
    schema as Parameters<typeof z.fromJSONSchema>[0],
  );
}

function validateRecords(
  validator: ReturnType<typeof schemaValidator>,
  records: unknown[],
  label: string,
) {
  records.forEach((record, index) => {
    try {
      validator.parse(record);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${label} ${index + 1} failed schema validation: ${detail}`);
    }
  });
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate ID ${value}.`);
    seen.add(value);
  }
}

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

export function validateResearchRunInMemory(input: {
  root: string;
  sourceId: string;
  source: ResearchSourceDefinition;
  stateCode: string;
  runId: string;
  requestedPairKeys: string[];
  result: SourceAdapterResult;
  receipt: ImmutableResearchRunReceipt;
  outputContents: Map<string, string>;
}) {
  const {
    root,
    source,
    sourceId,
    stateCode,
    runId,
    requestedPairKeys,
    result,
    receipt,
  } = input;
  assert(source.id === sourceId, "Registered source does not match the adapter run.");
  validateRecords(
    schemaValidator(root, "evidence-assertion.schema.json"),
    result.assertions,
    "Evidence assertion",
  );
  validateRecords(
    schemaValidator(root, "review-event.schema.json", true),
    result.reviews,
    "Review event",
  );
  validateRecords(
    schemaValidator(root, "rejection-record.schema.json"),
    result.rejections,
    "Rejection record",
  );
  validateRecords(
    schemaValidator(root, "pair-outcome.schema.json", true),
    result.outcomes,
    "Pair outcome",
  );
  schemaValidator(root, "run-receipt.schema.json").parse(receipt);

  assertUnique(result.assertions.map((entry) => entry.eventId), "Assertion events");
  assertUnique(result.reviews.map((entry) => entry.eventId), "Review events");
  assertUnique(result.rejections.map((entry) => entry.rejection_id), "Rejections");
  assertUnique(result.outcomes.map((entry) => entry.outcome_id), "Outcomes");

  const requestedPairs = new Set(requestedPairKeys);
  assert(requestedPairs.size === requestedPairKeys.length, "Requested pairs are not unique.");
  const assertionById = new Map(result.assertions.map((entry) => [entry.eventId, entry]));
  const rejectionById = new Map(
    result.rejections.map((entry) => [entry.rejection_id, entry]),
  );

  for (const assertion of result.assertions) {
    assert(assertion.run_id === runId, `Assertion ${assertion.eventId} has the wrong run.`);
    assert(
      assertion.source_id === sourceId,
      `Assertion ${assertion.eventId} has the wrong source.`,
    );
    assert(
      assertion.state_code === stateCode,
      `Assertion ${assertion.eventId} has the wrong state.`,
    );
    assert(
      requestedPairs.has(pairKey(assertion.county_fips, assertion.species_id)),
      `Assertion ${assertion.eventId} is outside the requested pairs.`,
    );
  }

  for (const review of result.reviews) {
    const assertion = assertionById.get(review.references.assertion_event_id);
    assert(assertion, `Review ${review.eventId} references an unknown assertion.`);
    assert(review.run_id === runId, `Review ${review.eventId} has the wrong run.`);
    assert(review.source_id === sourceId, `Review ${review.eventId} has the wrong source.`);
    assert(review.state_code === stateCode, `Review ${review.eventId} has the wrong state.`);
    if (review.event_type === "evidence.reviewed") {
      assert(
        review.decision === "accepted" || review.decision === "rejected",
        `Review ${review.eventId} has an incompatible decision.`,
      );
    }
    if (review.decision === "accepted") {
      assert(
        review.event_type === "evidence.reviewed",
        `Accepted review ${review.eventId} has an incompatible event type.`,
      );
    }
    if (review.decision !== "accepted") {
      assert(
        !review.publication_eligible,
        `Non-accepted review ${review.eventId} is publication eligible.`,
      );
    }
    assert(
      review.county_fips === assertion.county_fips &&
        review.species_id === assertion.species_id,
      `Review ${review.eventId} does not match its assertion pair.`,
    );
  }

  for (const rejection of result.rejections) {
    assert(rejection.run_id === runId, `Rejection ${rejection.rejection_id} has the wrong run.`);
    assert(
      rejection.source_id === sourceId,
      `Rejection ${rejection.rejection_id} has the wrong source.`,
    );
    assert(
      rejection.normalized_target.state_code === stateCode,
      `Rejection ${rejection.rejection_id} has the wrong state.`,
    );
    const countyFips = rejection.normalized_target.county_fips;
    if (countyFips) {
      assert(
        requestedPairs.has(
          pairKey(countyFips, rejection.normalized_target.species_id),
        ),
        `Rejection ${rejection.rejection_id} is outside the requested pairs.`,
      );
    } else {
      assert(
        requestedPairKeys.some((key) =>
          key.endsWith(`:${rejection.normalized_target.species_id}`),
        ),
        `Rejection ${rejection.rejection_id} is outside the requested species.`,
      );
    }
  }

  const outcomePairs = result.outcomes.map((entry) =>
    pairKey(entry.county_fips, entry.species_id),
  );
  assertUnique(outcomePairs, "Outcome pairs");
  assert(
    outcomePairs.length === requestedPairKeys.length &&
      requestedPairKeys.every((key) => outcomePairs.includes(key)),
    "The adapter did not emit exactly one outcome for every requested pair.",
  );
  for (const outcome of result.outcomes) {
    assert(outcome.run_id === runId, `Outcome ${outcome.outcome_id} has the wrong run.`);
    assert(outcome.source_id === sourceId, `Outcome ${outcome.outcome_id} has the wrong source.`);
    assert(outcome.state_code === stateCode, `Outcome ${outcome.outcome_id} has the wrong state.`);
    if (outcome.status === "evidence-found") {
      assert(
        outcome.assertion_event_ids.length > 0 && outcome.query_urls.length > 0,
        `Evidence outcome ${outcome.outcome_id} lacks assertions or query URLs.`,
      );
    }
    if (outcome.status === "no-qualifying-evidence") {
      assert(
        outcome.scope_complete &&
          outcome.assertion_event_ids.length === 0 &&
          outcome.query_urls.length > 0,
        `No-evidence outcome ${outcome.outcome_id} is not a complete research-only result.`,
      );
    }
    if (outcome.status === "needs-followup" || outcome.status === "blocked") {
      assert(
        !outcome.scope_complete,
        `Incomplete outcome ${outcome.outcome_id} is marked scope complete.`,
      );
    }
    if (outcome.scope_complete) {
      assert(
        outcome.status === "evidence-found" ||
          outcome.status === "no-qualifying-evidence",
        `Scope-complete outcome ${outcome.outcome_id} has an invalid status.`,
      );
    }
    for (const assertionId of outcome.assertion_event_ids) {
      const assertion = assertionById.get(assertionId);
      assert(assertion, `Outcome ${outcome.outcome_id} references an unknown assertion.`);
      assert(
        assertion.county_fips === outcome.county_fips &&
          assertion.species_id === outcome.species_id,
        `Outcome ${outcome.outcome_id} references an assertion from another pair.`,
      );
    }
    for (const rejectionId of outcome.rejection_ids) {
      const rejection = rejectionById.get(rejectionId);
      assert(rejection, `Outcome ${outcome.outcome_id} references an unknown rejection.`);
      assert(
        rejection.normalized_target.species_id === outcome.species_id &&
          (!rejection.normalized_target.county_fips ||
            rejection.normalized_target.county_fips === outcome.county_fips),
        `Outcome ${outcome.outcome_id} references a rejection from another pair.`,
      );
    }
  }

  assert(receipt.run_id === runId, "Receipt run ID does not match the adapter run.");
  assert(receipt.source_id === sourceId, "Receipt source does not match the adapter run.");
  assert(
    receipt.requested_scope.state_code === stateCode,
    "Receipt state does not match the adapter run.",
  );
  assert(receipt.counts.requested_pairs === requestedPairKeys.length, "Receipt requested-pair count is wrong.");
  assert(receipt.counts.assertion_events === result.assertions.length, "Receipt assertion count is wrong.");
  assert(receipt.counts.review_events === result.reviews.length, "Receipt review count is wrong.");
  assert(receipt.counts.rejection_records === result.rejections.length, "Receipt rejection count is wrong.");
  assert(receipt.counts.pair_outcomes === result.outcomes.length, "Receipt outcome count is wrong.");
  assert(receipt.counts.error_count === result.errors.length, "Receipt error count is wrong.");
  assert(
    receipt.counts.candidate_records === result.candidateRecordCount,
    "Receipt candidate-record count is wrong.",
  );
  assert(
    receipt.counts.duplicate_records === result.duplicateRecordCount,
    "Receipt duplicate-record count is wrong.",
  );
  assert(
    receipt.parameter_hash === sha256(stableJson(receipt.parameters)),
    "Receipt parameter hash does not match its parameters.",
  );
  const parameterPairs = receipt.parameters.candidatePairs;
  assert(
    Array.isArray(parameterPairs) &&
      parameterPairs.every((value): value is string => typeof value === "string"),
    "Receipt parameters do not contain candidatePairs.",
  );
  assert(
    stableJson(parameterPairs) === stableJson(requestedPairKeys) &&
      stableJson(receipt.requested_scope.pair_keys) === stableJson(requestedPairKeys),
    "Receipt requested pair scope does not match its parameters.",
  );
  const expectedCountyFips = [
    ...new Set(requestedPairKeys.map((key) => key.split(":", 1)[0])),
  ].sort();
  const expectedSpeciesIds = [
    ...new Set(requestedPairKeys.map((key) => key.slice(key.indexOf(":") + 1))),
  ].sort();
  assert(
    stableJson(receipt.requested_scope.county_fips) === stableJson(expectedCountyFips),
    "Receipt county scope does not match its pair keys.",
  );
  assert(
    stableJson(receipt.requested_scope.species_ids) === stableJson(expectedSpeciesIds),
    "Receipt species scope does not match its pair keys.",
  );
  const startedAt = Date.parse(receipt.started_at);
  const finishedAt = Date.parse(receipt.finished_at);
  assert(startedAt <= finishedAt, "Receipt finishes before it starts.");
  assert(result.completedAt === receipt.finished_at, "Adapter completion time does not match the receipt.");
  for (const [label, timestamps] of [
    ["assertion", result.assertions.map((entry) => entry.created_at)],
    ["review", result.reviews.map((entry) => entry.created_at)],
    ["rejection", result.rejections.map((entry) => entry.created_at)],
    ["outcome", result.outcomes.map((entry) => entry.recorded_at)],
  ] as const) {
    for (const timestamp of timestamps) {
      const value = Date.parse(timestamp);
      assert(
        value >= startedAt && value <= finishedAt,
        `${label} timestamp is outside the receipt interval.`,
      );
    }
  }
  resolveRunEvidence(
    result.assertions,
    result.reviews,
    [source],
    receipt.finished_at.slice(0, 10),
  );

  assert(receipt.outputs.length === input.outputContents.size, "Receipt output set is incomplete.");
  for (const reference of receipt.outputs) {
    const filename = path.posix.basename(reference.path);
    const contents = input.outputContents.get(filename);
    assert(contents !== undefined, `Receipt references unknown output ${reference.path}.`);
    assert(Buffer.byteLength(contents) === reference.bytes, `Output byte count is wrong for ${filename}.`);
    assert(sha256(contents) === reference.sha256, `Output hash is wrong for ${filename}.`);
  }
}

export function verifyStagedResearchRun(
  temporaryDirectory: string,
  receipt: ImmutableResearchRunReceipt,
) {
  for (const reference of [...receipt.outputs, ...receipt.artifacts]) {
    const filename = path.posix.basename(reference.path);
    const filepath = receipt.artifacts.includes(reference)
      ? path.join(temporaryDirectory, "artifacts", filename)
      : path.join(temporaryDirectory, filename);
    const contents = readFileSync(filepath);
    assert(contents.length === reference.bytes, `Staged byte count is wrong for ${filename}.`);
    assert(sha256(contents) === reference.sha256, `Staged hash is wrong for ${filename}.`);
  }
}
