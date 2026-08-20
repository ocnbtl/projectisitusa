import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { auditGbifNationalMarginalYield } from "./audit-national-gbif-marginal-yield";
import { loadNationalGbifDownloadPlan, sha256, stableJson } from "./national-gbif-download";
import { NationalGbifYieldPriorSchema } from "./national-gbif-selection-planner";

type SpeciesCatalogEntry = {
  id: string;
  category: string;
  displayGroup: string;
};

type ScopeCounts = {
  selectedPairs: number;
  presentPairs: number;
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
  const universePlan = values.get("universe-plan");
  const output = values.get("output");
  const priorId = values.get("prior-id");
  const generatedAt = values.get("generated-at");
  assert(universePlan && output && priorId && generatedAt, "--universe-plan, --output, --prior-id, and --generated-at are required.");
  assert(!Number.isNaN(Date.parse(generatedAt)), "--generated-at must be an ISO date-time.");
  return {
    universePlanPath: path.resolve(universePlan),
    outputPath: path.resolve(output),
    priorId,
    generatedAt,
  };
}

function increment(map: Map<string, ScopeCounts>, key: string, selectedPairs: number, presentPairs: number) {
  const current = map.get(key) ?? { selectedPairs: 0, presentPairs: 0 };
  current.selectedPairs += selectedPairs;
  current.presentPairs += presentPairs;
  map.set(key, current);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function yieldBps(presentPairs: number, selectedPairs: number) {
  return selectedPairs === 0 ? 0 : Math.round((presentPairs * 10_000) / selectedPairs);
}

async function main() {
  const root = process.cwd();
  const { universePlanPath, outputPath, priorId, generatedAt } = parseArgs(process.argv.slice(2));
  assert(!existsSync(outputPath), "GBIF yield-prior generation refuses to overwrite an existing artifact.");
  const universePlanBytes = readFileSync(universePlanPath);
  const universePlan = loadNationalGbifDownloadPlan(universePlanPath);
  assert(universePlan.schemaVersion === 1, "GBIF yield-prior universe must be a retained v1 plan.");
  const catalogPath = path.join(root, "src/data/generated/species.json");
  const catalogBytes = readFileSync(catalogPath);
  const catalog = JSON.parse(catalogBytes.toString("utf8")) as SpeciesCatalogEntry[];
  const catalogBySpecies = new Map(catalog.map((entry) => [entry.id, entry]));
  assert(universePlan.speciesIds.every((speciesId) => catalogBySpecies.has(speciesId)), "GBIF yield-prior universe has a taxon missing from the generated species catalog.");

  const audit = await auditGbifNationalMarginalYield(root);
  const auditResult = stableJson(audit);
  const globalPairs = audit.aggregate.selectedPairs;
  const globalPresent = audit.aggregate.presentPairs;
  const globalYieldBps = yieldBps(globalPresent, globalPairs);
  const globalPriorPairs = 25_000;
  const minimumScopePairs = 3_000;
  const categoryCounts = new Map<string, ScopeCounts>();
  const displayGroupCounts = new Map<string, ScopeCounts>();
  for (const round of audit.rounds) {
    for (const taxon of round.perTaxon) {
      const species = catalogBySpecies.get(taxon.speciesId);
      assert(species, `GBIF audited taxon ${taxon.speciesId} is missing from the generated species catalog.`);
      increment(categoryCounts, species.category, taxon.selectedPairs, taxon.acceptedPairs);
      increment(displayGroupCounts, species.displayGroup, taxon.selectedPairs, taxon.acceptedPairs);
    }
  }

  const smoothYieldBps = (counts: ScopeCounts) => Math.round(
    ((counts.presentPairs * 10_000) + (globalYieldBps * globalPriorPairs)) /
      (counts.selectedPairs + globalPriorPairs),
  );
  const scopePriors = [
    {
      scope: "global" as const,
      key: "*",
      selectedPairs: globalPairs,
      presentPairs: globalPresent,
      rawYieldBps: globalYieldBps,
      smoothedYieldBps: globalYieldBps,
    },
    ...[...categoryCounts].map(([key, counts]) => ({
      scope: "category" as const,
      key,
      ...counts,
      rawYieldBps: yieldBps(counts.presentPairs, counts.selectedPairs),
      smoothedYieldBps: smoothYieldBps(counts),
    })),
    ...[...displayGroupCounts].map(([key, counts]) => ({
      scope: "display-group" as const,
      key,
      ...counts,
      rawYieldBps: yieldBps(counts.presentPairs, counts.selectedPairs),
      smoothedYieldBps: smoothYieldBps(counts),
    })),
  ].sort((left, right) => compareText(left.scope, right.scope) || compareText(left.key, right.key));
  const scopeByKey = new Map(scopePriors.map((entry) => [`${entry.scope}:${entry.key}`, entry]));
  const taxonPriors = universePlan.speciesIds.map((speciesId) => {
    const species = catalogBySpecies.get(speciesId)!;
    const displayGroup = scopeByKey.get(`display-group:${species.displayGroup}`);
    const category = scopeByKey.get(`category:${species.category}`);
    const selected = displayGroup && displayGroup.selectedPairs >= minimumScopePairs
      ? displayGroup
      : category && category.selectedPairs >= minimumScopePairs
        ? category
        : scopeByKey.get("global:*")!;
    return {
      speciesId,
      category: species.category,
      displayGroup: species.displayGroup,
      scope: selected.scope,
      scopeKey: selected.key,
      observedPairs: selected.selectedPairs,
      observedPresentPairs: selected.presentPairs,
      expectedPresentBps: selected.smoothedYieldBps,
    };
  }).sort((left, right) => compareText(left.speciesId, right.speciesId));
  const implementationPath = path.join(root, "scripts/research/audit-national-gbif-marginal-yield.ts");
  const output = NationalGbifYieldPriorSchema.parse({
    schemaVersion: 1,
    priorId,
    generatedAt,
    sourceAudit: {
      rounds: audit.rounds.map((entry) => entry.round),
      selectedPairs: globalPairs,
      presentPairs: globalPresent,
      weightedYieldBps: globalYieldBps,
      implementationPath: "scripts/research/audit-national-gbif-marginal-yield.ts",
      implementationSha256: sha256(readFileSync(implementationPath)),
      resultSha256: sha256(auditResult),
    },
    universe: {
      planId: universePlan.planId,
      planSha256: sha256(universePlanBytes),
      speciesCount: universePlan.speciesIds.length,
      catalogPath: "src/data/generated/species.json",
      catalogSha256: sha256(catalogBytes),
    },
    smoothing: {
      method: "empirical-bayes-binomial-v1",
      globalPriorPairs,
      minimumScopePairs,
    },
    scopePriors,
    taxonPriors,
    semantics: {
      planningHeuristicOnly: true,
      guaranteesFutureYield: false,
      createsAbsence: false,
      createsNotDetected: false,
    },
  });
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const contents = stableJson(output);
  writeFileSync(outputPath, contents, { flag: "wx" });
  process.stdout.write(`${JSON.stringify({
    outputPath: path.relative(root, outputPath).replaceAll("\\", "/"),
    outputSha256: sha256(contents),
    globalYieldBps,
    scopePriorCount: scopePriors.length,
    taxonPriorCount: taxonPriors.length,
  }, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  void main();
}
