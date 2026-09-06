import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { z } from "zod";
import { stableJson } from "@/lib/research/run-files";
import parameterSchema from "@/data/research/schemas/retained-herbarium-preserved-specimens-parameters.schema.json";
import reviewFixtures from "./fixtures/harvard-specimen-metadata-review-20260906.json";
import { specimenRowSha256, specimenRecordIdentity, specimenRecoveryHold } from "./research/specimen-record-metadata";

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
  type RetainedHerbariumTarget,
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


function sealRecovery(fixture: SourceAdapterContext) {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  fixture.parameters.targetPairSetSha256 = hash((fixture.parameters.candidatePairs as string[]).slice().sort().join("\n"));
  fixture.parameters.metadataRecovery = { version: 1, asOf: "2026-09-06", extractedAt: "2026-09-06T07:00:00.000Z",
    preflightSha256: reviewFixtures.preflightSha256, witnessSetSha256: hash(stableJson(fixture.parameters.targets)) };
}

function recoveryContext(record = reviewFixtures.positive) {
  const fixture = context("harvard-huh-usa");
  fixture.runStartedAt = "2026-09-06T07:01:00.000Z";
  const target = { pairKey: record.pairKey, ...structuredClone(record.witness) };
  fixture.stateCode = target.stateCode;
  fixture.parameters.stateCode = target.stateCode;
  fixture.parameters.targets = [target];
  fixture.parameters.candidatePairs = [record.pairKey];
  fixture.requestedPairs = [{ countyFips: target.countyFips, countyName: target.sourceCounty,
    speciesId: target.speciesId, scientificName: target.scientificName }];
  sealRecovery(fixture);
  return fixture;
}

async function testRecovery() {
  const schema = z.fromJSONSchema(parameterSchema as unknown as Parameters<typeof z.fromJSONSchema>[0]);
  for (const profile of Object.keys(profiles) as ProfileName[]) schema.parse(context(profile).parameters);
  const fixture = recoveryContext();
  schema.parse(fixture.parameters);
  const result = await harvardHuhUsaPreservedSpecimensAdapter.run(fixture);
  assert.equal(result.assertions.length, 1);
  assert.equal(result.assertions[0].source_record_date, null);
  assert.equal(result.assertions[0].retrieved_at, profiles["harvard-huh-usa"].acquiredAt);
  assert.match(result.assertions[0].temporal_scope!, /normalized collection date unknown/u);
  assert(result.assertions[0].notes.some((note) => /CC BY 4.0; rights holder President and Fellows of Harvard College/u.test(note)));
  assert(result.reviews[0].reason_codes.includes("normalized-collection-date-unknown"));
  assert(!result.reviews[0].reason_codes.includes("valid-event-year"));
  assert.equal(result.outcomes[0].status, "evidence-found");
  assert.equal(result.upstreamRequests.length, 0);

  for (const hold of reviewFixtures.holds) {
    assert.equal(specimenRowSha256(hold.witness.sourceRow), hold.witness.sourceRowSha256);
    assert.equal(specimenRecoveryHold(hold.witness.sourceRow), hold.reason);
    await assert.rejects(() => harvardHuhUsaPreservedSpecimensAdapter.run(recoveryContext(hold)), /Recovery witness held/u, hold.pairKey);
  }
  for (const identityMode of ["core", "occurrence"] as const) {
    const single = recoveryContext();
    const target = (single.parameters.targets as RetainedHerbariumTarget[])[0];
    const row = target.sourceRow!;
    if (identityMode === "core") row.occurrenceID = "";
    else row.id = "";
    Object.assign(target, specimenRecordIdentity(row), { sourceRowSha256: specimenRowSha256(row) });
    sealRecovery(single);
    schema.parse(single.parameters);
    const assertion = (await harvardHuhUsaPreservedSpecimensAdapter.run(single)).assertions[0];
    assert.equal(assertion.source_record_id, identityMode === "core"
      ? "harvard-huh-usa-preserved-specimens-record-id:" + HARVARD_HUH_USA_ARCHIVE_SHA256 + ":" + target.recordId
      : "harvard-huh-usa-preserved-specimens:" + target.occurrenceId);
  }
  const dated = recoveryContext();
  const datedTarget = (dated.parameters.targets as RetainedHerbariumTarget[])[0];
  Object.assign(datedTarget.sourceRow!, { eventDate: "1901-06-05", year: "1901" });
  Object.assign(datedTarget, { eventDate: "1901-06-05", year: 1901, sourceRowSha256: specimenRowSha256(datedTarget.sourceRow!) });
  sealRecovery(dated);
  assert.equal((await harvardHuhUsaPreservedSpecimensAdapter.run(dated)).assertions[0].source_record_date, "1901-06-05");

  const mutations = ["row-hash", "date-invalid", "date-future", "date-interval", "date-conflict", "basis", "status", "state", "county",
    "taxonomy", "infraspecific", "qualifier", "cultivation", "identity", "attribution", "locator", "chronology", "witness-set",
    "reporting-date", "mode"] as const;
  for (const mutation of mutations) {
    const bad = recoveryContext();
    const target = (bad.parameters.targets as RetainedHerbariumTarget[])[0];
    const row = target.sourceRow!;
    if (mutation === "row-hash") row.catalogNumber = "tampered";
    if (mutation === "date-invalid") row.eventDate = "2024-02-30";
    if (mutation === "date-future") row.eventDate = "2027-01-01";
    if (mutation === "date-interval") row.eventDate = "1901/1902";
    if (mutation === "date-conflict") { row.eventDate = "1901"; row.year = "1902"; }
    if (mutation === "basis") row.basisOfRecord = "HumanObservation";
    if (mutation === "status") row.occurrenceStatus = "absent";
    if (mutation === "state") row.stateProvince = target.stateCode === "NY" ? "Oregon" : "New York";
    if (mutation === "county") row.county = "Definitely another county";
    if (mutation === "taxonomy") row.genus = "Ambiguous";
    if (mutation === "infraspecific") row.infraspecificEpithet = "subspecies";
    if (mutation === "qualifier") row.identificationQualifier = "cf.";
    if (mutation === "cultivation") row.fieldNotes = "Specimen cultivated in greenhouse";
    if (mutation === "identity") { row.id = ""; row.occurrenceID = ""; target.recordId = ""; target.occurrenceId = ""; }
    if (mutation === "attribution") target.rightsHolder = "Invented owner";
    if (mutation === "locator") target.references = "https://example.invalid/replaced";
    if (mutation !== "row-hash") target.sourceRowSha256 = specimenRowSha256(row);
    sealRecovery(bad);
    const recovery = bad.parameters.metadataRecovery as Record<string, unknown>;
    if (mutation === "chronology") recovery.extractedAt = "2026-09-07T00:00:00.000Z";
    if (mutation === "witness-set") recovery.witnessSetSha256 = "0".repeat(64);
    if (mutation === "reporting-date") recovery.asOf = "2026-09-07";
    if (mutation === "mode") delete bad.parameters.metadataRecovery;
    await assert.rejects(() => harvardHuhUsaPreservedSpecimensAdapter.run(bad), /Recovery|Harvard|recovery/u, mutation);
  }
  const stripped = recoveryContext();
  delete (stripped.parameters.targets as Array<Record<string, unknown>>)[0].sourceRow;
  assert.equal(schema.safeParse(stripped.parameters).success, false);
  const implicit = recoveryContext();
  delete implicit.parameters.metadataRecovery;
  assert.equal(schema.safeParse(implicit.parameters).success, false);
  const torch = recoveryContext();
  torch.parameters.profile = "torch-brit";
  assert.equal(schema.safeParse(torch.parameters).success, false);

  const duplicated = recoveryContext();
  (duplicated.parameters.targets as unknown[]).push(structuredClone((duplicated.parameters.targets as unknown[])[0]));
  (duplicated.parameters.candidatePairs as string[]).push((duplicated.parameters.candidatePairs as string[])[0]);
  duplicated.requestedPairs.push({ ...duplicated.requestedPairs[0] });
  sealRecovery(duplicated);
  await assert.rejects(() => harvardHuhUsaPreservedSpecimensAdapter.run(duplicated), /repeat/u);
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

    await testRecovery();

    const invalid = context("torch-brit");
    delete (invalid.parameters.targets as Array<Record<string, unknown>>)[0].rights;
    await assert.rejects(() => torchBritPreservedSpecimensAdapter.run(invalid), /row rights differ/u);
  } finally {
    globalThis.fetch = originalFetch;
  }
  process.stdout.write("Retained herbarium preserved-specimen adapter tests passed.\n");
}

void main();
