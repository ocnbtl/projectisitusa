"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, X } from "lucide-react";
import { SpeciesImage } from "./species-image";
type ProfilePhoto = { src:string;alt:string;credit:string;sourceUrl?:string;license?:string };
type Camera={scale:number;x:number;y:number};
const initial:Camera={scale:1,x:0,y:0};
export function ProfileGallery({images,label}:{images:ProfilePhoto[];label:string}) {
 const photos=useMemo(()=>images.filter((p,i,all)=>p.src&&all.findIndex(x=>x.src===p.src)===i),[images]);
 const [index,setIndex]=useState(0),[direction,setDirection]=useState(1),[open,setOpen]=useState(false),[camera,setCamera]=useState<Camera>(initial);
 const dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLDivElement>(null),drag=useRef<{id:number;x:number;y:number;camera:Camera}|null>(null);
 const id=useId(),active=Math.max(0,Math.min(index,photos.length-1)),photo=photos[active];
 useEffect(()=>{if(!open)return;const node=dialog.current;if(!node)return;node.showModal();const before=document.body.style.overflow;document.body.style.overflow="hidden";return()=>{node.close();document.body.style.overflow=before;};},[open]);
 function bounded(value:Camera){const scale=Math.max(1,Math.min(5,value.scale)),box=canvas.current?.getBoundingClientRect();return {scale,x:Math.max(-(box?.width??0)*(scale-1)/2,Math.min((box?.width??0)*(scale-1)/2,value.x)),y:Math.max(-(box?.height??0)*(scale-1)/2,Math.min((box?.height??0)*(scale-1)/2,value.y))};}
 function zoom(factor:number){setCamera(value=>bounded({...value,scale:value.scale*factor,x:value.x*factor,y:value.y*factor}));}
 function move(delta:number){setDirection(delta);setIndex(v=>(v+delta+photos.length)%photos.length);setCamera(initial);}
 if(!photo)return null;
 return <div className="profile-gallery" role="region" aria-label={label+" photographs"}>
 <div id={id} className="profile-gallery-window"><div key={photo.src} className="profile-gallery-slide" data-direction={direction}><SpeciesImage {...photo} label={label}/></div></div>
 <div className="profile-gallery-toolbar"><button type="button" className="profile-photo-inspect" onClick={()=>{setCamera(initial);setOpen(true);}}><ZoomIn size={18} aria-hidden="true"/>Look closer</button>
 {photos.length>1&&<div className="profile-gallery-controls"><button type="button" aria-label="Previous photograph" onClick={()=>move(-1)}><ChevronLeft size={19}/></button><span aria-live="polite">{active+1} / {photos.length}</span><button type="button" aria-label="Next photograph" onClick={()=>move(1)}><ChevronRight size={19}/></button></div>}</div>
 <dialog ref={dialog} className="photo-examiner" aria-labelledby={id+"-title"} onCancel={()=>setOpen(false)} onClose={()=>setOpen(false)}>
 <div className="photo-examiner-header"><h2 id={id+"-title"}>{label}</h2><button type="button" autoFocus aria-label="Close photograph" onClick={()=>setOpen(false)}><X size={22}/></button></div>
 <div ref={canvas} className="photo-examiner-canvas" tabIndex={0} role="group" aria-label="Photograph. Use plus and minus to zoom, arrow keys to pan, and zero to reset." style={{touchAction:"none",cursor:camera.scale>1?"grab":"zoom-in"}}
 onDoubleClick={()=>camera.scale===1?zoom(2):setCamera(initial)}
 onKeyDown={e=>{if(["+","=","-","0","ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();if(e.key==="+"||e.key==="=")zoom(1.3);else if(e.key==="-")zoom(1/1.3);else if(e.key==="0")setCamera(initial);else setCamera(c=>bounded({...c,x:c.x+(e.key==="ArrowLeft"?40:e.key==="ArrowRight"?-40:0),y:c.y+(e.key==="ArrowUp"?40:e.key==="ArrowDown"?-40:0)}));}}}
 onPointerDown={e=>{if(camera.scale<=1)return;e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,camera};}}
 onPointerMove={e=>{const start=drag.current;if(start?.id===e.pointerId)setCamera(bounded({...start.camera,x:start.camera.x+e.clientX-start.x,y:start.camera.y+e.clientY-start.y}));}}
 onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}>
 {/* The original verified image is reused; zoom does not imply additional detail. */}
 {/* eslint-disable-next-line @next/next/no-img-element */}
 <img src={photo.src} alt={photo.alt} draggable={false} style={{transform:`translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`}}/>
 </div>
 <div className="photo-examiner-tools"><button type="button" aria-label="Zoom out of photograph" disabled={camera.scale<=1} onClick={()=>zoom(1/1.3)}><ZoomOut size={20}/></button><output aria-live="polite">{Math.round(camera.scale*100)}%</output><button type="button" aria-label="Zoom in on photograph" disabled={camera.scale>=5} onClick={()=>zoom(1.3)}><ZoomIn size={20}/></button><button type="button" aria-label="Reset photograph" onClick={()=>setCamera(initial)}><RotateCcw size={20}/></button><span>Zoom, then drag to examine.</span></div>
 <p className="photo-examiner-credit">{photo.sourceUrl?<a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.credit}</a>:photo.credit}{photo.license&&<> · {photo.license}</>}</p>
 </dialog></div>;
}

