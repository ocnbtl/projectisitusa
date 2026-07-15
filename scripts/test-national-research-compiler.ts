import catalog from "@/data/generated/species.json";
import alaskaApplicability from "@/data/research/state-applicability/AK.json";
import stateResearchConfig from "@/data/research/state-research-config.json";
import {
  resolveStateResearchScope,
  type StateApplicabilityFile,
  type StateResearchConfigFile,
} from "@/lib/research/state-research-config";

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
  asOf: "2026-07-15",
};

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
assert(alaska.speciesIds.length === 4, "Alaska explicit pilot scope changed.");
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
futureApplicability.asOf = "2026-07-16";
expectFailure("future applicability", /newer than compiler as-of/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AK", ...common, applicability: futureApplicability }),
);

expectFailure("catalog-all applicability injection", /must not declare applicability data/, () =>
  resolveStateResearchScope({ configFile, stateCode: "AL", ...common, applicability }),
);

console.log(
  JSON.stringify(
    {
      validScopes: { AL: alabama.speciesIds.length, AK: alaska.speciesIds.length },
      adversarialCases: 8,
      compatibilityPublicationRestrictedToCompleteAuthoritativeScope: true,
    },
    null,
    2,
  ),
);
