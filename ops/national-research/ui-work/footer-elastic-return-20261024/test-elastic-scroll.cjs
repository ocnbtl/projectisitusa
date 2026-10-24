const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('C:/Code/project-isitusa/node_modules/typescript');
const source=fs.readFileSync('src/components/footer-grove.tsx','utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function fixture(reduce=false, height=500){
 const listeners={},frames=new Map(),values=new Map(),samples=[],attrs=new Map();let now=0,id=0,cleanup;
 class Element{closest(){return null}}
 const reduced={matches:reduce,addEventListener(k,f){this.change=f},removeEventListener(){}};
 const world={getBoundingClientRect(){return {height,bottom:3000-win.scrollY-(parseFloat(values.get('--root-reveal'))||0)}}};
 const element={querySelector:()=>world,getBoundingClientRect(){return {top:2500-win.scrollY,bottom:3000-win.scrollY}},style:{setProperty(k,v){values.set(k,v);if(k==='--root-reveal')samples.push({time:now,value:parseFloat(v)})},removeProperty(k){values.delete(k)}},setAttribute(k,v){attrs.set(k,v)},removeAttribute(k){attrs.delete(k)}};
 const html={scrollHeight:3000,classList:{toggle(){},contains(){return false},remove(){}},style:{setProperty(){},removeProperty(){}}};
 const win={scrollY:0,innerHeight:800,innerWidth:1200,matchMedia:()=>reduced,addEventListener(k,f){listeners[k]=f},removeEventListener(k){delete listeners[k]},scrollTo(){throw Error('Must never move native scroll position')},scrollBy(){throw Error('Must never compensate page scrolling')}};
 const context={exports:{},Element,require(name){if(name==='react')return {useRef:()=>({current:element}),useEffect(fn){cleanup=fn()}};if(name==='react/jsx-runtime')return {jsx(){},jsxs(){}};throw Error(name)},window:win,document:{documentElement:html,querySelector:()=>({content:'#ffffff'})},performance:{now:()=>now},getComputedStyle:()=>({getPropertyValue:k=>({'--grove-ink':'#00583b','--soil-base':'#d5d9bd','--soil-depth':'180px','--background':'#edf3ef'}[k])}),requestAnimationFrame(fn){frames.set(++id,fn);return id},cancelAnimationFrame(n){frames.delete(n)},IntersectionObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}}};
 vm.runInNewContext(code,context);context.exports.FooterGrove();
 return {win,listeners,reduced,frames,values,samples,attrs,cleanup:()=>cleanup(),value:()=>parseFloat(values.get('--root-reveal'))||0,scroll(y){win.scrollY=y;listeners.scroll()},wheel(deltaY=120,extra={}){listeners.wheel({deltaY,deltaMode:0,...extra})},step(ms,frame=16){for(let t=0;t<ms;t+=frame){now+=frame;const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(now))}},touch(y,kind='touchmove'){listeners[kind]({touches:[{clientY:y}]})}};
}
for(const frame of [8,16,32]){
 const f=fixture();f.scroll(2000);f.wheel(160);f.step(100,frame);assert.equal(f.value(),0,'No reveal away from the bottom');
 f.scroll(2200);f.step(32,frame);assert.ok(f.value()>0,'Arrival starts immediately');f.step(800,frame);
 assert.equal(f.value(),0,'Resting edge is forest only');assert.equal(f.win.scrollY,2200,'Native scrollbar stays untouched');
 const peak=Math.max(...f.samples.map(s=>s.value));const peakAt=f.samples.find(s=>s.value===peak).time;assert.ok(peakAt<350,'No idle pause before return');assert.ok(peak<=140,'Full landscape remains inside reserved headroom');
 for(let i=1;i<f.samples.length;i++) assert.ok(Math.abs(f.samples[i].value-f.samples[i-1].value)<frame*1.5,JSON.stringify({frame,previous:f.samples[i-1],current:f.samples[i]}));
 for(let n=0;n<3;n++){f.wheel(150);f.step(64,frame);assert.ok(f.value()>0,'Each new downward scroll repeats');f.step(800,frame);assert.equal(f.value(),0,'Each reveal closes without leaving footer')}
 f.cleanup();assert.equal(f.frames.size,0);assert.equal(Object.keys(f.listeners).length,0);
}
const touch=fixture(false,300);touch.scroll(2200);touch.step(850);touch.touch(600,'touchstart');touch.touch(500);touch.step(80);assert.ok(touch.value()>0);assert.ok(touch.value()<=90);touch.step(750);assert.equal(touch.value(),0,'Holding a finger cannot keep roots open');touch.touch(400);touch.step(80);assert.ok(touch.value()>0,'A subsequent swipe repeats');touch.listeners.resize();assert.ok(touch.value()>0,'Address bar resize does not snap motion closed');touch.step(800);touch.listeners.touchend();touch.cleanup();
const sustained=fixture();sustained.scroll(2200);for(let i=0;i<18;i++){sustained.wheel(180);sustained.step(16)}const peak=Math.max(...sustained.samples.map(x=>x.value));assert.ok(sustained.value()<peak*.3,'Continuous input does not defer the return');sustained.step(800);assert.equal(sustained.value(),0);sustained.cleanup();
const keys=fixture();keys.scroll(2200);keys.step(850);keys.listeners.keydown({key:'End'});keys.step(80);assert.ok(keys.value()>0);keys.listeners.keydown({key:'ArrowUp'});keys.scroll(2000);keys.step(800);assert.equal(keys.win.scrollY,2000);assert.equal(keys.value(),0);keys.cleanup();
const motion=fixture(true);motion.scroll(2200);motion.wheel();motion.step(1000);assert.equal(motion.value(),0);motion.cleanup();
const change=fixture();change.scroll(2200);change.step(80);change.reduced.matches=true;change.reduced.change();assert.equal(change.value(),0);change.cleanup();
const zoom=fixture();zoom.scroll(2200);zoom.step(850);zoom.wheel(120,{ctrlKey:true});zoom.step(80);assert.equal(zoom.value(),0);zoom.cleanup();
const css=fs.readFileSync('src/components/site-footer.css','utf8');assert.ok(css.includes('margin-top:calc(-1 * var(--root-space))'));assert.ok(css.includes('top:var(--root-space)'));assert.ok(css.includes('html.footer-at-end{overscroll-behavior-y:none}'));assert.ok(!source.includes('scrollTo(')&&!source.includes('scrollBy('));
console.log('Passed: immediate bounded repeated pulses; 30/60/120 Hz motion; wheel/touch/keyboard; held touch and sustained input; native scrollbar unchanged; mobile address-bar resize; reduced motion; zoom; cleanup; no permanent soil range.');
