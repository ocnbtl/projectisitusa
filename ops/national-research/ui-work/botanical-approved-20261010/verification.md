# Approved botanical lettering release

## Scope and authority

User approved the merged Botanical Sculpture/Carved Canopy direction, requested matching concave curves on both T shoulders, consistent logo/heading lettering, readable body type, and production publication. Base: fe3914009a4c92b7ee9ad1d92d14a6dd64287fc3 on codex/workspace-experience-20261009. Existing unrelated lease changes and untracked review materials remain untouched.

## Implementation

- Five custom capitals follow the approved sculptural concept. I/T/U shoulder segments share control-point geometry. All logo SVGs and heading font export from the same master; no alternate A.
- Chonburi-derived companion letters retain readable lowercase, with fine strokes reinforced by 8 design units per edge. Font source and OFL license included. This is a custom derivative, not a claim that the entire alphabet is original.
- Versioned v9 assets and ISITUSA Botanical font replace v8 references in active header, footer, About, brand kit and root preload. Existing body sans, symbol and favicon retained.
- Semantic headings adopt the shared family. Body paragraphs, controls and dense evidence labels keep the readable sans.
- Font/artwork export totals 615,920 bytes, below the previously approved 2 MB bound. No local website build, package install, research generation, payment or email submission.

## Verification so far

- PASSED: application lint, 173 files, zero warnings/errors.
- PASSED: TypeScript no-emit check.
- PASSED: scoped diff whitespace check; existing mixed line endings preserved for unchanged lines.
- PASSED: vector specimen review, including the corrected T and full name.
- PASSED: hosted build and responsive rendered page checks; see release evidence below.

Functional contracts: research, payment, authentication, form delivery and analytics unchanged. Typography and asset references intentionally changed with approval. Browser checks cover font loading, logo asset versions, body font separation, heading fit, light/dark contrast and overflow at mobile, tablet, desktop and ultrawide widths.

## Hosted preview and responsive review

- First preview: 3812b1bedea379bac551a5fe845de9c831c67dc6, deployment 8bCcNVkqKNdxssVEzcJMzAvyEyvz, READY. Corrected three unrelated Unicode symbols introduced during text export in follow-up c5da9da23c8db3863a4adcb72a1ad426f6e1fe27; lint again passed.
- Browser-rendered About reviewed at simulated 390, 768, 1440 and 2560 widths, light/dark. Document widths stayed within viewport (375,753,1425,2545 respectively, accounting for scrollbar).
- Mobile Support, species profile /species/artemisia-absinthium and Brand kit reviewed. Headings compute ISITUSA Botanical; paragraphs compute Avenir Next/Segoe UI sans. All current brand images load and download links resolve to v9 and the Botanical font.
- FontTools outline check: each of seven acronym SVG glyphs equals its font glyph outline. WOFF2/TTF character maps match; WOFF2 is 15,876 bytes with 343 glyphs.
- Preview catalog load limitation traced to data.isitusa.com origin policy: HEAD returned 200 with Access-Control-Allow-Origin https://isitusa.com for production and no allow-origin for preview. Existing production catalog visibly loaded 2,504 species. No data, dataset manifest, CORS or runtime-fetch code changed.
- Build retains existing text-encoding deprecation and development-dependency audit notices. Production dependency audit is a required build gate; no dependencies changed in this release.
- One extra consistency scope: participation-delivery email image changes from /brand/v8/symbol-name.png to /brand/v9/symbol-name.png after asset publication. Existing deployed source version 16 retained byte-for-byte apart from this URL; no recipients, credentials, delivery controls or authentication changes.

- Corrected preview GhJVj5Q22fcskJP7yhX71xuiEsUP reached READY; exact c5da9da source verified. Browser confirmed Unicode arrow restored and v9 font/image references. Build log explicitly reports zero production vulnerabilities, coherent research release and successful compilation.
- Production promotion requested for c5da9da23c8db3863a4adcb72a1ad426f6e1fe27: Dm65KiPw2u2dtJx3U8U6aZ7qByyu (projectisitusa-2odm3fmbi-unigentamos.vercel.app). READY and live alias verified below.

## Production result

- GO for this scoped typography release. Production deployment Dm65KiPw2u2dtJx3U8U6aZ7qByyu reached READY in 4m23s on 2026-10-10 20:21 EDT; source c5da9da23c8db3863a4adcb72a1ad426f6e1fe27. isitusa.com alias visibly assigned.
- Live /about at 1280 and 390 simulated widths: v9 image references loaded, Botanical computed heading family, Avenir Next/Segoe UI paragraph family, no horizontal overflow. Light desktop and dark mobile screenshots saved beside this receipt.
- Live /species loaded 2,504 species using the new heading family and v9 header artwork. Original production-domain data policy retained.
- Live manifest version 9 and master SHA d72d0fc72ac125c8e4f14f31a542cafee403699406e6a5bab1dba03cb63e044c match local output. WOFF2 returns HTTP 200, font/woff2, 15,876 bytes. Email logo PNG returns 200.
- Email function participation-delivery version 17 ACTIVE. Retrieved all deployed files and verified exact prepared source, ignoring trailing whitespace; only logo URL changed from version 16. Anonymous POST still returns 401 Unauthorized. No email sent by this validation.
- Rollback: Vercel prior production 5xSRAQ2QQBWAihgbKssYHYTK2gX3, source 09a89aa8f513b8fa5b931990a56377fb591530f7. Email prior version 16 uses retained v8 artwork.
- No new functional blockers. Existing development dependency/deprecation notices remain outside this typography scope. This release does not claim a full security audit, actual device testing, or new payment/email-delivery testing.
