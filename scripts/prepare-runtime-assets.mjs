import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { createRuntimeImageCache, readVerifiedImage, validImageDescriptor } from './runtime-image-cache.mjs';

// Originals are immutable build inputs. Derivatives are generated, never committed.
const root = process.cwd();
const startedAt = performance.now();
const imageCache = createRuntimeImageCache(root);
const write = process.argv.includes('--write');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => Buffer.from(`${JSON.stringify(value)}\n`);
const read = name => JSON.parse(readFileSync(path.join(root, 'src/data/generated', name)));
const manifestPath = path.join(root, 'src/data/runtime/image-assets.json');
const prior = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath)) : {};
const recipe = { format: 'webp', full: { edge: 1280, quality: 82 }, thumbnail: { edge: 160, quality: 80 }, effort: 4, sharp: sharp.versions };
const recipeSha = sha(json(recipe));
const catalog = read('species.json');
const explorer = read('explorer-species.json');
const sources = [...new Set([...catalog, ...explorer].map(s => s.image?.src).filter(s => s?.startsWith('/species/')))].sort();
mkdirSync(path.join(root, 'public/optimized-species'), { recursive: true });
mkdirSync(path.join(root, 'src/data/runtime'), { recursive: true });
mkdirSync(path.join(root, '.cache/runtime-assets'), { recursive: true });
sharp.concurrency(1);
const assets = {};
let originalBytes = 0, derivativeBytes = 0, generated = 0, restored = 0, reused = 0;
for (const src of sources) {
  const sourcePath = path.resolve(root, `public${src}`);
  if (!sourcePath.startsWith(path.resolve(root, 'public/species') + path.sep)) throw new Error(`Unsafe image path: ${src}`);
  const input = readFileSync(sourcePath);
  const sourceSha256 = sha(input);
  originalBytes += input.length;
  const cached = prior.recipeSha256 === recipeSha && prior.assets?.[src];
  const entry = { sourceSha256 };
  for (const variant of ['full', 'thumbnail']) {
    const saved = cached?.sourceSha256 === sourceSha256 && cached[variant];
    const savedPath = validImageDescriptor(saved) && path.join(root, 'public', saved.src);
    let verified = savedPath && readVerifiedImage(savedPath, saved);
    if (verified) {
      entry[variant] = saved;
      reused++;
    } else if (savedPath && (verified = imageCache.read(saved))) {
      writeFileSync(savedPath, verified);
      entry[variant] = saved;
      restored++;
    } else {
      const { edge, quality } = recipe[variant];
      const bytes = await sharp(input).rotate().resize(edge, edge, { fit: 'inside', withoutEnlargement: true }).webp({ quality, effort: recipe.effort }).toBuffer();
      const digest = sha(bytes);
      const url = `/optimized-species/${digest}.webp`;
      writeFileSync(path.join(root, 'public', url), bytes);
      entry[variant] = { src: url, sha256: digest, bytes: bytes.length };
      generated++;
      verified = bytes;
    }
    imageCache.remember(entry[variant], verified);
    derivativeBytes += entry[variant].bytes;
  }
  assets[src] = entry;
  if (Object.keys(assets).length % 200 === 0) console.log(`Prepared ${Object.keys(assets).length}/${sources.length} species images.`);
}
const cache = imageCache.finish();
const imageManifest = { schemaVersion: 1, recipe, recipeSha256: recipeSha, assets };
function outputManifest(file, value) {
  const bytes = json(value);
  if (write) writeFileSync(file, bytes);
  else if (!existsSync(file) || !readFileSync(file).equals(bytes)) throw new Error(`Runtime assets changed: run npm run assets:prepare, publish the declared R2 data, then commit ${path.relative(root, file)}.`);
}
outputManifest(manifestPath, imageManifest);
function withImages(species) {
  return species.map(item => {
    const asset = assets[item.image?.src];
    return asset ? { ...item, image: { ...item.image, src: asset.full.src, thumbnail: asset.thumbnail.src } } : item;
  });
}
const map = { allSpecies: withImages(explorer), countyIndex: read('counties.json'), countyDetails: read('county-details.json'), presenceIndex: read('explorer-presence.json'), datasetSnapshot: read('snapshot.json') };
const bundles = {};
for (const [name, value] of Object.entries({ map, catalog: withImages(catalog) })) {
  const bytes = json(value);
  const digest = sha(bytes);
  const objectKey = `app-data/sha256/${digest}.json`;
  const compressed = gzipSync(bytes, { level: 9 });
  writeFileSync(path.join(root, '.cache/runtime-assets', `${digest}.json.gz`), compressed);
  bundles[name] = { url: `https://data.isitusa.com/${objectKey}`, sha256: digest, bytes: bytes.length, storedBytes: compressed.length };
}
outputManifest(path.join(root, 'src/data/runtime/data-assets.json'), { schemaVersion: 1, bundles });
const report = { sources: sources.length, originalBytes, derivativeBytes, generated, restored, reused, cache, elapsedMs: Math.round(performance.now() - startedAt), bundles };
writeFileSync(path.join(root, '.cache/runtime-assets/build-report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
