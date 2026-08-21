import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";

import { stableJson } from "./national-gbif-download";

const DEFAULT_ROUNDS = [70, 72, 74, 75, 76, 77, 78, 79] as const;

type JsonRecord = Record<string, unknown>;

type TaxonAudit = {
  speciesId: string;
  selectionLane: "exploitation" | "exploration" | null;
  selectedPairs: number;
  acceptedPairs: number;
  noQualifyingEvidencePairs: number;
  rejectionGroups: number;
  rejectedArchiveRows: number;
};

type LaneAudit = {
  selectionLane: "exploitation" | "exploration";
  selectedTaxa: number;
  selectedPairs: number;
  presentPairs: number;
  researchedUnresolvedPairs: number;
  marginalYieldPercent: number;
};

export type GbifMarginalYieldRoundAudit = {
  round: number;
  planId: string;
  integrationPath: string | null;
  selectionPath: string;
  partitionReceiptPath: string;
  acquisitionReceiptPath: string;
  selectedTaxa: number;
  selectedPairs: number;
  presentPairs: number;
  researchedUnresolvedPairs: number;
  marginalYieldPercent: number;
  providerRows: number;
  selectedScopeRows: number;
  geographyRejectedRows: number;
  selectedRejectedArchiveRows: number;
  selectedAcceptedArchiveRows: number;
  duplicateAcceptedArchiveRows: number;
  representativeRejectionGroups: number;
  rejectionReasonRows: Record<string, number>;
  perTaxon: TaxonAudit[];
  lanes: LaneAudit[];
  hashes: {
    integrationSha256: string | null;
    selectionSha256: string;
    planSha256: string;
    partitionReceiptSha256: string;
    acquisitionReceiptSha256: string;
  };
  checks: {
    planPairsMatchRuns: true;
    outcomePairsUnique: true;
    outcomesConserved: true;
    acceptedPairsMatchAssertions: true;
    providerRowsConserved: true;
    acceptedArchiveRowsConserved: true;
    selectionLanesConserved: true;
    noAbsenceOrNonDetectionCreated: true;
    immutableOutputHashesMatch: true;
  };
};

export type GbifMarginalYieldAudit = {
  schemaVersion: 1;
  sourceId: "gbif-preserved-specimens";
  rounds: GbifMarginalYieldRoundAudit[];
  aggregate: {
    auditedRounds: number;
    selectedTaxa: number;
    selectedPairs: number;
    presentPairs: number;
    researchedUnresolvedPairs: number;
    providerRows: number;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function relativePath(root: string, filepath: string) {
  return path.relative(root, filepath).replaceAll("\\", "/");
}

async function hashFile(filepath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filepath)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function readNdjson(filepath: string, visit: (record: JsonRecord) => void) {
  const lines = createInterface({ input: createReadStream(filepath, { encoding: "utf8" }), crlfDelay: Infinity });
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      visit(JSON.parse(line) as JsonRecord);
    } catch (error) {
      throw new Error(`${relativePath(process.cwd(), filepath)}:${lineNumber} is not valid NDJSON: ${String(error)}`);
    }
  }
}

function asObject(value: unknown, label: string): JsonRecord {
  assert(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
  return value as JsonRecord;
}

function asArray(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array.`);
  return value;
}

function asString(value: unknown, label: string): string {
  assert(typeof value === "string" && value.length > 0, `${label} must be a nonempty string.`);
  return value;
}

function asNumber(value: unknown, label: string): number {
  assert(typeof value === "number" && Number.isInteger(value) && value >= 0, `${label} must be a nonnegative integer.`);
  return value;
}

function increment(counts: Map<string, number>, key: string, amount = 1) {
  counts.set(key, (counts.get(key) ?? 0) + amount);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortedRecord(counts: Map<string, number>) {
  return Object.fromEntries([...counts].sort(([left], [right]) => compareText(left, right)));
}

function rejectionWeight(rejection: JsonRecord) {
  let weight = 1;
  let groupedNoteCount = 0;
  for (const note of asArray(rejection.supporting_notes, "rejection.supporting_notes")) {
    assert(typeof note === "string", "Rejection supporting notes must be strings.");
    const match = /^Representative of ([0-9]+) archive row\(s\) in this bounded rejection group\.$/.exec(note);
    if (!match) continue;
    groupedNoteCount += 1;
    weight = Number.parseInt(match[1], 10);
  }
  assert(groupedNoteCount <= 1 && Number.isInteger(weight) && weight >= 1, "Rejection group weight is invalid.");
  return weight;
}

function findIntegrationPath(root: string, round: number) {
  const evaluationsDir = path.join(root, "ops", "national-research", "evaluations");
  const prefix = `round-${round}-gbif-national-acquisition-integration-`;
  const matches = readdirSync(evaluationsDir).filter((name) => name.startsWith(prefix) && name.endsWith(".json"));
  assert(matches.length <= 1, `Expected at most one Round ${round} GBIF integration receipt, found ${matches.length}.`);
  return matches.length === 1 ? path.join(evaluationsDir, matches[0]) : null;
}

function findPlanPath(root: string, round: number) {
  const plansDir = path.join(root, "src", "data", "research", "national-acquisition-plans");
  const prefix = `gbif-national-download-v2-round-${round}-`;
  const matches = readdirSync(plansDir).filter((name) => name.startsWith(prefix) && name.endsWith(".json"));
  assert(matches.length === 1, `Expected exactly one Round ${round} GBIF v2 plan, found ${matches.length}.`);
  return path.join(plansDir, matches[0]);
}

function findDirectPartitionPath(root: string, round: number, planPath: string, selectionPath: string) {
  const evaluationsDir = path.join(root, "ops", "national-research", "evaluations");
  const relativePlanPath = relativePath(root, planPath);
  const relativeSelectionPath = relativePath(root, selectionPath);
  const matches = readdirSync(evaluationsDir)
    .filter((name) => name.startsWith("gbif-national-partition-") && name.endsWith(".json"))
    .map((name) => path.join(evaluationsDir, name))
    .filter((candidatePath) => {
      const candidate = readJson<JsonRecord>(candidatePath);
      const inputHashes = candidate.inputHashes && typeof candidate.inputHashes === "object" && !Array.isArray(candidate.inputHashes)
        ? candidate.inputHashes as JsonRecord
        : {};
      return candidate.selectionPath === relativeSelectionPath && typeof inputHashes[relativePlanPath] === "string";
    });
  assert(matches.length === 1, `Expected exactly one direct Round ${round} GBIF partition receipt, found ${matches.length}.`);
  return matches[0];
}

async function auditRound(root: string, round: number): Promise<GbifMarginalYieldRoundAudit> {
  const integrationPath = findIntegrationPath(root, round);
  const integration = integrationPath ? readJson<JsonRecord>(integrationPath) : null;
  const integrationSelection = integration ? asObject(integration.selection, `Round ${round} integration.selection`) : null;
  const integrationPartition = integration ? asObject(integration.partition, `Round ${round} integration.partition`) : null;
  const planPath = integrationSelection
    ? path.join(root, "src", "data", "research", "national-acquisition-plans", `${asString(integrationSelection.planId, `Round ${round} selection.planId`)}.json`)
    : findPlanPath(root, round);
  const plan = readJson<JsonRecord>(planPath);
  const planId = asString(plan.planId, `Round ${round} plan.planId`);
  const speciesIds = asArray(plan.speciesIds, `Round ${round} plan.speciesIds`).map((value) => asString(value, "plan species ID"));
  assert(new Set(speciesIds).size === speciesIds.length, `Round ${round} plan repeats species IDs.`);
  const expectedPairs = asNumber(plan.expectedNotResearchedPairsAtBaseline, `Round ${round} expectedNotResearchedPairsAtBaseline`);
  const selectionPathValue = typeof plan.selectionEvidencePath === "string"
    ? plan.selectionEvidencePath
    : integrationSelection?.selectionEvidencePath;
  const selectionPath = path.join(root, asString(selectionPathValue, `Round ${round} selection evidence path`));
  const selectionReceipt = readJson<JsonRecord>(selectionPath);
  assert(selectionReceipt.planId === planId, `Round ${round} selection and plan identities differ.`);
  const partitionReceiptPath = integrationPartition
    ? path.join(root, asString(integrationPartition.receiptPath, `Round ${round} partition.receiptPath`))
    : findDirectPartitionPath(root, round, planPath, selectionPath);
  const partition = readJson<JsonRecord>(partitionReceiptPath);
  assert(partition.status === "complete", `Round ${round} partition is not complete.`);
  const acquisitionReceiptPath = path.join(root, asString(partition.acquisitionReceiptPath, `Round ${round} acquisitionReceiptPath`));
  const acquisition = readJson<JsonRecord>(acquisitionReceiptPath);
  assert(acquisition.status === "complete", `Round ${round} acquisition is not complete.`);
  assert(acquisition.source_id === "gbif-preserved-specimens", `Round ${round} acquisition source differs.`);
  const download = asObject(acquisition.download, `Round ${round} acquisition.download`);
  assert(download.status === "SUCCEEDED", `Round ${round} provider download did not succeed.`);
  const providerRows = asNumber(download.totalRecords, `Round ${round} provider totalRecords`);

  const acquisitionReceiptSha256 = await hashFile(acquisitionReceiptPath);
  assert(
    acquisitionReceiptSha256 === asString(partition.acquisitionReceiptSha256, `Round ${round} partition acquisition hash`),
    `Round ${round} acquisition receipt hash differs from its partition receipt.`,
  );

  const laneBySpecies = new Map<string, "exploitation" | "exploration">();
  if (plan.selectionModel != null) {
    for (const rawTaxon of asArray(selectionReceipt.taxa, `Round ${round} selection taxa`)) {
      const taxon = asObject(rawTaxon, `Round ${round} selection taxon`);
      const speciesId = asString(taxon.speciesId, `Round ${round} selection taxon speciesId`);
      const lane = asString(taxon.selectionLane, `Round ${round} ${speciesId} selection lane`);
      assert(lane === "exploitation" || lane === "exploration", `Round ${round} ${speciesId} selection lane is invalid.`);
      assert(!laneBySpecies.has(speciesId), `Round ${round} repeats selection lane for ${speciesId}.`);
      laneBySpecies.set(speciesId, lane);
    }
    assert(speciesIds.every((speciesId) => laneBySpecies.has(speciesId)), `Round ${round} selection lanes do not cover every planned taxon.`);
  }

  const taxa = new Map<string, TaxonAudit>(speciesIds.map((speciesId) => [speciesId, {
    speciesId,
    selectionLane: laneBySpecies.get(speciesId) ?? null,
    selectedPairs: 0,
    acceptedPairs: 0,
    noQualifyingEvidencePairs: 0,
    rejectionGroups: 0,
    rejectedArchiveRows: 0,
  }]));
  const outcomePairs = new Set<string>();
  const assertionPairs = new Set<string>();
  const reasonRows = new Map<string, number>();
  let statePairSum = 0;
  let runRequestedPairs = 0;
  let outcomeRows = 0;
  let presentPairs = 0;
  let unresolvedPairs = 0;
  let assertionRows = 0;
  let selectedScopeRows = 0;
  let representativeRejectionGroups = 0;
  let selectedRejectedArchiveRows = 0;
  let immutableOutputHashesMatch = true;

  for (const rawStatePartition of asArray(partition.statePartitions, `Round ${round} statePartitions`)) {
    const statePartition = asObject(rawStatePartition, `Round ${round} state partition`);
    const stateCode = asString(statePartition.stateCode, `Round ${round} stateCode`);
    const pairCount = asNumber(statePartition.pairCount, `Round ${round} ${stateCode} pairCount`);
    statePairSum += pairCount;
    if (statePartition.runCreated === false) {
      assert(pairCount === 0 && statePartition.runId == null, `Round ${round} ${stateCode} has an invalid empty partition.`);
      continue;
    }
    assert(statePartition.runCreated === true, `Round ${round} ${stateCode} runCreated is invalid.`);
    const runId = asString(statePartition.runId, `Round ${round} ${stateCode} runId`);
    const runDir = path.join(root, "src", "data", "research", "runs", runId);
    const runReceipt = readJson<JsonRecord>(path.join(runDir, "receipt.json"));
    assert(runReceipt.run_id === runId && runReceipt.status === "complete", `Round ${round} ${stateCode} run receipt identity differs.`);
    const requestedScope = asObject(runReceipt.requested_scope, `Round ${round} ${stateCode} requested_scope`);
    assert(requestedScope.state_code === stateCode, `Round ${round} ${stateCode} requested scope differs.`);
    const counts = asObject(runReceipt.counts, `Round ${round} ${stateCode} counts`);
    const requestedPairs = asNumber(counts.requested_pairs, `Round ${round} ${stateCode} requested_pairs`);
    assert(requestedPairs === pairCount, `Round ${round} ${stateCode} pair count differs from its run receipt.`);
    runRequestedPairs += requestedPairs;
    selectedScopeRows += asNumber(counts.candidate_records, `Round ${round} ${stateCode} candidate_records`);

    for (const rawOutput of asArray(runReceipt.outputs, `Round ${round} ${stateCode} outputs`)) {
      const output = asObject(rawOutput, `Round ${round} ${stateCode} output`);
      const outputPath = path.join(root, asString(output.path, `Round ${round} ${stateCode} output path`));
      const outputHash = await hashFile(outputPath);
      if (outputHash !== asString(output.sha256, `Round ${round} ${stateCode} output hash`)) immutableOutputHashesMatch = false;
    }

    await readNdjson(path.join(runDir, "outcomes.ndjson"), (outcome) => {
      const outcomeState = asString(outcome.state_code, "outcome.state_code");
      const countyFips = asString(outcome.county_fips, "outcome.county_fips");
      const speciesId = asString(outcome.species_id, "outcome.species_id");
      assert(outcomeState === stateCode && taxa.has(speciesId), `Round ${round} ${stateCode} outcome scope differs.`);
      const pairKey = `${outcomeState}:${countyFips}:${speciesId}`;
      assert(!outcomePairs.has(pairKey), `Round ${round} repeats outcome pair ${pairKey}.`);
      outcomePairs.add(pairKey);
      outcomeRows += 1;
      const taxon = taxa.get(speciesId)!;
      taxon.selectedPairs += 1;
      if (outcome.status === "evidence-found") {
        presentPairs += 1;
        taxon.acceptedPairs += 1;
      } else if (outcome.status === "no-qualifying-evidence") {
        unresolvedPairs += 1;
        taxon.noQualifyingEvidencePairs += 1;
      } else {
        throw new Error(`Round ${round} has unsupported GBIF outcome status ${String(outcome.status)}.`);
      }
    });

    await readNdjson(path.join(runDir, "assertions.ndjson"), (assertion) => {
      const assertionState = asString(assertion.state_code, "assertion.state_code");
      const countyFips = asString(assertion.county_fips, "assertion.county_fips");
      const speciesId = asString(assertion.species_id, "assertion.species_id");
      assert(assertionState === stateCode && taxa.has(speciesId), `Round ${round} ${stateCode} assertion scope differs.`);
      const pairKey = `${assertionState}:${countyFips}:${speciesId}`;
      assert(!assertionPairs.has(pairKey), `Round ${round} repeats assertion pair ${pairKey}.`);
      assertionPairs.add(pairKey);
      assertionRows += 1;
    });

    await readNdjson(path.join(runDir, "rejections.ndjson"), (rejection) => {
      const reasonCode = asString(rejection.reason_code, "rejection.reason_code");
      const weight = rejectionWeight(rejection);
      representativeRejectionGroups += 1;
      increment(reasonRows, reasonCode, weight);
      const normalizedTarget = rejection.normalized_target == null ? null : asObject(rejection.normalized_target, "rejection.normalized_target");
      if (normalizedTarget?.county_fips == null) return;
      asString(normalizedTarget.county_fips, "rejection normalized county FIPS");
      selectedRejectedArchiveRows += weight;
      const speciesId = asString(normalizedTarget.species_id, "rejection normalized species ID");
      const taxon = taxa.get(speciesId);
      assert(taxon, `Round ${round} rejection species ${speciesId} is outside plan scope.`);
      taxon.rejectionGroups += 1;
      taxon.rejectedArchiveRows += weight;
    });
  }

  assert(immutableOutputHashesMatch, `Round ${round} immutable run output hash differs.`);
  assert(statePairSum === expectedPairs && runRequestedPairs === expectedPairs, `Round ${round} plan and run pairs do not reconcile.`);
  assert(outcomeRows === expectedPairs && outcomePairs.size === expectedPairs, `Round ${round} outcome pairs do not reconcile.`);
  assert(presentPairs + unresolvedPairs === expectedPairs, `Round ${round} outcome statuses do not conserve selected pairs.`);
  assert(assertionRows === presentPairs && assertionPairs.size === presentPairs, `Round ${round} accepted pairs and assertions differ.`);
  assert([...assertionPairs].every((pairKey) => outcomePairs.has(pairKey)), `Round ${round} assertion pair is outside outcomes.`);
  const geographyRejectedRows = providerRows - selectedScopeRows;
  const selectedAcceptedArchiveRows = selectedScopeRows - selectedRejectedArchiveRows;
  const duplicateAcceptedArchiveRows = selectedAcceptedArchiveRows - presentPairs;
  assert(geographyRejectedRows >= 0 && selectedAcceptedArchiveRows >= 0, `Round ${round} provider-row buckets are invalid.`);
  assert(duplicateAcceptedArchiveRows >= 0, `Round ${round} accepted archive rows are fewer than unique evidence pairs.`);
  assert(
    providerRows === geographyRejectedRows + selectedRejectedArchiveRows + selectedAcceptedArchiveRows,
    `Round ${round} provider rows do not conserve.`,
  );
  assert(
    selectedAcceptedArchiveRows === presentPairs + duplicateAcceptedArchiveRows,
    `Round ${round} accepted archive rows do not reconcile to unique pairs and duplicates.`,
  );

  const perTaxon = [...taxa.values()].sort((left, right) => compareText(left.speciesId, right.speciesId));
  const lanes = (["exploitation", "exploration"] as const)
    .map((selectionLane) => {
      const entries = perTaxon.filter((taxon) => taxon.selectionLane === selectionLane);
      const selectedPairs = entries.reduce((sum, taxon) => sum + taxon.selectedPairs, 0);
      const presentPairs = entries.reduce((sum, taxon) => sum + taxon.acceptedPairs, 0);
      return {
        selectionLane,
        selectedTaxa: entries.length,
        selectedPairs,
        presentPairs,
        researchedUnresolvedPairs: selectedPairs - presentPairs,
        marginalYieldPercent: selectedPairs === 0 ? 0 : Number(((presentPairs / selectedPairs) * 100).toFixed(3)),
      };
    })
    .filter((lane) => lane.selectedTaxa > 0);
  if (laneBySpecies.size > 0) {
    const laneCounts = asObject(selectionReceipt.laneCounts, `Round ${round} selection laneCounts`);
    const exploitationPairs = lanes.find((lane) => lane.selectionLane === "exploitation")?.selectedPairs ?? 0;
    const explorationPairs = lanes.find((lane) => lane.selectionLane === "exploration")?.selectedPairs ?? 0;
    assert(exploitationPairs === asNumber(laneCounts.exploitationPairs, `Round ${round} exploitationPairs`), `Round ${round} exploitation lane pairs differ.`);
    assert(explorationPairs === asNumber(laneCounts.explorationPairs, `Round ${round} explorationPairs`), `Round ${round} exploration lane pairs differ.`);
    assert(exploitationPairs + explorationPairs === expectedPairs, `Round ${round} selection lanes do not conserve planned pairs.`);
  }

  return {
    round,
    planId,
    integrationPath: integrationPath ? relativePath(root, integrationPath) : null,
    selectionPath: relativePath(root, selectionPath),
    partitionReceiptPath: relativePath(root, partitionReceiptPath),
    acquisitionReceiptPath: relativePath(root, acquisitionReceiptPath),
    selectedTaxa: speciesIds.length,
    selectedPairs: expectedPairs,
    presentPairs,
    researchedUnresolvedPairs: unresolvedPairs,
    marginalYieldPercent: Number(((presentPairs / expectedPairs) * 100).toFixed(3)),
    providerRows,
    selectedScopeRows,
    geographyRejectedRows,
    selectedRejectedArchiveRows,
    selectedAcceptedArchiveRows,
    duplicateAcceptedArchiveRows,
    representativeRejectionGroups,
    rejectionReasonRows: sortedRecord(reasonRows),
    perTaxon,
    lanes,
    hashes: {
      integrationSha256: integrationPath ? await hashFile(integrationPath) : null,
      selectionSha256: await hashFile(selectionPath),
      planSha256: await hashFile(planPath),
      partitionReceiptSha256: await hashFile(partitionReceiptPath),
      acquisitionReceiptSha256,
    },
    checks: {
      planPairsMatchRuns: true,
      outcomePairsUnique: true,
      outcomesConserved: true,
      acceptedPairsMatchAssertions: true,
      providerRowsConserved: true,
      acceptedArchiveRowsConserved: true,
      selectionLanesConserved: true,
      noAbsenceOrNonDetectionCreated: true,
      immutableOutputHashesMatch: true,
    },
  };
}

export async function auditGbifNationalMarginalYield(root = process.cwd(), rounds: readonly number[] = DEFAULT_ROUNDS): Promise<GbifMarginalYieldAudit> {
  assert(rounds.length > 0 && new Set(rounds).size === rounds.length, "Audit rounds must be nonempty and unique.");
  const auditedRounds: GbifMarginalYieldRoundAudit[] = [];
  for (const round of rounds) auditedRounds.push(await auditRound(root, round));
  return {
    schemaVersion: 1,
    sourceId: "gbif-preserved-specimens",
    rounds: auditedRounds,
    aggregate: {
      auditedRounds: auditedRounds.length,
      selectedTaxa: auditedRounds.reduce((sum, entry) => sum + entry.selectedTaxa, 0),
      selectedPairs: auditedRounds.reduce((sum, entry) => sum + entry.selectedPairs, 0),
      presentPairs: auditedRounds.reduce((sum, entry) => sum + entry.presentPairs, 0),
      researchedUnresolvedPairs: auditedRounds.reduce((sum, entry) => sum + entry.researchedUnresolvedPairs, 0),
      providerRows: auditedRounds.reduce((sum, entry) => sum + entry.providerRows, 0),
    },
  };
}

async function main() {
  const audit = await auditGbifNationalMarginalYield();
  const args = process.argv.slice(2);
  if (args.length === 0) {
    process.stdout.write(stableJson(audit));
    return;
  }
  assert(args.length === 2 && args[0] === "--output" && args[1], "Expected either no arguments or --output <path>.");
  const outputPath = path.resolve(args[1]);
  assert(!existsSync(outputPath), "GBIF marginal-yield audit refuses to overwrite an existing artifact.");
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const contents = stableJson(audit);
  writeFileSync(outputPath, contents, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: relativePath(process.cwd(), outputPath),
    outputSha256: createHash("sha256").update(contents).digest("hex"),
    rounds: audit.rounds.map((entry) => entry.round),
    selectedPairs: audit.aggregate.selectedPairs,
    presentPairs: audit.aggregate.presentPairs,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main();
}
