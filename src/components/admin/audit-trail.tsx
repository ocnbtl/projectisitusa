"use client";
import { useEffect, useState } from "react";
import { backend } from "@/lib/participation/client";
import { Notice, styles } from "@/components/participation/shared";
import admin from "./admin.module.css";
type Audit = { id: number; action: string; entity_id: string; created_at: string };
const names:Record<string,string>={"campaign.draft":"Email draft created","campaign.edit":"Email draft updated","sighting.review":"Observation reviewed","staff.save":"Team access updated","staff.invite":"Invitation issued","wallet.save":"Receiving address updated","crypto.receipt":"Crypto receipt recorded"};
export function AuditTrail(){
  const [rows,setRows]=useState<Audit[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false);
  useEffect(()=>{let active=true;backend().from("isitusa_audit").select("id,action,entity_id,created_at").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(25).then(result=>{if(!active)return;setLoading(false);if(result.error)setError(true);else setRows(result.data);});return()=>{active=false;};},[]);
  return <section className={styles.section}><h3>Recent workspace changes</h3><p className={styles.hint}>The most recent 25 audit records. This history records saved actions, not page visits.</p>{loading?<p role="status">Reading history...</p>:error?<Notice error>History could not load. Refresh the workspace to try again.</Notice>:rows.length?<div className={admin.tableWrap}><table className={admin.table}><thead><tr><th>When</th><th>Action</th><th>Record reference</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{new Date(row.created_at).toLocaleString()}</td><td>{names[row.action]??row.action.replaceAll("."," ")}</td><td style={{overflowWrap:"anywhere"}}>{row.entity_id}</td></tr>)}</tbody></table></div>:<p className={admin.empty}>Saved workspace actions will appear here.</p>}</section>;
}
