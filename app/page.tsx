import type { Metadata } from "next";
import { Suspense } from "react";
import { MapExplorer } from "@/components/map-explorer";

export const metadata: Metadata = { alternates: { canonical: "https://isitusa.com/" } };

export default function HomePage() {
  return (
    <Suspense fallback={<div role="status" className="mx-auto max-w-[1600px] px-6 py-12 text-[var(--muted)]">Loading map explorer...</div>}>
      <MapExplorer />
    </Suspense>
  );
}
