# Chunk 2H Report

## Scope

Chunk 2H is the first deliberate scale-up test beyond the `18 to 25` sub-batch range. It adds `50` curated profiles and raises the curated total from `142` to `192`.

Profiles added or upgraded in this batch:

- White Clover
- Curly Dock
- Common Mullein
- Shepherd's Purse
- Black Medick
- Lambsquarters
- Queen Anne's Lace
- Prickly Lettuce
- Buckhorn Plantain
- Henbit
- Bull Thistle
- Common Chickweed
- Common Sheep Sorrel
- Chicory
- Ground Ivy
- Field Pennycress
- Common Burdock
- Common Plantain
- Orchardgrass
- Quackgrass
- Barnyardgrass
- Wintercreeper
- Chinese Wisteria
- Japanese Privet
- Border Privet
- Japanese Hop
- Japanese Climbing Fern
- Chinese Silvergrass
- Dalmatian Toadflax
- Diffuse Knapweed
- Yellow Bluestem
- Bishop's Goutweed
- Bigleaf Periwinkle
- Sacred Bamboo
- Sweet Autumn Clematis
- Small Carpgrass
- Scotch Thistle
- Brazilian Waterweed
- Wine Raspberry
- Erect Hedgeparsley
- Bird Vetch
- Alligatorweed
- Creeping Buttercup
- Smooth Brome
- Watercress
- Orange Daylily
- Moneywort
- White Sweet Clover
- Common Velvetgrass
- Goosegrass

## Contradictions Resolved

The user asked whether the next pass could scale to `50 to 100` profiles at a time. After rechecking the remaining source-ready pool and grouped source coverage, a `50`-profile pass was judged feasible, but a `100`-profile pass was not quality-safe yet.

That contradiction is explicit in this batch:

- The workflow was scaled up substantially, but not all the way to `100`, because source quality and copy distinctness would have dropped too far.
- The batch is intentionally plant-heavy. That is not a balance mistake. It reflects where official public guidance is strongest for a scale test of this size.
- Several raw registry names were corrected instead of being carried through as-is:
  - `Narrowleaf plantain` -> `Buckhorn Plantain`
  - `Lesser burdock` -> `Common Burdock`
  - `Winter creeper` -> `Wintercreeper`
  - `Sweet autumn virginsbower` -> `Sweet Autumn Clematis`
  - `Scotch cottonthistle` -> `Scotch Thistle`
  - `White melilot` -> `White Sweet Clover`
  - `Indian goosegrass` -> `Goosegrass`
  - `Henbit deadnettle` -> `Henbit`

Those are deliberate public-facing fixes, not accidental rewrites.

## What Improved

- The grouped-source strategy held up at a much larger size. Penn State plant ID pages covered a large block of common weeds cleanly, while extension and agency sources carried the stronger ornamental escape, prairie, and aquatic invaders.
- The batch kept more nuance than a larger pass usually would. Several species are framed as persistent naturalized weeds rather than being overstated as emergency invaders.
- The action guidance stayed conservative. Yard weeds were mostly handled as `diy`, stronger habitat invaders shifted to `both`, and aquatic or harder-to-contain species stayed `report`-first.
- The naming cleanup became even more important at this size. A 50-profile pass exposes awkward registry labels very quickly.

## Weak Spots In This Batch

- The source base is broad, but some of the lower-signal naturalized weeds still rely on one main source. The profiles are supportable, though not as deep as the best two-source species pages.
- The plant-heavy composition is the right tradeoff for quality, but it does reduce category variety compared with some earlier mixed batches.
- Sentence rhythm needed more active monitoring in this pass. It did not collapse into obvious boilerplate, but this is now the main scaling risk.

## Process Lessons

- `50` is feasible when the batch is selected around source ecosystems first, not raw county count first.
- The right scale-up method is not writing faster. It is narrowing the candidate pool to species that can still produce specific identification and action language at higher volume.
- Not every curated page needs the same urgency. The larger the batch gets, the more important it is to distinguish between nuisance weeds, landscape escapees, pasture problems, and report-first aquatic or natural-area species.
- `100` still looks premature. The bottleneck is not remaining species count. It is quality control on sourcing, action nuance, and repetition.

## Recommendation For The Next Batch

The next sub-batch does not need to drop all the way back to `24`, but it also should not jump straight to `100`.

Recommended next step:

1. Treat `35 to 50` as the current upper safe range while this larger-batch style is still being refined.
2. Keep using source clusters, but add a stronger second-source rule for the species that feel most thin or most easily templated.
3. Continue prioritizing species where public-facing naming correction clearly improves usability.
4. If the next scale-up attempt goes larger than `50`, it should only happen after verifying that the copy still reads like curated species pages instead of grouped weed summaries.
