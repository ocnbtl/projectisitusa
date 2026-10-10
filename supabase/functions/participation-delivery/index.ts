import { Resend } from "npm:resend@6.30.0";
import { STREAMS } from "../../../src/lib/participation/contracts.ts";
import { checked, requiredData, enabled, env, HttpError, responseError, service } from "../_shared/runtime.ts";
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
Deno.serve(async(req:Request)=>{
 let claimed:{id:string;attempts:number}|undefined;
 try{
  if(req.method!=="POST"||!req.headers.get("Authorization")?.startsWith("Bearer "))throw new HttpError(401,"Unauthorized.");
  if(req.headers.get("Authorization")!==`Bearer ${env("DELIVERY_JOB_SECRET")}`)throw new HttpError(401,"Unauthorized.");
  // Delivery can be tested before public intake is opened.
  if(!enabled("DELIVERY_ENABLED")||!enabled("CONTACT_READY"))throw new HttpError(503,"Email sending is disabled.");
  const db=service(),items=checked(await db.rpc("isitusa_claim_email"));
  if(!items.length)return Response.json({processed:0});
  const item=items[0];
  claimed={id:item.id,attempts:item.attempts};
  if(!["confirmation","preferences"].includes(item.kind))throw new HttpError(503,"Campaign and digest delivery is not enabled.");
  const person=requiredData(await db.from("isitusa_subscribers").select("suppression_reason").eq("id",item.subscriber_id).single());
  if(["bounce","complaint"].includes(person.suppression_reason)){checked(await db.from("isitusa_outbox").update({state:"suppressed",lease_until:null}).eq("id",item.id));return Response.json({processed:1});}
  const confirmation=item.kind==="confirmation",subject=confirmation?"Confirm your ISITUSA updates":"Your ISITUSA email preferences";
  const selections=confirmation?STREAMS.filter(s=>item.payload.preferences?.streams?.includes(s.id)).map(s=>s.title).join(", "):"";
  const intro=confirmation?`One more step to hear about the places and species you care about. Your choices: ${selections}.`:"Use this private link to choose your emails or unsubscribe.";
  const text=`${intro}\n\n${item.payload.url}\n\nIf you didn't request this, you can ignore this email.\nISITUSA is an independent initiative based in the United States.`;
  const message={from:env("RESEND_FROM"),to:item.recipient,replyTo:env("SUPPORT_EMAIL"),subject,text,
   html:`<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.7"><a href="https://isitusa.com"><img src="https://isitusa.com/brand/v8/symbol-name.png" width="100" height="129" alt="ISITUSA" style="display:block;border:0;height:auto"></a><p>${escape(intro)}</p><p><a href="${escape(item.payload.url)}" style="display:inline-block;padding:12px 18px;background:#00583B;color:#fff;border-radius:8px">${confirmation?"Confirm my updates":"Manage my preferences"}</a></p><p>If you did not request this, you can ignore this email.</p><p>ISITUSA · Independent initiative · United States</p></div>`};
  const result=await new Resend(env("RESEND_API_KEY")).emails.send(message,{idempotencyKey:item.id});
  if(result.error){checked(await db.from("isitusa_outbox").update({state:item.attempts>=3?"failed":"queued",error_code:"provider_rejected",lease_until:null}).eq("id",item.id));throw new HttpError(502,"Email delivery will retry.");}
  checked(await db.from("isitusa_outbox").update({state:"sent",provider_id:result.data?.id,sent_at:new Date().toISOString(),lease_until:null,payload:{}}).eq("id",item.id));
  return Response.json({processed:1});
 }catch(error){
  // Network failures must release the lease too; otherwise a third failed
  // attempt can remain stuck in "sending" indefinitely. The same outbox ID
  // remains the provider idempotency key when an uncertain send is retried.
  if(claimed){try{checked(await service().from("isitusa_outbox").update({state:claimed.attempts>=3?"failed":"queued",error_code:"delivery_retry",lease_until:null}).eq("id",claimed.id).eq("state","sending"));}catch{console.error("email lease recovery failed");}}
  return responseError(error);
 }
});
