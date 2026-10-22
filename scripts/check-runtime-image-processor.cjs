const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const load = createRequire(path.join(path.resolve(process.argv[2] || '.'), 'package.json'));
const runtimeLoad = createRequire(load.resolve('next/package.json'));
const sharp = runtimeLoad('sharp');
(async () => {
  assert.equal(sharp.versions.sharp, '0.35.5', 'The request-time image processor must use the patched version');
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
  assert.equal((await sharp(png).webp().toBuffer()).length > 0, true);
})().catch(error => { console.error(error); process.exitCode = 1; });
