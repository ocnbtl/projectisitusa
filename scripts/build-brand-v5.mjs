import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public/brand/v4');
const output = path.join(root, 'public/brand/v5');
await fs.mkdir(output, { recursive: true });
// Preserve the approved outlines; remove only the extra word space after T.
function joinLetters(svg) {
  let count = 0;
  const result = svg.replace(/<g transform="translate\(([\d.]+) 45\)">/g, (_, x) => {
    const shift = count++ >= 4 ? 36 : 0;
    return `<g transform="translate(${(Number(x) - shift).toFixed(3)} 45)">`;
  });
  if (count !== 7) throw new Error(`Expected seven wordmark glyphs, found ${count}`);
  return result.replaceAll('ISIT USA', 'ISITUSA');
}
for (const color of ['green', 'white', 'black']) {
  const original = await fs.readFile(path.join(source, `wordmark-${color}.svg`), 'utf8');
  const svg = joinLetters(original).replace('743.800 158', '707.800 158');
  await fs.writeFile(path.join(output, `wordmark-${color}.svg`), svg);
  await sharp(Buffer.from(svg)).resize({width:1416}).png().toFile(path.join(output, `wordmark-${color}.png`));
}
const original = await fs.readFile(path.join(source, 'symbol-name.svg'), 'utf8');
const symbol = joinLetters(original).replace(/translate\(10 890\) scale\([\d.]+\)/, `translate(10 890) scale(${(820 / 699.8).toFixed(6)})`);
await fs.writeFile(path.join(output, 'symbol-name.svg'), symbol);
await sharp(Buffer.from(symbol)).resize({width:840}).png().toFile(path.join(output, 'symbol-name.png'));
const manifest = JSON.parse(await fs.readFile(path.join(source, 'site.webmanifest'), 'utf8'));
manifest.name = manifest.short_name = 'ISITUSA';
await fs.writeFile(path.join(output, 'site.webmanifest'), JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({name:'ISITUSA',source:'Approved v4 glyph outlines with the extra word space removed',fontDependency:false,wordmarkWidth:707.8,wordmarkHeight:158},null,2)+'\n');
console.log('Generated ISITUSA v5: seven joined glyphs, SVG and PNG variants.');
