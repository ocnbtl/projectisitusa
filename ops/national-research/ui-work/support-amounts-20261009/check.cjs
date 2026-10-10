const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root='C:/Code/project-isitusa',stage=process.cwd(),base='6986cac8b7',ts=require(root+'/node_modules/typescript');
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
const roots=['src/components/participation/support-form.tsx','app/about/page.tsx','app/api/contributions/checkout/route.ts','app/terms/page.tsx','app/privacy/page.tsx','next.config.ts'];
const program=ts.createProgram(roots.map(p=>root+'/'+p),options,host);const diagnostics=ts.getPreEmitDiagnostics(program);
for(const d of diagnostics)console.log(ts.flattenDiagnosticMessageText(d.messageText,'\n')+(d.file?' '+d.file.fileName+':'+(d.file.getLineAndCharacterOfPosition(d.start).line+1):''));
if(diagnostics.length)process.exit(1);
const moduleCache=new Map(),nativeRequire=require('node:module').createRequire(root+'/package.json');
function load(rel){if(moduleCache.has(rel))return moduleCache.get(rel).exports;const m={exports:{}};moduleCache.set(rel,m);const source=read(root+'/'+rel);const out=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',out)(name=>{if(name.endsWith('.css'))return {__esModule:true,default:new Proxy({},{get:(_,p)=>p})};if(name.startsWith('@/')||name.startsWith('.')){const b=name.startsWith('@/')?'src/'+name.slice(2):path.posix.join(path.posix.dirname(rel),name);for(const e of ['.ts','.tsx'])if(read(root+'/'+b+e)!==undefined)return load(b+e);}return nativeRequire(name);},m,m.exports);return m.exports;}
let checks=0;function check(value,label){assert.ok(value,label);checks++;}
const {donationAmount:a,customerPortal:p,checkoutParameters:c}=load('src/lib/ui/donation-checkout.ts');
for(const v of ['',0,'0','4.99','1000.01','1e2','-10','NaN','25.001',' 25','25 ',null,{},'Infinity'])check(a(v)===null,'reject amount '+String(v));
check(a('5')===500&&a('1000')===100000&&a('25.50')===2550,'valid dollar conversion');
for(const v of ['https://evil.test/p/login/abc','https://billing.stripe.com.evil.test/p/login/abc','https://billing.stripe.com/p/login/test_abc','javascript:alert(1)'])check(p(v)===null,'reject portal');
check(p('https://billing.stripe.com/p/login/abc123')!==null,'valid portal');
check(c(2500,'monthly').get('mode')==='subscription'&&c(2500,'monthly').get('line_items[0][price_data][recurring][interval]')==='month','monthly parameters');
check(c(2500,'once').get('mode')==='payment'&&!c(2500,'once').has('line_items[0][price_data][recurring][interval]'),'one-time parameters');
const route=load('app/api/contributions/checkout/route.ts');
async function run(){
 const savedFetch=global.fetch;const keys=['STRIPE_SECRET_KEY','NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY','TURNSTILE_SECRET_KEY','NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY','STRIPE_CUSTOMER_PORTAL_URL'];const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 let calls=[];let accountId='acct_1ULqjk0sMVuUFG7H';let turnstile=true;
 global.fetch=async(url,options)=>{calls.push({url,options});if(url.includes('turnstile'))return Response.json({success:turnstile,action:'donation_checkout',hostname:'isitusa.com'});if(url.endsWith('/account'))return Response.json({id:accountId,charges_enabled:true});return Response.json({livemode:true,client_secret:'cs_live_fixture_secret_fixture'});};
 const request=(input={},origin='https://isitusa.com')=>new Request('https://isitusa.com/api/contributions/checkout',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({amount:'25',frequency:'once',token:'fixture',attempt:'11111111-1111-4111-8111-111111111111',consent:true,...input})});
 try{
 for(const k of keys)delete process.env[k];check((await route.GET().json()).available===false,'closed without keys');check((await route.POST(request())).status===503&&calls.length===0,'disabled creates no provider request');
 Object.assign(process.env,{STRIPE_SECRET_KEY:'rk_live_fixture',NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:'pk_live_fixture',TURNSTILE_SECRET_KEY:'fixture',NEXT_PUBLIC_PARTICIPATION_TURNSTILE_KEY:'fixture'});
 check((await route.GET().json()).monthly===false,'monthly requires portal');
 for(const input of [{amount:'1'},{amount:'1001'},{frequency:'weekly'},{consent:false},{website:'bot'},{token:''},{attempt:'bad'}])check((await route.POST(request(input))).status===400,'validation before providers');
 check((await route.POST(request({},'https://evil.test'))).status===403&&calls.length===0,'origin rejected before providers');
 check((await route.POST(request({frequency:'monthly'}))).status===503,'unconfigured monthly closed');
 process.env.STRIPE_CUSTOMER_PORTAL_URL='https://billing.stripe.com/p/login/abc123';check((await route.GET().json()).monthly===true,'configured monthly available');
 turnstile=false;check((await route.POST(request())).status===400&&calls.length===1,'invalid challenge never reaches Stripe');turnstile=true;calls=[];
 accountId='acct_wrong';check((await route.POST(request())).status===502&&calls.length===2,'wrong recipient never creates session');accountId='acct_1ULqjk0sMVuUFG7H';calls=[];
 for(const frequency of ['once','monthly']){const response=await route.POST(request({frequency}));check(response.status===200,'valid checkout opens');check(response.headers.get('cache-control')==='no-store','secret not cached');const payload=calls.at(-1).options;check(payload.body.get('mode')===(frequency==='once'?'payment':'subscription'),'server chooses mode');check(payload.body.get('line_items[0][price_data][unit_amount]')==='2500','server chooses amount');check(payload.headers['Idempotency-Key'].startsWith('isitusa-'),'retry idempotency');}
 const React=nativeRequire('react'),render=nativeRequire('react-dom/server').renderToStaticMarkup;const html=render(React.createElement(load('src/components/participation/support-form.tsx').SupportForm));check(html.includes('Support the mission')&&html.includes('Protect our planet.'),'requested heading');check(!html.includes('everyday work')&&!html.includes('Help make local knowledge'),'old copy removed');check(!html.includes('https://buy.stripe.com/'),'hosted checkout removed');
 const report={typecheck:'PASS no emit',assertions:checks,externalCalls:0,realPayments:0,localBuilds:0,at:new Date().toISOString()};fs.writeFileSync(stage+'/ops/national-research/ui-work/support-amounts-20261009/checks.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{global.fetch=savedFetch;for(const k of keys){if(saved[k]===undefined)delete process.env[k];else process.env[k]=saved[k];}}
}run().catch(e=>{console.error(e);process.exit(1);});

