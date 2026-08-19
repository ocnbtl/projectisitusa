import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import { stableJson as stableRunJson } from "@/lib/research/run-files";
import {
  getStateDefinition,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";

import type { GbifRequestedPair } from "./research/adapters/gbif-preserved-specimens";
import {
  NationalGbifDownloadPlanSchema,
  buildGbifDownloadRequest,
  downloadStatusDisposition,
  gbifCredentialReadiness,
  loadNationalGbifDownloadPlan,
  loadNationalGbifSelection,
  nationalGbifAcquisitionInputPaths,
  publicDownloadMetadata,
  redactGbifDownloadRequest,
  resolveNationalGbifTaxa,
  sha256,
  stableJson,
  type NationalGbifDownloadPlan,
} from "./research/national-gbif-download";
import { replayNationalGbifArchive } from "./research/national-gbif-download-replay";
import {
  nationalGbifPartitionInputPaths,
  recoverNationalGbifPublicationTransaction,
} from "./research/partition-national-gbif-download";
import {
  assertSuccessfulDownloadMetadata,
  assertLiveStartedAtNotFuture,
  checkedFetch,
  requestResumeAction,
  retainDownload,
} from "./research/run-national-gbif-download";
import { createZipArchive } from "./research/zip-tools";

const root = path.resolve(".");
const planPath = path.join(root, "src/data/research/national-acquisition-plans/gbif-national-download-v2-round-68-13.json");
const plan = loadNationalGbifDownloadPlan(planPath);
NationalGbifDownloadPlanSchema.parse(plan);
const selection = loadNationalGbifSelection(root, plan);
const taxa = resolveNationalGbifTaxa(root, plan);
const acquisitionInputs = nationalGbifAcquisitionInputPaths(
  plan,
  "src/data/research/national-acquisition-plans/gbif-national-download-v2-round-68-13.json",
);
assert.equal(acquisitionInputs.length, 16);
assert(acquisitionInputs.includes(plan.selectionUniversePlanPath!));
assert(acquisitionInputs.includes("scripts/research/verify-national-gbif-download.ts"));
assert(acquisitionInputs.includes("scripts/research/zip-tools.ts"));
assert.equal(taxa.length, 13);
assert.equal(new Set(taxa.map((entry) => entry.taxonKey)).size, taxa.length);
const v2CacheRoot = mkdtempSync(path.join(tmpdir(), "isitusa-gbif-v2-cache-"));
try {
  const responseBody = stableJson({
    usage: {
      key: "4264680",
      canonicalName: "Myocastor coypus",
      rank: "SPECIES",
      status: "ACCEPTED",
    },
    diagnostics: { matchType: "EXACT", confidence: 99 },
    synonym: false,
  });
  const cachePath = path.join(v2CacheRoot, "gbif-taxonomy-v2.json");
  writeFileSync(cachePath, stableJson({
    schemaVersion: 2,
    cacheId: "fixture-v2",
    sourceId: "gbif-preserved-specimens",
    entries: [{
      speciesId: "nutria",
      scientificName: "Myocastor coypus",
      status: 200,
      responseBodyBase64: Buffer.from(responseBody).toString("base64"),
      responseBodySha256: sha256(responseBody),
    }],
  }));
  const v2Plan = {
    ...plan,
    taxonomyMode: "gbif-backbone-v2-exact-match-retained-identifiers" as const,
    taxonomyCachePath: path.relative(root, cachePath).replaceAll("\\", "/"),
    taxonomyCacheSha256: sha256(readFileSync(cachePath)),
    speciesIds: ["nutria"],
  };
  const resolvedV2 = resolveNationalGbifTaxa(root, v2Plan);
  assert.equal(resolvedV2[0]?.taxonKey, 4264680);
} finally {
  rmSync(v2CacheRoot, { recursive: true, force: true });
}
assert.equal(selection.selection.counts.notResearchedPairs, 25_406);
assert.equal(selection.selection.counts.blockedPairs, 18);
assert.equal(selection.selection.counts.alreadyResearchedPairs, 15_448);
assert.equal(selection.selection.stateScopes.flatMap((entry) => entry.candidatePairs).length, 25_406);
const partitionInputs = nationalGbifPartitionInputPaths({
  root,
  planPath,
  selectionPath: selection.selectionPath,
  taxonomyCachePath: plan.taxonomyCachePath,
  selectionUniversePlanPath: plan.selectionUniversePlanPath!,
  acquisitionReceiptPath: path.join(root, "src/data/research/national-acquisitions/fixture/receipt.json"),
  archivePath: path.join(root, "src/data/research/national-acquisitions/fixture/download.zip"),
});
assert.equal(partitionInputs.length, 26);
assert.equal(new Set(partitionInputs).size, 26);
assert(partitionInputs.includes(path.join(root, "scripts/research/partition-national-gbif-download.ts")));
assert(partitionInputs.includes(path.join(root, "src/data/research/schemas/national-gbif-download-partition-receipt.schema.json")));

const request = buildGbifDownloadRequest(plan, taxa, "operator@example.org");
const taxonPredicate = request.predicate.predicates.find((entry) => entry.key === "TAXON_KEY");
assert(taxonPredicate && "values" in taxonPredicate);
assert.equal(taxonPredicate.values.length, taxa.length);
assert.deepEqual(request.predicate.predicates.slice(0, 3), [
  { type: "equals", key: "COUNTRY", value: "US" },
  { type: "equals", key: "BASIS_OF_RECORD", value: "PRESERVED_SPECIMEN" },
  { type: "equals", key: "OCCURRENCE_STATUS", value: "PRESENT" },
]);
const redacted = stableJson(redactGbifDownloadRequest(request));
assert(!redacted.includes("operator@example.org"));
assert(redacted.includes("[redacted]"));
assert.throws(() => buildGbifDownloadRequest(plan, taxa, "invalid"), /valid notification address/u);

const missing = gbifCredentialReadiness({});
assert.equal(missing.ready, false);
assert.deepEqual(missing.missing, ["GBIF_EMAIL", "GBIF_PASSWORD", "GBIF_USERNAME"]);
const ready = gbifCredentialReadiness({
  GBIF_USERNAME: "operator",
  GBIF_PASSWORD: "secret",
  GBIF_EMAIL: "operator@example.org",
});
assert.equal(ready.ready, true);
assert.deepEqual(ready.missing, []);
assert.equal(downloadStatusDisposition("SUCCEEDED"), "succeeded");
assert.equal(downloadStatusDisposition("FAILED"), "failed");
assert.equal(downloadStatusDisposition("RUNNING"), "pending");
assert.equal(requestResumeAction(false, false, null), "dispatch");
assert.equal(requestResumeAction(true, false, null), "resume");
assert.equal(requestResumeAction(false, true, "000001-260817000000000"), "reconcile");
assert.equal(requestResumeAction(false, true, null), "blocked");
assert.throws(() => requestResumeAction(true, true, "duplicate"), /invalid after a download key is durable/u);
assert.throws(() => requestResumeAction(false, false, "orphan"), /requires an ambiguous request dispatch marker/u);
assert.doesNotThrow(() => assertLiveStartedAtNotFuture("2026-08-18T23:56:00.000Z", Date.parse("2026-08-18T23:56:01.000Z")));
assert.throws(
  () => assertLiveStartedAtNotFuture("2026-08-18T23:57:00.000Z", Date.parse("2026-08-18T23:56:01.000Z")),
  /cannot be more than five seconds in the future/u,
);

const metadata = publicDownloadMetadata({
  key: "000001-260817000000000",
  status: "SUCCEEDED",
  downloadLink: "https://api.gbif.org/v1/occurrence/download/request.zip",
  doi: "10.15468/dl.test",
  license: "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
  size: 4_096,
  totalRecords: 6,
});
assert.doesNotThrow(() => assertSuccessfulDownloadMetadata(metadata, plan));
assert.throws(
  () => assertSuccessfulDownloadMetadata({ ...metadata, doi: null }, plan),
  /lacks a DOI/u,
);
assert.throws(
  () => assertSuccessfulDownloadMetadata({ ...metadata, size: plan.artifactBudgetBytes + 1 }, plan),
  /archive budget/u,
);

const state = getStateDefinition("AL");
if (!state) throw new Error("Missing Alabama registry entry.");
const acer = taxa.find((entry) => entry.speciesId === "acer-platanoides")!;
if (!acer) throw new Error("Missing Acer platanoides taxonomy fixture.");
function pair(countyFips: string): GbifRequestedPair {
  const resolution = resolveCountyEquivalent({ stateCode: "AL", countyFips });
  assert.equal(resolution.status, "resolved");
  return {
    countyFips: resolution.county.countyFips,
    countyName: resolution.county.shortName,
    countyLegalName: resolution.county.legalName,
    stateCode: "AL",
    stateName: state!.stateName,
    sourceStateName: state!.sourceStateNames.gbif,
    speciesId: acer!.speciesId,
    scientificName: acer!.scientificName,
  };
}
const requestedPairs = [pair("01001"), pair("01003"), pair("01005")];
const fixturePlan = {
  ...plan,
  speciesIds: [acer.speciesId],
  expectedGrossPairs: 3,
  expectedNotResearchedPairsAtBaseline: 3,
  expectedBlockedPairsAtBaseline: 0,
  expectedAlreadyResearchedPairsAtBaseline: 0,
  maxOccurrenceRows: 10,
  maxSelectedEvidenceRecords: 10,
} satisfies NationalGbifDownloadPlan;
const context: SourceAdapterContext = {
  runId: "20260817T120000Z__gbif-preserved-specimens__fixture",
  sourceId: "gbif-preserved-specimens",
  stateCode: "AL",
  requestedPairs,
  runStartedAt: "2026-08-17T12:00:00.000Z",
  parameters: {
    stateCode: "AL",
    stateProvince: state.sourceStateNames.gbif,
    candidateLimit: 3,
    candidatePairs: requestedPairs.map((entry) => `${entry.countyFips}:${entry.speciesId}`),
    basisOfRecord: "PRESERVED_SPECIMEN",
    occurrenceStatus: "PRESENT",
    minimumMatchConfidence: 95,
    pageLimit: 300,
  },
};

const headers = [
  "gbifID",
  "datasetKey",
  "basisOfRecord",
  "occurrenceStatus",
  "countryCode",
  "stateProvince",
  "county",
  "scientificName",
  "taxonRank",
  "taxonKey",
  "acceptedTaxonKey",
  "speciesKey",
  "locality",
  "hasGeospatialIssues",
  "issue",
  "occurrenceRemarks",
  "habitat",
  "establishmentMeans",
  "degreeOfEstablishment",
  "preparations",
];
const occurrenceRows = [
  ["100", "dataset-a", "PRESERVED_SPECIMEN", "PRESENT", "US", "Alabama", "Autauga County", acer.scientificName, "SPECIES", acer.taxonKey, acer.taxonKey, acer.taxonKey, "wild bank", "false", "", "", "", "", "", ""],
  ["50", "dataset-a", "PRESERVED_SPECIMEN", "PRESENT", "US", "Alabama", "Autauga County", acer.scientificName, "SPECIES", acer.taxonKey, acer.taxonKey, acer.taxonKey, "wild bank", "false", "", "", "", "", "", ""],
  ["200", "dataset-a", "PRESERVED_SPECIMEN", "PRESENT", "US", "Alabama", "Baldwin County", acer.scientificName, "SPECIES", acer.taxonKey, acer.taxonKey, acer.taxonKey, "cultivated garden", "false", "", "", "", "", "", ""],
  ["300", "dataset-a", "PRESERVED_SPECIMEN", "PRESENT", "US", "Alabama", "Mobile County", acer.scientificName, "SPECIES", acer.taxonKey, acer.taxonKey, acer.taxonKey, "wild bank", "false", "", "", "", "", "", ""],
  ["400", "dataset-a", "PRESERVED_SPECIMEN", "PRESENT", "US", "Alabama", "Autauga County", "Unplanned species", "SPECIES", "999999", "999999", "999999", "wild bank", "false", "", "", "", "", "", ""],
  ["500", "dataset-a", "PRESERVED_SPECIMEN", "PRESENT", "US", "Atlantis", "Autauga County", acer.scientificName, "SPECIES", acer.taxonKey, acer.taxonKey, acer.taxonKey, "wild bank", "false", "", "", "", "", "", ""],
];
const verbatimHeaders = ["gbifID", "countryCode", "stateProvince", "county", "locality"];
const verbatimRows = occurrenceRows
  .map((row) => [row[0]!, row[4]!, row[5]!, row[6]!, row[12]!])
  .reverse();
const table = (tableHeaders: string[], rows: Array<Array<string | number>>) => `${tableHeaders.join("\t")}\n${rows.map((row) => row.join("\t")).join("\n")}\n`;
async function testReplayFixture() {
  const fixtureDirectory = mkdtempSync(path.join(tmpdir(), "isitusa-gbif-national-"));
  try {
  const originalFetch = globalThis.fetch;
  let retryAttempts = 0;
  globalThis.fetch = (async () => {
    retryAttempts += 1;
    return retryAttempts === 1
      ? new Response("busy", { status: 429, headers: { "retry-after": "0" } })
      : new Response("ok", { status: 200 });
  }) as typeof fetch;
  try {
    const retried = await checkedFetch("https://api.gbif.org/fixture", undefined, { maxAttempts: 2, baseDelayMs: 0 });
    assert.equal(retried.status, 200);
    assert.equal(retryAttempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }

  let postAttempts = 0;
  globalThis.fetch = (async () => {
    postAttempts += 1;
    return new Response("busy", { status: 429, headers: { "retry-after": "0" } });
  }) as typeof fetch;
  try {
    await assert.rejects(
      checkedFetch(
        "https://api.gbif.org/fixture-post",
        { method: "POST" },
        { maxAttempts: 2, baseDelayMs: 0, role: "request" },
      ),
      /HTTP 429/u,
    );
    assert.equal(postAttempts, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const resumedArchive = path.join(fixtureDirectory, "resumed.zip");
  writeFileSync(`${resumedArchive}.partial`, "abc");
  globalThis.fetch = (async () => new Response("def", {
    status: 206,
    headers: { "content-length": "3", "content-range": "bytes 3-5/6" },
  })) as typeof fetch;
  try {
    const retained = await retainDownload("https://api.gbif.org/fixture.zip", resumedArchive, 6, 6);
    assert.equal(retained.bytes, 6);
    assert.equal(readFileSync(resumedArchive, "utf8"), "abcdef");
  } finally {
    globalThis.fetch = originalFetch;
  }

  const meta = `<?xml version="1.0" encoding="UTF-8"?>\n<archive xmlns="http://rs.tdwg.org/dwc/text/">\n  <core encoding="UTF-8" fieldsTerminatedBy="\\t" ignoreHeaderLines="1">\n    <files><location>occurrence.txt</location></files>\n    <id index="0"/>\n${headers.slice(1).map((header, index) => `    <field index="${index + 1}" term="http://rs.gbif.org/terms/1.0/${header}"/>`).join("\n")}\n  </core>\n  <extension encoding="UTF-8" fieldsTerminatedBy="\\t" ignoreHeaderLines="1">\n    <files><location>verbatim.txt</location></files>\n    <coreid index="0"/>\n${verbatimHeaders.slice(1).map((header, index) => `    <field index="${index + 1}" term="http://rs.tdwg.org/dwc/terms/${header}"/>`).join("\n")}\n  </extension>\n</archive>\n`;
  const providerCompatibleMeta = meta
    .replace(
      '    <id index="0"/>\n',
      '    <id index="0"/>\n    <field default="WGS84" term="http://rs.tdwg.org/dwc/terms/geodeticDatum"/>\n    <field index="0" term="http://rs.gbif.org/terms/1.0/gbifID"/>\n',
    )
    .replace(
      '    <coreid index="0"/>\n',
      '    <coreid index="0"/>\n    <field index="0" term="http://rs.gbif.org/terms/1.0/gbifID"/>\n',
    );
  writeFileSync(path.join(fixtureDirectory, "meta.xml"), providerCompatibleMeta);
  writeFileSync(path.join(fixtureDirectory, "occurrence.txt"), table(headers, occurrenceRows));
  writeFileSync(
    path.join(fixtureDirectory, "verbatim.txt"),
    table(verbatimHeaders, verbatimRows),
  );
  const archivePath = path.join(fixtureDirectory, "fixture.zip");
  createZipArchive(fixtureDirectory, archivePath, ["meta.xml", "occurrence.txt", "verbatim.txt"]);
  const replayInput = {
    archivePath,
    plan: fixturePlan,
    taxa: [acer],
    stateInputs: [{ context, requestedPairs }],
    completedAt: "2026-08-17T12:05:00.000Z",
    downloadKey: "000001-260817000000000",
    sourceUrl: "https://api.gbif.org/v1/occurrence/download/request/000001-260817000000000.zip",
    providerTotalRecords: occurrenceRows.length,
  };
  const first = await replayNationalGbifArchive(replayInput);
  const second = await replayNationalGbifArchive(replayInput);
  assert.deepEqual([...second.resultsByState], [...first.resultsByState]);
  const result = first.resultsByState.get("AL");
  assert(result);
  assert.equal(first.inspection.occurrenceRows, 6);
  assert.equal(first.inspection.verbatimRows, 6);
  assert.equal(first.reconciliation.taxonomyRejectedRows, 1);
  assert.equal(first.reconciliation.geographyRejectedRows, 1);
  assert.equal(first.reconciliation.selectedScopeRows, 3);
  assert.equal(first.reconciliation.overlapRows, 1);
  assert.equal(first.reconciliation.selectedEvidencePairs, 1);
  assert.equal(first.reconciliation.selectedNoEvidencePairs, 2);
  assert.equal(result.assertions.length, 1);
  assert.equal(result.assertions[0]?.source_record_id, "50");
  assert.equal(result.reviews.length, 1);
  assert.equal(result.rejections.length, 1);
  assert.equal(result.rejections[0]?.reason_code, "cultivated-or-captive");
  assert.equal(result.outcomes.length, 3);
  assert(result.outcomes.every((entry) => entry.scope_complete));
  assert(result.outcomes.every((entry) => entry.status === "evidence-found" || entry.status === "no-qualifying-evidence"));
  assert(result.outcomes.every((entry) => entry.query_urls.every((url) => url === replayInput.sourceUrl)));
  await assert.rejects(
    replayNationalGbifArchive({
      ...replayInput,
      plan: { ...fixturePlan, maxSelectedEvidenceRecords: 2 },
    }),
    /selected-scope record count exceeds/u,
  );

  const noSelectedPairs = await replayNationalGbifArchive({
    ...replayInput,
    plan: { ...fixturePlan, expectedNotResearchedPairsAtBaseline: 0 },
    stateInputs: [],
  });
  assert.equal(noSelectedPairs.resultsByState.size, 0);
  assert.equal(noSelectedPairs.reconciliation.overlapRows, 4);
  assert.equal(noSelectedPairs.reconciliation.geographyRejectedRows, 1);

  const mismatchedArchive = path.join(fixtureDirectory, "mismatched.zip");
  const mismatchedVerbatimRows = verbatimRows.map((row) => row[0] === "100"
    ? [row[0]!, row[1]!, row[2]!, "Baldwin County", row[4]!]
    : row);
  writeFileSync(path.join(fixtureDirectory, "verbatim.txt"), table(verbatimHeaders, mismatchedVerbatimRows));
  createZipArchive(fixtureDirectory, mismatchedArchive, ["meta.xml", "occurrence.txt", "verbatim.txt"]);
  const mismatched = await replayNationalGbifArchive({ ...replayInput, archivePath: mismatchedArchive });
  assert.equal(mismatched.reconciliation.geographyRejectedRows, 2);
  assert.equal(mismatched.reconciliation.selectedScopeRows, 2);

  const invalidBooleanArchive = path.join(fixtureDirectory, "invalid-boolean.zip");
  const invalidBooleanRows = occurrenceRows.map((row, index) => index === 0
    ? row.map((value, fieldIndex) => fieldIndex === headers.indexOf("hasGeospatialIssues") ? "unknown" : value)
    : row);
  writeFileSync(path.join(fixtureDirectory, "occurrence.txt"), table(headers, invalidBooleanRows));
  createZipArchive(fixtureDirectory, invalidBooleanArchive, ["meta.xml", "occurrence.txt", "verbatim.txt"]);
  await assert.rejects(
    replayNationalGbifArchive({ ...replayInput, archivePath: invalidBooleanArchive }),
    /boolean field contains invalid value/u,
  );

  const blankBooleanArchive = path.join(fixtureDirectory, "blank-boolean.zip");
  const blankBooleanRows = occurrenceRows.map((row, index) => index === 0
    ? row.map((value, fieldIndex) => fieldIndex === headers.indexOf("hasGeospatialIssues") ? "" : value)
    : row);
  writeFileSync(path.join(fixtureDirectory, "occurrence.txt"), table(headers, blankBooleanRows));
  createZipArchive(fixtureDirectory, blankBooleanArchive, ["meta.xml", "occurrence.txt", "verbatim.txt"]);
  await assert.rejects(
    replayNationalGbifArchive({ ...replayInput, archivePath: blankBooleanArchive }),
    /required boolean field/u,
  );

  const incompleteArchive = path.join(fixtureDirectory, "incomplete.zip");
  createZipArchive(fixtureDirectory, incompleteArchive, ["meta.xml", "occurrence.txt"]);
  await assert.rejects(
    replayNationalGbifArchive({ ...replayInput, archivePath: incompleteArchive }),
    /lacks required verbatim\.txt/u,
  );
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

function testPublicationRecovery() {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "isitusa-gbif-publication-"));
  try {
    execFileSync("git", ["init", "--quiet"], { cwd: fixtureRoot });
    const acquisitionDirectory = path.join(fixtureRoot, "src/data/research/national-acquisitions/fixture");
    const runsRoot = path.join(fixtureRoot, "src/data/research/runs");
    mkdirSync(acquisitionDirectory, { recursive: true });
    const partitionId = "gbif-national-partition-1234567890abcdef";
    const runId = "20260817T120000Z__gbif-preserved-specimens__fixture";
    const finalDirectory = path.join(runsRoot, runId);
    mkdirSync(finalDirectory, { recursive: true });
    const runReceipt = "{}\n";
    writeFileSync(path.join(finalDirectory, "receipt.json"), runReceipt);
    const transactionRoot = path.join(fixtureRoot, ".cache/research/gbif-partition-transactions");
    mkdirSync(transactionRoot, { recursive: true });
    const transactionPath = path.join(transactionRoot, `${partitionId}.json`);
    const repositoryRelative = (filepath: string) => path.relative(fixtureRoot, filepath).replaceAll("\\", "/");
    const manifest = {
      schemaVersion: 1,
      kind: "gbif-national-partition-publication",
      partitionId,
      acquisitionDirectory: repositoryRelative(acquisitionDirectory),
      createdAt: "2026-08-17T12:05:00.000Z",
      partitionReceipt: {
        stagingPath: `.cache/research/.${partitionId}-receipt.json`,
        finalPath: `ops/national-research/evaluations/${partitionId}.json`,
        sha256: "0".repeat(64),
        preexisting: false,
      },
      runs: [{
        runId,
        stagingDirectory: `.cache/research/.${partitionId}/${runId}`,
        finalDirectory: repositoryRelative(finalDirectory),
        contentsSha256: sha256(stableRunJson([["receipt.json", runReceipt]])),
        preexisting: false,
      }],
    };
    writeFileSync(transactionPath, `${JSON.stringify(manifest, null, 2)}\n`);
    const rolledBack = recoverNationalGbifPublicationTransaction({ root: fixtureRoot, acquisitionDirectory, runsRoot });
    assert.equal(rolledBack?.status, "rolled-back");
    assert(!existsSync(finalDirectory));
    assert(!existsSync(transactionPath));

    mkdirSync(finalDirectory, { recursive: true });
    writeFileSync(path.join(finalDirectory, "receipt.json"), runReceipt);
    const finalReceiptPath = path.join(fixtureRoot, manifest.partitionReceipt.finalPath);
    mkdirSync(path.dirname(finalReceiptPath), { recursive: true });
    const finalReceipt = "{\"status\":\"complete\"}\n";
    writeFileSync(finalReceiptPath, finalReceipt);
    const completeManifest = {
      ...manifest,
      partitionReceipt: { ...manifest.partitionReceipt, sha256: sha256(finalReceipt) },
    };
    writeFileSync(transactionPath, `${JSON.stringify(completeManifest, null, 2)}\n`);
    const finalized = recoverNationalGbifPublicationTransaction({ root: fixtureRoot, acquisitionDirectory, runsRoot });
    assert.equal(finalized?.status, "finalized");
    assert(existsSync(finalDirectory));
    assert(existsSync(finalReceiptPath));
    assert(!existsSync(transactionPath));
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

testPublicationRecovery();
testReplayFixture()
  .then(() => {
    console.log(JSON.stringify({
      ok: true,
      planId: plan.planId,
      taxa: taxa.length,
      selectedPairs: selection.selection.counts.notResearchedPairs,
      fixtureRows: occurrenceRows.length,
      deterministicReplay: true,
      completeSilenceSemantics: "researched-unresolved-only",
    }, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
