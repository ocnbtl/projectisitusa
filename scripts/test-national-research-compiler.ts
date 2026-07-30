import catalog from "@/data/generated/species.json";
import alabamaApplicability from "@/data/research/state-applicability/AL.json";
import alaskaApplicability from "@/data/research/state-applicability/AK.json";
import stateRegistry from "@/data/research/state-registry.json";
import stateResearchConfig from "@/data/research/state-research-config.json";
import {
  resolveStateResearchScope,
  hashCatalogSpeciesIds,
  type StateApplicabilityFile,
  type StateResearchConfigFile,
} from "@/lib/research/state-research-config";
import {
  replaceStatePresenceFromResearch,
  serializePresenceOutsideState,
} from "@/lib/research/compatibility-projection";
import type { ResearchCountyFile } from "@/lib/research/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(label: string, expected: RegExp, run: () => unknown) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expected.test(message), `${label} failed with an unexpected message: ${message}`);
    return;
  }
  throw new Error(`${label} unexpectedly passed.`);
}

const configFile = structuredClone(stateResearchConfig) as StateResearchConfigFile;
const catalogSpeciesIds = catalog.map((entry) => entry.id);
const applicability = structuredClone(alaskaApplicability) as StateApplicabilityFile;
const alabamaApplicabilityFile = structuredClone(
  alabamaApplicability,
) as StateApplicabilityFile;

const replacedPresence = replaceStatePresenceFromResearch({
  stateCode: "AL",
  asOf: "2026-07-27",
  counties: {
    "01001": {
      countyFips: "01001",
      name: "Autauga",
      stateCode: "AL",
      stateName: "Alabama",
      neighborFips: [],
      center: [-86.64, 32.53],
    },
  },
  currentPresence: {
    "01001": {
      countyFips: "01001",
      speciesIds: ["alliaria-petiolata"],
      sourceRefs: [
        "Independent source",
        "Reviewed Project Isitusa research evidence through 2026-07-26",
      ],
    },
  },
  countyFiles: [
    {
      stateCode: "AL",
      countyFips: "01001",
      pairs: [
        {
          speciesId: "alliaria-petiolata",
          displayStatus: "verified-present",
        },
      ],
    },
  ] as ResearchCountyFile[],
});
const researchReferences =
  replacedPresence["01001"].sourceRefs.filter((entry) =>
    entry.startsWith("Reviewed Project Isitusa research evidence through "),
  );
if (
  researchReferences.length !== 1 ||
  researchReferences[0] !==
    "Reviewed Project Isitusa research evidence through 2026-07-27"
) {
  throw new Error(
    "Compatibility compilation retained duplicate dated research references.",
  );
}
const common = {
  catalogSpeciesIds,
  asOf: "2026-07-28",
};
const applicableStateSpeciesDecisions = configFile.states.reduce((sum, entry) => {
  const file = JSON.parse(
    readFileSync(path.join(process.cwd(), entry.speciesScope.applicabilityPath), "utf8"),
  ) as StateApplicabilityFile;
  return sum + file.species.filter(
    (species) => species.applicability === "applicable",
  ).length;
}, 0);

assert(
  configFile.states.length === stateRegistry.nationalV1.jurisdictionCount,
  "State research config does not cover every national-v1 jurisdiction.",
);
assert(
  configFile.states.every((entry) => entry.publicResearchProjection),
  "Every national-v1 jurisdiction must publish a research projection.",
);

const alabama = resolveStateResearchScope({
  configFile,
  stateCode: "AL",
  ...common,
  applicability: alabamaApplicabilityFile,
});
assert(alabama.speciesIds.length === catalogSpeciesIds.length, "Alabama catalog-all scope lost species.");
const alabamaApplicableSpeciesCount = alabamaApplicabilityFile.species.filter(
  (entry) => entry.applicability === "applicable",
).length;
assert(
  alabama.applicabilityDecisionCounts.unknown ===
      catalogSpeciesIds.length - alabamaApplicabilityFile.species.length &&
    alabama.applicabilityDecisionCounts.applicable === alabamaApplicableSpeciesCount,
  "Alabama applicability counts differ from its authoritative decision file.",
);
assert(alabama.config.compatibilityPublication, "Alabama must publish compatibility projections.");

const alaska = resolveStateResearchScope({
  configFile,
  stateCode: "AK",
  ...common,
  applicability,
});
assert(
  alaska.speciesIds.length ===
    applicability.species.filter((entry) => entry.applicability === "applicable").length,
  "Alaska compiler scope differs from its bounded applicability overrides.",
);
assert(
  alaska.speciesIds.includes("myosotis-scorpioides"),
  "Alaska USGS NAS archive pilot species left the explicit state scope.",
);
assert(!alaska.config.compatibilityPublication, "Alaska pilot must not publish compatibility projections.");

const duplicateConfig = structuredClone(configFile);
duplicateConfig.states.push(structuredClone(duplicateConfig.states[0]));
expectFailure("duplicate state config", /Duplicate state research config: AL/, () =>
  resolveStateResearchScope({ configFile: duplicateConfig, stateCode: "AL", ...common, applicability: null }),
);

const researchOnlyCompatibility = structuredClone(configFile);
const researchOnlyCompatibilityEntry = researchOnlyCompatibility.states.find((entry) => entry.stateCode === "AK")!;
researchOnlyCompatibilityEntry.compatibilityPublication = true;
expectFailure("research-only compatibility publication", /requires authoritative catalog-all scope/, () =>
  resolveStateResearchScope({
    configFile: researchOnlyCompatibility,
    stateCode: "AK",
    ...common,
    applicability,
  }),
);

const partialAuthoritativeCompatibility = structuredClone(configFile);
const partialAuthoritativeEntry = partialAuthoritativeCompatibility.states.find((entry) => entry.stateCode === "AK")!;
partialAuthoritativeEntry.mode = "authoritative";
partialAuthoritativeEntry.compatibilityPublication = true;
expectFailure("partial authoritative compatibility publication", /requires authoritative catalog-all scope/, () =>
  resolveStateResearchScope({
    configFile: partialAuthoritativeCompatibility,
    stateCode: "AK",
    ...common,
    applicability,
  }),
);

const emptyApplicability = structuredClone(applicability);
emptyApplicability.species = [];
expectFailure("empty sparse applicability", /contains no applicable acquisition species/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AK", ...common, applicability: emptyApplicability }),
);

const duplicateApplicability = structuredClone(applicability);
duplicateApplicability.species.push(structuredClone(duplicateApplicability.species[0]));
expectFailure("duplicate explicit species", /contains duplicate species/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AK", ...common, applicability: duplicateApplicability }),
);

const unknownApplicability = structuredClone(applicability);
unknownApplicability.species[0].speciesId = "not-in-catalog";
expectFailure("unknown explicit species", /unknown catalog species/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AK", ...common, applicability: unknownApplicability }),
);

const futureApplicability = structuredClone(applicability);
futureApplicability.asOf = new Date(
  Date.parse(`${common.asOf}T00:00:00.000Z`) + 86_400_000,
).toISOString().slice(0, 10);
expectFailure("future applicability", /newer than compiler as-of/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AK", ...common, applicability: futureApplicability }),
);

const wrongCatalogCount = structuredClone(applicability);
wrongCatalogCount.catalogSpeciesCount -= 1;
expectFailure("catalog count drift", /catalog count differs/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AK", ...common, applicability: wrongCatalogCount }),
);

const wrongCatalogHash = structuredClone(applicability);
wrongCatalogHash.catalogSpeciesIdsSha256 = "0".repeat(64);
expectFailure("catalog fingerprint drift", /catalog fingerprint differs/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AK", ...common, applicability: wrongCatalogHash }),
);

expectFailure("missing applicability descriptor", /requires an applicability decision file/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AL", ...common, applicability: null }),
);

const statusFixture = structuredClone(applicability);
statusFixture.species = [
  {
    ...structuredClone(applicability.species[0]),
    applicability: "applicable",
  },
  {
    ...structuredClone(applicability.species[1]),
    applicability: "not-applicable",
  },
  {
    ...structuredClone(applicability.species[2]),
    applicability: "unknown",
  },
  {
    ...structuredClone(applicability.species[3]),
    applicability: "blocked",
  },
];
statusFixture.catalogSpeciesCount = catalogSpeciesIds.length;
statusFixture.catalogSpeciesIdsSha256 = hashCatalogSpeciesIds(catalogSpeciesIds);
const fourStatusScope = resolveStateResearchScope({
  configFile,
  stateCode: "AK",
  ...common,
  applicability: statusFixture,
});
assert(
  fourStatusScope.applicabilityDecisionCounts.applicable === 1 &&
    fourStatusScope.applicabilityDecisionCounts["not-applicable"] === 1 &&
    fourStatusScope.applicabilityDecisionCounts.blocked === 1 &&
    fourStatusScope.applicabilityDecisionCounts.unknown ===
      catalogSpeciesIds.length - 3,
  "All four state applicability statuses did not resolve deterministically.",
);
assert(
  !fourStatusScope.fullCatalogApplicabilityComplete,
  "Unknown or blocked state decisions must prevent full-catalog completion.",
);

const presenceCounties = {
  "01001": { stateCode: "AL" },
  "02013": { stateCode: "AK" },
  "04001": { stateCode: "AZ" },
};
const alaskaPresence = {
  countyFips: "02013",
  speciesIds: ["species-a"],
  sourceRefs: ["source-a"],
};
const arizonaPresence = {
  countyFips: "04001",
  speciesIds: ["species-b"],
  sourceRefs: ["source-b"],
};
const insertionOrderOne = {
  "02013": alaskaPresence,
  "04001": arizonaPresence,
};
const insertionOrderTwo = {
  "04001": arizonaPresence,
  "02013": alaskaPresence,
};
assert(
  serializePresenceOutsideState({
    stateCode: "AL",
    counties: presenceCounties,
    presence: insertionOrderOne,
  }) ===
    serializePresenceOutsideState({
      stateCode: "AL",
      counties: presenceCounties,
      presence: insertionOrderTwo,
    }),
  "Non-target presence parity must ignore object insertion order.",
);
assert(
  serializePresenceOutsideState({
    stateCode: "AL",
    counties: presenceCounties,
    presence: insertionOrderOne,
  }) !==
    serializePresenceOutsideState({
      stateCode: "AL",
      counties: presenceCounties,
      presence: {
        ...insertionOrderTwo,
        "02013": { ...alaskaPresence, speciesIds: ["species-changed"] },
      },
    }),
  "Non-target presence parity must detect semantic changes.",
);

console.log(
  JSON.stringify(
    {
      validScopes: { AL: alabama.speciesIds.length, AK: alaska.speciesIds.length },
      stateSpeciesDenominator: catalogSpeciesIds.length * configFile.states.length,
      applicableStateSpeciesDecisions,
      adversarialCases: 13,
      compatibilityPublicationRestrictedToCompleteAuthoritativeScope: true,
      nonTargetPresenceParityIgnoresInsertionOrder: true,
    },
    null,
    2,
  ),
);
import { readFileSync } from "node:fs";
import path from "node:path";
