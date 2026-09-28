import type { Route } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { SpeciesImage } from "@/components/species-image";
import { SpeciesOccurrenceEvidence } from "@/components/species-occurrence-evidence";
import speciesResearchEntrypoints from "@/data/research/species-research-entrypoints.json";
import { getSpeciesImageAsset } from "@/lib/data/species-image-assets";
import { speciesBySlug, speciesSlugAliases } from "@/lib/data/species-store";
import { buildResearchHref } from "@/lib/research/research-deep-link";
import { getDisplaySpecies, getSpeciesEditorial } from "@/lib/ui/species-editorial";
import { formatCategoryLabel } from "@/lib/utils";

export const dynamicParams = true;

// Profiles remain cached on first request; the full catalog is not pre-rendered.
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
  // Verified static asset paths are not represented by generated app-route types.
  if (legacyImage) redirect(legacyImage.full.src as Route);
  const canonicalSlug = speciesSlugAliases.get(resolvedParams.slug);
  if (canonicalSlug) redirect(`/species/${canonicalSlug}`);
  const sourceSpecies = speciesBySlug.get(resolvedParams.slug);
  if (!sourceSpecies) notFound();
  const species = getDisplaySpecies(sourceSpecies);

  const editorial = getSpeciesEditorial(species);
  const references = [...editorial.sources, ...species.source].filter((source, i, all) => all.findIndex(item => item.url === source.url) === i);
  const isCurated = species.profileType === "curated";
  const researchEntrypoint = speciesResearchEntrypoints.entries.find(
    (entry) => entry.speciesId === species.id,
  );
  const researchHref = buildResearchHref({
    stateCode: researchEntrypoint?.stateCode,
    countyFips: researchEntrypoint?.countyFips,
    speciesQuery: species.id,
  });
  const identification = species.whatToLookFor ?? [];
  const action = isCurated ? species.action : undefined;
  const registry = species.registry;

  return (
    <main id="main-content" className="reading-page species-profile">
      <nav aria-label="Species navigation" className="mb-7 flex flex-wrap gap-x-6 gap-y-3 text-sm">
        <Link href="/species" className="text-link inline-flex min-h-11 items-center gap-2">
          <ArrowLeft size={16} aria-hidden="true" /> All species
        </Link>
        <Link href={`/?species=${species.id}`} className="text-link inline-flex min-h-11 items-center">Find on the map</Link>
      </nav>

      <header className={`profile-layout ${species.image ? "" : "profile-without-image"} grid items-start gap-8 lg:gap-12`}>
        <div className="reading-hero profile-heading min-w-0">
          <h1 className="break-words">{species.commonName}</h1>
          <p className="mt-3 text-xl italic leading-8 text-[var(--muted)]">{species.scientificName}</p>
          {editorial.summary ? <p className="mt-6 max-w-xl text-lg leading-8">{editorial.summary}</p> : null}
          <dl className="profile-facts mt-6 flex flex-wrap gap-x-8 gap-y-4 text-sm">
            <div><dt className="text-[var(--muted)]">Category</dt><dd className={"mt-1 category-tag category-" + species.category}>{formatCategoryLabel(species.category)}</dd></div>
            {registry?.family ? <div><dt className="text-[var(--muted)]">Family</dt><dd className="mt-1">{registry.family}</dd></div> : null}
          </dl>
        </div>
        {species.image ? (
          <div className="profile-image overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
            <SpeciesImage src={species.image.src} alt={species.image.alt} credit={species.image.credit} label={species.commonName} />
          </div>
        ) : null}
      </header>

      <section className="profile-sources reading-section" aria-labelledby="profile-sources-heading">
        <h2 id="profile-sources-heading">Profile references</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {references.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noreferrer" className="text-link inline-flex min-h-11 items-center gap-2">
                {source.label} <ArrowUpRight size={14} aria-hidden="true" className="shrink-0" />
              </a>
            </li>
          ))}
        </ul>
        {registry?.authority ? (
          <p className="mt-3 text-sm leading-7 text-[var(--muted)]">
            Registry reference: {registry.authorityUrl ? <a href={registry.authorityUrl} target="_blank" rel="noreferrer" className="text-link">{registry.authority}</a> : registry.authority}
          </p>
        ) : null}
      </section>

      <div className="scroll-mt-24">
        <Suspense fallback={<p role="status" className="reading-section text-sm text-[var(--muted)]">Opening recorded occurrences...</p>}>
          <SpeciesOccurrenceEvidence speciesId={species.id} commonName={species.commonName} />
        </Suspense>
      </div>

      <div className="profile-reading profile-content">
        {identification.length > 0 ? (
          <section id="identification" className="reading-section scroll-mt-24">
            <h2>How to recognize it</h2>
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {identification.map((item) => <li key={item} className="py-4 text-base leading-7">{item}</li>)}
            </ul>
          </section>
        ) : null}

        {species.origin || species.whyItMatters ? (
          <section id="background" className="reading-section scroll-mt-24">
            <h2>Background & impact</h2>
            {species.origin ? <p className="mt-4 text-base leading-8 text-[var(--muted)]">{species.origin}</p> : null}
            {species.whyItMatters ? <p className="mt-4 text-base leading-8 text-[var(--muted)]">{species.whyItMatters}</p> : null}
          </section>
        ) : null}

        {action ? (
          <section id="actions" className="reading-section scroll-mt-24">
            <h2>What you can do</h2>
            <p className="mt-4 text-base leading-7">{action.summary}</p>
            {action.steps.length > 0 ? (
              <ol className="mt-5 list-decimal space-y-4 pl-6 text-base leading-7 text-[var(--muted)]">
                {action.steps.map((step) => <li key={step} className="pl-2">{step}</li>)}
              </ol>
            ) : null}
            {action.contactName || action.contactInstructions || action.contactUrl ? (
              <div className="mt-6 border-l-2 border-[var(--accent)] pl-5">
                {action.contactName ? <h3 className="font-semibold">{action.contactName}</h3> : null}
                {action.contactInstructions ? <p className="mt-2 text-sm leading-7 text-[var(--muted)]">{action.contactInstructions}</p> : null}
                {action.contactUrl ? (
                  <a href={action.contactUrl} target="_blank" rel="noreferrer" className="text-link mt-3 inline-flex min-h-11 items-center gap-2">
                    Read the authority guidance <ArrowUpRight size={15} aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            ) : null}
            {action.safetyNotes ? <p className="mt-6 text-sm leading-7"><strong>Safety note:</strong> {action.safetyNotes}</p> : null}
          </section>
        ) : null}

        {registry ? (
          <details className="reading-section border-t border-[var(--border)]">
            <summary className="min-h-11 cursor-pointer py-3 text-base font-medium">Registry details</summary>
            <dl className="mt-4 grid gap-5 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--muted)]">US-RIIS status, lower-48 snapshot</dt><dd className="mt-1">{registry.statusLabel}</dd></div>
              <div><dt className="text-[var(--muted)]">Establishment means</dt><dd className="mt-1">{registry.establishmentMeans}</dd></div>
              {registry.introDateNumber ? <div><dt className="text-[var(--muted)]">Introduction year noted in registry</dt><dd className="mt-1">{registry.introDateNumber}</dd></div> : null}
              {registry.habitats.length ? <div><dt className="text-[var(--muted)]">Recorded habitats</dt><dd className="mt-1">{registry.habitats.join(", ")}</dd></div> : null}
              {registry.pathways.length ? <div><dt className="text-[var(--muted)]">Recorded introduction pathways</dt><dd className="mt-1">{registry.pathways.join(", ")}</dd></div> : null}
            </dl>
          </details>
        ) : null}
        <Link href={researchHref} className="text-link mt-5 inline-flex min-h-11 items-center gap-2">
          Continue in county research <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </div>
    </main>
  );
}
