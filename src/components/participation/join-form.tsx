"use client";
import { track } from "@/lib/ui/telemetry";
import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { request, TURNSTILE_SITE_KEY } from "@/lib/participation/client";
import { EMPTY_PREFERENCES, validatePreferences, type Preferences } from "@/lib/participation/contracts";
import { Challenge, Frame, Honeypot, Notice, PlannedUpdates, PreferenceFields, ServiceStatus, styles, useConfig } from "./shared";
export function JoinForm(){
 const {config,error:configError,retry}=useConfig(),[preferences,setPreferences]=useState<Preferences>(EMPTY_PREFERENCES),[challenge,setChallenge]=useState(""),[reset,setReset]=useState(0),[busy,setBusy]=useState(false),[message,setMessage]=useState(""),[error,setError]=useState("");
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setError("");setMessage("");const form=new FormData(e.currentTarget);try{validatePreferences(preferences);setBusy(true);track("signup_requested",{surface:"join"});const result=await request<{message:string}>("signup",{email:form.get("email"),preferences,challenge,website:form.get("website")});setMessage(result.message);track("signup_request_accepted",{surface:"join"});}catch(err){track("signup_request_failed",{surface:"join"});setError(err instanceof Error?err.message:"Please try again.");}finally{setBusy(false);setReset(n=>n+1);setChallenge("");}}
 const ready=Boolean(config?.email&&TURNSTILE_SITE_KEY);
 return <Frame title="Stay close to what matters." description="Follow your county, keep an eye on a species, or find a new way to help. Choose the emails that are useful to you." aside={<><h2>Your interests. Your inbox.</h2><p>Every choice is optional. You can change your preferences or unsubscribe at any time.</p><p>A newly added record can describe an older observation. Our updates keep those dates clear and link you to the source.</p></>}>
 <ServiceStatus config={config} error={configError} ready={ready} retry={retry}><strong>Email updates are on their way.</strong><p>Signups are not open yet. For now, you can <a href="/research" className="text-link">follow our progress on the research page</a>.</p></ServiceStatus>
 {config&&!ready&&<PlannedUpdates/>}
 {ready&&<form className={styles.form} onSubmit={submit} aria-busy={busy}>
 <fieldset disabled={!ready||busy}><label className={styles.field}>Email address<input type="email" name="email" autoComplete="email" maxLength={254} required className={styles.input}/></label>
 <PreferenceFields value={preferences} onChange={setPreferences}/><Honeypot/><p className={styles.hint}>We will send a confirmation link before subscribing you. See how we handle your information in our <a className="text-link" href="/privacy">privacy notice</a>.</p>
 {ready&&<Challenge action="signup" onToken={setChallenge} reset={reset}/>}<button className={styles.button} disabled={!challenge||busy}><Mail size={18} aria-hidden="true"/>{busy?"Saving your request...":"Send my confirmation"}</button></fieldset>
 {error&&<Notice error>{error}</Notice>}{message&&<Notice success>{message}</Notice>}</form>}</Frame>;
}
