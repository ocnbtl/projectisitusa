# Invasive Serif 1.001 refinement

- Owner requested h height correction and tighter final logo S/A spacing.
- h top serif moved down 20 units, 720 to 700, matching T. Only points 31-38 moved; shoulder, outline flags, x coordinates and all other points preserved.
- All other glyphs, hmtx, GPOS, cmap, hhea and prep match the immutable master in both TTF and WOFF2. 297 encoded characters retained.
- Logo-only U-S adjustment -16 units and S-A -10 units. Final bounding gaps 20 and 12 units; no outline intersections. Other logo positions unchanged. Width 3750 to 3724; app aspect ratios updated.
- Browser proof visually inspected at heading and logo sizes. Browser viewport override did not persist, so no broad responsive claim is made. Comparison screenshot records actual 508px viewport.
- Application lint: 174 files, zero warnings/errors. Typecheck passed. Publication regression checks passed.
- No changes to research data, public projections, payment, email, or authentication logic.
- Original master SHA256 301e8b150eac3f11c0a51d8df119caaebe72e857ac40c585b2cdd11ba316d576 preserved.
- Production verification pending.
