import Link from "next/link";
import { datasetSnapshot } from "@/lib/data/snapshot-store";
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
          The species catalog is based on the U.S. Register of Introduced and
          Invasive Species (US-RIIS). The map starts from a stored county snapshot
          dated {snapshotDate}, using EDDMapS and USGS NAS records. Reviewed county
          research also contributes to the Alabama map. Map counts and national
          research coverage can therefore differ.
        </p>
        <p className="mt-3">
          <Link href="/research" className="underline underline-offset-4">
            County research
          </Link>{" "}
          covers all 50 states and the District of Columbia, using registered
          sources including agency surveys and museum specimens. Each state and
          county view shows its assessment date, evidence, and source links.
          Research releases are updated separately from the map, and many
          county-species pairs remain unresolved.
        </p>
        <p className="mt-3">
          A recorded occurrence may be historical and does not by itself establish
          that a species is present today. Missing records do not establish
          absence. Official absence and eradication findings retain their
          geographic and time scope.
        </p>
      </section>
    </main>
  );
}
