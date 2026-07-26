import type {
  CountyPresence,
  CountyRecord,
  ExplorerPresenceIndex,
  ExplorerSpecies,
  Species,
} from "@/lib/data/types";
import type { ResearchCountyFile } from "@/lib/research/types";

type DatasetSnapshot = {
  snapshotDate: string;
  sourceRefs: string[];
  coverageSummary?: {
    catalogSpeciesCount: number;
    mappedSpeciesCount: number;
    unmatchedSpeciesCount: number;
    sourceSpeciesCounts: Partial<Record<string, number>>;
  };
};

type MatrixSpecies = Pick<
  Species,
  "id" | "commonName" | "scientificName" | "category" | "profileType"
>;

function sortUnique(values: string[]) {
  return [...new Set(values)].sort();
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

export function serializePresenceOutsideState(input: {
  stateCode: string;
  counties: Record<string, Pick<CountyRecord, "stateCode">>;
  presence: Record<string, CountyPresence>;
}) {
  const stateCode = input.stateCode.toUpperCase();
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(input.presence)
        .filter(([countyFips]) => input.counties[countyFips]?.stateCode !== stateCode)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
  );
}

export function replaceStatePresenceFromResearch(input: {
  stateCode: string;
  asOf: string;
  counties: Record<string, CountyRecord>;
  currentPresence: Record<string, CountyPresence>;
  countyFiles: ResearchCountyFile[];
}) {
  const stateCode = input.stateCode.toUpperCase();
  const next: Record<string, CountyPresence> = Object.fromEntries(
    Object.entries(input.currentPresence)
      .filter(([countyFips]) => input.counties[countyFips]?.stateCode !== stateCode)
      .map(([countyFips, entry]) => [countyFips, entry]),
  );

  for (const county of [...input.countyFiles].sort((left, right) =>
    left.countyFips.localeCompare(right.countyFips),
  )) {
    if (county.stateCode !== stateCode) {
      throw new Error(
        `Research county ${county.countyFips} belongs to ${county.stateCode}, not ${stateCode}.`,
      );
    }
    const registryCounty = input.counties[county.countyFips];
    if (!registryCounty || registryCounty.stateCode !== stateCode) {
      throw new Error(`Research county ${county.countyFips} is not an active ${stateCode} county equivalent.`);
    }
    const speciesIds = county.pairs
      .filter((pair) => pair.displayStatus === "verified-present")
      .map((pair) => pair.speciesId)
      .sort();
    if (speciesIds.length === 0) continue;
    const previousRefs = input.currentPresence[county.countyFips]?.sourceRefs ?? [];
    next[county.countyFips] = {
      countyFips: county.countyFips,
      speciesIds: sortUnique(speciesIds),
      sourceRefs: sortUnique([
        ...previousRefs,
        `Reviewed Project Isitusa research evidence through ${input.asOf}`,
      ]),
    };
  }

  return Object.fromEntries(
    Object.entries(next).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildExplorerPresence(
  presence: Record<string, CountyPresence>,
  explorerSpecies: ExplorerSpecies[],
): ExplorerPresenceIndex {
  const ordinalBySpeciesId = new Map(
    explorerSpecies.map((entry, index) => [entry.id, index]),
  );
  return Object.fromEntries(
    Object.entries(presence)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([countyFips, county]) => [
        countyFips,
        county.speciesIds.map((speciesId) => {
          const ordinal = ordinalBySpeciesId.get(speciesId);
          if (ordinal === undefined) {
            throw new Error(`Compatibility presence references unknown explorer species ${speciesId}.`);
          }
          return ordinal;
        }),
      ]),
  );
}

export function recomputeCatalogCoverage(input: {
  presence: Record<string, CountyPresence>;
  species: Species[];
  explorerSpecies: ExplorerSpecies[];
  snapshot: DatasetSnapshot;
}) {
  const countyCountBySpeciesId = new Map<string, number>();
  for (const county of Object.values(input.presence)) {
    for (const speciesId of new Set(county.speciesIds)) {
      countyCountBySpeciesId.set(speciesId, (countyCountBySpeciesId.get(speciesId) ?? 0) + 1);
    }
  }

  const species = input.species.map((entry) => {
    const mappedCountyCount = countyCountBySpeciesId.get(entry.id) ?? 0;
    if (!entry.registry) return entry;
    return {
      ...entry,
      registry: {
        ...entry.registry,
        hasCountyData: mappedCountyCount > 0,
        mappedCountyCount,
      },
    };
  });
  const explorerSpecies = input.explorerSpecies.map((entry) => {
    const mappedCountyCount = countyCountBySpeciesId.get(entry.id) ?? 0;
    if (!entry.registry) return entry;
    return {
      ...entry,
      registry: {
        ...entry.registry,
        hasCountyData: mappedCountyCount > 0,
        mappedCountyCount,
      },
    };
  });
  const mappedSpeciesCount = countyCountBySpeciesId.size;
  const snapshot: DatasetSnapshot = {
    ...input.snapshot,
    coverageSummary: {
      catalogSpeciesCount: species.length,
      mappedSpeciesCount,
      unmatchedSpeciesCount: Math.max(0, species.length - mappedSpeciesCount),
      sourceSpeciesCounts: input.snapshot.coverageSummary?.sourceSpeciesCounts ?? {},
    },
  };
  return { species, explorerSpecies, snapshot, countyCountBySpeciesId };
}

export function assertProjectionParity(input: {
  stateCode: string;
  counties: Record<string, CountyRecord>;
  countyFiles: ResearchCountyFile[];
  presence: Record<string, CountyPresence>;
  explorerPresence: ExplorerPresenceIndex;
  explorerSpecies: ExplorerSpecies[];
}) {
  const expected = new Set(
    input.countyFiles.flatMap((county) =>
      county.pairs
        .filter((pair) => pair.displayStatus === "verified-present")
        .map((pair) => `${county.countyFips}:${pair.speciesId}`),
    ),
  );
  const actual = new Set(
    Object.entries(input.presence)
      .filter(([countyFips]) => input.counties[countyFips]?.stateCode === input.stateCode)
      .flatMap(([countyFips, county]) =>
        county.speciesIds.map((speciesId) => `${countyFips}:${speciesId}`),
      ),
  );
  if (expected.size !== actual.size || [...expected].some((key) => !actual.has(key))) {
    throw new Error(
      `Research and compatibility presence differ for ${input.stateCode}: ${expected.size} versus ${actual.size}.`,
    );
  }
  for (const [countyFips, ordinals] of Object.entries(input.explorerPresence)) {
    const expectedSpeciesIds = input.presence[countyFips]?.speciesIds ?? [];
    const actualSpeciesIds = ordinals.map((ordinal) => input.explorerSpecies[ordinal]?.id);
    if (expectedSpeciesIds.join("\n") !== actualSpeciesIds.join("\n")) {
      throw new Error(`Explorer ordinals do not round-trip for ${countyFips}.`);
    }
  }
  return expected.size;
}

export function buildCompatibilityMatrix(input: {
  stateCode: string;
  stateName: string;
  sourceSnapshotDate: string;
  species: MatrixSpecies[];
  countyFiles: ResearchCountyFile[];
}) {
  const targetKnownPercent = 90;
  const targetKnownDeterminationsPerCounty = Math.ceil(
    input.species.length * (targetKnownPercent / 100),
  );
  const presentCountiesBySpecies = new Map<string, string[]>();
  const absentCountiesBySpecies = new Map<string, string[]>();
  const notDetectedCountiesBySpecies = new Map<string, string[]>();

  const counties = [...input.countyFiles]
    .sort((left, right) => left.countyFips.localeCompare(right.countyFips))
    .map((county) => {
      const presentVerifiedSpeciesIds = county.pairs
        .filter((pair) => pair.displayStatus === "verified-present")
        .map((pair) => pair.speciesId)
        .sort();
      const verifiedAbsentSpeciesIds = county.pairs
        .filter((pair) => pair.displayStatus === "verified-absent")
        .map((pair) => pair.speciesId)
        .sort();
      const notDetectedSpeciesIds = county.pairs
        .filter((pair) => pair.displayStatus === "not-detected")
        .map((pair) => pair.speciesId)
        .sort();
      for (const speciesId of presentVerifiedSpeciesIds) {
        presentCountiesBySpecies.set(speciesId, [
          ...(presentCountiesBySpecies.get(speciesId) ?? []),
          county.countyFips,
        ]);
      }
      for (const speciesId of verifiedAbsentSpeciesIds) {
        absentCountiesBySpecies.set(speciesId, [
          ...(absentCountiesBySpecies.get(speciesId) ?? []),
          county.countyFips,
        ]);
      }
      for (const speciesId of notDetectedSpeciesIds) {
        notDetectedCountiesBySpecies.set(speciesId, [
          ...(notDetectedCountiesBySpecies.get(speciesId) ?? []),
          county.countyFips,
        ]);
      }
      const knownDeterminations =
        presentVerifiedSpeciesIds.length +
        verifiedAbsentSpeciesIds.length +
        notDetectedSpeciesIds.length;
      return {
        countyFips: county.countyFips,
        name: county.countyName,
        presentVerifiedSpeciesIds,
        verifiedAbsentSpeciesIds,
        notDetectedSpeciesIds,
        knownDeterminations,
        unknownDeterminations: input.species.length - knownDeterminations,
        knownPercent: roundPercent((knownDeterminations / input.species.length) * 100),
        targetGap: Math.max(0, targetKnownDeterminationsPerCounty - knownDeterminations),
      };
    });

  const species = input.species
    .map((entry) => {
      const presentVerifiedCountyFips = sortUnique(
        presentCountiesBySpecies.get(entry.id) ?? [],
      );
      const verifiedAbsentCountyFips = sortUnique(absentCountiesBySpecies.get(entry.id) ?? []);
      const notDetectedCountyFips = sortUnique(notDetectedCountiesBySpecies.get(entry.id) ?? []);
      const knownCountyCount =
        presentVerifiedCountyFips.length +
        verifiedAbsentCountyFips.length +
        notDetectedCountyFips.length;
      return {
        speciesId: entry.id,
        commonName: entry.commonName,
        scientificName: entry.scientificName,
        category: entry.category,
        profileType: entry.profileType,
        presentVerifiedCountyFips,
        verifiedAbsentCountyFips,
        notDetectedCountyFips,
        knownCountyCount,
        unknownCountyCount: counties.length - knownCountyCount,
      };
    })
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const presentVerifiedDeterminations = counties.reduce(
    (sum, county) => sum + county.presentVerifiedSpeciesIds.length,
    0,
  );
  const verifiedAbsentDeterminations = counties.reduce(
    (sum, county) => sum + county.verifiedAbsentSpeciesIds.length,
    0,
  );
  const notDetectedDeterminations = counties.reduce(
    (sum, county) => sum + county.notDetectedSpeciesIds.length,
    0,
  );
  const knownDeterminations =
    presentVerifiedDeterminations + verifiedAbsentDeterminations + notDetectedDeterminations;
  const totalDeterminations = counties.length * input.species.length;
  return {
    schemaVersion: 2,
    stateCode: input.stateCode,
    stateName: input.stateName,
    statusDefinitions: {
      "verified-present": "Reviewed evidence supports county-level presence.",
      "verified-absent": "Authoritative reviewed evidence explicitly supports absence for the exact county and species.",
      "not-detected": "A reviewed documented survey searched for the species and did not detect it. This is not absence.",
      unknown: "No defensible county-species determination has been added. Unknown does not mean absent.",
    },
    generatedFrom: {
      compiler: "scripts/compile-research-index.ts",
      bootstrapFreeze: "src/data/research/bootstrap-ledger-freeze.json",
      researchProjection: `public/generated/research/${input.stateCode}`,
      countyPresenceSnapshotDate: input.sourceSnapshotDate,
    },
    target: {
      knownPercent: targetKnownPercent,
      knownDeterminationsPerCounty: targetKnownDeterminationsPerCounty,
      knownDeterminationsTotal: targetKnownDeterminationsPerCounty * counties.length,
    },
    summary: {
      countyCount: counties.length,
      speciesCount: input.species.length,
      totalDeterminations,
      targetKnownDeterminationsPerCounty,
      targetKnownDeterminationsTotal: targetKnownDeterminationsPerCounty * counties.length,
      presentVerifiedDeterminations,
      verifiedAbsentDeterminations,
      notDetectedDeterminations,
      knownDeterminations,
      unknownDeterminations: totalDeterminations - knownDeterminations,
      knownPercent: roundPercent((knownDeterminations / totalDeterminations) * 100),
      countiesAtTarget: counties.filter(
        (county) => county.knownDeterminations >= targetKnownDeterminationsPerCounty,
      ).length,
    },
    counties,
    species,
  };
}

export function renderCompatibilityMatrixMarkdown(matrix: ReturnType<typeof buildCompatibilityMatrix>) {
  return [
    `# ${matrix.stateName} County-Equivalent Species Coverage Matrix`,
    "",
    `State code: \`${matrix.stateCode}\``,
    "",
    "## Exact Counts",
    "",
    `- County equivalents: \`${matrix.summary.countyCount}\``,
    `- Species in catalog: \`${matrix.summary.speciesCount}\``,
    `- County-species pairs: \`${matrix.summary.totalDeterminations}\``,
    `- Verified present: \`${matrix.summary.presentVerifiedDeterminations}\``,
    `- Verified absent: \`${matrix.summary.verifiedAbsentDeterminations}\``,
    `- Not detected: \`${matrix.summary.notDetectedDeterminations}\``,
    `- Unknown: \`${matrix.summary.unknownDeterminations}\``,
    `- Known percent: \`${matrix.summary.knownPercent}%\``,
    "",
    "Generated by the reviewed evidence compiler. Do not hand-edit this file or its JSON companion.",
    "",
  ].join("\n");
}
