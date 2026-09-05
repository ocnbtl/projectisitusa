import { createHash } from "node:crypto";
import { ALB_REVIEW_ID, ALB_REVIEW_PATH } from "../alb-eradication-review";
import { ALB_APPROVED_REVIEW_SHA256, ALB_APPROVAL_RECEIPT_PATH, loadApprovedAlbBatch } from "../alb-approved-batch";

import type {
  ResearchSourceAdapter,
  SourceAdapterContext,
  SourceAdapterResult,
} from "@/lib/research/source-adapter";
import type {
  EvidenceReviewEvent,
  ResearchPairOutcome,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { getStateDefinition } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const OFFICIAL_ERADICATION_ADAPTER_ID =
  "official-eradication-determination" as const;
export const OFFICIAL_ERADICATION_ADAPTER_VERSION = "1.0.0" as const;
export const ALB_ERADICATION_ADAPTER_VERSION = "1.1.0" as const;
export const OFFICIAL_ERADICATION_BATCH_ID =
  "jurisdiction-wide-eradication-human-approval-request-20260901-r1" as const;
export const APPROVAL_ARTIFACT_PATH =
  "ops/national-research/evaluations/jurisdiction-wide-eradication-human-approval-request-20260901-r1.json" as const;
export const APPROVAL_ARTIFACT_SHA256 =
  "94888e583e80c60daba0c0210867013fe4d5a9d342021e96828272c9c88bc0a5" as const;
export const APPROVAL_RECEIPT_PATH =
  "ops/national-research/evaluations/jurisdiction-wide-eradication-human-approval-receipt-20260901-r1.json" as const;

type Parameters = {
  stateCode: string;
  mode: "human-approved-official-eradication";
  batchId: typeof OFFICIAL_ERADICATION_BATCH_ID | typeof ALB_REVIEW_ID;
  approvalArtifactPath: string;
  approvalArtifactSha256: string;
  approvalReceiptPath: string;
  approvalReceiptSha256: string;
  sourceDocumentId: string;
  parentJurisdictionEvidenceId: string | null;
  candidateLimit: number;
  candidatePairs: string[];
  historicalOccurrencePairKeys: string[];
  humanReviewActorId: "Ocean";
  humanReviewTimestamp: string;
};

type SourceContract = {
  sourceId: string;
  speciesId: string;
  scientificName: string;
  sourceUrl: string;
  claim: "officially-absent" | "recorded-present";
  parentJurisdictionEvidenceId: string | null;
  observedAtByPair?: Record<string, string>;
  sourceSupport: string;
};

const SOURCE_CONTRACTS: Record<string, SourceContract> = {
  "aphis-northern-giant-hornet-eradication-2024": {
    sourceId: "aphis-northern-giant-hornet-eradication-2024",
    speciesId: "vespa-mandarinia",
    scientificName: "Vespa mandarinia",
    sourceUrl:
      "https://www.aphis.usda.gov/news/agency-announcements/aphis-action-victory-over-worlds-largest-hornet-species",
    claim: "officially-absent",
    parentJurisdictionEvidenceId:
      "vespa-mandarinia-us-officially-eradicated-2024",
    sourceSupport:
      "The retained USDA APHIS statement explicitly declares the northern giant hornet eradicated from Washington State and the United States.",
  },
  "wsda-northern-giant-hornet-eradication-2024": {
    sourceId: "wsda-northern-giant-hornet-eradication-2024",
    speciesId: "vespa-mandarinia",
    scientificName: "Vespa mandarinia",
    sourceUrl:
      "https://agr.wa.gov/about-wsda/news-and-media-relations/news-releases?article=41658",
    claim: "recorded-present",
    parentJurisdictionEvidenceId: null,
    observedAtByPair: { "53073:vespa-mandarinia": "2021-09" },
    sourceSupport:
      "The retained WSDA statement records 2020 and 2021 nest detections and continued eradication work in Whatcom County.",
  },
  "aphis-asian-longhorned-beetle-program-update-2026": {
    sourceId: "aphis-asian-longhorned-beetle-program-update-2026",
    speciesId: "asian-longhorned-beetle",
    scientificName: "Anoplophora glabripennis",
    sourceUrl:
      "https://direct.aphis.usda.gov/news/program-update/aphis-removes-portions-nassau-suffolk-counties-new-york-asian-longhorned-0",
    claim: "officially-absent",
    parentJurisdictionEvidenceId:
      "asian-longhorned-beetle-nj-officially-eradicated-2013",
    sourceSupport:
      "The retained USDA APHIS program update explicitly declares Asian longhorned beetle eradicated from Hudson, Union, and Middlesex Counties in New Jersey.",
  },
  "njdep-asian-longhorned-beetle-eradication-current": {
    sourceId: "njdep-asian-longhorned-beetle-eradication-current",
    speciesId: "asian-longhorned-beetle",
    scientificName: "Anoplophora glabripennis",
    sourceUrl: "https://dep.nj.gov/parksandforests/conservation/forest-health/",
    claim: "recorded-present",
    parentJurisdictionEvidenceId: null,
    observedAtByPair: {
      "34017:asian-longhorned-beetle": "2002",
      "34023:asian-longhorned-beetle": "2004",
      "34039:asian-longhorned-beetle": "2004",
    },
    sourceSupport:
      "The retained NJDEP statement explicitly records Asian longhorned beetle detections in Hudson, Middlesex, and Union Counties before the eradication determination.",
  },
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

function pairKey(value: { countyFips: string; speciesId: string }) {
  return `${value.countyFips}:${value.speciesId}`;
}

function parseParameters(context: SourceAdapterContext) {
  const parameters = context.parameters as unknown as Parameters;
  let contract = SOURCE_CONTRACTS[context.sourceId];
  assert(contract, `Unsupported official eradication source ${context.sourceId}.`);
  assert(parameters.mode === "human-approved-official-eradication", "Eradication adapter mode differs.");
  const isAlb = parameters.batchId === ALB_REVIEW_ID;
  assert(isAlb || parameters.batchId === OFFICIAL_ERADICATION_BATCH_ID, "Eradication batch identity differs.");
  if (isAlb) {
    const { review, receipt, receiptSha256 } = loadApprovedAlbBatch(process.cwd());
    assert(context.sourceId === review.source.sourceId, "ALB approval source differs.");
    const parent = review.proposedParentRecords.find((record) => record.jurisdiction.stateCode === context.stateCode);
    assert(parent, "ALB approval does not include this state.");
    assert(stableJson(context.requestedPairs.map((pair) => pair.countyFips)) === stableJson(parent.jurisdiction.countyFips), "ALB requested county set differs from exact approval.");
    assert(parameters.approvalReceiptSha256 === receiptSha256, "ALB approval receipt hash differs.");
    assert(parameters.humanReviewTimestamp === receipt.recordedAt, "ALB human review time differs from receipt.");
    contract = { ...contract, parentJurisdictionEvidenceId: parent.id, sourceSupport: review.source.supportText };
  }
  assert(parameters.stateCode === context.stateCode, "Eradication state differs.");
  assert(parameters.approvalArtifactPath === (isAlb ? ALB_REVIEW_PATH : APPROVAL_ARTIFACT_PATH), "Approval artifact path differs.");
  assert(parameters.approvalArtifactSha256 === (isAlb ? ALB_APPROVED_REVIEW_SHA256 : APPROVAL_ARTIFACT_SHA256), "Approval artifact hash differs.");
  assert(parameters.approvalReceiptPath === (isAlb ? ALB_APPROVAL_RECEIPT_PATH : APPROVAL_RECEIPT_PATH), "Approval receipt path differs.");
  assert(/^[a-f0-9]{64}$/u.test(parameters.approvalReceiptSha256), "Approval receipt hash is invalid.");
  assert(parameters.sourceDocumentId === context.sourceId, "Source document identity differs.");
  assert(parameters.parentJurisdictionEvidenceId === contract.parentJurisdictionEvidenceId, "Parent jurisdiction identity differs.");
  assert(parameters.humanReviewActorId === "Ocean", "Human review actor differs.");
  assert(Number.isFinite(Date.parse(parameters.humanReviewTimestamp)), "Human review timestamp is invalid.");
  const requestedKeys = context.requestedPairs.map(pairKey);
  assert(stableJson(parameters.candidatePairs) === stableJson(requestedKeys), "Candidate pairs differ from requested pairs.");
  assert(parameters.candidateLimit === requestedKeys.length, "Candidate limit differs from requested pairs.");
  assert(context.requestedPairs.every((pair) => pair.speciesId === contract.speciesId), "Requested species differs from source contract.");
  assert(context.requestedPairs.every((pair) => pair.scientificName === contract.scientificName), "Requested scientific name differs from source contract.");
  const historical = contract.observedAtByPair ?? {};
  assert(stableJson(parameters.historicalOccurrencePairKeys) === stableJson(requestedKeys.filter((key) => historical[key])), "Historical occurrence scope differs.");
  return { parameters, contract };
}

function buildAssertion(input: {
  context: SourceAdapterContext;
  parameters: Parameters;
  contract: SourceContract;
  pair: SourceAdapterContext["requestedPairs"][number];
}) {
  const key = pairKey(input.pair);
  const isAbsence = input.contract.claim === "officially-absent";
  const sourceRecordDate = isAbsence
    ? input.contract.speciesId === "vespa-mandarinia" ? "2024-12-18" : "2026-07-30"
    : input.contract.observedAtByPair?.[key] ?? null;
  assert(sourceRecordDate, `Missing source record date for ${key}.`);
  const normalizedPayload = {
    batchId: input.parameters.batchId,
    sourceDocumentId: input.parameters.sourceDocumentId,
    pairKey: key,
    claim: input.contract.claim,
    sourceRecordDate,
    parentJurisdictionEvidenceId: input.contract.parentJurisdictionEvidenceId,
    sourceSupport: input.contract.sourceSupport,
  };
  const eventId = contentId("official-eradication-assertion", normalizedPayload);
  const state = getStateDefinition(input.context.stateCode);
  assert(state, `Unknown state ${input.context.stateCode}.`);
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: input.parameters.humanReviewTimestamp,
    actor_type: "adapter",
    actor_id: `${OFFICIAL_ERADICATION_ADAPTER_ID}@${input.parameters.batchId === ALB_REVIEW_ID ? ALB_ERADICATION_ADAPTER_VERSION : OFFICIAL_ERADICATION_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: input.context.sourceId,
    state_code: input.context.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    claim_type: input.contract.claim,
    evidence_kind: isAbsence ? "absence-statement" : "occurrence",
    scope: "county",
    source_record_id: `${input.context.sourceId}:${key}:${sourceRecordDate}`,
    source_url: input.contract.sourceUrl,
    source_record_date: sourceRecordDate,
    retrieved_at: input.parameters.humanReviewTimestamp,
    taxon_match: {
      method: "Exact canonical binomial match to the Project Isitusa catalog taxon approved in the batch artifact.",
      target_scientific_name: input.pair.scientificName,
      source_scientific_name: input.contract.scientificName,
      source_taxon_key: null,
    },
    geography_match: {
      method: isAbsence
        ? "Exact deterministic child projection from the human-approved parent jurisdiction FIPS set; coordinates were not used."
        : "Exact official source county name resolved to one active county-equivalent FIPS; coordinates were not used.",
      source_state: state.stateName,
      source_county: input.pair.countyName,
      county_fips: input.pair.countyFips,
    },
    temporal_scope: isAbsence
      ? `Current official eradication determination is effective through the human-approved parent record validity window for ${input.contract.parentJurisdictionEvidenceId}.`
      : `Historical occurrence recorded in ${sourceRecordDate}, before the later official eradication determination.`,
    spatial_scope: isAbsence
      ? `This county is an exact member of the complete, exclusion-free FIPS set in parent jurisdiction evidence ${input.contract.parentJurisdictionEvidenceId}.`
      : `The official source explicitly identifies ${input.pair.countyName}, ${state.stateName}.`,
    survey_scope: null,
    normalized_payload_hash: sha256(stableJson(normalizedPayload)),
    caveats: isAbsence
      ? [
          "This is an explicit authoritative eradication determination, not an inference from silence, an empty query, a map, a model, or an unconfirmed survey result.",
          "The determination is current only through the parent record validThrough date and must fail closed after that date without reaffirmation.",
        ]
      : [
          "This historical occurrence does not imply current presence after the later official eradication determination.",
        ],
    notes: [
      input.contract.sourceSupport,
      `Human approval receipt: ${input.parameters.approvalReceiptPath} (${input.parameters.approvalReceiptSha256}).`,
    ],
    ...(isAbsence
      ? { parent_jurisdiction_evidence_id: input.contract.parentJurisdictionEvidenceId! }
      : {}),
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("official-eradication-review", { eventId, actor: input.parameters.humanReviewActorId, reviewedAt: input.parameters.humanReviewTimestamp }),
    event_type: "evidence.reviewed",
    created_at: input.parameters.humanReviewTimestamp,
    actor_type: "human",
    actor_id: input.parameters.humanReviewActorId,
    run_id: input.context.runId,
    source_id: input.context.sourceId,
    state_code: input.context.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "human-approved",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "exact-approved-batch",
      "retained-official-source",
      "exact-canonical-taxon",
      "exact-active-county-fips",
      isAbsence ? "explicit-official-eradication" : "historical-occurrence-before-eradication",
    ],
    notes: [
      `Ocean approved ${input.parameters.batchId} at the recorded approval time.`,
      "Approval is limited to local generation, staging, and commit; push, R2, deployment, and release remain separately controlled.",
    ],
  };
  return { assertion, review };
}

export async function runOfficialEradicationDetermination(
  context: SourceAdapterContext,
): Promise<SourceAdapterResult> {
  const { parameters, contract } = parseParameters(context);
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const outcomes: ResearchPairOutcome[] = [];
  for (const pair of context.requestedPairs) {
    const { assertion, review } = buildAssertion({ context, parameters, contract, pair });
    assertions.push(assertion);
    reviews.push(review);
    outcomes.push({
      schemaVersion: 1,
      outcome_id: contentId("official-eradication-outcome", { runId: context.runId, pairKey: pairKey(pair), assertionEventId: assertion.eventId }),
      run_id: context.runId,
      source_id: context.sourceId,
      state_code: context.stateCode,
      county_fips: pair.countyFips,
      species_id: pair.speciesId,
      status: "evidence-found",
      scope_complete: true,
      recorded_at: parameters.humanReviewTimestamp,
      assertion_event_ids: [assertion.eventId],
      rejection_ids: [],
      query_urls: [contract.sourceUrl],
      notes: [
        contract.claim === "officially-absent"
          ? "One explicit human-approved child determination was derived from the exact parent jurisdiction FIPS set."
          : "One human-approved historical county occurrence was retained separately from the current eradication determination.",
      ],
    });
  }
  const artifactContents = `${JSON.stringify({
    schemaVersion: 1,
    batchId: parameters.batchId,
    sourceDocumentId: parameters.sourceDocumentId,
    sourceUrl: contract.sourceUrl,
    approvalArtifact: { path: parameters.approvalArtifactPath, sha256: parameters.approvalArtifactSha256 },
    approvalReceipt: { path: parameters.approvalReceiptPath, sha256: parameters.approvalReceiptSha256 },
    parentJurisdictionEvidenceId: parameters.parentJurisdictionEvidenceId,
    stateCode: parameters.stateCode,
    pairCount: parameters.candidatePairs.length,
  }, null, 2)}\n`;
  return {
    completedAt: parameters.humanReviewTimestamp,
    assertions,
    reviews,
    rejections: [],
    outcomes,
    artifacts: [{ filename: "approved-source-reference.json", mediaType: "application/json", contents: artifactContents }],
    upstreamRequests: [],
    candidateRecordCount: context.requestedPairs.length,
    duplicateRecordCount: 0,
    errors: [],
    warnings: [
      "This replay uses retained, hash-pinned official source artifacts reviewed before approval and performs no live provider request.",
      "Absence is emitted only from an explicit human-approved parent jurisdiction determination; source silence never creates an assertion.",
    ],
  };
}

export function officialEradicationAdapter(sourceId: string, version: "1.0.0" | "1.1.0" = OFFICIAL_ERADICATION_ADAPTER_VERSION): ResearchSourceAdapter {
  assert(SOURCE_CONTRACTS[sourceId], `Unsupported official eradication source ${sourceId}.`);
  return {
    adapterId: OFFICIAL_ERADICATION_ADAPTER_ID,
    adapterVersion: version,
    sourceId,
    run: (context) => {
      assert((context.parameters.batchId === ALB_REVIEW_ID) === (version === ALB_ERADICATION_ADAPTER_VERSION), "Adapter version differs from the approved batch.");
      return runOfficialEradicationDetermination(context);
    },
  };
}

export function listOfficialEradicationSourceIds() {
  return Object.keys(SOURCE_CONTRACTS).sort();
}
