const fs=require('fs'),ts=require('C:/Code/project-isitusa/node_modules/typescript'),assert=require('assert/strict');
const compiled=ts.transpileModule(fs.readFileSync('src/lib/ui/editorial-review.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const mod={exports:{}};new Function('exports','module',compiled)(mod.exports,mod);
const {reviewStatus,sourceUrls}=mod.exports;
assert.equal(reviewStatus(undefined,true),'in_review');assert.equal(reviewStatus(undefined,false),'queued');assert.equal(reviewStatus({status:'reviewed'},true),'reviewed');
assert.deepEqual(sourceUrls('https://example.org\n https://example.org\n'),['https://example.org']);
for(const u of ['javascript:alert(1)','file:///tmp/test','not-a-url'])assert.throws(()=>sourceUrls(u));
assert.throws(()=>sourceUrls(Array.from({length:21},(_,i)=>'https://example.org/'+i).join('\n')));
console.log('Review status and source validation: 8 checks passed');
