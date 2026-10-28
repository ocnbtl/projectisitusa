import assert from "node:assert/strict";
import { readDirectoryState, matchesEnvironment } from "../src/lib/ui/species-directory-state";
import { readableSourceNote, findingDescription } from "../src/lib/ui/research-copy";
import { ENVIRONMENT_OPTIONS } from "../src/lib/constants";

for (const option of ENVIRONMENT_OPTIONS) {
  const state = readDirectoryState(`?environment=${option.value ?? ""}&q=fern&category=plants&view=grid&page=2`);
  assert.equal(state.environment, option.value);
  assert.deepEqual(state.categories, ["plants"]);
  assert.equal(state.query, "fern");
  assert.equal(state.page, 2);
}
assert.equal(readDirectoryState("?environment=unknown").environment, null);
assert.equal(matchesEnvironment({}, null), true, "Unknown habitats remain visible in the unfiltered catalog");
assert.equal(matchesEnvironment({}, "forest"), false, "Do not infer habitat where none is recorded");
assert.equal(matchesEnvironment({ registry: { environmentTags: ["forest", "wetlands"] } }, "wetlands"), true);
assert.equal(matchesEnvironment({ registry: { environmentTags: ["freshwater"] } }, "marine-coastal"), false);

const specimenNote = "Preserved specimen evidence only. Aggregated records may overlap GBIF and collection portals.";
assert.match(readableSourceNote(specimenNote), /same specimen/);
assert.equal(readableSourceNote(specimenNote + " Additional source-specific limit."), specimenNote + " Additional source-specific limit.");
assert.equal(readableSourceNote("A source-specific qualification."), "A source-specific qualification.");
assert.match(findingDescription({ displayStatus: "verified-present", conflict: false }), /older record/);
assert.match(findingDescription({ displayStatus: "not-detected", conflict: false }), /area and time surveyed/);
assert.match(findingDescription({ displayStatus: "verified-absent", conflict: false }), /particular place and period/);
assert.match(findingDescription({ displayStatus: "not-researched", conflict: false }), /does not mean the species is absent/);
assert.match(findingDescription({ displayStatus: "verified-present", conflict: true }), /do not agree/);
console.log("Discovery checks passed: habitat URL state, filter semantics, and evidence qualifications.");
