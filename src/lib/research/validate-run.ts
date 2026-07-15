import { readFileSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { z } from "zod";

import type { SourceAdapterResult } from "@/lib/research/source-adapter";
import type {
  ImmutableResearchRunBundle,
  ImmutableResearchRunReceipt,
  ResearchSourceDefinition,
  ResearchSourceRegistry,
} from "@/lib/research/types";
import { resolveRunEvidence } from "@/lib/research/event-resolution";
import {
  getStateDefinition,
  resolveCountyEquivalent,
} from "@/lib/research/geography-registry";
import {
  loadImmutableResearchRun,
  sha256,
  stableJson,
} from "@/lib/research/run-files";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function schemaValidator(root: string, filename: string, stripConditionals = false) {
  const schema = JSON.parse(
    readFileSync(path.join(root, "src/data/research/schemas", filename), "utf8"),
  ) as Record<string, unknown>;
  if (stripConditionals) delete schema.allOf;
  return z.fromJSONSchema(
    schema as Parameters<typeof z.fromJSONSchema>[0],
  );
}

function validateRecords(
  validator: ReturnType<typeof schemaValidator>,
  records: unknown[],
  label: string,
) {
  records.forEach((record, index) => {
    try {
      validator.parse(record);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`${label} ${index + 1} failed schema validation: ${detail}`);
    }
  });
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  for (const value of values) {
    assert(!seen.has(value), `${label} contains duplicate ID ${value}.`);
    seen.add(value);
  }
}

function pairKey(countyFips: string, speciesId: string) {
  return `${countyFips}:${speciesId}`;
}

function canonicalText(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/gu, " ");
}

function canonicalBinomial(value: string) {
  return canonicalText(value)
    .replace(/[(),]/gu, " ")
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

function assertWorkerActor(
  actor: { actor_type: string; actor_id: string },
  workerTaskId: string,
  adapterActorId: string,
  label: string,
) {
  if (actor.actor_type === "agent") {
    assert(actor.actor_id === workerTaskId, `${label} has the wrong worker actor identity.`);
    return;
  }
  if (actor.actor_type === "adapter") {
    assert(actor.actor_id === adapterActorId, `${label} has the wrong adapter actor identity.`);
    return;
  }
  throw new Error(`${label} uses a forbidden worker actor type ${actor.actor_type}.`);
}

function assertSafeRepositoryPath(value: string, label: string) {
  assert(
    value.length > 0 &&
      !path.posix.isAbsolute(value) &&
      !path.win32.isAbsolute(value) &&
      !value.split(/[\\/]/u).includes(".."),
    `${label} is not a safe repository-relative path.`,
  );
}

function readCommittedFile(repositoryRoot: string, commit: string, filepath: string) {
  assertSafeRepositoryPath(filepath, "Committed research path");
  try {
    return execFileSync(
      "git",
      ["-C", repositoryRoot, "show", `${commit}:${filepath}`],
      { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Cannot read ${filepath} at receipt code commit ${commit}: ${detail}`,
    );
  }
}

export function validateImmutableResearchRunProvenance(input: {
  repositoryRoot: string;
  receipt: ImmutableResearchRunReceipt;
}): ResearchSourceDefinition {
  const { repositoryRoot, receipt } = input;
  assert(
    /^[a-f0-9]{40}$/u.test(receipt.code_commit),
    "Receipt code commit must be a full Git SHA.",
  );
  try {
    execFileSync(
      "git",
      ["-C", repositoryRoot, "cat-file", "-e", `${receipt.code_commit}^{commit}`],
      { stdio: "ignore" },
    );
  } catch {
    throw new Error(`Receipt code commit is not available: ${receipt.code_commit}.`);
  }
  const registryContents = readCommittedFile(
    repositoryRoot,
    receipt.code_commit,
    "src/data/research/source-registry.json",
  );
  assert(
    sha256(registryContents) === receipt.source_registry_hash,
    "Receipt source registry hash does not match its code commit.",
  );
  const registry = JSON.parse(registryContents) as ResearchSourceRegistry;
  const source = registry.sources.find((entry) => entry.id === receipt.source_id);
  assert(source?.researchAdapter, "Receipt source has no registered research adapter.");
  assert(
    source.researchAdapter.id === receipt.adapter_id &&
      source.researchAdapter.allowedVersions.includes(receipt.adapter_version),
    "Receipt adapter identity or version is not registered at its code commit.",
  );
  const adapterContents = readCommittedFile(
    repositoryRoot,
    receipt.code_commit,
    source.researchAdapter.module,
  );
  assert(
    sha256(adapterContents) === receipt.adapter_code_hash,
    "Receipt adapter hash does not match its code commit.",
  );
  const parameterSchema = JSON.parse(
    readCommittedFile(
      repositoryRoot,
      receipt.code_commit,
      source.researchAdapter.parameterSchema,
    ),
  ) as Parameters<typeof z.fromJSONSchema>[0];
  z.fromJSONSchema(parameterSchema).parse(receipt.parameters);
  return source;
}

export function validateResearchRunInMemory(input: {
  root: string;
  sourceId: string;
  source: ResearchSourceDefinition;
  stateCode: string;
  runId: string;
  requestedPairKeys: string[];
  result: SourceAdapterResult;
  receipt: ImmutableResearchRunReceipt;
  outputContents: Map<string, string>;
  workerTaskId?: string;
}) {
  const {
    root,
    source,
    sourceId,
    stateCode,
    runId,
    requestedPairKeys,
    result,
    receipt,
  } = input;
  assert(source.id === sourceId, "Registered source does not match the adapter run.");
  validateRecords(
    schemaValidator(root, "evidence-assertion.schema.json"),
    result.assertions,
    "Evidence assertion",
  );
  validateRecords(
    schemaValidator(root, "review-event.schema.json", true),
    result.reviews,
    "Review event",
  );
  validateRecords(
    schemaValidator(root, "rejection-record.schema.json"),
    result.rejections,
    "Rejection record",
  );
  validateRecords(
    schemaValidator(root, "pair-outcome.schema.json", true),
    result.outcomes,
    "Pair outcome",
  );
  schemaValidator(root, "run-receipt.schema.json").parse(receipt);

  assertUnique(result.assertions.map((entry) => entry.eventId), "Assertion events");
  assertUnique(result.reviews.map((entry) => entry.eventId), "Review events");
  assertUnique(result.rejections.map((entry) => entry.rejection_id), "Rejections");
  assertUnique(result.outcomes.map((entry) => entry.outcome_id), "Outcomes");

  const requestedPairs = new Set(requestedPairKeys);
  assert(requestedPairs.size === requestedPairKeys.length, "Requested pairs are not unique.");
  const state = getStateDefinition(stateCode);
  assert(state?.nationalV1Scope, `Run state ${stateCode} is not in the national-v1 registry.`);
  const speciesCatalog = JSON.parse(
    readFileSync(path.join(root, "src/data/generated/species.json"), "utf8"),
  ) as Array<{ id: string; scientificName: string }>;
  const speciesById = new Map(speciesCatalog.map((entry) => [entry.id, entry]));
  for (const key of requestedPairKeys) {
    const countyFips = key.slice(0, key.indexOf(":"));
    const speciesId = key.slice(key.indexOf(":") + 1);
    const resolution = resolveCountyEquivalent({ stateCode, countyFips });
    assert(
      resolution.status === "resolved",
      `Requested pair ${key} does not use an active county equivalent for ${stateCode}.`,
    );
    assert(speciesById.has(speciesId), `Requested pair ${key} has an unknown species.`);
  }
  const assertionById = new Map(result.assertions.map((entry) => [entry.eventId, entry]));
  const rejectionById = new Map(
    result.rejections.map((entry) => [entry.rejection_id, entry]),
  );
  const assertionSourceIdentities = new Set<string>();
  const adapterActorId = `${receipt.adapter_id}@${receipt.adapter_version}`;

  if (input.workerTaskId) {
    assertWorkerActor(receipt, input.workerTaskId, adapterActorId, "Receipt");
  }

  for (const assertion of result.assertions) {
    assert(assertion.run_id === runId, `Assertion ${assertion.eventId} has the wrong run.`);
    assert(
      assertion.source_id === sourceId,
      `Assertion ${assertion.eventId} has the wrong source.`,
    );
    assert(
      assertion.state_code === stateCode,
      `Assertion ${assertion.eventId} has the wrong state.`,
    );
    assert(
      resolveCountyEquivalent({
        stateCode,
        countyFips: assertion.county_fips,
      }).status === "resolved",
      `Assertion ${assertion.eventId} has unknown or retired geography.`,
    );
    assert(
      requestedPairs.has(pairKey(assertion.county_fips, assertion.species_id)),
      `Assertion ${assertion.eventId} is outside the requested pairs.`,
    );
    if (input.workerTaskId) {
      assertWorkerActor(
        assertion,
        input.workerTaskId,
        adapterActorId,
        `Assertion ${assertion.eventId}`,
      );
    }
    const sourceIdentity = [
      assertion.source_id,
      assertion.source_record_id,
      assertion.species_id,
      assertion.county_fips,
      assertion.claim_type,
      assertion.normalized_payload_hash,
    ].join("|");
    assert(
      !assertionSourceIdentities.has(sourceIdentity),
      `Assertion ${assertion.eventId} duplicates source identity ${sourceIdentity}.`,
    );
    assertionSourceIdentities.add(sourceIdentity);
    assert(
      Boolean(assertion.geography_match.source_county) &&
        assertion.geography_match.county_fips === assertion.county_fips,
      `Assertion ${assertion.eventId} has inconsistent explicit county geography.`,
    );
    const geographyMethod = canonicalText(assertion.geography_match.method);
    const mentionsCoordinateDerivation =
      /coordinate-derived|coordinate to county|coordinates? used/iu.test(
        geographyMethod,
      );
    const explicitlyDeniesCoordinateDerivation =
      /without coordinate-derived|not coordinate-derived|coordinates? (?:were )?not used/iu.test(
        geographyMethod,
      );
    assert(
      !mentionsCoordinateDerivation || explicitlyDeniesCoordinateDerivation,
      `Assertion ${assertion.eventId} uses unapproved coordinate-derived county geography.`,
    );
    const sourceCounty = resolveCountyEquivalent({
      stateCode,
      countyName: assertion.geography_match.source_county,
      sourceId,
    });
    assert(
      sourceCounty.status === "resolved" &&
        sourceCounty.county.countyFips === assertion.county_fips,
      `Assertion ${assertion.eventId} source county does not resolve to its declared county FIPS.`,
    );
    const acceptedSourceStates = new Set(
      [state.stateCode, state.stateName, ...Object.values(state.sourceStateNames)].map(
        canonicalText,
      ),
    );
    assert(
      acceptedSourceStates.has(canonicalText(assertion.geography_match.source_state)),
      `Assertion ${assertion.eventId} source state does not match ${stateCode}.`,
    );
    const species = speciesById.get(assertion.species_id);
    assert(species, `Assertion ${assertion.eventId} has an unknown species.`);
    assert(
      canonicalText(assertion.taxon_match.target_scientific_name) ===
        canonicalText(species.scientificName),
      `Assertion ${assertion.eventId} target scientific name differs from the species catalog.`,
    );
    if (/canonical binomial/iu.test(source.researchAdapter?.taxonMatchingPolicy ?? "")) {
      assert(
        canonicalBinomial(assertion.taxon_match.source_scientific_name) ===
          canonicalBinomial(species.scientificName),
        `Assertion ${assertion.eventId} source scientific name violates the registered exact taxon policy.`,
      );
    }
    const supportText = [
      ...(assertion.caveats ?? []),
      ...(assertion.notes ?? []),
      String(assertion.survey_scope ?? ""),
    ].join(" ");
    if (assertion.claim_type === "officially-absent") {
      assert(
        source.negativeSemantics === "explicit-authority-only" &&
          assertion.evidence_kind === "absence-statement" &&
          (assertion.scope === "county" || assertion.scope === "regulatory-area") &&
          Boolean(assertion.temporal_scope) &&
          Boolean(assertion.spatial_scope) &&
          /explicit/iu.test(supportText) &&
          /absen/iu.test(supportText),
        `Assertion ${assertion.eventId} lacks supported explicit authoritative absence evidence.`,
      );
    }
    if (assertion.claim_type === "not-detected") {
      assert(
        source.negativeSemantics === "explicit-survey-only" &&
          assertion.evidence_kind === "survey-non-detection" &&
          Boolean(assertion.survey_scope) &&
          /target/iu.test(supportText) &&
          /method|program/iu.test(supportText) &&
          /effort|sample/iu.test(supportText) &&
          /negative|not detected|zero/iu.test(supportText),
        `Assertion ${assertion.eventId} lacks supported explicit survey non-detection evidence.`,
      );
    }
  }

  for (const review of result.reviews) {
    const assertion = assertionById.get(review.references.assertion_event_id);
    assert(assertion, `Review ${review.eventId} references an unknown assertion.`);
    assert(review.run_id === runId, `Review ${review.eventId} has the wrong run.`);
    assert(review.source_id === sourceId, `Review ${review.eventId} has the wrong source.`);
    assert(review.state_code === stateCode, `Review ${review.eventId} has the wrong state.`);
    if (input.workerTaskId) {
      assertWorkerActor(
        review,
        input.workerTaskId,
        adapterActorId,
        `Review ${review.eventId}`,
      );
      assert(
        review.review_level !== "human-approved",
        `Review ${review.eventId} falsely claims human approval.`,
      );
    }
    if (review.event_type === "evidence.reviewed") {
      assert(
        review.decision === "accepted" || review.decision === "rejected",
        `Review ${review.eventId} has an incompatible decision.`,
      );
    }
    if (review.decision === "accepted") {
      assert(
        review.event_type === "evidence.reviewed",
        `Accepted review ${review.eventId} has an incompatible event type.`,
      );
    }
    if (review.decision !== "accepted") {
      assert(
        !review.publication_eligible,
        `Non-accepted review ${review.eventId} is publication eligible.`,
      );
    }
    assert(
      review.county_fips === assertion.county_fips &&
        review.species_id === assertion.species_id,
      `Review ${review.eventId} does not match its assertion pair.`,
    );
  }

  for (const rejection of result.rejections) {
    assert(rejection.run_id === runId, `Rejection ${rejection.rejection_id} has the wrong run.`);
    assert(
      rejection.source_id === sourceId,
      `Rejection ${rejection.rejection_id} has the wrong source.`,
    );
    assert(
      rejection.normalized_target.state_code === stateCode,
      `Rejection ${rejection.rejection_id} has the wrong state.`,
    );
    const countyFips = rejection.normalized_target.county_fips;
    if (countyFips) {
      assert(
        resolveCountyEquivalent({ stateCode, countyFips }).status === "resolved",
        `Rejection ${rejection.rejection_id} has unknown or retired target geography.`,
      );
      assert(
        requestedPairs.has(
          pairKey(countyFips, rejection.normalized_target.species_id),
        ),
        `Rejection ${rejection.rejection_id} is outside the requested pairs.`,
      );
    } else {
      assert(
        requestedPairKeys.some((key) =>
          key.endsWith(`:${rejection.normalized_target.species_id}`),
        ),
        `Rejection ${rejection.rejection_id} is outside the requested species.`,
      );
    }
  }

  const outcomePairs = result.outcomes.map((entry) =>
    pairKey(entry.county_fips, entry.species_id),
  );
  assertUnique(outcomePairs, "Outcome pairs");
  assert(
    outcomePairs.length === requestedPairKeys.length &&
      requestedPairKeys.every((key) => outcomePairs.includes(key)),
    "The adapter did not emit exactly one outcome for every requested pair.",
  );
  const upstreamRequestUrls = new Set(
    receipt.upstream_requests.map((request) => request.url),
  );
  for (const outcome of result.outcomes) {
    assert(outcome.run_id === runId, `Outcome ${outcome.outcome_id} has the wrong run.`);
    assert(outcome.source_id === sourceId, `Outcome ${outcome.outcome_id} has the wrong source.`);
    assert(outcome.state_code === stateCode, `Outcome ${outcome.outcome_id} has the wrong state.`);
    assert(
      resolveCountyEquivalent({
        stateCode,
        countyFips: outcome.county_fips,
      }).status === "resolved",
      `Outcome ${outcome.outcome_id} has unknown or retired geography.`,
    );
    if (outcome.status === "evidence-found") {
      assert(
        outcome.scope_complete &&
          outcome.assertion_event_ids.length > 0 &&
          outcome.query_urls.length > 0,
        `Evidence outcome ${outcome.outcome_id} lacks assertions or query URLs.`,
      );
    }
    if (outcome.status === "no-qualifying-evidence") {
      assert(
        outcome.scope_complete &&
          outcome.assertion_event_ids.length === 0 &&
          outcome.query_urls.length > 0,
        `No-evidence outcome ${outcome.outcome_id} is not a complete research-only result.`,
      );
    }
    if (outcome.status === "needs-followup" || outcome.status === "blocked") {
      assert(
        !outcome.scope_complete,
        `Incomplete outcome ${outcome.outcome_id} is marked scope complete.`,
      );
    }
    if (outcome.scope_complete) {
      assert(
        outcome.status === "evidence-found" ||
          outcome.status === "no-qualifying-evidence",
        `Scope-complete outcome ${outcome.outcome_id} has an invalid status.`,
      );
      if (source.access === "api") {
        assert(
          outcome.query_urls.every((url) => upstreamRequestUrls.has(url)),
          `Scope-complete outcome ${outcome.outcome_id} cites an unreported source request.`,
        );
      }
    }
    for (const assertionId of outcome.assertion_event_ids) {
      const assertion = assertionById.get(assertionId);
      assert(assertion, `Outcome ${outcome.outcome_id} references an unknown assertion.`);
      assert(
        assertion.county_fips === outcome.county_fips &&
          assertion.species_id === outcome.species_id,
        `Outcome ${outcome.outcome_id} references an assertion from another pair.`,
      );
    }
    for (const rejectionId of outcome.rejection_ids) {
      const rejection = rejectionById.get(rejectionId);
      assert(rejection, `Outcome ${outcome.outcome_id} references an unknown rejection.`);
      assert(
        rejection.normalized_target.species_id === outcome.species_id &&
          (!rejection.normalized_target.county_fips ||
            rejection.normalized_target.county_fips === outcome.county_fips),
        `Outcome ${outcome.outcome_id} references a rejection from another pair.`,
      );
    }
  }

  assert(receipt.run_id === runId, "Receipt run ID does not match the adapter run.");
  assert(receipt.source_id === sourceId, "Receipt source does not match the adapter run.");
  assert(
    receipt.requested_scope.state_code === stateCode,
    "Receipt state does not match the adapter run.",
  );
  assert(receipt.counts.requested_pairs === requestedPairKeys.length, "Receipt requested-pair count is wrong.");
  assert(receipt.counts.assertion_events === result.assertions.length, "Receipt assertion count is wrong.");
  assert(receipt.counts.review_events === result.reviews.length, "Receipt review count is wrong.");
  assert(receipt.counts.rejection_records === result.rejections.length, "Receipt rejection count is wrong.");
  assert(receipt.counts.pair_outcomes === result.outcomes.length, "Receipt outcome count is wrong.");
  assert(receipt.counts.error_count === result.errors.length, "Receipt error count is wrong.");
  assert(
    receipt.counts.candidate_records === result.candidateRecordCount,
    "Receipt candidate-record count is wrong.",
  );
  assert(
    receipt.counts.duplicate_records === result.duplicateRecordCount,
    "Receipt duplicate-record count is wrong.",
  );
  assert(
    receipt.parameter_hash === sha256(stableJson(receipt.parameters)),
    "Receipt parameter hash does not match its parameters.",
  );
  assert(
    receipt.parameters.stateCode === stateCode,
    "Receipt parameter stateCode does not match its requested state.",
  );
  if (typeof receipt.parameters.stateProvince === "string") {
    const sourceStateName = sourceId.startsWith("idigbio")
      ? state.sourceStateNames.idigbio
      : sourceId.startsWith("gbif")
        ? state.sourceStateNames.gbif
        : state.stateName;
    assert(
      canonicalText(receipt.parameters.stateProvince) === canonicalText(sourceStateName),
      "Receipt parameter stateProvince does not match its requested state.",
    );
  }
  const parameterPairs = receipt.parameters.candidatePairs;
  assert(
    Array.isArray(parameterPairs) &&
      parameterPairs.every((value): value is string => typeof value === "string"),
    "Receipt parameters do not contain candidatePairs.",
  );
  assert(
    stableJson(parameterPairs) === stableJson(requestedPairKeys) &&
      stableJson(receipt.requested_scope.pair_keys) === stableJson(requestedPairKeys),
    "Receipt requested pair scope does not match its parameters.",
  );
  const expectedCountyFips = [
    ...new Set(requestedPairKeys.map((key) => key.split(":", 1)[0])),
  ].sort();
  const expectedSpeciesIds = [
    ...new Set(requestedPairKeys.map((key) => key.slice(key.indexOf(":") + 1))),
  ].sort();
  assert(
    stableJson(receipt.requested_scope.county_fips) === stableJson(expectedCountyFips),
    "Receipt county scope does not match its pair keys.",
  );
  assert(
    stableJson(receipt.requested_scope.species_ids) === stableJson(expectedSpeciesIds),
    "Receipt species scope does not match its pair keys.",
  );
  const startedAt = Date.parse(receipt.started_at);
  const finishedAt = Date.parse(receipt.finished_at);
  assert(startedAt <= finishedAt, "Receipt finishes before it starts.");
  assert(result.completedAt === receipt.finished_at, "Adapter completion time does not match the receipt.");
  if (receipt.status === "complete") {
    assert(
      receipt.upstream_requests.every(
        (request) => request.status >= 200 && request.status < 300,
      ),
      "Complete receipt contains a failed upstream request.",
    );
    if (source.access === "api") {
      assert(
        receipt.upstream_requests.length > 0,
        "Complete API receipt contains no upstream request evidence.",
      );
    }
  }
  for (const [label, timestamps] of [
    ["assertion", result.assertions.map((entry) => entry.created_at)],
    ["review", result.reviews.map((entry) => entry.created_at)],
    ["rejection", result.rejections.map((entry) => entry.created_at)],
    ["outcome", result.outcomes.map((entry) => entry.recorded_at)],
    ["upstream request", receipt.upstream_requests.map((entry) => entry.retrieved_at)],
  ] as const) {
    for (const timestamp of timestamps) {
      const value = Date.parse(timestamp);
      assert(
        value >= startedAt && value <= finishedAt,
        `${label} timestamp is outside the receipt interval.`,
      );
    }
  }
  const resolution = resolveRunEvidence(
    result.assertions,
    result.reviews,
    [source],
    receipt.finished_at.slice(0, 10),
  );
  const publishedByPair = new Map<string, string[]>();
  for (const assertion of resolution.publishedAssertions) {
    const key = pairKey(assertion.county_fips, assertion.species_id);
    const ids = publishedByPair.get(key) ?? [];
    ids.push(assertion.eventId);
    publishedByPair.set(key, ids);
  }
  for (const outcome of result.outcomes) {
    const key = pairKey(outcome.county_fips, outcome.species_id);
    const publishedIds = [...(publishedByPair.get(key) ?? [])].sort();
    const reportedIds = [...outcome.assertion_event_ids].sort();
    if (outcome.status === "evidence-found") {
      assert(
        publishedIds.length > 0 && stableJson(reportedIds) === stableJson(publishedIds),
        `Evidence outcome ${outcome.outcome_id} does not report exactly its publication-eligible assertions.`,
      );
    }
    if (outcome.status === "no-qualifying-evidence") {
      assert(
        publishedIds.length === 0,
        `No-evidence outcome ${outcome.outcome_id} has publication-eligible evidence.`,
      );
    }
  }

  assert(receipt.outputs.length === input.outputContents.size, "Receipt output set is incomplete.");
  for (const reference of receipt.outputs) {
    const filename = path.posix.basename(reference.path);
    const contents = input.outputContents.get(filename);
    assert(contents !== undefined, `Receipt references unknown output ${reference.path}.`);
    assert(Buffer.byteLength(contents) === reference.bytes, `Output byte count is wrong for ${filename}.`);
    assert(sha256(contents) === reference.sha256, `Output hash is wrong for ${filename}.`);
  }
}

type WorkerSourceVerificationRequest = {
  requestGroupId: string;
  url: string;
  status: number;
  retrievedAt: string;
  declaredRecordCount: number | null;
  receivedRecordCount: number;
  pagination: {
    mode: "single" | "offset" | "cursor" | "snapshot";
    pageIndex: number;
    offset: number | null;
    limit: number | null;
    cursor: string | null;
    nextCursor: string | null;
    endOfRecords: boolean;
  };
};

function validateSourceVerificationPagination(
  requests: WorkerSourceVerificationRequest[],
  requireComplete: boolean,
) {
  const groups = new Map<string, WorkerSourceVerificationRequest[]>();
  for (const request of requests) {
    const values = groups.get(request.requestGroupId) ?? [];
    values.push(request);
    groups.set(request.requestGroupId, values);
  }
  for (const [groupId, unsorted] of groups) {
    const pages = [...unsorted].sort(
      (left, right) => left.pagination.pageIndex - right.pagination.pageIndex,
    );
    const mode = pages[0]!.pagination.mode;
    assert(
      pages.every(
        (page, index) =>
          page.pagination.mode === mode && page.pagination.pageIndex === index,
      ),
      `Source verification request group ${groupId} has mixed modes or non-contiguous pages.`,
    );
    const declaredCounts = [
      ...new Set(
        pages
          .map((page) => page.declaredRecordCount)
          .filter((value): value is number => value !== null),
      ),
    ];
    assert(
      declaredCounts.length <= 1,
      `Source verification request group ${groupId} has inconsistent declared counts.`,
    );
    if (declaredCounts.length === 1 && requireComplete) {
      assert(
        pages.reduce((total, page) => total + page.receivedRecordCount, 0) ===
          declaredCounts[0],
        `Source verification request group ${groupId} received count differs from its declared count.`,
      );
    }
    if (mode === "single" || mode === "snapshot") {
      assert(
        pages.length === 1 &&
          pages[0]!.pagination.offset === null &&
          pages[0]!.pagination.cursor === null &&
          pages[0]!.pagination.nextCursor === null,
        `Source verification request group ${groupId} has invalid ${mode} pagination.`,
      );
    } else if (mode === "offset") {
      assert(
        pages[0]!.pagination.offset === 0 &&
          pages.every(
            (page) =>
              page.pagination.offset !== null &&
              page.pagination.limit !== null &&
              page.pagination.cursor === null &&
              page.pagination.nextCursor === null,
          ),
        `Source verification request group ${groupId} has invalid offset pagination.`,
      );
      for (let index = 1; index < pages.length; index += 1) {
        const previous = pages[index - 1]!;
        const page = pages[index]!;
        assert(
          page.pagination.offset ===
            previous.pagination.offset! + previous.pagination.limit!,
          `Source verification request group ${groupId} has a discontinuous offset.`,
        );
      }
    } else {
      assert(
        pages[0]!.pagination.cursor === null &&
          pages.every((page) => page.pagination.offset === null),
        `Source verification request group ${groupId} has invalid cursor pagination.`,
      );
      for (let index = 1; index < pages.length; index += 1) {
        assert(
          pages[index]!.pagination.cursor ===
            pages[index - 1]!.pagination.nextCursor,
          `Source verification request group ${groupId} has a discontinuous cursor.`,
        );
      }
    }
    if (requireComplete) {
      assert(
        pages.at(-1)!.pagination.endOfRecords &&
          pages.slice(0, -1).every((page) => !page.pagination.endOfRecords) &&
          (mode !== "cursor" || pages.at(-1)!.pagination.nextCursor === null),
        `Source verification request group ${groupId} lacks one terminal final page.`,
      );
    }
  }
}

export function validateImmutableResearchRunDirectory(input: {
  repositoryRoot: string;
  validationRoot: string;
  runDirectory: string;
  sourceVerificationPath?: string;
  expected?: {
    runId?: string;
    sourceId?: string;
    stateCode?: string;
    pairKeys?: string[];
    codeCommit?: string;
    workerTaskId?: string;
  };
}): ImmutableResearchRunBundle {
  const bundle = loadImmutableResearchRun(
    input.repositoryRoot,
    input.runDirectory,
  );
  const { receipt } = bundle;
  const expected = input.expected ?? {};
  if (expected.runId) {
    assert(receipt.run_id === expected.runId, "Receipt run ID differs from the expected run.");
  }
  if (expected.sourceId) {
    assert(receipt.source_id === expected.sourceId, "Receipt source differs from the expected source.");
  }
  if (expected.stateCode) {
    assert(
      receipt.requested_scope.state_code === expected.stateCode,
      "Receipt state differs from the expected state.",
    );
  }
  if (expected.pairKeys) {
    assert(
      stableJson(receipt.requested_scope.pair_keys) === stableJson(expected.pairKeys),
      "Receipt pair scope differs from the expected pairs.",
    );
  }
  if (expected.codeCommit) {
    assert(
      receipt.code_commit === expected.codeCommit,
      "Receipt code commit differs from the expected worker base.",
    );
  }

  const source = validateImmutableResearchRunProvenance({
    repositoryRoot: input.repositoryRoot,
    receipt,
  });
  if (input.sourceVerificationPath) {
    const sourceVerification = JSON.parse(
      readFileSync(input.sourceVerificationPath, "utf8"),
    ) as {
      verifiedAt: string;
      runId: string;
      sourceId: string;
      stateCode: string;
      pairKeys: string[];
      parameterHash: string;
      terms: { retentionAllowed: boolean };
      availability: { status: string; checkedAt: string };
      geography: { countyEquivalentSupported: boolean };
      taxonomy: { targetSpeciesIds: string[] };
      acquisition: {
        snapshotComplete: boolean;
        paginationComplete: boolean;
        requests: WorkerSourceVerificationRequest[];
      };
      negativeEvidence: {
        supportsVerifiedAbsence: boolean;
        supportsNotDetected: boolean;
      };
      retainedEvidence: Array<{ path: string; sha256: string; bytes: number }>;
    };
    schemaValidator(
      input.validationRoot,
      "worker-source-verification.schema.json",
    ).parse(sourceVerification);
    assert(
      sourceVerification.sourceId === receipt.source_id,
      "Source verification source does not match the receipt.",
    );
    assert(
      sourceVerification.runId === receipt.run_id &&
        sourceVerification.stateCode === receipt.requested_scope.state_code &&
        stableJson(sourceVerification.pairKeys) ===
          stableJson(receipt.requested_scope.pair_keys) &&
        sourceVerification.parameterHash === receipt.parameter_hash,
      "Source verification run, state, pair scope, or parameters do not match the receipt.",
    );
    assert(
      stableJson(sourceVerification.taxonomy.targetSpeciesIds) ===
        stableJson(receipt.requested_scope.species_ids),
      "Source verification taxa do not match the receipt scope.",
    );
    assert(
      sourceVerification.acquisition.requests.length ===
        receipt.upstream_requests.length &&
        sourceVerification.acquisition.requests.every(
          (request, index) =>
            request.url === receipt.upstream_requests[index]?.url &&
            request.status === receipt.upstream_requests[index]?.status &&
            request.retrievedAt ===
              receipt.upstream_requests[index]?.retrieved_at &&
            request.receivedRecordCount ===
              receipt.upstream_requests[index]?.record_count,
        ),
      "Source verification requests do not match the receipt.",
    );
    validateSourceVerificationPagination(
      sourceVerification.acquisition.requests,
      receipt.status === "complete",
    );
    const receiptArtifacts = receipt.artifacts.map(
      ({ path: value, sha256: hash, bytes }) => ({
        path: value,
        sha256: hash,
        bytes,
      }),
    );
    assert(
      stableJson(sourceVerification.retainedEvidence) ===
        stableJson(receiptArtifacts),
      "Source verification retained evidence does not match receipt artifacts.",
    );
    if (source.negativeSemantics === "none") {
      assert(
        !sourceVerification.negativeEvidence.supportsVerifiedAbsence &&
          !sourceVerification.negativeEvidence.supportsNotDetected,
        "Source verification claims unsupported negative evidence.",
      );
    }
    if (sourceVerification.negativeEvidence.supportsVerifiedAbsence) {
      assert(
        source.negativeSemantics === "explicit-authority-only",
        "Source verification claims unsupported authoritative absence evidence.",
      );
    }
    if (sourceVerification.negativeEvidence.supportsNotDetected) {
      assert(
        source.negativeSemantics === "explicit-survey-only",
        "Source verification claims unsupported survey non-detection evidence.",
      );
    }
    assert(
      sourceVerification.terms.retentionAllowed || receipt.artifacts.length === 0,
      "Source verification forbids retention but the receipt retains artifacts.",
    );
    assert(
      sourceVerification.geography.countyEquivalentSupported,
      "Source verification does not support the requested county-equivalent scope.",
    );
    if (receipt.status === "complete") {
      assert(
        sourceVerification.availability.status === "available" &&
        sourceVerification.acquisition.snapshotComplete &&
          sourceVerification.acquisition.paginationComplete,
        "Complete receipt has unavailable or incomplete source-verification acquisition scope.",
      );
    }
    const verifiedAt = Date.parse(sourceVerification.verifiedAt);
    assert(
      verifiedAt >= Date.parse(receipt.started_at) &&
        verifiedAt <= Date.parse(receipt.finished_at),
      "Source verification timestamp is outside the receipt interval.",
    );
    assert(
      Date.parse(sourceVerification.availability.checkedAt) >=
        Date.parse(receipt.started_at) &&
        Date.parse(sourceVerification.availability.checkedAt) <=
          Date.parse(receipt.finished_at),
      "Source availability check is outside the receipt interval.",
    );
    const sourceVerificationRelativePath = path
      .relative(input.repositoryRoot, input.sourceVerificationPath)
      .split(path.sep)
      .join("/");
    assert(
      receipt.outputs.some(
        (reference) => reference.path === sourceVerificationRelativePath,
      ),
      "Receipt does not declare the source-verification output.",
    );
  }
  const outputContents = new Map(
    receipt.outputs.map((reference) => [
      path.posix.basename(reference.path),
      readFileSync(path.resolve(input.repositoryRoot, reference.path), "utf8"),
    ]),
  );
  const result: SourceAdapterResult = {
    completedAt: receipt.finished_at,
    assertions: bundle.assertions,
    reviews: bundle.reviews,
    rejections: bundle.rejections,
    outcomes: bundle.outcomes,
    artifacts: [],
    upstreamRequests: receipt.upstream_requests.map((request) => ({
      url: request.url,
      status: request.status,
      retrievedAt: request.retrieved_at,
      recordCount: request.record_count,
    })),
    candidateRecordCount: receipt.counts.candidate_records,
    duplicateRecordCount: receipt.counts.duplicate_records,
    errors: receipt.errors,
    warnings: receipt.source_warnings,
  };
  validateResearchRunInMemory({
    root: input.validationRoot,
    sourceId: receipt.source_id,
    source,
    stateCode: receipt.requested_scope.state_code,
    runId: receipt.run_id,
    requestedPairKeys: receipt.requested_scope.pair_keys,
    result,
    receipt,
    outputContents,
    workerTaskId: expected.workerTaskId,
  });
  assert(
    receipt.counts.error_count === receipt.errors.length,
    "Receipt error count does not match its errors.",
  );
  if (receipt.status === "complete") {
    assert(receipt.errors.length === 0, "A complete receipt contains errors.");
    assert(
      bundle.outcomes.every((entry) => entry.scope_complete),
      "A complete receipt contains incomplete outcomes.",
    );
  }
  return bundle;
}

export function verifyStagedResearchRun(
  temporaryDirectory: string,
  receipt: ImmutableResearchRunReceipt,
) {
  for (const reference of [...receipt.outputs, ...receipt.artifacts]) {
    const filename = path.posix.basename(reference.path);
    const filepath = receipt.artifacts.includes(reference)
      ? path.join(temporaryDirectory, "artifacts", filename)
      : path.join(temporaryDirectory, filename);
    const contents = readFileSync(filepath);
    assert(contents.length === reference.bytes, `Staged byte count is wrong for ${filename}.`);
    assert(sha256(contents) === reference.sha256, `Staged hash is wrong for ${filename}.`);
  }
}
