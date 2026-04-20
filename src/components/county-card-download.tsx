"use client";

import { useEffect, useMemo, useState } from "react";
import NextImage from "next/image";
import { ArrowRight, Check } from "lucide-react";

import type { CountyCategorySignal } from "@/lib/county-detail";
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
  countyCategorySignal,
}: {
  county: CountyRecord;
  detail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  countyCategorySignal: CountyCategorySignal | null;
}) {
  const [presetId, setPresetId] = useState("landscape");
  const [downloadState, setDownloadState] = useState<"idle" | "rendering" | "done">("idle");
  const preset = countyCardPresetById(presetId);

  useEffect(() => {
    if (downloadState !== "done") return;
    const timeout = window.setTimeout(() => setDownloadState("idle"), 1500);
    return () => window.clearTimeout(timeout);
  }, [downloadState]);

  const svgMarkup = useMemo(
    () =>
      buildCountyCardSvg({
        preset,
        county,
        detail,
        focalSpecies,
        nearbySpecies,
        countyCategorySignal,
      }),
    [county, countyCategorySignal, detail, focalSpecies, nearbySpecies, preset],
  );
  const previewSrc = useMemo(() => svgToDataUri(svgMarkup), [svgMarkup]);

  async function handleDownloadPng() {
    setDownloadState("rendering");

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
      setDownloadState("done");
    } catch {
      setDownloadState("idle");
    }
  }

  const svgDownloadHref = useMemo(() => previewSrc, [previewSrc]);
  const isRendering = downloadState === "rendering";
  const isDone = downloadState === "done";

  return (
    <section className="grid gap-4 xl:sticky xl:top-6">
      <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-[linear-gradient(160deg,rgba(9,19,16,0.98),rgba(15,28,23,0.92))] p-3 shadow-[var(--shadow)]">
        <NextImage
          src={previewSrc}
          alt={`${county.name}, ${county.stateCode} county card preview`}
          width={preset.width}
          height={preset.height}
          unoptimized
          className="h-auto w-full rounded-[22px]"
        />
      </div>

      <div className="grid grid-cols-[0.78fr_0.88fr_0.76fr_1fr_0.7fr_1.08fr] gap-2">
        {COUNTY_CARD_PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setPresetId(option.id)}
            className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border px-1.5 py-2 text-center text-[10px] font-medium leading-none sm:text-[11px] ${
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
          disabled={isRendering}
          className={`county-download-button group inline-flex items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold ${
            isDone ? "is-done" : ""
          }`}
        >
          {isDone ? (
            <>
              <Check size={16} />
              <span>Downloaded</span>
            </>
          ) : (
            <>
              <span>{isRendering ? "Rendering PNG..." : "Download PNG"}</span>
              <ArrowRight
                size={16}
                className={`county-download-arrow ${isRendering ? "opacity-50" : ""}`}
              />
            </>
          )}
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
