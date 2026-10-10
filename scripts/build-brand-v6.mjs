import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public/brand/v6');
await fs.mkdir(output, { recursive: true });
// A single custom capital system: 100-unit cap height, 21-unit stems,
// 19-unit horizontals, curved overshoot and optically spaced pairs.
// Filled outlines remain sharp without fonts or unequal glyph scaling.
const glyphs = {
  I: 'M0 0H21V100H0Z',
  S: 'M70 9L60 26C52 20 43 17 33 17C24 17 19 20 19 26C19 32 25 35 39 39C61 45 74 53 74 71C74 90 58 102 36 102C21 102 7 97 -1 89L10 72C18 79 28 83 38 83C48 83 54 79 54 73C54 67 47 64 33 60C13 55 -1 47 -1 29C-1 10 14 -2 35 -2C49 -2 61 2 70 9Z',
  T: 'M0 0H78V19H49.5V100H28.5V19H0Z',
  U: 'M0 0H21V61C21 75 26 82 39 82C52 82 57 75 57 61V0H78V62C78 88 63 102 39 102C15 102 0 88 0 62Z',
  A: 'M0 100L35 0H57L92 100H69L62 78H30L23 100ZM36 59H56L46 27Z',
};
const positions = [0, 35, 124, 159, 250, 343, 428];
const letters = [...'ISITUSA'].map((letter, i) => `<path data-letter="${letter}" transform="translate(${positions[i]} 0)" d="${glyphs[letter]}"/>`).join('');
const width = 532, height = 116;
for (const [name, color] of Object.entries({green:'#00583B', white:'#FFFFFF', black:'#111111'})) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" fill="${color}" fill-rule="evenodd" role="img" aria-label="ISITUSA"><title>ISITUSA</title><g transform="translate(6 8)">${letters}</g></svg>\n`;
  await fs.writeFile(path.join(output, `wordmark-${name}.svg`), svg);
  await sharp(Buffer.from(svg)).resize({width:1596}).png().toFile(path.join(output, `wordmark-${name}.png`));
}
const previous = await fs.readFile(path.join(root, 'public/brand/v5/symbol-name.svg'), 'utf8');
const marker = '<g transform="translate(10 890)';
const cut = previous.indexOf(marker);
if (cut < 0) throw new Error('Missing previous emblem boundary');
// Byte-preserve the approved emblem; replace only the lettering beneath it.
const symbol = previous.slice(0, cut) + `<g transform="translate(10 895) scale(${820 / 520})">${letters}</g></svg>\n`;
await fs.writeFile(path.join(output, 'symbol-name.svg'), symbol);
await sharp(Buffer.from(symbol)).resize({width:840}).png().toFile(path.join(output, 'symbol-name.png'));
await fs.copyFile(path.join(root, 'public/brand/v5/site.webmanifest'), path.join(output, 'site.webmanifest'));
await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({name:'ISITUSA', version:6, fontDependency:false, wordmarkWidth:width, wordmarkHeight:height, capHeight:100, stemWeight:21, horizontalWeight:19, curvedOvershoot:2, glyphPositions:positions, emblem:'Unchanged v3 approved contours'}, null, 2)+'\n');
console.log('Generated refined ISITUSA outlines and proportional emblem lockup.');
