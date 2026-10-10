"use client";
import { useEffect,useState,type FormEvent } from "react";
import { backend } from "@/lib/participation/client";
import { CORRECTION_CATEGORIES,type CorrectionCategory } from "@/lib/participation/corrections";
import { Notice,styles } from "@/components/participation/shared";
import admin from "./admin.module.css";

type Suggestion={id:string;species_id:string;categories:CorrectionCategory[];details:string;source_url:string|null;status:string;review_note:string;version:number;created_at:string};
const STATES:Record<string,string>={submitted:"New suggestion",in_review:"Being checked",resolved:"Resolved",declined:"Not adopted"};
const example:Suggestion={id:"preview-correction",species_id:"acer-pseudoplatanus",categories:["identification"],details:"Could the identification section explain how to distinguish this tree from similar maples? The leaf shape alone may be confusing.",source_url:"https://plants.ces.ncsu.edu/plants/acer-pseudoplatanus/",status:"submitted",review_note:"",version:0,created_at:"2026-10-10T12:00:00Z"};
export function CorrectionQueue({preview=false,canDecide,onDirtyChange}:{preview?:boolean;canDecide:boolean;onDirtyChange?:(value:boolean)=>void}){
 const [rows,setRows]=useState<Suggestion[]>([]),[selected,setSelected]=useState<Suggestion|null>(null),[filter,setFilter]=useState("open"),[page,setPage]=useState(0),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(""),[revision,setRevision]=useState(0),[dirty,setDirty]=useState(false);
 const onDirty=(value:boolean)=>{setDirty(value);onDirtyChange?.(value);};
 useEffect(()=>{const leave=(event:BeforeUnloadEvent)=>{if(dirty){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[dirty]);
 function change(action:()=>void){if(dirty&&!window.confirm("Discard the unsaved review note?"))return;onDirty(false);setSelected(null);action();}
 useEffect(()=>{if(preview){setRows([example]);setLoading(false);return;}let current=true;setLoading(true);setError("");
   let query=backend().from("isitusa_profile_corrections").select("id,species_id,categories,details,source_url,status,review_note,version,created_at").order("created_at",{ascending:false}).order("id");
   query=filter==="open"?query.in("status",["submitted","in_review"]):filter==="all"?query:query.eq("status",filter);
   query.range(page*25,page*25+25).then(result=>{if(!current)return;if(result.error){setError("Corrections could not load. Check your connection and team access, then retry.");setRows([]);}else{setRows(result.data.slice(0,25));setMore(result.data.length>25);}setLoading(false);});
   return()=>{current=false;};
 },[filter,page,revision,preview]);
 return <section aria-label="Community corrections"><p className={styles.hint}>Suggestions from readers stay private until checked. Resolving a suggestion records your decision; it does not automatically change a profile or county evidence.</p>
 <div className={admin.toolbar}><label>Show<select className={styles.select} value={filter} onChange={event=>change(()=>{setFilter(event.target.value);setPage(0);})}><option value="open">Awaiting review</option><option value="all">All suggestions</option>{Object.entries(STATES).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className="text-link" onClick={()=>change(()=>setRevision(n=>n+1))}>Refresh suggestions</button></div>
 {preview&&<Notice>Example suggestions only. Reviews in this preview are not saved.</Notice>}
 {error&&<Notice error>{error}</Notice>}{loading?<p role="status">Reading suggestions...</p>:<div className={selected?admin.split:undefined}><div>{rows.length?<div className={admin.tableWrap}><table className={admin.table}><thead><tr><th>Profile and suggested change</th><th>Status</th></tr></thead><tbody>{rows.map(row=><tr key={row.id} aria-selected={selected?.id===row.id}><td><button onClick={()=>change(()=>setSelected(row))}>{row.species_id.replaceAll("-"," ")}</button><p className={styles.hint}>{row.categories.map(category=>CORRECTION_CATEGORIES[category]).join(" · ")}<br/>{new Date(row.created_at).toLocaleDateString()}</p></td><td>{STATES[row.status]}</td></tr>)}</tbody></table></div>:!error&&<p className={admin.empty}>No suggestions in this view. New profile corrections will arrive here.</p>}
 <div className={styles.row}><button className="text-link" disabled={!page} onClick={()=>change(()=>setPage(n=>n-1))}>Previous</button><span>Page {page+1}</span><button className="text-link" disabled={!more} onClick={()=>change(()=>setPage(n=>n+1))}>Next</button></div></div>
 {selected&&<CorrectionReview key={selected.id} item={selected} canDecide={canDecide} preview={preview} onDirty={onDirty} onSaved={()=>{onDirty(false);setSelected(null);setRevision(n=>n+1);}}/>}</div>}
 </section>;
}
function CorrectionReview({item,canDecide,preview,onDirty,onSaved}:{item:Suggestion;canDecide:boolean;preview:boolean;onDirty:(value:boolean)=>void;onSaved:()=>void}){
 const [note,setNote]=useState(item.review_note),[status,setStatus]=useState(item.status),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(event:FormEvent){event.preventDefault();if(busy)return;setBusy(true);setError("");try{
  if(!preview){const result=await backend().rpc("isitusa_review_correction",{correction:item.id,expected_version:item.version,next_status:status,note});if(result.error)throw new Error(result.error.code==="40001"?"Someone updated this suggestion. Keep your note and refresh before saving.":"The review could not save. Check your access and try again.");}
  onSaved();
 }catch(failure){setError(failure instanceof Error?failure.message:"Could not save review.");}finally{setBusy(false);}}
 return <article className={admin.detail}><h3>{item.species_id.replaceAll("-"," ")}</h3><p style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{item.details}</p>
 {item.source_url&&/^https:\/\//.test(item.source_url)&&<a className="text-link" href={item.source_url} target="_blank" rel="noopener noreferrer nofollow">Open reader-provided source ↗</a>}
 <form className={styles.form} onSubmit={save}><fieldset disabled={busy}><label className={styles.field}>Review note<textarea className={styles.textarea} maxLength={3000} value={note} onChange={event=>{setNote(event.target.value);onDirty(true);}} required={["resolved","declined"].includes(status)} minLength={["resolved","declined"].includes(status)?10:undefined}/></label><label className={styles.field}>Decision<select className={styles.select} value={status} onChange={event=>{setStatus(event.target.value);onDirty(true);}}>{Object.entries(STATES).map(([value,label])=><option key={value} value={value} disabled={!canDecide&&["resolved","declined"].includes(value)}>{label}</option>)}</select></label><button className={styles.button} disabled={busy}>{busy?"Saving...":preview?"Try review in preview":"Save review"}</button></fieldset>{error&&<Notice error>{error}</Notice>}</form></article>;
}
