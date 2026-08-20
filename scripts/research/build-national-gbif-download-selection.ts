import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { listCountyEquivalents } from "@/lib/research/geography-registry";

import {
  compareText,
  loadNationalGbifDownloadPlan,
  NationalGbifSelectionSchema,
  resolveNationalGbifTaxa,
  sha256,
} from "./national-gbif-download";
import {
  buildNationalGbifDualObjectiveSelection,
  loadNationalGbifYieldPrior,
} from "./national-gbif-selection-planner";

type CountyPair = {
  speciesId: string;
  displayStatus: string;
  researchStatus: string;
};

type CountyShard = {
  stateCode: string;
  countyFips: string;
  pairResolution: { defaultDisplayStatus: string };
  pairs: CountyPair[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function parseArgs(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    assert(key?.startsWith("--") && value, `Invalid argument near ${key ?? "end"}.`);
    values.set(key.slice(2), value);
  }
  const plan = values.get("plan");
  assert(plan, "--plan is required.");
  const establishPlanHash = values.get("establish-plan-hash") === "true";
  return { planPath: path.resolve(plan), establishPlanHash };
}

function readJson<T>(filepath: string) {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function main() {
  const root = process.cwd();
  const { planPath, establishPlanHash } = parseArgs(process.argv.slice(2));
  const plan = loadNationalGbifDownloadPlan(planPath);
  assert(plan.schemaVersion === 2, "GBIF national selection requires a v2 plan.");
  assert(plan.expectedGrossPairs && plan.expectedNotResearchedPairsAtBaseline, "GBIF v2 plan counts are missing.");
  execFileSync("git", ["diff", "--quiet", plan.baselineCommit, "--", "public/generated/research", "src/data/generated/research"], { cwd: root });
  const selectedTaxa = resolveNationalGbifTaxa(root, plan);
  const universePlanPath = path.resolve(root, plan.selectionUniversePlanPath!);
  const universePlanBytes = readFileSync(universePlanPath);
  assert(sha256(universePlanBytes) === plan.selectionUniversePlanSha256, "GBIF selection universe plan hash changed.");
  const universePlan = loadNationalGbifDownloadPlan(universePlanPath);
  assert(
    universePlan.schemaVersion === 1 &&
      universePlan.taxonomyCacheSha256 === plan.taxonomyCacheSha256 &&
      JSON.stringify(universePlan.nationalV1StateCodes) === JSON.stringify(plan.nationalV1StateCodes),
    "GBIF selection universe plan is incompatible with the v2 plan.",
  );
  const taxa = resolveNationalGbifTaxa(root, universePlan);
  const selectedSpeciesIds = new Set(selectedTaxa.map((taxon) => taxon.speciesId));
  assert(selectedSpeciesIds.size === selectedTaxa.length, "GBIF selected taxa repeat species IDs.");
  assert(
    [...selectedSpeciesIds].every((speciesId) => taxa.some((taxon) => taxon.speciesId === speciesId)),
    "GBIF selected taxa are outside the retained exact-cache universe.",
  );
  const speciesCounts = new Map(taxa.map((taxon) => [taxon.speciesId, {
    speciesId: taxon.speciesId,
    scientificName: taxon.scientificName,
    taxonKey: taxon.taxonKey,
    grossPairs: 0,
    notResearchedPairs: 0,
    blockedPairs: 0,
    alreadyResearchedPairs: 0,
  }]));
  let grossPairs = 0;
  let notResearchedPairs = 0;
  let blockedPairs = 0;
  let alreadyResearchedPairs = 0;
  const stateScopes = plan.nationalV1StateCodes.map((stateCode) => {
    const candidatePairs: string[] = [];
    let stateGrossPairs = 0;
    let stateBlockedPairs = 0;
    let stateAlreadyResearchedPairs = 0;
    for (const county of listCountyEquivalents(stateCode)) {
      const shardPath = path.join(root, "public/generated/research", stateCode, "counties", `${county.countyFips}.json`);
      const shard = readJson<CountyShard>(shardPath);
      assert(shard.stateCode === stateCode && shard.countyFips === county.countyFips, `GBIF selection shard identity differs at ${shardPath}.`);
      assert(shard.pairResolution.defaultDisplayStatus === "not-researched", `GBIF selection default status changed at ${shardPath}.`);
      const bySpecies = new Map(shard.pairs.map((pair) => [pair.speciesId, pair]));
      for (const taxon of taxa) {
        const selected = selectedSpeciesIds.has(taxon.speciesId);
        if (selected) {
          grossPairs += 1;
          stateGrossPairs += 1;
        }
        const counts = speciesCounts.get(taxon.speciesId)!;
        counts.grossPairs += 1;
        const pair = bySpecies.get(taxon.speciesId);
        if (!pair) {
          counts.notResearchedPairs += 1;
          if (selected) {
            candidatePairs.push(`${county.countyFips}:${taxon.speciesId}`);
            notResearchedPairs += 1;
          }
          continue;
        }
        if (pair.displayStatus === "not-researched" && pair.researchStatus === "blocked") {
          counts.blockedPairs += 1;
          if (selected) {
            blockedPairs += 1;
            stateBlockedPairs += 1;
          }
          continue;
        }
        if (pair.displayStatus === "not-researched" && pair.researchStatus === "not-started") {
          counts.notResearchedPairs += 1;
          if (selected) {
            candidatePairs.push(`${county.countyFips}:${taxon.speciesId}`);
            notResearchedPairs += 1;
          }
          continue;
        }
        counts.alreadyResearchedPairs += 1;
        if (selected) {
          alreadyResearchedPairs += 1;
          stateAlreadyResearchedPairs += 1;
        }
      }
    }
    candidatePairs.sort(compareText);
    return {
      stateCode,
      grossPairs: stateGrossPairs,
      notResearchedPairs: candidatePairs.length,
      blockedPairs: stateBlockedPairs,
      alreadyResearchedPairs: stateAlreadyResearchedPairs,
      candidatePairSha256: sha256(`${candidatePairs.join("\n")}\n`),
      candidatePairs,
    };
  });
  assert(grossPairs === plan.expectedGrossPairs, `GBIF gross pair count ${grossPairs} differs from plan ${plan.expectedGrossPairs}.`);
  assert(notResearchedPairs === plan.expectedNotResearchedPairsAtBaseline, `GBIF not-researched count ${notResearchedPairs} differs from plan ${plan.expectedNotResearchedPairsAtBaseline}.`);
  assert(blockedPairs === plan.expectedBlockedPairsAtBaseline, `GBIF blocked count ${blockedPairs} differs from plan ${plan.expectedBlockedPairsAtBaseline}.`);
  assert(alreadyResearchedPairs === plan.expectedAlreadyResearchedPairsAtBaseline, `GBIF researched count ${alreadyResearchedPairs} differs from plan ${plan.expectedAlreadyResearchedPairsAtBaseline}.`);
  assert(grossPairs === notResearchedPairs + blockedPairs + alreadyResearchedPairs, "GBIF selection pair classes do not reconcile.");
  const legacyRankedEligibleTaxa = [...speciesCounts.values()].sort(
    (left, right) => right.notResearchedPairs - left.notResearchedPairs || compareText(left.speciesId, right.speciesId),
  );
  let dualObjectiveSelection: ReturnType<typeof buildNationalGbifDualObjectiveSelection> | null = null;
  let yieldPriorId: string | null = null;
  if (plan.selectionModel) {
    const yieldPrior = loadNationalGbifYieldPrior(
      path.resolve(root, plan.selectionModel.yieldPriorPath),
      plan.selectionModel.yieldPriorSha256,
    );
    assert(
      yieldPrior.universe.planId === universePlan.planId &&
        yieldPrior.universe.planSha256 === plan.selectionUniversePlanSha256,
      "GBIF dual-objective yield prior differs from the retained universe plan.",
    );
    yieldPriorId = yieldPrior.priorId;
    dualObjectiveSelection = buildNationalGbifDualObjectiveSelection(
      [...speciesCounts.values()],
      yieldPrior,
      plan.selectionNetThreshold!,
      plan.selectionModel,
    );
    assert(
      JSON.stringify(dualObjectiveSelection.selectedSpeciesIds) === JSON.stringify([...selectedSpeciesIds].sort(compareText)),
      "GBIF plan species are not the deterministic dual-objective portfolio clearing the net threshold.",
    );
  } else {
    let rankedNet = 0;
    const minimalPrefix: string[] = [];
    for (const taxon of legacyRankedEligibleTaxa) {
      if (rankedNet >= plan.selectionNetThreshold!) break;
      minimalPrefix.push(taxon.speciesId);
      rankedNet += taxon.notResearchedPairs;
    }
    assert(rankedNet >= plan.selectionNetThreshold!, "GBIF retained exact-cache universe cannot clear the selection threshold.");
    assert(
      JSON.stringify([...minimalPrefix].sort(compareText)) === JSON.stringify([...selectedSpeciesIds].sort(compareText)),
      "GBIF plan species are not the deterministic smallest ranked prefix clearing the net threshold.",
    );
  }
  const allCandidatePairs = stateScopes.flatMap((scope) => scope.candidatePairs);
  assert(new Set(allCandidatePairs).size === allCandidatePairs.length, "GBIF selection repeats national pair keys.");
  const output = {
    schemaVersion: dualObjectiveSelection ? 2 as const : 1 as const,
    selectionId: plan.selectionId!,
    sourceId: plan.sourceId,
    planId: plan.planId,
    baselineCommit: plan.baselineCommit,
    baselineGeneratedAsOf: plan.baselineGeneratedAsOf,
    selectedAt: plan.selectionTimestamp!,
    selectionPolicy: plan.selectionPolicy!,
    acquisitionShape: "One authenticated provider-native US DWCA download for exact retained GBIF taxon keys, followed by offline exact state and county text partitioning without coordinate assignment.",
    selectionThreshold: plan.selectionNetThreshold!,
    counts: {
      stateCount: stateScopes.length,
      activeCountyCount: grossPairs / selectedTaxa.length,
      taxonCount: selectedTaxa.length,
      grossPairs,
      notResearchedPairs,
      blockedPairs,
      alreadyResearchedPairs,
      expectedNetMovement: notResearchedPairs,
    },
    credentialReadiness: {
      status: "blocked-external-credentials-before-network",
      requiredEnvironmentNames: [...plan.requiredCredentialEnvironment],
      valuesPersisted: false,
    },
    semantics: {
      completeZeroEvidenceBecomesResearchedUnresolved: true,
      completeAcceptedEvidenceBecomesVerifiedPresent: true,
      createsAbsence: false,
      createsNotDetected: false,
      failureOrIncompleteCreatesNegative: false,
      coordinateCountyAssignmentAllowed: false,
    },
    taxa: dualObjectiveSelection
      ? dualObjectiveSelection.selectedTaxa
      : [...speciesCounts.values()]
        .filter((taxon) => selectedSpeciesIds.has(taxon.speciesId))
        .sort((left, right) => compareText(left.speciesId, right.speciesId)),
    rankedEligibleTaxa: dualObjectiveSelection?.rankedEligibleTaxa ?? legacyRankedEligibleTaxa,
    candidatePairSha256: sha256(`${allCandidatePairs.join("\n")}\n`),
    stateScopes,
    ...(dualObjectiveSelection && plan.selectionModel ? {
      rankingModel: plan.selectionModel,
      yieldPrior: {
        priorId: yieldPriorId!,
        universePlanId: universePlan.planId,
      },
      laneCounts: {
        exploitationTargetPairs: dualObjectiveSelection.exploitationTargetPairs,
        exploitationPairs: dualObjectiveSelection.exploitationPairs,
        explorationPairs: dualObjectiveSelection.explorationPairs,
      },
    } : {}),
  };
  const outputPath = path.join(root, plan.selectionEvidencePath);
  NationalGbifSelectionSchema.parse(output);
  const outputContents = `${JSON.stringify(output, null, 2)}\n`;
  const outputSha256 = sha256(outputContents);
  if (establishPlanHash) {
    assert(
      plan.selectionEvidenceSha256 === "0".repeat(64),
      "GBIF selection hash establishment requires an all-zero placeholder in the draft plan.",
    );
    assert(!existsSync(outputPath), "GBIF selection hash establishment refuses to overwrite an existing evidence file.");
  } else {
    assert(outputSha256 === plan.selectionEvidenceSha256, "GBIF selection output hash differs from the committed v2 plan.");
  }
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, outputContents, establishPlanHash ? { flag: "wx" } : undefined);
  process.stdout.write(`${JSON.stringify({
    outputPath: path.relative(root, outputPath).replaceAll("\\", "/"),
    outputSha256: sha256(readFileSync(outputPath)),
    planHashEstablished: establishPlanHash,
    ...output.counts,
    candidatePairSha256: output.candidatePairSha256,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
