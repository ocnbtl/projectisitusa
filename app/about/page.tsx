import { datasetSnapshot } from "@/lib/data/store";
import { AboutMission } from "@/components/about-mission";
import { ImpactStats } from "@/components/impact-stats";

export default function AboutPage() {
  const snapshotDate = new Date(datasetSnapshot.snapshotDate).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    },
  );

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 sm:px-6 lg:px-8">
      <AboutMission />
      <ImpactStats />
      <section className="glass-panel rounded-[28px] p-6 text-sm leading-7 text-[var(--muted)]">
        <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
          Data foundation
        </p>
        <p className="mt-3">
          Project Isitusa is designed around county-level invasive species
          exploration. The current release uses a full verified lower-48 invasive
          species catalog from US-RIIS, plus a stored merged county presence
          snapshot from {snapshotDate} using EDDMaps and USGS NAS where verified
          county records are available. Remaining county-level gaps are surfaced
          explicitly in the explorer while those records continue to be filled in.
        </p>
      </section>
    </main>
  );
}
