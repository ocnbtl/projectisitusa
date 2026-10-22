import sharp from 'sharp';
import {copyFile,writeFile} from 'node:fs/promises';
const root='C:/Users/Ocean/.codex/generated_images/01a0e59e-58e4-7840-98dd-358f873a449b/';
const files=[['atlas','exec-b8a8d8ee-1f8a-410c-bae6-ac32aa15640c.png'],['herbarium','exec-c35ae0cd-2d52-45b9-830f-35ddf3d4e655.png'],['meadow','exec-0a4abfd7-e628-44a9-9d1b-ab0a318f7f15.png']];
for(const [name,file]of files){
 const source=`ops/national-research/ui-work/generated-botanical-20261022/${name}-source.png`;
 await copyFile(root+file,source);
 const {data,info}=await sharp(source).resize({width:1800,withoutEnlargement:true}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const {width:w,height:h}=info;const out=Buffer.alloc(w*h*4);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=(y*w+x)*4,lum=(data[i]*.2126+data[i+1]*.7152+data[i+2]*.0722)/255;
  // Print preparation: map the generated engraving to monochrome pixel coverage.
  // No botanical forms are redrawn. CSS supplies the exact light/dark brand color.
  const edge=Math.min(1,x/35,(w-1-x)/35,y/24,(h-1-y)/24);
  const coverage=Math.max(0,(1-lum-.025)/.78)*data[i+3]/255*edge;
  let n=Math.imul(x+9271,374761393)^Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);const threshold=((n^(n>>>16))>>>0)/4294967296;
  out[i]=out[i+1]=out[i+2]=255;out[i+3]=threshold<coverage?255:0;
 }
 await sharp(out,{raw:{width:w,height:h,channels:4}}).png({palette:true}).toFile(`public/artwork/about-${name}-r5.png`);
 // Small local composition proof for review.
 await sharp({create:{width:w,height:h,channels:4,background:'#edf2ef'}}).composite([{input:await sharp({create:{width:w,height:h,channels:4,background:'#00583b'}}).composite([{input:await sharp(out,{raw:{width:w,height:h,channels:4}}).png().toBuffer(),blend:'dest-in'}]).png().toBuffer()}]).png().toFile(`ops/national-research/ui-work/generated-botanical-20261022/${name}-proof.png`);
 console.log(name,w,h);
}
