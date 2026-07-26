import {
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  AFPE_MAPPING_PATH,
  readAfpeMapping,
} from "./research/national-usfs-afpe-common";
import {
  AFPE_PUBLICATION_URL,
  AFPE_SOURCE_ID,
} from "./research/adapters/usfs-afpe-archive";

const ROOT = process.cwd();
const AS_OF = "2026-07-25";

type StateConfig = {
  states: Array<{
    stateCode: string;
    speciesScope: {
      mode: "catalog-all" | "explicit";
      applicabilityPath: string | null;
    };
  }>;
};

type Applicability = {
  schemaVersion: 1;
  stateCode: string;
  asOf: string;
  undeterminedSpeciesPolicy: "excluded";
  species: Array<{
    speciesId: string;
    applicability: "applicable";
    priority: "regulated" | "high" | "pilot" | "baseline";
    basis: Array<{
      sourceId: string;
      sourceRecordId: string;
      url: string;
      note: string;
    }>;
  }>;
};

type Protocols = {
  schemaVersion: 2;
  updatedAt: string;
  protocols: Array<{
    id: string;
    sourceUniverse: string[];
    requiredCurrentSourceIds: string[];
    rules: Array<{
      ruleId: string;
      speciesSelector: {
        kind: "category" | "state-applicability" | "species-id";
        values: string[];
      };
      applicableSourceIds: string[];
      basis: Array<{ kind: string; reference: string; note: string }>;
    }>;
  }>;
};

type CountyRegistry = {
  countyEquivalents: Array<{
    stateCode: string;
    status: "active";
  }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function writeJson(filepath: string, value: unknown) {
  writeFileSync(filepath, `${JSON.stringify(value, null, 2)}\n`);
}

const mapping = readAfpeMapping(ROOT);
const stateConfigPath = path.join(
  ROOT,
  "src/data/research/state-research-config.json",
);
const stateConfig = readJson<StateConfig>(stateConfigPath);
const countyRegistry = readJson<CountyRegistry>(
  path.join(ROOT, "src/data/research/county-equivalent-registry.json"),
);
let addedSpeciesEntries = 0;
let addedPairScope = 0;
const explicitStates: string[] = [];

for (const config of stateConfig.states) {
  if (config.speciesScope.mode === "catalog-all") continue;
  assert(
    config.speciesScope.applicabilityPath,
    `Explicit state ${config.stateCode} lacks an applicability path.`,
  );
  const filepath = path.join(ROOT, config.speciesScope.applicabilityPath);
  const applicability = readJson<Applicability>(filepath);
  assert(
    applicability.stateCode === config.stateCode,
    `Applicability file disagrees for ${config.stateCode}.`,
  );
  const existingById = new Map(
    applicability.species.map((entry) => [entry.speciesId, entry]),
  );
  let stateAdditions = 0;
  for (const entry of mapping.mappings) {
    if (existingById.has(entry.speciesId)) continue;
    applicability.species.push({
      speciesId: entry.speciesId,
      applicability: "applicable",
      priority: "baseline",
      basis: [
        {
          sourceId: AFPE_SOURCE_ID,
          sourceRecordId:
            `doi:10.4231/HWQF-V087:v1.0:${entry.columnId}`,
          url: AFPE_PUBLICATION_URL,
          note:
            `The hash-pinned CC0 AFPE v1.0 archive defines a county detection column for ${entry.sourceLabel}. This establishes bounded historical source applicability only. A value of 0 is not absence or non-detection, and missing current geography remains blocked.`,
        },
      ],
    });
    stateAdditions += 1;
  }
  applicability.asOf = AS_OF;
  applicability.species.sort((left, right) =>
    compareText(left.speciesId, right.speciesId)
  );
  assert(
    new Set(applicability.species.map((entry) => entry.speciesId)).size ===
      applicability.species.length,
    `Applicability for ${config.stateCode} contains duplicate species.`,
  );
  writeJson(filepath, applicability);
  const countyCount = countyRegistry.countyEquivalents.filter((county) =>
    county.stateCode === config.stateCode
  ).length;
  addedSpeciesEntries += stateAdditions;
  addedPairScope += stateAdditions * countyCount;
  explicitStates.push(config.stateCode);
}

const protocolsPath = path.join(
  ROOT,
  "src/data/research/research-protocols.json",
);
const protocols = readJson<Protocols>(protocolsPath);
const speciesIds = mapping.mappings
  .map((entry) => entry.speciesId)
  .sort(compareText);
let updatedProtocols = 0;
for (const protocol of protocols.protocols) {
  if (!protocol.sourceUniverse.includes(AFPE_SOURCE_ID)) {
    protocol.sourceUniverse.push(AFPE_SOURCE_ID);
    protocol.sourceUniverse.sort(compareText);
  }
  assert(
    !protocol.requiredCurrentSourceIds.includes(AFPE_SOURCE_ID),
    `Protocol ${protocol.id} incorrectly treats stale AFPE v1.0 as current.`,
  );
  const existingRule = protocol.rules.find((rule) =>
    rule.ruleId === "usfs-afpe-reviewed-taxa-v1"
  );
  const rule = {
    ruleId: "usfs-afpe-reviewed-taxa-v1",
    speciesSelector: {
      kind: "species-id" as const,
      values: speciesIds,
    },
    applicableSourceIds: [AFPE_SOURCE_ID],
    basis: [
      {
        kind: "hash-pinned-cc0-archive",
        reference: AFPE_MAPPING_PATH,
        note:
          "The AFPE v1.0 archive is explicitly applicable to the 13 reviewed DCA mappings across current county-equivalent scope. It is historical and stale, and it cannot create absence or non-detection.",
      },
    ],
  };
  if (existingRule) {
    Object.assign(existingRule, rule);
  } else {
    protocol.rules.push(rule);
  }
  updatedProtocols += 1;
}
protocols.updatedAt = AS_OF;
writeJson(protocolsPath, protocols);

assert(
  explicitStates.length === 50,
  `Expected 50 explicit national-v1 jurisdictions, found ${explicitStates.length}.`,
);
assert(
  addedSpeciesEntries === 0 || addedSpeciesEntries === 650,
  `AFPE expansion added unexpected species entries: ${addedSpeciesEntries}.`,
);
assert(
  addedPairScope === 0 || addedPairScope === 40001,
  `AFPE expansion added unexpected pair scope: ${addedPairScope}.`,
);

console.log(JSON.stringify({
  mappingVersion: mapping.mappingVersion,
  mappingTaxa: mapping.mappings.length,
  explicitJurisdictions: explicitStates.length,
  addedSpeciesEntries,
  addedPairScope,
  protocolCount: updatedProtocols,
  staleSourceAddedToRequiredCurrent: false,
}, null, 2));
