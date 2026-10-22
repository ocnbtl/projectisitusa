import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { request } from "node:https";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { isPublicAddress, publicHttpsDownload } from "./public-https-download";
import { boundedZipRecords, createZipArchive } from "./research/zip-tools";

async function main() {
  for(const address of ["127.0.0.1","10.1.2.3","169.254.169.254","100.64.0.1","192.168.1.1","198.18.0.1","203.0.113.1","224.0.0.1","::1","::ffff:127.0.0.1","fc00::1","fe80::1","2001:db8::1","2002:7f00:1::1","64:ff9b::7f00:1"])assert.equal(isPublicAddress(address),false,address);
  for(const address of ["8.8.8.8","93.184.216.34","2001:4860:4860::8888"])assert.equal(isPublicAddress(address),true,address);
  let requests=0;
  const fake=(headers:Record<string,string>={},body:Buffer[]= [Buffer.from("ok")],status=200,hang=false)=>((url:any,options:any,callback:any)=>{
    requests++;
    const req=new EventEmitter() as any;
    let response:Readable;
    req.destroy=()=>{response?.destroy();return req;};
    req.end=()=>queueMicrotask(()=>{
      options.lookup(url.hostname,{},(error:unknown,address:string,family:number)=>{assert.equal(error,null);assert.equal(address,"93.184.216.34");assert.equal(family,4);});
      response=hang?new Readable({read(){}}):Readable.from(body);
      Object.assign(response,{statusCode:status,headers});
      options.signal.addEventListener("abort",()=>{response.destroy();req.emit("error",options.signal.reason);},{once:true});
      callback(response);
    });return req;
  }) as typeof request;
  const base={maxBytes:16,accept:"application/json",lookupImpl:async()=>[{address:"93.184.216.34",family:4}],requestImpl:fake()};
  assert.equal((await publicHttpsDownload("https://media.example/photo",base)).body.toString(),"ok");
  for(const url of ["http://media.example/","https://user:pass@media.example/","https://media.example:444/","https://127.1/","https://2130706433/","https://[::1]/"])await assert.rejects(publicHttpsDownload(url,base));
  await assert.rejects(publicHttpsDownload("https://media.example/",{...base,lookupImpl:async()=>[{address:"93.184.216.34",family:4},{address:"127.0.0.1",family:4}]}));
  const beforeRedirect=requests;
  await assert.rejects(publicHttpsDownload("https://media.example/",{...base,requestImpl:fake({location:"https://127.0.0.1/private"},[],302)}));
  assert.equal(requests,beforeRedirect+1);
  await assert.rejects(publicHttpsDownload("https://media.example/",{...base,maxRedirects:1,requestImpl:fake({location:"/again"},[],302)}),/redirect limit/);
  await assert.rejects(publicHttpsDownload("https://media.example/",{...base,requestImpl:fake({"content-length":"17"})}),/byte budget/);
  await assert.rejects(publicHttpsDownload("https://media.example/",{...base,requestImpl:fake({"content-length":"2"},[Buffer.alloc(8),Buffer.alloc(9)])}),/byte budget/);
  const keepAlive=setTimeout(()=>{},1000);
  try {
    await assert.rejects(publicHttpsDownload("https://media.example/",{...base,timeoutMs:10,requestImpl:fake({},[],200,true)}));
    await assert.rejects(publicHttpsDownload("https://media.example/",{...base,timeoutMs:10,lookupImpl:()=>new Promise(()=>{})}));
  } finally {clearTimeout(keepAlive);}

  const directory=await mkdtemp(join(tmpdir(),"isitusa-archive-security-"));
  try {
    const entry="occurrence.txt",archive=join(directory,"fixture.zip");
    await writeFile(join(directory,entry),"id\tname\n1\tFixture\n");
    createZipArchive(directory,archive,[entry]);
    const rows=[];
    for await(const row of boundedZipRecords(archive,entry,{columns:true,delimiter:"\t"}))rows.push(row);
    assert.deepEqual(rows,[{id:"1",name:"Fixture"}]);
    await assert.rejects(async()=>{for await(const _row of boundedZipRecords(archive,entry,{columns:true,delimiter:"\t"},undefined,{maxDecodedBytes:8}))void _row;},/decoded-byte budget/);
    await writeFile(join(directory,entry),"id\tname\n1\t"+"x".repeat(4096)+"\n");
    createZipArchive(directory,archive,[entry]);
    await assert.rejects(async()=>{for await(const _row of boundedZipRecords(archive,entry,{columns:true,delimiter:"\t"},undefined,{maxRecordBytes:64}))void _row;},/record exceed|record_size|record size/i);
    for(const delimiter of ["\t",","]){
      await writeFile(join(directory,entry),`id${delimiter}name\n`+delimiter.repeat(4096)+"\n");
      createZipArchive(directory,archive,[entry]);
      await assert.rejects(async()=>{for await(const row of boundedZipRecords(archive,entry,{columns:true,delimiter},undefined,{maxRecordBytes:64}))void row;},/raw record size budget/);
    }
    // Keep the extractor occupied beyond timer resolution; tiny fixtures can
    // legitimately finish before a one-millisecond deadline on a warm machine.
    await writeFile(join(directory,entry),"id\tname\n"+"1\tFixture\n".repeat(25000));
    createZipArchive(directory,archive,[entry]);
    await assert.rejects(async()=>{for await(const _row of boundedZipRecords(archive,entry,{columns:true,delimiter:"\t"},undefined,{timeoutMs:1}))void _row;},/deadline/);
    await assert.rejects(async()=>{for await(const _row of boundedZipRecords(archive,"missing.txt",{columns:true}))void _row;},/extraction failed/);
  } finally {
    if(!resolve(directory).startsWith(resolve(tmpdir())+sep)||!directory.includes("isitusa-archive-security-"))throw new Error("Unexpected fixture cleanup path.");
    await rm(directory,{recursive:true,force:true});
  }
  console.log("PASS: public address policy, pinned HTTPS lookup, private redirects, redirect budget, declared/chunked byte caps, body/DNS deadlines; real ZIP success, decoded/record/deadline limits and extractor failure. No external requests.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
