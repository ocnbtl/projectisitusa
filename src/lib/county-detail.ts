import type { CountyDetail, CountyRecord, ExplorerSpecies, SpeciesCategory } from "@/lib/data/types";
import { formatCategoryLabel, formatNaturalList } from "@/lib/utils";

export interface CountyCategorySignal {
  category: SpeciesCategory;
  count: number;
  stateCode: string;
  stateRank: number;
  nationalRank: number;
}

export interface CountyStat {
  value: string;
  caption: string;
  tone: SpeciesCategory | "neutral";
}

function shortenSpeciesName(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return value;
  return `${words.slice(0, 4).join(" ")}...`;
}

function getTopSpecies(species: ExplorerSpecies[]) {
  return species.slice(0, 2).map((item) => shortenSpeciesName(item.commonName));
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
  const seed = Number(county.countyFips) % 4;

  if (!topSpecies) {
    return `${county.name} County is still coming into focus`;
  }

  const shortName = shortenSpeciesName(topSpecies.commonName);
  const variants = [
    `${county.name} County keeps circling back to ${shortName}`,
    `${shortName} is getting the attention in ${county.name} County`,
    `${county.name} County has a ${shortName} problem`,
    `${shortName} is setting the tone in ${county.name} County`,
  ];

  return variants[seed];
}

export function buildCountySummaryParagraphs({
  county,
  detail,
  focalSpecies,
  nearbySpecies,
  selectedCategories,
  categorySignal,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  selectedCategories: SpeciesCategory[];
  categorySignal: CountyCategorySignal | null;
}) {
  if (detail?.summaryParagraphs?.length) {
    return detail.summaryParagraphs;
  }

  const filterLabel = buildCountyFilterLabel(selectedCategories).toLowerCase();
  const topSpecies = getTopSpecies(focalSpecies);
  const topSpeciesSentence =
    topSpecies.length > 0
      ? `${formatNaturalList(topSpecies)} are the clearest names to watch right now.`
      : "Nothing is strongly standing out in the current county view yet.";
  const categorySentence = categorySignal
    ? categorySignal.nationalRank === 1
      ? `${county.name} County is currently the national high-water mark for ${formatCategoryLabel(
          categorySignal.category,
        ).toLowerCase()} in this view.`
      : categorySignal.stateRank === 1
        ? `${formatCategoryLabel(categorySignal.category)} are hitting harder here than anywhere else in ${county.stateCode} right now.`
        : `${formatCategoryLabel(categorySignal.category)} are leading the county picture right now.`
    : "The county picture is still broad and mixed right now.";
  const nearbySentence =
    nearbySpecies.length > 0
      ? `${nearbySpecies.length.toLocaleString()} more species are showing up in nearby counties, so the local watchlist is probably wider than this county alone suggests.`
      : "Nearby counties are not adding extra pressure in the current view.";
  const evidenceSentence = detail?.auditSummary
    ? detail.auditSummary
    : "The deeper county audit still has work to do here, so this summary is leaning on the current map and broader public datasets rather than a finished local source stack.";

  const seed = Number(county.countyFips) % 3;
  const openers = [
    `${county.name} County is looking like a ${filterLabel} story right now.`,
    `If you live in ${county.name} County, this is where the invasive picture feels most active right now.`,
    `${county.name} County is not quiet on invasives, even if the county audit is still catching up.`,
  ];

  return [
    `${openers[seed]} ${topSpeciesSentence} ${categorySentence}`,
    `${nearbySentence} ${evidenceSentence}`,
  ];
}

export function buildCountyResourceLine(detail: CountyDetail | null) {
  if (!detail || detail.resources.length === 0) {
    return "Local source links are still being added.";
  }

  return detail.resources.slice(0, 4).map((resource) => resource.label);
}

export function buildCountyStats({
  focalSpecies,
  nearbySpecies,
  categorySignal,
}: {
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  categorySignal: CountyCategorySignal | null;
}) {
  const stats: CountyStat[] = [
    {
      value: focalSpecies.length.toLocaleString(),
      caption: "mapped here",
      tone: "neutral",
    },
    {
      value: nearbySpecies.length.toLocaleString(),
      caption: "nearby",
      tone: "neutral",
    },
  ];

  if (!categorySignal || categorySignal.count === 0) {
    stats.push({
      value: "0",
      caption: "top category",
      tone: "neutral",
    });
    return stats;
  }

  const categoryLabel = formatCategoryLabel(categorySignal.category).toLowerCase();

  if (categorySignal.nationalRank === 1) {
    stats.push({
      value: "#1",
      caption: `U.S. ${categoryLabel}`,
      tone: categorySignal.category,
    });
    return stats;
  }

  if (categorySignal.nationalRank <= 10) {
    stats.push({
      value: `Top ${categorySignal.nationalRank}`,
      caption: `U.S. ${categoryLabel}`,
      tone: categorySignal.category,
    });
    return stats;
  }

  if (categorySignal.stateRank === 1) {
    stats.push({
      value: "#1",
      caption: `${categorySignal.stateCode} ${categoryLabel}`,
      tone: categorySignal.category,
    });
    return stats;
  }

  stats.push({
    value: categorySignal.count.toLocaleString(),
    caption: `${categoryLabel} lead here`,
    tone: categorySignal.category,
  });

  return stats;
}

export function buildCountyCardParagraph({
  county,
  detail,
  focalSpecies,
  nearbySpecies,
  selectedCategories,
  categorySignal,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  selectedCategories: SpeciesCategory[];
  categorySignal: CountyCategorySignal | null;
}) {
  return buildCountySummaryParagraphs({
    county,
    detail,
    focalSpecies,
    nearbySpecies,
    selectedCategories,
    categorySignal,
  })[0];
}
