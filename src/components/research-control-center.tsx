"use client";

import { countyResearchProgress } from "@/lib/ui/county-progress";
import { formatOccurrenceDate } from "@/lib/research/occurrence-date";

import { loadRuntimeData } from "@/lib/data/runtime-fetch";
import { CustomSelect } from "@/components/atlas/custom-select";

import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Database,
  ExternalLink,
  LoaderCircle,
  MapPinned,
  RefreshCw,
  Search,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Fragment,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  resolveSparseCountyPairs,
  type ResearchCatalogSpecies,
} from "@/lib/research/pair-resolution";
import { fetchResearchProjectionJson } from "@/lib/research/public-projection-fetch";
import { describeResearchQuestions } from "@/lib/research/question-assessment-presentation";
import type { QuestionAssessmentCoverage } from "@/lib/research/question-assessment-ledger";
import { describeTemporalDetermination } from "@/lib/research/temporal-determination-presentation";
import {
  buildResearchHref,
  parseResearchDeepLink,
} from "@/lib/research/research-deep-link";
import type {
  ResearchCountyFile,
  ResearchPairRecord,
} from "@/lib/research/types";

export interface ResearchStateOption {
  stateCode: string;
  stateName: string;
}

interface ResearchProjectionScope {
  publicationMode: "authoritative" | "research-only";
  speciesMode: "catalog-all" | "sparse-default";
  certificationScope: "state-baseline" | "bounded-pilot";
  applicabilityPath: string;
  applicabilityAsOf: string;
  catalogSpeciesCount: number;
  stateSpeciesDenominator: number;
  applicableSpeciesCount: number;
  notApplicableSpeciesCount: number;
  unknownSpeciesCount: number;
  blockedSpeciesCount: number;
  explicitApplicabilityDecisionCount: number;
  derivedApplicableSpeciesCount: number;
  resolvedStateSpeciesDecisionCount: number;
  boundedAcquisitionSpeciesCount: number;
  defaultApplicability: "unknown";
  fullCatalogApplicabilityComplete: boolean;
  fullCatalogResearchAccounted: boolean;
  undeterminedSpeciesPolicy: "included-as-unknown";
  compatibilityPublication: boolean;
  protocolModel:
    | "explicit-source-species-legacy-migration"
    | "explicit-source-species-active";
}

export interface ResearchSummaryFile {
  questionAssessment?: QuestionAssessmentCoverage;
  schemaVersion: string | number;
  stateCode: string;
  stateName: string;
  asOf: string;
  generatedAt: string;
  sourceSnapshotDate: string;
  scope: ResearchProjectionScope;
  stateSpeciesResearch: {
    fullyAccountedSpeciesCount: number;
    partiallyAccountedSpeciesCount: number;
    untouchedSpeciesCount: number;
    fullCatalogResearchAccounted: boolean;
  };
  summary: {
    speciesCount: number;
    countyCount: number;
    totalPairs: number;
    resolvablePairCount: number;
    notApplicablePairCount: number;
    blockedPairCount: number;
    verifiedPresent: number;
    verifiedAbsent: number;
    notDetected: number;
    researchedUnresolved: number;
    notResearched: number;
    determinationCoveragePercent: number;
    researchCoveragePercent: number;
    conflictCount: number;
    boundedAcquisition: {
      speciesCount: number;
      totalPairs: number;
      researchCoveragePercent: number;
    };
  };
  counties: Array<{
    countyFips: string;
    name: string;
    verifiedPresent: number;
    verifiedAbsent: number;
    notDetected: number;
    researchedUnresolved: number;
    notResearched: number;
    researchCoveragePercent: number;
  }>;
  sources: Array<{
    id: string;
    label: string;
    authority: string;
    tier: string | number;
    status: string;
    lastRunAt: string | null;
    evidencePairCount: number;
    screenedSpeciesCount: number;
  }>;
  queue: Array<{
    speciesId: string;
    commonName: string;
    scientificName: string;
    category: string;
    notResearchedCountyCount: number;
    researchedUnresolvedCountyCount: number;
    missingProtocolSourceIds: string[];
    priorityScore: number;
  }>;
  statusDefinitions: unknown;
}

type CountyResearchFile = ResearchCountyFile;
type CountyResearchPair = ResearchPairRecord & { sparseDefault?: boolean };

type ControlCenterView = "county" | "sources" | "queue";
type PairSortKey =
  | "commonName"
  | "category"
  | "displayStatus"
  | "researchStatus"
  | "evidence"
  | "freshnessStatus";
type SortDirection = "asc" | "desc";

const KNOWN_STATUSES = [
  "verified-present",
  "verified-absent",
  "not-detected",
  "researched-unresolved",
  "not-researched",
] as const;

const STATUS_ORDER = new Map<string, number>(
  KNOWN_STATUSES.map((status, index) => [status, index]),
);

const NUMBER_FORMATTER = new Intl.NumberFormat("en-US");

const VIEW_OPTIONS: Array<{
  id: ControlCenterView;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "county", label: "County findings", icon: MapPinned },
  { id: "sources", label: "Sources", icon: Database },
  { id: "queue", label: "Still checking", icon: ClipboardList },
];

const STATUS_STYLES: Record<string, string> = {
  "verified-present":
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  "verified-absent":
    "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  "not-detected":
    "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  "researched-unresolved":
    "border-orange-500/25 bg-orange-500/10 text-orange-800 dark:text-orange-300",
  "not-researched":
    "border-[var(--border)] bg-[var(--background)] text-[var(--muted)]",
  active:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  ready:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  complete:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  current:
    "border-emerald-500/25 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  running:
    "border-sky-500/25 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  stale:
    "border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  blocked:
    "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300",
  error:
    "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300",
  failed:
    "border-red-500/25 bg-red-500/10 text-red-800 dark:text-red-300",
};

function formatNumber(value: number) {
  return NUMBER_FORMATTER.format(value);
}

function formatPercent(value: number) {
  return `${value.toFixed(2)}%`;
}

const PUBLIC_LABELS: Record<string, string> = {
  "verified-present": "Recorded present",
  "verified-absent": "Official absence finding",
  "not-detected": "Survey found no detections",
  "researched-unresolved": "More evidence needed",
  "not-researched": "Not researched yet",
  "reviewed-no-qualifying-evidence": "No qualifying evidence",
  "source-screened": "Source checked",
  stale: "Older record",
  "not-started": "Not started",
  "fungi-diseases": "Fungi & diseases",
};

function formatLabel(value: string) {
  if (PUBLIC_LABELS[value]) return PUBLIC_LABELS[value];
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseDate(value: string) {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00Z`
    : value;
  return new Date(normalized);
}

const formatDate = formatOccurrenceDate;

function formatTimestamp(value: string | null) {
  if (!value) return "Never";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function formatLineage(lineage: unknown) {
  if (!lineage) return null;
  if (typeof lineage === "string") return lineage;
  if (Array.isArray(lineage)) {
    return lineage.map((item) => String(item)).join(" / ");
  }
  if (typeof lineage === "object") {
    return Object.entries(lineage as Record<string, unknown>)
      .map(([key, value]) => `${formatLabel(key)}: ${String(value)}`)
      .join(" / ");
  }
  return String(lineage);
}

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const normalized = status.toLowerCase();
  const style =
    STATUS_STYLES[normalized] ??
    "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]";

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[11px] font-semibold leading-none ${style}`}
    >
      <span className="truncate">{label ?? formatLabel(status)}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <dt className="text-xs font-medium text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 font-[family-name:var(--font-display)] text-lg font-semibold tabular-nums text-[var(--foreground)]">
        {value}
      </dd>
    </div>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
  stateFlags = false,
}: {
  label: string;
  value: string;
  stateFlags?: boolean;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return <CustomSelect label={label} value={value} options={options} onChange={onChange} disabled={disabled} stateFlags={stateFlags} />;
}

function SearchField({
  label,
  value,
  placeholder,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
        {label}
      </span>
      <span className="relative block">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          size={16}
        />
        <input
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-10 w-full rounded-md border border-[var(--border)] bg-[var(--background)] pl-9 pr-3 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
        />
      </span>
    </label>
  );
}

function SortButton({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
}: {
  label: string;
  sortKey: PairSortKey;
  activeKey: PairSortKey;
  direction: SortDirection;
  onSort: (key: PairSortKey) => void;
}) {
  const isActive = sortKey === activeKey;
  const Icon = isActive
    ? direction === "asc"
      ? ArrowUp
      : ArrowDown
    : ChevronsUpDown;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className="inline-flex items-center gap-1.5 text-left text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      aria-label={`Sort by ${label}${isActive ? `, currently ${direction}` : ""}`}
    >
      {label}
      <Icon aria-hidden="true" size={13} />
    </button>
  );
}

function Pagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <div className="flex flex-col gap-3 border-t border-[var(--border)] px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-4">
      <p className="tabular-nums text-[var(--muted)]">
        Showing {formatNumber(firstItem)} to {formatNumber(lastItem)} of{" "}
        {formatNumber(totalItems)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <CustomSelect compact label="Rows" value={String(pageSize)} options={[25, 50, 100].map(size => ({ value: String(size), label: String(size) }))} onChange={value => onPageSizeChange(Number(value))} />
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft aria-hidden="true" size={16} />
        </button>
        <span className="min-w-20 text-center text-xs tabular-nums text-[var(--muted)]">
          {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight aria-hidden="true" size={16} />
        </button>
      </div>
    </div>
  );
}

function CurrentDeterminationLabel({ pair }: { pair: CountyResearchPair }) {
  const temporal = describeTemporalDetermination(pair);
  if (!temporal?.showInResults) return null;
  return (
    <span className="mt-1 block text-xs font-medium text-[var(--foreground)]">
      Current: {temporal.currentLabel}
      {temporal.attribution ? <span className="mt-1 block font-normal">{temporal.attribution}</span> : null}
    </span>
  );
}

function EvidenceDetails({
  pair,
  sourceLabels,
  questionCoverage,
}: {
  pair: CountyResearchPair;
  sourceLabels: Map<string, string>;
  questionCoverage?: QuestionAssessmentCoverage;
}) {
  const temporal = describeTemporalDetermination(pair);
  return (
    <div className="bg-[var(--background)] px-4 py-4 sm:px-6">
      {temporal ? (
        <section aria-label="Occurrence history and current determination" className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-[var(--muted)]">Occurrence history</dt>
              <dd className="mt-1 font-medium">{temporal.historyLabel}</dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--muted)]">Current agency determination</dt>
              <dd className="mt-1 font-medium">{temporal.currentLabel}</dd>
            </div>
          </dl>
          {temporal.attribution ? <p className="mt-3 text-xs font-medium">{temporal.attribution}</p> : null}
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{temporal.explanation}</p>
        </section>
      ) : null}
      {questionCoverage ? (
        <section aria-label="Research question assessments" className="mb-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Research questions</h3>
            <p className="text-xs text-[var(--muted)]">{pair.questionAssessment?.assessedQuestions ?? 0} of {questionCoverage.definitions.filter((q) => q.required).length} assessed</p>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {describeResearchQuestions(questionCoverage, pair.questionAssessment).map((question) => (
              <div key={question.id} className="min-w-0">
                <h4 className="text-xs font-medium text-[var(--muted)]">{question.label}</h4>
                <p className="mt-1 text-sm font-medium">{question.statusLabel}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{question.periodLabel}</p>
                <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{question.explanation}</p>
                {question.citations.map((citation) => (
                  <a key={citation.evidenceId} href={citation.url} target="_blank" rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-strong)] underline underline-offset-2">
                    {sourceLabels.get(citation.sourceId) ?? citation.sourceId}<ExternalLink aria-hidden="true" size={12} />
                  </a>
                ))}
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <dl className="grid gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Determination", pair.determinationStatus],
          ["Survey", pair.surveyStatus],
          ["Research", pair.researchStatus],
          ["Freshness", pair.freshnessStatus],
          ["Conflict", pair.conflict ? "Yes" : "No"],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-[var(--muted)]">{label}</dt>
            <dd className="mt-1 font-medium text-[var(--foreground)]">
              {formatLabel(value)}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 border-t border-[var(--border)]">
        {pair.evidence.length === 0 ? (
          <p className="py-4 text-sm text-[var(--muted)]">
            No direct evidence records are attached to this pair.
          </p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {pair.evidence.map((evidence) => {
              const lineage = formatLineage(evidence.lineage);
              return (
                <article key={evidence.evidenceId} className="py-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      {evidence.url ? (
                        <a
                          href={evidence.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-1.5 font-medium text-[var(--foreground)] hover:text-[var(--accent-strong)]"
                        >
                          <span className="truncate">
                            {evidence.sourceLabel ||
                              sourceLabels.get(evidence.sourceId) ||
                              evidence.sourceId}
                          </span>
                          <ExternalLink aria-hidden="true" className="shrink-0" size={14} />
                        </a>
                      ) : (
                        <p className="font-medium text-[var(--foreground)]">
                          {evidence.sourceLabel ||
                            sourceLabels.get(evidence.sourceId) ||
                            evidence.sourceId}
                        </p>
                      )}
                      <p className="mt-1 text-sm text-[var(--foreground)]">
                        {formatLabel(evidence.assertion)}
                      </p>
                    </div>
                    <p className="shrink-0 text-xs tabular-nums text-[var(--muted)]">
                      Reviewed {formatDate(evidence.reviewedAt)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted)]">
                    <span>Scope: {formatLabel(evidence.scope)}</span>
                    <span>Observed: {formatDate(evidence.observedAt)}</span>
                  </div>
                  {evidence.caveat ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      <span className="font-medium text-[var(--foreground)]">Caveat:</span>{" "}
                      {evidence.caveat}
                    </p>
                  ) : null}
                  <details className="research-record-details"><summary>Record details</summary>
                    <p className="break-all">Evidence ID: {evidence.evidenceId}</p>
                  {lineage ? (
                    <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">
                      <span className="font-medium text-[var(--foreground)]">Lineage:</span>{" "}
                      {lineage}
                    </p>
                  ) : null}
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <p className="border-t border-[var(--border)] pt-3 text-xs leading-5 text-[var(--muted)]">
        Screened by:{" "}
        {pair.screenedBySourceIds.length
          ? pair.screenedBySourceIds
              .map((sourceId) => sourceLabels.get(sourceId) ?? sourceId)
              .join(", ")
          : "No source protocols recorded"}
      </p>
    </div>
  );
}

function CountyPairTable({
  pairs,
  sourceLabels,
  questionCoverage,
  expandedSpeciesIds,
  onToggleEvidence,
  sortKey,
  sortDirection,
  onSort,
}: {
  pairs: CountyResearchPair[];
  sourceLabels: Map<string, string>;
  questionCoverage?: QuestionAssessmentCoverage;
  expandedSpeciesIds: Set<string>;
  onToggleEvidence: (speciesId: string) => void;
  sortKey: PairSortKey;
  sortDirection: SortDirection;
  onSort: (key: PairSortKey) => void;
}) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-md border border-[var(--border)] md:block">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <colgroup>
            <col className="w-11" />
            <col className="w-[27%]" />
            <col className="w-[14%]" />
            <col className="w-[18%]" />
            <col className="w-[16%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
          </colgroup>
          <thead className="bg-[var(--surface)]">
            <tr className="border-b border-[var(--border)]">
              <th scope="col" className="px-2 py-3">
                <span className="sr-only">Evidence details</span>
              </th>
              {[
                ["Species", "commonName"],
                ["Category", "category"],
                ["Finding", "displayStatus"],
                ["Checks", "researchStatus"],
                ["Records", "evidence"],
                ["Record age", "freshnessStatus"],
              ].map(([label, key]) => (
                <th key={key} scope="col" className="px-3 py-3">
                  <SortButton
                    label={label}
                    sortKey={key as PairSortKey}
                    activeKey={sortKey}
                    direction={sortDirection}
                    onSort={onSort}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] bg-[var(--surface-strong)]">
            {pairs.map((pair) => {
              const isExpanded = expandedSpeciesIds.has(pair.speciesId);
              return (
                <Fragment key={pair.speciesId}>
                  <tr className="align-middle hover:bg-[var(--surface)]">
                    <td className="px-2 py-3 text-center">
                      <button
                        type="button"
                        onClick={() => onToggleEvidence(pair.speciesId)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        aria-label={`${isExpanded ? "Hide" : "Show"} evidence for ${pair.commonName}`}
                        title={`${isExpanded ? "Hide" : "Show"} evidence`}
                        aria-expanded={isExpanded}
                      >
                        <ChevronRight
                          aria-hidden="true"
                          className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          size={17}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 items-start gap-2">
                        <div className="min-w-0">
                          <button type="button" className="research-species-open" aria-expanded={isExpanded} onClick={() => onToggleEvidence(pair.speciesId)} title={pair.commonName}>{pair.commonName}</button>
                          <p className="truncate text-xs italic text-[var(--muted)]" title={pair.scientificName}>
                            {pair.scientificName}
                          </p>
                        </div>
                        {pair.conflict ? (
                          <span
                            className="mt-0.5 shrink-0 text-[var(--danger)]"
                            role="img"
                            aria-label="Conflicting evidence"
                            title="Conflicting evidence"
                          >
                            <TriangleAlert aria-hidden="true" size={15} />
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--muted)]">
                      {formatLabel(pair.category)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-block">
                      <StatusBadge status={pair.displayStatus} label={pair.displayStatus === "verified-absent" ? describeTemporalDetermination(pair)?.pairStatusLabel : undefined} />
                      <CurrentDeterminationLabel pair={pair} />
                    </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--muted)]">
                      {formatLabel(pair.researchStatus)}
                    </td>
                    <td className="px-3 py-3 text-xs tabular-nums text-[var(--muted)]">
                      {formatNumber(pair.evidence.length)}
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--muted)]">
                      {formatLabel(pair.freshnessStatus)}
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <EvidenceDetails pair={pair} sourceLabels={sourceLabels} questionCoverage={questionCoverage} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-[var(--border)] border-y border-[var(--border)] bg-[var(--surface-strong)] md:hidden">
        {pairs.map((pair) => {
          const isExpanded = expandedSpeciesIds.has(pair.speciesId);
          return (
            <div key={pair.speciesId}>
              <button
                type="button"
                onClick={() => onToggleEvidence(pair.speciesId)}
                className="flex w-full items-start gap-3 px-3 py-4 text-left hover:bg-[var(--surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]"
                aria-expanded={isExpanded}
              >
                <ChevronRight
                  aria-hidden="true"
                  className={`mt-0.5 shrink-0 text-[var(--muted)] transition-transform ${isExpanded ? "rotate-90" : ""}`}
                  size={17}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block font-medium text-[var(--foreground)]">
                        {pair.commonName}
                      </span>
                      <span className="block truncate text-xs italic text-[var(--muted)]">
                        {pair.scientificName}
                      </span>
                    </span>
                    {pair.conflict ? (
                      <TriangleAlert
                        aria-label="Conflicting evidence"
                        className="shrink-0 text-[var(--danger)]"
                        size={16}
                      />
                    ) : null}
                  </span>
                  <span className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="inline-block">
                        <StatusBadge status={pair.displayStatus} label={pair.displayStatus === "verified-absent" ? describeTemporalDetermination(pair)?.pairStatusLabel : undefined} />
                        <CurrentDeterminationLabel pair={pair} />
                      </span>
                    <span className="text-xs text-[var(--muted)]">
                      {formatLabel(pair.category)}
                    </span>
                    <span className="text-xs tabular-nums text-[var(--muted)]">
                      {formatNumber(pair.evidence.length)} {pair.evidence.length === 1 ? "record" : "records"}
                    </span>
                  </span>
                </span>
              </button>
              {isExpanded ? (
                <EvidenceDetails pair={pair} sourceLabels={sourceLabels} questionCoverage={questionCoverage} />
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function comparePairs(
  left: CountyResearchPair,
  right: CountyResearchPair,
  key: PairSortKey,
) {
  if (key === "evidence") {
    return left.evidence.length - right.evidence.length;
  }
  if (key === "displayStatus") {
    const leftOrder = STATUS_ORDER.get(left.displayStatus) ?? 99;
    const rightOrder = STATUS_ORDER.get(right.displayStatus) ?? 99;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  }

  return left[key].localeCompare(right[key], "en-US", { sensitivity: "base" });
}

function isCountyResearchFile(value: unknown): value is CountyResearchFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CountyResearchFile>;
  return (
    typeof candidate.countyFips === "string" &&
    typeof candidate.countyName === "string" &&
    Boolean(candidate.summary) &&
    Boolean(candidate.pairResolution) &&
    Array.isArray(candidate.pairs)
  );
}

function CountyResearchView({ summary }: { summary: ResearchSummaryFile }) {
  const countyOptions = useMemo(
    () =>
      [...summary.counties]
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((county) => ({ value: county.countyFips, label: county.name })),
    [summary.counties],
  );
  const [initialDeepLink] = useState(() =>
    parseResearchDeepLink(typeof window === "undefined" ? "" : window.location.search),
  );
  const [selectedCountyFips, setSelectedCountyFips] = useState(() =>
    initialDeepLink.countyFips && countyOptions.some((option) => option.value === initialDeepLink.countyFips)
      ? initialDeepLink.countyFips
      : countyOptions[0]?.value ?? "",
  );
  const [countyData, setCountyData] = useState<CountyResearchFile | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState(initialDeepLink.speciesQuery ?? "");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState(() => {
    const requested = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("status");
    return requested === "all" || KNOWN_STATUSES.some(status => status === requested) ? requested! : initialDeepLink.speciesQuery ? "all" : "verified-present";
  });
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<PairSortKey>("commonName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedSpeciesIds, setExpandedSpeciesIds] = useState<Set<string>>(
    () => new Set(),
  );

  const sourceLabels = useMemo(
    () => new Map(summary.sources.map((source) => [source.id, source.label])),
    [summary.sources],
  );

  useEffect(() => {
    if (!selectedCountyFips) return;
    const controller = new AbortController();

    async function loadCounty() {
      setLoadState("loading");
      setLoadError(null);
      setCountyData(null);

      try {
        const [countyProjection, catalog] = await Promise.all([
          fetchResearchProjectionJson(
            `${encodeURIComponent(summary.stateCode)}/counties/${encodeURIComponent(selectedCountyFips)}.json`,
            { cache: "no-store", signal: controller.signal },
          ),
          loadRuntimeData<unknown>("catalog"),
        ]);

        if (controller.signal.aborted) return;
        const data: unknown = countyProjection;
        if (!isCountyResearchFile(data)) {
          throw new Error("County file has an invalid research data shape.");
        }
        if (data.countyFips !== selectedCountyFips) {
          throw new Error("County file does not match the selected county.");
        }
        if (data.stateCode !== summary.stateCode) {
          throw new Error("County file does not match the selected state.");
        }
        if (String(data.schemaVersion) !== String(summary.schemaVersion)) {
          throw new Error("County file schema does not match the state summary.");
        }
        if (data.asOf !== summary.asOf || JSON.stringify(data.scope) !== JSON.stringify(summary.scope)) {
          throw new Error("County file scope does not match the state summary.");
        }

        if (!Array.isArray(catalog)) {
          throw new Error("Species catalog has an invalid data shape.");
        }
        const catalogSpecies = catalog.filter(
          (entry): entry is ResearchCatalogSpecies =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as Partial<ResearchCatalogSpecies>).id === "string" &&
            typeof (entry as Partial<ResearchCatalogSpecies>).commonName === "string" &&
            typeof (entry as Partial<ResearchCatalogSpecies>).scientificName === "string" &&
            typeof (entry as Partial<ResearchCatalogSpecies>).category === "string",
        );
        if (catalogSpecies.length !== catalog.length) {
          throw new Error("Species catalog contains an invalid research entry.");
        }
        setCountyData({
          ...data,
          pairs: resolveSparseCountyPairs({
            catalogSpecies,
            county: data,
          }),
        });
        setLoadState("success");
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadError(
          error instanceof Error ? error.message : "County research data could not be loaded.",
        );
        setLoadState("error");
      }
    }

    void loadCounty();
    return () => controller.abort();
  }, [reloadKey, selectedCountyFips, summary.asOf, summary.schemaVersion, summary.scope, summary.stateCode]);

  useEffect(() => {
    setPage(1);
  }, [
    categoryFilter,
    deferredQuery,
    pageSize,
    selectedCountyFips,
    sortDirection,
    sortKey,
    statusFilter,
  ]);

  useEffect(() => {
    setExpandedSpeciesIds(new Set());
  }, [selectedCountyFips]);

  useEffect(() => {
    if (!selectedCountyFips || typeof window === "undefined") return;
    const href = buildResearchHref({
      stateCode: summary.stateCode,
      countyFips: selectedCountyFips,
      speciesQuery: query,
    });
    const url = new URL(href, window.location.origin);
    url.searchParams.set("status", statusFilter);
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }, [query, statusFilter, selectedCountyFips, summary.stateCode]);

  useEffect(() => {
    if (!countyData) return;
    const exactSpeciesId = query.trim().toLowerCase();
    if (!exactSpeciesId || !countyData.pairs.some((pair) => pair.speciesId === exactSpeciesId)) return;
    setExpandedSpeciesIds(new Set([exactSpeciesId]));
  }, [countyData, query]);

  const availableStatuses = useMemo(() => {
    if (!countyData) return [];
    return Array.from(new Set([...KNOWN_STATUSES, ...countyData.pairs.map((pair) => pair.displayStatus)])).sort(
      (left, right) => {
        const leftOrder = STATUS_ORDER.get(left) ?? 99;
        const rightOrder = STATUS_ORDER.get(right) ?? 99;
        return leftOrder - rightOrder || left.localeCompare(right);
      },
    );
  }, [countyData]);

  const availableCategories = useMemo(() => {
    if (!countyData) return [];
    return Array.from(new Set(countyData.pairs.map((pair) => pair.category))).sort();
  }, [countyData]);

  const filteredPairs = useMemo(() => {
    if (!countyData) return [];
    const normalizedQuery = deferredQuery.trim().toLowerCase();

    const matches = countyData.pairs.filter((pair) => {
      if (statusFilter !== "all" && pair.displayStatus !== statusFilter) return false;
      if (categoryFilter !== "all" && pair.category !== categoryFilter) return false;
      if (!normalizedQuery) return true;

      return [pair.commonName, pair.scientificName, pair.speciesId]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });

    return matches.sort((left, right) => {
      const comparison = comparePairs(left, right, sortKey);
      if (comparison !== 0) {
        return sortDirection === "asc" ? comparison : -comparison;
      }
      return left.commonName.localeCompare(right.commonName);
    });
  }, [
    categoryFilter,
    countyData,
    deferredQuery,
    sortDirection,
    sortKey,
    statusFilter,
  ]);


  const progress = countyData ? countyResearchProgress(countyData.summary) : null;
  const totalPages = Math.max(1, Math.ceil(filteredPairs.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pagePairs = filteredPairs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const hasActiveFilters = query.length > 0 || statusFilter !== "all" || categoryFilter !== "all";

  function handleSort(key: PairSortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDirection(key === "evidence" ? "desc" : "asc");
  }

  function toggleEvidence(speciesId: string) {
    setExpandedSpeciesIds((current) => {
      const next = new Set(current);
      if (next.has(speciesId)) next.delete(speciesId);
      else next.add(speciesId);
      return next;
    });
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("all");
    setCategoryFilter("all");
  }

  return (
    <section aria-labelledby="county-research-heading">
      <div className="research-county-choice">
        <div>
          <SelectField
            label="Choose a county or equivalent"
            value={selectedCountyFips}
            options={countyOptions}
            onChange={setSelectedCountyFips}
            disabled={countyOptions.length === 0}
          />
        </div>
        <p>Choose a finding, then open a species to read the sources. Historical records do not necessarily describe today.</p>
      </div>

      {loadState === "loading" || loadState === "idle" ? (
        <div className="flex min-h-72 items-center justify-center border-b border-[var(--border)] px-4 py-12 text-sm text-[var(--muted)]">
          <LoaderCircle aria-hidden="true" className="mr-2 animate-spin" size={18} />
          Loading county research data
        </div>
      ) : null}

      {loadState === "error" ? (
        <div className="flex min-h-72 flex-col items-center justify-center border-b border-[var(--border)] px-4 py-12 text-center">
          <AlertCircle aria-hidden="true" className="text-[var(--danger)]" size={24} />
          <h2 className="mt-3 font-semibold text-[var(--foreground)]">
            County data unavailable
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--muted)]">
            We could not load this county&apos;s records. Check your connection and try again, or choose another county.
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]"
          >
            <RefreshCw aria-hidden="true" size={15} />
            Retry
          </button>
        </div>
      ) : null}

      {countyData && loadState === "success" ? (
        <>
          <div className="grid gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.2fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)_40px]">
            <SearchField
              label="Find a species"
              value={query}
              placeholder="Common name, scientific name, or ID"
              onChange={setQuery}
            />
            <SelectField
              label="Finding"
              value={statusFilter}
              options={[
                { value: "all", label: "All statuses" },
                ...availableStatuses.map((status) => ({
                  value: status,
                  label: status === "verified-present" ? "Recorded here" : status === "researched-unresolved" ? "More evidence needed" : status === "not-researched" ? "Not researched yet" : formatLabel(status),
                })),
              ]}
              onChange={setStatusFilter}
            />
            <SelectField
              label="Category"
              value={categoryFilter}
              options={[
                { value: "all", label: "All categories" },
                ...availableCategories.map((category) => ({
                  value: category,
                  label: formatLabel(category),
                })),
              ]}
              onChange={setCategoryFilter}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-35"
                aria-label="Clear county filters"
                title="Clear filters"
              >
                <X aria-hidden="true" size={17} />
              </button>
            </div>
          </div>

          <details className="county-research-detail border-b border-[var(--border)] py-2">
            <summary>County findings and research progress</summary>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="county-research-heading"
                  className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--foreground)]"
                >
                  {countyData.countyName}
                </h2>
                <details className="research-record-details"><summary>About these records</summary><p>County identifier: {countyData.countyFips}. Compiled {formatTimestamp(countyData.generatedAt)}. Check each source for the date of the finding.</p></details>
              </div>
            </div>

            <div className="county-finding-overview" aria-label="County research overview">
              {[
                { status: "verified-present", label: "Recorded here", count: countyData.summary.verifiedPresent, note: "Includes historical records. Check the dates." },
                { status: "verified-absent", label: "Official absence finding", count: countyData.summary.verifiedAbsent, note: "Explicit evidence for a stated place and period." },
                { status: "not-detected", label: "Survey found no detections", count: countyData.summary.notDetected, note: "No presence or absence determination; not proof of absence." },
                { status: "researched-unresolved", label: "More evidence needed", count: countyData.summary.researchedUnresolved, note: "Sources checked; no determination yet." },
                { status: "not-researched", label: "Not researched yet", count: countyData.summary.notResearched, note: "Research has not started for these species." },
              ].map(item => <button key={item.status} type="button" aria-pressed={statusFilter === item.status} onClick={() => setStatusFilter(item.status)}><span>{item.label}</span><strong>{formatNumber(item.count)}</strong><small>{item.note}</small></button>)}
            </div>
            {(countyData.summary.blockedPairs > 0 || countyData.summary.notApplicablePairs > 0) && <p className="county-scope-note">Also in the full catalog: {formatNumber(countyData.summary.blockedPairs)} species awaiting a scope decision and {formatNumber(countyData.summary.notApplicablePairs)} explicitly outside this state’s scope.</p>}
            {progress && <div className="county-progress">
              <div><h3>Research started for {formatNumber(progress.started)} of {formatNumber(progress.total)} species</h3><span>{progress.percent.toFixed(1)}%</span></div>
              <progress aria-label="Species with a source check or reviewed finding" value={progress.started} max={progress.total || 1} />
              <p>Each has at least one source check or reviewed finding. Research may still be incomplete. Use the finding filter to see species and evidence.</p>
            </div>}

              <p>The overview assigns each species one finding, with recorded presence taking precedence. A species can also have a survey non-detection or a later official absence finding. Those separate records remain visible in its evidence; they do not erase occurrence history.</p>
              <p className="text-sm font-medium tabular-nums text-[var(--foreground)]">
                {formatPercent(countyData.summary.researchCoveragePercent)} of county-species questions have a source check
              </p>
            {countyData.questionAssessment ? (
              <div className="mt-4 rounded-lg border border-[var(--border)] p-3 text-sm">
                <p className="font-medium">Research questions: {formatNumber(countyData.questionAssessment.assessedQuestionCount)} of {formatNumber(countyData.questionAssessment.requiredQuestionCount)} assessed</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  {formatNumber(countyData.questionAssessment.fullyAssessedPairCount)} of {formatNumber(countyData.questionAssessment.pairDenominator)} county-species pairs have every required question assessed. Assessment cutoff: {countyData.questionAssessment.assessmentAsOf}.
                  {" "}Occurrence history, wild observations, establishment and official absence or eradication are assessed separately.
                </p>
              </div>
            ) : null}
            <dl className="mt-4 grid grid-cols-2 divide-x divide-y divide-[var(--border)] border-y border-[var(--border)] sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Verified present" value={formatNumber(countyData.summary.verifiedPresent)} />
              <Metric label="Verified absent" value={formatNumber(countyData.summary.verifiedAbsent)} />
              <Metric label="Not detected" value={formatNumber(countyData.summary.notDetected)} />
              <Metric label="Unresolved" value={formatNumber(countyData.summary.researchedUnresolved)} />
              <Metric label="Not researched" value={formatNumber(countyData.summary.notResearched)} />
              <Metric label="Total pairs" value={formatNumber(countyData.pairs.length)} />
            </dl>
          </details>

          <div className="flex gap-5 overflow-x-auto border-b border-[var(--border)] py-3 text-xs whitespace-nowrap">
            <span className="font-semibold tabular-nums text-[var(--foreground)]">
              Matching {formatNumber(filteredPairs.length)}
            </span>
            <span className="text-[var(--muted)]">{statusFilter === "all" ? "All research outcomes" : statusFilter === "verified-present" ? "Recorded here, including historical findings" : formatLabel(statusFilter)}</span>
          </div>

          <div className="py-5">
            {pagePairs.length ? (
              <CountyPairTable
                pairs={pagePairs}
                questionCoverage={countyData.questionAssessment}
                sourceLabels={sourceLabels}
                expandedSpeciesIds={expandedSpeciesIds}
                onToggleEvidence={toggleEvidence}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : (
              <div className="border-y border-[var(--border)] px-4 py-12 text-center text-sm text-[var(--muted)]">
                <p>No records match these filters. This does not establish that a species is absent.</p>
                <button type="button" className="text-link mt-3" onClick={clearFilters}>See all county research</button>
              </div>
            )}
            <Pagination
              page={currentPage}
              pageSize={pageSize}
              totalItems={filteredPairs.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        </>
      ) : null}
    </section>
  );
}

function SourceOperationsView({ summary }: { summary: ResearchSummaryFile }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState("all");
  const statuses = useMemo(
    () => Array.from(new Set(summary.sources.map((source) => source.status))).sort(),
    [summary.sources],
  );
  const sources = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return summary.sources
      .filter((source) => {
        if (statusFilter !== "all" && source.status !== statusFilter) return false;
        if (!normalizedQuery) return true;
        return [source.label, source.authority, source.id]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) =>
        String(left.tier).localeCompare(String(right.tier), "en-US", { numeric: true }) ||
        left.label.localeCompare(right.label),
      );
  }, [deferredQuery, statusFilter, summary.sources]);

  return (
    <section className="py-5" aria-labelledby="source-operations-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2
            id="source-operations-heading"
            className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--foreground)]"
          >
            Research sources
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatNumber(sources.length)} of {formatNumber(summary.sources.length)} sources visible
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">
            All sources tracked by isitusa. This list covers the atlas as a whole; a listed source
            may not cover every species or county in {summary.stateName}. Its status does not mean
            that all required checks are complete. Open county records to see the evidence used.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-2">
        <SearchField
          label="Search"
          value={query}
          placeholder="Source, authority, or ID"
          onChange={setQuery}
        />
        <SelectField
          label="Status"
          value={statusFilter}
          options={[
            { value: "all", label: "All statuses" },
            ...statuses.map((status) => ({ value: status, label: formatLabel(status) })),
          ]}
          onChange={setStatusFilter}
        />
      </div>

      <div className="mt-5 hidden overflow-x-auto rounded-md border border-[var(--border)] md:block">
        <table className="w-full min-w-[880px] border-collapse text-left text-sm">
          <thead className="bg-[var(--surface)] text-xs text-[var(--muted)]">
            <tr className="border-b border-[var(--border)]">
              <th className="px-4 py-3 font-semibold" scope="col">Source</th>
              <th className="px-4 py-3 font-semibold" scope="col">Source type</th>
              <th className="px-4 py-3 font-semibold" scope="col">Status</th>
              <th className="px-4 py-3 font-semibold" scope="col">Latest source check</th>
              <th className="px-4 py-3 text-right font-semibold" scope="col">County–species records</th>
              <th className="px-4 py-3 text-right font-semibold" scope="col">Species checked</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] bg-[var(--surface-strong)]">
            {sources.map((source) => (
              <tr key={source.id} className="hover:bg-[var(--surface)]">
                <td className="px-4 py-3">
                  <p className="font-medium text-[var(--foreground)]">{source.label}</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    {source.authority} | {source.id}
                  </p>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">{formatLabel(String(source.tier))}</td>
                <td className="px-4 py-3"><StatusBadge status={source.status} /></td>
                <td className="px-4 py-3 text-xs tabular-nums text-[var(--muted)]">
                  {source.lastRunAt ? formatTimestamp(source.lastRunAt) : "No run recorded"}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--foreground)]">
                  {formatNumber(source.evidencePairCount)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-[var(--foreground)]">
                  {formatNumber(source.screenedSpeciesCount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)] bg-[var(--surface-strong)] md:hidden">
        {sources.map((source) => (
          <article key={source.id} className="px-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-medium text-[var(--foreground)]">{source.label}</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{source.authority}</p>
              </div>
              <StatusBadge status={source.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div><dt className="text-[var(--muted)]">Source type</dt><dd className="mt-0.5 text-[var(--foreground)]">{formatLabel(String(source.tier))}</dd></div>
              <div><dt className="text-[var(--muted)]">Latest source check</dt><dd className="mt-0.5 text-[var(--foreground)]">{source.lastRunAt ? formatTimestamp(source.lastRunAt) : "No run recorded"}</dd></div>
              <div><dt className="text-[var(--muted)]">County–species records</dt><dd className="mt-0.5 tabular-nums text-[var(--foreground)]">{formatNumber(source.evidencePairCount)}</dd></div>
              <div><dt className="text-[var(--muted)]">Species checked</dt><dd className="mt-0.5 tabular-nums text-[var(--foreground)]">{formatNumber(source.screenedSpeciesCount)}</dd></div>
            </dl>
          </article>
        ))}
      </div>

      {sources.length === 0 ? (
        <div className="border-b border-[var(--border)] px-4 py-12 text-center text-sm text-[var(--muted)]">
          No sources match the current filters.
        </div>
      ) : null}
    </section>
  );
}

function QueueView({ summary }: { summary: ResearchSummaryFile }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const sourceLabels = useMemo(
    () => new Map(summary.sources.map((source) => [source.id, source.label])),
    [summary.sources],
  );
  const categories = useMemo(
    () => Array.from(new Set(summary.queue.map((item) => item.category))).sort(),
    [summary.queue],
  );
  const priorityRanks = useMemo(() => new Map(summary.queue
    .filter(item => item.notResearchedCountyCount || item.researchedUnresolvedCountyCount || item.missingProtocolSourceIds.length)
    .slice().sort((left, right) => right.priorityScore - left.priorityScore)
    .map((item, index) => [item.speciesId, index + 1])), [summary.queue]);
  const queue = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return summary.queue
      .filter((item) => {
        if (!item.notResearchedCountyCount && !item.researchedUnresolvedCountyCount && !item.missingProtocolSourceIds.length) return false;
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        if (!normalizedQuery) return true;
        return [item.commonName, item.scientificName, item.speciesId]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort(
        (left, right) =>
          right.priorityScore - left.priorityScore,
      );
  }, [categoryFilter, deferredQuery, summary.queue]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, deferredQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(queue.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = queue.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function sourceNames(sourceIds: string[]) {
    if (!sourceIds.length) return "No next source is specified in this update. Further evidence review is needed.";
    return sourceIds.map((sourceId) => sourceLabels.get(sourceId) ?? sourceId).join(", ");
  }

  return (
    <section className="py-5" aria-labelledby="research-queue-heading">
      <div>
        <h2
          id="research-queue-heading"
          className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--foreground)]"
        >
          Next research priorities
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          The published research queue for {summary.stateName}, ordered by remaining county checks and missing source reviews. This is a priority list, not a live work schedule. {formatNumber(queue.length)} species match your filters.
        </p>
      </div>

      <div className="mt-5 grid gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-2">
        <SearchField
          label="Search"
          value={query}
          placeholder="Common name, scientific name, or ID"
          onChange={setQuery}
        />
        <SelectField
          label="Category"
          value={categoryFilter}
          options={[
            { value: "all", label: "All categories" },
            ...categories.map((category) => ({
              value: category,
              label: formatLabel(category),
            })),
          ]}
          onChange={setCategoryFilter}
        />
      </div>

      {pageItems.length ? <ol className="research-priority-list" start={(currentPage - 1) * pageSize + 1}>
        {pageItems.map(item => <li key={item.speciesId} value={priorityRanks.get(item.speciesId)}>
          <span className="queue-rank" aria-hidden="true">{priorityRanks.get(item.speciesId)}</span>
          <div className="queue-species"><h3>{item.commonName}</h3><p><i>{item.scientificName}</i></p><small>{formatLabel(item.category)}</small></div>
          <div className="queue-reason"><h4>Why it is queued</h4><p><strong>{formatNumber(item.notResearchedCountyCount)}</strong> counties not researched yet<br /><strong>{formatNumber(item.researchedUnresolvedCountyCount)}</strong> counties need more evidence</p></div>
          <div className="queue-next"><h4>{item.missingProtocolSourceIds.length ? "Sources still to check" : "Further review needed"}</h4><p>{sourceNames(item.missingProtocolSourceIds)}</p><details><summary>How this is ranked</summary><p>Priority score: {item.priorityScore.toLocaleString("en-US", { maximumFractionDigits: 2 })}. Unstarted county checks carry the most weight, followed by unresolved findings and missing source checks. Ties keep their published order.</p></details></div>
        </li>)}
      </ol> : <div className="research-queue-empty"><h3>No remaining checks match this view.</h3><p>Try another category or search. An empty queue is not proof that a species is absent.</p></div>}

      <Pagination
        page={currentPage}
        pageSize={pageSize}
        totalItems={queue.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </section>
  );
}

function isResearchSummaryFile(
  value: unknown,
  expectedStateCode: string,
): value is ResearchSummaryFile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ResearchSummaryFile>;
  return (
    candidate.stateCode === expectedStateCode &&
    typeof candidate.asOf === "string" &&
    Boolean(candidate.scope) &&
    Boolean(candidate.summary) &&
    Array.isArray(candidate.counties) &&
    Array.isArray(candidate.sources) &&
    Array.isArray(candidate.queue)
  );
}

function ResearchHeader({ availableStates, selectedStateCode, onStateChange, summary }: {
  availableStates: ResearchStateOption[];
  selectedStateCode: string;
  onStateChange: (stateCode: string) => void;
  summary?: ResearchSummaryFile;
}) {
  return (
    <header className="reading-hero research-heading">
      <div>
        <h1>Explore the evidence.</h1>
        <p>Find a species in your county, read its source records, and see what we still need to learn.</p>

      </div>
      <div className="research-state-control">
        <SelectField stateFlags label="Choose a state" value={selectedStateCode}
          options={availableStates.map(entry => ({ value: entry.stateCode, label: entry.stateName }))}
          onChange={onStateChange} />
        {summary && <><p>Research through {formatDate(summary.asOf)}</p>
          <details className="research-publication-details"><summary>About this update</summary>
            <p>Observation dates appear with each source. An update can include older records.</p>
            <p>Catalog snapshot: {formatDate(summary.sourceSnapshotDate)}.</p>
            <p>Generated {formatTimestamp(summary.generatedAt)}.</p>
          </details></>}
      </div>
    </header>
  );
}

function ResearchControlCenterContent({
  summary,
  availableStates,
  onStateChange,
}: {
  summary: ResearchSummaryFile;
  availableStates: ResearchStateOption[];
  onStateChange: (stateCode: string) => void;
}) {
  const [activeView, setActiveView] = useState<ControlCenterView>("county");
  const stateMetrics = [
    ["Catalog species", formatNumber(summary.summary.speciesCount)],
    ["County equivalents", formatNumber(summary.summary.countyCount)],
    ["Full denominator", formatNumber(summary.summary.totalPairs)],
    ["Bounded species", formatNumber(summary.scope.boundedAcquisitionSpeciesCount)],
    ["Unknown decisions", formatNumber(summary.scope.unknownSpeciesCount)],
    ["Verified present", formatNumber(summary.summary.verifiedPresent)],
    ["Verified absent", formatNumber(summary.summary.verifiedAbsent)],
    ["Not detected", formatNumber(summary.summary.notDetected)],
    ["Unresolved", formatNumber(summary.summary.researchedUnresolved)],
    ["Not researched", formatNumber(summary.summary.notResearched)],
    ["Source-screen coverage", formatPercent(summary.summary.researchCoveragePercent)],
    ["Bounded source-screen coverage", formatPercent(summary.summary.boundedAcquisition.researchCoveragePercent)],
    ["Conflicts", formatNumber(summary.summary.conflictCount)],
  ];

  return (
    <main id="main-content" className="reading-page research-page">
      <ResearchHeader availableStates={availableStates} selectedStateCode={summary.stateCode} onStateChange={onStateChange} summary={summary} />

      <div id="research-explorer" className="research-tabs">
        <div className="flex min-w-max gap-1" role="tablist" aria-label="Research views">
          {VIEW_OPTIONS.map((view) => {
            const Icon = view.icon;
            const isActive = activeView === view.id;
            return (
              <button
                key={view.id}
                id={`research-tab-${view.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                aria-controls={`research-panel-${view.id}`}
                onClick={() => setActiveView(view.id)}
                onKeyDown={(event) => {
                  const keys = ["ArrowRight", "ArrowLeft", "Home", "End"];
                  if (!keys.includes(event.key)) return;
                  event.preventDefault();
                  const index = VIEW_OPTIONS.findIndex(option => option.id === view.id);
                  const next = event.key === "Home" ? 0 : event.key === "End" ? VIEW_OPTIONS.length - 1
                    : (index + (event.key === "ArrowRight" ? 1 : -1) + VIEW_OPTIONS.length) % VIEW_OPTIONS.length;
                  setActiveView(VIEW_OPTIONS[next].id);
                  event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
                }}
                className={`inline-flex h-10 items-center gap-2 border-b-2 px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
                  isActive
                    ? "border-[var(--accent)] text-[var(--foreground)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <Icon aria-hidden="true" size={16} />
                {view.label}
              </button>
            );
          })}
        </div>
      </div>

      {VIEW_OPTIONS.map((view) => (
        <div key={view.id} id={`research-panel-${view.id}`} role="tabpanel"
          tabIndex={0} aria-labelledby={`research-tab-${view.id}`} hidden={activeView !== view.id}>
          {activeView === view.id && view.id === "county" ? <CountyResearchView summary={summary} /> : null}
          {activeView === view.id && view.id === "sources" ? <SourceOperationsView summary={summary} /> : null}
          {activeView === view.id && view.id === "queue" ? <QueueView summary={summary} /> : null}
        </div>
      ))}
      <details className="research-overview" aria-label="Published research coverage">
        <summary className="research-progress-summary"><span><strong>Research progress in {summary.stateName}</strong><small>Source checks, reviewed findings, and open questions.</small></span><span className="research-progress-preview"><ChevronDown size={18} aria-hidden="true" /></span></summary>
        <p className="mt-3 text-[var(--muted)]">{formatNumber(summary.summary.speciesCount)} catalog species, across {formatNumber(summary.summary.countyCount)} counties and county equivalents. Progress is measured for each species in each county.</p>
        <div className="research-progress">
          <div><label htmlFor="source-progress">Source checks <strong>{formatPercent(summary.summary.researchCoveragePercent)}</strong></label><progress id="source-progress" max={100} value={summary.summary.researchCoveragePercent} /><p>A source has been checked or a finding recorded. More work may still be needed.</p></div>
          <div><label htmlFor="determination-progress">Reviewed findings <strong>{formatPercent(summary.summary.determinationCoveragePercent)}</strong></label><progress id="determination-progress" max={100} value={summary.summary.determinationCoveragePercent} /><p>{formatNumber(summary.summary.verifiedPresent + summary.summary.verifiedAbsent)} of {formatNumber(summary.summary.totalPairs)} county-species questions have a reviewed presence or absence finding.</p></div>
        </div>
        <details className="research-accounting research-counts"><summary>See the research counts</summary>
        <dl className="research-status-strip">
          {[["Recorded present", summary.summary.verifiedPresent], ["Absence determinations", summary.summary.verifiedAbsent], ["Survey non-detections", summary.summary.notDetected], ["Research unresolved", summary.summary.researchedUnresolved], ["Not researched", summary.summary.notResearched]].map(([label, value]) => <div key={String(label)}><dt>{label}</dt><dd>{formatNumber(Number(value))}</dd></div>)}
        </dl>
        <p className="county-note">Records can be historical. A survey that found nothing is different from an agency finding of absence. Missing information remains an open question.</p>
        </details>
      </details>
      <details className="research-accounting"><summary>How we measure progress</summary>
      <div
        className={`border-b px-4 py-3 text-sm leading-6 ${
          summary.scope.certificationScope === "bounded-pilot"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
        }`}
      >
        {summary.scope.certificationScope === "bounded-pilot" ? (
          <p>
            <strong>This state is still being researched.</strong> Progress is measured against all {formatNumber(summary.scope.catalogSpeciesCount)} catalog species in every county: {formatNumber(summary.summary.totalPairs)} species-and-county combinations. The current source work covers a narrower group of {formatNumber(summary.scope.boundedAcquisitionSpeciesCount)} species. Eligible combinations without research remain marked as not researched. This is not a certified state result.
          </p>
        ) : (
          <p>
            <strong className="text-[var(--foreground)]">What the state totals include.</strong> Reviewed county records establish that {formatNumber(summary.scope.derivedApplicableSpeciesCount)} catalog species are relevant to this state. Of {formatNumber(summary.scope.catalogSpeciesCount)} species, {formatNumber(summary.stateSpeciesResearch.fullyAccountedSpeciesCount)} have completed research accounting or a documented blocker, {formatNumber(summary.stateSpeciesResearch.partiallyAccountedSpeciesCount)} have some research, and {formatNumber(summary.stateSpeciesResearch.untouchedSpeciesCount)} have none yet. Research can finish without resolving a species&apos; status. That is different from never checking, and it does not by itself certify the state&apos;s research.
          </p>
        )}
      </div>

      </details>
      <details className="research-accounting"><summary>Detailed research counts</summary>
      <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] border-b border-[var(--border)] sm:grid-cols-3 lg:grid-cols-6">
        {stateMetrics.map(([label, value]) => (
          <Metric key={label} label={label} value={value} />
        ))}
      </dl>

      </details>
    </main>
  );
}

export function ResearchControlCenter({
  availableStates,
}: {
  availableStates: ResearchStateOption[];
}) {
  const allowedStateCodes = useMemo(
    () => new Set(availableStates.map((entry) => entry.stateCode)),
    [availableStates],
  );
  const defaultStateCode = availableStates[0]?.stateCode ?? "AL";
  const [selectedStateCode, setSelectedStateCode] = useState(defaultStateCode);
  const [deepLinkReady, setDeepLinkReady] = useState(false);
  const [summary, setSummary] = useState<ResearchSummaryFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const requested = parseResearchDeepLink(window.location.search).stateCode;
    if (requested && allowedStateCodes.has(requested)) {
      setSelectedStateCode(requested);
    }
    setDeepLinkReady(true);
  }, [allowedStateCodes]);

  function handleStateChange(stateCode: string) {
    if (!allowedStateCodes.has(stateCode)) return;
    setSelectedStateCode(stateCode);
    const current = parseResearchDeepLink(window.location.search);
    window.history.replaceState(null, "", buildResearchHref({
      stateCode,
      speciesQuery: current.speciesQuery,
    }));
  }

  useEffect(() => {
    if (!deepLinkReady) return;
    const controller = new AbortController();

    async function loadSummary() {
      setSummary(null);
      setLoadError(null);

      try {
        const data: unknown = await fetchResearchProjectionJson(
          `${encodeURIComponent(selectedStateCode)}/summary.json`,
          { cache: "no-store", signal: controller.signal },
        );
        if (!isResearchSummaryFile(data, selectedStateCode)) {
          throw new Error("Research summary has an invalid data shape.");
        }
        setSummary(data);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadError(
          error instanceof Error ? error.message : "Research summary could not be loaded.",
        );
      }
    }

    void loadSummary();
    return () => controller.abort();
  }, [deepLinkReady, reloadKey, selectedStateCode]);

  if (summary) {
    return (
      <ResearchControlCenterContent
        key={summary.stateCode}
        summary={summary}
        availableStates={availableStates}
        onStateChange={handleStateChange}
      />
    );
  }

  return (
    <main id="main-content" className="reading-page research-page">
      <ResearchHeader availableStates={availableStates} selectedStateCode={selectedStateCode} onStateChange={handleStateChange} />
      {loadError ? (
        <div className="research-state-message" role="alert">
          <AlertCircle aria-hidden="true" size={26} />
          <h2>We could not load these records.</h2>
          <p>Check your connection and try again, or choose another state. Missing results here do not mean a species is absent.</p>
          <button type="button" onClick={() => setReloadKey(current => current + 1)} className="primary-button inline-flex items-center gap-2"><RefreshCw size={16} aria-hidden="true" />Try again</button>
        </div>
      ) : (
        <div className="research-state-message" role="status">
          <p className="flex items-center gap-2"><LoaderCircle aria-hidden="true" className="animate-spin" size={18} />Loading research for {availableStates.find(state => state.stateCode === selectedStateCode)?.stateName ?? selectedStateCode}...</p>
          <div className="directory-skeleton" aria-hidden="true"><span /><span /></div>
        </div>
      )}
    </main>
  );
}
