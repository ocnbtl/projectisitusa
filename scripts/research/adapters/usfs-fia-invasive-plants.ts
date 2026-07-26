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

import {
  FIA_ADAPTER_ID,
  FIA_ADAPTER_VERSION,
  FIA_DATAMART_URL,
  FIA_SOURCE_ID,
  type FiaInvasiveReferenceRow,
  type FiaObservationRow,
  type FiaPlantDictionaryRow,
  compareText,
  fiaArtifactUrl,
  fiaStateArtifactName,
  normalizedScientificName,
} from "../national-usfs-fia-common";

export {
  FIA_ADAPTER_ID,
  FIA_ADAPTER_VERSION,
  FIA_SOURCE_ID,
} from "../national-usfs-fia-common";

export type FiaTaxonMapping = {
  symbol: string;
  speciesId: string;
  scientificName: string;
};

export type FiaMappingReconciliation = {
  state_invasive_symbols: number;
  exact_catalog_mappings: number;
  distinct_catalog_species: number;
  duplicate_species_symbol_mappings: number;
  selected_exact_catalog_mappings: number;
  selected_distinct_catalog_species: number;
  no_catalog_match_symbols: number;
  ambiguous_dictionary_symbols: number;
  duplicate_reference_rows: number;
};

export type FiaReplayReconciliation = FiaMappingReconciliation & {
  source_rows: number;
  applicable_source_rows: number;
  accepted_source_rows: number;
  malformed_rows: number;
  state_mismatch_rows: number;
  non_applicable_symbol_rows: number;
  unmapped_symbol_rows: number;
  invalid_geography_rows: number;
  retired_geography_rows: number;
  duplicate_record_ids: number;
  conflicting_record_ids: number;
  assertion_pairs: number;
  evidence_found_pairs: number;
  no_qualifying_evidence_pairs: number;
  blocked_pairs: number;
  rejection_events: number;
};

export type FiaReplayResult = SourceAdapterResult & {
  reconciliation: FiaReplayReconciliation;
  mappings: FiaTaxonMapping[];
  selectedRowsSha256: string;
};

type CatalogSpecies = {
  id: string;
  scientificName: string;
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

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

function rowSymbol(row: FiaObservationRow) {
  return row.VEG_SPCD?.trim() || row.VEG_FLDSPCD?.trim() || "";
}

function normalizedStateCode(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0
    ? String(parsed).padStart(2, "0")
    : null;
}

function normalizedCountyCode(value: string | undefined) {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 999
    ? String(parsed).padStart(3, "0")
    : null;
}

export function buildFiaTaxonMappings(input: {
  stateFips: string;
  catalog: CatalogSpecies[];
  dictionaryRows: FiaPlantDictionaryRow[];
  invasiveReferenceRows: FiaInvasiveReferenceRow[];
}) {
  const catalogByName = new Map<string, CatalogSpecies[]>();
  for (const species of input.catalog) {
    const key = normalizedScientificName(species.scientificName);
    const entries = catalogByName.get(key) ?? [];
    entries.push(species);
    catalogByName.set(key, entries);
  }
  const symbolCounts = new Map<string, number>();
  for (const row of input.invasiveReferenceRows) {
    if (normalizedStateCode(row.STATECD) !== input.stateFips) continue;
    const symbol = row.SYMBOL?.trim();
    if (!symbol) continue;
    symbolCounts.set(symbol, (symbolCounts.get(symbol) ?? 0) + 1);
  }
  const dictionaryBySymbol = new Map<string, Set<string>>();
  for (const row of input.dictionaryRows) {
    const symbol = row.SYMBOL?.trim();
    const scientificName = (
      row.NEW_SCIENTIFIC_NAME || row.SCIENTIFIC_NAME
    )?.trim();
    if (!symbol || !scientificName || !symbolCounts.has(symbol)) continue;
    const names = dictionaryBySymbol.get(symbol) ?? new Set<string>();
    names.add(scientificName);
    dictionaryBySymbol.set(symbol, names);
  }
  const mappings: FiaTaxonMapping[] = [];
  let noCatalogMatchSymbols = 0;
  let ambiguousDictionarySymbols = 0;
  for (const symbol of [...symbolCounts.keys()].sort(compareText)) {
    const sourceNames = [...(dictionaryBySymbol.get(symbol) ?? new Set())]
      .sort(compareText);
    const matches = new Map<string, CatalogSpecies>();
    for (const sourceName of sourceNames) {
      for (const species of catalogByName.get(
        normalizedScientificName(sourceName),
      ) ?? []) {
        matches.set(species.id, species);
      }
    }
    if (sourceNames.length > 1 || matches.size > 1) {
      ambiguousDictionarySymbols += 1;
      continue;
    }
    if (matches.size === 0) {
      noCatalogMatchSymbols += 1;
      continue;
    }
    const species = [...matches.values()][0]!;
    mappings.push({
      symbol,
      speciesId: species.id,
      scientificName: species.scientificName,
    });
  }
  mappings.sort(
    (left, right) =>
      compareText(left.speciesId, right.speciesId) ||
      compareText(left.symbol, right.symbol),
  );
  const distinctCatalogSpecies = new Set(
    mappings.map((entry) => entry.speciesId),
  ).size;
  return {
    mappings,
    reconciliation: {
      state_invasive_symbols: symbolCounts.size,
      exact_catalog_mappings: mappings.length,
      distinct_catalog_species: distinctCatalogSpecies,
      duplicate_species_symbol_mappings:
        mappings.length - distinctCatalogSpecies,
      selected_exact_catalog_mappings: mappings.length,
      selected_distinct_catalog_species: distinctCatalogSpecies,
      no_catalog_match_symbols: noCatalogMatchSymbols,
      ambiguous_dictionary_symbols: ambiguousDictionarySymbols,
      duplicate_reference_rows: [...symbolCounts.values()].reduce(
        (total, count) => total + Math.max(0, count - 1),
        0,
      ),
    } satisfies FiaMappingReconciliation,
  };
}

function rejection(input: {
  context: SourceAdapterContext;
  speciesId: string;
  candidateTaxon: string;
  candidateGeography: string | null;
  countyFips: string | null;
  locator: string;
  reason: ResearchRejectionRecord["reason_code"];
  notes: string[];
  completedAt: string;
}): ResearchRejectionRecord {
  return {
    schemaVersion: 1,
    rejection_id: contentId("usfs-fia-rejection", {
      runId: input.context.runId,
      locator: input.locator,
      speciesId: input.speciesId,
      reason: input.reason,
      notes: input.notes,
    }),
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${FIA_ADAPTER_ID}@${FIA_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: FIA_SOURCE_ID,
    candidate_locator: input.locator,
    candidate_taxon: input.candidateTaxon,
    candidate_geography: input.candidateGeography,
    normalized_target: {
      state_code: input.context.stateCode,
      species_id: input.speciesId,
      county_fips: input.countyFips,
    },
    reason_code: input.reason,
    supporting_notes: input.notes,
  };
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  mappings: FiaTaxonMapping[];
  pair: SourceAdapterContext["requestedPairs"][number];
  rows: FiaObservationRow[];
  completedAt: string;
}) {
  const sortedRows = [...input.rows].sort(
    (left, right) =>
      compareText(left.CN ?? "", right.CN ?? "") ||
      compareText(stableJson(left), stableJson(right)),
  );
  const representative = sortedRows[0]!;
  const sourceSymbols = [...new Set(sortedRows.map(rowSymbol))]
    .sort(compareText);
  const mappingBySymbol = new Map(
    input.mappings.map((entry) => [entry.symbol, entry]),
  );
  assert(
    sourceSymbols.length > 0 &&
      sourceSymbols.every((symbol) => mappingBySymbol.has(symbol)),
    "FIA accepted evidence contains an unmapped source symbol.",
  );
  const representativeMapping = input.mappings[0]!;
  assert(
    input.mappings.every(
      (entry) =>
        entry.speciesId === representativeMapping.speciesId &&
        entry.scientificName === representativeMapping.scientificName,
    ),
    "FIA pair mappings do not converge on one catalog species.",
  );
  const recordIds = sortedRows.map((row) => row.CN ?? "").filter(Boolean);
  const payload = {
    representativeCn: representative.CN,
    stateCd: representative.STATECD,
    countyCd: representative.COUNTYCD,
    symbols: sourceSymbols,
    inventoryYears: [...new Set(
      sortedRows
        .map((row) => row.INVYR)
        .filter((value): value is string => Boolean(value)),
    )]
      .sort(compareText),
    supportingRecordCount: sortedRows.length,
    supportingRecordIdsSha256: sha256(stableJson(recordIds)),
  };
  const normalizedPayloadHash = sha256(stableJson(payload));
  const assertionId = contentId("usfs-fia-assertion", {
    runId: input.context.runId,
    pair: pairKey(input.pair.countyFips, input.pair.speciesId),
    normalizedPayloadHash,
  });
  const state = getStateDefinition(input.context.stateCode)!;
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId: assertionId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${FIA_ADAPTER_ID}@${FIA_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: FIA_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "point",
    source_record_id:
      representative.CN ||
      `fia:${input.context.stateCode}:${input.pair.countyFips}:${sourceSymbols.join("+")}:${normalizedPayloadHash.slice(0, 16)}`,
    source_url: fiaArtifactUrl(fiaStateArtifactName(input.context.stateCode)),
    source_record_date:
      representative.MODIFIED_DATE ||
      representative.CREATED_DATE ||
      representative.INVYR ||
      null,
    retrieved_at: input.completedAt,
    taxon_match: {
      method:
        "Each retained FIA state invasive symbol resolves through the plant dictionary to the same exact catalog scientific name",
      target_scientific_name: representativeMapping.scientificName,
      source_scientific_name: representativeMapping.scientificName,
      source_taxon_key: sourceSymbols.join("|"),
    },
    geography_match: {
      method:
        "Explicit FIA STATECD plus zero-padded COUNTYCD matched one active county equivalent; coordinates and inferred crosswalks were not used",
      source_state: state.stateName,
      source_county: input.pair.countyName,
      county_fips: input.pair.countyFips,
    },
    temporal_scope:
      "FIA invasive subplot observation years retained in the hash-pinned national snapshot.",
    spatial_scope:
      `One or more FIA invasive subplot species records explicitly identify county FIPS ${input.pair.countyFips}.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "FIA is a sampled forest inventory and does not establish complete county distribution.",
      "Missing FIA detections never support verified absence or survey non-detection.",
      "This assertion records presence only at the county scope supplied by explicit FIA codes.",
    ],
    notes: [
      `FIA symbols: ${sourceSymbols.join(", ")}.`,
      `Supporting source rows: ${sortedRows.length}.`,
      `Supporting record identity hash: ${payload.supportingRecordIdsSha256}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("usfs-fia-review", {
      assertionId,
      decision: "accepted",
    }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${FIA_ADAPTER_ID}@${FIA_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: FIA_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    references: { assertion_event_id: assertionId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "hash-pinned-first-party-snapshot",
      "exact-one-to-one-catalog-match",
      "explicit-active-county-fips",
      "positive-detection-row",
    ],
    notes: [
      "The assertion passed the registered FIA source, exact taxon, stable identity, and explicit active county gates.",
      "The review publishes recorded-present evidence only.",
    ],
  };
  return { assertion, review };
}

export function replayNationalFiaState(input: {
  context: SourceAdapterContext;
  observationRows: FiaObservationRow[];
  mappings: FiaTaxonMapping[];
  mappingReconciliation: FiaMappingReconciliation;
  completedAt: string;
  headerOnly: boolean;
}): FiaReplayResult {
  const { context, completedAt } = input;
  assert(context.sourceId === FIA_SOURCE_ID, "FIA replay received the wrong source.");
  assert(context.requestedPairs.length > 0, "FIA replay requires requested pairs.");
  const state = getStateDefinition(context.stateCode);
  assert(state?.nationalV1Scope, `FIA state ${context.stateCode} is outside national v1.`);
  const counties = listCountyEquivalents(context.stateCode);
  const countyByFips = new Map(counties.map((entry) => [entry.countyFips, entry]));
  const mappingBySymbol = new Map(
    input.mappings.map((entry) => [entry.symbol, entry]),
  );
  const mappingBySpecies = new Map<string, FiaTaxonMapping[]>();
  for (const mapping of input.mappings) {
    const entries = mappingBySpecies.get(mapping.speciesId) ?? [];
    entries.push(mapping);
    mappingBySpecies.set(mapping.speciesId, entries);
  }
  assert(
    mappingBySymbol.size === input.mappings.length,
    "FIA source symbols are not unique.",
  );
  for (const pair of context.requestedPairs) {
    assert(countyByFips.has(pair.countyFips), `FIA pair uses inactive FIPS ${pair.countyFips}.`);
    const mappings = mappingBySpecies.get(pair.speciesId);
    assert(mappings?.length, `FIA pair uses unmapped species ${pair.speciesId}.`);
    assert(
      mappings.every((mapping) =>
        mapping.scientificName === pair.scientificName
      ),
      `FIA pair scientific name changed for ${pair.speciesId}.`,
    );
  }
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const rejections: ResearchRejectionRecord[] = [];
  const outcomes: ResearchPairOutcome[] = [];
  const errors: SourceAdapterResult["errors"] = [];
  const acceptedByPair = new Map<string, FiaObservationRow[]>();
  const seenCn = new Map<string, string>();
  const blockingSpeciesIds = new Set<string>();
  const blockingPairKeys = new Set<string>();
  const rejectionIdsBySpecies = new Map<string, string[]>();
  let applicableSourceRows = 0;
  let acceptedSourceRows = 0;
  let malformedRows = 0;
  let stateMismatchRows = 0;
  let nonApplicableSymbolRows = 0;
  let unmappedSymbolRows = 0;
  let invalidGeographyRows = 0;
  let retiredGeographyRows = 0;
  let duplicateRecordIds = 0;
  let conflictingRecordIds = 0;

  for (const [index, row] of input.observationRows.entries()) {
    const symbol = rowSymbol(row);
    const mapping = mappingBySymbol.get(symbol);
    if (!symbol) {
      malformedRows += 1;
      continue;
    }
    if (!mapping) {
      if (input.mappings.some((entry) => entry.symbol === symbol)) {
        nonApplicableSymbolRows += 1;
      } else {
        unmappedSymbolRows += 1;
      }
      continue;
    }
    applicableSourceRows += 1;
    const rowStateFips = normalizedStateCode(row.STATECD);
    if (rowStateFips !== state.stateFips) {
      stateMismatchRows += 1;
      const rejected = rejection({
          context,
          speciesId: mapping.speciesId,
          candidateTaxon: symbol,
          candidateGeography: `${row.STATECD ?? ""}:${row.COUNTYCD ?? ""}`,
          countyFips: null,
          locator: row.CN || `row:${index + 1}`,
          reason: "outside-scope",
          notes: [
            `The retained state file row has STATECD ${row.STATECD ?? "missing"}, expected ${state.stateFips}.`,
          ],
          completedAt,
        });
      rejections.push(rejected);
      rejectionIdsBySpecies.set(
        mapping.speciesId,
        [...(rejectionIdsBySpecies.get(mapping.speciesId) ?? []), rejected.rejection_id],
      );
      continue;
    }
    const countyCode = normalizedCountyCode(row.COUNTYCD);
    if (!countyCode) {
      invalidGeographyRows += 1;
      const rejected = rejection({
          context,
          speciesId: mapping.speciesId,
          candidateTaxon: symbol,
          candidateGeography: row.COUNTYCD ?? null,
          countyFips: null,
          locator: row.CN || `row:${index + 1}`,
          reason: "geography-missing",
          notes: ["The FIA row lacks a usable explicit COUNTYCD."],
          completedAt,
        });
      rejections.push(rejected);
      blockingSpeciesIds.add(mapping.speciesId);
      rejectionIdsBySpecies.set(
        mapping.speciesId,
        [...(rejectionIdsBySpecies.get(mapping.speciesId) ?? []), rejected.rejection_id],
      );
      continue;
    }
    const countyFips = `${state.stateFips}${countyCode}`;
    if (!countyByFips.has(countyFips)) {
      const retired = countyFips === "02261";
      if (retired) retiredGeographyRows += 1;
      else invalidGeographyRows += 1;
      const rejected = rejection({
          context,
          speciesId: mapping.speciesId,
          candidateTaxon: symbol,
          candidateGeography: countyFips,
          countyFips: null,
          locator: row.CN || `row:${index + 1}`,
          reason: retired ? "retired-geography" : "geography-ambiguous",
          notes: [
            `Explicit FIA county FIPS ${countyFips} is not an active county equivalent for ${context.stateCode}.`,
            "No automatic county crosswalk or coordinate routing was used.",
          ],
          completedAt,
        });
      rejections.push(rejected);
      blockingSpeciesIds.add(mapping.speciesId);
      rejectionIdsBySpecies.set(
        mapping.speciesId,
        [...(rejectionIdsBySpecies.get(mapping.speciesId) ?? []), rejected.rejection_id],
      );
      continue;
    }
    const cn = row.CN?.trim();
    if (cn) {
      const rowHash = sha256(stableJson(row));
      const prior = seenCn.get(cn);
      if (prior) {
        if (prior === rowHash) {
          duplicateRecordIds += 1;
          const rejected = rejection({
            context,
            speciesId: mapping.speciesId,
            candidateTaxon: symbol,
            candidateGeography: countyFips,
            countyFips,
            locator: cn,
            reason: "duplicate",
            notes: ["An identical repeated FIA CN row was collapsed."],
            completedAt,
          });
          rejections.push(rejected);
          rejectionIdsBySpecies.set(
            mapping.speciesId,
            [...(rejectionIdsBySpecies.get(mapping.speciesId) ?? []), rejected.rejection_id],
          );
          continue;
        }
        conflictingRecordIds += 1;
        errors.push({
          code: "conflicting-source-record-id",
          message: `FIA CN ${cn} has conflicting payloads.`,
          retryable: false,
        });
        const rejected = rejection({
            context,
            speciesId: mapping.speciesId,
            candidateTaxon: symbol,
            candidateGeography: countyFips,
            countyFips,
            locator: cn,
            reason: "source-contradiction",
            notes: ["The same stable FIA CN appears with conflicting payloads."],
            completedAt,
          });
        rejections.push(rejected);
        blockingPairKeys.add(pairKey(countyFips, mapping.speciesId));
        rejectionIdsBySpecies.set(
          mapping.speciesId,
          [...(rejectionIdsBySpecies.get(mapping.speciesId) ?? []), rejected.rejection_id],
        );
        continue;
      }
      seenCn.set(cn, rowHash);
    }
    acceptedSourceRows += 1;
    const key = pairKey(countyFips, mapping.speciesId);
    const rows = acceptedByPair.get(key) ?? [];
    rows.push(row);
    acceptedByPair.set(key, rows);
  }

  let evidenceFoundPairs = 0;
  let noQualifyingEvidencePairs = 0;
  let blockedPairs = 0;
  for (const pair of [...context.requestedPairs].sort(
    (left, right) =>
      compareText(left.countyFips, right.countyFips) ||
      compareText(left.speciesId, right.speciesId),
  )) {
    const key = pairKey(pair.countyFips, pair.speciesId);
    const rows = acceptedByPair.get(key) ?? [];
    let status: ResearchPairOutcome["status"];
    let scopeComplete: boolean;
    let assertionIds: string[] = [];
    if (rows.length > 0) {
      const emitted = assertionAndReview({
        context,
        mappings: mappingBySpecies.get(pair.speciesId)!,
        pair,
        rows,
        completedAt,
      });
      assertions.push(emitted.assertion);
      reviews.push(emitted.review);
      assertionIds = [emitted.assertion.eventId];
      status = "evidence-found";
      scopeComplete = true;
      evidenceFoundPairs += 1;
    } else if (
      input.headerOnly ||
      blockingSpeciesIds.has(pair.speciesId) ||
      blockingPairKeys.has(key)
    ) {
      status = "blocked";
      scopeComplete = false;
      blockedPairs += 1;
    } else {
      status = "no-qualifying-evidence";
      scopeComplete = true;
      noQualifyingEvidencePairs += 1;
    }
    outcomes.push({
      schemaVersion: 1,
      outcome_id: contentId("usfs-fia-outcome", {
        runId: context.runId,
        pair: key,
        status,
        assertionIds,
      }),
      run_id: context.runId,
      source_id: FIA_SOURCE_ID,
      state_code: context.stateCode,
      county_fips: pair.countyFips,
      species_id: pair.speciesId,
      status,
      scope_complete: scopeComplete,
      recorded_at: completedAt,
      assertion_event_ids: assertionIds,
      rejection_ids: status === "blocked"
        ? [...new Set(rejectionIdsBySpecies.get(pair.speciesId) ?? [])].sort(
            compareText,
          )
        : [],
      query_urls: [
        fiaArtifactUrl(fiaStateArtifactName(context.stateCode)),
        FIA_DATAMART_URL,
      ],
      notes: input.headerOnly
        ? [
            "The retained FIA state artifact contains only its header, so the applicable source screen is blocked.",
            "No absence or survey non-detection was inferred.",
          ]
        : status === "blocked"
          ? [
              "One or more positive FIA candidates for this species could not be assigned safely to an active county scope.",
              "The pair remains blocked and no absence or survey non-detection was inferred.",
            ]
        : status === "evidence-found"
          ? [
              `The complete retained FIA state snapshot contains ${rows.length} qualifying detection row(s) for this pair.`,
              "The published assertion supports recorded-present only.",
            ]
          : [
              "The complete retained FIA state snapshot and state invasive reference were screened without a qualifying row for this pair.",
              "This source-silence outcome changes research status only and is not verified absence or survey non-detection.",
            ],
    });
  }
  return {
    completedAt,
    assertions,
    reviews,
    rejections,
    outcomes,
    artifacts: [],
    upstreamRequests: [],
    candidateRecordCount: input.observationRows.length,
    duplicateRecordCount: duplicateRecordIds,
    errors,
    warnings: [
      ...(input.headerOnly
        ? [
            `${context.stateCode} has a header-only FIA state artifact; all applicable pairs remain blocked.`,
          ]
        : []),
      ...(retiredGeographyRows > 0
        ? [
            `${retiredGeographyRows} retired-geography FIA rows were rejected without crosswalks.`,
          ]
        : []),
      "FIA source silence never creates verified absence or survey non-detection.",
    ],
    mappings: input.mappings,
    selectedRowsSha256: sha256(
      stableJson(
        [...acceptedByPair.entries()]
          .map(([key, rows]) => ({
            pairKey: key,
            recordIds: rows.map((row) => row.CN ?? "").sort(compareText),
          }))
          .sort((left, right) => compareText(left.pairKey, right.pairKey)),
      ),
    ),
    reconciliation: {
      ...input.mappingReconciliation,
      source_rows: input.observationRows.length,
      applicable_source_rows: applicableSourceRows,
      accepted_source_rows: acceptedSourceRows,
      malformed_rows: malformedRows,
      state_mismatch_rows: stateMismatchRows,
      non_applicable_symbol_rows: nonApplicableSymbolRows,
      unmapped_symbol_rows: unmappedSymbolRows,
      invalid_geography_rows: invalidGeographyRows,
      retired_geography_rows: retiredGeographyRows,
      duplicate_record_ids: duplicateRecordIds,
      conflicting_record_ids: conflictingRecordIds,
      assertion_pairs: assertions.length,
      evidence_found_pairs: evidenceFoundPairs,
      no_qualifying_evidence_pairs: noQualifyingEvidencePairs,
      blocked_pairs: blockedPairs,
      rejection_events: rejections.length,
    },
  };
}
