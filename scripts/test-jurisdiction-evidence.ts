import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  resolveTemporalPairDetermination,
  validateJurisdictionEvidenceRegistry,
} from "@/lib/research/jurisdiction-evidence";
import type {
  JurisdictionEvidenceRecord,
  JurisdictionEvidenceRegistry,
} from "@/lib/research/types";

const root = process.cwd();
const countyRegistry = JSON.parse(
  readFileSync(path.join(root, "src/data/research/county-equivalent-registry.json"), "utf8"),
) as Parameters<typeof validateJurisdictionEvidenceRegistry>[0]["countyRegistry"];
const stateRegistry = JSON.parse(
  readFileSync(path.join(root, "src/data/research/state-registry.json"), "utf8"),
) as Parameters<typeof validateJurisdictionEvidenceRegistry>[0]["stateRegistry"];
const committedRegistry = JSON.parse(
  readFileSync(path.join(root, "src/data/research/jurisdiction-evidence-registry.json"), "utf8"),
) as JurisdictionEvidenceRegistry;
const registrySchema = JSON.parse(
  readFileSync(
    path.join(root, "src/data/research/schemas/jurisdiction-evidence-registry.schema.json"),
    "utf8",
  ),
) as Parameters<typeof z.fromJSONSchema>[0];
const schemaValidator = z.fromJSONSchema(registrySchema);

schemaValidator.parse(committedRegistry);
validateJurisdictionEvidenceRegistry({
  registry: committedRegistry,
  countyRegistry,
  stateRegistry,
});
assert.equal(committedRegistry.records.length, 0, "Candidate jurisdiction evidence published before approval.");

const nationalStateCodes = new Set(stateRegistry.nationalV1.certificationOrder);
const nationalCountyFips = countyRegistry.countyEquivalents
  .filter((county) => county.status === "active" && nationalStateCodes.has(county.stateCode))
  .map((county) => county.countyFips)
  .sort();
const fipsHash = (values: string[]) =>
  createHash("sha256").update(JSON.stringify(values)).digest("hex");
const supportText = "The authority states that the target was eradicated.";
const supportTextSha256 = createHash("sha256").update(supportText).digest("hex");

function record(input: {
  id: string;
  speciesId: string;
  statementType: "officially-eradicated" | "officially-absent";
  level: "nation" | "county-set";
  stateCode: string | null;
  countyFips: string[];
  effectiveAt: string;
  reaffirmedAt: string;
  validThrough: string;
}): JurisdictionEvidenceRecord {
  return {
    schemaVersion: 1,
    id: input.id,
    speciesId: input.speciesId,
    statementType: input.statementType,
    sourceDocuments: [
      {
        sourceId: "synthetic-authority",
        url: "https://example.test/authority",
        artifactPath: "fixtures/synthetic-authority.html",
        artifactSha256: "a".repeat(64),
        supportText,
        supportTextSha256,
        publishedAt: input.effectiveAt,
        modifiedAt: input.reaffirmedAt,
      },
    ],
    jurisdiction: {
      level: input.level,
      id: input.level === "nation" ? "US-national-v1" : "US-NJ-explicit-counties",
      stateCode: input.stateCode,
      countyFips: input.countyFips,
      countyFipsSha256: fipsHash(input.countyFips),
      exclusions: [],
    },
    effectiveAt: input.effectiveAt,
    reaffirmedAt: input.reaffirmedAt,
    validThrough: input.validThrough,
    review: {
      gate: "human-approved",
      status: "human-approved",
      actorId: "fixture-human-reviewer",
      reviewedAt: "2026-08-24T19:45:00.000Z",
    },
    caveats: ["Synthetic contract fixture only."],
  };
}

const nationalEradication = record({
  id: "fixture-national-eradication",
  speciesId: "vespa-mandarinia",
  statementType: "officially-eradicated",
  level: "nation",
  stateCode: null,
  countyFips: nationalCountyFips,
  effectiveAt: "2024-12-18",
  reaffirmedAt: "2025-11-03",
  validThrough: "2026-11-03",
});
const newJerseyAbsence = record({
  id: "fixture-new-jersey-eradication",
  speciesId: "asian-longhorned-beetle",
  statementType: "officially-eradicated",
  level: "county-set",
  stateCode: "NJ",
  countyFips: ["34017", "34023", "34039"],
  effectiveAt: "2013-03-14",
  reaffirmedAt: "2026-07-30",
  validThrough: "2027-07-30",
});
const fixtureRegistry: JurisdictionEvidenceRegistry = {
  schemaVersion: 1,
  updatedAt: "2026-08-24",
  records: [nationalEradication, newJerseyAbsence],
};

schemaValidator.parse(fixtureRegistry);
validateJurisdictionEvidenceRegistry({
  registry: fixtureRegistry,
  countyRegistry,
  stateRegistry,
});
assert.equal(nationalCountyFips.length, 3_144);
assert.equal(fipsHash(nationalCountyFips), "e637d99538d4e253df2320f0a660e6bfca6d674d50c215f907fa1a67e287e333");

const historicalThenEradicated = resolveTemporalPairDetermination({
  presenceEvidence: [{ evidenceId: "historical-presence", observedAt: "2021" }],
  jurisdictionEvidence: [nationalEradication],
  asOf: "2026-08-24",
});
assert.equal(historicalThenEradicated.historicalOccurrenceStatus, "recorded-present");
assert.equal(historicalThenEradicated.currentDeterminationStatus, "officially-eradicated");
assert.equal(historicalThenEradicated.compatibilityDisplayStatus, "verified-present");
assert.equal(historicalThenEradicated.conflict, false);

const laterPresenceConflict = resolveTemporalPairDetermination({
  presenceEvidence: [{ evidenceId: "later-presence", observedAt: "2025-01-01" }],
  jurisdictionEvidence: [nationalEradication],
  asOf: "2026-08-24",
});
assert.equal(laterPresenceConflict.currentDeterminationStatus, "present");
assert.equal(laterPresenceConflict.compatibilityDisplayStatus, "verified-present");
assert.equal(laterPresenceConflict.conflict, true);

const undatedPresenceConflict = resolveTemporalPairDetermination({
  presenceEvidence: [{ evidenceId: "undated-presence" }],
  jurisdictionEvidence: [nationalEradication],
  asOf: "2026-08-24",
});
assert.equal(undatedPresenceConflict.currentDeterminationStatus, "present");
assert.equal(undatedPresenceConflict.conflict, true);

const staleDetermination = resolveTemporalPairDetermination({
  presenceEvidence: [{ evidenceId: "historical-presence", observedAt: "2021" }],
  jurisdictionEvidence: [nationalEradication],
  asOf: "2026-11-04",
});
assert.equal(staleDetermination.currentDeterminationStatus, "none");
assert.equal(staleDetermination.compatibilityDisplayStatus, "verified-present");
assert.deepEqual(staleDetermination.staleParentIds, [nationalEradication.id]);

const absenceWithoutHistory = resolveTemporalPairDetermination({
  presenceEvidence: [],
  jurisdictionEvidence: [nationalEradication],
  asOf: "2026-08-24",
});
assert.equal(absenceWithoutHistory.historicalOccurrenceStatus, "none");
assert.equal(absenceWithoutHistory.currentDeterminationStatus, "officially-eradicated");
assert.equal(absenceWithoutHistory.compatibilityDisplayStatus, "verified-absent");

let incompleteNationRejected = false;
try {
  const incompleteFips = nationalCountyFips.slice(0, -1);
  validateJurisdictionEvidenceRegistry({
    registry: {
      ...fixtureRegistry,
      records: [
        {
          ...nationalEradication,
          jurisdiction: {
            ...nationalEradication.jurisdiction,
            countyFips: incompleteFips,
            countyFipsSha256: fipsHash(incompleteFips),
          },
        },
      ],
    },
    countyRegistry,
    stateRegistry,
  });
} catch {
  incompleteNationRejected = true;
}
assert.equal(incompleteNationRejected, true, "Incomplete national coverage was accepted.");

let declaredExclusionRejected = false;
try {
  const excludedFips = nationalCountyFips.at(-1)!;
  const includedFips = nationalCountyFips.slice(0, -1);
  validateJurisdictionEvidenceRegistry({
    registry: {
      ...fixtureRegistry,
      records: [
        {
          ...nationalEradication,
          jurisdiction: {
            ...nationalEradication.jurisdiction,
            countyFips: includedFips,
            countyFipsSha256: fipsHash(includedFips),
            exclusions: [excludedFips],
          },
        },
      ],
    },
    countyRegistry,
    stateRegistry,
  });
} catch {
  declaredExclusionRejected = true;
}
assert.equal(declaredExclusionRejected, true, "Declared national exclusion was accepted.");

let supportTextDriftRejected = false;
try {
  validateJurisdictionEvidenceRegistry({
    registry: {
      ...fixtureRegistry,
      records: [
        {
          ...nationalEradication,
          sourceDocuments: nationalEradication.sourceDocuments.map((document) => ({
            ...document,
            supportText: `${document.supportText} Changed.`,
          })),
        },
      ],
    },
    countyRegistry,
    stateRegistry,
  });
} catch {
  supportTextDriftRejected = true;
}
assert.equal(supportTextDriftRejected, true, "Changed source support text was accepted.");

console.log(
  JSON.stringify(
    {
      emptyCandidateRegistry: true,
      exactNationalCountyCount: nationalCountyFips.length,
      exactNewJerseyCountySet: true,
      historicalPresenceCoexistsWithEradication: true,
      laterOrUndatedPresenceConflicts: true,
      staleDeterminationDoesNotPublishCurrentAbsence: true,
      incompleteJurisdictionRejected: true,
      unresolvedExclusionRejected: true,
      supportTextDriftRejected: true,
      humanApprovalRequired: true,
    },
    null,
    2,
  ),
);
