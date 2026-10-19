import { HttpError, challenge } from "./runtime.ts";
const verifyEndpoint="https://isitusa.com/api/sightings/verify";
export async function sightingsReady(){
 if(Deno.env.get("TURNSTILE_SECRET_KEY"))return true;
 try{const result=await fetch(verifyEndpoint,{redirect:"error",signal:AbortSignal.timeout(5000)});return result.ok&&(await result.json()).available===true;}catch{return false;}
}
export async function sightingChallenge(token:unknown){
 if(typeof token!=="string"||!token||token.length>2048)throw new HttpError(400,"Complete the security check.");
 if(Deno.env.get("TURNSTILE_SECRET_KEY")){await challenge(token,"sighting");return;}
 const response=await fetch(verifyEndpoint,{method:"POST",redirect:"error",headers:{Origin:"https://isitusa.com","Content-Type":"application/json"},body:JSON.stringify({token}),signal:AbortSignal.timeout(12000)});
 if(!response.ok||(await response.json()).valid!==true)throw new HttpError(400,"Refresh the security check and try again.");
}
