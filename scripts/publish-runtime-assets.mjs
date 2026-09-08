import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const args=process.argv.slice(2);
const preflightFile=args[args.indexOf('--preflight')+1];
if (!args.includes('--preflight') || !preflightFile) throw new Error('Pass --preflight <fresh R2 inventory and dashboard receipt>.');
const preflight=JSON.parse(fs.readFileSync(preflightFile));
const sha=b=>createHash('sha256').update(b).digest('hex');
const declarations=JSON.parse(fs.readFileSync('src/data/runtime/data-assets.json')).bundles;
const records=Object.entries(declarations).map(([name, asset])=>{
  assert.match(asset.sha256,/^[a-f0-9]{64}$/);
  assert.equal(asset.url,`https://data.isitusa.com/app-data/sha256/${asset.sha256}.json`);
  const compressed=fs.readFileSync(`.cache/runtime-assets/${asset.sha256}.json.gz`);
  const bytes=gunzipSync(compressed);
  assert.equal(sha(bytes),asset.sha256); assert.equal(bytes.length,asset.bytes); assert.equal(compressed.length,asset.storedBytes);
  return {name,asset,compressed,key:`app-data/sha256/${asset.sha256}.json`};
});
assert.equal(preflight.bucket,'project-isitusa-research');
assert.ok(Date.now()-Date.parse(preflight.observedAt)>=0 && Date.now()-Date.parse(preflight.observedAt)<24*60*60*1000,'R2 inventory must be less than 24 hours old');
for(const field of ['bytes','monthlyClassAUpperBound','monthlyClassBUpperBound','reservedResearchBytes']) assert.ok(Number.isSafeInteger(preflight[field]) && preflight[field]>=0,`Missing ${field}`);
const incrementalBytes=records.reduce((n,r)=>n+r.compressed.length,0);
const projectedBytes=preflight.bytes+preflight.reservedResearchBytes+incrementalBytes;
assert.ok(projectedBytes<8000000000,'R2 safety storage ceiling, including the reserved research release');
assert.ok(preflight.monthlyClassAUpperBound+50<800000 && preflight.monthlyClassBUpperBound+100<8000000,'R2 operation safety ceilings');
const receipt={observedAt:new Date().toISOString(),mode:args.includes('--publish')?'publish':'plan',preflightFile,preflightSha256:sha(fs.readFileSync(preflightFile)),incrementalBytesUpperBound:incrementalBytes,projectedBytesWithResearchReserve:projectedBytes,artifacts:[]};
if (args.includes('--publish')) {
  assert.equal(process.env.R2_BUCKET,'project-isitusa-research'); assert.equal(process.env.R2_ACCOUNT_ID,'0fe57401a5fd98319e16832ee97de02d');
  const client=new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY},maxAttempts:1});
  try {
    for(const {name,asset,compressed,key} of records) {
      let existing;
      try {existing=await client.send(new HeadObjectCommand({Bucket:process.env.R2_BUCKET,Key:key}));} catch(e) {if(e.$metadata?.httpStatusCode!==404) throw e;}
      if(existing) {assert.equal(existing.Metadata?.sha256,asset.sha256);assert.equal(existing.ContentLength,compressed.length);assert.equal(existing.ContentEncoding,'gzip');}
      else await client.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,Body:compressed,ContentLength:compressed.length,ContentType:'application/json; charset=utf-8',ContentEncoding:'gzip',CacheControl:'public, max-age=31536000, immutable',Metadata:{sha256:asset.sha256},IfNoneMatch:'*'}));
      const response=await fetch(asset.url,{headers:{Origin:'https://isitusa.com'},signal:AbortSignal.timeout(30000)});
      assert.equal(response.status,200); const bytes=Buffer.from(await response.arrayBuffer()); assert.equal(sha(bytes),asset.sha256); assert.equal(bytes.length,asset.bytes);
      assert.equal(response.headers.get('access-control-allow-origin'),'https://isitusa.com'); assert.match(response.headers.get('cache-control')??'',/immutable/);
      receipt.artifacts.push({name,...asset,action:existing?'verified-existing':'uploaded',status:response.status,headers:Object.fromEntries(response.headers)});
      fs.writeFileSync('.cache/runtime-assets/publication-receipt.json',JSON.stringify(receipt,null,2)+'\n');
    }
  } finally {client.destroy();}
}
console.log(JSON.stringify(receipt,null,2));
