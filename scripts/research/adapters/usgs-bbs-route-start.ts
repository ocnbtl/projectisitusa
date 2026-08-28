import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

import { parse } from "csv-parse/sync";
import { geoContains } from "d3-geo";
import { feature } from "topojson-client";

import countyTopology from "@/data/source/county-equivalents-topology.json";
import {
  USGS_BBS_ROUTE_START_GEOGRAPHY_METHOD,
  USGS_BBS_ROUTE_START_TOPOLOGY_PATH,
} from "@/lib/research/coordinate-geography-contract";
import type {
  EvidenceReviewEvent,
  ResearchPairOutcome,
  RunEvidenceAssertionEvent,
} from "@/lib/research/types";
import type {
  ResearchSourceAdapter,
  SourceAdapterContext,
  SourceAdapterResult,
} from "@/lib/research/source-adapter";
import { stableJson } from "@/lib/research/run-files";

export const USGS_BBS_SOURCE_ID = "usgs-bbs" as const;
export const USGS_BBS_ADAPTER_ID = "usgs-bbs-route-start" as const;
export const USGS_BBS_ADAPTER_VERSION = "1.0.0" as const;

type ExpectedFile = {
  name: "Routes.csv" | "Weather.csv" | "50-StopData.zip" | "SpeciesList.csv";
  size: number;
  md5: string;
};

type ExactTarget = {
  speciesId: string;
  scientificName: string;
  aou: string;
};

export type BbsParameters = {
  stateCode: string;
  mode: "hash-pinned-standard-stop1-positive";
  scienceBaseItemId: string;
  scienceBaseItemUrl: string;
  rawDataPageUrl: string;
  releaseTitle: string;
  citation: string;
  releaseYearRange: { start: number; end: number };
  minimumRequestIntervalMs: number;
  maxResponseBytes: number;
  filters: {
    countryNum: "840";
    runType: "1";
    stop: "Stop1";
    minimumStopCount: 1;
    geography: string;
  };
  files: ExpectedFile[];
  exactTargets: ExactTarget[];
  unmatchedCatalogBirds: string[];
  expectedStateAcceptedRows: number;
  expectedStateGrossPairs: number;
  expectedStateNetNewPairs: number;
  nationalPreflight: Record<string, number>;
  candidatePairs: string[];
};

export type BbsPilotPlan = Omit<BbsParameters, "stateCode" | "candidatePairs">;

type ScienceBaseItem = {
  id: string;
  title: string;
  citation: string;
  files: Array<{
    name: string;
    size: number;
    downloadUri: string;
    checksum?: { type?: string; value?: string };
    dateUploaded?: string;
  }>;
};

type RouteRow = {
  CountryNum: string;
  StateNum: string;
  Route: string;
  RouteName: string;
  Latitude: string;
  Longitude: string;
};

type WeatherRow = {
  RouteDataID: string;
  CountryNum: string;
  StateNum: string;
  Route: string;
  Year: string;
  RunType: string;
};

type SpeciesRow = { AOU: string; Genus: string; Species: string };

type Route = {
  routeKey: string;
  routeName: string;
  countyFips: string;
  latitude: number;
  longitude: number;
};

type DetectionRecord = {
  routeDataId: string;
  routeKey: string;
  routeName: string;
  year: number;
  aou: string;
  stop1Count: number;
  countyFips: string;
  latitude: number;
  longitude: number;
};

type FetchLike = typeof fetch;

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function md5(value: Buffer) {
  return createHash("md5").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function routeKey(stateNum: string, route: string) {
  return `${stateNum.trim().padStart(2, "0")}:${route.trim().padStart(3, "0")}`;
}

function parseCsv<T>(contents: Buffer) {
  return parse(contents, {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as T[];
}

function parseParameters(value: Record<string, unknown>) {
  return value as unknown as BbsParameters;
}

function buildStateCountyFeatures(stateCode: string) {
  const topology = countyTopology as typeof countyTopology & {
    objects: { counties: { geometries: Array<{ id: string | number }> } };
  };
  const collection = feature(
    topology as never,
    topology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
  const stateFips = stateCode === "TX" ? "48" : null;
  if (!stateFips) throw new Error(`BBS route-start pilot is not configured for ${stateCode}.`);
  return collection.features
    .map((countyFeature, index) => ({
      countyFips: String(topology.objects.counties.geometries[index].id).padStart(5, "0"),
      feature: countyFeature,
    }))
    .filter((entry) => entry.countyFips.startsWith(stateFips));
}

async function scanStopArchive(input: {
  zipPath: string;
  routeLookup: Map<string, Route>;
  standardRuns: Map<string, { route: Route; year: number }>;
  targets: Map<string, ExactTarget>;
  requestedPairKeys: Set<string>;
}) {
  const child = spawn("tar", ["-xOf", input.zipPath], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise<number | null>((resolvePromise, reject) => {
    child.on("error", reject);
    child.on("close", resolvePromise);
  });
  const recordsByPair = new Map<string, DetectionRecord[]>();
  let archiveRows = 0;
  let targetRows = 0;
  let standardTargetRows = 0;
  let stateAcceptedRows = 0;
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line || line.startsWith("RouteDataID,")) continue;
    archiveRows += 1;
    const columns = line.split(",");
    if (columns.length < 8 || columns[1].trim() !== "840") continue;
    const target = input.targets.get(columns[6].trim().padStart(5, "0"));
    if (!target) continue;
    targetRows += 1;
    const standardRun = input.standardRuns.get(columns[0].trim());
    if (!standardRun) continue;
    standardTargetRows += 1;
    const stop1Count = Number(columns[7].trim());
    if (!Number.isFinite(stop1Count) || stop1Count < 1) continue;
    const { route, year } = standardRun;
    const pairKey = `${route.countyFips}:${target.speciesId}`;
    if (!input.requestedPairKeys.has(pairKey)) continue;
    stateAcceptedRows += 1;
    const records = recordsByPair.get(pairKey) ?? [];
    records.push({
      routeDataId: columns[0].trim(),
      routeKey: route.routeKey,
      routeName: route.routeName,
      year,
      aou: target.aou,
      stop1Count,
      countyFips: route.countyFips,
      latitude: route.latitude,
      longitude: route.longitude,
    });
    recordsByPair.set(pairKey, records);
  }
  const exitCode = await completion;
  if (exitCode !== 0) {
    throw new Error(`Unable to stream BBS 50-stop archive: tar exited ${exitCode}: ${stderr.trim()}`);
  }
  return { recordsByPair, archiveRows, targetRows, standardTargetRows, stateAcceptedRows };
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  pair: SourceAdapterContext["requestedPairs"][number];
  target: ExactTarget;
  records: DetectionRecord[];
  completedAt: string;
  parameters: BbsParameters;
}) {
  const records = [...input.records].sort(
    (left, right) =>
      compareText(left.routeDataId, right.routeDataId) ||
      left.year - right.year ||
      left.stop1Count - right.stop1Count,
  );
  const recordIdentity = records.map((record) => ({
    routeDataId: record.routeDataId,
    routeKey: record.routeKey,
    year: record.year,
    aou: record.aou,
    stop1Count: record.stop1Count,
  }));
  const normalizedPayloadHash = sha256(stableJson({
    countyFips: input.pair.countyFips,
    speciesId: input.pair.speciesId,
    records: recordIdentity,
  }));
  const assertionId = contentId("usgs-bbs-assertion", {
    runId: input.context.runId,
    pairKey: `${input.pair.countyFips}:${input.pair.speciesId}`,
    normalizedPayloadHash,
  });
  const latestYear = Math.max(...records.map((record) => record.year));
  const coordinateIdentities = records.map((record) => [record.longitude, record.latitude]);
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId: assertionId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${USGS_BBS_ADAPTER_ID}@${USGS_BBS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: USGS_BBS_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    claim_type: "recorded-present",
    evidence_kind: "survey-detection",
    scope: "point",
    source_record_id: `bbs-route-start:${sha256(stableJson(recordIdentity))}`,
    source_url: input.parameters.scienceBaseItemUrl,
    source_record_date: String(latestYear),
    retrieved_at: input.completedAt,
    taxon_match: {
      method: "Exact current-catalog binomial matched the retained BBS SpeciesList.csv binomial",
      target_scientific_name: input.pair.scientificName,
      source_scientific_name: input.target.scientificName,
      source_taxon_key: input.target.aou,
    },
    geography_match: {
      method: USGS_BBS_ROUTE_START_GEOGRAPHY_METHOD,
      source_state: input.context.stateCode,
      source_county: input.pair.countyName,
      county_fips: input.pair.countyFips,
      source_coordinate_count: new Set(coordinateIdentities.map((value) => value.join(","))).size,
      source_coordinates_sha256: sha256(stableJson(coordinateIdentities)),
      topology_path: USGS_BBS_ROUTE_START_TOPOLOGY_PATH,
      topology_sha256: sha256(readFileSync(path.join(process.cwd(), USGS_BBS_ROUTE_START_TOPOLOGY_PATH))),
    },
    temporal_scope: `Positive standard-run Stop 1 detections in the ${input.parameters.releaseYearRange.start}-${input.parameters.releaseYearRange.end} BBS release; latest supporting year ${latestYear}.`,
    spatial_scope:
      "One or more positive observations at BBS Stop 1, located at the retained route-start point inside the named county.",
    survey_scope:
      "USGS North American Breeding Bird Survey standard runs (RunType 1), Stop 1 only, with a positive target-species count.",
    normalized_payload_hash: normalizedPayloadHash,
    caveats: [
      "BBS route-start detections are sampled point evidence, not a complete county inventory.",
      "Later route stops, route totals, zero rows, missing rows, and source silence do not establish county presence, absence, or non-detection.",
    ],
    notes: [
      `Supporting standard-run Stop 1 rows: ${records.length}.`,
      `Supporting record identity hash: ${sha256(stableJson(recordIdentity))}.`,
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("usgs-bbs-review", { assertionId, decision: "accepted" }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${USGS_BBS_ADAPTER_ID}@${USGS_BBS_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: USGS_BBS_SOURCE_ID,
    state_code: input.context.stateCode,
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    references: { assertion_event_id: assertionId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "hash-pinned-first-party-release",
      "exact-catalog-and-bbs-taxon-match",
      "standard-run-positive-stop1-detection",
      "exact-active-county-point-resolution",
    ],
    notes: [
      "The assertion passed the registered BBS positive-detection and route-start geography gates.",
      "Publication is limited to recorded-present and survey-detected point evidence.",
    ],
  };
  return { assertion, review };
}

export async function runUsGsBbsRouteStart(
  context: SourceAdapterContext,
  fetchImpl: FetchLike = fetch,
): Promise<SourceAdapterResult> {
  const parameters = parseParameters(context.parameters);
  if (context.sourceId !== USGS_BBS_SOURCE_ID || parameters.stateCode !== context.stateCode) {
    throw new Error("BBS adapter source or state context mismatch.");
  }
  if (parameters.mode !== "hash-pinned-standard-stop1-positive") {
    throw new Error("Unsupported BBS adapter mode.");
  }
  const requestedPairKeys = new Set(
    context.requestedPairs.map((pair) => `${pair.countyFips}:${pair.speciesId}`),
  );
  if (
    requestedPairKeys.size !== context.requestedPairs.length ||
    requestedPairKeys.size !== parameters.candidatePairs.length ||
    parameters.candidatePairs.some((pairKey) => !requestedPairKeys.has(pairKey))
  ) {
    throw new Error("BBS candidate pair scope is not exact.");
  }

  const tempDirectory = mkdtempSync(path.join(tmpdir(), "isitusa-usgs-bbs-"));
  const upstreamRequests: SourceAdapterResult["upstreamRequests"] = [];
  const buffers = new Map<string, Buffer>();
  let lastRequestAt = 0;
  const fetchBuffer = async (url: string, maxBytes: number) => {
    const waitMs = parameters.minimumRequestIntervalMs - (Date.now() - lastRequestAt);
    if (waitMs > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, waitMs));
    lastRequestAt = Date.now();
    const response = await fetchImpl(url, {
      headers: { "User-Agent": "Project-Isitusa/1.0" },
    });
    const retrievedAt = new Date().toISOString();
    if (!response.ok) throw new Error(`BBS request failed with HTTP ${response.status}.`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`BBS response exceeded ${maxBytes} bytes.`);
    }
    upstreamRequests.push({ url, status: response.status, retrievedAt, recordCount: 0 });
    return buffer;
  };

  try {
    const itemJsonUrl = `${parameters.scienceBaseItemUrl}?format=json`;
    const itemBuffer = await fetchBuffer(itemJsonUrl, 2_000_000);
    const item = JSON.parse(itemBuffer.toString("utf8")) as ScienceBaseItem;
    if (
      item.id !== parameters.scienceBaseItemId ||
      item.title !== parameters.releaseTitle ||
      item.citation !== parameters.citation
    ) {
      throw new Error("BBS ScienceBase release identity changed from the committed plan.");
    }
    upstreamRequests[0]!.recordCount = 1;
    for (const expected of parameters.files) {
      const sourceFile = item.files.find((entry) => entry.name === expected.name);
      if (
        !sourceFile ||
        sourceFile.size !== expected.size ||
        sourceFile.checksum?.type?.toUpperCase() !== "MD5" ||
        sourceFile.checksum.value?.toLowerCase() !== expected.md5
      ) {
        throw new Error(`BBS ${expected.name} metadata changed from the committed plan.`);
      }
      const buffer = await fetchBuffer(sourceFile.downloadUri, parameters.maxResponseBytes);
      if (buffer.length !== expected.size || md5(buffer) !== expected.md5) {
        throw new Error(`BBS ${expected.name} bytes do not match the committed release identity.`);
      }
      buffers.set(expected.name, buffer);
      writeFileSync(path.join(tempDirectory, expected.name), buffer);
    }

    const speciesRows = parseCsv<SpeciesRow>(buffers.get("SpeciesList.csv")!);
    const bbsByName = new Map(
      speciesRows.map((row) => [canonicalName(`${row.Genus} ${row.Species}`), row]),
    );
    const targets = new Map<string, ExactTarget>();
    for (const target of parameters.exactTargets) {
      const source = bbsByName.get(canonicalName(target.scientificName));
      if (!source || source.AOU.trim().padStart(5, "0") !== target.aou) {
        throw new Error(`BBS exact target mapping changed for ${target.scientificName}.`);
      }
      targets.set(target.aou, target);
    }
    for (const pair of context.requestedPairs) {
      const target = parameters.exactTargets.find((entry) => entry.speciesId === pair.speciesId);
      if (!target || target.scientificName !== pair.scientificName) {
        throw new Error(`BBS requested pair has no exact target mapping: ${pair.speciesId}.`);
      }
    }

    const countyFeatures = buildStateCountyFeatures(context.stateCode);
    const routeRows = parseCsv<RouteRow>(buffers.get("Routes.csv")!);
    const routeLookup = new Map<string, Route>();
    for (const row of routeRows) {
      if (row.CountryNum.trim() !== "840") continue;
      const latitude = Number(row.Latitude.trim());
      const longitude = Number(row.Longitude.trim());
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const matches = countyFeatures.filter(({ feature: countyFeature }) =>
        geoContains(countyFeature, [longitude, latitude]),
      );
      if (matches.length !== 1) continue;
      const key = routeKey(row.StateNum, row.Route);
      routeLookup.set(key, {
        routeKey: key,
        routeName: row.RouteName.trim(),
        countyFips: matches[0]!.countyFips,
        latitude,
        longitude,
      });
    }
    const weatherRows = parseCsv<WeatherRow>(buffers.get("Weather.csv")!);
    const standardRuns = new Map<string, { route: Route; year: number }>();
    for (const row of weatherRows) {
      if (row.CountryNum.trim() !== "840" || row.RunType.trim() !== "1") continue;
      const route = routeLookup.get(routeKey(row.StateNum, row.Route));
      const year = Number(row.Year.trim());
      if (route && Number.isInteger(year)) {
        standardRuns.set(row.RouteDataID.trim(), { route, year });
      }
    }
    const scan = await scanStopArchive({
      zipPath: path.join(tempDirectory, "50-StopData.zip"),
      routeLookup,
      standardRuns,
      targets,
      requestedPairKeys,
    });
    if (
      scan.stateAcceptedRows !== parameters.expectedStateAcceptedRows ||
      scan.recordsByPair.size !== parameters.expectedStateGrossPairs ||
      scan.recordsByPair.size !== context.requestedPairs.length
    ) {
      throw new Error(
        `BBS Texas reconciliation changed: ${scan.stateAcceptedRows} rows, ${scan.recordsByPair.size} pairs.`,
      );
    }

    upstreamRequests[1]!.recordCount = routeRows.length;
    upstreamRequests[2]!.recordCount = weatherRows.length;
    upstreamRequests[3]!.recordCount = scan.archiveRows;
    upstreamRequests[4]!.recordCount = speciesRows.length;
    const completedAt = new Date().toISOString();
    const assertions: RunEvidenceAssertionEvent[] = [];
    const reviews: EvidenceReviewEvent[] = [];
    const outcomes: ResearchPairOutcome[] = [];
    for (const pair of [...context.requestedPairs].sort(
      (left, right) =>
        compareText(left.countyFips, right.countyFips) ||
        compareText(left.speciesId, right.speciesId),
    )) {
      const key = `${pair.countyFips}:${pair.speciesId}`;
      const records = scan.recordsByPair.get(key);
      const target = parameters.exactTargets.find((entry) => entry.speciesId === pair.speciesId);
      if (!records?.length || !target) throw new Error(`BBS planned evidence disappeared for ${key}.`);
      const emitted = assertionAndReview({
        context,
        pair,
        target,
        records,
        completedAt,
        parameters,
      });
      assertions.push(emitted.assertion);
      reviews.push(emitted.review);
      outcomes.push({
        schemaVersion: 1,
        outcome_id: contentId("usgs-bbs-outcome", {
          runId: context.runId,
          pairKey: key,
          assertionId: emitted.assertion.eventId,
        }),
        run_id: context.runId,
        source_id: USGS_BBS_SOURCE_ID,
        state_code: context.stateCode,
        county_fips: pair.countyFips,
        species_id: pair.speciesId,
        status: "evidence-found",
        scope_complete: true,
        recorded_at: completedAt,
        assertion_event_ids: [emitted.assertion.eventId],
        rejection_ids: [],
        query_urls: [parameters.scienceBaseItemUrl, parameters.rawDataPageUrl],
        notes: [
          `The hash-pinned BBS release contains ${records.length} qualifying standard-run Stop 1 detection row(s) for this pair.`,
          "The result supports point recorded presence and survey detection only.",
        ],
      });
    }
    const selectedRecords = [...scan.recordsByPair.entries()]
      .map(([pairKey, records]) => ({
        pairKey,
        records: [...records].sort(
          (left, right) => compareText(left.routeDataId, right.routeDataId) || left.year - right.year,
        ),
      }))
      .sort((left, right) => compareText(left.pairKey, right.pairKey));
    const itemArtifact = `${JSON.stringify(item, null, 2)}\n`;
    const recordsArtifact = `${JSON.stringify(
      {
        schemaVersion: 1,
        sourceId: USGS_BBS_SOURCE_ID,
        stateCode: context.stateCode,
        filters: parameters.filters,
        sourceFiles: parameters.files.map((entry) => ({
          ...entry,
          sha256: sha256(buffers.get(entry.name)!),
        })),
        scan: {
          archiveRows: scan.archiveRows,
          targetRows: scan.targetRows,
          standardTargetRows: scan.standardTargetRows,
          acceptedRows: scan.stateAcceptedRows,
          countySpeciesPairs: scan.recordsByPair.size,
        },
        selectedRecords,
      },
      null,
      2,
    )}\n`;
    return {
      completedAt,
      assertions,
      reviews,
      rejections: [],
      outcomes,
      artifacts: [
        { filename: "sciencebase-item.json", mediaType: "application/json", contents: itemArtifact },
        { filename: "texas-standard-stop1-detections.json", mediaType: "application/json", contents: recordsArtifact },
      ],
      upstreamRequests,
      candidateRecordCount: scan.stateAcceptedRows,
      duplicateRecordCount: 0,
      errors: [],
      warnings: [
        "BBS route-start rows support point recorded presence and survey detection only.",
        "Later stops, route totals, zero rows, unmatched taxa, and source silence create no county absence or non-detection claim.",
      ],
    };
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
}

export const usgsBbsRouteStartAdapter: ResearchSourceAdapter = {
  sourceId: USGS_BBS_SOURCE_ID,
  adapterId: USGS_BBS_ADAPTER_ID,
  adapterVersion: USGS_BBS_ADAPTER_VERSION,
  run: runUsGsBbsRouteStart,
};
