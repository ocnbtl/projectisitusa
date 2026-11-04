import { researchSources } from "@/content/research-source-credits";
const sourceLogos:Record<string,string>={"eddmaps":"University of Georgia","usgs-nas":"USGS","usda-nrcs-plants":"USDA","gbif":"GBIF","inaturalist":"iNaturalist","idigbio":"iDigBio","usgs-nas-api":"USGS","eddmaps-alipc":"University of Georgia","aphis-eab":"USDA","aphis-federal-quarantine":"USDA","aphis-honey-bee":"USDA","usfws-invasive-carp-edna":"U.S. Fish & Wildlife","usfs-afpe":"Forest Service","usfs-laurel-wilt":"Forest Service","usfs-fia-invasive-plants":"Forest Service","usfs-fia":"Forest Service","usfs-fhp":"Forest Service"};
export function ResearchSourceRibbon({sources}:{sources:Array<{id:string;authority:string;label:string}>}){
 const names=[...new Set(sources.map(source=>sourceLogos[source.id] ?? (source.id.startsWith("aphis-")?"USDA":source.id.startsWith("usfs-")?"Forest Service":source.id.startsWith("gbif-")?"GBIF":source.id.startsWith("usgs-")?"USGS":source.id.startsWith("inaturalist-")?"iNaturalist":source.id.startsWith("idigbio-")?"iDigBio":source.id.startsWith("epa-")?"EPA":source.id.startsWith("nybg-")?"New York Botanical Garden":source.id.startsWith("smithsonian-")?"Smithsonian":source.id.startsWith("harvard-")?"Harvard University":undefined)).filter(Boolean))];
 const logos=researchSources.filter(source=>names.includes(source.name));
 if(!logos.length)return null;
 return <div className="research-source-ribbon" aria-label="Organizations behind the sources shown"><div className="research-source-ribbon-track">{[...logos,...logos].map((source,index)=><span key={index} aria-hidden={index>=logos.length?true:undefined}>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img className={source.darkImage?"ribbon-has-dark":source.style} src={"/source-logos/"+source.image} alt="" width={source.width} height={source.height}/>
 {/* eslint-disable-next-line @next/next/no-img-element */}
 {source.darkImage&&<img className="ribbon-dark" src={"/source-logos/"+source.darkImage} alt="" width={source.width} height={source.height}/>}
 <span>{source.name}</span></span>)}</div></div>;
}
