import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { geoCentroid } from "d3-geo";
import { feature, neighbors } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";

import { isCommerciallySafeManifestEntry } from "@/lib/data/image-license";
import { countyDetailSeed } from "@/data/source/county-details";
import { countyPresenceOverrides } from "@/data/source/county-presence-overrides";
import { speciesCountySeed } from "@/data/source/presence";
import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import { speciesSeed } from "@/data/source/species";
import type {
  CountyDetail,
  CountyCoverageSnapshotFile,
  CountyDataSourceRef,
  CountyPresence,
  CountyRecord,
  Species,
  SpeciesImageManifestFile,
  SpeciesCategory,
  UsRiisSnapshotFile,
  UsRiisSpeciesSnapshot,
} from "@/lib/data/types";

type CountyGeometry = {
  id: string;
  properties?: {
    name?: string;
  };
};

type CountyDataSourcesBySpeciesId = Record<
  string,
  NonNullable<Species["registry"]>["countyDataSources"]
>;

const outputDir = resolve(process.cwd(), "src/data/generated");
const publicOutputDir = resolve(process.cwd(), "public/generated");
const countyCoverageSnapshotPath = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const usRiisSnapshotPath = resolve(
  process.cwd(),
  "src/data/source/usriis-snapshot.json",
);
const speciesImageManifestPath = resolve(
  process.cwd(),
  "src/data/source/species-image-manifest.json",
);

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const scientificNameAliases = new Map<string, string>([
  ["euphorbia esula", "euphorbia virgata"],
]);

function normalizeScientificName(value: string) {
  const normalized = value.toLowerCase().trim();
  return scientificNameAliases.get(normalized) ?? normalized;
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function loadSpeciesImageManifest() {
  const manifest = readJsonFile<SpeciesImageManifestFile>(speciesImageManifestPath);

  if (!manifest) {
    return new Map<
      string,
      {
        src: string;
        alt: string;
        credit: string;
      }
    >();
  }

  return new Map(
    manifest.entries
      .filter((entry) => isCommerciallySafeManifestEntry(entry))
      .map((entry) => [
      entry.scientificName.toLowerCase(),
      {
        src: entry.localPath,
        alt: entry.alt,
        credit: entry.credit,
      },
      ]),
  );
}

function mapRegistryCategory(record: UsRiisSpeciesSnapshot): SpeciesCategory {
  if (record.kingdom === "Plantae") return "plants";
  if (record.className === "Insecta") return "insects";
  if (
    ["Fungi", "Chromista", "Viruses", "Bacteria", "Protozoa"].includes(
      record.kingdom,
    )
  ) {
    return "fungi-diseases";
  }
  return "wildlife";
}

function deriveDisplayGroup(record: UsRiisSpeciesSnapshot) {
  if (record.kingdom === "Plantae") {
    if (
      record.environmentTags.includes("freshwater") ||
      record.environmentTags.includes("wetlands")
    ) {
      return "Aquatic plants";
    }
    if (record.order.match(/Poales|Liliales|Asparagales/i)) {
      return "Grasses & herbs";
    }
    if (record.order.match(/Fabales|Vitales|Ranunculales/i)) {
      return "Vines & groundcovers";
    }
    if (record.order.match(/Fagales|Sapindales|Malpighiales|Pinales/i)) {
      return "Trees & shrubs";
    }
    return "Other plants";
  }

  if (record.className === "Insecta") {
    if (record.order.match(/Coleoptera/i)) return "Beetles";
    if (record.order.match(/Hemiptera/i)) return "Bugs & sap-feeders";
    if (record.order.match(/Hymenoptera/i)) return "Wasps, ants & bees";
    if (record.order.match(/Lepidoptera/i)) return "Moths & butterflies";
    if (record.order.match(/Diptera/i)) return "Flies";
    return "Other insects";
  }

  if (mapRegistryCategory(record) === "fungi-diseases") {
    if (record.kingdom === "Bacteria") return "Bacterial diseases";
    if (record.kingdom === "Viruses") return "Plant viruses";
    return "Fungi & pathogens";
  }

  if (record.className.match(/Mammalia/i)) return "Mammals";
  if (record.className.match(/Aves/i)) return "Birds";
  if (record.className.match(/Reptilia|Amphibia/i)) return "Reptiles & amphibians";
  if (record.className.match(/Teleostei|Actinopterygii|Chondrichthyes/i)) {
    return "Fish";
  }
  if (record.className.match(/Gastropoda|Bivalvia/i)) return "Mollusks";
  if (record.className.match(/Malacostraca/i)) return "Crustaceans";
  if (record.className.match(/Arachnida|Euchelicerata/i)) return "Arachnids";
  return "Other wildlife";
}

function buildRegistrySummary(record: UsRiisSpeciesSnapshot) {
  const displayGroup = deriveDisplayGroup(record).toLowerCase();
  const habitatLabel =
    record.habitats.length > 0
      ? record.habitats.slice(0, 2).join(" and ").toLowerCase()
      : "multiple habitats";
  const pathwayLabel = record.pathways[0]?.toLowerCase();

  if (pathwayLabel) {
    return `An invasive ${displayGroup} associated with ${habitatLabel}, with introduction pathways that include ${pathwayLabel}.`;
  }

  return `An invasive ${displayGroup} associated with ${habitatLabel} in the current US-RIIS lower-48 snapshot.`;
}

function loadCountyPresenceSeed() {
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(
    countyCoverageSnapshotPath,
  );

  const records: Record<string, string[]> = snapshot
    ? Object.fromEntries(
        snapshot.species.map((species) => [species.speciesId, species.countyFips]),
      )
    : {};
  const countyDataSourcesBySpeciesId: CountyDataSourcesBySpeciesId = snapshot
    ? Object.fromEntries(
        snapshot.species.map((species) => [species.speciesId, species.countyDataSources]),
      )
    : {};

  function mergeCountyFips(speciesId: string, countyFips: string[]) {
    if (!countyFips.length) return;
    records[speciesId] = [...new Set([...(records[speciesId] ?? []), ...countyFips])].sort();
  }

  function mergeCountyDataSources(speciesId: string, sources: CountyDataSourceRef[]) {
    if (!sources.length) return;
    countyDataSourcesBySpeciesId[speciesId] = [
      ...new Map(
        [...(countyDataSourcesBySpeciesId[speciesId] ?? []), ...sources].map((source) => [
          `${source.source}::${source.externalId}::${source.url}`,
          source,
        ]),
      ).values(),
    ];
  }

  for (const [speciesId, countyFips] of Object.entries(speciesCountySeed)) {
    mergeCountyFips(speciesId, countyFips);
  }

  for (const override of countyPresenceOverrides) {
    mergeCountyFips(override.speciesId, override.countyFips);
    mergeCountyDataSources(override.speciesId, override.countyDataSources);
  }

  const mappedSpeciesCount = Object.values(records).filter((countyFips) => countyFips.length > 0)
    .length;
  const catalogSpeciesCount =
    snapshot?.coverageSummary.catalogSpeciesCount ?? speciesSeed.length;
  const unmatchedSpeciesCount = Math.max(0, catalogSpeciesCount - mappedSpeciesCount);
  const sourceSpeciesCounts = Object.values(countyDataSourcesBySpeciesId).reduce(
    (acc, sources) => {
      if (!sources) return acc;
      for (const source of new Set(sources.map((entry) => entry.source))) {
        acc[source] = (acc[source] ?? 0) + 1;
      }
      return acc;
    },
    {} as CountyCoverageSnapshotFile["coverageSummary"]["sourceSpeciesCounts"],
  );

  if (!snapshot) {
    return {
      records,
      sourceRefs: [
        "Curated seed dataset",
        "Project Isitusa release dataset",
        "Manual authoritative county presence overrides",
      ],
      snapshotDate: null,
      coverageSummary: {
        catalogSpeciesCount,
        mappedSpeciesCount,
        unmatchedSpeciesCount,
        sourceSpeciesCounts,
      },
      countyDataSourcesBySpeciesId,
    };
  }

  return {
    records,
    sourceRefs: [
      snapshot.source,
      ...snapshot.citation,
      "Manual authoritative county presence overrides",
    ],
    snapshotDate: snapshot.snapshotDate,
    coverageSummary: {
      catalogSpeciesCount,
      mappedSpeciesCount,
      unmatchedSpeciesCount,
      sourceSpeciesCounts,
    },
    countyDataSourcesBySpeciesId,
  };
}

function loadRegistryCatalog(countyPresenceSeed: {
  records: Record<string, string[]>;
  countyDataSourcesBySpeciesId: CountyDataSourcesBySpeciesId;
}) {
  const snapshot = readJsonFile<UsRiisSnapshotFile>(usRiisSnapshotPath);
  const speciesImagesByScientificName = loadSpeciesImageManifest();
  const curatedByScientificName = new Map(
    speciesSeed.map((species) => [normalizeScientificName(species.scientificName), species]),
  );

  if (!snapshot) {
    return {
      species: speciesSeed,
      snapshotDate: null,
      sourceRefs: [],
    };
  }

  const usedIds = new Set(speciesSeed.map((species) => species.id));
  const usedSlugs = new Set(speciesSeed.map((species) => species.slug));

  const registrySpecies: Species[] = [];

  const buildCuratedCoverageRegistry = (species: Species): NonNullable<Species["registry"]> => {
    const mappedCountyCount = countyPresenceSeed.records[species.id]?.length ?? 0;

    return {
      locality: "L48",
      status: "invasive",
      statusLabel: "Curated county coverage",
      establishmentMeans:
        "This curated profile has verified county coverage in the local Project Isitusa snapshot, even though an exact US-RIIS registry match is not currently attached.",
      taxonRank: "species",
      kingdom: "Curated profile",
      phylum: "",
      className: "Curated profile",
      order: "Verified county coverage",
      family: "",
      habitats: [],
      pathways: [],
      environmentTags: [],
      authority: "Project Isitusa curated county coverage merge",
      occurrenceId: species.id,
      hasCountyData: mappedCountyCount > 0,
      mappedCountyCount,
      countyDataSources: countyPresenceSeed.countyDataSourcesBySpeciesId[species.id],
    };
  };

  for (const record of snapshot.species) {
    const existing = curatedByScientificName.get(
      normalizeScientificName(record.scientificName),
    );
    const countyRecordKeys = [
      record.occurrenceId,
      existing?.id,
      existing?.registry?.occurrenceId,
    ].filter((value): value is string => Boolean(value));
    const existingCountyRecordKey = countyRecordKeys.find(
      (key) => (countyPresenceSeed.records[key]?.length ?? 0) > 0,
    );
    const existingMappedCountyCount = existingCountyRecordKey
      ? countyPresenceSeed.records[existingCountyRecordKey]?.length ?? 0
      : 0;
    const existingCountyDataSources = existingCountyRecordKey
      ? countyPresenceSeed.countyDataSourcesBySpeciesId[existingCountyRecordKey]
      : undefined;
    const existingHasCountyData = Boolean(existingCountyRecordKey);

    if (existing) {
      if (!existing.image) {
        const manifestImage = speciesImagesByScientificName.get(
          record.scientificName.toLowerCase(),
        );

        if (manifestImage) {
          existing.image = {
            ...manifestImage,
            alt: `${existing.commonName} (${record.scientificName})`,
          };
        }
      }
      existing.registry = {
        locality: "L48",
        status: record.status,
        statusLabel: record.statusLabel,
        establishmentMeans: record.establishmentMeans,
        taxonRank: record.taxonRank,
        kingdom: record.kingdom,
        phylum: record.phylum,
        className: record.className,
        order: record.order,
        family: record.family,
        habitats: record.habitats,
        pathways: record.pathways,
        environmentTags: record.environmentTags,
        introDateNumber: record.introDateNumber,
        eventRemarks: record.eventRemarks,
        authority: record.authority,
        authorityUrl: record.authorityUrl,
        occurrenceId: record.occurrenceId,
        hasCountyData: existingHasCountyData,
        mappedCountyCount: existingMappedCountyCount,
        countyDataSources: existingCountyDataSources,
      };
      continue;
    }

    let id = slugify(record.scientificName);
    let slug = id;
    let suffix = 2;

    while (usedIds.has(id)) {
      id = `${slugify(record.scientificName)}-${suffix}`;
      suffix += 1;
    }
    while (usedSlugs.has(slug)) {
      slug = `${slugify(record.scientificName)}-${suffix}`;
      suffix += 1;
    }

    usedIds.add(id);
    usedSlugs.add(slug);

    registrySpecies.push({
      id,
      slug,
      commonName: record.vernacularName,
      scientificName: record.scientificName,
      category: mapRegistryCategory(record),
      profileType: "registry",
      displayGroup: deriveDisplayGroup(record),
      summary: buildRegistrySummary(record),
      image: speciesImagesByScientificName.get(record.scientificName.toLowerCase()),
      registry: {
        locality: "L48",
        status: record.status,
        statusLabel: record.statusLabel,
        establishmentMeans: record.establishmentMeans,
        taxonRank: record.taxonRank,
        kingdom: record.kingdom,
        phylum: record.phylum,
        className: record.className,
        order: record.order,
        family: record.family,
        habitats: record.habitats,
        pathways: record.pathways,
        environmentTags: record.environmentTags,
        introDateNumber: record.introDateNumber,
        eventRemarks: record.eventRemarks,
        authority: record.authority,
        authorityUrl: record.authorityUrl,
        occurrenceId: record.occurrenceId,
        hasCountyData: Boolean(countyPresenceSeed.records[record.occurrenceId]),
        mappedCountyCount: countyPresenceSeed.records[record.occurrenceId]?.length ?? 0,
        countyDataSources:
          countyPresenceSeed.countyDataSourcesBySpeciesId[record.occurrenceId],
      },
      source: [
        {
          label: "US-RIIS v2",
          url: "https://doi.org/10.5066/P9KFFTOD",
        },
        ...(record.authorityUrl
          ? [
              {
                label: "Authority source",
                url: record.authorityUrl,
              },
            ]
          : []),
      ],
    });
  }

  for (const species of speciesSeed) {
    if (species.registry) continue;
    if (!countyPresenceSeed.records[species.id]?.length) continue;

    species.registry = buildCuratedCoverageRegistry(species);
  }

  return {
    species: [...speciesSeed, ...registrySpecies],
    snapshotDate: snapshot.snapshotDate,
    sourceRefs: [snapshot.source, snapshot.citation],
  };
}

async function main() {
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: CountyGeometry[] } };
  };

  const countyCollection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    { name?: string }
  >;

  const adjacency = neighbors(topology.objects.counties.geometries as never);

  const countyRecords: Record<string, CountyRecord> = {};

  topology.objects.counties.geometries.forEach((geometry, index) => {
    const stateInfo = STATE_FIPS_TO_INFO[geometry.id.slice(0, 2)] ?? {
      code: geometry.id.slice(0, 2),
      name: "Unknown",
    };
    const countyFeature = countyCollection.features[index];
    const center = geoCentroid(countyFeature as never) as [number, number];

    countyRecords[geometry.id] = {
      countyFips: geometry.id,
      name: geometry.properties?.name ?? "Unknown County",
      stateCode: stateInfo.code,
      stateName: stateInfo.name,
      neighborFips: adjacency[index].map(
        (neighborIndex) => topology.objects.counties.geometries[neighborIndex].id,
      ),
      center: [Number(center[0].toFixed(4)), Number(center[1].toFixed(4))],
    };
  });

  const countyDetailIndex = Object.fromEntries(
    countyDetailSeed
      .filter((detail) => countyRecords[detail.countyFips])
      .map((detail) => [detail.countyFips, detail]),
  ) as Record<string, CountyDetail>;

  const presenceIndex: Record<string, CountyPresence> = {};
  const countyPresenceSeed = loadCountyPresenceSeed();

  for (const [speciesId, counties] of Object.entries(countyPresenceSeed.records)) {
    for (const countyFips of counties) {
      if (!countyRecords[countyFips]) continue;
      if (
        ["AK", "HI", "PR", "GU", "AS", "MP", "VI"].includes(
          countyRecords[countyFips].stateCode,
        )
      ) {
        continue;
      }

      if (!presenceIndex[countyFips]) {
        presenceIndex[countyFips] = {
          countyFips,
          speciesIds: [],
          sourceRefs: countyPresenceSeed.sourceRefs,
        };
      }

      if (!presenceIndex[countyFips].speciesIds.includes(speciesId)) {
        presenceIndex[countyFips].speciesIds.push(speciesId);
      }
    }
  }

  for (const county of Object.values(presenceIndex)) {
    county.speciesIds.sort();
  }

  const registryCatalog = loadRegistryCatalog(countyPresenceSeed);
  const explorerSpecies = registryCatalog.species.map((species) => ({
    id: species.id,
    slug: species.slug,
    commonName: species.commonName,
    scientificName: species.scientificName,
    category: species.category,
    displayGroup: species.displayGroup,
    summary: species.summary,
    image: species.image,
    registry: species.registry
      ? {
          status: species.registry.status,
          hasCountyData: species.registry.hasCountyData,
          environmentTags: species.registry.environmentTags,
          introDateNumber: species.registry.introDateNumber,
          mappedCountyCount: species.registry.mappedCountyCount,
        }
      : undefined,
  }));
  const speciesIndexById = new Map<string, number>();
  const canonicalSpeciesIdByLookupKey = new Map<string, string>();

  registryCatalog.species.forEach((species, index) => {
    speciesIndexById.set(species.id, index);
    canonicalSpeciesIdByLookupKey.set(species.id, species.id);

    if (species.registry?.occurrenceId) {
      speciesIndexById.set(species.registry.occurrenceId, index);
      canonicalSpeciesIdByLookupKey.set(species.registry.occurrenceId, species.id);
    }
  });

  for (const countyPresence of Object.values(presenceIndex)) {
    countyPresence.speciesIds = [
      ...new Set(
        countyPresence.speciesIds.map(
          (speciesId) => canonicalSpeciesIdByLookupKey.get(speciesId) ?? speciesId,
        ),
      ),
    ].sort();
  }

  const explorerPresenceIndex = Object.fromEntries(
    Object.entries(presenceIndex).map(([countyFips, countyPresence]) => [
      countyFips,
      countyPresence.speciesIds
        .map((speciesId) => speciesIndexById.get(speciesId))
        .filter((speciesIndex): speciesIndex is number => typeof speciesIndex === "number"),
    ]),
  );

  const canonicalMappedSpecies = registryCatalog.species.filter(
    (species) => species.registry?.hasCountyData,
  );
  const canonicalCoverageSummary = {
    catalogSpeciesCount: registryCatalog.species.length,
    mappedSpeciesCount: canonicalMappedSpecies.length,
    unmatchedSpeciesCount: registryCatalog.species.length - canonicalMappedSpecies.length,
    sourceSpeciesCounts: canonicalMappedSpecies.reduce(
      (acc, species) => {
        const sources = species.registry?.countyDataSources ?? [];
        for (const source of new Set(sources.map((entry) => entry.source))) {
          acc[source] = (acc[source] ?? 0) + 1;
        }
        return acc;
      },
      {} as CountyCoverageSnapshotFile["coverageSummary"]["sourceSpeciesCounts"],
    ),
  };

  const snapshotPayload = {
    snapshotDate: countyPresenceSeed.snapshotDate ?? registryCatalog.snapshotDate,
    sourceRefs: [...countyPresenceSeed.sourceRefs, ...registryCatalog.sourceRefs].filter(
      Boolean,
    ),
    coverageSummary: canonicalCoverageSummary,
  };

  await mkdir(outputDir, { recursive: true });
  await mkdir(publicOutputDir, { recursive: true });

  const writes = [
    ["species.json", registryCatalog.species],
    ["explorer-species.json", explorerSpecies],
    ["presence.json", presenceIndex],
    ["explorer-presence.json", explorerPresenceIndex],
    ["counties.json", countyRecords],
    ["county-details.json", countyDetailIndex],
    ["snapshot.json", snapshotPayload],
  ] as const;

  await Promise.all(
    writes.flatMap(([fileName, payload]) => {
      const contents = `${JSON.stringify(payload, null, 2)}\n`;
      return [
        writeFile(resolve(outputDir, fileName), contents),
        writeFile(resolve(publicOutputDir, fileName), contents),
      ];
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
