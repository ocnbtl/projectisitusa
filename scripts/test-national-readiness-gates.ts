import { readFileSync } from "node:fs";
import path from "node:path";

import type { ProtocolCellProjection } from "@/lib/research/protocol-cells";
import type { StateResearchConfigFile } from "@/lib/research/state-research-config";

type ReadinessState = {
  stateCode: string;
  buildTimeGates: {
    applicableProtocolCellsAtLeast90: boolean;
    regulatedAndHighPriorityComplete: boolean;
    requiredCurrentSourceFamiliesProcessed: boolean;
  };
  regulatedAndHighPriorityCompletion: {
    applicableCells: number;
    completeCells: number;
    completePercent: number;
  };
};

type ReadinessDashboard = { states: ReadinessState[] };

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function round(value: number, digits = 2) {
  return Number(value.toFixed(digits));
}

const config = readJson<StateResearchConfigFile>(
  path.join(ROOT, "src/data/research/state-research-config.json"),
);
const dashboard = readJson<ReadinessDashboard>(
  path.join(ROOT, "ops/national-research/readiness-dashboard.json"),
);
const readinessByState = new Map(
  dashboard.states.map((entry) => [entry.stateCode, entry]),
);
let completionFreshnessDivergences = 0;

for (const state of config.states.filter((entry) => entry.publicResearchProjection)) {
  const protocol = readJson<ProtocolCellProjection>(
    path.join(
      ROOT,
      "src/data/generated/research",
      state.stateCode,
      "protocol-cells.json",
    ),
  );
  const readiness = readinessByState.get(state.stateCode);
  assert(readiness, `Missing readiness state ${state.stateCode}.`);

  const priorityCells = protocol.cells.filter(
    (cell) =>
      cell.applicabilityStatus === "applicable" &&
      ["regulated", "high"].includes(cell.priority),
  );
  const priorityCompleteCells = priorityCells.filter(
    (cell) => cell.completionStatus === "complete",
  );
  const expectedPriorityPercent = priorityCells.length === 0
    ? 0
    : round((priorityCompleteCells.length / priorityCells.length) * 100, 2);
  const expectedPriorityGate =
    protocol.priorityClassificationComplete &&
    (priorityCells.length === 0 ||
      priorityCompleteCells.length === priorityCells.length);

  assert(
    readiness.buildTimeGates.applicableProtocolCellsAtLeast90 ===
      (protocol.summary.applicableCompletionPercent >= 90),
    `${state.stateCode} applicable protocol gate is not based on raw completion.`,
  );
  assert(
    readiness.buildTimeGates.regulatedAndHighPriorityComplete ===
      expectedPriorityGate,
    `${state.stateCode} priority protocol gate is not based on raw completion.`,
  );
  assert(
    readiness.regulatedAndHighPriorityCompletion.applicableCells ===
      priorityCells.length &&
      readiness.regulatedAndHighPriorityCompletion.completeCells ===
        priorityCompleteCells.length &&
      readiness.regulatedAndHighPriorityCompletion.completePercent ===
        expectedPriorityPercent,
    `${state.stateCode} priority completion metrics differ from protocol cells.`,
  );

  if (
    protocol.summary.applicableCompletionPercent >= 90 &&
    protocol.summary.currentCompletePercent < 90
  ) {
    completionFreshnessDivergences += 1;
    assert(
      readiness.buildTimeGates.applicableProtocolCellsAtLeast90,
      `${state.stateCode} freshness incorrectly blocks the raw completion gate.`,
    );
  }
}

assert(
  completionFreshnessDivergences > 0,
  "The readiness fixture must exercise at least one completion/freshness divergence.",
);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      states: readinessByState.size,
      completionFreshnessDivergences,
    },
    null,
    2,
  )}\n`,
);
