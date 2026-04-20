import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";
import statesTopology from "us-atlas/states-10m.json";

import type { CountyCategorySignal, CountyStat } from "@/lib/county-detail";
import {
  buildCountyCardParagraph,
  buildCountyHeadline,
  buildCountyStats,
} from "@/lib/county-detail";
import type { CountyDetail, CountyRecord, ExplorerSpecies, SpeciesCategory } from "@/lib/data/types";

type GeometryFeature = GeoJSON.Feature<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { name?: string }
>;

type CountyCardPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
  surface: string;
};

const EXCLUDED_STATE_PREFIXES = new Set(["02", "15", "60", "66", "69", "72", "78"]);

const countyFeatures = (
  feature(
    countyTopology as never,
    countyTopology.objects.counties as never,
  ) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    { name?: string }
  >
).features as Array<GeometryFeature & { id?: string | number }>;

const stateFeatures = (
  feature(
    statesTopology as never,
    statesTopology.objects.states as never,
  ) as unknown as GeoJSON.FeatureCollection<
    GeoJSON.Polygon | GeoJSON.MultiPolygon,
    { name?: string }
  >
).features as Array<GeometryFeature & { id?: string | number }>;

const countyFeatureByFips = new Map(
  countyFeatures.map((item) => [String(item.id).padStart(5, "0"), item]),
);
const stateFeatureByFips = new Map(
  stateFeatures.map((item) => [String(item.id).padStart(2, "0"), item]),
);
const stateCountyFeaturesByFips = new Map<string, Array<GeometryFeature & { id?: string | number }>>();

for (const item of countyFeatures) {
  const countyFips = String(item.id).padStart(5, "0");
  const stateFips = countyFips.slice(0, 2);
  if (EXCLUDED_STATE_PREFIXES.has(stateFips)) continue;
  const current = stateCountyFeaturesByFips.get(stateFips) ?? [];
  current.push(item);
  stateCountyFeaturesByFips.set(stateFips, current);
}

export const COUNTY_CARD_PRESETS: CountyCardPreset[] = [
  {
    id: "square",
    label: "Square",
    width: 1080,
    height: 1080,
    surface: "Square post",
  },
  {
    id: "portrait",
    label: "Portrait",
    width: 1080,
    height: 1350,
    surface: "Portrait post",
  },
  {
    id: "story",
    label: "Story",
    width: 1020,
    height: 1980,
    surface: "Story post",
  },
  {
    id: "landscape",
    label: "Landscape",
    width: 1200,
    height: 628,
    surface: "Landscape post",
  },
  {
    id: "tall",
    label: "Tall",
    width: 1080,
    height: 1620,
    surface: "Tall post",
  },
  {
    id: "widescreen",
    label: "Widescreen",
    width: 1920,
    height: 1080,
    surface: "Widescreen post",
  },
];

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(text: string, maxChars: number, maxLines: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  const joined = lines.join(" ").trim();
  if (joined.length < text.trim().length && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.,;:!?]+$/, "")}...`;
  }

  return lines;
}

function getToneColors(tone: SpeciesCategory | "neutral") {
  switch (tone) {
    case "plants":
      return {
        accent: "#78C58B",
        soft: "rgba(120,197,139,0.18)",
        strong: "#D4F5DC",
      };
    case "insects":
      return {
        accent: "#F3A24A",
        soft: "rgba(243,162,74,0.18)",
        strong: "#FFDDB5",
      };
    case "fungi-diseases":
      return {
        accent: "#E58779",
        soft: "rgba(229,135,121,0.18)",
        strong: "#FFD4CC",
      };
    case "wildlife":
      return {
        accent: "#7DADE9",
        soft: "rgba(125,173,233,0.18)",
        strong: "#D3E4FF",
      };
    default:
      return {
        accent: "#A2ABA5",
        soft: "rgba(162,171,165,0.16)",
        strong: "#E3E8E4",
      };
  }
}

type PresetLayout = {
  titleBox: { x: number; y: number; width: number; height: number };
  mapBox: { x: number; y: number; width: number; height: number };
  statsHeight: number;
  statsBottomGap: number;
  textInsetX: number;
  headlineChars: number;
  headlineMaxLines: number;
  headlineSize: number;
  headlineLineHeight: number;
  summaryChars: number;
  summaryMaxLines: number;
  summarySize: number;
  summaryLineHeight: number;
  cardTitleChars: number;
  mapLabelSize: number;
  statValueSize: number;
  statCaptionSize: number;
  cardTitleSize: number;
  footerSize: number;
  cardTitleOffsetY: number;
  accentOffsetY: number;
  headlineOffsetY: number;
  summaryGap: number;
  mapInsetX: number;
  mapInsetTop: number;
  mapInsetBottom: number;
  mapLabelOffsetX: number;
  mapLabelOffsetY: number;
};

function getPresetLayout({
  preset,
  contentX,
  contentY,
  contentWidth,
  contentHeight,
}: {
  preset: CountyCardPreset;
  contentX: number;
  contentY: number;
  contentWidth: number;
  contentHeight: number;
}): PresetLayout {
  const statsHeight = preset.id === "story" ? 96 : preset.id === "widescreen" ? 86 : 82;

  switch (preset.id) {
    case "landscape": {
      const titleWidth = Math.round(contentWidth * 0.44);
      return {
        titleBox: { x: contentX, y: contentY, width: titleWidth, height: 168 },
        mapBox: {
          x: contentX + titleWidth + 24,
          y: contentY + 6,
          width: contentWidth - titleWidth - 24,
          height: 188,
        },
        statsHeight,
        statsBottomGap: 28,
        textInsetX: 24,
        headlineChars: 22,
        headlineMaxLines: 3,
        headlineSize: 23,
        headlineLineHeight: 27,
        summaryChars: 35,
        summaryMaxLines: 2,
        summarySize: 15,
        summaryLineHeight: 21,
        cardTitleChars: 30,
        mapLabelSize: 13,
        statValueSize: 28,
        statCaptionSize: 13,
        cardTitleSize: 15,
        footerSize: 16,
        cardTitleOffsetY: 26,
        accentOffsetY: 46,
        headlineOffsetY: 74,
        summaryGap: 20,
        mapInsetX: 14,
        mapInsetTop: 22,
        mapInsetBottom: 14,
        mapLabelOffsetX: 14,
        mapLabelOffsetY: 14,
      };
    }
    case "widescreen": {
      const titleWidth = Math.round(contentWidth * 0.42);
      return {
        titleBox: { x: contentX, y: contentY, width: titleWidth, height: 206 },
        mapBox: {
          x: contentX + titleWidth + 30,
          y: contentY + 10,
          width: contentWidth - titleWidth - 30,
          height: 220,
        },
        statsHeight,
        statsBottomGap: 30,
        textInsetX: 28,
        headlineChars: 22,
        headlineMaxLines: 3,
        headlineSize: 39,
        headlineLineHeight: 43,
        summaryChars: 34,
        summaryMaxLines: 2,
        summarySize: 20,
        summaryLineHeight: 28,
        cardTitleChars: 31,
        mapLabelSize: 16,
        statValueSize: 40,
        statCaptionSize: 16,
        cardTitleSize: 23,
        footerSize: 21,
        cardTitleOffsetY: 30,
        accentOffsetY: 54,
        headlineOffsetY: 88,
        summaryGap: 22,
        mapInsetX: 18,
        mapInsetTop: 24,
        mapInsetBottom: 18,
        mapLabelOffsetX: 16,
        mapLabelOffsetY: 16,
      };
    }
    case "story":
      return {
        titleBox: { x: contentX, y: contentY, width: contentWidth, height: 284 },
        mapBox: {
          x: contentX,
          y: contentY + 322,
          width: contentWidth,
          height: 1110,
        },
        statsHeight,
        statsBottomGap: 36,
        textInsetX: 30,
        headlineChars: 20,
        headlineMaxLines: 3,
        headlineSize: 46,
        headlineLineHeight: 48,
        summaryChars: 24,
        summaryMaxLines: 3,
        summarySize: 23,
        summaryLineHeight: 31,
        cardTitleChars: 28,
        mapLabelSize: 18,
        statValueSize: 36,
        statCaptionSize: 15,
        cardTitleSize: 25,
        footerSize: 21,
        cardTitleOffsetY: 30,
        accentOffsetY: 56,
        headlineOffsetY: 92,
        summaryGap: 26,
        mapInsetX: 18,
        mapInsetTop: 22,
        mapInsetBottom: 30,
        mapLabelOffsetX: 16,
        mapLabelOffsetY: 16,
      };
    case "portrait":
      return {
        titleBox: { x: contentX, y: contentY, width: contentWidth, height: 208 },
        mapBox: {
          x: contentX,
          y: contentY + 244,
          width: contentWidth,
          height: 750,
        },
        statsHeight,
        statsBottomGap: 32,
        textInsetX: 28,
        headlineChars: 21,
        headlineMaxLines: 3,
        headlineSize: 32,
        headlineLineHeight: 35,
        summaryChars: 26,
        summaryMaxLines: 2,
        summarySize: 18,
        summaryLineHeight: 25,
        cardTitleChars: 28,
        mapLabelSize: 15,
        statValueSize: 31,
        statCaptionSize: 14,
        cardTitleSize: 20,
        footerSize: 19,
        cardTitleOffsetY: 28,
        accentOffsetY: 50,
        headlineOffsetY: 82,
        summaryGap: 22,
        mapInsetX: 16,
        mapInsetTop: 22,
        mapInsetBottom: 18,
        mapLabelOffsetX: 16,
        mapLabelOffsetY: 16,
      };
    case "tall":
      return {
        titleBox: { x: contentX, y: contentY, width: contentWidth, height: 222 },
        mapBox: {
          x: contentX,
          y: contentY + 258,
          width: contentWidth,
          height: 960,
        },
        statsHeight,
        statsBottomGap: 34,
        textInsetX: 28,
        headlineChars: 22,
        headlineMaxLines: 3,
        headlineSize: 36,
        headlineLineHeight: 40,
        summaryChars: 28,
        summaryMaxLines: 3,
        summarySize: 20,
        summaryLineHeight: 28,
        cardTitleChars: 28,
        mapLabelSize: 16,
        statValueSize: 33,
        statCaptionSize: 14,
        cardTitleSize: 21,
        footerSize: 19,
        cardTitleOffsetY: 28,
        accentOffsetY: 52,
        headlineOffsetY: 86,
        summaryGap: 22,
        mapInsetX: 16,
        mapInsetTop: 24,
        mapInsetBottom: 22,
        mapLabelOffsetX: 16,
        mapLabelOffsetY: 16,
      };
    case "square":
    default:
      return {
        titleBox: { x: contentX, y: contentY, width: contentWidth, height: 196 },
        mapBox: {
          x: contentX,
          y: contentY + 228,
          width: contentWidth,
          height: 508,
        },
        statsHeight,
        statsBottomGap: 30,
        textInsetX: 26,
        headlineChars: 20,
        headlineMaxLines: 3,
        headlineSize: 27,
        headlineLineHeight: 31,
        summaryChars: 24,
        summaryMaxLines: 2,
        summarySize: 16,
        summaryLineHeight: 23,
        cardTitleChars: 26,
        mapLabelSize: 15,
        statValueSize: 28,
        statCaptionSize: 13,
        cardTitleSize: 18,
        footerSize: 18,
        cardTitleOffsetY: 26,
        accentOffsetY: 46,
        headlineOffsetY: 78,
        summaryGap: 20,
        mapInsetX: 16,
        mapInsetTop: 24,
        mapInsetBottom: 18,
        mapLabelOffsetX: 16,
        mapLabelOffsetY: 16,
      };
  }
}

function renderTextLines({
  lines,
  x,
  y,
  lineHeight,
  size,
  color,
  weight = 500,
}: {
  lines: string[];
  x: number;
  y: number;
  lineHeight: number;
  size: number;
  color: string;
  weight?: number;
}) {
  return lines
    .map(
      (line, index) =>
        `<text x="${x}" y="${y + index * lineHeight}" fill="${color}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${size}" font-weight="${weight}">${escapeXml(
          line,
        )}</text>`,
    )
    .join("");
}

function buildMapPaths({
  county,
  mapX,
  mapY,
  mapWidth,
  mapHeight,
  baseFill,
  stroke,
}: {
  county: CountyRecord;
  mapX: number;
  mapY: number;
  mapWidth: number;
  mapHeight: number;
  baseFill: string;
  stroke: string;
}) {
  const stateFips = county.countyFips.slice(0, 2);
  const countyFeature = countyFeatureByFips.get(county.countyFips);
  const stateFeature = stateFeatureByFips.get(stateFips);
  const stateCountyFeatures = stateCountyFeaturesByFips.get(stateFips) ?? [];
  const projection = geoAlbersUsa();

  if (stateFeature) {
    projection.fitExtent(
      [
        [mapX, mapY],
        [mapX + mapWidth, mapY + mapHeight],
      ],
      stateFeature as never,
    );
  }

  const path = geoPath(projection);

  const counties = stateCountyFeatures
    .map((item) => {
      const outline = path(item as never);
      if (!outline) return "";
      return `<path d="${outline}" fill="${baseFill}" stroke="${stroke}" stroke-width="0.9" />`;
    })
    .join("");

  return {
    counties,
    selectedStatePath: stateFeature ? path(stateFeature as never) : null,
    selectedCountyPath: countyFeature ? path(countyFeature as never) : null,
  };
}

function renderStatsRow({
  stats,
  x,
  y,
  width,
  height,
  valueSize,
  captionSize,
}: {
  stats: CountyStat[];
  x: number;
  y: number;
  width: number;
  height: number;
  valueSize: number;
  captionSize: number;
}) {
  const gap = 12;
  const cardWidth = Math.floor((width - gap * 2) / 3);

  return stats
    .map((stat, index) => {
      const cardX = x + index * (cardWidth + gap);
      const tone = getToneColors(stat.tone);
      const valueFontSize =
        stat.value.length >= 5 ? Math.max(20, valueSize - 6) : valueSize;
      const singleLineCaptionSize = Math.max(
        8,
        Math.min(
          captionSize,
          Math.floor((cardWidth - 28) / Math.max(1, stat.caption.length * 0.58)),
        ),
      );
      const captionLines = [stat.caption];
      const captionStartY = y + height - 18;

      return `<g>
        <rect x="${cardX}" y="${y}" width="${cardWidth}" height="${height}" rx="22" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" />
        <rect x="${cardX}" y="${y}" width="6" height="${height}" rx="6" fill="${tone.accent}" />
        <text x="${cardX + 22}" y="${y + 36}" fill="#F4F8F1" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${valueFontSize}" font-weight="700">${escapeXml(
          stat.value,
        )}</text>
        ${renderTextLines({
          lines: captionLines,
          x: cardX + 22,
          y: captionStartY,
          lineHeight: singleLineCaptionSize + 2,
          size: singleLineCaptionSize,
          color: stat.tone === "neutral" ? "#9EA9A2" : tone.strong,
          weight: 600,
        })}
      </g>`;
    })
    .join("");
}

export function countyCardPresetById(id: string) {
  return COUNTY_CARD_PRESETS.find((preset) => preset.id === id) ?? COUNTY_CARD_PRESETS[3];
}

export function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildCountyCardSvg({
  preset,
  county,
  detail,
  focalSpecies,
  nearbySpecies,
  countyCategorySignal,
}: {
  preset: CountyCardPreset;
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  countyCategorySignal: CountyCategorySignal | null;
}) {
  const width = preset.width;
  const height = preset.height;
  const primaryTone = getToneColors(countyCategorySignal?.category ?? "neutral");
  const framePad = preset.id === "landscape" ? 26 : preset.id === "widescreen" ? 34 : 32;
  const innerX = framePad;
  const innerY = framePad;
  const innerWidth = width - framePad * 2;
  const innerHeight = height - framePad * 2;
  const cardPad = preset.id === "landscape" ? 24 : 30;
  const contentX = innerX + cardPad;
  const contentY = innerY + cardPad;
  const contentWidth = innerWidth - cardPad * 2;
  const contentHeight = innerHeight - cardPad * 2;
  const headline = buildCountyHeadline({ county, detail, focalSpecies });
  const summary = buildCountyCardParagraph({
    county,
    detail,
    focalSpecies,
    nearbySpecies,
    selectedCategories: [],
    categorySignal: countyCategorySignal,
  });
  const stats = buildCountyStats({
    focalSpecies,
    nearbySpecies,
    categorySignal: countyCategorySignal,
  });
  const layout = getPresetLayout({
    preset,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
  });
  const statsY = contentY + contentHeight - layout.statsHeight - layout.statsBottomGap;
  const headlineLines = wrapText(headline, layout.headlineChars, layout.headlineMaxLines);
  const summaryLines = wrapText(summary, layout.summaryChars, layout.summaryMaxLines);
  const cardTitleLines = wrapText(
    `Invasive Species in ${county.name}, ${county.stateCode}`,
    layout.cardTitleChars,
    1,
  );
  const cardTitleY = layout.titleBox.y + layout.cardTitleOffsetY;
  const accentY = layout.titleBox.y + layout.accentOffsetY;
  const headlineY = layout.titleBox.y + layout.headlineOffsetY;
  const summaryStartY =
    headlineY + (headlineLines.length - 1) * layout.headlineLineHeight + layout.summaryGap;
  const textClipX = layout.titleBox.x + 18;
  const textClipY = layout.titleBox.y + 18;
  const textClipWidth = layout.titleBox.width - 36;
  const textClipHeight = layout.titleBox.height - 36;
  const mapPaths = buildMapPaths({
    county,
    mapX: layout.mapBox.x + layout.mapInsetX,
    mapY: layout.mapBox.y + layout.mapInsetTop,
    mapWidth: layout.mapBox.width - layout.mapInsetX * 2,
    mapHeight: layout.mapBox.height - layout.mapInsetTop - layout.mapInsetBottom,
    baseFill: "#13211C",
    stroke: "rgba(255,255,255,0.08)",
  });
  const mapLabel = `${county.name} County in red.`;
  const mapLabelWidth = Math.min(
    layout.mapBox.width - layout.mapLabelOffsetX * 2,
    Math.max(180, Math.round(mapLabel.length * layout.mapLabelSize * 0.64)),
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${escapeXml(`${county.name}, ${county.stateCode} county card`)}}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#07110E" />
      <stop offset="56%" stop-color="#0B1713" />
      <stop offset="100%" stop-color="#10201A" />
    </linearGradient>
    <radialGradient id="glowA" cx="0.08" cy="0.04" r="0.9">
      <stop offset="0%" stop-color="${primaryTone.soft}" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
    <radialGradient id="glowB" cx="0.92" cy="0.1" r="0.72">
      <stop offset="0%" stop-color="rgba(255,255,255,0.06)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.035)}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.035)}" fill="url(#glowA)" />
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.035)}" fill="url(#glowB)" />
  <rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" rx="${Math.round(width * 0.032)}" fill="rgba(14,25,21,0.92)" stroke="rgba(255,255,255,0.08)" />
  <rect x="${layout.titleBox.x}" y="${layout.titleBox.y}" width="${layout.titleBox.width}" height="${layout.titleBox.height}" rx="28" fill="rgba(18,31,27,0.94)" stroke="rgba(255,255,255,0.07)" />
  <g clip-path="url(#textClip)">
    ${renderTextLines({
      lines: cardTitleLines,
      x: layout.titleBox.x + layout.textInsetX,
      y: cardTitleY,
      lineHeight: layout.cardTitleSize + 2,
      size: layout.cardTitleSize,
      color: "#B5C4BB",
      weight: 700,
    })}
    <rect x="${layout.titleBox.x + layout.textInsetX}" y="${accentY}" width="${Math.max(120, layout.titleBox.width * 0.42)}" height="4" rx="4" fill="${primaryTone.accent}" opacity="0.98" />
    ${renderTextLines({
      lines: headlineLines,
      x: layout.titleBox.x + layout.textInsetX,
      y: headlineY,
      lineHeight: layout.headlineLineHeight,
      size: layout.headlineSize,
      color: "#F4F8F1",
      weight: 700,
    })}
    ${renderTextLines({
      lines: summaryLines,
      x: layout.titleBox.x + layout.textInsetX,
      y: summaryStartY,
      lineHeight: layout.summaryLineHeight,
      size: layout.summarySize,
      color: "#D7E1DB",
    })}
  </g>
  <g clip-path="url(#mapClip)">
    ${mapPaths.counties}
    ${
      mapPaths.selectedStatePath
        ? `<path d="${mapPaths.selectedStatePath}" fill="rgba(255,255,255,0.01)" stroke="${primaryTone.accent}" stroke-width="2" />`
        : ""
    }
    ${
      mapPaths.selectedCountyPath
        ? `<path d="${mapPaths.selectedCountyPath}" fill="#F17D5E" stroke="#FFB599" stroke-width="2.2" />`
        : ""
    }
  </g>
  <rect x="${layout.mapBox.x + layout.mapLabelOffsetX}" y="${layout.mapBox.y + layout.mapLabelOffsetY}" width="${mapLabelWidth}" height="${layout.mapLabelSize + 18}" rx="14" fill="rgba(12,23,19,0.9)" stroke="rgba(255,255,255,0.08)" />
  <text x="${layout.mapBox.x + layout.mapLabelOffsetX + 10}" y="${layout.mapBox.y + layout.mapLabelOffsetY + layout.mapLabelSize + 2}" fill="${primaryTone.strong}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${layout.mapLabelSize}" font-weight="700">${escapeXml(
    mapLabel,
  )}</text>
  <defs>
    <clipPath id="mapClip">
      <rect x="${layout.mapBox.x}" y="${layout.mapBox.y}" width="${layout.mapBox.width}" height="${layout.mapBox.height}" rx="20" />
    </clipPath>
    <clipPath id="textClip">
      <rect x="${textClipX}" y="${textClipY}" width="${textClipWidth}" height="${textClipHeight}" rx="24" />
    </clipPath>
  </defs>
  ${renderStatsRow({
    stats,
    x: contentX,
    y: statsY,
    width: contentWidth,
    height: layout.statsHeight,
    valueSize: layout.statValueSize,
    captionSize: layout.statCaptionSize,
  })}
  <text x="${contentX}" y="${innerY + innerHeight - 16}" fill="#D7E7DD" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${layout.footerSize}" font-weight="700">isitusa.com</text>
  <text x="${innerX + innerWidth - cardPad}" y="${innerY + innerHeight - 16}" text-anchor="end" fill="${primaryTone.strong}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${layout.footerSize}" font-weight="700">${escapeXml(
    `${county.name}, ${county.stateCode}`,
  )}</text>
</svg>`;
}
