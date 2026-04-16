"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowUpRight,
  Bug,
  Leaf,
  Microscope,
  PawPrint,
  type LucideIcon,
} from "lucide-react";

import type { ExplorerSpecies, SpeciesCategory } from "@/lib/data/types";

function getCategoryMeta(category: SpeciesCategory): {
  icon: LucideIcon;
  label: string;
  accentClass: string;
  iconClass: string;
} {
  switch (category) {
    case "plants":
      return {
        icon: Leaf,
        label: "Plant",
        accentClass: "from-emerald-500/80 to-lime-400/80",
        iconClass: "text-emerald-300",
      };
    case "insects":
      return {
        icon: Bug,
        label: "Insect",
        accentClass: "from-amber-500/80 to-orange-400/80",
        iconClass: "text-amber-300",
      };
    case "wildlife":
      return {
        icon: PawPrint,
        label: "Wildlife",
        accentClass: "from-sky-500/80 to-cyan-400/80",
        iconClass: "text-sky-300",
      };
    case "fungi-diseases":
      return {
        icon: Microscope,
        label: "Fungi & disease",
        accentClass: "from-fuchsia-500/75 to-rose-400/75",
        iconClass: "text-fuchsia-300",
      };
  }
}

export function SpeciesCard({
  species,
  metricMax,
}: {
  species: ExplorerSpecies;
  metricMax: number;
}) {
  const categoryMeta = getCategoryMeta(species.category);
  const CategoryIcon = categoryMeta.icon;
  const [imageFailed, setImageFailed] = useState(false);
  const mappedCountyCount = species.registry?.mappedCountyCount ?? 0;
  const fillWidth =
    metricMax > 0 ? Math.max(8, Math.round((mappedCountyCount / metricMax) * 100)) : 0;

  return (
    <article className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-start gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--border)] bg-transparent">
          {species.image && !imageFailed ? (
            <Image
              src={species.image.src}
              alt={species.image.alt}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
              loading="lazy"
              onError={() => setImageFailed(true)}
            />
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">
                {species.commonName}
              </h3>
              <p className="truncate text-sm italic text-[var(--muted)]">
                {species.scientificName}
              </p>
            </div>
            <Link
              href={`/species/${species.slug}`}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
              aria-label={`Open ${species.commonName}`}
            >
              <ArrowUpRight size={16} />
            </Link>
          </div>

          <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{species.summary}</p>

          <div className="mt-4 flex items-center gap-3">
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--background)] px-2.5 py-1.5 text-[11px] uppercase tracking-[0.14em] text-[var(--foreground)]">
              <CategoryIcon size={14} className={categoryMeta.iconClass} />
              {categoryMeta.label}
            </span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[color:color-mix(in_srgb,var(--foreground)_12%,transparent)]">
              <div
                className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${categoryMeta.accentClass}`}
                style={{ width: `${fillWidth}%` }}
              />
            </div>
            <div className="shrink-0 whitespace-nowrap text-sm text-[var(--foreground)]">
              {mappedCountyCount.toLocaleString()} mapped counties
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
