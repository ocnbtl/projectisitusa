import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  GBIF_DOWNLOAD_STATUS_URL,
  buildGbifDownloadRequest,
  loadNationalGbifDownloadPlan,
  loadNationalGbifSelection,
  nationalGbifAcquisitionInputPaths,
  redactGbifDownloadRequest,
  resolveNationalGbifTaxa,
  sha256,
  stableJson,
} from "./research/national-gbif-download";
import {
  nationalGbifPartitionInputPaths,
  verifyNationalGbifPartitionInputHashes,
} from "./research/partition-national-gbif-download";
import { verifyNationalGbifAcquisition } from "./research/verify-national-gbif-download";
import { createZipArchive } from "./research/zip-tools";

const sourceRoot = path.resolve(".");
const sourceHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
const sourceStatus = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
  cwd: sourceRoot,
  encoding: "utf8",
}).trim();
assert(!sourceStatus, "The GBIF end-to-end fixture requires a clean committed source checkout.");

const fixtureParent = mkdtempSync(path.join(tmpdir(), "isitusa-gbif-e2e-"));
const fixtureRoot = path.join(fixtureParent, "repository");
const planRelative = "src/data/research/national-acquisition-plans/gbif-national-download-v2-round-68-13.json";
const startedAt = "2026-08-17T12:00:00.000Z";
const requestedAt = "2026-08-17T12:00:05.000Z";
const finishedAt = "2026-08-17T12:00:20.000Z";

function git(args: string[], options: { encoding?: BufferEncoding } = {}) {
  return execFileSync("git", args, {
    cwd: fixtureRoot,
    encoding: options.encoding,
    maxBuffer: 128 * 1024 * 1024,
  });
}

function repositoryRelative(filepath: string) {
  return path.relative(fixtureRoot, filepath).replaceAll("\\", "/");
}

const occurrenceHeaders = [
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
  "hasGeospatialIssue",
  "issue",
  "occurrenceRemarks",
  "habitat",
  "establishmentMeans",
  "degreeOfEstablishment",
  "preparations",
];
const verbatimHeaders = ["gbifID", "countryCode", "stateProvince", "county", "locality"];

async function main() {
  try {
    execFileSync("git", ["-c", "core.autocrlf=false", "clone", "--quiet", "--shared", sourceRoot, fixtureRoot], {
      cwd: fixtureParent,
      maxBuffer: 128 * 1024 * 1024,
    });
    git(["checkout", "--quiet", "--detach", sourceHead]);
    git(["config", "core.autocrlf", "false"]);
    git(["config", "user.name", "Project Isitusa Fixture"]);
    git(["config", "user.email", "fixture@isitusa.invalid"]);
    symlinkSync(path.join(sourceRoot, "node_modules"), path.join(fixtureRoot, "node_modules"), "junction");

    const planPath = path.join(fixtureRoot, planRelative);
    const plan = loadNationalGbifDownloadPlan(planPath);
    const selection = loadNationalGbifSelection(fixtureRoot, plan);
    const taxa = resolveNationalGbifTaxa(fixtureRoot, plan);
    const planSha256 = sha256(readFileSync(planPath));
    const selectionSha256 = sha256(selection.bytes);
    const parameterHash = sha256(stableJson({
      planId: plan.planId,
      planSha256,
      taxonomyCacheSha256: plan.taxonomyCacheSha256,
      taxa,
      selectionSha256: plan.selectionEvidenceSha256,
    }));
    const acquisitionId = `20260817t120000z__gbif-download__${parameterHash.slice(0, 12)}`;
    const acquisitionDirectory = path.join(fixtureRoot, "src/data/research/national-acquisitions", acquisitionId);
    mkdirSync(acquisitionDirectory, { recursive: true });

    const archiveSource = path.join(fixtureRoot, ".cache/research/gbif-e2e-archive-source");
    mkdirSync(archiveSource, { recursive: true });
    const meta = `<?xml version="1.0" encoding="UTF-8"?>\n<archive xmlns="http://rs.tdwg.org/dwc/text/">\n  <core encoding="UTF-8" fieldsTerminatedBy="\\t" ignoreHeaderLines="1">\n    <files><location>occurrence.txt</location></files>\n    <id index="0"/>\n${occurrenceHeaders.slice(1).map((header, index) => `    <field index="${index + 1}" term="http://rs.gbif.org/terms/1.0/${header}"/>`).join("\n")}\n  </core>\n  <extension encoding="UTF-8" fieldsTerminatedBy="\\t" ignoreHeaderLines="1">\n    <files><location>verbatim.txt</location></files>\n    <coreid index="0"/>\n${verbatimHeaders.slice(1).map((header, index) => `    <field index="${index + 1}" term="http://rs.tdwg.org/dwc/terms/${header}"/>`).join("\n")}\n  </extension>\n</archive>\n`;
    writeFileSync(path.join(archiveSource, "meta.xml"), meta);
    writeFileSync(path.join(archiveSource, "occurrence.txt"), `${occurrenceHeaders.join("\t")}\n`);
    writeFileSync(path.join(archiveSource, "verbatim.txt"), `${verbatimHeaders.join("\t")}\n`);
    const archivePath = path.join(acquisitionDirectory, "download.zip");
    createZipArchive(archiveSource, archivePath, ["meta.xml", "occurrence.txt", "verbatim.txt"]);
    rmSync(archiveSource, { recursive: true, force: true });
    const archiveBytes = readFileSync(archivePath);
    const downloadKey = "000001-260817120000000";
    const downloadLink = `https://api.gbif.org/v1/occurrence/download/request/${downloadKey}.zip`;
    const metadata = {
      key: downloadKey,
      status: "SUCCEEDED",
      downloadLink,
      doi: "10.15468/dl.fixture",
      license: "http://creativecommons.org/publicdomain/zero/1.0/legalcode",
      size: statSync(archivePath).size,
      totalRecords: 0,
      created: requestedAt,
      modified: "2026-08-17T12:00:10.000Z",
    };
    const statusHistory = [{ observedAt: "2026-08-17T12:00:10.000Z", ...metadata }];
    const httpAttempts = [
      { role: "request", method: "POST", url: plan.requestUrl, attempt: 1, status: 201, observedAt: requestedAt, retryable: false, error: null },
      { role: "status", method: "GET", url: `${GBIF_DOWNLOAD_STATUS_URL}/${downloadKey}`, attempt: 1, status: 200, observedAt: "2026-08-17T12:00:10.000Z", retryable: false, error: null },
      { role: "archive", method: "GET", url: downloadLink, attempt: 1, status: 200, observedAt: "2026-08-17T12:00:15.000Z", retryable: false, error: null },
    ];
    const requestPath = path.join(acquisitionDirectory, "request.redacted.json");
    writeFileSync(requestPath, stableJson(redactGbifDownloadRequest(
      buildGbifDownloadRequest(plan, taxa, "fixture@isitusa.invalid"),
    )));
    const inputHashes = Object.fromEntries(nationalGbifAcquisitionInputPaths(plan, planRelative).map((relativePath) => [
      relativePath,
      sha256(git(["show", `${sourceHead}:${relativePath}`])),
    ]));
    const progress = {
      parameterHash,
      startedAt,
      planSha256,
      selectionSha256,
      downloadKey,
      requestedAt,
      statusHistory,
      httpAttempts,
      requestResolution: "provider-response",
    };
    writeFileSync(path.join(acquisitionDirectory, "progress.json"), stableJson(progress));
    const receipt = {
      schemaVersion: 2,
      acquisition_id: acquisitionId,
      status: "complete",
      actor_type: "adapter",
      actor_id: "gbif-national-download-acquisition@2.0.0",
      source_id: "gbif-preserved-specimens",
      code_commit: sourceHead,
      input_hashes: inputHashes,
      parameter_hash: parameterHash,
      parameters: {
        planId: plan.planId,
        planPath: planRelative,
        planSha256,
        selectionPath: repositoryRelative(selection.selectionPath),
        selectionSha256,
        taxonomyCachePath: plan.taxonomyCachePath,
        taxonomyCacheSha256: plan.taxonomyCacheSha256,
        artifactBudgetBytes: plan.artifactBudgetBytes,
        maxOccurrenceRows: plan.maxOccurrenceRows,
        maxSelectedEvidenceRecords: plan.maxSelectedEvidenceRecords,
        taxonCount: taxa.length,
        selectedPairCount: selection.selection.counts.notResearchedPairs,
      },
      started_at: startedAt,
      requested_at: requestedAt,
      finished_at: finishedAt,
      download: metadata,
      status_history: statusHistory,
      http_attempts: httpAttempts,
      archive: {
        path: repositoryRelative(archivePath),
        bytes: archiveBytes.length,
        sha256: sha256(archiveBytes),
        source_url: downloadLink,
        media_type: "application/zip",
        provider_total_records: 0,
      },
      request_path: repositoryRelative(requestPath),
      credentials_persisted: false,
      complete_archive_retained: true,
      partitioning_status: "ready-for-replay",
      semantics: {
        createsAbsenceFromSilence: false,
        createsNotDetectedFromSilence: false,
        failedDownloadCreatesNegative: false,
        unparsedArchiveMarksScopeComplete: false,
        coordinateCountyAssignmentAllowed: false,
      },
      errors: [],
      warnings: ["Offline end-to-end fixture; no provider request was issued."],
    };
    writeFileSync(path.join(acquisitionDirectory, "receipt.json"), stableJson(receipt));
    await verifyNationalGbifAcquisition(fixtureRoot, acquisitionDirectory);

    git(["add", repositoryRelative(acquisitionDirectory)]);
    git(["commit", "--quiet", "-m", "test: checkpoint GBIF fixture acquisition"]);
    const acquisitionCheckpoint = String(git(["rev-parse", "HEAD"], { encoding: "utf8" })).trim();
    const nodeModules = path.join(fixtureRoot, "node_modules");
    assert(statSync(nodeModules).isDirectory(), "The fixture node_modules junction is missing.");
    const partitionArgs = [
      "--import", "tsx",
      "scripts/research/partition-national-gbif-download.ts",
      "--plan", planRelative,
      "--acquisition", repositoryRelative(acquisitionDirectory),
    ];
    const firstOutput = execFileSync(process.execPath, partitionArgs, {
      cwd: fixtureRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const first = JSON.parse(firstOutput) as { partitionReceiptPath: string; runPaths: string[] };
    const partitionReceiptPath = path.join(fixtureRoot, first.partitionReceiptPath);
    const partitionReceipt = JSON.parse(readFileSync(partitionReceiptPath, "utf8")) as {
      codeCommit: string;
      inputHashes: Record<string, string>;
      acquisitionReceiptPath: string;
      archivePath: string;
      selectionPath: string;
      statePartitions: Array<{ stateCode: string; runCreated: boolean; pairCount: number }>;
    };
    assert.equal(partitionReceipt.codeCommit, acquisitionCheckpoint);
    assert.equal(partitionReceipt.statePartitions.length, 51);
    assert.equal(new Set(partitionReceipt.statePartitions.map((state) => state.stateCode)).size, 51);
    assert.equal(partitionReceipt.statePartitions.filter((state) => state.runCreated).length, 50);
    assert.deepEqual(
      partitionReceipt.statePartitions.find((state) => state.stateCode === "AL"),
      { stateCode: "AL", runCreated: false, runId: null, pairCount: 0, pairSha256: selection.selection.stateScopes.find((state) => state.stateCode === "AL")!.candidatePairSha256, candidateRecords: 0, assertions: 0, reviews: 0, rejections: 0, outcomes: 0 },
    );
    assert.equal(first.runPaths.length, 50);
    const firstRunReceipt = JSON.parse(readFileSync(path.join(fixtureRoot, first.runPaths[0]!, "receipt.json"), "utf8"));
    assert.deepEqual(firstRunReceipt.requested_scope.date_range, { start: null, end: null });
    assert(first.runPaths.every((runPath) => readFileSync(path.join(fixtureRoot, runPath, "outcomes.ndjson"), "utf8").length > 0));

    const expectedPartitionInputs = nationalGbifPartitionInputPaths({
      root: fixtureRoot,
      planPath,
      selectionPath: path.join(fixtureRoot, partitionReceipt.selectionPath),
      taxonomyCachePath: plan.taxonomyCachePath,
      selectionUniversePlanPath: plan.selectionUniversePlanPath!,
      acquisitionReceiptPath: path.join(fixtureRoot, partitionReceipt.acquisitionReceiptPath),
      archivePath: path.join(fixtureRoot, partitionReceipt.archivePath),
    });
    verifyNationalGbifPartitionInputHashes({
      root: fixtureRoot,
      codeCommit: partitionReceipt.codeCommit,
      inputHashes: partitionReceipt.inputHashes,
      inputPaths: expectedPartitionInputs,
    });
    const missingInput = { ...partitionReceipt.inputHashes };
    delete missingInput[Object.keys(missingInput)[0]!];
    assert.throws(() => verifyNationalGbifPartitionInputHashes({
      root: fixtureRoot,
      codeCommit: partitionReceipt.codeCommit,
      inputHashes: missingInput,
      inputPaths: expectedPartitionInputs,
    }), /incomplete or excessive/u);
    const changedInput = { ...partitionReceipt.inputHashes, [Object.keys(partitionReceipt.inputHashes)[0]!]: "0".repeat(64) };
    assert.throws(() => verifyNationalGbifPartitionInputHashes({
      root: fixtureRoot,
      codeCommit: partitionReceipt.codeCommit,
      inputHashes: changedInput,
      inputPaths: expectedPartitionInputs,
    }), /input changed/u);

    git(["add", "src/data/research/runs", "ops/national-research/evaluations"]);
    git(["commit", "--quiet", "-m", "test: publish GBIF fixture partitions"]);
    const firstReceiptBytes = readFileSync(partitionReceiptPath);
    const secondOutput = execFileSync(process.execPath, partitionArgs, {
      cwd: fixtureRoot,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    const second = JSON.parse(secondOutput) as { partitionReceiptSha256: string; runPaths: string[] };
    assert.equal(second.partitionReceiptSha256, sha256(firstReceiptBytes));
    assert.deepEqual(second.runPaths, first.runPaths);
    assert(!String(git(["status", "--porcelain=v1", "--untracked-files=all"], { encoding: "utf8" })).trim());

    process.stdout.write(`${JSON.stringify({
      ok: true,
      acquisitionVerified: true,
      stateRows: partitionReceipt.statePartitions.length,
      materializedRuns: first.runPaths.length,
      selectedPairs: selection.selection.counts.notResearchedPairs,
      deterministicRerun: true,
      tamperRejection: true,
      providerRequests: 0,
    }, null, 2)}\n`);
  } finally {
    rmSync(fixtureParent, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
