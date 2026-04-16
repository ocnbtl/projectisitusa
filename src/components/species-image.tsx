"use client";

import Image from "next/image";
import { useState } from "react";

interface SpeciesImageProps {
  src: string;
  alt: string;
  credit: string;
  label: string;
}

export function SpeciesImage({
  src,
  alt,
  credit,
  label,
}: SpeciesImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <>
        <div className="flex min-h-[320px] flex-col justify-between bg-[linear-gradient(160deg,rgba(110,181,134,0.16),transparent_55%),linear-gradient(220deg,rgba(240,181,93,0.14),transparent_50%)] p-6">
          <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
            Image refresh in progress
          </div>
          <div>
            <div className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--foreground)]">
              {label}
            </div>
            <div className="mt-2 text-sm text-[var(--muted)]">
              This species profile image source needs to be refreshed. The profile
              details below are still current.
            </div>
          </div>
        </div>
        <div className="border-t border-[var(--border)] px-5 py-4 text-sm text-[var(--muted)]">
          Intended image credit: {credit}
        </div>
      </>
    );
  }

  return (
    <>
      <Image
        src={src}
        alt={alt}
        width={1600}
        height={1200}
        sizes="(min-width: 1024px) 42vw, 100vw"
        className="h-full min-h-[320px] w-full object-cover"
        unoptimized
        onError={() => setFailed(true)}
      />
      <div className="border-t border-[var(--border)] px-5 py-4 text-sm text-[var(--muted)]">
        Image credit: {credit}
      </div>
    </>
  );
}
