import sharp from "sharp";
import {readFile,writeFile,stat} from "node:fs/promises";
const task="ops/national-research/ui-work/editorial-integration-20261023";
const sourceRoot="C:/Users/Ocean/.codex/generated_images/01a0e59e-58e4-7840-98dd-358f873a449b/";
const spec=JSON.parse(await readFile(task+"/sources.json","utf8"));
const manifest=[];
for(let sheet=0;sheet<spec.sheets.length;sheet++){
 const file=sourceRoot+spec.sheets[sheet];
 const meta=await sharp(file).metadata();
 const w=Math.floor(meta.width/2),h=Math.floor(meta.height/2);
 for(let q=0;q<4;q++){
  const name=spec.subjects[sheet][q];if(!name)continue;
  const {data,info}=await sharp(file).extract({left:(q%2)*w,top:Math.floor(q/2)*h,width:w,height:h}).resize({width:1000,withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const iw=info.width,ih=info.height,out=Buffer.alloc(iw*ih*4);
  for(let y=0;y<ih;y++)for(let x=0;x<iw;x++){
   const i=(y*iw+x)*4;
   const lum=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
   const edge=Math.min(1,x/8,y/8,(iw-1-x)/8,(ih-1-y)/8);
   const coverage=Math.min(1,Math.max(0,(1-lum-.075)/.76))*data[i+3]/255*edge;
   let n=Math.imul(x+9271,374761393)^Math.imul(y,668265263);
   n=Math.imul(n^(n>>>13),1274126177);
   const threshold=((n^(n>>>16))>>>0)/4294967296;
   out[i]=out[i+1]=out[i+2]=255;out[i+3]=threshold<coverage?255:0;
  }
  const target="public/artwork/editorial-"+name+"-r8.png";
  await sharp(out,{raw:{width:iw,height:ih,channels:4}}).extend({top:20,bottom:20,left:20,right:20,background:{r:255,g:255,b:255,alpha:0}}).png({palette:true}).toFile(target);
  manifest.push({subject:name,sheet:spec.sheets[sheet],quadrant:q,target,width:iw+40,height:ih+40,bytes:(await stat(target)).size});
 }
}
await writeFile(task+"/artwork-manifest.json",JSON.stringify(manifest,null,2)+"\n");
console.log(JSON.stringify({assets:manifest.length,bytes:manifest.reduce((s,a)=>s+a.bytes,0)}));
