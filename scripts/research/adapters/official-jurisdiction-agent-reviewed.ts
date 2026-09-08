import { readFileSync } from "node:fs";
import path from "node:path";
import type { ResearchSourceAdapter, SourceAdapterContext, SourceAdapterResult } from "@/lib/research/source-adapter";
import type { ResearchCountyFile, ResearchPairOutcome, RunEvidenceAssertionEvent, EvidenceReviewEvent } from "@/lib/research/types";
import { resolveTemporalPairDetermination } from "@/lib/research/jurisdiction-evidence";
import { strictJurisdictionDate, jurisdictionDeclarationRecordDate, jurisdictionAgentAdapterVersion, jurisdictionTemporalScope } from "@/lib/research/jurisdiction-agent-review";
import { sha256, stableJson } from "@/lib/research/run-files";
import { approvedAgentParentRecords, loadAgentParent } from "../agent-jurisdiction-records";

export const AGENT_JURISDICTION_ADAPTER_ID = "official-jurisdiction-agent-reviewed";
export const AGENT_JURISDICTION_ADAPTER_VERSION = "1.0.0";
export type AgentJurisdictionPlan = { parentId: string; parentSha256: string; asOf: string; reviewActorId: string };
type Parameters = AgentJurisdictionPlan & { mode: "retained-agent-reviewed-jurisdiction"; stateCode: string; candidatePairs: string[]; candidateLimit: number };
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const id = (prefix: string, value: unknown) => prefix + "-" + sha256(stableJson(value));
export function isAgentJurisdictionSource(sourceId: string): boolean {
  return approvedAgentParentRecords(process.cwd()).some(r => r.review.gate === "agent-reviewed" && r.review.declarationSourceId === sourceId);
}
export function agentJurisdictionAdapter(sourceId: string): ResearchSourceAdapter {
  const parents = approvedAgentParentRecords(process.cwd()).filter(r => r.review.gate === "agent-reviewed" && r.review.declarationSourceId === sourceId);
  const versions = new Set(parents.map(jurisdictionAgentAdapterVersion));
  assert(versions.size === 1, "Source requires one admitted agent adapter version.");
  return { adapterId: AGENT_JURISDICTION_ADAPTER_ID, adapterVersion: jurisdictionAgentAdapterVersion(parents[0]), sourceId, run: runAgentJurisdictionDetermination };
}
export async function runAgentJurisdictionDetermination(context: SourceAdapterContext): Promise<SourceAdapterResult> {
  const root = process.cwd();
  const parameters = context.parameters as unknown as Parameters;
  assert(parameters.mode === "retained-agent-reviewed-jurisdiction" && parameters.stateCode === context.stateCode, "Wrong agent jurisdiction mode or state.");
  strictJurisdictionDate(parameters.asOf, "Assessment date");
  assert(context.runStartedAt.slice(0, 10) >= parameters.asOf && Date.parse(context.runStartedAt) <= Date.now(), "Run date is future or precedes assessment.");
  const { record, original } = loadAgentParent(root, parameters.parentId, parameters.parentSha256);
  assert(record.review.gate === "agent-reviewed" && record.review.declarationSourceId === context.sourceId, "Source differs from the reviewed declaration.");
  const adapterVersion = jurisdictionAgentAdapterVersion(record);
  const sourceRecordDate = jurisdictionDeclarationRecordDate(record);
  assert(parameters.asOf >= record.review.reviewedAsOf, "Assessment precedes the independent review scope.");
  assert(parameters.reviewActorId.length > 0 && parameters.reviewActorId !== record.review.actorId
    && parameters.reviewActorId !== record.review.independentActorId, "Child review requires an independent lease actor.");
  const countyRegistry = JSON.parse(readFileSync(path.join(root, "src/data/research/county-equivalent-registry.json"), "utf8"));
  const stateFips = new Set<string>(countyRegistry.countyEquivalents.filter((c: { stateCode: string; status: string }) => c.stateCode === context.stateCode && c.status === "active").map((c: { countyFips: string }) => c.countyFips));
  const expected = record.jurisdiction.countyFips.filter(f => stateFips.has(f)).map(f => f + ":" + record.speciesId).sort();
  const requested = context.requestedPairs.map(p => p.countyFips + ":" + p.speciesId).sort();
  assert(expected.length > 0 && stableJson(requested) === stableJson(expected)
    && stableJson(parameters.candidatePairs) === stableJson(expected) && parameters.candidateLimit === expected.length, "Requested scope differs from the complete reviewed state partition.");
  const source = record.sourceDocuments.find(d => d.sourceId === context.sourceId)!;
  const sourceArtifact = original.sources.find((s: { path: string }) => s.path === source.artifactPath);
  assert(sourceArtifact && context.requestedPairs.every(p => p.scientificName === original.species.canonicalName), "Exact reviewed catalog taxonomy differs.");
  const declaration = resolveTemporalPairDetermination({ presenceEvidence: [], jurisdictionEvidence: [record], asOf: parameters.asOf });
  assert(["officially-absent", "officially-eradicated"].includes(declaration.currentDeterminationStatus), "Parent is not current at the assessment date.");
  const assertions: RunEvidenceAssertionEvent[] = [], reviews: EvidenceReviewEvent[] = [], outcomes: ResearchPairOutcome[] = [];
  const conflictChecks: Array<{ pairKey: string; projectionPath: string; sha256: string; conflict: boolean }> = [];
  for (const pair of context.requestedPairs) {
    const key = pair.countyFips + ":" + pair.speciesId;
    const projectionPath = "public/generated/research/" + context.stateCode + "/counties/" + pair.countyFips + ".json";
    const projectionBytes = readFileSync(path.join(root, projectionPath));
    const county = JSON.parse(projectionBytes.toString("utf8")) as ResearchCountyFile;
    assert(county.asOf === parameters.asOf && county.countyFips === pair.countyFips && county.stateCode === context.stateCode, "Contradiction projection is stale or has wrong geography.");
    const prior = county.pairs.find(p => p.speciesId === pair.speciesId);
    const temporal = resolveTemporalPairDetermination({ presenceEvidence: (prior?.evidence ?? []).filter(e => e.assertion === "recorded-present").map(e => ({ evidenceId: e.evidenceId, observedAt: e.observedAt })), jurisdictionEvidence: [record], asOf: parameters.asOf });
    conflictChecks.push({ pairKey: key, projectionPath, sha256: sha256(projectionBytes), conflict: temporal.conflict });
    const assertionIds: string[] = [];
    if (!temporal.conflict) {
      const payload = { parentId: record.id, parentSha256: parameters.parentSha256, pairKey: key, sourceDate: sourceRecordDate, originalRetrievedAt: sourceArtifact.retrievedAt };
      const eventId = id("agent-jurisdiction-assertion", { runId: context.runId, ...payload });
      const assertion: RunEvidenceAssertionEvent = {
        schemaVersion: 1, eventId, event_type: "evidence.asserted", created_at: context.runStartedAt,
        actor_type: "adapter", actor_id: AGENT_JURISDICTION_ADAPTER_ID + "@" + adapterVersion,
        run_id: context.runId, source_id: context.sourceId, state_code: context.stateCode, county_fips: pair.countyFips, species_id: pair.speciesId,
        claim_type: "officially-absent", evidence_kind: "absence-statement", scope: "county",
        source_record_id: record.id + ":" + pair.countyFips, source_url: source.url, source_record_date: sourceRecordDate,
        retrieved_at: sourceArtifact.retrievedAt,
        taxon_match: { method: "Exact canonical binomial in the independently reviewed official declaration.", target_scientific_name: pair.scientificName, source_scientific_name: original.species.canonicalName, source_taxon_key: null },
        geography_match: { method: "Deterministic child of the explicit whole-jurisdiction declaration and exact active county FIPS set; no coordinate inference.", source_state: original.scope.stateCode, source_county: "Not individually named; derived from parent " + record.jurisdiction.id, county_fips: pair.countyFips },
        temporal_scope: jurisdictionTemporalScope(record),
        spatial_scope: "Exact child county of parent " + record.id + "; the source states whole-jurisdiction absence, not a county survey.",
        survey_scope: null, normalized_payload_hash: sha256(stableJson(payload)), caveats: record.caveats,
        notes: [source.supportText, "Explicit authoritative absence derived from reviewed parent " + record.id + ".", "Independent source interpretation: " + record.review.independentReview.path + " (" + record.review.independentReview.sha256 + ")."],
        parent_jurisdiction_evidence_id: record.id,
      };
      assertions.push(assertion); assertionIds.push(eventId);
      reviews.push({ schemaVersion: 1, eventId: id("agent-jurisdiction-review", { eventId, actorId: parameters.reviewActorId }), event_type: "evidence.reviewed", created_at: context.runStartedAt,
        actor_type: "agent", actor_id: parameters.reviewActorId, run_id: context.runId, source_id: context.sourceId, state_code: context.stateCode, county_fips: pair.countyFips, species_id: pair.speciesId,
        references: { assertion_event_id: eventId }, review_level: "agent-reviewed", decision: "accepted", publication_eligible: true,
        reason_codes: ["explicit-official-jurisdiction-declaration", "independent-source-interpretation", "exact-active-county-child", "dated-current-corroboration", "no-accepted-contrary-evidence-in-pinned-projection"], notes: ["This is an agent review, not human approval. The worker independently validates the pinned parent and contradiction baseline."] });
    }
    outcomes.push({ schemaVersion: 1, outcome_id: id("agent-jurisdiction-outcome", { runId: context.runId, key }), run_id: context.runId, source_id: context.sourceId, state_code: context.stateCode, county_fips: pair.countyFips, species_id: pair.speciesId,
      status: temporal.conflict ? "blocked" : "evidence-found", scope_complete: !temporal.conflict, recorded_at: context.runStartedAt, assertion_event_ids: assertionIds, rejection_ids: [], query_urls: [source.url],
      notes: [temporal.conflict ? "Accepted later or undated occurrence conflicts with current absence; adjudication required." : "One exact child of the independently reviewed parent; no county survey claim."] });
  }
  return { completedAt: new Date().toISOString(), assertions, reviews, rejections: [], outcomes,
    artifacts: [{ filename: "reviewed-parent-and-conflict-baseline.json", mediaType: "application/json", contents: JSON.stringify({ record, parentSha256: parameters.parentSha256, originalAcquisition: sourceArtifact, conflictChecks }, null, 2) + "\n" }],
    upstreamRequests: [], candidateRecordCount: expected.length, duplicateRecordCount: 0, errors: [], warnings: ["Offline replay of retained authority documents. Original source dates and retrieval timestamps are preserved. Conflict baseline must be rechecked by MAIN at integration."] };
}
