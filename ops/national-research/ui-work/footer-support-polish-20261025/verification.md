# Footer and Support polish, 2026-10-25

- Cause: inherited `.site-footer { overflow:hidden }` clipped the translated navigation at its top boundary. The preceding page stayed stationary, creating a second overlap risk.
- Repair: keep clipping on the artwork viewport only; move the current main content by the same pixel-aligned offset as the footer navigation. Header and native scroll boundary remain fixed. The shared parent value follows route replacements; reset and unmount restore it.
- Physics, artwork, payment handling and research data are unchanged.
- Support: rewrite the sharing/volunteering sections; remove both eyebrow labels; place card icons beside headings.
- Passed: application TypeScript, lint (196 files, zero warnings/errors), scoped whitespace checks, gesture regression suite including Safari rebound, holds, momentum, reduced motion, and cleanup.
- Actual component preview: 407663 bytes in memory, no local website build. Desktop 1440x1100 at full 240px reveal: all five navigation headings hit-test unobstructed; gap to About credits remains 160px; native scroll limit unchanged. Mobile 390x844, light/dark and card layout checked; no horizontal overflow. Browser simulation, not physical Safari verification.
- Awaiting hosted preview and production verification.
