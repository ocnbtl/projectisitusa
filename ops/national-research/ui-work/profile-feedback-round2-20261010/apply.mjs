import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const root = 'ops/national-research/ui-work/profile-feedback-round2-20261010';
const file = 'src/content/species-editorial-revisions.json';
const original = JSON.parse(execFileSync('git', ['show', `4e5f3eae8a:${file}`], {encoding:'utf8'}));
const queue = JSON.parse(fs.readFileSync('src/content/editorial-queue.json', 'utf8')).filter(x => x.order <= 200);
const paragraphs = new Map();
for (let batch=1; batch<=4; batch++) {
  const lines = fs.readFileSync(`${root}/batch-${batch}.txt`, 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 50);
  for (const line of lines) {
    const split = line.indexOf('|'), order = Number(line.slice(0, split));
    assert(order > (batch-1)*50 && order <= batch*50);
    assert(!paragraphs.has(order));
    paragraphs.set(order, line.slice(split+1));
  }
}
assert.equal(paragraphs.size,200);
const aliases = {
  'asparagus-asparagoides':['Bridal creeper'],
  'cynodon-nlemfuensis':['African stargrass'],
  'sansevieria-cylindrica':['African spear'],
  'hemarthria-altissima':['Limpograss'],
  'lepidium-africanum':['African peppercress'],
  'senna-didymobotrya':['Popcorn cassia'],
  'dioscorea-bulbifera':['Air potato'],
  'ptychosperma-elegans':['Solitaire palm'],
  'myrrhis-odorata':['Sweet cicely'],
  'rhopalosiphum-rufiabdominalis':['Rice root aphid'],
  'tinocallis-ulmiparvifoliae':['Chinese elm aphid'],
  'neopinnaspis-harperi':['Harper scale'],
  'clitoria-ternatea':['Butterfly pea'],
  'vallisneria-australis':['Ribbon weed']
};
const revised = original.map(row => {
  const item = queue.find(x => x.id === row.speciesId);
  assert(item, row.speciesId);
  const proposedDescription = paragraphs.get(item.order);
  assert(proposedDescription && proposedDescription !== row.proposedDescription);
  assert(proposedDescription.length < 6000);
  return {...row, proposedDescription, previousDescription:row.proposedDescription,
    revisionNumber:2, revisedAt:'2026-10-10',
    ...(aliases[row.speciesId] ? {alternativeNames:aliases[row.speciesId]} : {}),
    ...(row.speciesId==='cenchrus-macrourus' ? {otherScientificNames:['Pennisetum macrourum','Cenchrus caudatus']} : {})};
});
fs.writeFileSync(file, JSON.stringify(revised,null,2)+'\n');
const counts={};
for(const row of revised){
  const before=original.find(x=>x.speciesId===row.speciesId);
  for(const key of ['sources','status','researchNotes','identification','actions']) assert.deepEqual(row[key],before[key]);
  counts[row.status]=(counts[row.status]??0)+1;
}
const words=revised.map(x=>x.proposedDescription.split(/\s+/).length);
const result={profiles:revised.length,batches:[50,50,50,50],changed:200,sourceAndResearchFieldsUnchanged:true,privateReviewWrites:0,counts,words:{min:Math.min(...words),max:Math.max(...words),mean:Math.round(words.reduce((a,b)=>a+b,0)/words.length)},alternativeNames:Object.keys(aliases).length};
fs.writeFileSync(`${root}/validation.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
