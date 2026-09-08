import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const RUNTIME_IMAGE_CACHE_MAX_BYTES = 320 * 1024 * 1024;

export function validImageDescriptor(asset) {
  return /^[a-f0-9]{64}$/.test(asset?.sha256 ?? '')
    && asset.src === `/optimized-species/${asset.sha256}.webp`
    && Number.isSafeInteger(asset.bytes) && asset.bytes > 0;
}

export function readVerifiedImage(filename, asset) {
  if (!validImageDescriptor(asset) || !existsSync(filename)) return null;
  const stat = lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== asset.bytes) return null;
  const bytes = readFileSync(filename);
  return sha(bytes) === asset.sha256 ? bytes : null;
}

// Next.js/Vercel restore .next/cache before the build command. This namespace
// contains only disposable, content-addressed copies of declared derivatives.
// Originals, the committed recipe and the source hash still govern eligibility.
export function createRuntimeImageCache(root, maxBytes = RUNTIME_IMAGE_CACHE_MAX_BYTES) {
  assert.ok(Number.isSafeInteger(maxBytes) && maxBytes >= 0);
  const directory = path.join(path.resolve(root), '.next/cache/isitusa-runtime-images-v1');
  mkdirSync(directory, { recursive: true });
  assert.ok(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), 'Invalid runtime image cache directory');
  const retained = new Set();
  let bytes = 0;
  return {
    read(asset) {
      if (!validImageDescriptor(asset)) return null;
      return readVerifiedImage(path.join(directory, `${asset.sha256}.webp`), asset);
    },
    remember(asset, content) {
      assert.ok(validImageDescriptor(asset) && content.length === asset.bytes && sha(content) === asset.sha256, 'Invalid image cache content');
      const name = `${asset.sha256}.webp`;
      if (retained.has(name) || bytes + content.length > maxBytes) return;
      const filename = path.join(directory, name);
      if (existsSync(filename)) {
        const stat = lstatSync(filename);
        assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'Invalid image cache entry');
      }
      if (!readVerifiedImage(filename, asset)) writeFileSync(filename, content);
      retained.add(name);
      bytes += content.length;
    },
    finish() {
      let removed = 0;
      // Only our recognized regular files are removed, within this fixed cache
      // directory. Never recurse or touch unrelated Next.js cache entries.
      for (const name of readdirSync(directory)) {
        if (!/^[a-f0-9]{64}\.webp$/.test(name) || retained.has(name)) continue;
        const filename = path.join(directory, name);
        const stat = lstatSync(filename);
        if (stat.isFile() && !stat.isSymbolicLink()) { unlinkSync(filename); removed++; }
      }
      return { bytes, objects: retained.size, maxBytes, removed };
    },
  };
}
