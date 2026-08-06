import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { z } from "zod";

import {
  mergeReviewedApplicability,
  sha256Bytes,
  stablePrettyJson,
  stateApplicabilityProjectionStates,
  validateStateApplicabilityReview,
  type CatalogSpecies,
  type StateApplicabilityReview,
  type StateApplicabilitySource,
} from "@/lib/research/state-applicability-sources";
import type { StateApplicabilityFile } from "@/lib/research/state-research-config";

const ROOT = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function expectFailure(label: string, expected: RegExp, run: () => unknown) {
  try {
    run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(expected.test(message), `${label} failed unexpectedly: ${message}`);
    return;
  }
  throw new Error(`${label} unexpectedly passed.`);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const reviewSchema = JSON.parse(
  readFileSync(
    path.join(
      ROOT,
      "src/data/research/schemas/state-applicability-review.schema.json",
    ),
    "utf8",
  ),
) as Parameters<typeof z.fromJSONSchema>[0];
const reviewValidator = z.fromJSONSchema(reviewSchema);
const tmp = mkdtempSync(path.join(os.tmpdir(), "isitusa-state-list-test-"));
try {
  const reviewDirectory = path.join(tmp, "review");
  mkdirSync(path.join(reviewDirectory, "artifacts"), { recursive: true });
  const artifact = Buffer.from("official fixture\n");
  writeFileSync(path.join(reviewDirectory, "artifacts/source.txt"), artifact);
  const source: StateApplicabilitySource = {
    id: "official-test",
    label: "Official test list",
    authority: "Test authority",
    stateCode: "AL",
    homepage: "https://example.gov/list",
    access: "download",
    claimSemantics: "regulated-state-applicability",
    negativeSemantics: "none",
    refreshCadenceDays: 90,
    status: "operational",
    caveat: "Fixture.",
  };
  const species: CatalogSpecies = {
    id: "alliaria-petiolata",
    scientificName: "Alliaria petiolata",
  };
  const review: StateApplicabilityReview = {
    schemaVersion: 1,
    reviewId: "official-test-20260728",
    sourceId: source.id,
    stateCode: "AL",
    sourceUrl: source.homepage,
    retrievedAt: "2026-07-28T00:00:00Z",
    reviewedAt: "2026-07-28T00:01:00Z",
    applicabilityAsOf: "2026-07-27",
    artifact: {
      path: "artifacts/source.txt",
      sha256: sha256Bytes(artifact),
      bytes: artifact.length,
      mediaType: "text/plain",
    },
    acceptedEvents: [
      {
        eventId: "official-test-row-1",
        sourceRecordId: "row-1",
        originalTaxonText: species.scientificName,
        scientificName: species.scientificName,
        speciesId: species.id,
        applicability: "applicable",
        priority: "regulated",
        matchMethod: "exact-canonical-binomial",
        reviewStatus: "accepted",
        note: "Official list membership establishes state applicability only.",
      },
    ],
    blockedRows: [],
    attestations: {
      stateApplicabilityOnly: true,
      countyDeterminationCreated: false,
      absenceCreated: false,
      notDetectedCreated: false,
      sourceSilenceCreatedNotApplicable: false,
    },
  };
  writeFileSync(
    path.join(reviewDirectory, "review.json"),
    stablePrettyJson(review),
  );
  reviewValidator.parse(review);
  const validate = (candidate = review) =>
    validateStateApplicabilityReview({
      review: candidate,
      reviewDirectory,
      registryById: new Map([[source.id, source]]),
      catalogById: new Map([[species.id, species]]),
    });
  validate();

  const highPrioritySource: StateApplicabilitySource = {
    ...source,
    id: "official-high-priority-test",
    claimSemantics: "high-priority-state-applicability",
  };
  const highPriorityReview: StateApplicabilityReview = {
    ...review,
    reviewId: "official-high-priority-test-20260728",
    sourceId: highPrioritySource.id,
    acceptedEvents: review.acceptedEvents.map((event) => ({
      ...event,
      eventId: "official-high-priority-test-row-1",
      priority: "high",
    })),
  };
  validateStateApplicabilityReview({
    review: highPriorityReview,
    reviewDirectory,
    registryById: new Map([[highPrioritySource.id, highPrioritySource]]),
    catalogById: new Map([[species.id, species]]),
  });
  const mismatchedPriority = clone(highPriorityReview);
  mismatchedPriority.acceptedEvents[0].priority = "regulated";
  expectFailure("source priority semantics", /differs from source semantics/, () =>
    validateStateApplicabilityReview({
      review: mismatchedPriority,
      reviewDirectory,
      registryById: new Map([[highPrioritySource.id, highPrioritySource]]),
      catalogById: new Map([[species.id, species]]),
    })
  );

  const wrongHash = clone(review);
  wrongHash.artifact.sha256 = "0".repeat(64);
  expectFailure("artifact hash", /artifact hash differs/, () =>
    validate(wrongHash)
  );
  const wrongBytes = clone(review);
  wrongBytes.artifact.bytes += 1;
  expectFailure("artifact bytes", /artifact byte count differs/, () =>
    validate(wrongBytes)
  );
  const wrongState = clone(review);
  wrongState.stateCode = "AK";
  expectFailure("source state", /differs from source state/, () =>
    validate(wrongState)
  );
  const fuzzyName = clone(review);
  fuzzyName.acceptedEvents[0].originalTaxonText = "Alliaria officinalis";
  expectFailure("fuzzy catalog name", /not an exact canonical catalog match/, () =>
    validate(fuzzyName)
  );
  const duplicate = clone(review);
  duplicate.acceptedEvents.push(clone(duplicate.acceptedEvents[0]));
  expectFailure("duplicate events", /contains duplicates/, () =>
    validate(duplicate)
  );
  writeFileSync(path.join(reviewDirectory, "unreported.txt"), "extra\n");
  expectFailure("unreported file", /missing, extra, or unreported files/, () =>
    validate()
  );
  rmSync(path.join(reviewDirectory, "unreported.txt"));

  const current: StateApplicabilityFile = {
    schemaVersion: 2,
    stateCode: "AL",
    asOf: "2026-07-27",
    catalogSpeciesCount: 1,
    catalogSpeciesIdsSha256: "0".repeat(64),
    undeterminedSpeciesPolicy: "included-as-unknown",
    defaultDecision: {
      applicability: "unknown",
      note: "Untouched species remain unknown.",
    },
    species: [],
  };
  const first = mergeReviewedApplicability({ current, reviews: [review] });
  assert(
    first.output.asOf === "2026-07-27",
    "Explicit local applicability date was replaced by the UTC review date.",
  );
  const second = mergeReviewedApplicability({
    current: first.output,
    reviews: [review],
  });
  assert(
    stablePrettyJson(first.output) === stablePrettyJson(second.output),
    "Repeated state-list application is not deterministic.",
  );
  assert(
    first.netNewApplicable === 1 &&
      first.supportingBasisAdded === 1 &&
      second.netNewApplicable === 0 &&
      second.supportingBasisAdded === 0,
    "State-list merge did not report exact gross and net changes.",
  );
  const highFirst = mergeReviewedApplicability({
    current,
    reviews: [highPriorityReview],
  });
  assert(
    highFirst.output.species[0]?.priority === "high",
    "High-priority source was not preserved as high priority.",
  );
  const regulatedUpgrade = mergeReviewedApplicability({
    current: highFirst.output,
    reviews: [review],
  });
  assert(
    regulatedUpgrade.output.species[0]?.priority === "regulated",
    "Regulated source did not upgrade high-priority applicability.",
  );
  const highCannotDowngrade = mergeReviewedApplicability({
    current: regulatedUpgrade.output,
    reviews: [highPriorityReview],
  });
  assert(
    highCannotDowngrade.output.species[0]?.priority === "regulated",
    "High-priority source downgraded a regulated applicability decision.",
  );
  const silence = mergeReviewedApplicability({
    current,
    reviews: [{ ...review, acceptedEvents: [], blockedRows: [] }],
  });
  assert(
    silence.output.species.length === 0,
    "Source silence created a state applicability decision.",
  );
  const federalSource: StateApplicabilitySource = {
    ...source,
    id: "federal-official-test",
    stateCode: "US",
    appliesToStateCodes: ["AK", "AL"],
  };
  const federalReview: StateApplicabilityReview = {
    ...review,
    reviewId: "federal-official-test-20260728",
    sourceId: federalSource.id,
    stateCode: "US",
  };
  validateStateApplicabilityReview({
    review: federalReview,
    reviewDirectory,
    registryById: new Map([[federalSource.id, federalSource]]),
    catalogById: new Map([[species.id, species]]),
  });
  const projectedStates = stateApplicabilityProjectionStates(federalSource);
  assert(
    projectedStates.join(",") === "AK,AL",
    "Federal applicability source did not project to its explicit jurisdictions.",
  );
  const federalMerge = mergeReviewedApplicability({
    current,
    reviews: [{ ...federalReview, stateCode: "AL" }],
  });
  assert(
    federalMerge.netNewApplicable === 1,
    "Federal applicability event did not merge into a projected jurisdiction.",
  );
  const notApplicable: StateApplicabilityFile = {
    ...current,
    species: [
      {
        speciesId: species.id,
        applicability: "not-applicable",
        priority: "baseline",
        basis: [
          {
            sourceId: "authoritative-scope",
            sourceRecordId: "scope-1",
            url: "https://example.gov/scope",
            note: "Explicit scope fixture.",
          },
        ],
      },
    ],
  };
  expectFailure(
    "not-applicable conflict",
    /contradicts explicit not-applicable/,
    () => mergeReviewedApplicability({ current: notApplicable, reviews: [review] }),
  );

  console.log(
    JSON.stringify({
      cases: 16,
      status: "pass",
      deterministic: true,
      sourceSilenceCreatedDecision: false,
    }),
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
