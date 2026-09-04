import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  NYBG_ARCHIVE_SHA256,
  NYBG_DATASET_URL,
  NYBG_METADATA_URL,
  NYBG_POLICY_URL,
  NYBG_SOURCE_ID,
  TORCH_BRIT_ARCHIVE_SHA256,
  TORCH_BRIT_DATASET_URL,
  TORCH_BRIT_METADATA_URL,
  TORCH_BRIT_POLICY_URL,
  TORCH_BRIT_SOURCE_ID,
  type RetainedHerbariumTarget,
} from "./adapters/retained-herbarium-preserved-specimens";

type Preflight = {
  schemaVersion: number;
  kind: string;
  sourceId: string;
  evaluatedAt: string;
  datasetIdentity: {
    url: string;
    metadataUrl: string;
    policyUrl: string;
    version?: string;
    publicationDate?: string;
    archiveBytes: number;
    archiveSha256: string;
    occurrenceBytes: number;
    occurrenceSha256: string;
    metaBytes: number;
    metaSha256: string;
    emlBytes: number;
    emlSha256: string;
    citeMeBytes?: number;
    citeMeSha256?: string;
  };
  baseline: { commit: string; determinedPairSetSha256: string };
  semantics: Record<string, string>;
  counts: Record<string, number> & { netEligiblePairs: number; verifiedAbsentConflicts: number };
  pairHashes: Record<string, string> & { netEligible: string };
  rejectionCounts: Record<string, number>;
  rightsCounts?: Record<string, number>;
  states: Record<string, { gross: number; presentOverlap: number; absentConflict: number; netEligible: number }>;
  topSpecies: Array<Record<string, unknown>>;
  netEligiblePairs: string[];
  representativeRecords: Record<string, Omit<RetainedHerbariumTarget, "pairKey">>;
  elapsedMs: number;
};

type Profile = {
  name: "nybg" | "torch-brit";
  sourceId: typeof NYBG_SOURCE_ID | typeof TORCH_BRIT_SOURCE_ID;
  datasetUrl: string;
  metadataUrl: string;
  policyUrl: string;
  datasetVersion: string;
  publicationDate: string;
  datasetLastModified: string;
  datasetEtag: string | null;
  archiveBytes: number;
  archiveSha256: string;
  occurrenceBytes: number;
  occurrenceSha256: string;
  archiveAcquiredAt: string;
  expectedRawNet: number;
};

const PROFILES: Record<Profile["name"], Profile> = {
  nybg: {
    name: "nybg",
    sourceId: NYBG_SOURCE_ID,
    datasetUrl: NYBG_DATASET_URL,
    metadataUrl: NYBG_METADATA_URL,
    policyUrl: NYBG_POLICY_URL,
    datasetVersion: "1.103",
    publicationDate: "2026-08-25",
    datasetLastModified: "Tue, 25 Aug 2026 05:05:10 GMT",
    datasetEtag: null,
    archiveBytes: 736185551,
    archiveSha256: NYBG_ARCHIVE_SHA256,
    occurrenceBytes: 3243235286,
    occurrenceSha256: "69c609fcb3da364149784f9afa9b78a6be61b95318b8e7e768244c1bebc35154",
    archiveAcquiredAt: "2026-09-04T04:13:16.000Z",
    expectedRawNet: 8066,
  },
  "torch-brit": {
    name: "torch-brit",
    sourceId: TORCH_BRIT_SOURCE_ID,
    datasetUrl: TORCH_BRIT_DATASET_URL,
    metadataUrl: TORCH_BRIT_METADATA_URL,
    policyUrl: TORCH_BRIT_POLICY_URL,
    datasetVersion: "2026-09-03",
    publicationDate: "2026-09-03",
    datasetLastModified: "Thu, 03 Sep 2026 16:50:07 GMT",
    datasetEtag: '"7c57d13-65a96f1b83eed"',
    archiveBytes: 130383123,
    archiveSha256: TORCH_BRIT_ARCHIVE_SHA256,
    occurrenceBytes: 539901972,
    occurrenceSha256: "9c8721ef160f19a322a1366e3df82f5068aebdf352c3808993b6e45daaf51e2e",
    archiveAcquiredAt: "2026-09-04T04:08:03.000Z",
    expectedRawNet: 4125,
  },
};

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson<T>(filePath: string) {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function parseArguments(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const profileName = values.get("profile") as Profile["name"] | undefined;
  assert(profileName && profileName in PROFILES, "--profile must be nybg or torch-brit.");
  const preflight = path.resolve(values.get("preflight") ?? "");
  const outputDirectory = path.resolve(ROOT, values.get("output-dir") ?? "");
  const evaluationOutput = path.resolve(ROOT, values.get("evaluation-output") ?? "");
  const excludePreflight = values.get("exclude-preflight") ? path.resolve(values.get("exclude-preflight") ?? "") : null;
  assert(preflight, "--preflight is required.");
  assert(outputDirectory.startsWith(`${ROOT}${path.sep}`), "--output-dir must remain inside the repository.");
  assert(evaluationOutput.startsWith(`${ROOT}${path.sep}`), "--evaluation-output must remain inside the repository.");
  return { profile: PROFILES[profileName], preflight, outputDirectory, evaluationOutput, excludePreflight };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const { profile } = options;
  const preflight = readJson<Preflight>(options.preflight);
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  assert(preflight.schemaVersion === 1 && preflight.kind === "isitusa-source-yield-preflight", `${profile.name} preflight kind differs.`);
  assert(preflight.sourceId === profile.sourceId, `${profile.name} preflight source differs.`);
  assert(preflight.baseline.commit === head, `${profile.name} preflight baseline differs from current HEAD.`);
  assert(preflight.datasetIdentity.url === profile.datasetUrl, `${profile.name} dataset URL differs.`);
  assert(preflight.datasetIdentity.metadataUrl === profile.metadataUrl, `${profile.name} metadata URL differs.`);
  assert(preflight.datasetIdentity.policyUrl === profile.policyUrl, `${profile.name} policy URL differs.`);
  assert(preflight.datasetIdentity.archiveBytes === profile.archiveBytes, `${profile.name} archive byte count differs.`);
  assert(preflight.datasetIdentity.archiveSha256 === profile.archiveSha256, `${profile.name} archive hash differs.`);
  assert(preflight.datasetIdentity.occurrenceBytes === profile.occurrenceBytes, `${profile.name} occurrence byte count differs.`);
  assert(preflight.datasetIdentity.occurrenceSha256 === profile.occurrenceSha256, `${profile.name} occurrence hash differs.`);
  assert(preflight.counts.netEligiblePairs === profile.expectedRawNet, `${profile.name} raw net yield differs.`);
  assert(preflight.counts.verifiedAbsentConflicts === 0, `${profile.name} preflight contains verified-absent conflicts.`);
  assert(sha256([...preflight.netEligiblePairs].sort(compareText).join("\n")) === preflight.pairHashes.netEligible, `${profile.name} net pair hash differs.`);

  const excludedPairs = options.excludePreflight
    ? new Set(readJson<Preflight>(options.excludePreflight).netEligiblePairs)
    : new Set<string>();
  const rawPairs = [...preflight.netEligiblePairs].sort(compareText);
  const excludedCrossSourcePairs = rawPairs.filter((pairKey) => excludedPairs.has(pairKey));
  const selectedPairs = rawPairs.filter((pairKey) => !excludedPairs.has(pairKey));
  assert(new Set(selectedPairs).size === selectedPairs.length, `${profile.name} selected pairs repeat.`);
  assert(selectedPairs.length >= 2000, `${profile.name} residual does not clear the conditional 2000-pair gate.`);

  const targetsByState = new Map<string, RetainedHerbariumTarget[]>();
  const excludedCountsByState = new Map<string, number>();
  for (const pairKey of excludedCrossSourcePairs) {
    const record = preflight.representativeRecords[pairKey];
    assert(record, `${profile.name} preflight lacks an excluded witness for ${pairKey}.`);
    excludedCountsByState.set(record.stateCode, (excludedCountsByState.get(record.stateCode) ?? 0) + 1);
  }
  for (const pairKey of selectedPairs) {
    const record = preflight.representativeRecords[pairKey];
    assert(record, `${profile.name} preflight lacks a witness for ${pairKey}.`);
    assert(`${record.countyFips}:${record.speciesId}` === pairKey, `${profile.name} witness identity differs for ${pairKey}.`);
    const target = { pairKey, ...record } as RetainedHerbariumTarget;
    const targets = targetsByState.get(target.stateCode) ?? [];
    targets.push(target);
    targetsByState.set(target.stateCode, targets);
  }

  mkdirSync(options.outputDirectory, { recursive: true });
  const generatedAt = new Date().toISOString();
  const evaluationId = `${profile.sourceId}-preflight-20260904-r1`;
  const planSummaries: Array<{ stateCode: string; planId: string; candidateCount: number; pairSetSha256: string; path: string }> = [];
  for (const [stateCode, unsortedTargets] of [...targetsByState.entries()].sort(([left], [right]) => compareText(left, right))) {
    const targets = unsortedTargets.sort((left, right) => compareText(left.pairKey, right.pairKey));
    assert(targets.length <= 5000, `${profile.name} ${stateCode} exceeds the 5000-pair runner limit.`);
    const statePairs = targets.map((target) => target.pairKey);
    const pairSetSha256 = sha256(statePairs.join("\n"));
    const planId = `${profile.sourceId}-${stateCode.toLocaleLowerCase("en-US")}-20260904-r1`;
    const outputPath = path.join(options.outputDirectory, `${planId}.json`);
    const plan = {
      schemaVersion: 1,
      planId,
      sourceId: profile.sourceId,
      stateCode,
      generatedAt,
      evaluatedAt: preflight.evaluatedAt,
      dStartCommit: preflight.baseline.commit,
      dStartDeterminedPairSetSha256: preflight.baseline.determinedPairSetSha256,
      candidates: targets.map((target) => ({ sourceId: profile.sourceId, speciesId: target.speciesId, countyFips: target.countyFips })),
      retainedHerbarium: {
        mode: "retained-archive-witnesses",
        profile: profile.name,
        datasetUrl: profile.datasetUrl,
        metadataUrl: profile.metadataUrl,
        usagePolicyUrl: profile.policyUrl,
        datasetVersion: profile.datasetVersion,
        publicationDate: profile.publicationDate,
        datasetLastModified: profile.datasetLastModified,
        datasetEtag: profile.datasetEtag,
        archiveBytes: profile.archiveBytes,
        archiveSha256: profile.archiveSha256,
        occurrenceBytes: profile.occurrenceBytes,
        occurrenceSha256: profile.occurrenceSha256,
        archiveAcquiredAt: profile.archiveAcquiredAt,
        preflightEvaluationId: evaluationId,
        targetPairSetSha256: pairSetSha256,
        targets,
      },
      antiDuplication: {
        dStartDeterminedPairs: 291263,
        rawNetPairsAtDStart: preflight.counts.netEligiblePairs,
        excludedEarlierSourcePairs: excludedCountsByState.get(stateCode) ?? 0,
        selectedNetPairs: targets.length,
        sameSourceSnapshotCompleteOverlaps: 0,
        priorPlanOverlaps: 0,
      },
    };
    writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`);
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
    status: selectedPairs.length >= 5000 ? "go" : "conditional-bundled",
    objective: `Measure ${profile.sourceId} completely against the pinned current county-species determination set and retain only strict, unique historical-presence witnesses.`,
    canonicalCheckout: "C:/Code/project-isitusa",
    baseline: preflight.baseline,
    datasetIdentity: {
      ...preflight.datasetIdentity,
      datasetVersion: profile.datasetVersion,
      publicationDate: profile.publicationDate,
      lastModified: profile.datasetLastModified,
      etag: profile.datasetEtag,
      acquiredAt: profile.archiveAcquiredAt,
      retainedLocalArchive: profile.name === "nybg"
        ? "C:/Users/Ocean/AppData/Local/Temp/isitusa-nybg-20260904/dwca-occurrences-v1.103.zip"
        : "C:/Users/Ocean/AppData/Local/Temp/isitusa-torch-brit-20260904/BRIT-BRIT_DwC-A.zip",
    },
    decision: {
      disposition: selectedPairs.length >= 5000 ? "go" : "conditional-bundled-with-nybg",
      rawNetEligiblePairsAtDStart: preflight.counts.netEligiblePairs,
      excludedCrossSourcePairs: excludedCrossSourcePairs.length,
      selectedNetEligiblePairs: selectedPairs.length,
      verifiedAbsentConflicts: preflight.counts.verifiedAbsentConflicts,
    },
    exactMeasurement: preflight.counts,
    pairHashes: {
      ...preflight.pairHashes,
      excludedCrossSource: sha256(excludedCrossSourcePairs.join("\n")),
      selected: sha256(selectedPairs.join("\n")),
    },
    semantics: preflight.semantics,
    rejectionCounts: preflight.rejectionCounts,
    rightsCounts: preflight.rightsCounts ?? null,
    stateMeasurements: preflight.states,
    topSpecies: preflight.topSpecies,
    preflightElapsedMs: preflight.elapsedMs,
    plans: planSummaries,
    safeguards: [
      "Only preserved-specimen rows with stable identities, a valid event year, an exact source species rank, a blank identification qualifier, an exact unique two-token catalog plant binomial, and one active county alias qualified.",
      "Cultivated or captive text in locality, occurrence remarks, habitat, or establishment means was rejected conservatively.",
      "All already determined pairs and the selected earlier-source pair set were removed exactly; verified-absent conflicts were separately blocked and measured at zero.",
      "Source silence and all rejected rows create no absence or non-detection outcome.",
      "No R2 action, push, deployment, or public data mutation occurred.",
    ],
  };
  mkdirSync(path.dirname(options.evaluationOutput), { recursive: true });
  writeFileSync(options.evaluationOutput, `${JSON.stringify(evaluation, null, 2)}\n`);
  console.log(JSON.stringify({
    evaluationId,
    planCount: planSummaries.length,
    rawNetPairs: rawPairs.length,
    excludedCrossSourcePairs: excludedCrossSourcePairs.length,
    selectedNetPairs: selectedPairs.length,
    selectedPairSetSha256: sha256(selectedPairs.join("\n")),
  }, null, 2));
}

main();
