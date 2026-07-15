export type StateResearchConfig = {
  stateCode: string;
  mode: "authoritative" | "research-only";
  speciesScope: {
    mode: "catalog-all" | "explicit";
    applicabilityPath: string | null;
    undeterminedSpeciesPolicy: "excluded" | "included-grandfathered-baseline";
  };
  bootstrapLedgerAllowed: boolean;
  compatibilityPublication: boolean;
  migrationCandidatesPath: string;
  publicResearchProjection: boolean;
};

export type StateResearchConfigFile = {
  schemaVersion: 1;
  states: StateResearchConfig[];
};

export type StateApplicabilityFile = {
  schemaVersion: 1;
  stateCode: string;
  asOf: string;
  undeterminedSpeciesPolicy: "excluded";
  species: Array<{
    speciesId: string;
    applicability: "applicable";
    priority: "regulated" | "high" | "pilot" | "baseline";
    basis: Array<{ sourceId: string; sourceRecordId: string; url: string; note: string }>;
  }>;
};

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
  if (config.speciesScope.mode === "catalog-all") {
    if (config.speciesScope.applicabilityPath !== null || input.applicability !== null) {
      throw new Error(`Catalog-all state ${input.stateCode} must not declare applicability data.`);
    }
    return { config, speciesIds: [...input.catalogSpeciesIds], applicabilityAsOf: null };
  }
  if (!config.speciesScope.applicabilityPath || !input.applicability) {
    throw new Error(`Explicit state ${input.stateCode} requires applicability data.`);
  }
  if (input.applicability.stateCode !== input.stateCode) {
    throw new Error(`Applicability state ${input.applicability.stateCode} does not match ${input.stateCode}.`);
  }
  if (input.applicability.undeterminedSpeciesPolicy !== config.speciesScope.undeterminedSpeciesPolicy) {
    throw new Error(`Applicability policy differs from the ${input.stateCode} research config.`);
  }
  const compilerCutoff = Date.parse(`${input.asOf}T23:59:59.999Z`);
  const applicabilityCutoff = Date.parse(`${input.applicability.asOf}T23:59:59.999Z`);
  if (!Number.isFinite(applicabilityCutoff) || applicabilityCutoff > compilerCutoff) {
    throw new Error(`Applicability for ${input.stateCode} is invalid or newer than compiler as-of ${input.asOf}.`);
  }
  const speciesIds = input.applicability.species.map((entry) => entry.speciesId);
  if (speciesIds.length === 0) throw new Error(`Explicit applicability for ${input.stateCode} is empty.`);
  if (new Set(speciesIds).size !== speciesIds.length) {
    throw new Error(`Explicit applicability for ${input.stateCode} contains duplicate species.`);
  }
  const catalogSpeciesIdSet = new Set(input.catalogSpeciesIds);
  for (const speciesId of speciesIds) {
    if (!catalogSpeciesIdSet.has(speciesId)) throw new Error(`Applicability references unknown catalog species ${speciesId}.`);
  }
  return { config, speciesIds, applicabilityAsOf: input.applicability.asOf };
}
