import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { SpeciesImage } from "@/components/species-image";
import speciesResearchEntrypoints from "@/data/research/species-research-entrypoints.json";
import { getSpeciesImageAsset } from "@/lib/data/species-image-assets";
import { speciesBySlug, speciesSlugAliases } from "@/lib/data/species-store";
import { datasetSnapshot } from "@/lib/data/snapshot-store";
import { buildResearchHref } from "@/lib/research/research-deep-link";
import { formatCategoryLabel } from "@/lib/utils";

export const dynamicParams = true;

// Species profiles are rendered and cached on first request. Pre-rendering the
// full registry on every release exceeds the provider's bounded build window.
export function generateStaticParams() {
  return [];
}

export default async function SpeciesProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const legacyImage = getSpeciesImageAsset(`/species/${resolvedParams.slug}`);
  if (legacyImage) redirect(legacyImage.full.src);
  const canonicalSlug = speciesSlugAliases.get(resolvedParams.slug);
  if (canonicalSlug) redirect(`/species/${canonicalSlug}`);
  const species = speciesBySlug.get(resolvedParams.slug);
  if (!species) notFound();

  const isCurated = species.profileType === "curated";
  const researchEntrypoint = speciesResearchEntrypoints.entries.find(
    (entry) => entry.speciesId === species.id,
  );
  const researchHref = buildResearchHref({
    stateCode: researchEntrypoint?.stateCode,
    countyFips: researchEntrypoint?.countyFips,
    speciesQuery: species.id,
  });
  const snapshotDate = new Date(datasetSnapshot.snapshotDate).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "UTC",
  });
  const identification = species.whatToLookFor ?? [];
  const action = isCurated ? species.action : undefined;
  const registry = species.registry;

  return (
    <main id="main-content" className="reading-page">
      <nav aria-label="Species navigation" className="mb-8 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Link href="/species" className="text-link inline-flex min-h-11 items-center gap-2">
          <ArrowLeft size={16} aria-hidden="true" /> All species
        </Link>
        <Link href="/" className="text-link inline-flex min-h-11 items-center">County map</Link>
      </nav>

      <header className="profile-layout grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <div className="reading-hero min-w-0">
          <p className="reading-kicker">{formatCategoryLabel(species.category)} / {species.displayGroup}</p>
          <h1 className="break-words">{species.commonName}</h1>
          <p className="mt-3 text-xl italic leading-8 text-[var(--muted)]">{species.scientificName}</p>
          <p className="mt-6 max-w-xl text-lg leading-8">{species.summary}</p>
          <p className="mt-5 text-sm text-[var(--muted)]">
            {isCurated ? "Field profile with identification and action notes" : "Catalog entry from the registry snapshot"}
          </p>
          <Link href={researchHref} className="primary-button mt-6 inline-flex items-center gap-2">
            Explore county evidence <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="profile-image overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
          {species.image ? (
            <SpeciesImage src={species.image.src} alt={species.image.alt} credit={species.image.credit} label={species.commonName} />
          ) : (
            <div className="flex min-h-72 flex-col justify-end gap-3 bg-[var(--background)] p-8">
              <p className="text-lg italic">{species.scientificName}</p>
              <p className="max-w-sm text-sm leading-6 text-[var(--muted)]">A profile image has not been added for this species.</p>
            </div>
          )}
        </div>
      </header>

      <nav aria-label="On this page" className="my-10 flex flex-wrap gap-x-6 gap-y-2 border-y border-[var(--border)] py-3 text-sm">
        <a href="#identification" className="text-link inline-flex min-h-11 items-center">Identification</a>
        <a href="#background" className="text-link inline-flex min-h-11 items-center">Background & impact</a>
        <a href="#actions" className="text-link inline-flex min-h-11 items-center">What you can do</a>
        <a href="#references" className="text-link inline-flex min-h-11 items-center">References</a>
      </nav>

      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-16">
        <div className="profile-content min-w-0">
          <section id="identification" className="reading-section scroll-mt-24">
            <p className="reading-kicker">In the field</p>
            <h2 className="text-2xl font-semibold">Identification</h2>
            {identification.length ? (
              <ul className="mt-5 divide-y divide-[var(--border)]">
                {identification.map((item) => <li key={item} className="py-4 text-base leading-7">{item}</li>)}
              </ul>
            ) : (
              <p className="mt-4 text-base leading-7 text-[var(--muted)]">
                Detailed identification features have not been added to this
                catalog entry. The image and registry classification alone are
                not enough to confirm an identification. Consult the source
                references for species-specific information.
              </p>
            )}
          </section>

          <section id="background" className="reading-section scroll-mt-24">
            <p className="reading-kicker">The wider picture</p>
            <h2 className="text-2xl font-semibold">Background & impact</h2>
            {species.origin ? (
              <div className="mt-5">
                <h3 className="text-base font-semibold">Origin</h3>
                <p className="mt-2 text-base leading-7 text-[var(--muted)]">{species.origin}</p>
              </div>
            ) : null}
            {species.whyItMatters ? (
              <div className="mt-5">
                <h3 className="text-base font-semibold">Why it matters</h3>
                <p className="mt-2 text-base leading-7 text-[var(--muted)]">{species.whyItMatters}</p>
              </div>
            ) : (
              <p className="mt-4 text-base leading-7 text-[var(--muted)]">
                A species-specific impact summary has not been added to this
                profile. Registry status does not measure local abundance,
                damage, or current county presence.
              </p>
            )}
            {registry ? (
              <dl className="mt-6 grid gap-4 border-t border-[var(--border)] pt-5 text-sm sm:grid-cols-2">
                <div><dt className="text-[var(--muted)]">Registry status, lower 48</dt><dd className="mt-1 font-medium">{registry.statusLabel}</dd></div>
                <div><dt className="text-[var(--muted)]">Establishment means</dt><dd className="mt-1">{registry.establishmentMeans}</dd></div>
                {registry.introDateNumber ? <div><dt className="text-[var(--muted)]">Introduction year noted in registry</dt><dd className="mt-1">{registry.introDateNumber}</dd></div> : null}
                {registry.habitats.length ? <div><dt className="text-[var(--muted)]">Recorded habitats</dt><dd className="mt-1">{registry.habitats.join(", ")}</dd></div> : null}
                {registry.pathways.length ? <div><dt className="text-[var(--muted)]">Recorded introduction pathways</dt><dd className="mt-1">{registry.pathways.join(", ")}</dd></div> : null}
                {registry.family ? <div><dt className="text-[var(--muted)]">Family</dt><dd className="mt-1">{registry.family}</dd></div> : null}
              </dl>
            ) : null}
          </section>

          <section id="actions" className="reading-section scroll-mt-24">
            <p className="reading-kicker">Your next step</p>
            <h2 className="text-2xl font-semibold">What you can do</h2>
            {action ? (
              <>
                <p className="mt-4 text-base leading-7">{action.summary}</p>
                <ol className="mt-5 list-decimal space-y-4 pl-6 text-base leading-7 text-[var(--muted)]">
                  {action.steps.map((step) => <li key={step} className="pl-2">{step}</li>)}
                </ol>
                {action.contactName || action.contactInstructions || action.contactUrl ? (
                  <div className="mt-6 border-l-2 border-[var(--accent)] pl-5">
                    <h3 className="font-semibold">{action.contactName ?? "Contact resource"}</h3>
                    {action.contactInstructions ? <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{action.contactInstructions}</p> : null}
                    {action.contactUrl ? <a href={action.contactUrl} target="_blank" rel="noreferrer" className="text-link mt-3 inline-flex min-h-11 items-center gap-2">Open the authority resource <ArrowUpRight size={15} aria-hidden="true" /></a> : null}
                  </div>
                ) : null}
                {action.safetyNotes ? <p className="mt-6 text-sm leading-7"><strong>Safety note:</strong> {action.safetyNotes}</p> : null}
              </>
            ) : (
              <p className="mt-4 text-base leading-7 text-[var(--muted)]">
                This entry does not yet include species-specific action guidance.
                Use the authority references below for management or reporting
                information, and check the county research for the scope and
                dates of available evidence.
              </p>
            )}
          </section>

          <section id="references" className="reading-section scroll-mt-24">
            <p className="reading-kicker">Follow the evidence</p>
            <h2 className="text-2xl font-semibold">References</h2>
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {species.source.map((source) => (
                <li key={source.url} className="py-3"><a href={source.url} target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">{source.label}<ArrowUpRight size={15} aria-hidden="true" className="shrink-0" /></a></li>
              ))}
            </ul>
            {registry?.authority ? (
              <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
                Registry authority: {registry.authorityUrl ? <a href={registry.authorityUrl} target="_blank" rel="noreferrer" className="text-link">{registry.authority}</a> : registry.authority}
              </p>
            ) : null}
          </section>
        </div>

        <aside className="reading-section lg:sticky lg:top-24" aria-label="County evidence context">
          <p className="reading-kicker">A local question</p>
          <h2 className="text-xl font-semibold">What is recorded near you?</h2>
          {registry?.mappedCountyCount !== undefined ? (
            <p className="mt-4 text-sm leading-7">
              {registry.mappedCountyCount > 0
                ? `${registry.mappedCountyCount.toLocaleString()} counties have records attached to this species in the map snapshot.`
                : "No county records are attached to this species in the map snapshot."}
            </p>
          ) : null}
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Map snapshot: <time dateTime={datasetSnapshot.snapshotDate}>{snapshotDate}</time>.
            Research is released separately and may contain evidence beyond the
            map. A record may be historical; missing records do not establish absence.
          </p>
          <Link href={researchHref} className="text-link mt-4 inline-flex min-h-11 items-center gap-2">
            {researchEntrypoint ? "Open reviewed county evidence" : "Search county research"}
            <ArrowUpRight size={15} aria-hidden="true" className="shrink-0" />
          </Link>
        </aside>
      </div>
    </main>
  );
}
