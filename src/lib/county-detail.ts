import type {
  CountyDetail,
  CountyEvidenceLevel,
  CountyRecord,
  ExplorerSpecies,
  SpeciesCategory,
} from "@/lib/data/types";
import { formatCategoryLabel, formatNaturalList } from "@/lib/utils";

export interface CountyStat {
  label: string;
  value: string;
  note: string;
}

function countSpeciesByCategory(species: ExplorerSpecies[]) {
  const counts = new Map<SpeciesCategory, number>();

  for (const item of species) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

export function formatCountyEvidenceLabel(level: CountyEvidenceLevel) {
  switch (level) {
    case "county-specific":
      return "County-specific source verified";
    case "statewide-only":
      return "Statewide source only";
    default:
      return "County audit not curated yet";
  }
}

export function buildCountyFilterLabel(categories: SpeciesCategory[]) {
  if (categories.length === 0) return "All categories";
  if (categories.length === 1) return `${formatCategoryLabel(categories[0])} focus`;
  return `${categories.length} category view`;
}

export function buildCountyNarrative({
  county,
  detail,
  focalSpecies,
  nearbySpecies,
  unresolvedCount,
  selectedCategories,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  unresolvedCount: number;
  selectedCategories: SpeciesCategory[];
}) {
  const categoryCounts = countSpeciesByCategory(focalSpecies);
  const topCategory = categoryCounts[0];
  const filterLabel = buildCountyFilterLabel(selectedCategories).toLowerCase();
  const leadSentence =
    detail?.countySummary ??
    `${county.name} County currently shows ${focalSpecies.length.toLocaleString()} mapped invasive species in the ${filterLabel}. ${
      nearbySpecies.length > 0
        ? `${nearbySpecies.length.toLocaleString()} additional species are verified in nearby counties only.`
        : "No nearby-only watchlist species are visible in this filtered view."
    }`;

  const evidenceSentence = detail
    ? detail.auditSummary
    : "A county-specific audit summary has not been published yet for this county, so the live view still relies on merged statewide and federal county datasets.";

  const categorySentence = topCategory
    ? `${formatCategoryLabel(topCategory[0])} currently leads this county view with ${topCategory[1].toLocaleString()} mapped species.`
    : "No mapped species are visible in the current county view yet.";

  const unresolvedSentence =
    unresolvedCount > 0
      ? `${unresolvedCount.toLocaleString()} species in the active filters still do not have verified county-level coverage attached.`
      : "No county-level coverage gaps are visible in the active filters.";

  return `${leadSentence} ${evidenceSentence} ${categorySentence} ${unresolvedSentence}`;
}

export function buildCountyStats({
  detail,
  focalSpecies,
  nearbySpecies,
  unresolvedCount,
}: {
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  unresolvedCount: number;
}) {
  const countySpecificResources =
    detail?.resources.filter((resource) =>
      ["county-detection", "regulatory-notice"].includes(resource.kind),
    ).length ?? 0;

  const stats: CountyStat[] = [
    {
      label: "Mapped in county",
      value: focalSpecies.length.toLocaleString(),
      note: "Species currently attached to this county in the active view.",
    },
    {
      label: "Nearby watchlist",
      value: nearbySpecies.length.toLocaleString(),
      note: "Species verified in neighboring counties but not yet in this county.",
    },
    {
      label: "Coverage gaps",
      value: unresolvedCount.toLocaleString(),
      note: "Filtered species still waiting on county-level source attachment.",
    },
  ];

  if (detail) {
    stats.push({
      label: "Local official reports",
      value: countySpecificResources.toLocaleString(),
      note:
        countySpecificResources > 0
          ? "County-specific detections or regulatory notices currently logged."
          : "No county-specific detections or regulatory notices logged yet.",
    });
  }

  return stats.slice(0, 4);
}

export function buildCountyResourceSummary(detail: CountyDetail | null) {
  if (!detail || detail.resources.length === 0) {
    return "County-specific organizations and verified local source links have not been curated for this county yet.";
  }

  const highlighted = detail.resources.slice(0, 3).map((resource) => resource.label);

  return `Verified local and statewide sources currently highlighted here include ${formatNaturalList(
    highlighted,
  )}.`;
}

export function buildCountyCardSummary({
  county,
  detail,
  focalSpeciesCount,
  nearbySpeciesCount,
  unresolvedCount,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpeciesCount: number;
  nearbySpeciesCount: number;
  unresolvedCount: number;
}) {
  const base =
    detail?.countySummary ??
    `${county.name} County currently shows ${focalSpeciesCount.toLocaleString()} mapped invasive species in the Project Isitusa county explorer.`;

  const second =
    nearbySpeciesCount > 0
      ? `${nearbySpeciesCount.toLocaleString()} additional species are verified in nearby counties only.`
      : "No nearby-only watchlist species are visible in the current view.";

  const third =
    unresolvedCount > 0
      ? `${unresolvedCount.toLocaleString()} filtered species still need county-level source attachment.`
      : "Current filters do not show county-level source gaps.";

  return `${base} ${second} ${third}`;
}
