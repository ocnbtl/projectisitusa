"use client";

import { useMemo, useState } from "react";
import NextImage from "next/image";

import type { CountyDetail, CountyRecord } from "@/lib/data/types";
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
  focalSpeciesCount,
  nearbySpeciesCount,
  unresolvedCount,
  filterLabel,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpeciesCount: number;
  nearbySpeciesCount: number;
  unresolvedCount: number;
  filterLabel: string;
}) {
  const [presetId, setPresetId] = useState(COUNTY_CARD_PRESETS[1]?.id ?? COUNTY_CARD_PRESETS[0].id);
  const [isDownloading, setIsDownloading] = useState(false);
  const preset = countyCardPresetById(presetId);

  const svgMarkup = useMemo(
    () =>
      buildCountyCardSvg({
        preset,
        county,
        detail,
        focalSpeciesCount,
        nearbySpeciesCount,
        unresolvedCount,
        filterLabel,
      }),
    [
      county,
      detail,
      filterLabel,
      focalSpeciesCount,
      nearbySpeciesCount,
      preset,
      unresolvedCount,
    ],
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
    <section className="grid gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">County card</h3>
          <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
            Download a share-ready county card built from the current county view,
            verified local sources, and Project Isitusa branding.
          </p>
        </div>
        <div className="text-sm text-[var(--muted)]">
          Current preset: {preset.label} ({preset.width} x {preset.height})
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[color:rgba(255,255,255,0.58)] p-3">
          <NextImage
            src={previewSrc}
            alt={`${county.name}, ${county.stateCode} county card preview`}
            width={preset.width}
            height={preset.height}
            unoptimized
            className="h-auto w-full rounded-[20px]"
          />
        </div>

        <div className="grid content-start gap-4">
          <div className="grid gap-2">
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
              Export sizes
            </p>
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
            <p className="text-sm text-[var(--muted)]">
              {preset.surface}. The export remains a clean PNG sized for the selected surface.
            </p>
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

          <div className="rounded-[20px] border border-[var(--border)] bg-[var(--background)] px-4 py-4 text-sm text-[var(--muted)]">
            <p className="font-semibold text-[var(--foreground)]">What is included</p>
            <ul className="mt-2 grid gap-2">
              <li>The county name and current filter context</li>
              <li>A county summary grounded in current verified sources</li>
              <li>A U.S. map with the state and county highlighted</li>
              <li>Project Isitusa branding and site link</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
