const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('C:/Code/project-isitusa/node_modules/typescript');
const code = ts.transpileModule(fs.readFileSync('src/components/footer-grove.tsx','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function fixture(reduce=false) {
 const listeners={}, frames=new Map(), timers=new Map(), writes=[]; let now=0,id=0,cleanup;
 const reduced={matches:reduce,addEventListener(k,f){this.change=f},removeEventListener(){}};
 const world={getBoundingClientRect(){return {top:2500-win.scrollY,bottom:3000-win.scrollY}}};
 const element={querySelector:()=>world,getBoundingClientRect(){return {top:2500-win.scrollY,bottom:3190-win.scrollY}}};
 const html={scrollHeight:3190,classList:{toggle(){},contains(){return false},remove(){}},style:{setProperty(){},removeProperty(){}}};
 const win={scrollY:0,innerHeight:800,matchMedia:()=>reduced,addEventListener(k,f){listeners[k]=f},removeEventListener(k){delete listeners[k]},setTimeout(fn,ms){timers.set(++id,{fn,at:now+ms});return id},clearTimeout(n){timers.delete(n)},scrollTo({top}){writes.push(top);this.scrollY=top;listeners.scroll?.()}};
 const context={exports:{},require(name){if(name==='react')return {useRef:()=>({current:element}),useEffect(fn){cleanup=fn()}};if(name==='react/jsx-runtime')return {jsx(){},jsxs(){}};throw Error(name)},window:win,document:{documentElement:html,querySelector:()=>({content:'#ffffff'})},performance:{now:()=>now},getComputedStyle:()=>({getPropertyValue:k=>({'--grove-ink':'#00583b','--soil-base':'#d5d9bd','--soil-depth':'180px','--background':'#edf3ef'}[k])}),requestAnimationFrame(fn){frames.set(++id,fn);return id},cancelAnimationFrame(n){frames.delete(n)},IntersectionObserver:class{constructor(fn){this.fn=fn}observe(){this.fn()}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}}};
 vm.runInNewContext(code,context);context.exports.FooterGrove();
 return {win,listeners,reduced,writes,frames,timers,cleanup:()=>cleanup(),scroll(y){win.scrollY=y;listeners.scroll()},step(ms){for(let t=0;t<ms;t+=16){now+=16;for(const [key,timer] of [...timers])if(timer.at<=now){timers.delete(key);timer.fn()}const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(now))}}};
}
const f=fixture();
for(let y=2100;y<=2390;y+=10){f.scroll(y);f.step(32);assert.equal(f.win.scrollY,y)}
assert.equal(f.writes.length,0,'Slow natural scroll is never repositioned');
f.step(900);assert.equal(f.writes.length,0,'Return waits until scrolling is idle');
f.step(1200);assert.equal(f.win.scrollY,2200,'Returns to the forest edge');
assert.ok(f.writes.length>40,'Return progresses over many frames');
for(let i=1;i<f.writes.length;i++){assert.ok(f.writes[i]<=f.writes[i-1],'Return is monotonic');assert.ok(f.writes[i-1]-f.writes[i]<8,'No abrupt frame jumps')}
const count=f.writes.length;f.scroll(2390);f.step(3000);assert.equal(f.writes.length,count,'No repeated autoscroll bounce during same visit');
f.scroll(1900);f.scroll(2390);f.step(1400);assert.ok(f.writes.length>count,'New footer visit rearms idle return');
f.listeners.wheel();f.scroll(f.win.scrollY-25);const interrupted=f.win.scrollY;f.step(2000);assert.equal(f.win.scrollY,interrupted,'Wheel input immediately takes control');f.cleanup();assert.equal(f.frames.size,0);assert.equal(f.timers.size,0);
const touch=fixture();touch.listeners.pointerdown();touch.scroll(2390);touch.step(3000);assert.equal(touch.writes.length,0,'Held touch or scrollbar drag never snaps back');touch.listeners.pointerup();touch.step(2200);assert.equal(touch.win.scrollY,2200);touch.cleanup();
const fast=fixture();fast.scroll(2390);fast.step(16);assert.equal(fast.writes.length,0,'Fast End/autoscroll arrival has no forced jump');fast.step(1200);fast.scroll(2350);const y=fast.win.scrollY;fast.step(1800);assert.equal(fast.win.scrollY,y,'External autoscroll interrupts return');fast.cleanup();
const motion=fixture(true);motion.scroll(2390);motion.step(3000);assert.equal(motion.writes.length,0,'Reduced motion does not animate');motion.cleanup();
const css=fs.readFileSync('src/components/site-footer.css','utf8');assert.ok(css.includes('height:calc(var(--landscape-height) + var(--root-space))'));assert.ok(css.includes('@media(prefers-reduced-motion:reduce){.footer-grove{--root-space:0px}}'));
console.log('Passed: native slow/fast scrolling, stable height, idle delay, smooth return, no repeat loop, wheel/autoscroll/touch interruption, reduced motion and cleanup.');
