# Touch and shared-shell refinement

User request: 2026-09-28, message 01a0e9f6-0d55-7901-83c9-8979c1cb98c7.
Base: c082b8a36ae114a3b3576530dea96d6876d044ed.
Lease: lease-isitusa-touch-shell-20260928-1.

## Findings and changes

- Mobile brand CSS explicitly allowed wrapping. It now uses fluid type and one line, without ellipsis or clipping. Full accessible name preserved. The user's single-line requirement takes precedence over larger mobile brand type; navigation targets remain at least 44px.
- Transparent white logo lettering disappeared against the light header. A deep green circular backing preserves the artwork and improves contrast. No new image assets.
- Toolbar and updates used unrelated vertical offsets, 56px apart. One measured top bar now aligns desktop controls immediately below navigation. Narrow screens put searches first and updates below at the right.
- The moving navigation pill was duplicated by link hover backgrounds. Links now remain transparent; one pill starts moving on normal activation. Keyboard focus and reduced motion remain.
- Palette chooser is simply 'Map colors'. Shorter legend help preserves species counts, current scope, changing ranges, zero, unavailable, impact, and observation dates.
- Initial map rendered a 1200x800 viewport and fixed extent, then measured them in independent effects. One prepaint measurement now publishes dimensions and fit together. Geometry stays hidden until valid and uses an accurate SVG viewBox with aspect-ratio preservation.
- The old drag did not track pointer IDs, so a second touch overwrote the origin. Pure gesture state now tracks pointers, anchors pinch to the moving midpoint, rebases as fingers enter or leave, and suppresses selection after movement or cancellation. Immediate pointer capture and animation-frame transforms keep movement independent of React/count-scale updates, which settle on release. Touch does not trigger hover tooltips. Interrupting button zoom starts from its visible interpolated position.

## Local checks

- 18 pure tests passed: 11 new interaction/viewport cases plus 7 existing count/palette cases. Anchoring, pan-to-pinch, pinch-to-pan, zoom limits, cancellation, stray pointers, accidental selection, coincident fingers, and valid atomic fit dimensions covered.
- Scoped ESLint passed with no source warnings; existing eslintrc deprecation notice only.
- git diff --check and Impeccable layout detector passed.
- No local builds, installs, servers, new dependencies, research edits, provider writes, or paid activation.
- Source under 5MB; 100GB free-disk floor preserved. MAIN's sampler is authoritative.

## Hosted verification

Before release, check first navigation/reload at 320, 390, tablet, and desktop widths: full single-line brand, no horizontal overflow, desktop search/update alignment, correct initial map aspect ratio and placement. Check light/dark logo, navigation on all routes, one indicator, reduced motion, legend/palettes, tap versus drag, interrupted zoom, filters, and unchanged national/AK/HI/CT counts. Verify production compilation and console.

CUA exposes mouse dragging and viewport resizing but no documented multi-touch injection. Pure tests validate pinch/cancellation math. Mouse checks must not be described as physical-device touch tests. Real iOS/Android gesture feel remains a physical-device verification limitation.
