# Canopy correction verification - 2026-10-10

- User approved the bounded local brand export despite the disk floor. Export contains 404,107 bytes across the 19 brand/font files, below the 2 MB limit; no local website build ran.
- Original A-Z/a-z outlines share one master for all logo placements and the full-name SVG/font. The correction enlarges A's counter from 74 to 162 design units and strengthens S/s/c/e terminal curves.
- Canonical master SHA256: 212f8552c25ffe75a82159320c8ac04b1d3f7510f8e63aeb8c84422c15aac086.
- Six PNGs carry deterministic SVG origin metadata. Impeccable provenance scan: 6 rasters, 0 missing.
- Prior v8 typecheck/scoped lint and Vercel preview build passed; corrected outline build awaits hosted review.
- Email worker's nine network-free behavior checks passed with the new v8 image URL. The live worker remains v15 until the production v8 PNG is available.
- Zoho sender-avatar investigation is in zoho-identity.md. No claim of BIMI activation or avatar delivery is made.

- Final verdict: ship at the three-fix scope (A counter, S/s/c/e terminals, design documentation); all three resolved. Five valid hosted captures cover 1440 light/dark, 390 light/dark, and 2560 light. No horizontal overflow at the tested widths.
- Visual correction preview b548fdf2c6: 2TR7M6kw2rfvGMgWM8414ELT65M9 READY; hosted lint passed for 173 application files with zero warnings/errors, production dependency audit reported zero vulnerabilities, compilation and type checks completed.
- Release candidate 09a89aa8f513b8fa5b931990a56377fb591530f7 adds only documentation, PNG provenance metadata, and the email image reference to the rendered correction.

- Production deployment 5xSRAQ2QQBWAihgbKssYHYTK2gX3 is READY from 09a89aa8f513b8fa5b931990a56377fb591530f7, aliased to isitusa.com. Live /about loads Canopy and all v8 brand images; no horizontal overflow at 1440 or 390. Screenshot .impeccable/review/canopy-production.jpg.
- Public v8 manifest returns 200 and master 212f8552c25ffe75a82159320c8ac04b1d3f7510f8e63aeb8c84422c15aac086; email symbol-name PNG returns 200 image/png.
- participation-delivery version16 is ACTIVE; only the image URL changed from v7 to v8. Custom DELIVERY_JOB_SECRET authentication retained. Bundle hash af151fa6adc2755a32d4ea64f06553d98a4758c4cf8716bdcdc31fc580f1a607. Existing real delivery was previously confirmed by user; this image-only update did not send another email.
- Zoho inbox avatar remains blocked on owner trademark/VMC and authentication work described in zoho-identity.md; no false completion claim.
