import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  APPROVAL_ARTIFACT_PATH,
  APPROVAL_ARTIFACT_SHA256,
  APPROVAL_RECEIPT_PATH,
  OFFICIAL_ERADICATION_BATCH_ID,
  listOfficialEradicationSourceIds,
  officialEradicationAdapter,
} from "./research/adapters/official-eradication-determination";
import { sha256 } from "@/lib/research/run-files";

const root = process.cwd();
const approvalReceiptSha256 = sha256(
  readFileSync(path.join(root, APPROVAL_RECEIPT_PATH)),
);
const recordedAt = "2026-09-01T19:16:53.000Z";

function parameters(input: {
  stateCode: string;
  sourceId: string;
  pairKeys: string[];
  parentId: string | null;
  historical: string[];
}) {
  return {
    stateCode: input.stateCode,
    mode: "human-approved-official-eradication",
    batchId: OFFICIAL_ERADICATION_BATCH_ID,
    approvalArtifactPath: APPROVAL_ARTIFACT_PATH,
    approvalArtifactSha256: APPROVAL_ARTIFACT_SHA256,
    approvalReceiptPath: APPROVAL_RECEIPT_PATH,
    approvalReceiptSha256,
    sourceDocumentId: input.sourceId,
    parentJurisdictionEvidenceId: input.parentId,
    candidateLimit: input.pairKeys.length,
    candidatePairs: input.pairKeys,
    historicalOccurrencePairKeys: input.historical,
    humanReviewActorId: "Ocean",
    humanReviewTimestamp: recordedAt,
  };
}

async function main() {
assert.deepEqual(listOfficialEradicationSourceIds(), [
  "aphis-asian-longhorned-beetle-program-update-2026",
  "aphis-northern-giant-hornet-eradication-2024",
  "njdep-asian-longhorned-beetle-eradication-current",
  "wsda-northern-giant-hornet-eradication-2024",
]);

const absenceSource = "aphis-northern-giant-hornet-eradication-2024";
const absencePair = "01001:vespa-mandarinia";
const absence = await officialEradicationAdapter(absenceSource).run({
  runId: "fixture-vespa-absence",
  sourceId: absenceSource,
  stateCode: "AL",
  requestedPairs: [{
    countyFips: "01001",
    countyName: "Autauga",
    speciesId: "vespa-mandarinia",
    scientificName: "Vespa mandarinia",
  }],
  runStartedAt: recordedAt,
  parameters: parameters({
    stateCode: "AL",
    sourceId: absenceSource,
    pairKeys: [absencePair],
    parentId: "vespa-mandarinia-us-officially-eradicated-2024",
    historical: [],
  }),
});
assert.equal(absence.assertions.length, 1);
assert.equal(absence.assertions[0]?.claim_type, "officially-absent");
assert.equal(absence.assertions[0]?.parent_jurisdiction_evidence_id, "vespa-mandarinia-us-officially-eradicated-2024");
assert.equal(absence.reviews[0]?.review_level, "human-approved");
assert.equal(absence.reviews[0]?.actor_id, "Ocean");
assert.equal(absence.outcomes[0]?.status, "evidence-found");
assert.equal(absence.upstreamRequests.length, 0);

const presenceSource = "wsda-northern-giant-hornet-eradication-2024";
const presencePair = "53073:vespa-mandarinia";
const presence = await officialEradicationAdapter(presenceSource).run({
  runId: "fixture-vespa-history",
  sourceId: presenceSource,
  stateCode: "WA",
  requestedPairs: [{
    countyFips: "53073",
    countyName: "Whatcom",
    speciesId: "vespa-mandarinia",
    scientificName: "Vespa mandarinia",
  }],
  runStartedAt: recordedAt,
  parameters: parameters({
    stateCode: "WA",
    sourceId: presenceSource,
    pairKeys: [presencePair],
    parentId: null,
    historical: [presencePair],
  }),
});
assert.equal(presence.assertions.length, 1);
assert.equal(presence.assertions[0]?.claim_type, "recorded-present");
assert.equal(presence.assertions[0]?.source_record_date, "2021-09");
assert.equal(presence.assertions[0]?.parent_jurisdiction_evidence_id, undefined);
assert.equal(presence.reviews[0]?.publication_eligible, true);

console.log("Official eradication determination adapter tests passed.");
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
