import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { describeTemporalDetermination } from "@/lib/research/temporal-determination-presentation";
import type { ResearchCountyFile } from "@/lib/research/types";

const whatcom = JSON.parse(readFileSync("public/generated/research/WA/counties/53073.json", "utf8")) as ResearchCountyFile;
const hornet = whatcom.pairs.find((pair) => pair.speciesId === "vespa-mandarinia")!;
assert(hornet);
const description = describeTemporalDetermination(hornet)!;
assert.equal(hornet.displayStatus, "verified-present");
assert.equal(description.currentLabel, "Officially eradicated");
assert.equal(description.historyLabel, "Previously recorded");
assert.match(description.explanation, /does not establish current presence/u);
assert.equal(describeTemporalDetermination({ conflict: false }), null, "Older projections must not invent temporal fields.");
const expired = describeTemporalDetermination({ historicalOccurrenceStatus: "recorded-present", currentDeterminationStatus: "none", conflict: false })!;
assert.equal(expired.currentLabel, "No current agency determination");
assert.equal(expired.showInResults, false);
const conflict = describeTemporalDetermination({ ...hornet, conflict: true })!;
assert.equal(conflict.currentLabel, "Conflicting evidence");
assert.doesNotMatch(conflict.explanation, /officially absent|officially eradicated/iu);
const absent = describeTemporalDetermination({ historicalOccurrenceStatus: "none", currentDeterminationStatus: "officially-absent", conflict: false })!;
assert.equal(absent.currentLabel, "Officially absent");
assert.match(absent.explanation, /not inferred from missing records/u);
assert.match(absent.explanation, /county derivation/u);
assert.equal(describeTemporalDetermination({ currentDeterminationStatus: "present", conflict: false })!.currentLabel, "Present");
console.log("Temporal determination presentation tests passed: real Whatcom history, legacy data, expiry, conflict, absence, and presence.");

const diseaseBasis = {
  kind: "official-disease-distribution", sourceId: "aphis-cbs-current-disease-status",
  authority: "USDA APHIS", diseaseName: "citrus black spot",
  declarationPublishedAt: "2026-09-03", parentJurisdictionEvidenceId: "synthetic-cbs-parent",
} as const;
const diseasePair = { currentDeterminationStatus: "officially-absent", historicalOccurrenceStatus: "none", conflict: false, currentDeterminationBasis: diseaseBasis } as const;
const disease = describeTemporalDetermination(diseasePair)!;
assert.equal(disease.currentLabel, "Official disease status: absent");
assert.equal(disease.pairStatusLabel, disease.currentLabel, "Table badge must carry the qualified status too.");
assert.equal(disease.attribution, "USDA APHIS citrus black spot statement dated 2026-09-03");
assert.match(disease.explanation, /does not establish universal absence/u);
assert.match(disease.explanation, /not a county survey/u);
assert.equal(describeTemporalDetermination({ ...diseasePair, conflict: true })!.pairStatusLabel, undefined, "Conflict must override qualified absence.");
assert.equal(describeTemporalDetermination({ ...diseasePair, currentDeterminationStatus: "none" })!.showInResults, false, "Expired status must not retain an absence label.");
assert.equal(describeTemporalDetermination({ ...diseasePair, currentDeterminationStatus: "present" })!.currentLabel, "Present");
assert.equal(absent.pairStatusLabel, undefined, "Existing methods retain their presentation.");
console.log("Qualified disease-status labels passed: attribution, scope, conflict, expiry, presence and legacy behavior.");

const reportedPair = { currentDeterminationStatus: "officially-absent", historicalOccurrenceStatus: "none", conflict: false,
  currentDeterminationBasis: { kind: "official-known-distribution", sourceId: "aphis-pcn-reported-distribution", authority: "USDA APHIS", speciesName: "pale cyst nematode", scientificName: "Globodera pallida", authorityStatusAsOf: "2025-09-30", parentJurisdictionEvidenceId: "synthetic-pcn-parent" } } as const;
const reported = describeTemporalDetermination(reportedPair)!;
assert.equal(reported.currentLabel, "Official status: no known detections");
assert.equal(reported.pairStatusLabel, reported.currentLabel);
assert.equal(reported.attribution, "USDA APHIS pale cyst nematode report for the period ending 2025-09-30");
assert.match(reported.explanation, /does not establish universal absence/u);
assert.match(reported.explanation, /or show that the county was surveyed/u);
assert.equal(describeTemporalDetermination({ ...reportedPair, conflict: true })!.currentLabel, "Conflicting evidence");
assert.equal(describeTemporalDetermination({ ...reportedPair, currentDeterminationStatus: "none" })!.pairStatusLabel, undefined);
assert.equal(describeTemporalDetermination({ ...reportedPair, currentDeterminationStatus: "present" })!.currentLabel, "Present");
console.log("Reported-status compatibility passed: qualified labels, attribution, no survey claim, conflict, expiry and presence.");
