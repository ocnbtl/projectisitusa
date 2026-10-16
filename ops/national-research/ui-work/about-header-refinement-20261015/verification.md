# About and header refinement — 2026-10-15

Application revision: aba957d313239e60c383de9af3e337be4f0cb838.

- Public header now displays the full organization name in Invasive Serif, with an intentional two-line lockup.
- Removed the duplicate oversized identity block from the About introduction. Preserved the approved mission, tagline, attribution, credits, links, and research data.
- Research heading uses the available width instead of an artificial narrow measure. Wider desktop layout pairs the mission with the source panel; tablet layout gives the panel its own row; mobile stacks naturally.
- Replaced the global white brand-art treatment with the mint brand color in dark mode.
- Added selective light/dark source variants for Oregon State, Purdue, GBIF, and iNaturalist. Retained native colors where legible and monochrome exceptions where needed.

## Verification

- Application lint: 174 files, zero warnings or errors.
- TypeScript check: passed.
- Impeccable scoped layout detector: no findings, before and after.
- Scoped diff whitespace check: passed.
- New SVGs parse successfully and retain original view boxes.
- No changes to research data, generated data, font binaries, or brand outlines.
- Hosted preview dpl_9rGizu6HSTQXXkCe5WJ34AgJD9nM: READY; release-coherence check passed with no mismatches.
- Brave simulated viewports: 1440x1000 desktop, 1024x900 tablet, 390x844 mobile.
- Research heading occupies one line at 1440 and 1024, two lines at 390.
- No horizontal document overflow in those three sizes.
- All source-logo images loaded successfully; theme variants switch as intended.
- Light/dark mobile screenshots and desktop/tablet dark views inspected; full public header remains visible.
- Preview console: no captured errors.

Production build dpl_CrVsaKuGnoKpy1fc6zh95HE3D1B2 reached READY and was verified live at isitusa.com/about. At 2540x1304, the research heading is one line, the full-name header is visible, every source image loads, and there is no document overflow. Additional 320px and 768px layout checks passed. The final live contrast check identified three dim native marks (Cornell, EPA, NC State); revision 0651fd4128ed2a4fc7d4807f45518805d0e0e9a2 restores their light monochrome dark-mode treatment. Lint passed again. Final production build dpl_Dd38BegiBqhDJ9o9gYt2taxKdJdv reached READY with isitusa.com, www.isitusa.com, and team.isitusa.com aliases. Reloaded the live About page and verified all source images loaded, the three contrast treatments were applied, the header showed the full name, the research heading stayed on one line, and there was no horizontal overflow. Saved live-about-dark.png and left the live About page open in Brave with temporary viewport overrides reset.