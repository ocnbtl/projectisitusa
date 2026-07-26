import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import { listCountyEquivalents } from "@/lib/research/geography-registry";
import {
  type AfpeCountyRow,
  type AfpeTaxonMapping,
  replayNationalAfpeState,
} from "./research/adapters/usfs-afpe-archive";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const mapping: AfpeTaxonMapping = {
  columnId: "DCA15087",
  sourceLabel: "Emerald Ash Borer",
  speciesId: "emerald-ash-borer",
  scientificName: "Agrilus planipennis",
};

function row(fips: string, value: "0" | "1", name = "Fixture"): AfpeCountyRow {
  return {
    STATE: fips.slice(0, 2),
    COUNTY: fips.slice(2),
    NAME: name,
    LSAD: "06",
    LSAD_TRANS: "County",
    FIPS: fips,
    STATENAME: "Alabama",
    Total: value,
    AllPest: value === "1" ? mapping.sourceLabel : "",
    DCA15087: value,
  };
}

function context(runId: string, pairKeys: string[]): SourceAdapterContext {
  const counties = new Map(
    listCountyEquivalents("AL").map((county) => [county.countyFips, county]),
  );
  return {
    runId,
    sourceId: "usfs-afpe",
    stateCode: "AL",
    requestedPairs: pairKeys.map((key) => {
      const [countyFips, speciesId] = key.split(":");
      const county = counties.get(countyFips!);
      assert(county, `Missing fixture county ${countyFips}.`);
      return {
        countyFips: county.countyFips,
        countyName: county.shortName,
        speciesId: speciesId!,
        scientificName: mapping.scientificName,
      };
    }),
    runStartedAt: "2026-07-26T04:00:00.000Z",
    parameters: {},
  };
}

const pairKeys = [
  "01001:emerald-ash-borer",
  "01003:emerald-ash-borer",
  "01005:emerald-ash-borer",
];
const base = replayNationalAfpeState({
  context: context("afpe-test-base", pairKeys),
  rows: [
    row("01001", "1", "Autauga"),
    row("01003", "0", "Baldwin"),
  ],
  mappings: [mapping],
  completedAt: "2026-07-26T04:00:00.000Z",
  archiveUrl: "https://purr.purdue.edu/publications/4479/serve/1?render=archive",
});
assert(base.assertions.length === 1, "One AFPE detection did not emit one assertion.");
assert(base.reviews.length === 1, "One AFPE assertion did not emit one review.");
assert(
  base.assertions[0]?.claim_type === "recorded-present",
  "AFPE emitted a claim other than recorded-present.",
);
assert(
  base.outcomes.find((entry) => entry.county_fips === "01001")?.status ===
    "evidence-found",
  "AFPE value 1 did not emit evidence-found.",
);
assert(
  base.outcomes.find((entry) => entry.county_fips === "01003")?.status ===
    "no-qualifying-evidence",
  "AFPE value 0 did not emit a research-only no-qualifying outcome.",
);
assert(
  base.outcomes.find((entry) => entry.county_fips === "01005")?.status ===
    "blocked",
  "Missing current AFPE geography was not blocked.",
);
assert(
  base.outcomes.every((entry) =>
    entry.status !== "no-qualifying-evidence" || entry.assertion_event_ids.length === 0
  ),
  "AFPE source silence created evidence.",
);

const duplicate = replayNationalAfpeState({
  context: context("afpe-test-duplicate", pairKeys.slice(0, 1)),
  rows: [
    row("01001", "1", "Autauga"),
    row("01001", "1", "Autauga"),
  ],
  mappings: [mapping],
  completedAt: "2026-07-26T04:00:00.000Z",
  archiveUrl: "https://purr.purdue.edu/publications/4479/serve/1?render=archive",
});
assert(duplicate.assertions.length === 1, "Identical duplicate rows duplicated AFPE evidence.");
assert(duplicate.duplicateRecordCount === 1, "Identical AFPE duplicate was not counted.");
assert(duplicate.rejections.length === 1, "Identical AFPE duplicate lacked a rejection record.");
assert(duplicate.outcomes[0]?.scope_complete, "Identical AFPE duplicate blocked a safe union.");

const contradiction = replayNationalAfpeState({
  context: context("afpe-test-contradiction", pairKeys.slice(0, 1)),
  rows: [
    row("01001", "1", "Autauga"),
    row("01001", "0", "Autauga"),
  ],
  mappings: [mapping],
  completedAt: "2026-07-26T04:00:00.000Z",
  archiveUrl: "https://purr.purdue.edu/publications/4479/serve/1?render=archive",
});
assert(contradiction.assertions.length === 0, "Conflicting AFPE duplicates published evidence.");
assert(contradiction.outcomes[0]?.status === "blocked", "Conflicting AFPE duplicates were not blocked.");
assert(!contradiction.outcomes[0]?.scope_complete, "Conflicting AFPE duplicate was marked complete.");

console.log(
  JSON.stringify(
    {
      recordedPresentOnly: true,
      zeroIsResearchOnly: true,
      missingCurrentGeographyBlocked: true,
      identicalDuplicateCollapsed: true,
      conflictingDuplicateBlocked: true,
      deterministic: JSON.stringify(base) === JSON.stringify(
        replayNationalAfpeState({
          context: context("afpe-test-base", pairKeys),
          rows: [
            row("01001", "1", "Autauga"),
            row("01003", "0", "Baldwin"),
          ],
          mappings: [mapping],
          completedAt: "2026-07-26T04:00:00.000Z",
          archiveUrl: "https://purr.purdue.edu/publications/4479/serve/1?render=archive",
        }),
      ),
    },
    null,
    2,
  ),
);
