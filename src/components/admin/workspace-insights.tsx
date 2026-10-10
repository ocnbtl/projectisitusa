"use client";
import { useEffect, useState } from "react";
import { backend } from "@/lib/participation/client";
import { displayAmount } from "@/lib/participation/contracts";
import { Notice, styles } from "@/components/participation/shared";
import admin from "./admin.module.css";
type Totals = {total?:number;confirmed?:number;pending?:number;suppressed?:number;joined30?:number;receipts?:number;receipts30?:number;checkedAt:string;currencies?:{currency:string;decimals:number;receipts:number;amount_minor:string}[];monthly:{month:string;joined?:number;currency?:string;decimals?:number;receipts?:number;amount_minor?:string}[];delivery30?:{state:string;messages:number}[]};
export function WorkspaceInsights({section}:{section:"audience"|"finance"}) {
 const [data,setData]=useState<Totals|null>(null),[error,setError]=useState(false);
 useEffect(()=>{let current=true;setData(null);setError(false);backend().rpc("isitusa_workspace_insights",{section}).then(({data,error})=>{if(current){if(error)setError(true);else setData(data as Totals);}});return()=>{current=false;};},[section]);
 if(error)return <Notice>Insights could not load. The records below are still available.</Notice>;
 if(!data)return <p role="status">Reading {section==="audience"?"audience":"contribution"} insights...</p>;
 return <WorkspaceInsightsView section={section} data={data}/>;
}
export function WorkspaceInsightsView({section,data}:{section:"audience"|"finance";data:Totals}) {
 const values: [string,number][] = section==="audience"?[["Confirmed",data.confirmed??0],["Awaiting confirmation",data.pending??0],["Suppressed",data.suppressed??0],["Joined / 30 days",data.joined30??0]]:[["Recorded receipts",data.receipts??0],["Receipts / 30 days",data.receipts30??0]];
 return <section className={admin.usage} aria-label={`${section} insights`}>
  <dl className={admin.usageTotals}>{values.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value.toLocaleString()}</dd></div>)}</dl>
  {section==="finance"&&<><p className={styles.hint}>Recorded gross receipts, separated by currency. These are not net revenue or the wallet balance; refunds and disputes remain separate. Missing imports are not counted.</p><dl className={admin.connectionList}>{data.currencies?.map(row=><div key={`${row.currency}:${row.decimals}`}><dt>{row.currency.toUpperCase()}</dt><dd><strong>{displayAmount(row.amount_minor,row.decimals,row.currency)}</strong>{row.receipts} recorded receipts</dd></div>)}</dl></>}
  <details className={admin.usageSection}><summary className="text-link">Explore the last 12 months</summary><p className={styles.hint}>All recorded {section==="audience"?"signups":"receipts"}, independent of the search and page below. Months use UTC.</p>{data.monthly.length?<div className={admin.tableWrap}><table className={admin.table}><thead><tr><th>Month</th><th>{section==="audience"?"Signups":"Receipts"}</th>{section==="finance"&&<th>Recorded gross amount</th>}</tr></thead><tbody>{data.monthly.map(row=><tr key={`${row.month}:${row.currency??"all"}:${row.decimals??0}`}><td>{row.month}</td><td>{section==="audience"?(row.joined??0):(row.receipts??0)}</td>{section==="finance"&&<td>{displayAmount(row.amount_minor??"0",row.decimals??0,row.currency??"")}</td>}</tr>)}</tbody></table></div>:<p>No records in this period.</p>}</details>
  {section==="audience"&&<details className={admin.usageSection}><summary className="text-link">Email delivery and measurement</summary><p className={styles.hint}>Outbox messages created in the last 30 days. Sent means accepted by the provider, not delivered to an inbox.</p>{data.delivery30?.length?<ul>{data.delivery30.map(row=><li key={row.state}>{row.state}: {row.messages}</li>)}</ul>:<p>No delivery records yet.</p>}<p className={styles.hint}>Open and click rates are not collected by this workspace yet. They are unavailable, rather than zero. Email privacy tools can also inflate opens; they should never be treated as confirmed reading.</p></details>}
 </section>;
}
