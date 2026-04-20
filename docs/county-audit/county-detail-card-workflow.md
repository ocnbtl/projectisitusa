# County Detail And Card Workflow

## Purpose

County detail and county cards exist to turn county searches into something informative, shareable, and still source-disciplined.

The goal is not to manufacture local authority. The goal is to package Project Isitusa's current county view, verified local resource paths, and a short public summary into a useful county-level snapshot.

## What Can Appear In County Detail

- A generated county summary based on current mapped species counts, nearby watchlist counts, and county audit status
- Curated local resource links only when they are verified and attributable
- County-specific detections or regulatory notices only when they meet the county audit source bar
- Project Isitusa-derived stats such as mapped species count, nearby watchlist count, and unresolved county-coverage count

## What Must Not Appear

- A claim that a county has a verified invasive inventory when only statewide sources were reviewed
- A county-specific species claim copied from a generic extension office page
- Local organizations or public contacts that have not been verified in the county-detail source set
- Sensational urgency language unsupported by the current verified source record

## Current Data Source

Curated county detail lives in [src/data/source/county-details.ts](/Users/ocean/Code/Project%20Isitusa/src/data/source/county-details.ts:1) and is compiled into generated runtime JSON by [scripts/build-data.ts](/Users/ocean/Code/Project%20Isitusa/scripts/build-data.ts:1).

That means county detail follows the same static-first build pattern as the species catalog.

## County Card Presets

The first release uses six export presets:

- `Square` at `1080 x 1080` for general reposts and square feeds
- `Portrait` at `1080 x 1350` for Instagram feed-style posts
- `Story` at `1080 x 1920` for stories and reels
- `Landscape` at `1200 x 628` for wide previews and X-style sharing
- `Tall` at `1080 x 1620` for taller mobile-first posts
- `Widescreen` at `1920 x 1080` for 16:9 screens and embeds

## Preset Source Notes

The preset direction is anchored to official platform guidance checked on 2026-04-20:

- Instagram photo uploads support aspect ratios between `1.91:1` and `3:4`, up to `1080` pixels wide: https://www.facebook.com/help/1631821640426723/
- Instagram reels use `9:16` fullscreen vertical: https://www.facebook.com/help/1038071743007909/
- X currently supports `1:1`, `1.91:1`, `16:9`, `9:16`, `4:5`, and `2:3` image-ad formats: https://business.x.com/en/help/campaign-setup/creative-ad-specifications
- LinkedIn recommends `3:2` or `16:9` for organic article-linked post rendering and supports up to `4:5` for sponsored post imagery: https://www.linkedin.com/help/lms/answer/a1689427

These presets should be revisited whenever platforms materially change supported aspect ratios.

## Design Rules

- County cards should keep the county name obvious within the first glance
- The selected county must be highlighted inside a broader U.S. map where the state remains visible
- Use only a few hard stats so the card stays legible on phones
- Always include `isitusa.com` on the export
- Keep the tone serious and useful without resorting to hype

## Growth Loop Notes

- The county summary should be useful enough to screenshot or export without extra editing
- The county card should look finished in square, portrait, and story formats before less-common presets are prioritized
- County detail is allowed to fall back to a generated summary when no curated county detail exists yet
- Curated county detail should expand only as county audits produce verified local sources
