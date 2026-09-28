import { createClient } from "npm:@supabase/supabase-js@2.117.2";
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function env(name: string) { const value = Deno.env.get(name); if (!value) throw new HttpError(503,"This service is being set up. Please check back soon."); return value; }
export function enabled(name: string) { return Deno.env.get(name) === "true"; }
export function service() { return createClient(env("SUPABASE_URL"),env("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}}); }
export function site() { const value=env("ISITUSA_SITE_URL"); if (value!=="https://isitusa.com" && value!=="http://localhost:3000") throw new HttpError(503,"Site configuration is not ready."); return value; }
export function cors(req: Request) {
 const origin=req.headers.get("Origin");
 if (origin!==site()) throw new HttpError(403,"This request must come from IsItUSA.");
 return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers":"authorization, apikey, content-type", "Access-Control-Allow-Methods":"GET, POST, OPTIONS", Vary:"Origin", "Cache-Control":"no-store" };
}
export async function body(req: Request, max=65536) {
 if (!req.body) return new Uint8Array();
 const reader=req.body.getReader(); const parts:Uint8Array[]=[]; let length=0;
 while(true) {const part=await reader.read(); if(part.done)break; length+=part.value.length; if(length>max){await reader.cancel();throw new HttpError(413,"The upload is too large.");}parts.push(part.value);}
 const all=new Uint8Array(length);let position=0;for(const part of parts){all.set(part,position);position+=part.length;}return all;
}
export async function json(req:Request) { try {return JSON.parse(new TextDecoder().decode(await body(req))) as Record<string,unknown>;}catch(e){if(e instanceof HttpError)throw e;throw new HttpError(400,"Check the form and try again.");} }
export async function hash(text:string) { const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join(""); }
export function newToken() {return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");}
export function checked<T>(result:{data:T;error:{message:string}|null}):T {if(result.error)throw new Error(result.error.message);return result.data;}
export function requiredData<T>(result:{data:T;error:{message:string}|null}):NonNullable<T> {const data=checked(result);if(data==null)throw new HttpError(404,"The requested record is unavailable.");return data as NonNullable<T>;}
export async function staff(req:Request,permission:string) {
 const authorization=req.headers.get("Authorization")??"";
 if(!authorization.startsWith("Bearer "))throw new HttpError(401,"Please sign in.");
 const admin=service(); const user=await admin.auth.getUser(authorization.slice(7));
 if(user.error||!user.data.user)throw new HttpError(401,"Please sign in again.");
 const client=createClient(env("SUPABASE_URL"),env("SUPABASE_ANON_KEY"),{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const can=await client.rpc("isitusa_can",{requested:permission});
 if(can.error||can.data!==true)throw new HttpError(403,"You do not have access to this action. Check your sign-in and authenticator code.");
 return {client,user:user.data.user};
}
export async function challenge(token:unknown,action:string) {
 if(typeof token!=="string"||token.length>2048)throw new HttpError(400,"Complete the security check.");
 const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:new URLSearchParams({secret:env("TURNSTILE_SECRET_KEY"),response:token}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new HttpError(503,"The security check is unavailable. Please try again.");
 const result=await response.json();
 if(!result.success||result.hostname!==new URL(site()).hostname||result.action!==action)throw new HttpError(400,"Refresh the security check and try again.");
}
export async function rate(key:string,maximum=5,seconds=3600) {
 const allowed=checked(await service().rpc("isitusa_rate_limit",{key:await hash(env("RATE_LIMIT_SALT")+key),maximum,seconds}));
 if(!allowed)throw new HttpError(429,"Please wait before trying again.");
}
export function responseError(error:unknown,headers:Record<string,string>={}) {
 if(error instanceof HttpError)return Response.json({error:error.message},{status:error.status,headers});
 // Do not log request bodies, tokens, email addresses, coordinates, or provider secrets.
 console.error("participation request failed");
 return Response.json({error:"We couldn't complete that request. Please try again."},{status:500,headers});
}
