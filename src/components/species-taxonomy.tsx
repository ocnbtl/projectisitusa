import taxonomy from "@/content/species-taxonomy.json";
import type { Species } from "@/lib/data/types";
import { formatCategoryLabel } from "@/lib/utils";
type Classification = { ranks: Record<string,string>; source: string; sourceUrl: string; matchUrl?: string; checked?: string; catalogName: string; recognizedName: string; recognizedRank: string; synonym?: boolean; status: string };
const entries = taxonomy as Record<string, Classification>;
const ranks = [["KINGDOM","Kingdom"],["PHYLUM","Phylum"],["SUBPHYLUM","Subphylum"],["CLASS","Class"],["ORDER","Order"],["SUBORDER","Suborder"],["FAMILY","Family"],["GENUS","Genus"],["SPECIES","Species"]];
export function SpeciesTaxonomy({species}: {species: Species}) {
 const entry=entries[species.id],registry=species.registry;
 if(!entry)return null;
 return <section className="profile-taxonomy" aria-labelledby="taxonomy-title">
   <div className="profile-taxonomy-heading"><h2 id="taxonomy-title">Classification</h2><span>{formatCategoryLabel(species.category)}</span></div>
   <p className="profile-taxonomy-preview">{entry.ranks.FAMILY ? <>Family: <strong>{entry.ranks.FAMILY}</strong></> : <>Taxonomic details and catalog context</>}</p>
   <details className="profile-taxonomy-disclosure"><summary>View full taxonomy</summary>
     <p className="profile-taxonomy-note">This classification follows <a href={entry.sourceUrl} target="_blank" rel="noreferrer">{entry.source}</a>. Some groups do not use every rank, and sources can organize them differently.</p>
     {entry.status==='needs-review' && <p className="profile-taxonomy-note">We have kept the register’s classification here while we check an uncertain name match. Ranks we cannot verify are left open.</p>}
     {entry.synonym && <p className="profile-taxonomy-note">This source treats <i>{entry.catalogName}</i> as an earlier or alternative name for <i>{entry.recognizedName}</i>. The hierarchy below follows that source; the profile keeps its catalog identity.</p>}
     <dl className="profile-taxonomy-ranks">{ranks.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{entry.ranks[key] || <span className="taxonomy-unlisted">{entry.status==='needs-review'?'Not yet verified':'Not listed by this source'}</span>}</dd></div>)}</dl>
     {!['SPECIES','Species'].includes(entry.recognizedRank) && <p className="profile-taxonomy-note">Listed taxon ({entry.recognizedRank.toLowerCase().replaceAll('_',' ')}): <i>{entry.recognizedName}</i></p>}
     <p className="profile-taxonomy-note"><a href={entry.sourceUrl} target="_blank" rel="noreferrer">Read the classification source</a>{entry.matchUrl && <> · <a href={entry.matchUrl} target="_blank" rel="noreferrer">Name matching record</a></>}{entry.checked && <> · Checked {entry.checked}</>}</p>
   </details>
   {registry && <details className="profile-taxonomy-disclosure"><summary>Catalog context</summary><p className="profile-taxonomy-note">The original register lists this taxon as {registry.statusLabel.toLowerCase()} for the lower 48 states. This does not establish its presence, impact, or legal status in every county.</p><dl className="profile-taxonomy-ranks"><div><dt>Catalog name</dt><dd>{species.scientificName}</dd></div><div><dt>Rank</dt><dd>{registry.taxonRank}</dd></div><div><dt>Register ID</dt><dd>{registry.occurrenceId}</dd></div></dl><a className="profile-taxonomy-note" href="https://doi.org/10.5066/P9KFFTOD" target="_blank" rel="noreferrer">Read the US-RIIS source</a></details>}
 </section>;
}
