import type { EvidenceAssertion, FreshnessStatus } from "@/lib/research/types";

const DAY_MS = 86_400_000;

function dateTimestamp(value: string | undefined) {
  if (!value) {
    return undefined;
  }
  const normalized = /^\d{4}$/.test(value)
    ? `${value}-01-01`
    : /^\d{4}-\d{2}$/.test(value)
      ? `${value}-01`
      : value;
  const timestamp = Date.parse(normalized);
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

export function evidenceFreshnessStatus(
  evidence: EvidenceAssertion[],
  generatedAt: string,
): FreshnessStatus {
  const latestObservation = evidence
    .map((entry) => dateTimestamp(entry.observedAt))
    .filter((value): value is number => value !== undefined)
    .sort((left, right) => right - left)[0];
  const generatedTimestamp = dateTimestamp(generatedAt);
  if (latestObservation === undefined || generatedTimestamp === undefined) {
    return "undated";
  }
  const ageDays = Math.max(0, (generatedTimestamp - latestObservation) / DAY_MS);
  if (ageDays <= 365) {
    return "current";
  }
  if (ageDays <= 730) {
    return "aging";
  }
  return "stale";
}
