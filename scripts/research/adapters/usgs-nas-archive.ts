import { createHash } from "node:crypto";

import {
  USGS_NAS_ADAPTER_ID,
  USGS_NAS_ADAPTER_VERSION,
  USGS_NAS_ACCEPTED_OCCURRENCE_STATUSES,
  USGS_NAS_RESOURCE_URL,
  USGS_NAS_SOURCE_ID,
  type NasArchiveOccurrence,
  type NationalNasReconciliation,
  canonicalBinomial,
  compareText,
} from "../national-usgs-nas-common";

import type {
  EvidenceReviewEvent,
  RejectionReasonCode,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import type { SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import { resolveCountyEquivalent } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export type NasRequestedPair = {
  countyFips: string;
  countyName: string;
  countyLegalName: string;
  stateCode: string;
  stateName: string;
  speciesId: string;
  scientificName: string;
};

export type NasReplayResult = SourceAdapterResult & {
  reconciliation: NationalNasReconciliation;
  selectedRowsSha256: string;
};

type RejectionCategory =
  | "duplicate-record-id"
  | "blank-status"
  | "unsupported-status"
  | "missing-geography"
  | "retired-geography"
  | "unknown-or-ambiguous-geography"
  | "invalid-identity";

type RejectedCandidate = {
  category: RejectionCategory;
  reason: RejectionReasonCode;
  countyFips: string | null;
  candidateGeography: string | null;
  detail: string;
  record: NasArchiveOccurrence;
  blocksCountyCompletion: boolean;
  blockedCountyFips: string[] | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function pairKey(pair: { countyFips: string; speciesId: string }) {
  return `${pair.countyFips}:${pair.speciesId}`;
}

function canonicalText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ");
}

function reducedRecord(record: NasArchiveOccurrence) {
  return {
    id: record.id,
    modified: record.modified,
    references: record.references,
    basisOfRecord: record.basisOfRecord,
    occurrenceID: record.occurrenceID,
    catalogNumber: record.catalogNumber,
    establishmentMeans: record.establishmentMeans,
    occurrenceStatus: record.occurrenceStatus,
    disposition: record.disposition,
    associatedReferences: record.associatedReferences,
    samplingProtocol: record.samplingProtocol,
    eventDate: record.eventDate,
    countryCode: record.countryCode,
    stateProvince: record.stateProvince,
    county: record.county,
    locality: record.locality,
    decimalLatitude: record.decimalLatitude,
    decimalLongitude: record.decimalLongitude,
    geodeticDatum: record.geodeticDatum,
    georeferenceProtocol: record.georeferenceProtocol,
    georeferenceRemarks: record.georeferenceRemarks,
    taxonID: record.taxonID,
    scientificName: record.scientificName,
    kingdom: record.kingdom,
    order: record.order,
    family: record.family,
    genus: record.genus,
    specificEpithet: record.specificEpithet,
    scientificNameAuthorship: record.scientificNameAuthorship,
    vernacularName: record.vernacularName,
  };
}

function recordIdentity(record: NasArchiveOccurrence) {
  return record.occurrenceID.trim() || record.id.trim();
}

function compareRecords(left: NasArchiveOccurrence, right: NasArchiveOccurrence) {
  return compareText(recordIdentity(left), recordIdentity(right)) ||
    compareText(stableJson(reducedRecord(left)), stableJson(reducedRecord(right)));
}

function reject(
  category: RejectionCategory,
  reason: RejectionReasonCode,
  record: NasArchiveOccurrence,
  detail: string,
  countyFips: string | null = null,
  blocksCountyCompletion = false,
  blockedCountyFips: string[] | null = null,
): RejectedCandidate {
  return {
    category,
    reason,
    countyFips,
    candidateGeography: record.county.trim() || null,
    detail,
    record,
    blocksCountyCompletion,
    blockedCountyFips,
  };
}

function classifyRecord(input: {
  record: NasArchiveOccurrence;
  pair: NasRequestedPair;
  acceptedStatuses: ReadonlySet<string>;
  seenRecordIds: Set<string>;
}):
  | { status: "accepted"; countyFips: string; record: NasArchiveOccurrence }
  | { status: "rejected"; rejection: RejectedCandidate } {
  const { record, pair, acceptedStatuses, seenRecordIds } = input;
  const occurrenceStatus = canonicalText(record.occurrenceStatus);
  const hasAcceptedPositiveStatus = acceptedStatuses.has(occurrenceStatus);
  const identity = recordIdentity(record);
  if (!identity || !record.id.trim() || !record.occurrenceID.trim() || record.id.trim() !== record.occurrenceID.trim()) {
    const isScopeCandidate =
      record.countryCode === "US" &&
      canonicalBinomial(record.scientificName) === canonicalBinomial(pair.scientificName) &&
      record.basisOfRecord === "Occurrence" &&
      (!record.stateProvince.trim() || record.stateProvince === pair.stateCode);
    const blocksCountyCompletion = isScopeCandidate && hasAcceptedPositiveStatus;
    const resolution = blocksCountyCompletion && record.stateProvince === pair.stateCode && record.county.trim()
      ? resolveCountyEquivalent({
          stateCode: pair.stateCode,
          countyName: record.county,
          sourceId: USGS_NAS_SOURCE_ID,
        })
      : null;
    const countyFips = resolution?.status === "resolved" ? resolution.county.countyFips : null;
    const blockedCountyFips = resolution?.status === "resolved"
      ? [resolution.county.countyFips]
      : resolution?.reasonCode === "retired-geography"
        ? resolution.successorFips ?? null
        : resolution?.status === "rejected"
          ? resolution.candidateFips ?? null
          : null;
    return {
      status: "rejected",
      rejection: reject(
        "invalid-identity",
        "record-failed",
        record,
        "The Darwin Core row lacks one stable matching id and occurrenceID value.",
        countyFips,
        blocksCountyCompletion,
        blockedCountyFips,
      ),
    };
  }
  if (seenRecordIds.has(identity)) {
    return {
      status: "rejected",
      rejection: reject(
        "duplicate-record-id",
        "duplicate",
        record,
        `The retained archive repeats occurrence identity ${identity}.`,
      ),
    };
  }
  seenRecordIds.add(identity);
  if (
    record.countryCode !== "US" ||
    canonicalBinomial(record.scientificName) !== canonicalBinomial(pair.scientificName) ||
    record.basisOfRecord !== "Occurrence"
  ) {
    return {
      status: "rejected",
      rejection: reject(
        "invalid-identity",
        "source-contradiction",
        record,
        "Country, state, taxon, or basisOfRecord does not match the bounded archive screen.",
      ),
    };
  }
  if (record.stateProvince !== pair.stateCode) {
    return {
      status: "rejected",
      rejection: reject(
        record.stateProvince.trim() ? "invalid-identity" : "missing-geography",
        record.stateProvince.trim() ? "outside-scope" : "geography-missing",
        record,
        record.stateProvince.trim()
          ? "The archive row names a different state than the bounded screen."
          : "The archive row lacks explicit state geography and cannot be allocated to a county equivalent.",
        null,
        !record.stateProvince.trim() && hasAcceptedPositiveStatus,
      ),
    };
  }
  if (!record.county.trim()) {
    return {
      status: "rejected",
      rejection: reject(
        "missing-geography",
        "geography-missing",
        record,
        "The archive row lacks explicit county-equivalent text. Coordinates were retained but not used.",
        null,
        hasAcceptedPositiveStatus,
      ),
    };
  }
  const resolution = resolveCountyEquivalent({
    stateCode: pair.stateCode,
    countyName: record.county,
    sourceId: USGS_NAS_SOURCE_ID,
  });
  if (resolution.status !== "resolved") {
    if (resolution.reasonCode === "retired-geography") {
      return {
        status: "rejected",
        rejection: reject(
          "retired-geography",
          "retired-geography",
          record,
          `${resolution.detail} No successor assignment was made.`,
          null,
          hasAcceptedPositiveStatus,
          resolution.successorFips ?? null,
        ),
      };
    }
    return {
      status: "rejected",
      rejection: reject(
        "unknown-or-ambiguous-geography",
        "geography-ambiguous",
        record,
        resolution.detail,
        null,
        hasAcceptedPositiveStatus,
        resolution.candidateFips ?? null,
      ),
    };
  }
  if (!occurrenceStatus) {
    return {
      status: "rejected",
      rejection: reject(
        "blank-status",
        "record-failed",
        record,
        "The NAS population-status field is blank and does not pass the bounded positive-evidence gate.",
        resolution.county.countyFips,
      ),
    };
  }
  if (!acceptedStatuses.has(occurrenceStatus)) {
    return {
      status: "rejected",
      rejection: reject(
        "unsupported-status",
        "unsupported-claim-type",
        record,
        `NAS population status ${record.occurrenceStatus} is outside the plan's accepted positive statuses.`,
        resolution.county.countyFips,
      ),
    };
  }
  return { status: "accepted", countyFips: resolution.county.countyFips, record };
}

function rejectionRecord(
  context: SourceAdapterContext,
  pair: NasRequestedPair,
  category: RejectionCategory,
  candidates: RejectedCandidate[],
  createdAt: string,
): ResearchRejectionRecord {
  const identities = candidates.map((entry) => recordIdentity(entry.record) || "missing-id").sort(compareText);
  const countyFips = candidates[0]?.countyFips ?? null;
  const candidateGeographies = [...new Set(candidates.map((entry) => entry.candidateGeography).filter(Boolean))].sort() as string[];
  const reason = candidates[0]!.reason;
  assert(candidates.every((entry) => entry.reason === reason && entry.countyFips === countyFips), "Rejection group is inconsistent.");
  assert(
    candidates.every((entry) => entry.blocksCountyCompletion === candidates[0]!.blocksCountyCompletion),
    "Rejection group mixes blocking and nonblocking candidates.",
  );
  assert(
    candidates.every(
      (entry) => stableJson(entry.blockedCountyFips) === stableJson(candidates[0]!.blockedCountyFips),
    ),
    "Rejection group mixes blocker geography scopes.",
  );
  const rejectionId = contentId("usgs-nas-rejection", {
    runId: context.runId,
    speciesId: pair.speciesId,
    stateCode: pair.stateCode,
    category,
    reason,
    countyFips,
    candidateGeographies,
    blocksCountyCompletion: candidates[0]!.blocksCountyCompletion,
    blockedCountyFips: candidates[0]!.blockedCountyFips,
    identities,
  });
  return {
    schemaVersion: 1,
    rejection_id: rejectionId,
    created_at: createdAt,
    actor_type: "adapter",
    actor_id: `${USGS_NAS_ADAPTER_ID}@${USGS_NAS_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: USGS_NAS_SOURCE_ID,
    candidate_locator: `archive-record-group:${sha256(`${identities.join("\n")}\n`)}`,
    candidate_taxon: pair.scientificName,
    candidate_geography: candidateGeographies.length === 1 ? candidateGeographies[0] : null,
    normalized_target: {
      state_code: pair.stateCode,
      species_id: pair.speciesId,
      county_fips: countyFips,
    },
    reason_code: reason,
    supporting_notes: [
      `Rejected candidate record count: ${candidates.length}.`,
      candidates[0]!.detail,
      candidates[0]!.blocksCountyCompletion
        ? candidates[0]!.blockedCountyFips?.length
          ? `This candidate blocks complete allocation for county equivalents ${candidates[0]!.blockedCountyFips.join(", ")} until its positive geography or identity is resolved.`
          : "This candidate blocks complete statewide county allocation until its positive geography or identity is resolved."
        : "",
      `Candidate identities, first five: ${identities.slice(0, 5).join(", ")}.`,
      candidateGeographies.length > 1
        ? `Candidate county values: ${candidateGeographies.join(", ")}.`
        : "",
    ].filter(Boolean),
  };
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  pair: NasRequestedPair;
  records: NasArchiveOccurrence[];
  retrievedAt: string;
}) {
  const { context, pair, records, retrievedAt } = input;
  const sortedRecords = [...records].sort(compareRecords);
  const normalizedPayloadHash = sha256(stableJson(sortedRecords.map(reducedRecord)));
  const identities = sortedRecords.map(recordIdentity);
  const eventId = contentId("usgs-nas-assertion", {
    runId: context.runId,
    pair: pairKey(pair),
    identities,
    normalizedPayloadHash,
  });
  const sourceDates = sortedRecords.map((entry) => entry.eventDate).filter(Boolean).sort(compareText);
  const sourceTaxonKeys = [...new Set(sortedRecords.map((entry) => entry.taxonID).filter(Boolean))].sort(compareText);
  const sourceCounties = [...new Set(sortedRecords.map((entry) => entry.county.trim()))].sort(compareText);
  const sourceUrl = sortedRecords
    .map((entry) => entry.references.trim())
    .find((value) => /^https?:\/\//.test(value)) ?? USGS_NAS_RESOURCE_URL;
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: retrievedAt,
    actor_type: "adapter",
    actor_id: `${USGS_NAS_ADAPTER_ID}@${USGS_NAS_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: USGS_NAS_SOURCE_ID,
    state_code: pair.stateCode,
    county_fips: pair.countyFips,
    species_id: pair.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "county",
    source_record_id: `usgs-nas-county-group:${sha256(`${identities.join("\n")}\n`)}`,
    source_url: sourceUrl,
    source_record_date: sourceDates.at(-1) ?? null,
    retrieved_at: retrievedAt,
    taxon_match: {
      method: "Exact canonical binomial agreement across the committed state plan, Project Isitusa catalog, and retained Darwin Core rows",
      target_scientific_name: pair.scientificName,
      source_scientific_name: sortedRecords[0]!.scientificName,
      source_taxon_key: sourceTaxonKeys.length === 1 ? sourceTaxonKeys[0] : null,
    },
    geography_match: {
      method: "Exact NAS state code and explicit county-equivalent name resolved to the active registry without coordinate inference",
      source_state: pair.stateCode,
      source_county: sourceCounties.join(" | "),
      county_fips: pair.countyFips,
    },
    temporal_scope: sourceDates.length
      ? `Historical NAS occurrence dates through ${sourceDates.at(-1)}.`
      : "Historical NAS occurrence records without a usable event date.",
    spatial_scope: `One or more retained USGS NAS occurrence records explicitly name ${pair.countyLegalName}, ${pair.stateName}. This does not imply current countywide distribution or abundance.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "USGS NAS records are provisional and vary in accuracy, scale, completeness, population status, and temporal currency.",
      "The assertion aggregates qualifying occurrence rows for one county-species pair and preserves every raw row in the immutable archive.",
      "Archive silence never supports absence or non-detection.",
      "Coordinates were retained as lineage but were not used to determine a county equivalent.",
    ],
    notes: [
      `Qualifying retained record count: ${sortedRecords.length}.`,
      `Accepted NAS statuses: ${[...new Set(sortedRecords.map((entry) => canonicalText(entry.occurrenceStatus)))].sort(compareText).join(", ")}.`,
      `Occurrence identities, first five: ${identities.slice(0, 5).join(", ")}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("usgs-nas-review", { assertionEventId: eventId, decision: "accepted" }),
    event_type: "evidence.reviewed",
    created_at: retrievedAt,
    actor_type: "adapter",
    actor_id: `${USGS_NAS_ADAPTER_ID}@${USGS_NAS_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: USGS_NAS_SOURCE_ID,
    state_code: pair.stateCode,
    county_fips: pair.countyFips,
    species_id: pair.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "versioned-official-national-archive",
      "exact-canonical-binomial",
      "exact-active-county-equivalent",
      "explicit-positive-nas-status",
    ],
    notes: [
      "Every grouped row passed the registered USGS NAS taxon, state, county, identity, basis, and status publication gate.",
      "This review publishes recorded-present occurrence evidence only.",
    ],
  };
  return { assertion, review };
}

function outcome(input: {
  context: SourceAdapterContext;
  pair: NasRequestedPair;
  recordedAt: string;
  assertionIds: string[];
  rejectionIds: string[];
  blockingRejectionIds: string[];
  archiveUrl: string;
}): ResearchPairOutcome {
  const status = input.assertionIds.length > 0
    ? "evidence-found"
    : input.blockingRejectionIds.length > 0
      ? "blocked"
      : "no-qualifying-evidence";
  const rejectionIds = [...new Set([...input.rejectionIds, ...input.blockingRejectionIds])].sort(compareText);
  return {
    schemaVersion: 1,
    outcome_id: contentId("usgs-nas-outcome", {
      runId: input.context.runId,
      pair: pairKey(input.pair),
      status,
      assertionIds: input.assertionIds,
      rejectionIds,
    }),
    run_id: input.context.runId,
    source_id: USGS_NAS_SOURCE_ID,
    state_code: input.pair.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    status,
    scope_complete: status !== "blocked",
    recorded_at: input.recordedAt,
    assertion_event_ids: [...input.assertionIds].sort(compareText),
    rejection_ids: rejectionIds,
    query_urls: [input.archiveUrl],
    notes: status === "blocked"
      ? [
          "The archive screen found a positive-status candidate whose geography or identity cannot be allocated safely.",
          "This pair remains blocked rather than being converted to a complete no-qualifying-evidence outcome.",
        ]
      : status === "evidence-found"
        ? ["The complete versioned archive screen found qualifying recorded-present evidence for this pair."]
        : [
          "The complete applicable archive screen found no qualifying evidence for this pair.",
          "This research result is not verified absence and is not a survey non-detection.",
          ],
  };
}

export function replayNationalNasScreen(input: {
  context: SourceAdapterContext;
  requestedPairs: NasRequestedPair[];
  records: NasArchiveOccurrence[];
  acceptedOccurrenceStatuses: string[];
  completedAt: string;
  archiveUrl: string;
}): NasReplayResult {
  const { context, requestedPairs, records, completedAt, archiveUrl } = input;
  assert(context.sourceId === USGS_NAS_SOURCE_ID, "USGS NAS replay received the wrong source.");
  assert(requestedPairs.length > 0, "USGS NAS replay requires requested pairs.");
  const speciesIds = new Set(requestedPairs.map((entry) => entry.speciesId));
  const scientificNames = new Set(requestedPairs.map((entry) => entry.scientificName));
  const stateCodes = new Set(requestedPairs.map((entry) => entry.stateCode));
  assert(speciesIds.size === 1 && scientificNames.size === 1 && stateCodes.size === 1, "USGS NAS replay must contain one state-species screen.");
  assert(stateCodes.has(context.stateCode), "USGS NAS replay state disagrees with context.");
  const requestedByFips = new Map(requestedPairs.map((entry) => [entry.countyFips, entry]));
  assert(requestedByFips.size === requestedPairs.length, "USGS NAS requested pairs contain duplicate counties.");
  for (const pair of requestedPairs) {
    const resolution = resolveCountyEquivalent({ stateCode: pair.stateCode, countyFips: pair.countyFips });
    assert(resolution.status === "resolved", `Requested pair ${pairKey(pair)} is not active geography.`);
    assert(pairKey(pair) === `${pair.countyFips}:${[...speciesIds][0]}`, "USGS NAS requested pair species changed.");
  }
  const acceptedStatuses = new Set(input.acceptedOccurrenceStatuses.map(canonicalText));
  assert(acceptedStatuses.size === input.acceptedOccurrenceStatuses.length, "USGS NAS accepted statuses contain duplicates.");
  assert(
    stableJson([...acceptedStatuses].sort(compareText)) ===
      stableJson([...USGS_NAS_ACCEPTED_OCCURRENCE_STATUSES]),
    "USGS NAS replay received an unapproved positive occurrence status.",
  );
  const pairTemplate = requestedPairs[0]!;
  const seenRecordIds = new Set<string>();
  const acceptedByCounty = new Map<string, NasArchiveOccurrence[]>();
  const rejected: RejectedCandidate[] = [];
  const recordsByIdentity = new Map<string, NasArchiveOccurrence[]>();
  for (const record of records) {
    const identity = recordIdentity(record);
    if (!identity || !record.id.trim() || record.id.trim() !== record.occurrenceID.trim()) continue;
    const values = recordsByIdentity.get(identity) ?? [];
    values.push(record);
    recordsByIdentity.set(identity, values);
  }
  const conflictingDuplicateIds = new Map(
    [...recordsByIdentity.entries()]
      .filter(([, values]) => new Set(values.map((record) => stableJson(record))).size > 1)
      .map(([identity, values]) => [
        identity,
        values.some((record) => acceptedStatuses.has(canonicalText(record.occurrenceStatus))),
      ] as const),
  );
  for (const record of [...records].sort(compareRecords)) {
    const identity = recordIdentity(record);
    if (conflictingDuplicateIds.has(identity)) {
      const resolution = record.county.trim()
        ? resolveCountyEquivalent({
            stateCode: pairTemplate.stateCode,
            countyName: record.county,
            sourceId: USGS_NAS_SOURCE_ID,
          })
        : null;
      rejected.push(reject(
        "duplicate-record-id",
        "source-contradiction",
        record,
        `Occurrence identity ${identity} has conflicting Darwin Core payloads in the same archive. No variant was published.`,
        resolution?.status === "resolved" ? resolution.county.countyFips : null,
        conflictingDuplicateIds.get(identity)!,
        resolution?.status === "resolved" ? [resolution.county.countyFips] : null,
      ));
      continue;
    }
    const classification = classifyRecord({ record, pair: pairTemplate, acceptedStatuses, seenRecordIds });
    if (classification.status === "accepted") {
      const values = acceptedByCounty.get(classification.countyFips) ?? [];
      values.push(classification.record);
      acceptedByCounty.set(classification.countyFips, values);
    } else {
      rejected.push(classification.rejection);
    }
  }

  const rejectionGroups = new Map<string, RejectedCandidate[]>();
  for (const candidate of rejected) {
    const key = [
      candidate.category,
      candidate.reason,
      candidate.countyFips ?? "",
      candidate.candidateGeography ?? "",
      candidate.blocksCountyCompletion ? "blocking" : "nonblocking",
      stableJson(candidate.blockedCountyFips),
    ].join("|");
    const values = rejectionGroups.get(key) ?? [];
    values.push(candidate);
    rejectionGroups.set(key, values);
  }
  const rejectionEntries = [...rejectionGroups.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([, candidates]) => ({
      record: rejectionRecord(context, pairTemplate, candidates[0]!.category, candidates, completedAt),
      blocksCountyCompletion: candidates[0]!.blocksCountyCompletion,
      blockedCountyFips: candidates[0]!.blockedCountyFips,
    }));
  const rejections = rejectionEntries.map((entry) => entry.record);

  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  for (const [countyFips, acceptedRecords] of [...acceptedByCounty.entries()].sort(([left], [right]) => compareText(left, right))) {
    const pair = requestedByFips.get(countyFips);
    assert(pair, `USGS NAS accepted record resolved outside requested county ${countyFips}.`);
    const normalized = assertionAndReview({ context, pair, records: acceptedRecords, retrievedAt: completedAt });
    assertions.push(normalized.assertion);
    reviews.push(normalized.review);
  }
  const assertionByPair = new Map(assertions.map((entry) => [pairKey({ countyFips: entry.county_fips, speciesId: entry.species_id }), entry]));
  const rejectionIdsByCounty = new Map<string, string[]>();
  const globalBlockingRejectionIds: string[] = [];
  const blockingRejectionIdsByCounty = new Map<string, string[]>();
  for (const entry of rejectionEntries) {
    const rejection = entry.record;
    const countyFips = rejection.normalized_target.county_fips;
    if (countyFips) {
      const values = rejectionIdsByCounty.get(countyFips) ?? [];
      values.push(rejection.rejection_id);
      rejectionIdsByCounty.set(countyFips, values);
    }
    if (entry.blocksCountyCompletion) {
      if (entry.blockedCountyFips?.length) {
        for (const blockedCountyFips of entry.blockedCountyFips) {
          const blocking = blockingRejectionIdsByCounty.get(blockedCountyFips) ?? [];
          blocking.push(rejection.rejection_id);
          blockingRejectionIdsByCounty.set(blockedCountyFips, blocking);
        }
      } else {
        globalBlockingRejectionIds.push(rejection.rejection_id);
      }
    }
  }
  const outcomes = [...requestedPairs]
    .sort((left, right) => compareText(left.countyFips, right.countyFips))
    .map((pair) => {
      const assertion = assertionByPair.get(pairKey(pair));
      return outcome({
        context,
        pair,
        recordedAt: completedAt,
        assertionIds: assertion ? [assertion.eventId] : [],
        rejectionIds: rejectionIdsByCounty.get(pair.countyFips) ?? [],
        blockingRejectionIds: [
          ...globalBlockingRejectionIds,
          ...(blockingRejectionIdsByCounty.get(pair.countyFips) ?? []),
        ],
        archiveUrl,
      });
    });
  const categoryCounts = new Map<RejectionCategory, number>();
  for (const entry of rejected) {
    categoryCounts.set(entry.category, (categoryCounts.get(entry.category) ?? 0) + 1);
  }
  const acceptedRecordCount = [...acceptedByCounty.values()].reduce((sum, values) => sum + values.length, 0);
  const reconciliation: NationalNasReconciliation = {
    selected_records: records.length,
    accepted_records: acceptedRecordCount,
    rejected_candidate_records: rejected.length,
    assertion_pairs: assertions.length,
    rejection_events: rejections.length,
    duplicate_record_ids: categoryCounts.get("duplicate-record-id") ?? 0,
    blank_status_records: categoryCounts.get("blank-status") ?? 0,
    unsupported_status_records: categoryCounts.get("unsupported-status") ?? 0,
    missing_geography_records: categoryCounts.get("missing-geography") ?? 0,
    retired_geography_records: categoryCounts.get("retired-geography") ?? 0,
    unknown_or_ambiguous_geography_records: categoryCounts.get("unknown-or-ambiguous-geography") ?? 0,
    invalid_identity_records: categoryCounts.get("invalid-identity") ?? 0,
    blocking_candidate_records: rejected.filter((entry) => entry.blocksCountyCompletion).length,
    blocked_outcome_pairs: outcomes.filter((entry) => entry.status === "blocked").length,
  };
  assert(
    reconciliation.accepted_records + reconciliation.rejected_candidate_records === reconciliation.selected_records,
    "USGS NAS candidate classifications do not reconcile.",
  );
  return {
    completedAt,
    assertions,
    reviews,
    rejections,
    outcomes,
    artifacts: [],
    upstreamRequests: [],
    candidateRecordCount: records.length,
    duplicateRecordCount: reconciliation.duplicate_record_ids,
    errors: [],
    warnings: [
      "USGS NAS is an official national occurrence source, but its records remain provisional and heterogeneous.",
      `Rejected raw candidate records: ${reconciliation.rejected_candidate_records}.`,
      "No archive result was interpreted as verified absence or survey non-detection.",
    ],
    reconciliation,
    selectedRowsSha256: sha256(stableJson([...records].sort(compareRecords).map(reducedRecord))),
  };
}
