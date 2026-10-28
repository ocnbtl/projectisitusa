const fs=require('fs'),path=require('path');const dir=__dirname, file=path.join(dir,'alternate-names.json');
const taxa=JSON.parse(fs.readFileSync(path.join(dir,'taxonomy.json'))),saved=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):[];
const norm=n=>(n||'').toLowerCase().replace(/\b(ssp\.?|subsp\.?|var\.?|f\.?)\s+/g,'').replace(/\s+/g,' ').trim();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function get(url){await pause(700);const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ISITUSA PhotoReview (contact@isitusa.com)'}});if(!r.ok)throw Error('HTTP '+r.status);return r.json();}
async function run(){for(const row of taxa){if(saved.some(x=>x.id===row.id))continue;const r={id:row.id,name:row.name,queries:[],taxa:[],candidates:[]};
try{const safeMatch=row.match.matchType==='EXACT'&&row.match.confidence>=94&&!row.name.includes('f. sp.');
 const names=[row.name];if(safeMatch&&row.accepted?.canonicalName!==row.name)names.push(row.accepted.canonicalName);
 const allowed=new Set([norm(row.name),...(safeMatch?[norm(row.accepted?.canonicalName),...(row.synonyms||[]).map(s=>norm(s.canonicalName))]:[])]);
 for(const name of names.filter(Boolean)){const u='https://api.inaturalist.org/v1/taxa?q='+encodeURIComponent(name)+'&per_page=10';r.queries.push(u);const d=await get(u);r.taxa.push(...(d.results||[]).map(t=>({id:t.id,name:t.name,rank:t.rank,matched_term:t.matched_term,observations_count:t.observations_count}))); const t=d.results?.find(t=>allowed.has(norm(t.name))&&['species','subspecies','variety','form'].includes(t.rank));if(!t)continue;
 r.selectedTaxon={id:t.id,name:t.name,rank:t.rank,matched_term:t.matched_term};r.taxonomyEvidence=row.matchUrl;
 const url='https://api.inaturalist.org/v1/observations?taxon_id='+t.id+'&quality_grade=research&photo_license=cc0,cc-by,cc-by-sa&per_page=12&order_by=votes';r.queries.push(url);const obs=await get(url);
 for(const o of obs.results||[]){if(o.taxon?.id!==t.id||o.quality_grade!=='research')continue;for(const p of o.photos||[]){if(!['cc0','cc-by','cc-by-sa'].includes(p.license_code)||p.hidden||p.flags?.length||!/^https:\/\/inaturalist-open-data\.s3\.amazonaws\.com\/photos\//.test(p.url))continue;r.candidates.push({name:t.name,photoId:p.id,license:p.license_code,credit:p.attribution,sourceUrl:'https://www.inaturalist.org/photos/'+p.id,observationUrl:o.uri,url:p.url.replace('/square.','/medium.'),dimensions:p.original_dimensions});break;}if(r.candidates.length>=3)break;}break;}
 r.status=r.candidates.length?'needs-review':'no-verified-photo';
}catch(e){r.error=e.message;r.status='provider-error';}saved.push(r);fs.writeFileSync(file,JSON.stringify(saved,null,2)+'\n');if(saved.length%10===0)console.log({checked:saved.length,candidates:saved.filter(x=>x.candidates.length).length});}console.log('Done',saved.length);}
run();
