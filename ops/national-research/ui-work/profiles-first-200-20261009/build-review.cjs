const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../../..');
const queue=JSON.parse(fs.readFileSync(path.join(root,'src/content/editorial-queue.json'),'utf8')).filter(x=>x.order<=200);
const entries={};
for(let batch=1;batch<=4;batch++) {
 const name=`editorial-batch-0${batch}-completion.json`;
 const file=path.join(root,'src/content',name);
 if(!fs.existsSync(file))throw Error('Missing '+name);
 const data=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 const expected=queue.filter(x=>x.batch===batch).map(x=>x.id);
 assert.deepEqual(Object.keys(data).sort(),expected.sort(),`Batch ${batch} must contain its exact 50 IDs`);
 for(const [id,entry] of Object.entries(data)) {
  assert.ok(!entries[id],`Duplicate ID ${id}`);
  assert.ok(entry.summary.trim().length>=100 && entry.summary.length<1200,`Length: ${id}`);
  assert.ok(!/[\u2013\u2014]/.test(entry.summary),`Dash: ${id}`);
  assert.ok(entry.sources.length>0,`No sources: ${id}`);
  for(const source of entry.sources){assert.ok(source.label.trim());const url=new URL(source.url);assert.ok(['https:','http:'].includes(url.protocol));}
  entries[id]=entry;
 }
}
assert.equal(new Set(Object.values(entries).map(x=>x.summary)).size,200,'Duplicate summaries');
const records=queue.map(q=>({...q,...entries[q.id]}));
const byBatch=[1,2,3,4].map(batch=>({batch,count:records.filter(x=>x.batch===batch).length,words:records.filter(x=>x.batch===batch).map(x=>x.summary.split(/\s+/).length)}));
const report={date:'2026-10-09',status:'source-checked; awaiting owner reading',editorialCount:200,remainingQueued:2304,batches:byBatch.map(b=>({batch:b.batch,count:b.count,minWords:Math.min(...b.words),maxWords:Math.max(...b.words)})),sourceLinks:records.reduce((n,r)=>n+r.sources.length,0),uniqueSourceUrls:new Set(records.flatMap(r=>r.sources.map(s=>s.url))).size,checks:['exact catalog IDs and batches','no duplicate descriptions','nonempty sources and valid source URLs','summary length and authored dash rules'],limits:'These automated checks validate structure, not source correctness. Editorial source and tone review is a separate human-readable review step. No county occurrence or determination data changed.'};
fs.writeFileSync(path.join(__dirname,'validation.json'),JSON.stringify(report,null,2)+'\n');
fs.writeFileSync(path.join(__dirname,'first-200-review.md'),'# First 200 species profiles\n\nSource-checked descriptions for owner review. These describe species biology; they do not establish local presence.\n\n'+records.map(r=>`## ${r.order}. ${r.commonName}\n\n*${r.scientificName}* | Batch ${r.batch}\n\n${r.summary}\n\n${r.sources.map(s=>`- [${s.label}](${s.url})`).join('\n')}\n`).join('\n'));
const safe=JSON.stringify(records).replaceAll('<','\\u003c');
const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>isitusa - First 200 profiles</title><style>
:root{color-scheme:light;--ink:#153e31;--muted:#53655d;--paper:#f6f7ef;--line:#d8e0d2}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:17px/1.65 system-ui,sans-serif}header,main{max-width:1050px;margin:auto;padding:32px 24px}header{padding-top:60px}h1{font-family:Georgia,serif;font-size:clamp(32px,6vw,58px);line-height:1.1;margin:8px 0 20px}header p{max-width:700px;color:var(--muted)}nav{display:flex;gap:9px;flex-wrap:wrap;margin:24px 0}button,input{font:inherit;border:1px solid var(--line);border-radius:8px;padding:9px 14px;background:white;color:var(--ink)}button{cursor:pointer}button[aria-pressed=true]{background:var(--ink);color:white}input{width:100%}article{background:white;border:1px solid var(--line);border-radius:14px;padding:26px 30px;margin:0 0 20px}h2{font-size:25px;line-height:1.25;margin:3px 0}small,.latin{color:var(--muted)}.latin{font-style:italic;margin:8px 0 18px}article p{max-width:820px}a{color:#226647;text-underline-offset:3px}ul{padding-left:22px;font-size:14px}#count{font-size:14px;color:var(--muted)}@media print{nav,input{display:none}article{break-inside:avoid;border:none;border-bottom:1px solid #ddd}header{padding-top:0}}@media(max-width:600px){article{padding:20px}header,main{padding:24px 16px}}
</style><header><small>ISITUSA / EDITORIAL REVIEW</small><h1>The first 200 species.</h1><p>Four alphabetical batches, with source links beside every description. Read through a batch or search for a species. Profile writing is separate from county evidence: inclusion here does not mean a species is invasive everywhere.</p><nav aria-label="Filter by batch"><button data-batch="0" aria-pressed="true">All 200</button><button data-batch="1" aria-pressed="false">1-50</button><button data-batch="2" aria-pressed="false">51-100</button><button data-batch="3" aria-pressed="false">101-150</button><button data-batch="4" aria-pressed="false">151-200</button></nav><label for="search">Find a species</label><input id="search" type="search" placeholder="Common or scientific name"><p id="count" role="status"></p></header><main id="profiles"></main><script>
const data=${safe};let batch=0;const main=document.querySelector('#profiles'),search=document.querySelector('#search');function el(tag,text){const e=document.createElement(tag);e.textContent=text;return e}function render(){const q=search.value.toLowerCase().trim();const rows=data.filter(r=>(!batch||r.batch===batch)&&(!q||(r.commonName+' '+r.scientificName).toLowerCase().includes(q)));main.replaceChildren();document.querySelector('#count').textContent=rows.length+' profiles shown';for(const r of rows){const a=el('article','');a.id=r.id;a.append(el('small','#'+r.order+' / Batch '+r.batch),el('h2',r.commonName));const sci=el('p',r.scientificName);sci.className='latin';a.append(sci,el('p',r.summary));const ul=el('ul','');for(const s of r.sources){const li=el('li',''),link=el('a',s.label);link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';li.append(link);ul.append(li)}a.append(ul);main.append(a)}}document.querySelectorAll('[data-batch]').forEach(b=>b.addEventListener('click',()=>{batch=Number(b.dataset.batch);document.querySelectorAll('[data-batch]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));render()}));search.addEventListener('input',render);render();
</script></html>`;
fs.writeFileSync(path.join(__dirname,'first-200-review.html'),html);
console.log(JSON.stringify(report,null,2));
