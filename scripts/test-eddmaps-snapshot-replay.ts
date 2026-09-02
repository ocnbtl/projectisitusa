import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  EDDMAPS_REPLAY_ADAPTER_ID,
  EDDMAPS_REPLAY_ADAPTER_VERSION,
  EDDMAPS_SNAPSHOT_PATH,
  EDDMAPS_SOURCE_ID,
  replayEddMapsSnapshot,
} from "./research/adapters/eddmaps-snapshot-replay";
import { selectEddMapsReplayTargets } from "./research/plan-eddmaps-snapshot-state";

const snapshotBytes = readFileSync(EDDMAPS_SNAPSHOT_PATH);
const snapshotSha256 = createHash("sha256").update(snapshotBytes).digest("hex");
const target = {
  pairKey: "01097:cirsium-arvense",
  countyFips: "01097",
  speciesId: "cirsium-arvense",
  scientificName: "Cirsium arvense",
  snapshotSpeciesId: "cirsium-arvense",
  subjectId: 2792,
};
const context = {
  runId: "20260902T030000Z__eddmaps__fixture",
  sourceId: EDDMAPS_SOURCE_ID,
  stateCode: "AL",
  requestedPairs: [{
    countyFips: target.countyFips,
    countyName: "Mobile",
    speciesId: target.speciesId,
    scientificName: target.scientificName,
  }],
  runStartedAt: "2026-09-02T03:00:00.000Z",
  parameters: {
    stateCode: "AL",
    mode: "committed-snapshot-replay",
    snapshotPath: EDDMAPS_SNAPSHOT_PATH,
    snapshotSha256,
    snapshotDate: "2026-04-26T09:34:15.599Z",
    citation: "EDDMapS. 2026. Early Detection & Distribution Mapping System. The University of Georgia - Center for Invasive Species and Ecosystem Health. Available online at https://www.eddmaps.org/.",
    officialUseBasisUrls: [
      "https://www.eddmaps.org/about/index.cfm",
      "https://www.eddmaps.org/about/appropriate_data.cfm",
    ],
    targets: [target],
    candidatePairs: [target.pairKey],
  },
};

const result = replayEddMapsSnapshot(context);
assert.equal(result.assertions.length, 1);
assert.equal(result.reviews.length, 1);
assert.equal(result.outcomes.length, 1);
assert.equal(result.rejections.length, 0);
assert.equal(result.upstreamRequests.length, 0);
assert.equal(result.assertions[0]?.source_record_date, null);
assert.equal(result.assertions[0]?.claim_type, "recorded-present");
assert.equal(result.reviews[0]?.publication_eligible, true);
assert.equal(result.outcomes[0]?.status, "evidence-found");
assert.deepEqual(result.outcomes[0]?.query_urls, ["https://www.eddmaps.org/species/subject.cfm?sub=2792"]);
assert.equal(result.artifacts.length, 1);
assert.equal(EDDMAPS_REPLAY_ADAPTER_ID, "eddmaps-snapshot-replay");
assert.equal(EDDMAPS_REPLAY_ADAPTER_VERSION, "1.0.0");
assert.throws(
  () => replayEddMapsSnapshot({
    ...context,
    parameters: { ...context.parameters, snapshotSha256: "0".repeat(64) },
  }),
  /snapshot hash differs/u,
);
assert.deepEqual(
  selectEddMapsReplayTargets([
    { ...target, pairKey: "01003:cirsium-arvense", countyFips: "01003", baselineStatus: "researched-unresolved" },
    { ...target, baselineStatus: "not-researched" },
  ], 1).map((entry) => entry.pairKey),
  ["01097:cirsium-arvense"],
);

process.stdout.write("EDDMapS committed snapshot replay tests passed.\n");
