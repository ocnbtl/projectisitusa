import type { ImmutableResearchRunBundle } from "@/lib/research/types";
import {
  getStateDefinition,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function assertImmutableRunStateConsistency(
  bundle: ImmutableResearchRunBundle,
) {
  const stateCode = bundle.receipt.requested_scope.state_code;
  assert(
    getStateDefinition(stateCode)?.nationalV1Scope,
    `Immutable run ${bundle.receipt.run_id} has unknown state ${stateCode}.`,
  );
  for (const pairKey of bundle.receipt.requested_scope.pair_keys) {
    const countyFips = pairKey.slice(0, pairKey.indexOf(":"));
    assert(
      resolveCountyEquivalent({ stateCode, countyFips }).status === "resolved",
      `Immutable run ${bundle.receipt.run_id} requests inactive or foreign geography ${countyFips}.`,
    );
  }
  for (const assertion of bundle.assertions) {
    assert(
      assertion.state_code === stateCode,
      `Immutable run ${bundle.receipt.run_id} assertion ${assertion.eventId} disagrees with receipt state.`,
    );
  }
  for (const review of bundle.reviews) {
    assert(
      review.state_code === stateCode,
      `Immutable run ${bundle.receipt.run_id} review ${review.eventId} disagrees with receipt state.`,
    );
  }
  for (const rejection of bundle.rejections) {
    assert(
      rejection.normalized_target.state_code === stateCode,
      `Immutable run ${bundle.receipt.run_id} rejection ${rejection.rejection_id} disagrees with receipt state.`,
    );
  }
  for (const outcome of bundle.outcomes) {
    assert(
      outcome.state_code === stateCode,
      `Immutable run ${bundle.receipt.run_id} outcome ${outcome.outcome_id} disagrees with receipt state.`,
    );
  }
}

export function selectImmutableResearchRunsForState(
  bundles: ImmutableResearchRunBundle[],
  stateCode: string,
  asOf: string,
) {
  const cutoff = Date.parse(`${asOf}T23:59:59.999Z`);
  assert(Number.isFinite(cutoff), `Invalid immutable-run selection as-of date: ${asOf}.`);
  assert(
    getStateDefinition(stateCode)?.nationalV1Scope,
    `Unknown national-v1 state ${stateCode}.`,
  );
  for (const bundle of bundles) assertImmutableRunStateConsistency(bundle);
  return bundles.filter(
    (bundle) =>
      bundle.receipt.requested_scope.state_code === stateCode &&
      Date.parse(bundle.receipt.finished_at) <= cutoff,
  );
}
