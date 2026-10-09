const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root='C:/Code/project-isitusa',stage=process.cwd(),base='16e5487104',ts=require(root+'/node_modules/typescript');
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
const roots=['app/about/page.tsx','src/components/admin/workspace-preview.tsx','src/components/admin/auth-confirm.tsx','app/admin/preview/page.tsx','src/components/species-occurrence-evidence.tsx','src/components/site-analytics.tsx','src/components/site-footer.tsx','src/components/admin/workspace.tsx','src/components/species-directory.tsx','src/components/map-explorer.tsx','src/components/county-card-download.tsx','src/components/county-evidence.tsx','src/components/participation/join-form.tsx','src/components/participation/report-form.tsx','src/components/participation/support-form.tsx','src/components/research-control-center.tsx','app/api/contributions/checkout/route.ts','app/terms/page.tsx','app/privacy/page.tsx','next.config.ts'];
const program=ts.createProgram(roots.map(p=>root+'/'+p),options,host);const diagnostics=ts.getPreEmitDiagnostics(program);
for(const d of diagnostics)console.log(ts.flattenDiagnosticMessageText(d.messageText,'\n')+(d.file?' '+d.file.fileName+':'+(d.file.getLineAndCharacterOfPosition(d.start).line+1):''));
if(diagnostics.length)process.exit(1);

console.log('Type check passed');
