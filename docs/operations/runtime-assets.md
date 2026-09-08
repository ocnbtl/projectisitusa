# Public runtime assets

The app remains static. Research acquisition, compilation, and SQLite never run in request handlers.

## Preparing a release

1. Generate the existing canonical catalog and map inputs using their normal research gates. Do not hand-edit generated data.
2. Run `npm run assets:prepare`. This preserves source photos in `public/species`, creates hashed full-size WebP photos and thumbnails in ignored `public/optimized-species`, and updates the two tracked `src/data/runtime` manifests. Full images fit within 1280 pixels; thumbnails fit within 160 pixels. Credits and every non-image catalog field are preserved.
3. Run `npm run check:runtime-assets`. It verifies source/derivative hashes, complete catalog and map parity, shared-request caching, corruption rejection, and retry behavior.
4. Obtain a fresh R2 inventory and monthly operation counts. Pass a JSON preflight with `observedAt`, `bucket`, `bytes`, `monthlyClassAUpperBound`, `monthlyClassBUpperBound`, and `reservedResearchBytes` to `scripts/run-runtime-asset-publisher.ps1 -Preflight <path>`. The default is a plan. Add `-Publish` only within current publishing authority.
5. Publish both declared `app-data/sha256` objects BEFORE deploying the referencing application. The publisher refuses overwrites, validates decoded SHA-256 and length, verifies public delivery/CORS, and guards the existing 8 GB / operation ceilings including reserved research capacity. Keep prior objects for rollback clients.
6. Run the relevant app checks and production build, then commit the source changes and both manifests together. Never commit generated derivatives or compressed cache artifacts.

`npm run build` regenerates/verifies exactly the declared assets before Next.js builds. Codec versions are included in the recipe. A changed recipe or source requires explicit manifest regeneration and data publication; a build cannot silently point at unpublished data. In Vercel's disposable build workspace only, source photos and redundant public JSON are removed AFTER asset verification. The canonical originals and research evidence stay in Git.

## Delivery and compatibility

Map and catalog bundles are gzip JSON served directly by `https://data.isitusa.com` with year-long immutable caching. Their URLs encode the SHA-256 of decoded bytes. Browser code verifies the byte count and hash before parsing, shares requests within a session, and permits retry after failure. County switching reuses the catalog. Research pointer/manifest/object requests also go directly to the configured R2 origin with their existing integrity checks.

R2 CORS allows GET/HEAD from production domains, stable project aliases, and designated local test origins. Add an exact preview origin when needed. The app CSP permits that data origin. After changing CORS, Cloudflare documents that previously cached objects may require a cache purge scoped to the data hostname; verify real response headers before relying on the policy.

Species photos remain on Vercel because the existing R2 reserve cannot accommodate the image collection safely. Hashed derivatives are immutable. Legacy referenced image paths redirect to their full derivative, so cached clients retain image compatibility. Original photo files are retained locally for regeneration and evidence review.

## Release evidence and limits

The September 8, 2026 local verification measured homepage HTML 3,817,627 -> 11,166 bytes, RSC 3,543,960 -> 6,014 bytes, and unique packaged image derivatives of 295,025,492 bytes versus 815,114,828 original public image bytes. The two R2 bundles occupy 1,413,134 compressed bytes total. These are measured file/response sizes, not provider-billed storage or a forecast of metered savings.

Validate the exact production SHA and Ready deployment separately from the live alias. Exercise desktop/mobile map and county selection, filters, species profiles and attribution, deep links, research evidence, caching and retries. Confirm old image redirects on production where the original public files are absent. Retention and cleanup receipts belong with operations evidence; protect current production, useful rollbacks, and active branch previews. Historical storage charts and asynchronous provider cleanup cannot prove immediate reclaimed storage.
