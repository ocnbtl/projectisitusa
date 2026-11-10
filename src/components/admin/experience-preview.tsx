"use client";
import { useState } from "react";
import { PrivacyNotice } from "@/components/site-analytics";
import { CorrectionForm } from "@/components/participation/profile-correction";

export function ExperiencePreview(){
 const [preferences, setPreferences] = useState({ site: false, replay: false, google: true });
 const [privacyOpen, setPrivacyOpen] = useState(false);
 const [page, setPage] = useState("privacy");
 return <main id="main-content" style={{padding:"24px",minHeight:"90vh"}}>
  <h1>Experience preview</h1><p>Presentation only. No tracking choices, suggestions or reviews are saved here.</p>
  <label>Preview surface <select value={page} onChange={e=>setPage(e.target.value)}><option value="privacy">Privacy notice</option><option value="correction">Public correction form</option></select></label>
  {page==="privacy"?<>
    <button type="button" onClick={() => setPrivacyOpen(true)}>Privacy choices</button>
    {privacyOpen && <PrivacyNotice
      initialSite={preferences.site}
      initialReplay={preferences.replay}
      google={preferences.google}
      googleChecking={false}
      browserSignal={false}
      onDismiss={() => setPrivacyOpen(false)}
      onSave={choice => {
        setPreferences(current => ({ ...choice, google: choice.google ?? current.google }));
        setPrivacyOpen(false);
      }}
    />}
    <p role="status">Google Analytics: {preferences.google ? "on" : "off"}. Site analytics: {preferences.site ? "on" : "off"}. Replay: {preferences.replay ? "on" : "off"}.</p>
  </>:<div style={{maxWidth:720,margin:"32px auto"}}><CorrectionForm speciesId="acer-platanoides" name="Norway maple" preview/></div>}
 </main>;
}
