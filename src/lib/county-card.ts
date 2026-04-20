import { geoAlbersUsa, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import countyTopology from "us-atlas/counties-10m.json";
import statesTopology from "us-atlas/states-10m.json";

import type { CountyDetail, CountyRecord } from "@/lib/data/types";
import {
  buildCountyCardSummary,
  formatCountyEvidenceLabel,
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
    surface: "1:1 reposts",
  },
  {
    id: "portrait",
    label: "Portrait",
    width: 1080,
    height: 1350,
    surface: "Instagram feed",
  },
  {
    id: "story",
    label: "Story",
    width: 1080,
    height: 1920,
    surface: "Stories and reels",
  },
  {
    id: "landscape",
    label: "Landscape",
    width: 1200,
    height: 628,
    surface: "X and wide previews",
  },
  {
    id: "tall",
    label: "Tall",
    width: 1080,
    height: 1620,
    surface: "Tall mobile posts",
  },
  {
    id: "widescreen",
    label: "Widescreen",
    width: 1920,
    height: 1080,
    surface: "16:9 screens",
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

  const consumed = lines.join(" ").length;
  if (consumed < text.trim().length && lines.length > 0) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.endsWith("...") ? last : `${last.replace(/[.,;:!?]+$/, "")}...`;
  }

  return lines;
}

function getBadgeColors(detail: CountyDetail | null) {
  switch (detail?.evidenceLevel) {
    case "county-specific":
      return {
        fill: "#DCEFD9",
        stroke: "#4F8F66",
        text: "#2E5B3E",
      };
    case "statewide-only":
      return {
        fill: "#F6E7D2",
        stroke: "#D9893F",
        text: "#7A4D1F",
      };
    default:
      return {
        fill: "#E7EAE6",
        stroke: "#859086",
        text: "#47524A",
      };
  }
}

export function countyCardPresetById(id: string) {
  return COUNTY_CARD_PRESETS.find((preset) => preset.id === id) ?? COUNTY_CARD_PRESETS[0];
}

export function svgToDataUri(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildCountyCardSvg({
  preset,
  county,
  detail,
  focalSpeciesCount,
  nearbySpeciesCount,
  unresolvedCount,
  filterLabel,
}: {
  preset: CountyCardPreset;
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpeciesCount: number;
  nearbySpeciesCount: number;
  unresolvedCount: number;
  filterLabel: string;
}) {
  const width = preset.width;
  const height = preset.height;
  const isVertical = height / width >= 1.35;
  const isHorizontal = width / height >= 1.35;
  const padding = Math.round(width * 0.055);
  const stateFips = county.countyFips.slice(0, 2);
  const badge = getBadgeColors(detail);
  const countyFeature = countyFeatureByFips.get(county.countyFips);
  const stateFeature = stateFeatureByFips.get(stateFips);
  const projection = geoAlbersUsa();
  const mapTop = isVertical ? height * 0.5 : padding;
  const mapLeft = isHorizontal ? width * 0.54 : padding;
  const mapWidth = isHorizontal ? width * 0.4 : width - padding * 2;
  const mapHeight = isVertical ? height * 0.3 : isHorizontal ? height - padding * 2 : height * 0.34;

  projection.fitExtent(
    [
      [mapLeft, mapTop],
      [mapLeft + mapWidth, mapTop + mapHeight],
    ],
    {
      type: "FeatureCollection",
      features: lower48States,
    } as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  );

  const path = geoPath(projection);
  const backgroundStatePaths = lower48States
    .map((item) => {
      const outline = path(item as never);
      if (!outline) return "";
      return `<path d="${outline}" fill="#F5F6F1" stroke="rgba(23,30,27,0.12)" stroke-width="0.9" />`;
    })
    .join("");

  const selectedStatePath = stateFeature ? path(stateFeature as never) : null;
  const selectedCountyPath = countyFeature ? path(countyFeature as never) : null;
  const resourceLabels = detail?.resources.slice(0, 2).map((resource) => resource.label) ?? [];
  const resourceLine =
    resourceLabels.length > 0
      ? resourceLabels.join(" / ")
      : "Local source curation still in progress";
  const badgeWidth = Math.max(
    260,
    Math.round(width * (isVertical ? 0.54 : isHorizontal ? 0.3 : 0.4)),
  );
  const summary = buildCountyCardSummary({
    county,
    detail,
    focalSpeciesCount,
    nearbySpeciesCount,
    unresolvedCount,
  });
  const summaryLines = wrapText(summary, isVertical ? 34 : isHorizontal ? 52 : 42, isVertical ? 6 : 5);
  const resourceLines = wrapText(resourceLine, isVertical ? 34 : isHorizontal ? 44 : 40, 2);
  const statFontSize = Math.max(28, Math.round(width * 0.026));
  const titleSize = Math.max(42, Math.round(width * (isVertical ? 0.052 : 0.04)));
  const bodySize = Math.max(20, Math.round(width * 0.018));
  const statY = isVertical ? height * 0.79 : height - padding - 120;
  const statWidth = isHorizontal ? width * 0.14 : (width - padding * 2 - 24) / 3;
  const statGap = 12;
  const stats = [
    {
      label: "Mapped",
      value: focalSpeciesCount.toLocaleString(),
    },
    {
      label: "Nearby",
      value: nearbySpeciesCount.toLocaleString(),
    },
    {
      label: "Gaps",
      value: unresolvedCount.toLocaleString(),
    },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" role="img" aria-label="${escapeXml(`${county.name}, ${county.stateCode} county card`)}}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#F4F5EF" />
      <stop offset="60%" stop-color="#EDF1E5" />
      <stop offset="100%" stop-color="#F8EEE6" />
    </linearGradient>
    <radialGradient id="glow" cx="0.15" cy="0.1" r="0.85">
      <stop offset="0%" stop-color="rgba(116,181,132,0.28)" />
      <stop offset="100%" stop-color="rgba(116,181,132,0)" />
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.03)}" fill="url(#bg)" />
  <rect width="${width}" height="${height}" rx="${Math.round(width * 0.03)}" fill="url(#glow)" />
  <rect x="${padding}" y="${padding}" width="${isHorizontal ? width * 0.44 : width - padding * 2}" height="${isVertical ? height * 0.36 : isHorizontal ? height - padding * 2 : height * 0.42}" rx="30" fill="rgba(255,255,255,0.72)" stroke="rgba(23,30,27,0.1)" />
  <text x="${padding + 26}" y="${padding + 42}" fill="#4F8F66" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.92)}" font-weight="700" letter-spacing="2.4">PROJECT ISITUSA</text>
  <text x="${padding + 26}" y="${padding + 96}" fill="#171E1B" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${titleSize}" font-weight="700">${escapeXml(county.name)}, ${escapeXml(county.stateCode)}</text>
  <text x="${padding + 26}" y="${padding + 130}" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${bodySize}" font-weight="600">${escapeXml(filterLabel)} / ${escapeXml(preset.surface)}</text>
  <rect x="${padding + 24}" y="${padding + 150}" width="${badgeWidth}" height="38" rx="19" fill="${badge.fill}" stroke="${badge.stroke}" />
  <text x="${padding + 43}" y="${padding + 174}" fill="${badge.text}" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.88)}" font-weight="700">${escapeXml(
    formatCountyEvidenceLabel(detail?.evidenceLevel ?? "not-reviewed"),
  )}</text>
  ${summaryLines
    .map(
      (line, index) =>
        `<text x="${padding + 26}" y="${padding + 228 + index * (bodySize + 10)}" fill="#23312A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${bodySize}" font-weight="500">${escapeXml(
          line,
        )}</text>`,
    )
    .join("")}
  <text x="${padding + 26}" y="${isVertical ? height * 0.44 : isHorizontal ? height - padding - 168 : height * 0.36}" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.88)}" font-weight="700">VERIFIED SOURCES</text>
  ${resourceLines
    .map(
      (line, index) =>
        `<text x="${padding + 26}" y="${(isVertical ? height * 0.44 : isHorizontal ? height - padding - 136 : height * 0.39) + index * (bodySize + 8)}" fill="#334039" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.92)}">${escapeXml(
          line,
        )}</text>`,
    )
    .join("")}
  <g>
    <rect x="${mapLeft}" y="${mapTop}" width="${mapWidth}" height="${mapHeight}" rx="28" fill="rgba(255,255,255,0.72)" stroke="rgba(23,30,27,0.1)" />
    <g clip-path="url(#mapClip)">
      ${backgroundStatePaths}
      ${
        selectedStatePath
          ? `<path d="${selectedStatePath}" fill="rgba(79,143,102,0.18)" stroke="rgba(79,143,102,0.8)" stroke-width="1.3" />`
          : ""
      }
      ${
        selectedCountyPath
          ? `<path d="${selectedCountyPath}" fill="#D77963" stroke="#A84837" stroke-width="2.2" />`
          : ""
      }
    </g>
  </g>
  <defs>
    <clipPath id="mapClip">
      <rect x="${mapLeft}" y="${mapTop}" width="${mapWidth}" height="${mapHeight}" rx="28" />
    </clipPath>
  </defs>
  <text x="${mapLeft + 22}" y="${mapTop + 36}" fill="#47524A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.82)}" font-weight="700">COUNTY IN CONTEXT</text>
  <text x="${mapLeft + 22}" y="${mapTop + 62}" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.72)}">${escapeXml(county.stateName)} highlighted in green, selected county in coral.</text>
  ${stats
    .map((stat, index) => {
      const x = padding + index * (statWidth + statGap);
      const y = statY;
      return `<g>
        <rect x="${x}" y="${y}" width="${statWidth}" height="102" rx="24" fill="rgba(255,255,255,0.82)" stroke="rgba(23,30,27,0.08)" />
        <text x="${x + 20}" y="${y + 40}" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.8)}" font-weight="700">${escapeXml(
          stat.label,
        )}</text>
        <text x="${x + 20}" y="${y + 82}" fill="#171E1B" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${statFontSize}" font-weight="700">${escapeXml(
          stat.value,
        )}</text>
      </g>`;
    })
    .join("")}
  <text x="${padding}" y="${height - 28}" fill="#47524A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.82)}">isitusa.com</text>
  <text x="${width - padding}" y="${height - 28}" text-anchor="end" fill="#66706A" font-family="'Avenir Next', 'Segoe UI', sans-serif" font-size="${Math.round(bodySize * 0.76)}">Downloadable county card</text>
</svg>`;
}
