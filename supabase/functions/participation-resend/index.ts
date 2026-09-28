import { Resend } from "npm:resend@6.30.0";
import { body, checked, env, HttpError, responseError, service } from "../_shared/runtime.ts";
Deno.serve(async(req:Request)=>{
 try{
  if(req.method!=="POST")throw new HttpError(405,"Method not allowed.");
  const raw=new TextDecoder().decode(await body(req,1024*1024));
  const resend=new Resend(env("RESEND_API_KEY"));
  let event;
  try{
   event=resend.webhooks.verify({payload:raw,headers:{id:req.headers.get("svix-id")??"",timestamp:req.headers.get("svix-timestamp")??"",signature:req.headers.get("svix-signature")??""},webhookSecret:env("RESEND_WEBHOOK_SECRET")});
  }catch{throw new HttpError(400,"Invalid webhook signature.");}
  if(event.type==="email.bounced"||event.type==="email.complained"){
   const addresses=event.data.to.map(address=>address.toLowerCase().trim());
   checked(await service().rpc("isitusa_suppress",{event:req.headers.get("svix-id"),event_type:event.type,addresses,reason:event.type==="email.bounced"?"bounce":"complaint"}));
  }
  return Response.json({received:true});
 }catch(error){return responseError(error);}
});
