import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import entrypoints from "@/data/research/species-research-entrypoints.json";
import {
  buildResearchHref,
  parseResearchDeepLink,
} from "@/lib/research/research-deep-link";

assert.equal(
  buildResearchHref({ stateCode: "vt", countyFips: "50005", speciesQuery: "abies-alba" }),
  "/research?state=VT&county=50005&species=abies-alba",
);
assert.deepEqual(
  parseResearchDeepLink("?state=vt&county=50005&species=Abies%20alba"),
  { stateCode: "VT", countyFips: "50005", speciesQuery: "Abies alba" },
);
assert.deepEqual(
  parseResearchDeepLink("?state=VERMONT&county=5005&species="),
  { stateCode: null, countyFips: null, speciesQuery: null },
);
assert.equal(buildResearchHref({ stateCode: "bad", countyFips: "1", speciesQuery: " " }), "/research");

assert.equal(entrypoints.schemaVersion, 1);
assert.equal(entrypoints.entries.length, 1);
for (const entrypoint of entrypoints.entries) {
  const countyPath = path.join(
    process.cwd(),
    "public/generated/research",
    entrypoint.stateCode,
    "counties",
    `${entrypoint.countyFips}.json`,
  );
  const county = JSON.parse(readFileSync(countyPath, "utf8")) as {
    asOf: string;
    stateCode: string;
    countyFips: string;
    pairs: Array<{
      speciesId: string;
      displayStatus: string;
      evidence: Array<{ evidenceId: string }>;
    }>;
  };
  assert.equal(county.asOf, entrypoints.asOf);
  assert.equal(county.stateCode, entrypoint.stateCode);
  assert.equal(county.countyFips, entrypoint.countyFips);
  const pair = county.pairs.find((candidate) => candidate.speciesId === entrypoint.speciesId);
  assert(pair);
  assert.equal(pair.displayStatus, entrypoint.displayStatus);
  assert(pair.evidence.some((evidence) => evidence.evidenceId === entrypoint.evidenceId));
}

process.stdout.write("Research deep-link and compact species-entrypoint tests passed.\n");
