const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),{syncBuiltinESMExports}=require('node:module');
const original=cp.execFileSync;let showCalls=0;
cp.execFileSync=function(...args){if(args[0]==='git'&&args[1]?.includes('show'))showCalls++;return original.apply(this,args);};syncBuiltinESMExports();
const {CommittedFileReader}=require('../src/lib/research/committed-file-reader.ts');
const tempBase=path.resolve(os.tmpdir()),root=fs.mkdtempSync(path.join(tempBase,'isitusa-committed-cache-'));
const git=(args,cwd=root)=>original('git',['-c','safe.directory='+cwd.replaceAll('\\','/'),'-c','user.name=Isitusa Cache Test','-c','user.email=cache-test@example.invalid','-c','core.autocrlf=false',...args],{cwd,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
try{
 git(['init','--quiet']);fs.writeFileSync(path.join(root,'a.bin'),Buffer.from([0,13,10,255]));fs.writeFileSync(path.join(root,'b.txt'),'bees');git(['add','--','a.bin','b.txt']);git(['commit','--quiet','-m','First fixture']);const first=git(['rev-parse','HEAD']),reader=new CommittedFileReader(32,16);
 const a=reader.read(root,first,'a.bin');assert.deepEqual([...a],[0,13,10,255]);a.fill(7);const countAfterFirst=showCalls;assert.deepEqual([...reader.read(root,first,'a.bin')],[0,13,10,255]);assert.equal(showCalls,countAfterFirst);
 fs.writeFileSync(path.join(root,'a.bin'),'different');assert.deepEqual([...reader.read(root,first,'a.bin')],[0,13,10,255]);git(['add','--','a.bin']);git(['commit','--quiet','-m','Second fixture']);const second=git(['rev-parse','HEAD']);assert.equal(reader.read(root,second,'a.bin').toString(),'different');assert.deepEqual([...reader.read(root,first,'a.bin')],[0,13,10,255]);
 const other=path.join(root,'other');fs.mkdirSync(other);git(['init','--quiet'],other);assert.throws(()=>reader.read(other,first,'a.bin'));
 for(const [commit,p]of [['HEAD','a.bin'],[first,'../a.bin'],[first,path.join(root,'a.bin')],[first,'bad\0path']])assert.throws(()=>reader.read(root,commit,p));
 const beforeMissing=showCalls;assert.throws(()=>reader.read(root,first,'missing'));assert.throws(()=>reader.read(root,first,'missing'));assert.equal(showCalls-beforeMissing,2);
 const evict=new CommittedFileReader(4,4),beforeEvict=showCalls;evict.read(root,first,'a.bin');evict.read(root,first,'b.txt');evict.read(root,first,'a.bin');assert.equal(showCalls-beforeEvict,3);
 const noOversize=new CommittedFileReader(16,3),beforeOversize=showCalls;noOversize.read(root,first,'a.bin');noOversize.read(root,first,'a.bin');assert.equal(showCalls-beforeOversize,2);
 const disabled=new CommittedFileReader(0,16),beforeDisabled=showCalls;disabled.read(root,first,'a.bin');disabled.read(root,first,'a.bin');assert.equal(showCalls-beforeDisabled,2);
 const entryBound=new CommittedFileReader(100,100,1),beforeEntryBound=showCalls;entryBound.read(root,first,'a.bin');entryBound.read(root,first,'b.txt');entryBound.read(root,first,'a.bin');assert.equal(showCalls-beforeEntryBound,3);
 for(const args of [[-1,2],[NaN,2],[2,-1],[2,2,0]])assert.throws(()=>new CommittedFileReader(...args));
 console.log('Committed file reader passed: exact binary bytes, historical commits, mutable checkout isolation, caller mutation isolation, repository identity, path guards, uncached failures, byte/entry eviction, oversize bypass and disabled caching.');
}finally{
 cp.execFileSync=original;syncBuiltinESMExports();
 const resolved=path.resolve(root),relative=path.relative(tempBase,resolved);
 assert(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative)&&path.basename(resolved).startsWith('isitusa-committed-cache-'),'Unsafe fixture cleanup path');
 fs.rmSync(resolved,{recursive:true,force:true});
}
