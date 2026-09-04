import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

import type { SourceAdapterContext } from "@/lib/research/source-adapter";
import {
  HARVARD_HUH_USA_ARCHIVE_SHA256,
  HARVARD_HUH_USA_DATASET_URL,
  HARVARD_HUH_USA_METADATA_URL,
  HARVARD_HUH_USA_POLICY_URL,
  NYBG_ARCHIVE_SHA256,
  NYBG_DATASET_URL,
  NYBG_METADATA_URL,
  NYBG_POLICY_URL,
  SMITHSONIAN_NMNH_ARCHIVE_SHA256,
  SMITHSONIAN_NMNH_DATASET_URL,
  SMITHSONIAN_NMNH_METADATA_URL,
  SMITHSONIAN_NMNH_POLICY_URL,
  TORCH_BRIT_ARCHIVE_SHA256,
  TORCH_BRIT_DATASET_URL,
  TORCH_BRIT_METADATA_URL,
  TORCH_BRIT_POLICY_URL,
  harvardHuhUsaPreservedSpecimensAdapter,
  nybgPreservedSpecimensAdapter,
  smithsonianNmnhPreservedSpecimensAdapter,
  torchBritPreservedSpecimensAdapter,
} from "./research/adapters/retained-herbarium-preserved-specimens";

const pairKey = "36001:agrostis-capillaris";
const targetPairSetSha256 = createHash("sha256").update(pairKey).digest("hex");

type ProfileName = "nybg" | "torch-brit" | "smithsonian-nmnh" | "harvard-huh-usa";

const profiles = {
  nybg: {
    sourceId: "nybg-preserved-specimens",
    adapter: nybgPreservedSpecimensAdapter,
    datasetUrl: NYBG_DATASET_URL,
    metadataUrl: NYBG_METADATA_URL,
    policyUrl: NYBG_POLICY_URL,
    datasetVersion: "1.103",
    publicationDate: "2026-08-25",
    lastModified: "Tue, 25 Aug 2026 05:05:10 GMT",
    etag: null,
    archiveBytes: 736185551,
    archiveSha256: NYBG_ARCHIVE_SHA256,
    occurrenceBytes: 3243235286,
    occurrenceSha256: "69c609fcb3da364149784f9afa9b78a6be61b95318b8e7e768244c1bebc35154",
    acquiredAt: "2026-09-04T04:13:16.000Z",
    sourceCounty: "Albany Co.",
    expectedCounty: "Albany County",
    recordId: "f70e7abc-c47d-401e-8916-c8aa00d70bc1",
    occurrenceId: "f70e7abc-c47d-401e-8916-c8aa00d70bc1",
    institutionCode: "NY",
    rightsHolder: "The New York Botanical Garden",
    licenseLabel: "CC0 1.0",
  },
  "torch-brit": {
    sourceId: "torch-brit-preserved-specimens",
    adapter: torchBritPreservedSpecimensAdapter,
    datasetUrl: TORCH_BRIT_DATASET_URL,
    metadataUrl: TORCH_BRIT_METADATA_URL,
    policyUrl: TORCH_BRIT_POLICY_URL,
    datasetVersion: "2026-09-03",
    publicationDate: "2026-09-03",
    lastModified: "Thu, 03 Sep 2026 16:50:07 GMT",
    etag: '"7c57d13-65a96f1b83eed"',
    archiveBytes: 130383123,
    archiveSha256: TORCH_BRIT_ARCHIVE_SHA256,
    occurrenceBytes: 539901972,
    occurrenceSha256: "9c8721ef160f19a322a1366e3df82f5068aebdf352c3808993b6e45daaf51e2e",
    acquiredAt: "2026-09-04T04:08:03.000Z",
    sourceCounty: "Albany",
    expectedCounty: "Albany",
    recordId: "12345",
    occurrenceId: "8293d451-159b-4636-a24b-4fa071089ba3",
    institutionCode: "BRIT",
    rightsHolder: "Botanical Research Institute of Texas",
    licenseLabel: "CC0 1.0",
  },
  "smithsonian-nmnh": {
    sourceId: "smithsonian-nmnh-preserved-specimens",
    adapter: smithsonianNmnhPreservedSpecimensAdapter,
    datasetUrl: SMITHSONIAN_NMNH_DATASET_URL,
    metadataUrl: SMITHSONIAN_NMNH_METADATA_URL,
    policyUrl: SMITHSONIAN_NMNH_POLICY_URL,
    datasetVersion: "1.112",
    publicationDate: "2026-09-02",
    lastModified: "Wed, 02 Sep 2026 10:10:41 GMT",
    etag: null,
    archiveBytes: 1525644039,
    archiveSha256: SMITHSONIAN_NMNH_ARCHIVE_SHA256,
    occurrenceBytes: 6535399365,
    occurrenceSha256: "e87cd8b1fbc991275adcf8822373ebe32dfd25499959550cee68e44c8c8d09ab",
    acquiredAt: "2026-09-04T05:39:58.000Z",
    sourceCounty: "Albany Co.",
    expectedCounty: "Albany County",
    recordId: "nmnh-fixture-12345",
    occurrenceId: "https://collections.nmnh.si.edu/fixture/12345",
    institutionCode: "US",
    rightsHolder: "Smithsonian Institution",
    licenseLabel: "CC0 1.0",
  },
  "harvard-huh-usa": {
    sourceId: "harvard-huh-usa-preserved-specimens",
    adapter: harvardHuhUsaPreservedSpecimensAdapter,
    datasetUrl: HARVARD_HUH_USA_DATASET_URL,
    metadataUrl: HARVARD_HUH_USA_METADATA_URL,
    policyUrl: HARVARD_HUH_USA_POLICY_URL,
    datasetVersion: "1.74",
    publicationDate: "2026-08-29",
    lastModified: "not-provided-by-provider",
    etag: null,
    archiveBytes: 197742128,
    archiveSha256: HARVARD_HUH_USA_ARCHIVE_SHA256,
    occurrenceBytes: 1164383110,
    occurrenceSha256: "e6babcd797b50a93241788a935b8ff284e02d5fcd2955e0e071ec369a9e1ad40",
    acquiredAt: "2026-09-04T06:18:23.126Z",
    sourceCounty: "Albany",
    expectedCounty: "Albany",
    recordId: "harvard-fixture-12345",
    occurrenceId: "45cc9555-c134-4045-bbe0-745a4c5a1120",
    institutionCode: "GH",
    rightsHolder: "President and Fellows of Harvard College",
    licenseLabel: "CC BY 4.0",
  },
} as const;

function context(profile: ProfileName): SourceAdapterContext {
  const fixture = profiles[profile];
  const sourceId = fixture.sourceId;
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
      datasetUrl: fixture.datasetUrl,
      metadataUrl: fixture.metadataUrl,
      usagePolicyUrl: fixture.policyUrl,
      datasetVersion: fixture.datasetVersion,
      publicationDate: fixture.publicationDate,
      datasetLastModified: fixture.lastModified,
      datasetEtag: fixture.etag,
      archiveBytes: fixture.archiveBytes,
      archiveSha256: fixture.archiveSha256,
      occurrenceBytes: fixture.occurrenceBytes,
      occurrenceSha256: fixture.occurrenceSha256,
      archiveAcquiredAt: fixture.acquiredAt,
      preflightEvaluationId: `${sourceId}-preflight-20260904-r1`,
      targetPairSetSha256,
      targets: [{
        pairKey,
        recordId: fixture.recordId,
        occurrenceId: fixture.occurrenceId,
        countyFips: "36001",
        stateCode: "NY",
        sourceState: "New York",
        sourceCounty: fixture.sourceCounty,
        speciesId: "agrostis-capillaris",
        scientificName: "Agrostis capillaris",
        eventDate: "2024-06-01",
        year: 2024,
        institutionCode: fixture.institutionCode,
        collectionCode: fixture.institutionCode,
        catalogNumber: "12345",
        ...(profile === "torch-brit" ? { rights: "http://creativecommons.org/publicdomain/zero/1.0/" } : {}),
        rightsHolder: fixture.rightsHolder,
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
    for (const profile of Object.keys(profiles) as ProfileName[]) {
      const { adapter, expectedCounty, licenseLabel } = profiles[profile];
      const result = await adapter.run(context(profile));
      assert.equal(result.assertions.length, 1);
      assert.equal(result.reviews.length, 1);
      assert.equal(result.rejections.length, 0);
      assert.equal(result.outcomes[0].status, "evidence-found");
      assert.equal(result.outcomes[0].scope_complete, true);
      assert.equal(result.assertions[0].claim_type, "recorded-present");
      assert.equal(result.assertions[0].geography_match.source_county, expectedCounty);
      assert.deepEqual(result.outcomes[0].notes, [`One retained ${licenseLabel} preserved-specimen witness supports historical recorded presence for this county-species pair.`]);
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
