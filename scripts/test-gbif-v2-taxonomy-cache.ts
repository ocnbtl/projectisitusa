import assert from "node:assert/strict";

import {
  classifyV2Match,
  rankCandidateSpecies,
} from "./research/acquire-gbif-v2-taxonomy-cache";

const ranked = rankCandidateSpecies({
  species: [
    { id: "alpha", scientificName: "Alpha beta" },
    { id: "gamma", scientificName: "Gamma delta" },
  ],
  countyShards: [
    {
      stateCode: "AL",
      countyFips: "01001",
      pairResolution: { defaultDisplayStatus: "not-researched" },
      pairs: [{ speciesId: "alpha", displayStatus: "verified-present", researchStatus: "evidence-found" }],
    },
    {
      stateCode: "AL",
      countyFips: "01003",
      pairResolution: { defaultDisplayStatus: "not-researched" },
      pairs: [{ speciesId: "gamma", displayStatus: "not-researched", researchStatus: "blocked" }],
    },
  ],
});
assert.deepEqual(ranked.map((entry) => [entry.id, entry.notResearchedPairs, entry.blockedPairs, entry.alreadyResearchedPairs]), [
  ["alpha", 1, 0, 1],
  ["gamma", 1, 1, 0],
]);

const accepted = classifyV2Match("Myocastor coypus", {
  usage: {
    key: "4264680",
    canonicalName: "Myocastor coypus",
    rank: "SPECIES",
    status: "ACCEPTED",
  },
  diagnostics: { matchType: "EXACT", confidence: 99 },
  synonym: false,
});
assert.deepEqual(accepted, {
  accepted: true,
  reason: "accepted",
  taxonKey: 4264680,
  canonicalName: "Myocastor coypus",
  confidence: 99,
});
assert.equal(classifyV2Match("Myocastor coypus", {
  usage: { key: "6RRQT", canonicalName: "Myocastor coypus", rank: "SPECIES", status: "ACCEPTED" },
  diagnostics: { matchType: "EXACT", confidence: 99 },
  synonym: false,
}).reason, "non-numeric-backbone-key");
assert.equal(classifyV2Match("Myocastor coypus", {
  usage: { key: "4264680", canonicalName: "Myocastor coypus", rank: "SPECIES", status: "SYNONYM" },
  diagnostics: { matchType: "EXACT", confidence: 99 },
  synonym: true,
}).reason, "matched-usage-not-accepted");

process.stdout.write(`${JSON.stringify({ ok: true, ranking: ranked.length, acceptedTaxonKey: accepted.taxonKey })}\n`);
