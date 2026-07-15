import { readFileSync } from "node:fs";
import path from "node:path";

import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import type { ResearchSourceRegistry } from "@/lib/research/types";
import { listImmutableResearchRuns, sha256 } from "@/lib/research/run-files";
import { validateResearchRunInMemory } from "@/lib/research/validate-run";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(action: () => void, label: string) {
  let failed = false;
  try {
    action();
  } catch {
    failed = true;
  }
  assert(failed, `${label} unexpectedly passed prepublication validation.`);
}

const root = process.cwd();
const bundle = listImmutableResearchRuns(root)[0];
assert(bundle, "The research run validator fixture is missing.");
const registry = JSON.parse(
  readFileSync(path.join(root, "src/data/research/source-registry.json"), "utf8"),
) as ResearchSourceRegistry;
const source = registry.sources.find((entry) => entry.id === bundle.receipt.source_id);
assert(source, "The research run validator source fixture is missing.");
const outputContents = new Map(
  ["assertions.ndjson", "reviews.ndjson", "rejections.ndjson", "outcomes.ndjson"].map(
    (filename) => [
      filename,
      readFileSync(path.join(bundle.directory, filename), "utf8"),
    ],
  ),
);
const baseResult: SourceAdapterResult = {
  completedAt: bundle.receipt.finished_at,
  assertions: bundle.assertions,
  reviews: bundle.reviews,
  rejections: bundle.rejections,
  outcomes: bundle.outcomes,
  artifacts: [],
  upstreamRequests: [],
  candidateRecordCount: bundle.receipt.counts.candidate_records,
  duplicateRecordCount: bundle.receipt.counts.duplicate_records,
  errors: bundle.receipt.errors,
  warnings: bundle.receipt.source_warnings,
};
const validate = (
  result: SourceAdapterResult,
  sourceOverride = source,
  receiptOverride = bundle.receipt,
  outputOverride = outputContents,
) =>
  validateResearchRunInMemory({
    root,
    sourceId: bundle.receipt.source_id,
    source: sourceOverride,
    stateCode: "AL",
    runId: bundle.receipt.run_id,
    requestedPairKeys: bundle.receipt.requested_scope.pair_keys,
    result,
    receipt: receiptOverride,
    outputContents: outputOverride,
  });

validate(baseResult);
expectFailure(
  () => validate({ ...baseResult, assertions: [...baseResult.assertions, baseResult.assertions[0]] }),
  "Duplicate assertion ID",
);
expectFailure(
  () =>
    validate({
      ...baseResult,
      outcomes: [
        {
          ...baseResult.outcomes[0],
          assertion_event_ids: ["unknown-assertion"],
        },
        ...baseResult.outcomes.slice(1),
      ],
    }),
  "Unknown outcome assertion reference",
);
expectFailure(
  () =>
    validate({
      ...baseResult,
      assertions: [
        { ...baseResult.assertions[0], source_url: "not-a-url" },
        ...baseResult.assertions.slice(1),
      ],
    }),
  "Schema-invalid source URL",
);
expectFailure(
  () =>
    validate({
      ...baseResult,
      outcomes: [
        { ...baseResult.outcomes[0], state_code: "TX" },
        ...baseResult.outcomes.slice(1),
      ],
    }),
  "State scope mismatch",
);
expectFailure(
  () =>
    validate(baseResult, {
      ...source,
      researchAdapter: {
        ...source.researchAdapter!,
        publicationReviewGate: "human-approved",
      },
    }),
  "Below-gate publication review",
);
expectFailure(
  () =>
    validate(
      baseResult,
      source,
      { ...bundle.receipt, parameter_hash: "0".repeat(64) },
    ),
  "Parameter hash mismatch",
);

const pendingOutputContents = new Map(outputContents);
pendingOutputContents.set("reviews.ndjson", "\n");
const pendingReceipt = structuredClone(bundle.receipt);
pendingReceipt.counts.review_events = 0;
const pendingReviewReference = pendingReceipt.outputs.find((reference) =>
  reference.path.endsWith("/reviews.ndjson"),
);
assert(pendingReviewReference, "The pending-review output reference is missing.");
pendingReviewReference.bytes = 1;
pendingReviewReference.sha256 = sha256("\n");
validate(
  { ...baseResult, reviews: [] },
  source,
  pendingReceipt,
  pendingOutputContents,
);

console.log(
  JSON.stringify(
    {
      validBundleAccepted: true,
      duplicateIdRejected: true,
      badCrossReferenceRejected: true,
      schemaViolationRejected: true,
      stateScopeMismatchRejected: true,
      belowGateReviewRejected: true,
      parameterHashMismatchRejected: true,
      unreviewedAssertionsPreserved: true,
    },
    null,
    2,
  ),
);
