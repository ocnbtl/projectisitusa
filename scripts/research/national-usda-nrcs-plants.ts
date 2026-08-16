import { createHash } from "node:crypto";
import path from "node:path";

import type {
  EvidenceReviewEvent,
  RejectionReasonCode,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import type { SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import {
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const NRCS_SOURCE_ID = "usda-nrcs-plants" as const;
export const NRCS_ACQUISITION_ACTOR =
  "usda-nrcs-plants-national-acquisition@1.0.2" as const;
export const NRCS_ADAPTER_ID = "usda-nrcs-plants-national" as const;
export const NRCS_ADAPTER_VERSION = "1.0.3" as const;
export const NRCS_PROFILE_BASE_URL =
  "https://plantsservices.sc.egov.usda.gov/api/PlantProfile" as const;
export const NRCS_DISTRIBUTION_URL =
  "https://plantsservices.sc.egov.usda.gov/api/PlantProfile/getDownloadDistributionDocumentation" as const;
export const NRCS_MAPSERVER_URL =
  "https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/land_use_land_cover/plants/MapServer" as const;
export const NRCS_LAYER6_QUERY_URL = `${NRCS_MAPSERVER_URL}/6/query` as const;
export const NRCS_TERMS_URL = "https://plants.usda.gov/home/help" as const;

export type NrcsTaxonMapping = {
  plantMasterId: number;
  symbol: string;
  speciesId: string;
  scientificName: string;
};

export type NationalNrcsPlan = {
  schemaVersion: 1;
  planId: "usda-nrcs-plants-national-v1-tranche-01";
  sourceId: typeof NRCS_SOURCE_ID;
  snapshotDate: string;
  profileBaseUrl: typeof NRCS_PROFILE_BASE_URL;
  distributionUrl: typeof NRCS_DISTRIBUTION_URL;
  mapServerUrl: typeof NRCS_MAPSERVER_URL;
  artifactBudgetBytes: number;
  maxAttempts: number;
  nationalV1StateCodes: string[];
  taxonMappings: NrcsTaxonMapping[];
  allowedEstablishmentMeans: Array<"Introduced" | "Both">;
  expectedGrossPairs: 125760;
  expectedNetNewPairsAtBaseline: 123140;
  expectedAlreadyResearchedAtBaseline: 2620;
  baselineGeneratedAsOf: "2026-08-15";
  baselineCommit: string;
};

export type NrcsDistributionRow = {
  symbol: string;
  country: string;
  state: string;
  stateFips: string;
  county: string;
  countyFips: string;
  sourceRowNumber: number;
  plantMasterId: number;
};

export type NrcsRequestedPair = {
  countyFips: string;
  countyName: string;
  countyLegalName: string;
  stateCode: string;
  stateName: string;
  stateFips: string;
  speciesId: string;
  scientificName: string;
};

export type NrcsReplayReconciliation = {
  selected_county_rows: number;
  accepted_county_rows: number;
  rejected_candidate_rows: number;
  state_only_rows: number;
  foreign_rows: number;
  assertion_pairs: number;
  rejection_events: number;
  duplicate_rows: number;
  missing_geography_rows: number;
  retired_geography_rows: number;
  outside_scope_rows: number;
  state_name_mismatch_rows: number;
  county_name_mismatch_rows: number;
  symbol_mismatch_rows: number;
};

export type NrcsReplayResult = SourceAdapterResult & {
  reconciliation: NrcsReplayReconciliation;
  selectedRowsSha256: string;
};

type ClassifiedRejection = {
  reason: RejectionReasonCode;
  category: keyof Omit<
    NrcsReplayReconciliation,
    | "selected_county_rows"
    | "accepted_county_rows"
    | "rejected_candidate_rows"
    | "state_only_rows"
    | "foreign_rows"
    | "assertion_pairs"
    | "rejection_events"
  >;
  row: NrcsDistributionRow;
  mapping: NrcsTaxonMapping;
  countyFips: string | null;
  detail: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

export function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

export function asNdjson(values: unknown[]) {
  return values.length ? `${values.map((value) => JSON.stringify(value)).join("\n")}\n` : "";
}

export function runTimestamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function relativeGitPath(root: string, filepath: string) {
  return path.relative(root, filepath).split(path.sep).join("/");
}

export function normalizedText(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ")
    : "";
}

export function canonicalScientificName(value: string) {
  return normalizedText(value)
    .replace(/\u00d7/gu, "x")
    .replace(/\bssp\./giu, "subsp.")
    .toLowerCase();
}

function pairKey(pair: { countyFips: string; speciesId: string }) {
  return `${pair.countyFips}:${pair.speciesId}`;
}

function reducedRow(row: NrcsDistributionRow) {
  return {
    symbol: row.symbol,
    country: row.country,
    state: row.state,
    stateFips: row.stateFips,
    county: row.county,
    countyFips: row.countyFips,
    sourceRowNumber: row.sourceRowNumber,
    plantMasterId: row.plantMasterId,
  };
}

function rejectionRecord(
  context: SourceAdapterContext,
  rejected: ClassifiedRejection,
  createdAt: string,
): ResearchRejectionRecord {
  return {
    schemaVersion: 1,
    rejection_id: contentId("nrcs-plants-rejection", {
      runId: context.runId,
      row: reducedRow(rejected.row),
      reason: rejected.reason,
      category: rejected.category,
    }),
    created_at: createdAt,
    actor_type: "adapter",
    actor_id: `${NRCS_ADAPTER_ID}@${NRCS_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: NRCS_SOURCE_ID,
    candidate_locator: `nrcs-plants-csv:${rejected.row.plantMasterId}:${rejected.row.sourceRowNumber}`,
    candidate_taxon: rejected.mapping.scientificName,
    candidate_geography: normalizedText(rejected.row.county) || normalizedText(rejected.row.state) || null,
    normalized_target: {
      state_code: context.stateCode,
      species_id: rejected.mapping.speciesId,
      county_fips: rejected.countyFips,
    },
    reason_code: rejected.reason,
    supporting_notes: [
      rejected.detail,
      "A rejected PLANTS distribution row never establishes absence or non-detection.",
    ],
  };
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  pair: NrcsRequestedPair;
  mapping: NrcsTaxonMapping;
  row: NrcsDistributionRow;
  completedAt: string;
}) {
  const payloadHash = sha256(stableJson(reducedRow(input.row)));
  const eventId = contentId("nrcs-plants-assertion", {
    runId: input.context.runId,
    pair: pairKey(input.pair),
    sourceRow: input.row.sourceRowNumber,
    payloadHash,
  });
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${NRCS_ADAPTER_ID}@${NRCS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: NRCS_SOURCE_ID,
    state_code: input.pair.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "county",
    source_record_id: `usda-nrcs-plants:${input.mapping.plantMasterId}:${input.pair.countyFips}`,
    source_url: NRCS_DISTRIBUTION_URL,
    source_record_date: null,
    retrieved_at: input.completedAt,
    taxon_match: {
      method: "Exact committed PLANTS master ID, accepted profile, symbol, and scientific-name mapping",
      target_scientific_name: input.pair.scientificName,
      source_scientific_name: input.mapping.scientificName,
      source_taxon_key: String(input.mapping.plantMasterId),
    },
    geography_match: {
      method: "Exact provider-declared two-digit state FIPS plus three-digit county FIPS, matching active registry state and county names; no geometry",
      source_state: normalizedText(input.row.state),
      source_county: normalizedText(input.row.county),
      county_fips: input.pair.countyFips,
    },
    temporal_scope: `USDA NRCS PLANTS distribution CSV retrieved ${input.completedAt}; provider exposes no row date.`,
    spatial_scope: `USDA NRCS PLANTS explicitly lists ${input.pair.countyLegalName}, ${input.pair.stateName} for the taxon.`,
    survey_scope: null,
    normalized_payload_hash: payloadHash,
    caveats: [
      "PLANTS county distribution is occurrence documentation, not an abundance survey.",
      "The provider exposes no row-level observation date or machine-readable dataset-specific license.",
      "Source silence never supports absence or non-detection.",
    ],
    notes: [
      `PLANTS symbol ${input.mapping.symbol}; master ID ${input.mapping.plantMasterId}.`,
      `Distribution CSV source row ${input.row.sourceRowNumber}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("nrcs-plants-review", { assertionEventId: eventId }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${NRCS_ADAPTER_ID}@${NRCS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: NRCS_SOURCE_ID,
    state_code: input.pair.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "official-national-provider",
      "exact-profile-taxonomy",
      "introduced-or-both-source-status",
      "exact-active-county-fips",
      "matching-provider-state-and-county-name",
    ],
    notes: [
      "The retained profile, source-status fingerprints, and FIPS-bearing CSV passed every publication gate.",
      "This review publishes recorded-present county distribution evidence only.",
    ],
  };
  return { assertion, review };
}

export function replayNationalNrcsState(input: {
  context: SourceAdapterContext;
  requestedPairs: NrcsRequestedPair[];
  rows: NrcsDistributionRow[];
  mappings: NrcsTaxonMapping[];
  completedAt: string;
}): NrcsReplayResult {
  const { context, requestedPairs, completedAt } = input;
  assert(context.sourceId === NRCS_SOURCE_ID, "NRCS replay received the wrong source.");
  assert(requestedPairs.length > 0, "NRCS replay requires requested pairs.");
  assert(requestedPairs.every((pair) => pair.stateCode === context.stateCode), "NRCS replay state differs from requested scope.");
  const requestedByKey = new Map(requestedPairs.map((pair) => [pairKey(pair), pair]));
  assert(requestedByKey.size === requestedPairs.length, "NRCS requested pairs contain duplicates.");
  const mappingByMaster = new Map(input.mappings.map((mapping) => [mapping.plantMasterId, mapping]));
  assert(mappingByMaster.size === input.mappings.length, "NRCS mappings contain duplicate master IDs.");
  const stateFips = requestedPairs[0]!.stateFips;
  assert(requestedPairs.every((pair) => pair.stateFips === stateFips), "NRCS state FIPS differs inside requested scope.");

  const stateRows = input.rows
    .filter((row) => row.country === "United States" && row.stateFips === stateFips)
    .sort((left, right) => compareText(
      `${left.plantMasterId}:${left.countyFips}:${left.sourceRowNumber}`,
      `${right.plantMasterId}:${right.countyFips}:${right.sourceRowNumber}`,
    ));
  const stateOnlyRows = stateRows.filter((row) => !row.countyFips).length;
  const selectedRows = stateRows.filter((row) => row.countyFips);
  const acceptedByPair = new Map<string, NrcsDistributionRow>();
  const rejected: ClassifiedRejection[] = [];

  for (const row of selectedRows) {
    const mapping = mappingByMaster.get(row.plantMasterId);
    assert(mapping, `NRCS row uses unplanned master ID ${row.plantMasterId}.`);
    const fips = `${row.stateFips}${row.countyFips}`;
    if (row.symbol !== mapping.symbol) {
      rejected.push({ reason: "taxon-mismatch", category: "symbol_mismatch_rows", row, mapping, countyFips: /^\d{5}$/u.test(fips) ? fips : null, detail: "The CSV symbol differs from the committed and profile-verified symbol." });
      continue;
    }
    if (!/^\d{5}$/u.test(fips)) {
      rejected.push({ reason: "geography-missing", category: "missing_geography_rows", row, mapping, countyFips: null, detail: "The CSV row lacks exact two-digit state and three-digit county FIPS." });
      continue;
    }
    const resolution = resolveCountyEquivalent({ stateCode: context.stateCode, countyFips: fips });
    if (resolution.status !== "resolved") {
      const retired = resolution.reasonCode === "retired-geography";
      const outside = resolution.reasonCode === "state-fips-mismatch";
      rejected.push({
        reason: retired ? "retired-geography" : outside ? "outside-scope" : "geography-ambiguous",
        category: retired ? "retired_geography_rows" : "outside_scope_rows",
        row,
        mapping,
        countyFips: null,
        detail: resolution.detail,
      });
      continue;
    }
    const pair = requestedByKey.get(`${fips}:${mapping.speciesId}`);
    if (!pair) {
      rejected.push({ reason: "outside-scope", category: "outside_scope_rows", row, mapping, countyFips: fips, detail: "The row resolves outside the exact planned county-species scope." });
      continue;
    }
    if (normalizedText(row.state).toLowerCase() !== normalizedText(pair.stateName).toLowerCase()) {
      rejected.push({ reason: "geography-ambiguous", category: "state_name_mismatch_rows", row, mapping, countyFips: fips, detail: "The provider state label does not match the registry state name for its FIPS." });
      continue;
    }
    const nameResolution = resolveCountyEquivalent({
      stateCode: context.stateCode,
      countyName: normalizedText(row.county),
      sourceId: NRCS_SOURCE_ID,
    });
    if (nameResolution.status !== "resolved" || nameResolution.county.countyFips !== fips) {
      rejected.push({ reason: "geography-ambiguous", category: "county_name_mismatch_rows", row, mapping, countyFips: fips, detail: "The provider county label does not match the active registry county-equivalent name." });
      continue;
    }
    const key = pairKey(pair);
    if (acceptedByPair.has(key)) {
      rejected.push({ reason: "duplicate", category: "duplicate_rows", row, mapping, countyFips: fips, detail: "The CSV repeats an already accepted taxon-county row." });
      continue;
    }
    acceptedByPair.set(key, row);
  }

  const rejections = rejected.map((entry) => rejectionRecord(context, entry, completedAt));
  const rejectionIdsByPair = new Map<string, string[]>();
  rejected.forEach((entry, index) => {
    if (!entry.countyFips) return;
    const key = `${entry.countyFips}:${entry.mapping.speciesId}`;
    const values = rejectionIdsByPair.get(key) ?? [];
    values.push(rejections[index]!.rejection_id);
    rejectionIdsByPair.set(key, values);
  });

  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  for (const [key, row] of [...acceptedByPair.entries()].sort(([left], [right]) => compareText(left, right))) {
    const pair = requestedByKey.get(key)!;
    const mapping = mappingByMaster.get(row.plantMasterId)!;
    const normalized = assertionAndReview({ context, pair, mapping, row, completedAt });
    assertions.push(normalized.assertion);
    reviews.push(normalized.review);
  }
  const assertionByPair = new Map(assertions.map((assertion) => [`${assertion.county_fips}:${assertion.species_id}`, assertion]));
  const outcomes: ResearchPairOutcome[] = [...requestedPairs]
    .sort((left, right) => compareText(pairKey(left), pairKey(right)))
    .map((pair) => {
      const key = pairKey(pair);
      const assertion = assertionByPair.get(key);
      const rejectionIds = [...(rejectionIdsByPair.get(key) ?? [])].sort(compareText);
      const status = assertion ? "evidence-found" : "no-qualifying-evidence";
      return {
        schemaVersion: 1,
        outcome_id: contentId("nrcs-plants-outcome", {
          runId: context.runId,
          key,
          status,
          assertion: assertion?.eventId ?? null,
          rejectionIds,
        }),
        run_id: context.runId,
        source_id: NRCS_SOURCE_ID,
        state_code: pair.stateCode,
        county_fips: pair.countyFips,
        species_id: pair.speciesId,
        status,
        scope_complete: true,
        recorded_at: completedAt,
        assertion_event_ids: assertion ? [assertion.eventId] : [],
        rejection_ids: rejectionIds,
        query_urls: [NRCS_DISTRIBUTION_URL],
        notes: assertion
          ? ["The complete taxon-bounded USDA PLANTS CSV found qualifying recorded-present distribution evidence for this pair."]
          : [
              "The complete taxon-bounded USDA PLANTS CSV found no qualifying county distribution evidence for this pair.",
              "This research result is not verified absence and is not a survey non-detection.",
              "Rejected, missing, ambiguous, retired, or conflicting geography never creates a negative claim.",
            ],
      } satisfies ResearchPairOutcome;
    });

  const counts = {
    duplicate_rows: 0,
    missing_geography_rows: 0,
    retired_geography_rows: 0,
    outside_scope_rows: 0,
    state_name_mismatch_rows: 0,
    county_name_mismatch_rows: 0,
    symbol_mismatch_rows: 0,
  };
  for (const entry of rejected) counts[entry.category as keyof typeof counts] += 1;
  const reconciliation: NrcsReplayReconciliation = {
    selected_county_rows: selectedRows.length,
    accepted_county_rows: acceptedByPair.size,
    rejected_candidate_rows: rejected.length,
    state_only_rows: stateOnlyRows,
    foreign_rows: input.rows.filter((row) => row.country !== "United States").length,
    assertion_pairs: assertions.length,
    rejection_events: rejections.length,
    ...counts,
  };
  return {
    completedAt,
    assertions,
    reviews,
    rejections,
    outcomes,
    artifacts: [],
    upstreamRequests: [],
    candidateRecordCount: selectedRows.length,
    duplicateRecordCount: counts.duplicate_rows,
    errors: [],
    warnings: [
      "Complete PLANTS CSV silence changes research status only and never establishes absence or non-detection.",
      `State-only distribution rows retained outside county evidence for ${context.stateCode}: ${stateOnlyRows}.`,
    ],
    reconciliation,
    selectedRowsSha256: sha256(stableJson(selectedRows.map(reducedRow))),
  };
}
