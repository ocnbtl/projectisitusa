import type { ImmutableResearchRunBundle, ResearchSourceDefinition } from "@/lib/research/types";
import {
  buildProtocolCellProjection,
  type ResearchProtocolsFile,
} from "@/lib/research/protocol-cells";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const source = {
  id: "gbif-preserved-specimens",
  refreshCadenceDays: 180,
} as ResearchSourceDefinition;
const baseProtocol: ResearchProtocolsFile = {
  schemaVersion: 2,
  updatedAt: "2026-07-15",
  protocols: [
    {
      id: "test-protocol",
      label: "Test protocol",
      stateCodes: ["AL"],
      status: "active",
      sourceUniverse: [source.id],
      requiredCurrentSourceIds: [source.id],
      priorityPolicy: { defaultPriority: "high", classificationComplete: true },
      rules: [
        {
          ruleId: "test-rule",
          speciesSelector: { kind: "category", values: ["plants"] },
          applicableSourceIds: [source.id],
          basis: [{ kind: "test", reference: "fixture", note: "Explicit fixture applicability." }],
        },
      ],
      overrides: [],
    },
  ],
};

function bundle(input: {
  runId: string;
  countyFips: string;
  status: "evidence-found" | "no-qualifying-evidence" | "blocked";
  scopeComplete: boolean;
  finishedAt?: string;
}) {
  return {
    receipt: {
      run_id: input.runId,
      finished_at: input.finishedAt ?? "2026-07-15T12:00:00.000Z",
    },
    outcomes: [
      {
        outcome_id: `${input.runId}-outcome`,
        run_id: input.runId,
        source_id: source.id,
        state_code: "AL",
        county_fips: input.countyFips,
        species_id: "test-plant",
        status: input.status,
        scope_complete: input.scopeComplete,
        recorded_at: input.finishedAt ?? "2026-07-15T12:00:00.000Z",
      },
    ],
  } as unknown as ImmutableResearchRunBundle;
}

function project(runs: ImmutableResearchRunBundle[], protocols = baseProtocol) {
  return buildProtocolCellProjection({
    stateCode: "AL",
    asOf: "2026-07-15",
    generatedAt: "2026-07-15T00:00:00.000Z",
    species: [{ id: "test-plant", category: "plants", priority: "high" }],
    countyFips: ["01001", "01003"],
    protocols,
    sources: [source],
    immutableRuns: runs,
  });
}

const speciesIdProtocol = structuredClone(baseProtocol);
speciesIdProtocol.protocols[0]!.rules[0]!.speciesSelector = {
  kind: "species-id",
  values: ["test-plant"],
};
assert(
  project([], speciesIdProtocol).cells[0]!.applicabilityStatus === "applicable",
  "Explicit species-id protocol selector did not apply to the named taxon.",
);
speciesIdProtocol.protocols[0]!.rules[0]!.speciesSelector.values = ["another-species"];
assert(
  project([], speciesIdProtocol).cells[0]!.applicabilityStatus === "not-applicable",
  "Explicit species-id protocol selector leaked to an unnamed taxon.",
);

const empty = project([]).cells[0]!;
assert(empty.completionStatus === "incomplete", "Source silence completed a protocol cell.");
assert(empty.completeOutcomeCountyCount === 0, "Source silence created outcome coverage.");

const complete = project([
  bundle({ runId: "run-a", countyFips: "01001", status: "evidence-found", scopeComplete: true }),
  bundle({ runId: "run-b", countyFips: "01003", status: "no-qualifying-evidence", scopeComplete: true }),
]);
assert(complete.cells[0]!.completionStatus === "complete", "Complete outcomes did not complete the cell.");
assert(complete.cells[0]!.freshnessStatus === "current", "Current complete cell was not current.");
assert(complete.summary.currentCompletePercent === 100, "Current completion percentage is wrong.");

const blocked = project([
  bundle({ runId: "run-c", countyFips: "01001", status: "evidence-found", scopeComplete: true }),
  bundle({ runId: "run-d", countyFips: "01003", status: "blocked", scopeComplete: false }),
]).cells[0]!;
assert(blocked.completionStatus === "blocked", "Explicit blocked remainder was not preserved.");
assert(blocked.completeOutcomeCountyCount === 1, "Blocked cell lost completed county coverage.");

const blockedRetry = project([
  bundle({ runId: "run-g", countyFips: "01001", status: "evidence-found", scopeComplete: true, finishedAt: "2026-07-15T12:00:00.000Z" }),
  bundle({ runId: "run-h", countyFips: "01001", status: "blocked", scopeComplete: false, finishedAt: "2026-07-15T13:00:00.000Z" }),
  bundle({ runId: "run-i", countyFips: "01003", status: "no-qualifying-evidence", scopeComplete: true, finishedAt: "2026-07-15T12:00:00.000Z" }),
]).cells[0]!;
assert(blockedRetry.completionStatus === "blocked", "A later blocked retry did not revoke older complete coverage.");
assert(blockedRetry.completeOutcomeCountyCount === 1, "A later blocked retry retained stale complete county coverage.");

const stale = project([
  bundle({ runId: "run-e", countyFips: "01001", status: "evidence-found", scopeComplete: true, finishedAt: "2025-01-01T00:00:00.000Z" }),
  bundle({ runId: "run-f", countyFips: "01003", status: "no-qualifying-evidence", scopeComplete: true, finishedAt: "2025-01-01T00:00:00.000Z" }),
]).cells[0]!;
assert(stale.completionStatus === "complete", "Stale historical completion was discarded.");
assert(stale.freshnessStatus === "stale", "Historical completion was not marked stale.");

const notApplicableProtocol = structuredClone(baseProtocol);
notApplicableProtocol.protocols[0]!.overrides.push({
  stateCode: "AL",
  speciesId: "test-plant",
  sourceId: source.id,
  applicability: "not-applicable",
  basis: [{ kind: "test", reference: "override", note: "Explicitly not applicable." }],
});
const notApplicable = project([], notApplicableProtocol).cells[0]!;
assert(notApplicable.completionStatus === "not-applicable", "Not-applicable cell entered completion denominator.");
assert(notApplicable.freshnessStatus === "not-applicable", "Not-applicable cell has freshness state.");
assert(notApplicable.applicabilityBasis[0]?.reference === "override", "Not-applicable cell discarded its explicit basis.");

console.log(
  JSON.stringify(
    {
      sourceSilenceRemainsIncomplete: true,
      speciesIdSelectorBounded: true,
      noQualifyingEvidenceCompletesResearchOnly: true,
      blockedRemainderPreserved: true,
      laterBlockedRetryRevokesCompletion: true,
      staleCompletionSeparated: true,
      notApplicableExcluded: true,
    },
    null,
    2,
  ),
);
