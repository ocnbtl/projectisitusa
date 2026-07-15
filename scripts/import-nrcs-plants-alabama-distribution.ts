import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";
import countyTopology from "@/data/source/county-equivalents-topology.json";

import { STATE_FIPS_TO_INFO } from "@/data/source/state-fips";
import type {
  CountyCoverageSnapshotFile,
  CountyCoverageSpeciesSnapshot,
  CountyDataSourceRef,
  CountyRecord,
  Species,
} from "@/lib/data/types";

const USER_AGENT = "Mozilla/5.0 Project-Isitusa/1.0";
const SOURCE_NAME = "USDA NRCS PLANTS county distribution";
const NRCS_PLANTS_SERVICE_URL =
  "https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/land_use_land_cover/plants/MapServer";
const NRCS_PLANTS_STATES_LAYER_URL = `${NRCS_PLANTS_SERVICE_URL}/4`;
const NRCS_PLANTS_COUNTIES_LAYER_URL = `${NRCS_PLANTS_SERVICE_URL}/6`;
const NRCS_PLANTS_PROFILE_API_URL =
  "https://plantsservices.sc.egov.usda.gov/api/PlantProfile";
const ALABAMA_ENVELOPE = "-89,30,-84,36";
const COUNTY_PRESENCE_PATH = resolve(
  process.cwd(),
  "src/data/source/county-presence-snapshot.json",
);
const SPECIES_PATH = resolve(process.cwd(), "src/data/generated/species.json");
const COUNTIES_PATH = resolve(process.cwd(), "src/data/generated/counties.json");

type NrcsPlantsRow = {
  attributes?: {
    plant_master_id?: number | string | null;
    plant_nativity_id?: string | null;
    country_subdivision_name?: string | null;
    Symbol?: string | null;
  };
};

type NrcsPlantsQueryResponse = {
  features?: NrcsPlantsRow[];
  exceededTransferLimit?: boolean;
  error?: {
    code?: number;
    message?: string;
    details?: string[];
  };
};

type NrcsPlantsProfile = {
  Id?: number;
  AcceptedId?: number;
  Symbol?: string;
  ScientificName?: string;
  NativeStatuses?: Array<{
    Region?: string;
    Status?: string;
    Type?: string;
  }>;
};

type NrcsPlantsGeoJsonFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  {
    plant_master_id?: number | null;
    plant_nativity_id?: string | null;
    country_subdivision_name?: string | null;
    Symbol?: string | null;
  }
>;

type NrcsPlantsGeoJsonResponse = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  NrcsPlantsGeoJsonFeature["properties"]
> & {
  exceededTransferLimit?: boolean;
};

type CountyGeometry = {
  id: string;
  properties?: {
    name?: string;
  };
};

type CountyFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { name?: string; countyFips: string }
>;

type ImportedCoverage = {
  scientificName: string;
  plantId: number;
  symbol: string;
  countyFips: Set<string>;
  rows: number;
};

function readJsonFile<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function curlJson<T>(url: string, maxBuffer = 5 * 1024 * 1024) {
  const response = execFileSync(
    "curl",
    ["-sL", "--max-time", "120", "-A", USER_AGENT, url],
    { encoding: "utf8", maxBuffer },
  );
  return JSON.parse(response) as T;
}

function canonicalScientificName(value: string) {
  return value.trim().toLowerCase().replace(/×/g, "x").replace(/\s+/g, " ");
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function extractTaxonName(value: string) {
  const clean = stripHtml(value)
    .replace(/[(),]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const tokens = clean.split(" ").filter(Boolean);
  if (tokens.length < 2) return clean;

  const taxonTokens = [tokens[0], tokens[1]];
  const rankIndex = tokens.findIndex((token) =>
    ["subsp.", "ssp.", "var.", "f.", "forma"].includes(token.toLowerCase()),
  );
  if (rankIndex !== -1) {
    const epithet = tokens
      .slice(rankIndex + 1)
      .find((token) => /^[a-z][a-z-]+$/.test(token));
    if (epithet) {
      taxonTokens.push(tokens[rankIndex].toLowerCase(), epithet);
    }
  }

  return taxonTokens.join(" ").replace(/\bssp\./g, "subsp.");
}

function countyPresenceSpeciesId(record: Species) {
  return record.profileType === "registry" && record.registry?.occurrenceId
    ? record.registry.occurrenceId
    : record.id;
}

function uniqueSources(sources: CountyDataSourceRef[]) {
  return [
    ...new Map(
      sources.map((source) => [
        `${source.source}::${source.matchType}::${source.externalId}::${source.url}`,
        source,
      ]),
    ).values(),
  ];
}

function buildCoverageSummary(
  records: CountyCoverageSpeciesSnapshot[],
  catalogSpeciesCount: number,
) {
  const mappedRecords = records.filter((record) => record.countyFips.length > 0);
  const mappedSpeciesIds = new Set(mappedRecords.map((record) => record.speciesId));
  const sourceSpeciesCounts: CountyCoverageSnapshotFile["coverageSummary"]["sourceSpeciesCounts"] = {};

  for (const record of mappedRecords) {
    const sourceNames = new Set(record.countyDataSources.map((source) => source.source));
    for (const sourceName of sourceNames) {
      sourceSpeciesCounts[sourceName] = (sourceSpeciesCounts[sourceName] ?? 0) + 1;
    }
  }

  return {
    catalogSpeciesCount,
    mappedSpeciesCount: mappedSpeciesIds.size,
    unmatchedSpeciesCount: Math.max(0, catalogSpeciesCount - mappedSpeciesIds.size),
    sourceSpeciesCounts,
  };
}

function buildCountyFeatures() {
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
  const stateCodeByFips = Object.fromEntries(
    Object.entries(STATE_FIPS_TO_INFO).map(([fips, info]) => [fips, info.code]),
  );

  const countyFeatures: CountyFeature[] = [];
  countyCollection.features.forEach((countyFeature, index) => {
    const geometry = topology.objects.counties.geometries[index];
    const countyFips = geometry.id;
    const stateCode = stateCodeByFips[countyFips.slice(0, 2)];
    if (stateCode !== "AL") return;

    countyFeatures.push({
      ...countyFeature,
      properties: {
        ...(countyFeature.properties ?? {}),
        countyFips,
        name: geometry.properties?.name ?? countyFeature.properties?.name,
      },
    });
  });

  return countyFeatures;
}

function flattenGeometryCoordinates(
  coordinates: GeoJSON.Polygon["coordinates"] | GeoJSON.MultiPolygon["coordinates"],
  output: Array<[number, number]> = [],
) {
  for (const coordinateSet of coordinates) {
    if (
      Array.isArray(coordinateSet) &&
      coordinateSet.length >= 2 &&
      typeof coordinateSet[0] === "number" &&
      typeof coordinateSet[1] === "number"
    ) {
      output.push([coordinateSet[0], coordinateSet[1]]);
      continue;
    }

    flattenGeometryCoordinates(
      coordinateSet as GeoJSON.Polygon["coordinates"] | GeoJSON.MultiPolygon["coordinates"],
      output,
    );
  }

  return output;
}

function geometryBboxCenter(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon) {
  const coordinates = flattenGeometryCoordinates(geometry.coordinates);
  let minLongitude = Infinity;
  let minLatitude = Infinity;
  let maxLongitude = -Infinity;
  let maxLatitude = -Infinity;

  for (const [longitude, latitude] of coordinates) {
    if (longitude < minLongitude) minLongitude = longitude;
    if (longitude > maxLongitude) maxLongitude = longitude;
    if (latitude < minLatitude) minLatitude = latitude;
    if (latitude > maxLatitude) maxLatitude = latitude;
  }

  if (
    !Number.isFinite(minLongitude) ||
    !Number.isFinite(minLatitude) ||
    !Number.isFinite(maxLongitude) ||
    !Number.isFinite(maxLatitude)
  ) {
    return null;
  }

  return [(minLongitude + maxLongitude) / 2, (minLatitude + maxLatitude) / 2] as [
    number,
    number,
  ];
}

function resolveFeatureCountyFips(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
  countyFeatures: CountyFeature[],
) {
  const center = geometryBboxCenter(geometry);
  if (!center) return null;

  for (const countyFeature of countyFeatures) {
    if (geoContains(countyFeature, center)) {
      return countyFeature.properties.countyFips;
    }
  }

  return null;
}

function buildArcGisQueryUrl(
  layerUrl: string,
  params: Record<string, string | number | boolean>,
) {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.set(key, String(value));
  }
  return `${layerUrl}/query?${searchParams.toString()}`;
}

function loadNrcsAlabamaIntroducedPlantIds() {
  const rows: NrcsPlantsRow[] = [];
  let offset = 0;

  while (true) {
    const url = buildArcGisQueryUrl(NRCS_PLANTS_STATES_LAYER_URL, {
      where: "country_subdivision_name='Alabama' AND Symbol='Introduced'",
      returnGeometry: false,
      outFields: "plant_master_id,plant_nativity_id,country_subdivision_name,Symbol",
      resultOffset: offset,
      resultRecordCount: 2000,
      f: "json",
    });
    const payload = curlJson<NrcsPlantsQueryResponse>(url);
    if (payload.error) {
      throw new Error(
        `NRCS PLANTS state query failed: ${payload.error.message ?? payload.error.code}`,
      );
    }

    rows.push(...(payload.features ?? []));
    if (!payload.exceededTransferLimit || (payload.features ?? []).length === 0) break;
    offset += payload.features?.length ?? 0;
  }

  return [
    ...new Set(
      rows
        .map((row) => Number(row.attributes?.plant_master_id))
        .filter((plantId) => Number.isFinite(plantId) && plantId > 0),
    ),
  ].sort((left, right) => left - right);
}

function loadNrcsPlantProfile(plantId: number) {
  return curlJson<NrcsPlantsProfile>(`${NRCS_PLANTS_PROFILE_API_URL}/${plantId}`);
}

function hasLower48IntroducedStatus(profile: NrcsPlantsProfile) {
  return (profile.NativeStatuses ?? []).some(
    (status) => status.Region === "L48" && status.Type === "Introduced",
  );
}

function loadNrcsCountyRowsForPlantId(plantId: number) {
  const url = buildArcGisQueryUrl(NRCS_PLANTS_COUNTIES_LAYER_URL, {
    where: `plant_master_id=${plantId}`,
    geometry: ALABAMA_ENVELOPE,
    geometryType: "esriGeometryEnvelope",
    inSR: 4326,
    spatialRel: "esriSpatialRelIntersects",
    returnGeometry: true,
    outFields: "plant_master_id,plant_nativity_id,country_subdivision_name,Symbol",
    outSR: 4326,
    f: "geojson",
  });

  return curlJson<NrcsPlantsGeoJsonResponse>(url, 15 * 1024 * 1024);
}

function collectImportedCoverage(species: Species[], counties: Record<string, CountyRecord>) {
  const speciesByScientificName = new Map(
    species.map((record) => [canonicalScientificName(record.scientificName), record]),
  );
  const validAlCountyFips = new Set(
    Object.values(counties)
      .filter((county) => county.stateCode === "AL")
      .map((county) => county.countyFips),
  );
  const countyFeatures = buildCountyFeatures();
  const plantIds = loadNrcsAlabamaIntroducedPlantIds();
  const imported = new Map<string, ImportedCoverage>();
  const skippedProfiles: string[] = [];
  let exactProfileMatches = 0;
  let countyRowsReviewed = 0;
  let countyRowsAccepted = 0;
  let countyRowsUnresolved = 0;
  let countyRowsSkippedForStatus = 0;

  for (const plantId of plantIds) {
    const profile = loadNrcsPlantProfile(plantId);
    const rawScientificName = profile.ScientificName ?? "";
    const taxonName = extractTaxonName(rawScientificName);
    const speciesRecord = speciesByScientificName.get(canonicalScientificName(taxonName));
    const symbol = profile.Symbol ?? String(plantId);

    if (
      !profile.Id ||
      profile.AcceptedId !== profile.Id ||
      !hasLower48IntroducedStatus(profile) ||
      !speciesRecord
    ) {
      skippedProfiles.push(`${plantId}:${taxonName || symbol}`);
      continue;
    }

    exactProfileMatches += 1;
    const countyRows = loadNrcsCountyRowsForPlantId(plantId);
    const speciesId = countyPresenceSpeciesId(speciesRecord);
    const coverage = imported.get(speciesId) ?? {
      scientificName: speciesRecord.scientificName,
      plantId,
      symbol,
      countyFips: new Set<string>(),
      rows: 0,
    };

    for (const feature of countyRows.features ?? []) {
      countyRowsReviewed += 1;
      const status = feature.properties?.Symbol;
      if (status !== "Introduced" && status !== "Both") {
        countyRowsSkippedForStatus += 1;
        continue;
      }

      const countyFips = feature.geometry
        ? resolveFeatureCountyFips(feature.geometry, countyFeatures)
        : null;
      if (!countyFips || !validAlCountyFips.has(countyFips)) {
        countyRowsUnresolved += 1;
        continue;
      }

      countyRowsAccepted += 1;
      coverage.countyFips.add(countyFips);
      coverage.rows += 1;
    }

    if (coverage.countyFips.size > 0) {
      imported.set(speciesId, coverage);
      console.log(
        `Loaded NRCS PLANTS county distribution for ${coverage.scientificName}: ${coverage.countyFips.size} Alabama counties from ${coverage.rows} rows (${symbol}, ${plantId}).`,
      );
    }
  }

  const countyPairs = [...imported.values()].reduce(
    (total, coverage) => total + coverage.countyFips.size,
    0,
  );
  console.log(
    `Loaded ${imported.size} species from NRCS PLANTS county distribution with ${countyPairs} Alabama county-species pairs.`,
  );
  console.log(
    `Reviewed ${plantIds.length} Alabama introduced PLANTS profiles; ${exactProfileMatches} exact current-catalog profiles matched; ${skippedProfiles.length} profiles skipped.`,
  );
  console.log(
    `Reviewed ${countyRowsReviewed} NRCS county geometry rows; accepted ${countyRowsAccepted}, skipped ${countyRowsSkippedForStatus} for non-introduced status, and skipped ${countyRowsUnresolved} outside resolvable Alabama counties.`,
  );
  if (skippedProfiles.length > 0) {
    console.log(
      `Skipped NRCS PLANTS profiles without exact eligible current-catalog matches: ${skippedProfiles.slice(0, 80).join(", ")}${skippedProfiles.length > 80 ? ", ..." : ""}`,
    );
  }

  return imported;
}

async function main() {
  const species = readJsonFile<Species[]>(SPECIES_PATH);
  const counties = readJsonFile<Record<string, CountyRecord>>(COUNTIES_PATH);
  const snapshot = readJsonFile<CountyCoverageSnapshotFile>(COUNTY_PRESENCE_PATH);
  const imported = collectImportedCoverage(species, counties);
  const existingBySpeciesId = new Map(
    snapshot.species.map((record) => [record.speciesId, record]),
  );
  const outputRecords = new Map<string, CountyCoverageSpeciesSnapshot>();

  for (const record of snapshot.species) {
    outputRecords.set(record.speciesId, {
      ...record,
      countyDataSources: record.countyDataSources.filter(
        (source) => source.source !== SOURCE_NAME,
      ),
    });
  }

  let netNewCountyPairs = 0;
  for (const [speciesId, coverage] of imported) {
    const existing = existingBySpeciesId.get(speciesId);
    const countyFips = new Set(existing?.countyFips ?? []);
    for (const fips of coverage.countyFips) {
      if (!countyFips.has(fips)) {
        netNewCountyPairs += 1;
      }
      countyFips.add(fips);
    }

    outputRecords.set(speciesId, {
      speciesId,
      countyFips: [...countyFips].sort(),
      countyDataSources: uniqueSources([
        ...(existing?.countyDataSources ?? []).filter(
          (source) => source.source !== SOURCE_NAME,
        ),
        {
          source: SOURCE_NAME,
          matchType: "scientific-exact",
          externalId: `${coverage.symbol} ${coverage.plantId} (${coverage.scientificName})`,
          url: NRCS_PLANTS_COUNTIES_LAYER_URL,
        },
      ]),
    });
  }

  const records = [...outputRecords.values()]
    .filter((record) => record.countyFips.length > 0)
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));
  const nextSnapshot: CountyCoverageSnapshotFile = {
    ...snapshot,
    citation: [
      ...snapshot.citation.filter((entry) => !entry.includes("NRCS PLANTS")),
      "USDA Natural Resources Conservation Service. 2026. PLANTS county distribution and nativity MapServer layer. Available online at https://apps.geo.fpac.usda.gov/nrcs-geodata/rest/services/land_use_land_cover/plants/MapServer/6.",
    ],
    snapshotDate: new Date().toISOString(),
    species: records,
    unmatchedSpeciesIds: snapshot.unmatchedSpeciesIds.filter(
      (speciesId) => !outputRecords.has(speciesId),
    ),
    coverageSummary: buildCoverageSummary(records, species.length),
  };

  await writeFile(COUNTY_PRESENCE_PATH, `${JSON.stringify(nextSnapshot, null, 2)}\n`);
  console.log(`Saved NRCS PLANTS county distribution snapshot to ${COUNTY_PRESENCE_PATH}`);
  console.log(`Net new county-species pairs: ${netNewCountyPairs}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
