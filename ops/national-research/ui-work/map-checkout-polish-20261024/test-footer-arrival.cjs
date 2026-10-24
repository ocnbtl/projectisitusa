const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('C:/Code/project-isitusa/node_modules/typescript');
const code = ts.transpileModule(fs.readFileSync('src/components/footer-grove.tsx','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
function fixture(reduce=false, observed=true) {
  const listeners = {}, styles = {}, frames = new Map(); let now=0, id=0, cleanup;
  const reduced={matches:reduce,addEventListener(){},removeEventListener(){}};
  const element={style:{setProperty(k,v){styles[k]=v}},get offsetHeight(){return 500+parseFloat(styles['--root-reveal']||0)},getBoundingClientRect(){return {top:2500-win.scrollY,bottom:3000+parseFloat(styles['--root-reveal']||0)-win.scrollY}}};
  const html={get scrollHeight(){return 3000+parseFloat(styles['--root-reveal']||0)},classList:{toggle(){},contains(){return false},remove(){}},style:{setProperty(){},removeProperty(){}}};
  const win={scrollY:0,innerHeight:800,matchMedia:()=>reduced,addEventListener(k,f){listeners[k]=f},removeEventListener(k){delete listeners[k]},scrollBy({top}){this.scrollY+=top;listeners.scroll?.()}};
  const context={exports:{},require(name){if(name==='react')return {useRef:()=>({current:element}),useEffect(fn){cleanup=fn()}};if(name==='react/jsx-runtime')return {jsx(){},jsxs(){}};throw Error(name)},window:win,document:{documentElement:html,querySelector:()=>({content:'#ffffff'})},performance:{now:()=>now},getComputedStyle:()=>({getPropertyValue:k=>({'--grove-ink':'#005b44','--soil-base':'#47392b','--soil-depth':'190px','--background':'#edf3ef'}[k])}),requestAnimationFrame(fn){frames.set(++id,fn);return id},cancelAnimationFrame(n){frames.delete(n)},IntersectionObserver:class{constructor(fn){this.fn=fn}observe(){this.fn([{isIntersecting:observed}])}disconnect(){}},MutationObserver:class{observe(){}disconnect(){}},HTMLElement:class{}};
  vm.runInNewContext(code,context);context.exports.FooterGrove();
  return {styles,win,listeners,reduced,cleanup:()=>cleanup(),step(ms){for(let t=0;t<ms;t+=16){now+=16;const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(now))}},arrive(){win.scrollY=2200;listeners.scroll()},frames};
}
const f=fixture(); f.arrive();f.step(480);
assert.ok(parseFloat(f.styles['--root-reveal'])>175,'Normal scroll arrival reveals roots without any wheel event');
assert.ok(Math.abs(f.win.scrollY-(2200+parseFloat(f.styles['--root-reveal'])))<1,'Landscape stays bottom anchored');
f.step(2600);assert.equal(f.styles['--root-reveal'],'0px');assert.equal(f.frames.size,0,'No self-triggering loop');
f.win.scrollY=1500;f.listeners.scroll();f.arrive();f.step(320);assert.ok(parseFloat(f.styles['--root-reveal'])>150,'Leaving and returning rearms the effect');
f.listeners.wheel({ctrlKey:false,deltaY:-100});f.win.scrollY-=100;const departed=f.win.scrollY;f.step(1600);assert.equal(f.win.scrollY,departed,'Upward movement is never pulled back down');f.cleanup();
const r=fixture(true);r.arrive();r.step(1200);assert.equal(r.frames.size,0,'Reduced motion does not animate');r.cleanup();
const delayed=fixture(false,false);delayed.arrive();delayed.step(480);assert.ok(parseFloat(delayed.styles['--root-reveal'])>175,'Direct End arrival works before IntersectionObserver catches up');delayed.cleanup();
console.log('Footer checks passed: scroll-only arrival, full reveal, stable return, rearm, upward freedom, reduced motion.');
