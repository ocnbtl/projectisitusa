"use client";
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
export function ProfileDisclosure({title, children, defaultOpen=false, count}: {title:string;children:ReactNode;defaultOpen?:boolean;count?:number}) {
 const [open,setOpen]=useState(defaultOpen),id=useId();
 return <div className="profile-disclosure" data-open={open}>
 <button type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(value=>!value)}><span>{title}</span>{count!==undefined&&<small>{count}</small>}<ChevronDown size={17} aria-hidden="true"/></button>
 <div id={id} className="profile-disclosure-reveal" inert={!open}><div><div className="profile-disclosure-body">{children}</div></div></div>
 </div>;
}

