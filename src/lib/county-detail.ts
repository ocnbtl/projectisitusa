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

function getCategoryCaption(category: SpeciesCategory) {
  switch (category) {
    case "plants":
      return "plant species";
    case "insects":
      return "insect species";
    case "fungi-diseases":
      return "fungi and disease species";
    case "wildlife":
      return "wildlife species";
  }
}

function shortenSpeciesName(value: string) {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length <= 4) return value;
  return `${words.slice(0, 4).join(" ")}...`;
}

function getTopSpecies(species: ExplorerSpecies[]) {
  return species.slice(0, 2).map((item) => shortenSpeciesName(item.commonName));
}

function getLeadingSentence(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const match = trimmed.match(/^.*?[.!?](?=\s|$)/);
  if (match) {
    return match[0].replace(/[.!?]+$/, "");
  }

  const words = trimmed.split(/\s+/).slice(0, 18);
  return words.join(" ");
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
    `${shortName} keeps popping up in ${county.name} County`,
    `${county.name} County has its eye on ${shortName}`,
    `${shortName} is one of the big watchouts in ${county.name} County`,
    `${county.name} County keeps running into ${shortName}`,
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
      ? `${formatNaturalList(topSpecies)} jump out first in this view.`
      : "Nothing is clearly separating itself from the rest of the county view yet.";
  const categorySentence = categorySignal
    ? categorySignal.nationalRank === 1
      ? `${formatCategoryLabel(categorySignal.category)} are stacked here more than anywhere else in this national view.`
      : categorySignal.nationalRank <= 10
        ? `${formatCategoryLabel(categorySignal.category)} are heavier here than in most counties in this view.`
        : categorySignal.stateRank === 1
          ? `${formatCategoryLabel(categorySignal.category)} are showing up here more than anywhere else in ${county.stateCode} right now.`
          : `${formatCategoryLabel(categorySignal.category)} stand out more than the other categories in this county right now.`
    : "The county picture still feels broad and mixed right now.";
  const nearbySentence =
    nearbySpecies.length > 0
      ? `Another ${nearbySpecies.length.toLocaleString()} species are showing up in nearby counties, so the watchlist around ${county.name} County is probably wider than the county line alone suggests.`
      : "Nearby counties are not adding much extra pressure in the current view.";
  const evidenceSentence = detail?.auditSummary
    ? detail.auditSummary
    : "The deeper county audit is still catching up here, so this summary is leaning on the live map and broader public datasets instead of a finished local source stack.";

  const seed = Number(county.countyFips) % 3;
  const openers = [
    `${county.name} County has a pretty active ${filterLabel} picture right now.`,
    `If you live in ${county.name} County, these are the names that would stand out fastest right now.`,
    `${county.name} County is not quiet on invasives, even if the local audit is still filling in.`,
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
      caption: "invasive species mapped here",
      tone: "neutral",
    },
    {
      value: nearbySpecies.length.toLocaleString(),
      caption: "in surrounding counties",
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
  const categoryCaption = getCategoryCaption(categorySignal.category);

  if (categorySignal.nationalRank === 1) {
    stats.push({
      value: "#1",
      caption: `U.S. ${categoryLabel} count`,
      tone: categorySignal.category,
    });
    return stats;
  }

  if (categorySignal.nationalRank <= 10) {
    stats.push({
      value: `Top ${categorySignal.nationalRank}`,
      caption: `U.S. ${categoryLabel} count`,
      tone: categorySignal.category,
    });
    return stats;
  }

  if (categorySignal.stateRank === 1) {
    stats.push({
      value: "#1",
      caption: `${categorySignal.stateCode} ${categoryLabel} count`,
      tone: categorySignal.category,
    });
    return stats;
  }

  stats.push({
    value: categorySignal.count.toLocaleString(),
    caption: `${categoryCaption} recorded`,
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
  const baseText = detail?.summaryParagraphs?.length
    ? detail.summaryParagraphs[0]
    : buildCountySummaryParagraphs({
        county,
        detail,
        focalSpecies,
        nearbySpecies,
        selectedCategories,
        categorySignal,
      })[0];

  const leadSentence = getLeadingSentence(baseText);
  return leadSentence ? `${leadSentence}...` : "";
}
