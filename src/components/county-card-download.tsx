"use client";

import { useMemo, useState } from "react";
import NextImage from "next/image";

import type { CountyDetail, CountyRecord, ExplorerSpecies } from "@/lib/data/types";
import {
  COUNTY_CARD_PRESETS,
  buildCountyCardSvg,
  countyCardPresetById,
  svgToDataUri,
} from "@/lib/county-card";

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CountyCardDownload({
  county,
  detail,
  focalSpecies,
  nearbySpecies,
  unresolvedCount,
  filterLabel,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  unresolvedCount: number;
  filterLabel: string;
}) {
  const [presetId, setPresetId] = useState("story");
  const [isDownloading, setIsDownloading] = useState(false);
  const preset = countyCardPresetById(presetId);

  const svgMarkup = useMemo(
    () =>
      buildCountyCardSvg({
        preset,
        county,
        detail,
        focalSpecies,
        nearbySpecies,
        unresolvedCount,
        filterLabel,
      }),
    [county, detail, filterLabel, focalSpecies, nearbySpecies, preset, unresolvedCount],
  );
  const previewSrc = useMemo(() => svgToDataUri(svgMarkup), [svgMarkup]);

  async function handleDownloadPng() {
    setIsDownloading(true);

    try {
      const image = new window.Image();
      image.decoding = "async";

      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("County card image failed to render."));
        image.src = previewSrc;
      });

      const canvas = document.createElement("canvas");
      canvas.width = preset.width;
      canvas.height = preset.height;
      const context = canvas.getContext("2d");

      if (!context) {
        throw new Error("Canvas rendering is not available in this browser.");
      }

      context.drawImage(image, 0, 0, preset.width, preset.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png", 1),
      );

      if (!blob) {
        throw new Error("County card export failed.");
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${slugify(county.name)}-${county.stateCode.toLowerCase()}-county-card-${preset.id}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setIsDownloading(false);
    }
  }

  const svgDownloadHref = useMemo(() => previewSrc, [previewSrc]);

  return (
    <section className="grid gap-4 xl:sticky xl:top-6">
      <div className="flex items-end justify-between gap-4">
        <p className="text-sm text-[var(--muted)]">
          {preset.label} {preset.width} x {preset.height}
        </p>
        <p className="text-sm text-[var(--muted)]">isitusa.com</p>
      </div>

      <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-[color:rgba(255,255,255,0.5)] p-3 shadow-[var(--shadow)]">
        <NextImage
          src={previewSrc}
          alt={`${county.name}, ${county.stateCode} county card preview`}
          width={preset.width}
          height={preset.height}
          unoptimized
          className="h-auto w-full rounded-[22px]"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {COUNTY_CARD_PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setPresetId(option.id)}
            className={`rounded-full border px-3 py-2 text-sm ${
              option.id === preset.id
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--background)]"
                : "border-[var(--border)] bg-[var(--background)] text-[var(--foreground)]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="grid gap-2">
        <button
          type="button"
          onClick={handleDownloadPng}
          disabled={isDownloading}
          className="locate-button rounded-full px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isDownloading ? "Rendering PNG..." : "Download PNG"}
        </button>
        <a
          href={svgDownloadHref}
          download={`${slugify(county.name)}-${county.stateCode.toLowerCase()}-county-card-${preset.id}.svg`}
          className="inline-flex items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm font-semibold text-[var(--foreground)]"
        >
          Download SVG
        </a>
      </div>
    </section>
  );
}
