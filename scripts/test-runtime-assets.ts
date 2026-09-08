import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRuntimeDataLoader } from '@/lib/data/runtime-fetch';

const sha=(bytes: Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const read=(file: string)=>JSON.parse(readFileSync(file,'utf8'));
const declarations=read('src/data/runtime/data-assets.json').bundles;
const assets=read('src/data/runtime/image-assets.json').assets;
function verifySpecies(species: any[], original: any[]) {
  assert.equal(species.length, original.length);
  for (let i = 0; i < original.length; i++) {
    const expected = original[i]; const actual = species[i];
    const asset = assets[expected.image?.src];
    if (!asset) { assert.deepEqual(actual, expected, expected.id); continue; }
    assert.equal(actual.image.src, asset.full.src, expected.id);
    assert.equal(actual.image.thumbnail, asset.thumbnail.src, expected.id);
    const { thumbnail, ...image } = actual.image;
    assert.deepEqual({ ...actual, image: { ...image, src: expected.image.src } }, expected, expected.id);
    assert.equal(sha(readFileSync(`public${expected.image.src}`)), asset.sourceSha256, expected.id);
  }
}
const payloads: Record<string, any>={};
for(const [name,asset] of Object.entries(declarations) as [string, any][]) {
  const compressed=readFileSync(`.cache/runtime-assets/${asset.sha256}.json.gz`);
  const bytes=gunzipSync(compressed); assert.equal(sha(bytes),asset.sha256); assert.equal(bytes.length,asset.bytes); assert.equal(compressed.length,asset.storedBytes);
  payloads[name]=JSON.parse(bytes.toString());
}
verifySpecies(payloads.catalog,read('src/data/generated/species.json'));
verifySpecies(payloads.map.allSpecies,read('src/data/generated/explorer-species.json'));
for(const [field,file] of Object.entries({countyIndex:'counties',countyDetails:'county-details',presenceIndex:'explorer-presence',datasetSnapshot:'snapshot'})) assert.deepEqual(payloads.map[field],read(`src/data/generated/${file}.json`));
for(const entry of Object.values(assets) as any[]) for(const variant of [entry.full,entry.thumbnail]) { const bytes=readFileSync(`public${variant.src}`); assert.equal(sha(bytes),variant.sha256);assert.equal(bytes.length,variant.bytes); }
const body=Buffer.from('{"test":"intact"}');
const digest=sha(body);
const asset={url:`https://data.isitusa.com/app-data/sha256/${digest}.json`,sha256:digest,bytes:body.length};
async function main() {
  let calls=0;
  const loader=createRuntimeDataLoader(async (_url,options)=>{ calls++; assert.equal(options?.cache,'force-cache'); assert.equal(options?.credentials,'omit'); return new Response(body); });
  assert.deepEqual(await Promise.all([loader(asset),loader(asset)]),[{test:'intact'},{test:'intact'}]); await loader(asset); assert.equal(calls,1);
  let retryCalls=0;
  const retry=createRuntimeDataLoader(async (_url,options)=>{retryCalls++; if(retryCalls===1)return new Response('down',{status:503}); assert.equal(options?.cache,'reload'); return new Response(body);});
  await assert.rejects(retry(asset),/503/);assert.deepEqual(await retry(asset),{test:'intact'});assert.equal(retryCalls,2);
  await assert.rejects(createRuntimeDataLoader(async()=>new Response('short'))(asset),/byte count/);
  await assert.rejects(createRuntimeDataLoader(async()=>new Response(Buffer.alloc(body.length)))(asset),/hash differs/);
  await assert.rejects(loader({...asset,url:'https://example.com/data.json'}),/Invalid versioned/);
  const timeout=createRuntimeDataLoader(async (_url,options)=>new Promise((_resolve,reject)=> options?.signal?.addEventListener('abort',()=>reject(new DOMException('Timeout','AbortError')))),10);
  await assert.rejects(timeout(asset),{name:'AbortError'});
  console.log(`Runtime asset parity and failure recovery passed: ${payloads.catalog.length} species, ${Object.keys(assets).length} images; county data and provenance unchanged.`);
}
void main();
