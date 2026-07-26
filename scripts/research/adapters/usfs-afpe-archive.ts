import { createHash } from "node:crypto";

import type {
  EvidenceReviewEvent,
  ResearchPairOutcome,
  ResearchRejectionRecord,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import type {
  SourceAdapterContext,
  SourceAdapterResult,
} from "@/lib/research/source-adapter";
import {
  getStateDefinition,
  listCountyEquivalents,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const AFPE_SOURCE_ID = "usfs-afpe" as const;
export const AFPE_ADAPTER_ID = "usfs-afpe-archive" as const;
export const AFPE_ADAPTER_VERSION = "1.0.0" as const;
export const AFPE_ARCHIVE_VERSION = "1.0" as const;
export const AFPE_ARCHIVE_URL =
  "https://purr.purdue.edu/publications/4479/serve/1?render=archive" as const;
export const AFPE_PUBLICATION_URL =
  "https://purr.purdue.edu/publications/4479/1" as const;
export const AFPE_DOI_URL = "https://doi.org/10.4231/HWQF-V087" as const;

export type AfpeTaxonMapping = {
  columnId: string;
  sourceLabel: string;
  speciesId: string;
  scientificName: string;
};

export type AfpeCountyRow = {
  STATE: string;
  COUNTY: string;
  NAME: string;
  LSAD: string;
  LSAD_TRANS: string;
  FIPS: string;
  STATENAME: string;
  Total: string;
  AllPest: string;
  [column: string]: string;
};

export type AfpeReconciliation = {
  source_rows: number;
  source_cells: number;
  matched_current_county_rows: number;
  unregistered_or_retired_rows: number;
  missing_current_counties: number;
  duplicate_source_rows: number;
  duplicate_source_cells: number;
  conflicting_duplicate_cells: number;
  positive_pairs: number;
  no_qualifying_evidence_pairs: number;
  blocked_pairs: number;
  assertion_pairs: number;
  rejection_events: number;
};

export type AfpeReplayResult = SourceAdapterResult & {
  reconciliation: AfpeReconciliation;
  selectedRowsSha256: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

function canonicalGeographyLabel(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/gu, "");
}

function sortedRows(rows: AfpeCountyRow[]) {
  return [...rows].sort(
    (left, right) =>
      compareText(left.FIPS, right.FIPS) ||
      compareText(left.NAME, right.NAME) ||
      compareText(stableJson(left), stableJson(right)),
  );
}

function rejection(input: {
  context: SourceAdapterContext;
  mapping: AfpeTaxonMapping;
  countyFips: string | null;
  candidateGeography: string | null;
  locator: string;
  reason: ResearchRejectionRecord["reason_code"];
  notes: string[];
  completedAt: string;
}): ResearchRejectionRecord {
  return {
    schemaVersion: 1,
    rejection_id: contentId("usfs-afpe-rejection", {
      runId: input.context.runId,
      speciesId: input.mapping.speciesId,
      countyFips: input.countyFips,
      locator: input.locator,
      reason: input.reason,
      notes: input.notes,
    }),
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${AFPE_ADAPTER_ID}@${AFPE_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: AFPE_SOURCE_ID,
    candidate_locator: input.locator,
    candidate_taxon: input.mapping.sourceLabel,
    candidate_geography: input.candidateGeography,
    normalized_target: {
      state_code: input.context.stateCode,
      species_id: input.mapping.speciesId,
      county_fips: input.countyFips,
    },
    reason_code: input.reason,
    supporting_notes: input.notes,
  };
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  mapping: AfpeTaxonMapping;
  row: AfpeCountyRow;
  countyLegalName: string;
  stateName: string;
  completedAt: string;
}) {
  const payload = {
    archiveVersion: AFPE_ARCHIVE_VERSION,
    columnId: input.mapping.columnId,
    sourceLabel: input.mapping.sourceLabel,
    FIPS: input.row.FIPS,
    STATE: input.row.STATE,
    COUNTY: input.row.COUNTY,
    NAME: input.row.NAME,
    LSAD: input.row.LSAD,
    LSAD_TRANS: input.row.LSAD_TRANS,
    STATENAME: input.row.STATENAME,
    value: input.row[input.mapping.columnId],
  };
  const normalizedPayloadHash = sha256(stableJson(payload));
  const eventId = contentId("usfs-afpe-assertion", {
    runId: input.context.runId,
    pair: pairKey(input.row.FIPS, input.mapping.speciesId),
    normalizedPayloadHash,
  });
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${AFPE_ADAPTER_ID}@${AFPE_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: AFPE_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.row.FIPS,
    species_id: input.mapping.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "county",
    source_record_id:
      `doi:10.4231/HWQF-V087:v1.0:${input.row.FIPS}:${input.mapping.columnId}`,
    source_url: AFPE_PUBLICATION_URL,
    source_record_date: "2023-04",
    retrieved_at: input.completedAt,
    taxon_match: {
      method:
        "Exact versioned Project Isitusa mapping from the published DCA column and dictionary label to one reviewed catalog species",
      target_scientific_name: input.mapping.scientificName,
      source_scientific_name: input.mapping.scientificName,
      source_taxon_key: input.mapping.columnId,
    },
    geography_match: {
      method:
        "Exact five-digit source FIPS and a normalized source label matched one active registered legal county-equivalent name; coordinates were not used",
      source_state: input.stateName,
      source_county: input.countyLegalName,
      county_fips: input.row.FIPS,
    },
    temporal_scope:
      "Historical AFPE county detection compilation with underlying pest data last updated in April 2023.",
    spatial_scope:
      `The published AFPE v1.0 county row has value 1 for ${input.mapping.sourceLabel} at exact FIPS ${input.row.FIPS}.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "AFPE v1.0 is a historical county detection compilation and is stale for current-source readiness.",
      "A value of 1 supports recorded-present only, not current abundance or complete distribution.",
      "A value of 0 is never verified absence or survey non-detection.",
      "The published files provide common names and DCA columns, so taxon publication is limited to the 13 manually reviewed mappings.",
    ],
    notes: [
      `Published source county label: ${input.row.NAME}.`,
      `Published DCA column: ${input.mapping.columnId}.`,
      `Published dictionary label: ${input.mapping.sourceLabel}.`,
      `Exact source FIPS: ${input.row.FIPS}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("usfs-afpe-review", {
      assertionEventId: eventId,
      decision: "accepted",
    }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${AFPE_ADAPTER_ID}@${AFPE_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: AFPE_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.row.FIPS,
    species_id: input.mapping.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "hash-pinned-cc0-archive",
      "versioned-reviewed-dca-mapping",
      "exact-active-county-fips",
      "explicit-detection-value-one",
    ],
    notes: [
      "The row passed the registered AFPE version, DCA mapping, binary-value, and exact active FIPS gates.",
      "This review publishes recorded-present evidence only.",
    ],
  };
  return { assertion, review };
}

export function replayNationalAfpeState(input: {
  context: SourceAdapterContext;
  rows: AfpeCountyRow[];
  mappings: AfpeTaxonMapping[];
  completedAt: string;
  archiveUrl: string;
}): AfpeReplayResult {
  const { context, completedAt } = input;
  assert(context.sourceId === AFPE_SOURCE_ID, "AFPE replay received the wrong source.");
  assert(context.requestedPairs.length > 0, "AFPE replay requires requested pairs.");
  assert(input.mappings.length > 0, "AFPE replay requires taxon mappings.");
  const state = getStateDefinition(context.stateCode);
  assert(state?.nationalV1Scope, `AFPE replay state ${context.stateCode} is outside national v1.`);
  const counties = listCountyEquivalents(context.stateCode);
  const countyByFips = new Map(counties.map((county) => [county.countyFips, county]));
  const mappingBySpecies = new Map(
    input.mappings.map((mapping) => [mapping.speciesId, mapping]),
  );
  assert(
    mappingBySpecies.size === input.mappings.length,
    "AFPE taxon mappings contain duplicate species.",
  );
  assert(
    new Set(input.mappings.map((mapping) => mapping.columnId)).size ===
      input.mappings.length,
    "AFPE taxon mappings contain duplicate DCA columns.",
  );
  const requestedPairKeys = context.requestedPairs.map((pair) =>
    pairKey(pair.countyFips, pair.speciesId)
  );
  assert(
    new Set(requestedPairKeys).size === requestedPairKeys.length,
    "AFPE requested pairs contain duplicates.",
  );
  for (const pair of context.requestedPairs) {
    assert(countyByFips.has(pair.countyFips), `AFPE pair uses inactive FIPS ${pair.countyFips}.`);
    const mapping = mappingBySpecies.get(pair.speciesId);
    assert(mapping, `AFPE pair uses unmapped species ${pair.speciesId}.`);
    assert(
      mapping.scientificName === pair.scientificName,
      `AFPE mapping differs from requested taxon ${pair.speciesId}.`,
    );
  }

  const rows = sortedRows(input.rows);
  const rowsByFips = new Map<string, AfpeCountyRow[]>();
  for (const row of rows) {
    const values = rowsByFips.get(row.FIPS) ?? [];
    values.push(row);
    rowsByFips.set(row.FIPS, values);
  }
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const rejections: ResearchRejectionRecord[] = [];
  const outcomes: ResearchPairOutcome[] = [];
  let duplicateSourceRows = 0;
  let duplicateSourceCells = 0;
  let conflictingDuplicateCells = 0;
  let positivePairs = 0;
  let noQualifyingEvidencePairs = 0;
  let blockedPairs = 0;

  for (const pair of [...context.requestedPairs].sort(
    (left, right) =>
      compareText(left.countyFips, right.countyFips) ||
      compareText(left.speciesId, right.speciesId),
  )) {
    const mapping = mappingBySpecies.get(pair.speciesId)!;
    const sourceRows = rowsByFips.get(pair.countyFips) ?? [];
    const pairRejections: ResearchRejectionRecord[] = [];
    let assertionIds: string[] = [];
    let status: ResearchPairOutcome["status"];

    if (sourceRows.length === 0) {
      const missing = rejection({
        context,
        mapping,
        countyFips: pair.countyFips,
        candidateGeography: pair.countyName,
        locator: `archive-missing-current-fips:${pair.countyFips}:${mapping.columnId}`,
        reason: "geography-missing",
        notes: [
          `The complete AFPE v1.0 archive contains no row for current county-equivalent FIPS ${pair.countyFips}.`,
          "The pair remains blocked rather than being converted to absence, non-detection, or a completed source-silence screen.",
        ],
        completedAt,
      });
      pairRejections.push(missing);
      status = "blocked";
      blockedPairs += 1;
    } else {
      if (sourceRows.length > 1) {
        duplicateSourceRows += sourceRows.length - 1;
        duplicateSourceCells += sourceRows.length - 1;
      }
      const values = [...new Set(sourceRows.map((row) => row[mapping.columnId]))].sort(
        compareText,
      );
      const county = countyByFips.get(pair.countyFips)!;
      const sourceNameMismatch = sourceRows.some((row) => {
        return canonicalGeographyLabel(row.NAME) !==
            canonicalGeographyLabel(county.shortName) ||
          canonicalGeographyLabel(row.STATENAME) !==
            canonicalGeographyLabel(state.stateName) ||
          row.STATE !== state.stateFips ||
          row.FIPS !== `${row.STATE}${row.COUNTY}`;
      });
      if (sourceNameMismatch) {
        const contradiction = rejection({
          context,
          mapping,
          countyFips: pair.countyFips,
          candidateGeography: sourceRows[0]?.NAME ?? pair.countyName,
          locator: `archive-geography-contradiction:${pair.countyFips}:${mapping.columnId}`,
          reason: "source-contradiction",
          notes: [
            `AFPE v1.0 exact FIPS ${pair.countyFips} does not independently agree with its source county label, state FIPS, or component county code.`,
            "No evidence was published and the pair remains blocked.",
          ],
          completedAt,
        });
        pairRejections.push(contradiction);
        status = "blocked";
        blockedPairs += 1;
      } else if (
        values.length !== 1 ||
        (values[0] !== "0" && values[0] !== "1")
      ) {
        conflictingDuplicateCells += sourceRows.length > 1 ? 1 : 0;
        const contradiction = rejection({
          context,
          mapping,
          countyFips: pair.countyFips,
          candidateGeography: sourceRows[0]?.NAME ?? pair.countyName,
          locator: `archive-conflicting-cell:${pair.countyFips}:${mapping.columnId}`,
          reason: "source-contradiction",
          notes: [
            `AFPE v1.0 contains unsupported or conflicting values for ${pair.countyFips}:${mapping.columnId}: ${values.join(", ") || "missing"}.`,
            "No evidence was published and the pair remains blocked.",
          ],
          completedAt,
        });
        pairRejections.push(contradiction);
        status = "blocked";
        blockedPairs += 1;
      } else {
        if (sourceRows.length > 1) {
          pairRejections.push(rejection({
            context,
            mapping,
            countyFips: pair.countyFips,
            candidateGeography: sourceRows[0]!.NAME,
            locator: `archive-identical-duplicate:${pair.countyFips}:${mapping.columnId}`,
            reason: "duplicate",
            notes: [
              `AFPE v1.0 repeats current FIPS ${pair.countyFips} ${sourceRows.length} times with the same mapped value ${values[0]}.`,
              "The adapter retained one deterministic cell value and recorded the duplicate without blocking the pair.",
            ],
            completedAt,
          }));
        }
        if (values[0] === "1") {
          const evidence = assertionAndReview({
            context,
            mapping,
            row: sourceRows[0]!,
            countyLegalName: county.legalName,
            stateName: state.stateName,
            completedAt,
          });
          assertions.push(evidence.assertion);
          reviews.push(evidence.review);
          assertionIds = [evidence.assertion.eventId];
          status = "evidence-found";
          positivePairs += 1;
        } else {
          status = "no-qualifying-evidence";
          noQualifyingEvidencePairs += 1;
        }
      }
    }
    rejections.push(...pairRejections);
    const rejectionIds = pairRejections.map((entry) => entry.rejection_id).sort(compareText);
    outcomes.push({
      schemaVersion: 1,
      outcome_id: contentId("usfs-afpe-outcome", {
        runId: context.runId,
        pair: pairKey(pair.countyFips, pair.speciesId),
        status,
        assertionIds,
        rejectionIds,
      }),
      run_id: context.runId,
      source_id: AFPE_SOURCE_ID,
      state_code: context.stateCode,
      county_fips: pair.countyFips,
      species_id: pair.speciesId,
      status,
      scope_complete: status !== "blocked",
      recorded_at: completedAt,
      assertion_event_ids: assertionIds,
      rejection_ids: rejectionIds,
      query_urls: [input.archiveUrl],
      notes: status === "evidence-found"
        ? [
            "The complete hash-pinned AFPE v1.0 screen found a published value of 1 for this exact county-species mapping.",
          ]
        : status === "no-qualifying-evidence"
          ? [
              "The complete hash-pinned AFPE v1.0 screen found a published value of 0 for this exact county-species mapping.",
              "This is researched unresolved only, never verified absence or survey non-detection.",
            ]
          : [
              "The AFPE v1.0 source screen could not be completed for this pair.",
              "The blocked result preserves uncertainty and does not create a negative determination.",
            ],
    });
  }

  const requestedFips = new Set(context.requestedPairs.map((pair) => pair.countyFips));
  const unregisteredRows = rows.filter((row) => !requestedFips.has(row.FIPS));
  for (const row of unregisteredRows) {
    for (const mapping of input.mappings) {
      rejections.push(rejection({
        context,
        mapping,
        countyFips: null,
        candidateGeography: row.NAME || null,
        locator: `archive-unregistered-fips:${row.FIPS}:${mapping.columnId}`,
        reason: "retired-geography",
        notes: [
          `AFPE v1.0 row FIPS ${row.FIPS} is not an active county equivalent in ${context.stateCode}.`,
          "No retired, abolished, or superseded FIPS was crosswalked automatically.",
        ],
        completedAt,
      }));
    }
  }

  assertions.sort((left, right) => compareText(left.eventId, right.eventId));
  reviews.sort((left, right) => compareText(left.eventId, right.eventId));
  rejections.sort((left, right) => compareText(left.rejection_id, right.rejection_id));
  outcomes.sort(
    (left, right) =>
      compareText(left.county_fips, right.county_fips) ||
      compareText(left.species_id, right.species_id),
  );
  const matchedCurrentRows = [...rowsByFips.keys()].filter((fips) =>
    requestedFips.has(fips)
  ).length;
  const missingCurrentCounties = counties.filter((county) =>
    !rowsByFips.has(county.countyFips)
  ).length;
  const reconciliation: AfpeReconciliation = {
    source_rows: rows.length,
    source_cells: rows.length * input.mappings.length,
    matched_current_county_rows: matchedCurrentRows,
    unregistered_or_retired_rows: unregisteredRows.length,
    missing_current_counties: missingCurrentCounties,
    duplicate_source_rows: duplicateSourceRows,
    duplicate_source_cells: duplicateSourceCells,
    conflicting_duplicate_cells: conflictingDuplicateCells,
    positive_pairs: positivePairs,
    no_qualifying_evidence_pairs: noQualifyingEvidencePairs,
    blocked_pairs: blockedPairs,
    assertion_pairs: assertions.length,
    rejection_events: rejections.length,
  };
  return {
    completedAt,
    assertions,
    reviews,
    rejections,
    outcomes,
    artifacts: [],
    upstreamRequests: [],
    candidateRecordCount: reconciliation.source_cells,
    duplicateRecordCount: duplicateSourceCells,
    errors: [],
    warnings: [
      "AFPE v1.0 underlying pest data was last updated in April 2023 and is stale for current-source readiness.",
      "PURR metadata describes 89 pests while the published CSV and dictionary contain 93 DCA pest columns.",
      "The live AFPE v2 application is a separate volatile source and was not substituted for this hash-pinned CC0 archive.",
    ],
    reconciliation,
    selectedRowsSha256: sha256(stableJson(rows)),
  };
}
