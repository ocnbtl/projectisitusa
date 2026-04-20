import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";
import statesTopology from "us-atlas/states-10m.json";

import type { CountyCategorySignal, CountyStat } from "@/lib/county-detail";
import {
  buildCountyCardParagraph,
  buildCountyHeadline,
  buildCountyResourceLine,
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

type LayoutMode = "story" | "vertical" | "square" | "horizontal";

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

const lower48States = stateFeatures.filter(
  (item) => !EXCLUDED_STATE_PREFIXES.has(String(item.id).padStart(2, "0")),
);

const countyFeatureByFips = new Map(
  countyFeatures.map((item) => [String(item.id).padStart(5, "0"), item]),
);
const stateFeatureByFips = new Map(
  stateFeatures.map((item) => [String(item.id).padStart(2, "0"), item]),
);

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

function getLayoutMode(preset: CountyCardPreset): LayoutMode {
  if (preset.id === "story") return "story";
  if (preset.width / preset.height >= 1.55) return "horizontal";
  if (preset.height / preset.width >= 1.35) return "vertical";
  return "square";
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
  statsY: number;
  statsHeight: number;
  textInsetX: number;
  headlineChars: number;
  headlineMaxLines: number;
  headlineSize: number;
  headlineLineHeight: number;
  summaryChars: number;
  summaryMaxLines: number;
  summarySize: number;
  summaryLineHeight: number;
  filterSize: number;
  resourceChars: number;
  resourceSize: number;
  resourceLineHeight: number;
  mapLabelSize: number;
  statValueSize: number;
  statCaptionSize: number;
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
      const titleWidth = Math.round(contentWidth * 0.45);
      return {
        titleBox: { x: contentX, y: contentY, width: titleWidth, height: 198 },
        mapBox: {
          x: contentX + titleWidth + 24,
          y: contentY + 4,
          width: contentWidth - titleWidth - 24,
          height: 260,
        },
        statsY: contentY + contentHeight - statsHeight,
        statsHeight,
        textInsetX: 24,
        headlineChars: 23,
        headlineMaxLines: 3,
        headlineSize: 24,
        headlineLineHeight: 28,
        summaryChars: 39,
        summaryMaxLines: 4,
        summarySize: 14,
        summaryLineHeight: 19,
        filterSize: 12,
        resourceChars: 34,
        resourceSize: 11,
        resourceLineHeight: 16,
        mapLabelSize: 12,
        statValueSize: 28,
        statCaptionSize: 11,
      };
    }
    case "widescreen": {
      const titleWidth = Math.round(contentWidth * 0.42);
      return {
        titleBox: { x: contentX, y: contentY, width: titleWidth, height: 286 },
        mapBox: {
          x: contentX + titleWidth + 30,
          y: contentY + 6,
          width: contentWidth - titleWidth - 30,
          height: 344,
        },
        statsY: contentY + contentHeight - statsHeight,
        statsHeight,
        textInsetX: 28,
        headlineChars: 24,
        headlineMaxLines: 3,
        headlineSize: 44,
        headlineLineHeight: 48,
        summaryChars: 43,
        summaryMaxLines: 4,
        summarySize: 22,
        summaryLineHeight: 31,
        filterSize: 18,
        resourceChars: 36,
        resourceSize: 15,
        resourceLineHeight: 20,
        mapLabelSize: 14,
        statValueSize: 40,
        statCaptionSize: 14,
      };
    }
    case "story":
      return {
        titleBox: { x: contentX, y: contentY, width: contentWidth, height: 350 },
        mapBox: {
          x: contentX,
          y: contentY + 388,
          width: contentWidth,
          height: 1040,
        },
        statsY: contentY + contentHeight - statsHeight,
        statsHeight,
        textInsetX: 30,
        headlineChars: 21,
        headlineMaxLines: 3,
        headlineSize: 50,
        headlineLineHeight: 52,
        summaryChars: 28,
        summaryMaxLines: 4,
        summarySize: 22,
        summaryLineHeight: 31,
        filterSize: 18,
        resourceChars: 30,
        resourceSize: 16,
        resourceLineHeight: 22,
        mapLabelSize: 16,
        statValueSize: 36,
        statCaptionSize: 13,
      };
    case "portrait":
      return {
        titleBox: { x: contentX, y: contentY, width: contentWidth, height: 260 },
        mapBox: {
          x: contentX,
          y: contentY + 302,
          width: contentWidth,
          height: 700,
        },
        statsY: contentY + contentHeight - statsHeight,
        statsHeight,
        textInsetX: 28,
        headlineChars: 23,
        headlineMaxLines: 3,
        headlineSize: 34,
        headlineLineHeight: 38,
        summaryChars: 31,
        summaryMaxLines: 4,
        summarySize: 18,
        summaryLineHeight: 25,
        filterSize: 15,
        resourceChars: 34,
        resourceSize: 14,
        resourceLineHeight: 19,
        mapLabelSize: 14,
        statValueSize: 31,
        statCaptionSize: 12,
      };
    case "tall":
      return {
        titleBox: { x: contentX, y: contentY, width: contentWidth, height: 286 },
        mapBox: {
          x: contentX,
          y: contentY + 328,
          width: contentWidth,
          height: 882,
        },
        statsY: contentY + contentHeight - statsHeight,
        statsHeight,
        textInsetX: 28,
        headlineChars: 23,
        headlineMaxLines: 3,
        headlineSize: 38,
        headlineLineHeight: 42,
        summaryChars: 31,
        summaryMaxLines: 4,
        summarySize: 19,
        summaryLineHeight: 27,
        filterSize: 16,
        resourceChars: 34,
        resourceSize: 14,
        resourceLineHeight: 19,
        mapLabelSize: 14,
        statValueSize: 33,
        statCaptionSize: 12,
      };
    case "square":
    default:
      return {
        titleBox: { x: contentX, y: contentY, width: contentWidth, height: 234 },
        mapBox: {
          x: contentX,
          y: contentY + 274,
          width: contentWidth,
          height: 458,
        },
        statsY: contentY + contentHeight - statsHeight,
        statsHeight,
        textInsetX: 26,
        headlineChars: 23,
        headlineMaxLines: 3,
        headlineSize: 29,
        headlineLineHeight: 33,
        summaryChars: 33,
        summaryMaxLines: 3,
        summarySize: 16,
        summaryLineHeight: 22,
        filterSize: 14,
        resourceChars: 34,
        resourceSize: 13,
        resourceLineHeight: 18,
        mapLabelSize: 13,
        statValueSize: 28,
        statCaptionSize: 11,
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
  const projection = geoAlbersUsa();

  projection.fitExtent(
    [
      [mapX, mapY],
      [mapX + mapWidth, mapY + mapHeight],
    ],
    {
      type: "FeatureCollection",
      features: lower48States,
    } as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  );

  const path = geoPath(projection);

  const states = lower48States
    .map((item) => {
      const outline = path(item as never);
      if (!outline) return "";
      return `<path d="${outline}" fill="${baseFill}" stroke="${stroke}" stroke-width="0.9" />`;
    })
    .join("");

  return {
    states,
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
      const captionLines = wrapText(
        stat.caption,
        Math.max(18, Math.floor(cardWidth / 13)),
        2,
      );
      const captionStartY =
        y + height - 18 - (captionLines.length - 1) * (captionSize + 2);

      return `<g>
        <rect x="${cardX}" y="${y}" width="${cardWidth}" height="${height}" rx="22" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.08)" />
        <rect x="${cardX}" y="${y}" width="6" height="${height}" rx="6" fill="${tone.accent}" />
        <text x="${cardX + 22}" y="${y + 36}" fill="#F4F8F1" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${valueSize}" font-weight="700">${escapeXml(
          stat.value,
        )}</text>
        ${renderTextLines({
          lines: captionLines,
          x: cardX + 22,
          y: captionStartY,
          lineHeight: captionSize + 2,
          size: captionSize,
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
  filterLabel,
}: {
  preset: CountyCardPreset;
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  countyCategorySignal: CountyCategorySignal | null;
  filterLabel: string;
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
  const resources = buildCountyResourceLine(detail);
  const resourceText = Array.isArray(resources)
    ? resources.slice(0, 3).join(" / ")
    : resources;
  const layout = getPresetLayout({
    preset,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
  });
  const headlineLines = wrapText(headline, layout.headlineChars, layout.headlineMaxLines);
  const summaryLines = wrapText(summary, layout.summaryChars, layout.summaryMaxLines);
  const resourceLines = wrapText(resourceText, layout.resourceChars, 1);
  const headlineY = layout.titleBox.y + 46;
  const filterY =
    headlineY + (headlineLines.length - 1) * layout.headlineLineHeight + 22;
  const summaryStartY = filterY + 28;
  const resourcesY =
    summaryStartY + (summaryLines.length - 1) * layout.summaryLineHeight + 28;
  const textClipX = layout.titleBox.x + 18;
  const textClipY = layout.titleBox.y + 18;
  const textClipWidth = layout.titleBox.width - 36;
  const textClipHeight = layout.titleBox.height - 36;
  const mapPaths = buildMapPaths({
    county,
    mapX: layout.mapBox.x + 24,
    mapY: layout.mapBox.y + 34,
    mapWidth: layout.mapBox.width - 48,
    mapHeight: layout.mapBox.height - 58,
    baseFill: "#13211C",
    stroke: "rgba(255,255,255,0.08)",
  });

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
  <rect x="${layout.titleBox.x + 18}" y="${layout.titleBox.y + 16}" width="${Math.max(130, layout.titleBox.width * 0.48)}" height="5" rx="5" fill="${primaryTone.accent}" opacity="0.98" />
  <g clip-path="url(#textClip)">
    ${renderTextLines({
      lines: headlineLines,
      x: layout.titleBox.x + layout.textInsetX,
      y: headlineY,
      lineHeight: layout.headlineLineHeight,
      size: layout.headlineSize,
      color: "#F4F8F1",
      weight: 700,
    })}
    <text x="${layout.titleBox.x + layout.textInsetX}" y="${filterY}" fill="${primaryTone.strong}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${layout.filterSize}" font-weight="700">${escapeXml(
      filterLabel,
    )}</text>
    ${renderTextLines({
      lines: summaryLines,
      x: layout.titleBox.x + layout.textInsetX,
      y: summaryStartY,
      lineHeight: layout.summaryLineHeight,
      size: layout.summarySize,
      color: "#D7E1DB",
    })}
    ${renderTextLines({
      lines: resourceLines,
      x: layout.titleBox.x + layout.textInsetX,
      y: resourcesY,
      lineHeight: layout.resourceLineHeight,
      size: layout.resourceSize,
      color: "#92A199",
      weight: 600,
    })}
  </g>
  <rect x="${layout.mapBox.x}" y="${layout.mapBox.y}" width="${layout.mapBox.width}" height="${layout.mapBox.height}" rx="30" fill="rgba(16,28,24,0.96)" stroke="rgba(255,255,255,0.07)" />
  <text x="${layout.mapBox.x + 24}" y="${layout.mapBox.y + 28}" fill="${primaryTone.strong}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${layout.mapLabelSize}" font-weight="700">${escapeXml(
    `${county.stateName} in green, county in coral.`,
  )}</text>
  <g clip-path="url(#mapClip)">
    ${mapPaths.states}
    ${
      mapPaths.selectedStatePath
        ? `<path d="${mapPaths.selectedStatePath}" fill="rgba(120,197,139,0.14)" stroke="${primaryTone.accent}" stroke-width="1.4" />`
        : ""
    }
    ${
      mapPaths.selectedCountyPath
        ? `<path d="${mapPaths.selectedCountyPath}" fill="#F17D5E" stroke="#FFB599" stroke-width="2.2" />`
        : ""
    }
  </g>
  <defs>
    <clipPath id="mapClip">
      <rect x="${layout.mapBox.x}" y="${layout.mapBox.y}" width="${layout.mapBox.width}" height="${layout.mapBox.height}" rx="30" />
    </clipPath>
    <clipPath id="textClip">
      <rect x="${textClipX}" y="${textClipY}" width="${textClipWidth}" height="${textClipHeight}" rx="24" />
    </clipPath>
  </defs>
  ${renderStatsRow({
    stats,
    x: contentX,
    y: layout.statsY,
    width: contentWidth,
    height: layout.statsHeight,
    valueSize: layout.statValueSize,
    captionSize: layout.statCaptionSize,
  })}
  <text x="${contentX}" y="${innerY + innerHeight - 16}" fill="#86948D" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="14">isitusa.com</text>
  <text x="${innerX + innerWidth - cardPad}" y="${innerY + innerHeight - 16}" text-anchor="end" fill="${primaryTone.strong}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="14">${escapeXml(
    `${county.name}, ${county.stateCode}`,
  )}</text>
</svg>`;
}
