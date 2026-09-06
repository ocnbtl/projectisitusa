import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  QUESTION_POLICY, makePairQuestionPlan, deriveSupportedQuestionProofs, makeSupportedQuestionAssessment,
  retainedWildRecordSupportsPeriod, readQuestionArtifact, type QuestionEvidenceContext,
} from "../src/lib/research/question-assessment-ledger";
import { summarizePairQuestionAssessments, resolveCurrentQuestionAssessments } from "../src/lib/research/question-assessments";
import { loadQuestionEvidenceContext } from "./research/question-assessment-context";

const context = loadQuestionEvidenceContext(process.cwd(), "DC", QUESTION_POLICY.asOf);
const timestamp = "2026-09-06T08:00:00.000Z";
const county = context.counties.find((c) => c.countyFips === "11001")!;
const planFor = (id: string) => makePairQuestionPlan(context.catalogSpecies.find((s) => s.id === id)!, county);
const proofsFor = (id: string, sourceContext: QuestionEvidenceContext = context) => deriveSupportedQuestionProofs(sourceContext, planFor(id), timestamp);
const aedes = proofsFor("aedes-albopictus");
assert.deepEqual(aedes.map((p) => p.questionId), ["documented-historical-occurrence", "wild-occurrence-in-period"]);
const aedesPlan = planFor("aedes-albopictus");
const events = aedes.map((p) => makeSupportedQuestionAssessment(aedesPlan, p));
assert.equal(summarizePairQuestionAssessments(aedesPlan, events, aedes).researchComplete, false);
assert.equal(summarizePairQuestionAssessments(aedesPlan, events, aedes).assessedQuestions, 2);
const extraReview = { ...context.reviewEvents.find((r) => r.references.assertion_event_id === aedes[0].assertionEventIds[0])!, eventId: "later-additional-review-fixture" };
assert(deriveSupportedQuestionProofs({ ...context, reviewEvents: [...context.reviewEvents, extraReview] }, aedesPlan, timestamp, false, aedes[0]).some((p) => p.proofId === aedes[0].proofId));
const wild = aedes.find((p) => p.questionId === "wild-occurrence-in-period")!;
const assertion = context.activeAssertions.find((a) => a.eventId === wild.assertionEventIds[0])!;
const artifact = wild.artifacts.find((a) => a.path.includes("/gbif-occurrences-aedes-albopictus-"))!;
const rows = JSON.parse(gunzipSync(readFileSync(artifact.path)).toString("utf8")).results as Record<string, unknown>[];
const record = rows.find((r) => String(r.key) === assertion.source_record_id)!;
const period = aedesPlan.questions.find((q) => q.id === "wild-occurrence-in-period")!.period;
assert.equal(retainedWildRecordSupportsPeriod({ record, assertion, period }), true);
for (const changed of [
  { ...record, "http://unknown.org/captive_cultivated": "captive" },
  { ...record, "http://unknown.org/captive_cultivated": undefined },
  { ...record, eventDate: "2025-05-04" },
  { ...record, eventDate: "2026-02-30" },
  { ...record, species: "Aedes aegypti" },
  { ...record, occurrenceStatus: "ABSENT" },
  { ...record, key: "another-record" },
]) assert.equal(retainedWildRecordSupportsPeriod({ record: changed, assertion, period }), false);
assert.equal(retainedWildRecordSupportsPeriod({ record, assertion, period: { start: "2026-06-01", end: "2026-09-06" } }), false);
assert.throws(() => readQuestionArtifact(context.root, { ...artifact, sha256: "0".repeat(64) }), /hash or length/u);
assert.throws(() => readQuestionArtifact(context.root, { ...artifact, path: "../outside.json" }), /escapes/u);
assert.deepEqual(proofsFor("anolis-sagrei").map((p) => p.questionId), ["documented-historical-occurrence"]);
assert.deepEqual(proofsFor("acer-platanoides").map((p) => p.questionId), ["documented-historical-occurrence"]);
assert.deepEqual(proofsFor("lymantria-dispar"), []); // Regulatory geography is not a biological occurrence witness.
assert.deepEqual(proofsFor("linepithema-humile"), []); // A completed iNaturalist source query is not a biological answer.
assert.deepEqual(proofsFor("mesocyclops-pehpeiensis"), []); // Retained invalid 1996-06-31 needs source-date review.
const hornet = proofsFor("vespa-mandarinia");
assert.equal(hornet.length, 1);
assert.equal(hornet[0].answer, "officially-eradicated");
assert.equal(proofsFor("vespa-mandarinia", { ...context, jurisdictionEvidence: context.jurisdictionEvidence.map((r) => ({ ...r, validThrough: "2026-09-05" })) }).length, 0);
assert.equal(proofsFor("aedes-albopictus", { ...context, activeAssertions: context.activeAssertions.filter((a) => a.species_id !== "aedes-albopictus") }).length, 0);
const corrected = structuredClone(context.catalogSpecies.find((s) => s.id === "aedes-albopictus")!);
corrected.scientificName = "Aedes corrected";
assert.deepEqual(resolveCurrentQuestionAssessments(makePairQuestionPlan(corrected, county), events, aedes), []);
const superseded = { ...events[0], assessmentId: "explicit-replacement-test", assessedAt: "2026-09-06T08:01:00.000Z", supersedes: events[0].assessmentId };
assert.equal(resolveCurrentQuestionAssessments(aedesPlan, [...events, superseded], aedes).length, 2);
console.log("Question source readers: retained wild witness, date boundaries, historical-only records, regulatory exclusion, explicit official scope, tamper rejection and reopening passed.");
