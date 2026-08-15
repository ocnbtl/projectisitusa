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
  countyEquivalentNameMatchesFips,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const APHIS_SOURCE_ID = "aphis-federal-quarantine" as const;
export const APHIS_ACQUISITION_ACTOR =
  "aphis-federal-quarantine-national-acquisition@1.0.0" as const;
export const APHIS_ADAPTER_ID =
  "aphis-federal-quarantine-national" as const;
export const APHIS_ADAPTER_VERSION = "1.0.0" as const;
export const APHIS_LAYER_URL =
  "https://services7.arcgis.com/2C1NQ7u6M6SXoa8p/arcgis/rest/services/PPQ_GIS_Federal_Quarantine_AGOL_EDIT_Feature_Layer_view/FeatureServer/1" as const;
export const APHIS_QUERY_URL = `${APHIS_LAYER_URL}/query` as const;
export const APHIS_TERMS_URL =
  "https://www.aphis.usda.gov/plant-pests-diseases" as const;
export const APHIS_OUT_FIELDS = [
  "OBJECTID",
  "Quarantine_State",
  "Quarantine_State_Abbr",
  "Quarantine_County",
  "Quarantine_Program",
  "Quarantine_Status",
  "Quarantine_Unit",
  "Quarantine_Name",
  "Quarantine_Statewide",
  "Quarantine_Statewide_Date",
  "Quarantine_Established_Date",
  "Quarantine_Modified_Date",
  "Quarantine_Removed_Date",
  "Quarantine_Reg_Doc",
  "Quarantine_Reg_Doc_Link",
  "Quarantine_Program_Link",
  "Quarantine_Additional_Link",
  "Quarantine_County_FIPS",
] as const;

export type AphisProgramMapping = {
  sourceProgram: string;
  speciesId: string;
  scientificName: string;
};

export type NationalAphisPlan = {
  schemaVersion: 1;
  planId: "aphis-federal-quarantine-national-v1";
  sourceId: typeof APHIS_SOURCE_ID;
  snapshotDate: string;
  layerUrl: typeof APHIS_LAYER_URL;
  pageSize: number;
  artifactBudgetBytes: number;
  maxAttempts: number;
  nationalV1StateCodes: string[];
  acceptedStatuses: string[];
  rejectedStatuses: string[];
  programMappings: AphisProgramMapping[];
  unmappedPrograms: string[];
  expectedGrossPairs: 53448;
  expectedNetNewPairsAtBaseline: 52711;
  baselineGeneratedAsOf: "2026-08-14";
  baselineCommit: string;
};

export type AphisAttributes = {
  OBJECTID: number;
  Quarantine_State: string | null;
  Quarantine_State_Abbr: string | null;
  Quarantine_County: string | null;
  Quarantine_Program: string | null;
  Quarantine_Status: string | null;
  Quarantine_Unit: string | null;
  Quarantine_Name: string | null;
  Quarantine_Statewide: string | null;
  Quarantine_Statewide_Date: number | null;
  Quarantine_Established_Date: number | null;
  Quarantine_Modified_Date: number | null;
  Quarantine_Removed_Date: number | null;
  Quarantine_Reg_Doc: string | null;
  Quarantine_Reg_Doc_Link: string | null;
  Quarantine_Program_Link: string | null;
  Quarantine_Additional_Link: string | null;
  Quarantine_County_FIPS: string | null;
};

export type AphisFeature = { attributes: AphisAttributes };

export type AphisRequestedPair = {
  countyFips: string;
  countyName: string;
  countyLegalName: string;
  stateCode: string;
  stateName: string;
  speciesId: string;
  scientificName: string;
};

export type AphisReplayReconciliation = {
  selected_records: number;
  accepted_records: number;
  rejected_candidate_records: number;
  assertion_pairs: number;
  rejection_events: number;
  duplicate_record_ids: number;
  unsupported_status_records: number;
  missing_geography_records: number;
  retired_geography_records: number;
  unknown_or_ambiguous_geography_records: number;
  state_fips_mismatch_records: number;
  county_name_mismatch_records: number;
  invalid_identity_records: number;
};

export type AphisReplayResult = SourceAdapterResult & {
  reconciliation: AphisReplayReconciliation;
  selectedRowsSha256: string;
};

type ClassifiedRejection = {
  reason: RejectionReasonCode;
  category: keyof Omit<
    AphisReplayReconciliation,
    | "selected_records"
    | "accepted_records"
    | "rejected_candidate_records"
    | "assertion_pairs"
    | "rejection_events"
  >;
  row: AphisAttributes;
  mapping: AphisProgramMapping;
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

function text(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function pairKey(pair: { countyFips: string; speciesId: string }) {
  return `${pair.countyFips}:${pair.speciesId}`;
}

function dateFromEpoch(...values: Array<number | null>) {
  const latest = values.filter((value): value is number => Number.isFinite(value)).sort((a, b) => b - a)[0];
  return latest === undefined ? null : new Date(latest).toISOString();
}

function reducedRow(row: AphisAttributes) {
  return Object.fromEntries(
    Object.entries(row).sort(([left], [right]) => compareText(left, right)),
  );
}

function sourceUrl(row: AphisAttributes) {
  for (const candidate of [
    row.Quarantine_Reg_Doc_Link,
    row.Quarantine_Program_Link,
    row.Quarantine_Additional_Link,
  ]) {
    const value = text(candidate);
    if (/^https?:\/\//u.test(value)) return value;
  }
  return APHIS_LAYER_URL;
}

function rejectionRecord(
  context: SourceAdapterContext,
  rejected: ClassifiedRejection,
  createdAt: string,
): ResearchRejectionRecord {
  const row = rejected.row;
  return {
    schemaVersion: 1,
    rejection_id: contentId("aphis-quarantine-rejection", {
      runId: context.runId,
      objectId: row.OBJECTID,
      reason: rejected.reason,
      category: rejected.category,
    }),
    created_at: createdAt,
    actor_type: "adapter",
    actor_id: `${APHIS_ADAPTER_ID}@${APHIS_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: APHIS_SOURCE_ID,
    candidate_locator: `arcgis-objectid:${row.OBJECTID}`,
    candidate_taxon: text(row.Quarantine_Program),
    candidate_geography: text(row.Quarantine_County) || null,
    normalized_target: {
      state_code: context.stateCode,
      species_id: rejected.mapping.speciesId,
      county_fips: rejected.countyFips,
    },
    reason_code: rejected.reason,
    supporting_notes: [
      rejected.detail,
      `APHIS quarantine status: ${text(row.Quarantine_Status) || "blank"}.`,
      "A rejected regulatory record never establishes absence or non-detection.",
    ],
  };
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  pair: AphisRequestedPair;
  mapping: AphisProgramMapping;
  rows: AphisAttributes[];
  completedAt: string;
}) {
  const rows = [...input.rows].sort((left, right) => left.OBJECTID - right.OBJECTID);
  const identities = rows.map((row) => String(row.OBJECTID));
  const payloadHash = sha256(stableJson(rows.map(reducedRow)));
  const eventId = contentId("aphis-quarantine-assertion", {
    runId: input.context.runId,
    pair: pairKey(input.pair),
    identities,
    payloadHash,
  });
  const sourceDates = rows
    .map((row) => dateFromEpoch(row.Quarantine_Modified_Date, row.Quarantine_Established_Date, row.Quarantine_Statewide_Date))
    .filter((value): value is string => Boolean(value))
    .sort(compareText);
  const statuses = [...new Set(rows.map((row) => text(row.Quarantine_Status)))].sort(compareText);
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${APHIS_ADAPTER_ID}@${APHIS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: APHIS_SOURCE_ID,
    state_code: input.pair.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "regulatory",
    scope: "regulatory-area",
    source_record_id: `aphis-quarantine-object-group:${sha256(`${identities.join("\n")}\n`)}`,
    source_url: sourceUrl(rows[0]!),
    source_record_date: sourceDates.at(-1) ?? null,
    retrieved_at: input.completedAt,
    taxon_match: {
      method: "Exact reviewed APHIS quarantine-program to Project Isitusa catalog mapping",
      target_scientific_name: input.pair.scientificName,
      source_scientific_name: input.mapping.scientificName,
      source_taxon_key: input.mapping.sourceProgram,
    },
    geography_match: {
      method: "Exact explicit five-digit APHIS county FIPS plus matching registered active county name; no coordinates or successor inference",
      source_state: input.pair.stateCode,
      source_county: text(rows[0]!.Quarantine_County),
      county_fips: input.pair.countyFips,
    },
    temporal_scope: sourceDates.length
      ? `Current APHIS quarantine snapshot with source dates through ${sourceDates.at(-1)}.`
      : "Current APHIS quarantine snapshot; the retained rows expose no usable program date.",
    spatial_scope: `APHIS explicitly assigns ${input.pair.countyLegalName}, ${input.pair.stateName} to the named quarantine program. This supports regulatory recorded-present evidence only, not organism abundance or full-county biological distribution.`,
    survey_scope: null,
    normalized_payload_hash: payloadHash,
    caveats: [
      "Regulatory quarantine geography supports the named program condition, not broader abundance or county inventory.",
      "A quarantine can include buffer, movement-control, or administrative areas and is not a population survey.",
      "Snapshot silence never supports absence or non-detection.",
    ],
    notes: [
      `Qualifying APHIS feature count: ${rows.length}.`,
      `Accepted regulatory statuses: ${statuses.join(", ")}.`,
      `ArcGIS OBJECTIDs, first ten: ${identities.slice(0, 10).join(", ")}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("aphis-quarantine-review", { assertionEventId: eventId }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${APHIS_ADAPTER_ID}@${APHIS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: APHIS_SOURCE_ID,
    state_code: input.pair.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "versioned-official-national-snapshot",
      "exact-reviewed-program-mapping",
      "exact-active-county-fips",
      "matching-explicit-county-name",
      "accepted-current-regulatory-status",
    ],
    notes: [
      "Every grouped row passed the APHIS program, status, state, FIPS, and county-name publication gate.",
      "This review publishes recorded-present regulatory evidence only.",
    ],
  };
  return { assertion, review };
}

export function replayNationalAphisState(input: {
  context: SourceAdapterContext;
  requestedPairs: AphisRequestedPair[];
  features: AphisFeature[];
  mappings: AphisProgramMapping[];
  acceptedStatuses: string[];
  completedAt: string;
}): AphisReplayResult {
  const { context, requestedPairs, completedAt } = input;
  assert(context.sourceId === APHIS_SOURCE_ID, "APHIS replay received the wrong source.");
  assert(requestedPairs.length > 0, "APHIS replay requires requested pairs.");
  assert(requestedPairs.every((pair) => pair.stateCode === context.stateCode), "APHIS replay state differs from requested scope.");
  const requestedByKey = new Map(requestedPairs.map((pair) => [pairKey(pair), pair]));
  assert(requestedByKey.size === requestedPairs.length, "APHIS requested pairs contain duplicates.");
  const mappingByProgram = new Map(input.mappings.map((mapping) => [mapping.sourceProgram, mapping]));
  assert(mappingByProgram.size === input.mappings.length, "APHIS program mappings contain duplicates.");
  const acceptedStatuses = new Set(input.acceptedStatuses);
  const selectedRows = input.features
    .map((feature) => feature.attributes)
    .filter((row) => text(row.Quarantine_State_Abbr) === context.stateCode && mappingByProgram.has(text(row.Quarantine_Program)))
    .sort((left, right) => left.OBJECTID - right.OBJECTID);
  const seenObjectIds = new Set<number>();
  const acceptedByPair = new Map<string, AphisAttributes[]>();
  const rejected: ClassifiedRejection[] = [];
  for (const row of selectedRows) {
    const mapping = mappingByProgram.get(text(row.Quarantine_Program))!;
    const fips = text(row.Quarantine_County_FIPS);
    if (!Number.isSafeInteger(row.OBJECTID) || row.OBJECTID <= 0) {
      rejected.push({ reason: "record-failed", category: "invalid_identity_records", row, mapping, countyFips: null, detail: "The APHIS feature lacks a valid positive integer OBJECTID." });
      continue;
    }
    if (seenObjectIds.has(row.OBJECTID)) {
      rejected.push({ reason: "duplicate", category: "duplicate_record_ids", row, mapping, countyFips: null, detail: `The snapshot repeats OBJECTID ${row.OBJECTID}.` });
      continue;
    }
    seenObjectIds.add(row.OBJECTID);
    if (!acceptedStatuses.has(text(row.Quarantine_Status))) {
      const resolution = /^\d{5}$/u.test(fips)
        ? resolveCountyEquivalent({ stateCode: context.stateCode, countyFips: fips })
        : null;
      rejected.push({
        reason: "unsupported-claim-type",
        category: "unsupported_status_records",
        row,
        mapping,
        countyFips: resolution?.status === "resolved" ? resolution.county.countyFips : null,
        detail: "The APHIS feature status is pending-only, rescinded, blank, or outside the approved current regulatory-status whitelist.",
      });
      continue;
    }
    if (!/^\d{5}$/u.test(fips)) {
      rejected.push({ reason: "geography-missing", category: "missing_geography_records", row, mapping, countyFips: null, detail: "The APHIS feature lacks an exact five-digit county FIPS." });
      continue;
    }
    const resolution = resolveCountyEquivalent({ stateCode: context.stateCode, countyFips: fips });
    if (resolution.status !== "resolved") {
      const retired = resolution.reasonCode === "retired-geography";
      const mismatch = resolution.reasonCode === "state-fips-mismatch";
      rejected.push({
        reason: retired ? "retired-geography" : mismatch ? "outside-scope" : "geography-ambiguous",
        category: retired ? "retired_geography_records" : mismatch ? "state_fips_mismatch_records" : "unknown_or_ambiguous_geography_records",
        row,
        mapping,
        countyFips: null,
        detail: resolution.detail,
      });
      continue;
    }
    if (!countyEquivalentNameMatchesFips({
      stateCode: context.stateCode,
      countyFips: fips,
      countyName: text(row.Quarantine_County),
      sourceId: APHIS_SOURCE_ID,
    })) {
      rejected.push({
        reason: "geography-ambiguous",
        category: "county_name_mismatch_records",
        row,
        mapping,
        countyFips: fips,
        detail: "The explicit APHIS county label does not match the active registry entry for its FIPS.",
      });
      continue;
    }
    const key = `${fips}:${mapping.speciesId}`;
    assert(requestedByKey.has(key), `APHIS qualifying row resolves outside requested pair ${key}.`);
    const values = acceptedByPair.get(key) ?? [];
    values.push(row);
    acceptedByPair.set(key, values);
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
  for (const [key, rows] of [...acceptedByPair.entries()].sort(([left], [right]) => compareText(left, right))) {
    const pair = requestedByKey.get(key)!;
    const mapping = input.mappings.find((entry) => entry.speciesId === pair.speciesId)!;
    const normalized = assertionAndReview({ context, pair, mapping, rows, completedAt });
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
        outcome_id: contentId("aphis-quarantine-outcome", { runId: context.runId, key, status, assertion: assertion?.eventId ?? null, rejectionIds }),
        run_id: context.runId,
        source_id: APHIS_SOURCE_ID,
        state_code: pair.stateCode,
        county_fips: pair.countyFips,
        species_id: pair.speciesId,
        status,
        scope_complete: true,
        recorded_at: completedAt,
        assertion_event_ids: assertion ? [assertion.eventId] : [],
        rejection_ids: rejectionIds,
        query_urls: [APHIS_QUERY_URL],
        notes: assertion
          ? ["The complete stable APHIS snapshot found qualifying recorded-present regulatory evidence for this pair."]
          : [
              "The complete stable APHIS snapshot found no qualifying regulatory evidence for this pair.",
              "This research result is not verified absence and is not a survey non-detection.",
              "Rejected, pending-only, rescinded, or missing rows do not create a negative claim.",
            ],
      } satisfies ResearchPairOutcome;
    });
  const reconciliation: AphisReplayReconciliation = {
    selected_records: selectedRows.length,
    accepted_records: [...acceptedByPair.values()].reduce((sum, rows) => sum + rows.length, 0),
    rejected_candidate_records: rejected.length,
    assertion_pairs: assertions.length,
    rejection_events: rejections.length,
    duplicate_record_ids: rejected.filter((entry) => entry.category === "duplicate_record_ids").length,
    unsupported_status_records: rejected.filter((entry) => entry.category === "unsupported_status_records").length,
    missing_geography_records: rejected.filter((entry) => entry.category === "missing_geography_records").length,
    retired_geography_records: rejected.filter((entry) => entry.category === "retired_geography_records").length,
    unknown_or_ambiguous_geography_records: rejected.filter((entry) => entry.category === "unknown_or_ambiguous_geography_records").length,
    state_fips_mismatch_records: rejected.filter((entry) => entry.category === "state_fips_mismatch_records").length,
    county_name_mismatch_records: rejected.filter((entry) => entry.category === "county_name_mismatch_records").length,
    invalid_identity_records: rejected.filter((entry) => entry.category === "invalid_identity_records").length,
  };
  assert(reconciliation.accepted_records + reconciliation.rejected_candidate_records === reconciliation.selected_records, "APHIS candidate classifications do not reconcile.");
  return {
    completedAt,
    assertions,
    reviews,
    rejections,
    outcomes,
    artifacts: [],
    upstreamRequests: [],
    candidateRecordCount: selectedRows.length,
    duplicateRecordCount: reconciliation.duplicate_record_ids,
    errors: [],
    warnings: [
      "APHIS regulatory records support recorded-present program evidence only.",
      `Rejected mapped candidate records: ${reconciliation.rejected_candidate_records}.`,
      "No source silence or rejection was interpreted as verified absence or survey non-detection.",
    ],
    reconciliation,
    selectedRowsSha256: sha256(stableJson(selectedRows.map(reducedRow))),
  };
}
