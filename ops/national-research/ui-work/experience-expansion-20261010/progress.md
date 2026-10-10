# Authorized scope

- [ ] Uppercase outlined ISIT USA identity across visible surfaces and brand kit.
- [ ] About split composition, balanced source rows, motion controls, responsive review.
- [ ] Search metadata and crawlable square favicon.
- [ ] Species county map, readable records, top references, identification and action structure.
- [ ] Moderated corrections with categories and team review.
- [ ] State/species reporting destinations with verification, consent, durable outbox, approval gating.
- [ ] Editorial revisions 1-50, 51-100, 101-150, 151-200 with multiple sources and preserved owner notes.
- [ ] Role icons, sightings, projects/proposals, team access and service connections.
- [ ] Audience, contribution and site analytics; separately consented masked replay.
- [ ] Production verification and final concise report.

## Direction contract

Retain the open field atlas, existing emblem, mineral/pine palette, readable system typography, and evidence-first claims. The user pinned a two-column About introduction with identity left and source movement right. Center incomplete static rows. Keep logos undistorted with optical sizing. On phones use one column. Honor reduced motion, pause controls, hidden-page and offscreen suspension. Introductions enter before secondary content. No invented partners, government affiliation, or nonprofit status.

## Feedback retrieved

Ten saved reviews were found. Revisions must broaden single-study descriptions, translate technical phrasing, explain identification and context, and avoid falsely narrowing a species to the jurisdiction of one source. Preserve original notes and version history.

## Analytics decision

User selected aggregate analytics plus optional session replay, with concise privacy controls. Existing analytics consent does not automatically authorize newly introduced replay. Sensitive forms, private workspace/auth/account routes, and payment interactions must be excluded.

## First release implementation and checks

Implemented locally: outlined uppercase brand kit and visible naming, split About with balanced/pauseable source rows, search metadata/favicon, species county map, profile navigation and safe report prefilling, moderated correction intake/team queue, role icons, aggregate engagement and separately consented masked replay.

Checks: application TypeScript passed; lint 169 files zero warnings/errors; consent migration, private-route exclusions, delayed-load withdrawal, privacy-signal handling and correction validation tests passed. PostHog fixed new queries executed without syntax errors; no historical engagement data is claimed.

Provider changes: profile_corrections_private_review migration applied; RLS on, anon SELECT/INSERT denied, staff direct UPDATE denied. participation-api v12 active (2026-10-10). PostHog 644720 replay configured for allowed origins, all-input/text masking and 30-day retention, no console/network-body capture. Client recording remains separately opt-in.

Visual QA: About reviewer source fixes applied. Local profile map matched 638 county memberships. Initial captures were incomplete and are not release approval. Brave blocks local /admin/preview; hosted preview must establish review/analytics/consent surfaces before production.

Remaining scope still open: verified state/species forwarding workflow, 200 multi-source editorial revisions preserving owner feedback, additional audience/contribution/project/team improvements, additional documented source logos.
