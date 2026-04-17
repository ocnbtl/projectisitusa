# Chunk 2I Report

## Scope

Chunk 2I is the first deliberate correction pass after the plant-heavy `2H` scale-up. It adds `28` curated profiles and raises the curated total from `192` to `220`.

Profiles added in this batch:

- Soybean Aphid
- European Pine Sawfly
- Cereal Leaf Beetle
- Hessian Fly
- Pink Hibiscus Mealybug
- Calico Scale
- Pear Thrips
- Southern Green Stink Bug
- Cabbage White Butterfly
- Port-Orford-Cedar Root Disease
- Phytophthora Root Rot
- Southern Corn Leaf Blight
- Stem Rust
- Scleroderris Canker
- Mediterranean Gecko
- Monk Parakeet
- Green Iguana
- Giant Applesnail
- Round Goby
- Walking Catfish
- African Jewelfish
- Greenhouse Frog
- Blue Tilapia
- Brown Trout
- Jointed Goatgrass
- Japanese Chaff Flower
- Chocolate Vine
- Crow Garlic

## Contradictions Resolved

The planning contradiction going into `2I` was that category repair and source discipline did not support the hoped-for `35 to 45` size cleanly.

That contradiction stays explicit here:

- The batch did not chase the old numeric target.
- It landed at `28` because that was the source-ready mixed set that still supported species-specific copy.
- The stronger second-source rule was applied to the thinnest public-facing candidates instead of being waived away.

Another contradiction was the production concern after `782788c`.

That was checked before drafting:

- `https://isitusa.com` and `/about` returned `200`.
- Sampled `2H` species pages rendered correctly at their actual scientific-name slugs.
- `www.isitusa.com` still failed DNS resolution and remains unresolved, but that did not block content drafting.

## What Improved

- Category balance is materially better than `2H`. The batch leans into insects, wildlife, and fungi-diseases without pretending weak candidates were ready.
- The action language stayed more nuanced than a generic invasive-species template. Crop pests, fish, reptiles, and pathogens each needed different caution levels and different public advice.
- The second-source rule helped on the thin edge cases. `Mediterranean Gecko`, `Brown Trout`, and `Chocolate Vine` now have broader grounding than a single thin source would have allowed.
- Public-facing naming cleanup continued where it helped readability. `Phytophthora lateralis` and `Phytophthora cinnamomi` were given clearer common-name treatments instead of both staying as undifferentiated `Root rot`.

## Weak Spots In This Batch

- Several crop pests still depend on specialized extension language. The public framing is workable, but some profiles are naturally more grower-specific than homeowner-specific.
- A few wildlife profiles are inherently uneven in urgency. `Green Iguana` and `Giant Applesnail` have strong public action paths, while `Mediterranean Gecko` and `Brown Trout` required more careful tone to avoid overstating harm.
- The fungi-disease category remains sourceable but narrow. It was possible to add five strong entries, but the next disease-heavy expansion will still need careful screening.

## Process Lessons

- Category repair is possible without dropping quality, but it reduces batch size unless the source ecosystem is unusually strong.
- Thin wildlife candidates are manageable if the public action path is honest. Not every profile needs to sound urgent to be useful.
- The validator remains a strong floor, not a quality ceiling. Distinctness and tone still need manual attention once the batch moves beyond common weeds.
- The mixed-category model is sustainable, but only if the backup pool remains optional instead of becoming quota filler.

## Recommendation For The Next Batch

1. Treat `2I` as proof that mixed batches work best when the non-plant pool is curated more aggressively than the plant pool.
2. Keep using a backup pool, especially for wildlife and disease candidates that are easy to overstate.
3. Continue applying second sources to thin but high-value species instead of excluding them automatically.
4. Do not treat `28` as failure. In this pass it was the quality-safe answer to the real source mix.

## Post-Deploy Verification

Post-deploy spot-checks were run on `2026-04-17` after `e0654e3` reached GitHub.

Confirmed live on the apex domain:

- `https://isitusa.com/species/aphis-glycines`
- `https://isitusa.com/species/iguana-iguana`
- `https://isitusa.com/species/phytophthora-cinnamomi`
- `https://isitusa.com/species/achyranthes-japonica`

Each sampled page rendered with the expected summary, section structure, source attribution, and image block.

The domain contradiction remains unresolved:

- `https://isitusa.com` returned `200`.
- `https://www.isitusa.com` still failed DNS resolution in a direct check.

That `www` issue is still separate from the content rollout and should remain tracked as infrastructure follow-up, not folded into the chunk as if it were resolved.
