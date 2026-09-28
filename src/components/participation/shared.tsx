"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Script from "next/script";
import { CheckCircle2, Info, Search, X } from "lucide-react";
import { configured, request, TURNSTILE_SITE_KEY } from "@/lib/participation/client";
import { STREAMS, type CatalogItem, type Preferences, type PublicConfig } from "@/lib/participation/contracts";
import styles from "./participation.module.css";
export { styles };
export function Frame({title,description,children,aside}:{title:string;description:string;children:ReactNode;aside?:ReactNode}) {
 return <main id="main-content" className={styles.page}><header className={styles.intro}><h1>{title}</h1><p>{description}</p></header>{aside?<div className={styles.layout}><div>{children}</div><aside className={styles.aside}>{aside}</aside></div>:children}<footer className={styles.footer}><span>IsItUSA · Independent initiative · United States</span><a href="/privacy">Privacy</a><a href="/terms">Support terms</a><a href="/preferences">Email preferences</a></footer></main>;
}
export function Notice({children,error=false,success=false}:{children:ReactNode;error?:boolean;success?:boolean}) {const Icon=success?CheckCircle2:Info;return <div role={error?"alert":"status"} className={`${styles.notice} ${error?styles.error:""}`}><Icon size={20} aria-hidden="true" style={{flexShrink:0,marginTop:2}}/><div>{children}</div></div>;}
export function useConfig() {
 const [config,setConfig]=useState<PublicConfig|null>(null),[error,setError]=useState("");
 useEffect(()=>{if(!configured){setConfig({email:false,reports:false,payments:false,wallets:[]});return;}let active=true;request<PublicConfig>("config").then(value=>{if(active)setConfig(value);}).catch(()=>{if(active)setError("We couldn't load this service. Please refresh to try again.");});return()=>{active=false;};},[]);
 return {config,error};
}
type Turnstile={render:(container:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void};
declare global {interface Window {turnstile?:Turnstile}}
export function Challenge({action,onToken,reset}:{action:string;onToken:(token:string)=>void;reset:number}){
 const container=useRef<HTMLDivElement>(null),callback=useRef(onToken),[ready,setReady]=useState(false),[error,setError]=useState(false);
 callback.current=onToken;
 useEffect(()=>{if(!ready||!container.current||!window.turnstile)return;callback.current("");const id=window.turnstile.render(container.current,{sitekey:TURNSTILE_SITE_KEY,action,callback:(token:string)=>{setError(false);callback.current(token);},"expired-callback":()=>callback.current(""),"error-callback":()=>{callback.current("");setError(true);}});return()=>{window.turnstile?.remove(id);};},[ready,action,reset]);
 if(!TURNSTILE_SITE_KEY)return null;
 return <><Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={()=>setReady(true)} onError={()=>setError(true)}/><div ref={container}/>{error&&<p role="alert" className={styles.error}>The security check could not load. Refresh this page to try again.</p>}</>;
}
export function CatalogPicker({kind,value,onChange,max=20}:{kind:"county"|"species";value:CatalogItem[];onChange:(items:CatalogItem[])=>void;max?:number}){
 const [query,setQuery]=useState(""),[items,setItems]=useState<CatalogItem[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false);
 useEffect(()=>{setItems([]);setError("");if(query.trim().length<2)return;let current=true;setLoading(true);const timer=setTimeout(()=>{request<CatalogItem[]>(`catalog?kind=${kind}&q=${encodeURIComponent(query.trim())}`).then(result=>{if(current)setItems(result);}).catch(()=>{if(current)setError("Search is unavailable. Please try again.");}).finally(()=>{if(current)setLoading(false);});},250);return()=>{current=false;clearTimeout(timer);};},[kind,query]);
 return <div><label className={styles.field}><span>{kind==="county"?"Find a county":"Find a species"}</span><div className={styles.row}><Search size={18} aria-hidden="true"/><input className={styles.input} style={{flex:1}} value={query} onChange={e=>setQuery(e.target.value)} placeholder={kind==="county"?"County or planning region":"Common or scientific name"} autoComplete="off"/></div></label>
 {query.trim().length>=2&&<div aria-live="polite" className={styles.hint}>{loading?"Searching...":error||(!items.length?"No matches yet. Try another name.":"")}</div>}
 {items.length>0&&<div className={styles.results} aria-label={`${kind} search results`}>{items.filter(item=>!value.some(v=>v.id===item.id)).map(item=><button type="button" key={item.id} disabled={value.length>=max} onClick={()=>{onChange(max===1?[item]:[...value,item]);setQuery("");setItems([]);}}>{item.label}</button>)}</div>}
 <div className={styles.tags}>{value.map(item=><span className={styles.tag} key={item.id}>{item.label}<button type="button" onClick={()=>onChange(value.filter(v=>v.id!==item.id))} aria-label={`Remove ${item.label}`}><X size={14}/></button></span>)}</div></div>;
}
export function PreferenceFields({value,onChange}:{value:Preferences;onChange:(p:Preferences)=>void}){
 const [counties,setCounties]=useState<CatalogItem[]>(value.counties.map(id=>({id,label:id}))),[species,setSpecies]=useState<CatalogItem[]>(value.species.map(id=>({id,label:id})));
 return <><div className={styles.choices}>{STREAMS.map(stream=><label className={styles.choice} key={stream.id}><input type="checkbox" checked={value.streams.includes(stream.id)} onChange={e=>onChange({...value,streams:e.target.checked?[...value.streams,stream.id]:value.streams.filter(v=>v!==stream.id)})}/><span><strong>{stream.title}</strong><small>{stream.detail}</small></span></label>)}</div>
 {value.streams.includes("counties")&&<CatalogPicker kind="county" value={counties} onChange={items=>{setCounties(items);onChange({...value,counties:items.map(i=>i.id)});}}/>}
 {value.streams.includes("species")&&<CatalogPicker kind="species" value={species} onChange={items=>{setSpecies(items);onChange({...value,species:items.map(i=>i.id)});}}/>}</>;
}
export function Honeypot(){return <label className={styles.hidden} aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off"/></label>;}
