import type { ImmutableResearchRunBundle } from "@/lib/research/types";
import {
  assertImmutableRunStateConsistency,
  selectImmutableResearchRunsForState,
} from "@/lib/research/state-run-selection";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(label: string, expected: RegExp, run: () => unknown) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expected.test(message), `${label} failed with an unexpected message: ${message}`);
    return;
  }
  throw new Error(`${label} unexpectedly passed.`);
}

function fixture(
  runId: string,
  stateCode: string,
  countyFips: string,
  finishedAt = "2026-07-15T12:00:00.000Z",
) {
  return {
    directory: runId,
    receipt: {
      run_id: runId,
      finished_at: finishedAt,
      requested_scope: {
        state_code: stateCode,
        pair_keys: [`${countyFips}:cirsium-arvense`],
      },
    },
    assertions: [{ eventId: `${runId}-assertion`, state_code: stateCode }],
    reviews: [{ eventId: `${runId}-review`, state_code: stateCode }],
    rejections: [
      {
        rejection_id: `${runId}-rejection`,
        normalized_target: { state_code: stateCode },
      },
    ],
    outcomes: [{ outcome_id: `${runId}-outcome`, state_code: stateCode }],
  } as unknown as ImmutableResearchRunBundle;
}

const alabama = fixture("alabama-run", "AL", "01001");
const alaska = fixture("alaska-run", "AK", "02020");
const futureAlaska = fixture(
  "future-alaska-run",
  "AK",
  "02020",
  "2026-07-16T00:00:00.000Z",
);
const mixed = [alabama, alaska, futureAlaska];

assertImmutableRunStateConsistency(alabama);
assertImmutableRunStateConsistency(alaska);
assert(
  selectImmutableResearchRunsForState(mixed, "AL", "2026-07-15").map((entry) => entry.directory).join(",") ===
    "alabama-run",
  "Alabama selection included a foreign-state run.",
);
assert(
  selectImmutableResearchRunsForState(mixed, "AK", "2026-07-15").map((entry) => entry.directory).join(",") ===
    "alaska-run",
  "Alaska selection included Alabama or future evidence.",
);

const mismatchedChild = fixture("mismatched-child", "AK", "02020");
mismatchedChild.outcomes[0]!.state_code = "AL";
expectFailure("child state mismatch", /outcome .* disagrees with receipt state/, () =>
  assertImmutableRunStateConsistency(mismatchedChild),
);

const retiredAlaska = fixture("retired-alaska", "AK", "02261");
expectFailure("retired Alaska geography", /inactive or foreign geography 02261/, () =>
  assertImmutableRunStateConsistency(retiredAlaska),
);

console.log(
  JSON.stringify(
    {
      mixedStateSelection: "pass",
      alabamaRunsSelected: 1,
      alaskaRunsSelected: 1,
      futureRunsExcluded: 1,
      mismatchedChildRejected: true,
      retiredAlaskaGeographyRejected: true,
    },
    null,
    2,
  ),
);
