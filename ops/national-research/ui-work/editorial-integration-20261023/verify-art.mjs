import {readFile,readdir} from "node:fs/promises";
import sharp from "sharp";
const placements={};
async function scan(dir){
 for(const e of await readdir(dir,{withFileTypes:true})){
  const path=dir+"/"+e.name;
  if(e.isDirectory())await scan(path);
  else if(path.endsWith(".tsx")){
   const text=await readFile(path,"utf8");
   for(const m of text.matchAll(/(?:subject|artwork)="([a-z-]+)"|artwork: "([a-z-]+)"/g)){
    const key=m[1]||m[2];(placements[key]??=[]).push(path);
   }
  }
 }
}
await scan("app");await scan("src/components");
const duplicates=Object.entries(placements).filter(([,paths])=>paths.length>1);
if(duplicates.length)throw new Error("Repeated placements: "+JSON.stringify(duplicates));
const manifest=JSON.parse(await readFile("ops/national-research/ui-work/editorial-integration-20261023/artwork-manifest.json","utf8"));
for(const asset of manifest){
 if(!placements[asset.subject])throw new Error("Unplaced asset "+asset.subject);
 const {data,info}=await sharp(asset.target).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let ink=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
  const a=data[(y*info.width+x)*4+3];ink+=a>0?1:0;
  if((x<20||y<20||x>=info.width-20||y>=info.height-20)&&a)throw new Error("Opaque perimeter "+asset.subject);
 }
 if(ink<1000)throw new Error("Empty asset "+asset.subject);
}
console.log(JSON.stringify({uniquePlacements:Object.keys(placements).length,duplicatePlacements:duplicates.length,newAssets:manifest.length,newBytes:manifest.reduce((sum,a)=>sum+a.bytes,0),transparentPerimeters:"passed",note:"Species artwork is assigned to shared reference/report/correction components, not claimed as species illustrations."},null,2));
