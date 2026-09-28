import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function assert(ok, message) { if (!ok) throw new Error(message); }
function json(bytes) { return JSON.parse(bytes.toString("utf8")); }
function encoded(value) { return Buffer.from(JSON.stringify(value) + "\n"); }
function writeExact(file, bytes) {
  if (fs.existsSync(file)) {
    assert(fs.readFileSync(file).equals(bytes), "Existing derivative differs: " + file);
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes, { flag: "wx" });
}
export function validateCounty(county, expected, speciesSet, summaryRow) {
  assert(county.countyFips === expected.countyFips && county.stateCode === expected.stateCode, "County identity mismatch");
  assert(Array.isArray(county.pairs), "Missing pair array");
  const seen = new Set();
  for (const pair of county.pairs) {
    assert(speciesSet.has(pair.speciesId) && !seen.has(pair.speciesId), "Unknown or duplicate species");
    seen.add(pair.speciesId);
    assert(["verified-present","verified-absent","not-detected","researched-unresolved","not-researched"].includes(pair.displayStatus), "Invalid display status");
    assert(Array.isArray(pair.evidence) && typeof pair.conflict === "boolean", "Invalid evidence structure");
  }
  const present = county.pairs.filter(pair => pair.displayStatus === "verified-present");
  assert(present.length === county.summary.verifiedPresent && present.length === summaryRow.verifiedPresent, "Presence parity mismatch " + county.countyFips);
  assert(county.summary.fullCountySpeciesDenominator === speciesSet.size && summaryRow.fullCountySpeciesDenominator === speciesSet.size, "Catalog denominator mismatch");
  return present;
}
export function buildSnapshot({ root, sourceCommit, maxStoredBytes = 400000000, minimumFreeBytes = 265000000000 }) {
  assert(/^[0-9a-f]{40}$/.test(sourceCommit), "Use a full source commit");
  const tree = execFileSync("git", ["-c","safe.directory="+root,"ls-tree","-rz",sourceCommit,"public/generated/research","src/data/generated/counties.json","src/data/generated/species.json","src/data/research/state-research-config.json"], { cwd:root, maxBuffer:8*1024*1024 });
  const blobs = new Map(tree.toString("utf8").split("\0").filter(Boolean).map(row => {
    const [meta,name] = row.split("\t"); return [name,meta.split(" ")[2]];
  }));
  function source(relative) {
    const cached=relative.startsWith("public/generated/research/") ? path.join(root,"public/research-snapshots",sourceCommit,relative.slice("public/generated/research/".length)+".gz") : null;
    const bytes=cached && fs.existsSync(cached) ? gunzipSync(fs.readFileSync(cached),{maxOutputLength:40000000}) : fs.readFileSync(path.join(root,relative));
    const blob=createHash("sha1").update(Buffer.from("blob "+bytes.length+"\0")).update(bytes).digest("hex");
    assert(blobs.get(relative) === blob,"Source differs from pinned Git commit: "+relative);
    return bytes;
  }
  const speciesIds=json(source("src/data/generated/species.json")).map(s=>s.id).sort();
  const speciesSet=new Set(speciesIds);
  assert(speciesIds.length===speciesSet.size,"Duplicate catalog ID");
  const ordinals=new Map(speciesIds.map((id,i)=>[id,i]));
  const config=json(source("src/data/research/state-research-config.json"));
  const configuredStates=new Set(config.states.filter(s=>s.publicResearchProjection).map(s=>s.stateCode));
  const counties=Object.fromEntries(Object.entries(json(source("src/data/generated/counties.json"))).filter(([,c])=>configuredStates.has(c.stateCode)));
  assert(Object.keys(counties).length===3144,"Unexpected configured geography");
  const states=[...new Set(Object.values(counties).map(c=>c.stateCode))].sort();
  const relativeRoot="public/research-snapshots/"+sourceCommit;
  const output=path.join(root,relativeRoot);
  const files={};
  let storedBytes=0,rawBytes=0;
  function pack(relative, bytes) {
    const existing=path.join(output,relative+".gz");
    const packed=fs.existsSync(existing) ? fs.readFileSync(existing) : gzipSync(bytes,{level:9});
    assert(gunzipSync(packed).equals(bytes),"Round-trip gzip mismatch");
    storedBytes+=packed.length; rawBytes+=bytes.length;
    assert(storedBytes<=maxStoredBytes,"Static snapshot byte budget exceeded");
    const disk=fs.statfsSync(root);
    assert(disk.bavail*disk.bsize>=minimumFreeBytes+packed.length,"Free-disk floor");
    assert(process.memoryUsage().rss<512*1024*1024,"Generator memory budget exceeded");
    writeExact(path.join(output,relative+".gz"),packed);
    files[relative]={path:relative+".gz",sha256:hash(bytes),bytes:bytes.length,storedSha256:hash(packed),storedBytes:packed.length};
  }
  const index={schemaVersion:1,sourceCommit,asOf:"",speciesIds,countyLabels:Object.fromEntries(Object.values(counties).map(c=>[c.countyFips,{name:c.name,stateCode:c.stateCode}])),occurrenceByCounty:{},temporalExceptions:{}};
  const perState={}; const asOfs=new Set(); let presentPairs=0,countyCount=0;
  for (const state of states) {
    const summaryPath="public/generated/research/"+state+"/summary.json";
    const summaryBytes=source(summaryPath), summary=json(summaryBytes);
    const rows=new Map(summary.counties.map(row=>[row.countyFips,row]));
    const stateCounties=Object.values(counties).filter(c=>c.stateCode===state).sort((a,b)=>a.countyFips.localeCompare(b.countyFips));
    assert(rows.size===stateCounties.length,"State county count mismatch "+state);
    let statePairs=0;
    pack(state+"/summary.json",summaryBytes);
    for (const expected of stateCounties) {
      const relative=state+"/counties/"+expected.countyFips+".json";
      const bytes=source("public/generated/research/"+relative), county=json(bytes);
      const present=validateCounty(county,expected,speciesSet,rows.get(expected.countyFips));
      assert(county.asOf===summary.asOf,"State/county asOf mismatch");
      asOfs.add(county.asOf);
      index.occurrenceByCounty[expected.countyFips]=present.map(p=>ordinals.get(p.speciesId)).sort((a,b)=>a-b);
      const exceptions={};
      for(const p of present) if(p.conflict || ["officially-absent","officially-eradicated"].includes(p.currentDeterminationStatus)) {
        exceptions[p.speciesId]={historicalOccurrenceStatus:p.historicalOccurrenceStatus,currentDeterminationStatus:p.currentDeterminationStatus,conflict:p.conflict};
      }
      if(Object.keys(exceptions).length) index.temporalExceptions[expected.countyFips]=exceptions;
      pack(relative,bytes); statePairs+=present.length; countyCount++;
    }
    assert(statePairs===summary.counties.reduce((n,c)=>n+c.verifiedPresent,0),"State presence parity mismatch");
    perState[state]={countyCount:stateCounties.length,presentPairs:statePairs,asOf:summary.asOf};
    presentPairs+=statePairs;
    console.log(JSON.stringify({state,counties:stateCounties.length,presentPairs:statePairs,storedBytes}));
  }
  assert(asOfs.size===1,"Mixed source asOf dates require an explicit multi-date contract");
  index.asOf=[...asOfs][0];
  const indexBytes=encoded(index);
  assert(indexBytes.length<=12000000 && gzipSync(indexBytes).length<=2000000,"Map-index budget");
  pack("map-index.json",indexBytes);
  const manifest={schemaVersion:1,kind:"isitusa-application-research-snapshot",sourceCommit,asOf:index.asOf,files};
  const manifestBytes=encoded(manifest);
  writeExact(path.join(output,"manifest.json"),manifestBytes);
  const configuration={schemaVersion:1,sourceCommit,asOf:index.asOf,basePath:"/research-snapshots/"+sourceCommit,manifestSha256:hash(manifestBytes),manifestBytes:manifestBytes.length};
  const configPath=path.join(root,"src/data/research/application-research-snapshot.json");
  fs.writeFileSync(configPath,JSON.stringify(configuration,null,2)+"\n");
  const receipt={schemaVersion:1,sourceCommit,asOf:index.asOf,sourceArtifacts:countyCount+states.length,countyCount,stateCount:states.length,speciesCount:speciesIds.length,presentPairs,sourceBytes:rawBytes-indexBytes.length,storedBytes,manifestBytes:manifestBytes.length,mapIndexBytes:indexBytes.length,mapIndexGzipBytes:files["map-index.json"].storedBytes,exactGitSourceChecks:countyCount+states.length+3,roundTripChecks:countyCount+states.length+1,presenceParityChecks:countyCount+states.length,perState,configuration};
  writeExact(path.join(output,"generation-receipt.json"),encoded(receipt));
  console.log(JSON.stringify(receipt));
  return receipt;
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const sourceCommit=process.argv[process.argv.indexOf("--source-commit")+1];
  buildSnapshot({root:process.cwd(),sourceCommit});
}
