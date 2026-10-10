const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
// Optional argument lets sparse local checkouts use the canonical installed dependencies.
const root = path.resolve(process.argv[2] || '.');
const load = createRequire(path.join(root, 'package.json'));
(async () => {
  const result = load('esbuild').transformSync('const value: number = 1', { loader: 'ts' });
  assert.match(result.code, /value = 1/);
  const sharp = load('sharp');
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#ffffff' } }).png().toBuffer();
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 2); assert.equal(meta.format, 'png');
  const runtimeLoad = createRequire(load.resolve('next/package.json'));
  const runtimeSharp = runtimeLoad('sharp');
  assert.equal(runtimeSharp.versions.sharp, '0.35.5', 'The request-time image processor must use the patched version');
  assert.equal((await runtimeSharp(png).webp().toBuffer()).length > 0, true);
  const resolved = new (load('unrs-resolver').ResolverFactory)().sync(root, './package.json');
  assert.ok(resolved.path?.endsWith('package.json'), 'Native resolver must work');
  console.log('Native tool checks passed: esbuild transform, offline PNG encode/decode, patched request-time WebP processing, and native path resolution.');
})().catch(error => { console.error(error); process.exitCode = 1; });
