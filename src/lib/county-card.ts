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
        accent: "#4F8F66",
        soft: "#DDEEDD",
        strong: "#2E5B3E",
      };
    case "insects":
      return {
        accent: "#D9893F",
        soft: "#F7E7D2",
        strong: "#7A4D1F",
      };
    case "fungi-diseases":
      return {
        accent: "#D77963",
        soft: "#F5E0DA",
        strong: "#7C4032",
      };
    case "wildlife":
      return {
        accent: "#4B79A8",
        soft: "#DCE7F3",
        strong: "#274460",
      };
    default:
      return {
        accent: "#8A948E",
        soft: "#E7EAE6",
        strong: "#47524A",
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
}: {
  county: CountyRecord;
  mapX: number;
  mapY: number;
  mapWidth: number;
  mapHeight: number;
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
      return `<path d="${outline}" fill="#FAFBF7" stroke="rgba(23,30,27,0.1)" stroke-width="0.9" />`;
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
}: {
  stats: CountyStat[];
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const gap = 12;
  const cardWidth = Math.floor((width - gap * 2) / 3);

  return stats
    .map((stat, index) => {
      const cardX = x + index * (cardWidth + gap);
      const tone = getToneColors(stat.tone);

      return `<g>
        <rect x="${cardX}" y="${y}" width="${cardWidth}" height="${height}" rx="22" fill="${tone.soft}" stroke="rgba(23,30,27,0.08)" />
        <rect x="${cardX}" y="${y}" width="6" height="${height}" rx="6" fill="${tone.accent}" />
        <text x="${cardX + 22}" y="${y + 34}" fill="#171E1B" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="30" font-weight="700">${escapeXml(
          stat.value,
        )}</text>
        <text x="${cardX + 22}" y="${y + 58}" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="14" font-weight="600">${escapeXml(
          stat.caption,
        )}</text>
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
  const mode = getLayoutMode(preset);
  const primaryTone = getToneColors(countyCategorySignal?.category ?? "neutral");
  const framePad = mode === "horizontal" ? 26 : 34;
  const innerX = framePad;
  const innerY = framePad;
  const innerWidth = width - framePad * 2;
  const innerHeight = height - framePad * 2;
  const cardPad = mode === "horizontal" ? 28 : 34;
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
  const headlineLines = wrapText(
    headline,
    mode === "horizontal" ? 28 : mode === "story" ? 23 : 24,
    2,
  );
  const summaryLines = wrapText(
    summary,
    mode === "horizontal" ? 44 : mode === "story" ? 30 : 34,
    mode === "horizontal" ? 5 : mode === "story" ? 6 : 5,
  );
  const resourceLines = wrapText(resourceText, mode === "horizontal" ? 48 : 38, 1);

  let textPanelX = contentX;
  let textPanelY = contentY;
  let textPanelWidth = contentWidth;
  let textPanelHeight = Math.round(contentHeight * 0.34);
  let mapPanelX = contentX;
  let mapPanelY = contentY;
  let mapPanelWidth = contentWidth;
  let mapPanelHeight = Math.round(contentHeight * 0.38);
  let statsY = contentY;

  if (mode === "horizontal") {
    textPanelWidth = Math.round(contentWidth * 0.43);
    textPanelHeight = Math.round(contentHeight * 0.58);
    mapPanelWidth = Math.round(contentWidth * 0.51);
    mapPanelHeight = Math.round(contentHeight * 0.62);
    mapPanelX = contentX + contentWidth - mapPanelWidth;
    mapPanelY = contentY;
    statsY = contentY + contentHeight - 92;
  } else if (mode === "story") {
    textPanelHeight = 360;
    mapPanelY = contentY + 430;
    mapPanelHeight = 980;
    statsY = contentY + contentHeight - 120;
  } else if (mode === "vertical") {
    textPanelHeight = 290;
    mapPanelY = contentY + 360;
    mapPanelHeight = 720;
    statsY = contentY + contentHeight - 118;
  } else {
    textPanelHeight = 250;
    mapPanelY = contentY + 320;
    mapPanelHeight = 420;
    statsY = contentY + contentHeight - 118;
  }

  const summaryStartY = textPanelY + 118;
  const resourcesY = summaryStartY + summaryLines.length * 26 + 28;
  const mapPaths = buildMapPaths({
    county,
    mapX: mapPanelX + 24,
    mapY: mapPanelY + 36,
    mapWidth: mapPanelWidth - 48,
    mapHeight: mapPanelHeight - 60,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${escapeXml(`${county.name}, ${county.stateCode} county card`)}}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F7FAF4" />
      <stop offset="56%" stop-color="#F2F6EE" />
      <stop offset="100%" stop-color="#FBF2E7" />
    </linearGradient>
    <radialGradient id="glowA" cx="0.08" cy="0.04" r="0.9">
      <stop offset="0%" stop-color="${primaryTone.soft}" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
    <radialGradient id="glowB" cx="0.92" cy="0.1" r="0.72">
      <stop offset="0%" stop-color="rgba(215,121,99,0.14)" />
      <stop offset="100%" stop-color="rgba(255,255,255,0)" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.035)}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.035)}" fill="url(#glowA)" />
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.035)}" fill="url(#glowB)" />
  <rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" rx="${Math.round(width * 0.032)}" fill="rgba(255,255,255,0.74)" stroke="rgba(23,30,27,0.08)" />
  <rect x="${textPanelX}" y="${textPanelY}" width="${textPanelWidth}" height="${textPanelHeight}" rx="30" fill="rgba(255,255,255,0.86)" stroke="rgba(23,30,27,0.06)" />
  <rect x="${textPanelX}" y="${textPanelY}" width="${textPanelWidth}" height="12" rx="12" fill="${primaryTone.accent}" />
  ${renderTextLines({
    lines: headlineLines,
    x: textPanelX + 26,
    y: textPanelY + 78,
    lineHeight: mode === "horizontal" ? 42 : 50,
    size: mode === "horizontal" ? 42 : mode === "story" ? 48 : 44,
    color: "#171E1B",
    weight: 700,
  })}
  <text x="${textPanelX + 26}" y="${textPanelY + 102 + headlineLines.length * (mode === "horizontal" ? 42 : 50)}" fill="${primaryTone.strong}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${mode === "horizontal" ? 18 : 19}" font-weight="700">${escapeXml(
    filterLabel,
  )}</text>
  ${renderTextLines({
    lines: summaryLines,
    x: textPanelX + 26,
    y: summaryStartY,
    lineHeight: 26,
    size: mode === "horizontal" ? 18 : 20,
    color: "#23312A",
  })}
  ${renderTextLines({
    lines: resourceLines,
    x: textPanelX + 26,
    y: resourcesY,
    lineHeight: 22,
    size: 15,
    color: "#66706A",
    weight: 600,
  })}
  <rect x="${mapPanelX}" y="${mapPanelY}" width="${mapPanelWidth}" height="${mapPanelHeight}" rx="30" fill="rgba(255,255,255,0.8)" stroke="rgba(23,30,27,0.06)" />
  <text x="${mapPanelX + 24}" y="${mapPanelY + 28}" fill="${primaryTone.strong}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="15" font-weight="700">${escapeXml(
    `${county.stateName} in green, county in coral.`,
  )}</text>
  <g clip-path="url(#mapClip)">
    ${mapPaths.states}
    ${
      mapPaths.selectedStatePath
        ? `<path d="${mapPaths.selectedStatePath}" fill="${primaryTone.soft}" stroke="${primaryTone.accent}" stroke-width="1.4" />`
        : ""
    }
    ${
      mapPaths.selectedCountyPath
        ? `<path d="${mapPaths.selectedCountyPath}" fill="#D77963" stroke="#A84837" stroke-width="2.2" />`
        : ""
    }
  </g>
  <defs>
    <clipPath id="mapClip">
      <rect x="${mapPanelX}" y="${mapPanelY}" width="${mapPanelWidth}" height="${mapPanelHeight}" rx="30" />
    </clipPath>
  </defs>
  ${renderStatsRow({
    stats,
    x: contentX,
    y: statsY,
    width: contentWidth,
    height: 82,
  })}
  <text x="${contentX}" y="${innerY + innerHeight - 16}" fill="#47524A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="14">isitusa.com</text>
  <text x="${innerX + innerWidth - cardPad}" y="${innerY + innerHeight - 16}" text-anchor="end" fill="${primaryTone.strong}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="14">${escapeXml(
    county.name,
  )}</text>
</svg>`;
}
