// Deno test source. Requires the pinned provider modules; do not run in production.
import Stripe from "npm:stripe@22.6.2";
const stripe=new Stripe("sk_test_fixture_not_a_credential");
const encoder=new TextEncoder(),secret="whsec_fixture_not_a_real_secret";
async function signed(payload:string,timestamp=Math.floor(Date.now()/1000)){
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const bytes=await crypto.subtle.sign("HMAC",key,encoder.encode(`${timestamp}.${payload}`));
 return `t=${timestamp},v1=${Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,"0")).join("")}`;
}
async function rejects(fn:()=>Promise<unknown>){let rejected=false;try{await fn();}catch{rejected=true;}if(!rejected)throw new Error("Expected signature rejection");}
Deno.test("Stripe verifies raw bytes and rejects mutation and stale signatures",async()=>{
 const payload=JSON.stringify({id:"evt_fixture",type:"checkout.session.completed",object:"event",data:{object:{id:"cs_fixture"}}});
 const signature=await signed(payload),cryptoProvider=Stripe.createSubtleCryptoProvider();
 await stripe.webhooks.constructEventAsync(payload,signature,secret,300,cryptoProvider);
 await rejects(()=>stripe.webhooks.constructEventAsync(payload+" ",signature,secret,300,cryptoProvider));
 await rejects(()=>stripe.webhooks.constructEventAsync(payload,signature,"wrong_secret",300,cryptoProvider));
 await rejects(async()=>stripe.webhooks.constructEventAsync(payload,await signed(payload,1),secret,300,cryptoProvider));
});
