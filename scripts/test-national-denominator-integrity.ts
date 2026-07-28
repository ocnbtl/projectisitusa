import { readFileSync } from "node:fs";
import path from "node:path";

import catalog from "@/data/generated/species.json";
import stateRegistry from "@/data/research/state-registry.json";
import stateResearchConfig from "@/data/research/state-research-config.json";
import { listCountyEquivalents } from "@/lib/research/geography-registry";
import { resolveSparseCountyPairs } from "@/lib/research/pair-resolution";
import {
  hashCatalogSpeciesIds,
  resolveStateResearchScope,
  type StateApplicabilityFile,
  type StateResearchConfigFile,
} from "@/lib/research/state-research-config";
import type {
  ResearchCountyFile,
  ResearchStateSummary,
} from "@/lib/research/types";

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(relativePath: string) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), "utf8")) as T;
}

const configFile = stateResearchConfig as StateResearchConfigFile;
const catalogSpeciesIds = catalog.map((entry) => entry.id);
const catalogHash = hashCatalogSpeciesIds(catalogSpeciesIds);
const decisionTotals = {
  applicable: 0,
  "not-applicable": 0,
  unknown: 0,
  blocked: 0,
};
let resolvedStateSpeciesDecisions = 0;
let configuredStateScopeSpecies = 0;

for (const config of configFile.states) {
  const applicability = readJson<StateApplicabilityFile>(
    config.speciesScope.applicabilityPath,
  );
  assert(
    applicability.catalogSpeciesCount === catalogSpeciesIds.length &&
      applicability.catalogSpeciesIdsSha256 === catalogHash,
    `${config.stateCode} applicability is not pinned to the current catalog.`,
  );
  const resolved = resolveStateResearchScope({
    configFile,
    stateCode: config.stateCode,
    catalogSpeciesIds,
    asOf: "2026-07-26",
    applicability,
  });
  resolvedStateSpeciesDecisions += resolved.resolvedStateSpeciesDecisionCount;
  configuredStateScopeSpecies += resolved.speciesIds.length;
  const summary = readJson<ResearchStateSummary>(
    `src/data/generated/research/${config.stateCode}/summary.json`,
  );
  decisionTotals.applicable += summary.scope.applicableSpeciesCount;
  decisionTotals["not-applicable"] +=
    summary.scope.notApplicableSpeciesCount;
  decisionTotals.unknown += summary.scope.unknownSpeciesCount;
  decisionTotals.blocked += summary.scope.blockedSpeciesCount;
  assert(
    Object.values(summary.stateSpeciesResearch.counts).reduce(
      (sum, count) => sum + count,
      0,
    ) === catalogSpeciesIds.length,
    `${config.stateCode} state-species research statuses do not partition the catalog.`,
  );
}

const jurisdictionCount = stateRegistry.nationalV1.jurisdictionCount;
const countyEquivalentCount = configFile.states.reduce(
  (sum, config) => sum + listCountyEquivalents(config.stateCode).length,
  0,
);
const fullStateSpeciesDenominator =
  catalogSpeciesIds.length * jurisdictionCount;
const fullCountySpeciesDenominator =
  catalogSpeciesIds.length * countyEquivalentCount;

assert(configFile.states.length === jurisdictionCount, "Jurisdiction config count is stale.");
assert(
  countyEquivalentCount === stateRegistry.nationalV1.countyEquivalentCount,
  "County-equivalent registry count is stale.",
);
assert(
  resolvedStateSpeciesDecisions === fullStateSpeciesDenominator,
  "Full state-species denominator does not resolve.",
);
assert(
  Object.values(decisionTotals).reduce((sum, count) => sum + count, 0) ===
    fullStateSpeciesDenominator,
  "State applicability decisions do not partition the denominator.",
);

const boundedStatus = {
  verifiedPresent: 0,
  verifiedAbsent: 0,
  notDetected: 0,
  researchedUnresolved: 0,
  notResearched: 0,
  totalPairs: 0,
};
let boundedAcquisitionSpecies = 0;
for (const config of configFile.states) {
  const summary = readJson<ResearchStateSummary>(
    `src/data/generated/research/${config.stateCode}/summary.json`,
  );
  const bounded = summary.summary.boundedAcquisition ?? {
    ...summary.summary,
    totalPairs: summary.summary.totalPairs,
  };
  boundedAcquisitionSpecies += bounded.speciesCount;
  boundedStatus.verifiedPresent += bounded.verifiedPresent;
  boundedStatus.verifiedAbsent += bounded.verifiedAbsent;
  boundedStatus.notDetected += bounded.notDetected;
  boundedStatus.researchedUnresolved += bounded.researchedUnresolved;
  boundedStatus.notResearched += bounded.notResearched;
  boundedStatus.totalPairs += bounded.totalPairs;
}
const migrationDefaultPairs =
  fullCountySpeciesDenominator - boundedStatus.totalPairs;
const fullStatus = {
  verifiedPresent: boundedStatus.verifiedPresent,
  verifiedAbsent: boundedStatus.verifiedAbsent,
  notDetected: boundedStatus.notDetected,
  researchedUnresolved: boundedStatus.researchedUnresolved,
  notResearched: boundedStatus.notResearched + migrationDefaultPairs,
};
assert(
  Object.values(fullStatus).reduce((sum, count) => sum + count, 0) ===
    fullCountySpeciesDenominator,
  "Sparse county statuses do not partition the full denominator.",
);

const alaskaPlantago = readJson<ResearchCountyFile>(
  "public/generated/research/AK/counties/02020.json",
).pairs.find((entry) => entry.speciesId === "plantago-major");
assert(
  alaskaPlantago?.applicabilityStatus === "applicable" &&
    alaskaPlantago.displayStatus === "verified-present" &&
    alaskaPlantago.evidence.some(
      (entry) => entry.sourceId === "usfs-fia-invasive-plants",
    ),
  "Reviewed Alaska presence did not derive effective state applicability.",
);

const fixture = {
  schemaVersion: 4,
  stateCode: "ZZ",
  countyFips: "99001",
  countyName: "Fixture County",
  asOf: "2026-07-26",
  generatedAt: "2026-07-26T00:00:00.000Z",
  scope: {
    catalogSpeciesCount: 4,
  },
  pairResolution: {
    catalogSpeciesPath: "/generated/species.json",
    defaultApplicability: "unknown",
    defaultDisplayStatus: "not-researched",
    explicitPairCount: 1,
    applicabilityOverrides: [
      { speciesId: "species-a", applicability: "applicable" },
      { speciesId: "species-b", applicability: "not-applicable" },
      { speciesId: "species-c", applicability: "blocked" },
    ],
  },
  pairs: [
    {
      speciesId: "species-a",
      commonName: "Species A",
      scientificName: "Species alpha",
      category: "plants",
      applicabilityStatus: "applicable",
      displayStatus: "verified-present",
      determinationStatus: "recorded-present",
      surveyStatus: "detected",
      researchStatus: "complete",
      freshnessStatus: "current",
      reviewStatus: "accepted",
      conflict: false,
      evidence: [],
      screenedBySourceIds: ["fixture-source"],
    },
  ],
} as unknown as ResearchCountyFile;
const resolvedFixture = resolveSparseCountyPairs({
  catalogSpecies: [
    { id: "species-a", commonName: "Species A", scientificName: "Species alpha", category: "plants" },
    { id: "species-b", commonName: "Species B", scientificName: "Species beta", category: "plants" },
    { id: "species-c", commonName: "Species C", scientificName: "Species gamma", category: "insects" },
    { id: "species-d", commonName: "Species D", scientificName: "Species delta", category: "wildlife" },
  ],
  county: fixture,
});
const fixtureById = new Map(resolvedFixture.map((entry) => [entry.speciesId, entry]));
assert(
  fixtureById.get("species-a")?.displayStatus === "verified-present" &&
    fixtureById.get("species-a")?.sparseDefault === false,
  "Explicit pair evidence did not override the sparse default.",
);
assert(
  fixtureById.get("species-b")?.applicabilityStatus === "not-applicable" &&
    fixtureById.get("species-c")?.applicabilityStatus === "blocked" &&
    fixtureById.get("species-d")?.applicabilityStatus === "unknown",
  "Sparse applicability statuses did not remain distinct.",
);
assert(
  fixtureById.get("species-d")?.displayStatus === "not-researched" &&
    fixtureById.get("species-d")?.sparseDefault === true,
  "An omitted eligible pair did not resolve to not researched.",
);

console.log(
  JSON.stringify(
    {
      catalogSpecies: catalogSpeciesIds.length,
      jurisdictionCount,
      countyEquivalentCount,
      fullStateSpeciesDenominator,
      stateApplicabilityDecisions: decisionTotals,
      resolvedStateSpeciesDecisions,
      configuredStateScopeSpecies,
      fullCountySpeciesDenominator,
      boundedAcquisitionSpecies,
      boundedStatus,
      sparseDefaultPairs: migrationDefaultPairs,
      fullStatus,
      sparsePairResolver: "passed",
    },
    null,
    2,
  ),
);
