"use client";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, Check, ShieldCheck } from "lucide-react";
import admin from "./admin.module.css";

export function AccountFrame({title,description,step,children}:{title:string;description:string;step?:number;children:ReactNode}) {
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{if(step!==undefined)heading.current?.focus({preventScroll:true});},[step,title]);
 return <div className={admin.accountPage}>
  <Link href="/" className={admin.accountBack}><ArrowLeft size={16} aria-hidden="true"/>Back to the atlas</Link>
  {step!==undefined&&<ol className={admin.accountSteps} aria-label="Account setup progress">{["Email","Password","Authenticator"].map((name,index)=><li key={name} aria-current={step===index?"step":undefined} data-complete={step>index}><span aria-hidden="true">{step>index?<Check size={14}/>:index+1}</span>{name}</li>)}</ol>}
  <section className={admin.accountPanel} aria-labelledby="account-title">
   <h1 id="account-title" ref={heading} tabIndex={-1}>{title}</h1><p className={admin.accountDescription}>{description}</p>
   {children}
  </section>
  <p className={admin.accountPrivacy}><ShieldCheck size={16} aria-hidden="true"/>Your access is private and limited to your assigned role.</p>
 </div>;
}
