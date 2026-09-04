import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import {
  NYBG_ARCHIVE_SHA256,
  NYBG_DATASET_URL,
  NYBG_METADATA_URL,
  NYBG_POLICY_URL,
  TORCH_BRIT_ARCHIVE_SHA256,
  TORCH_BRIT_DATASET_URL,
  TORCH_BRIT_METADATA_URL,
  TORCH_BRIT_POLICY_URL,
  nybgPreservedSpecimensAdapter,
  torchBritPreservedSpecimensAdapter,
} from "./research/adapters/retained-herbarium-preserved-specimens";

const pairKey = "36001:agrostis-capillaris";
const targetPairSetSha256 = createHash("sha256").update(pairKey).digest("hex");

function context(profile: "nybg" | "torch-brit"): SourceAdapterContext {
  const nybg = profile === "nybg";
  const sourceId = nybg ? "nybg-preserved-specimens" : "torch-brit-preserved-specimens";
  return {
    runId: `20260904T050000Z__${sourceId}__fixture`,
    sourceId,
    stateCode: "NY",
    requestedPairs: [{
      countyFips: "36001",
      countyName: "Albany",
      speciesId: "agrostis-capillaris",
      scientificName: "Agrostis capillaris",
    }],
    runStartedAt: "2026-09-04T04:00:00.000Z",
    parameters: {
      stateCode: "NY",
      mode: "retained-archive-witnesses",
      profile,
      datasetUrl: nybg ? NYBG_DATASET_URL : TORCH_BRIT_DATASET_URL,
      metadataUrl: nybg ? NYBG_METADATA_URL : TORCH_BRIT_METADATA_URL,
      usagePolicyUrl: nybg ? NYBG_POLICY_URL : TORCH_BRIT_POLICY_URL,
      datasetVersion: nybg ? "1.103" : "2026-09-03",
      publicationDate: nybg ? "2026-08-25" : "2026-09-03",
      datasetLastModified: nybg ? "Tue, 25 Aug 2026 05:05:10 GMT" : "Thu, 03 Sep 2026 16:50:07 GMT",
      datasetEtag: nybg ? null : '"7c57d13-65a96f1b83eed"',
      archiveBytes: nybg ? 736185551 : 130383123,
      archiveSha256: nybg ? NYBG_ARCHIVE_SHA256 : TORCH_BRIT_ARCHIVE_SHA256,
      occurrenceBytes: nybg ? 3243235286 : 539901972,
      occurrenceSha256: nybg
        ? "69c609fcb3da364149784f9afa9b78a6be61b95318b8e7e768244c1bebc35154"
        : "9c8721ef160f19a322a1366e3df82f5068aebdf352c3808993b6e45daaf51e2e",
      archiveAcquiredAt: nybg ? "2026-09-04T04:13:16.000Z" : "2026-09-04T04:08:03.000Z",
      preflightEvaluationId: `${sourceId}-preflight-20260904-r1`,
      targetPairSetSha256,
      targets: [{
        pairKey,
        recordId: nybg ? "f70e7abc-c47d-401e-8916-c8aa00d70bc1" : "12345",
        occurrenceId: nybg ? "f70e7abc-c47d-401e-8916-c8aa00d70bc1" : "8293d451-159b-4636-a24b-4fa071089ba3",
        countyFips: "36001",
        stateCode: "NY",
        sourceState: "New York",
        sourceCounty: "Albany Co.",
        speciesId: "agrostis-capillaris",
        scientificName: "Agrostis capillaris",
        eventDate: "2024-06-01",
        year: 2024,
        institutionCode: nybg ? "NY" : "BRIT",
        collectionCode: nybg ? "NY" : "BRIT",
        catalogNumber: "12345",
        ...(nybg ? {} : { rights: "http://creativecommons.org/publicdomain/zero/1.0/" }),
        rightsHolder: nybg ? "The New York Botanical Garden" : "Botanical Research Institute of Texas",
        references: "https://example.invalid/specimen/12345",
      }],
      candidatePairs: [pairKey],
    },
  };
}

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Retained herbarium replay must not use the network."); };
  try {
    for (const profile of ["nybg", "torch-brit"] as const) {
      const adapter = profile === "nybg" ? nybgPreservedSpecimensAdapter : torchBritPreservedSpecimensAdapter;
      const result = await adapter.run(context(profile));
      assert.equal(result.assertions.length, 1);
      assert.equal(result.reviews.length, 1);
      assert.equal(result.rejections.length, 0);
      assert.equal(result.outcomes[0].status, "evidence-found");
      assert.equal(result.outcomes[0].scope_complete, true);
      assert.equal(result.assertions[0].claim_type, "recorded-present");
      assert.match(result.assertions[0].source_record_id, new RegExp(`^${adapter.sourceId}:`, "u"));
      assert.equal(result.upstreamRequests.length, 0);
      const witnesses = result.artifacts.find((artifact) => artifact.filename === `${profile}-retained-witnesses.json.gz`);
      assert(witnesses && Buffer.isBuffer(witnesses.contents));
      assert.equal(JSON.parse(gunzipSync(witnesses.contents).toString("utf8"))[0].pairKey, pairKey);
    }

    const invalid = context("torch-brit");
    delete (invalid.parameters.targets as Array<Record<string, unknown>>)[0].rights;
    await assert.rejects(() => torchBritPreservedSpecimensAdapter.run(invalid), /row rights differ/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
  process.stdout.write("Retained herbarium preserved-specimen adapter tests passed.\n");
}

void main();
