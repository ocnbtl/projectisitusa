import { idigbioPreservedSpecimensAdapter } from "./research/adapters/idigbio-preserved-specimens";

import type { SourceAdapterContext } from "@/lib/research/source-adapter";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const parameters = {
  stateCode: "AL",
  candidateLimit: 2,
  candidatePairs: ["01001:example-species", "01003:example-species"],
  basisOfRecord: "preservedspecimen",
  country: "united states",
  stateProvince: "alabama",
  pageLimit: 300,
  maxPagesPerSpecies: 1000,
  sortField: "uuid",
  sortOrder: "asc",
};

const context: SourceAdapterContext = {
  runId: "synthetic-idigbio-run",
  sourceId: "idigbio-preserved-specimens",
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
  runStartedAt: "2026-07-15T12:00:00.000Z",
  parameters,
};

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function record(
  suffix: number,
  county: string | null,
  options: {
    locality?: string;
    providerScientificName?: string;
    providerCounty?: string | null;
  } = {},
) {
  const uuid = `00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
  const data: Record<string, string> = {
    "dcterms:license": "CC0",
    "dcterms:rightsHolder": "Synthetic collection",
    "dwc:basisOfRecord": "PreservedSpecimen",
    "dwc:country": "United States",
    "dwc:stateProvince": "Alabama",
    "dwc:eventDate": "2025-06-01",
    "dwc:scientificName": options.providerScientificName ?? "Example species",
    "dwc:locality": options.locality ?? "Wild collection",
  };
  const providerCounty = options.providerCounty === undefined ? county : options.providerCounty;
  if (providerCounty) data["dwc:county"] = providerCounty;
  return {
    uuid,
    type: "records",
    data,
    indexTerms: {
      uuid,
      scientificname: "example species",
      canonicalname: "example species",
      taxonid: "synthetic-taxon",
      taxonrank: "species",
      taxonomicstatus: "accepted",
      basisofrecord: "preservedspecimen",
      country: "united states",
      countrycode: "usa",
      stateprovince: "alabama",
      ...(county ? { county } : {}),
      geopoint: { lat: 32.5, lon: -86.5 },
      locality: options.locality ?? "Wild collection",
      eventdate: "2025-06-01",
      institutioncode: "SYNTH",
      collectioncode: "SYN",
      catalognumber: `SYN-${suffix}`,
      recordset: "11111111-1111-4111-8111-111111111111",
      occurrenceid: `synthetic:${suffix}`,
      flags: [],
    },
  };
}

const attribution = [
  {
    uuid: "11111111-1111-4111-8111-111111111111",
    itemCount: 4,
    name: "Synthetic recordset",
    url: "https://example.test/recordset",
    publisher: "22222222-2222-4222-8222-222222222222",
  },
];

function response(items: unknown[], itemCount = items.length, lastModified = "2026-04-23T16:44:37.718Z") {
  return { itemCount, lastModified, items, attribution };
}

async function main() {
  const originalFetch = globalThis.fetch;
  const mockFetch = (
    handler: (input: URL | RequestInfo) => Promise<Response>,
  ): typeof fetch => handler as typeof fetch;

  try {
    const routedUrls: string[] = [];
    globalThis.fetch = mockFetch(async (input) => {
      routedUrls.push(String(input));
      return jsonResponse(
        response([
          record(1, "Autauga"),
          record(2, "Baldwin"),
          record(3, "Lee"),
          record(4, null),
        ]),
      );
    });
    const routed = await idigbioPreservedSpecimensAdapter.run(context);
    assert(routedUrls.length === 1, "The adapter did not reuse one statewide species query.");
    const routedUrl = new URL(routedUrls[0]);
    assert(
      routedUrl.searchParams.get("sort") === JSON.stringify([{ uuid: "asc" }]),
      "The adapter did not request a stable UUID sort.",
    );
    const fields = JSON.parse(routedUrl.searchParams.get("fields") ?? "[]") as string[];
    assert(
      fields.includes("data.dwc:scientificName") &&
        fields.includes("data.dwc:county") &&
        !fields.includes("occurrencestatus"),
      "The adapter did not request supported raw provider fields alongside index terms.",
    );
    const query = JSON.parse(routedUrl.searchParams.get("rq") ?? "{}") as Record<string, string>;
    assert(
      query.scientificname === "example species" &&
        query.stateprovince === "alabama" &&
        query.basisofrecord === "preservedspecimen",
      "The adapter did not preserve its declared statewide source query.",
    );
    assert(routed.assertions.length === 2, "The adapter did not route exact county evidence.");
    assert(routed.reviews.length === 2, "The adapter did not review exact assertions.");
    assert(
      routed.rejections.length === 1 &&
        routed.rejections[0].reason_code === "geography-missing" &&
        routed.rejections[0].normalized_target.county_fips === null,
      "A county-free record was not preserved once as a shared geography rejection.",
    );
    assert(
      routed.outcomes.length === 2 &&
        routed.outcomes.every(
          (outcome) => outcome.status === "evidence-found" && outcome.scope_complete,
        ),
      "The routed county outcomes are not complete evidence-found results.",
    );
    assert(
      routed.assertions.every(
        (entry) =>
          entry.source_url.startsWith("https://portal.idigbio.org/portal/records/") &&
          entry.claim_type === "recorded-present",
      ),
      "The adapter emitted an unsupported claim or unstable source URL.",
    );

    globalThis.fetch = mockFetch(async () =>
      jsonResponse(response([record(10, "Autauga", { locality: "Botanical garden" })])),
    );
    const cultivated = await idigbioPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-idigbio-cultivated-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(cultivated.assertions.length === 0, "Cultivated evidence was published.");
    assert(
      cultivated.rejections.some((entry) => entry.reason_code === "cultivated-or-captive"),
      "The cultivated record was not rejected explicitly.",
    );
    assert(
      cultivated.outcomes[0]?.status === "no-qualifying-evidence" &&
        cultivated.outcomes[0].scope_complete,
      "The completed cultivated screen did not preserve a research-only outcome.",
    );

    globalThis.fetch = mockFetch(async () =>
      jsonResponse(
        response([
          record(20, "Autauga", { providerScientificName: "Different species" }),
          record(21, null),
        ]),
      ),
    );
    const conservative = await idigbioPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-idigbio-conservative-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(conservative.assertions.length === 0, "Ambiguous taxon or county evidence was published.");
    assert(
      conservative.rejections.some((entry) => entry.reason_code === "taxon-mismatch") &&
        conservative.rejections.some(
          (entry) =>
            entry.reason_code === "geography-missing" &&
            entry.normalized_target.county_fips === null,
        ),
      "Exact taxon and explicit county failures were not preserved.",
    );

    const pagedUrls: string[] = [];
    globalThis.fetch = mockFetch(async (input) => {
      const url = new URL(String(input));
      pagedUrls.push(url.toString());
      const offset = Number(url.searchParams.get("offset"));
      return jsonResponse(
        response([offset === 0 ? record(30, "Autauga") : record(31, "Lee")], 2),
      );
    });
    const paged = await idigbioPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-idigbio-paged-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
        pageLimit: 1,
      },
    });
    assert(pagedUrls.length === 2, "The adapter did not page to the declared itemCount.");
    assert(
      new URL(pagedUrls[1]).searchParams.get("offset") === "1",
      "The stable pagination offset did not advance by returned records.",
    );
    assert(
      paged.errors.length === 0 &&
        paged.candidateRecordCount === 2 &&
        paged.outcomes[0]?.scope_complete,
      "The terminal UUID and itemCount reconciliation failed.",
    );

    globalThis.fetch = mockFetch(async () =>
      jsonResponse(response([record(40, "Autauga")], 2)),
    );
    const incomplete = await idigbioPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-idigbio-incomplete-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
        maxPagesPerSpecies: 1,
      },
    });
    assert(
      incomplete.errors.some((entry) => entry.code === "idigbio-page-limit-exceeded") &&
        incomplete.outcomes[0]?.status === "needs-followup" &&
        !incomplete.outcomes[0].scope_complete,
      "An incomplete statewide screen was marked complete.",
    );

    globalThis.fetch = mockFetch(async () =>
      jsonResponse(response([record(50, "Autauga")])),
    );
    const repeated = await idigbioPreservedSpecimensAdapter.run({
      ...context,
      runId: "synthetic-idigbio-repeated-run",
      requestedPairs: [context.requestedPairs[0]],
      parameters: {
        ...parameters,
        candidateLimit: 1,
        candidatePairs: ["01001:example-species"],
      },
    });
    assert(
      repeated.assertions.every(
        (entry) => !routed.assertions.some((prior) => prior.eventId === entry.eventId),
      ),
      "A later immutable run reused assertion event IDs from an earlier run.",
    );

    console.log("iDigBio preserved specimen adapter tests passed.");
  } finally {
    globalThis.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
