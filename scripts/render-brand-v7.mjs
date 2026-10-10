import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=process.cwd(),dir=path.join(root,'public/brand/v7');
for(const name of ['wordmark-green','wordmark-white','wordmark-black','symbol-name','full-name']){
 const source=await fs.readFile(path.join(dir,name+'.svg'));
 await sharp(source).resize({width:name==='symbol-name'?840:1800}).withMetadata({exif:{IFD0:{ImageDescription:'Original ISITUSA v7 vector render; OFL-derived Field Display by ISITUSA based on Fraunces. Source SVG and build scripts included.'}}}).png().toFile(path.join(dir,name+'.png'));
}
console.log('Rendered the v7 vector masters.');
