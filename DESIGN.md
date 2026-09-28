# Design

## Overview

**Creative North Star: "An open field atlas."**

The map is the workspace. Search, filters, and geographic navigation float above it; evidence is read on an opaque surface. Use restrained environmental color and precise cartographic detail. The user authorized autonomous design decisions and supplied this direction in the continuation request.

## Colors

Pale mineral background (#edf2ef), ink (#173c38), muted pine (#526863), paper (#fbfdfb), and teal (#14675f). County fills use fixed, labeled count bands spanning pale yellow-green through blue, with brighter equivalents in dark mode. This reveals low and middle count differences without classifying ecological danger. Equal counts retain equal colors across states and filters. Amber marks selection only.

## Typography

Use the existing Avenir Next / Segoe UI system family, with large sentence-case introductions and compact, readable interface text. Reserve tabular numbers for measurements. Scientific names are italic. Avoid repetitive uppercase labels.

## Layout

Desktop: edge-to-edge map, compact header, left search, right county panel. Mobile: the map remains in the first viewport, controls stack compactly, and county details open in a collapsible bottom sheet. Reading routes use a clear column and generous section spacing.

## Elevation & Depth

Glass is limited to floating map controls and navigation. Evidence and long reading surfaces stay opaque. A soft offset shadow separates overlays from geography.

## Shapes

Controls and reading panels use 12-16px corners. Small geographic switches and chips may use pills. County boundaries and data remain precise.

## Components

Separate county/ZIP and species searches, a state focus selector, filter disclosure with an explicit dataset choice, active filter chips, zoom/reset controls, fixed count-band legend, and county evidence rows. Profiles prioritize county choices, observation dates, reviewed dates and source links. Photo credits use accessible native disclosures. Reading pages have no decorative eyebrow labels.

## Do's and Don'ts

- Show real data and explicit release dates.
- Preserve the distinction between map records and research determinations.
- Use one short panel entrance to communicate selection; honor reduced motion.
- Keep focus visible and touch controls at least 44px.
- Do not use hazard colors, ornamental statistics, looping glows, fake forms, or nested glass panels.
