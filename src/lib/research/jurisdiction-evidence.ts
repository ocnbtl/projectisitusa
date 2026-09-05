import { createHash } from "node:crypto";

import type {
  CurrentDeterminationStatus,
  HistoricalOccurrenceStatus,
  JurisdictionEvidenceRecord,
  JurisdictionEvidenceRegistry,
  PairDisplayStatus,
} from "@/lib/research/types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
const FIPS_PATTERN = /^\d{5}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

type CountyRegistryInput = {
  countyEquivalents: Array<{
    countyFips: string;
    stateCode: string;
    status: string;
  }>;
};

type StateRegistryInput = {
  nationalV1: {
    certificationOrder: string[];
  };
};

type PresenceEvidence = {
  evidenceId: string;
  observedAt?: string;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function dateOnlyTimestamp(value: string, label: string) {
  assert(DATE_PATTERN.test(value), `${label} must be a YYYY-MM-DD date.`);
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  assert(Number.isFinite(timestamp), `${label} is not a valid date.`);
  return timestamp;
}

function occurrenceTimestamp(value: string | undefined) {
  if (!value) return null;
  const normalized = /^\d{4}$/u.test(value)
    ? `${value}-01-01T00:00:00.000Z`
    : /^\d{4}-\d{2}$/u.test(value)
      ? `${value}-01T00:00:00.000Z`
      : DATE_PATTERN.test(value)
        ? `${value}T00:00:00.000Z`
        : value;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function sortedUnique(values: string[], label: string) {
  const sorted = [...new Set(values)].sort(compareText);
  assert(sorted.length === values.length, `${label} contains duplicates.`);
  assert(JSON.stringify(sorted) === JSON.stringify(values), `${label} must be sorted.`);
  return sorted;
}

function fipsSetSha256(values: string[]) {
  return createHash("sha256").update(JSON.stringify(values)).digest("hex");
}

function safeRepositoryPath(value: string) {
  return Boolean(
    value &&
      !value.startsWith("/") &&
      !/^[A-Za-z]:[\\/]/u.test(value) &&
      !value.split(/[\\/]/u).includes(".."),
  );
}

export function validateJurisdictionEvidenceRegistry(input: {
  registry: JurisdictionEvidenceRegistry;
  countyRegistry: CountyRegistryInput;
  stateRegistry: StateRegistryInput;
}) {
  const { registry, countyRegistry, stateRegistry } = input;
  assert(registry.schemaVersion === 1, "Jurisdiction evidence registry schema version changed.");
  dateOnlyTimestamp(registry.updatedAt, "Jurisdiction evidence registry updatedAt");
  assert(Array.isArray(registry.records), "Jurisdiction evidence registry records are missing.");

  const activeCounties = countyRegistry.countyEquivalents
    .filter((county) => county.status === "active")
    .map((county) => ({ countyFips: county.countyFips, stateCode: county.stateCode }));
  const activeByFips = new Map(activeCounties.map((county) => [county.countyFips, county]));
  const nationalStateCodes = new Set(stateRegistry.nationalV1.certificationOrder);
  const nationalCountyFips = activeCounties
    .filter((county) => nationalStateCodes.has(county.stateCode))
    .map((county) => county.countyFips)
    .sort(compareText);
  const recordIds = new Set<string>();

  for (const record of registry.records) {
    assert(record.schemaVersion === 1, `${record.id}: schema version changed.`);
    assert(/^[a-z0-9][a-z0-9-]+$/u.test(record.id), "Jurisdiction evidence record ID is invalid.");
    assert(!recordIds.has(record.id), `Duplicate jurisdiction evidence record ${record.id}.`);
    recordIds.add(record.id);
    assert(/^[a-z0-9][a-z0-9-]+$/u.test(record.speciesId), `${record.id}: species ID is invalid.`);
    assert(
      record.statementType === "officially-eradicated" || record.statementType === "officially-absent",
      `${record.id}: statement type is invalid.`,
    );
    assert(record.sourceDocuments.length > 0, `${record.id}: source documents are missing.`);
    const sourceIds = new Set<string>();
    for (const document of record.sourceDocuments) {
      assert(document.sourceId.length > 0 && !sourceIds.has(document.sourceId), `${record.id}: source document IDs must be unique.`);
      sourceIds.add(document.sourceId);
      assert(document.url.startsWith("https://"), `${record.id}: source document URL must use HTTPS.`);
      assert(safeRepositoryPath(document.artifactPath), `${record.id}: source artifact path is unsafe.`);
      assert(SHA256_PATTERN.test(document.artifactSha256), `${record.id}: source artifact hash is invalid.`);
      assert(SHA256_PATTERN.test(document.supportTextSha256), `${record.id}: support text hash is invalid.`);
      assert(document.supportText.length > 0, `${record.id}: support text is missing.`);
      assert(
        createHash("sha256").update(document.supportText).digest("hex") === document.supportTextSha256,
        `${record.id}: support text hash changed.`,
      );
      if (document.publishedAt) dateOnlyTimestamp(document.publishedAt, `${record.id}: publishedAt`);
      if (document.modifiedAt) dateOnlyTimestamp(document.modifiedAt, `${record.id}: modifiedAt`);
    }

    const effectiveAt = dateOnlyTimestamp(record.effectiveAt, `${record.id}: effectiveAt`);
    if (record.conflictCheckFrom) {
      assert(dateOnlyTimestamp(record.conflictCheckFrom, `${record.id}: conflictCheckFrom`) <= effectiveAt, `${record.id}: conflictCheckFrom follows effectiveAt.`);
    }
    const reaffirmedAt = record.reaffirmedAt
      ? dateOnlyTimestamp(record.reaffirmedAt, `${record.id}: reaffirmedAt`)
      : effectiveAt;
    const validThrough = dateOnlyTimestamp(record.validThrough, `${record.id}: validThrough`);
    assert(reaffirmedAt >= effectiveAt, `${record.id}: reaffirmedAt precedes effectiveAt.`);
    assert(validThrough >= reaffirmedAt, `${record.id}: validThrough precedes its latest authority date.`);
    assert(
      record.review.gate === "human-approved" && record.review.status === "human-approved",
      `${record.id}: jurisdiction evidence requires human approval.`,
    );
    assert(record.review.actorId.length > 0, `${record.id}: human review actor is missing.`);
    assert(Number.isFinite(Date.parse(record.review.reviewedAt)), `${record.id}: human review time is invalid.`);

    const countyFips = sortedUnique(record.jurisdiction.countyFips, `${record.id}: county FIPS`);
    const exclusions = sortedUnique(record.jurisdiction.exclusions, `${record.id}: exclusions`);
    assert(countyFips.length > 0, `${record.id}: county FIPS set is empty.`);
    assert(exclusions.length === 0, `${record.id}: unresolved jurisdiction exclusions are not allowed.`);
    assert(countyFips.every((fips) => FIPS_PATTERN.test(fips) && activeByFips.has(fips)), `${record.id}: county FIPS set contains inactive or invalid geography.`);
    assert(exclusions.every((fips) => FIPS_PATTERN.test(fips) && activeByFips.has(fips)), `${record.id}: exclusions contain inactive or invalid geography.`);
    assert(countyFips.every((fips) => !exclusions.includes(fips)), `${record.id}: included and excluded counties overlap.`);
    assert(
      fipsSetSha256(countyFips) === record.jurisdiction.countyFipsSha256,
      `${record.id}: county FIPS hash changed.`,
    );

    let expectedCountyFips: string[] | null = null;
    if (record.jurisdiction.level === "nation") {
      assert(record.jurisdiction.stateCode === null, `${record.id}: nation records cannot declare one state.`);
      expectedCountyFips = nationalCountyFips;
    } else if (record.jurisdiction.level === "state") {
      const stateCode = record.jurisdiction.stateCode;
      assert(stateCode && nationalStateCodes.has(stateCode), `${record.id}: state jurisdiction is not in national V1.`);
      expectedCountyFips = activeCounties
        .filter((county) => county.stateCode === stateCode)
        .map((county) => county.countyFips)
        .sort(compareText);
    } else {
      assert(record.jurisdiction.level === "county-set", `${record.id}: jurisdiction level is invalid.`);
      assert(exclusions.length === 0, `${record.id}: explicit county sets cannot also declare exclusions.`);
      if (record.jurisdiction.stateCode) {
        assert(
          countyFips.every((fips) => activeByFips.get(fips)?.stateCode === record.jurisdiction.stateCode),
          `${record.id}: county set crosses its declared state.`,
        );
      }
    }
    if (expectedCountyFips) {
      assert(
        JSON.stringify(countyFips) === JSON.stringify(expectedCountyFips),
        `${record.id}: jurisdiction coverage has gaps, extras, or unresolved exclusions.`,
      );
    }
  }
  return registry;
}

export function resolveTemporalPairDetermination(input: {
  presenceEvidence: PresenceEvidence[];
  jurisdictionEvidence: Array<Pick<JurisdictionEvidenceRecord, "id" | "statementType" | "effectiveAt" | "conflictCheckFrom" | "reaffirmedAt" | "validThrough">>;
  asOf: string;
}) {
  const asOfTimestamp = dateOnlyTimestamp(input.asOf, "Temporal determination asOf");
  const retainedParentIds = input.jurisdictionEvidence.map((record) => record.id).sort(compareText);
  const activeRecords = input.jurisdictionEvidence
    .filter((record) => {
      const effectiveAt = dateOnlyTimestamp(record.effectiveAt, `${record.id}: effectiveAt`);
      const validThrough = dateOnlyTimestamp(record.validThrough, `${record.id}: validThrough`);
      return effectiveAt <= asOfTimestamp && validThrough >= asOfTimestamp;
    })
    .sort((left, right) => {
      const leftAuthority = left.reaffirmedAt ?? left.effectiveAt;
      const rightAuthority = right.reaffirmedAt ?? right.effectiveAt;
      return compareText(leftAuthority, rightAuthority) || compareText(left.id, right.id);
    });
  const staleParentIds = input.jurisdictionEvidence
    .filter((record) => dateOnlyTimestamp(record.validThrough, `${record.id}: validThrough`) < asOfTimestamp)
    .map((record) => record.id)
    .sort(compareText);
  const selectedRecord = activeRecords.at(-1);
  const historicalOccurrenceStatus: HistoricalOccurrenceStatus =
    input.presenceEvidence.length > 0 ? "recorded-present" : "none";

  let currentDeterminationStatus: CurrentDeterminationStatus = "none";
  let conflict = false;
  let conflictReason: string | null = null;
  if (selectedRecord) {
    const conflictCheckFrom = selectedRecord.conflictCheckFrom ?? selectedRecord.effectiveAt;
    const effectiveAt = dateOnlyTimestamp(selectedRecord.effectiveAt, `${selectedRecord.id}: effectiveAt`);
    const conflictTimestamp = dateOnlyTimestamp(conflictCheckFrom, `${selectedRecord.id}: conflictCheckFrom`);
    assert(conflictTimestamp <= effectiveAt, `${selectedRecord.id}: conflictCheckFrom follows effectiveAt.`);
    const conflictingPresence = input.presenceEvidence.find((evidence) => {
      const observedAt = occurrenceTimestamp(evidence.observedAt);
      return observedAt === null || observedAt >= conflictTimestamp;
    });
    if (conflictingPresence) {
      currentDeterminationStatus = "present";
      conflict = true;
      conflictReason = conflictingPresence.observedAt
        ? `Accepted presence ${conflictingPresence.evidenceId} is on or after ${conflictCheckFrom}.`
        : `Accepted presence ${conflictingPresence.evidenceId} is undated.`;
    } else {
      currentDeterminationStatus = selectedRecord.statementType;
    }
  }

  const compatibilityDisplayStatus: PairDisplayStatus | null =
    historicalOccurrenceStatus === "recorded-present"
      ? "verified-present"
      : currentDeterminationStatus === "officially-eradicated" ||
          currentDeterminationStatus === "officially-absent"
        ? "verified-absent"
        : null;

  return {
    historicalOccurrenceStatus,
    currentDeterminationStatus,
    compatibilityDisplayStatus,
    conflict,
    conflictReason,
    activeParentId: selectedRecord?.id ?? null,
    retainedParentIds,
    staleParentIds,
  };
}
