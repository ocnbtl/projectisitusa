import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const src=fs.readFileSync('src/components/footer-grove.tsx','utf8');
const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function scenario(reduced=false) {
 let effect, cleanup, now=0, counter=0;const frames=new Map(),events=new Map(),props={};
 const element={offsetHeight:300,style:{setProperty:(k,v)=>props[k]=v}};
 const html={scrollHeight:2000,classList:{contains:()=>false,toggle(){},remove(){}}};
 const media={matches:reduced,addEventListener(){},removeEventListener(){}};
 const context={exports:{},require:n=>n==='react'?{useRef:()=>({current:element}),useEffect:f=>effect=f}:{jsx:()=>null,jsxs:()=>null},window:{innerHeight:800,scrollY:1200,scrollBy(){},matchMedia:()=>media,addEventListener:(k,v)=>events.set(k,v),removeEventListener:k=>events.delete(k)},document:{documentElement:html,querySelector:()=>({content:'#edf2ef'})},getComputedStyle:()=>({getPropertyValue:()=> '#00583b'}),IntersectionObserver:class{constructor(cb){this.cb=cb}observe(){this.cb([{isIntersecting:true}])}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:f=>{frames.set(++counter,f);return counter},cancelAnimationFrame:id=>frames.delete(id),performance:{now:()=>now},HTMLElement:class{}};
 vm.runInNewContext(js,context);context.exports.FooterGrove();cleanup=effect();
 const tick=ms=>{for(let t=0;t<ms;t+=16){now+=16;for(const [id,f]of [...frames]){frames.delete(id);f(now);}}};
 events.get('wheel')({deltaY:1000,deltaMode:0});tick(160);
 const open=parseFloat(props['--root-reveal']||'0');
 if(reduced)assert.equal(open,0);else {assert(open>0&&open<=114);tick(2400);assert.equal(props['--root-reveal'],'0px');context.window.scrollY=800;events.get('wheel')({deltaY:1000,deltaMode:0});tick(160);assert.equal(props['--root-reveal'],'0px');}
 cleanup();assert.equal(events.size,0);assert.equal(frames.size,0);return open;
}
console.log({normalReveal:scenario(),reducedReveal:scenario(true),checks:'bounded reveal, return, away-from-bottom, reduced motion, cleanup passed'});

