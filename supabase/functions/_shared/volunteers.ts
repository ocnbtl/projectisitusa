import { validateVolunteer } from "../../../src/lib/participation/volunteers.ts";
import { checked, enabled, HttpError, service, staff, rate, challenge } from "./runtime.ts";
const verifyEndpoint="https://isitusa.com/api/volunteer/verify";
export async function volunteersReady(){
 if(Deno.env.get("TURNSTILE_SECRET_KEY"))return true;
 try{const result=await fetch(verifyEndpoint,{redirect:"error",signal:AbortSignal.timeout(5000)});return result.ok&&(await result.json()).available===true;}catch{return false;}
}
async function verify(token:unknown){
 if(typeof token!=="string"||!token||token.length>2048)throw new HttpError(400,"Complete the security check.");
 if(Deno.env.get("TURNSTILE_SECRET_KEY")){await challenge(token,"volunteer");return;}
 const response=await fetch(verifyEndpoint,{method:"POST",redirect:"error",headers:{Origin:"https://isitusa.com","Content-Type":"application/json"},body:JSON.stringify({token}),signal:AbortSignal.timeout(12000)});
 if(!response.ok||(await response.json()).valid!==true)throw new HttpError(400,"Refresh the security check and try again.");
}
export async function submitVolunteer(input:Record<string,unknown>){
 if(input.website)throw new HttpError(400,"Check your submission.");
 let values;try{values=validateVolunteer(input);}catch(e){throw new HttpError(400,e instanceof Error?e.message:"Check your application.");}
 if(typeof input.id!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(input.id))throw new HttpError(400,"Refresh the form and try again.");
 await verify(input.challenge);
 await rate("volunteer:global",40,3600);await rate("volunteer:"+values.email,3,86400);
 // Idempotent retry of the same form; never replace an existing application.
 checked(await service().from("isitusa_volunteer_applications").upsert({id:input.id,...values},{onConflict:"id",ignoreDuplicates:true}));
 return {id:input.id,received:true};
}
export async function inviteVolunteer(req:Request,input:Record<string,unknown>){
 const {client,user}=await staff(req,"team");
 if(!enabled("STAFF_INVITES_ENABLED"))throw new HttpError(503,"Team invitations are not configured yet.");
 await rate("volunteer-invite:"+user.id,10,3600);
 const result=await client.rpc("isitusa_begin_volunteer_invite",{application:input.id,expected_version:input.version});
 if(result.error)throw new HttpError(409,result.error.message);
 const item=result.data as {id:string;email:string;version:number};const db=service();
 try{
  let target=checked(await db.rpc("isitusa_volunteer_auth_target",{address:item.email})) as string|null;
  const existing=Boolean(target);
  if(!target){const invitation=await db.auth.admin.inviteUserByEmail(item.email,{redirectTo:"https://team.isitusa.com/auth/confirm"});if(invitation.error||!invitation.data.user)throw new HttpError(409,"The invitation could not be sent. Refresh this application and try again; no access has been granted.");target=invitation.data.user.id;}
  const completed=await client.rpc("isitusa_finish_volunteer_invite",{application:item.id,expected_version:item.version,target});
  if(completed.error)throw new HttpError(409,"The account exists, but access could not be finalized. Refresh and retry to finish the approved role without sending another invitation.");
  return {invited:true,message:existing?"The approved role is linked to their existing account. Ask them to sign in at team.isitusa.com, or use its password-reset option.":"Invitation sent. They’ll set a password and authenticator before opening their workspace."};
 }catch(error){await client.rpc("isitusa_release_volunteer_invite",{application:item.id,expected_version:item.version});throw error;}
}
