import { createHash } from "node:crypto";

export const USFWS_EDNA_LAYER_URL =
  "https://services.arcgis.com/QVENGdaPbd4LUkLV/arcgis/rest/services/USFWS_Great_Lakes_Region_3_Bighead_and_Silver_Carp_eDNA_Data_Feature_Layer_View/FeatureServer/0";
export const USFWS_EDNA_ITEM_ID = "7c6e731513654696abc4814e3eec669d";
export const USFWS_EDNA_NEGATIVE_STATUS = "No eDNA detected";
export const USFWS_EDNA_UNKNOWN_STATUS = "No detection data";
export const USFWS_EDNA_TARGETS = [
  {
    speciesId: "hypophthalmichthys-nobilis",
    scientificName: "Hypophthalmichthys nobilis",
    commonName: "Bighead Carp",
  },
  {
    speciesId: "hypophthalmichthys-molitrix",
    scientificName: "Hypophthalmichthys molitrix",
    commonName: "Silver Carp",
  },
] as const;

export const USFWS_EDNA_REQUIRED_FIELDS = [
  "OBJECTID",
  "RUID",
  "FWCO_ID",
  "State",
  "Basin",
  "Waterbody",
  "DATE_COLL",
  "Latitude",
  "Longitude",
  "Double_Sample",
  "Blank",
  "GlobalID",
  "COMMENTS",
  "eDNA_Detection_Status",
  "Case_Number",
  "altLocationName",
] as const;

export type JsonRecord = Record<string, unknown>;

export type UsfwsEdnaRow = {
  OBJECTID: number;
  RUID: number | null;
  FWCO_ID: string | null;
  State: string | null;
  Basin: string | null;
  Waterbody: string | null;
  DATE_COLL: number | null;
  Latitude: number | null;
  Longitude: number | null;
  Double_Sample: string | null;
  Blank: string | null;
  GlobalID: string | null;
  COMMENTS: string | null;
  eDNA_Detection_Status: string | null;
  Case_Number: number | null;
  altLocationName: string | null;
};

export type ResolvedCounty = {
  stateCode: string;
  countyFips: string;
  countyName: string;
};

export type PairStatus = {
  stateCode: string;
  countyFips: string;
  speciesId: string;
  displayStatus: string;
  determinationStatus: string;
  surveyStatus: string;
  researchStatus: string;
  evidenceCount: number;
};

export type CoveragePairClassification =
  | "unresearched-net-new-candidate"
  | "researched-unresolved-candidate"
  | "already-not-detected"
  | "verified-present-overlap"
  | "blocked";

type RejectionReason =
  | "duplicate-source-identity"
  | "field-blank"
  | "invalid-collection-date"
  | "invalid-coordinates"
  | "invalid-source-identity"
  | "invalid-state"
  | "missing-detection-data"
  | "multiple-county-match"
  | "non-negative-result"
  | "offshore-or-outside-current-county"
  | "source-state-county-mismatch";

type AcceptedSample = {
  objectId: number;
  ruid: number;
  globalId: string;
  stateCode: string;
  countyFips: string;
  countyName: string;
  caseNumber: number;
  stationId: string;
  basin: string | null;
  waterbody: string;
  siteName: string | null;
  collectionDate: string;
  latitude: number;
  longitude: number;
  doubleSampleFlag: string | null;
  comments: string | null;
};

export type UsfwsCoverageGroup = {
  groupKey: string;
  pairKey: string;
  stateCode: string;
  countyFips: string;
  countyName: string;
  speciesId: string;
  scientificName: string;
  commonName: string;
  caseNumber: number;
  sampleCount: number;
  stationIds: string[];
  waterbodies: string[];
  basins: string[];
  sourceObjectIdMin: number;
  sourceObjectIdMax: number;
  sourceObjectIdsSha256: string;
  sourceRuidsSha256: string;
  sourceGlobalIdsSha256: string;
  collectionDateStart: string;
  collectionDateEnd: string;
  doubleSampleFlagRows: number;
  classification: CoveragePairClassification;
};

export type UsfwsCoveragePair = {
  pairKey: string;
  stateCode: string;
  countyFips: string;
  countyName: string;
  speciesId: string;
  scientificName: string;
  commonName: string;
  sampleCount: number;
  caseCount: number;
  groupKeys: string[];
  collectionDateStart: string;
  collectionDateEnd: string;
  classification: CoveragePairClassification;
  currentStatus: PairStatus;
};

export type UsfwsCoverageResult = {
  rawRows: number;
  explicitNegativeRows: number;
  acceptedSamples: number;
  rejectedRows: number;
  duplicateRows: number;
  statesCovered: string[];
  countiesCovered: number;
  candidatePairs: number;
  netNewPairs: number;
  researchedUnresolvedPairs: number;
  alreadyNotDetectedPairs: number;
  verifiedPresentOverlaps: number;
  blockedPairs: number;
  rejectionReasons: Record<RejectionReason, number>;
  statusCounts: Record<string, number>;
  groups: UsfwsCoverageGroup[];
  pairs: UsfwsCoveragePair[];
};

export type UsfwsLayerContractInput = {
  serviceItemId: unknown;
  name: unknown;
  objectIdField: unknown;
  maxRecordCount: unknown;
  fields: unknown;
  drawingInfo: unknown;
};

export type UsfwsItemContractInput = {
  id: unknown;
  owner: unknown;
  title: unknown;
  type: unknown;
  access: unknown;
  snippet: unknown;
  licenseInfo: unknown;
};

const STATE_NAME_TO_CODE = new Map<string, string>([
  ["alabama", "AL"],
  ["alaska", "AK"],
  ["arizona", "AZ"],
  ["arkansas", "AR"],
  ["california", "CA"],
  ["colorado", "CO"],
  ["connecticut", "CT"],
  ["delaware", "DE"],
  ["district of columbia", "DC"],
  ["florida", "FL"],
  ["georgia", "GA"],
  ["hawaii", "HI"],
  ["idaho", "ID"],
  ["illinois", "IL"],
  ["indiana", "IN"],
  ["iowa", "IA"],
  ["kansas", "KS"],
  ["kentucky", "KY"],
  ["louisiana", "LA"],
  ["maine", "ME"],
  ["maryland", "MD"],
  ["massachusetts", "MA"],
  ["michigan", "MI"],
  ["minnesota", "MN"],
  ["mississippi", "MS"],
  ["missouri", "MO"],
  ["montana", "MT"],
  ["nebraska", "NE"],
  ["nevada", "NV"],
  ["new hampshire", "NH"],
  ["new jersey", "NJ"],
  ["new mexico", "NM"],
  ["new york", "NY"],
  ["north carolina", "NC"],
  ["north dakota", "ND"],
  ["ohio", "OH"],
  ["oklahoma", "OK"],
  ["oregon", "OR"],
  ["pennsylvania", "PA"],
  ["rhode island", "RI"],
  ["south carolina", "SC"],
  ["south dakota", "SD"],
  ["tennessee", "TN"],
  ["texas", "TX"],
  ["utah", "UT"],
  ["vermont", "VT"],
  ["virginia", "VA"],
  ["washington", "WA"],
  ["west virginia", "WV"],
  ["wisconsin", "WI"],
  ["wyoming", "WY"],
] as const);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function canonicalText(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

function increment<T extends string>(record: Record<T, number>, key: T) {
  record[key] = (record[key] ?? 0) + 1;
}

function sha256Lines(values: Array<string | number>) {
  return createHash("sha256").update(`${values.join("\n")}\n`).digest("hex");
}

function isoDateFromMilliseconds(value: number) {
  return new Date(value).toISOString().slice(0, 10);
}

function defaultPairStatus(
  stateCode: string,
  countyFips: string,
  speciesId: string,
): PairStatus {
  return {
    stateCode,
    countyFips,
    speciesId,
    displayStatus: "not-researched",
    determinationStatus: "none",
    surveyStatus: "unassessed",
    researchStatus: "not-started",
    evidenceCount: 0,
  };
}

function classifyPair(status: PairStatus): CoveragePairClassification {
  if (status.determinationStatus === "recorded-present" || status.displayStatus === "verified-present") {
    return "verified-present-overlap";
  }
  if (status.surveyStatus === "not-detected" || status.displayStatus === "not-detected") {
    return "already-not-detected";
  }
  if (status.researchStatus === "blocked") return "blocked";
  if (status.displayStatus === "not-researched" && status.researchStatus === "not-started") {
    return "unresearched-net-new-candidate";
  }
  return "researched-unresolved-candidate";
}

export function normalizeUsfwsState(value: unknown) {
  const text = canonicalText(value);
  if (/^[A-Za-z]{2}$/u.test(text)) return text.toUpperCase();
  return STATE_NAME_TO_CODE.get(text.toLowerCase()) ?? null;
}

export function validateUsfwsLayerContract(
  layer: UsfwsLayerContractInput,
  item: UsfwsItemContractInput,
) {
  assert(layer.serviceItemId === USFWS_EDNA_ITEM_ID, "USFWS layer item ID changed.");
  assert(layer.name === "All_eDNA_Sample_Point_Data", "USFWS layer name changed.");
  assert(layer.objectIdField === "OBJECTID", "USFWS object ID field changed.");
  assert(
    typeof layer.maxRecordCount === "number" && layer.maxRecordCount > 0 && layer.maxRecordCount <= 1_000,
    "USFWS maximum record count is invalid or exceeds the frozen chunk ceiling.",
  );
  assert(Array.isArray(layer.fields), "USFWS layer fields are missing.");
  const fieldNames = new Set(layer.fields.map((value) => {
    assert(value && typeof value === "object" && !Array.isArray(value), "USFWS layer field is invalid.");
    return canonicalText((value as JsonRecord).name);
  }));
  for (const field of USFWS_EDNA_REQUIRED_FIELDS) {
    assert(fieldNames.has(field), `USFWS layer is missing ${field}.`);
  }
  assert(layer.drawingInfo && typeof layer.drawingInfo === "object" && !Array.isArray(layer.drawingInfo), "USFWS layer drawing info is missing.");
  const drawingInfo = layer.drawingInfo as JsonRecord;
  assert(drawingInfo.renderer && typeof drawingInfo.renderer === "object" && !Array.isArray(drawingInfo.renderer), "USFWS layer renderer is missing.");
  const renderer = drawingInfo.renderer as JsonRecord;
  assert(renderer.field1 === "eDNA_Detection_Status", "USFWS renderer status field changed.");
  assert(Array.isArray(renderer.uniqueValueInfos), "USFWS renderer status values are missing.");
  const rendererStatuses = new Set(renderer.uniqueValueInfos.map((value) => {
    assert(value && typeof value === "object" && !Array.isArray(value), "USFWS renderer status is invalid.");
    return canonicalText((value as JsonRecord).value);
  }));
  assert(rendererStatuses.has(USFWS_EDNA_NEGATIVE_STATUS), "USFWS layer no longer defines the negative label.");
  assert(rendererStatuses.has(USFWS_EDNA_UNKNOWN_STATUS), "USFWS layer no longer defines the unavailable-data label.");
  assert(item.id === USFWS_EDNA_ITEM_ID, "USFWS ArcGIS item ID changed.");
  assert(canonicalText(item.owner).endsWith("@fws.gov_fws"), "USFWS ArcGIS owner is not an FWS account.");
  assert(item.type === "Feature Service" && item.access === "public", "USFWS ArcGIS item access changed.");
  const itemText = `${canonicalText(item.title)} ${canonicalText(item.snippet)} ${canonicalText(item.licenseInfo)}`;
  assert(/Bighead and Silver Carp/iu.test(itemText), "USFWS item no longer names both target taxa.");
  assert(/2013 to present/iu.test(itemText), "USFWS item no longer declares the 2013-present scope.");
  assert(/changed in 2014/iu.test(itemText) && /changed from conventional PCR \(cPCR\) to quantitative PCR \(qPCR\)/iu.test(itemText), "USFWS method-change caveat changed.");
  return {
    passed: true as const,
    targetSpeciesIds: USFWS_EDNA_TARGETS.map((entry) => entry.speciesId),
    negativeStatus: USFWS_EDNA_NEGATIVE_STATUS,
    unknownStatus: USFWS_EDNA_UNKNOWN_STATUS,
    maximumChunkSize: layer.maxRecordCount,
  };
}

export function chunkStableObjectIds(objectIds: readonly number[], chunkSize: number) {
  assert(Number.isInteger(chunkSize) && chunkSize > 0 && chunkSize <= 1_000, "USFWS chunk size is invalid.");
  assert(objectIds.length > 0, "USFWS object ID set is empty.");
  const sorted = [...objectIds].sort((left, right) => left - right);
  assert(sorted.every((value) => Number.isInteger(value) && value > 0), "USFWS object IDs are invalid.");
  assert(new Set(sorted).size === sorted.length, "USFWS object ID set contains duplicates.");
  const chunks: number[][] = [];
  for (let index = 0; index < sorted.length; index += chunkSize) {
    chunks.push(sorted.slice(index, index + chunkSize));
  }
  assert(chunks.flat().length === sorted.length, "USFWS object ID chunks do not conserve the ID set.");
  return chunks;
}

export function buildUsfwsCoverage(
  rows: readonly UsfwsEdnaRow[],
  options: {
    resolveCounty: (longitude: number, latitude: number, stateCode: string) => ResolvedCounty[];
    pairStatusByKey: ReadonlyMap<string, PairStatus>;
  },
): UsfwsCoverageResult {
  const rejectionReasons: Record<RejectionReason, number> = {
    "duplicate-source-identity": 0,
    "field-blank": 0,
    "invalid-collection-date": 0,
    "invalid-coordinates": 0,
    "invalid-source-identity": 0,
    "invalid-state": 0,
    "missing-detection-data": 0,
    "multiple-county-match": 0,
    "non-negative-result": 0,
    "offshore-or-outside-current-county": 0,
    "source-state-county-mismatch": 0,
  };
  const statusCounts: Record<string, number> = {};
  const seenObjectIds = new Set<number>();
  const seenRuids = new Set<number>();
  const seenGlobalIds = new Set<string>();
  const accepted: AcceptedSample[] = [];
  let explicitNegativeRows = 0;
  let duplicateRows = 0;

  const orderedRows = [...rows].sort((left, right) => left.OBJECTID - right.OBJECTID);
  for (const row of orderedRows) {
    const status = canonicalText(row.eDNA_Detection_Status) || "<missing>";
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;
    if (status === USFWS_EDNA_UNKNOWN_STATUS || status === "<missing>") {
      increment(rejectionReasons, "missing-detection-data");
      continue;
    }
    if (status !== USFWS_EDNA_NEGATIVE_STATUS) {
      increment(rejectionReasons, "non-negative-result");
      continue;
    }
    explicitNegativeRows += 1;
    if (canonicalText(row.Blank).toLowerCase() !== "no") {
      increment(rejectionReasons, "field-blank");
      continue;
    }
    if (
      !Number.isInteger(row.OBJECTID) || row.OBJECTID <= 0 ||
      !Number.isInteger(row.RUID) || (row.RUID ?? 0) <= 0 ||
      canonicalText(row.GlobalID).length === 0 ||
      !Number.isInteger(row.Case_Number) || (row.Case_Number ?? 0) <= 0
    ) {
      increment(rejectionReasons, "invalid-source-identity");
      continue;
    }
    const normalizedGlobalId = canonicalText(row.GlobalID).toLowerCase();
    if (
      seenObjectIds.has(row.OBJECTID) ||
      seenRuids.has(row.RUID!) ||
      seenGlobalIds.has(normalizedGlobalId)
    ) {
      increment(rejectionReasons, "duplicate-source-identity");
      duplicateRows += 1;
      continue;
    }
    seenObjectIds.add(row.OBJECTID);
    seenRuids.add(row.RUID!);
    seenGlobalIds.add(normalizedGlobalId);
    const stateCode = normalizeUsfwsState(row.State);
    if (!stateCode) {
      increment(rejectionReasons, "invalid-state");
      continue;
    }
    if (
      typeof row.Latitude !== "number" || !Number.isFinite(row.Latitude) || row.Latitude < 18 || row.Latitude > 72 ||
      typeof row.Longitude !== "number" || !Number.isFinite(row.Longitude) || row.Longitude < -180 || row.Longitude > -60
    ) {
      increment(rejectionReasons, "invalid-coordinates");
      continue;
    }
    if (typeof row.DATE_COLL !== "number" || !Number.isFinite(row.DATE_COLL) || row.DATE_COLL <= 0) {
      increment(rejectionReasons, "invalid-collection-date");
      continue;
    }
    const countyMatches = options.resolveCounty(row.Longitude, row.Latitude, stateCode);
    if (countyMatches.length === 0) {
      increment(rejectionReasons, "offshore-or-outside-current-county");
      continue;
    }
    if (countyMatches.length > 1) {
      increment(rejectionReasons, "multiple-county-match");
      continue;
    }
    const county = countyMatches[0]!;
    if (county.stateCode !== stateCode) {
      increment(rejectionReasons, "source-state-county-mismatch");
      continue;
    }
    const stationId = canonicalText(row.FWCO_ID);
    const waterbody = canonicalText(row.Waterbody);
    if (!stationId || !waterbody) {
      increment(rejectionReasons, "invalid-source-identity");
      continue;
    }
    accepted.push({
      objectId: row.OBJECTID,
      ruid: row.RUID!,
      globalId: normalizedGlobalId,
      stateCode,
      countyFips: county.countyFips,
      countyName: county.countyName,
      caseNumber: row.Case_Number!,
      stationId,
      basin: canonicalText(row.Basin) || null,
      waterbody,
      siteName: canonicalText(row.altLocationName) || null,
      collectionDate: isoDateFromMilliseconds(row.DATE_COLL),
      latitude: row.Latitude,
      longitude: row.Longitude,
      doubleSampleFlag: canonicalText(row.Double_Sample) || null,
      comments: canonicalText(row.COMMENTS) || null,
    });
  }

  const mutableGroups = new Map<string, {
    target: typeof USFWS_EDNA_TARGETS[number];
    pairKey: string;
    stateCode: string;
    countyFips: string;
    countyName: string;
    caseNumber: number;
    samples: AcceptedSample[];
  }>();
  for (const sample of accepted) {
    for (const target of USFWS_EDNA_TARGETS) {
      const pairKey = `${sample.countyFips}:${target.speciesId}`;
      const groupKey = `${pairKey}:case-${sample.caseNumber}`;
      const group = mutableGroups.get(groupKey) ?? {
        target,
        pairKey,
        stateCode: sample.stateCode,
        countyFips: sample.countyFips,
        countyName: sample.countyName,
        caseNumber: sample.caseNumber,
        samples: [],
      };
      group.samples.push(sample);
      mutableGroups.set(groupKey, group);
    }
  }

  const groups = [...mutableGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([groupKey, group]) => {
    const samples = [...group.samples].sort((left, right) => left.objectId - right.objectId);
    const status = options.pairStatusByKey.get(group.pairKey) ?? defaultPairStatus(
      group.stateCode,
      group.countyFips,
      group.target.speciesId,
    );
    const dates = samples.map((entry) => entry.collectionDate).sort();
    const objectIds = samples.map((entry) => entry.objectId);
    const ruids = samples.map((entry) => entry.ruid);
    const globalIds = samples.map((entry) => entry.globalId).sort();
    return {
      groupKey,
      pairKey: group.pairKey,
      stateCode: group.stateCode,
      countyFips: group.countyFips,
      countyName: group.countyName,
      speciesId: group.target.speciesId,
      scientificName: group.target.scientificName,
      commonName: group.target.commonName,
      caseNumber: group.caseNumber,
      sampleCount: samples.length,
      stationIds: [...new Set(samples.map((entry) => entry.stationId))].sort(),
      waterbodies: [...new Set(samples.map((entry) => entry.waterbody))].sort(),
      basins: [...new Set(samples.map((entry) => entry.basin).filter((entry): entry is string => Boolean(entry)))].sort(),
      sourceObjectIdMin: objectIds[0]!,
      sourceObjectIdMax: objectIds.at(-1)!,
      sourceObjectIdsSha256: sha256Lines(objectIds),
      sourceRuidsSha256: sha256Lines(ruids),
      sourceGlobalIdsSha256: sha256Lines(globalIds),
      collectionDateStart: dates[0]!,
      collectionDateEnd: dates.at(-1)!,
      doubleSampleFlagRows: samples.filter((entry) => entry.doubleSampleFlag?.toLowerCase() === "yes").length,
      classification: classifyPair(status),
    } satisfies UsfwsCoverageGroup;
  });

  const pairGroups = new Map<string, UsfwsCoverageGroup[]>();
  for (const group of groups) {
    const values = pairGroups.get(group.pairKey) ?? [];
    values.push(group);
    pairGroups.set(group.pairKey, values);
  }
  const pairs = [...pairGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([pairKey, values]) => {
    const first = values[0]!;
    const currentStatus = options.pairStatusByKey.get(pairKey) ?? defaultPairStatus(
      first.stateCode,
      first.countyFips,
      first.speciesId,
    );
    const dates = values.flatMap((entry) => [entry.collectionDateStart, entry.collectionDateEnd]).sort();
    return {
      pairKey,
      stateCode: first.stateCode,
      countyFips: first.countyFips,
      countyName: first.countyName,
      speciesId: first.speciesId,
      scientificName: first.scientificName,
      commonName: first.commonName,
      sampleCount: values.reduce((sum, entry) => sum + entry.sampleCount, 0),
      caseCount: values.length,
      groupKeys: values.map((entry) => entry.groupKey),
      collectionDateStart: dates[0]!,
      collectionDateEnd: dates.at(-1)!,
      classification: classifyPair(currentStatus),
      currentStatus,
    } satisfies UsfwsCoveragePair;
  });

  const rejectedRows = Object.values(rejectionReasons).reduce((sum, value) => sum + value, 0);
  assert(accepted.length + rejectedRows === rows.length, "USFWS row classification does not conserve raw rows.");
  assert(groups.reduce((sum, entry) => sum + entry.sampleCount, 0) === accepted.length * USFWS_EDNA_TARGETS.length, "USFWS group sample counts do not conserve accepted target samples.");
  assert(pairs.every((entry) => entry.classification === groups.find((group) => group.pairKey === entry.pairKey)?.classification), "USFWS pair and group classifications differ.");
  const statesCovered = [...new Set(accepted.map((entry) => entry.stateCode))].sort();
  const countiesCovered = new Set(accepted.map((entry) => entry.countyFips)).size;
  return {
    rawRows: rows.length,
    explicitNegativeRows,
    acceptedSamples: accepted.length,
    rejectedRows,
    duplicateRows,
    statesCovered,
    countiesCovered,
    candidatePairs: pairs.length,
    netNewPairs: pairs.filter((entry) => entry.classification === "unresearched-net-new-candidate").length,
    researchedUnresolvedPairs: pairs.filter((entry) => entry.classification === "researched-unresolved-candidate").length,
    alreadyNotDetectedPairs: pairs.filter((entry) => entry.classification === "already-not-detected").length,
    verifiedPresentOverlaps: pairs.filter((entry) => entry.classification === "verified-present-overlap").length,
    blockedPairs: pairs.filter((entry) => entry.classification === "blocked").length,
    rejectionReasons,
    statusCounts: Object.fromEntries(Object.entries(statusCounts).sort(([left], [right]) => left.localeCompare(right))),
    groups,
    pairs,
  };
}
