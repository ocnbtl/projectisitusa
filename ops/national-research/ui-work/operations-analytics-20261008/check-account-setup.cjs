const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('C:/Code/project-isitusa/node_modules/typescript');
let states=[],cursor=0,effects=[],calls={verify:0,save:0,signOut:0};
const React={useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v;}];},useRef:initial=>{const i=cursor++;return states[i]??(states[i]={current:initial});},useEffect:fn=>{effects.push(fn);}};
const fake={auth:{verifyOtp:async input=>{calls.verify++;assert.equal(input.token_hash,'fixture-token');return {error:null};},updateUser:async input=>{calls.save++;assert.equal(input.password,'a fictional passphrase');return {error:null};},signOut:async()=>{calls.signOut++;return {error:null};}}};
const Workspace=()=>null,AccountFrame=()=>null;
function load(file,imports){const m={exports:{}};const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;new Function('require','module','exports',output)(name=>{if(name in imports)return imports[name];if(name==='react/jsx-runtime')return require('C:/Code/project-isitusa/node_modules/react/jsx-runtime');if(name.endsWith('.css'))return {default:{}};throw new Error('Unexpected import '+name);},m,m.exports);return m.exports;}
const {AuthConfirm}=load('src/components/admin/auth-confirm.tsx',{'react':React,'next/link':{default:()=>null},'@/lib/participation/client':{backend:()=>fake,configured:true},'@/components/participation/shared':{styles:{},Notice:()=>null},'./account-frame':{AccountFrame},'./workspace':{Workspace}});
global.location={hash:'#token_hash=fixture-token&type=invite',pathname:'/auth/confirm'};global.history={replaceState:()=>{global.location.hash='';}};
function render(){cursor=0;effects=[];return AuthConfirm();}
function all(tree,predicate){if(!tree||typeof tree!=='object')return [];if(Array.isArray(tree))return tree.flatMap(t=>all(t,predicate));return [...(predicate(tree)?[tree]:[]),...all(tree.props?.children,predicate)];}
const form=tree=>all(tree,x=>x.type==='form')[0];
(async()=>{
 render();effects.forEach(fn=>fn());let tree=render();effects.forEach(fn=>fn());tree=render();
 const verify=all(tree,x=>x.type==='button')[0];assert.ok(verify);await verify.props.onClick();assert.equal(calls.verify,1,'StrictMode must not erase the link before verification');
 tree=render();let fields=all(tree,x=>x.type==='input'&&x.props.autoComplete==='new-password');assert.equal(fields.length,2);
 fields[0].props.onChange({target:{value:'a fictional passphrase'}});fields[1].props.onChange({target:{value:'mismatch'}});
 await form(render()).props.onSubmit({preventDefault(){}});assert.equal(calls.save,0,'mismatched passwords never reach auth provider');
 tree=render();fields=all(tree,x=>x.type==='input'&&x.props.autoComplete==='new-password');fields[1].props.onChange({target:{value:'a fictional passphrase'}});
 await form(render()).props.onSubmit({preventDefault(){}});assert.equal(calls.save,1);assert.equal(calls.signOut,0,'password creation preserves the session for MFA');
 tree=render();assert.equal(tree.type,Workspace);assert.equal(tree.props.onboarding,true);
 const {setupRoleDescription}=load('src/lib/participation/account-setup.ts',{});
 assert.match(setupRoleDescription({is_owner:true,permissions:[]}),/owner workspace/);
 const writer=setupRoleDescription({is_owner:false,permissions:['content']});assert.match(writer,/article and email drafts/);assert.doesNotMatch(writer,/contribution records|subscriber preferences|team invitations/);
 assert.match(setupRoleDescription({is_owner:false,permissions:['review']}),/preliminary sighting review/);
 assert.match(setupRoleDescription({is_owner:false,permissions:['review','review_decide']}),/staff sighting decisions/);
 console.log(JSON.stringify({accountSetup:'PASS',checks:['strict-effect link retention','password confirmation','session continuity','MFA transition','role-scoped welcome'],externalCalls:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
