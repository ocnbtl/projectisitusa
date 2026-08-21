import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

import countyTopology from "@/data/source/county-equivalents-topology.json";
import countyRegistry from "@/data/research/county-equivalent-registry.json";
import stateRegistry from "@/data/research/state-registry.json";

import { sha256, stableJson } from "./national-gbif-download";
import {
  buildUsfwsCoverage,
  chunkStableObjectIds,
  USFWS_EDNA_ITEM_ID,
  USFWS_EDNA_LAYER_URL,
  USFWS_EDNA_REQUIRED_FIELDS,
  USFWS_EDNA_TARGETS,
  validateUsfwsLayerContract,
  type JsonRecord,
  type PairStatus,
  type ResolvedCounty,
  type UsfwsEdnaRow,
  type UsfwsItemContractInput,
  type UsfwsLayerContractInput,
} from "./usfws-invasive-carp-edna-coverage";

const QAPP_2026_URL = "https://www.fws.gov/sites/default/files/documents/2026-04/edna-qapp-2026.pdf";
const DATA_SOP_2025_URL = "https://www.fws.gov/sites/default/files/documents/2025-03/data-management-sop-no-5.pdf";
const QAPP_2018_URL = "https://www.fws.gov/sites/default/files/documents/2024-03/qapp_2018_508-compliant_0.pdf";
const ITEM_URL = `https://www.arcgis.com/sharing/rest/content/items/${USFWS_EDNA_ITEM_ID}`;
const DEFAULT_ACQUISITION_ROOT = "src/data/research/national-acquisitions";
const DEFAULT_EVALUATION_PATH =
  "ops/national-research/evaluations/usfws-invasive-carp-edna-coverage-preflight-20260821-r1.json";
const DEFAULT_DB_PATH = ".cache/research/isitusa.sqlite";
const RATE_LIMIT_DELAY_MS = 250;
const MAX_ATTEMPTS = 3;
const QUERY_CHUNK_SIZE = 200;

class PermanentHttpError extends Error {}

type CountyFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { name?: string }
> & { id?: string | number };

type RequestReceipt = {
  requestIndex: number;
  role: string;
  method: "GET";
  url: string;
  status: number;
  retrievedAt: string;
  bytes: number;
  sha256: string;
  recordCount: number | null;
  attempts: number;
};

type FetchedBytes = {
  bytes: Buffer;
  receipt: RequestReceipt;
};

type ParsedArgs = {
  baselineSha: string;
  observedAt: string;
  acquisitionRoot: string;
  evaluationPath: string;
  databasePath: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asObject(value: unknown, label: string): JsonRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as JsonRecord;
}

function integer(value: unknown, label: string) {
  assert(typeof value === "number" && Number.isInteger(value), `${label} must be an integer.`);
  return value;
}

function canonicalText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

function relativePath(root: string, filepath: string) {
  return path.relative(root, filepath).replaceAll("\\", "/");
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function parseArgs(argv: string[]): ParsedArgs {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  for (const key of ["baseline-sha", "observed-at"]) {
    assert(values.has(key), `Missing --${key}.`);
  }
  assert(/^[a-f0-9]{40}$/u.test(values.get("baseline-sha")!), "--baseline-sha must be a full Git commit SHA.");
  const observedAt = values.get("observed-at")!;
  assert(new Date(observedAt).toISOString() === observedAt, "--observed-at must be an ISO timestamp.");
  return {
    baselineSha: values.get("baseline-sha")!,
    observedAt,
    acquisitionRoot: values.get("acquisition-root") ?? DEFAULT_ACQUISITION_ROOT,
    evaluationPath: values.get("evaluation") ?? DEFAULT_EVALUATION_PATH,
    databasePath: values.get("database") ?? DEFAULT_DB_PATH,
  };
}

async function fetchBytes(
  url: string,
  role: string,
  requestIndex: number,
  recordCount: number | null = null,
): Promise<FetchedBytes> {
  let lastStatus = 0;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "user-agent": "Project-Isitusa-USFWS-eDNA-coverage/1.0" },
      });
      lastStatus = response.status;
      if (response.ok) {
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
          bytes,
          receipt: {
            requestIndex,
            role,
            method: "GET",
            url,
            status: response.status,
            retrievedAt: new Date().toISOString(),
            bytes: bytes.length,
            sha256: sha256(bytes),
            recordCount,
            attempts: attempt,
          },
        };
      }
      if (response.status !== 429 && response.status < 500) {
        throw new PermanentHttpError(`${role} returned HTTP ${response.status}.`);
      }
      const retryAfter = Number(response.headers.get("retry-after") ?? "0");
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : attempt * 1_000);
    } catch (error) {
      if (error instanceof PermanentHttpError) throw error;
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(attempt * 1_000);
    }
  }
  throw new Error(`${role} failed after ${MAX_ATTEMPTS} attempts (last status ${lastStatus}).`, {
    cause: lastError,
  });
}

function parseJson(bytes: Buffer, label: string) {
  const value = JSON.parse(bytes.toString("utf8")) as unknown;
  const object = asObject(value, label);
  const providerError = object.error;
  assert(!providerError, `${label} contains an ArcGIS error: ${JSON.stringify(providerError)}.`);
  return object;
}

function layerMetadataUrl() {
  return `${USFWS_EDNA_LAYER_URL}?f=pjson`;
}

function itemMetadataUrl() {
  return `${ITEM_URL}?f=pjson`;
}

function itemDataUrl() {
  return `${ITEM_URL}/data?f=json`;
}

function objectIdsUrl() {
  const url = new URL(`${USFWS_EDNA_LAYER_URL}/query`);
  url.searchParams.set("where", "1=1");
  url.searchParams.set("returnIdsOnly", "true");
  url.searchParams.set("orderByFields", "OBJECTID ASC");
  url.searchParams.set("f", "json");
  return url.toString();
}

function chunkUrl(objectIds: readonly number[]) {
  const url = new URL(`${USFWS_EDNA_LAYER_URL}/query`);
  url.searchParams.set("objectIds", objectIds.join(","));
  url.searchParams.set("outFields", USFWS_EDNA_REQUIRED_FIELDS.join(","));
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("orderByFields", "OBJECTID ASC");
  url.searchParams.set("f", "json");
  return url.toString();
}

function normalizedLayerMetadata(metadata: JsonRecord) {
  return {
    serviceItemId: metadata.serviceItemId,
    id: metadata.id,
    name: metadata.name,
    currentVersion: metadata.currentVersion,
    objectIdField: metadata.objectIdField,
    maxRecordCount: metadata.maxRecordCount,
    editingInfo: metadata.editingInfo,
    fields: metadata.fields,
    capabilities: metadata.capabilities,
    advancedQueryCapabilities: metadata.advancedQueryCapabilities,
    extent: metadata.extent,
    spatialReference: metadata.spatialReference,
  };
}

function normalizedItemMetadata(item: JsonRecord) {
  return {
    id: item.id,
    owner: item.owner,
    title: item.title,
    type: item.type,
    created: item.created,
    modified: item.modified,
    url: item.url,
    access: item.access,
    description: item.description,
    snippet: item.snippet,
    licenseInfo: item.licenseInfo,
    tags: item.tags,
  };
}

function metadataVersion(metadata: JsonRecord) {
  const editingInfo = asObject(metadata.editingInfo, "USFWS editingInfo");
  return {
    lastEditDate: integer(editingInfo.lastEditDate, "USFWS lastEditDate"),
    schemaLastEditDate: integer(editingInfo.schemaLastEditDate, "USFWS schemaLastEditDate"),
    dataLastEditDate: integer(editingInfo.dataLastEditDate, "USFWS dataLastEditDate"),
  };
}

function parseObjectIds(value: JsonRecord) {
  assert(value.objectIdFieldName === "OBJECTID", "USFWS ID response field changed.");
  assert(Array.isArray(value.objectIds), "USFWS ID response lacks objectIds.");
  return value.objectIds.map((entry, index) => integer(entry, `USFWS objectIds[${index}]`));
}

function parseRow(value: unknown, label: string): UsfwsEdnaRow {
  const featureObject = asObject(value, label);
  const attributes = asObject(featureObject.attributes, `${label}.attributes`);
  return {
    OBJECTID: integer(attributes.OBJECTID, `${label}.OBJECTID`),
    RUID: typeof attributes.RUID === "number" ? attributes.RUID : null,
    FWCO_ID: typeof attributes.FWCO_ID === "string" ? attributes.FWCO_ID : null,
    State: typeof attributes.State === "string" ? attributes.State : null,
    Basin: typeof attributes.Basin === "string" ? attributes.Basin : null,
    Waterbody: typeof attributes.Waterbody === "string" ? attributes.Waterbody : null,
    DATE_COLL: typeof attributes.DATE_COLL === "number" ? attributes.DATE_COLL : null,
    Latitude: typeof attributes.Latitude === "number" ? attributes.Latitude : null,
    Longitude: typeof attributes.Longitude === "number" ? attributes.Longitude : null,
    Double_Sample: typeof attributes.Double_Sample === "string" ? attributes.Double_Sample : null,
    Blank: typeof attributes.Blank === "string" ? attributes.Blank : null,
    GlobalID: typeof attributes.GlobalID === "string" ? attributes.GlobalID : null,
    COMMENTS: typeof attributes.COMMENTS === "string" ? attributes.COMMENTS : null,
    eDNA_Detection_Status: typeof attributes.eDNA_Detection_Status === "string" ? attributes.eDNA_Detection_Status : null,
    Case_Number: typeof attributes.Case_Number === "number" ? attributes.Case_Number : null,
    altLocationName: typeof attributes.altLocationName === "string" ? attributes.altLocationName : null,
  };
}

export function countyResolver() {
  const collection = feature(
    countyTopology as never,
    countyTopology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    { name?: string }
  >;
  const countyByFips = new Map(
    countyRegistry.countyEquivalents.map((entry) => [entry.countyFips, entry]),
  );
  const stateFipsByCode = new Map(
    stateRegistry.jurisdictions
      .filter((entry) => entry.nationalV1Scope)
      .map((entry) => [entry.stateCode, entry.stateFips]),
  );
  const featuresByStateFips = new Map<string, CountyFeature[]>();
  for (const rawFeature of collection.features as CountyFeature[]) {
    const countyFips = String(rawFeature.id).padStart(5, "0");
    if (!countyByFips.has(countyFips)) continue;
    const stateFips = countyFips.slice(0, 2);
    const values = featuresByStateFips.get(stateFips) ?? [];
    values.push(rawFeature);
    featuresByStateFips.set(stateFips, values);
  }
  return (longitude: number, latitude: number, stateCode: string): ResolvedCounty[] => {
    const stateFips = stateFipsByCode.get(stateCode);
    if (!stateFips) return [];
    return (featuresByStateFips.get(stateFips) ?? []).filter((county) =>
      geoContains(county, [longitude, latitude]),
    ).map((county) => {
      const countyFips = String(county.id).padStart(5, "0");
      const registryEntry = countyByFips.get(countyFips)!;
      return {
        stateCode: registryEntry.stateCode,
        countyFips,
        countyName: registryEntry.shortName,
      };
    });
  };
}

function loadPairStatuses(databasePath: string) {
  assert(existsSync(databasePath), `Research index not found at ${databasePath}.`);
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const targetIds = USFWS_EDNA_TARGETS.map((entry) => entry.speciesId);
    const rows = database.prepare(`
      SELECT
        state_code AS stateCode,
        county_fips AS countyFips,
        species_id AS speciesId,
        display_status AS displayStatus,
        determination_status AS determinationStatus,
        survey_status AS surveyStatus,
        research_status AS researchStatus,
        evidence_count AS evidenceCount
      FROM pair_status
      WHERE species_id IN (?, ?)
      ORDER BY county_fips, species_id
    `).all(...targetIds) as unknown as PairStatus[];
    const coverageRows = database.prepare(`
      SELECT state_code AS stateCode, metric, value, as_of AS asOf, generated_at AS generatedAt
      FROM coverage_metrics
      WHERE metric IN ('fullCountySpeciesDenominator', 'notResearched')
      ORDER BY state_code, metric
    `).all() as Array<{ stateCode: string; metric: string; value: number; asOf: string; generatedAt: string }>;
    const nationalStateCodes = new Set(
      stateRegistry.jurisdictions
        .filter((entry) => entry.nationalV1Scope)
        .map((entry) => entry.stateCode),
    );
    const nationalCountyCount = countyRegistry.countyEquivalents.filter((entry) =>
      nationalStateCodes.has(entry.stateCode)
    ).length;
    const expectedTargetPairs = nationalCountyCount * targetIds.length;
    assert(
      rows.length === expectedTargetPairs,
      `Research index returned ${rows.length} target pairs instead of ${expectedTargetPairs}.`,
    );
    return {
      pairStatusByKey: new Map(rows.map((entry) => [`${entry.countyFips}:${entry.speciesId}`, entry])),
      rowCount: rows.length,
      coverageRows,
    };
  } finally {
    database.close();
  }
}

function artifact(pathValue: string, bytes: Buffer, mediaType: string, role: string, recordCount: number | null) {
  return {
    path: pathValue,
    sha256: sha256(bytes),
    bytes: bytes.length,
    mediaType,
    role,
    recordCount,
  };
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  const acquisitionRoot = path.resolve(root, args.acquisitionRoot);
  const evaluationPath = path.resolve(root, args.evaluationPath);
  const databasePath = path.resolve(root, args.databasePath);
  assert(!existsSync(evaluationPath), `USFWS evaluation already exists at ${relativePath(root, evaluationPath)}.`);

  const requests: RequestReceipt[] = [];
  let requestIndex = 0;
  const fetchTracked = async (url: string, role: string, recordCount: number | null = null) => {
    const result = await fetchBytes(url, role, requestIndex, recordCount);
    requests.push(result.receipt);
    requestIndex += 1;
    return result.bytes;
  };

  const layerBeforeBytes = await fetchTracked(layerMetadataUrl(), "layer-metadata-before", 1);
  const itemBeforeBytes = await fetchTracked(itemMetadataUrl(), "item-metadata-before", 1);
  const itemDataBytes = await fetchTracked(itemDataUrl(), "item-data", 1);
  const layerBefore = parseJson(layerBeforeBytes, "USFWS layer metadata before");
  const itemBefore = parseJson(itemBeforeBytes, "USFWS item metadata before");
  const itemData = parseJson(itemDataBytes, "USFWS item data");
  const contract = validateUsfwsLayerContract(
    layerBefore as UsfwsLayerContractInput,
    itemBefore as UsfwsItemContractInput,
  );
  const versionBefore = metadataVersion(layerBefore);

  const idsBeforeBytes = await fetchTracked(objectIdsUrl(), "object-ids-before");
  const idsBefore = parseObjectIds(parseJson(idsBeforeBytes, "USFWS object IDs before"));
  const chunks = chunkStableObjectIds(
    idsBefore,
    Math.min(contract.maximumChunkSize as number, QUERY_CHUNK_SIZE),
  );
  const rows: UsfwsEdnaRow[] = [];
  const chunkReceipts: Array<{
    chunkIndex: number;
    firstObjectId: number;
    lastObjectId: number;
    requestedObjectIds: number;
    objectIdsSha256: string;
    responseSha256: string;
    responseBytes: number;
  }> = [];

  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index]!;
    const responseBytes = await fetchTracked(chunkUrl(chunk), `records-chunk-${String(index).padStart(3, "0")}`, chunk.length);
    const response = parseJson(responseBytes, `USFWS records chunk ${index}`);
    assert(Array.isArray(response.features), `USFWS records chunk ${index} lacks features.`);
    assert(response.exceededTransferLimit !== true, `USFWS records chunk ${index} exceeded the transfer limit.`);
    const chunkRows = response.features.map((entry, rowIndex) => parseRow(entry, `USFWS chunk ${index} row ${rowIndex}`));
    const returnedIds = chunkRows.map((entry) => entry.OBJECTID).sort((left, right) => left - right);
    assert(stableJson(returnedIds) === stableJson(chunk), `USFWS records chunk ${index} did not return its exact object-ID set.`);
    rows.push(...chunkRows);
    chunkReceipts.push({
      chunkIndex: index,
      firstObjectId: chunk[0]!,
      lastObjectId: chunk.at(-1)!,
      requestedObjectIds: chunk.length,
      objectIdsSha256: sha256(`${chunk.join("\n")}\n`),
      responseSha256: sha256(responseBytes),
      responseBytes: responseBytes.length,
    });
    if (index < chunks.length - 1) await sleep(RATE_LIMIT_DELAY_MS);
  }

  assert(rows.length === idsBefore.length, "USFWS record rows do not match the pinned object-ID count.");
  const sortedRows = [...rows].sort((left, right) => left.OBJECTID - right.OBJECTID);
  assert(new Set(sortedRows.map((entry) => entry.OBJECTID)).size === sortedRows.length, "USFWS record rows contain duplicate object IDs.");

  const layerAfterBytes = await fetchTracked(layerMetadataUrl(), "layer-metadata-after", 1);
  const itemAfterBytes = await fetchTracked(itemMetadataUrl(), "item-metadata-after", 1);
  const idsAfterBytes = await fetchTracked(objectIdsUrl(), "object-ids-after");
  const layerAfter = parseJson(layerAfterBytes, "USFWS layer metadata after");
  const itemAfter = parseJson(itemAfterBytes, "USFWS item metadata after");
  const idsAfter = parseObjectIds(parseJson(idsAfterBytes, "USFWS object IDs after"));
  const versionAfter = metadataVersion(layerAfter);
  assert(stableJson(versionAfter) === stableJson(versionBefore), "USFWS layer changed during acquisition.");
  assert(itemAfter.modified === itemBefore.modified, "USFWS item metadata changed during acquisition.");
  assert(stableJson(idsAfter) === stableJson(idsBefore), "USFWS object-ID set changed during acquisition.");

  const qapp2026Bytes = await fetchTracked(QAPP_2026_URL, "qapp-2026", null);
  const dataSop2025Bytes = await fetchTracked(DATA_SOP_2025_URL, "data-management-sop-2025", null);
  const qapp2018Bytes = await fetchTracked(QAPP_2018_URL, "qapp-2018", null);

  const pairStatuses = loadPairStatuses(databasePath);
  const coverage = buildUsfwsCoverage(sortedRows, {
    resolveCounty: countyResolver(),
    pairStatusByKey: pairStatuses.pairStatusByKey,
  });

  const recordsNdjson = Buffer.from(`${sortedRows.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  const recordsGzip = gzipSync(recordsNdjson, { level: 9 });
  const objectIdsJson = Buffer.from(stableJson(idsBefore));
  const objectIdsGzip = gzipSync(objectIdsJson, { level: 9 });
  const layerBeforeNormalized = Buffer.from(stableJson(normalizedLayerMetadata(layerBefore)));
  const layerAfterNormalized = Buffer.from(stableJson(normalizedLayerMetadata(layerAfter)));
  const itemBeforeNormalized = Buffer.from(stableJson(normalizedItemMetadata(itemBefore)));
  const itemAfterNormalized = Buffer.from(stableJson(normalizedItemMetadata(itemAfter)));
  const itemDataNormalized = Buffer.from(stableJson(itemData));
  const coverageBytes = Buffer.from(stableJson(coverage));
  const contentIdentity = createHash("sha256")
    .update(recordsGzip)
    .update(objectIdsGzip)
    .update(layerBeforeNormalized)
    .update(itemBeforeNormalized)
    .update(qapp2026Bytes)
    .update(dataSop2025Bytes)
    .update(qapp2018Bytes)
    .digest("hex");
  const acquisitionId = `${args.observedAt.replaceAll(/[-:.]/gu, "").slice(0, 15).toLowerCase()}__usfws-invasive-carp-edna__${contentIdentity.slice(0, 12)}`;
  const acquisitionDirectory = path.join(acquisitionRoot, acquisitionId);
  assert(!existsSync(acquisitionDirectory), `USFWS acquisition ${acquisitionId} already exists.`);
  const artifactDirectory = path.join(acquisitionDirectory, "artifacts");
  mkdirSync(artifactDirectory, { recursive: true });

  const artifacts = [
    artifact("artifacts/layer-metadata-before.json", layerBeforeNormalized, "application/json", "layer-metadata-before", 1),
    artifact("artifacts/layer-metadata-after.json", layerAfterNormalized, "application/json", "layer-metadata-after", 1),
    artifact("artifacts/item-metadata-before.json", itemBeforeNormalized, "application/json", "item-metadata-before", 1),
    artifact("artifacts/item-metadata-after.json", itemAfterNormalized, "application/json", "item-metadata-after", 1),
    artifact("artifacts/item-data.json", itemDataNormalized, "application/json", "item-data", 1),
    artifact("artifacts/object-ids.json.gz", objectIdsGzip, "application/gzip", "object-id-set", idsBefore.length),
    artifact("artifacts/records.ndjson.gz", recordsGzip, "application/gzip", "source-records", sortedRows.length),
    artifact("artifacts/coverage.json", coverageBytes, "application/json", "coverage-projection", coverage.candidatePairs),
    artifact("artifacts/edna-qapp-2026.pdf", qapp2026Bytes, "application/pdf", "target-and-method-contract", null),
    artifact("artifacts/data-management-sop-no-5.pdf", dataSop2025Bytes, "application/pdf", "data-dictionary-contract", null),
    artifact("artifacts/qapp-2018.pdf", qapp2018Bytes, "application/pdf", "historical-method-contract", null),
  ];
  const artifactBytes = new Map<string, Buffer>([
    ["artifacts/layer-metadata-before.json", layerBeforeNormalized],
    ["artifacts/layer-metadata-after.json", layerAfterNormalized],
    ["artifacts/item-metadata-before.json", itemBeforeNormalized],
    ["artifacts/item-metadata-after.json", itemAfterNormalized],
    ["artifacts/item-data.json", itemDataNormalized],
    ["artifacts/object-ids.json.gz", objectIdsGzip],
    ["artifacts/records.ndjson.gz", recordsGzip],
    ["artifacts/coverage.json", coverageBytes],
    ["artifacts/edna-qapp-2026.pdf", qapp2026Bytes],
    ["artifacts/data-management-sop-no-5.pdf", dataSop2025Bytes],
    ["artifacts/qapp-2018.pdf", qapp2018Bytes],
  ]);
  for (const entry of artifacts) {
    writeFileSync(path.join(acquisitionDirectory, entry.path), artifactBytes.get(entry.path)!, { flag: "wx" });
  }

  const receipt = {
    schemaVersion: 1,
    acquisitionId,
    acquisition_id: acquisitionId,
    sourceId: "usfws-invasive-carp-edna",
    source_id: "usfws-invasive-carp-edna",
    status: "complete-provider-write-free-coverage-preflight",
    baselineSha: args.baselineSha,
    code_commit: args.baselineSha,
    observedAt: args.observedAt,
    finishedAt: new Date().toISOString(),
    sourceIdentity: {
      layerUrl: USFWS_EDNA_LAYER_URL,
      serviceItemId: USFWS_EDNA_ITEM_ID,
      layerName: layerBefore.name,
      owner: itemBefore.owner,
      itemModified: itemBefore.modified,
      layerVersion: versionBefore,
      maximumObjectId: idsBefore.at(-1),
      objectIdCount: idsBefore.length,
      objectIdSetSha256: sha256(objectIdsJson),
      retainedContentIdentitySha256: contentIdentity,
    },
    contract: {
      gate: "GO-FOR-COVERAGE-MEASUREMENT",
      targetCompleteness: "Both Bighead Carp and Silver Carp are explicit program targets. The retained data dictionary defines the negative label as no detections across the invasive-carp, Bighead, and Silver assays, while No detection data means unavailable data.",
      resultSemantics: "Only exact No eDNA detected rows with Blank=No are negative candidates. No detection data, positive labels, field blanks, missing values, and source silence are excluded.",
      historicalMethodBoundary: "The official item documents marker changes in 2014, cPCR to qPCR in 2015, filtration to centrifugation in 2015, and multiplex qPCR beginning in 2020. These are retained caveats and do not convert a sample non-detection into absence.",
      duplicateSemantics: "RUID is the sample primary key and GlobalID/OBJECTID are retained source identities. Duplicate identities are rejected. The undocumented Double_Sample view field is reported but is not used to infer identity or effort.",
      geographySemantics: "Coordinates are resolved against the committed current Census county-equivalent topology for provider-write-free coverage measurement. Ambiguous, offshore, invalid, multi-county, and source-state-mismatch rows are rejected. The current research assertion validator still blocks coordinate-derived county publication; this acquisition creates no assertions.",
      positiveSemantics: "Positive eDNA rows are retained in the archive but excluded from negative candidates and never promoted to verified presence.",
      sources: [
        { url: QAPP_2026_URL, role: "current-program-target-and-method-contract", sha256: sha256(qapp2026Bytes) },
        { url: DATA_SOP_2025_URL, role: "result-data-dictionary-and-sample-identity-contract", sha256: sha256(dataSop2025Bytes) },
        { url: QAPP_2018_URL, role: "historical-silver-and-bighead-result-contract", sha256: sha256(qapp2018Bytes) },
      ],
    },
    deterministicAcquisition: {
      strategy: "Complete object-ID set pinned before fetch; ascending IDs fetched in fixed chunks; exact returned IDs validated; layer version, item modified time, and complete object-ID set rechecked after fetch.",
      serviceMaximumRecordCount: contract.maximumChunkSize,
      requestChunkSize: QUERY_CHUNK_SIZE,
      chunks: chunkReceipts,
      stableWindow: true,
      rateLimitDelayMilliseconds: RATE_LIMIT_DELAY_MS,
      maximumAttempts: MAX_ATTEMPTS,
    },
    researchIndex: {
      path: relativePath(root, databasePath),
      targetPairRows: pairStatuses.rowCount,
      coverageRows: pairStatuses.coverageRows,
    },
    coverage: {
      rawRows: coverage.rawRows,
      explicitNegativeRows: coverage.explicitNegativeRows,
      acceptedSamples: coverage.acceptedSamples,
      statesCovered: coverage.statesCovered,
      countiesCovered: coverage.countiesCovered,
      candidatePairs: coverage.candidatePairs,
      netNewPairs: coverage.netNewPairs,
      researchedUnresolvedPairs: coverage.researchedUnresolvedPairs,
      alreadyNotDetectedPairs: coverage.alreadyNotDetectedPairs,
      verifiedPresentOverlaps: coverage.verifiedPresentOverlaps,
      blockedPairs: coverage.blockedPairs,
      duplicateRows: coverage.duplicateRows,
      rejectedRows: coverage.rejectedRows,
      rejectionReasons: coverage.rejectionReasons,
      statusCounts: coverage.statusCounts,
    },
    artifacts,
    requests,
    operations: {
      providerGets: requests.length,
      providerPosts: 0,
      assertionsCreated: 0,
      reviewsCreated: 0,
      outcomesCreated: 0,
      generationCommands: 0,
      publicationMutations: 0,
      r2Mutations: 0,
    },
    rerunCommand: `& 'C:\\Code\\tools\\node-v22.23.2-win-x64\\node.exe' --import tsx scripts/research/run-usfws-invasive-carp-edna-coverage.ts --baseline-sha '${args.baselineSha}' --observed-at '${args.observedAt}'`,
  };
  const receiptBytes = Buffer.from(stableJson(receipt));
  writeFileSync(path.join(acquisitionDirectory, "receipt.json"), receiptBytes, { flag: "wx" });
  const evaluation = {
    schemaVersion: 1,
    evaluationId: path.basename(evaluationPath, ".json"),
    evaluatedAt: receipt.finishedAt,
    baselineSha: args.baselineSha,
    objective: "Measure complete provider-write-free county-species overlap for the official USFWS Bighead and Silver Carp eDNA layer without converting survey non-detection into absence.",
    acquisition: {
      acquisitionId,
      receiptPath: relativePath(root, path.join(acquisitionDirectory, "receipt.json")),
      receiptSha256: sha256(receiptBytes),
      contentIdentitySha256: contentIdentity,
    },
    sourceIdentity: receipt.sourceIdentity,
    contract: receipt.contract,
    coverage,
    sourceExhaustion: {
      exactInspectedObjectIdRange: [idsBefore[0], idsBefore.at(-1)],
      exactObjectIdSetSha256: sha256(objectIdsJson),
      currentOverlapExhausted: coverage.netNewPairs === 0 && coverage.researchedUnresolvedPairs === 0,
      integrationGate: coverage.netNewPairs + coverage.researchedUnresolvedPairs > 0
        ? "BLOCKED-PENDING-SOURCE-SPECIFIC-COORDINATE-GEOGRAPHY-CONTRACT"
        : "NO-GO-SOURCE-EXHAUSTED-FOR-CURRENT-OVERLAP",
      reason: coverage.netNewPairs + coverage.researchedUnresolvedPairs > 0
        ? "The source has qualifying pair overlap, but the current county registry and immutable-run validator explicitly prohibit coordinate-derived county assertions. Coverage measurement is complete; evidence integration requires a narrow reviewed source-specific geography contract without changing the global default."
        : "The stable complete source snapshot contains no net-new or researched-unresolved pair overlap.",
    },
    operations: receipt.operations,
    checks: {
      targetContractPassed: contract.passed,
      stableLayerVersion: stableJson(versionBefore) === stableJson(versionAfter),
      stableItemVersion: itemBefore.modified === itemAfter.modified,
      stableObjectIdSet: stableJson(idsBefore) === stableJson(idsAfter),
      rowCountConserved: coverage.acceptedSamples + coverage.rejectedRows === coverage.rawRows,
      pairClassesConserved: coverage.netNewPairs + coverage.researchedUnresolvedPairs + coverage.alreadyNotDetectedPairs + coverage.verifiedPresentOverlaps + coverage.blockedPairs === coverage.candidatePairs,
      providerPostsZero: true,
      evidenceMutationsZero: true,
      generationMutationsZero: true,
      publicationMutationsZero: true,
      r2MutationsZero: true,
    },
  };
  assert(Object.values(evaluation.checks).every(Boolean), "USFWS coverage evaluation checks did not all pass.");
  mkdirSync(path.dirname(evaluationPath), { recursive: true });
  const evaluationBytes = Buffer.from(stableJson(evaluation));
  writeFileSync(evaluationPath, evaluationBytes, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    acquisitionId,
    acquisitionReceipt: relativePath(root, path.join(acquisitionDirectory, "receipt.json")),
    evaluationPath: relativePath(root, evaluationPath),
    evaluationSha256: sha256(evaluationBytes),
    providerGets: requests.length,
    providerPosts: 0,
    coverage: receipt.coverage,
    integrationGate: evaluation.sourceExhaustion.integrationGate,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main();
}
