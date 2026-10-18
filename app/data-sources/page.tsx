import type { Metadata } from "next";
import Link from "next/link";
import registry from "@/data/research/source-registry.json";
import { MethodReference as Ref, ResearchPaper, type PaperSection } from "@/components/research-paper";

export const metadata: Metadata = {
  title: "Our data sources | ISITUSA",
  description: "The public records, collections, surveys, and scientific references behind ISITUSA: what we use, why we use it, and the limits of each source family.",
  alternates: { canonical: "https://isitusa.com/data-sources" },
};

const sections: PaperSection[] = [
  { id: "reading-sources", title: "Different sources answer different questions", content: <>
    <p>There is no single complete database of invasive species in every U.S. county. The evidence is distributed across agencies, universities, museums, herbaria, field programs, and people documenting what they see. ISITUSA connects that work while keeping its origin and meaning visible.</p>
    <p>We use three broad kinds of material: <strong>catalogs and taxonomic references</strong> to organize species; <strong>occurrence and status evidence</strong> to understand what has been documented in a place; and <strong>explanatory references</strong> to write useful species profiles. A source can serve more than one role, but those roles are not interchangeable.</p>
    <p>This paper explains the source families in our current workflow and their limitations. The <Link href="/credits#research">Credits directory</Link> acknowledges the organizations and creators behind the work. <Link href="/approach">Our approach</Link> explains matching, review, compilation, and publication. Neither an organization&apos;s logo nor its appearance here implies partnership, endorsement, or that every dataset it publishes is included.</p>
  </> },
  { id: "catalog", title: "The catalog and the meaning of invasive", content: <>
    <p>Our catalog begins with the <a href="https://doi.org/10.5066/P9KFFTOD">United States Register of Introduced and Invasive Species (US-RIIS)</a> for the lower 48 states, published by the U.S. Geological Survey. A shared catalog gives incoming evidence a consistent species identity. It does not establish a county occurrence on its own.</p>
    <p>Introduced and invasive are not synonyms. A species can be introduced without the evidence establishing harmful impacts in every place where it occurs. State regulations, regional ecological context, and the underlying register&apos;s definitions matter. Inclusion in our catalog should not be treated as a claim of identical legal status or ecological harm across all jurisdictions.</p>
    <p>Official state lists contribute to a separate applicability workflow. A state list can establish that a species is relevant to a jurisdiction&apos;s research or regulatory scope; it does not fill every county with presence records. Unknown applicability stays visible. The lower-48 origin of the catalog also limits what should be assumed about completeness in Alaska, Hawaii, or other geographic contexts.</p>
    <p>Taxonomy is handled through source-specific matching rules and reviewed mappings. We preserve uncertainty when a name, rank, or concept cannot be matched confidently. The <Ref path="src/data/research/state-applicability-source-registry.json">state-list source registry</Ref> is separate from the occurrence source registry for this reason.</p>
  </> },
  { id: "occurrences", title: "Distribution and occurrence records", content: <>
    <h3>EDDMapS and the University of Georgia</h3>
    <p><a href="https://www.eddmaps.org/">EDDMapS</a> contributes positive county distributions. Our retained aggregate represents verifier-reviewed or expert positive records, but it does not retain an individual occurrence identifier and observation date for each underlying observation. We therefore use it for historical recorded presence, not to date a new arrival or establish a current population.</p>
    <p>The older combined county snapshot has an additional limitation: source contributions were merged without preserving every individual source-to-county connection. Its bounded update adds EDDMapS counties while preserving other coverage. Removing an EDDMapS row cannot safely remove a combined county record without checking the other source families. Missing counties are never absence evidence.</p>
    <h3>USGS Nonindigenous Aquatic Species</h3>
    <p><a href="https://nas.er.usgs.gov/">USGS NAS</a> supplies aquatic occurrence and collection evidence. Our registry distinguishes retained downloads from targeted API queries. Records vary in geographic precision, population context, and age. An individual record should be read with its original details rather than as a statement that a species is established throughout a county.</p>
    <h3>State programs and plant distribution resources</h3>
    <p>Sources such as the Alabama Plant Atlas, Alabama Forestry Commission layers, USDA NRCS PLANTS county distributions, and California Department of Food and Agriculture occurrence reports add more specific geographic or program evidence. They cover different organisms, periods, and collection methods. A treatment area, a host list, or a broad group identification cannot substitute for an exact species occurrence.</p>
    <p>The registered programs and their direct links are listed in the <a href="#source-register">source register below</a>. Registration describes an available, manual, or legacy pathway; it does not mean that every source has been searched for every species and county.</p>
  </> },
  { id: "collections", title: "Specimens and scientific collections", content: <>
    <p>A preserved specimen can connect an identification with a collection event. Our workflows draw on museum and herbarium records from Harvard University Herbaria, the Smithsonian National Museum of Natural History, the New York Botanical Garden, the Consortium of Pacific Northwest Herbaria, TORCH/BRIT, and SERNEC, alongside aggregators such as GBIF and iDigBio.</p>
    <p><a href="https://www.gbif.org/">GBIF</a> makes records from many publishers accessible through a common format. That format is useful, but it does not remove the need to examine the original publisher, record identity, taxonomic interpretation, geographic quality, date, and license. Some registered workflows accept explicit county information; a separate coordinate-resolved workflow has its own geography requirements.</p>
    <p>We exclude or hold unsupported identities and geographic matches according to each adapter&apos;s policy. Cultivated or captive material, invalid dates, or non-species ranks may require rejection or a specifically evaluated review path. Some retained specimen workflows permit an explicitly undated historical record when its archive identity and other required evidence remain intact. Undated does not become recent.</p>
    <p>The registry describes the retained <a href="https://www.idigbio.org/">iDigBio</a> index as frozen as of May 8, 2026. We treat that material as historical evidence, not a continuously refreshed stream. Collection portals and aggregators can also contain the same specimen; finding it in several places does not make those independent observations.</p>
    <p>Reuse terms are checked at the dataset or record level. For example, the registered Harvard workflow requires Harvard University Herbaria attribution for CC BY 4.0 material, while several retained collection workflows are restricted to qualifying CC0 records. These are source-specific rules, not a blanket license for all collections or their photographs.</p>
  </> },
  { id: "observations", title: "Community observations and bird records", content: <>
    <p><a href="https://www.inaturalist.org/">iNaturalist</a> connects observations with community identification. Our registered Research Grade pathway uses the provider-recommended weekly GBIF dataset and applies its own taxonomy, geography, and licensing checks. Research Grade is a provider status, not a claim that an ISITUSA specialist independently confirmed every observation.</p>
    <p>Identification, quality grade, public geography, and licensing can change after the snapshot we retained. Obscured or insufficiently precise locations cannot be treated as exact county evidence without meeting the adapter&apos;s rules. A missing or rejected observation supplies no negative evidence.</p>
    <p>The GBIF eBird Observation Dataset and USGS North American Breeding Bird Survey have separate registered pathways. The retained eBird workflow uses historical annual occurrence data with source-specific review; it does not infer absence from incomplete checklists. The registered Breeding Bird Survey pathway uses route-start detections and must be read within its sampled geography. Neither is a countywide bird census.</p>
    <p>Dataset-specific resources such as the Invasive Plant Atlas of the MidSouth are treated separately as well. A common delivery platform does not make all datasets equivalent in method, independence, or evidentiary value.</p>
  </> },
  { id: "surveys", title: "Surveys, monitoring, and regulatory programs", content: <>
    <p>Structured programs can document effort and sampling context that a simple occurrence point does not. They also need especially careful interpretation: a result may describe a plot, a stream reach, an apiary, a route, or a regulatory area rather than an entire county.</p>
    <dl>
      <dt>Forest Service and Purdue resources</dt><dd>Alien Forest Pest Explorer compiles county detections; its retained snapshot carries underlying data last updated in April 2023. Forest Inventory and Analysis plant tables, current invasive-plant locations, and insect and disease survey detections describe their sampled or represented areas. Missing entries and binary zeros do not establish absence.</dd>
      <dt>BLM and NEON vegetation programs</dt><dd>NISIMS, AIM terrestrial invasive-plant indicators, and the registered NEON TALL plant dataset contribute evidence within sampled locations. Positive cover is a finding at a sampled place, not a statewide inventory. Zero or unmatched rows do not automatically become non-detection claims.</dd>
      <dt>EPA and the Water Quality Portal</dt><dd>National Rivers and Streams Assessment fish counts and reviewed positive biological results can support sampled occurrence. Sampling effort, species identity, and geographic resolution remain part of the interpretation. A missing fish count does not prove a water body, much less a county, is free of the species.</dd>
      <dt>USDA APHIS programs</dt><dd>Known-infested county layers, quarantine geography, and National Honey Bee Survey results have different meanings. Quarantine boundaries describe the named program condition. Apiary findings retain managed-host, sampling, and migratory context; they do not automatically establish a free-living countywide population.</dd>
      <dt>U.S. Fish and Wildlife Service eDNA monitoring</dt><dd>The registered invasive-carp sample pathway permits explicitly supported, scoped non-detection for Bighead and Silver Carp. It does not turn a negative sample into countywide absence, and the current contract does not treat positive eDNA alone as verified organism presence.</dd>
    </dl>
    <p>These distinctions are encoded in <Ref path="src/data/research/source-registry.json">source capabilities and caveats</Ref>. They are why we do not combine every zero, detection flag, or polygon into one universal presence-or-absence field.</p>
  </> },
  { id: "authority", title: "Official status and negative evidence", content: <>
    <p>Authority statements answer a different question from an occurrence database. A declaration of eradication, a pest-status report, or a disease-distribution statement can support a specific official determination when its organism, geographic scope, dates, and meaning are explicit.</p>
    <p>Our registry includes program-specific authority documents and a manual authoritative pathway. These require direct references and review rather than conclusions inferred from a search with no results. Examples include retained northern giant hornet and Asian longhorned beetle documents, and Karnal bunt declarations with separate corroborating sources.</p>
    <p>The declaration date, underlying information year, page modification date, retrieval date, and project review expiry can all differ. We preserve those distinctions. Where a method uses a corroborating page&apos;s publication or modification date, that must not be represented as proof that the authority specifically reaffirmed every statement on that date.</p>
    <p>Some county determinations inherit a reviewed broader jurisdiction&apos;s status. They must disclose that origin rather than imply every county was surveyed. Historical occurrence remains visible alongside an accepted later determination, and unresolved contradictions can prevent publication. See <Link href="/approach#review">the review rules</Link> and the <Ref path="src/lib/research/temporal-determination-presentation.ts">public status explanations</Ref>.</p>
  </> },
  { id: "profiles", title: "References that help explain a species", content: <>
    <p>A species page should help a reader understand the organism, recognize useful identifying features, and find sensible next steps. That explanatory work draws on sources such as university extension services, agency species accounts, museum resources, and botanical references. It is distinct from deciding which counties have occurrence evidence.</p>
    <p>Examples in our credited profile references include Cornell Integrated Pest Management, Penn State Extension, University of Florida IFAS and Florida Museum resources, Wisconsin-Madison and Minnesota Extension, NC State&apos;s Plant Toolbox, Virginia Tech weed identification, and Oregon State landscape plants. NOAA and the National Park Service also provide subject-specific ecological and identification context. The <Link href="/credits#research">Credits directory</Link> links to the specific resources represented in these acknowledgments.</p>
    <p>Different sources may focus on a particular crop, habitat, region, or management concern. Our editorial aim is a clear broader explanation with traceable references, rather than presenting one source&apos;s local focus as the whole story. Research drafts and review feedback remain separate from published profiles; a source listed here does not mean every profile is complete or uses every listed organization.</p>
    <p>Management advice is especially sensitive to location and context. General information cannot replace local rules, a reliable identification, or guidance from the responsible agency. Profile references help readers reach that original guidance.</p>
  </> },
  { id: "source-register", title: "The registered evidence sources", content: <>
    <p>The directory below is generated from the evidence-source registry included with this website build. It exposes each registered pathway&apos;s publisher, source link, access method, refresh target, and recorded caveat. Several entries can belong to one provider because they support different types of evidence.</p>
    <p><strong>A registered pathway is not a coverage claim.</strong> Operational, manual, and legacy entries coexist. A refresh target is a planning interval, not a last-checked date or a guarantee of automatic updates. Use <Link href="/research">Research</Link> to examine published findings and work status, and the <Ref path="src/data/research/source-registry.json">versioned machine-readable registry</Ref> for the policies reviewed for this edition.</p>
    <details><summary>Browse all {registry.sources.length} registered source pathways</summary>
      <ul>{[...registry.sources].sort((a,b) => a.label.localeCompare(b.label)).map(source => <li key={source.id}>
        <h3>{source.homepage ? <a href={source.homepage}>{source.label}</a> : source.label}</h3>
        <p><strong>{source.authority}</strong></p>
        <p>Access: {source.access}. Registry status: {source.status}. Refresh target: {source.refreshCadenceDays === null ? "no fixed interval" : `${source.refreshCadenceDays} days`}.</p>
        <p>{source.caveat}</p>
      </li>)}</ul>
    </details>
    <p>This evidence registry does not replace the separate state-list registry, individual profile bibliographies, photo credits, or software licenses. Those materials serve different purposes and retain their own attribution.</p>
  </> },
  { id: "reuse", title: "Attribution, reuse, and the gaps between sources", content: <>
    <p>Open access is not the same as unrestricted reuse. The project&apos;s <Ref path="LICENSE">MIT license</Ref> covers its licensed software and documentation; it does not relicense third-party records, photographs, organization marks, or map artwork. A photograph&apos;s rights can differ from the metadata attached to it. Check the original resource&apos;s license and attribution requirements before reusing it.</p>
    <p>Credits identify contributors, while citations identify the evidence behind a particular claim. A provider homepage is useful orientation, but the original record, dataset version, or source document is the stronger reference when evaluating a finding. Where legacy data lacks that exact connection, we disclose the limitation rather than inventing provenance.</p>
    <p>The same observation may pass through several institutions. Conversely, a well-known institution may have little relevant evidence for a particular county. We assess what the specific source supports rather than treating reputation or the number of logos as a substitute for coverage.</p>
    <p>There will be gaps: unexamined sources, inaccessible archives, outdated records, uncertain names, and places with little documentation. New research can improve that picture without making earlier uncertainty disappear from history. If you know a useful public dataset or notice a missing credit, <a href="mailto:contact@isitusa.com">send us its source link and the scope it covers</a>. Keeping that chain of evidence understandable is part of making the research useful.</p>
  </> },
];

export default function DataSourcesPage() {
  return <ResearchPaper title="Our data sources" description="The records, collections, and research behind ISITUSA, with a clear account of what each can tell us." sections={sections} related={{ href: "/approach", label: "Read our approach paper" }} />;
}
