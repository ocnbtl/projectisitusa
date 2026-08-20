export const RESEARCH_PROMOTION_POLICY_VERSION = 1 as const;
export const RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS = 24 * 7;
export const RESEARCH_PROMOTION_MINIMUM_INTERVAL_MS =
  RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS * 60 * 60 * 1000;
export const RESEARCH_ROLLBACK_RELEASE_COUNT = 2;

export interface ResearchPublicationPointer {
  schemaVersion: 1;
  kind: "isitusa-research-projection-pointer";
  releaseId: string;
  releaseManifestKey: string;
  releaseManifestSha256: string;
  sourceCommit: string;
  promotedAt: string;
}

export interface ResearchPromotionCadenceDecision {
  policyVersion: typeof RESEARCH_PROMOTION_POLICY_VERSION;
  minimumIntervalHours: typeof RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS;
  previousReleaseId: string | null;
  previousPromotedAt: string | null;
  nextScheduledPromotionAt: string | null;
  overrideUsed: boolean;
  overrideReason: string | null;
}

export function validateResearchPublicationPointer(value: unknown): ResearchPublicationPointer {
  if (!value || typeof value !== "object") {
    throw new Error("Research publication pointer must be an object.");
  }
  const pointer = value as ResearchPublicationPointer;
  if (
    pointer.schemaVersion !== 1 ||
    pointer.kind !== "isitusa-research-projection-pointer" ||
    !/^research-[0-9a-f]{12}-[0-9a-f]{16}$/u.test(pointer.releaseId) ||
    pointer.releaseManifestKey !== `releases/${pointer.releaseId}/manifest.json` ||
    !/^[0-9a-f]{64}$/u.test(pointer.releaseManifestSha256) ||
    !/^[0-9a-f]{40}$/u.test(pointer.sourceCommit) ||
    !Number.isFinite(Date.parse(pointer.promotedAt))
  ) {
    throw new Error("Research publication pointer identity is invalid.");
  }
  return pointer;
}

function normalizeOverrideReason(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const normalized = value.trim();
  if (normalized.length < 24 || normalized.length > 500 || /[\r\n]/u.test(normalized)) {
    throw new Error("Promotion cadence override reason must be a single line from 24 through 500 characters.");
  }
  return normalized;
}

export function evaluateResearchPromotionCadence(input: {
  now: Date;
  previousPointer: ResearchPublicationPointer | null;
  overrideReason?: string | null;
}): ResearchPromotionCadenceDecision {
  if (!Number.isFinite(input.now.getTime())) throw new Error("Promotion evaluation time must be valid.");
  const overrideReason = normalizeOverrideReason(input.overrideReason);
  if (!input.previousPointer) {
    return {
      policyVersion: RESEARCH_PROMOTION_POLICY_VERSION,
      minimumIntervalHours: RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS,
      previousReleaseId: null,
      previousPromotedAt: null,
      nextScheduledPromotionAt: null,
      overrideUsed: false,
      overrideReason: null,
    };
  }

  const previousPromotedAtMs = Date.parse(input.previousPointer.promotedAt);
  const elapsedMs = input.now.getTime() - previousPromotedAtMs;
  if (elapsedMs < 0) throw new Error("Existing R2 promotion timestamp is in the future.");
  const nextScheduledPromotionAt = new Date(
    previousPromotedAtMs + RESEARCH_PROMOTION_MINIMUM_INTERVAL_MS,
  ).toISOString();
  if (elapsedMs < RESEARCH_PROMOTION_MINIMUM_INTERVAL_MS && !overrideReason) {
    throw new Error(
      `Research-data promotion cadence blocks another pointer update until ${nextScheduledPromotionAt}. ` +
      "Retain validated work locally or supply a specific --cadence-override-reason for an urgent correction.",
    );
  }

  return {
    policyVersion: RESEARCH_PROMOTION_POLICY_VERSION,
    minimumIntervalHours: RESEARCH_PROMOTION_MINIMUM_INTERVAL_HOURS,
    previousReleaseId: input.previousPointer.releaseId,
    previousPromotedAt: input.previousPointer.promotedAt,
    nextScheduledPromotionAt,
    overrideUsed: elapsedMs < RESEARCH_PROMOTION_MINIMUM_INTERVAL_MS,
    overrideReason,
  };
}
