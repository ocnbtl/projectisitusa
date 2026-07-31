import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { open } from "shapefile";
import { topology } from "topojson-server";

const ROOT = process.cwd();

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      fail(`Invalid argument sequence near ${key ?? "end of input"}.`);
    }
    values.set(key.slice(2), value);
  }

  const required = ["zip", "source-url", "source-sha256", "source-as-of", "retrieved-at"];
  for (const key of required) {
    if (!values.get(key)) fail(`Missing required --${key} argument.`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.get("source-as-of"))) {
    fail("--source-as-of must be YYYY-MM-DD.");
  }
  if (Number.isNaN(Date.parse(values.get("retrieved-at")))) {
    fail("--retrieved-at must be an ISO timestamp.");
  }
  if (!/^[a-f0-9]{64}$/.test(values.get("source-sha256"))) {
    fail("--source-sha256 must be a lowercase SHA-256 hash.");
  }
  return Object.fromEntries(values);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function countyEquivalentKind(legalStatisticalAreaCode, countyFips) {
  if (countyFips === "11001") return "federal-district";
  return (
    {
      "00": countyFips === "32510" ? "independent-city" : "other-county-equivalent",
      "03": "city-and-borough",
      "04": "borough",
      "05": "census-area",
      "06": "county",
      "07": "district",
      "10": "island",
      "12": "municipality",
      "13": "municipio",
      "15": "parish",
      "25": "independent-city",
      PL: "planning-region",
    }[legalStatisticalAreaCode] ?? "other-county-equivalent"
  );
}

function countyEquivalentLabel(stateCode) {
  if (stateCode === "AK") return "borough or census area";
  if (stateCode === "CT") return "planning region";
  if (stateCode === "LA") return "parish";
  if (stateCode === "DC") return "federal district";
  return "county or county equivalent";
}

const args = parseArgs(process.argv.slice(2));
const zipPath = path.resolve(ROOT, args.zip);
const zipBytes = readFileSync(zipPath);
const actualZipHash = sha256(zipBytes);
if (actualZipHash !== args["source-sha256"]) {
  fail(`Source ZIP hash mismatch: expected ${args["source-sha256"]}, got ${actualZipHash}.`);
}

const tempRoot = mkdtempSync(path.join(tmpdir(), "isitusa-county-equivalents-"));
try {
  execFileSync("unzip", ["-q", "-o", zipPath, "-d", tempRoot]);
  const filenames = readdirSync(tempRoot).sort();
  const shpName = filenames.find((name) => name.endsWith(".shp"));
  const dbfName = filenames.find((name) => name.endsWith(".dbf"));
  if (!shpName || !dbfName) fail("Source ZIP lacks a shapefile or DBF table.");

  const source = await open(path.join(tempRoot, shpName), path.join(tempRoot, dbfName), {
    encoding: "utf-8",
  });
  const features = [];
  const countyEquivalents = [];
  while (true) {
    const result = await source.read();
    if (result.done) break;
    const properties = result.value.properties ?? {};
    const countyFips = String(properties.GEOID ?? "");
    const stateFips = String(properties.STATEFP ?? "");
    const stateCode = String(properties.STUSPS ?? "");
    const stateName = String(properties.STATE_NAME ?? "");
    const name = String(properties.NAME ?? "");
    const legalName = String(properties.NAMELSAD ?? "");
    const legalStatisticalAreaCode = String(properties.LSAD ?? "");
    if (
      !/^\d{5}$/.test(countyFips) ||
      !/^\d{2}$/.test(stateFips) ||
      !/^[A-Z]{2}$/.test(stateCode) ||
      !stateName ||
      !name ||
      !legalName
    ) {
      fail(`Invalid Census county-equivalent record ${JSON.stringify(properties)}.`);
    }
    const kind = countyEquivalentKind(legalStatisticalAreaCode, countyFips);
    features.push({
      type: "Feature",
      id: countyFips,
      properties: {
        name,
        legalName,
        stateFips,
        stateCode,
        kind,
        legalStatisticalAreaCode,
      },
      geometry: result.value.geometry,
    });
    countyEquivalents.push({
      countyFips,
      stateFips,
      stateCode,
      stateName,
      shortName: name,
      legalName,
      kind,
      legalStatisticalAreaCode,
      censusNamespaceId: String(properties.COUNTYNS ?? ""),
      status: "active",
      validFrom: args["source-as-of"],
      validThrough: null,
      aliases: [...new Set([name, legalName])].sort(),
      sourceAliases: {},
      predecessorFips: ["02063", "02066"].includes(countyFips) ? ["02261"] : [],
      successorFips: [],
      topologyId: countyFips,
      coordinateDerivationAllowed: false,
    });
  }

  features.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  countyEquivalents.sort((left, right) => left.countyFips.localeCompare(right.countyFips));
  const duplicateIds = features
    .filter((feature, index) => index > 0 && feature.id === features[index - 1].id)
    .map((feature) => feature.id);
  if (duplicateIds.length > 0) fail(`Duplicate county FIPS values: ${duplicateIds.join(", ")}.`);

  const topologyValue = topology(
    {
      counties: {
        type: "FeatureCollection",
        features,
      },
    },
    100000,
  );
  topologyValue.metadata = {
    schemaVersion: 2,
    source: "United States Census Bureau cartographic boundary counties",
    sourceUrl: args["source-url"],
    sourceAsOf: args["source-as-of"],
    sourceSha256: actualZipHash,
    countyEquivalentCount: features.length,
  };

  const outputPath = path.join(ROOT, "src/data/source/county-equivalents-topology.json");
  const topologyJson = `${stableStringify(topologyValue)}\n`;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, topologyJson);

  const stateCounts = Object.fromEntries(
    [...new Set(features.map((feature) => feature.properties.stateFips))]
      .sort()
      .map((stateFips) => [
        stateFips,
        features.filter((feature) => feature.properties.stateFips === stateFips).length,
      ]),
  );
  const registrySource = {
    publisher: "United States Census Bureau",
    dataset: "2025 cartographic boundary counties",
    sourceUrl: args["source-url"],
    sourceAsOf: args["source-as-of"],
    sourceSha256: actualZipHash,
  };
  const countyRegistryPath = path.join(
    ROOT,
    "src/data/research/county-equivalent-registry.json",
  );
  const retiredConnecticutCounties = [
    ["09001", "Fairfield"],
    ["09003", "Hartford"],
    ["09005", "Litchfield"],
    ["09007", "Middlesex"],
    ["09009", "New Haven"],
    ["09011", "New London"],
    ["09013", "Tolland"],
    ["09015", "Windham"],
  ].map(([countyFips, shortName]) => ({
    countyFips,
    stateFips: "09",
    stateCode: "CT",
    stateName: "Connecticut",
    shortName,
    legalName: `${shortName} County`,
    kind: "county",
    status: "retired",
    retiredForCensusProductsAsOf: "2022-01-01",
    successorFips: [],
    automaticResolutionAllowed: false,
    requiresAuthoritativeCrosswalk: true,
    sourceUrl:
      "https://www.census.gov/programs-surveys/acs/technical-documentation/user-notes/2023-01.html",
  }));
  const countyRegistry = {
    schemaVersion: 1,
    source: registrySource,
    geographyPolicy: {
      authority: "census-county-or-county-equivalent",
      exactFipsPreferred: true,
      exactNameOrRegisteredAliasRequiredWhenFipsMissing: true,
      ambiguousAliasRejected: true,
      coordinateDerivationAllowed: false,
      retiredGeographyAutomaticSuccessorAssignmentAllowed: false,
    },
    activeCountyEquivalentCount: countyEquivalents.length,
    countyEquivalents,
    retiredCountyEquivalents: [
      {
        countyFips: "02261",
        stateFips: "02",
        stateCode: "AK",
        stateName: "Alaska",
        shortName: "Valdez-Cordova",
        legalName: "Valdez-Cordova Census Area",
        kind: "census-area",
        status: "retired",
        validThrough: "2019-01-01",
        successorFips: ["02063", "02066"],
        automaticResolutionAllowed: false,
        sourceUrl:
          "https://www.census.gov/programs-surveys/geography/technical-documentation/county-changes/2010.html",
      },
      ...retiredConnecticutCounties,
    ],
  };
  const countyRegistryJson = `${JSON.stringify(countyRegistry, null, 2)}\n`;
  writeFileSync(countyRegistryPath, countyRegistryJson);

  const jurisdictionGroups = new Map();
  for (const county of countyEquivalents) {
    const current = jurisdictionGroups.get(county.stateCode) ?? {
      stateCode: county.stateCode,
      stateFips: county.stateFips,
      stateName: county.stateName,
      countyEquivalentCount: 0,
    };
    current.countyEquivalentCount += 1;
    jurisdictionGroups.set(county.stateCode, current);
  }
  const territoryCodes = new Set(["AS", "GU", "MP", "PR", "VI"]);
  const inScopeJurisdictions = [...jurisdictionGroups.values()]
    .filter((entry) => !territoryCodes.has(entry.stateCode))
    .sort(
      (left, right) =>
        left.stateName.localeCompare(right.stateName) ||
        left.stateCode.localeCompare(right.stateCode),
    );
  const certificationOrderByCode = new Map(
    inScopeJurisdictions.map((entry, index) => [entry.stateCode, index + 1]),
  );
  const jurisdictions = [...jurisdictionGroups.values()]
    .sort((left, right) => left.stateCode.localeCompare(right.stateCode))
    .map((entry) => ({
      ...entry,
      jurisdictionKind:
        entry.stateCode === "DC"
          ? "federal-district"
          : territoryCodes.has(entry.stateCode)
            ? "territory"
            : "state",
      nationalV1Scope: !territoryCodes.has(entry.stateCode),
      certificationOrder: certificationOrderByCode.get(entry.stateCode) ?? null,
      countyEquivalentLabel: countyEquivalentLabel(entry.stateCode),
      sourceStateNames: {
        gbif: entry.stateName,
        idigbio: entry.stateName.toLowerCase(),
      },
    }));
  const stateRegistryPath = path.join(ROOT, "src/data/research/state-registry.json");
  const stateRegistry = {
    schemaVersion: 1,
    source: registrySource,
    nationalV1: {
      stateCount: jurisdictions.filter((entry) => entry.jurisdictionKind === "state").length,
      federalDistrictCount: jurisdictions.filter(
        (entry) => entry.jurisdictionKind === "federal-district",
      ).length,
      jurisdictionCount: inScopeJurisdictions.length,
      countyEquivalentCount: inScopeJurisdictions.reduce(
        (sum, entry) => sum + entry.countyEquivalentCount,
        0,
      ),
      certificationOrder: inScopeJurisdictions.map((entry) => entry.stateCode),
      activeCertificationStateCode: "AL",
      activeCertificationCohort: 1,
      nextCertificationCohort: 2,
      certificationCohorts: [
        { cohort: 1, stateCodes: ["AL", "AK", "AZ", "AR"] },
        { cohort: 2, stateCodes: ["CA", "CO", "CT", "DE"] },
        { cohort: 3, stateCodes: ["DC", "FL", "GA", "HI"] },
        { cohort: 4, stateCodes: ["ID", "IL", "IN", "IA"] },
        { cohort: 5, stateCodes: ["KS", "KY", "LA", "ME"] },
        { cohort: 6, stateCodes: ["MD", "MA", "MI", "MN"] },
        { cohort: 7, stateCodes: ["MS", "MO", "MT", "NE"] },
        { cohort: 8, stateCodes: ["NV", "NH", "NJ", "NM"] },
        { cohort: 9, stateCodes: ["NY", "NC", "ND", "OH"] },
        { cohort: 10, stateCodes: ["OK", "OR", "PA", "RI"] },
        { cohort: 11, stateCodes: ["SC", "SD", "TN", "TX"] },
        { cohort: 12, stateCodes: ["UT", "VT", "VA", "WA"] },
        { cohort: 13, stateCodes: ["WV", "WI", "WY"] },
      ],
      pilotStateCodes: ["AK", "AZ", "AR"],
    },
    jurisdictions,
  };
  const stateRegistryJson = `${JSON.stringify(stateRegistry, null, 2)}\n`;
  writeFileSync(stateRegistryPath, stateRegistryJson);

  const receipt = {
    schemaVersion: 1,
    source: "United States Census Bureau cartographic boundary counties",
    sourceUrl: args["source-url"],
    sourceAsOf: args["source-as-of"],
    retrievedAt: args["retrieved-at"],
    sourceArtifact: {
      filename: path.basename(zipPath),
      sha256: actualZipHash,
      bytes: zipBytes.length,
    },
    output: {
      path: path.relative(ROOT, outputPath).split(path.sep).join("/"),
      sha256: sha256(topologyJson),
      bytes: Buffer.byteLength(topologyJson),
      countyEquivalentCount: features.length,
      stateCounts,
      countyRegistry: {
        path: path.relative(ROOT, countyRegistryPath).split(path.sep).join("/"),
        sha256: sha256(countyRegistryJson),
        bytes: Buffer.byteLength(countyRegistryJson),
      },
      stateRegistry: {
        path: path.relative(ROOT, stateRegistryPath).split(path.sep).join("/"),
        sha256: sha256(stateRegistryJson),
        bytes: Buffer.byteLength(stateRegistryJson),
        nationalV1StateCount: stateRegistry.nationalV1.stateCount,
        nationalV1FederalDistrictCount: stateRegistry.nationalV1.federalDistrictCount,
        nationalV1CountyEquivalentCount: stateRegistry.nationalV1.countyEquivalentCount,
      },
    },
    command: [
      "node",
      "scripts/import-census-county-equivalents.mjs",
      "--zip",
      args.zip,
      "--source-url",
      args["source-url"],
      "--source-sha256",
      actualZipHash,
      "--source-as-of",
      args["source-as-of"],
      "--retrieved-at",
      args["retrieved-at"],
    ],
  };
  const receiptPath = path.join(
    ROOT,
    "src/data/source/county-equivalents-topology.receipt.json",
  );
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify(receipt.output, null, 2));
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
