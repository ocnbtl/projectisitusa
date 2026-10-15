# Invasive Serif rollout - 2026-10-14

Owner authorized the approved Grove XXIII lettering to become Invasive Serif and ship across ISITUSA. This release packages that approved design; it does not redraw glyphs.

## Release

- UI baseline: `ce0537ae05eac97f2766d8584161ea80c7725792` on `codex/workspace-experience-20261009`.
- Application release: `e981981155b97f619eb987407240b5acf2fb2ebc`.
- Production deployment requested: `dpl_Ds3ruiz9v2o89zry2LieBBjmxFDy` (production-target rebuild, not promotion of a preview environment).
- Final visual preview: `dpl_ELaXD312EXh3sA6GoyAZtUp3AkvX`, READY. Production adds only the footer arrow encoding correction.

## Typography and identity

- One upright Bold face, weight 700; 297 encoded characters and 298 glyphs.
- Approved master SHA-256: `301e8b150eac3f11c0a51d8df119caaebe72e857ac40c585b2cdd11ba316d576`.
- Packaged TTF SHA-256: `335b5b915eb46682419fd990e3cea0801f8a5d8e6b664de29771cfd926b4debd`.
- Original glyph outlines, metrics, kerning/positioning, character map, hint program and horizontal metrics match the approved master in both TTF and WOFF2.
- HarfBuzz shaping matches the approved font for the wordmark, tagline and reviewed kerning examples, including Your, October, Yu, Yv and ra.
- Wordmarks use actual shaped outlines from this same font. Existing emblem preserved.
- Native tracking and weight 700 applied throughout public and workspace headings. Paragraphs, scientific names, controls and dense data retain readable sans-serif text.
- Public brand kit includes SVG artwork, the installable TTF and usage notes. Earlier licensed font assets and notices remain available as historical materials.
- Active email-logo compatibility URL `/brand/v9/symbol-name.png` contains the new lettering. Mailer source points to v10; no Supabase service deployment or new test email is part of this typography release.

## Verification

- Application lint: 174 files, zero warnings/errors.
- TypeScript: passed.
- Vercel publication checks: passed, including release identity, integrity, scope, pointer-race handling, hosted preparation, public data fetch behavior, deep links and temporal determinations.
- Hosted build: production dependency audit reported zero vulnerabilities; snapshot verification covered 3,196 artifacts, 3,144 counties, 51 jurisdictions, 2,504 species and 379,342 present pairs.
- Research data trees are unchanged from the baseline: `public/generated` = `62429fb74aaede44c930346550e15cadfec73306`, `src/data` = `c66fb13fb71a48deb729f8855f67924a43e96bef`.
- No schema, API, research-data or private-data migration changes. Existing unrelated dirty files preserved.
- Browser review covered About, brand kit, support, a species profile, and the synthetic team workspace/profile review. Mobile 390px and desktop/ultrawide views were inspected in light and dark themes. Reviewed pages had no document-level horizontal overflow or broken brand images.
- Species profile retained description, taxonomy, sources, occurrence count and county map. Workspace headings resolve to Invasive Serif, 700, normal tracking.
- Preview catalog requests are blocked by the existing data-server origin policy. HTTP headers allow `https://isitusa.com` and do not allow the temporary preview domain. Existing live catalog loaded all 2,504 species. No CORS policy was weakened.
- Live team workspace currently requires sign-in. Synthetic preview validates presentation only; it is not evidence of an authenticated private-data session.

## Live verification

- Production is READY at `e981981155b97f619eb987407240b5acf2fb2ebc`; aliases include isitusa.com, www.isitusa.com and team.isitusa.com. Reconfirmed through the provider on October 15 after the browser interruption.
- Live About page resolves headings to Invasive Serif, weight 700. Mobile viewport 390px: font loaded, no broken images, document width 375px (scrollbar excluded), no horizontal overflow.
- Live species catalog displays 2,504 species. County map loaded matching-species records and the whole-number legend. Contribution controls finished loading and offered the existing one-time and monthly options; no transaction was submitted.
- Live team sign-in headings use the new font. Authenticated records were not accessed. The attempted preview-route check was blocked by Brave, so no server HTTP status is claimed; the unchanged production-only notFound guard and production build target were inspected.
- The footer arrow now renders correctly. Brand downloads point to the new font and outlined SVGs. A final download interaction was interrupted; no downloaded-file hash verification is claimed.
- Screenshots: production-about-desktop.png, production-about-desktop-dark.png and production-about-mobile.png. Preview workspace/mobile screenshots are retained separately and are not represented as authenticated production evidence.
