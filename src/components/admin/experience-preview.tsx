"use client";
import { useState } from "react";
import { PrivacyNotice } from "@/components/site-analytics";

export function ExperiencePreview(){
 const [replay,setReplay]=useState(false),[choice,setChoice]=useState("");
 return <main id="main-content" style={{padding:"24px",minHeight:"90vh"}}>
  <h1>Privacy notice preview</h1><p>Preview-only presentation. No tracking choice is saved and no replay is started here.</p>
  <PrivacyNotice replay={replay} setReplay={setReplay} save={value=>setChoice(value)}/><p role="status">{choice?`Preview choice: ${choice}; replay: ${replay}`:"Presentation only"}</p>
 </main>;
}
