import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { loadQuestionEvidenceContext } from "./question-assessment-context";
import {
  QUESTION_POLICY, QUESTION_POLICY_SHA256, questionPolicyApplies, makePairQuestionPlan,
  deriveSupportedQuestionProofs, makeSupportedQuestionAssessment, type QuestionAssessmentBatch,
} from "../../src/lib/research/question-assessment-ledger";
import { QUESTION_ASSESSMENT_METHOD_VERSION, type PairQuestionPlan, type QuestionCoverageProof, type ResearchQuestionAssessment } from "../../src/lib/research/question-assessments";
import { assertRunStartNotFuture, fileReference, sha256 } from "../../src/lib/research/run-files";

const options = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) options.set(process.argv[i], process.argv[i + 1]);
const root = process.cwd();
const mode = options.get("--mode") ?? "preview";
const stateCode = options.get("--state") ?? "DC";
const asOf = options.get("--as-of") ?? QUESTION_POLICY.asOf;
const campaign = options.get("--campaign") ?? "dc-questions-20260906-r1";
const evaluatedAt = options.get("--evaluated-at") ?? new Date().toISOString();
if (!["preview", "stage"].includes(mode) || !/^[a-z0-9-]+$/u.test(campaign) || !questionPolicyApplies(stateCode, asOf)) throw new Error("Question batch mode, campaign or policy scope is invalid.");
assertRunStartNotFuture(evaluatedAt);
if (evaluatedAt.slice(0, 10) < asOf) throw new Error("Question evaluation predates its reporting date.");
const git = (args: string[]) => execFileSync("git", ["-c", "safe.directory=" + root.replace(/\\/gu, "/"), ...args], { cwd: root, encoding: "utf8" }).trim();
const codeCommit = git(["rev-parse", "HEAD"]);
const codePaths = ["src/lib/research", "scripts/research/build-question-assessment-batch.ts", "scripts/research/question-assessment-context.ts", "src/data/research/schemas", "src/data/research/research-questions.json"];
const dirtyCode = git(["status", "--porcelain", "--", ...codePaths]);
if (mode === "stage" && dirtyCode) throw new Error("Commit the evaluated question method before immutable staging.");
const destination = path.join(root, ".cache/research/question-assessments", mode + "-" + campaign);
if (existsSync(destination)) throw new Error("Question batch staging directory already exists; retain it and choose a new campaign.");
const context = loadQuestionEvidenceContext(root, stateCode, asOf);
const plans: PairQuestionPlan[] = [], proofs: QuestionCoverageProof[] = [], assessments: ResearchQuestionAssessment[] = [];
for (const county of context.counties) {
  for (const species of [...context.catalogSpecies].sort((a, b) => a.id.localeCompare(b.id))) {
    const plan = makePairQuestionPlan(species, county);
    const found = deriveSupportedQuestionProofs(context, plan, evaluatedAt);
    if (!found.length) continue;
    plans.push(plan); proofs.push(...found);
    assessments.push(...found.map((proof) => makeSupportedQuestionAssessment(plan, proof)));
  }
}
if (!assessments.length) throw new Error("No evaluated question answers were found.");
mkdirSync(destination, { recursive: true });
const writeLines = (name: string, rows: object[]) => {
  const filename = path.join(destination, name + ".ndjson");
  writeFileSync(filename, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const reference = fileReference(root, filename, "application/x-ndjson");
  return { path: "src/data/research/question-assessments/" + campaign + "/" + name + ".ndjson", sha256: reference.sha256, bytes: reference.bytes };
};
const sourceRunIds = [...new Set(proofs.flatMap((proof) => proof.runIds))].sort();
const receipt: QuestionAssessmentBatch = {
  schemaVersion: 1, batchId: campaign, stateCode, createdAt: evaluatedAt, codeCommit,
  methodVersion: QUESTION_ASSESSMENT_METHOD_VERSION, policySha256: QUESTION_POLICY_SHA256,
  files: { plans: writeLines("plans", plans), proofs: writeLines("proofs", proofs), assessments: writeLines("assessments", assessments) },
  sourceRuns: sourceRunIds.map((runId) => ({ runId, receiptSha256: sha256(readFileSync(path.join(root, "src/data/research/runs", runId, "receipt.json"))) })),
};
writeFileSync(path.join(destination, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
const questionCounts = Object.fromEntries(QUESTION_POLICY.questions.map((q) => [q.id, assessments.filter((a) => a.questionId === q.id).length]));
const report = {
  schemaVersion: 1, mode, campaign, evaluatedAt, stateCode, asOf, codeCommit, methodCodeCommitted: !dirtyCode,
  uniquePairs: plans.length, assessmentEvents: assessments.length, questionCounts,
  questionDenominator: context.counties.length * context.catalogSpecies.length * QUESTION_POLICY.questions.filter((q) => q.required).length,
  newBiologicalDeterminations: 0, unresolvedCompletions: 0, wholePairsCompleted: 0,
  sourceRunCount: sourceRunIds.length, destination,
};
writeFileSync(path.join(destination, "evaluation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
