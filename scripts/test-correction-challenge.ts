import assert from "node:assert/strict";
import {GET,POST} from "../app/api/corrections/verify/route";
async function main(){
 const env=process.env as Record<string,string|undefined>;
 const old={VERCEL_ENV:env.VERCEL_ENV,TURNSTILE_SECRET_KEY:env.TURNSTILE_SECRET_KEY,NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY:env.NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY};
 const original=globalThis.fetch;let calls=0;
 const request=(token:unknown,origin="https://isitusa.com")=>new Request("https://isitusa.com/api/corrections/verify",{method:"POST",headers:{Origin:origin,"Content-Type":"application/json"},body:JSON.stringify({token})});
 try{
 env.VERCEL_ENV="preview";env.TURNSTILE_SECRET_KEY="synthetic-test-secret";env.NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY="synthetic-public-key";
 assert.equal((await GET().json()).available,false);
 env.VERCEL_ENV="production";assert.equal((await GET().json()).available,true);
 globalThis.fetch=async()=>{calls++;return Response.json({success:true,action:"correction",hostname:"isitusa.com"});};
 assert.equal((await POST(request("token","https://example.invalid"))).status,403);assert.equal(calls,0);
 assert.equal((await POST(request(""))).status,400);assert.equal(calls,0);
 assert.equal((await POST(request("x".repeat(5000)))).status,413);assert.equal(calls,0);
 assert.equal((await POST(request("token"))).status,200);
 globalThis.fetch=async()=>Response.json({success:true,action:"checkout",hostname:"isitusa.com"});
 assert.equal((await POST(request("token"))).status,400);
 globalThis.fetch=async()=>Response.json({success:true,action:"correction",hostname:"example.invalid"});
 assert.equal((await POST(request("token"))).status,400);
 globalThis.fetch=async()=>{throw Error("unavailable")};assert.equal((await POST(request("token"))).status,503);
 console.log("Passed correction verification readiness, origin, size, token, action, hostname and fail-closed checks.");
 }finally{globalThis.fetch=original;for(const [key,value]of Object.entries(old)){if(value===undefined)delete env[key];else env[key]=value;}}
}
void main();
