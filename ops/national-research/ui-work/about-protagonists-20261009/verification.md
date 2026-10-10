# About protagonists expansion

Prepared 2026-10-09 on codex/workspace-experience-20261009, base 3af34eeb93ad36c18fb1280d18a24ed8dc777c39.

## Attribution basis

- Harvard University: harvard-huh-usa-preserved-specimens, retained MA source coverage has 1,686 evidence pairs / 403 screened species in docs/research/generated/MA-progress.json. MAIN integration receipt harvard-metadata-integration-20260906-r2 also records 887 reviewed assertions across 39 runs.
- Smithsonian: smithsonian-nmnh-preserved-specimens, retained MA source coverage has 16 evidence pairs / 15 screened species in the same progress artifact.
- Cornell University: source references for Halyomorpha halys and Drosophila suzukii in src/data/source/species.ts and src/data/generated/species.json.
- Penn State: Allium leafminer source in src/content/editorial-published.json.
- University of Florida: multiple published references to IFAS and Florida Museum in src/content/editorial-published.json.
- University of Wisconsin-Madison: popcorn cassia horticultural reference in src/content/editorial-published.json.
- University of Georgia: institution label replaces EDDMapS label; retains that program's logo and link, with the relationship in its accessible description. It is not counted as another independent source.

These are source credits, not partnerships or endorsements. Existing disclaimer is preserved. Six additions bring the list from 11 to 17, including seven university labels. No county evidence, profiles, or source registry entries changed. Institution assets fetched from their official websites; URLs and SHA-256 recorded in assets.json. Smithsonian sunburst uses the Smithsonian's official Air and Space image, not the Libraries unit logo.

## Verification

- git diff --check: passed.
- Impeccable detector, page.tsx and about.css: passed (exit 0).
- Static layout preview uses the production document and styles with the exact updated source array, markup, and About CSS. It is a layout check, not a Next.js build or production deployment.
- Inspected desktop 1440px and mobile 390px captures. Tablet 820px DOM geometry verified. No horizontal overflow; all 17 logo images loaded. Mobile uses three columns and 12px source labels; intermediate widths retain the single centered identity/source block.
- Production build and release pending storage exception: 82.25 GB free of 1,999.28 GB (~4.1%), below 15% repository floor. Prior user override explicitly applied only to the earlier dashboard turn.
