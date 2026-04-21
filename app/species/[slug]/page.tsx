import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { ActionGuidance } from "@/components/action-guidance";
import { SpeciesImage } from "@/components/species-image";
import { SourceAttribution } from "@/components/source-attribution";
import { allSpecies, speciesBySlug, speciesSlugAliases } from "@/lib/data/store";
import { formatCategoryLabel } from "@/lib/utils";
import type { Species } from "@/lib/data/types";

function buildRegistryOrigin(species: Species) {
  if (!species.registry) return null;

  const introDate = species.registry.introDateNumber
    ? ` The current registry notes an introduction date of ${species.registry.introDateNumber}.`
    : "";
  const pathway = species.registry.pathways.length
    ? ` Common pathway tags in the snapshot include ${species.registry.pathways
        .slice(0, 2)
        .join(" and ")
        .toLowerCase()}.`
    : "";

  return `${species.registry.establishmentMeans}.${introDate}${pathway}`.trim();
}

function buildRegistryWhyItMatters(species: Species) {
  if (!species.registry) return null;

  const habitatLabel = species.registry.habitats.length
    ? species.registry.habitats.slice(0, 3).join(", ").toLowerCase()
    : "multiple habitats";
  const mappedCount = species.registry.mappedCountyCount
    ? ` It is currently mapped in ${species.registry.mappedCountyCount.toLocaleString()} counties in the local snapshot.`
    : "";

  return `${species.summary} The registry associates this species with ${habitatLabel}.${mappedCount}`.trim();
}

function buildRegistryLookFor(species: Species) {
  if (!species.registry) return [];

  const details = [
    `Use the scientific name ${species.scientificName} and the profile image together when checking field guides, agency lists, or extension resources.`,
    `This entry is grouped here as ${species.displayGroup.toLowerCase()} in the ${formatCategoryLabel(
      species.category,
    ).toLowerCase()} category.`,
    `Registry classification: ${species.registry.className} · ${species.registry.order}${
      species.registry.family ? ` · ${species.registry.family}` : ""
    }.`,
  ];

  if (species.registry.habitats.length) {
    details.push(
      `Current habitat tags in the local snapshot: ${species.registry.habitats
        .slice(0, 3)
        .join(", ")
        .toLowerCase()}.`,
    );
  }

  return details.slice(0, 4);
}

export function generateStaticParams() {
  return [
    ...allSpecies.map((species) => ({
      slug: species.slug,
    })),
    ...[...speciesSlugAliases.keys()].map((slug) => ({ slug })),
  ];
}

export default async function SpeciesProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const resolvedParams = await params;
  const canonicalSlug = speciesSlugAliases.get(resolvedParams.slug);

  if (canonicalSlug) {
    redirect(`/species/${canonicalSlug}`);
  }

  const species = speciesBySlug.get(resolvedParams.slug);

  if (!species) {
    notFound();
  }

  const isCurated = species.profileType === "curated";
  const profileOrigin = species.origin ?? buildRegistryOrigin(species);
  const profileWhyItMatters = species.whyItMatters ?? buildRegistryWhyItMatters(species);
  const profileLookFor =
    species.whatToLookFor && species.whatToLookFor.length > 0
      ? species.whatToLookFor
      : buildRegistryLookFor(species);

  return (
    <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 pb-12 sm:px-6 lg:px-8">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm text-[var(--foreground)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]"
      >
        <ArrowLeft size={16} />
        Back to map
      </Link>

      <section className="glass-panel grid gap-6 rounded-[32px] p-6 lg:grid-cols-[1.1fr_0.9fr] lg:p-8">
        <div className="grid gap-5">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
              {formatCategoryLabel(species.category)} · {species.displayGroup}
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--foreground)] sm:text-5xl">
              {species.commonName}
            </h1>
            <p className="mt-2 text-lg italic text-[var(--muted)]">
              {species.scientificName}
            </p>
            {species.registry ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  {species.registry.statusLabel}
                </span>
                <span className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs uppercase tracking-[0.18em] text-[var(--muted)]">
                  {species.registry.hasCountyData ? "County map data available" : "Catalog-only entry"}
                </span>
              </div>
            ) : null}
          </div>

          <article className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6">
            <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
              Summary
            </p>
            <p className="mt-4 text-sm leading-7 text-[var(--foreground)]">
              {species.summary}
            </p>
          </article>

          {profileOrigin || profileWhyItMatters ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Where it came from
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                    {profileOrigin ?? "The current local snapshot does not include a fuller origin narrative for this species yet."}
                  </p>
                </article>
                <article className="rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
                    Why it matters
                  </p>
                  <p className="mt-3 text-sm leading-7 text-[var(--foreground)]">
                    {profileWhyItMatters ?? species.summary}
                  </p>
                </article>
              </div>

              {profileLookFor.length ? (
                <article className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6">
                  <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
                    What to look for
                  </p>
                  <ul className="mt-4 grid gap-3">
                    {profileLookFor.map((item) => (
                      <li
                        key={item}
                        className="rounded-[20px] border border-[var(--border)] px-4 py-4 text-sm leading-6 text-[var(--muted)]"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--surface)]">
          {species.image ? (
            <SpeciesImage
              src={species.image.src}
              alt={species.image.alt}
              credit={species.image.credit}
              label={species.commonName}
            />
          ) : (
            <div className="flex min-h-[320px] flex-col justify-between bg-[linear-gradient(160deg,rgba(110,181,134,0.16),transparent_55%),linear-gradient(220deg,rgba(240,181,93,0.14),transparent_50%)] p-6">
              <div className="text-xs uppercase tracking-[0.22em] text-[var(--muted)]">
                Registry entry
              </div>
              <div>
                <div className="font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--foreground)]">
                  {species.commonName}
                </div>
                <div className="mt-2 text-sm text-[var(--muted)]">
                  Detailed field imagery has not been curated for this species yet.
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {isCurated && species.action ? (
        <ActionGuidance action={species.action} />
      ) : (
        <section className="rounded-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 text-sm leading-7 text-[var(--foreground)]">
          <p className="text-xs uppercase tracking-[0.28em] text-[var(--muted)]">
            Practical note
          </p>
          <p className="mt-4">
            This profile is built from the verified registry snapshot and current
            local county coverage. Use the linked authority sources for species-
            specific management or reporting guidance, especially if this is a
            new find in your area.
          </p>
          {species.registry ? (
            <p className="mt-3 text-[var(--muted)]">
              {species.registry.mappedCountyCount
                ? `Current local map coverage: ${species.registry.mappedCountyCount.toLocaleString()} mapped counties.`
                : "This species is still waiting for attached county-level coverage in the local snapshot."}
            </p>
          ) : null}
        </section>
      )}

      <SourceAttribution sources={species.source} />
    </main>
  );
}
