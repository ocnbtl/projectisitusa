"use client";
import { useRef, useState } from "react";
import { BookOpenCheck, MessageSquareText } from "lucide-react";
import { EditorialTracker } from "./editorial-tracker";
import { CorrectionQueue } from "./profile-corrections";
import admin from "./admin.module.css";

export function ProfileResearch({ preview=false,canReview=false,onDirtyChange }: {preview?:boolean;canReview?:boolean;onDirtyChange?:(value:boolean)=>void}) {
 const [view,setView]=useState("drafts");const dirty=useRef(false);
 const setDirty=(value:boolean)=>{dirty.current=value;onDirtyChange?.(value);};
 function navigate(next:string){if(view===next)return;if(dirty.current&&!window.confirm("Discard unsaved changes before switching views?"))return;setDirty(false);setView(next);}
 return <><div className={admin.rolePicker} role="group" aria-label="Profile work"><button type="button" aria-pressed={view==="drafts"} onClick={()=>navigate("drafts")}><BookOpenCheck size={16}/>Prepared profiles</button><button type="button" aria-pressed={view==="corrections"} onClick={()=>navigate("corrections")}><MessageSquareText size={16}/>Community corrections</button></div>
 {view==="drafts"?<EditorialTracker preview={preview} canReview={canReview} onDirtyChange={setDirty}/>:<CorrectionQueue preview={preview} canDecide={canReview} onDirtyChange={setDirty}/>}</>;
}
