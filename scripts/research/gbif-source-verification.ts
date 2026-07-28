import path from "node:path";
import { gunzipSync } from "node:zlib";

import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import type { ImmutableResearchRunReceipt } from "@/lib/research/types";

type SpeciesScope = {
  speciesId: string;
  scientificName: string;
};

type SourceVerificationRequest = {
  requestGroupId: string;
  url: string;
  purpose: string;
  attempts: number;
  status: number;
  retrievedAt: string;
  declaredRecordCount: number | null;
  receivedRecordCount: number;
  pagination: {
    mode: "single" | "offset";
    pageIndex: number;
    offset: number | null;
    limit: number | null;
    cursor: null;
    nextCursor: null;
    endOfRecords: boolean;
  };
};

function artifactStem(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function parseArtifact(
  artifacts: SourceAdapterResult["artifacts"],
  filename: string,
): Record<string, unknown> | null {
  const artifact = artifacts.find(
    (entry) =>
      entry.filename === filename ||
      entry.filename === `${filename}.gz`,
  );
  if (!artifact) return null;
  try {
    const bytes = Buffer.isBuffer(artifact.contents)
      ? artifact.contents
      : Buffer.from(artifact.contents);
    const contents = artifact.filename.endsWith(".gz")
      ? gunzipSync(bytes).toString("utf8")
      : bytes.toString("utf8");
    const parsed = JSON.parse(contents) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function exactScientificName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function buildGbifSourceVerification(input: {
  receipt: ImmutableResearchRunReceipt;
  artifacts: SourceAdapterResult["artifacts"];
  speciesScopes: SpeciesScope[];
}) {
  const speciesByScientificName = new Map(
    input.speciesScopes.map((entry) => [
      exactScientificName(entry.scientificName),
      entry.speciesId,
    ]),
  );
  const pageIndexByGroup = new Map<string, number>();
  const requests: SourceVerificationRequest[] = [];
  let activeSpeciesId: string | null = null;

  for (const request of input.receipt.upstream_requests) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/species/match")) {
      const scientificName = url.searchParams.get("name") ?? "";
      activeSpeciesId = speciesByScientificName.get(
        exactScientificName(scientificName),
      ) ?? null;
      if (!activeSpeciesId) {
        throw new Error(
          `Cannot bind GBIF species-match request to a requested species: ${request.url}`,
        );
      }
      requests.push({
        requestGroupId: `species-match-${activeSpeciesId}`,
        url: request.url,
        purpose:
          "Resolve the target to a strict exact GBIF species identity before occurrence acquisition.",
        attempts: 1,
        status: request.status,
        retrievedAt: request.retrieved_at,
        declaredRecordCount: null,
        receivedRecordCount: request.record_count,
        pagination: {
          mode: "single",
          pageIndex: 0,
          offset: null,
          limit: null,
          cursor: null,
          nextCursor: null,
          endOfRecords: true,
        },
      });
      continue;
    }

    if (!url.pathname.endsWith("/occurrence/search") || !activeSpeciesId) {
      throw new Error(`Unsupported or unbound GBIF request: ${request.url}`);
    }
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1
    ) {
      throw new Error(`GBIF occurrence request lacks valid pagination: ${request.url}`);
    }
    const groupId = `statewide-occurrences-${activeSpeciesId}`;
    const pageIndex = pageIndexByGroup.get(groupId) ?? 0;
    pageIndexByGroup.set(groupId, pageIndex + 1);
    const artifact = parseArtifact(
      input.artifacts,
      `gbif-occurrences-${artifactStem(activeSpeciesId)}-${String(offset).padStart(6, "0")}.json`,
    );
    const declaredRecordCount = typeof artifact?.count === "number" &&
      Number.isInteger(artifact.count) &&
      artifact.count >= 0
      ? artifact.count
      : null;
    requests.push({
      requestGroupId: groupId,
      url: request.url,
      purpose:
        `Acquire the statewide preserved-specimen occurrence page for ${activeSpeciesId} and screen every requested county equivalent using provider-declared county geography.`,
      attempts: 1,
      status: request.status,
      retrievedAt: request.retrieved_at,
      declaredRecordCount,
      receivedRecordCount: request.record_count,
      pagination: {
        mode: "offset",
        pageIndex,
        offset,
        limit,
        cursor: null,
        nextCursor: null,
        endOfRecords: artifact?.endOfRecords === true,
      },
    });
  }

  const completed = input.receipt.status === "complete";
  const checkedAt =
    input.receipt.upstream_requests.at(-1)?.retrieved_at ??
    input.receipt.finished_at;
  const stateProvince = String(input.receipt.parameters.stateProvince ?? "");

  return {
    schemaVersion: 1,
    verifiedAt: input.receipt.finished_at,
    runId: input.receipt.run_id,
    sourceId: input.receipt.source_id,
    stateCode: input.receipt.requested_scope.state_code,
    pairKeys: input.receipt.requested_scope.pair_keys,
    parameterHash: input.receipt.parameter_hash,
    authority: {
      name: "Global Biodiversity Information Facility",
      sourceUrl: "https://api.gbif.org/v1/",
      publisher:
        "GBIF Secretariat API aggregator with underlying occurrence publishers preserved on retained records.",
    },
    terms: {
      license:
        "GBIF occurrence records retain provider-declared Creative Commons licensing in each retained response.",
      termsUrl: "https://www.gbif.org/terms",
      retentionAllowed: true,
    },
    availability: {
      status: completed ? "available" : "blocked",
      checkedAt,
      freshnessDate: null,
    },
    geography: {
      method:
        `Require provider-declared stateProvince text matching ${stateProvince} and provider-declared county-equivalent text that resolves uniquely through the active county-equivalent registry.`,
      countyEquivalentSupported: true,
      coordinatePolicy:
        "Coordinates are not used for county assignment. Missing, ambiguous, retired, conflicting, and coordinate-only geography is rejected.",
    },
    taxonomy: {
      method:
        "Use the strict GBIF species match endpoint and require EXACT match type, confidence at least 95, SPECIES rank, a numeric species key, and exact canonical binomial agreement.",
      targetSpeciesIds: input.receipt.requested_scope.species_ids,
    },
    acquisition: {
      snapshotComplete: completed,
      paginationComplete: completed,
      stableIdentityFields: [
        "datasetKey",
        "gbifID",
        "key",
        "occurrenceID",
      ],
      requests,
    },
    negativeEvidence: {
      supportsVerifiedAbsence: false,
      supportsNotDetected: false,
      limitations: [
        "GBIF has no negative semantics. Empty results, source silence, rejected records, and missing geography never support verified absence.",
        "GBIF occurrence search does not document target-specific survey method, effort, or an explicit negative result and therefore cannot support not-detected.",
        "A completed query without publishable evidence changes research status only.",
      ],
    },
    retainedEvidence: input.receipt.artifacts.map(
      ({ path: artifactPath, sha256, bytes }) => ({
        path: artifactPath,
        sha256,
        bytes,
      }),
    ),
    caveats: [
      "GBIF is an aggregator and publisher record quality can vary.",
      "The live search has no fixed snapshot identifier. Retained provider bytes, request URLs, timestamps, and hashes pin this screen.",
      "Only provider-declared county geography is used. Coordinate-derived county evidence remains prohibited.",
    ],
  };
}

export function gbifSourceVerificationFilename(
  runRelativeDirectory: string,
): string {
  return path.posix.join(runRelativeDirectory, "source-verification.json");
}
