import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import type { ResearchSourceAdapter, SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import type { EvidenceReviewEvent, ResearchPairOutcome, RunEvidenceAssertionEvent } from "@/lib/research/types";
import { getStateDefinition, listCountyEquivalents, resolveCountyEquivalent } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";
import { type SpecimenMetadataRecovery, type SpecimenRecoveryWitness, validateSpecimenRecoveryWitness } from "../specimen-record-metadata";

export const CPNWH_SOURCE_ID = "cpnwh-preserved-specimens" as const;
export const CPNWH_ADAPTER_ID = "cpnwh-preserved-specimens-snapshot" as const;
export const CPNWH_ADAPTER_VERSION = "1.1.0" as const;
export const CPNWH_DATASET_URL = "https://www.pnwherbaria.org/data/getdataset.php?File=CPNWH_DwCA.zip" as const;
export const CPNWH_POLICY_URL = "https://www.pnwherbaria.org/data/datausagepolicy.php" as const;
export const CPNWH_ARCHIVE_SHA256 = "cfb9ae60c2780734426367fd5371baa2262ac97b25214b33ba07f04a5d6e4180" as const;
export const CPNWH_OCCURRENCE_SHA256 = "2e089934fd1d9d1c9791f793593b5f2e4af8006fdd1c44196b14bd2b8194d8b5" as const;
export const CPNWH_CC0_LICENSE = "https://creativecommons.org/publicdomain/zero/1.0/" as const;

export type CpnwhTarget = SpecimenRecoveryWitness & {
  pairKey: string;
  recordId: string;
  occurrenceId: string;
  countyFips: string;
  stateCode: string;
  sourceState: string;
  sourceCounty: string;
  speciesId: string;
  scientificName: string;
  eventDate: string | null;
  year: number | null;
  institutionCode: string;
  collectionCode: string;
  catalogNumber: string;
  license: typeof CPNWH_CC0_LICENSE;
};

type CpnwhParameters = {
  stateCode: string;
  mode: "retained-archive-witnesses";
  datasetUrl: typeof CPNWH_DATASET_URL;
  usagePolicyUrl: typeof CPNWH_POLICY_URL;
  datasetLastModified: "Thu, 04 Jun 2026 19:05:39 GMT";
  datasetEtag: '"2045cebe-65454012e379b"';
  archiveBytes: 541445822;
  archiveSha256: typeof CPNWH_ARCHIVE_SHA256;
  occurrenceBytes: 2132017127;
  occurrenceSha256: typeof CPNWH_OCCURRENCE_SHA256;
  archiveAcquiredAt: string;
  preflightEvaluationId: string;
  targetPairSetSha256: string;
  metadataRecovery?: SpecimenMetadataRecovery;
  targets: CpnwhTarget[];
  candidatePairs: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function pairKey(value: { countyFips: string; speciesId: string }) {
  return `${value.countyFips}:${value.speciesId}`;
}

function parseParameters(context: SourceAdapterContext) {
  const parameters = context.parameters as unknown as CpnwhParameters;
  assert(parameters.stateCode === context.stateCode, "CPNWH state differs from the requested state.");
  assert(parameters.mode === "retained-archive-witnesses", "CPNWH acquisition mode differs.");
  assert(parameters.datasetUrl === CPNWH_DATASET_URL, "CPNWH dataset URL differs.");
  assert(parameters.usagePolicyUrl === CPNWH_POLICY_URL, "CPNWH usage policy URL differs.");
  assert(parameters.datasetLastModified === "Thu, 04 Jun 2026 19:05:39 GMT", "CPNWH Last-Modified identity differs.");
  assert(parameters.datasetEtag === '"2045cebe-65454012e379b"', "CPNWH ETag identity differs.");
  assert(parameters.archiveBytes === 541445822, "CPNWH archive byte count differs.");
  assert(parameters.archiveSha256 === CPNWH_ARCHIVE_SHA256, "CPNWH archive SHA-256 differs.");
  assert(parameters.occurrenceBytes === 2132017127, "CPNWH occurrence byte count differs.");
  assert(parameters.occurrenceSha256 === CPNWH_OCCURRENCE_SHA256, "CPNWH occurrence SHA-256 differs.");
  assert(Number.isFinite(Date.parse(parameters.archiveAcquiredAt)), "CPNWH acquisition timestamp is invalid.");
  assert(/^cpnwh-preserved-specimens-preflight-[0-9]{8}-r[0-9]+$/u.test(parameters.preflightEvaluationId), "CPNWH preflight identity is invalid.");
  assert(/^[0-9a-f]{64}$/u.test(parameters.targetPairSetSha256), "CPNWH target pair hash is invalid.");
  assert(Array.isArray(parameters.targets) && parameters.targets.length > 0 && parameters.targets.length <= 5000, "CPNWH target count is invalid.");
  const candidatePairs = [...parameters.candidatePairs].sort(compareText);
  const requestedPairs = context.requestedPairs.map(pairKey).sort(compareText);
  const targetPairs = parameters.targets.map((target) => target.pairKey).sort(compareText);
  assert(stableJson(candidatePairs) === stableJson(requestedPairs), "CPNWH candidates differ from the requested pairs.");
  assert(stableJson(candidatePairs) === stableJson(targetPairs), "CPNWH targets differ from the requested pairs.");
  assert(sha256(candidatePairs.join("\n")) === parameters.targetPairSetSha256, "CPNWH target pair hash differs.");
  assert(new Set(parameters.targets.map((target) => parameters.metadataRecovery ? target.identityKey : target.occurrenceId)).size === parameters.targets.length, "CPNWH witness identities are not unique within the state plan.");
  if (parameters.metadataRecovery) {
    const recovery = parameters.metadataRecovery;
    assert(recovery.version === 1, "CPNWH metadata recovery version differs.");
    assert(/^[0-9a-f]{64}$/u.test(recovery.preflightSha256), "CPNWH preflight hash is invalid.");
    assert(sha256(stableJson(parameters.targets)) === recovery.witnessSetSha256, "CPNWH recovery witness set hash differs.");
    assert(Date.parse(parameters.archiveAcquiredAt) <= Date.parse(recovery.extractedAt)
      && Date.parse(recovery.extractedAt) <= Date.parse(context.runStartedAt), "CPNWH recovery extraction chronology differs.");
  }
  return parameters;
}

function validateTarget(context: SourceAdapterContext, target: CpnwhTarget, activeCountyFips: Set<string>, recovery?: SpecimenMetadataRecovery) {
  assert(target.pairKey === pairKey(target), `CPNWH target pair identity differs for ${target.pairKey}.`);
  assert(target.stateCode === context.stateCode, `CPNWH target state differs for ${target.pairKey}.`);
  assert(target.sourceState.trim().length > 0 && target.sourceCounty.trim().length > 0, `CPNWH source geography is missing for ${target.pairKey}.`);
  assert(activeCountyFips.has(target.countyFips), `CPNWH target county is inactive for ${target.pairKey}.`);
  assert(target.license === CPNWH_CC0_LICENSE, `CPNWH witness license differs for ${target.pairKey}.`);
  if (recovery) {
    validateSpecimenRecoveryWitness(target, recovery);
    const row = target.sourceRow!;
    const state = getStateDefinition(target.stateCode)!;
    assert([state.stateName, ...Object.values(state.sourceStateNames)].some((name) => normalizedText(name) === normalizedText(row.stateProvince)), "CPNWH raw source state differs.");
    assert(normalizedText(row.countryCode ?? "") === "us" || ["united states", "united states of america", "u.s.a.", "usa"].includes(normalizedText(row.country ?? "")), "CPNWH raw country differs.");
    assert(row.license?.trim() === target.license, "CPNWH raw witness license differs.");
    assert(normalizedText(row.basisOfRecord).replace(/[^a-z]/gu, "") === "preservedspecimen", "CPNWH raw witness is not a preserved specimen.");
    assert(normalizedText(`${row.genus ?? ""} ${row.specificEpithet ?? ""}`) === normalizedText(target.scientificName)
      && normalizedText(row.taxonRank) === "species" && !normalizedText(row.identificationQualifier ?? ""), "CPNWH raw taxonomy differs.");
    const geography = resolveCountyEquivalent({ stateCode: target.stateCode, countyName: row.county, sourceId: CPNWH_SOURCE_ID });
    assert(geography.status === "resolved" && geography.county.countyFips === target.countyFips
      && row.stateProvince?.trim() === target.sourceState && row.county?.trim() === target.sourceCounty, "CPNWH raw geography differs.");
    assert(!/\b(captive|captivity|cultivated|cultivation|cultured|garden|greenhouse|managed|nursery|planted|planting|arboretum|botanical garden|campus landscape|landscaped|zoo|aquarium)\b/iu.test(
      [row.locality, row.occurrenceRemarks, row.habitat, row.establishmentMeans].filter(Boolean).join(" ")), "CPNWH cultivated or captive witness.");
  } else {
    assert(/^\d+$/u.test(target.recordId), `CPNWH portal record ID is invalid for ${target.pairKey}.`);
    assert(/^[A-Za-z0-9:._{}\/-]{20,200}$/u.test(target.occurrenceId), `CPNWH occurrence ID is invalid for ${target.pairKey}.`);
    assert(target.year !== null && Number.isInteger(target.year) && target.year >= 1500 && target.year <= 2026, `CPNWH event year is invalid for ${target.pairKey}.`);
    assert(target.eventDate !== null && target.eventDate.trim().length > 0, `CPNWH event date is missing for ${target.pairKey}.`);
    assert(!target.sourceRow && !target.identityKey && !target.sourceRowSha256, "CPNWH recovery fields require metadata recovery mode.");
  }
  const requested = context.requestedPairs.find((pair) => pairKey(pair) === target.pairKey);
  assert(requested, `CPNWH target is not requested: ${target.pairKey}.`);
  assert(normalizedText(requested.scientificName) === normalizedText(target.scientificName), `CPNWH target taxonomy differs for ${target.pairKey}.`);
}

function buildAssertionAndReview(context: SourceAdapterContext, target: CpnwhTarget, completedAt: string, archiveAcquiredAt: string) {
  const normalizedPayloadHash = sha256(stableJson(target));
  const assertionEventId = contentId("cpnwh-assertion", {
    runId: context.runId,
    pairKey: target.pairKey,
    occurrenceId: target.occurrenceId,
    normalizedPayloadHash,
  });
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId: assertionEventId,
    event_type: "evidence.asserted",
    created_at: completedAt,
    actor_type: "adapter",
    actor_id: `${CPNWH_ADAPTER_ID}@${CPNWH_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: CPNWH_SOURCE_ID,
    state_code: context.stateCode,
    county_fips: target.countyFips,
    species_id: target.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "point",
    source_record_id: target.occurrenceId ? `cpnwh:${target.occurrenceId}` : `cpnwh-record-id:${CPNWH_ARCHIVE_SHA256}:${target.recordId}`,
    source_url: CPNWH_DATASET_URL,
    source_record_date: target.eventDate,
    retrieved_at: archiveAcquiredAt,
    taxon_match: {
      method: "Exact source genus plus specific epithet to one two-token Project Isitusa catalog plant binomial; source rank species and blank identification qualifier required",
      target_scientific_name: target.scientificName,
      source_scientific_name: target.scientificName,
      source_taxon_key: null,
    },
    geography_match: {
      method: "Exact provider state and county text resolved to one active county-equivalent registry entry; coordinates were not used",
      source_state: target.sourceState,
      source_county: target.sourceCounty,
      county_fips: target.countyFips,
    },
    temporal_scope: target.eventDate === null
      ? "Historical preserved specimen; normalized collection date unknown. Original narrative and any date bounds remain in the retained source row. Acquisition does not establish current occurrence."
      : `Preserved specimen event recorded as ${target.eventDate}; validated event year ${target.year}.`,
    spatial_scope: `Historical physical specimen occurrence assigned from explicit provider county geography in ${target.stateCode}; not a complete inventory of the county.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "Historical preserved specimen evidence supports recorded presence only.",
      "It does not establish current abundance, countywide distribution, or current establishment.",
      "Source silence, excluded cultivated records, missing geography, and all rejected rows create no absence or non-detection claim.",
    ],
    notes: [
      `CPNWH portal record ${target.recordId || "not supplied"}; occurrenceID ${target.occurrenceId || "not supplied; archive-bound core identity used"}.`,
      `Institution ${target.institutionCode || "unspecified"}; collection ${target.collectionCode || "unspecified"}; catalog ${target.catalogNumber || "unspecified"}.`,
      `Record license ${target.license}; archive ${CPNWH_ARCHIVE_SHA256}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("cpnwh-review", { assertionEventId }),
    event_type: "evidence.reviewed",
    created_at: completedAt,
    actor_type: "adapter",
    actor_id: `${CPNWH_ADAPTER_ID}@${CPNWH_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: CPNWH_SOURCE_ID,
    state_code: context.stateCode,
    county_fips: target.countyFips,
    species_id: target.speciesId,
    references: { assertion_event_id: assertionEventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "retained-cc0-archive",
      target.occurrenceId ? "stable-occurrence-identity" : "stable-archive-bound-core-identity",
      "preserved-specimen-basis",
      "exact-catalog-binomial",
      "exact-active-county-name",
      target.eventDate === null ? "normalized-collection-date-unknown" : "valid-event-year",
      "cultivation-text-excluded",
      "occurrence-only-semantics",
    ],
    notes: [
      "The witness was selected by the complete archive preflight and retained inside this immutable run.",
      "Publication is limited to historical recorded presence; no source omission or rejection is negative evidence.",
    ],
  };
  return { assertion, review };
}

export async function runCpnwhPreservedSpecimens(context: SourceAdapterContext): Promise<SourceAdapterResult> {
  assert(context.sourceId === CPNWH_SOURCE_ID, "CPNWH adapter received the wrong source.");
  const parameters = parseParameters(context);
  assert(getStateDefinition(context.stateCode)?.nationalV1Scope, `CPNWH state ${context.stateCode} is not registered.`);
  const activeCountyFips = new Set(listCountyEquivalents(context.stateCode).map((county) => county.countyFips));
  const completedAt = new Date().toISOString();
  assert(Date.parse(completedAt) >= Date.parse(context.runStartedAt), "CPNWH completion precedes run start.");
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const outcomes: ResearchPairOutcome[] = [];
  for (const target of [...parameters.targets].sort((left, right) => compareText(left.pairKey, right.pairKey))) {
    validateTarget(context, target, activeCountyFips, parameters.metadataRecovery);
    const accepted = buildAssertionAndReview(context, target, completedAt, parameters.archiveAcquiredAt);
    assertions.push(accepted.assertion);
    reviews.push(accepted.review);
    outcomes.push({
      schemaVersion: 1,
      outcome_id: contentId("cpnwh-outcome", { runId: context.runId, pairKey: target.pairKey }),
      run_id: context.runId,
      source_id: CPNWH_SOURCE_ID,
      state_code: context.stateCode,
      county_fips: target.countyFips,
      species_id: target.speciesId,
      status: "evidence-found",
      scope_complete: true,
      recorded_at: completedAt,
      assertion_event_ids: [accepted.assertion.eventId],
      rejection_ids: [],
      query_urls: [CPNWH_DATASET_URL],
      notes: ["One retained CC0 preserved-specimen witness supports historical recorded presence for this county-species pair."],
    });
  }
  const identity = {
    datasetUrl: parameters.datasetUrl,
    usagePolicyUrl: parameters.usagePolicyUrl,
    datasetLastModified: parameters.datasetLastModified,
    datasetEtag: parameters.datasetEtag,
    archiveBytes: parameters.archiveBytes,
    archiveSha256: parameters.archiveSha256,
    occurrenceBytes: parameters.occurrenceBytes,
    occurrenceSha256: parameters.occurrenceSha256,
    archiveAcquiredAt: parameters.archiveAcquiredAt,
    preflightEvaluationId: parameters.preflightEvaluationId,
    targetPairSetSha256: parameters.targetPairSetSha256,
    ...(parameters.metadataRecovery ? { metadataRecovery: parameters.metadataRecovery } : {}),
  };
  return {
    completedAt,
    assertions,
    reviews,
    rejections: [],
    outcomes,
    artifacts: [
      { filename: "cpnwh-source-identity.json", mediaType: "application/json", contents: `${JSON.stringify(identity, null, 2)}\n` },
      { filename: "cpnwh-retained-witnesses.json.gz", mediaType: "application/gzip", contents: gzipSync(Buffer.from(stableJson(parameters.targets))) },
    ],
    upstreamRequests: [],
    candidateRecordCount: parameters.targets.length,
    duplicateRecordCount: 0,
    errors: [],
    warnings: [
      "CPNWH physical specimens support historical recorded presence only.",
      "The complete source archive was screened offline; only one strict retained witness per eligible county-species pair is persisted in each immutable run.",
      "Source silence and rejected rows never support absence or non-detection.",
    ],
  };
}

export const cpnwhPreservedSpecimensAdapter: ResearchSourceAdapter = {
  adapterId: CPNWH_ADAPTER_ID,
  adapterVersion: CPNWH_ADAPTER_VERSION,
  sourceId: CPNWH_SOURCE_ID,
  run: runCpnwhPreservedSpecimens,
};
