import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { buildGbifSourceVerification } from "./research/gbif-source-verification";

import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import type { ImmutableResearchRunReceipt } from "@/lib/research/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const runDirectory =
  "src/data/research/runs/20260728T030000Z__gbif-preserved-specimens__synthetic";
const artifacts: SourceAdapterResult["artifacts"] = [
  {
    filename: "gbif-species-match-example-species.json",
    mediaType: "application/json",
    contents: JSON.stringify({
      usageKey: 123,
      speciesKey: 123,
      matchType: "EXACT",
      confidence: 100,
      rank: "SPECIES",
      canonicalName: "Example species",
    }),
  },
  {
    filename: "gbif-occurrences-example-species-000000.json",
    mediaType: "application/json",
    contents: JSON.stringify({
      offset: 0,
      limit: 300,
      endOfRecords: false,
      count: 301,
      results: Array.from({ length: 300 }, (_, index) => ({ key: index + 1 })),
    }),
  },
  {
    filename: "gbif-occurrences-example-species-000300.json",
    mediaType: "application/json",
    contents: JSON.stringify({
      offset: 300,
      limit: 300,
      endOfRecords: true,
      count: 301,
      results: [{ key: 301 }],
    }),
  },
];
const artifactReferences = artifacts.map((artifact) => ({
  path: `${runDirectory}/artifacts/${artifact.filename}`,
  sha256: "a".repeat(64),
  bytes: Buffer.byteLength(artifact.contents),
  media_type: artifact.mediaType,
}));
const receipt = {
  schemaVersion: 1,
  run_id: "20260728T030000Z__gbif-preserved-specimens__synthetic",
  status: "complete",
  started_at: "2026-07-28T03:00:00.000Z",
  finished_at: "2026-07-28T03:00:03.000Z",
  actor_type: "adapter",
  actor_id: "gbif-preserved-specimens@1.1.0",
  source_id: "gbif-preserved-specimens",
  source_registry_hash: "b".repeat(64),
  adapter_id: "gbif-preserved-specimens",
  adapter_version: "1.1.0",
  adapter_code_hash: "c".repeat(64),
  code_commit: "d".repeat(40),
  parameter_hash: "e".repeat(64),
  parameters: {
    stateCode: "AL",
    stateProvince: "Alabama",
    candidateLimit: 2,
    candidatePairs: [
      "01001:example-species",
      "01003:example-species",
    ],
    basisOfRecord: "PRESERVED_SPECIMEN",
    occurrenceStatus: "PRESENT",
    minimumMatchConfidence: 95,
    pageLimit: 300,
  },
  requested_scope: {
    state_code: "AL",
    county_fips: ["01001", "01003"],
    species_ids: ["example-species"],
    pair_keys: ["01001:example-species", "01003:example-species"],
    date_range: { start: null, end: null },
  },
  upstream_requests: [
    {
      url: "https://api.gbif.org/v1/species/match?name=Example+species&rank=SPECIES&strict=true",
      status: 200,
      retrieved_at: "2026-07-28T03:00:01.000Z",
      record_count: 1,
    },
    {
      url: "https://api.gbif.org/v1/occurrence/search?country=US&stateProvince=Alabama&basisOfRecord=PRESERVED_SPECIMEN&occurrenceStatus=PRESENT&taxonKey=123&limit=300&offset=0",
      status: 200,
      retrieved_at: "2026-07-28T03:00:02.000Z",
      record_count: 300,
    },
    {
      url: "https://api.gbif.org/v1/occurrence/search?country=US&stateProvince=Alabama&basisOfRecord=PRESERVED_SPECIMEN&occurrenceStatus=PRESENT&taxonKey=123&limit=300&offset=300",
      status: 200,
      retrieved_at: "2026-07-28T03:00:03.000Z",
      record_count: 1,
    },
  ],
  artifacts: artifactReferences,
  outputs: [],
  counts: {
    requested_pairs: 2,
    candidate_records: 301,
    assertion_events: 0,
    review_events: 0,
    rejection_records: 0,
    duplicate_records: 0,
    error_count: 0,
    pair_outcomes: 2,
  },
  errors: [],
  known_caveats: [],
  source_warnings: [],
  deviations: [],
  rerun_command: "synthetic",
} as ImmutableResearchRunReceipt;

const verification = buildGbifSourceVerification({
  receipt,
  artifacts,
  speciesScopes: [
    {
      speciesId: "example-species",
      scientificName: "Example species",
    },
  ],
});
const schema = JSON.parse(
  fs.readFileSync(
    path.resolve(
      "src/data/research/schemas/worker-source-verification.schema.json",
    ),
    "utf8",
  ),
);
z.fromJSONSchema(schema).parse(verification);
assert(
  verification.acquisition.requests.length === 3,
  "Source verification omitted a provider request.",
);
assert(
  verification.acquisition.requests[1]?.pagination.pageIndex === 0 &&
    verification.acquisition.requests[1]?.pagination.endOfRecords === false &&
    verification.acquisition.requests[2]?.pagination.pageIndex === 1 &&
    verification.acquisition.requests[2]?.pagination.endOfRecords === true,
  "Source verification did not preserve contiguous terminal pagination.",
);
assert(
  verification.retainedEvidence.length === artifacts.length,
  "Source verification omitted retained artifacts.",
);
assert(
  !verification.negativeEvidence.supportsVerifiedAbsence &&
    !verification.negativeEvidence.supportsNotDetected,
  "GBIF source verification claimed unsupported negative evidence.",
);

console.log(
  JSON.stringify(
    {
      schemaValid: true,
      requestCount: verification.acquisition.requests.length,
      paginationComplete: verification.acquisition.paginationComplete,
      negativeEvidenceClaimed: false,
    },
    null,
    2,
  ),
);
