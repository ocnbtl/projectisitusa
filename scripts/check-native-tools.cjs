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
  // Actual build and request-time processors run in separate Node processes.
  // Windows cannot safely load their different libvips DLL versions together.
  require('node:child_process').execFileSync(process.execPath,
    [path.join(__dirname, 'check-runtime-image-processor.cjs'), root], { stdio: 'inherit' });
  const resolved = new (load('unrs-resolver').ResolverFactory)().sync(root, './package.json');
  assert.ok(resolved.path?.endsWith('package.json'), 'Native resolver must work');
  console.log('Native tool checks passed: esbuild transform, offline PNG encode/decode, patched request-time WebP processing, and native path resolution.');
})().catch(error => { console.error(error); process.exitCode = 1; });
