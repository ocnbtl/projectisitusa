import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";

import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import {
  CPNWH_ARCHIVE_SHA256,
  CPNWH_CC0_LICENSE,
  CPNWH_DATASET_URL,
  CPNWH_OCCURRENCE_SHA256,
  CPNWH_POLICY_URL,
  runCpnwhPreservedSpecimens,
} from "./research/adapters/cpnwh-preserved-specimens";

const pairKey = "53001:agrostis-capillaris";

function context(): SourceAdapterContext {
  return {
    runId: "20260903T230000Z__cpnwh-preserved-specimens__fixture",
    sourceId: "cpnwh-preserved-specimens",
    stateCode: "WA",
    requestedPairs: [{
      countyFips: "53001",
      countyName: "Adams",
      speciesId: "agrostis-capillaris",
      scientificName: "Agrostis capillaris",
    }],
    runStartedAt: "2026-09-03T22:00:00.000Z",
    parameters: {
      stateCode: "WA",
      mode: "retained-archive-witnesses",
      datasetUrl: CPNWH_DATASET_URL,
      usagePolicyUrl: CPNWH_POLICY_URL,
      datasetLastModified: "Thu, 04 Jun 2026 19:05:39 GMT",
      datasetEtag: '"2045cebe-65454012e379b"',
      archiveBytes: 541445822,
      archiveSha256: CPNWH_ARCHIVE_SHA256,
      occurrenceBytes: 2132017127,
      occurrenceSha256: CPNWH_OCCURRENCE_SHA256,
      archiveAcquiredAt: "2026-09-03T22:18:31.985Z",
      preflightEvaluationId: "cpnwh-preserved-specimens-preflight-20260903-r1",
      targetPairSetSha256: "ac65ad764637b4713d872959bf72b2b9c924fd00f009f750c0ea8f0c6256dd5d",
      targets: [{
        pairKey,
        recordId: "12345",
        occurrenceId: "1782a7d3-38cc-4a21-bf01-ab0ff6befa9f",
        countyFips: "53001",
        stateCode: "WA",
        sourceState: "Washington",
        sourceCounty: "Adams",
        speciesId: "agrostis-capillaris",
        scientificName: "Agrostis capillaris",
        eventDate: "2024-06-01",
        year: 2024,
        institutionCode: "WTU",
        collectionCode: "Herbarium",
        catalogNumber: "12345",
        license: CPNWH_CC0_LICENSE,
      }],
      candidatePairs: [pairKey],
    },
  };
}

async function main() {
  const fixture = context();
  const hash = await import("node:crypto").then(({ createHash }) => createHash("sha256").update(pairKey).digest("hex"));
  fixture.parameters.targetPairSetSha256 = hash;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("CPNWH retained replay must not use the network.");
  };
  try {
    const result = await runCpnwhPreservedSpecimens(fixture);
    assert.equal(result.assertions.length, 1);
    assert.equal(result.reviews.length, 1);
    assert.equal(result.rejections.length, 0);
    assert.equal(result.outcomes.length, 1);
    assert.equal(result.outcomes[0].status, "evidence-found");
    assert.equal(result.outcomes[0].scope_complete, true);
    assert.equal(result.assertions[0].claim_type, "recorded-present");
    assert.equal(result.assertions[0].source_record_id, "cpnwh:1782a7d3-38cc-4a21-bf01-ab0ff6befa9f");
    assert.equal(result.assertions[0].source_record_date, "2024-06-01");
    assert.equal(result.assertions[0].geography_match.source_county, "Adams");
    assert.equal(result.upstreamRequests.length, 0);
    assert.equal(result.artifacts.length, 2);
    const witnesses = result.artifacts.find((artifact) => artifact.filename === "cpnwh-retained-witnesses.json.gz");
    assert(witnesses && Buffer.isBuffer(witnesses.contents));
    assert.equal(JSON.parse(gunzipSync(witnesses.contents).toString("utf8"))[0].pairKey, pairKey);

    const invalid = context();
    invalid.parameters.targetPairSetSha256 = hash;
    const target = (invalid.parameters.targets as Array<Record<string, unknown>>)[0];
    target.license = "";
    await assert.rejects(() => runCpnwhPreservedSpecimens(invalid), /license differs/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
  process.stdout.write("CPNWH preserved-specimen adapter tests passed.\n");
}

void main();
