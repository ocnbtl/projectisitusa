import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import type { ResearchSourceAdapter, SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import type { EvidenceReviewEvent, ResearchPairOutcome, RunEvidenceAssertionEvent } from "@/lib/research/types";
import { getStateDefinition, listCountyEquivalents } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const NYBG_SOURCE_ID = "nybg-preserved-specimens" as const;
export const TORCH_BRIT_SOURCE_ID = "torch-brit-preserved-specimens" as const;
export const RETAINED_HERBARIUM_ADAPTER_VERSION = "1.0.0" as const;
export const NYBG_DATASET_URL = "https://sweetgum.nybg.org:8443/ipt/archive.do?r=occurrences" as const;
export const NYBG_METADATA_URL = "https://sweetgum.nybg.org:8443/ipt/eml.do?r=occurrences" as const;
export const NYBG_POLICY_URL = "https://sweetgum.nybg.org/science/digital-collections/" as const;
export const NYBG_ARCHIVE_SHA256 = "84a5f69d746f1ec44fa89c63a9baf0fc5cb923dbb9330f91b6ac8660b159a483" as const;
export const TORCH_BRIT_DATASET_URL = "https://portal.torcherbaria.org/portal/content/dwca/BRIT-BRIT_DwC-A.zip" as const;
export const TORCH_BRIT_METADATA_URL = "https://portal.torcherbaria.org/portal/collections/datasets/emlhandler.php?collid=370" as const;
export const TORCH_BRIT_POLICY_URL = "https://portal.torcherbaria.org/portal/includes/usagepolicy.php" as const;
export const TORCH_BRIT_ARCHIVE_SHA256 = "79044ab7da4073020fc2d90a83e4c34391d68f2d4ed3302e5ad33bb16cb37fcf" as const;
export const CC0_LICENSE = "http://creativecommons.org/publicdomain/zero/1.0/" as const;

export type RetainedHerbariumTarget = {
  pairKey: string;
  recordId: string;
  occurrenceId: string;
  countyFips: string;
  stateCode: string;
  sourceState: string;
  sourceCounty: string;
  speciesId: string;
  scientificName: string;
  eventDate: string;
  year: number;
  institutionCode: string;
  collectionCode: string;
  catalogNumber: string;
  rights?: string;
  rightsHolder: string;
  references: string;
};

type RetainedHerbariumParameters = {
  stateCode: string;
  mode: "retained-archive-witnesses";
  profile: "nybg" | "torch-brit";
  datasetUrl: string;
  metadataUrl: string;
  usagePolicyUrl: string;
  datasetVersion: string;
  publicationDate: string;
  datasetLastModified: string;
  datasetEtag: string | null;
  archiveBytes: number;
  archiveSha256: string;
  occurrenceBytes: number;
  occurrenceSha256: string;
  archiveAcquiredAt: string;
  preflightEvaluationId: string;
  targetPairSetSha256: string;
  targets: RetainedHerbariumTarget[];
  candidatePairs: string[];
};

type Profile = {
  profile: RetainedHerbariumParameters["profile"];
  sourceId: typeof NYBG_SOURCE_ID | typeof TORCH_BRIT_SOURCE_ID;
  adapterId: "nybg-preserved-specimens-snapshot" | "torch-brit-preserved-specimens-snapshot";
  label: "NYBG" | "TORCH BRIT";
  datasetUrl: string;
  metadataUrl: string;
  policyUrl: string;
  datasetVersion: string;
  publicationDate: string;
  datasetLastModified: string;
  datasetEtag: string | null;
  archiveBytes: number;
  archiveSha256: string;
  occurrenceBytes: number;
  occurrenceSha256: string;
};

const NYBG_PROFILE: Profile = {
  profile: "nybg",
  sourceId: NYBG_SOURCE_ID,
  adapterId: "nybg-preserved-specimens-snapshot",
  label: "NYBG",
  datasetUrl: NYBG_DATASET_URL,
  metadataUrl: NYBG_METADATA_URL,
  policyUrl: NYBG_POLICY_URL,
  datasetVersion: "1.103",
  publicationDate: "2026-08-25",
  datasetLastModified: "Tue, 25 Aug 2026 05:05:10 GMT",
  datasetEtag: null,
  archiveBytes: 736185551,
  archiveSha256: NYBG_ARCHIVE_SHA256,
  occurrenceBytes: 3243235286,
  occurrenceSha256: "69c609fcb3da364149784f9afa9b78a6be61b95318b8e7e768244c1bebc35154",
};

const TORCH_BRIT_PROFILE: Profile = {
  profile: "torch-brit",
  sourceId: TORCH_BRIT_SOURCE_ID,
  adapterId: "torch-brit-preserved-specimens-snapshot",
  label: "TORCH BRIT",
  datasetUrl: TORCH_BRIT_DATASET_URL,
  metadataUrl: TORCH_BRIT_METADATA_URL,
  policyUrl: TORCH_BRIT_POLICY_URL,
  datasetVersion: "2026-09-03",
  publicationDate: "2026-09-03",
  datasetLastModified: "Thu, 03 Sep 2026 16:50:07 GMT",
  datasetEtag: '"7c57d13-65a96f1b83eed"',
  archiveBytes: 130383123,
  archiveSha256: TORCH_BRIT_ARCHIVE_SHA256,
  occurrenceBytes: 539901972,
  occurrenceSha256: "9c8721ef160f19a322a1366e3df82f5068aebdf352c3808993b6e45daaf51e2e",
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

function assertionCountyName(target: RetainedHerbariumTarget, profile: Profile) {
  if (profile.profile === "nybg") {
    return target.sourceCounty.trim().replace(/\s+Co\.?$/iu, " County");
  }
  return target.sourceCounty.trim();
}

function parseParameters(context: SourceAdapterContext, profile: Profile) {
  const parameters = context.parameters as unknown as RetainedHerbariumParameters;
  assert(parameters.stateCode === context.stateCode, `${profile.label} state differs from the requested state.`);
  assert(parameters.profile === profile.profile, `${profile.label} profile differs.`);
  assert(parameters.mode === "retained-archive-witnesses", `${profile.label} acquisition mode differs.`);
  assert(parameters.datasetUrl === profile.datasetUrl, `${profile.label} dataset URL differs.`);
  assert(parameters.metadataUrl === profile.metadataUrl, `${profile.label} metadata URL differs.`);
  assert(parameters.usagePolicyUrl === profile.policyUrl, `${profile.label} usage policy URL differs.`);
  assert(parameters.datasetVersion === profile.datasetVersion, `${profile.label} dataset version differs.`);
  assert(parameters.publicationDate === profile.publicationDate, `${profile.label} publication date differs.`);
  assert(parameters.datasetLastModified === profile.datasetLastModified, `${profile.label} Last-Modified identity differs.`);
  assert(parameters.datasetEtag === profile.datasetEtag, `${profile.label} ETag identity differs.`);
  assert(parameters.archiveBytes === profile.archiveBytes, `${profile.label} archive byte count differs.`);
  assert(parameters.archiveSha256 === profile.archiveSha256, `${profile.label} archive SHA-256 differs.`);
  assert(parameters.occurrenceBytes === profile.occurrenceBytes, `${profile.label} occurrence byte count differs.`);
  assert(parameters.occurrenceSha256 === profile.occurrenceSha256, `${profile.label} occurrence SHA-256 differs.`);
  assert(Number.isFinite(Date.parse(parameters.archiveAcquiredAt)), `${profile.label} acquisition timestamp is invalid.`);
  assert(new RegExp(`^${profile.sourceId}-preflight-[0-9]{8}-r[0-9]+$`, "u").test(parameters.preflightEvaluationId), `${profile.label} preflight identity is invalid.`);
  assert(/^[0-9a-f]{64}$/u.test(parameters.targetPairSetSha256), `${profile.label} target pair hash is invalid.`);
  assert(Array.isArray(parameters.targets) && parameters.targets.length > 0 && parameters.targets.length <= 5000, `${profile.label} target count is invalid.`);
  const candidatePairs = [...parameters.candidatePairs].sort(compareText);
  const requestedPairs = context.requestedPairs.map(pairKey).sort(compareText);
  const targetPairs = parameters.targets.map((target) => target.pairKey).sort(compareText);
  assert(stableJson(candidatePairs) === stableJson(requestedPairs), `${profile.label} candidates differ from requested pairs.`);
  assert(stableJson(candidatePairs) === stableJson(targetPairs), `${profile.label} targets differ from requested pairs.`);
  assert(sha256(candidatePairs.join("\n")) === parameters.targetPairSetSha256, `${profile.label} target pair hash differs.`);
  assert(new Set(parameters.targets.map((target) => target.occurrenceId)).size === parameters.targets.length, `${profile.label} occurrence identities repeat within the state plan.`);
  return parameters;
}

function validateTarget(context: SourceAdapterContext, target: RetainedHerbariumTarget, activeCountyFips: Set<string>, profile: Profile) {
  assert(target.pairKey === pairKey(target), `${profile.label} pair identity differs for ${target.pairKey}.`);
  assert(target.stateCode === context.stateCode, `${profile.label} state differs for ${target.pairKey}.`);
  assert(target.sourceState.trim().length > 0 && target.sourceCounty.trim().length > 0, `${profile.label} geography is missing for ${target.pairKey}.`);
  assert(activeCountyFips.has(target.countyFips), `${profile.label} county is inactive for ${target.pairKey}.`);
  assert(/^[A-Za-z0-9:._{}\/-]{1,200}$/u.test(target.recordId), `${profile.label} record ID is invalid for ${target.pairKey}.`);
  assert(/^[A-Za-z0-9:._{}\/-]{20,200}$/u.test(target.occurrenceId), `${profile.label} occurrence ID is invalid for ${target.pairKey}.`);
  if (profile.profile === "torch-brit") assert(target.rights === CC0_LICENSE, `${profile.label} row rights differ for ${target.pairKey}.`);
  assert(Number.isInteger(target.year) && target.year >= 1500 && target.year <= 2026, `${profile.label} event year is invalid for ${target.pairKey}.`);
  assert(target.eventDate.trim().length > 0, `${profile.label} event date is missing for ${target.pairKey}.`);
  const requested = context.requestedPairs.find((pair) => pairKey(pair) === target.pairKey);
  assert(requested, `${profile.label} target was not requested: ${target.pairKey}.`);
  assert(normalizedText(requested.scientificName) === normalizedText(target.scientificName), `${profile.label} taxonomy differs for ${target.pairKey}.`);
}

function buildAssertionAndReview(context: SourceAdapterContext, target: RetainedHerbariumTarget, completedAt: string, parameters: RetainedHerbariumParameters, profile: Profile) {
  const normalizedPayloadHash = sha256(stableJson(target));
  const assertionEventId = contentId(`${profile.profile}-assertion`, {
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
    actor_id: `${profile.adapterId}@${RETAINED_HERBARIUM_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: profile.sourceId,
    state_code: context.stateCode,
    county_fips: target.countyFips,
    species_id: target.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "occurrence",
    scope: "point",
    source_record_id: `${profile.sourceId}:${target.occurrenceId}`,
    source_url: target.references || profile.datasetUrl,
    source_record_date: target.eventDate,
    retrieved_at: parameters.archiveAcquiredAt,
    taxon_match: {
      method: "Exact source genus plus specific epithet to one two-token Project Isitusa catalog plant binomial; source rank species and blank identification qualifier required",
      target_scientific_name: target.scientificName,
      source_scientific_name: target.scientificName,
      source_taxon_key: null,
    },
    geography_match: {
      method: profile.profile === "nybg"
        ? "Exact provider state and county text normalized only for the documented Co. county abbreviation, then resolved to one active county-equivalent registry entry; coordinates were not used"
        : "Exact provider state and county text resolved to one active county-equivalent registry entry; coordinates were not used",
      source_state: target.sourceState,
      source_county: assertionCountyName(target, profile),
      county_fips: target.countyFips,
    },
    temporal_scope: `Preserved specimen event recorded as ${target.eventDate}; validated event year ${target.year}.`,
    spatial_scope: `Historical physical specimen occurrence assigned from explicit provider county geography in ${target.stateCode}; not a complete inventory of the county.`,
    survey_scope: null,
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "Historical preserved specimen evidence supports recorded presence only.",
      "It does not establish current abundance, countywide distribution, or current establishment.",
      "Source silence, excluded cultivated records, missing geography, and every rejected row create no absence or non-detection claim.",
    ],
    notes: [
      `${profile.label} record ${target.recordId}; occurrenceID ${target.occurrenceId}.`,
      `Institution ${target.institutionCode || "unspecified"}; collection ${target.collectionCode || "unspecified"}; catalog ${target.catalogNumber || "unspecified"}.`,
      `Dataset CC0; rights holder ${target.rightsHolder || "unspecified"}; archive ${profile.archiveSha256}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId(`${profile.profile}-review`, { assertionEventId }),
    event_type: "evidence.reviewed",
    created_at: completedAt,
    actor_type: "adapter",
    actor_id: `${profile.adapterId}@${RETAINED_HERBARIUM_ADAPTER_VERSION}`,
    run_id: context.runId,
    source_id: profile.sourceId,
    state_code: context.stateCode,
    county_fips: target.countyFips,
    species_id: target.speciesId,
    references: { assertion_event_id: assertionEventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "retained-cc0-archive",
      "stable-occurrence-identity",
      "preserved-specimen-basis",
      "exact-catalog-binomial",
      "exact-active-county-name",
      "valid-event-year",
      "cultivation-text-excluded",
      "occurrence-only-semantics",
    ],
    notes: [
      "The witness was selected by a complete archive preflight and retained inside this immutable run.",
      "Publication is limited to historical recorded presence; no source omission or rejection is negative evidence.",
    ],
  };
  return { assertion, review };
}

function buildRunner(profile: Profile) {
  return async (context: SourceAdapterContext): Promise<SourceAdapterResult> => {
    assert(context.sourceId === profile.sourceId, `${profile.label} adapter received the wrong source.`);
    const parameters = parseParameters(context, profile);
    assert(getStateDefinition(context.stateCode)?.nationalV1Scope, `${profile.label} state ${context.stateCode} is not registered.`);
    const activeCountyFips = new Set(listCountyEquivalents(context.stateCode).map((county) => county.countyFips));
    const completedAt = new Date().toISOString();
    assert(Date.parse(completedAt) >= Date.parse(context.runStartedAt), `${profile.label} completion precedes run start.`);
    const assertions: RunEvidenceAssertionEvent[] = [];
    const reviews: EvidenceReviewEvent[] = [];
    const outcomes: ResearchPairOutcome[] = [];
    for (const target of [...parameters.targets].sort((left, right) => compareText(left.pairKey, right.pairKey))) {
      validateTarget(context, target, activeCountyFips, profile);
      const accepted = buildAssertionAndReview(context, target, completedAt, parameters, profile);
      assertions.push(accepted.assertion);
      reviews.push(accepted.review);
      outcomes.push({
        schemaVersion: 1,
        outcome_id: contentId(`${profile.profile}-outcome`, { runId: context.runId, pairKey: target.pairKey }),
        run_id: context.runId,
        source_id: profile.sourceId,
        state_code: context.stateCode,
        county_fips: target.countyFips,
        species_id: target.speciesId,
        status: "evidence-found",
        scope_complete: true,
        recorded_at: completedAt,
        assertion_event_ids: [accepted.assertion.eventId],
        rejection_ids: [],
        query_urls: [profile.datasetUrl],
        notes: ["One retained CC0 preserved-specimen witness supports historical recorded presence for this county-species pair."],
      });
    }
    const identity = {
      profile: profile.profile,
      datasetUrl: parameters.datasetUrl,
      metadataUrl: parameters.metadataUrl,
      usagePolicyUrl: parameters.usagePolicyUrl,
      datasetVersion: parameters.datasetVersion,
      publicationDate: parameters.publicationDate,
      datasetLastModified: parameters.datasetLastModified,
      datasetEtag: parameters.datasetEtag,
      archiveBytes: parameters.archiveBytes,
      archiveSha256: parameters.archiveSha256,
      occurrenceBytes: parameters.occurrenceBytes,
      occurrenceSha256: parameters.occurrenceSha256,
      archiveAcquiredAt: parameters.archiveAcquiredAt,
      preflightEvaluationId: parameters.preflightEvaluationId,
      targetPairSetSha256: parameters.targetPairSetSha256,
    };
    return {
      completedAt,
      assertions,
      reviews,
      rejections: [],
      outcomes,
      artifacts: [
        { filename: `${profile.profile}-source-identity.json`, mediaType: "application/json", contents: `${JSON.stringify(identity, null, 2)}\n` },
        { filename: `${profile.profile}-retained-witnesses.json.gz`, mediaType: "application/gzip", contents: gzipSync(Buffer.from(stableJson(parameters.targets))) },
      ],
      upstreamRequests: [],
      candidateRecordCount: parameters.targets.length,
      duplicateRecordCount: 0,
      errors: [],
      warnings: [
        `${profile.label} physical specimens support historical recorded presence only.`,
        "The complete source archive was screened offline; only one strict retained witness per eligible county-species pair is persisted in each immutable run.",
        "Source silence and rejected rows never support absence or non-detection.",
      ],
    };
  };
}

export const nybgPreservedSpecimensAdapter: ResearchSourceAdapter = {
  adapterId: NYBG_PROFILE.adapterId,
  adapterVersion: RETAINED_HERBARIUM_ADAPTER_VERSION,
  sourceId: NYBG_SOURCE_ID,
  run: buildRunner(NYBG_PROFILE),
};

export const torchBritPreservedSpecimensAdapter: ResearchSourceAdapter = {
  adapterId: TORCH_BRIT_PROFILE.adapterId,
  adapterVersion: RETAINED_HERBARIUM_ADAPTER_VERSION,
  sourceId: TORCH_BRIT_SOURCE_ID,
  run: buildRunner(TORCH_BRIT_PROFILE),
};
