import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { compileAdditiveResearchEvidence } from "../../src/lib/research/compile-evidence";
import { loadImmutableResearchRun, readNdjson, sha256, stableJson } from "../../src/lib/research/run-files";
import { selectImmutableResearchRunsForState } from "../../src/lib/research/state-run-selection";
import { validateJurisdictionEvidenceRegistry } from "../../src/lib/research/jurisdiction-evidence";
import type { QuestionEvidenceContext, QuestionCounty } from "../../src/lib/research/question-assessment-ledger";
import type { EvidenceReviewEvent, ResearchSourceRegistry, JurisdictionEvidenceRegistry } from "../../src/lib/research/types";

export function loadQuestionEvidenceContext(root: string, stateCode: string, asOf: string): QuestionEvidenceContext {
  const readJson = <T>(filename: string) => JSON.parse(readFileSync(path.join(root, filename), "utf8")) as T;
  const base = path.join(root, "src/data/research/runs");
  const runPaths = readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".pending-research-run-"))
    .map((entry) => path.join(base, entry.name)).sort().filter((directory) => {
      const filename = path.join(directory, "receipt.json");
      if (!existsSync(filename)) throw new Error("Immutable source run is missing its receipt: " + directory);
      return JSON.parse(readFileSync(filename, "utf8")).requested_scope.state_code === stateCode;
    });
  const immutableRuns = selectImmutableResearchRunsForState(runPaths.map((directory) => loadImmutableResearchRun(root, directory)), stateCode, asOf);
  const lateReviews = readNdjson<EvidenceReviewEvent>(path.join(root, "src/data/research/review-events.ndjson"))
    .filter((event) => event.state_code === stateCode && event.created_at.slice(0, 10) <= asOf);
  const reviewEvents = [...immutableRuns.flatMap((run) => run.reviews), ...lateReviews];
  const registry = readJson<ResearchSourceRegistry>("src/data/research/source-registry.json");
  const { projectedRunAssertions } = compileAdditiveResearchEvidence({
    bootstrapEvidence: [], runAssertions: immutableRuns.flatMap((run) => run.assertions), reviewEvents,
    sources: registry.sources, asOf,
  });
  const jurisdictionRegistry = readJson<JurisdictionEvidenceRegistry>("src/data/research/jurisdiction-evidence-registry.json");
  const countyRegistry = readJson<Parameters<typeof validateJurisdictionEvidenceRegistry>[0]["countyRegistry"]>("src/data/research/county-equivalent-registry.json");
  const stateRegistry = readJson<Parameters<typeof validateJurisdictionEvidenceRegistry>[0]["stateRegistry"]>("src/data/research/state-registry.json");
  validateJurisdictionEvidenceRegistry({ registry: jurisdictionRegistry, countyRegistry, stateRegistry });
  const counties = Object.values(readJson<Record<string, QuestionCounty>>("src/data/generated/counties.json"))
    .filter((county) => county.stateCode === stateCode).sort((a, b) => a.countyFips.localeCompare(b.countyFips));
  for (const county of counties) county.geographyScopeSha256 = sha256(stableJson(countyRegistry.countyEquivalents.find((c) => c.countyFips === county.countyFips)));
  const registeredFips = countyRegistry.countyEquivalents.filter((c) => c.status === "active" && c.stateCode === stateCode).map((c) => c.countyFips).sort();
  if (JSON.stringify(counties.map((c) => c.countyFips)) !== JSON.stringify(registeredFips)) throw new Error("Question county scope differs from the active registry.");
  return {
    root, stateCode, asOf, catalogSpecies: readJson<QuestionEvidenceContext["catalogSpecies"]>("src/data/generated/species.json"),
    counties, activeAssertions: projectedRunAssertions, reviewEvents, immutableRuns,
    jurisdictionEvidence: jurisdictionRegistry.records,
  };
}
