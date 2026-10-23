import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
const root='C:/Users/Ocean/.codex/generated_images/01a0e59e-58e4-7840-98dd-358f873a449b/';
const files={field:'exec-bc27afcc-89e5-4054-8dbc-8d0f8ed29309.png',specimen:'exec-56311f11-251e-48c1-904c-39defcd67d50.png',participate:'exec-71edfd99-3563-45b3-b8a9-37e9b2d0a9ad.png',research:'exec-67fbdb1a-a114-44b6-80c0-2744861b4aaf.png',support:'exec-1296912f-e7a3-4802-bbfd-81e719cec8b7.png'};
const report=[];
for(const [name,file]of Object.entries(files)){
 const {data,info}=await sharp(root+file).resize({width:1400,withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=info;const out=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,lum=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
  // Remove paper; preserve the illustration's own contour. Quantize ink to tiny print dots.
  const coverage=Math.min(1,Math.max(0,(1-lum-.055)/.82))*data[i+3]/255;
  let n=Math.imul(x+9271,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);const threshold=((n^(n>>>16))>>>0)/4294967296;
  out[i]=out[i+1]=out[i+2]=255;out[i+3]=threshold<coverage?255:0;
 }
 const target=`public/artwork/editorial-${name}-r6.png`;
 await sharp(out,{raw:{width:w,height:h,channels:4}}).extend({top:28,bottom:28,left:28,right:28,background:{r:255,g:255,b:255,alpha:0}}).png({palette:true}).toFile(target);
 const ink=await sharp({create:{width:w,height:h,channels:4,background:'#00583b'}}).composite([{input:await sharp(out,{raw:{width:w,height:h,channels:4}}).png().toBuffer(),blend:'dest-in'}]).png().toBuffer();
 await sharp(await sharp({create:{width:w,height:h,channels:4,background:'#edf2ef'}}).composite([{input:ink}]).png().toBuffer()).resize({width:800}).png().toFile(`ops/national-research/ui-work/editorial-plates-20261022/${name}-proof.png`);
 report.push({subject:name,source:file,target,width:w+56,height:h+56});
}
await writeFile('ops/national-research/ui-work/editorial-plates-20261022/artwork-manifest.json',JSON.stringify(report,null,2));
console.log(report);

