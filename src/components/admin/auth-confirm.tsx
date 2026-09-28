"use client";
import { useEffect, useState, type FormEvent } from "react";
import { backend, configured } from "@/lib/participation/client";
import { Notice, styles } from "@/components/participation/shared";
import admin from "./admin.module.css";
export function AuthConfirm(){
 const [hash,setHash]=useState(""),[type,setType]=useState<"invite"|"recovery">("invite"),[verified,setVerified]=useState(false),[password,setPassword]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[done,setDone]=useState(false);
 useEffect(()=>{const params=new URLSearchParams(location.hash.slice(1));const kind=params.get("type");if(kind==="invite"||kind==="recovery"){setType(kind);setHash(params.get("token_hash")??"");}history.replaceState(null,"",location.pathname);},[]);
 async function verify(){setBusy(true);setError("");try{const result=await backend().auth.verifyOtp({token_hash:hash,type});if(result.error)throw result.error;setHash("");setVerified(true);}catch{setError("This link is expired or invalid. Request a new invitation or recovery email.");}finally{setBusy(false);}}
 async function save(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{if(password.length<12)throw new Error("Use at least 12 characters.");const result=await backend().auth.updateUser({password});if(result.error)throw result.error;setPassword("");await backend().auth.signOut();setDone(true);}catch(err){setError(err instanceof Error?err.message:"The password could not be saved.");}finally{setBusy(false);}}
 return <main id="main-content" className={admin.login}><h1>{type==="invite"?"Your place on the team.":"Reset your password."}</h1>{error&&<Notice error>{error}</Notice>}{done?<Notice success>Your password is saved. <a href="/admin" className="text-link">Sign in to the workspace</a>.</Notice>:!verified?<><p>Continue to verify this private link. It is only used when you press the button.</p><button className={styles.button} disabled={!configured||!hash||busy} onClick={()=>void verify()}>Continue</button></>:<form className={styles.form} onSubmit={save}><label className={styles.field}>Choose a password<input className={styles.input} type="password" autoComplete="new-password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className={styles.button} disabled={busy}>Save password</button></form>}</main>;
}
