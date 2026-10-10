"use client";
import { useState, type FormEvent } from "react";
import { MessageSquareText, Send } from "lucide-react";
import { CORRECTION_CATEGORIES, validateCorrection } from "@/lib/participation/corrections";
import { request } from "@/lib/participation/client";
import { Challenge, Honeypot, Notice, styles, useConfig } from "./shared";

export function ProfileCorrection({ speciesId, name }: { speciesId: string; name: string }) {
  const [open, setOpen] = useState(false);
  return <section className="profile-correction reading-section" aria-label="Suggest a profile correction">
    <button type="button" className="text-link inline-flex min-h-11 items-center gap-2" aria-expanded={open} onClick={() => setOpen(value => !value)}><MessageSquareText size={18} aria-hidden="true"/>{open ? "Close correction form" : "Something not quite right? Suggest a correction"}</button>
    {open && <CorrectionForm speciesId={speciesId} name={name}/>}
  </section>;
}
export function CorrectionForm({ speciesId, name, preview=false }: { speciesId: string; name: string; preview?: boolean }) {
  const {config,error:configError,retry} = useConfig();
  const [challenge,setChallenge]=useState(""),[reset,setReset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[receipt,setReceipt]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(busy||preview)return;
    const form=new FormData(event.currentTarget);
    setError("");
    try {
      const input=validateCorrection({species_id:speciesId,categories:form.getAll("categories"),details:form.get("details"),source_url:form.get("source_url"),consent:form.get("consent")==="on"});
      if(!challenge)throw new Error("Complete the security check.");
      setBusy(true);
      const result=await request<{id:string}>("correction",{...input,consent:true,challenge,website:form.get("website")});
      setReceipt(result.id);
    }catch(failure){setError(failure instanceof Error?failure.message:"We could not save your suggestion. Please retry.");}
    finally{setBusy(false);setChallenge("");setReset(n=>n+1);}
  }
  if(receipt)return <Notice success><strong>Thank you for helping improve this profile.</strong><p>Your suggestion is in our private review queue. A reviewer will check it before anything changes on the website.</p><p className={styles.hint}>Reference: {receipt}</p></Notice>;
  if(!preview&&configError)return <Notice error>{configError} <button className="text-link" onClick={retry}>Try again</button></Notice>;
  if(!preview&&!config)return <p role="status">Checking availability...</p>;
  if(!preview&&!config?.corrections)return <Notice>Correction submissions are temporarily unavailable. Please try again later.</Notice>;
  return <form className={styles.form} onSubmit={submit} data-private aria-busy={busy}>
    <h3>What should we check about {name}?</h3>
    <p className={styles.hint}>Tell us what looks wrong and, if possible, share a reliable source. Please leave out personal information.</p>
    <fieldset disabled={busy}><legend className={styles.field}>Choose all that apply</legend><div className={styles.choices}>{Object.entries(CORRECTION_CATEGORIES).map(([value,label])=><label className={styles.choice} key={value}><input type="checkbox" name="categories" value={value}/><span>{label}</span></label>)}</div>
    <label className={styles.field}>Your suggested correction<textarea name="details" required minLength={20} maxLength={3000} className={styles.textarea}/></label>
    <label className={styles.field}>Source link (optional)<input name="source_url" type="url" maxLength={1500} placeholder="https://" className={styles.input}/></label>
    <label className={styles.choice}><input type="checkbox" name="consent" required/><span>ISITUSA may store and review this suggestion to improve the profile.</span></label>
    <Honeypot/>{preview?<p className={styles.hint}>Presentation preview. Security check and submission are disabled.</p>:<Challenge action="correction" onToken={setChallenge} reset={reset}/>}
    <button className={styles.button} disabled={preview||busy||!challenge}><Send size={16} aria-hidden="true"/>{busy?"Sending suggestion...":"Send for review"}</button></fieldset>
    {error&&<Notice error>{error}</Notice>}
  </form>;
}
