import { execFileSync } from "node:child_process";

import {
  artifactFilenameForRequest,
  loadGbifArchivedReplay,
} from "./research/gbif-archived-replay";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const matchFilename = artifactFilenameForRequest({
  requestGroupId: "species-match-corbicula-fluminea",
  url: "https://api.gbif.org/v1/species/match?name=Corbicula+fluminea",
});
assert(
  matchFilename === "gbif-species-match-corbicula-fluminea.json.gz",
  "Archived replay did not resolve the GBIF species-match artifact name.",
);

const occurrenceFilename = artifactFilenameForRequest({
  requestGroupId: "statewide-occurrences-corbicula-fluminea",
  url: "https://api.gbif.org/v1/occurrence/search?offset=600&limit=300",
});
assert(
  occurrenceFilename ===
    "gbif-occurrences-corbicula-fluminea-000600.json.gz",
  "Archived replay did not resolve the GBIF occurrence artifact name.",
);

async function main() {
  const archiveCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const archivedReplay = loadGbifArchivedReplay({
    repositoryRoot: process.cwd(),
    archiveCommit,
    archiveRunId:
      "20260731T025330Z__gbif-preserved-specimens__55c757406005",
    stateCode: "AK",
    sourceId: "gbif-preserved-specimens",
    requestedPairKeys: ["02220:brassica-juncea"],
  });
  for (const url of archivedReplay.requestUrls) {
    const response = await archivedReplay.fetch(url);
    assert(response.ok, `Archived replay returned HTTP ${response.status}.`);
    await response.json();
  }
  assert(
    archivedReplay.requestUrls.length === 2 &&
      archivedReplay.reusedArtifactCount === 2 &&
      archivedReplay.preventedProviderRequestCount === 2,
    "Archived replay did not consume exactly one match and one occurrence artifact.",
  );
  const localArchiveCommit = process.env.TEST_LOCAL_GBIF_ARCHIVE_COMMIT;
  let partialArchiveReplay:
    | {
        status: string;
        reusedArtifactCount: number;
        preventedProviderRequestCount: number;
      }
    | null = null;
  if (localArchiveCommit) {
    const localReplay = loadGbifArchivedReplay({
      repositoryRoot: process.cwd(),
      archiveCommit: localArchiveCommit,
      archiveRunId:
        "20260728T050600Z__gbif-preserved-specimens__1a65a36f914b",
      stateCode: "AL",
      sourceId: "gbif-preserved-specimens",
      requestedPairKeys: ["01001:diplotaxis-tenuifolia"],
    });
    for (const url of localReplay.requestUrls) {
      const response = await localReplay.fetch(url);
      assert(response.ok, `Local archived replay returned HTTP ${response.status}.`);
      await response.json();
    }
    assert(
      localReplay.archiveReceiptStatus === "partial" &&
        localReplay.preventedProviderRequestCount === 2,
      "The local partial archive did not expose its complete retained subset.",
    );
    partialArchiveReplay = {
      status: localReplay.archiveReceiptStatus,
      reusedArtifactCount: localReplay.reusedArtifactCount,
      preventedProviderRequestCount:
        localReplay.preventedProviderRequestCount,
    };
  }

  console.log(
    JSON.stringify(
      {
        matchFilename,
        occurrenceFilename,
        archiveRunId: archivedReplay.archiveRunId,
        requestedPairCount: archivedReplay.requestedPairCount,
        reusedArtifactCount: archivedReplay.reusedArtifactCount,
        preventedProviderRequestCount:
          archivedReplay.preventedProviderRequestCount,
        partialArchiveReplay,
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
