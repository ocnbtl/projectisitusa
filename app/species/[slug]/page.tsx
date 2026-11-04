import "@/components/species-profile.css";
import "@/components/profile-refinements.css";
import type { Route, Metadata } from "next";
import { SpeciesNames } from "@/components/species-names";
import { getSpeciesNames, speciesStructuredData } from "@/lib/data/species-names";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, ArrowUpRight, ArrowRight } from "lucide-react";
import { notFound, redirect } from "next/navigation";

import { ProfileGallery } from "@/components/profile-gallery";
import { SpeciesTaxonomy } from "@/components/species-taxonomy";
import { SpeciesOccurrenceEvidence } from "@/components/species-occurrence-evidence";
import { ProfileCorrection } from "@/components/participation/profile-correction";
import { getSpeciesImageAsset } from "@/lib/data/species-image-assets";
import { speciesBySlug, speciesSlugAliases } from "@/lib/data/species-store";
import { getPublishedSpeciesProfile } from "@/lib/data/species-published-profile";
import { getRegistryReference } from "@/lib/data/species-registry-reference";
import { getDisplaySpecies, getSpeciesEditorial, getSpeciesPhotoNote } from "@/lib/ui/species-editorial";


export const dynamicParams = true;

// Profiles remain cached on first request; the full catalog is not pre-rendered.
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const source = speciesBySlug.get(speciesSlugAliases.get(slug) ?? slug);
  if (!source) return {};
  const species = getDisplaySpecies(source);
  const names = getSpeciesNames(species.id).names.filter(entry => entry.kind === "common").slice(0,3).map(entry => entry.name);
  const title = getSpeciesNames(species.id).warning || species.commonName === species.scientificName ? species.scientificName : species.commonName + " (" + species.scientificName + ")";
  const description = "Explore " + title + (names.length ? ", also known as " + names.join(", ") : "") + ". Find identification guidance, recorded occurrences and naming references.";
  return { title: title + " | ISITUSA", description, alternates: { canonical: "/species/" + species.slug }, openGraph: { title, description, url: "/species/" + species.slug } };
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
  const published = getPublishedSpeciesProfile(species.id);
  const references = (published?.sources ?? [...editorial.sources, ...species.source]).filter((source, i, all) => all.findIndex(item => item.url === source.url) === i);
  const isCurated = species.profileType === "curated";
  const identification = published?.identification ?? species.whatToLookFor ?? [];
  const action = isCurated ? species.action : undefined;
  const registry = species.registry;
  const registryReference = registry?.authorityUrl ? getRegistryReference(registry.authorityUrl) : undefined;


  return (
    <main id="main-content" className="reading-page species-profile">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ ...speciesStructuredData(species), ...(editorial.summary ? { description: editorial.summary } : {}) }).replace(/</g, "\\u003c") }} />
      <nav aria-label="Species navigation" className="profile-back-nav">
        <Link href="/species" className="text-link inline-flex min-h-11 items-center gap-2">
          <ArrowLeft size={16} aria-hidden="true" /> All species
        </Link>
        <Link href={`/?species=${species.id}`} className="text-link inline-flex min-h-11 items-center">Find on the map</Link>
      </nav>

      <header className={`profile-layout ${species.image ? "" : "profile-without-image"} grid items-start gap-8 lg:gap-12`}>
        <div className="reading-hero profile-heading min-w-0">
          <h1 className="profile-title break-words">{species.commonName}</h1>
          <p className="profile-scientific-name">{species.scientificName}</p>
          {getSpeciesNames(species.id).warning && <p className="profile-name-warning">This catalog name needs clarification.<a href="#species-names-title">Read the naming note</a></p>}
          {editorial.summary ? <p className="profile-description">{editorial.summary}</p> : null}
      <nav className="profile-section-nav" aria-label="On this profile"><a href="#occurrences">Map & records</a><a href="#identification">Identification</a><a href="#actions">What to do</a><a href="#profile-sources-heading">References</a></nav>
          
        </div>
        {species.image ? <aside className="profile-sidebar" aria-label="Species photographs">
        {species.image ? (
          <div className="profile-image">
            <ProfileGallery images={[species.image]} label={species.commonName} />
            {getSpeciesPhotoNote(species.id) && <p className="px-4 pb-4 text-sm text-[var(--muted)]">{getSpeciesPhotoNote(species.id)}</p>}
          </div>
        ) : null}
        </aside> : null}
      </header>
      <div className="profile-identity-panels"><SpeciesTaxonomy species={species} /><SpeciesNames speciesId={species.id} /></div>




      <div className="profile-main-columns"><div id="occurrences" className="scroll-mt-24">
        <Suspense fallback={<p role="status" className="reading-section text-sm text-[var(--muted)]">Opening recorded occurrences...</p>}>
          <SpeciesOccurrenceEvidence speciesId={species.id} commonName={species.commonName} authorityUrl={registryReference?.url ?? undefined} />
        </Suspense>
      </div>

      <div className="profile-reading profile-content"><div className="profile-biography">
        {identification.length > 0 ? (
          <section id="identification" className="reading-section scroll-mt-24">
            <h2>How to recognize it</h2>
            <ul className="profile-guidance-list">{identification.map((item,index)=><li key={index}>{item}</li>)}</ul>
          </section>
        ) : <section id="identification" className="reading-section scroll-mt-24"><h2>How to recognize it</h2><p className="mt-4 text-base leading-8 text-[var(--muted)]">We are still preparing a reviewed identification guide for this species. The profile references can help you compare distinguishing features and similar species. A photograph alone may not be enough for a confident identification.</p></section>}

        {!published && (species.origin || species.whyItMatters) ? (
          <section id="background" className="reading-section scroll-mt-24">
            <h2>Background & impact</h2>
            {species.origin ? <p className="mt-4 text-base leading-8 text-[var(--muted)]">{species.origin}</p> : null}
            {species.whyItMatters ? <p className="mt-4 text-base leading-8 text-[var(--muted)]">{species.whyItMatters}</p> : null}
          </section>
        ) : null}

        </div>{published ? (
          <section id="actions" className="reading-section scroll-mt-24">
            <h2>What you can do</h2>
            <ul className="profile-guidance-list profile-actions-list">{published.actions.map((paragraph,index)=><li key={index}>{paragraph}</li>)}</ul>
          </section>
        ) : action ? (
          <section id="actions" className="reading-section scroll-mt-24">
            <h2>What you can do</h2>
            <p className="mt-4 text-base leading-7">{action.summary}</p>
            {action.steps.length > 0 ? (
              <ol className="mt-5 list-decimal space-y-4 pl-6 text-base leading-7 text-[var(--muted)]">
                {action.steps.map((step) => <li key={step} className="pl-2">{step}</li>)}
              </ol>
            ) : null}
            {action.contactName || action.contactInstructions || action.contactUrl ? (
              <div className="profile-authority-guidance">
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

        {!published && !action && <section id="actions" className="reading-section scroll-mt-24"><h2>What you can do</h2><p className="mt-4 text-base leading-8 text-[var(--muted)]">If you think you have found this species, record where and when you saw it and take clear photographs from a safe distance. Confirm its identity and local guidance before handling, moving or attempting to control it.</p></section>}
      </div></div><div className="profile-resource-footer"><section className="profile-sources reading-section" aria-labelledby="profile-sources-heading"><div>
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
            Registry reference: {registryReference?.url ? <a href={registryReference.url} target="_blank" rel="noreferrer" className="text-link">{registry.authority}</a> : registry.authority}{registryReference?.note ? <span> {registryReference.note}</span> : null}
          </p>
        ) : null}
      </div></section>
        <section className="profile-participate" aria-labelledby="profile-help-title">
          <div className="profile-participate-intro"><div><h2 id="profile-help-title">Found this species?</h2><p>Share a photo and location for our team to review.</p></div></div>
          <div className="profile-action-buttons"><Link href={`/report?species=${encodeURIComponent(species.id)}`} className="primary-button">Report a sighting <ArrowRight size={16} aria-hidden="true"/></Link></div>
          <div id="profile-correction"><ProfileCorrection speciesId={species.id} name={species.commonName}/></div>
        </section></div>

    </main>
  );
}

