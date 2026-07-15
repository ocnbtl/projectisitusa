import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  USGS_NAS_OCCURRENCE_HEADER,
  type NasArchiveOccurrence,
  type NationalNasAcquisitionReceipt,
  type NationalNasPlan,
  type NationalNasReference,
  assertCommitAncestor,
  canonicalNasArchiveUrl,
  inspectNationalNasArchive,
  nationalNasRecordAppliesToScreen,
  nationalNasDownloadedCoverage,
  validateNationalNasCheckpointIdentity,
  validateNationalNasPlan,
  validateNationalNasReference,
  validateNationalNasResumeResponse,
  validateNationalNasResponseBudget,
} from "./research/national-usgs-nas-common";
import {
  type NasRequestedPair,
  replayNationalNasScreen,
} from "./research/adapters/usgs-nas-archive";

import { listCountyEquivalents } from "@/lib/research/geography-registry";
import { stableJson } from "@/lib/research/run-files";

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(action: () => unknown, pattern: RegExp) {
  try {
    action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(pattern.test(message), `Expected ${pattern}, received ${message}.`);
    return;
  }
  throw new Error(`Expected failure matching ${pattern}.`);
}

async function expectAsyncFailure(action: () => Promise<unknown>, pattern: RegExp) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(pattern.test(message), `Expected ${pattern}, received ${message}.`);
    return;
  }
  throw new Error(`Expected async failure matching ${pattern}.`);
}

function makeRecord(overrides: Partial<NasArchiveOccurrence> = {}): NasArchiveOccurrence {
  const record = Object.fromEntries(USGS_NAS_OCCURRENCE_HEADER.map((key) => [key, ""])) as NasArchiveOccurrence;
  return {
    ...record,
    id: "urn:USGS:NAS:1",
    occurrenceID: "urn:USGS:NAS:1",
    modified: "2026-05-31",
    language: "en",
    bibliographicCitation: "U.S. Geological Survey NAS",
    references: "https://nas.er.usgs.gov/queries/SpecimenViewer.aspx?SpecimenID=1",
    collectionID: "USGS-NAS 1",
    basisOfRecord: "Occurrence",
    catalogNumber: "1",
    establishmentMeans: "unknown",
    occurrenceStatus: "established",
    eventDate: "2020-06-01",
    countryCode: "US",
    stateProvince: "AK",
    county: "Petersburg",
    locality: "Test locality",
    georeferenceRemarks: "Accurate",
    taxonID: "https://www.itis.gov/servlet/SingleRpt/SingleRpt?search_value=1",
    scientificName: "Myosotis scorpioides",
    kingdom: "Plantae",
    genus: "Myosotis",
    specificEpithet: "scorpioides",
    ...overrides,
  };
}

function requestedPairs(stateCode: string, speciesId: string, scientificName: string): NasRequestedPair[] {
  return listCountyEquivalents(stateCode).map((county) => ({
    countyFips: county.countyFips,
    countyName: county.shortName,
    countyLegalName: county.legalName,
    stateCode,
    stateName: county.stateName,
    speciesId,
    scientificName,
  }));
}

function context(stateCode: string, speciesId: string, scientificName: string, runId = "test-usgs-nas-run") {
  const pairs = requestedPairs(stateCode, speciesId, scientificName);
  return {
    runId,
    sourceId: "usgs-nas",
    stateCode,
    requestedPairs: pairs.map((pair) => ({
      countyFips: pair.countyFips,
      countyName: pair.countyName,
      speciesId,
      scientificName,
    })),
    runStartedAt: "2026-07-15T10:00:00.000Z",
    parameters: {},
  };
}

function buildMetaXml() {
  const fields = USGS_NAS_OCCURRENCE_HEADER.slice(1).map((field, offset) => {
    const index = offset + 1;
    const namespace = index <= 4 ? "http://purl.org/dc/terms" : "http://rs.tdwg.org/dwc/terms";
    return `<field index="${index}" term="${namespace}/${field}"/>`;
  }).join("\n");
  return `<archive metadata="eml.xml"><core fieldsTerminatedBy="\\t" ignoreHeaderLines="1"><files><location>occurrence.txt</location></files><id index="0"/>${fields}</core></archive>\n`;
}

function buildSyntheticArchive(
  directory: string,
  filename: string,
  header: readonly string[] = USGS_NAS_OCCURRENCE_HEADER,
  extra = false,
) {
  const occurrence = [
    header.join("\t"),
    USGS_NAS_OCCURRENCE_HEADER.map((key) => makeRecord()[key]).join("\t"),
    USGS_NAS_OCCURRENCE_HEADER.map((key) => makeRecord({
      id: "urn:USGS:NAS:2",
      occurrenceID: "urn:USGS:NAS:2",
      catalogNumber: "2",
    })[key]).join("\t"),
  ].join("\n") + "\n";
  writeFileSync(path.join(directory, "occurrence.txt"), occurrence);
  writeFileSync(path.join(directory, "meta.xml"), buildMetaXml());
  writeFileSync(
    path.join(directory, "eml.xml"),
    "<eml><dataset><title>USGS Nonindigenous Aquatic Species database</title><pubDate>2026-05-31</pubDate><licenseName>Creative Commons Zero v1.0 Universal</licenseName><url>https://spdx.org/licenses/CC0-1.0.html</url></dataset></eml>\n",
  );
  const entries = ["eml.xml", "meta.xml", "occurrence.txt"];
  if (extra) {
    writeFileSync(path.join(directory, "unexpected.txt"), "unexpected\n");
    entries.push("unexpected.txt");
  }
  const archivePath = path.join(directory, filename);
  execFileSync("zip", ["-q", archivePath, ...entries], { cwd: directory });
  return archivePath;
}

async function main() {
  const akPairs = requestedPairs("AK", "myosotis-scorpioides", "Myosotis scorpioides");
  assert(akPairs.length === 30, `Expected 30 Alaska county equivalents, found ${akPairs.length}.`);
  const records = [
    makeRecord(),
    makeRecord({
      id: "urn:USGS:NAS:2",
      occurrenceID: "urn:USGS:NAS:2",
      catalogNumber: "2",
      occurrenceStatus: "collected",
      eventDate: "2021-06-01",
    }),
    makeRecord({
      id: "urn:USGS:NAS:2",
      occurrenceID: "urn:USGS:NAS:2",
      catalogNumber: "2",
      occurrenceStatus: "collected",
      eventDate: "2021-06-01",
    }),
    makeRecord({ id: "urn:USGS:NAS:3", occurrenceID: "urn:USGS:NAS:3", county: "Wrangell", occurrenceStatus: "" }),
    makeRecord({ id: "urn:USGS:NAS:4", occurrenceID: "urn:USGS:NAS:4", county: "Valdez-Cordova" }),
    makeRecord({ id: "urn:USGS:NAS:5", occurrenceID: "urn:USGS:NAS:5", county: "" }),
    makeRecord({ id: "urn:USGS:NAS:6", occurrenceID: "urn:USGS:NAS:6", county: "Anchorage", occurrenceStatus: "failed" }),
    makeRecord({ id: "urn:USGS:NAS:7", occurrenceID: "urn:USGS:NAS:7", county: "Imaginary County" }),
    makeRecord({ id: "urn:USGS:NAS:8", occurrenceID: "urn:USGS:NAS:different", county: "Juneau" }),
    makeRecord({ id: "urn:USGS:NAS:9", occurrenceID: "urn:USGS:NAS:9", county: "Juneau", occurrenceStatus: "established" }),
    makeRecord({ id: "urn:USGS:NAS:9", occurrenceID: "urn:USGS:NAS:9", county: "Juneau", occurrenceStatus: "" }),
    makeRecord({ id: "urn:USGS:NAS:10", occurrenceID: "urn:USGS:NAS:10", stateProvince: "", county: "Petersburg", occurrenceStatus: "established" }),
  ];
  const replayInput = {
    context: context("AK", "myosotis-scorpioides", "Myosotis scorpioides"),
    requestedPairs: akPairs,
    records,
    acceptedOccurrenceStatuses: ["collected", "established"],
    completedAt: "2026-07-15T10:01:00.000Z",
    archiveUrl: canonicalNasArchiveUrl("1.344"),
  };
  const result = replayNationalNasScreen(replayInput);
  const reversed = replayNationalNasScreen({ ...replayInput, records: [...records].reverse() });
  assert(stableJson(result) === stableJson(reversed), "USGS NAS replay changed when input rows were reversed.");
  assert(result.outcomes.length === 30, "USGS NAS replay did not emit one Alaska outcome per county equivalent.");
  assert(result.assertions.length === 1 && result.reviews.length === 1, "Qualifying county rows were not aggregated to one reviewed assertion.");
  assert(result.rejections.length === 9, `Expected 9 grouped rejection events, found ${result.rejections.length}.`);
  assert(result.reconciliation.selected_records === 12, "Selected record count changed.");
  assert(result.reconciliation.accepted_records === 2, "Accepted raw record count changed.");
  assert(result.reconciliation.rejected_candidate_records === 10, "Rejected raw record count changed.");
  assert(result.reconciliation.duplicate_record_ids === 3, "Duplicate raw records were not counted.");
  assert(result.reconciliation.blank_status_records === 1, "Blank NAS status was not counted.");
  assert(result.reconciliation.unsupported_status_records === 1, "Unsupported NAS status was not counted.");
  assert(result.reconciliation.missing_geography_records === 2, "Missing geography was not counted.");
  assert(result.reconciliation.retired_geography_records === 1, "Retired Alaska geography was not counted.");
  assert(result.reconciliation.unknown_or_ambiguous_geography_records === 1, "Unknown geography was not counted.");
  assert(result.reconciliation.invalid_identity_records === 1, "Invalid identity was not counted.");
  assert(result.reconciliation.blocking_candidate_records === 7, "Positive unplaceable or conflicting candidates were not counted.");
  assert(result.reconciliation.blocked_outcome_pairs === 29, "Unresolved Alaska pairs were not blocked.");
  assert(result.rejections.some((entry) => entry.reason_code === "retired-geography"), "Retired Alaska geography lacks its explicit rejection reason.");
  assert(result.rejections.some((entry) => entry.reason_code === "source-contradiction" && entry.candidate_locator.includes("archive-record-group")), "Conflicting duplicate identity was not rejected as a source contradiction.");
  assert(!result.assertions.some((entry) => entry.county_fips === "02110"), "A conflicting Juneau duplicate payload was published.");
  assert(!result.assertions.some((entry) => entry.claim_type !== "recorded-present"), "NAS replay emitted unsupported negative evidence.");
  assert(result.outcomes.filter((entry) => entry.status === "evidence-found" && entry.scope_complete).length === 1, "Qualifying evidence outcome was not retained.");
  assert(result.outcomes.filter((entry) => entry.status === "blocked" && !entry.scope_complete).length === 29, "Unplaceable positive records did not block unresolved pairs.");
  assert(result.upstreamRequests.length === 0, "Local archive replay attempted a state network request.");
  assert(nationalNasRecordAppliesToScreen({ recordStateProvince: "", recordScientificName: "Myosotis scorpioides", screenStateCode: "AK", screenScientificName: "Myosotis scorpioides" }), "Missing-state pilot record was silently excluded before adapter review.");
  assert(!nationalNasRecordAppliesToScreen({ recordStateProvince: "AZ", recordScientificName: "Myosotis scorpioides", screenStateCode: "AK", screenScientificName: "Myosotis scorpioides" }), "Explicit other-state record entered the Alaska screen.");

  const silent = replayNationalNasScreen({ ...replayInput, records: [] });
  assert(silent.assertions.length === 0 && silent.rejections.length === 0, "Source silence created assertions or rejections.");
  assert(silent.outcomes.every((entry) => entry.status === "no-qualifying-evidence" && entry.scope_complete), "Source silence did not remain research-only.");
  const invalidIdentityOnly = replayNationalNasScreen({
    ...replayInput,
    records: [makeRecord({
      id: "urn:USGS:NAS:invalid-id",
      occurrenceID: "urn:USGS:NAS:different-id",
      county: "Juneau",
      occurrenceStatus: "established",
    })],
  });
  assert(
    invalidIdentityOnly.outcomes.filter((entry) => entry.status === "blocked").map((entry) => entry.county_fips).join(",") === "02110",
    "A positive invalid-identity candidate did not block its exact county scope.",
  );
  assert(
    invalidIdentityOnly.outcomes.filter((entry) => entry.status === "no-qualifying-evidence" && entry.scope_complete).length === 29,
    "A scoped invalid-identity candidate blocked unrelated county equivalents.",
  );
  const retiredOnly = replayNationalNasScreen({
    ...replayInput,
    records: [makeRecord({ id: "urn:USGS:NAS:retired", occurrenceID: "urn:USGS:NAS:retired", county: "Valdez-Cordova" })],
  });
  assert(
    retiredOnly.outcomes.filter((entry) => entry.status === "blocked").map((entry) => entry.county_fips).join(",") === "02063,02066",
    "Retired Valdez-Cordova evidence did not block exactly its two successor scopes.",
  );
  assert(
    retiredOnly.outcomes.filter((entry) => entry.status === "no-qualifying-evidence" && entry.scope_complete).length === 28,
    "Retired Alaska geography blocked unrelated county equivalents.",
  );
  expectFailure(
    () => replayNationalNasScreen({ ...replayInput, acceptedOccurrenceStatuses: ["collected", "unknown"] }),
    /unapproved positive occurrence status/i,
  );

  const txPairs = requestedPairs("TX", "cyprinus-carpio", "Cyprinus carpio");
  assert(txPairs.length === 254, `Expected 254 Texas counties, found ${txPairs.length}.`);
  const texas = replayNationalNasScreen({
    context: context("TX", "cyprinus-carpio", "Cyprinus carpio", "test-usgs-nas-texas"),
    requestedPairs: txPairs,
    records: [],
    acceptedOccurrenceStatuses: ["collected", "established"],
    completedAt: "2026-07-15T10:01:00.000Z",
    archiveUrl: canonicalNasArchiveUrl("1.344"),
  });
  assert(texas.outcomes.length === 254, "Replay topology still caps states at 100 counties.");

  const parameterSchema = JSON.parse(
    readFileSync(path.join(ROOT, "src/data/research/schemas/usgs-nas-archive-parameters.schema.json"), "utf8"),
  ) as Parameters<typeof z.fromJSONSchema>[0];
  const parameterValidator = z.fromJSONSchema(parameterSchema);
  parameterValidator.parse({
    stateCode: "TX",
    mode: "national-archive-replay",
    nationalAcquisitionId: "test",
    nationalAcquisitionReceiptSha256: "a".repeat(64),
    archiveVersion: "1.344",
    planId: "test-plan",
    candidateLimit: 254,
    candidatePairs: txPairs.map((pair) => `${pair.countyFips}:${pair.speciesId}`),
    acceptedOccurrenceStatuses: ["collected", "established"],
  });
  expectFailure(() => parameterValidator.parse({
    stateCode: "TX",
    mode: "national-archive-replay",
    nationalAcquisitionId: "test",
    nationalAcquisitionReceiptSha256: "a".repeat(64),
    archiveVersion: "1.344",
    planId: "test-plan",
    candidateLimit: 1001,
    candidatePairs: Array.from({ length: 1001 }, (_, index) => `48${String(index).padStart(3, "0")}:cyprinus-carpio`),
    acceptedOccurrenceStatuses: ["collected", "established"],
  }), /too_big|maximum|1000/i);

  const plan = JSON.parse(
    readFileSync(path.join(ROOT, "src/data/research/national-acquisition-plans/usgs-nas-pilot-v1.json"), "utf8"),
  ) as NationalNasPlan;
  validateNationalNasPlan(ROOT, plan);
  expectFailure(
    () => validateNationalNasPlan(ROOT, { ...plan, acceptedOccurrenceStatuses: ["collected", "unknown"] }),
    /acceptedOccurrenceStatuses|approved positive occurrence statuses|invalid_value/i,
  );
  expectFailure(
    () => validateNationalNasPlan(ROOT, {
      ...plan,
      screens: [
        ...plan.screens,
        { stateCode: "AK", speciesId: "another-species", scientificName: "Myosotis scorpioides" },
      ],
    }),
    /one state taxon|stably ordered/i,
  );
  const reference: NationalNasReference = {
    schemaVersion: 1,
    acquisitionId: "test-acquisition",
    acquisitionReceiptPath: "src/data/research/national-acquisitions/test/receipt.json",
    acquisitionReceiptSha256: "a".repeat(64),
    archiveVersion: "1.344",
    archivePath: "src/data/research/national-acquisitions/test/artifacts/archive.zip",
    archiveSha256: "b".repeat(64),
    archiveBytes: 100,
    planPath: "src/data/research/national-acquisition-plans/usgs-nas-pilot-v1.json",
    planSha256: "c".repeat(64),
    sourceId: "usgs-nas",
    adapterVersion: "1.0.0",
    adapterCodeSha256: "d".repeat(64),
    partitionScriptSha256: "e".repeat(64),
    stateCode: "AK",
    speciesId: "myosotis-scorpioides",
    scientificName: "Myosotis scorpioides",
    partitionMode: "exact-state-county-name-and-status-no-coordinate-fallback",
    selectedRowsSha256: result.selectedRowsSha256,
    reconciliation: result.reconciliation,
  };
  validateNationalNasReference(ROOT, reference);
  const incompleteReference = structuredClone(reference) as Record<string, unknown>;
  delete incompleteReference.selectedRowsSha256;
  expectFailure(() => validateNationalNasReference(ROOT, incompleteReference as unknown as NationalNasReference), /selectedRowsSha256|invalid_type/i);

  const identity = {
    checkpointVersion: "1.344",
    checkpointUrl: canonicalNasArchiveUrl("1.344"),
    checkpointCommit: "a".repeat(40),
    checkpointInputHashes: { a: "b".repeat(64) },
    checkpointParameterHash: "c".repeat(64),
    checkpointStartedAt: "2026-07-15T10:00:00.000Z",
    expectedVersion: "1.344",
    expectedUrl: canonicalNasArchiveUrl("1.344"),
    expectedCommit: "a".repeat(40),
    expectedInputHashes: { a: "b".repeat(64) },
    expectedParameterHash: "c".repeat(64),
    expectedStartedAt: "2026-07-15T10:00:00.000Z",
  };
  validateNationalNasCheckpointIdentity(identity);
  expectFailure(() => validateNationalNasCheckpointIdentity({ ...identity, expectedCommit: "f".repeat(40) }), /base commit is stale/i);
  expectFailure(() => validateNationalNasCheckpointIdentity({ ...identity, expectedStartedAt: "2026-07-15T10:00:01.000Z" }), /start time is stale/i);
  assert(validateNationalNasResumeResponse({ rangeStart: 500, status: 206, contentRange: "bytes 500-999/1000" }).append, "Valid byte-range resume was rejected.");
  assert(!validateNationalNasResumeResponse({ rangeStart: 500, status: 200, contentRange: null }).append, "Server restart response incorrectly appended bytes.");
  expectFailure(() => validateNationalNasResumeResponse({ rangeStart: 500, status: 206, contentRange: "bytes 0-499/1000" }), /Content-Range/i);
  expectFailure(() => validateNationalNasResumeResponse({ rangeStart: 500, status: 416, contentRange: null }), /HTTP 416/i);
  const request = (
    status: number,
    rangeStart: number,
    bytesReceived: number,
    contentRange: string | null,
    attempt: number,
  ): NationalNasAcquisitionReceipt["upstream_requests"][number] => ({
    url: canonicalNasArchiveUrl("1.344"),
    response_url: canonicalNasArchiveUrl("1.344"),
    method: "GET",
    status,
    retrieved_at: "2026-07-15T10:00:00.000Z",
    bytes_received: bytesReceived,
    range_start: rangeStart,
    content_range: contentRange,
    content_length: bytesReceived,
    attempt,
    etag: null,
    last_modified: null,
  });
  const interruptedRequests = [
    request(200, 0, 400, null, 1),
    request(206, 400, 600, "bytes 400-999/1000", 2),
  ];
  assert(nationalNasDownloadedCoverage(interruptedRequests) === 1000, "Interrupted request bytes did not reconstruct the archive.");
  expectFailure(
    () => nationalNasDownloadedCoverage([
      request(200, 0, 400, null, 1),
      request(206, 500, 500, "bytes 500-999/1000", 2),
    ]),
    /coverage breaks/i,
  );
  assert(
    validateNationalNasResponseBudget({ writeStart: 400, contentLength: 600, artifactBudgetBytes: 1000 }) === 600,
    "USGS NAS response budget returned the wrong streaming allowance.",
  );
  expectFailure(
    () => validateNationalNasResponseBudget({ writeStart: 400, contentLength: 601, artifactBudgetBytes: 1000 }),
    /artifact budget/i,
  );

  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  const parent = execFileSync("git", ["rev-parse", "HEAD^"], { cwd: ROOT, encoding: "utf8" }).trim();
  assertCommitAncestor(ROOT, parent, head);
  expectFailure(() => assertCommitAncestor(ROOT, head, parent), /not an ancestor/i);

  const temporary = mkdtempSync(path.join(os.tmpdir(), "isitusa-nas-test-"));
  try {
    const validArchive = buildSyntheticArchive(temporary, "valid.zip");
    const inspected = await inspectNationalNasArchive(validArchive, true);
    assert(inspected.recordCount === 2 && inspected.publicationDate === "2026-05-31", "Synthetic archive inspection changed.");

    const badHeaderDirectory = path.join(temporary, "bad-header");
    execFileSync("mkdir", ["-p", badHeaderDirectory]);
    const badHeader: string[] = [...USGS_NAS_OCCURRENCE_HEADER];
    badHeader[18] = "countyName";
    const badHeaderArchive = buildSyntheticArchive(badHeaderDirectory, "bad-header.zip", badHeader);
    await expectAsyncFailure(() => inspectNationalNasArchive(badHeaderArchive, true), /header changed/i);

    const extraDirectory = path.join(temporary, "extra");
    execFileSync("mkdir", ["-p", extraDirectory]);
    const extraArchive = buildSyntheticArchive(extraDirectory, "extra.zip", [...USGS_NAS_OCCURRENCE_HEADER], true);
    await expectAsyncFailure(() => inspectNationalNasArchive(extraArchive, true), /entries changed/i);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }

  console.log(JSON.stringify({
    status: "passed",
    deterministicReplay: true,
    sourceSilenceResearchOnly: true,
    retiredGeographyRejected: true,
    retiredGeographyScopedToSuccessors: true,
    missingStateRetainedForBlockingReview: true,
    unsupportedNegativeEvidenceRejected: true,
    positiveStatusWhitelistValidated: true,
    duplicateRecordIdsDetected: true,
    countyLimitStressTest: txPairs.length,
    checkpointIdentityValidated: true,
    byteRangeResumeSemanticsValidated: true,
    interruptedByteLineageValidated: true,
    streamingArtifactBudgetValidated: true,
    wrongBaseAncestryRejected: true,
    archiveTamperCases: 2,
    pilotOutcomeFixtureCount: result.outcomes.length,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
