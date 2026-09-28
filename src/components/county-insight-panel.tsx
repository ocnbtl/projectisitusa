"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, ChevronDown, Leaf } from "lucide-react";
import { useId, useRef, useState, type KeyboardEvent } from "react";

import type {
  CountyDetail,
  CountyRecord,
  ExplorerSpecies,
  SpeciesFilters,
} from "@/lib/data/types";
import { formatOccurrenceDate } from "@/lib/research/occurrence-date";
import { formatCategoryLabel } from "@/lib/utils";

const CountyEvidence = dynamic(
  () => import("@/components/county-evidence").then((module) => module.CountyEvidence),
  { loading: () => <p className="county-note" role="status">Opening county evidence...</p> },
);
const CountyCardDownload = dynamic(
  () => import("@/components/county-card-download").then((module) => module.CountyCardDownload),
  { loading: () => <p className="county-note" role="status">Preparing county card...</p> },
);

interface CountyInsightPanelProps {
  selectedCounty: CountyRecord;
  selectedCountyDetail: CountyDetail | null;
  focalSpecies: ExplorerSpecies[];
  nearbySpecies: ExplorerSpecies[];
  allSpecies: ExplorerSpecies[];
  filters: SpeciesFilters;
  snapshotDate: string;
}

const PAGE_SIZE = 12;

function CountySpeciesRow({ species }: { species: ExplorerSpecies }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <li>
      <Link href={`/species/${species.slug}`} prefetch={false} className="county-species-row">
        <span className="county-species-image">
          {species.image && !imageFailed ? (
            <Image
              src={species.image.thumbnail ?? species.image.src}
              alt={species.image.alt}
              width={52}
              height={52}
              sizes="52px"
              className="h-full w-full object-cover"
              loading="lazy"
              unoptimized
              onError={() => setImageFailed(true)}
            />
          ) : (
            <Leaf aria-hidden="true" size={20} />
          )}
        </span>
        <span className="county-species-names">
          <strong>{species.commonName}</strong>
          <em>{species.scientificName}</em>
          <span className="county-species-category">{formatCategoryLabel(species.category)}</span>
          {species.image ? (
            <span className="county-image-credit" title={species.image.credit}>
              Image: {species.image.credit}
            </span>
          ) : null}
        </span>
        <ArrowUpRight aria-hidden="true" size={16} className="shrink-0" />
      </Link>
    </li>
  );
}

function CountySpeciesList({
  species,
  emptyMessage,
  label,
}: {
  species: ExplorerSpecies[];
  emptyMessage: string;
  label: string;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visibleSpecies = species.slice(0, visibleCount);

  if (species.length === 0) {
    return <p className="county-empty">{emptyMessage}</p>;
  }

  return (
    <>
      <ul className="county-list" aria-label={label}>
        {visibleSpecies.map((entry) => <CountySpeciesRow key={entry.id} species={entry} />)}
      </ul>
      <p className="county-list-count" aria-live="polite">
        Showing {visibleSpecies.length.toLocaleString()} of {species.length.toLocaleString()}
      </p>
      {visibleSpecies.length < species.length ? (
        <button
          type="button"
          className="county-load-more"
          onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
        >
          Show {Math.min(PAGE_SIZE, species.length - visibleSpecies.length)} more species
        </button>
      ) : null}
    </>
  );
}

function CountyContent({
  selectedCounty,
  selectedCountyDetail,
  focalSpecies,
  nearbySpecies,
  allSpecies,
  filters,
  snapshotDate,
}: CountyInsightPanelProps) {
  const [activeTab, setActiveTab] = useState<"species" | "evidence">("species");
  const [evidenceOpened, setEvidenceOpened] = useState(false);
  const [nearbyOpened, setNearbyOpened] = useState(false);
  const [cardOpened, setCardOpened] = useState(false);
  const tabId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const filterKey = JSON.stringify(filters);
  const resources = selectedCountyDetail?.resources ?? [];

  function activateTab(tab: "species" | "evidence") {
    setActiveTab(tab);
    if (tab === "evidence") setEvidenceOpened(true);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") nextIndex = 1 - index;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = 1;
    else return;
    event.preventDefault();
    activateTab(nextIndex === 0 ? "species" : "evidence");
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className="county-content">
      <div className="county-tabs" role="tablist" aria-label="County information">
        {(["species", "evidence"] as const).map((tab, index) => (
          <button
            key={tab}
            ref={(element) => { tabRefs.current[index] = element; }}
            type="button"
            role="tab"
            id={`${tabId}-${tab}-tab`}
            aria-controls={`${tabId}-${tab}-panel`}
            aria-selected={activeTab === tab}
            tabIndex={activeTab === tab ? 0 : -1}
            onClick={() => activateTab(tab)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {tab === "species" ? "Species" : "Evidence"}
          </button>
        ))}
      </div>

      <section
        id={`${tabId}-species-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-species-tab`}
        hidden={activeTab !== "species"}
        tabIndex={0}
      >
        <div className="county-section-heading">
          <h3>Mapped species</h3>
          <span>{focalSpecies.length.toLocaleString()}</span>
        </div>
        <p className="county-note">
          County records matching your filters, including historical occurrences.
          Counts describe documented species, not current presence, abundance, or risk.
        </p>
        <CountySpeciesList
          key={`county-${filterKey}`}
          species={focalSpecies}
          label={`Species mapped in ${selectedCounty.name}`}
          emptyMessage="No mapped records match these filters. Missing records do not establish absence."
        />

        <details className="county-disclosure">
          <summary>About these map records <ChevronDown aria-hidden="true" size={16} /></summary>
          <div className="county-disclosure-content">
            <p className="county-note">
              Map snapshot: {formatOccurrenceDate(snapshotDate)}. This compatibility
              map may include historical occurrences. A mapped record does not
              establish current presence; the Evidence tab shows the separately
              published research release.
            </p>
          </div>
        </details>

        <details
          className="county-disclosure"
          onToggle={(event) => setNearbyOpened(event.currentTarget.open)}
        >
          <summary>
            Nearby species <span>{nearbySpecies.length.toLocaleString()}</span>
            <ChevronDown aria-hidden="true" size={16} />
          </summary>
          {nearbyOpened ? (
            <div className="county-disclosure-content">
              <p className="county-note">
                Mapped in neighboring counties but missing from this county&apos;s map
                records. These records do not establish local presence or absence.
              </p>
              <CountySpeciesList
                key={`nearby-${filterKey}`}
                species={nearbySpecies}
                label="Species mapped in neighboring counties"
                emptyMessage="No nearby-only map records match these filters."
              />
            </div>
          ) : null}
        </details>

        {resources.length > 0 ? (
          <details className="county-disclosure">
            <summary>Local resources <ChevronDown aria-hidden="true" size={16} /></summary>
            <ul className="county-resource-list county-disclosure-content">
              {resources.map((resource) => (
                <li key={`${resource.kind}-${resource.url}`}>
                  <a href={resource.url} target="_blank" rel="noreferrer">
                    {resource.label} <ArrowUpRight aria-hidden="true" size={14} />
                  </a>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <details
          className="county-disclosure"
          onToggle={(event) => setCardOpened(event.currentTarget.open)}
        >
          <summary>Download county card <ChevronDown aria-hidden="true" size={16} /></summary>
          {cardOpened ? (
            <div className="county-disclosure-content county-card-export">
              <p className="county-note">
                Exports the filtered map snapshot. The card may include historical
                records and does not describe current agency status.
              </p>
              <CountyCardDownload
                county={selectedCounty}
                detail={selectedCountyDetail}
                focalSpecies={focalSpecies}
                nearbySpecies={nearbySpecies}
                countyCategorySignal={null}
                snapshotDate={snapshotDate}
              />
            </div>
          ) : null}
        </details>
      </section>

      <section
        id={`${tabId}-evidence-panel`}
        role="tabpanel"
        aria-labelledby={`${tabId}-evidence-tab`}
        hidden={activeTab !== "evidence"}
        tabIndex={0}
      >
        {evidenceOpened ? (
          <CountyEvidence
            county={selectedCounty}
            allSpecies={allSpecies}
            filters={filters}
          />
        ) : null}
      </section>
    </div>
  );
}

export function CountyInsightPanel(props: CountyInsightPanelProps) {
  return <CountyContent key={`${props.selectedCounty.stateCode}-${props.selectedCounty.countyFips}`} {...props} />;
}
