"use client";
import { useState } from "react";
import { PrivacyNotice } from "@/components/site-analytics";
import { CorrectionForm } from "@/components/participation/profile-correction";

export function ExperiencePreview(){
 const [replay,setReplay]=useState(false),[choice,setChoice]=useState(""),[page,setPage]=useState("privacy");
 return <main id="main-content" style={{padding:"24px",minHeight:"90vh"}}>
  <h1>Experience preview</h1><p>Presentation only. No tracking choices, suggestions or reviews are saved here.</p>
  <label>Preview surface <select value={page} onChange={e=>setPage(e.target.value)}><option value="privacy">Privacy notice</option><option value="correction">Public correction form</option></select></label>
  {page==="privacy"?<><PrivacyNotice replay={replay} setReplay={setReplay} save={value=>setChoice(value)}/><p role="status">{choice?`Preview choice: ${choice}; replay: ${replay}`:"Presentation only"}</p></>:<div style={{maxWidth:720,margin:"32px auto"}}><CorrectionForm speciesId="acer-platanoides" name="Norway maple" preview/></div>}
 </main>;
}
