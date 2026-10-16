# Official source-logo variants

Reviewed 2026-10-16. Scope: Minnesota, Cornell, USDA and EPA on About.

- Minnesota: existing Block M paths from https://twin-cities.umn.edu/ retained byte-for-byte; dark variant changes only fill from maroon to official gold #ffcc33. Palette: https://safe-campus.umn.edu/twin-cities-campus-safety-style-guide-and-identity-system and https://umarcomm.umn.edu/resources/logo-download . Existing intrinsic clear space and optical sizing retained.
- Cornell: exact red and white seal SVGs from https://www.cornell.edu/assets/core/images/logo-red.svg?1390332815 and https://www.cornell.edu/assets/core/images/logo-white.svg?1390332815 . URLs discovered in the official homepage stylesheet. No geometric edits. Replaces the previous simplified shield. Red light, white dark.
- USDA: exact SVG entries USDA logo/color/usda-logo-color.svg and USDA logo/white/usda-logo-white.svg from https://usda.azureedge.us/sites/default/files/documents/usda-logo-and-lockups.zip linked by https://usda.azureedge.us/about-usda/policies-and-links/digital/usda-style-guide/logo . No geometric edits. Color light, white dark.
- EPA: exact path geometry of the main logo SVG on https://www.epa.gov/aboutepa/using-epa-seal-and-logo . Standalone SVG supplies the approved single-color blue #0e6cb6 (light) and green #62c342 (dark) from the same official guide. No geometric edits or removed logo elements. The guide's ZIP endpoint returned HTTP401; no bypass attempted. Replaces the previous nonrecognizable PNG.

These are source acknowledgments, not partnership or endorsement. Existing disclaimer retained. Official artwork does not itself grant an endorsement or license; existing source-attribution context is unchanged.

Validation: application lint passes 176 files, zero warnings. Static comparison proofs at 1440px desktop and 390px mobile use the production About image CSS and all 23 sources. Both theme variants load and retain intrinsic aspect ratios. Full live About checks follow deployment.
