"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowRight, MapPin } from "lucide-react";
import { backend } from "@/lib/participation/client";
import { Frame, Notice, styles } from "./shared";
const CountyMap=dynamic(()=>import("@/components/species-county-map"),{ssr:false,loading:()=> <p>Loading county map...</p>});
export type Observation={id:string;species_id:string;species_name:string;county_id:string;county_name:string;observed_on:string;summary:string;published_at:string};
export function CountyObservations({county}:{county:string}){
 const [rows,setRows]=useState<Observation[]>([]),[error,setError]=useState(false);
 useEffect(()=>{let current=true;setRows([]);setError(false);Promise.resolve().then(()=>backend().rpc("isitusa_public_observations",{county})).then(r=>{if(current){setError(Boolean(r.error));setRows(r.data??[]);}}).catch(()=>{if(current)setError(true);});return()=>{current=false;};},[county]);
 if(error)return <p className="county-note">Community observation records could not load. <Link href={{pathname:"/observations",query:{county}}}>Try the observations page</Link>.</p>;
 if(!rows.length)return null;
 return <section className="county-note"><h3>Reviewed observations</h3><p>Shared with ISITUSA and reviewed by our team. These records are separate from the research totals above.</p>{rows.slice(0,3).map(r=><p key={r.id}><Link href={{pathname:"/observations",query:{id:r.id}}}>{r.species_name} <ArrowRight size={14}/></Link></p>)}<Link href={{pathname:"/observations",query:{county}}}>See this countyÃ¢â‚¬â„¢s observations</Link></section>;
}
export function Observations(){
 const params=useSearchParams();
 const [rows,setRows]=useState<Observation[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true),[page,setPage]=useState(0),[attempt,setAttempt]=useState(0),[selected,setSelected]=useState<string|null>(null),[recordId,setRecordId]=useState<string|null>(null);
 useEffect(()=>{setPage(0);setSelected(null);},[params]);
 useEffect(()=>{let current=true;const id=params.get("id"),county=params.get("county");setRecordId(id);setLoading(true);setError("");Promise.resolve().then(()=>backend().rpc("isitusa_public_observations",{record_id:id,county,page_number:id?0:page})).then(r=>{if(!current)return;if(r.error){setRows([]);setError("These observation records could not load.");}else setRows(r.data??[]);setLoading(false);}).catch(()=>{if(current){setRows([]);setError("These observation records could not load.");setLoading(false);}});return()=>{current=false;};},[page,attempt,params]);
 const shown=rows.slice(0,50),filtered=selected?shown.filter(r=>r.county_id===selected):shown;
 const labels=Object.fromEntries(shown.map(r=>[r.county_id,{name:r.county_name,stateCode:""}]));
 return <Frame title={recordId?"Reviewed observation":"Reviewed observations"} description="Observations shared with ISITUSA, identified by our team, and approved for a county-level public record. These are separate from the atlasÃ¢â‚¬â„¢s compiled research totals.">
 {loading?<p role="status">Loading observations...</p>:error?<Notice error><p>{error}</p><button className="text-link" onClick={()=>setAttempt(a=>a+1)}>Try again</button></Notice>:!rows.length?<Notice>{recordId?"This record is unavailable or has been withdrawn for further review.":"No observations have been published here yet. Reports only appear after identification and publication review."}</Notice>:<>
 <CountyMap counties={shown.map(r=>r.county_id)} selected={selected} labels={labels} onSelect={setSelected}/>
 <label className={styles.field}>County on this page<select className={styles.select} value={selected??""} onChange={e=>setSelected(e.target.value||null)}><option value="">All displayed counties</option>{Object.entries(labels).map(([id,value])=><option key={id} value={id}>{value.name}</option>)}</select></label>
 <p className={styles.hint}>The map shows only the records on this page, at county scale. It does not reveal the exact observation location.</p>
 <div className="observation-records">{filtered.map(r=><article key={r.id} className="observation-record"><p className={styles.hint}>ISITUSA reviewed observation</p><h2><Link href={{pathname:"/observations",query:{id:r.id}}}>{r.species_name}</Link></h2><p><MapPin size={16} aria-hidden="true"/> {r.county_name} Ã‚Â· Observed {r.observed_on}</p><p>{r.summary}</p><div className={styles.row}><Link className="text-link" href={{pathname:"/",query:{county:r.county_id}}}>Explore this county <ArrowRight size={16}/></Link><Link className="text-link" href={{pathname:`/species/${r.species_id}`}}>Species profile</Link></div><small className={styles.hint}>Published {r.published_at.slice(0,10)} Ã‚Â· Reference {r.id}</small></article>)}</div>
 {!recordId&&<div className={styles.row}><button className="text-link" disabled={!page} onClick={()=>{setPage(p=>p-1);setSelected(null);}}>Previous</button><span>Page {page+1}</span><button className="text-link" disabled={rows.length<=50} onClick={()=>{setPage(p=>p+1);setSelected(null);}}>Next</button></div>}
 </>}
 <div className={styles.row}><Link className="text-link" href={{pathname:"/observations"}}><ArrowLeft size={16}/> All reviewed observations</Link><Link className="text-link" href="/report">Report a sighting <ArrowRight size={16}/></Link></div>
 </Frame>;
}
