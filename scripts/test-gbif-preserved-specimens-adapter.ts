import { gbifPreservedSpecimensAdapter } from "./research/adapters/gbif-preserved-specimens";

import type { SourceAdapterContext } from "@/lib/research/source-adapter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parameters = {
  stateCode: "AL",
  candidateLimit: 2,
  candidatePairs: ["01001:example-species", "01003:example-species"],
  basisOfRecord: "PRESERVED_SPECIMEN",
  occurrenceStatus: "PRESENT",
  minimumMatchConfidence: 95,
  pageLimit: 300,
};
const context: SourceAdapterContext = {
  runId: "synthetic-gbif-run",
  sourceId: "gbif-preserved-specimens",
  stateCode: "AL",
  requestedPairs: [
    {
      countyFips: "01001",
      countyName: "Autauga",
      speciesId: "example-species",
      scientificName: "Example species",
    },
    {
      countyFips: "01003",
      countyName: "Baldwin",
      speciesId: "example-species",
      scientificName: "Example species",
    },
  ],
  runStartedAt: "2026-07-14T12:00:00.000Z",
  parameters,
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function occurrence(key: number, county: string, locality = "Wild collection") {
  return {
    key,
    datasetKey: "synthetic-dataset",
    institutionCode: "SYNTH",
    basisOfRecord: "PRESERVED_SPECIMEN",
    occurrenceStatus: "PRESENT",
    countryCode: "US",
    stateProvince: "Alabama",
    county,
    locality,
    acceptedScientificName: "Example species",
    taxonRank: "SPECIES",
    speciesKey: 123,
    acceptedTaxonKey: 123,
    eventDate: "2025-06-01",
    hasGeospatialIssue: false,
    issues: [],
  };
}

async function main() {
  const originalFetch = globalThis.fetch;
  const mockFetch = (
    handler: (input: URL | RequestInfo) => Promise<Response>,
  ): typeof fetch => handler as typeof fetch;
  const routedUrls: string[] = [];
  globalThis.fetch = mockFetch(async (input) => {
    const url = String(input);
    routedUrls.push(url);
    if (url.includes("/species/match")) {
      return jsonResponse({
        usageKey: 123,
        speciesKey: 123,
        matchType: "EXACT",
        confidence: 100,
        rank: "SPECIES",
        canonicalName: "Example species",
      });
    }
    return jsonResponse({
      offset: 0,
      limit: 300,
      endOfRecords: true,
      count: 3,
      results: [
        occurrence(1001, "Autauga"),
        occurrence(1002, "Baldwin"),
        occurrence(1003, "Lee"),
      ],
    });
  });

  try {
    const routed = await gbifPreservedSpecimensAdapter.run(context);
    assert(routedUrls.length === 2, "The adapter did not fetch one match and one statewide species page.");
    assert(routed.assertions.length === 2, "The adapter did not route one assertion to each exact county.");
    assert(routed.reviews.length === 2, "The adapter did not review both exact assertions.");
    assert(routed.rejections.length === 0, "An unrelated county created rejection noise.");
    assert(
      routed.outcomes.length === 2 &&
        routed.outcomes.every((outcome) => outcome.status === "evidence-found" && outcome.scope_complete),
      "The routed county outcomes are not complete evidence-found results.",
    );

    const cultivatedUrls: string[] = [];
    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      cultivatedUrls.push(url);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      return jsonResponse({
        offset: 0,
        limit: 300,
        endOfRecords: true,
        count: 1,
        results: [occurrence(2001, "Autauga", "University botanical garden")],
      });
    });
    const cultivated = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-cultivated-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(cultivatedUrls.length === 2, "The cultivated fixture did not complete its source query.");
    assert(cultivated.assertions.length === 0, "Cultivated evidence was published.");
    assert(
      cultivated.rejections.some((entry) => entry.reason_code === "cultivated-or-captive"),
      "The cultivated record was not rejected explicitly.",
    );
    assert(
      cultivated.outcomes[0]?.status === "no-qualifying-evidence" &&
        cultivated.outcomes[0].scope_complete,
      "The completed cultivated screen did not preserve its research-only outcome.",
    );
    assert(
      cultivated.assertions.every((entry) => entry.claim_type === "recorded-present"),
      "The adapter emitted negative evidence.",
    );

    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      return jsonResponse({
        offset: 0,
        limit: 300,
        endOfRecords: true,
        count: 3,
        results: [
          occurrence(1001, "Autauga"),
          occurrence(1002, "Baldwin"),
          occurrence(1003, "Lee"),
        ],
      });
    });
    const repeated = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-repeated-run",
    });
    assert(
      repeated.assertions.every(
        (entry) => !routed.assertions.some((prior) => prior.eventId === entry.eventId),
      ),
      "A later immutable run reused assertion event IDs from an earlier run.",
    );
    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      return jsonResponse({
        offset: 0,
        limit: 300,
        endOfRecords: true,
        count: 1,
        results: [occurrence(2001, "Autauga", "University botanical garden")],
      });
    });
    const repeatedCultivated = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-repeated-cultivated-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(
      repeatedCultivated.rejections.every(
        (entry) =>
          !cultivated.rejections.some((prior) => prior.rejection_id === entry.rejection_id),
      ),
      "A later immutable run reused rejection IDs from an earlier run.",
    );

    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      return jsonResponse({
        offset: 0,
        limit: 300,
        endOfRecords: true,
        count: 2,
        results: [occurrence(3001, "Autauga")],
      });
    });
    const truncated = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-truncated-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(
      truncated.outcomes[0]?.status === "needs-followup" &&
        !truncated.outcomes[0].scope_complete,
      "A terminal count mismatch created a complete outcome.",
    );
    assert(
      truncated.errors.some((entry) => entry.code === "gbif-terminal-count-mismatch"),
      "A terminal count mismatch was not recorded explicitly.",
    );

    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      return jsonResponse({
        offset: 0,
        limit: 300,
        endOfRecords: false,
        count: 100001,
        results: [occurrence(3101, "Autauga")],
      });
    });
    const beyondWindow = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-window-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(
      beyondWindow.errors.some(
        (entry) => entry.code === "gbif-search-window-limit-exceeded",
      ) && beyondWindow.outcomes[0]?.status === "needs-followup",
      "A result beyond the official GBIF search window was treated as complete.",
    );

    const countyFree = { ...occurrence(3201, "Autauga"), county: undefined };
    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      return jsonResponse({
        offset: 0,
        limit: 300,
        endOfRecords: true,
        count: 1,
        results: [countyFree],
      });
    });
    const sharedMissingCounty = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-shared-rejection-run",
    });
    assert(
      sharedMissingCounty.rejections.length === 1 &&
        sharedMissingCounty.rejections[0]?.normalized_target.county_fips === null,
      "A missing-county record was duplicated across requested counties.",
    );
    assert(
      sharedMissingCounty.outcomes.every(
        (outcome) => outcome.rejection_ids.length === 1 && outcome.scope_complete,
      ),
      "The shared missing-county rejection was not linked to each pair outcome.",
    );

    const missingSourceName = {
      ...occurrence(3301, "Autauga"),
      acceptedScientificName: undefined,
    };
    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      return jsonResponse({
        offset: 0,
        limit: 300,
        endOfRecords: true,
        count: 1,
        results: [missingSourceName],
      });
    });
    const missingName = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-missing-name-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(
      missingName.assertions.length === 0 &&
        missingName.rejections.some((entry) => entry.reason_code === "taxon-ambiguous"),
      "A record without an explicit source scientific name was published.",
    );

    const missingPublisher = {
      ...occurrence(3401, "Autauga"),
      datasetKey: undefined,
      institutionCode: undefined,
    };
    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      return jsonResponse({
        offset: 0,
        limit: 300,
        endOfRecords: true,
        count: 1,
        results: [missingPublisher],
      });
    });
    const publisherless = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-missing-publisher-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(
      publisherless.assertions.length === 0 &&
        publisherless.rejections.some((entry) => entry.reason_code === "record-failed"),
      "A record without dataset or institution identity was published.",
    );

    let pageIndex = 0;
    globalThis.fetch = mockFetch(async (input) => {
      const url = String(input);
      if (url.includes("/species/match")) {
        return jsonResponse({
          usageKey: 123,
          speciesKey: 123,
          matchType: "EXACT",
          confidence: 100,
          rank: "SPECIES",
          canonicalName: "Example species",
        });
      }
      const offset = pageIndex;
      pageIndex += 1;
      return jsonResponse({
        offset,
        limit: 1,
        endOfRecords: offset === 1,
        count: 2,
        results: [occurrence(3501, "Autauga", "University botanical garden")],
      });
    });
    const repeatedPageRecord = await gbifPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-gbif-repeated-page-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
        pageLimit: 1,
      },
    });
    assert(
      repeatedPageRecord.outcomes[0]?.status === "needs-followup" &&
        new Set(repeatedPageRecord.rejections.map((entry) => entry.rejection_id)).size ===
          repeatedPageRecord.rejections.length,
      "Repeated page records produced a complete screen or duplicate rejection IDs.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log(
    JSON.stringify(
      {
        oneStatewideFetchPerSpecies: true,
        exactCountyRouting: true,
        cultivatedRecordRejected: true,
        negativeClaimsEmitted: false,
        repeatRunEventIdsUnique: true,
        terminalCountMismatchIncomplete: true,
        searchWindowBoundaryEnforced: true,
        sharedMissingCountyRejection: true,
        missingSourceNameRejected: true,
        missingPublisherIdentityRejected: true,
        repeatedPageRecordIncomplete: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
