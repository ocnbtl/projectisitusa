"use client";

import { useMemo, useState } from "react";
import { Info, LoaderCircle, LocateFixed, Search, X } from "lucide-react";

import { CATEGORY_OPTIONS, ENVIRONMENT_OPTIONS } from "@/lib/constants";
import type { EnvironmentTag, ExplorerSpecies, SpeciesCategory } from "@/lib/data/types";
import { cn, formatCategoryLabel } from "@/lib/utils";

interface ZipInsight {
  title: string;
  body: string;
}

interface MapToolbarProps {
  categories: SpeciesCategory[];
  environment: EnvironmentTag | null;
  speciesId: string | null;
  speciesQuery: string;
  speciesOptions: ExplorerSpecies[];
  zipInput: string;
  zipStatus: string | null;
  zipInsight: ZipInsight | null;
  isSearching: boolean;
  onCategoryToggle: (value: SpeciesCategory) => void;
  onClearCategories: () => void;
  onEnvironmentChange: (value: EnvironmentTag | null) => void;
  onSpeciesQueryChange: (value: string) => void;
  onSpeciesChange: (value: string | null) => void;
  onZipChange: (value: string) => void;
  onZipSearch: () => void;
  onClearAll: () => void;
}

export function MapToolbar({
  categories,
  environment,
  speciesId,
  speciesQuery,
  speciesOptions,
  zipInput,
  zipStatus,
  zipInsight,
  isSearching,
  onCategoryToggle,
  onClearCategories,
  onEnvironmentChange,
  onSpeciesQueryChange,
  onSpeciesChange,
  onZipChange,
  onZipSearch,
  onClearAll,
}: MapToolbarProps) {
  const [hoveredCategory, setHoveredCategory] = useState<SpeciesCategory | null>(null);
  const [openInfo, setOpenInfo] = useState<"environment" | null>(null);

  const selectedSpecies = speciesId
    ? speciesOptions.find((species) => species.id === speciesId) ?? null
    : null;

  const suggestedSpecies = speciesQuery
    ? speciesOptions
        .filter((species) => {
          const query = speciesQuery.toLowerCase();
          return `${species.commonName} ${species.scientificName}`
            .toLowerCase()
            .includes(query);
        })
        .slice(0, 10)
    : speciesOptions.slice(0, 6);

  const hoveredCategoryOption = useMemo(
    () =>
      hoveredCategory
        ? CATEGORY_OPTIONS.find((option) => option.value === hoveredCategory) ?? null
        : null,
    [hoveredCategory],
  );

  return (
    <section className="glass-panel relative z-20 rounded-[28px] p-5">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClearAll}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
        >
          <X size={14} />
          Reset
        </button>
      </div>

      <div className="pt-4">
        <h2 className="font-[family-name:var(--font-display)] text-[1.5rem] font-semibold leading-[1.08] text-[var(--foreground)] sm:text-[1.65rem] xl:text-[1.8rem]">
          <span className="block whitespace-nowrap">Find information about</span>
          <span className="block whitespace-nowrap">invasive species near you</span>
        </h2>
      </div>

      <div className="mt-5 grid gap-5">
        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="zip-search"
              className="text-sm font-medium text-[var(--foreground)]"
            >
              ZIP code
            </label>
            <span className="whitespace-nowrap text-[11px] uppercase tracking-[0.18em] text-[var(--accent-strong)]">
              Quick local lookup
            </span>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <LocateFixed
                size={16}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              />
              <input
                id="zip-search"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={5}
                value={zipInput}
                onChange={(event) => onZipChange(event.target.value.replace(/\D/g, ""))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onZipSearch();
                  }
                }}
                placeholder="Try 43210"
                className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] py-3 pl-11 pr-4 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
              />
            </div>
            <button
              type="button"
              onClick={onZipSearch}
              disabled={isSearching}
              className="locate-button inline-flex min-w-28 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[#041009] hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSearching ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              Locate
            </button>
          </div>
          {zipStatus ? (
            <p className="text-sm text-[var(--muted)]">{zipStatus}</p>
          ) : null}
          {zipInsight ? (
            <div className="rounded-[22px] border border-[color:color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color:color-mix(in_srgb,var(--accent)_12%,transparent)] px-4 py-4">
              <p className="text-xs uppercase tracking-[0.24em] text-[var(--accent-strong)]">
                {zipInsight.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--foreground)]">
                {zipInsight.body}
              </p>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <label
              htmlFor="species-search"
              className="whitespace-nowrap text-[13px] font-medium text-[var(--foreground)]"
            >
              Species search
            </label>
            <span className="whitespace-nowrap text-[10px] uppercase tracking-[0.16em] text-[var(--muted)]">
              Common or scientific name
            </span>
          </div>
          <input
            id="species-search"
            value={selectedSpecies ? selectedSpecies.commonName : speciesQuery}
            onChange={(event) => {
              onSpeciesChange(null);
              onSpeciesQueryChange(event.target.value);
            }}
            placeholder="Search by common or scientific name"
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-base text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
          />
          {selectedSpecies ? (
            <div className="rounded-[22px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--foreground)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{selectedSpecies.commonName}</div>
                  <div className="text-[var(--muted)]">
                    <em>{selectedSpecies.scientificName}</em> ·{" "}
                    {formatCategoryLabel(selectedSpecies.category)} ·{" "}
                    {selectedSpecies.displayGroup}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSpeciesChange(null);
                    onSpeciesQueryChange("");
                  }}
                  className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="max-h-64 overflow-auto rounded-[22px] border border-[var(--border)] bg-[var(--surface)]">
              {suggestedSpecies.map((species) => (
                <button
                  key={species.id}
                  type="button"
                  onClick={() => {
                    onSpeciesChange(species.id);
                    onSpeciesQueryChange(species.commonName);
                  }}
                  className="flex w-full items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-left last:border-b-0 hover:bg-[color:color-mix(in_srgb,var(--accent)_10%,transparent)]"
                >
                  <div>
                    <div className="text-sm font-medium text-[var(--foreground)]">
                      {species.commonName}
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      <em>{species.scientificName}</em> · {species.displayGroup}
                    </div>
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">
                    {species.registry?.hasCountyData ? "Mapped" : "Catalog"}
                  </div>
                </button>
              ))}
              {suggestedSpecies.length === 0 ? (
                <div className="px-4 py-3 text-sm text-[var(--muted)]">
                  No species match the current filters.
                </div>
              ) : null}
            </div>
          )}
          <p className="text-sm text-[var(--muted)]">
            {speciesOptions.length.toLocaleString()} species match the active filters.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-[var(--foreground)]">
              Categories
            </span>
            {categories.length > 0 ? (
              <button
                type="button"
                onClick={onClearCategories}
                className="text-xs uppercase tracking-[0.18em] text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                Clear categories
              </button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClearCategories}
              className={cn(
                "rounded-full border px-3 py-2 text-sm",
                categories.length === 0
                  ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--foreground)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]",
              )}
            >
              All categories
            </button>
            {CATEGORY_OPTIONS.map((option) => {
              const isActive = categories.includes(option.value);

              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseEnter={() => setHoveredCategory(option.value)}
                  onMouseLeave={() => setHoveredCategory((current) => (current === option.value ? null : current))}
                  onFocus={() => setHoveredCategory(option.value)}
                  onBlur={() => setHoveredCategory((current) => (current === option.value ? null : current))}
                  onClick={() => onCategoryToggle(option.value)}
                  className={cn(
                    "rounded-full border px-3 py-2 text-sm",
                    isActive
                      ? "border-[var(--accent)] bg-[color:color-mix(in_srgb,var(--accent)_18%,transparent)] text-[var(--foreground)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <div className="min-h-14 rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
            {hoveredCategoryOption ? (
              <p className="text-sm leading-6 text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">
                  {hoveredCategoryOption.label}:
                </span>{" "}
                {hoveredCategoryOption.description}
              </p>
            ) : (
              <p className="text-sm leading-6 text-[var(--muted)]">
                Hover over a category to see a short description, or combine several
                categories to compare broader patterns.
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <div className="flex items-center gap-2">
            <label
              htmlFor="environment-filter"
              className="text-sm font-medium text-[var(--foreground)]"
            >
              Environment
            </label>
            <button
              type="button"
              onClick={() =>
                setOpenInfo((current) => (current === "environment" ? null : "environment"))
              }
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
              aria-label="About environment filtering"
            >
              <Info size={13} />
            </button>
          </div>
          {openInfo === "environment" ? (
            <div className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--muted)]">
              Use environment to narrow the catalog by where a species tends to
              show up, like forests, freshwater, wetlands, farms, or urban areas.
            </div>
          ) : null}
          <select
            id="environment-filter"
            value={environment ?? ""}
            onChange={(event) =>
              onEnvironmentChange((event.target.value as EnvironmentTag) || null)
            }
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          >
            {ENVIRONMENT_OPTIONS.map((option) => (
              <option key={option.label} value={option.value ?? ""}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}
