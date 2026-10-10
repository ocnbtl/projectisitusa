import fs from 'node:fs/promises';
import sharp from 'sharp';
const dir='public/brand/v8';
for(const name of ['wordmark-green','wordmark-white','wordmark-black','symbol-name','full-name','email-avatar']){
 const source=await fs.readFile(`${dir}/${name}.svg`);
 await sharp(source).resize({width:name==='symbol-name'?840:name==='email-avatar'?1000:1800}).withMetadata({exif:{IFD0:{ImageDescription:'ISITUSA Canopy original vector outlines. Rendered from scripts/build-brand-v8.py; source and OFL ancillary font license included.'}}}).png().toFile(`${dir}/${name}.png`);
}
const a=await fs.readFile(`${dir}/wordmark-green.svg`,'utf8'),b=await fs.readFile(`${dir}/full-name.svg`,'utf8');
await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="540"><rect width="1500" height="540" fill="white"/>'+a.replace('<svg ','<svg x="30" y="30" width="1200" height="228" ')+b.replace('<svg ','<svg x="30" y="300" width="1400" height="210" ')+'</svg>')).png().toFile('ops/national-research/ui-work/botanical-gothic-20261010/master-study.png');
