import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { sha256, stableJson } from "./national-gbif-download";

const GBIF_OCCURRENCE_SEARCH_URL = "https://api.gbif.org/v1/occurrence/search";

type JsonRecord = Record<string, unknown>;

export type GbifCountCalibrationTaxon = {
  speciesId: string;
  scientificName: string;
  taxonKey: number;
  category: string;
  displayGroup: string;
  grossPairs: number;
  notResearchedPairs: number;
  blockedPairs: number;
  alreadyResearchedPairs: number;
};

export type GbifCountCalibrationResult = GbifCountCalibrationTaxon & {
  requestUrl: string;
  observedAt: string;
  status: 200;
  contentType: string;
  responseBytes: number;
  responseSha256: string;
  providerRows: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asObject(value: unknown, label: string): JsonRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as JsonRecord;
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const required = ["rescore", "output", "calibration-id", "evaluated-at", "baseline-sha"];
  assert(required.every((key) => values.has(key)), `Missing required argument; expected ${required.join(", ")}.`);
  return {
    rescorePath: path.resolve(values.get("rescore")!),
    outputPath: path.resolve(values.get("output")!),
    calibrationId: values.get("calibration-id")!,
    evaluatedAt: values.get("evaluated-at")!,
    baselineSha: values.get("baseline-sha")!,
  };
}

function relativePath(root: string, filepath: string) {
  return path.relative(root, filepath).replaceAll("\\", "/");
}

function countUrl(taxonKey: number) {
  const url = new URL(GBIF_OCCURRENCE_SEARCH_URL);
  url.searchParams.set("limit", "0");
  url.searchParams.set("country", "US");
  url.searchParams.set("basis_of_record", "PRESERVED_SPECIMEN");
  url.searchParams.set("occurrence_status", "PRESENT");
  url.searchParams.set("taxon_key", String(taxonKey));
  return url.toString();
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function fetchGbifCountCalibration(
  taxon: GbifCountCalibrationTaxon,
  input: {
    fetchImpl?: typeof fetch;
    observedAt?: () => string;
  } = {},
): Promise<GbifCountCalibrationResult> {
  assert(Number.isInteger(taxon.taxonKey) && taxon.taxonKey > 0, `Invalid GBIF key for ${taxon.speciesId}.`);
  assert(
    taxon.grossPairs === taxon.notResearchedPairs + taxon.blockedPairs + taxon.alreadyResearchedPairs,
    `Pair classes do not conserve for ${taxon.speciesId}.`,
  );
  const requestUrl = countUrl(taxon.taxonKey);
  const response = await (input.fetchImpl ?? fetch)(requestUrl, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": "Project-Isitusa-GBIF-count-calibration/1.0",
    },
  });
  const body = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get("content-type") ?? "";
  assert(response.status === 200, `GBIF count GET for ${taxon.speciesId} returned HTTP ${response.status}.`);
  assert(contentType.toLowerCase().includes("application/json"), `GBIF count GET for ${taxon.speciesId} was not JSON.`);
  const parsed = asObject(JSON.parse(body.toString("utf8")), `GBIF response for ${taxon.speciesId}`);
  assert(Number.isInteger(parsed.count) && (parsed.count as number) >= 0, `GBIF count for ${taxon.speciesId} is invalid.`);
  assert(parsed.endOfRecords === true || parsed.endOfRecords === false, `GBIF count response for ${taxon.speciesId} lacks endOfRecords.`);
  return {
    ...taxon,
    requestUrl,
    observedAt: (input.observedAt ?? (() => new Date().toISOString()))(),
    status: 200,
    contentType,
    responseBytes: body.length,
    responseSha256: createHash("sha256").update(body).digest("hex"),
    providerRows: parsed.count as number,
  };
}

export async function acquireNationalGbifCountCalibration(input: {
  taxa: readonly GbifCountCalibrationTaxon[];
  fetchImpl?: typeof fetch;
  delayMilliseconds?: number;
  observedAt?: () => string;
}) {
  assert(input.taxa.length > 0, "GBIF count calibration requires at least one taxon.");
  assert(new Set(input.taxa.map((taxon) => taxon.speciesId)).size === input.taxa.length, "GBIF calibration repeats a species ID.");
  assert(new Set(input.taxa.map((taxon) => taxon.taxonKey)).size === input.taxa.length, "GBIF calibration repeats a taxon key.");
  const results: GbifCountCalibrationResult[] = [];
  for (const taxon of [...input.taxa].sort((left, right) => left.speciesId.localeCompare(right.speciesId, "en"))) {
    if (results.length > 0 && (input.delayMilliseconds ?? 550) > 0) {
      await sleep(input.delayMilliseconds ?? 550);
    }
    results.push(await fetchGbifCountCalibration(taxon, {
      fetchImpl: input.fetchImpl,
      observedAt: input.observedAt,
    }));
  }
  return results;
}

async function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  assert(!existsSync(args.outputPath), "GBIF count calibration refuses to overwrite an existing artifact.");
  const rescoreBytes = readFileSync(args.rescorePath);
  const rescore = asObject(JSON.parse(rescoreBytes.toString("utf8")), "GBIF exact-cache rescore");
  const rawTaxa = rescore.rankedEligibleTaxa;
  assert(Array.isArray(rawTaxa) && rawTaxa.length > 0, "GBIF exact-cache rescore has no ranked eligible taxa.");
  const taxa = rawTaxa.map((value, index) => {
    const taxon = asObject(value, `rankedEligibleTaxa[${index}]`);
    const result = {
      speciesId: taxon.speciesId,
      scientificName: taxon.scientificName,
      taxonKey: taxon.taxonKey,
      category: taxon.category,
      displayGroup: taxon.displayGroup,
      grossPairs: taxon.grossPairs,
      notResearchedPairs: taxon.notResearchedPairs,
      blockedPairs: taxon.blockedPairs,
      alreadyResearchedPairs: taxon.alreadyResearchedPairs,
    };
    assert(typeof result.speciesId === "string" && result.speciesId.length > 0, `Taxon ${index} lacks speciesId.`);
    assert(typeof result.scientificName === "string" && result.scientificName.length > 0, `Taxon ${index} lacks scientificName.`);
    assert(typeof result.category === "string" && typeof result.displayGroup === "string", `Taxon ${index} lacks grouping.`);
    assert(
      [result.taxonKey, result.grossPairs, result.notResearchedPairs, result.blockedPairs, result.alreadyResearchedPairs]
        .every((entry) => Number.isInteger(entry) && (entry as number) >= 0),
      `Taxon ${index} has invalid counts.`,
    );
    return result as GbifCountCalibrationTaxon;
  });
  const results = await acquireNationalGbifCountCalibration({ taxa });
  const output = {
    schemaVersion: 1,
    calibrationId: args.calibrationId,
    evaluatedAt: args.evaluatedAt,
    baselineSha: args.baselineSha,
    sourceId: "gbif-preserved-specimens",
    purpose: "Count-only, rate-limited, planning-only calibration of the exact remaining GBIF taxa. These GET responses are not evidence assertions and do not authorize a download request.",
    requestContract: {
      method: "GET",
      endpoint: GBIF_OCCURRENCE_SEARCH_URL,
      limit: 0,
      country: "US",
      basisOfRecord: "PRESERVED_SPECIMEN",
      occurrenceStatus: "PRESENT",
      taxonIdentity: "exact retained GBIF taxon key",
      minimumDelayMilliseconds: 550,
    },
    inputs: {
      rescorePath: relativePath(root, args.rescorePath),
      rescoreSha256: sha256(rescoreBytes),
    },
    counts: {
      taxa: results.length,
      providerRows: results.reduce((sum, entry) => sum + entry.providerRows, 0),
      responseBytes: results.reduce((sum, entry) => sum + entry.responseBytes, 0),
    },
    taxa: results,
    semantics: {
      planningOnly: true,
      responseCountIsAcceptedEvidence: false,
      sourceSilenceIsAbsence: false,
      sourceSilenceIsNonDetection: false,
      authorizesProviderPost: false,
      authorizesPublication: false,
    },
    operations: {
      providerGets: results.length,
      providerPosts: 0,
      downloadRequests: 0,
      datasetMovement: 0,
      evidenceAssertionsCreated: 0,
      generationCommands: 0,
      r2Mutations: 0,
    },
    checks: {
      exactTaxonKeysUnique: true,
      allResponsesHttp200Json: results.every((entry) => entry.status === 200 && entry.contentType.toLowerCase().includes("application/json")),
      rawResponseHashesRetained: results.every((entry) => /^[0-9a-f]{64}$/u.test(entry.responseSha256)),
      pairClassesConserved: results.every((entry) => entry.grossPairs === entry.notResearchedPairs + entry.blockedPairs + entry.alreadyResearchedPairs),
      externalMutationCountIsZero: true,
    },
  };
  mkdirSync(path.dirname(args.outputPath), { recursive: true });
  const contents = stableJson(output);
  writeFileSync(args.outputPath, contents, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: relativePath(root, args.outputPath),
    outputSha256: sha256(contents),
    taxa: results.length,
    providerRows: output.counts.providerRows,
    providerGets: results.length,
    providerPosts: 0,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main();
}
