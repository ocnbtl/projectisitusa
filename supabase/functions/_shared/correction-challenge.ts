import { HttpError, challenge, checked, hash, service } from "./runtime.ts";
const endpoint="https://isitusa.com/api/corrections/verify";
let readiness:{value:boolean;at:number}|null=null;
export async function correctionsReady(){
 if(Deno.env.get("TURNSTILE_SECRET_KEY"))return true;
 if(readiness&&Date.now()-readiness.at<60000)return readiness.value;
 try{const response=await fetch(endpoint,{redirect:"error",signal:AbortSignal.timeout(5000)});const result=await response.json();const value=response.ok&&result.available===true;readiness={value,at:Date.now()};return value;}catch{return false;}
}
export async function correctionChallenge(token:unknown){
 if(typeof token!=="string"||!token||token.length>2048)throw new HttpError(400,"Complete the security check.");
 if(Deno.env.get("TURNSTILE_SECRET_KEY")){await challenge(token,"correction");return;}
 // Fixed first-party endpoint, no caller-controlled URL or redirect destination.
 const response=await fetch(endpoint,{method:"POST",redirect:"error",headers:{Origin:"https://isitusa.com","Content-Type":"application/json"},body:JSON.stringify({token}),signal:AbortSignal.timeout(12000)}).catch(()=>{throw new HttpError(503,"The security check is unavailable. Please retry.");});
 const result=await response.json();
 if(!response.ok||result.valid!==true)throw new HttpError(response.status===503?503:400,"Refresh the security check and try again.");
}
export async function correctionRate(key:string,maximum:number){
 // Only non-personal global/species buckets. No IP address or identity is stored.
 const allowed=checked(await service().rpc("isitusa_rate_limit",{key:await hash("profile-correction-v1:"+key),maximum,seconds:3600}));
 if(!allowed)throw new HttpError(429,"Please wait before sending another suggestion.");
}
