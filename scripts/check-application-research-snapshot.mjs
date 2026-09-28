import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
export function checkApplicationSnapshot(root = process.cwd()) {
  const config=JSON.parse(fs.readFileSync(path.join(root,"src/data/research/application-research-snapshot.json"),"utf8"));
  assert.match(config.sourceCommit,/^[0-9a-f]{40}$/);
  assert.equal(config.basePath,"/research-snapshots/"+config.sourceCommit);
  const directory=path.join(root,"public",config.basePath.slice(1));
  const raw=fs.readFileSync(path.join(directory,"manifest.json"));
  assert.equal(raw.length,config.manifestBytes);assert.equal(hash(raw),config.manifestSha256);
  const manifest=JSON.parse(raw);
  assert.equal(manifest.sourceCommit,config.sourceCommit);assert.equal(manifest.asOf,config.asOf);
  let checked=0,storedBytes=0,decodedBytes=0;
  function read(relative) {
    const entry=manifest.files[relative];
    assert(entry,"Missing snapshot artifact "+relative);
    assert.match(relative,/^(?:[A-Z]{2}\/(?:summary|counties\/\d{5})|map-index)\.json$/);
    assert.equal(entry.path,relative+".gz");
    const packed=fs.readFileSync(path.join(directory,entry.path));
    assert.equal(packed.length,entry.storedBytes);assert.equal(hash(packed),entry.storedSha256);
    const bytes=gunzipSync(packed,{maxOutputLength:40000000});
    assert.equal(bytes.length,entry.bytes);assert.equal(hash(bytes),entry.sha256);
    storedBytes+=packed.length;decodedBytes+=bytes.length;checked++;
    return JSON.parse(bytes);
  }
  const index=read("map-index.json");
  assert.equal(index.asOf,config.asOf);assert.equal(index.sourceCommit,config.sourceCommit);
  assert.equal(index.speciesIds.length,new Set(index.speciesIds).size);
  assert.equal(index.speciesIds.length,2504);
  assert.equal(Object.keys(index.occurrenceByCounty).length,3144);
  const labels=index.countyLabels, seen=new Set(), perState={};
  const states=[...new Set(Object.values(labels).map(c=>c.stateCode))].sort();
  assert.equal(states.length,51);
  let pairs=0;
  for(const state of states) {
    const summary=read(state+"/summary.json");
    assert.equal(summary.stateCode,state);assert.equal(summary.asOf,index.asOf);
    const stateCounties=Object.keys(labels).filter(fips=>labels[fips].stateCode===state).sort();
    assert.deepEqual(summary.counties.map(c=>c.countyFips).sort(),stateCounties);
    let count=0;
    for(const row of summary.counties) {
      const county=read(state+"/counties/"+row.countyFips+".json");
      assert.equal(county.stateCode,state);assert.equal(county.countyFips,row.countyFips);assert.equal(county.asOf,index.asOf);
      const actual=county.pairs.filter(p=>p.displayStatus==="verified-present").map(p=>p.speciesId).sort();
      const ordinals=index.occurrenceByCounty[row.countyFips];
      assert(Array.isArray(ordinals)); assert(ordinals.every((n,i)=>Number.isSafeInteger(n)&&n>=0&&n<index.speciesIds.length&&(i===0||n>ordinals[i-1])));
      const mapped=ordinals.map(n=>index.speciesIds[n]).sort();
      assert.deepEqual(mapped,actual,"County map/evidence mismatch "+row.countyFips);
      assert.equal(actual.length,row.verifiedPresent);assert.equal(actual.length,county.summary.verifiedPresent);
      assert.equal(row.fullCountySpeciesDenominator,2504);
      assert(!seen.has(row.countyFips));seen.add(row.countyFips);
      const expectedExceptions={};
      for(const p of county.pairs.filter(p=>p.displayStatus==="verified-present")) {
        if(p.conflict||["officially-absent","officially-eradicated"].includes(p.currentDeterminationStatus)) {
          expectedExceptions[p.speciesId]=JSON.parse(JSON.stringify({historicalOccurrenceStatus:p.historicalOccurrenceStatus,currentDeterminationStatus:p.currentDeterminationStatus,conflict:p.conflict}));
        }
      }
      assert.deepEqual(index.temporalExceptions[row.countyFips]??{},expectedExceptions);
      count+=actual.length;
    }
    perState[state]={countyCount:stateCounties.length,presentPairs:count};pairs+=count;
  }
  assert.equal(seen.size,3144);assert.equal(checked,Object.keys(manifest.files).length);
  assert.equal(perState.AK.countyCount,30);assert.equal(perState.HI.countyCount,5);assert.equal(perState.CT.countyCount,9);
  for(const retired of ["02261","09001","09003","09005","09007","09009","09011","09013","09015"]) assert(!seen.has(retired));
  return {sourceCommit:config.sourceCommit,asOf:index.asOf,artifacts:checked,counties:seen.size,states:states.length,species:index.speciesIds.length,presentPairs:pairs,storedBytes,decodedBytes,perState};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) console.log(JSON.stringify(checkApplicationSnapshot()));
