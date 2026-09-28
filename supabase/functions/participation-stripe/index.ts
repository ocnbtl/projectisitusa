import Stripe from "npm:stripe@22.6.2";
import { body, checked, requiredData, enabled, env, HttpError, responseError, service } from "../_shared/runtime.ts";
Deno.serve(async(req:Request)=>{
 try{
  if(req.method!=="POST")throw new HttpError(405,"Method not allowed.");
  const stripe=new Stripe(env("STRIPE_SECRET_KEY"));
  const raw=new TextDecoder().decode(await body(req,1024*1024));
  let event:Stripe.Event;
  try{event=await stripe.webhooks.constructEventAsync(raw,req.headers.get("stripe-signature")??"",env("STRIPE_WEBHOOK_SECRET"),300,Stripe.createSubtleCryptoProvider());}
  catch{throw new HttpError(400,"Invalid webhook signature.");}
  if(event.livemode!==enabled("STRIPE_LIVE_MODE"))throw new HttpError(400,"Wrong payment environment.");
  const db=service();
  if(["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(event.type)){
   const object=event.data.object as Stripe.Checkout.Session;
   const session=await stripe.checkout.sessions.retrieve(object.id);
   const id=session.metadata?.isitusa_request_id;
   if(!id)return Response.json({received:true});
   if(session.mode!=="payment"||!session.amount_total||session.currency!=="usd")throw new HttpError(400,"Invalid payment details.");
   checked(await db.rpc("isitusa_stripe_event",{event:event.id,event_type:event.type,reference:session.id,request_id:id,
    amount:session.amount_total,currency_code:session.currency,payment_state:session.payment_status,address:session.customer_details?.email??null}));
  }else if(event.type==="charge.refunded"||event.type.startsWith("charge.dispute.")){
   const object=event.data.object as Stripe.Charge|Stripe.Dispute;
   const intentId=typeof object.payment_intent==="string"?object.payment_intent:object.payment_intent?.id;
   if(!intentId)return Response.json({received:true});
   const intent=await stripe.paymentIntents.retrieve(intentId),id=intent.metadata?.isitusa_request_id;
   if(!id)return Response.json({received:true});
   const checkout=requiredData(await db.from("isitusa_checkout_requests").select("session_id").eq("id",id).single());
   // Preserve provider event history. These cumulative snapshots are never summed.
   const amount=event.type==="charge.refunded"?(object as Stripe.Charge).amount_refunded:(object as Stripe.Dispute).amount;
   const status=event.type==="charge.refunded"?"refund":`dispute:${(object as Stripe.Dispute).status}`;
   checked(await db.from("isitusa_payment_adjustments").upsert({provider_event:event.id,payment_reference:checkout.session_id,kind:status,amount_minor:amount,currency:object.currency},{onConflict:"provider_event",ignoreDuplicates:true}));
  }
  return Response.json({received:true});
 }catch(error){return responseError(error);}
});
