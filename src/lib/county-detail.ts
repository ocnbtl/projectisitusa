import type {
  CountyDetail,
  CountyEvidenceLevel,
  CountyRecord,
  ExplorerSpecies,
  SpeciesCategory,
} from "@/lib/data/types";
import { formatCategoryLabel, formatNaturalList } from "@/lib/utils";

export interface CountyStat {
  value: string;
  caption: string;
}

function countSpeciesByCategory(species: ExplorerSpecies[]) {
  const counts = new Map<SpeciesCategory, number>();

  for (const item of species) {
    counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function shortenSpeciesName(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return value;
  return `${words.slice(0, 4).join(" ")}...`;
}

function getTopSpecies(species: ExplorerSpecies[]) {
  return species.slice(0, 2).map((item) => shortenSpeciesName(item.commonName));
}

export function formatCountyEvidenceLabel(level: CountyEvidenceLevel) {
  switch (level) {
    case "county-specific":
      return "Locally verified";
    case "statewide-only":
      return "Statewide view";
    default:
      return "Audit still in progress";
  }
}

export function buildCountyFilterLabel(categories: SpeciesCategory[]) {
  if (categories.length === 0) return "All categories";
  if (categories.length === 1) return formatCategoryLabel(categories[0]);
  return `${categories.length} categories`;
}

export function buildCountyHeadline({
  county,
  detail,
  focalSpecies,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
}) {
  if (detail?.headline) return detail.headline;

  const topSpecies = focalSpecies[0];

  if (!topSpecies) {
    return `${county.name} County is still coming into focus`;
  }

  return `${county.name} County: ${shortenSpeciesName(topSpecies.commonName)} leads`;
}

export function buildCountySummaryParagraphs({
  county,
  detail,
  focalSpecies,
  nearbySpecies,
  unresolvedCount,
  selectedCategories,
  filterLabel,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  unresolvedCount: number;
  selectedCategories: SpeciesCategory[];
  filterLabel?: string;
}) {
  if (detail?.summaryParagraphs?.length) {
    return detail.summaryParagraphs;
  }

  const activeFilterLabel = (filterLabel ?? buildCountyFilterLabel(selectedCategories)).toLowerCase();
  const topSpecies = getTopSpecies(focalSpecies);
  const topCategory = countSpeciesByCategory(focalSpecies)[0];
  const lead = `${county.name} County currently shows ${focalSpecies.length.toLocaleString()} mapped invasive species in this ${activeFilterLabel} view.`;
  const speciesSentence =
    topSpecies.length > 0
      ? `${formatNaturalList(topSpecies)} are among the clearest names to watch right now.`
      : "There are no mapped species showing in the current county view yet.";
  const nearbySentence =
    nearbySpecies.length > 0
      ? `${nearbySpecies.length.toLocaleString()} more species are showing up in nearby counties.`
      : "No nearby-only watchlist species are showing up right now.";
  const evidenceSentence = detail?.auditSummary
    ? detail.auditSummary
    : "This county still leans on statewide and federal datasets while the deeper county audit catches up.";
  const categorySentence = topCategory
    ? `${formatCategoryLabel(topCategory[0])} is the strongest category in the county view right now.`
    : "";
  const unresolvedSentence =
    unresolvedCount > 0
      ? `${unresolvedCount.toLocaleString()} filtered species are still waiting on county-level verification.`
      : "The current filter set does not show county-level verification gaps right now.";

  return [
    `${lead} ${speciesSentence} ${nearbySentence}`,
    `${evidenceSentence} ${categorySentence} ${unresolvedSentence}`.trim(),
  ];
}

export function buildCountyStats({
  focalSpecies,
  nearbySpecies,
  unresolvedCount,
}: {
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  unresolvedCount: number;
}) {
  const stats: CountyStat[] = [
    {
      value: focalSpecies.length.toLocaleString(),
      caption: "mapped here",
    },
    {
      value: nearbySpecies.length.toLocaleString(),
      caption: "nearby",
    },
    {
      value: unresolvedCount.toLocaleString(),
      caption: "still being checked",
    },
  ];

  return stats;
}

export function buildCountyResourceLine(detail: CountyDetail | null) {
  if (!detail || detail.resources.length === 0) {
    return "Local source links are still being added.";
  }

  return detail.resources.slice(0, 4).map((resource) => resource.label);
}

export function buildCountyCardParagraph({
  county,
  detail,
  focalSpecies,
  nearbySpecies,
  unresolvedCount,
  selectedCategories,
  filterLabel,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  unresolvedCount: number;
  selectedCategories: SpeciesCategory[];
  filterLabel?: string;
}) {
  return buildCountySummaryParagraphs({
    county,
    detail,
    focalSpecies,
    nearbySpecies,
    unresolvedCount,
    selectedCategories,
    filterLabel,
  })[0];
}
