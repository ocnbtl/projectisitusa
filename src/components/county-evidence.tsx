"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronDown, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { speciesMatchesFilters } from "@/lib/data/client-store";
import type { CountyRecord, ExplorerSpecies, SpeciesFilters } from "@/lib/data/types";
import { formatOccurrenceDate, occurrenceDateBounds } from "@/lib/research/occurrence-date";
import {
  resolveSparseCountyPairs,
  type ResolvedResearchPair,
} from "@/lib/research/pair-resolution";
import { fetchResearchProjectionJson } from "@/lib/research/public-projection-fetch";
import { buildResearchHref } from "@/lib/research/research-deep-link";
import { describeTemporalDetermination } from "@/lib/research/temporal-determination-presentation";
import type { ResearchCountyFile, ResearchPairRecord } from "@/lib/research/types";

interface CountyEvidenceProps {
  county: CountyRecord;
  allSpecies: ExplorerSpecies[];
  filters: SpeciesFilters;
}

const PAGE_SIZE = 12;
const EVIDENCE_PAGE_SIZE = 4;
const STATUS_LABELS = {
  "verified-present": "Recorded present",
  "verified-absent": "Verified absent",
  "not-detected": "Survey non-detection",
  "researched-unresolved": "Research unresolved",
  "not-researched": "Not researched",
} satisfies Record<ResearchPairRecord["displayStatus"], string>;

const STATUS_ORDER: Record<ResearchPairRecord["displayStatus"], number> = {
  "verified-present": 0,
  "verified-absent": 1,
  "not-detected": 2,
  "researched-unresolved": 3,
  "not-researched": 4,
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function oneOf(value: unknown, values: readonly string[]) {
  return typeof value === "string" && values.includes(value);
}

function optionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function hasValidAuthorityBasis(value: unknown) {
  if (value === undefined) return true;
  if (!isObject(value) || typeof value.authority !== "string" ||
      typeof value.sourceId !== "string" || typeof value.parentJurisdictionEvidenceId !== "string") {
    return false;
  }
  if (value.kind === "official-disease-distribution") {
    return typeof value.diseaseName === "string" && typeof value.declarationPublishedAt === "string";
  }
  if (value.kind === "official-known-distribution") {
    return typeof value.speciesName === "string" && typeof value.authorityStatusAsOf === "string";
  }
  if (value.kind === "official-undated-known-distribution") {
    return typeof value.speciesName === "string" && value.authorityStatusAsOf === null &&
      typeof value.projectEligibilityBegins === "string" && typeof value.projectReviewValidThrough === "string";
  }
  return false;
}

function hasValidPairShape(value: unknown) {
  if (!isObject(value)) return false;
  return (
    typeof value.speciesId === "string" &&
    typeof value.commonName === "string" &&
    typeof value.scientificName === "string" &&
    oneOf(value.category, ["plants", "insects", "fungi-diseases", "wildlife"]) &&
    oneOf(value.displayStatus, Object.keys(STATUS_LABELS)) &&
    oneOf(value.applicabilityStatus, ["applicable", "not-applicable", "unknown", "blocked"]) &&
    oneOf(value.determinationStatus, ["recorded-present", "officially-absent", "none"]) &&
    oneOf(value.surveyStatus, ["detected", "not-detected", "inconclusive", "unassessed"]) &&
    oneOf(value.researchStatus, [
      "resolved", "source-screened", "not-started", "reviewed-evidence-found",
      "reviewed-no-qualifying-evidence", "needs-followup", "blocked",
    ]) &&
    oneOf(value.freshnessStatus, ["current", "aging", "stale", "undated"]) &&
    oneOf(value.reviewStatus, [
      "not-reviewed", "machine-validated", "agent-reviewed", "human-approved", "rejected", "retracted",
    ]) &&
    (value.historicalOccurrenceStatus === undefined ||
      oneOf(value.historicalOccurrenceStatus, ["recorded-present", "none"])) &&
    (value.currentDeterminationStatus === undefined ||
      oneOf(value.currentDeterminationStatus, ["present", "officially-eradicated", "officially-absent", "none"])) &&
    hasValidAuthorityBasis(value.currentDeterminationBasis) &&
    typeof value.conflict === "boolean" &&
    Array.isArray(value.screenedBySourceIds) &&
    value.screenedBySourceIds.every((sourceId) => typeof sourceId === "string") &&
    Array.isArray(value.evidence) &&
    value.evidence.every((evidence: unknown) =>
      isObject(evidence) &&
      typeof evidence.evidenceId === "string" &&
      typeof evidence.sourceId === "string" &&
      typeof evidence.sourceLabel === "string" &&
      typeof evidence.url === "string" &&
      oneOf(evidence.assertion, ["recorded-present", "officially-absent", "not-detected"]) &&
      oneOf(evidence.scope, ["point", "survey-area", "county", "regulatory-area", "legacy-county-pair"]) &&
      optionalString(evidence.observedAt) && optionalString(evidence.reviewedAt) &&
      typeof evidence.caveat === "string" &&
      oneOf(evidence.lineage, ["source-record", "source-species-county", "manual-review", "legacy-merged"]) &&
      optionalString(evidence.parentJurisdictionEvidenceId),
    )
  );
}

/** Validate only the existing county contract; never infer research from map presence. */
export function validateCountyProjection(
  value: unknown,
  county: Pick<CountyRecord, "countyFips" | "stateCode">,
): ResearchCountyFile {
  if (!isObject(value) || value.schemaVersion !== 4 ||
      value.countyFips !== county.countyFips || value.stateCode !== county.stateCode ||
      typeof value.countyName !== "string" || typeof value.asOf !== "string" ||
      !Number.isFinite(Date.parse(value.asOf)) || typeof value.generatedAt !== "string" ||
      !Number.isFinite(Date.parse(value.generatedAt)) ||
      !isObject(value.summary) || !isObject(value.scope) || !isObject(value.pairResolution) ||
      !Array.isArray(value.pairs)) {
    throw new Error("The published research file does not match this county or its supported data format.");
  }
  const resolution = value.pairResolution;
  if (!Number.isSafeInteger(value.scope.catalogSpeciesCount) ||
      Number(value.scope.catalogSpeciesCount) < 1 ||
      !oneOf(value.scope.publicationMode, ["authoritative", "research-only"]) ||
      typeof value.scope.compatibilityPublication !== "boolean" ||
      resolution.catalogSpeciesPath !== "/generated/species.json" ||
      resolution.defaultApplicability !== "unknown" ||
      resolution.defaultDisplayStatus !== "not-researched" ||
      resolution.explicitPairCount !== value.pairs.length ||
      !Array.isArray(resolution.applicabilityOverrides) ||
      !resolution.applicabilityOverrides.every((entry: unknown) =>
        isObject(entry) && typeof entry.speciesId === "string" &&
        oneOf(entry.applicability, ["applicable", "not-applicable", "unknown", "blocked"]),
      ) ||
      !value.pairs.every(hasValidPairShape)) {
    throw new Error("This county's published research records could not be validated.");
  }
  return value as unknown as ResearchCountyFile;
}

function formatLabel(value: string) {
  return value.replace(/-/g, " ").replace(/^./, (character) => character.toUpperCase());
}

function citationHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

function PairDetails({ pair, species, county }: { pair: ResolvedResearchPair; species?: ExplorerSpecies; county: CountyRecord }) {
  const temporal = describeTemporalDetermination(pair);
  const orderedEvidence = useMemo(() => [...pair.evidence].sort((a, b) => (occurrenceDateBounds(b.observedAt)?.end ?? -Infinity) - (occurrenceDateBounds(a.observedAt)?.end ?? -Infinity) || a.evidenceId.localeCompare(b.evidenceId)), [pair.evidence]);
  const [visibleEvidenceCount, setVisibleEvidenceCount] = useState(EVIDENCE_PAGE_SIZE);

  return (
    <div className="evidence-details">
      {temporal ? (
        <div className="evidence-temporal">
          <dl className="evidence-axes">
            <div><dt>Occurrence history</dt><dd>{temporal.historyLabel}</dd></div>
            <div><dt>Agency determination</dt><dd>{temporal.currentLabel}</dd></div>
          </dl>
          {temporal.attribution ? <p>{temporal.attribution}</p> : null}
          <p className="county-note">{temporal.explanation}</p>
        </div>
      ) : null}
      {pair.displayStatus === "not-detected" ? (
        <p className="county-note">
          Non-detection applies to the documented survey scope and time. It is not
          a determination of absence.
        </p>
      ) : null}
      {pair.sparseDefault ? (
        <p className="county-note">
          No explicit county research row is published for this species. The
          published sparse default is not researched; it establishes neither
          absence nor non-detection.
        </p>
      ) : null}
      <dl className="evidence-axes">
        {[
          ["Determination", pair.determinationStatus],
          ["Survey", pair.surveyStatus],
          ["Research", pair.researchStatus],
          ["Review", pair.reviewStatus],
          ["Freshness", pair.freshnessStatus],
          ["State applicability", pair.applicabilityStatus],
          ["Conflict", pair.conflict ? "yes" : "no"],
        ].map(([label, value]) => (
          <div key={label}><dt>{label}</dt><dd>{formatLabel(value)}</dd></div>
        ))}
      </dl>

      {pair.evidence.length > 0 ? (
        <>
          <ol className="evidence-citations">
            {orderedEvidence.slice(0, visibleEvidenceCount).map((evidence) => {
              const href = citationHref(evidence.url);
              const label = evidence.sourceLabel || evidence.sourceId;
              return (
                <li key={evidence.evidenceId} className="evidence-citation">
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {label} <ArrowUpRight aria-hidden="true" size={13} />
                    </a>
                  ) : <strong>{label}</strong>}
                  <p>{formatLabel(evidence.assertion)} / {formatLabel(evidence.scope)}</p>
                  <dl className="evidence-axes">
                    <div><dt>Observed</dt><dd>{formatOccurrenceDate(evidence.observedAt)}</dd></div>
                    <div><dt>Reviewed</dt><dd>{formatOccurrenceDate(evidence.reviewedAt)}</dd></div>
                  </dl>
                  {evidence.caveat ? <p className="county-note">{evidence.caveat}</p> : null}
                  <p className="evidence-lineage">Lineage: {formatLabel(evidence.lineage)}</p>
                  {evidence.parentJurisdictionEvidenceId ? (
                    <p className="evidence-lineage">
                      Derived from jurisdiction record: {evidence.parentJurisdictionEvidenceId}
                    </p>
                  ) : null}
                  <p className="evidence-id">Evidence ID: {evidence.evidenceId}</p>
                </li>
              );
            })}
          </ol>
          {visibleEvidenceCount < pair.evidence.length ? (
            <button
              type="button"
              className="county-load-more"
              onClick={() => setVisibleEvidenceCount((count) => count + EVIDENCE_PAGE_SIZE)}
            >
              Show {Math.min(EVIDENCE_PAGE_SIZE, pair.evidence.length - visibleEvidenceCount)} more sources
            </button>
          ) : null}
        </>
      ) : (
        <p className="county-note">No direct evidence records are attached to this county-species pair.</p>
      )}

      <p className="evidence-lineage">
        Source screens: {pair.screenedBySourceIds.length > 0
          ? pair.screenedBySourceIds.join(", ")
          : "None recorded"}
      </p>
      {species ? <Link className="evidence-profile-link" href={`/species/${species.slug}?state=${county.stateCode}&county=${county.countyFips}`}>Species profile <ArrowUpRight aria-hidden="true" size={14} /></Link> : null}
    </div>
  );
}

function EvidencePair({ pair, species, county }: { pair: ResolvedResearchPair; species?: ExplorerSpecies; county: CountyRecord }) {
  const [open, setOpen] = useState(false);
  const temporal = describeTemporalDetermination(pair);
  const orderedEvidence = useMemo(() => [...pair.evidence].sort((a, b) => (occurrenceDateBounds(b.observedAt)?.end ?? -Infinity) - (occurrenceDateBounds(a.observedAt)?.end ?? -Infinity) || a.evidenceId.localeCompare(b.evidenceId)), [pair.evidence]);
  const statusLabel = pair.conflict
    ? "Conflicting evidence"
    : pair.displayStatus === "verified-absent"
      ? temporal?.pairStatusLabel ?? STATUS_LABELS[pair.displayStatus]
      : STATUS_LABELS[pair.displayStatus];

  return (
    <li className="evidence-pair">
      <details onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary>
          <span className="evidence-pair-name">
            <strong>{pair.commonName}</strong>
            <em>{pair.scientificName}</em>
            <span className="evidence-status" data-status={pair.displayStatus}>{statusLabel}</span>
            {temporal?.showInResults && temporal.currentLabel !== statusLabel ? (
              <span className="evidence-current-status">Agency: {temporal.currentLabel}</span>
            ) : null}
            <span className="evidence-record-count">
              {pair.evidence.length.toLocaleString()} evidence {pair.evidence.length === 1 ? "record" : "records"}
            </span>
          </span>
          <ChevronDown aria-hidden="true" size={16} />
        </summary>
        {open ? <PairDetails pair={pair} species={species} county={county} /> : null}
      </details>
    </li>
  );
}

function EvidenceList({
  pairs,
  speciesById,
  county,
}: {
  pairs: ResolvedResearchPair[];
  speciesById: Map<string, ExplorerSpecies>;
  county: CountyRecord;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visiblePairs = pairs.slice(0, visibleCount);
  return (
    <>
      <ul className="evidence-list" aria-label="County species research records">
        {visiblePairs.map((pair) => <EvidencePair key={pair.speciesId} pair={pair} species={speciesById.get(pair.speciesId)} county={county} />)}
      </ul>
      {pairs.length === 0 ? (
        <p className="county-empty">No catalog species match these filters. This is not evidence of absence.</p>
      ) : (
        <p className="county-list-count" aria-live="polite">
          Showing {visiblePairs.length.toLocaleString()} of {pairs.length.toLocaleString()} matching species
        </p>
      )}
      {visibleCount < pairs.length ? (
        <button type="button" className="county-load-more" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
          Show {Math.min(PAGE_SIZE, pairs.length - visibleCount)} more species
        </button>
      ) : null}
    </>
  );
}

export function CountyEvidence({ county, allSpecies, filters }: CountyEvidenceProps) {
  const [countyData, setCountyData] = useState<ResearchCountyFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const countyFips = county.countyFips;
  const stateCode = county.stateCode;
  const speciesById = useMemo(() => new Map(allSpecies.map((species) => [species.id, species])), [allSpecies]);
  const researchHref = buildResearchHref({
    stateCode,
    countyFips,
    speciesQuery: filters.speciesId ? speciesById.get(filters.speciesId)?.scientificName : filters.query,
  });

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => { controller.abort(); setLoadError("County evidence took too long to load. Please retry."); }, 20000);
    setCountyData(null);
    setLoadError(null);

    async function loadCounty() {
      try {
        if (!/^[A-Z]{2}$/.test(stateCode) || !/^[0-9]{5}$/.test(countyFips)) {
          throw new Error("This county does not have a supported research identifier.");
        }
        const projection = await fetchResearchProjectionJson(
          `${stateCode}/counties/${countyFips}.json`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const data = validateCountyProjection(projection, { countyFips, stateCode });
        if (!controller.signal.aborted) setCountyData(data);
        window.clearTimeout(timeout);
      } catch (error) {
        if (controller.signal.aborted) return;
        window.clearTimeout(timeout);
        setLoadError(error instanceof Error ? error.message : "County evidence could not be loaded.");
      }
    }

    void loadCounty();
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [attempt, countyFips, stateCode]);

  // A county identity check also protects the render before an effect cleanup runs.
  const currentData = countyData?.countyFips === countyFips && countyData.stateCode === stateCode
    ? countyData : null;
  const resolution = useMemo(() => {
    if (!currentData) return { pairs: [] as ResolvedResearchPair[], error: null };
    try {
      return { pairs: resolveSparseCountyPairs({ catalogSpecies: allSpecies, county: currentData }), error: null };
    } catch (error) {
      return {
        pairs: [] as ResolvedResearchPair[],
        error: error instanceof Error ? error.message : "The map catalog does not match this research release.",
      };
    }
  }, [allSpecies, currentData]);
  const matchingPairs = useMemo(() => resolution.pairs
    .filter((pair) => {
      const species = speciesById.get(pair.speciesId);
      return species ? speciesMatchesFilters(species, filters) : false;
    })
    .sort((left, right) =>
      Number(left.sparseDefault) - Number(right.sparseDefault) ||
      STATUS_ORDER[left.displayStatus] - STATUS_ORDER[right.displayStatus] ||
      left.commonName.localeCompare(right.commonName),
    ), [filters, resolution.pairs, speciesById]);
  const error = loadError ?? resolution.error;

  return (
    <div className="county-evidence">
      <div className="county-section-heading"><h3>County evidence</h3></div>
      <p className="county-note">
        Source records for this county. Occurrence, current agency
        status, and survey non-detection answer different questions. Missing
        evidence does not establish absence.
      </p>
      {error ? (
        <div className="county-evidence-error" role="alert">
          <p>County evidence is unavailable.</p>
          <p className="county-note">{error}</p>
          <button type="button" className="county-load-more" onClick={() => setAttempt((value) => value + 1)}>
            <RotateCcw aria-hidden="true" size={14} /> Retry evidence
          </button>
        </div>
      ) : currentData ? (
        <>
          <p className="county-evidence-date">Research as of {formatOccurrenceDate(currentData.asOf)}</p>
          <p className="county-note">
            Observation dates may be historical. A record does not establish presence today.
            Expand a species for dates, source scope, and caveats.
          </p>
          <EvidenceList key={JSON.stringify(filters)} pairs={matchingPairs} speciesById={speciesById} county={county} />
        </>
      ) : <p className="county-note" role="status">Loading published county evidence...</p>}
      <Link href={researchHref} className="county-research-link">
        Open full research view <ArrowUpRight aria-hidden="true" size={14} />
      </Link>
    </div>
  );
}
