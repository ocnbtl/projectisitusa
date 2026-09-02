import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { ResearchSourceAdapter, SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import type {
  EvidenceReviewEvent,
  ResearchPairOutcome,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import { getStateDefinition, listCountyEquivalents } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const EDDMAPS_SOURCE_ID = "eddmaps" as const;
export const EDDMAPS_REPLAY_ADAPTER_ID = "eddmaps-snapshot-replay" as const;
export const EDDMAPS_REPLAY_ADAPTER_VERSION = "1.0.0" as const;
export const EDDMAPS_SNAPSHOT_PATH = "src/data/source/eddmaps-snapshot.json" as const;

type EddMapsSnapshot = {
  source: string;
  citation: string;
  snapshotDate: string;
  species: Array<{
    speciesId: string;
    subjectId: number;
    countyFips: string[];
  }>;
};

export type EddMapsReplayTarget = {
  pairKey: string;
  countyFips: string;
  speciesId: string;
  scientificName: string;
  snapshotSpeciesId: string;
  subjectId: number;
};

type EddMapsReplayParameters = {
  stateCode: string;
  mode: "committed-snapshot-replay";
  snapshotPath: typeof EDDMAPS_SNAPSHOT_PATH;
  snapshotSha256: string;
  snapshotDate: string;
  citation: string;
  officialUseBasisUrls: string[];
  targets: EddMapsReplayTarget[];
  candidatePairs: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function pairKey(value: { countyFips: string; speciesId: string }) {
  return `${value.countyFips}:${value.speciesId}`;
}

function parseParameters(context: SourceAdapterContext) {
  const parameters = context.parameters as unknown as EddMapsReplayParameters;
  assert(parameters.mode === "committed-snapshot-replay", "EDDMapS replay mode differs.");
  assert(parameters.stateCode === context.stateCode, "EDDMapS replay state differs.");
  assert(parameters.snapshotPath === EDDMAPS_SNAPSHOT_PATH, "EDDMapS replay snapshot path differs.");
  assert(/^[a-f0-9]{64}$/u.test(parameters.snapshotSha256), "EDDMapS replay snapshot hash is invalid.");
  assert(!Number.isNaN(Date.parse(parameters.snapshotDate)), "EDDMapS replay snapshot date is invalid.");
  assert(parameters.citation.trim().length > 0, "EDDMapS replay citation is missing.");
  assert(parameters.officialUseBasisUrls.length >= 2, "EDDMapS replay official-use basis is incomplete.");
  assert(parameters.targets.length > 0, "EDDMapS replay targets are missing.");
  const requestedKeys = context.requestedPairs.map(pairKey).sort(compareText);
  const targetKeys = parameters.targets.map((target) => target.pairKey).sort(compareText);
  const candidateKeys = [...parameters.candidatePairs].sort(compareText);
  assert(stableJson(requestedKeys) === stableJson(targetKeys), "EDDMapS targets differ from requested pairs.");
  assert(stableJson(requestedKeys) === stableJson(candidateKeys), "EDDMapS candidate pairs differ from requested pairs.");
  return parameters;
}

export function replayEddMapsSnapshot(context: SourceAdapterContext): SourceAdapterResult {
  assert(context.sourceId === EDDMAPS_SOURCE_ID, "EDDMapS replay received the wrong source.");
  const parameters = parseParameters(context);
  const snapshotPath = path.join(process.cwd(), parameters.snapshotPath);
  const snapshotBytes = readFileSync(snapshotPath);
  assert(sha256(snapshotBytes) === parameters.snapshotSha256, "EDDMapS snapshot hash differs from the plan.");
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")) as EddMapsSnapshot;
  assert(snapshot.snapshotDate === parameters.snapshotDate, "EDDMapS snapshot date differs from the plan.");
  assert(snapshot.citation === parameters.citation, "EDDMapS snapshot citation differs from the plan.");
  assert(Date.parse(snapshot.snapshotDate) <= Date.parse(context.runStartedAt), "EDDMapS snapshot is newer than the run start.");

  const state = getStateDefinition(context.stateCode);
  assert(state?.nationalV1Scope, `EDDMapS state ${context.stateCode} is outside national v1.`);
  const countyByFips = new Map(
    listCountyEquivalents(context.stateCode).map((county) => [county.countyFips, county]),
  );
  const snapshotBySpeciesId = new Map(snapshot.species.map((entry) => [entry.speciesId, entry]));
  assert(snapshotBySpeciesId.size === snapshot.species.length, "EDDMapS snapshot contains duplicate species identities.");
  const requestedByPair = new Map(context.requestedPairs.map((entry) => [pairKey(entry), entry]));
  const completedAt = new Date().toISOString();
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const outcomes: ResearchPairOutcome[] = [];
  const retainedRows: Array<{
    snapshotSpeciesId: string;
    subjectId: number;
    countyFips: string;
  }> = [];

  for (const target of [...parameters.targets].sort((left, right) => compareText(left.pairKey, right.pairKey))) {
    assert(target.pairKey === pairKey(target), `EDDMapS target pair key differs for ${target.pairKey}.`);
    const requested = requestedByPair.get(target.pairKey);
    assert(requested, `EDDMapS target ${target.pairKey} is not requested.`);
    assert(requested.scientificName === target.scientificName, `EDDMapS target taxon differs for ${target.pairKey}.`);
    const county = countyByFips.get(target.countyFips);
    assert(county, `EDDMapS target uses inactive FIPS ${target.countyFips}.`);
    const snapshotSpecies = snapshotBySpeciesId.get(target.snapshotSpeciesId);
    assert(snapshotSpecies, `EDDMapS snapshot species ${target.snapshotSpeciesId} is missing.`);
    assert(snapshotSpecies.subjectId === target.subjectId, `EDDMapS subject identity differs for ${target.pairKey}.`);
    assert(snapshotSpecies.countyFips.includes(target.countyFips), `EDDMapS snapshot lacks ${target.pairKey}.`);

    const payload = {
      snapshotSha256: parameters.snapshotSha256,
      snapshotDate: parameters.snapshotDate,
      snapshotSpeciesId: target.snapshotSpeciesId,
      subjectId: target.subjectId,
      countyFips: target.countyFips,
    };
    const normalizedPayloadHash = sha256(stableJson(payload));
    const eventId = contentId("eddmaps-assertion", {
      runId: context.runId,
      pairKey: target.pairKey,
      normalizedPayloadHash,
    });
    const sourceUrl = `https://www.eddmaps.org/species/subject.cfm?sub=${target.subjectId}`;
    const assertion: RunEvidenceAssertionEvent = {
      schemaVersion: 1,
      eventId,
      event_type: "evidence.asserted",
      created_at: completedAt,
      actor_type: "adapter",
      actor_id: `${EDDMAPS_REPLAY_ADAPTER_ID}@${EDDMAPS_REPLAY_ADAPTER_VERSION}`,
      run_id: context.runId,
      source_id: EDDMAPS_SOURCE_ID,
      state_code: context.stateCode,
      county_fips: target.countyFips,
      species_id: target.speciesId,
      claim_type: "recorded-present",
      evidence_kind: "occurrence",
      scope: "county",
      source_record_id: `eddmaps:${target.subjectId}:${target.countyFips}`,
      source_url: sourceUrl,
      source_record_date: null,
      retrieved_at: parameters.snapshotDate,
      taxon_match: {
        method: "Exact committed EDDMapS snapshot species identity and subject ID mapped to one Project Isitusa catalog taxon",
        target_scientific_name: target.scientificName,
        source_scientific_name: target.scientificName,
        source_taxon_key: String(target.subjectId),
      },
      geography_match: {
        method: "Exact five-digit EDDMapS aggregate county FIPS matched one active registered county equivalent; coordinates were not used",
        source_state: state.stateName,
        source_county: county.legalName,
        county_fips: target.countyFips,
      },
      temporal_scope: `Undated positive county aggregate retained in the EDDMapS snapshot retrieved ${parameters.snapshotDate}; it supports historical recorded presence only.`,
      spatial_scope: `The retained EDDMapS aggregate reports one or more verifier-reviewed or expert positive records for exact county FIPS ${target.countyFips}.`,
      survey_scope: null,
      normalized_payload_hash: normalizedPayloadHash,
      caveats: [
        "The retained aggregate does not expose individual occurrence dates or occurrence identifiers.",
        "The evidence supports recorded presence only, not current establishment, abundance, or complete county distribution.",
        "Missing rows and source silence never support absence, non-detection, applicability, or completed research.",
      ],
      notes: [
        `Committed snapshot path: ${parameters.snapshotPath}.`,
        `Committed snapshot SHA-256: ${parameters.snapshotSha256}.`,
        `EDDMapS subject ID: ${target.subjectId}.`,
        `Provider citation: ${parameters.citation}`,
      ],
    };
    const review: EvidenceReviewEvent = {
      schemaVersion: 1,
      eventId: contentId("eddmaps-review", { assertionEventId: eventId }),
      event_type: "evidence.reviewed",
      created_at: completedAt,
      actor_type: "adapter",
      actor_id: `${EDDMAPS_REPLAY_ADAPTER_ID}@${EDDMAPS_REPLAY_ADAPTER_VERSION}`,
      run_id: context.runId,
      source_id: EDDMAPS_SOURCE_ID,
      state_code: context.stateCode,
      county_fips: target.countyFips,
      species_id: target.speciesId,
      references: { assertion_event_id: eventId },
      review_level: "machine-validated",
      decision: "accepted",
      publication_eligible: true,
      reason_codes: [
        "hash-pinned-committed-snapshot",
        "verified-or-expert-provider-aggregate",
        "exact-subject-identity",
        "exact-active-county-fips",
        "positive-only-semantics",
      ],
      notes: [
        "The pair passed the registered snapshot hash, subject identity, current catalog mapping, and active exact-FIPS gates.",
        "This review publishes historical recorded presence only.",
      ],
    };
    const outcome: ResearchPairOutcome = {
      schemaVersion: 1,
      outcome_id: contentId("eddmaps-outcome", { runId: context.runId, pairKey: target.pairKey, eventId }),
      run_id: context.runId,
      source_id: EDDMAPS_SOURCE_ID,
      state_code: context.stateCode,
      county_fips: target.countyFips,
      species_id: target.speciesId,
      status: "evidence-found",
      scope_complete: true,
      recorded_at: completedAt,
      assertion_event_ids: [eventId],
      rejection_ids: [],
      query_urls: [],
      notes: ["A retained positive aggregate matched the requested pair; no negative inference was made."],
    };
    assertions.push(assertion);
    reviews.push(review);
    outcomes.push(outcome);
    retainedRows.push({
      snapshotSpeciesId: target.snapshotSpeciesId,
      subjectId: target.subjectId,
      countyFips: target.countyFips,
    });
  }

  const artifact = {
    schemaVersion: 1,
    source: snapshot.source,
    citation: snapshot.citation,
    snapshotDate: snapshot.snapshotDate,
    snapshotPath: parameters.snapshotPath,
    snapshotSha256: parameters.snapshotSha256,
    officialUseBasisUrls: parameters.officialUseBasisUrls,
    selectedPositiveCountyRows: retainedRows,
    semantics: {
      claim: "recorded-present",
      individualRecordDatesAvailable: false,
      sourceSilenceCreatesNegativeEvidence: false,
    },
  };
  return {
    completedAt,
    assertions,
    reviews,
    rejections: [],
    outcomes,
    artifacts: [{
      filename: "eddmaps-selected-positive-county-rows.json",
      mediaType: "application/json",
      contents: `${JSON.stringify(artifact, null, 2)}\n`,
    }],
    upstreamRequests: [],
    candidateRecordCount: retainedRows.length,
    duplicateRecordCount: 0,
    errors: [],
    warnings: [
      "The committed EDDMapS snapshot is an undated positive county aggregate; individual occurrence dates and identities are unavailable.",
    ],
  };
}

export const eddMapsSnapshotReplayAdapter: ResearchSourceAdapter = {
  adapterId: EDDMAPS_REPLAY_ADAPTER_ID,
  adapterVersion: EDDMAPS_REPLAY_ADAPTER_VERSION,
  sourceId: EDDMAPS_SOURCE_ID,
  async run(context) {
    return replayEddMapsSnapshot(context);
  },
};
