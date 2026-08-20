import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { listCountyEquivalents } from "@/lib/research/geography-registry";
import { z } from "zod";

import {
  loadNationalGbifDownloadPlan,
  resolveNationalGbifTaxa,
  sha256,
  stableJson,
} from "./national-gbif-download";
import {
  buildNationalGbifDualObjectiveSelection,
  loadNationalGbifYieldPrior,
  NationalGbifSelectionModelSchema,
} from "./national-gbif-selection-planner";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitShaSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const SelectionLaneSchema = z.union([z.literal("exploitation"), z.literal("exploration"), z.null()]);

const RankedTaxonSchema = z.object({
  speciesId: z.string().regex(/^[a-z0-9-]+$/u),
  scientificName: z.string().min(1),
  taxonKey: z.number().int().positive(),
  grossPairs: z.number().int().nonnegative(),
  notResearchedPairs: z.number().int().nonnegative(),
  blockedPairs: z.number().int().nonnegative(),
  alreadyResearchedPairs: z.number().int().nonnegative(),
  category: z.string().min(1),
  displayGroup: z.string().min(1),
  yieldPriorScope: z.union([z.literal("display-group"), z.literal("category"), z.literal("global")]),
  yieldPriorScopeKey: z.string().min(1),
  yieldPriorObservedPairs: z.number().int().nonnegative(),
  yieldPriorPresentPairs: z.number().int().nonnegative(),
  expectedPresentBps: z.number().int().min(0).max(10_000),
  movementScoreBps: z.number().int().min(0).max(10_000),
  likelyYieldScoreBps: z.number().int().min(0).max(10_000),
  compositeScoreBps: z.number().int().min(0).max(10_000),
  exploitationRank: z.number().int().positive(),
  explorationRank: z.number().int().positive().nullable(),
  explorationBreadthScore: z.number().int().min(0).max(2),
  selectionLane: SelectionLaneSchema,
}).strict();

export const NationalGbifYieldRescoreSchema = z.object({
  schemaVersion: z.literal(1),
  evaluationId: z.string().regex(/^post-round-[0-9]+-gbif-exact-cache-rescore-[0-9]{8}-r[0-9]+$/u),
  evaluatedAt: z.string().datetime(),
  baselineSha: GitShaSchema,
  generatedContentCommit: GitShaSchema,
  sourceId: z.literal("gbif-preserved-specimens"),
  universe: z.object({
    planPath: z.string().regex(/^src\/data\/research\/national-acquisition-plans\/[a-z0-9.-]+\.json$/u),
    planId: z.string().min(1),
    planSha256: Sha256Schema,
    taxonomyCachePath: z.string().min(1),
    taxonomyCacheSha256: Sha256Schema,
    stateCount: z.number().int().positive(),
    countyCount: z.number().int().positive(),
    taxonCount: z.number().int().positive(),
    grossPairs: z.number().int().positive(),
  }).strict(),
  yieldPrior: z.object({
    path: z.string().regex(/^ops\/national-research\/evaluations\/[a-z0-9.-]+\.json$/u),
    sha256: Sha256Schema,
    priorId: z.string().min(1),
    auditedRounds: z.array(z.number().int().positive()).min(1),
    selectedPairs: z.number().int().positive(),
    presentPairs: z.number().int().nonnegative(),
    weightedYieldBps: z.number().int().min(0).max(10_000),
  }).strict(),
  model: NationalGbifSelectionModelSchema,
  corpus: z.object({
    taxonCountsSha256: Sha256Schema,
    notResearchedPairs: z.number().int().nonnegative(),
    blockedPairs: z.number().int().nonnegative(),
    alreadyResearchedPairs: z.number().int().nonnegative(),
  }).strict(),
  selection: z.object({
    thresholdPairs: z.number().int().positive(),
    exploitationTargetPairs: z.number().int().positive(),
    exploitationPairs: z.number().int().nonnegative(),
    explorationPairs: z.number().int().nonnegative(),
    expectedNetMovement: z.number().int().positive(),
    selectedTaxa: z.array(RankedTaxonSchema).min(1),
  }).strict(),
  rankedEligibleTaxa: z.array(RankedTaxonSchema).min(1),
  checks: z.object({
    generatedTreesMatchPinnedCommit: z.literal(true),
    universeMatchesPrior: z.literal(true),
    pairClassesConserved: z.literal(true),
    thresholdCleared: z.literal(true),
    selectionLanesConserved: z.literal(true),
    deterministicRanking: z.literal(true),
  }).strict(),
  semantics: z.object({
    planningHeuristicOnly: z.literal(true),
    guaranteesFutureYield: z.literal(false),
    createsAbsence: z.literal(false),
    createsNotDetected: z.literal(false),
    authorizesProviderRequest: z.literal(false),
    authorizesPublication: z.literal(false),
  }).strict(),
  operations: z.object({
    networkRequests: z.literal(0),
    providerPosts: z.literal(0),
    generationCommands: z.literal(0),
    publicationMutations: z.literal(0),
  }).strict(),
}).strict().superRefine((value, context) => {
  if (
    value.universe.grossPairs !==
      value.corpus.notResearchedPairs + value.corpus.blockedPairs + value.corpus.alreadyResearchedPairs
  ) {
    context.addIssue({ code: "custom", message: "GBIF rescore pair classes do not conserve the exact-cache universe." });
  }
  if (
    value.selection.exploitationPairs + value.selection.explorationPairs !== value.selection.expectedNetMovement ||
    value.selection.expectedNetMovement < value.selection.thresholdPairs
  ) {
    context.addIssue({ code: "custom", message: "GBIF rescore selection lanes do not clear and conserve the threshold." });
  }
  const selectedIds = value.selection.selectedTaxa.map((entry) => entry.speciesId);
  const rankedSelectedIds = value.rankedEligibleTaxa
    .filter((entry) => entry.selectionLane !== null)
    .map((entry) => entry.speciesId)
    .sort();
  if (
    selectedIds.some((speciesId, index) => index > 0 && selectedIds[index - 1]! >= speciesId) ||
    JSON.stringify(selectedIds) !== JSON.stringify(rankedSelectedIds) ||
    value.selection.selectedTaxa.some((entry) => entry.selectionLane === null || entry.notResearchedPairs === 0)
  ) {
    context.addIssue({ code: "custom", message: "GBIF rescore selected taxa do not reconcile to the deterministic ranking." });
  }
  if (
    value.model.yieldPriorPath !== value.yieldPrior.path ||
    value.model.yieldPriorSha256 !== value.yieldPrior.sha256
  ) {
    context.addIssue({ code: "custom", message: "GBIF rescore model does not pin its declared yield prior." });
  }
});

type CountyShard = {
  stateCode: string;
  countyFips: string;
  pairResolution: { defaultDisplayStatus: string };
  pairs: Array<{ speciesId: string; displayStatus: string; researchStatus: string }>;
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
  const required = [
    "universe-plan", "yield-prior", "yield-prior-sha256", "output", "evaluation-id",
    "evaluated-at", "baseline-sha", "generated-content-commit",
  ];
  assert(required.every((key) => values.has(key)), `Missing required argument; expected ${required.join(", ")}.`);
  const thresholdPairs = Number.parseInt(values.get("threshold-pairs") ?? "25000", 10);
  const movementWeightBps = Number.parseInt(values.get("movement-weight-bps") ?? "6000", 10);
  const likelyYieldWeightBps = Number.parseInt(values.get("likely-yield-weight-bps") ?? "4000", 10);
  const explorationTargetBps = Number.parseInt(values.get("exploration-target-bps") ?? "2000", 10);
  assert([thresholdPairs, movementWeightBps, likelyYieldWeightBps, explorationTargetBps].every(Number.isInteger), "GBIF rescore numeric arguments must be integers.");
  return {
    universePlanPath: path.resolve(values.get("universe-plan")!),
    yieldPriorPath: path.resolve(values.get("yield-prior")!),
    yieldPriorSha256: values.get("yield-prior-sha256")!,
    outputPath: path.resolve(values.get("output")!),
    evaluationId: values.get("evaluation-id")!,
    evaluatedAt: values.get("evaluated-at")!,
    baselineSha: values.get("baseline-sha")!,
    generatedContentCommit: values.get("generated-content-commit")!,
    thresholdPairs,
    movementWeightBps,
    likelyYieldWeightBps,
    explorationTargetBps,
  };
}

function relativePath(root: string, filepath: string) {
  return path.relative(root, filepath).replaceAll("\\", "/");
}

function main() {
  const root = process.cwd();
  const args = parseArgs(process.argv.slice(2));
  assert(!existsSync(args.outputPath), "GBIF yield rescore refuses to overwrite an existing artifact.");
  execFileSync("git", ["merge-base", "--is-ancestor", args.generatedContentCommit, args.baselineSha], { cwd: root });
  execFileSync("git", ["diff", "--quiet", args.generatedContentCommit, "--", "public/generated/research", "src/data/generated/research"], { cwd: root });

  const universePlanBytes = readFileSync(args.universePlanPath);
  const universePlan = loadNationalGbifDownloadPlan(args.universePlanPath);
  assert(universePlan.schemaVersion === 1, "GBIF rescore requires the retained v1 exact-cache universe plan.");
  const prior = loadNationalGbifYieldPrior(args.yieldPriorPath, args.yieldPriorSha256);
  assert(
    prior.universe.planId === universePlan.planId && prior.universe.planSha256 === sha256(universePlanBytes),
    "GBIF rescore prior and exact-cache universe differ.",
  );
  const taxa = resolveNationalGbifTaxa(root, universePlan);
  const counts = new Map(taxa.map((taxon) => [taxon.speciesId, {
    speciesId: taxon.speciesId,
    scientificName: taxon.scientificName,
    taxonKey: taxon.taxonKey,
    grossPairs: 0,
    notResearchedPairs: 0,
    blockedPairs: 0,
    alreadyResearchedPairs: 0,
  }]));
  let countyCount = 0;
  for (const stateCode of universePlan.nationalV1StateCodes) {
    for (const county of listCountyEquivalents(stateCode)) {
      countyCount += 1;
      const shardPath = path.join(root, "public/generated/research", stateCode, "counties", `${county.countyFips}.json`);
      const shard = JSON.parse(readFileSync(shardPath, "utf8")) as CountyShard;
      assert(shard.stateCode === stateCode && shard.countyFips === county.countyFips, `GBIF rescore shard identity differs at ${shardPath}.`);
      assert(shard.pairResolution.defaultDisplayStatus === "not-researched", `GBIF rescore default status differs at ${shardPath}.`);
      const pairBySpecies = new Map(shard.pairs.map((entry) => [entry.speciesId, entry]));
      for (const taxon of counts.values()) {
        taxon.grossPairs += 1;
        const pair = pairBySpecies.get(taxon.speciesId);
        if (!pair || (pair.displayStatus === "not-researched" && pair.researchStatus === "not-started")) {
          taxon.notResearchedPairs += 1;
        } else if (pair.displayStatus === "not-researched" && pair.researchStatus === "blocked") {
          taxon.blockedPairs += 1;
        } else {
          taxon.alreadyResearchedPairs += 1;
        }
      }
    }
  }
  const sortedCounts = [...counts.values()].sort((left, right) => left.speciesId < right.speciesId ? -1 : left.speciesId > right.speciesId ? 1 : 0);
  assert(sortedCounts.every((taxon) => taxon.grossPairs === countyCount), "GBIF rescore taxon denominators differ from the county universe.");
  const model = NationalGbifSelectionModelSchema.parse({
    strategy: "movement-yield-exploration-v2",
    yieldPriorPath: relativePath(root, args.yieldPriorPath),
    yieldPriorSha256: args.yieldPriorSha256,
    movementWeightBps: args.movementWeightBps,
    likelyYieldWeightBps: args.likelyYieldWeightBps,
    explorationTargetBps: args.explorationTargetBps,
  });
  const selection = buildNationalGbifDualObjectiveSelection(sortedCounts, prior, args.thresholdPairs, model);
  const corpus = {
    notResearchedPairs: sortedCounts.reduce((sum, entry) => sum + entry.notResearchedPairs, 0),
    blockedPairs: sortedCounts.reduce((sum, entry) => sum + entry.blockedPairs, 0),
    alreadyResearchedPairs: sortedCounts.reduce((sum, entry) => sum + entry.alreadyResearchedPairs, 0),
  };
  const catalogPath = path.join(root, "src", "data", "generated", "species.json");
  const output = NationalGbifYieldRescoreSchema.parse({
    schemaVersion: 1,
    evaluationId: args.evaluationId,
    evaluatedAt: args.evaluatedAt,
    baselineSha: args.baselineSha,
    generatedContentCommit: args.generatedContentCommit,
    sourceId: "gbif-preserved-specimens",
    universe: {
      planPath: relativePath(root, args.universePlanPath),
      planId: universePlan.planId,
      planSha256: sha256(universePlanBytes),
      taxonomyCachePath: universePlan.taxonomyCachePath,
      taxonomyCacheSha256: universePlan.taxonomyCacheSha256,
      stateCount: universePlan.nationalV1StateCodes.length,
      countyCount,
      taxonCount: sortedCounts.length,
      grossPairs: sortedCounts.reduce((sum, entry) => sum + entry.grossPairs, 0),
    },
    yieldPrior: {
      path: relativePath(root, args.yieldPriorPath),
      sha256: args.yieldPriorSha256,
      priorId: prior.priorId,
      auditedRounds: prior.sourceAudit.rounds,
      selectedPairs: prior.sourceAudit.selectedPairs,
      presentPairs: prior.sourceAudit.presentPairs,
      weightedYieldBps: prior.sourceAudit.weightedYieldBps,
    },
    model,
    corpus: {
      taxonCountsSha256: createHash("sha256").update(stableJson(sortedCounts)).digest("hex"),
      ...corpus,
    },
    selection: {
      thresholdPairs: args.thresholdPairs,
      exploitationTargetPairs: selection.exploitationTargetPairs,
      exploitationPairs: selection.exploitationPairs,
      explorationPairs: selection.explorationPairs,
      expectedNetMovement: selection.expectedNetMovement,
      selectedTaxa: selection.selectedTaxa,
    },
    rankedEligibleTaxa: selection.rankedEligibleTaxa,
    checks: {
      generatedTreesMatchPinnedCommit: true,
      universeMatchesPrior: true,
      pairClassesConserved: true,
      thresholdCleared: true,
      selectionLanesConserved: true,
      deterministicRanking: true,
    },
    semantics: {
      planningHeuristicOnly: true,
      guaranteesFutureYield: false,
      createsAbsence: false,
      createsNotDetected: false,
      authorizesProviderRequest: false,
      authorizesPublication: false,
    },
    operations: {
      networkRequests: 0,
      providerPosts: 0,
      generationCommands: 0,
      publicationMutations: 0,
    },
  });
  mkdirSync(path.dirname(args.outputPath), { recursive: true });
  const contents = stableJson(output);
  writeFileSync(args.outputPath, contents, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: relativePath(root, args.outputPath),
    outputSha256: sha256(contents),
    countyCount,
    taxonCount: sortedCounts.length,
    availableNotResearchedPairs: corpus.notResearchedPairs,
    selectedSpeciesIds: selection.selectedSpeciesIds,
    exploitationPairs: selection.exploitationPairs,
    explorationPairs: selection.explorationPairs,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main();
}
