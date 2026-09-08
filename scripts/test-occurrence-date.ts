import { evidenceFreshnessStatus } from "@/lib/research/freshness";
import type { EvidenceAssertion } from "@/lib/research/types";
import assert from "node:assert/strict";
import { occurrenceDateBounds as bounds, formatOccurrenceDate as format } from "@/lib/research/occurrence-date";
import { resolveTemporalPairDetermination as resolve } from "@/lib/research/jurisdiction-evidence";
const parent = { id: "fixture", statementType: "officially-eradicated" as const, effectiveAt: "2024-12-18", reaffirmedAt: "2025-11-03", validThrough: "2026-11-03" };
const conflict = (observedAt?: string) => resolve({ presenceEvidence: [{ evidenceId: "fixture", observedAt }], jurisdictionEvidence: [parent], asOf: "2026-09-08" });
for (const date of ["2024", "2024-12", "2024-12-18", "2024-12-01/2024-12-31", "2025", "2024-02-30", "unknown", undefined]) {
  assert.equal(conflict(date).conflict, true, String(date) + " must block a negative if not wholly earlier");
  assert.equal(conflict(date).historicalOccurrenceStatus, "recorded-present");
  assert.equal(conflict(date).compatibilityDisplayStatus, "verified-present");
}
for (const date of ["2023", "2024-11", "2024-12-17", "2024-01-01/2024-12-17", "2024-12-17T23:59:59.999Z"]) {
  assert.equal(conflict(date).conflict, false, date + " is wholly earlier");
  assert.equal(conflict(date).currentDeterminationStatus, "officially-eradicated");
}
for (const date of ["", "0000", "2023-02-29", "2024-13", "2024-02-30", "2024-12-02/2024-12-01", "2024/2025", "2024-12-01/", "2024-12-01T25:00:00Z", "2024-12-01T01:60:00Z", "2024-12-01T01:00:00", "2024-12-01T01:00:00+14:01"]) assert.equal(bounds(date), null, date);
assert.equal(bounds("2024-02")!.end, Date.parse("2024-02-29T23:59:59.999Z"));
assert.equal(bounds("2024")!.end, Date.parse("2024-12-31T23:59:59.999Z"));
assert.equal(bounds("2024-12-18T01:00:00+01:00")!.start, Date.parse("2024-12-18T00:00:00Z"));
assert.equal(format("1983"), "1983");
assert.equal(format("2026-01"), "Jan 2026");
assert.equal(format("2026-01-20/2026-02-09"), "Jan 20, 2026 to Feb 9, 2026");
assert.equal(format("2024-02-30"), "2024-02-30");
assert.equal(format(null), "Not recorded");
assert.equal(evidenceFreshnessStatus([{ observedAt: "2026-01-20/2026-02-09" } as EvidenceAssertion], "2026-09-08"), "current");
assert.equal(evidenceFreshnessStatus([{ observedAt: "2026-02-30/2026-03-01" } as EvidenceAssertion], "2026-09-08"), "undated");
console.log(JSON.stringify({ partialDatesAndIntervalsBlockOverlappingAbsence: true, whollyEarlierPresenceRetained: true, invalidDatesFailClosed: true, sourcePrecisionDisplayed: true }));
