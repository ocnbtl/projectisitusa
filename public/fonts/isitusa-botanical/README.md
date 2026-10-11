# ISITUSA Botanical

Approved sculptural ISITUSA capitals with a readable heading companion. I, S, T, U and A are original outlines; the T shares its upper concave shoulder geometry with I and U. All acronym assets and heading text use the same glyph master, including A. Other glyphs derive from Chonburi by Cadson Demak (copyright 2015), SIL OFL 1.1; the fine strokes are reinforced by 8 design units per edge for heading legibility. No NYBG outlines or proprietary font software are used.

Rebuild: `python scripts/build-brand-v9.py public/fonts/isitusa-botanical/Chonburi-source.ttf`, then `node scripts/render-brand-v9.mjs`. Requires FontTools, Brotli and skia-pathops; no application dependency changes. The source is included for reproducibility, together with its unmodified license.

Use weight 800 without synthetic bold/italic for headings. Paragraphs, navigation, input fields, buttons and dense data use the existing body sans. SVG exports contain real vector outlines from the same font, not raster concept lettering.
