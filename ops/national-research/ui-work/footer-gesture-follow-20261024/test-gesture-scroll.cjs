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
 const element={closest:()=>null,querySelector:()=>world,getBoundingClientRect(){return {top:2500-win.scrollY,bottom:3000-win.scrollY}},style:{setProperty(k,v){values.set(k,v);if(k==='--root-reveal')samples.push({time:now,value:parseFloat(v)})},removeProperty(k){values.delete(k)}},setAttribute(k,v){attrs.set(k,v)},removeAttribute(k){attrs.delete(k)}};
 const html={scrollHeight:3000,classList:{toggle(){},contains(){return false},remove(){}},style:{setProperty(){},removeProperty(){}}};
 const win={scrollY:0,innerHeight:800,innerWidth:1200,matchMedia:()=>reduced,addEventListener(k,f){listeners[k]=f},removeEventListener(k){delete listeners[k]},scrollTo(){throw Error('Must never move native scroll position')},scrollBy(){throw Error('Must never compensate page scrolling')}};
 const context={exports:{},Element,require(name){if(name==='react')return {useRef:()=>({current:element}),useEffect(fn){cleanup=fn()}};if(name==='react/jsx-runtime')return {jsx(){},jsxs(){}};throw Error(name)},window:win,document:{documentElement:html,querySelector:()=>({content:'#ffffff'})},performance:{now:()=>now},getComputedStyle:()=>({getPropertyValue:k=>({'--grove-ink':'#00583b','--soil-base':'#d5d9bd','--soil-depth':'180px','--background':'#edf3ef'}[k])}),requestAnimationFrame(fn){frames.set(++id,fn);return id},cancelAnimationFrame(n){frames.delete(n)},IntersectionObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}}};
 vm.runInNewContext(code,context);context.exports.FooterGrove();
 return {win,listeners,reduced,frames,values,samples,attrs,cleanup:()=>cleanup(),value:()=>parseFloat(values.get('--root-reveal'))||0,scroll(y){win.scrollY=y;listeners.scroll()},wheel(deltaY=120,extra={}){listeners.wheel({deltaY,deltaMode:0,...extra})},step(ms,frame=16){for(let t=0;t<ms;t+=frame){now+=frame;const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(now))}},touch(y,kind='touchmove'){listeners[kind]({touches:[{clientY:y}]})}};
}
for(const frame of [8,16,32]){
 const f=fixture(); f.scroll(2000);f.wheel(100);f.step(200,frame);assert.equal(f.value(),0);
 f.scroll(2200);f.step(80,frame);assert.ok(f.value()>0);f.step(1600,frame);assert.equal(f.value(),0);
 for(let i=0;i<3;i++){f.wheel(120);f.step(64,frame);assert.ok(f.value()>0);f.step(1600,frame);assert.equal(f.value(),0)}
 assert.equal(f.win.scrollY,2200);assert.ok(Math.max(...f.samples.map(x=>x.value))<=240);
 f.cleanup();assert.equal(f.frames.size,0);assert.equal(Object.keys(f.listeners).length,0);
}
const touch=fixture(false,300);touch.scroll(2200);touch.step(1600);touch.touch(700,'touchstart');touch.touch(350);touch.step(1200);assert.ok(touch.value()>239,'Full 240px root artwork visible while held');touch.step(3000);assert.ok(touch.value()>239,'Stationary touch stays open');touch.listeners.resize();assert.ok(touch.value()>239,'Address bar resizing preserves hold');touch.listeners.touchend();touch.step(1600);assert.equal(touch.value(),0,'Release closes');
touch.touch(600,'touchstart');touch.touch(500);touch.step(1000);assert.ok(touch.value()>70);touch.listeners.touchcancel();touch.step(1600);assert.equal(touch.value(),0);touch.cleanup();
const wheel=fixture();wheel.scroll(2200);wheel.step(1600);for(let i=0;i<30;i++){wheel.wheel(24);wheel.step(48)}assert.ok(wheel.value()>239,'Continuous scrolling keeps full roots visible');wheel.step(1600);assert.equal(wheel.value(),0);wheel.cleanup();
function speedRun(gap){const f=fixture();f.scroll(2200);f.step(1600);f.touch(700,'touchstart');for(let y=650;y>=350;y-=50){f.step(gap);f.touch(y)}f.step(800);assert.ok(f.value()>239);f.listeners.touchend();f.step(240);const remaining=f.value();f.step(2000);assert.equal(f.value(),0);f.cleanup();return remaining}
const slow=speedRun(80),fast=speedRun(16);assert.ok(fast<slow*.65,`Fast gesture must return faster: ${fast} vs ${slow}`);
const keys=fixture();keys.scroll(2200);keys.step(1600);keys.listeners.keydown({key:'End'});keys.step(1600);assert.ok(keys.value()>95);keys.listeners.keyup({key:'End'});keys.step(1600);assert.equal(keys.value(),0);keys.cleanup();
const mouse=fixture();mouse.scroll(2200);mouse.step(1600);mouse.listeners.mousedown({button:1,clientY:300});mouse.listeners.mousemove({clientY:450});mouse.step(2000);assert.ok(mouse.value()>239);mouse.listeners.mouseup({button:1});mouse.step(1600);assert.equal(mouse.value(),0);mouse.cleanup();
const blur=fixture();blur.scroll(2200);blur.touch(700,'touchstart');blur.touch(350);blur.step(1000);blur.listeners.blur();blur.step(1600);assert.equal(blur.value(),0);blur.cleanup();
const motion=fixture(true);motion.scroll(2200);motion.wheel();motion.step(1000);assert.equal(motion.value(),0);motion.cleanup();
const change=fixture();change.scroll(2200);change.step(80);change.reduced.matches=true;change.reduced.change();assert.equal(change.value(),0);change.cleanup();
const zoom=fixture();zoom.scroll(2200);zoom.step(1600);zoom.wheel(120,{ctrlKey:true});zoom.step(80);assert.equal(zoom.value(),0);zoom.cleanup();
const css=fs.readFileSync('src/components/site-footer.css','utf8');assert.ok(css.includes('--root-space:240px'));assert.ok(css.includes('margin-top:calc(-1 * var(--root-space))'));assert.ok(!source.includes('scrollTo(')&&!source.includes('scrollBy('));
console.log(`Passed gesture-follow: full root depth; stationary touch, continuous wheel, middle-button and keyboard holds; release; velocity-dependent return (${fast.toFixed(1)}px fast vs ${slow.toFixed(1)}px slow after 240ms); repeated gestures at 30/60/120Hz; reduced motion; blur/cancel; resize; cleanup; unchanged native scroll.`);