"use client";
import { useEffect, useState, type FormEvent } from "react";
import { FilePlus2, Save } from "lucide-react";
import { backend } from "@/lib/participation/client";
import { Notice, styles } from "@/components/participation/shared";
import admin from "./admin.module.css";
type Draft={id:string;subject:string;body:string;stream:string;status:string;version:number};
export function CampaignDrafts({onDirtyChange,refreshSignal=0}:{onDirtyChange?:(dirty:boolean)=>void;refreshSignal?:number}){
 const [drafts,setDrafts]=useState<Draft[]>([]),[selected,setSelected]=useState<Draft|null>(null),[subject,setSubject]=useState(""),[body,setBody]=useState(""),[stream,setStream]=useState("facts"),[error,setError]=useState(""),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[message,setMessage]=useState(""),[dirty,setDirty]=useState(false),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);backend().from("isitusa_campaigns").select("id,subject,body,stream,status,version").order("updated_at",{ascending:false}).limit(30).then(result=>{if(!active)return;if(result.error)setError("Drafts could not load. Refresh your workspace to try again.");else setDrafts(result.data);setLoading(false);});return()=>{active=false;};},[revision,refreshSignal]);
 useEffect(()=>{onDirtyChange?.(dirty);return()=>onDirtyChange?.(false);},[dirty,onDirtyChange]);
 useEffect(()=>{if(!dirty)return;const leave=(event:BeforeUnloadEvent)=>{event.preventDefault();};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[dirty]);
 function select(draft:Draft|null){if(dirty&&!window.confirm("Discard your unsaved draft changes?"))return;setSelected(draft);setSubject(draft?.subject??"");setBody(draft?.body??"");setStream(draft?.stream??"facts");setError("");setMessage("");setDirty(false);}
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();await persist("draft");}
 async function persist(status:"draft"|"cancelled"){
  setBusy(true);setError("");setMessage("");
  try{
   const client=backend();
   if(selected){const result=await client.rpc("isitusa_edit_campaign",{campaign:selected.id,expected_version:selected.version,next_stream:stream,next_subject:subject.trim(),next_body:body.trim(),next_status:status});if(result.error)throw result.error;setSelected({...selected,stream,subject:subject.trim(),body:body.trim(),status,version:result.data.version});}
   else {const result=await client.rpc("isitusa_campaign",{stream,subject:subject.trim(),body:body.trim()});if(result.error)throw result.error;setSelected({id:result.data,stream,subject:subject.trim(),body:body.trim(),status:"draft",version:0});}
   setDirty(false);setMessage(status==="cancelled"?"Draft archived. You can reopen it later.":"Draft saved. No email has been sent.");setRevision(n=>n+1);
  }catch(err){setError(err instanceof Error?err.message:"The draft could not be saved. Your text is still here.");}finally{setBusy(false);}
 }
 const locked=selected?.status==="approved";
 return <section className={styles.section}><h3>Prepare an update</h3><p className={styles.hint}>Write, revisit and refine. Drafts stay private; saving does not send an email.</p><div className={admin.draftLayout}><div className={admin.draftList}><button type="button" aria-pressed={!selected} onClick={()=>select(null)} disabled={busy}><FilePlus2 size={16} aria-hidden="true"/> New draft</button>{loading&&<p role="status" className={styles.hint}>Reading drafts...</p>}{drafts.map(draft=><button type="button" key={draft.id} aria-pressed={selected?.id===draft.id} disabled={busy} onClick={()=>select(draft)}>{draft.subject}<span>{draft.status==="cancelled"?"Archived":draft.status==="approved"?"Approved":"Draft"}</span></button>)}</div><form className={styles.form} onSubmit={save}>
 <label className={styles.field}>Email choice<select value={stream} onChange={e=>{setStream(e.target.value);setDirty(true);}} className={styles.select} disabled={busy||locked}><option value="facts">Get to know invasive species</option><option value="action">Ways to help</option></select></label>
 <label className={styles.field}>Subject<input value={subject} onChange={e=>{setSubject(e.target.value);setDirty(true);}} required maxLength={150} className={styles.input} disabled={busy||locked}/></label>
 <label className={styles.field}>Message<textarea value={body} onChange={e=>{setBody(e.target.value);setDirty(true);}} required maxLength={10000} rows={10} className={styles.textarea} disabled={busy||locked}/></label><p className={styles.hint}>{body.length.toLocaleString()} / 10,000 characters{dirty?" - Unsaved changes":""}</p>
 {locked?<Notice>Approved messages are locked here to preserve their reviewed content.</Notice>:<div className={admin.draftActions}><button className={styles.button} disabled={busy||!subject.trim()||!body.trim()}><Save size={16} aria-hidden="true"/>{busy?"Saving...":selected?.status==="cancelled"?"Restore draft":"Save draft"}</button>{selected&&selected.status!=="cancelled"&&<button className={`${styles.button} ${styles.secondary}`} type="button" disabled={busy} onClick={()=>void persist("cancelled")}>Archive draft</button>}</div>}
 {error&&<Notice error>{error}</Notice>}{message&&<Notice success>{message}</Notice>}</form></div></section>;
}
