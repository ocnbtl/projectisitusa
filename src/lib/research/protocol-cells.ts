import type { SpeciesCategory } from "@/lib/data/types";
import type {
  ImmutableResearchRunBundle,
  ResearchSourceDefinition,
} from "@/lib/research/types";
import { sha256, stableJson } from "@/lib/research/run-files";

export type ProtocolPriority = "regulated" | "high" | "pilot" | "baseline";
export type ProtocolBasis = { kind: string; reference: string; note: string };

export type ResearchProtocolsFile = {
  schemaVersion: 2;
  updatedAt: string;
  protocols: Array<{
    id: string;
    label: string;
    stateCodes: string[];
    status: "draft" | "active" | "legacy-migration";
    sourceUniverse: string[];
    requiredCurrentSourceIds: string[];
    priorityPolicy: {
      defaultPriority: ProtocolPriority;
      classificationComplete: boolean;
    };
    rules: Array<{
      ruleId: string;
      speciesSelector: {
        kind: "category" | "state-applicability" | "species-id";
        values: string[];
      };
      applicableSourceIds: string[];
      basis: ProtocolBasis[];
    }>;
    overrides: Array<{
      stateCode: string;
      speciesId: string;
      sourceId: string;
      applicability: "applicable" | "not-applicable";
      basis: ProtocolBasis[];
    }>;
  }>;
};

export type ProtocolCell = {
  cellKey: string;
  stateCode: string;
  speciesId: string;
  category: SpeciesCategory;
  priority: ProtocolPriority;
  sourceId: string;
  applicabilityStatus: "applicable" | "not-applicable";
  completionStatus: "complete" | "incomplete" | "blocked" | "not-applicable";
  freshnessStatus: "current" | "stale" | "undated" | "not-applicable";
  targetCountyCount: number;
  completeOutcomeCountyCount: number;
  blockedOutcomeCountyCount: number;
  incompleteCountyCount: number;
  latestCompleteRunFinishedAt: string | null;
  freshThrough: string | null;
  completionRunIds: string[];
  outcomeSetHash: string;
  applicabilityBasis: ProtocolBasis[];
};

export type ProtocolCellProjection = {
  schemaVersion: 1;
  stateCode: string;
  asOf: string;
  generatedAt: string;
  protocolId: string;
  protocolStatus: "draft" | "active" | "legacy-migration";
  priorityClassificationComplete: boolean;
  requiredCurrentSourceIds: string[];
  summary: {
    totalCells: number;
    applicableCells: number;
    notApplicableCells: number;
    completeCells: number;
    incompleteCells: number;
    blockedCells: number;
    currentCells: number;
    staleCells: number;
    undatedCells: number;
    applicableCompletionPercent: number;
    currentCompletePercent: number;
    regulatedAndHighApplicableCells: number;
    regulatedAndHighCurrentCompleteCells: number;
    regulatedAndHighCurrentCompletePercent: number;
    requiredCurrentSourcesProcessed: boolean;
  };
  categoryCompletion: Array<{
    category: SpeciesCategory;
    applicableCells: number;
    currentCompleteCells: number;
    currentCompletePercent: number;
  }>;
  priorityCompletion: Array<{
    priority: ProtocolPriority;
    applicableCells: number;
    currentCompleteCells: number;
    currentCompletePercent: number;
  }>;
  requiredSourceStatus: Array<{
    sourceId: string;
    applicableCells: number;
    currentCompleteCells: number;
    processed: boolean;
  }>;
  cells: ProtocolCell[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function roundPercent(value: number) {
  return Number(value.toFixed(2));
}

function ratioPercent(numerator: number, denominator: number) {
  return denominator === 0 ? 0 : roundPercent((numerator / denominator) * 100);
}

function appliesToSpecies(
  rule: ResearchProtocolsFile["protocols"][number]["rules"][number],
  species: { id: string; category: SpeciesCategory },
) {
  if (rule.speciesSelector.kind === "state-applicability") return true;
  if (rule.speciesSelector.kind === "species-id") {
    return rule.speciesSelector.values.includes(species.id);
  }
  return rule.speciesSelector.values.includes(species.category);
}

export function buildProtocolCellProjection(input: {
  stateCode: string;
  asOf: string;
  generatedAt: string;
  species: Array<{
    id: string;
    category: SpeciesCategory;
    priority?: ProtocolPriority;
  }>;
  countyFips: string[];
  protocols: ResearchProtocolsFile;
  sources: ResearchSourceDefinition[];
  immutableRuns: ImmutableResearchRunBundle[];
}) {
  const matchingProtocols = input.protocols.protocols.filter((protocol) =>
    protocol.stateCodes.includes(input.stateCode),
  );
  assert(
    matchingProtocols.length === 1,
    `State ${input.stateCode} must have exactly one explicit research protocol.`,
  );
  const protocol = matchingProtocols[0]!;
  assert(protocol.status !== "draft", `State ${input.stateCode} protocol remains draft.`);
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  for (const sourceId of protocol.sourceUniverse) {
    assert(sourceById.has(sourceId), `Protocol ${protocol.id} references unknown source ${sourceId}.`);
  }
  for (const sourceId of protocol.requiredCurrentSourceIds) {
    assert(
      protocol.sourceUniverse.includes(sourceId),
      `Protocol ${protocol.id} requires source ${sourceId} outside its source universe.`,
    );
  }
  const runById = new Map(
    input.immutableRuns.map((bundle) => [bundle.receipt.run_id, bundle]),
  );
  const cells: ProtocolCell[] = [];

  for (const species of [...input.species].sort((left, right) => left.id.localeCompare(right.id))) {
    const matchingRules = protocol.rules.filter((rule) => appliesToSpecies(rule, species));
    const ruleSourceIds = new Set(matchingRules.flatMap((rule) => rule.applicableSourceIds));
    for (const sourceId of [...protocol.sourceUniverse].sort()) {
      const override = protocol.overrides.find(
        (entry) =>
          entry.stateCode === input.stateCode &&
          entry.speciesId === species.id &&
          entry.sourceId === sourceId,
      );
      const applicabilityStatus = override?.applicability ??
        (ruleSourceIds.has(sourceId) ? "applicable" : "not-applicable");
      const applicabilityBasis = override?.basis ?? matchingRules
        .filter((rule) => rule.applicableSourceIds.includes(sourceId))
        .flatMap((rule) => rule.basis);
      const priority = species.priority ?? protocol.priorityPolicy.defaultPriority;
      const cellKey = `${input.stateCode}:${species.id}:${sourceId}`;
      if (applicabilityStatus === "not-applicable") {
        cells.push({
          cellKey,
          stateCode: input.stateCode,
          speciesId: species.id,
          category: species.category,
          priority,
          sourceId,
          applicabilityStatus,
          completionStatus: "not-applicable",
          freshnessStatus: "not-applicable",
          targetCountyCount: input.countyFips.length,
          completeOutcomeCountyCount: 0,
          blockedOutcomeCountyCount: 0,
          incompleteCountyCount: 0,
          latestCompleteRunFinishedAt: null,
          freshThrough: null,
          completionRunIds: [],
          outcomeSetHash: sha256("\n"),
          applicabilityBasis,
        });
        continue;
      }
      assert(
        applicabilityBasis.length > 0,
        `Applicable protocol cell ${cellKey} lacks applicability basis.`,
      );
      const outcomes = input.immutableRuns
        .flatMap((bundle) => bundle.outcomes)
        .filter(
          (outcome) =>
            outcome.state_code === input.stateCode &&
            outcome.species_id === species.id &&
            outcome.source_id === sourceId &&
            input.countyFips.includes(outcome.county_fips),
        )
        .sort(
          (left, right) =>
            left.recorded_at.localeCompare(right.recorded_at) ||
            left.outcome_id.localeCompare(right.outcome_id),
        );
      const completeByCounty = new Map<string, (typeof outcomes)[number]>();
      const latestByCounty = new Map<string, (typeof outcomes)[number]>();
      for (const outcome of outcomes) {
        latestByCounty.set(outcome.county_fips, outcome);
        if (
          outcome.scope_complete &&
          ["evidence-found", "no-qualifying-evidence"].includes(outcome.status)
        ) {
          completeByCounty.set(outcome.county_fips, outcome);
        } else {
          completeByCounty.delete(outcome.county_fips);
        }
      }
      const incompleteCountyFips = input.countyFips.filter(
        (countyFips) => !completeByCounty.has(countyFips),
      );
      const blockedOutcomeCountyCount = incompleteCountyFips.filter(
        (countyFips) => latestByCounty.get(countyFips)?.status === "blocked",
      ).length;
      const completionStatus = incompleteCountyFips.length === 0
        ? "complete"
        : blockedOutcomeCountyCount === incompleteCountyFips.length
          ? "blocked"
          : "incomplete";
      const completionRunIds = [
        ...new Set([...completeByCounty.values()].map((outcome) => outcome.run_id)),
      ].sort();
      const completionFinishedAt = completionRunIds
        .map((runId) => runById.get(runId)?.receipt.finished_at)
        .filter((value): value is string => Boolean(value))
        .sort();
      const latestCompleteRunFinishedAt = completionFinishedAt.at(-1) ?? null;
      const freshThrough = completionStatus === "complete"
        ? completionFinishedAt.at(0) ?? null
        : null;
      const refreshCadenceDays = sourceById.get(sourceId)?.refreshCadenceDays ?? null;
      const ageDays = freshThrough
        ? Math.max(
            0,
            (Date.parse(`${input.asOf}T23:59:59.999Z`) - Date.parse(freshThrough)) /
              86_400_000,
          )
        : null;
      const freshnessStatus = completionStatus !== "complete" || !freshThrough || refreshCadenceDays === null
        ? "undated"
        : ageDays! <= refreshCadenceDays
          ? "current"
          : "stale";
      cells.push({
        cellKey,
        stateCode: input.stateCode,
        speciesId: species.id,
        category: species.category,
        priority,
        sourceId,
        applicabilityStatus,
        completionStatus,
        freshnessStatus,
        targetCountyCount: input.countyFips.length,
        completeOutcomeCountyCount: completeByCounty.size,
        blockedOutcomeCountyCount,
        incompleteCountyCount: incompleteCountyFips.length,
        latestCompleteRunFinishedAt,
        freshThrough,
        completionRunIds,
        outcomeSetHash: sha256(`${outcomes.map((entry) => entry.outcome_id).sort().join("\n")}\n`),
        applicabilityBasis,
      });
    }
  }

  const applicable = cells.filter((cell) => cell.applicabilityStatus === "applicable");
  const currentComplete = applicable.filter(
    (cell) => cell.completionStatus === "complete" && cell.freshnessStatus === "current",
  );
  const regulatedAndHigh = applicable.filter((cell) =>
    ["regulated", "high"].includes(cell.priority),
  );
  const regulatedAndHighCurrent = regulatedAndHigh.filter(
    (cell) => cell.completionStatus === "complete" && cell.freshnessStatus === "current",
  );
  const aggregate = <T extends string>(
    values: T[],
    select: (cell: ProtocolCell) => T,
    label: string,
  ) => values.map((value) => {
    const applicableCells = applicable.filter((cell) => select(cell) === value).length;
    const currentCompleteCells = currentComplete.filter((cell) => select(cell) === value).length;
    return {
      [label]: value,
      applicableCells,
      currentCompleteCells,
      currentCompletePercent: ratioPercent(currentCompleteCells, applicableCells),
    };
  });
  const categories = [...new Set(input.species.map((entry) => entry.category))].sort();
  const priorities: ProtocolPriority[] = ["regulated", "high", "pilot", "baseline"];
  const requiredSourceStatus = protocol.requiredCurrentSourceIds.map((sourceId) => {
    const sourceCells = applicable.filter((cell) => cell.sourceId === sourceId);
    const currentSourceCells = currentComplete.filter((cell) => cell.sourceId === sourceId);
    return {
      sourceId,
      applicableCells: sourceCells.length,
      currentCompleteCells: currentSourceCells.length,
      processed: sourceCells.length > 0 && sourceCells.length === currentSourceCells.length,
    };
  });
  const projection: ProtocolCellProjection = {
    schemaVersion: 1,
    stateCode: input.stateCode,
    asOf: input.asOf,
    generatedAt: input.generatedAt,
    protocolId: protocol.id,
    protocolStatus: protocol.status,
    priorityClassificationComplete: protocol.priorityPolicy.classificationComplete,
    requiredCurrentSourceIds: [...protocol.requiredCurrentSourceIds].sort(),
    summary: {
      totalCells: cells.length,
      applicableCells: applicable.length,
      notApplicableCells: cells.length - applicable.length,
      completeCells: applicable.filter((cell) => cell.completionStatus === "complete").length,
      incompleteCells: applicable.filter((cell) => cell.completionStatus === "incomplete").length,
      blockedCells: applicable.filter((cell) => cell.completionStatus === "blocked").length,
      currentCells: currentComplete.length,
      staleCells: applicable.filter((cell) => cell.freshnessStatus === "stale").length,
      undatedCells: applicable.filter((cell) => cell.freshnessStatus === "undated").length,
      applicableCompletionPercent: ratioPercent(
        applicable.filter((cell) => cell.completionStatus === "complete").length,
        applicable.length,
      ),
      currentCompletePercent: ratioPercent(currentComplete.length, applicable.length),
      regulatedAndHighApplicableCells: regulatedAndHigh.length,
      regulatedAndHighCurrentCompleteCells: regulatedAndHighCurrent.length,
      regulatedAndHighCurrentCompletePercent: ratioPercent(
        regulatedAndHighCurrent.length,
        regulatedAndHigh.length,
      ),
      requiredCurrentSourcesProcessed: requiredSourceStatus.every((entry) => entry.processed),
    },
    categoryCompletion: aggregate(categories, (cell) => cell.category, "category") as ProtocolCellProjection["categoryCompletion"],
    priorityCompletion: aggregate(priorities, (cell) => cell.priority, "priority") as ProtocolCellProjection["priorityCompletion"],
    requiredSourceStatus,
    cells,
  };
  return projection;
}
