const fs=require('node:fs'), path=require('node:path');
const dir=__dirname, prior=path.join(dir,'../species-detail-polish-20261028');
const gaps=JSON.parse(fs.readFileSync(path.join(prior,'photo-outcomes.json'))).filter(x=>x.outcome==='unresolved');
const file=path.join(dir,'taxonomy.json');
const rows=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];
const done=new Set(rows.map(x=>x.id));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(18000),headers:{'User-Agent':'ISITUSA PhotoReview/1.0 (contact@isitusa.com)'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function run(){for(const s of gaps){if(done.has(s.id))continue;const r={id:s.id,name:s.scientificName,checkedAt:new Date().toISOString()};
try{r.matchUrl='https://api.gbif.org/v1/species/match?verbose=true&name='+encodeURIComponent(s.scientificName);r.match=await get(r.matchUrl);const key=r.match.acceptedUsageKey||r.match.usageKey;if(key&&r.match.matchType!=='HIGHERRANK'){r.accepted=await get('https://api.gbif.org/v1/species/'+key);r.synonyms=(await get('https://api.gbif.org/v1/species/'+key+'/synonyms?limit=100')).results?.map(x=>({key:x.key,canonicalName:x.canonicalName,scientificName:x.scientificName,taxonomicStatus:x.taxonomicStatus}));}}
catch(e){r.error=e.message;}rows.push(r);fs.writeFileSync(file,JSON.stringify(rows,null,2)+'\n');if(rows.length%10===0)console.log('Taxonomy reviewed',rows.length);await sleep(250);}
console.log('Done',rows.length);}
run();
