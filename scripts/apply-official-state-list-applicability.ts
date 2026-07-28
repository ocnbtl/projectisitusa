import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  mergeReviewedApplicability,
  stablePrettyJson,
  validateStateApplicabilityReview,
  type CatalogSpecies,
  type StateApplicabilityReview,
  type StateApplicabilitySourceRegistry,
} from "@/lib/research/state-applicability-sources";
import type { StateApplicabilityFile } from "@/lib/research/state-research-config";

const ROOT = process.cwd();
const RESEARCH_ROOT = path.join(ROOT, "src/data/research");
const SOURCE_ROOT = path.join(RESEARCH_ROOT, "state-list-sources");

function readJson<T>(filepath: string): T {
  return JSON.parse(readFileSync(filepath, "utf8")) as T;
}

function schemaValidator(filename: string) {
  return z.fromJSONSchema(
    readJson<Parameters<typeof z.fromJSONSchema>[0]>(
      path.join(RESEARCH_ROOT, "schemas", filename),
    ),
  );
}

function parseMode(argv: string[]) {
  if (
    argv.length !== 1 ||
    !["--check", "--write"].includes(argv[0] ?? "")
  ) {
    throw new Error(
      "Usage: apply-official-state-list-applicability.ts --check|--write",
    );
  }
  return argv[0] as "--check" | "--write";
}

const mode = parseMode(process.argv.slice(2));
const sourceRegistryPath = path.join(
  RESEARCH_ROOT,
  "state-applicability-source-registry.json",
);
const sourceRegistry = readJson<StateApplicabilitySourceRegistry>(
  sourceRegistryPath,
);
schemaValidator("state-applicability-source-registry.schema.json").parse(
  sourceRegistry,
);
const sourceIds = sourceRegistry.sources.map((source) => source.id);
if (new Set(sourceIds).size !== sourceIds.length) {
  throw new Error("State applicability source registry contains duplicate IDs.");
}
const registryById = new Map(
  sourceRegistry.sources.map((source) => [source.id, source]),
);
const catalog = readJson<CatalogSpecies[]>(
  path.join(ROOT, "src/data/generated/species.json"),
);
const catalogById = new Map(catalog.map((species) => [species.id, species]));
const reviewValidator = schemaValidator("state-applicability-review.schema.json");
const reviewEntries = readdirSync(SOURCE_ROOT, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const directory = path.join(SOURCE_ROOT, entry.name);
    const review = readJson<StateApplicabilityReview>(
      path.join(directory, "review.json"),
    );
    reviewValidator.parse(review);
    const validation = validateStateApplicabilityReview({
      review,
      reviewDirectory: directory,
      registryById,
      catalogById,
    });
    return { directory, review, validation };
  })
  .sort((left, right) =>
    left.review.reviewId.localeCompare(right.review.reviewId)
  );

const reviewIds = reviewEntries.map((entry) => entry.review.reviewId);
if (new Set(reviewIds).size !== reviewIds.length) {
  throw new Error("State applicability review IDs contain duplicates.");
}
const reviewSourceIds = new Set(
  reviewEntries.map((entry) => entry.review.sourceId),
);
for (const source of sourceRegistry.sources) {
  if (source.status === "operational" && !reviewSourceIds.has(source.id)) {
    throw new Error(`Operational applicability source ${source.id} has no review.`);
  }
  if (source.status === "blocked" && reviewSourceIds.has(source.id)) {
    throw new Error(`Blocked applicability source ${source.id} has a review.`);
  }
}

const stateCodes = [
  ...new Set(reviewEntries.map((entry) => entry.review.stateCode)),
].sort();
const states = [];
for (const stateCode of stateCodes) {
  const filepath = path.join(
    RESEARCH_ROOT,
    "state-applicability",
    `${stateCode}.json`,
  );
  const current = readJson<StateApplicabilityFile>(filepath);
  const reviews = reviewEntries
    .filter((entry) => entry.review.stateCode === stateCode)
    .map((entry) => entry.review);
  const merged = mergeReviewedApplicability({ current, reviews });
  const expected = stablePrettyJson(merged.output);
  const actual = readFileSync(filepath, "utf8");
  if (mode === "--check" && actual !== expected) {
    throw new Error(
      `${stateCode} applicability is stale. Run npm run research:apply:state-lists.`,
    );
  }
  if (mode === "--write" && actual !== expected) {
    writeFileSync(filepath, expected);
  }
  states.push({
    stateCode,
    reviewCount: reviews.length,
    grossAcceptedEvents: reviews.reduce(
      (sum, review) => sum + review.acceptedEvents.length,
      0,
    ),
    blockedRows: reviews.reduce(
      (sum, review) => sum + review.blockedRows.length,
      0,
    ),
    netNewApplicable: merged.netNewApplicable,
    supportingBasisAdded: merged.supportingBasisAdded,
    changed: actual !== expected,
  });
}

process.stdout.write(
  `${JSON.stringify(
    {
      mode,
      sourceCount: sourceRegistry.sources.length,
      operationalSourceCount: sourceRegistry.sources.filter(
        (source) => source.status === "operational",
      ).length,
      blockedSourceCount: sourceRegistry.sources.filter(
        (source) => source.status === "blocked",
      ).length,
      reviewCount: reviewEntries.length,
      artifactBytes: reviewEntries.reduce(
        (sum, entry) => sum + entry.validation.artifactBytes,
        0,
      ),
      grossAcceptedEvents: reviewEntries.reduce(
        (sum, entry) => sum + entry.validation.acceptedEventCount,
        0,
      ),
      blockedRows: reviewEntries.reduce(
        (sum, entry) => sum + entry.validation.blockedRowCount,
        0,
      ),
      states,
    },
    null,
    2,
  )}\n`,
);
