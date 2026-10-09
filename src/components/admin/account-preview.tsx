"use client";
import { useMemo, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { AuthConfirm } from "./auth-confirm";
import { StaffAuth } from "./staff-auth";
import { AccountFrame } from "./account-frame";

// Preview-only interaction fixture. It cannot create an account or call a provider.
export function AccountPreview(){
 const [finished,setFinished]=useState(false);
 const client=useMemo(()=>{
  let session:Session|null=null,verified=false;
  const fakeSession={user:{id:"fictional-reviewer"},access_token:"not-a-token"} as Session;
  const fixture={auth:{
   verifyOtp:async()=>{session=fakeSession;return {data:{session},error:null};},
   updateUser:async()=>({data:{user:fakeSession.user},error:null}),
   getSession:async()=>({data:{session},error:null}),
   signOut:async()=>{session=null;return {error:null};},
   mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:verified?"aal2":"aal1"},error:null}),listFactors:async()=>({data:{all:[],totp:[]},error:null}),enroll:async()=>({data:{id:"fictional-factor",totp:{qr_code:'<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="100" y="95" text-anchor="middle" fill="black" font-size="14">Preview only</text><text x="100" y="120" text-anchor="middle" fill="black" font-size="12">No scannable credential</text></svg>',secret:"PREVIEW-ONLY-NOT-A-REAL-KEY"}},error:null}),challengeAndVerify:async({code}:{code:string})=>{if(code!=="123456")return {error:new Error("Fixture incorrect code")};verified=true;return {data:{},error:null};}},
  },from:()=>({select:()=>({eq:()=>({eq:()=>({maybeSingle:async()=>({data:{is_owner:false,permissions:["review","content"]},error:null})})})})})};
  return ()=>fixture as unknown as SupabaseClient;
 },[]);
 return <><p style={{position:"fixed",bottom:0,left:0,right:0,zIndex:60,background:"var(--surface-strong)",padding:"10px 16px",borderTop:"1px solid var(--border)",fontSize:12}}>Fictional account setup test. No emails, credentials, or private records. Use a made-up passphrase and code 123456.</p>{finished?<main id="main-content"><AccountFrame title="Preview flow completed." description="Email verification, password submission and authenticator steps completed using a local fixture."><p>No real account was changed.</p></AccountFrame></main>:<AuthConfirm client={client} complete={<main id="main-content"><StaffAuth client={client} onboarding onReady={()=>setFinished(true)}/></main>}/>}</>;
}
