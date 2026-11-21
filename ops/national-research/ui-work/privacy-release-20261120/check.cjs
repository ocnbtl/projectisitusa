const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ts=require('C:/Code/project-isitusa/node_modules/typescript');
const base=process.cwd(),cache=new Map();
function load(file){file=path.resolve(base,file);if(cache.has(file))return cache.get(file).exports;const mod={exports:{}};cache.set(file,mod);const input=fs.readFileSync(file,'utf8');const output=ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true});assert.equal(output.diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,file);new Function('require','module','exports',output.outputText)(name=>name.startsWith('.')?load(path.resolve(path.dirname(file),name+'.ts')):require(name),mod,mod.exports);return mod.exports;}
(async()=>{
const stored=new Map(), sent=[];
const loc={origin:'https://isitusa.com',hostname:'isitusa.com',pathname:'/about',search:'',hash:''};
global.window={location:loc,innerWidth:390,dispatchEvent(){},setTimeout,clearTimeout,setTimeout,clearTimeout};global.location=loc;
global.localStorage={getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
Object.defineProperty(global,'navigator',{configurable:true,value:{doNotTrack:'0',globalPrivacyControl:false}});
let hasForm=false,script;
global.document={querySelector:()=>hasForm?{}:null,createElement:()=>({remove(){}}),head:{appendChild:n=>{script=n;}}};
global.fetch=async(url,options)=>{if(url==="/measurement/default")return new Response(null,{status:204,headers:{"X-Isitusa-Measurement-Policy":"eligible","X-Isitusa-Measurement-Defaults":"111"}});sent.push({url,body:options?.body});return new Response(null,{status:403});};
const mask=load('src/lib/ui/replay-public-text.ts').maskReplayText;assert.equal(mask('Brand kit.'),'Brand kit.');for(const text of ['synthetic@example.invalid','CANARY_PRIVATE','123 Test Street','555-123-4567','https://example.invalid/?token=private'])assert.ok(!mask(text).includes(text));assert.notEqual(mask('Brand kit.',{closest:()=>({})}),'Brand kit.');
const t=load('src/lib/ui/telemetry.ts'),r=load('src/lib/ui/session-replay.ts'),g=load('src/lib/ui/google-measurement.ts');
assert.equal(t.analyticsChoice(),null);assert.equal(t.replayChoice(),false);
t.track('$pageview');assert.equal(sent.length,0);
for(const p of ['/admin','/auth/confirm','/account','/contact','/uploads/a','/privacy','/report','/join','/volunteer','/support','/support/refund','/checkout']){assert.equal(t.analyticsRoute(p),null,p);assert.equal(g.googlePage(p),null,p);assert.equal(r.replayRouteAllowed(p),false,p);}
for(const p of ['/','/research','/species','/species/test','/about/extra'])assert.equal(r.replayRouteAllowed(p),false,p);
for(const p of ['/about','/brand','/approach','/data-sources','/credits'])assert.equal(r.replayRouteAllowed(p),true,p);
await g.resolveGoogleAnalyticsDefault();
stored.set(t.ANALYTICS_CHOICE_KEY,'no');assert.equal(t.analyticsChoice(),'no');assert.equal(t.replayChoice(),false);
t.setAnalyticsChoice('no',true);assert.equal(t.analyticsChoice(),'no');assert.equal(t.replayChoice(),true,'independent explicit replay');
t.setAnalyticsChoice('yes',false);assert.equal(t.replayChoice(),false,'site choice does not enable replay');
t.track('$pageview',{email:'synthetic@example.invalid',search:'CANARY_PRIVATE',latitude:39,token:'CANARY_TOKEN',outcome:'found'});
assert.equal(sent.length,1);assert.ok(!JSON.stringify(sent).includes('CANARY'));assert.ok(!JSON.stringify(sent).includes('synthetic@'));
t.setAnalyticsChoice('yes',true);hasForm=true;assert.equal(r.replayAllowed(),false);hasForm=false;
loc.search='?secret=CANARY';assert.equal(r.replayAllowed(),false);loc.search='';loc.hash='#CANARY';assert.equal(r.replayAllowed(),false);loc.hash='';
let starts=0,stops=0;
await (async()=>{const pending=r.syncReplay();const config=window.posthog._i[0][1];assert.equal(config.session_recording.maskTextSelector,'*');assert.equal(config.session_recording.maskAllInputs,true);assert.equal(config.session_recording.recordBody,false);assert.equal(config.enable_heatmaps,false);t.setAnalyticsChoice('no',false);r.stopReplay();config.loaded({startSessionRecording(){starts++},stopSessionRecording(){stops++},set_config(){},opt_in_capturing(){},opt_out_capturing(){}});await pending;assert.equal(starts,0,'withdraw while loading');const before=sent.length;t.track('$pageview');assert.equal(sent.length,before);navigator.globalPrivacyControl=true;t.setAnalyticsChoice('yes',true);assert.equal(t.analyticsChoice(),'no');assert.equal(t.replayChoice(),false);navigator.globalPrivacyControl=false;navigator.doNotTrack='1';assert.equal(t.analyticsChoice(),'no');assert.equal(t.replayChoice(),false);navigator.doNotTrack='0';stored.set('isitusa.analytics-exclude.v1','yes');t.setAnalyticsChoice('yes',true);assert.equal(t.analyticsChoice(),'no','staff aggregate exclusion');assert.equal(t.replayChoice(),false,'staff replay exclusion');stored.delete('isitusa.analytics-exclude.v1');loc.search='?analytics=off';assert.equal(t.replayChoice(),false);assert.equal(stored.get('isitusa.analytics-exclude.v1'),'yes','staff query marker persists');loc.search='';console.log(JSON.stringify({status:'PASS',coverage:['fresh defaults','saved declines','independent explicit controls','12 sensitive route families','5 reviewed replay routes;3 heatmap routes','runtime form guard','URL query/hash denial','synthetic aggregate payload sanitization','delayed SDK withdrawal','GPC','DNT'],network:'intercepted in memory; no provider sends',replayPayload:'SDK configuration only; browser outgoing replay not verified'}));})().catch(e=>{console.error(e);process.exitCode=1;});
for(const f of ['src/components/site-analytics.tsx','src/components/site-footer.tsx','app/privacy/page.tsx']){const d=ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true}).diagnostics;assert.equal(d.filter(x=>x.category===ts.DiagnosticCategory.Error).length,0,f);}

})().catch(e=>{console.error(e);process.exitCode=1;});
