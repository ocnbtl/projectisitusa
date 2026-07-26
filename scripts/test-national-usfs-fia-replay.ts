import {
  buildFiaTaxonMappings,
  replayNationalFiaState,
  type FiaTaxonMapping,
} from "./research/adapters/usfs-fia-invasive-plants";

import {
  FIA_ACCEPT_HEADER,
  type FiaObservationRow,
} from "./research/national-usfs-fia-common";
import fs from "node:fs";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(
  FIA_ACCEPT_HEADER.includes("application/octet-stream") &&
    FIA_ACCEPT_HEADER.includes("*/*"),
  "FIA acquisition must accept the DataMart octet-stream CSV delivery.",
);
const registry = JSON.parse(
  fs.readFileSync("src/data/research/source-registry.json", "utf8"),
) as {
  sources: Array<{
    id: string;
    negativeSemantics: string;
  }>;
};
assert(
  registry.sources.find((entry) => entry.id === "usfs-fia-invasive-plants")
      ?.negativeSemantics === "none",
  "FIA positive detections must not advertise negative evidence semantics.",
);
assert(
  registry.sources.find((entry) => entry.id === "aphis-honey-bee")
      ?.negativeSemantics === "explicit-survey-only",
  "APHIS explicit zero-count survey semantics must remain registered.",
);

const completedAt = "2026-07-26T15:00:00.000Z";
const mapping: FiaTaxonMapping = {
  symbol: "CIAR4",
  speciesId: "cirsium-arvense",
  scientificName: "Cirsium arvense",
};
const mappingReconciliation = {
  state_invasive_symbols: 1,
  exact_catalog_mappings: 1,
  distinct_catalog_species: 1,
  duplicate_species_symbol_mappings: 0,
  no_catalog_match_symbols: 0,
  ambiguous_dictionary_symbols: 0,
  duplicate_reference_rows: 0,
};

function context(input: {
  runId: string;
  stateCode: string;
  pairs: Array<{ countyFips: string; countyName: string }>;
}) {
  return {
    runId: input.runId,
    sourceId: "usfs-fia-invasive-plants",
    stateCode: input.stateCode,
    requestedPairs: input.pairs.map((entry) => ({
      ...entry,
      speciesId: mapping.speciesId,
      scientificName: mapping.scientificName,
    })),
    runStartedAt: completedAt,
    parameters: {},
  };
}

function observation(input: {
  cn: string;
  state: string;
  county: string;
  year?: string;
}): FiaObservationRow {
  return {
    CN: input.cn,
    PLT_CN: `plot-${input.cn}`,
    INVYR: input.year ?? "2025",
    STATECD: input.state,
    COUNTYCD: input.county,
    VEG_FLDSPCD: "CIAR4",
    VEG_SPCD: "CIAR4",
    CREATED_DATE: "2025-01-01",
    MODIFIED_DATE: "2026-07-01",
  };
}

const alContext = context({
  runId: "fia-test-al",
  stateCode: "AL",
  pairs: [
    { countyFips: "01001", countyName: "Autauga" },
    { countyFips: "01003", countyName: "Baldwin" },
  ],
});
const positiveRow = observation({ cn: "fia-cn-1", state: "1", county: "1" });
const al = replayNationalFiaState({
  context: alContext,
  observationRows: [positiveRow],
  mappings: [mapping],
  mappingReconciliation,
  completedAt,
  headerOnly: false,
});
assert(al.assertions.length === 1, "FIA positive replay should emit one assertion.");
assert(al.reviews.length === 1, "FIA positive replay should emit one review.");
assert(
  al.outcomes.find((entry) => entry.county_fips === "01001")?.status ===
    "evidence-found",
  "FIA positive pair should be evidence-found.",
);
assert(
  al.outcomes.find((entry) => entry.county_fips === "01003")?.status ===
    "no-qualifying-evidence",
  "Complete FIA source silence should be research-only no-qualifying-evidence.",
);
assert(
  al.assertions.every((entry) => entry.claim_type === "recorded-present"),
  "FIA replay emitted unsupported negative evidence.",
);

const duplicate = replayNationalFiaState({
  context: { ...alContext, runId: "fia-test-duplicate" },
  observationRows: [positiveRow, positiveRow],
  mappings: [mapping],
  mappingReconciliation,
  completedAt,
  headerOnly: false,
});
assert(
  duplicate.duplicateRecordCount === 1 &&
    duplicate.rejections.some((entry) => entry.reason_code === "duplicate") &&
    duplicate.assertions.length === 1,
  "FIA identical CN duplicates must collapse with a counted rejection.",
);

const headerOnly = replayNationalFiaState({
  context: { ...alContext, runId: "fia-test-header-only" },
  observationRows: [],
  mappings: [mapping],
  mappingReconciliation,
  completedAt,
  headerOnly: true,
});
assert(
  headerOnly.outcomes.every(
    (entry) => entry.status === "blocked" && !entry.scope_complete,
  ),
  "Header-only FIA state files must block applicable pairs.",
);

const alaska = replayNationalFiaState({
  context: context({
    runId: "fia-test-ak-retired",
    stateCode: "AK",
    pairs: [
      { countyFips: "02063", countyName: "Chugach Census Area" },
      { countyFips: "02066", countyName: "Copper River Census Area" },
    ],
  }),
  observationRows: [
    observation({ cn: "fia-ak-retired", state: "2", county: "261" }),
  ],
  mappings: [mapping],
  mappingReconciliation,
  completedAt,
  headerOnly: false,
});
assert(
  alaska.rejections.some(
    (entry) => entry.reason_code === "retired-geography",
  ),
  "Retired Alaska FIA geography must be rejected.",
);
assert(
  alaska.outcomes.every(
    (entry) => entry.status === "blocked" && !entry.scope_complete,
  ),
  "Unplaceable positive FIA candidates must block affected species scope.",
);

const conflict = replayNationalFiaState({
  context: { ...alContext, runId: "fia-test-conflict" },
  observationRows: [
    observation({ cn: "fia-conflict", state: "1", county: "1" }),
    observation({ cn: "fia-conflict", state: "1", county: "3" }),
  ],
  mappings: [mapping],
  mappingReconciliation,
  completedAt,
  headerOnly: false,
});
assert(
  conflict.errors.length === 1 &&
    conflict.rejections.some(
      (entry) => entry.reason_code === "source-contradiction",
    ),
  "Conflicting FIA CN payloads must be preserved as a source contradiction.",
);
assert(
  conflict.outcomes.find((entry) => entry.county_fips === "01001")?.status ===
      "evidence-found" &&
    conflict.outcomes.find((entry) => entry.county_fips === "01003")?.status ===
      "blocked",
  "A conflicting FIA CN should block the affected unresolved pair without removing valid positive evidence.",
);

const mapped = buildFiaTaxonMappings({
  stateFips: "01",
  catalog: [
    { id: "cirsium-arvense", scientificName: "Cirsium arvense" },
    { id: "melilotus-officinalis", scientificName: "Melilotus officinalis" },
  ],
  invasiveReferenceRows: [
    { STATECD: "1", SYMBOL: "CIAR4" },
    { STATECD: "1", SYMBOL: "MEOF" },
    { STATECD: "1", SYMBOL: "AMB" },
  ],
  dictionaryRows: [
    { SYMBOL: "CIAR4", SCIENTIFIC_NAME: "Cirsium arvense" },
    { SYMBOL: "MEOF", SCIENTIFIC_NAME: "Melilotus officinalis" },
    { SYMBOL: "AMB", SCIENTIFIC_NAME: "Cirsium arvense" },
    { SYMBOL: "AMB", SCIENTIFIC_NAME: "Melilotus officinalis" },
  ],
});
assert(
  mapped.mappings.length === 2 &&
    mapped.reconciliation.ambiguous_dictionary_symbols === 1,
  "FIA mapping must reject ambiguous symbols and retain exact one-to-one matches.",
);

const converged = buildFiaTaxonMappings({
  stateFips: "01",
  catalog: [
    {
      id: "schedonorus-arundinaceus",
      scientificName: "Schedonorus arundinaceus",
    },
  ],
  invasiveReferenceRows: [
    { STATECD: "1", SYMBOL: "SCPH" },
    { STATECD: "1", SYMBOL: "SCAR7" },
  ],
  dictionaryRows: [
    {
      SYMBOL: "SCPH",
      SCIENTIFIC_NAME: "Schedonorus phoenix",
      NEW_SCIENTIFIC_NAME: "Schedonorus arundinaceus",
    },
    {
      SYMBOL: "SCAR7",
      SCIENTIFIC_NAME: "Schedonorus arundinaceus",
    },
  ],
});
assert(
  converged.mappings.length === 2 &&
    converged.reconciliation.distinct_catalog_species === 1 &&
    converged.reconciliation.duplicate_species_symbol_mappings === 1,
  "Multiple exact FIA symbols may converge on one catalog species without duplicating pair scope.",
);
const convergedReplay = replayNationalFiaState({
  context: {
    runId: "fia-test-converged-symbols",
    sourceId: "usfs-fia-invasive-plants",
    stateCode: "AL",
    requestedPairs: [
      {
        countyFips: "01001",
        countyName: "Autauga",
        speciesId: "schedonorus-arundinaceus",
        scientificName: "Schedonorus arundinaceus",
      },
    ],
    runStartedAt: completedAt,
    parameters: {},
  },
  observationRows: [
    {
      ...observation({ cn: "fia-converged-1", state: "1", county: "1" }),
      VEG_FLDSPCD: "SCAR7",
      VEG_SPCD: "SCAR7",
    },
    {
      ...observation({ cn: "fia-converged-2", state: "1", county: "1" }),
      VEG_FLDSPCD: "SCPH",
      VEG_SPCD: "SCPH",
    },
  ],
  mappings: converged.mappings,
  mappingReconciliation: converged.reconciliation,
  completedAt,
  headerOnly: false,
});
assert(
  convergedReplay.assertions.length === 1 &&
    convergedReplay.outcomes.length === 1 &&
    convergedReplay.outcomes[0]?.status === "evidence-found" &&
    convergedReplay.assertions[0]?.taxon_match.source_taxon_key ===
      "SCAR7|SCPH",
  "Converged FIA symbols must publish one exact county-species assertion while preserving both source keys.",
);

const deterministicLeft = replayNationalFiaState({
  context: { ...alContext, runId: "fia-test-deterministic" },
  observationRows: [
    positiveRow,
    observation({ cn: "fia-cn-2", state: "1", county: "3" }),
  ],
  mappings: [mapping],
  mappingReconciliation,
  completedAt,
  headerOnly: false,
});
const deterministicRight = replayNationalFiaState({
  context: { ...alContext, runId: "fia-test-deterministic" },
  observationRows: [
    observation({ cn: "fia-cn-2", state: "1", county: "3" }),
    positiveRow,
  ],
  mappings: [mapping],
  mappingReconciliation,
  completedAt,
  headerOnly: false,
});
assert(
  JSON.stringify(deterministicLeft) === JSON.stringify(deterministicRight),
  "FIA replay must be independent of source row order.",
);

console.log(
  JSON.stringify(
    {
      exactPositiveEvidence: true,
      sourceSilenceResearchOnly: true,
      unsupportedNegativeEvidence: false,
      duplicateCnCollapsed: true,
      conflictingCnBlocked: true,
      retiredAlaskaGeographyBlocked: true,
      headerOnlyStateBlocked: true,
      ambiguousTaxonMappingRejected: true,
      deterministic: true,
      adversarialCases: 8,
    },
    null,
    2,
  ),
);
