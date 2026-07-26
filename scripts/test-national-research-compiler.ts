import catalog from "@/data/generated/species.json";
import alaskaApplicability from "@/data/research/state-applicability/AK.json";
import stateRegistry from "@/data/research/state-registry.json";
import stateResearchConfig from "@/data/research/state-research-config.json";
import {
  resolveStateResearchScope,
  type StateApplicabilityFile,
  type StateResearchConfigFile,
} from "@/lib/research/state-research-config";
import { serializePresenceOutsideState } from "@/lib/research/compatibility-projection";

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
const common = {
  catalogSpeciesIds,
  asOf: applicability.asOf,
};

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
  applicability: null,
});
assert(alabama.speciesIds.length === catalogSpeciesIds.length, "Alabama catalog-all scope lost species.");
assert(alabama.config.compatibilityPublication, "Alabama must publish compatibility projections.");

const alaska = resolveStateResearchScope({
  configFile,
  stateCode: "AK",
  ...common,
  applicability,
});
assert(
  alaska.speciesIds.length === applicability.species.length,
  "Alaska compiler scope differs from its explicit applicability file.",
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
expectFailure("empty explicit applicability", /is empty/, () =>
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
futureApplicability.asOf = "2026-07-17";
expectFailure("future applicability", /newer than compiler as-of/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AK", ...common, applicability: futureApplicability }),
);

expectFailure("catalog-all applicability injection", /must not declare applicability data/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AL", ...common, applicability }),
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
      adversarialCases: 10,
      compatibilityPublicationRestrictedToCompleteAuthoritativeScope: true,
      nonTargetPresenceParityIgnoresInsertionOrder: true,
    },
    null,
    2,
  ),
);
