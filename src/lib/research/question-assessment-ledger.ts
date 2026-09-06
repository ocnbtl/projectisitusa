import { z } from "zod";
import batchSchema from "@/data/research/schemas/question-assessment-batch.schema.json";
import { supportingPayload, type GbifOccurrenceRecord } from "../../../scripts/research/adapters/inaturalist-gbif-research-grade";
import { readFileSync, existsSync, readdirSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import policyJson from "@/data/research/research-questions.json";
import {
  questionPlanSha256, validateQuestionAssessment, resolveCurrentQuestionAssessments, summarizeQuestionAssessmentDecisions,
  QUESTION_ASSESSMENT_METHOD_VERSION, type PairQuestionPlan, type QuestionCoverageProof,
  type ResearchQuestionAssessment, type ResearchQuestionId, type ResearchQuestionDefinition,
  type QuestionAnswer,
} from "@/lib/research/question-assessments";
import { sha256, stableJson, fileReference } from "@/lib/research/run-files";
import { resolveTemporalPairDetermination } from "@/lib/research/jurisdiction-evidence";
import type {
  EvidenceReviewEvent, ImmutableResearchRunBundle, JurisdictionEvidenceRecord, RunEvidenceAssertionEvent,
} from "@/lib/research/types";

const batchValidator = z.fromJSONSchema(batchSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);

type Artifact = QuestionCoverageProof["artifacts"][number];
export const QUESTION_POLICY = policyJson;
export const QUESTION_POLICY_SHA256 = sha256(stableJson(QUESTION_POLICY));
export const HISTORICAL_METHOD = "accepted-occurrence-ledger-v1";
export const WILD_METHOD = "retained-inaturalist-wild-period-v1";
export const OFFICIAL_METHOD = "approved-jurisdiction-status-v1";

export type QuestionCatalogSpecies = { id: string; scientificName: string; category: string };
export type QuestionCounty = { countyFips: string; stateCode: string; name: string; geographyScopeSha256: string };
export type QuestionEvidenceContext = {
  root: string;
  stateCode: string;
  asOf: string;
  catalogSpecies: QuestionCatalogSpecies[];
  counties: QuestionCounty[];
  activeAssertions: RunEvidenceAssertionEvent[];
  reviewEvents: EvidenceReviewEvent[];
  immutableRuns: ImmutableResearchRunBundle[];
  jurisdictionEvidence: JurisdictionEvidenceRecord[];
};
export type PublicQuestionAnswer = {
  questionId: ResearchQuestionId;
  disposition: ResearchQuestionAssessment["disposition"];
  answer: QuestionAnswer | null;
  assessmentId: string;
  assessedAt: string;
  explanation: string;
  citations: Array<{ evidenceId: string; sourceId: string; url: string; observedAt: string | null }>;
};
export type PairQuestionAssessmentProjection = {
  policyId: string;
  assessmentAsOf: string;
  requiredQuestions: number;
  assessedQuestions: number;
  researchComplete: boolean;
  reopenedQuestionIds: ResearchQuestionId[];
  answers: PublicQuestionAnswer[];
};
export type QuestionAssessmentCoverage = {
  schemaVersion: 1;
  policyId: string;
  assessmentAsOf: string;
  definitions: Array<Pick<ResearchQuestionDefinition, "id" | "required" | "predicate" | "period">>;
  pairDenominator: number;
  requiredQuestionCount: number;
  assessedQuestionCount: number;
  supportedQuestionCount: number;
  unresolvedQuestionCount: number;
  questionCountCompletedWithGaps: number;
  reopenedQuestionCount: number;
  fullyAssessedPairCount: number;
};
export type QuestionAssessmentBatch = {
  schemaVersion: 1;
  batchId: string;
  stateCode: string;
  createdAt: string;
  codeCommit: string;
  methodVersion: string;
  policySha256: string;
  files: { plans: Artifact; proofs: Artifact; assessments: Artifact };
  sourceRuns: Array<{ runId: string; receiptSha256: string }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function questionEventId(prefix: string, payload: object) {
  return prefix + "-" + sha256(stableJson(payload));
}
export function questionPolicyApplies(stateCode: string, asOf: string) {
  return QUESTION_POLICY.stateCodes.includes(stateCode) && QUESTION_POLICY.asOf <= asOf;
}
export function makePairQuestionPlan(species: QuestionCatalogSpecies, county: QuestionCounty): PairQuestionPlan {
  return {
    schemaVersion: 1, planId: QUESTION_POLICY.id + ":" + county.countyFips + ":" + species.id,
    version: QUESTION_POLICY.version, countyFips: county.countyFips, speciesId: species.id,
    asOf: QUESTION_POLICY.asOf,
    inputScopeSha256: sha256(stableJson({
      species: { id: species.id, scientificName: species.scientificName, category: species.category },
      county: { countyFips: county.countyFips, stateCode: county.stateCode, name: county.name, geographyScopeSha256: county.geographyScopeSha256 },
      policySha256: QUESTION_POLICY_SHA256, methodVersion: QUESTION_ASSESSMENT_METHOD_VERSION,
    })),
    questions: QUESTION_POLICY.questions as ResearchQuestionDefinition[],
    requirements: [],
    stoppingRules: QUESTION_POLICY.questions.filter((q) => q.supportMethods.length > 0).map((q) => ({
      id: q.id + ":supported", questionId: q.id as ResearchQuestionId, kind: "sufficient-evidence" as const,
      rationale: "One accepted witness meeting this question's evaluated method establishes this existential answer.",
      requiredRequirementIds: [],
    })),
    reopeningConditions: QUESTION_POLICY.reopeningConditions,
  };
}

/** All paths remain repository-relative, non-symlink files and hash-checked before parsing. */
export function readQuestionArtifact(root: string, artifact: Artifact) {
  assert(!path.isAbsolute(artifact.path) && !path.win32.isAbsolute(artifact.path)
    && !artifact.path.split(/[\\/]/u).includes(".."), "Question artifact path escapes the repository.");
  const filename = path.resolve(root, artifact.path);
  const relative = path.relative(realpathSync(root), realpathSync(filename));
  assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    && lstatSync(filename).isFile() && !lstatSync(filename).isSymbolicLink(), "Question artifact is not a regular repository file.");
  const bytes = readFileSync(filename);
  assert(bytes.length === artifact.bytes && sha256(bytes) === artifact.sha256, "Question artifact hash or length differs: " + artifact.path);
  return bytes;
}
function sourceVersionAllowed(bundle: ImmutableResearchRunBundle, methodId: string) {
  return QUESTION_POLICY.supportedSourceMethods.some((entry) =>
    entry.sourceId === bundle.receipt.source_id && entry.adapterId === bundle.receipt.adapter_id
    && entry.adapterVersions.includes(bundle.receipt.adapter_version) && entry.methodIds.includes(methodId));
}
function uniqueArtifacts(artifacts: Artifact[]) {
  return [...new Map(artifacts.map((a) => [a.path, { path: a.path, sha256: a.sha256, bytes: a.bytes }])).values()]
    .sort((a, b) => a.path.localeCompare(b.path));
}
function witnessArtifacts(context: QuestionEvidenceContext, bundle: ImmutableResearchRunBundle, assertion: RunEvidenceAssertionEvent) {
  const files = bundle.receipt.artifacts.filter((a) =>
    !a.path.includes("/gbif-") || a.path.includes("-" + assertion.species_id + "-") || a.path.includes("-" + assertion.species_id + "."));
  return uniqueArtifacts([
    fileReference(context.root, path.join(bundle.directory, "receipt.json"), "application/json"),
    ...bundle.receipt.outputs.filter((a) => /\/(?:assertions|reviews)\.ndjson$/u.test(a.path)),
    ...files,
  ]);
}
function historicalDateAdmissible(value: string | null, asOf: string) {
  if (value === null) return true;
  // Preserve partial precision; an explicit future or malformed lower date cannot support an as-of claim.
  if (!/^\d{4}(?:-\d{2}(?:-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?)?)?$/u.test(value)) return false;
  const start = value;
  const date = /^\d{4}$/u.test(start) ? start + "-01-01" : /^\d{4}-\d{2}$/u.test(start) ? start + "-01" : start.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/u.test(date) && Number.isFinite(Date.parse(date + "T00:00:00Z"))
    && new Date(date + "T00:00:00Z").toISOString().slice(0, 10) === date && date <= asOf;
}
export function retainedWildRecordSupportsPeriod(input: {
  record: Record<string, unknown>; assertion: RunEvidenceAssertionEvent;
  period: ResearchQuestionDefinition["period"];
}) {
  const { record, assertion, period } = input;
  const date = typeof record.eventDate === "string" ? record.eventDate : "";
  const day = date.slice(0, 10);
  return period.start !== null && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(date)
    && historicalDateAdmissible(day, period.end) && day >= period.start
    && String(record.key) === assertion.source_record_id && date === assertion.source_record_date
    && record.datasetKey === "50c9509d-22c7-4a22-a47d-8c48425ef4a7"
    && record["http://unknown.org/captive_cultivated"] === "wild"
    && record.basisOfRecord === "HUMAN_OBSERVATION" && record.occurrenceStatus === "PRESENT"
    && record.species === assertion.taxon_match.target_scientific_name;
}
function sourceRecordForWildProof(context: QuestionEvidenceContext, bundle: ImmutableResearchRunBundle, assertion: RunEvidenceAssertionEvent) {
  const matches: Array<{ record: Record<string, unknown>; artifact: Artifact }> = [];
  for (const artifact of bundle.receipt.artifacts.filter((a) => a.path.includes("/gbif-occurrences-" + assertion.species_id + "-") && a.path.endsWith(".json.gz"))) {
    const parsed = JSON.parse(gunzipSync(readQuestionArtifact(context.root, artifact)).toString("utf8")) as { results: Array<Record<string, unknown>> };
    assert(Array.isArray(parsed.results), "Retained iNaturalist occurrence payload has no results array.");
    for (const record of parsed.results) if (String(record.key) === assertion.source_record_id) matches.push({ record, artifact });
  }
  assert(matches.length === 1, "Retained accepted iNaturalist witness must have exactly one raw identity.");
  const selected = matches[0]!;
  const payload = supportingPayload(selected.record as unknown as GbifOccurrenceRecord, {
    countyFips: assertion.county_fips, countyName: assertion.geography_match.source_county, countyLegalName: assertion.geography_match.source_county,
    stateCode: assertion.state_code, stateName: assertion.geography_match.source_state, sourceStateName: assertion.geography_match.source_state,
    speciesId: assertion.species_id, scientificName: assertion.taxon_match.target_scientific_name,
  }, { speciesKey: Number(assertion.taxon_match.source_taxon_key), canonicalName: assertion.taxon_match.target_scientific_name,
    confidence: Number(/confidence ([0-9]+)/u.exec(assertion.taxon_match.method)?.[1]),
  });
  assert(sha256(stableJson(payload)) === assertion.normalized_payload_hash, "Retained wild witness does not reproduce its accepted normalized payload.");
  return selected;
}

const evidenceIndexes = new WeakMap<QuestionEvidenceContext, { byPair: Map<string, RunEvidenceAssertionEvent[]>; bundles: Map<string, ImmutableResearchRunBundle>; reviews: Map<string, EvidenceReviewEvent[]>; catalog: Map<string, QuestionCatalogSpecies> }>();
function indexEvidenceContext(context: QuestionEvidenceContext) {
  let index = evidenceIndexes.get(context);
  if (index) return index;
  index = { byPair: new Map(), bundles: new Map(context.immutableRuns.map((r) => [r.receipt.run_id, r])), reviews: new Map(), catalog: new Map(context.catalogSpecies.map((s) => [s.id, s])) };
  for (const assertion of context.activeAssertions) { const key = assertion.county_fips + ":" + assertion.species_id; const values = index.byPair.get(key) ?? []; values.push(assertion); index.byPair.set(key, values); }
  for (const review of context.reviewEvents) { const key = review.references.assertion_event_id; const values = index.reviews.get(key) ?? []; values.push(review); index.reviews.set(key, values); }
  evidenceIndexes.set(context, index);
  return index;
}

export function deriveSupportedQuestionProofs(context: QuestionEvidenceContext, plan: PairQuestionPlan, evaluatedAt: string, onePerQuestion = true, pinnedProof?: QuestionCoverageProof) {
  const index = indexEvidenceContext(context);
  const pairAssertions = (index.byPair.get(plan.countyFips + ":" + plan.speciesId) ?? []).filter((a) => a.created_at.slice(0, 10) <= plan.asOf);
  const bundleById = index.bundles;
  const candidates: QuestionCoverageProof[] = [];
  for (const assertion of [...pairAssertions].sort((a, b) =>
    Number(a.source_record_date === null) - Number(b.source_record_date === null) || a.eventId.localeCompare(b.eventId))) {
    if (pinnedProof && !pinnedProof.assertionEventIds.includes(assertion.eventId)) continue;
    if (assertion.taxon_match.target_scientific_name !== index.catalog.get(plan.speciesId)?.scientificName) continue;
    const bundle = bundleById.get(assertion.run_id);
    assert(bundle && bundle.receipt.source_id === assertion.source_id, "Question assertion has no matching immutable source run.");
    const reviews = (index.reviews.get(assertion.eventId) ?? []).filter((r) => r.references.assertion_event_id === assertion.eventId
      && r.event_type === "evidence.reviewed" && r.decision === "accepted" && r.publication_eligible
      && r.created_at.slice(0, 10) <= plan.asOf && (!pinnedProof || pinnedProof.reviewEventIds.includes(r.eventId))).map((r) => r.eventId).sort();
    assert(reviews.length > 0, "Question witness lacks retained accepted review.");
    const add = (questionId: ResearchQuestionId, methodId: string, answer: QuestionAnswer, explanation: string, extraArtifacts: Artifact[] = []) => {
      if (!sourceVersionAllowed(bundle, methodId)) return;
      const payload: Omit<QuestionCoverageProof, "proofId"> = {
        schemaVersion: 1, planSha256: questionPlanSha256(plan), pairKey: plan.countyFips + ":" + plan.speciesId,
        questionId, requirementId: null, kind: "support", methodId, answer, sourceId: assertion.source_id,
        runIds: [assertion.run_id], assertionEventIds: [assertion.eventId], reviewEventIds: reviews,
        outcomeIds: [], artifacts: uniqueArtifacts([...witnessArtifacts(context, bundle, assertion), ...extraArtifacts]), evaluatedAt, explanation,
      };
      candidates.push({ ...payload, proofId: questionEventId("question-proof", payload) });
    };
    if (assertion.claim_type === "recorded-present" && ["occurrence", "preserved-specimen"].includes(assertion.evidence_kind)
      && historicalDateAdmissible(assertion.source_record_date, plan.asOf)) {
      add("documented-historical-occurrence", HISTORICAL_METHOD, "documented-occurrence",
        (assertion.evidence_kind === "preserved-specimen" ? "A preserved specimen documents" : "A source record documents") + " an occurrence in this county. "
        + (assertion.source_record_date ? "Source event date: " + assertion.source_record_date + ". " : "The source supplies no occurrence date. ")
        + "This answers occurrence history only; it does not establish a current wild or established population.");
      if (sourceVersionAllowed(bundle, WILD_METHOD)) {
        const raw = sourceRecordForWildProof(context, bundle, assertion);
        const period = plan.questions.find((q) => q.id === "wild-occurrence-in-period")!.period;
        if (retainedWildRecordSupportsPeriod({ record: raw.record, assertion, period })) {
          add("wild-occurrence-in-period", WILD_METHOD, "wild-occurrence-recorded",
            "The retained iNaturalist record explicitly marks this accepted observation as wild and dates it "
            + assertion.source_record_date + ", within " + period.start + " through " + period.end
            + ". One observation does not establish a breeding population or continued occupancy.", [raw.artifact]);
        }
      }
    }
    if (assertion.claim_type === "officially-absent" && assertion.evidence_kind === "absence-statement") {
      const parent = context.jurisdictionEvidence.find((r) => r.id === assertion.parent_jurisdiction_evidence_id
        && r.speciesId === plan.speciesId && r.jurisdiction.countyFips.includes(plan.countyFips));
      if (!parent || parent.review.status !== "human-approved") continue;
      const resolved = resolveTemporalPairDetermination({
        presenceEvidence: pairAssertions.filter((a) => a.claim_type === "recorded-present").map((a) => ({
          evidenceId: a.eventId, observedAt: a.source_record_date ?? undefined,
        })), jurisdictionEvidence: [parent], asOf: plan.asOf,
      });
      if (!resolved.conflict && ["officially-eradicated", "officially-absent"].includes(resolved.currentDeterminationStatus)) {
        add("official-status-as-of", OFFICIAL_METHOD, resolved.currentDeterminationStatus as QuestionAnswer,
          "The reviewed authority's " + parent.statementType + " determination applies to this county as of "
          + plan.asOf + ", within its validity window ending " + parent.validThrough
          + ". The national statement does not imply that the species previously occurred in this county.",
          parent.sourceDocuments.map((d) => {
            const reference = fileReference(context.root, path.join(context.root, d.artifactPath), "application/octet-stream");
            assert(reference.sha256 === d.artifactSha256, "Official source document hash differs.");
            return reference;
          }));
      }
    }
  }
  // One sufficient witness per question; duplicate sources do not increase question completion.
  if (!onePerQuestion) return candidates;
  return [...new Map([...candidates].reverse().map((p) => [p.questionId, p])).values()]
    .sort((a, b) => a.questionId.localeCompare(b.questionId));
}

export function makeSupportedQuestionAssessment(plan: PairQuestionPlan, proof: QuestionCoverageProof): ResearchQuestionAssessment {
  const payload: Omit<ResearchQuestionAssessment, "assessmentId"> = {
    schemaVersion: 1, eventType: "research.question-assessed", planId: plan.planId,
    planSha256: questionPlanSha256(plan), pairKey: proof.pairKey, questionId: proof.questionId,
    disposition: "supported", answer: proof.answer, stoppingRuleId: proof.questionId + ":supported",
    proofIds: [proof.proofId], assessedAt: proof.evaluatedAt, actor: { type: "agent", id: "MAIN-question-assessment@" + QUESTION_ASSESSMENT_METHOD_VERSION },
    supersedes: null,
  };
  const assessment = { ...payload, assessmentId: questionEventId("question-assessment", payload) };
  validateQuestionAssessment(plan, assessment, [proof]);
  return assessment;
}

export function readQuestionAssessmentBatches(root: string, stateCode: string, asOf: string) {
  const directory = path.join(root, "src/data/research/question-assessments");
  if (!existsSync(directory)) return [];
  const verified = new Map<string, string>();
  return readdirSync(directory).sort().map((name) => {
    const filename = path.join(directory, name, "receipt.json");
    assert(existsSync(filename), "Question assessment batch lacks its immutable receipt: " + name);
    const receipt = JSON.parse(readFileSync(filename, "utf8")) as QuestionAssessmentBatch;
    batchValidator.parse(receipt);
    assert(new Set(receipt.sourceRuns.map((r) => r.runId)).size === receipt.sourceRuns.length, "Question batch source runs repeat.");
    assert(receipt.schemaVersion === 1 && receipt.batchId === name && /^[0-9a-f]{40}$/u.test(receipt.codeCommit)
      && receipt.methodVersion === QUESTION_ASSESSMENT_METHOD_VERSION, "Question assessment receipt identity or method differs.");
    if (receipt.stateCode !== stateCode || receipt.createdAt.slice(0, 10) > asOf) return null;
    const parseFile = <T>(artifact: Artifact) => {
      assert(artifact.path.startsWith("src/data/research/question-assessments/" + name + "/"), "Question ledger output escapes its batch.");
      return readQuestionArtifact(root, artifact).toString("utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
    };
    const plans = parseFile<PairQuestionPlan>(receipt.files.plans);
    const proofs = parseFile<QuestionCoverageProof>(receipt.files.proofs);
    const assessments = parseFile<ResearchQuestionAssessment>(receipt.files.assessments);
    const plansByHash = new Map(plans.map((p) => [questionPlanSha256(p), p]));
    assert(plansByHash.size === plans.length, "Question plans repeat in a batch.");
    for (const proof of proofs) {
      assert(proof.evaluatedAt === receipt.createdAt && proof.runIds.every((id) => receipt.sourceRuns.some((r) => r.runId === id)), "Question proof differs from its batch scope or evaluation time.");
      const { proofId, ...payload } = proof;
      assert(proofId === questionEventId("question-proof", payload), "Question proof content identity differs.");
      for (const artifact of proof.artifacts) {
        const key = artifact.sha256 + ":" + artifact.bytes;
        assert(!verified.has(artifact.path) || verified.get(artifact.path) === key, "Question proofs disagree about a retained file.");
        if (!verified.has(artifact.path)) { readQuestionArtifact(root, artifact); verified.set(artifact.path, key); }
      }
    }
    for (const assessment of assessments) {
      assert(assessment.assessedAt === receipt.createdAt, "Question assessment differs from its batch evaluation time.");
      const { assessmentId, ...payload } = assessment;
      assert(assessmentId === questionEventId("question-assessment", payload), "Question assessment content identity differs.");
      const plan = plansByHash.get(assessment.planSha256);
      assert(plan, "Question assessment references a missing immutable plan.");
      validateQuestionAssessment(plan, assessment, proofs);
    }
    for (const run of receipt.sourceRuns) {
      const filename = path.join(root, "src/data/research/runs", run.runId, "receipt.json");
      assert(/^[A-Za-z0-9_-]+$/u.test(run.runId) && sha256(readFileSync(filename)) === run.receiptSha256, "Question assessment source receipt differs.");
    }
    return { receipt, plans, proofs, assessments };
  }).filter((value): value is NonNullable<typeof value> => value !== null);
}

export function buildQuestionAssessmentProjection(context: QuestionEvidenceContext) {
  if (!questionPolicyApplies(context.stateCode, context.asOf)) return undefined;
  const batches = readQuestionAssessmentBatches(context.root, context.stateCode, context.asOf);
  const proofs = batches.flatMap((b) => b.proofs);
  const assessments = batches.flatMap((b) => b.assessments);
  assert(new Set(proofs.map((p) => p.proofId)).size === proofs.length, "Question proof IDs repeat across batches.");
  assert(new Set(assessments.map((a) => a.assessmentId)).size === assessments.length, "Question assessment IDs repeat across batches.");
  const proofById = new Map(proofs.map((p) => [p.proofId, p]));
  const historyByPair = new Map<string, ResearchQuestionAssessment[]>();
  for (const assessment of assessments) { const values = historyByPair.get(assessment.pairKey) ?? []; values.push(assessment); historyByPair.set(assessment.pairKey, values); }
  const byPair = new Map<string, PairQuestionAssessmentProjection>();
  const countyCoverage = new Map<string, QuestionAssessmentCoverage>();
  const definitions = (QUESTION_POLICY.questions as ResearchQuestionDefinition[]).map(({ id, required, predicate, period }) => ({ id, required, predicate, period }));
  const emptyCoverage = (pairDenominator: number): QuestionAssessmentCoverage => ({
    schemaVersion: 1, policyId: QUESTION_POLICY.id, assessmentAsOf: QUESTION_POLICY.asOf, definitions,
    pairDenominator, requiredQuestionCount: pairDenominator * definitions.filter((q) => q.required).length,
    assessedQuestionCount: 0, supportedQuestionCount: 0, unresolvedQuestionCount: 0, questionCountCompletedWithGaps: 0,
    reopenedQuestionCount: 0, fullyAssessedPairCount: 0,
  });
  const total = emptyCoverage(context.counties.length * context.catalogSpecies.length);
  for (const county of context.counties) {
    const coverage = emptyCoverage(context.catalogSpecies.length);
    for (const species of context.catalogSpecies) {
      const key = county.countyFips + ":" + species.id;
      const history = historyByPair.get(key);
      if (!history?.length) continue;
      const plan = makePairQuestionPlan(species, county);
      const pairProofs = [...new Set(history.flatMap((a) => a.proofIds))].map((id) => proofById.get(id)!);
      const current = resolveCurrentQuestionAssessments(plan, history, pairProofs);
      const valid: ResearchQuestionAssessment[] = [];
      const reopened = new Set<ResearchQuestionId>(history.filter((a) => a.planSha256 !== questionPlanSha256(plan)).map((a) => a.questionId));
      for (const assessment of current) {
        // Non-support completion cannot be activated by arbitrary generic screen outcomes.
        assert(assessment.disposition === "supported", "This policy has no evaluated finite source-review reader yet.");
        const referenced = assessment.proofIds.map((id) => proofById.get(id)!);
        const matches = referenced.every((proof) => deriveSupportedQuestionProofs(context, plan, assessment.assessedAt, false, proof)
          .some((candidate) => candidate.proofId === proof.proofId));
        if (matches) { valid.push(assessment); reopened.delete(assessment.questionId); }
        else reopened.add(assessment.questionId);
      }
      const summary = summarizeQuestionAssessmentDecisions(plan, valid);
      const publicAnswers = valid.map((a): PublicQuestionAnswer => {
        const selected = a.proofIds.map((id) => proofById.get(id)!);
        return {
          questionId: a.questionId, disposition: a.disposition, answer: a.answer, assessmentId: a.assessmentId, assessedAt: a.assessedAt,
          explanation: selected.map((p) => p.explanation).join(" "),
          citations: selected.flatMap((p) => p.assertionEventIds.map((id) => {
            const assertion = context.activeAssertions.find((entry) => entry.eventId === id)!;
            return { evidenceId: id, sourceId: assertion.source_id, url: assertion.source_url, observedAt: assertion.source_record_date };
          })),
        };
      }).sort((a, b) => a.questionId.localeCompare(b.questionId));
      byPair.set(key, {
        policyId: QUESTION_POLICY.id, assessmentAsOf: QUESTION_POLICY.asOf, requiredQuestions: summary.requiredQuestions,
        assessedQuestions: summary.assessedQuestions, researchComplete: summary.researchComplete,
        reopenedQuestionIds: [...reopened].sort(), answers: publicAnswers,
      });
      for (const entry of [coverage, total]) {
        entry.assessedQuestionCount += summary.assessedQuestions;
        entry.supportedQuestionCount += summary.supportedQuestions;
        entry.unresolvedQuestionCount += summary.unresolvedQuestions;
        entry.questionCountCompletedWithGaps += summary.questionsCompletedWithGaps;
        entry.reopenedQuestionCount += reopened.size;
        entry.fullyAssessedPairCount += Number(summary.researchComplete);
      }
    }
    countyCoverage.set(county.countyFips, coverage);
  }
  assert(byPair.size === historyByPair.size, "Question ledger contains a pair outside the current catalog or county scope; explicit scope review is required.");
  return { summary: total, counties: countyCoverage, pairs: byPair };
}
