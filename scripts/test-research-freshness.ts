import { evidenceFreshnessStatus } from "@/lib/research/freshness";
import type { EvidenceAssertion } from "@/lib/research/types";

function assertion(input: {
  observedAt?: string;
  reviewedAt?: string;
  accessedAt?: string;
}) {
  return input as EvidenceAssertion;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const generatedAt = "2026-07-15T00:00:00.000Z";

assert(
  evidenceFreshnessStatus([
    assertion({
      observedAt: "2023-04",
      reviewedAt: "2026-07-14T12:00:00.000Z",
      accessedAt: "2026-07-14T12:00:00.000Z",
    }),
  ], generatedAt) === "stale",
  "Recent review or retrieval incorrectly refreshed historical evidence.",
);
assert(
  evidenceFreshnessStatus([
    assertion({ reviewedAt: "2026-07-14T12:00:00.000Z", accessedAt: "2026-07-14T12:00:00.000Z" }),
  ], generatedAt) === "undated",
  "Undated evidence inherited a date from review or retrieval activity.",
);
assert(
  evidenceFreshnessStatus([assertion({ observedAt: "2026-07-01" })], generatedAt) === "current",
  "Recent observed evidence was not current.",
);
assert(
  evidenceFreshnessStatus([assertion({ observedAt: "2025-01-01" })], generatedAt) === "aging",
  "Middle-aged observed evidence was not aging.",
);
assert(
  evidenceFreshnessStatus([
    assertion({ observedAt: "2023-04" }),
    assertion({ observedAt: "2026-07-01" }),
  ], generatedAt) === "current",
  "The latest observed evidence did not control pair freshness.",
);

console.log(JSON.stringify({
  retrievalDoesNotRefreshEvidence: true,
  reviewDoesNotRefreshEvidence: true,
  undatedEvidenceRemainsUndated: true,
  latestObservationControlsFreshness: true,
}, null, 2));
