import { analyticsSnapshot } from "../_shared/analytics.ts";
import Stripe from "npm:stripe@22.6.2";
import { boundedText as rawText, cryptoUri, donationAmount as rawAmount, MAX_PHOTOS, PERMISSIONS, photoType, normalizeEmail as rawEmail, validatePreferences as rawPreferences, validateSighting as rawSighting } from "../../../src/lib/participation/contracts.ts";
const userInput=<T>(fn:()=>T):T=>{try{return fn();}catch(error){throw new HttpError(400,error instanceof Error?error.message:"Check the form.");}};
const boundedText=(...args:Parameters<typeof rawText>)=>userInput(()=>rawText(...args));
const donationAmount=(value:unknown)=>userInput(()=>rawAmount(value));
const normalizeEmail=(value:unknown)=>userInput(()=>rawEmail(value));
const validatePreferences=(...args:Parameters<typeof rawPreferences>)=>userInput(()=>rawPreferences(...args));
const validateSighting=(...args:Parameters<typeof rawSighting>)=>userInput(()=>rawSighting(...args));
import { body, challenge, checked, requiredData, cors, enabled, env, hash, HttpError, json, newToken, rate, responseError, service, site, staff } from "../_shared/runtime.ts";

Deno.serve(async(req:Request)=>{
 let headers:Record<string,string>={};
 try {
  headers=cors(req);
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
  const action=new URL(req.url).pathname.split("/").pop();
  const db=service();
  if(req.method==="GET"&&action==="config"){
   const wallets=requiredData(await db.from("isitusa_wallets").select("id,asset,network,address,verified_at,active").eq("active",true));
   return Response.json({email:enabled("EMAIL_ENABLED"),reports:enabled("REPORTS_ENABLED"),payments:enabled("PAYMENTS_ENABLED"),wallets:enabled("CRYPTO_ENABLED")&&enabled("CONTACT_READY")?wallets.filter(w=>cryptoUri(w)!==null):[]},{headers});
  }
  if(req.method==="GET"&&action==="catalog"){
   const url=new URL(req.url),kind=url.searchParams.get("kind"),query=(url.searchParams.get("q")??"").trim();
   if(!["county","species"].includes(kind??"")||query.length<2||query.length>80)throw new HttpError(400,"Enter at least two letters.");
   const safe=query.replace(/[%_\\]/g,"");
   const items=requiredData(await db.from("isitusa_catalog").select("id,label").eq("kind",kind).ilike("label",`%${safe}%`).order("label").limit(20));
   return Response.json(items,{headers});
  }
  if(req.method!=="POST")throw new HttpError(405,"Method not allowed.");
  if(action==="analytics"){
   const {user}=await staff(req,"analytics");
   await rate("analytics:"+user.id,20,3600);
   return Response.json(await analyticsSnapshot(),{headers});
  }
  if(action==="sighting"){
   if(!enabled("REPORTS_ENABLED"))throw new HttpError(503,"Direct reporting is opening soon. You can report through EDDMapS in the meantime.");
   const bytes=await body(req,16*1024*1024);
   const form=await new Response(bytes,{headers:{"Content-Type":req.headers.get("Content-Type")??""}}).formData();
   await challenge(form.get("challenge"),"sighting");
   if(form.get("website"))throw new HttpError(400,"Check your submission.");
   const input=Object.fromEntries(form.entries()) as Record<string,unknown>;
   input.permission=form.get("permission")==="true";
   const validated=validateSighting(input);
   await rate("reports:global",30,3600);
   if(validated.contact_email)await rate("report:"+validated.contact_email,5,3600);
   const id=crypto.randomUUID(),files=form.getAll("photos").filter((v):v is File=>v instanceof File&&v.size>0);
   if(files.length>MAX_PHOTOS)throw new HttpError(400,"Choose up to three photographs.");
   const reserved=checked(await db.rpc("isitusa_reserve_upload",{reservation:id,requested_bytes:files.reduce((total,file)=>total+file.size,0)}));
   if(!reserved)throw new HttpError(503,"Photo intake has reached its storage allowance. Please use the linked reporting programs while we make room.");
   const photos:{path:string;mime:string;bytes:number}[]=[];
   try{
    for(const file of files){
     if(file.size>5*1024*1024)throw new HttpError(413,"Each photograph must be under 5 MB.");
     const data=new Uint8Array(await file.arrayBuffer()),mime=photoType(data);
     if(!mime||mime!==file.type)throw new HttpError(400,"Use JPEG, PNG, or WebP photographs.");
     const path=`${id}/${crypto.randomUUID()}`;
     checked(await db.storage.from("isitusa-sightings").upload(path,data,{contentType:mime,upsert:false,cacheControl:"0"}));
     photos.push({path,mime,bytes:data.length});
    }
    checked(await db.rpc("isitusa_submit_sighting",{sighting:id,body:validated,photos}));
   }catch(error){
    // A timed-out commit may have succeeded. Preserve private files and the reservation
    // until an owner can reconcile the receipt; an uncertain response must not erase evidence.
    const existing=await db.from("isitusa_sightings").select("id").eq("id",id).maybeSingle();
    if(!existing.error&&existing.data)return Response.json({id,received:true},{status:201,headers});
    throw error;
   }
   // A failed reservation release is safe: it only reduces remaining intake capacity.
   await db.from("isitusa_upload_reservations").delete().eq("id",id);
   return Response.json({id,received:true},{status:201,headers});
  }
  const input=await json(req);
  if(action==="signup"||action==="preferences-email"){
   if(!enabled("EMAIL_ENABLED"))throw new HttpError(503,"Email updates are opening soon.");
   await challenge(input.challenge,action);
   if(input.website)throw new HttpError(400,"Check the form.");
   const address=normalizeEmail(input.email);await rate("email:"+address,5,3600);await rate("email:global",50,86400);
   const prefs=action==="signup"?validatePreferences(input.preferences):null;
   const token=newToken(),purpose=action==="signup"?"confirm":"preferences";
   checked(await db.rpc("isitusa_request_email",{address,prefs,purpose,hash:await hash(token),link:`${site()}/preferences#${purpose}=${token}`}));
   return Response.json({queued:true,message:"If this address can receive emails from us, a link will arrive shortly."},{headers});
  }
  if(action==="preferences"){
   const token=boundedText(input.token,"your email link",64);
   if(!/^[a-f0-9]{64}$/.test(token))throw new HttpError(400,"Open the link from your email.");
   const verb=String(input.action);
   if(!["read","save","confirm","unsubscribe"].includes(verb))throw new HttpError(400,"Invalid preference action.");
   const result=await db.rpc("isitusa_token_action",{hash:await hash(token),action:verb,prefs:verb==="save"?validatePreferences(input.preferences,false):null});
   if(result.error)throw new HttpError(400,"This link is no longer valid. Request a new preferences email.");
   return Response.json(result.data,{headers});
  }
  if(action==="checkout"){
   if(!enabled("PAYMENTS_ENABLED"))throw new HttpError(503,"Online support is opening soon.");
   await challenge(input.challenge,"checkout");
   if(!enabled("CONTACT_READY"))throw new HttpError(503,"Online support is opening soon.");
   const amount=donationAmount(input.amount),id=crypto.randomUUID();
   await rate("checkout:global",30,3600);
   checked(await db.from("isitusa_checkout_requests").insert({id,amount_minor:amount,currency:"usd"}));
   const stripe=new Stripe(env("STRIPE_SECRET_KEY"));
   const session=await stripe.checkout.sessions.create({
    mode:"payment",client_reference_id:id,metadata:{isitusa_request_id:id},
    line_items:[{quantity:1,price_data:{currency:"usd",unit_amount:amount,product_data:{name:"Support IsItUSA"}}}],
    success_url:`${site()}/support?returned=1`,cancel_url:`${site()}/support?cancelled=1`,
    payment_intent_data:{metadata:{isitusa_request_id:id}},submit_type:"donate",
   },{idempotencyKey:`isitusa-checkout-${id}`});
   checked(await db.from("isitusa_checkout_requests").update({session_id:session.id}).eq("id",id));
   if(!session.url||new URL(session.url).hostname!=="checkout.stripe.com")throw new HttpError(502,"Checkout is temporarily unavailable.");
   return Response.json({url:session.url},{headers});
  }
  if(action==="photo"){
   const {client}=await staff(req,"review");
   const path=boundedText(input.path,"a photograph",150);
   const asset=requiredData(await client.from("isitusa_assets").select("path").eq("path",path).single());
   const signed=requiredData(await client.storage.from("isitusa-sightings").createSignedUrl(asset.path,60));
   return Response.json({url:signed.signedUrl},{headers});
  }
  if(action==="invite"){
   const {client}=await staff(req,"team");
   if(!enabled("STAFF_INVITES_ENABLED")||!enabled("EMAIL_ENABLED"))throw new HttpError(503,"Staff invitations are not configured yet.");
   const email=normalizeEmail(input.email),name=boundedText(input.name,"a name",100);
   const grants=Array.isArray(input.permissions)?input.permissions:[];
   if(grants.some(p=>!PERMISSIONS.some(value=>value===p)))throw new HttpError(400,"Choose valid permissions.");
   const owner=checked(await client.from("isitusa_staff").select("is_owner").eq("user_id",(await client.auth.getUser()).data.user!.id).single());
   if(!owner?.is_owner&&grants.some(p=>p!=="review"))throw new HttpError(403,"Only the owner can grant elevated access.");
   const invited=await db.auth.admin.inviteUserByEmail(email,{redirectTo:`${site()}/auth/confirm`});
   if(invited.error||!invited.data.user)throw new HttpError(400,"This invitation could not be sent. Check the address and existing team accounts.");
   const saved=await client.rpc("isitusa_save_staff",{target:invited.data.user.id,grants,enabled:true,name});
   if(saved.error)throw new HttpError(409,"An invitation was sent, but access was not granted. An owner must finish the account setup.");
   return Response.json({invited:true},{headers});
  }
  throw new HttpError(404,"This action is not available.");
 }catch(error){return responseError(error,headers);}
});
