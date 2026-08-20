import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import { parse } from "csv-parse/sync";

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
import {
  getStateDefinition,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

export const APHIS_HONEY_BEE_SOURCE_ID = "aphis-honey-bee" as const;
export const APHIS_HONEY_BEE_ADAPTER_ID = "aphis-honey-bee-survey" as const;
export const APHIS_HONEY_BEE_ADAPTER_VERSION = "1.0.0" as const;
export const APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL =
  "https://www.usbeedata.org/state_reports/public_download/" as const;

const USER_AGENT = "Project-Isitusa/1.0 (county-species evidence research)";
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_PAGE_BYTES = 5 * 1024 * 1024;

export type AphisHoneyBeeSurveyRow = {
  sample_year?: string;
  sample_month_number?: string;
  sample_month?: string;
  state_code?: string;
  sampling_county_from_gps?: string;
  varroa_per_100_bees?: string;
  [column: string]: string | undefined;
};

export type AphisHoneyBeeExpectedSurveyRow = {
  countyFips: string;
  countyName: string;
  sampleYear: number;
  sampleMonth: number;
  sampleMonthName: string;
  varroaPer100Bees: 0;
};

type AphisHoneyBeeParameters = {
  stateCode: "AL";
  candidateLimit: number;
  candidatePairs: string[];
  downloadPageUrl: typeof APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL;
  generatedHeaderExact: string;
  coverageHeaderExact: string;
  surveyDateRange: { start: string; end: string };
  metricColumn: "varroa_per_100_bees";
  targetSpeciesId: "varroa-destructor";
  targetScientificName: "Varroa destructor";
  zeroValue: 0;
  expectedSurveyRows: AphisHoneyBeeExpectedSurveyRow[];
  maxCsvBytes: number;
};

type NormalizedSurveyRow = AphisHoneyBeeExpectedSurveyRow & {
  stateCode: "AL";
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function contentId(prefix: string, value: unknown) {
  return `${prefix}-${sha256(stableJson(value))}`;
}

function pairKey(pair: { countyFips: string; speciesId: string }) {
  return `${pair.countyFips}:${pair.speciesId}`;
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

export function extractAphisHoneyBeeDownloadUrl(html: string) {
  const match = html.match(
    /href=["']([^"']*UploadCSVFile_[^"']+)["'][^>]*>\s*Download\s*</iu,
  );
  assert(match?.[1], "APHIS Honey Bee Survey page did not expose a CSV download link.");
  return new URL(
    decodeHtmlEntities(match[1]),
    APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL,
  ).toString();
}

export function parseAphisHoneyBeeCsv(csvText: string) {
  const lines = csvText.split(/\r?\n/u);
  assert(lines.length >= 4, "APHIS Honey Bee Survey CSV is incomplete.");
  const generatedHeader = text(lines[0]);
  const coverageHeader = text(lines[1]);
  const rows = parse(lines.slice(2).join("\n"), {
    bom: true,
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as AphisHoneyBeeSurveyRow[];
  assert(rows.length > 0, "APHIS Honey Bee Survey CSV has no data rows.");
  return {
    generatedHeader,
    coverageHeader,
    columns: Object.keys(rows[0] ?? {}),
    rows,
  };
}

function normalizeExpectedRow(value: unknown): AphisHoneyBeeExpectedSurveyRow {
  assert(value && typeof value === "object", "APHIS expected survey row is invalid.");
  const row = value as Record<string, unknown>;
  const normalized: AphisHoneyBeeExpectedSurveyRow = {
    countyFips: String(row.countyFips ?? ""),
    countyName: text(row.countyName),
    sampleYear: Number(row.sampleYear),
    sampleMonth: Number(row.sampleMonth),
    sampleMonthName: text(row.sampleMonthName),
    varroaPer100Bees: Number(row.varroaPer100Bees) as 0,
  };
  assert(/^\d{5}$/u.test(normalized.countyFips), "APHIS expected county FIPS is invalid.");
  assert(normalized.countyName.length > 0, "APHIS expected county name is missing.");
  assert(
    Number.isInteger(normalized.sampleYear) &&
      normalized.sampleYear >= 2000 &&
      normalized.sampleYear <= 2100,
    "APHIS expected sample year is invalid.",
  );
  assert(
    Number.isInteger(normalized.sampleMonth) &&
      normalized.sampleMonth >= 1 &&
      normalized.sampleMonth <= 12,
    "APHIS expected sample month is invalid.",
  );
  assert(normalized.sampleMonthName.length > 0, "APHIS expected sample month name is missing.");
  assert(normalized.varroaPer100Bees === 0, "APHIS pilot accepts only explicit zero results.");
  return normalized;
}

function parseParameters(context: SourceAdapterContext): AphisHoneyBeeParameters {
  const parameters = context.parameters;
  const expectedKeys = new Set([
    "stateCode",
    "candidateLimit",
    "candidatePairs",
    "downloadPageUrl",
    "generatedHeaderExact",
    "coverageHeaderExact",
    "surveyDateRange",
    "metricColumn",
    "targetSpeciesId",
    "targetScientificName",
    "zeroValue",
    "expectedSurveyRows",
    "maxCsvBytes",
  ]);
  const unsupported = Object.keys(parameters).filter((key) => !expectedKeys.has(key));
  assert(unsupported.length === 0, `Unsupported APHIS Honey Bee parameters: ${unsupported.join(", ")}.`);
  assert(context.sourceId === APHIS_HONEY_BEE_SOURCE_ID, "APHIS Honey Bee adapter received the wrong source.");
  assert(parameters.stateCode === "AL" && context.stateCode === "AL", "APHIS Honey Bee pilot is bounded to Alabama.");
  assert(getStateDefinition("AL")?.nationalV1Scope, "Alabama is missing from national-v1.");
  assert(
    parameters.downloadPageUrl === APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL,
    "APHIS Honey Bee download page changed.",
  );
  assert(parameters.metricColumn === "varroa_per_100_bees", "APHIS Honey Bee metric changed.");
  assert(parameters.targetSpeciesId === "varroa-destructor", "APHIS Honey Bee target species changed.");
  assert(parameters.targetScientificName === "Varroa destructor", "APHIS Honey Bee target name changed.");
  assert(parameters.zeroValue === 0, "APHIS Honey Bee negative result must be numeric zero.");
  assert(typeof parameters.generatedHeaderExact === "string" && parameters.generatedHeaderExact.length > 0, "APHIS generated header is missing.");
  assert(typeof parameters.coverageHeaderExact === "string" && parameters.coverageHeaderExact.length > 0, "APHIS coverage header is missing.");
  assert(
    parameters.surveyDateRange &&
      typeof parameters.surveyDateRange === "object" &&
      /^\d{4}-\d{2}-\d{2}$/u.test(String((parameters.surveyDateRange as Record<string, unknown>).start ?? "")) &&
      /^\d{4}-\d{2}-\d{2}$/u.test(String((parameters.surveyDateRange as Record<string, unknown>).end ?? "")),
    "APHIS survey date range is invalid.",
  );
  assert(
    Number.isInteger(parameters.maxCsvBytes) &&
      Number(parameters.maxCsvBytes) >= 1_000_000 &&
      Number(parameters.maxCsvBytes) <= 10_000_000,
    "APHIS CSV byte budget is invalid.",
  );
  assert(Array.isArray(parameters.candidatePairs) && parameters.candidatePairs.length > 0, "APHIS candidate pairs are missing.");
  const candidatePairs = parameters.candidatePairs.map((value) => String(value));
  assert(candidatePairs.every((value) => /^\d{5}:varroa-destructor$/u.test(value)), "APHIS candidate pair is invalid.");
  assert(new Set(candidatePairs).size === candidatePairs.length, "APHIS candidate pairs contain duplicates.");
  assert(Number(parameters.candidateLimit) === candidatePairs.length, "APHIS candidate limit differs from the frozen pair count.");
  assert(Array.isArray(parameters.expectedSurveyRows), "APHIS expected survey rows are missing.");
  const expectedSurveyRows = parameters.expectedSurveyRows
    .map(normalizeExpectedRow)
    .sort(
      (left, right) =>
        compareText(left.countyFips, right.countyFips) ||
        left.sampleYear - right.sampleYear ||
        left.sampleMonth - right.sampleMonth,
    );
  assert(expectedSurveyRows.length > 0, "APHIS expected survey rows are empty.");
  const expectedPairs = [...new Set(expectedSurveyRows.map((row) => `${row.countyFips}:varroa-destructor`))].sort(compareText);
  assert(stableJson(expectedPairs) === stableJson([...candidatePairs].sort(compareText)), "APHIS expected rows differ from candidate pairs.");
  const requestedPairs = context.requestedPairs.map(pairKey).sort(compareText);
  assert(stableJson(requestedPairs) === stableJson([...candidatePairs].sort(compareText)), "APHIS context differs from candidate pairs.");
  for (const pair of context.requestedPairs) {
    assert(pair.speciesId === "varroa-destructor" && pair.scientificName === "Varroa destructor", "APHIS context target differs from Varroa destructor.");
    const county = resolveCountyEquivalent({ stateCode: "AL", countyFips: pair.countyFips });
    assert(county.status === "resolved" && county.county.shortName === pair.countyName, `APHIS requested county ${pair.countyFips} is invalid.`);
  }
  return {
    stateCode: "AL",
    candidateLimit: candidatePairs.length,
    candidatePairs,
    downloadPageUrl: APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL,
    generatedHeaderExact: String(parameters.generatedHeaderExact),
    coverageHeaderExact: String(parameters.coverageHeaderExact),
    surveyDateRange: {
      start: String((parameters.surveyDateRange as Record<string, unknown>).start),
      end: String((parameters.surveyDateRange as Record<string, unknown>).end),
    },
    metricColumn: "varroa_per_100_bees",
    targetSpeciesId: "varroa-destructor",
    targetScientificName: "Varroa destructor",
    zeroValue: 0,
    expectedSurveyRows,
    maxCsvBytes: Number(parameters.maxCsvBytes),
  };
}

function normalizeActualSurveyRows(input: {
  context: SourceAdapterContext;
  rows: AphisHoneyBeeSurveyRow[];
}) {
  const requestedKeys = new Set(input.context.requestedPairs.map(pairKey));
  const zeroRows: NormalizedSurveyRow[] = [];
  const positivePairKeys = new Set<string>();
  let selectedCountyRows = 0;
  for (const row of input.rows) {
    if (text(row.state_code).toUpperCase() !== "AL") continue;
    const countyName = text(row.sampling_county_from_gps);
    if (!countyName) continue;
    const county = resolveCountyEquivalent({
      stateCode: "AL",
      countyName,
      sourceId: APHIS_HONEY_BEE_SOURCE_ID,
    });
    if (county.status !== "resolved") continue;
    const key = `${county.county.countyFips}:varroa-destructor`;
    if (!requestedKeys.has(key)) continue;
    selectedCountyRows += 1;
    const rawMetric = text(row.varroa_per_100_bees);
    if (!rawMetric) continue;
    const metric = Number(rawMetric);
    if (!Number.isFinite(metric) || metric < 0) continue;
    if (metric > 0) {
      positivePairKeys.add(key);
      continue;
    }
    const sampleYear = Number(text(row.sample_year));
    const sampleMonth = Number(text(row.sample_month_number));
    const sampleMonthName = text(row.sample_month);
    if (
      !Number.isInteger(sampleYear) ||
      !Number.isInteger(sampleMonth) ||
      sampleMonth < 1 ||
      sampleMonth > 12 ||
      !sampleMonthName
    ) {
      continue;
    }
    zeroRows.push({
      stateCode: "AL",
      countyFips: county.county.countyFips,
      countyName: countyName,
      sampleYear,
      sampleMonth,
      sampleMonthName,
      varroaPer100Bees: 0,
    });
  }
  zeroRows.sort(
    (left, right) =>
      compareText(left.countyFips, right.countyFips) ||
      left.sampleYear - right.sampleYear ||
      left.sampleMonth - right.sampleMonth,
  );
  return { zeroRows, positivePairKeys, selectedCountyRows };
}

function assertionAndReview(input: {
  context: SourceAdapterContext;
  pair: SourceAdapterContext["requestedPairs"][number];
  rows: NormalizedSurveyRow[];
  completedAt: string;
}) {
  const payloadHash = sha256(stableJson(input.rows));
  const months = input.rows.map(
    (row) => `${String(row.sampleYear).padStart(4, "0")}-${String(row.sampleMonth).padStart(2, "0")}`,
  );
  const eventId = contentId("aphis-honey-bee-survey-assertion", {
    runId: input.context.runId,
    pair: pairKey(input.pair),
    months,
    payloadHash,
  });
  const first = input.rows[0]!;
  const latest = months.at(-1)!;
  const temporalScope = months.length === 1
    ? `${first.sampleMonthName} ${first.sampleYear} APHIS National Honey Bee Survey sample.`
    : `APHIS National Honey Bee Survey samples from ${months[0]} through ${latest}.`;
  const surveyScope =
    `Target Varroa destructor under the APHIS National Honey Bee Survey program; ` +
    `${input.rows.length} county-resolved honey bee colony sample${input.rows.length === 1 ? "" : "s"}; ` +
    "sampling effort is expressed as Varroa mites per 100 bees; each retained result was explicit zero, " +
    "which is a negative sample result.";
  const assertion: RunEvidenceAssertionEvent = {
    schemaVersion: 1,
    eventId,
    event_type: "evidence.asserted",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${APHIS_HONEY_BEE_ADAPTER_ID}@${APHIS_HONEY_BEE_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: APHIS_HONEY_BEE_SOURCE_ID,
    state_code: "AL",
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    claim_type: "not-detected",
    evidence_kind: "survey-non-detection",
    scope: "survey-area",
    source_record_id: `aphis-honey-bee-zero-sample-group:${payloadHash}`,
    source_url: APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL,
    source_record_date: latest,
    retrieved_at: input.completedAt,
    taxon_match: {
      method: "Exact APHIS varroa_per_100_bees metric to Project Isitusa Varroa destructor mapping",
      target_scientific_name: input.pair.scientificName,
      source_scientific_name: "Varroa destructor",
      source_taxon_key: "varroa_per_100_bees",
    },
    geography_match: {
      method: "Exact explicit source county text resolved through the active county-equivalent registry",
      source_state: "AL",
      source_county: first.countyName,
      county_fips: input.pair.countyFips,
    },
    temporal_scope: temporalScope,
    spatial_scope:
      `The source explicitly names ${first.countyName} County, Alabama for the sampled honey bee colony. ` +
      "This survey-area claim is limited to the retained sample and is not countywide absence.",
    survey_scope: surveyScope,
    normalized_payload_hash: payloadHash,
    caveats: [
      "A zero Varroa count supports sample-level non-detection only, never countywide absence.",
      "The source metric is normalized per 100 bees and does not establish that every colony or apiary in the county was surveyed.",
      "Presence and later sample non-detection may coexist; presence controls the compatibility determination.",
    ],
    notes: [
      `Qualifying explicit-zero sample rows: ${input.rows.length}.`,
      `Retained source month${months.length === 1 ? "" : "s"}: ${months.join(", ")}.`,
      "Blank, missing, rejected, and unsearched rows never create non-detection evidence.",
    ],
  };
  const review: EvidenceReviewEvent = {
    schemaVersion: 1,
    eventId: contentId("aphis-honey-bee-survey-review", { assertionEventId: eventId }),
    event_type: "evidence.reviewed",
    created_at: input.completedAt,
    actor_type: "adapter",
    actor_id: `${APHIS_HONEY_BEE_ADAPTER_ID}@${APHIS_HONEY_BEE_ADAPTER_VERSION}`,
    run_id: input.context.runId,
    source_id: APHIS_HONEY_BEE_SOURCE_ID,
    state_code: "AL",
    county_fips: input.pair.countyFips,
    species_id: input.pair.speciesId,
    references: { assertion_event_id: eventId },
    review_level: "machine-validated",
    decision: "accepted",
    publication_eligible: true,
    reason_codes: [
      "official-national-explicit-survey",
      "exact-varroa-target-metric",
      "exact-explicit-county-text",
      "month-level-survey-time",
      "per-100-bees-effort-context",
      "explicit-zero-result",
      "survey-area-only-scope",
    ],
    notes: [
      "The retained row matches the frozen pilot plan exactly across target, county, month, effort metric, and zero result.",
      "This review publishes survey non-detection only and does not claim verified absence.",
    ],
  };
  return { assertion, review };
}

export function replayAphisHoneyBeeSurvey(input: {
  context: SourceAdapterContext;
  rows: AphisHoneyBeeSurveyRow[];
  expectedSurveyRows: AphisHoneyBeeExpectedSurveyRow[];
  completedAt: string;
}): SourceAdapterResult {
  assert(input.context.sourceId === APHIS_HONEY_BEE_SOURCE_ID, "APHIS Honey Bee replay received the wrong source.");
  assert(input.context.stateCode === "AL", "APHIS Honey Bee replay is bounded to Alabama.");
  const actual = normalizeActualSurveyRows({ context: input.context, rows: input.rows });
  const actualExpectedShape = actual.zeroRows.map(({ stateCode: _stateCode, ...row }) => row);
  const expected = input.expectedSurveyRows.map(normalizeExpectedRow).sort(
    (left, right) =>
      compareText(left.countyFips, right.countyFips) ||
      left.sampleYear - right.sampleYear ||
      left.sampleMonth - right.sampleMonth,
  );
  assert(
    stableJson(actualExpectedShape) === stableJson(expected),
    "APHIS Honey Bee rows differ from the frozen expected survey rows.",
  );
  assert(
    actual.positivePairKeys.size === 0,
    `APHIS Honey Bee pilot found an unexpected positive Varroa result for ${[...actual.positivePairKeys].sort(compareText).join(", ")}.`,
  );
  const assertions: RunEvidenceAssertionEvent[] = [];
  const reviews: EvidenceReviewEvent[] = [];
  const outcomes: ResearchPairOutcome[] = [];
  for (const pair of [...input.context.requestedPairs].sort((left, right) => compareText(pairKey(left), pairKey(right)))) {
    const rows = actual.zeroRows.filter((row) => row.countyFips === pair.countyFips);
    if (rows.length > 0) {
      const normalized = assertionAndReview({
        context: input.context,
        pair,
        rows,
        completedAt: input.completedAt,
      });
      assertions.push(normalized.assertion);
      reviews.push(normalized.review);
    }
    const assertion = assertions.find(
      (entry) => entry.county_fips === pair.countyFips && entry.species_id === pair.speciesId,
    );
    outcomes.push({
      schemaVersion: 1,
      outcome_id: contentId("aphis-honey-bee-survey-outcome", {
        runId: input.context.runId,
        pair: pairKey(pair),
        assertionEventId: assertion?.eventId ?? null,
      }),
      run_id: input.context.runId,
      source_id: APHIS_HONEY_BEE_SOURCE_ID,
      state_code: "AL",
      county_fips: pair.countyFips,
      species_id: pair.speciesId,
      status: assertion ? "evidence-found" : "no-qualifying-evidence",
      scope_complete: true,
      recorded_at: input.completedAt,
      assertion_event_ids: assertion ? [assertion.eventId] : [],
      rejection_ids: [],
      query_urls: [APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL],
      notes: assertion
        ? [
            "The complete retained public CSV contained the exact frozen zero-count Varroa sample for this county-species pair.",
            "This is survey-area not-detected evidence, not verified absence.",
          ]
        : [
            "The complete retained public CSV contained no qualifying explicit-zero Varroa sample for this pair.",
            "Source silence and missing rows never create non-detection or absence evidence.",
          ],
    });
  }
  return {
    completedAt: input.completedAt,
    assertions,
    reviews,
    rejections: [],
    outcomes,
    artifacts: [],
    upstreamRequests: [],
    candidateRecordCount: actual.selectedCountyRows,
    duplicateRecordCount: 0,
    errors: [],
    warnings: [
      "APHIS zero-count rows support sample-level non-detection only, never countywide absence.",
      "The frozen pilot stops if target, county, month, effort metric, zero result, or positive-conflict expectations drift.",
    ],
  };
}

function sanitizedDownloadUrl(value: string) {
  const url = new URL(value);
  return `${url.origin}${url.pathname}`;
}

async function fetchText(url: string, maxBytes: number) {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const retrievedAt = new Date().toISOString();
  assert(response.ok, `APHIS Honey Bee request failed with status ${response.status}.`);
  const declaredBytes = Number(response.headers.get("content-length"));
  assert(
    !Number.isFinite(declaredBytes) || declaredBytes <= maxBytes,
    `APHIS Honey Bee response exceeded ${maxBytes} bytes.`,
  );
  assert(response.body, "APHIS Honey Bee response had no body.");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error(`APHIS Honey Bee response exceeded ${maxBytes} bytes.`);
    }
    chunks.push(Buffer.from(value));
  }
  const contents = Buffer.concat(chunks, totalBytes).toString("utf8");
  return { response, retrievedAt, contents };
}

export const aphisHoneyBeeSurveyAdapter: ResearchSourceAdapter = {
  adapterId: APHIS_HONEY_BEE_ADAPTER_ID,
  adapterVersion: APHIS_HONEY_BEE_ADAPTER_VERSION,
  sourceId: APHIS_HONEY_BEE_SOURCE_ID,
  async run(context) {
    const parameters = parseParameters(context);
    const page = await fetchText(parameters.downloadPageUrl, MAX_PAGE_BYTES);
    const signedCsvUrl = extractAphisHoneyBeeDownloadUrl(page.contents);
    const csv = await fetchText(signedCsvUrl, parameters.maxCsvBytes);
    const parsed = parseAphisHoneyBeeCsv(csv.contents);
    assert(
      parsed.generatedHeader === parameters.generatedHeaderExact,
      "APHIS Honey Bee generated-file header drifted from the frozen pilot plan.",
    );
    assert(
      parsed.coverageHeader === parameters.coverageHeaderExact,
      "APHIS Honey Bee coverage header drifted from the frozen pilot plan.",
    );
    const requiredColumns = [
      "sample_year",
      "sample_month_number",
      "sample_month",
      "state_code",
      "sampling_county_from_gps",
      "varroa_per_100_bees",
    ];
    assert(
      requiredColumns.every((column) => parsed.columns.includes(column)),
      "APHIS Honey Bee CSV is missing a required survey field.",
    );
    const replay = replayAphisHoneyBeeSurvey({
      context,
      rows: parsed.rows,
      expectedSurveyRows: parameters.expectedSurveyRows,
      completedAt: csv.retrievedAt,
    });
    const csvBytes = Buffer.from(csv.contents, "utf8");
    const safeCsvUrl = sanitizedDownloadUrl(signedCsvUrl);
    const metadata = `${JSON.stringify({
      schemaVersion: 1,
      sourceId: APHIS_HONEY_BEE_SOURCE_ID,
      downloadPageUrl: APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL,
      resolvedCsvPath: safeCsvUrl,
      retrievedAt: csv.retrievedAt,
      generatedHeader: parsed.generatedHeader,
      coverageHeader: parsed.coverageHeader,
      rowCount: parsed.rows.length,
      columns: parsed.columns,
      csvBytes: csvBytes.length,
      csvSha256: sha256(csvBytes),
    }, null, 2)}\n`;
    return {
      ...replay,
      artifacts: [
        {
          filename: "aphis-honey-bee-survey.csv.gz",
          mediaType: "application/gzip",
          contents: gzipSync(csvBytes, { level: 9 }),
        },
        {
          filename: "aphis-honey-bee-survey-metadata.json",
          mediaType: "application/json",
          contents: metadata,
        },
      ],
      upstreamRequests: [
        {
          url: APHIS_HONEY_BEE_DOWNLOAD_PAGE_URL,
          status: page.response.status,
          retrievedAt: page.retrievedAt,
          recordCount: 1,
        },
        {
          url: safeCsvUrl,
          status: csv.response.status,
          retrievedAt: csv.retrievedAt,
          recordCount: parsed.rows.length,
        },
      ],
    } satisfies SourceAdapterResult;
  },
};
