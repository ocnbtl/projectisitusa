"use client";

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
  LockKeyhole,
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
  resolvedStateSpeciesDecisionCount: number;
  boundedAcquisitionSpeciesCount: number;
  defaultApplicability: "unknown";
  fullCatalogApplicabilityComplete: boolean;
  undeterminedSpeciesPolicy: "included-as-unknown";
  compatibilityPublication: boolean;
  protocolModel:
    | "explicit-source-species-legacy-migration"
    | "explicit-source-species-active";
}

export interface ResearchSummaryFile {
  schemaVersion: string | number;
  stateCode: string;
  stateName: string;
  asOf: string;
  generatedAt: string;
  sourceSnapshotDate: string;
  scope: ResearchProjectionScope;
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
  { id: "county", label: "County research", icon: MapPinned },
  { id: "sources", label: "Source operations", icon: Database },
  { id: "queue", label: "Research queue", icon: ClipboardList },
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

function formatLabel(value: string) {
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

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = parseDate(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

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

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const style =
    STATUS_STYLES[normalized] ??
    "border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)]";

  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full border px-2 py-1 text-[11px] font-semibold leading-none ${style}`}
    >
      <span className="truncate">{formatLabel(status)}</span>
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <dt className="text-[11px] font-medium uppercase text-[var(--muted)]">
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
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">
        {label}
      </span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="h-10 w-full appearance-none rounded-md border border-[var(--border)] bg-[var(--background)] px-3 pr-9 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
          size={16}
        />
      </span>
    </label>
  );
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
        <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
          Rows
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="h-8 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-xs text-[var(--foreground)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--ring)]"
          >
            {[25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
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

function EvidenceDetails({
  pair,
  sourceLabels,
}: {
  pair: CountyResearchPair;
  sourceLabels: Map<string, string>;
}) {
  return (
    <div className="bg-[var(--background)] px-4 py-4 sm:px-6">
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
                    <span className="min-w-0 break-all">
                      Evidence ID: {evidence.evidenceId}
                    </span>
                  </div>
                  {evidence.caveat ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      <span className="font-medium text-[var(--foreground)]">Caveat:</span>{" "}
                      {evidence.caveat}
                    </p>
                  ) : null}
                  {lineage ? (
                    <p className="mt-2 break-words text-xs leading-5 text-[var(--muted)]">
                      <span className="font-medium text-[var(--foreground)]">Lineage:</span>{" "}
                      {lineage}
                    </p>
                  ) : null}
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
  expandedSpeciesIds,
  onToggleEvidence,
  sortKey,
  sortDirection,
  onSort,
}: {
  pairs: CountyResearchPair[];
  sourceLabels: Map<string, string>;
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
                ["Pair status", "displayStatus"],
                ["Research", "researchStatus"],
                ["Evidence", "evidence"],
                ["Freshness", "freshnessStatus"],
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
                          <p className="truncate font-medium text-[var(--foreground)]" title={pair.commonName}>
                            {pair.commonName}
                          </p>
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
                      <StatusBadge status={pair.displayStatus} />
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
                        <EvidenceDetails pair={pair} sourceLabels={sourceLabels} />
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
                    <StatusBadge status={pair.displayStatus} />
                    <span className="text-xs text-[var(--muted)]">
                      {formatLabel(pair.category)}
                    </span>
                    <span className="text-xs tabular-nums text-[var(--muted)]">
                      {formatNumber(pair.evidence.length)} evidence
                    </span>
                  </span>
                </span>
              </button>
              {isExpanded ? (
                <EvidenceDetails pair={pair} sourceLabels={sourceLabels} />
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
  const [selectedCountyFips, setSelectedCountyFips] = useState(
    () => countyOptions[0]?.value ?? "",
  );
  const [countyData, setCountyData] = useState<CountyResearchFile | null>(null);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState("all");
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
        const [countyResponse, catalogResponse] = await Promise.all([
          fetch(
            `/generated/research/${encodeURIComponent(summary.stateCode)}/counties/${encodeURIComponent(selectedCountyFips)}.json`,
            { cache: "no-store", signal: controller.signal },
          ),
          fetch("/generated/species.json", {
            cache: "no-store",
            signal: controller.signal,
          }),
        ]);
        if (!countyResponse.ok) {
          throw new Error(`County file request failed with status ${countyResponse.status}.`);
        }
        if (!catalogResponse.ok) {
          throw new Error(`Species catalog request failed with status ${catalogResponse.status}.`);
        }

        const data: unknown = await countyResponse.json();
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

        const catalog: unknown = await catalogResponse.json();
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

  const availableStatuses = useMemo(() => {
    if (!countyData) return [];
    return Array.from(new Set(countyData.pairs.map((pair) => pair.displayStatus))).sort(
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

  const filteredStatusCounts = useMemo(() => {
    const counts = new Map<string, number>(KNOWN_STATUSES.map((status) => [status, 0]));
    for (const pair of filteredPairs) {
      counts.set(pair.displayStatus, (counts.get(pair.displayStatus) ?? 0) + 1);
    }
    return counts;
  }, [filteredPairs]);

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
      <div className="border-b border-[var(--border)] py-5">
        <div className="max-w-sm">
          <SelectField
            label="County or equivalent"
            value={selectedCountyFips}
            options={countyOptions}
            onChange={setSelectedCountyFips}
            disabled={countyOptions.length === 0}
          />
        </div>
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
            {loadError}
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
          <div className="py-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2
                  id="county-research-heading"
                  className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--foreground)]"
                >
                  {countyData.countyName}
                </h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  FIPS {countyData.countyFips} | Generated{" "}
                  {formatTimestamp(countyData.generatedAt)}
                </p>
              </div>
              <p className="text-sm font-medium tabular-nums text-[var(--foreground)]">
                {formatPercent(countyData.summary.researchCoveragePercent)} full-catalog research coverage
              </p>
            </div>

            <dl className="mt-4 grid grid-cols-2 divide-x divide-y divide-[var(--border)] border-y border-[var(--border)] sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="Verified present" value={formatNumber(countyData.summary.verifiedPresent)} />
              <Metric label="Verified absent" value={formatNumber(countyData.summary.verifiedAbsent)} />
              <Metric label="Not detected" value={formatNumber(countyData.summary.notDetected)} />
              <Metric label="Unresolved" value={formatNumber(countyData.summary.researchedUnresolved)} />
              <Metric label="Not researched" value={formatNumber(countyData.summary.notResearched)} />
              <Metric label="Total pairs" value={formatNumber(countyData.pairs.length)} />
            </dl>
          </div>

          <div className="grid gap-3 border-y border-[var(--border)] py-4 sm:grid-cols-2 lg:grid-cols-[minmax(240px,1.2fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)_40px]">
            <SearchField
              label="Search"
              value={query}
              placeholder="Common name, scientific name, or ID"
              onChange={setQuery}
            />
            <SelectField
              label="Status"
              value={statusFilter}
              options={[
                { value: "all", label: "All statuses" },
                ...availableStatuses.map((status) => ({
                  value: status,
                  label: formatLabel(status),
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

          <div className="flex gap-5 overflow-x-auto border-b border-[var(--border)] py-3 text-xs whitespace-nowrap">
            <span className="font-semibold tabular-nums text-[var(--foreground)]">
              Matching {formatNumber(filteredPairs.length)}
            </span>
            {KNOWN_STATUSES.map((status) => (
              <span key={status} className="tabular-nums text-[var(--muted)]">
                {formatLabel(status)} {formatNumber(filteredStatusCounts.get(status) ?? 0)}
              </span>
            ))}
          </div>

          <div className="py-5">
            {pagePairs.length ? (
              <CountyPairTable
                pairs={pagePairs}
                sourceLabels={sourceLabels}
                expandedSpeciesIds={expandedSpeciesIds}
                onToggleEvidence={toggleEvidence}
                sortKey={sortKey}
                sortDirection={sortDirection}
                onSort={handleSort}
              />
            ) : (
              <div className="border-y border-[var(--border)] px-4 py-12 text-center text-sm text-[var(--muted)]">
                No county pairs match the current filters.
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
            Source operations
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {formatNumber(sources.length)} of {formatNumber(summary.sources.length)} sources visible
          </p>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-[var(--muted)]">
            These rows describe the global source registry. Operational status does not establish
            source-species applicability or protocol completion for {summary.stateName}.
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
              <th className="px-4 py-3 font-semibold" scope="col">Tier</th>
              <th className="px-4 py-3 font-semibold" scope="col">Status</th>
              <th className="px-4 py-3 font-semibold" scope="col">Last run</th>
              <th className="px-4 py-3 text-right font-semibold" scope="col">Evidence pairs</th>
              <th className="px-4 py-3 text-right font-semibold" scope="col">Screened species</th>
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
                  {formatTimestamp(source.lastRunAt)}
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
              <div><dt className="text-[var(--muted)]">Tier</dt><dd className="mt-0.5 text-[var(--foreground)]">{formatLabel(String(source.tier))}</dd></div>
              <div><dt className="text-[var(--muted)]">Last run</dt><dd className="mt-0.5 text-[var(--foreground)]">{formatTimestamp(source.lastRunAt)}</dd></div>
              <div><dt className="text-[var(--muted)]">Evidence pairs</dt><dd className="mt-0.5 tabular-nums text-[var(--foreground)]">{formatNumber(source.evidencePairCount)}</dd></div>
              <div><dt className="text-[var(--muted)]">Screened species</dt><dd className="mt-0.5 tabular-nums text-[var(--foreground)]">{formatNumber(source.screenedSpeciesCount)}</dd></div>
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
  const queue = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    return summary.queue
      .filter((item) => {
        if (categoryFilter !== "all" && item.category !== categoryFilter) return false;
        if (!normalizedQuery) return true;
        return [item.commonName, item.scientificName, item.speciesId]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort(
        (left, right) =>
          right.priorityScore - left.priorityScore ||
          left.commonName.localeCompare(right.commonName),
      );
  }, [categoryFilter, deferredQuery, summary.queue]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter, deferredQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(queue.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageItems = queue.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function sourceNames(sourceIds: string[]) {
    if (!sourceIds.length) return "None";
    return sourceIds.map((sourceId) => sourceLabels.get(sourceId) ?? sourceId).join(", ");
  }

  return (
    <section className="py-5" aria-labelledby="research-queue-heading">
      <div>
        <h2
          id="research-queue-heading"
          className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--foreground)]"
        >
          Research queue
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {formatNumber(queue.length)} of {formatNumber(summary.queue.length)} species visible
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

      {pageItems.length ? (
        <>
          <div className="mt-5 hidden overflow-x-auto rounded-md border border-[var(--border)] md:block">
            <table className="w-full min-w-[940px] border-collapse text-left text-sm">
              <thead className="bg-[var(--surface)] text-xs text-[var(--muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="px-4 py-3 font-semibold" scope="col">Priority</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Species</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Category</th>
                  <th className="px-4 py-3 text-right font-semibold" scope="col">Not researched</th>
                  <th className="px-4 py-3 text-right font-semibold" scope="col">Unresolved</th>
                  <th className="px-4 py-3 font-semibold" scope="col">Missing protocols</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--surface-strong)]">
                {pageItems.map((item) => (
                  <tr key={item.speciesId} className="hover:bg-[var(--surface)]">
                    <td className="px-4 py-3 font-semibold tabular-nums text-[var(--foreground)]">
                      {item.priorityScore.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--foreground)]">{item.commonName}</p>
                      <p className="mt-0.5 text-xs italic text-[var(--muted)]">{item.scientificName}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--muted)]">{formatLabel(item.category)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--foreground)]">
                      {formatNumber(item.notResearchedCountyCount)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--foreground)]">
                      {formatNumber(item.researchedUnresolvedCountyCount)}
                    </td>
                    <td className="max-w-[320px] px-4 py-3 text-xs leading-5 text-[var(--muted)]">
                      {sourceNames(item.missingProtocolSourceIds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 divide-y divide-[var(--border)] border-y border-[var(--border)] bg-[var(--surface-strong)] md:hidden">
            {pageItems.map((item) => (
              <article key={item.speciesId} className="px-3 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-medium text-[var(--foreground)]">{item.commonName}</h3>
                    <p className="mt-0.5 truncate text-xs italic text-[var(--muted)]">{item.scientificName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] uppercase text-[var(--muted)]">Priority</p>
                    <p className="font-semibold tabular-nums text-[var(--foreground)]">
                      {item.priorityScore.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-[var(--muted)]">{formatLabel(item.category)}</p>
                <dl className="mt-3 grid grid-cols-2 gap-4 text-xs">
                  <div><dt className="text-[var(--muted)]">Not researched</dt><dd className="mt-0.5 tabular-nums text-[var(--foreground)]">{formatNumber(item.notResearchedCountyCount)}</dd></div>
                  <div><dt className="text-[var(--muted)]">Unresolved</dt><dd className="mt-0.5 tabular-nums text-[var(--foreground)]">{formatNumber(item.researchedUnresolvedCountyCount)}</dd></div>
                </dl>
                <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
                  <span className="font-medium text-[var(--foreground)]">Missing protocols:</span>{" "}
                  {sourceNames(item.missingProtocolSourceIds)}
                </p>
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 border-y border-[var(--border)] px-4 py-12 text-center text-sm text-[var(--muted)]">
          No queue items match the current filters.
        </div>
      )}

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
    ["Full research coverage", formatPercent(summary.summary.researchCoveragePercent)],
    ["Bounded coverage", formatPercent(summary.summary.boundedAcquisition.researchCoveragePercent)],
    ["Conflicts", formatNumber(summary.summary.conflictCount)],
  ];

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 pb-12 sm:px-6 lg:px-8">
      <header className="border-b border-[var(--border)] pb-5 pt-2">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]">
              <LockKeyhole aria-hidden="true" size={14} />
              Read-only research operations
            </div>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--foreground)]">
              Research control center
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              {summary.stateName} county evidence coverage and source workflow status.
            </p>
          </div>
          <div className="text-xs leading-5 text-[var(--muted)] sm:text-right">
            <div className="mb-3 min-w-52 text-left sm:ml-auto">
              <SelectField
                label="State research projection"
                value={summary.stateCode}
                options={availableStates.map((entry) => ({
                  value: entry.stateCode,
                  label: `${entry.stateName} (${entry.stateCode})`,
                }))}
                onChange={onStateChange}
              />
            </div>
            <p>Research as of {formatDate(summary.asOf)}</p>
            <p>Registry snapshot {formatDate(summary.sourceSnapshotDate)}</p>
            <p>Generated {formatTimestamp(summary.generatedAt)}</p>
            <p>Schema {String(summary.schemaVersion)}</p>
          </div>
        </div>
      </header>

      <div
        className={`border-b px-4 py-3 text-sm leading-6 ${
          summary.scope.certificationScope === "bounded-pilot"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-950 dark:text-amber-200"
            : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]"
        }`}
      >
        {summary.scope.certificationScope === "bounded-pilot" ? (
          <p>
            <strong>Research-only bounded acquisition.</strong> The full denominator covers {formatNumber(summary.scope.catalogSpeciesCount)} catalog species and {formatNumber(summary.summary.totalPairs)} county-species pairs. Existing source work materializes {formatNumber(summary.scope.boundedAcquisitionSpeciesCount)} species, while every omitted eligible pair resolves to not researched. This is not a certified state result.
          </p>
        ) : (
          <p>
            <strong className="text-[var(--foreground)]">State baseline projection.</strong> Public parity is required, and {formatNumber(summary.scope.unknownSpeciesCount)} state-species applicability decisions remain unknown. Certification readiness remains a separate gate.
          </p>
        )}
      </div>

      <dl className="grid grid-cols-2 divide-x divide-y divide-[var(--border)] border-b border-[var(--border)] sm:grid-cols-3 lg:grid-cols-6">
        {stateMetrics.map(([label, value]) => (
          <Metric key={label} label={label} value={value} />
        ))}
      </dl>

      <div className="overflow-x-auto border-b border-[var(--border)] pt-5">
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
                aria-controls={`research-panel-${view.id}`}
                onClick={() => setActiveView(view.id)}
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

      <div
        id={`research-panel-${activeView}`}
        role="tabpanel"
        aria-labelledby={`research-tab-${activeView}`}
      >
        {activeView === "county" ? <CountyResearchView summary={summary} /> : null}
        {activeView === "sources" ? <SourceOperationsView summary={summary} /> : null}
        {activeView === "queue" ? <QueueView summary={summary} /> : null}
      </div>
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
  const [summary, setSummary] = useState<ResearchSummaryFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("state")?.toUpperCase();
    if (requested && allowedStateCodes.has(requested)) setSelectedStateCode(requested);
  }, [allowedStateCodes]);

  function handleStateChange(stateCode: string) {
    if (!allowedStateCodes.has(stateCode)) return;
    setSelectedStateCode(stateCode);
    const url = new URL(window.location.href);
    url.searchParams.set("state", stateCode);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadSummary() {
      setSummary(null);
      setLoadError(null);

      try {
        const response = await fetch(`/generated/research/${encodeURIComponent(selectedStateCode)}/summary.json`, {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Research summary request failed with status ${response.status}.`);
        }
        const data: unknown = await response.json();
        if (!isResearchSummaryFile(data, selectedStateCode)) {
          throw new Error("Research summary has an invalid data shape.");
        }
        setSummary(data);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        setLoadError(
          error instanceof Error ? error.message : "Research summary could not be loaded.",
        );
      }
    }

    void loadSummary();
    return () => controller.abort();
  }, [reloadKey, selectedStateCode]);

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
    <main className="mx-auto flex min-h-[420px] w-full max-w-[1600px] items-center justify-center px-4 pb-12 sm:px-6 lg:px-8">
      {loadError ? (
        <div className="max-w-lg border-y border-[var(--border)] px-4 py-10 text-center">
          <AlertCircle aria-hidden="true" className="mx-auto text-[var(--danger)]" size={24} />
          <h1 className="mt-3 font-semibold text-[var(--foreground)]">Research data unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{loadError}</p>
          <button
            type="button"
            onClick={() => setReloadKey((current) => current + 1)}
            className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-medium text-[var(--foreground)] hover:border-[var(--accent)]"
          >
            <RefreshCw aria-hidden="true" size={15} />
            Retry
          </button>
        </div>
      ) : (
        <div className="flex items-center text-sm text-[var(--muted)]">
          <LoaderCircle aria-hidden="true" className="mr-2 animate-spin" size={18} />
          Loading research status
        </div>
      )}
    </main>
  );
}
