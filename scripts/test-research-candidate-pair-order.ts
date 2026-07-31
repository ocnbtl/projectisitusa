import { canonicalCandidatePairKeys } from "@/lib/research/candidate-pairs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const speciesFirst = [
  { countyFips: "04013", speciesId: "ageratina-adenophora" },
  { countyFips: "04015", speciesId: "ageratina-adenophora" },
  { countyFips: "04013", speciesId: "azolla-pinnata" },
  { countyFips: "04015", speciesId: "azolla-pinnata" },
];
const countyFirst = [
  speciesFirst[0],
  speciesFirst[2],
  speciesFirst[1],
  speciesFirst[3],
];
const expected = [
  "04013:ageratina-adenophora",
  "04013:azolla-pinnata",
  "04015:ageratina-adenophora",
  "04015:azolla-pinnata",
];

const fromSpeciesFirst = canonicalCandidatePairKeys(speciesFirst);
const fromCountyFirst = canonicalCandidatePairKeys(countyFirst);

assert(
  JSON.stringify(fromSpeciesFirst) === JSON.stringify(expected),
  "Species-first input did not canonicalize to county-species order.",
);
assert(
  JSON.stringify(fromCountyFirst) === JSON.stringify(expected),
  "County-first input did not preserve canonical county-species order.",
);
assert(
  JSON.stringify(fromSpeciesFirst) === JSON.stringify(fromCountyFirst),
  "Candidate pair identity depends on input order.",
);

process.stdout.write("Research candidate pair ordering tests passed.\n");
