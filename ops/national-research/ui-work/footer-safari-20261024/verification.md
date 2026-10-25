# Safari footer refinement, 2026-10-24

Reviewed both supplied local iPhone Safari recordings (8.385s and 9.043s), including 120ms samples around second clip 1.0-2.32s. Observed quick reveal/retraction and changing browser chrome color. Recordings cannot identify exact touch release times.

Code findings: raw Safari overscroll was counted as movement; negative rebound could close a held gesture. Scroll arrivals could add a synthetic impulse while a finger was already driving the reveal. Released flings used a 130ms target reversal. Theme-color changed every animation frame, and computed styles were reread each frame.

Fix: clamp native position; rearm only after leaving edge by 32px; one velocity-driven spring arc for released arrivals; direct finger pulls remain gesture-driven; ignore toolbar geometry as velocity; cache palette; stable toolbar color; arm overscroll policy before the bottom. Artwork, masks and stable compositing unchanged.

Checks: scoped motion regression, app TypeScript and application lint passed. Component preview at 390x844 and 1440x900, mobile hold/release and dark appearance inspected, no console errors. This is Chromium simulation; no claim of a new physical Safari test.

Primary reference: https://developer.mozilla.org/en-US/docs/Web/API/Window/scrollY (Safari exposes out-of-range scrollY during bounce).
Rollback production before this change: 6GYBYdUwkJ9a8X6nhvdgzDs5yR6a, source 9564a8033bbb9ee415c7bd2a178e9d7ce27da1a1.
