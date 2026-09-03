import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import {
  countyEquivalentNameMatchesFips,
  getStateDefinition,
  listCountyEquivalents,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";
import {
  BLM_AIM_LAYER_URL,
  BLM_AIM_POSITIVE_WHERE,
  BLM_AIM_QUERY_URL,
  BLM_AIM_SOURCE_ID,
} from "./adapters/blm-aim-terrestrial-invasive-plants";

type Species = { id: string; scientificName: string };
type CountyProjection = {
  stateCode: string;
  countyFips: string;
  pairResolution: { defaultDisplayStatus: string };
  pairs: Array<{ speciesId: string; displayStatus: string }>;
};
type MinimalReceipt = {
  source_id: string;
  parameters: Record<string, unknown>;
};
type MinimalOutcome = {
  county_fips: string;
  species_id: string;
  scope_complete: boolean;
};
type MinimalRejection = {
  normalized_target: { county_fips: string | null; species_id: string };
};
type PriorPlan = {
  sourceId?: string;
  stateCode?: string;
  candidates?: Array<{ countyFips: string; speciesId: string }>;
  blmAim?: { preflightEvaluationId?: string };
};
type LayerMetadata = {
  name?: string;
  maxRecordCount?: number;
  editingInfo?: { lastEditDate?: number };
  advancedQueryCapabilities?: {
    supportsPagination?: boolean;
    supportsOrderBy?: boolean;
    supportsStatistics?: boolean;
  };
  error?: { message?: string };
};
type GroupAttributes = {
  record_count: number;
  min_objectid: number;
  FIPS: string | null;
  STATE_FIPS: string | null;
  COUNTY_FIPS: string | null;
  CountyName: string | null;
  State: string | null;
  ScientificName: string | null;
};
type GroupResponse = {
  features?: Array<{ attributes: GroupAttributes }>;
  exceededTransferLimit?: boolean;
  error?: { message?: string };
};

const ROOT = process.cwd();
const STATE_CODES = ["AK", "AZ", "CA", "CO", "ID", "MT", "NV", "NM", "ND", "OR", "SD", "TX", "UT", "WA", "WY"] as const;
const PAGE_SIZE = 2000;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalize(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US")
    : "";
}

function readJson<T>(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function readNdjson<T>(filepath: string): T[] {
  if (!existsSync(filepath)) return [];
  return readFileSync(filepath, "utf8").split(/\r?\n/gu).filter(Boolean).map((line) => JSON.parse(line) as T);
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const outputDirectory = path.resolve(ROOT, values.get("output-dir") ?? "");
  const evaluationOutput = path.resolve(ROOT, values.get("evaluation-output") ?? "");
  assert(outputDirectory.startsWith(`${ROOT}${path.sep}`), "--output-dir must remain inside the repository.");
  assert(evaluationOutput.startsWith(`${ROOT}${path.sep}`), "--evaluation-output must remain inside the repository.");
  const preflightEvaluationId = values.get("preflight-id") ?? "";
  assert(/^blm-aim-terrestrial-invasive-plants-preflight-[0-9]{8}-r[0-9]+$/u.test(preflightEvaluationId), "--preflight-id is invalid.");
  const evaluatedAt = new Date(values.get("evaluated-at") ?? "").toISOString();
  assert(Date.parse(evaluatedAt) <= Date.now(), "--evaluated-at cannot be in the future.");
  return { outputDirectory, evaluationOutput, preflightEvaluationId, evaluatedAt };
}

async function fetchJson<T>(url: string) {
  const retrievedAt = new Date().toISOString();
  const response = await fetch(url, {
    headers: { "user-agent": "Project-Isitusa-BLM-AIM-planner/1.0" },
    signal: AbortSignal.timeout(60_000),
  });
  assert(response.ok, `BLM AIM planner request returned HTTP ${response.status}.`);
  const contents = await response.text();
  return {
    value: JSON.parse(contents) as T,
    retrievedAt,
    bytes: Buffer.byteLength(contents),
    sha256: sha256(contents),
    url,
  };
}

function validateMetadata(metadata: LayerMetadata) {
  assert(!metadata.error, `BLM AIM metadata error: ${metadata.error?.message ?? "unknown error"}.`);
  assert(metadata.name === "BLM Natl AIM Terrestrial Species Indicators Public", "BLM AIM layer identity differs.");
  assert(Number.isInteger(metadata.editingInfo?.lastEditDate) && metadata.editingInfo!.lastEditDate! > 0, "BLM AIM last-edit identity is unavailable.");
  assert(metadata.maxRecordCount === PAGE_SIZE, "BLM AIM maximum record count differs.");
  assert(metadata.advancedQueryCapabilities?.supportsPagination === true, "BLM AIM pagination support is unavailable.");
  assert(metadata.advancedQueryCapabilities?.supportsOrderBy === true, "BLM AIM ordering support is unavailable.");
  assert(metadata.advancedQueryCapabilities?.supportsStatistics === true, "BLM AIM statistics support is unavailable.");
  return metadata.editingInfo!.lastEditDate!;
}

function groupQueryUrl(stateFips: string, offset: number) {
  const url = new URL(BLM_AIM_QUERY_URL);
  url.searchParams.set("f", "json");
  url.searchParams.set("where", `${BLM_AIM_POSITIVE_WHERE} AND STATE_FIPS='${stateFips}'`);
  url.searchParams.set("outStatistics", JSON.stringify([
    { statisticType: "count", onStatisticField: "OBJECTID", outStatisticFieldName: "record_count" },
    { statisticType: "min", onStatisticField: "OBJECTID", outStatisticFieldName: "min_objectid" },
  ]));
  url.searchParams.set("groupByFieldsForStatistics", "FIPS,STATE_FIPS,COUNTY_FIPS,CountyName,State,ScientificName");
  url.searchParams.set("orderByFields", "FIPS ASC,ScientificName ASC,State ASC,CountyName ASC");
  url.searchParams.set("returnGeometry", "false");
  url.searchParams.set("resultRecordCount", String(PAGE_SIZE));
  url.searchParams.set("resultOffset", String(offset));
  return url.toString();
}

async function fetchStateGroups(stateFips: string) {
  const groups: GroupAttributes[] = [];
  const pages: Array<{ url: string; retrievedAt: string; sha256: string; bytes: number; groupCount: number; sourceRecordCount: number }> = [];
  for (let offset = 0, page = 1; page <= 20; offset += PAGE_SIZE, page += 1) {
    const result = await fetchJson<GroupResponse>(groupQueryUrl(stateFips, offset));
    assert(!result.value.error, `BLM AIM group query failed: ${result.value.error?.message ?? "unknown error"}.`);
    const features = result.value.features ?? [];
    const pageGroups = features.map((feature) => feature.attributes);
    groups.push(...pageGroups);
    pages.push({
      url: result.url,
      retrievedAt: result.retrievedAt,
      sha256: result.sha256,
      bytes: result.bytes,
      groupCount: pageGroups.length,
      sourceRecordCount: pageGroups.reduce((total, group) => total + Number(group.record_count || 0), 0),
    });
    if (result.value.exceededTransferLimit !== true) break;
    assert(features.length === PAGE_SIZE, `BLM AIM state ${stateFips} declared truncation on a short page.`);
    assert(page < 20, `BLM AIM state ${stateFips} exceeded the bounded group-page budget.`);
  }
  return { groups, pages };
}

function loadPriorState(sourceId: string, layerLastEditMs: number, preflightEvaluationId: string) {
  const complete = new Set<string>();
  const partial = new Set<string>();
  const rejected = new Set<string>();
  const runsRoot = path.join(ROOT, "src/data/research/runs");
  for (const directoryName of readdirSync(runsRoot)) {
    const directory = path.join(runsRoot, directoryName);
    const receiptPath = path.join(directory, "receipt.json");
    if (!existsSync(receiptPath)) continue;
    const receipt = readJson<MinimalReceipt>(receiptPath);
    if (receipt.source_id !== sourceId || Number(receipt.parameters.layerLastEditMs) !== layerLastEditMs) continue;
    for (const outcome of readNdjson<MinimalOutcome>(path.join(directory, "outcomes.ndjson"))) {
      const key = `${outcome.county_fips}:${outcome.species_id}`;
      (outcome.scope_complete ? complete : partial).add(key);
    }
    for (const record of readNdjson<MinimalRejection>(path.join(directory, "rejections.ndjson"))) {
      if (record.normalized_target.county_fips) rejected.add(`${record.normalized_target.county_fips}:${record.normalized_target.species_id}`);
    }
  }

  const priorPlanned = new Set<string>();
  const plansRoot = path.join(ROOT, "ops/national-research/plans");
  const pendingDirectories = [plansRoot];
  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) pendingDirectories.push(absolute);
      else if (entry.isFile() && entry.name.endsWith(".json") && entry.name.includes("blm-aim")) {
        const plan = readJson<PriorPlan>(absolute);
        if (plan.sourceId !== sourceId || plan.blmAim?.preflightEvaluationId === preflightEvaluationId) continue;
        for (const candidate of plan.candidates ?? []) priorPlanned.add(`${candidate.countyFips}:${candidate.speciesId}`);
      }
    }
  }
  return { complete, partial, rejected, priorPlanned };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const species = readJson<Species[]>(path.join(ROOT, "src/data/generated/species.json"));
  const speciesByName = new Map<string, Species[]>();
  for (const taxon of species) {
    const entries = speciesByName.get(normalize(taxon.scientificName)) ?? [];
    entries.push(taxon);
    speciesByName.set(normalize(taxon.scientificName), entries);
  }
  const metadataUrl = `${BLM_AIM_LAYER_URL}?f=json`;
  const metadataBefore = await fetchJson<LayerMetadata>(metadataUrl);
  const layerLastEditMs = validateMetadata(metadataBefore.value);
  const snapshotIdentity = {
    layerUrl: BLM_AIM_LAYER_URL,
    layerLastEditMs,
    positiveWhereClause: BLM_AIM_POSITIVE_WHERE,
    groupingFields: ["FIPS", "STATE_FIPS", "COUNTY_FIPS", "CountyName", "State", "ScientificName"],
    witnessSelection: "minimum OBJECTID per exact provider group",
  };
  const snapshotIdentitySha256 = sha256(stableJson(snapshotIdentity));
  const prior = loadPriorState(BLM_AIM_SOURCE_ID, layerLastEditMs, options.preflightEvaluationId);
  const stateEvaluations: Array<Record<string, unknown>> = [];
  let nationalSelectedPairs = 0;
  let nationalRawRecords = 0;
  let nationalRawGroups = 0;
  let nationalExactTaxonGroups = 0;
  let nationalGeographyResolvedGroups = 0;
  let nationalDeterminedOverlap = 0;
  let nationalCompleteOverlap = 0;
  let nationalPriorPlanOverlap = 0;
  let nationalRejectedOverlap = 0;
  let nationalWithinSourceDuplicates = 0;
  let nationalProviderBytes = metadataBefore.bytes;
  let nationalProviderRequests = 1;

  mkdirSync(options.outputDirectory, { recursive: true });
  for (const stateCode of STATE_CODES) {
    const state = getStateDefinition(stateCode);
    assert(state, `BLM AIM state ${stateCode} is not registered.`);
    const counties = new Map(listCountyEquivalents(stateCode).map((county) => [county.countyFips, county]));
    const acquired = await fetchStateGroups(state.stateFips);
    nationalProviderRequests += acquired.pages.length;
    nationalProviderBytes += acquired.pages.reduce((total, page) => total + page.bytes, 0);
    nationalRawGroups += acquired.groups.length;
    nationalRawRecords += acquired.groups.reduce((total, group) => total + Number(group.record_count || 0), 0);

    const projectionCache = new Map<string, CountyProjection>();
    const byPair = new Map<string, {
      pairKey: string;
      countyFips: string;
      speciesId: string;
      scientificName: string;
      objectId: number;
      sourceRecordCount: number;
      sourceCountyName: string;
      sourceStateCode: string;
      sourceGroupCount: number;
    }>();
    const rejectionCounts = {
      invalidSourceIdentity: 0,
      unmatchedOrAmbiguousCatalogTaxon: 0,
      unresolvedOrContradictoryGeography: 0,
    };
    let exactTaxonGroups = 0;
    let geographyResolvedGroups = 0;
    for (const group of acquired.groups) {
      const taxonMatches = speciesByName.get(normalize(group.ScientificName)) ?? [];
      if (taxonMatches.length !== 1) {
        rejectionCounts.unmatchedOrAmbiguousCatalogTaxon += 1;
        continue;
      }
      exactTaxonGroups += 1;
      if (
        !Number.isInteger(group.record_count) || group.record_count <= 0 ||
        !Number.isInteger(group.min_objectid) || group.min_objectid <= 0
      ) {
        rejectionCounts.invalidSourceIdentity += 1;
        continue;
      }
      const countyFips = group.FIPS ?? "";
      const county = counties.get(countyFips);
      if (
        !county ||
        group.State !== stateCode ||
        group.STATE_FIPS !== state.stateFips ||
        group.COUNTY_FIPS !== countyFips.slice(2) ||
        !countyEquivalentNameMatchesFips({ stateCode, countyFips, countyName: group.CountyName ?? "", sourceId: BLM_AIM_SOURCE_ID })
      ) {
        rejectionCounts.unresolvedOrContradictoryGeography += 1;
        continue;
      }
      geographyResolvedGroups += 1;
      const taxon = taxonMatches[0];
      const key = `${countyFips}:${taxon.id}`;
      const existing = byPair.get(key);
      if (existing) {
        existing.objectId = Math.min(existing.objectId, group.min_objectid);
        existing.sourceRecordCount += group.record_count;
        existing.sourceGroupCount += 1;
      } else {
        byPair.set(key, {
          pairKey: key,
          countyFips,
          speciesId: taxon.id,
          scientificName: taxon.scientificName,
          objectId: group.min_objectid,
          sourceRecordCount: group.record_count,
          sourceCountyName: group.CountyName!,
          sourceStateCode: stateCode,
          sourceGroupCount: 1,
        });
      }
    }
    const withinSourceDuplicates = geographyResolvedGroups - byPair.size;
    nationalExactTaxonGroups += exactTaxonGroups;
    nationalGeographyResolvedGroups += geographyResolvedGroups;
    nationalWithinSourceDuplicates += withinSourceDuplicates;

    const candidates: Array<{ sourceId: string; speciesId: string; countyFips: string }> = [];
    const targets: Array<Omit<ReturnType<typeof byPair.get> extends infer T ? NonNullable<T> : never, "sourceGroupCount">> = [];
    let determinedOverlap = 0;
    let verifiedPresentOverlap = 0;
    let verifiedAbsentOverlap = 0;
    let sameSnapshotCompleteOverlap = 0;
    let priorPlanOverlap = 0;
    let rejectedOverlap = 0;
    let partialRetryEligible = 0;
    const displayStatusCounts = new Map<string, number>();
    for (const target of [...byPair.values()].sort((left, right) => compareText(left.pairKey, right.pairKey))) {
      let projection = projectionCache.get(target.countyFips);
      if (!projection) {
        projection = readJson<CountyProjection>(path.join(ROOT, "public/generated/research", stateCode, "counties", `${target.countyFips}.json`));
        assert(projection.stateCode === stateCode && projection.countyFips === target.countyFips, `Projection identity differs for ${target.countyFips}.`);
        projectionCache.set(target.countyFips, projection);
      }
      const explicit = projection.pairs.find((pair) => pair.speciesId === target.speciesId);
      const displayStatus = explicit?.displayStatus ?? projection.pairResolution.defaultDisplayStatus;
      displayStatusCounts.set(displayStatus, (displayStatusCounts.get(displayStatus) ?? 0) + 1);
      if (displayStatus === "verified-present" || displayStatus === "verified-absent") {
        determinedOverlap += 1;
        if (displayStatus === "verified-present") verifiedPresentOverlap += 1;
        else verifiedAbsentOverlap += 1;
        continue;
      }
      if (prior.complete.has(target.pairKey)) {
        sameSnapshotCompleteOverlap += 1;
        continue;
      }
      if (prior.priorPlanned.has(target.pairKey)) {
        priorPlanOverlap += 1;
        continue;
      }
      if (prior.rejected.has(target.pairKey)) {
        rejectedOverlap += 1;
        continue;
      }
      if (prior.partial.has(target.pairKey)) partialRetryEligible += 1;
      candidates.push({ sourceId: BLM_AIM_SOURCE_ID, speciesId: target.speciesId, countyFips: target.countyFips });
      targets.push({
        pairKey: target.pairKey,
        countyFips: target.countyFips,
        speciesId: target.speciesId,
        scientificName: target.scientificName,
        objectId: target.objectId,
        sourceRecordCount: target.sourceRecordCount,
        sourceCountyName: target.sourceCountyName,
        sourceStateCode: target.sourceStateCode,
      });
    }
    const selectedPairKeys = targets.map((target) => target.pairKey).sort(compareText);
    assert(new Set(selectedPairKeys).size === selectedPairKeys.length, `BLM AIM ${stateCode} plan contains duplicate pairs.`);
    assert(targets.length <= 5000, `BLM AIM ${stateCode} exceeds the runner pair limit.`);
    nationalSelectedPairs += targets.length;
    nationalDeterminedOverlap += determinedOverlap;
    nationalCompleteOverlap += sameSnapshotCompleteOverlap;
    nationalPriorPlanOverlap += priorPlanOverlap;
    nationalRejectedOverlap += rejectedOverlap;

    const planId = `blm-aim-${stateCode.toLocaleLowerCase("en-US")}-20260902-r1`;
    const plan = {
      schemaVersion: 1,
      planId,
      sourceId: BLM_AIM_SOURCE_ID,
      stateCode,
      generatedAt: new Date().toISOString(),
      evaluatedAt: options.evaluatedAt,
      dStartCommit: baseCommit,
      candidates,
      blmAim: {
        mode: "targeted-stable-positive-witness" as const,
        layerUrl: BLM_AIM_LAYER_URL,
        layerLastEditMs,
        preflightEvaluationId: options.preflightEvaluationId,
        positiveWhereClause: BLM_AIM_POSITIVE_WHERE,
        minimumRequestIntervalMs: 1000 as const,
        maxResponseBytes: 5_242_880,
        objectIdsPerRequest: 100,
        targets,
      },
      accounting: {
        sourceSnapshotIdentity: snapshotIdentity,
        sourceSnapshotIdentitySha256: snapshotIdentitySha256,
        scopeFingerprint: sha256(stableJson({ sourceId: BLM_AIM_SOURCE_ID, stateCode, stateFips: state.stateFips, layerLastEditMs, positiveWhereClause: BLM_AIM_POSITIVE_WHERE })),
        selectedPairSetSha256: sha256(`${selectedPairKeys.join("\n")}\n`),
        sourceGroupPageArtifacts: acquired.pages,
        rawProviderRecordsConsidered: acquired.groups.reduce((total, group) => total + Number(group.record_count || 0), 0),
        rawProviderGroupsConsidered: acquired.groups.length,
        exactCatalogTaxonGroups: exactTaxonGroups,
        geographyResolvedGroups,
        grossUniqueCountySpeciesPairs: byPair.size,
        pairsAlreadyInDStart: determinedOverlap,
        pairsAlreadyVerifiedPresent: verifiedPresentOverlap,
        pairsAlreadyVerifiedAbsent: verifiedAbsentOverlap,
        sameSourceSameSnapshotCompletedOverlaps: sameSnapshotCompleteOverlap,
        unexecutedPriorPlanOverlaps: priorPlanOverlap,
        sameSnapshotRejectedOverlaps: rejectedOverlap,
        partialRetryEligiblePairs: partialRetryEligible,
        withinSourceDuplicateGroupsCollapsed: withinSourceDuplicates,
        withinPlanDuplicates: selectedPairKeys.length - new Set(selectedPairKeys).size,
        rejectedProviderGroups: rejectionCounts,
        remainingNetEligiblePairCount: selectedPairKeys.length,
        projectedAcceptedDeterminationCount: selectedPairKeys.length,
        projectedYieldConfidence: "high for the sealed selected OBJECTIDs; every target has an exact positive grouped source witness and current D_start exclusion",
        estimatedAcquisitionRequests: 2 + 2 * Math.ceil(targets.length / 100),
        estimatedAcquisitionBytesUpperBound: (2 + 2 * Math.ceil(targets.length / 100)) * 5_242_880,
        estimatedAcquisitionElapsedMinutes: Math.ceil((2 + 2 * Math.ceil(targets.length / 100)) / 60),
        estimatedCostUsd: 0,
        currentDisplayStatusCounts: Object.fromEntries([...displayStatusCounts.entries()].sort(([left], [right]) => compareText(left, right))),
      },
      assertions: {
        selectedPairsIntersectDStart: 0,
        selectedTriplesIntersectRComplete: 0,
        selectedPairsIntersectPriorPlans: 0,
        selectedPairsIntersectRejectedSet: 0,
        selectedPairDuplicateCount: 0,
        sourceSilenceCreatesAbsence: false,
        sourceSilenceCreatesNonDetection: false,
        acceptedClaim: "historical recorded presence from one retained positive invasive-cover BLM AIM plot record",
      },
    };
    const outputPath = path.join(options.outputDirectory, `${planId}.json`);
    await writeFile(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
    stateEvaluations.push({
      stateCode,
      stateFips: state.stateFips,
      planPath: path.relative(ROOT, outputPath).replace(/\\/gu, "/"),
      rawProviderRecords: plan.accounting.rawProviderRecordsConsidered,
      rawProviderGroups: plan.accounting.rawProviderGroupsConsidered,
      exactCatalogTaxonGroups: exactTaxonGroups,
      geographyResolvedGroups,
      grossUniquePairs: byPair.size,
      determinedOverlap,
      sameSnapshotCompleteOverlap,
      priorPlanOverlap,
      rejectedOverlap,
      selectedNetEligiblePairs: targets.length,
      selectedPairSetSha256: plan.accounting.selectedPairSetSha256,
      rejectionCounts,
    });
  }

  const metadataAfter = await fetchJson<LayerMetadata>(metadataUrl);
  assert(validateMetadata(metadataAfter.value) === layerLastEditMs, "BLM AIM layer last-edit identity changed during planning.");
  assert(stableJson(metadataBefore.value) === stableJson(metadataAfter.value), "BLM AIM layer metadata changed during planning.");
  nationalProviderRequests += 1;
  nationalProviderBytes += metadataAfter.bytes;
  const disposition = nationalSelectedPairs >= 5000 ? "go" : nationalSelectedPairs >= 2000 ? "conditional-go" : "no-go";
  const evaluation = {
    schemaVersion: 1,
    evaluationId: options.preflightEvaluationId,
    sourceId: BLM_AIM_SOURCE_ID,
    evaluatedAt: options.evaluatedAt,
    generatedAt: new Date().toISOString(),
    dStart: {
      commit: baseCommit,
      verifiedPresent: 273796,
      verifiedAbsent: 3143,
      totalUniqueDeterminations: 276939,
      source: "ops/national-research/readiness-dashboard.json",
    },
    sourceSnapshotIdentity: snapshotIdentity,
    sourceSnapshotIdentitySha256: snapshotIdentitySha256,
    metadataBefore: { url: metadataBefore.url, retrievedAt: metadataBefore.retrievedAt, sha256: metadataBefore.sha256, bytes: metadataBefore.bytes },
    metadataAfter: { url: metadataAfter.url, retrievedAt: metadataAfter.retrievedAt, sha256: metadataAfter.sha256, bytes: metadataAfter.bytes },
    geographicScope: [...STATE_CODES],
    positiveGate: BLM_AIM_POSITIVE_WHERE,
    accounting: {
      rawProviderRecordsConsidered: nationalRawRecords,
      rawProviderGroupsConsidered: nationalRawGroups,
      exactCatalogTaxonGroups: nationalExactTaxonGroups,
      geographyResolvedGroups: nationalGeographyResolvedGroups,
      withinSourceDuplicateGroupsCollapsed: nationalWithinSourceDuplicates,
      dStartOverlap: nationalDeterminedOverlap,
      sameSourceSameSnapshotCompletedOverlap: nationalCompleteOverlap,
      unexecutedPriorPlanOverlap: nationalPriorPlanOverlap,
      sameSnapshotRejectedOverlap: nationalRejectedOverlap,
      netEligiblePairs: nationalSelectedPairs,
      estimatedPlannerRequests: nationalProviderRequests,
      measuredPlannerBytes: nationalProviderBytes,
      estimatedAcquisitionRequests: stateEvaluations.reduce((total, state) => total + 2 + 2 * Math.ceil(Number(state.selectedNetEligiblePairs) / 100), 0),
      estimatedCostUsd: 0,
    },
    disposition,
    dispositionRule: "GO >= 5000 net unique pairs; conditional GO 2000-4999; no-go below 2000 or when semantics/access are unusable.",
    decision: disposition === "conditional-go"
      ? "Execute because the official structured source clears the conditional threshold, uses exact county FIPS and exact catalog taxa, and has zero monetary cost."
      : disposition === "go"
        ? "Execute the qualified high-yield lane."
        : "Do not execute unless paired with a larger justified source lane.",
    stateEvaluations,
    semanticGuards: {
      presenceOnly: true,
      sourceSilenceCreatesAbsence: false,
      sourceSilenceCreatesNonDetection: false,
      zeroCoverCreatesNegativeEvidence: false,
      contradictoryGeographyPublishes: false,
      exactCatalogBinomialRequired: true,
      retainedWitnessRequired: true,
    },
  };
  await writeFile(options.evaluationOutput, `${JSON.stringify(evaluation, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    evaluation: path.relative(ROOT, options.evaluationOutput).replace(/\\/gu, "/"),
    disposition,
    layerLastEditMs,
    snapshotIdentitySha256,
    rawProviderRecords: nationalRawRecords,
    rawProviderGroups: nationalRawGroups,
    netEligiblePairs: nationalSelectedPairs,
    statePlans: stateEvaluations.length,
  }, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
