// Server-to-server challenge verification for the private sighting intake.
// The Turnstile secret stays in the website's existing production environment.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const reply = (value: object, status = 200) => Response.json(value, {status,headers:{"Cache-Control":"no-store"}});
const ready = () => process.env.VERCEL_ENV === "production" && Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY);
export function GET(){return reply({available:ready()});}
export async function POST(request:Request){
 if(!ready())return reply({valid:false},503);
 if(request.headers.get("origin")!=="https://isitusa.com" || !request.headers.get("content-type")?.startsWith("application/json"))return reply({valid:false},403);
 const reader=request.body?.getReader();if(!reader)return reply({valid:false},400);
 const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return reply({valid:false},413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const input=JSON.parse(new TextDecoder().decode(bytes));
 if(typeof input?.token!=="string"||!input.token||input.token.length>2048)return reply({valid:false},400);
 const response=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({secret:process.env.TURNSTILE_SECRET_KEY,response:input.token}),signal:AbortSignal.timeout(10000)});
 const result=await response.json();
 const valid=response.ok&&result.success===true&&result.action==="sighting"&&["isitusa.com","www.isitusa.com"].includes(result.hostname);
 return reply({valid},valid?200:400);
 }catch{return reply({valid:false},503);}
}
