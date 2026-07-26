import { createHash } from "node:crypto";

export type StateResearchConfig = {
  stateCode: string;
  mode: "authoritative" | "research-only";
  speciesScope: {
    mode: "catalog-all" | "sparse-default";
    applicabilityPath: string;
    defaultApplicability: "unknown";
    undeterminedSpeciesPolicy: "included-as-unknown";
  };
  bootstrapLedgerAllowed: boolean;
  compatibilityPublication: boolean;
  migrationCandidatesPath: string;
  publicResearchProjection: boolean;
};

export type StateResearchConfigFile = {
  schemaVersion: 2;
  states: StateResearchConfig[];
};

export type StateSpeciesApplicability =
  | "applicable"
  | "not-applicable"
  | "unknown"
  | "blocked";

export type StateApplicabilityFile = {
  schemaVersion: 2;
  stateCode: string;
  asOf: string;
  catalogSpeciesCount: number;
  catalogSpeciesIdsSha256: string;
  undeterminedSpeciesPolicy: "included-as-unknown";
  defaultDecision: {
    applicability: "unknown";
    note: string;
  };
  species: Array<{
    speciesId: string;
    applicability: StateSpeciesApplicability;
    priority: "regulated" | "high" | "pilot" | "baseline";
    basis: Array<{ sourceId: string; sourceRecordId: string; url: string; note: string }>;
  }>;
};

export type StateApplicabilityDecisionCounts = Record<StateSpeciesApplicability, number>;

export function hashCatalogSpeciesIds(speciesIds: string[]) {
  return createHash("sha256")
    .update(`${JSON.stringify([...speciesIds].sort())}\n`)
    .digest("hex");
}

export function selectStateResearchConfig(
  configFile: StateResearchConfigFile,
  stateCode: string,
) {
  const duplicateCodes = configFile.states
    .map((entry) => entry.stateCode)
    .filter((code, index, values) => values.indexOf(code) !== index);
  if (duplicateCodes.length > 0) {
    throw new Error(`Duplicate state research config: ${[...new Set(duplicateCodes)].sort().join(", ")}.`);
  }
  const config = configFile.states.find((entry) => entry.stateCode === stateCode);
  if (!config) throw new Error(`No research config exists for ${stateCode}.`);
  return config;
}

export function resolveStateResearchScope(input: {
  configFile: StateResearchConfigFile;
  stateCode: string;
  catalogSpeciesIds: string[];
  asOf: string;
  applicability: StateApplicabilityFile | null;
}) {
  const config = selectStateResearchConfig(input.configFile, input.stateCode);
  if (config.compatibilityPublication && (config.mode !== "authoritative" || config.speciesScope.mode !== "catalog-all")) {
    throw new Error(`Compatibility publication for ${input.stateCode} requires authoritative catalog-all scope.`);
  }
  if (config.mode === "research-only" && (config.bootstrapLedgerAllowed || config.compatibilityPublication)) {
    throw new Error(`Research-only state ${input.stateCode} cannot use the bootstrap ledger or publish compatibility outputs.`);
  }
  if (!config.speciesScope.applicabilityPath || !input.applicability) {
    throw new Error(`State ${input.stateCode} requires an applicability decision file.`);
  }
  if (input.applicability.stateCode !== input.stateCode) {
    throw new Error(`Applicability state ${input.applicability.stateCode} does not match ${input.stateCode}.`);
  }
  if (input.applicability.undeterminedSpeciesPolicy !== config.speciesScope.undeterminedSpeciesPolicy) {
    throw new Error(`Applicability policy differs from the ${input.stateCode} research config.`);
  }
  if (
    input.applicability.defaultDecision.applicability !==
    config.speciesScope.defaultApplicability
  ) {
    throw new Error(`Applicability default differs from the ${input.stateCode} research config.`);
  }
  if (input.applicability.catalogSpeciesCount !== input.catalogSpeciesIds.length) {
    throw new Error(`Applicability catalog count differs from the ${input.stateCode} compiler catalog.`);
  }
  if (
    input.applicability.catalogSpeciesIdsSha256 !==
    hashCatalogSpeciesIds(input.catalogSpeciesIds)
  ) {
    throw new Error(`Applicability catalog fingerprint differs from the ${input.stateCode} compiler catalog.`);
  }
  const compilerCutoff = Date.parse(`${input.asOf}T23:59:59.999Z`);
  const applicabilityCutoff = Date.parse(`${input.applicability.asOf}T23:59:59.999Z`);
  if (!Number.isFinite(applicabilityCutoff) || applicabilityCutoff > compilerCutoff) {
    throw new Error(`Applicability for ${input.stateCode} is invalid or newer than compiler as-of ${input.asOf}.`);
  }
  const speciesIds = input.applicability.species.map((entry) => entry.speciesId);
  if (new Set(speciesIds).size !== speciesIds.length) {
    throw new Error(`Sparse applicability for ${input.stateCode} contains duplicate species.`);
  }
  const catalogSpeciesIdSet = new Set(input.catalogSpeciesIds);
  for (const speciesId of speciesIds) {
    if (!catalogSpeciesIdSet.has(speciesId)) throw new Error(`Applicability references unknown catalog species ${speciesId}.`);
  }
  const applicabilityBySpeciesId = new Map(
    input.applicability.species.map((entry) => [entry.speciesId, entry.applicability]),
  );
  const boundedSpeciesIds = input.applicability.species
    .filter((entry) => entry.applicability === "applicable")
    .map((entry) => entry.speciesId);
  if (
    config.speciesScope.mode === "sparse-default" &&
    boundedSpeciesIds.length === 0
  ) {
    throw new Error(`Sparse applicability for ${input.stateCode} contains no applicable acquisition species.`);
  }
  const applicabilityDecisionCounts: StateApplicabilityDecisionCounts = {
    applicable: 0,
    "not-applicable": 0,
    unknown: input.catalogSpeciesIds.length - speciesIds.length,
    blocked: 0,
  };
  for (const entry of input.applicability.species) {
    applicabilityDecisionCounts[entry.applicability] += 1;
  }
  const selectedSpeciesIds =
    config.speciesScope.mode === "catalog-all"
      ? [...input.catalogSpeciesIds]
      : boundedSpeciesIds;
  return {
    config,
    speciesIds: selectedSpeciesIds,
    applicabilityAsOf: input.applicability.asOf,
    applicabilityDecisionCounts,
    explicitApplicabilityDecisionCount: speciesIds.length,
    resolvedStateSpeciesDecisionCount: input.catalogSpeciesIds.length,
    fullCatalogApplicabilityComplete:
      applicabilityDecisionCounts.unknown === 0 &&
      applicabilityDecisionCounts.blocked === 0,
    defaultApplicability: input.applicability.defaultDecision.applicability,
    applicabilityBySpeciesId,
  };
}
