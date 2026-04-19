# Chunk 2M Report

## Scope

Chunk `2M` is a second large same-pass weed-ID batch built around one strong official source ecosystem instead of a forced mixed-category backlog. It adds `32` curated profiles and raises the curated total from `262` to `294`.

Profiles added in this batch:

- Red Clover
- Hairy Vetch
- Field Brome
- Corn Speedwell
- Redtop
- Yellow Salsify
- Purple Deadnettle
- Ivyleaf Speedwell
- Sticky Chickweed
- Lesser Swinecress
- Japanese Clover
- Sulphur Cinquefoil
- Catnip
- Common Speedwell
- Dovefoot Geranium
- Corn Spurry
- Purple Nutsedge
- Rescuegrass
- Timothy Grass
- Bermudagrass
- Giant Foxtail
- Hairy Cat's Ear
- Tall Oatgrass
- Sweet Vernalgrass
- Moth Mullein
- Deptford Pink
- Rabbitfoot Clover
- Hedgemustard
- Littlepod False Flax
- Birdeye Speedwell
- Red Sandspurry
- Gallant Soldier

## Contradictions Resolved

The recommendation after `2L` was to return to a smaller mixed batch next. The user then asked for another `30+` pass anyway.

That recreated the same core contradiction:

- the mixed category backlog still is not deep enough to support another quality-safe `30+` pass
- the strongest remaining source ecosystem was not Penn State this time, but Virginia Tech Weed Identification
- forcing insects, wildlife, and fungi-disease balance into the batch would have meant thinner source stacks and flatter copy

This chunk resolves that contradiction directly:

- `2M` is again plant-heavy
- it uses a second official weed-ID cluster rather than pretending the mixed backlog suddenly improved
- the earlier smaller-mixed recommendation is deferred because the user explicitly prioritized another large pass

There was also another meaningful public-name cleanup layer in this chunk:

- `Vicia villosa` now uses `Hairy Vetch` instead of `Winter vetch`
- `Cyperus rotundus` now uses `Purple Nutsedge` instead of `Nutgrass`
- `Setaria faberi` now uses `Giant Foxtail` instead of `Japanese bristlegrass`
- `Veronica persica` now uses `Birdeye Speedwell` instead of relying on the source page name `Persian speedwell`

## What Improved

- The catalog filled another large block of common field, roadside, turf, and pasture weeds that still had strong county coverage but no curated treatment.
- The second-source-cluster test succeeded. Large batches are still possible when the source ecosystem is coherent, even though the actual domain changed from Penn State to Virginia Tech.
- Several recurring weed families now have better internal coverage, especially speedwells, clovers, bromes, and cool-season turf or field grasses.
- The curated layer keeps correcting awkward public labels that would otherwise make registry-only pages feel weaker and less trustworthy.

## Weak Spots In This Batch

- This is still not the mixed category repair the broader plan ideally wants, and that is a real tradeoff rather than a hidden one.
- Some species in this group are management-goal weeds more than high-drama invaders, especially old forage and seeded-cover holdovers such as Red Clover, Timothy Grass, and Sweet Vernalgrass.
- A single-domain weed-ID cluster is efficient, but future large passes still need careful editing discipline so the prose does not flatten into repeated lawn-or-field language.

## Process Lessons

- A second `30+` batch was possible only because another dense official source cluster existed. That does not prove every remaining backlog segment can scale the same way.
- Common-name cleanup continues to be one of the highest-value results of curation, especially for grasses and weedy legumes where registry labels often undersell the actual public name.
- Large same-pass weed batches remain viable, but only when the shortlist is built around a real source ecosystem and not around a volume target by itself.

## Recommendation For The Next Batch

1. Do not assume a third `30+` pass is automatically the right next move just because `2L` and `2M` both landed.
2. Recheck whether category repair can finally resume with a smaller mixed batch after this chunk.
3. Keep documenting the source-cluster tradeoff explicitly whenever batch size and category balance conflict.

## Post-Deploy Verification

Post-deploy spot-checks were run on `2026-04-19` after `7decc09` reached production.

Confirmed live:

- `https://isitusa.com`
- `https://isitusa.com/about`
- `https://isitusa.com/species/trifolium-pratense`
- `https://isitusa.com/species/cyperus-rotundus`
- `https://isitusa.com/species/setaria-faberi`
- `https://isitusa.com/species/galinsoga-parviflora`

Each sampled species page rendered with the expected summary, section structure, source attribution, action block, and hero image.

The earlier `www` contradiction is no longer open:

- `https://www.isitusa.com` returned live homepage HTML on `2026-04-19`.
- Exact first-hop redirect headers were not revalidated in this step because direct header-only checks were unreliable from the current sandboxed session.

One real contradiction did surface during the spot-check:

- some `2M` pages with public-name cleanup were still exposing stale registry-style hero-image alt text from the image manifest, even though the visible curated common names were correct

That issue was verified on production for `Purple Nutsedge` and `Giant Foxtail`, and the build pipeline was updated so curated profiles that inherit a manifest image now derive the alt label from the curated common name instead of the stale upstream manifest name.
