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
assert.equal(describeTemporalDetermination({ currentDeterminationStatus: "present", conflict: false })!.currentLabel, "Present");
console.log("Temporal determination presentation tests passed: real Whatcom history, legacy data, expiry, conflict, absence, and presence.");
