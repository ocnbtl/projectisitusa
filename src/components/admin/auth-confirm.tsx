"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { backend, configured } from "@/lib/participation/client";
import { Notice, styles } from "@/components/participation/shared";
import { AccountFrame } from "./account-frame";
import { Workspace } from "./workspace";
import admin from "./admin.module.css";

export function AuthConfirm({client=backend,complete}:{client?:typeof backend;complete?:ReactNode}={}){
 const initialized=useRef(false),available=client!==backend||configured;
 const [hash,setHash]=useState(""),[type,setType]=useState<"invite"|"recovery">("invite"),[verified,setVerified]=useState(false),[password,setPassword]=useState(""),[confirmation,setConfirmation]=useState(""),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false),[loaded,setLoaded]=useState(false);
 useEffect(()=>{if(initialized.current)return;initialized.current=true;const params=new URLSearchParams(location.hash.slice(1));const kind=params.get("type");if(kind==="invite"||kind==="recovery"){setType(kind);setHash(params.get("token_hash")??"");}history.replaceState(null,"",location.pathname);setLoaded(true);},[]);
 async function verify(){setBusy(true);setError("");try{const result=await client().auth.verifyOtp({token_hash:hash,type});if(result.error)throw result.error;setHash("");setVerified(true);}catch{setHash("");setError("This link has expired or has already been used. Request a fresh password email to continue with the same account.");}finally{setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{if(password.length<12)throw new Error("Use at least 12 characters.");if(password!==confirmation)throw new Error("The passwords do not match. Enter the same password in both fields.");const result=await client().auth.updateUser({password});if(result.error)throw result.error;setPassword("");setConfirmation("");setDone(true);}catch(err){setError(err instanceof Error?err.message:"The password could not be saved. Please try again.");}finally{setBusy(false);}}
 if(done)return complete??<Workspace onboarding/>;
 const missing=loaded&&!hash&&!verified;
 return <main id="main-content"><AccountFrame step={verified?1:0} title={verified?"Choose your password.":missing?"Let’s get you a fresh link.":type==="invite"?"Join the Isitusa team.":"Reset your password."} description={verified?"Save a password, then protect your account with an authenticator. You’ll stay signed in for the next step.":missing?"An invitation or recovery link is needed to set your password. If you already saved one, you can sign in and finish setting up your authenticator.":"Verify the link from your email to continue. We only use it when you press the button below."}>
  {error&&<Notice error>{error}</Notice>}
  {!available?<Notice>Account setup is temporarily unavailable. Please try again later.</Notice>:!loaded?<p role="status">Reading your invitation…</p>:missing?<div className={admin.accountActions}><Link href="/admin" className={styles.button}>Sign in or request a new link</Link></div>:!verified?<button className={styles.button} disabled={busy} onClick={()=>void verify()}>{busy?"Verifying link…":"Verify email and continue"}</button>:<form className={styles.form} onSubmit={save} aria-busy={busy}>
   <label className={styles.field}>New password<input className={styles.input} type={visible?"text":"password"} autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy} aria-describedby="password-help"/></label>
   <p id="password-help" className={styles.hint}>Use at least 12 characters. A few unrelated words make a memorable passphrase.</p>
   <label className={styles.field}>Confirm password<input className={styles.input} type={visible?"text":"password"} autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)} required disabled={busy}/></label>
   <label className={admin.showPassword}><input type="checkbox" checked={visible} onChange={e=>setVisible(e.target.checked)}/>Show passwords</label>
   <button className={styles.button} disabled={busy}>{busy?"Saving password…":"Save password and continue"}</button>
  </form>}
 </AccountFrame></main>;
}
