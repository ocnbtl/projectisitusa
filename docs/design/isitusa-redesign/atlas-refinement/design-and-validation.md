# Atlas refinement · 2026-09-28

The map remains the primary surface. The public identity is IsItUSA, an independent U.S.-based initiative with international ambition. No awards, association membership, global operating footprint or institutional authority are invented.

## Direction and reference decisions

- [IUCN](https://iucn.org/): reviewed the homepage and screenshot on September 28. Borrow the confidence of a clear mission, disciplined hierarchy and direct navigation; do not borrow its institutional claims.
- [The Nature Conservancy](https://www.nature.org/en-us/): use direct routes from purpose to participation and plain language.
- [GBIF](https://www.gbif.org/uk/what-is-gbif): make data provenance and geographic scope accessible alongside exploration.

Homepage: “Understand the species. Protect the places.” Supporting copy explains the atlas and gives a concrete next step. The logo occupies most of the header height; the full name uses regular weight. The page continues to expose useful county records immediately.

The explicit new brief supersedes the earlier fixed, cool-color map scale. Positive counts use six warm bands at most; zero stays separate. Quantile thresholds retain absolute integer labels. The legend names the state or visible-county scope. This is a count comparison, never an abundance, harm or danger score. Manual national zoom includes counties whose projected bounds intersect the viewport, including partially visible counties. Counts are recomputed after gesture completion. When the viewport has no positive counts, the scale explicitly falls back to the U.S. scope.

## Motion and interaction

- Navigation pill: transform and clip-path, 420ms exponential ease-out. Absolute layer has no layout animation.
- County fills and legend colors: 550ms. Scope changes preserve exact counts.
- Drag: one SVG group transform per animation frame; no React state updates per pointermove. Memoized path children prevent hover from rebuilding 3,144 paths.
- Zoom/reset: 420ms view transform; restrained icon feedback.
- Popovers: 180ms entrance; keyboard Escape and outside dismissal.
- Route navigation: centered spinning logo only during actual waits, after a 120ms threshold. Route completion clears it; 15s fallback and Escape prevent indefinite covering of content.
- Reduced motion disables authored animations/transitions and retains static loading status.

No measured frame-rate improvement is claimed. Preview and production drag verification remain necessary.

## Honest controls

- Two compact searches offer focus suggestions. Species suggestions include images, scientific names and reviewed county counts for the selected state.
- Place suggestions rank counties by recorded species. ZIP lookup navigates to a county; no ZIP-level occurrence or search-popularity data is manufactured.
- Filters stage changes until “Explore these records”; Clear is adjacent. Applied chips remain removable outside the panel.
- The state combobox is searchable and keyboard-operable. 51 verified Commons file URLs, metadata and license credits are recorded in flag-provenance.json. No flag batch was downloaded and CSP was unchanged.
- “Most recently updated” describes a dated release/snapshot. Today is independently labeled. Release notes are deliberately authored records; a clock never becomes an update event.
- Methods remain accessible in the footer and legend help. Selected/zoomed zero-record areas show contextual guidance; unavailable and zero remain distinct.

## Editorial and photography

24 new descriptions are keyed by canonical ID, with individual primary references. Registry boilerplate is hidden throughout the remaining directory. Existing substantive summaries remain. No taxonomy, occurrence, determination, observation date or research dataset is changed.

editorial-photo-audit.json inventories all 2,504 entries. 19 photos on the first page received visual usability screening, one at full size. This is not a conclusive species-identification audit. Three collection-slide/ledger views are withheld from the public directory, profile and map display. Originals and provenance remain preserved.

2,480 descriptions remain to review individually. 414 entries have no image. The source manifest has 2,088 entries, including 490 without explicit license fields; the runtime has 2,090 image assets. 13 catalog images use curated/legacy paths outside the catalog manifest, and 11 manifest entries have no matching catalog slug. These are reconciliation tasks, not evidence of unlawful use or incorrect taxonomy.

## Required hosted verification

1. Build/typecheck and existing release/data gates.
2. 1440px, 390px and 320px map/header/filter/search/state picker; no clipping, mobile footer and county sheet.
3. Keyboard comboboxes, Escape, focus return, filter apply/clear, state and species back/forward.
4. AK, HI, CT and ND exact map counts against the unchanged snapshot; state and manual-zoom count legend.
5. Pointer drag, click-after-drag, zoom limits, reset; no unsubstantiated fps claim.
6. Flags actually load under unchanged CSP; credit links remain available.
7. Route logo starts during a real slow navigation and clears; error/reduced-motion behavior.
8. 24 editorial overlays visible on cards/profiles; three held images absent; citations, source dates and legacy-layer links preserved.
