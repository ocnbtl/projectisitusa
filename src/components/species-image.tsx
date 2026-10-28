"use client";

import Image from "next/image";
import { PhotoCredit } from "./photo-credit";
import { useState } from "react";

interface SpeciesImageProps {
  src: string;
  alt: string;
  credit: string;
  label: string;
  sourceUrl?: string;
  license?: string;
}

export function SpeciesImage({
  src,
  alt,
  credit,
  label, sourceUrl, license,
}: SpeciesImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <>
        <div className="flex min-h-[240px] flex-col justify-between bg-[var(--background)] p-6">
          <div className="text-sm text-[var(--muted)]">
            Image unavailable
          </div>
          <div>
            <div className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--foreground)]">
              {label}
            </div>
            <div className="mt-2 text-sm text-[var(--muted)]">
              The image could not load. Profile references remain available below.
            </div>
          </div>
        </div>
        <div className="profile-photo-credit"><PhotoCredit name={label} credit={credit} sourceUrl={sourceUrl} license={license}/><span>Photo credit</span></div>
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
        className="aspect-[4/3] w-full object-cover"
        unoptimized
        onError={() => setFailed(true)}
      />
      <div className="profile-photo-credit"><PhotoCredit name={label} credit={credit} sourceUrl={sourceUrl} license={license}/><span>Photo credit</span></div>
    </>
  );
}
