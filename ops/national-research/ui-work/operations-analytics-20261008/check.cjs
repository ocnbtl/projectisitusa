const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root='C:/Code/project-isitusa',stage=process.cwd(),base='5701c3db18050083c19a3d892430ce28313d6ac3',ts=require(root+'/node_modules/typescript');
const git=(...args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20000000});
const tracked=new Set(git('ls-tree','-r','--name-only',base,'src','app','next.config.ts','tsconfig.json','next-env.d.ts').split('\n'));
const sourceCache=new Map();
function read(p){const rel=path.relative(root,p).replaceAll('\\','/');if(!rel.startsWith('../')&&!rel.startsWith('node_modules/')){
 if(fs.existsSync(stage+'/'+rel)&&fs.statSync(stage+'/'+rel).isFile())return fs.readFileSync(stage+'/'+rel,'utf8');
 if(tracked.has(rel)){if(!sourceCache.has(rel))sourceCache.set(rel,git('show',base+':'+rel));return sourceCache.get(rel);}
 }return ts.sys.readFile(p);}
const raw=ts.parseConfigFileTextToJson('tsconfig.json',git('show',base+':tsconfig.json')).config;
const options=ts.convertCompilerOptionsFromJson({...raw.compilerOptions,incremental:false,noEmit:true},root).options;
const host=ts.createCompilerHost(options);host.readFile=read;host.fileExists=p=>read(p)!==undefined;
host.getSourceFile=(p,lang)=>{const text=read(p);return text===undefined?undefined:ts.createSourceFile(p,text,lang);};
const roots=['app/admin/preview/page.tsx','src/components/species-occurrence-evidence.tsx','src/components/site-analytics.tsx','src/components/site-footer.tsx','src/components/admin/workspace.tsx','src/components/species-directory.tsx','src/components/map-explorer.tsx','src/components/county-card-download.tsx','src/components/county-evidence.tsx','src/components/participation/join-form.tsx','src/components/participation/report-form.tsx','src/components/participation/support-form.tsx','src/components/research-control-center.tsx','app/api/contributions/checkout/route.ts','app/terms/page.tsx','app/privacy/page.tsx','next.config.ts'];
const program=ts.createProgram(roots.map(p=>root+'/'+p),options,host);const diagnostics=ts.getPreEmitDiagnostics(program);
for(const d of diagnostics)console.log(ts.flattenDiagnosticMessageText(d.messageText,'\n')+(d.file?' '+d.file.fileName+':'+(d.file.getLineAndCharacterOfPosition(d.start).line+1):''));
if(diagnostics.length)process.exit(1);
const moduleCache=new Map(),nativeRequire=require('node:module').createRequire(root+'/package.json');
function load(rel){if(moduleCache.has(rel))return moduleCache.get(rel).exports;const m={exports:{}};moduleCache.set(rel,m);const source=read(root+'/'+rel);const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',out)(name=>{if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,p)=>p})};if(name.startsWith('@/')||name.startsWith('.')){const b=name.startsWith('@/')?'src/'+name.slice(2):path.posix.join(path.posix.dirname(rel),name);for(const e of ['.ts','.tsx'])if(read(root+'/'+b+e)!==undefined)return load(b+e);}return nativeRequire(name);},m,m.exports);return m.exports;}

const React=nativeRequire('react'),{renderToStaticMarkup}=nativeRequire('react-dom/server');
const {WorkspaceFrame,WorkspaceOverview}=load('src/components/admin/workspace-frame.tsx');
const reviewOnly=p=>p==='review';
const frame=renderToStaticMarkup(React.createElement(WorkspaceFrame,{name:'Reviewer',owner:false,tab:'overview',can:reviewOnly,loading:false,refreshedAt:null,onTab:()=>{},onRefresh:()=>{},onSignOut:()=>{}},React.createElement(WorkspaceOverview,{counts:{pending:7,confirmed:124,finance:16},can:reviewOnly,onTab:()=>{}})));
assert.ok(frame.includes('Sightings')&&!frame.includes('Email audience')&&!frame.includes('Contributions')&&!frame.includes('Connections'),'volunteer frame hides higher-access sections');
assert.ok(!frame.includes('confirmed and not suppressed')&&!frame.includes('recorded receipts'),'overview does not disclose inaccessible counts');
assert.ok(frame.includes('awaiting review'),'volunteer keeps actionable review queue');
const unknown=renderToStaticMarkup(React.createElement(WorkspaceOverview,{counts:{},can:reviewOnly,onTab:()=>{}}));
assert.ok(unknown.includes('Unavailable'),'missing count is not zero');
console.log(JSON.stringify({workspacePresentationAssertions:4,privateBackendAccess:'not exercised by presentation tests'}));

let checks=0;const check=(value,message)=>{assert.ok(value,message);checks++;};
const t=load('src/lib/ui/telemetry.ts');
for(const route of ['/admin','/admin/team','/auth/confirm','/preferences'])check(t.analyticsRoute(route)===null,'private route '+route);
check(t.analyticsRoute('/species/private-value')==='/species/[species]','profile URLs normalized');
check(t.analyticsRoute('/someone@example.com')==='/not-found','unknown paths normalized');
check(JSON.stringify(t.safeProperties({email:'private@example.com',q:'secret',latitude:20,token:'private',outcome:'found',county_id:'01001'}))===JSON.stringify({outcome:'found',county_id:'01001'}),'drop arbitrary sensitive properties');
check(Object.keys(t.safeProperties({county_id:'12345@example.com',outcome:'private',surface:'private'})).length===0,'reject malformed permitted properties');
let captures=[];const saved={window:global.window,navigator:Object.getOwnPropertyDescriptor(global,'navigator'),localStorage:global.localStorage,fetch:global.fetch};
const data=new Map();global.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
Object.defineProperty(global,'navigator',{configurable:true,value:{doNotTrack:'0'}});
global.window={location:{hostname:'isitusa.com',pathname:'/species',search:'?q=PRIVATE',hash:'#token=PRIVATE'},innerWidth:1200,dispatchEvent:()=>{}};
global.fetch=async(url,options)=>{captures.push(JSON.parse(options.body));return new Response('{}');};
try {
 t.track('$pageview');check(captures.length===0,'no capture before consent');
 t.setAnalyticsChoice('yes');t.track('$pageview',{email:'PRIVATE',q:'PRIVATE'});
 check(captures.length===1,'consented capture');check(!JSON.stringify(captures[0]).includes('PRIVATE'),'no raw URL, token or input fields');
 check(captures[0].properties.$process_person_profile===false,'anonymous event');
 global.window.location.pathname='/admin';t.track('$pageview');check(captures.length===1,'private navigation blocked');
 global.window.location.pathname='/join';global.navigator.globalPrivacyControl=true;t.track('signup_requested');check(captures.length===1,'GPC respected');global.navigator.globalPrivacyControl=false;
 global.window.location.hostname='preview.vercel.app';t.track('$pageview');check(captures.length===1,'preview excluded');global.window.location.hostname='isitusa.com';
 t.setAnalyticsChoice('no');t.track('$pageview');check(captures.length===1&&!data.has('isitusa.analytics-id.v1'),'withdrawal removes identifier and stops capture');
}finally{global.window=saved.window;global.localStorage=saved.localStorage;global.fetch=saved.fetch;if(saved.navigator)Object.defineProperty(global,'navigator',saved.navigator);else delete global.navigator;}
console.log(JSON.stringify({typecheck:'PASS no emit',privacyAssertions:checks,externalCalls:0,localBuilds:0}));
