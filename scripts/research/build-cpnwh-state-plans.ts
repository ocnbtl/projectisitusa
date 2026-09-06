import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { stableJson } from "@/lib/research/run-files";

import {
  CPNWH_ARCHIVE_SHA256,
  CPNWH_CC0_LICENSE,
  CPNWH_DATASET_URL,
  CPNWH_OCCURRENCE_SHA256,
  CPNWH_POLICY_URL,
  CPNWH_SOURCE_ID,
  type CpnwhTarget,
} from "./adapters/cpnwh-preserved-specimens";

type Preflight = {
  schemaVersion: number;
  kind: string;
  sourceId: string;
  evaluatedAt: string;
  datasetIdentity: {
    url: string;
    policyUrl: string;
    archiveBytes: number;
    archiveSha256: string;
    occurrenceBytes: number;
    occurrenceSha256: string;
    metaBytes: number;
    metaSha256: string;
    emlBytes: number;
    emlSha256: string;
  };
  baseline: { commit: string; determinedPairSetSha256: string };
  semantics: Record<string, string>;
  counts: Record<string, number> & {
    netEligiblePairs: number;
    verifiedAbsentConflicts: number;
  };
  pairHashes: Record<string, string> & { netEligible: string };
  rejectionCounts: Record<string, number>;
  licenseCounts: Record<string, number>;
  states: Record<string, { gross: number; presentOverlap: number; absentConflict: number; netEligible: number }>;
  topSpecies: Array<Record<string, unknown>>;
  netEligiblePairs: string[];
  representativeRecords: Record<string, Omit<CpnwhTarget, "pairKey">>;
  elapsedMs: number;
  metadataRecovery?: { version: number; asOf: string; identityAudit: {
    occurrenceSha256: string; occurrenceBytes: number; sourceRows: number; missingIdentities: string[];
  } };
};

const ROOT = process.cwd();
const PREFLIGHT_EVALUATION_ID = "cpnwh-preserved-specimens-preflight-20260903-r1";
const ARCHIVE_ACQUIRED_AT = "2026-09-03T22:18:31.985Z";
const DATASET_LAST_MODIFIED = "Thu, 04 Jun 2026 19:05:39 GMT";
const DATASET_ETAG = '"2045cebe-65454012e379b"';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const preflight = path.resolve(values.get("preflight") ?? "");
  const outputDirectory = path.resolve(ROOT, values.get("output-dir") ?? "");
  const evaluationOutput = path.resolve(ROOT, values.get("evaluation-output") ?? "");
  assert(preflight, "--preflight is required.");
  assert(outputDirectory.startsWith(`${ROOT}${path.sep}`), "--output-dir must remain inside the repository.");
  assert(evaluationOutput.startsWith(`${ROOT}${path.sep}`), "--evaluation-output must remain inside the repository.");
  const campaign = values.get("campaign") ?? "20260903-r1";
  assert(/^[0-9]{8}-r[0-9]+$/u.test(campaign), "--campaign must be YYYYMMDD-rN.");
  return { preflight, outputDirectory, evaluationOutput, campaign };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const preflight = JSON.parse(readFileSync(options.preflight, "utf8")) as Preflight;
  const recovery = preflight.metadataRecovery;
  const evaluationId = recovery ? `${CPNWH_SOURCE_ID}-preflight-${options.campaign}` : PREFLIGHT_EVALUATION_ID;
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert(preflight.schemaVersion === 1 && preflight.kind === "isitusa-source-yield-preflight", "CPNWH preflight kind differs.");
  assert(preflight.sourceId === CPNWH_SOURCE_ID, "CPNWH preflight source differs.");
  assert(preflight.baseline.commit === head, "CPNWH preflight baseline differs from current HEAD.");
  assert(preflight.datasetIdentity.url === CPNWH_DATASET_URL, "CPNWH preflight URL differs.");
  assert(preflight.datasetIdentity.policyUrl === CPNWH_POLICY_URL, "CPNWH preflight policy URL differs.");
  assert(preflight.datasetIdentity.archiveBytes === 541445822, "CPNWH archive byte count differs.");
  assert(preflight.datasetIdentity.archiveSha256 === CPNWH_ARCHIVE_SHA256, "CPNWH archive hash differs.");
  assert(preflight.datasetIdentity.occurrenceBytes === 2132017127, "CPNWH occurrence byte count differs.");
  assert(preflight.datasetIdentity.occurrenceSha256 === CPNWH_OCCURRENCE_SHA256, "CPNWH occurrence hash differs.");
  assert(preflight.counts.netEligiblePairs > 0, "CPNWH preflight contains no eligible new pairs.");
  if (recovery) {
    assert(recovery.version === 1 && recovery.identityAudit.occurrenceSha256 === CPNWH_OCCURRENCE_SHA256
      && recovery.identityAudit.occurrenceBytes === 2132017127 && recovery.identityAudit.sourceRows === preflight.counts.sourceRows
      && recovery.identityAudit.missingIdentities.length === 0, "CPNWH recovery audit differs from the source artifact.");
    assert(Date.parse(ARCHIVE_ACQUIRED_AT) <= Date.parse(preflight.evaluatedAt), "CPNWH extraction predates acquisition.");
    assert(/^[0-9a-f]{64}$/u.test(preflight.baseline.determinedPairSetSha256)
      && preflight.baseline.determinedPairSetSha256 !== sha256(""), "CPNWH recovery baseline is missing or empty.");
  }
  assert(preflight.counts.verifiedAbsentConflicts === 0, "CPNWH preflight contains verified-absent conflicts.");
  const pairKeys = [...preflight.netEligiblePairs].sort(compareText);
  assert(new Set(pairKeys).size === pairKeys.length, "CPNWH preflight repeats net pairs.");
  assert(pairKeys.length === preflight.counts.netEligiblePairs, "CPNWH net pair count differs.");
  assert(sha256(pairKeys.join("\n")) === preflight.pairHashes.netEligible, "CPNWH net pair hash differs.");

  const targetsByState = new Map<string, CpnwhTarget[]>();
  for (const pairKey of pairKeys) {
    const record = preflight.representativeRecords[pairKey];
    assert(record, `CPNWH preflight lacks a retained witness for ${pairKey}.`);
    assert(`${record.countyFips}:${record.speciesId}` === pairKey, `CPNWH witness identity differs for ${pairKey}.`);
    assert(record.license === CPNWH_CC0_LICENSE, `CPNWH witness license differs for ${pairKey}.`);
    const target = { pairKey, ...record } as CpnwhTarget;
    const stateTargets = targetsByState.get(target.stateCode) ?? [];
    stateTargets.push(target);
    targetsByState.set(target.stateCode, stateTargets);
  }
  assert(targetsByState.size === Object.values(preflight.states).filter((state) => state.netEligible > 0).length, "CPNWH plan state count differs from preflight.");
  mkdirSync(options.outputDirectory, { recursive: true });
  const planSummaries: Array<{ stateCode: string; planId: string; candidateCount: number; pairSetSha256: string; path: string }> = [];
  const generatedAt = new Date().toISOString();
  for (const [stateCode, unsortedTargets] of [...targetsByState.entries()].sort(([left], [right]) => compareText(left, right))) {
    const targets = unsortedTargets.sort((left, right) => compareText(left.pairKey, right.pairKey));
    assert(targets.length <= 5000, `CPNWH ${stateCode} exceeds the 5000-pair runner limit.`);
    assert(preflight.states[stateCode]?.netEligible === targets.length, `CPNWH ${stateCode} count differs from preflight.`);
    const statePairKeys = targets.map((target) => target.pairKey);
    const pairSetSha256 = sha256(statePairKeys.join("\n"));
    const planId = `cpnwh-${stateCode.toLocaleLowerCase("en-US")}-${options.campaign}`;
    const outputPath = path.join(options.outputDirectory, `${planId}.json`);
    const plan = {
      schemaVersion: 1,
      planId,
      sourceId: CPNWH_SOURCE_ID,
      stateCode,
      generatedAt,
      evaluatedAt: preflight.evaluatedAt,
      dStartCommit: preflight.baseline.commit,
      dStartDeterminedPairSetSha256: preflight.baseline.determinedPairSetSha256,
      candidates: targets.map((target) => ({ sourceId: CPNWH_SOURCE_ID, speciesId: target.speciesId, countyFips: target.countyFips })),
      cpnwh: {
        mode: "retained-archive-witnesses",
        datasetUrl: CPNWH_DATASET_URL,
        usagePolicyUrl: CPNWH_POLICY_URL,
        datasetLastModified: DATASET_LAST_MODIFIED,
        datasetEtag: DATASET_ETAG,
        archiveBytes: preflight.datasetIdentity.archiveBytes,
        archiveSha256: preflight.datasetIdentity.archiveSha256,
        occurrenceBytes: preflight.datasetIdentity.occurrenceBytes,
        occurrenceSha256: preflight.datasetIdentity.occurrenceSha256,
        archiveAcquiredAt: ARCHIVE_ACQUIRED_AT,
        preflightEvaluationId: evaluationId,
        targetPairSetSha256: pairSetSha256,
        ...(recovery ? { metadataRecovery: {
          version: 1,
          asOf: recovery.asOf,
          extractedAt: preflight.evaluatedAt,
          preflightSha256: sha256(readFileSync(options.preflight)),
          witnessSetSha256: sha256(stableJson(targets)),
        } } : {}),
        targets,
      },
      antiDuplication: {
        grossPairs: preflight.states[stateCode].gross,
        existingVerifiedPresentOverlaps: preflight.states[stateCode].presentOverlap,
        verifiedAbsentConflicts: preflight.states[stateCode].absentConflict,
        netEligiblePairs: preflight.states[stateCode].netEligible,
        sameSourceSnapshotCompleteOverlaps: 0,
        priorPlanOverlaps: 0,
      },
    };
    writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, { flag: "wx" });
    planSummaries.push({
      stateCode,
      planId,
      candidateCount: targets.length,
      pairSetSha256,
      path: path.relative(ROOT, outputPath).split(path.sep).join("/"),
    });
  }

  const evaluation = {
    schemaVersion: 1,
    evaluationId,
    evaluatedAt: preflight.evaluatedAt,
    status: "go-positive-marginal-yield",
    objective: "Measure unique, overlap-adjusted historical presence candidates against the pinned current determination set; yield targets do not exclude useful residual evidence.",
    canonicalCheckout: "C:/Code/project-isitusa",
    baseline: preflight.baseline,
    datasetIdentity: {
      ...preflight.datasetIdentity,
      lastModified: DATASET_LAST_MODIFIED,
      etag: DATASET_ETAG,
      acquiredAt: ARCHIVE_ACQUIRED_AT,
      retainedLocalArchive: "C:/Users/Ocean/AppData/Local/Temp/isitusa-cpnwh-preflight-20260903/CPNWH_DwCA.zip",
      selectedWitnessRetention: "One exact CC0 source row per net eligible county-species pair is sealed into the committed state plans and immutable run artifacts.",
    },
    decision: {
      disposition: "go",
      scaleTargetNetDeterminations: 10000,
      measuredNetEligiblePairs: preflight.counts.netEligiblePairs,
      scaleTargetAchieved: preflight.counts.netEligiblePairs >= 10000,
      verifiedAbsentConflicts: preflight.counts.verifiedAbsentConflicts,
    },
    exactMeasurement: preflight.counts,
    pairHashes: preflight.pairHashes,
    semantics: preflight.semantics,
    rejectionCounts: preflight.rejectionCounts,
    licenseCounts: preflight.licenseCounts,
    stateMeasurements: preflight.states,
    topSpecies: preflight.topSpecies,
    preflightElapsedMs: preflight.elapsedMs,
    ...(recovery ? { metadataRecovery: recovery, preflightSha256: sha256(readFileSync(options.preflight)) } : {}),
    plans: planSummaries,
    safeguards: [
      recovery
        ? "PreservedSpecimen rows require one audited stable identity, CC0 licensing, an exact unqualified catalog plant binomial and active county match. Normalized collection dates may be unknown; raw narrative remains retained. Invalid dates and reviewed specimen/geography contradictions are held."
        : "Only PreservedSpecimen rows with stable record and occurrence identities, CC0 licensing, a valid nonfuture event year, an exact source species rank, a blank identification qualifier, an exact unique two-token catalog plant binomial, and one active county alias qualified.",
      "Cultivated or captive text in locality, occurrence remarks, habitat, or establishment means was rejected conservatively.",
      "All gross pairs were subtracted from the pinned verified-present set; verified-absent conflicts were separately blocked and measured at zero.",
      "Source silence and all rejected rows create no absence or non-detection outcome.",
      "No provider job, R2 action, push, deployment, or public data mutation occurred.",
    ],
  };
  mkdirSync(path.dirname(options.evaluationOutput), { recursive: true });
  writeFileSync(options.evaluationOutput, `${JSON.stringify(evaluation, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({
    evaluationId,
    planCount: planSummaries.length,
    candidateCount: planSummaries.reduce((total, plan) => total + plan.candidateCount, 0),
    netPairSetSha256: preflight.pairHashes.netEligible,
  }, null, 2));
}

main();
