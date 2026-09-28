"use client";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Script from "next/script";
import { BookOpen, CheckCircle2, HeartHandshake, Info, Leaf, MapPin, Search, X } from "lucide-react";
import { configured, request, TURNSTILE_SITE_KEY } from "@/lib/participation/client";
import { STREAMS, type CatalogItem, type Preferences, type PublicConfig } from "@/lib/participation/contracts";
import styles from "./participation.module.css";
export { styles };
export function Frame({title,description,children,aside}:{title:string;description:string;children:ReactNode;aside?:ReactNode}) {
 return <main id="main-content" className={styles.page}><header className={styles.intro}><h1>{title}</h1><p>{description}</p></header>{aside?<div className={styles.layout}><div>{children}</div><aside className={styles.aside}>{aside}</aside></div>:children}</main>;
}
export function Notice({children,error=false,success=false}:{children:ReactNode;error?:boolean;success?:boolean}) {const Icon=success?CheckCircle2:Info;return <div role={error?"alert":"status"} className={`${styles.notice} ${error?styles.error:""}`}><Icon size={20} aria-hidden="true" style={{flexShrink:0,marginTop:2}}/><div>{children}</div></div>;}
export function useConfig() {
 const [config,setConfig]=useState<PublicConfig|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  setError("");setConfig(null);
  if(!configured){setConfig({email:false,reports:false,payments:false,wallets:[]});return;}
  let active=true;
  request<PublicConfig>("config").then(value=>{if(active)setConfig(value);}).catch(()=>{if(active)setError("We could not check availability. Please try again.");});
  return()=>{active=false;};
 },[attempt]);
 return {config,error,retry:()=>setAttempt(value=>value+1)};
}
export function ServiceStatus({config,error,ready,retry,children}:{config:PublicConfig|null;error:string;ready:boolean;retry:()=>void;children:ReactNode}){
 if(error)return <Notice error><p>{error}</p><button type="button" onClick={retry} className="text-link">Try again</button></Notice>;
 if(!config)return <p role="status" className={styles.hint}>Checking availability...</p>;
 return ready?null:<Notice>{children}</Notice>;
}
export function PlannedUpdates(){
 const icons={counties:MapPin,species:Leaf,facts:BookOpen,action:HeartHandshake};
 return <section className={styles.section} aria-labelledby="planned-updates"><h2 id="planned-updates">Choose what you will follow</h2><p className={styles.hint}>When updates launch, you will be able to choose any of these four options.</p><ul className={styles.planned}>{STREAMS.map(stream=>{const Icon=icons[stream.id];return <li key={stream.id}><Icon size={22} aria-hidden="true"/><div><h3>{stream.title}</h3><p>{stream.detail}</p></div></li>;})}</ul></section>;
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
 const id=useId(),[query,setQuery]=useState(""),[items,setItems]=useState<CatalogItem[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(false),[open,setOpen]=useState(false),[activeIndex,setActiveIndex]=useState(-1);
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{if(open&&activeIndex>=0)document.getElementById(id+"-option-"+activeIndex)?.scrollIntoView({block:"nearest"});},[activeIndex,id,open]);
 const available=items.filter(item=>!value.some(selected=>selected.id===item.id));
 const full=max>1&&value.length>=max;
 function choose(item:CatalogItem){if(full)return;onChange(max===1?[item]:[...value,item]);setQuery("");setItems([]);setOpen(false);setActiveIndex(-1);input.current?.focus();}
 useEffect(()=>{
  setItems([]);setError("");setActiveIndex(-1);
  if(query.trim().length<2){setLoading(false);return;}
  let current=true;setLoading(true);
  const timer=setTimeout(()=>{request<CatalogItem[]>("catalog?kind="+kind+"&q="+encodeURIComponent(query.trim())).then(result=>{if(current)setItems(result);}).catch(()=>{if(current)setError("Search is unavailable. Change the search to try again.");}).finally(()=>{if(current)setLoading(false);});},250);
  return()=>{current=false;clearTimeout(timer);};
 },[kind,query]);
 return <div onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setOpen(false);}}>
  <label className={styles.field} htmlFor={id}><span>{kind==="county"?"Find a county":"Find a species"}</span></label>
  <div className={styles.search}><Search size={18} aria-hidden="true"/><input ref={input} id={id} className={styles.input} value={query} onChange={event=>{setQuery(event.target.value);setOpen(true);}} onFocus={()=>setOpen(true)}
   placeholder={kind==="county"?"County or planning region":"Common or scientific name"} autoComplete="off" role="combobox" aria-autocomplete="list" aria-expanded={open&&available.length>0} aria-controls={id+"-results"} aria-describedby={id+"-hint"} aria-activedescendant={open&&activeIndex>=0&&activeIndex<available.length?id+"-option-"+activeIndex:undefined}
   onKeyDown={event=>{if(event.key==="Escape"){setOpen(false);setActiveIndex(-1);}else if((event.key==="ArrowDown"||event.key==="ArrowUp")&&available.length){event.preventDefault();setOpen(true);setActiveIndex(index=>event.key==="ArrowDown"?(index+1)%available.length:(index<=0?available.length-1:index-1));}else if(event.key==="Enter"&&open&&activeIndex>=0&&available[activeIndex]){event.preventDefault();choose(available[activeIndex]);}}}/></div>
  <p id={id+"-hint"} aria-live="polite" className={styles.hint}>{full?"You have reached the selection limit. Remove one to choose another.":query.trim().length<2?"Type at least two letters to search.":loading?"Searching...":error||(!items.length?"No matches. Try another name.":!available.length?"These matches are already selected.":"")}</p>
  <div id={id+"-results"} role="listbox" aria-label={kind+" search results"} hidden={!open||!available.length} className={styles.results}>{available.map((item,index)=><button type="button" role="option" tabIndex={-1} aria-selected={index===activeIndex} id={id+"-option-"+index} disabled={full} key={item.id} onMouseDown={event=>event.preventDefault()} onClick={()=>choose(item)}>{item.label}</button>)}</div>
  <div className={styles.tags}>{value.map(item=><span className={styles.tag} key={item.id}>{item.label}<button type="button" onClick={()=>onChange(value.filter(selected=>selected.id!==item.id))} aria-label={"Remove "+item.label}><X size={15} aria-hidden="true"/></button></span>)}</div>
 </div>;
}

export function PreferenceFields({value,onChange}:{value:Preferences;onChange:(p:Preferences)=>void}){
 const [counties,setCounties]=useState<CatalogItem[]>(value.counties.map(id=>({id,label:id}))),[species,setSpecies]=useState<CatalogItem[]>(value.species.map(id=>({id,label:id})));
 return <><div className={styles.choices}>{STREAMS.map(stream=><label className={styles.choice} key={stream.id}><input type="checkbox" checked={value.streams.includes(stream.id)} onChange={e=>onChange({...value,streams:e.target.checked?[...value.streams,stream.id]:value.streams.filter(v=>v!==stream.id)})}/><span><strong>{stream.title}</strong><small>{stream.detail}</small></span></label>)}</div>
 {value.streams.includes("counties")&&<CatalogPicker kind="county" value={counties} onChange={items=>{setCounties(items);onChange({...value,counties:items.map(i=>i.id)});}}/>}
 {value.streams.includes("species")&&<CatalogPicker kind="species" value={species} onChange={items=>{setSpecies(items);onChange({...value,species:items.map(i=>i.id)});}}/>}</>;
}
export function Honeypot(){return <label className={styles.hidden} aria-hidden="true">Leave this empty<input name="website" tabIndex={-1} autoComplete="off"/></label>;}
