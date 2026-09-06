import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { stableJson } from "@/lib/research/run-files";
import { specimenRowSha256, specimenRecordIdentity } from "./research/specimen-record-metadata";

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
        occurrenceId: "r6uETbHoHus8nP2sOipCTo6BL4qadIivSFRj",
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

function recoveryContext() {
  const fixture = context();
  fixture.runStartedAt = "2026-09-06T01:00:00.000Z";
  const target = (fixture.parameters.targets as Array<Record<string, unknown>>)[0];
  const row = { id: "12345", occurrenceID: "", eventDate: "", year: "", countryCode: "US", country: "United States",
    stateProvince: "Washington", county: "Adams", genus: "Agrostis", specificEpithet: "capillaris", taxonRank: "species",
    identificationQualifier: "", basisOfRecord: "PreservedSpecimen", license: CPNWH_CC0_LICENSE,
    locality: "Roadside, escaped and growing wild", occurrenceRemarks: "Collection before 1930; exact date unknown" };
  Object.assign(target, specimenRecordIdentity(row), { eventDate: null, year: null, sourceRow: row, sourceRowSha256: specimenRowSha256(row) });
  sealRecovery(fixture);
  return fixture;
}

function sealRecovery(fixture: SourceAdapterContext) {
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  fixture.parameters.targetPairSetSha256 = hash((fixture.parameters.candidatePairs as string[]).join("\n"));
  fixture.parameters.metadataRecovery = { version: 1, asOf: "2026-09-06", extractedAt: "2026-09-06T00:00:00.000Z",
    preflightSha256: "a".repeat(64), witnessSetSha256: hash(stableJson(fixture.parameters.targets)) };
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
    assert.equal(result.assertions[0].source_record_id, "cpnwh:r6uETbHoHus8nP2sOipCTo6BL4qadIivSFRj");
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

    const unsafeIdentity = context();
    unsafeIdentity.parameters.targetPairSetSha256 = hash;
    ((unsafeIdentity.parameters.targets as Array<Record<string, unknown>>)[0]).occurrenceId = "unsafe occurrence identity with spaces";
    await assert.rejects(() => runCpnwhPreservedSpecimens(unsafeIdentity), /occurrence ID is invalid/u);

    const recovered = await runCpnwhPreservedSpecimens(recoveryContext());
    assert.equal(recovered.assertions[0].source_record_id, `cpnwh-record-id:${CPNWH_ARCHIVE_SHA256}:12345`);
    assert.equal(recovered.assertions[0].source_record_date, null);
    assert.equal(recovered.assertions[0].retrieved_at, "2026-09-03T22:18:31.985Z");
    assert.match(recovered.assertions[0].temporal_scope!, /normalized collection date unknown/u);
    assert(recovered.reviews[0].reason_codes.includes("normalized-collection-date-unknown"));
    assert(!recovered.reviews[0].reason_codes.includes("valid-event-year"));
    assert(recovered.assertions.every((assertion) => assertion.claim_type === "recorded-present"));
    assert(recovered.outcomes.every((outcome) => outcome.status === "evidence-found"));

    const occurrenceOnly = recoveryContext();
    const occurrenceTarget = (occurrenceOnly.parameters.targets as Array<Record<string, unknown>>)[0];
    const occurrenceRow = occurrenceTarget.sourceRow as Record<string, string>;
    occurrenceRow.id = ""; occurrenceRow.occurrenceID = "id:12345";
    Object.assign(occurrenceTarget, specimenRecordIdentity(occurrenceRow), { sourceRowSha256: specimenRowSha256(occurrenceRow) });
    sealRecovery(occurrenceOnly);
    assert.equal((await runCpnwhPreservedSpecimens(occurrenceOnly)).assertions[0].source_record_id, "cpnwh:id:12345");

    const twoCoreIds = recoveryContext();
    const second = structuredClone((twoCoreIds.parameters.targets as Array<Record<string, unknown>>)[0]);
    Object.assign(second, { pairKey: "53003:agrostis-capillaris", countyFips: "53003", sourceCounty: "Asotin" });
    const secondRow = second.sourceRow as Record<string, string>; secondRow.id = "12346"; secondRow.county = "Asotin";
    Object.assign(second, specimenRecordIdentity(secondRow), { sourceRowSha256: specimenRowSha256(secondRow) });
    (twoCoreIds.parameters.targets as unknown[]).push(second);
    (twoCoreIds.parameters.candidatePairs as string[]).push(second.pairKey as string);
    twoCoreIds.requestedPairs.push({ countyFips: "53003", countyName: "Asotin", speciesId: "agrostis-capillaris", scientificName: "Agrostis capillaris" });
    sealRecovery(twoCoreIds);
    assert.equal((await runCpnwhPreservedSpecimens(twoCoreIds)).assertions.length, 2);

    for (const mutation of ["row", "date", "future", "cultivated", "basis", "geography", "identity", "chronology", "set-hash"] as const) {
      const bad = recoveryContext();
      const item = (bad.parameters.targets as Array<Record<string, unknown>>)[0];
      const raw = item.sourceRow as Record<string, string>;
      if (mutation === "row") raw.catalogNumber = "tampered";
      if (mutation === "date") raw.eventDate = "2024-02-30";
      if (mutation === "future") raw.eventDate = "2027-01-01";
      if (mutation === "cultivated") raw.occurrenceRemarks = "Grown in a green-house";
      if (mutation === "basis") raw.occurrenceRemarks = "INaturalist observation";
      if (mutation === "geography") raw.stateProvince = "Oregon";
      if (mutation === "identity") { raw.id = ""; item.recordId = ""; }
      if (mutation !== "row") item.sourceRowSha256 = specimenRowSha256(raw);
      sealRecovery(bad);
      if (mutation === "chronology") (bad.parameters.metadataRecovery as Record<string, unknown>).extractedAt = "2026-09-07T00:00:00Z";
      if (mutation === "set-hash") (bad.parameters.metadataRecovery as Record<string, unknown>).witnessSetSha256 = "0".repeat(64);
      await assert.rejects(() => runCpnwhPreservedSpecimens(bad), /CPNWH|Recovery/u, mutation);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
  process.stdout.write("CPNWH preserved-specimen adapter tests passed.\n");
}

void main();
