const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('C:/Code/project-isitusa/node_modules/typescript');
const moduleUnderTest={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync('src/lib/ui/capture-transport.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(moduleUnderTest.exports,moduleUnderTest);
const {installOptionalTransport,abortOptionalRequests}=moduleUnderTest.exports;
(async()=>{
let allowReplay=true,allowHeatmaps=true,sends=0,aborted=0,beacons=0,pending=false;
global.location={href:'https://isitusa.com/brand'};global.window={fetch:async(input,init)=>{sends++;if(pending)return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>{aborted++;reject(new Error('aborted'));}));return new Response('',{status:503});}};
Object.defineProperty(global,'navigator',{configurable:true,value:{sendBeacon(){beacons++;return true;}}});
installOptionalTransport({replay:()=>allowReplay,heatmaps:()=>allowHeatmaps});
const send=event=>window.fetch('https://us.i.posthog.com/s/',{method:'POST',body:JSON.stringify({event,properties:{$snapshot_data:[]}})});
assert.equal((await send('$snapshot')).status,200,'collector503 acknowledged locally to suppress SDK retry');assert.equal(sends,1);
allowReplay=false;await send('$snapshot');assert.equal(sends,1,'queued replay denied after withdrawal');
await send('$$heatmap');assert.equal(sends,2,'independent heatmap remains available');
allowReplay=true;pending=true;const inflight=send('$snapshot');await new Promise(r=>setTimeout(r,0));allowReplay=false;abortOptionalRequests('replay');await inflight;assert.equal(aborted,1);
allowHeatmaps=false;await send('$$heatmap');assert.equal(sends,3,'queued heatmap denied');
await window.fetch('https://us.i.posthog.com/s/',{method:'POST',body:'opaque compressed body'});assert.equal(sends,3,'unknown bodies fail closed');
assert.equal(navigator.sendBeacon('https://us.i.posthog.com/s/','queued'),true);assert.equal(beacons,0,'unabortable unload send discarded');
pending=false;await window.fetch('https://example.invalid/',{method:'POST',body:'ordinary'});assert.equal(sends,4,'unrelated transport preserved');
console.log(JSON.stringify({status:'PASS',collector503:'one attempt, local ACK',withdrawal:'queued denied and inflight aborted',features:'independent',beacon:'vendor discarded',externalRequests:0}));
})().catch(e=>{console.error(e);process.exitCode=1;});
