---
name: ISITUSA
description: An open field atlas with botanical display lettering and precise evidence interfaces.
colors:
  background: "#edf2ef"
  foreground: "#173c38"
  muted: "#526863"
  surface: "rgba(251,253,251,.87)"
  surface-strong: "#fbfdfb"
  border: "#cbd8d1"
  ring: "#19776b"
  accent: "#14675f"
  accent-strong: "#07574e"
  brand-green: "#00583B"
  brand-white: "#FFFFFF"
  brand-black: "#111111"
  dark-background: "#122724"
  dark-foreground: "#eff6f0"
  dark-muted: "#b0c6be"
  dark-surface: "rgba(27,49,44,.91)"
  dark-surface-strong: "#1b312c"
  dark-border: "#425b51"
  dark-ring: "#97d8b3"
  dark-accent: "#96d5b5"
  dark-accent-strong: "#b0e4ca"
typography:
  display:
    fontFamily: '"ISITUSA Botanical", Georgia, serif'
    fontWeight: 800
    letterSpacing: "-0.015em"
  display-about:
    fontFamily: '"ISITUSA Botanical", Georgia, serif'
    fontSize: "clamp(36px,3.5vw,64px)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  display-about-mobile:
    fontFamily: '"ISITUSA Botanical", Georgia, serif'
    fontSize: "clamp(36px,9vw,46px)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  headline-about:
    fontFamily: '"ISITUSA Botanical", Georgia, serif'
    fontSize: "clamp(23px,2vw,36px)"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  display-participation:
    fontFamily: '"ISITUSA Botanical", Georgia, serif'
    fontSize: "clamp(38px,4.5vw,68px)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  display-support:
    fontFamily: '"ISITUSA Botanical", Georgia, serif'
    fontSize: "clamp(28px,2.45vw,34px)"
    fontWeight: 800
    lineHeight: 1.18
    letterSpacing: "-0.015em"
  body:
    fontFamily: '"Avenir Next", "Segoe UI", sans-serif'
    fontFeature: '"liga" 1, "calt" 1'
  body-about:
    fontFamily: '"Avenir Next", "Segoe UI", sans-serif'
    fontSize: "16px"
    lineHeight: 1.75
  label-action:
    fontFamily: '"Avenir Next", "Segoe UI", sans-serif'
    fontSize: "14px"
    fontWeight: 600
rounded:
  field: "8px"
  action: "9px"
  control-panel: "12px"
  contribution-panel: "14px"
  reading-panel: "16px"
spacing:
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  section: "48px"
  section-large: "64px"
  page-end: "80px"
  page-gutter: "clamp(24px,3vw,64px)"
  page-gutter-mobile: "20px"
components:
  editorial-heading:
    textColor: "{colors.foreground}"
    typography: "{typography.display-about}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.background}"
    typography: "{typography.label-action}"
    rounded: "{rounded.action}"
    padding: "11px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-strong}"
  button-secondary:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.foreground}"
    typography: "{typography.label-action}"
    rounded: "{rounded.field}"
    padding: "12px 18px"
  input:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "12px 14px"
  tag:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.foreground}"
    padding: "2px 2px 2px 12px"
  contribution-panel:
    backgroundColor: "{colors.surface-strong}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.contribution-panel}"
    padding: "24px"
  navigation-link:
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    padding: "10px 12px"
---

# Design System: ISITUSA

## Overview

**Creative North Star: "An open field atlas."**

The map is the workspace. Search, filters, and geographic navigation float above it; evidence is read on an opaque surface. Restrained environmental color and precise cartographic detail support the existing atlas.

ISITUSA Botanical unifies the ISITUSA acronym, full name, and public editorial headings through one glyph master. Broad sculptural curves meet crisp flared stems and sharp curved terminals, following the user's NYBG-inspired direction while preserving the established bird/leaf/fungi emblem. Neutral sans text carries navigation, scientific data, forms, and body copy.

**Key Characteristics:**
- Botanical expression in the identity and editorial display type.
- Precise, readable evidence and interface typography.
- Forest green, mineral paper, and dark pine surfaces.
- Existing map, reading, and participation structures preserved.

This document merges the approved typography replacement into the incumbent system. Source snapshot: `b548fdf2c6`, including `app/globals.css`, `app/layout.tsx`, `scripts/build-brand-v9.py`, the v9 brand manifest, and the Botanical font README. It records implemented declarations for the hosted-preview work; it does not establish production publication. Existing `.impeccable/review/canopy-*` captures precede this snapshot's expanded A counter and sharp curved S/s/c/e terminals, so they are not final-correction visual proof.

## Colors

The existing palette remains restrained and environmental. Frontmatter records the reusable light and dark values from `app/globals.css`; dark-prefixed entries are the `.dark` overrides of the corresponding CSS properties. They are not additional accents.

### Primary

Teal (`accent`) carries actions; deeper teal (`accent-strong`) carries emphasis and action hover states. The identity artwork uses its own established forest green (`brand-green`), with white and black export variants. Do not substitute the interface accent for the approved artwork fill.

### Neutral

Mineral (`background`), ink (`foreground`), muted pine (`muted`), paper (`surface-strong`), and the translucent floating surface (`surface`) separate the map from readable content. Border and ring values support structure and keyboard focus. Dark mode uses dark pine surfaces and pale text; brand art is presented in white.

County fills retain fixed, labeled count bands spanning pale yellow-green through blue, with brighter equivalents in dark mode. Equal counts retain equal colors across states and filters. These bands describe documented species counts, never ecological danger; amber marks geographic selection. Map data colors remain owned by the existing map implementation rather than the identity palette.

## Typography

**Display Font:** ISITUSA Botanical, with Georgia and serif fallbacks.
**Body Font:** Avenir Next, Segoe UI, and sans-serif fallbacks.

ISITUSA Botanical uses original sculptural I/S/T/U/A capitals and a readable Chonburi-derived companion. I, T and U share concave shoulder curves; A has a pointed apex and curved lower counter. The companion's finest strokes are reinforced for heading legibility. The glyph master sets a 700-unit cap height and 544-unit lowercase height. Chonburi by Cadson Demak is licensed under SIL OFL 1.1. Preserve its attribution and `public/fonts/isitusa-botanical/OFL.txt` when distributing the font. NYBG supplies visual inspiration only; no proprietary NYBG font files or logo contours are included.

The self-hosted `/fonts/isitusa-botanical/isitusa-botanical.woff2` is preloaded in the root layout and declared as normal style, weight 800, with `font-display: swap`; `ISITUSABotanical-Regular.ttf` supplies the same fixed display weight. The subset is drawn from the master's supported characters within U+0020-U+017E and U+2000-U+206F, plus the euro and trademark signs. Do not assume other scripts, italic styles, or a variable weight range. Shared editorial rules use `font-synthesis: none`.

### Hierarchy

- **Display:** The shared family, weight, and tracking are in `typography.display`; sizes remain specific to each surface. About's opening and source heading use their own extracted roles. About mobile applies at 700px and below; its source heading becomes 26px.
- **Participation:** The extracted display role applies to introductions; mobile introductions become 38px at 760px and below. Section and aside headings also receive the display family. Navigation, field labels, notices, and controls keep the sans family.
- **Support:** The smaller display introduction preserves emphasis on contribution choices. It becomes 28px at 600px and below. The donation heading and supporter portal heading also use the display face; payment-option titles remain sans.
- **Reading and brand pages:** Public h1/h2, the atlas introduction, and the footer introduction receive the display family. Source lists and directory results headings explicitly retain the body family. More-specific route selectors retain their own size, weight, and tracking declarations; the shared role is not a claim that every heading computes identically.
- **Body and labels:** The base body role intentionally has no universal size or line-height; existing surfaces set those values. The About source paragraph role is one observed reading style, limited to 72ch. Scientific names remain italic and measurements use tabular numbers. Avoid repetitive uppercase labels.

**The One Identity Rule.** Spell the acronym `ISITUSA` with no space and the full name `Invasive Species In The United States of America`. Export acronym and full-name artwork from the same Botanical glyph master used by public editorial headings, so A and every repeated letter keep identical outlines across placements. Keep body copy, scientific data, forms, and navigation in the existing system sans.

**The Licensed Basis Rule.** Describe Botanical as original acronym capitals with a Chonburi-derived companion under OFL 1.1. NYBG is a visual inspiration, not a font source, affiliation, or endorsement.

## Layout

Preserve the edge-to-edge map, floating search and navigation, county panel, mobile bottom sheet, and reading columns. The existing page gutter and recurring spacing values are recorded in frontmatter; the page gutter becomes its mobile value at 700px and below. These are observed values, not a new universal spacing utility system.

About retains its two-column opening and source carousel. At 700px and below, the opening becomes one column and the symbol-name lockup and full name stack vertically; the lockup is 136px wide and the full-name art preserves its aspect ratio with a 470px maximum width. Preserve the existing source order and carousel accessibility behavior.

Participation stacks at 760px. Support's main columns stack at 1100px and its contribution panels stack at 600px. Do not make these route-specific breakpoints universal.

## Elevation & Depth

Glass remains limited to floating map controls and navigation; evidence and long reading surfaces stay opaque. The existing light and dark offset shadows separate overlays from geography, and the floating glass uses an 18px backdrop blur. Shadow and motion declarations live in the sidecar because they are outside the frontmatter schema. Contribution panels use a border and opaque paper surface; their current parent donation container has no shadow.

Keep existing short entrances, focus states, and reduced-motion behavior. The identity update does not introduce new motion. The source carousel retains its pause control, hover pause, keyboard behavior, and reduced-motion layout.

## Shapes

The circular bird/leaf/fungi emblem retains its approved v3 contours. Brand v9 replaces the letterforms and lockups, not that emblem. Sculptural curves, flared stems, and sharp curved terminals belong to the letters; county geometry, controls, and evidence displays stay precise.

Preserve the existing modest corner vocabulary documented in frontmatter. Small switches and chips may use pills; participation tags retain their existing 7px corners. Do not propagate decorative botanical silhouettes into forms or map boundaries.

## Components

### Identity artwork

Use `public/brand/v9/wordmark-green.svg`, `wordmark-white.svg`, or `wordmark-black.svg` for the acronym. Use `full-name.svg` for the two-line full name and `symbol-name.svg` for the preserved emblem with the matching acronym. All lettering exports directly from the Botanical glyph master in `scripts/build-brand-v9.py`; SVG letters are outlined and do not require the font to be installed. Preserve aspect ratios and the built-in optical pair spacing rather than retyping the logo with ordinary text spacing. PNG exports derive from these SVGs.

The header continues to combine the original v3 symbol with the v9 wordmark. About places the v9 symbol-name lockup beside the v9 full name. The footer uses the same v9 symbol-name lockup. Existing dark-mode `.brand-art` treatment makes these green assets white. The root layout references the v9 web manifest while icons and social-preview imagery retain the v3 emblem.

### Buttons and fields

Support's primary action uses accent fill, the body label role, and its existing rounded action shape; hover uses accent-strong. Participation secondary actions use paper, ink, and a border. Form fields retain paper fill, border, inherited sans typography, and a 46px minimum height. Visible focus uses the existing ring with offsets appropriate to the surface; do not replace operational labels with display lettering.

### Navigation, tags, and panels

Navigation remains compact sans with icons and the existing moving active indicator. Participation tags retain their removal control and 44px touch target. Support contribution panels use opaque paper, a border, and the extracted panel radius and padding; mobile padding becomes 20px. Sidecar snippets are static previews of these existing primitives, not a replacement for their application behavior.

### Atlas and evidence

Preserve separate county/ZIP and species searches, the state focus selector, explicit dataset choice, active filters, zoom/reset controls, fixed count-band legend, and county evidence rows. Profiles prioritize county choices, observation dates, reviewed dates, and source links. Photo credits use accessible native disclosures. Reading pages have no decorative eyebrow labels.

## Do's and Don'ts

### Do:
- Do use the v9 acronym and full-name artwork from the single Botanical glyph master with the unchanged v3 emblem and preserved aspect ratios.
- Do keep botanical display type and readable system sans in their defined roles.
- Do retain the Chonburi attribution and OFL license with distributed Botanical font files.
- Do show real data and explicit release dates.
- Do preserve the distinction between map records and research determinations.
- Do honor reduced motion and keep keyboard focus visible.
- Do preserve touch controls of at least 44px where established.

### Don't:
- Don't insert a space into ISITUSA or substitute a different capitalization for the full name.
- Don't describe Botanical as NYBG's font, a wholly original font, or institutional endorsement; its acronym capitals are original and its companion glyphs derive from Chonburi.
- Don't stretch the artwork, redraw the established emblem, or use display lettering for dense data and form controls.
- Don't use hazard colors, ornamental statistics, looping glows, fake forms, or nested glass panels.
- Don't treat this source extraction as completed rendered QA.

## Approved botanical refinement

The approved combined concept uses sculptural acronym capitals, open companion headings and readable sans body copy. T repeats the concave shoulder curve of neighboring I and U on both sides. The same five custom capitals are embedded in the heading font and exported to every current wordmark. Other glyphs derive from Chonburi by Cadson Demak with reinforced fine strokes. Do not introduce a separate A or T in any placement. Public heading spacing is neutral, avoiding the previous tight tracking. The existing emblem and functional UI remain unchanged.


## Invasive Serif production system (2026-10-14)

This section supersedes the historical Botanical typography and v9 asset guidance above. Invasive Serif is the approved Grove XXIII original Latin display master, packaged without outline, advance-width or GPOS changes. Use weight 700, normal style, native kerning, normal letter spacing and no synthetic bold/italic. Use it for the wordmark and editorial headings. Preserve the existing sans-serif for paragraphs, navigation, scientific names, controls and dense data.

Current assets: `public/brand/v10/` and `public/fonts/invasive-serif/`. The SVG wordmarks use HarfBuzz positioning from the same TTF as the webfont. Rebuild using `scripts/build-invasive-serif.py`, then `scripts/render-brand-v10.mjs`. The embedded source master preserves all 297 encoded characters. Unsupported scripts fall back to the system fonts; this is a single upright display face, not a variable or multi-style family. Preserve the approved v3 emblem and the aspect ratios recorded in the v10 manifest. Historical Chonburi attribution and licenses remain with older assets.
