import { createHash } from "node:crypto";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

import type { StateApplicabilityFile } from "@/lib/research/state-research-config";

export type StateApplicabilitySource = {
  id: string;
  label: string;
  authority: string;
  stateCode: string;
  appliesToStateCodes?: string[];
  homepage: string;
  access: "download" | "official-web";
  claimSemantics:
    | "regulated-state-applicability"
    | "high-priority-state-applicability";
  negativeSemantics: "none";
  refreshCadenceDays: number;
  status: "operational" | "blocked";
  caveat: string;
};

export type StateApplicabilitySourceRegistry = {
  schemaVersion: 1;
  updatedAt: string;
  sources: StateApplicabilitySource[];
};

export type StateApplicabilityAcceptedEvent = {
  eventId: string;
  sourceRecordId: string;
  originalTaxonText: string;
  scientificName: string;
  speciesId: string;
  applicability: "applicable";
  priority: "regulated" | "high";
  matchMethod: "exact-canonical-binomial";
  reviewStatus: "accepted";
  note: string;
};

export type StateApplicabilityReview = {
  schemaVersion: 1;
  reviewId: string;
  sourceId: string;
  stateCode: string;
  sourceUrl: string;
  retrievedAt: string;
  reviewedAt: string;
  artifact: {
    path: string;
    sha256: string;
    bytes: number;
    mediaType: string;
  };
  acceptedEvents: StateApplicabilityAcceptedEvent[];
  blockedRows: Array<{
    sourceRecordId: string;
    originalTaxonText: string;
    reason: string;
    reviewStatus: "blocked";
  }>;
  attestations: {
    stateApplicabilityOnly: true;
    countyDeterminationCreated: false;
    absenceCreated: false;
    notDetectedCreated: false;
    sourceSilenceCreatedNotApplicable: false;
  };
};

export type CatalogSpecies = {
  id: string;
  scientificName: string;
};

export function stateApplicabilityProjectionStates(
  source: StateApplicabilitySource,
): string[] {
  const states = source.appliesToStateCodes ?? [source.stateCode];
  assertUnique(states, `Applicability source ${source.id} projected states`);
  const sorted = [...states].sort();
  if (states.join("\n") !== sorted.join("\n")) {
    throw new Error(
      `Applicability source ${source.id} projected states are not sorted.`,
    );
  }
  if (
    source.stateCode === "US"
      ? states.length === 0 || states.includes("US")
      : states.length !== 1 || states[0] !== source.stateCode
  ) {
    throw new Error(
      `Applicability source ${source.id} has an invalid jurisdiction projection.`,
    );
  }
  return states;
}

export function sha256Bytes(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

export function stablePrettyJson(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function listFilesRecursive(directory: string, base = directory): string[] {
  return readdirSync(directory)
    .flatMap((entry) => {
      const absolute = path.join(directory, entry);
      if (statSync(absolute).isDirectory()) {
        return listFilesRecursive(absolute, base);
      }
      return [path.relative(base, absolute).split(path.sep).join("/")];
    })
    .sort();
}

function assertUnique(values: string[], label: string) {
  if (new Set(values).size !== values.length) {
    throw new Error(`${label} contains duplicates.`);
  }
}

export function validateStateApplicabilityReview(input: {
  review: StateApplicabilityReview;
  reviewDirectory: string;
  registryById: Map<string, StateApplicabilitySource>;
  catalogById: Map<string, CatalogSpecies>;
}) {
  const { review, reviewDirectory, registryById, catalogById } = input;
  const source = registryById.get(review.sourceId);
  if (!source) {
    throw new Error(`Review ${review.reviewId} references unknown source ${review.sourceId}.`);
  }
  if (source.status !== "operational") {
    throw new Error(`Review ${review.reviewId} references blocked source ${review.sourceId}.`);
  }
  if (source.stateCode !== review.stateCode) {
    throw new Error(
      `Review ${review.reviewId} state ${review.stateCode} differs from source state ${source.stateCode}.`,
    );
  }
  const projectedStateCodes = stateApplicabilityProjectionStates(source);

  const artifactPath = path.resolve(reviewDirectory, review.artifact.path);
  const reviewRoot = `${path.resolve(reviewDirectory)}${path.sep}`;
  if (!artifactPath.startsWith(reviewRoot)) {
    throw new Error(`Review ${review.reviewId} artifact escapes its immutable directory.`);
  }
  if (!existsSync(artifactPath)) {
    throw new Error(`Review ${review.reviewId} artifact is missing: ${review.artifact.path}.`);
  }
  const artifactBytes = readFileSync(artifactPath);
  if (artifactBytes.length !== review.artifact.bytes) {
    throw new Error(`Review ${review.reviewId} artifact byte count differs from its descriptor.`);
  }
  if (sha256Bytes(artifactBytes) !== review.artifact.sha256) {
    throw new Error(`Review ${review.reviewId} artifact hash differs from its descriptor.`);
  }

  const reportedFiles = ["review.json", review.artifact.path].sort();
  const actualFiles = listFilesRecursive(reviewDirectory);
  if (actualFiles.join("\n") !== reportedFiles.join("\n")) {
    throw new Error(
      `Review ${review.reviewId} has missing, extra, or unreported files: ${actualFiles.join(", ")}.`,
    );
  }

  assertUnique(
    review.acceptedEvents.map((event) => event.eventId),
    `Review ${review.reviewId} accepted event IDs`,
  );
  assertUnique(
    review.acceptedEvents.map((event) => event.sourceRecordId),
    `Review ${review.reviewId} accepted source record IDs`,
  );
  const allSourceRecordIds = [
    ...review.acceptedEvents.map((event) => event.sourceRecordId),
    ...review.blockedRows.map((row) => row.sourceRecordId),
  ];
  assertUnique(allSourceRecordIds, `Review ${review.reviewId} source record IDs`);

  for (const event of review.acceptedEvents) {
    const species = catalogById.get(event.speciesId);
    if (!species) {
      throw new Error(
        `Review ${review.reviewId} event ${event.eventId} references unknown species ${event.speciesId}.`,
      );
    }
    if (
      event.scientificName !== species.scientificName ||
      event.originalTaxonText !== species.scientificName
    ) {
      throw new Error(
        `Review ${review.reviewId} event ${event.eventId} is not an exact canonical catalog match.`,
      );
    }
    const expectedPriority =
      source.claimSemantics === "regulated-state-applicability"
        ? "regulated"
        : "high";
    if (event.priority !== expectedPriority) {
      throw new Error(
        `Review ${review.reviewId} event ${event.eventId} priority ${event.priority} differs from source semantics ${source.claimSemantics}.`,
      );
    }
  }

  return {
    reviewId: review.reviewId,
    sourceId: review.sourceId,
    stateCode: review.stateCode,
    projectedStateCodes,
    acceptedEventCount: review.acceptedEvents.length,
    blockedRowCount: review.blockedRows.length,
    artifactBytes: artifactBytes.length,
    artifactSha256: review.artifact.sha256,
  };
}

export function mergeReviewedApplicability(input: {
  current: StateApplicabilityFile;
  reviews: StateApplicabilityReview[];
}) {
  const { current } = input;
  const bySpeciesId = new Map(
    current.species.map((entry) => [
      entry.speciesId,
      {
        ...entry,
        basis: entry.basis.map((basis) => ({ ...basis })),
      },
    ]),
  );
  let netNewApplicable = 0;
  let supportingBasisAdded = 0;
  const priorityRank = {
    baseline: 0,
    pilot: 1,
    high: 2,
    regulated: 3,
  } as const;

  for (const review of [...input.reviews].sort((left, right) =>
    left.reviewId.localeCompare(right.reviewId)
  )) {
    if (review.stateCode !== current.stateCode) continue;
    for (const event of [...review.acceptedEvents].sort((left, right) =>
      left.eventId.localeCompare(right.eventId)
    )) {
      const existing = bySpeciesId.get(event.speciesId);
      if (existing?.applicability === "not-applicable") {
        throw new Error(
          `Official state-list event ${event.eventId} contradicts explicit not-applicable decision for ${current.stateCode}:${event.speciesId}.`,
        );
      }
      const basis = {
        sourceId: review.sourceId,
        sourceRecordId: event.sourceRecordId,
        url: review.sourceUrl,
        note: event.note,
      };
      if (!existing) {
        bySpeciesId.set(event.speciesId, {
          speciesId: event.speciesId,
          applicability: "applicable",
          priority: event.priority,
          basis: [basis],
        });
        netNewApplicable += 1;
        supportingBasisAdded += 1;
        continue;
      }
      if (existing.applicability !== "applicable") {
        existing.applicability = "applicable";
        netNewApplicable += 1;
      }
      if (priorityRank[event.priority] > priorityRank[existing.priority]) {
        existing.priority = event.priority;
      }
      const basisKey = `${basis.sourceId}\n${basis.sourceRecordId}\n${basis.url}\n${basis.note}`;
      const existingBasisKeys = new Set(
        existing.basis.map(
          (entry) =>
            `${entry.sourceId}\n${entry.sourceRecordId}\n${entry.url}\n${entry.note}`,
        ),
      );
      if (!existingBasisKeys.has(basisKey)) {
        existing.basis.push(basis);
        supportingBasisAdded += 1;
      }
    }
  }

  const latestReviewDate = input.reviews
    .filter((review) => review.stateCode === current.stateCode)
    .map((review) => review.reviewedAt.slice(0, 10))
    .sort()
    .at(-1);
  const species = [...bySpeciesId.values()]
    .map((entry) => ({
      ...entry,
      basis: [...entry.basis].sort((left, right) =>
        [
          left.sourceId,
          left.sourceRecordId,
          left.url,
          left.note,
        ].join("\n").localeCompare([
          right.sourceId,
          right.sourceRecordId,
          right.url,
          right.note,
        ].join("\n"))
      ),
    }))
    .sort((left, right) => left.speciesId.localeCompare(right.speciesId));

  return {
    output: {
      ...current,
      asOf:
        latestReviewDate && latestReviewDate > current.asOf
          ? latestReviewDate
          : current.asOf,
      species,
    } satisfies StateApplicabilityFile,
    netNewApplicable,
    supportingBasisAdded,
  };
}
