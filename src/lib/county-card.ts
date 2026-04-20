import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";
import statesTopology from "us-atlas/states-10m.json";

import type { CountyDetail, CountyRecord, ExplorerSpecies } from "@/lib/data/types";
import {
  buildCountyCardParagraph,
  buildCountyHeadline,
  buildCountyResourceLine,
  buildCountyStats,
} from "@/lib/county-detail";

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

    if (current) {
      lines.push(current);
    }
    current = word;

    if (lines.length === maxLines - 1) {
      break;
    }
  }

  if (lines.length < maxLines && current) {
    lines.push(current);
  }

  const flattened = lines.join(" ").trim();
  if (flattened.length < text.trim().length && lines.length > 0) {
    const last = lines[lines.length - 1].replace(/[.,;:!?]+$/, "");
    lines[lines.length - 1] = `${last}...`;
  }

  return lines;
}

function getLayoutMode(preset: CountyCardPreset): LayoutMode {
  if (preset.id === "story") return "story";
  if (preset.width / preset.height >= 1.55) return "horizontal";
  if (preset.height / preset.width >= 1.35) return "vertical";
  return "square";
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
      return `<path d="${outline}" fill="#F7F7F2" stroke="rgba(23,30,27,0.12)" stroke-width="0.9" />`;
    })
    .join("");

  const selectedStatePath = stateFeature ? path(stateFeature as never) : null;
  const selectedCountyPath = countyFeature ? path(countyFeature as never) : null;

  return {
    states,
    selectedStatePath,
    selectedCountyPath,
  };
}

export function countyCardPresetById(id: string) {
  return COUNTY_CARD_PRESETS.find((preset) => preset.id === id) ?? COUNTY_CARD_PRESETS[2];
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
  unresolvedCount,
  filterLabel,
}: {
  preset: CountyCardPreset;
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  unresolvedCount: number;
  filterLabel: string;
}) {
  const width = preset.width;
  const height = preset.height;
  const mode = getLayoutMode(preset);
  const framePad = Math.round(width * 0.045);
  const innerX = framePad;
  const innerY = framePad;
  const innerWidth = width - framePad * 2;
  const innerHeight = height - framePad * 2;
  const cardPad = mode === "story" ? 44 : 38;
  const contentX = innerX + cardPad;
  const contentY = innerY + cardPad;
  const contentWidth = innerWidth - cardPad * 2;
  const contentHeight = innerHeight - cardPad * 2;
  const headline = buildCountyHeadline({
    county,
    detail,
    focalSpecies,
  });
  const summary = buildCountyCardParagraph({
    county,
    detail,
    focalSpecies,
    nearbySpecies,
    unresolvedCount,
    selectedCategories: [],
    filterLabel,
  });
  const resources = buildCountyResourceLine(detail);
  const resourceText = Array.isArray(resources)
    ? resources.slice(0, 3).join(" / ")
    : resources;
  const stats = buildCountyStats({
    focalSpecies,
    nearbySpecies,
    unresolvedCount,
  });
  const filterText = `${filterLabel} / ${preset.surface}`;
  const headlineSize =
    mode === "story" ? 60 : mode === "vertical" ? 54 : mode === "horizontal" ? 42 : 46;
  const labelSize = mode === "story" ? 16 : mode === "horizontal" ? 14 : 15;
  const bodySize = mode === "story" ? 18 : mode === "horizontal" ? 16 : 17;
  const statNumberSize = mode === "story" ? 30 : mode === "horizontal" ? 26 : 28;
  const statLabelSize = mode === "story" ? 15 : 14;
  const headlineLines = wrapText(headline, mode === "horizontal" ? 22 : 24, 2);
  const summaryLines = wrapText(
    summary,
    mode === "story" ? 30 : mode === "vertical" ? 34 : mode === "horizontal" ? 38 : 34,
    mode === "story" ? 7 : mode === "vertical" ? 6 : mode === "horizontal" ? 6 : 5,
  );
  const resourceLines = wrapText(
    resourceText,
    mode === "horizontal" ? 38 : 42,
    1,
  );

  let textX = contentX;
  let textY = contentY;
  let textWidth = contentWidth;
  let mapX = contentX;
  let mapY = contentY;
  let mapWidth = contentWidth;
  let mapHeight = contentHeight * 0.34;
  let statsY = contentY;

  if (mode === "horizontal") {
    textWidth = Math.round(contentWidth * 0.46);
    mapWidth = Math.round(contentWidth * 0.46);
    mapX = contentX + contentWidth - mapWidth;
    mapY = contentY + 14;
    mapHeight = Math.round(contentHeight * 0.62);
    statsY = innerY + innerHeight - 120;
  } else if (mode === "square") {
    mapY = innerY + Math.round(innerHeight * 0.49);
    mapHeight = Math.round(innerHeight * 0.28);
    statsY = innerY + innerHeight - 140;
  } else if (mode === "vertical") {
    mapY = innerY + Math.round(innerHeight * 0.48);
    mapHeight = Math.round(innerHeight * 0.27);
    statsY = innerY + innerHeight - 140;
  } else {
    mapY = innerY + Math.round(innerHeight * 0.45);
    mapHeight = Math.round(innerHeight * 0.3);
    statsY = innerY + innerHeight - 150;
  }

  const summaryStartY =
    textY +
    28 +
    labelSize +
    headlineLines.length * (headlineSize * 0.95) +
    28;
  const resourcesY =
    summaryStartY + summaryLines.length * (bodySize + 12) + (mode === "horizontal" ? 18 : 20);
  const statsGap = 12;
  const statsWidth = Math.floor((contentWidth - statsGap * 2) / 3);
  const statsHeight = mode === "story" ? 96 : 88;
  const footerY = innerY + innerHeight - 28;

  if (mode !== "horizontal") {
    mapHeight = Math.max(260, statsY - mapY - 28);
  }

  const mapPaths = buildMapPaths({
    county,
    mapX: mapX + 16,
    mapY: mapY + 16,
    mapWidth: mapWidth - 32,
    mapHeight: mapHeight - 32,
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${escapeXml(`${county.name}, ${county.stateCode} county card`)}}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F4F5EF" />
      <stop offset="54%" stop-color="#EEF2E7" />
      <stop offset="100%" stop-color="#F7EEE5" />
    </linearGradient>
    <radialGradient id="wash" cx="0.12" cy="0.06" r="0.95">
      <stop offset="0%" stop-color="rgba(116,181,132,0.22)" />
      <stop offset="100%" stop-color="rgba(116,181,132,0)" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.03)}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.03)}" fill="url(#wash)" />
  <rect x="${innerX}" y="${innerY}" width="${innerWidth}" height="${innerHeight}" rx="${Math.round(width * 0.03)}" fill="rgba(255,255,255,0.72)" stroke="rgba(23,30,27,0.08)" />
  <text x="${contentX}" y="${contentY}" fill="#4F8F66" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${labelSize}" font-weight="700" letter-spacing="1.4">isitusa.com</text>
  ${renderTextLines({
    lines: headlineLines,
    x: textX,
    y: textY + 48,
    lineHeight: headlineSize * 0.95,
    size: headlineSize,
    color: "#171E1B",
    weight: 700,
  })}
  <text x="${textX}" y="${textY + 48 + headlineLines.length * (headlineSize * 0.95) + 18}" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${bodySize}" font-weight="600">${escapeXml(filterText)}</text>
  ${renderTextLines({
    lines: summaryLines,
    x: textX,
    y: summaryStartY,
    lineHeight: bodySize + 12,
    size: bodySize,
    color: "#23312A",
    weight: 500,
  })}
  ${renderTextLines({
    lines: resourceLines,
    x: textX,
    y: resourcesY,
    lineHeight: bodySize,
    size: labelSize,
    color: "#66706A",
    weight: 600,
  })}
  <rect x="${mapX}" y="${mapY}" width="${mapWidth}" height="${mapHeight}" rx="26" fill="rgba(255,255,255,0.76)" stroke="rgba(23,30,27,0.08)" />
  <g clip-path="url(#mapClip)">
    ${mapPaths.states}
    ${
      mapPaths.selectedStatePath
        ? `<path d="${mapPaths.selectedStatePath}" fill="rgba(79,143,102,0.18)" stroke="rgba(79,143,102,0.72)" stroke-width="1.3" />`
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
      <rect x="${mapX}" y="${mapY}" width="${mapWidth}" height="${mapHeight}" rx="26" />
    </clipPath>
  </defs>
  <text x="${mapX + 18}" y="${mapY + 26}" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${labelSize}" font-weight="600">${escapeXml(`${county.stateName} in green, county in coral.`)}</text>
  ${stats
    .map((stat, index) => {
      const statX = contentX + index * (statsWidth + statsGap);
      return `<g>
        <rect x="${statX}" y="${statsY}" width="${statsWidth}" height="${statsHeight}" rx="22" fill="rgba(255,255,255,0.8)" stroke="rgba(23,30,27,0.08)" />
        <text x="${statX + 18}" y="${statsY + 34}" fill="#171E1B" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${statNumberSize}" font-weight="700">${escapeXml(
          stat.value,
        )}</text>
        <text x="${statX + 18}" y="${statsY + 60}" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${statLabelSize}" font-weight="600">${escapeXml(
          stat.caption,
        )}</text>
      </g>`;
    })
    .join("")}
  <text x="${contentX}" y="${footerY}" fill="#47524A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${labelSize}">isitusa.com</text>
  <text x="${innerX + innerWidth - cardPad}" y="${footerY}" text-anchor="end" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${labelSize}">${escapeXml(
    county.name,
  )}</text>
</svg>`;
}
