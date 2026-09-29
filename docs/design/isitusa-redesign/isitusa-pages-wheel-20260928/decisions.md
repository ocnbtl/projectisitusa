# Page journeys and mouse-wheel zoom

Scope: the user requested continued refinement of Research, About, Support (written as Sport), Species, and the map hero, help text and wheel interaction. Keep the existing environmental palette, full-width page canvas and shared navigation.

## Decisions

- Research leads with a state choice and county evidence. Keep both progress measures visible in a compact disclosure summary, with their definitions and all accounting underneath. Do not conflate a source check, reviewed determination, survey non-detection or completed research. Keep original dates and identifiers available without making build metadata the main story.
- Replace Research selects, including page size, and the Species category select with one bounded popover. Long lists get a search input. Every instance has independent IDs, active and selected states, keyboard navigation, outside dismissal, focus return, disabled choices and a viewport-constrained portal. Escape cancels and Tab continues through the page.
- Species keeps name search and category browsing together, shows removable filters, and gives profile links a clear visual affordance. Preserve query URLs, pagination, image credits, data validation and lazy images.
- About explains the purpose, the place/date/source method, the global ambition and ways to help. Add direct section links. Describe IsItUSA accurately as an independent U.S. initiative; no invented nonprofit status, reach, partners or authority.
- Support leads with actions available today, then contribution availability. Keep all payment, config, wallet, validation and security behavior identical. Do not activate signups or payments.
- Map hero states the local species purpose directly. Legend help keeps counts versus harm, missing data versus absence, scale scope and observation-date distinctions in three short paragraphs.
- Mouse wheel zoom anchors the map point beneath the cursor, normalizes pixel/line/page input, bounds steps and uses the existing 1x to 12x limits. Paint at most once per animation frame and commit React state after a short idle, avoiding county-count recalculation on every event. Only listen on the SVG. Preserve Ctrl/Meta browser zoom, Shift scrolling and all panel scrolling. Synchronize manual transforms explicitly on reset, resize and wheel-to-pointer transitions.
- Use brief opacity/position motion for popovers and research tabs, and small directional cues for links. Disable these with reduced motion. Do not add route-level delays or another loading overlay.

## Verification boundaries

Pure tests cover wheel anchoring, delta normalization, limits and drag continuity, plus select navigation, disabled/empty choices, type-ahead and accent normalization. Scoped ESLint covers edited TS/TSX. MAIN owns hosted compilation, preview and production. Browser checks must cover dropdown search, keyboard acceptance/cancel/Tab, multiple instances, mobile bounds, county deep links, pagination, Support gating, wheel reset before idle, resize and page/control scrolling. No local build, install, server or research-data generation.

Resource limits: one worker, no children; under 5 MB changed source/design; small check processes at most 384 MB; at least 100 GB free disk; retain existing RAM and paging safeguards. Physical mobile touch and screen-reader hardware testing remain outside this pass.
