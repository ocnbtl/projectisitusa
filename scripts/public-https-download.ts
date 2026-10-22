import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";

const deniedV4 = new BlockList();
for (const [network,prefix] of [["0.0.0.0",8],["10.0.0.0",8],["100.64.0.0",10],["127.0.0.0",8],["169.254.0.0",16],["172.16.0.0",12],["192.0.0.0",24],["192.0.2.0",24],["192.88.99.0",24],["192.168.0.0",16],["198.18.0.0",15],["198.51.100.0",24],["203.0.113.0",24],["224.0.0.0",4],["240.0.0.0",4]] as const) deniedV4.addSubnet(network,prefix,"ipv4");
const globalV6 = new BlockList();globalV6.addSubnet("2000::",3,"ipv6");
const deniedV6 = new BlockList();
for(const [network,prefix] of [["2001::",23],["2001:db8::",32],["2002::",16],["3fff::",20]] as const)deniedV6.addSubnet(network,prefix,"ipv6");
export function isPublicAddress(address:string) {
  if(address.includes("%"))return false;
  const family=isIP(address);
  return family===4?!deniedV4.check(address,"ipv4"):family===6&&globalV6.check(address,"ipv6")&&!deniedV6.check(address,"ipv6");
}
type Address={address:string;family:number};
type DownloadOptions={maxBytes:number;timeoutMs?:number;maxRedirects?:number;accept:string;lookupImpl?:(host:string)=>Promise<Address[]>;requestImpl?:typeof request};
export async function publicHttpsDownload(input:string, options:DownloadOptions) {
  const {maxBytes,timeoutMs=20000,maxRedirects=4,accept,requestImpl=request}=options;
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||!Number.isSafeInteger(maxRedirects)||maxRedirects<0)throw new Error("Invalid download budget.");
  const signal=AbortSignal.timeout(timeoutMs);
  let url=new URL(input);
  for(let redirects=0;;redirects++) {
    signal.throwIfAborted();
    if(url.protocol!=="https:"||url.username||url.password||(url.port&&url.port!=="443"))throw new Error("Only public HTTPS destinations are supported.");
    const host=url.hostname.replace(/^\[|\]$/g,"");
    const resolving=isIP(host)?Promise.resolve([{address:host,family:isIP(host)}]):(options.lookupImpl?options.lookupImpl(host):lookup(host,{all:true,verbatim:true}));
    const addresses=await new Promise<Address[]>((resolve,reject)=>{
      const aborted=()=>reject(signal.reason);
      signal.addEventListener("abort",aborted,{once:true});
      resolving.then(resolve,reject).finally(()=>signal.removeEventListener("abort",aborted));
    });
    if(!addresses.length||addresses.some(value=>!isPublicAddress(value.address)||isIP(value.address)!==value.family))throw new Error("Destination resolves to a nonpublic address.");
    signal.throwIfAborted();
    const selected=addresses[0];
    const result=await new Promise<{redirect?:string;status:number;contentType:string;body:Buffer}>((resolve,reject)=>{
      const req=requestImpl(url,{
        method:"GET",agent:false,family:selected.family,signal,
        headers:{"User-Agent":"Project Isitusa species image importer",Accept:accept,"Accept-Encoding":"identity"},
        // Bind the actual socket to the address checked above; preserve hostname/TLS verification.
        lookup:(_hostname,_lookupOptions,done)=>done(null,selected.address,selected.family),
      },response=>{
        const status=response.statusCode??0;
        if([301,302,303,307,308].includes(status)&&response.headers.location){
          response.destroy();resolve({redirect:response.headers.location,status,contentType:"",body:Buffer.alloc(0)});return;
        }
        const declared=response.headers["content-length"];
        if(declared!==undefined&&(!/^\d+$/.test(String(declared))||Number(declared)>maxBytes)){
          response.destroy();req.destroy();reject(new Error("Download exceeds its byte budget."));return;
        }
        if(response.headers["content-encoding"]&&response.headers["content-encoding"]!=="identity"){
          response.destroy();req.destroy();reject(new Error("Unexpected compressed response."));return;
        }
        let bytes=0;const chunks:Buffer[]=[];
        response.on("data",(chunk:Buffer)=>{
          bytes+=chunk.length;
          if(bytes>maxBytes){response.destroy();req.destroy();reject(new Error("Download exceeds its byte budget."));return;}
          chunks.push(Buffer.from(chunk));
        });
        response.on("error",reject);
        response.on("aborted",()=>reject(new Error("Download ended before completion.")));
        response.on("end",()=>resolve({status,contentType:String(response.headers["content-type"]??""),body:Buffer.concat(chunks)}));
      });
      req.on("error",reject);req.end();
    });
    if(result.redirect){if(redirects>=maxRedirects)throw new Error("Download redirect limit exceeded.");url=new URL(result.redirect,url);continue;}
    return {...result,url:url.href};
  }
}
