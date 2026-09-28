import { body, checked, hash, HttpError, responseError, service } from "../_shared/runtime.ts";
// RFC 8058: a GET never changes consent. Mail clients POST the opaque link token.
Deno.serve(async(req:Request)=>{
 try{
  if(req.method!=="POST")return new Response("Use the unsubscribe button in your email or visit https://isitusa.com/preferences.",{status:405,headers:{"Cache-Control":"no-store"}});
  const token=new URL(req.url).searchParams.get("token")??"";
  if(!/^[a-f0-9]{64}$/.test(token))throw new HttpError(400,"Invalid unsubscribe link.");
  const posted=new URLSearchParams(new TextDecoder().decode(await body(req,1024)));
  if(posted.get("List-Unsubscribe")!=="One-Click")throw new HttpError(400,"Invalid unsubscribe request.");
  checked(await service().rpc("isitusa_token_action",{hash:await hash(token),action:"unsubscribe",prefs:null}));
  return new Response(null,{status:204,headers:{"Cache-Control":"no-store"}});
 }catch(error){return responseError(error,{"Cache-Control":"no-store"});}
});
