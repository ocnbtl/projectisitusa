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
    fontFamily: '"ISITUSA Field Display", Georgia, serif'
    fontWeight: 800
    letterSpacing: "-0.015em"
  display-about:
    fontFamily: '"ISITUSA Field Display", Georgia, serif'
    fontSize: "clamp(36px,3.5vw,64px)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  display-about-mobile:
    fontFamily: '"ISITUSA Field Display", Georgia, serif'
    fontSize: "clamp(36px,9vw,46px)"
    fontWeight: 800
    lineHeight: 1.08
    letterSpacing: "-0.015em"
  headline-about:
    fontFamily: '"ISITUSA Field Display", Georgia, serif'
    fontSize: "clamp(23px,2vw,36px)"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  display-participation:
    fontFamily: '"ISITUSA Field Display", Georgia, serif'
    fontSize: "clamp(38px,4.5vw,68px)"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  display-support:
    fontFamily: '"ISITUSA Field Display", Georgia, serif'
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

Botanical display lettering unifies the ISITUSA acronym, full name, and public editorial headings. Generous curves end in crisp, tapered tips, following the user's NYBG-inspired direction while preserving the established bird/leaf/fungi emblem. Neutral sans text carries navigation, scientific data, forms, and body copy.

**Key Characteristics:**
- Botanical expression in the identity and editorial display type.
- Precise, readable evidence and interface typography.
- Forest green, mineral paper, and dark pine surfaces.
- Existing map, reading, and participation structures preserved.

This document merges the approved identity change into the incumbent system. Source snapshot: `359ab82ab1`, including `app/globals.css`, `app/about/about-experience.css`, participation/support styles, and the v7 brand and font manifests. It records implemented declarations. The 359ab82 preview was reviewed at simulated widths of 390, 1440, and 2452 pixels, including light and dark About views; final production checks are recorded in the botanical-email verification report.

## Colors

The existing palette remains restrained and environmental. Frontmatter records the reusable light and dark values from `app/globals.css`; dark-prefixed entries are the `.dark` overrides of the corresponding CSS properties. They are not additional accents.

### Primary

Teal (`accent`) carries actions; deeper teal (`accent-strong`) carries emphasis and action hover states. The identity artwork uses its own established forest green (`brand-green`), with white and black export variants. Do not substitute the interface accent for the approved artwork fill.

### Neutral

Mineral (`background`), ink (`foreground`), muted pine (`muted`), paper (`surface-strong`), and the translucent floating surface (`surface`) separate the map from readable content. Border and ring values support structure and keyboard focus. Dark mode uses dark pine surfaces and pale text; brand art is presented in white.

County fills retain fixed, labeled count bands spanning pale yellow-green through blue, with brighter equivalents in dark mode. Equal counts retain equal colors across states and filters. These bands describe documented species counts, never ecological danger; amber marks geographic selection. Map data colors remain owned by the existing map implementation rather than the identity palette.

## Typography

**Display Font:** ISITUSA Field Display, with Georgia and serif fallbacks.
**Body Font:** Avenir Next, Segoe UI, and sans-serif fallbacks.

ISITUSA Field Display is a customized derivative of Fraunces by Undercase Type under SIL Open Font License 1.1. It is not NYBG's proprietary typeface and is not a wholly original font. The build fixes the source axes at optical size 72, weight 800, softness 25, and wonk 0; original flared I and T outlines replace those capitals. Preserve upstream attribution and `public/fonts/isitusa-display/OFL.txt` when distributing the derivative.

The self-hosted WOFF2 is declared as normal style, weight 800, with `font-display: swap`; the desktop TTF retains `Regular` in its filename but supplies the same fixed display weight. The web subset covers Latin and the punctuation documented in the font README. Do not assume other scripts, italic styles, or a variable weight range. Shared editorial rules use `font-synthesis: none`.

### Hierarchy

- **Display:** The shared family, weight, and tracking are in `typography.display`; sizes remain specific to each surface. About's opening and source heading use their own extracted roles. About mobile applies at 700px and below; its source heading becomes 26px.
- **Participation:** The extracted display role applies to introductions; mobile introductions become 38px at 760px and below. Section and aside headings also receive the display family. Navigation, field labels, notices, and controls keep the sans family.
- **Support:** The smaller display introduction preserves emphasis on contribution choices. It becomes 28px at 600px and below. The donation heading and supporter portal heading also use the display face; payment-option titles remain sans.
- **Reading and brand pages:** Public h1/h2, the atlas introduction, and the footer introduction receive the display family. Source lists and directory results headings explicitly retain the body family. More-specific route selectors retain their own size, weight, and tracking declarations; the shared role is not a claim that every heading computes identically.
- **Body and labels:** The base body role intentionally has no universal size or line-height; existing surfaces set those values. The About source paragraph role is one observed reading style, limited to 72ch. Scientific names remain italic and measurements use tabular numbers. Avoid repetitive uppercase labels.

**The One Identity Rule.** Spell the acronym `ISITUSA` with no space and the full name `Invasive Species In The United States of America`. Use the same display face for their letterforms and public editorial headings; keep body copy, scientific data, forms, and navigation in the existing system sans.

**The Licensed Basis Rule.** Describe the display face as an OFL Fraunces derivative with original I and T outlines. NYBG is a visual inspiration, not a font source, affiliation, or endorsement.

## Layout

Preserve the edge-to-edge map, floating search and navigation, county panel, mobile bottom sheet, and reading columns. The existing page gutter and recurring spacing values are recorded in frontmatter; the page gutter becomes its mobile value at 700px and below. These are observed values, not a new universal spacing utility system.

About retains its two-column opening and source carousel. At 700px and below, the opening becomes one column and the emblem and full name stack vertically; the emblem is 136px wide and the full-name art preserves its aspect ratio with a 470px maximum width. Preserve the existing source order and carousel accessibility behavior.

Participation stacks at 760px. Support's main columns stack at 1100px and its contribution panels stack at 600px. Do not make these route-specific breakpoints universal.

## Elevation & Depth

Glass remains limited to floating map controls and navigation; evidence and long reading surfaces stay opaque. The existing light and dark offset shadows separate overlays from geography, and the floating glass uses an 18px backdrop blur. Shadow and motion declarations live in the sidecar because they are outside the frontmatter schema. Contribution panels use a border and opaque paper surface; their current parent donation container has no shadow.

Keep existing short entrances, focus states, and reduced-motion behavior. The identity update does not introduce new motion. The source carousel retains its pause control, hover pause, keyboard behavior, and reduced-motion layout.

## Shapes

The circular bird/leaf/fungi emblem remains unchanged. Brand v7 changes the letterforms and lockups, not that emblem. Botanical curves and tapered tips belong to the letters; county geometry, controls, and evidence displays stay precise.

Preserve the existing modest corner vocabulary documented in frontmatter. Small switches and chips may use pills; participation tags retain their existing 7px corners. Do not propagate decorative botanical silhouettes into forms or map boundaries.

## Components

### Identity artwork

Use `public/brand/v7/wordmark-green.svg`, `wordmark-white.svg`, or `wordmark-black.svg` for the acronym. Use `full-name.svg` for the two-line full name and `symbol-name.svg` for the preserved emblem with the matching acronym. SVG letters are outlined; they do not require the font to be installed. Preserve aspect ratios and the built-in optical pair spacing rather than retyping the logo with ordinary text spacing. PNG exports derive from these SVGs and carry embedded provenance.

The header continues to combine the original v3 symbol with the v7 wordmark. About combines that symbol with the v7 full name. The footer uses the v7 symbol-name lockup. Existing dark-mode `.brand-art` treatment makes these green assets white.

### Buttons and fields

Support's primary action uses accent fill, the body label role, and its existing rounded action shape; hover uses accent-strong. Participation secondary actions use paper, ink, and a border. Form fields retain paper fill, border, inherited sans typography, and a 46px minimum height. Visible focus uses the existing ring with offsets appropriate to the surface; do not replace operational labels with display lettering.

### Navigation, tags, and panels

Navigation remains compact sans with icons and the existing moving active indicator. Participation tags retain their removal control and 44px touch target. Support contribution panels use opaque paper, a border, and the extracted panel radius and padding; mobile padding becomes 20px. Sidecar snippets are static previews of these existing primitives, not a replacement for their application behavior.

### Atlas and evidence

Preserve separate county/ZIP and species searches, the state focus selector, explicit dataset choice, active filters, zoom/reset controls, fixed count-band legend, and county evidence rows. Profiles prioritize county choices, observation dates, reviewed dates, and source links. Photo credits use accessible native disclosures. Reading pages have no decorative eyebrow labels.

## Do's and Don'ts

### Do:
- Do use the v7 acronym and full-name artwork with the unchanged emblem and preserved aspect ratios.
- Do keep botanical display type and readable system sans in their defined roles.
- Do retain the Fraunces attribution and OFL license with distributed font files.
- Do show real data and explicit release dates.
- Do preserve the distinction between map records and research determinations.
- Do honor reduced motion and keep keyboard focus visible.
- Do preserve touch controls of at least 44px where established.

### Don't:
- Don't insert a space into ISITUSA or substitute a different capitalization for the full name.
- Don't describe the derivative as NYBG's font, wholly original type, or institutional endorsement.
- Don't stretch the artwork, redraw the established emblem, or use display lettering for dense data and form controls.
- Don't use hazard colors, ornamental statistics, looping glows, fake forms, or nested glass panels.
- Don't treat this source extraction as completed rendered QA.
