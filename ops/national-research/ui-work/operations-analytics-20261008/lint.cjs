const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root='C:/Code/project-isitusa';
const {loadESLint}=require(root+'/node_modules/eslint');
(async()=>{
 const files=cp.execFileSync('git',['diff','--name-only','5701c3db18050083c19a3d892430ce28313d6ac3','--','app','src','next.config.ts'],{encoding:'utf8'}).trim().split('\n').filter(p=>/\.[jt]sx?$/.test(p));
 const ESLint=await loadESLint({useFlatConfig:false});
 const eslint=new ESLint({cwd:root,cache:false});let errors=0,warnings=0;
 for(const p of files){
  for(const r of await eslint.lintText(fs.readFileSync(p,'utf8'),{filePath:path.join(root,p)})){
   errors+=r.errorCount;warnings+=r.warningCount;
   for(const m of r.messages)console.log(`${p}:${m.line} ${m.severity===2?'ERROR':'WARN'} ${m.ruleId}: ${m.message}`);
  }
 }
 console.log(JSON.stringify({files:files.length,errors,warnings,cache:false,installs:0}));
 if(errors)process.exitCode=1;
})().catch(e=>{console.error(e.message);process.exitCode=1;});
