"use client";
import { EditorialArt, IllustratedIntro } from "@/components/editorial-art";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Users } from "lucide-react";
import { AVAILABILITY, VOLUNTEER_INTERESTS, validateVolunteer } from "@/lib/participation/volunteers";
import { request } from "@/lib/participation/client";
import { Challenge, Honeypot, Notice, ServiceStatus, styles, useConfig } from "./shared";
import css from "./volunteer.module.css";

export function VolunteerForm(){
 const {config,error:configError,retry}=useConfig();
 const [interests,setInterests]=useState<string[]>([]),[token,setToken]=useState(""),[reset,setReset]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(""),[receipt,setReceipt]=useState("");
 const requestId=useRef<string|null>(null),success=useRef<HTMLDivElement>(null);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError("");setBusy(true);
  try{
   const form=new FormData(event.currentTarget);
   const values=validateVolunteer({...Object.fromEntries(form),interests,consent:form.get("consent")==="on"});
   requestId.current??=crypto.randomUUID();
   const result=await request<{id:string}>("volunteer",{...values,consent:true,id:requestId.current,challenge:token,website:form.get("website")});
   setReceipt(result.id);requestAnimationFrame(()=>success.current?.focus());
  }catch(err){setError(err instanceof Error?err.message:"Your application could not be sent. Please try again.");}
  finally{setBusy(false);setToken("");setReset(v=>v+1);}
 }
 return <main id="main-content" className={`${styles.page} ${css.page}`}>
  <IllustratedIntro subject="volunteer" compact><header className={css.intro}><span className={css.eyebrow}><Users size={18} aria-hidden="true"/>Give your time and skills</span><h1>Volunteer with ISITUSA.</h1><p>Help more people understand invasive species and protect the places they love. Tell us what you enjoy doing, what you can bring, and how much time works for you.</p></header></IllustratedIntro>
  {receipt?<div ref={success} tabIndex={-1} className={css.receipt}><CheckCircle2 size={32} aria-hidden="true"/><h2>Thank you for raising your hand.</h2><p>Your application is in our team’s review queue. We’ll read it and contact you by email to discuss a possible role. You don’t need an account yet.</p><p className={styles.hint}>Your reference: {receipt}</p><Link className={styles.button} href="/about">Back to About <ArrowRight size={16}/></Link></div>:<div className={css.layout}>
   <section aria-labelledby="application-heading"><h2 id="application-heading">Tell us about yourself.</h2><p className={css.lead}>You don’t need a particular degree or a perfect résumé. Specific examples of what you like to do help us find a useful place for you.</p>
    <ServiceStatus config={config} error={configError} ready={Boolean(config?.volunteers)} retry={retry}>Applications are temporarily unavailable. Please check back soon.</ServiceStatus>
    <form className={styles.form} onSubmit={submit} data-ph-no-capture>
     <fieldset disabled={busy||!config?.volunteers} className={css.fields}>
      <div className={styles.grid}><label className={styles.field}>Your name<input className={styles.input} name="name" autoComplete="name" maxLength={100} required/></label><label className={styles.field}>Email address<input className={styles.input} name="email" type="email" autoComplete="email" maxLength={254} required/></label></div>
      <fieldset className={css.interests}><legend>What interests you? <span>Choose all that fit.</span></legend><div>{VOLUNTEER_INTERESTS.map(item=><label key={item}><input type="checkbox" checked={interests.includes(item)} onChange={e=>setInterests(v=>e.target.checked?[...v,item]:v.filter(i=>i!==item))}/><span>{item}</span></label>)}</div></fieldset>
      <label className={styles.field}>Skills and experience<textarea className={styles.textarea} name="skills" maxLength={2000} required placeholder="Research, writing, field observation, design, coding, organizing… Tell us about a project or skill you’d like to bring."/></label>
      <label className={styles.field}>What would you like to help with?<textarea className={styles.textarea} name="motivation" maxLength={1500} required placeholder="What drew you to ISITUSA? Is there something you’d like to work on or learn?"/></label>
      <label className={styles.field}>How much time could you offer?<select name="availability" className={styles.select} defaultValue="" required><option value="" disabled>Choose an estimate</option>{AVAILABILITY.map(v=><option key={v}>{v}</option>)}</select><span className={styles.hint}>An estimate is enough. We can work out a realistic commitment together.</span></label>
      <label className={styles.field}>Schedule or time zone <span className={styles.hint}>Optional</span><input className={styles.input} name="schedule" maxLength={500} placeholder="For example: weekday evenings, Eastern time"/></label>
      <label className={styles.choice}><input name="consent" type="checkbox" required/><span>Our team may review these details and contact me about volunteering. <small>This does not subscribe you to email updates. Please leave out sensitive personal information. <Link href="/privacy" className="text-link">How we handle your information</Link></small></span></label>
      <Honeypot/>
     </fieldset>
     {config?.volunteers&&<Challenge action="volunteer" onToken={setToken} reset={reset}/>}
     {error&&<Notice error>{error}</Notice>}
     <button type="submit" className={styles.button} disabled={busy||!config?.volunteers||!token}>{busy?"Sending your application…":"Send application"}<ArrowRight size={16} aria-hidden="true"/></button>
    </form>
   </section>
   <aside className={css.aside}><EditorialArt subject="skills" className="volunteer-skills-art"/><h2>A place to contribute.</h2><p>We’re building a small team around careful research, clear writing, community connections, and a useful open source tool.</p><ol><li><strong>Tell us about yourself</strong><span>Share your interests, skills, and availability.</span></li><li><strong>Find the right fit together</strong><span>A team member reviews your application and discusses a role with you.</span></li><li><strong>Get a clear starting point</strong><span>If it’s a fit, you’ll receive a workspace invitation, role guidance, and access to the tools you need.</span></li></ol><p className={styles.hint}>Already on the team? <a className="text-link" href="https://team.isitusa.com">Open your workspace</a>.</p></aside>
  </div>}
 </main>;
}
