"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import { validateCountyProjection } from "@/components/county-evidence";
import { useReviewedMapData } from "@/lib/data/reviewed-map-store";
import { fetchResearchProjectionJson } from "@/lib/research/public-projection-fetch";
import { formatOccurrenceDate, occurrenceDateBounds } from "@/lib/research/occurrence-date";
import { describeTemporalDetermination } from "@/lib/research/temporal-determination-presentation";
import { buildResearchHref } from "@/lib/research/research-deep-link";
import type { ResearchPairRecord } from "@/lib/research/types";

function safeSourceLink(value: string) {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}

export function SpeciesOccurrenceEvidence({ speciesId, commonName }: { speciesId: string; commonName: string }) {
  const { data, error, retry } = useReviewedMapData();
  const params = useSearchParams();
  const [choice, setChoice] = useState<string | null>(null);
  const [pair, setPair] = useState<ResearchPairRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadedCounty, setLoadedCounty] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [visibleSources, setVisibleSources] = useState(3);
  const recordedCounties = useMemo(() => {
    if (!data) return [];
    const ordinal = data.speciesIds.indexOf(speciesId);
    if (ordinal < 0) return [];
    return Object.keys(data.occurrenceByCounty).filter(fips => data.occurrenceByCounty[fips].includes(ordinal))
      .sort((a, b) => `${data.countyLabels[a].stateCode} ${data.countyLabels[a].name}`.localeCompare(`${data.countyLabels[b].stateCode} ${data.countyLabels[b].name}`));
  }, [data, speciesId]);
  const contextCounty = params.get("county");
  const countyFips = data ? (choice && data.countyLabels[choice] ? choice : contextCounty && data.countyLabels[contextCounty] ? contextCounty : recordedCounties[0] ?? null) : null;
  const county = countyFips && data ? data.countyLabels[countyFips] : null;
  const options = countyFips && !recordedCounties.includes(countyFips) ? [countyFips, ...recordedCounties] : recordedCounties;

  useEffect(() => {
    if (!data || !countyFips || !county) return;
    const controller = new AbortController();
    setPair(null); setLoaded(false); setLoadError(null); setVisibleSources(3);
    const timer = window.setTimeout(() => { controller.abort(); setLoadError("The source records took too long to load. Please try again."); }, 20000);
    void fetchResearchProjectionJson(`${county.stateCode}/counties/${countyFips}.json`, { signal: controller.signal })
      .then(value => {
        if (controller.signal.aborted) return;
        const projection = validateCountyProjection(value, { countyFips, stateCode: county.stateCode });
        if (projection.asOf !== data.asOf) throw new Error("These source records belong to a different update. Please reload the page.");
        setPair(projection.pairs.find(item => item.speciesId === speciesId) ?? null);
        setLoadedCounty(countyFips);
        setLoaded(true);
      })
      .catch(reason => { if (!controller.signal.aborted) setLoadError(reason instanceof Error ? reason.message : "Source records could not be loaded."); })
      .finally(() => window.clearTimeout(timer));
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [data, countyFips, county, speciesId, attempt]);

  const sortedEvidence = useMemo(() => [...(pair?.evidence ?? [])].sort((a, b) => (occurrenceDateBounds(b.observedAt)?.end ?? -Infinity) - (occurrenceDateBounds(a.observedAt)?.end ?? -Infinity) || a.evidenceId.localeCompare(b.evidenceId)), [pair]);
  const temporal = pair ? describeTemporalDetermination(pair) : null;
  const researchHref = buildResearchHref({ stateCode: county?.stateCode, countyFips, speciesQuery: speciesId });
  return <section id="records" className="profile-evidence reading-section" aria-labelledby="species-records-title">
    <div className="profile-record-heading"><div><h2 id="species-records-title">Where it has been recorded</h2>{data ? <p>{recordedCounties.length.toLocaleString()} {recordedCounties.length === 1 ? "county or county equivalent" : "counties and county equivalents"} with reviewed records through {formatOccurrenceDate(data.asOf)}.</p> : null}</div><MapPin size={24} aria-hidden="true" /></div>
    {error ? <div role="alert"><p>County records could not be loaded.</p><button type="button" className="text-link min-h-11" onClick={retry}>Try again</button></div> : !data ? <p role="status">Loading records for {commonName}...</p> : countyFips && county ? <>
      <label className="profile-county-select">Choose a recorded location<select value={countyFips} onChange={event => setChoice(event.target.value)}>{options.map(fips => <option key={fips} value={fips}>{data.countyLabels[fips].name}, {data.countyLabels[fips].stateCode}</option>)}</select></label>
      {loadError ? <div role="alert"><p>{loadError}</p><button type="button" className="text-link min-h-11" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : !loaded || loadedCounty !== countyFips ? <p role="status">Loading the sources for {county.name}...</p> : pair ? <>
        <p className="profile-record-status">{pair.conflict ? "Conflicting evidence" : pair.displayStatus === "verified-present" ? "Recorded occurrence" : pair.displayStatus === "verified-absent" ? temporal?.pairStatusLabel ?? "Agency absence finding" : pair.displayStatus === "not-detected" ? "Not detected in the documented survey" : "Research remains open"}</p>
        {temporal?.showInResults ? <div className="profile-agency-finding"><strong>{temporal.currentLabel}</strong>{temporal.attribution ? <p>{temporal.attribution}</p> : null}<p>{temporal.explanation}</p></div> : null}
        <ul className="profile-source-records">{sortedEvidence.slice(0, visibleSources).map(evidence => {
          const url = safeSourceLink(evidence.url);
          return <li key={evidence.evidenceId}><div className="profile-source-title">{url ? <a href={url} target="_blank" rel="noreferrer" className="text-link">{evidence.sourceLabel || evidence.sourceId}<ArrowUpRight size={15} aria-hidden="true" /></a> : <strong>{evidence.sourceLabel || evidence.sourceId}</strong>}<span>{evidence.assertion === "recorded-present" ? "Occurrence record" : evidence.assertion === "not-detected" ? "Survey non-detection" : "Agency finding"}</span></div>
            <dl className="profile-source-dates"><div><dt><CalendarDays size={14} aria-hidden="true" /> Observed</dt><dd>{formatOccurrenceDate(evidence.observedAt)}</dd></div><div><dt>Reviewed</dt><dd>{formatOccurrenceDate(evidence.reviewedAt)}</dd></div><div><dt>Evidence scope</dt><dd>{evidence.scope.replaceAll("-", " ")}</dd></div></dl>
            {evidence.caveat ? <details className="source-context"><summary>Source context</summary><p>{evidence.caveat}</p></details> : null}</li>;
        })}</ul>
        {pair.evidence.length > visibleSources ? <button type="button" className="text-link min-h-11" onClick={() => setVisibleSources(count => count + 3)}>Show more sources ({pair.evidence.length - visibleSources})</button> : null}
        {!pair.evidence.length ? <p>No source citations are attached to this county entry.</p> : null}
      </> : <p>No explicit research record is published for this species in {county.name}. This does not establish absence.</p>}
    </> : <p>No reviewed county occurrence is recorded in this update. That leaves an open question, rather than a finding of absence.</p>}
    <div className="profile-evidence-footer"><p>Observation dates can be historical. A record does not establish presence today.</p><Link href={researchHref} className="text-link">Explore county research <ArrowUpRight size={15} aria-hidden="true" /></Link></div>
  </section>;
}
