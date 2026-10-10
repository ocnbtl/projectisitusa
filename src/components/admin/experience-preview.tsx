"use client";
import { useState } from "react";
import { PrivacyNotice } from "@/components/site-analytics";
import { styles } from "@/components/participation/shared";

export function ExperiencePreview(){
 const [page,setPage]=useState("/about"),[width,setWidth]=useState(390),[replay,setReplay]=useState(false),[choice,setChoice]=useState("");
 return <main id="main-content" style={{padding:"32px",overflowX:"auto"}}>
  <h1>Experience verification</h1><p>Preview-only presentation. No tracking choice is saved and no replay is started here.</p>
  <div className={styles.row}><label>Page<select value={page} onChange={e=>setPage(e.target.value)}><option value="/about">About</option><option value="/species/acer-platanoides">Norway maple</option><option value="/admin/preview">Staff preview</option><option value="privacy">Privacy notice</option></select></label>
  <label>Frame width<select value={width} onChange={e=>setWidth(Number(e.target.value))}><option value={390}>Phone: 390 px</option><option value={768}>Tablet: 768 px</option><option value={1440}>Desktop: 1440 px</option></select></label></div>
  {page==="privacy"?<div style={{position:"relative",transform:"translateZ(0)",width,height:620,marginTop:24,background:"var(--background)"}}><PrivacyNotice replay={replay} setReplay={setReplay} save={value=>setChoice(value)}/><p role="status">{choice?`Preview choice: ${choice}; replay: ${replay}`:"Presentation only"}</p></div>:<iframe key={page} title="Responsive page preview" src={page} style={{display:"block",width,height:844,marginTop:24,border:"1px solid var(--border)"}}/>}
 </main>;
}
