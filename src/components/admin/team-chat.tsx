"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { MessageCircle, Send, ArrowLeft, Plus } from "lucide-react";
import { backend } from "@/lib/participation/client";
import { Notice, styles } from "@/components/participation/shared";
import admin from "./admin.module.css";
type Message = {id:string;parent_id:string|null;author_name:string;body:string;created_at:string};
const examples:Message[]=[{id:"example",parent_id:null,author_name:"Example volunteer",body:"Which identification resources should we bring to the next community walk?",created_at:"2026-10-09T14:00:00Z"}];
export function TeamChat({preview=false,onDirtyChange}:{preview?:boolean;onDirtyChange?:(dirty:boolean)=>void}) {
 const [messages,setMessages]=useState<Message[]>([]),[thread,setThread]=useState<Message|null>(null),[text,setText]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[limit,setLimit]=useState(50),[more,setMore]=useState(false),[revision,setRevision]=useState(0);
 const attempt=useRef<{id:string;body:string;parent:string|null}|null>(null);
 useEffect(()=>{onDirtyChange?.(Boolean(text.trim()));return()=>onDirtyChange?.(false);},[text,onDirtyChange]);
 useEffect(()=>{if(!text.trim())return;const leave=(e:BeforeUnloadEvent)=>e.preventDefault();window.addEventListener("beforeunload",leave);return()=>window.removeEventListener("beforeunload",leave);},[text]);
 useEffect(()=>{
  if(preview){setMessages(thread?[]:examples);setLoading(false);return;}
  let current=true,reading=false;
  async function read(){if(reading)return;reading=true;try{
   let query=backend().from("isitusa_team_messages").select("id,parent_id,author_name,body,created_at");
   query=thread?query.eq("parent_id",thread.id):query.is("parent_id",null);
   const result=await query.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(limit+1);
   if(!current)return;if(result.error)throw new Error("Messages could not load. Check your connection or refresh your sign-in.");
   setMessages(thread?result.data.slice(0,limit).reverse():result.data.slice(0,limit));setMore(result.data.length>limit);setError("");
  }catch(e){if(current){setMessages([]);setError(e instanceof Error?e.message:"Messages could not load.");}}finally{reading=false;if(current)setLoading(false);}}
  setLoading(true);void read();const timer=setInterval(()=>{if(document.visibilityState==="visible")void read();},15000);
  return()=>{current=false;clearInterval(timer);};
 },[thread,limit,revision,preview]);
 const changeThread=useCallback((next:Message|null)=>{if(text.trim()&&!window.confirm("Discard your unsent message?"))return;setThread(next);setText("");setMessages([]);setLimit(50);attempt.current=null;},[text]);
 async function post(e:FormEvent){e.preventDefault();if(busy||!text.trim()||preview)return;setBusy(true);setError("");
  const body=text.trim(),parent=thread?.id??null;
  if(!attempt.current||attempt.current.body!==body||attempt.current.parent!==parent)attempt.current={id:crypto.randomUUID(),body,parent};
  try{const result=await backend().rpc("isitusa_post_team_message",{message_id:attempt.current.id,thread_id:parent,message_body:body});if(result.error)throw new Error(result.error.message);setText("");attempt.current=null;setRevision(n=>n+1);}
  catch(e){setError(e instanceof Error?e.message:"Message not sent. Your text is still here; try again.");}finally{setBusy(false);}
 }
 const card=(m:Message)=><><header><span className={admin.avatar} aria-hidden="true">{m.author_name.slice(0,1).toUpperCase()}</span><strong>{m.author_name}</strong><time dateTime={m.created_at}>{new Date(m.created_at).toLocaleString(undefined,{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</time></header><p>{m.body}</p></>;
 return <section className={admin.chat}><div className={admin.chatIntro}><MessageCircle size={24} aria-hidden="true"/><div><h3>One team. One conversation.</h3><p>Shared with all active volunteers and staff. Messages and replies stay here when you return.</p></div></div>
 {thread&&<><button type="button" className="text-link" disabled={busy} onClick={()=>changeThread(null)}><ArrowLeft size={16}/> All conversations</button><article className={`${admin.chatMessage} ${admin.chatRoot}`}>{card(thread)}</article><h4>Replies</h4></>}
 {error&&<Notice error>{error}<button type="button" className="text-link" onClick={()=>setRevision(n=>n+1)}>Retry</button></Notice>}
 {loading?<p role="status">Loading conversations...</p>:!error&&!messages.length&&<div className={admin.empty}><strong>{thread?"No replies yet":"Start the first conversation"}</strong><p>{thread?"Add a question, a useful source, or a quick update.":"Ask a question or share what you are working on."}</p></div>}
 <div className={admin.chatMessages}>{messages.map(m=><article className={admin.chatMessage} key={m.id}>{card(m)}{!thread&&<button type="button" className="text-link" disabled={busy} onClick={()=>changeThread(m)}><MessageCircle size={15} aria-hidden="true"/> Open thread</button>}</article>)}</div>
 {more&&<button type="button" className="text-link" onClick={()=>setLimit(n=>n+50)}>Load older {thread?"replies":"conversations"}</button>}
 <form className={admin.chatComposer} onSubmit={post}><label className={styles.field}>{thread?"Reply to this thread":"New conversation"}<textarea className={styles.textarea} rows={3} maxLength={4000} value={text} onChange={e=>setText(e.target.value)} disabled={busy||preview} placeholder={preview?"Sending is disabled in role preview":"Write to the team..."}/></label><div><span className={styles.hint}>{text.length.toLocaleString()} / 4,000</span><button className={styles.button} disabled={busy||!text.trim()||preview}>{thread?<Send size={16}/>:<Plus size={16}/>} {busy?"Posting...":thread?"Post reply":"Start conversation"}</button></div></form></section>;
}
