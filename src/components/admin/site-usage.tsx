"use client";
import { useEffect, useState } from "react";
import { request } from "@/lib/participation/client";
import { Notice, styles } from "@/components/participation/shared";
import admin from "./admin.module.css";
export type Snapshot = { checkedAt:string; summary:number[][]; daily:[string,number,number][]; pages:[string,number,number][]; actions:[string,number][] };
const LABELS:Record<string,string> = {county_selected:"County explored",map_filter_changed:"Map filter changed",zip_search_completed:"ZIP search completed",species_search_completed:"Species searched",species_opened:"Species profile opened",directory_view_changed:"Directory view changed",evidence_opened:"Evidence expanded",source_opened:"Source opened",county_card_downloaded:"County card downloaded",signup_requested:"Signup submitted",signup_request_accepted:"Confirmation email requested",signup_request_failed:"Signup request failed",sighting_started:"Sighting form started",sighting_submitted:"Sighting received",sighting_failed:"Sighting submission failed",contribution_method_selected:"Contribution method selected",checkout_started:"Checkout requested",checkout_opened:"Secure checkout opened",checkout_failed:"Checkout failed",crypto_address_copied:"Crypto address copied"};
export function SiteUsage({token}:{token:string}) {
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(""),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setData(null);setError("");request<Snapshot>("analytics",{},token).then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError("Site analytics is unavailable. Your other workspace sections still work.");});return()=>{active=false;};},[token,attempt]);
 if(error)return <Notice error>{error} <button className="text-link" type="button" onClick={()=>setAttempt(n=>n+1)}>Try again</button></Notice>;
 if(!data)return <p role="status" className={admin.empty}>Reading site activity...</p>;
 return <SiteUsageView data={data}/>;
}
export function SiteUsageView({data}:{data:Snapshot}){
 const [monthly=0,weekly=0,active=0,pageviews=0]=data.summary[0]??[];
 const max=Math.max(1,...data.daily.map(row=>Number(row[1])));
 return <div className={admin.usage}>
  <p className={styles.hint}>Visitors are browsers that allowed analytics. These counts exclude people who declined or blocked tracking. Updated {new Date(data.checkedAt).toLocaleString()}; cached for up to five minutes.</p>
  <dl className={admin.usageTotals}>{[["Visitors / 30 days",monthly],["Visitors / 7 days",weekly],["Seen / last 5 minutes",active],["Page views / 30 days",pageviews]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{Number(value).toLocaleString()}</dd></div>)}</dl>
  <section className={admin.usageSection}><h3>Visits over time</h3><p className={styles.hint}>Unique browsers each day, in UTC. Daily counts do not add up to unique monthly visitors.</p>{data.daily.length?<div className={admin.activityChart} role="img" aria-label="Daily visitors. Exact values are in the table below.">{data.daily.map(([day,visitors])=><div key={day} title={`${day}: ${visitors} visitors`}><span style={{height:`${Math.max(2,Number(visitors)/max*100)}%`}}/></div>)}</div>:<p className={admin.empty}>No visits recorded yet. Counts will appear after consenting visitors use the site.</p>}<details><summary className="text-link">View daily figures</summary><div className={admin.tableWrap}><table className={admin.table}><thead><tr><th>Date (UTC)</th><th>Visitors</th><th>Page views</th></tr></thead><tbody>{data.daily.map(([day,visitors,views])=><tr key={day}><td>{day}</td><td>{visitors}</td><td>{views}</td></tr>)}</tbody></table></div></details></section>
  <section className={admin.usageSection}><h3>What people use</h3><p className={styles.hint}>Actions and outcomes over the last 30 days. A checkout opening is not a donation; confirmation requests are not confirmed subscribers.</p>{data.actions.length?<div className={admin.tableWrap}><table className={admin.table}><thead><tr><th>Action</th><th>Uses</th></tr></thead><tbody>{data.actions.map(([action,uses])=><tr key={action}><td>{LABELS[action]??"Other site action"}</td><td>{uses.toLocaleString()}</td></tr>)}</tbody></table></div>:<p>No site actions recorded yet.</p>}</section>
  <section className={admin.usageSection}><h3>Pages people visit</h3>{data.pages.length?<div className={admin.tableWrap}><table className={admin.table}><thead><tr><th>Page</th><th>Visitors</th><th>Views</th></tr></thead><tbody>{data.pages.map(([page,visitors,views])=><tr key={page}><td>{page==="/"?"Map":page}</td><td>{visitors}</td><td>{views}</td></tr>)}</tbody></table></div>:<p>No page views recorded yet.</p>}</section>
 </div>;
}
