# Internal workspace continuation - 2026-10-08

## Release scope

Permission-aware navigation and task overview; server-side queue search, status filters and bounded pagination; editable and archivable email drafts with optimistic concurrency and unsaved-change protection; recent audit records; truthful service configuration status; responsive sign-in; shorter privacy text with expandable analytics details. The existing identity, public research and contribution checkout are preserved.

## Verified before publication

- No-emit frontend typecheck, 16 analytics privacy assertions and four server-rendered role/unknown-count presentation assertions pass.
- Scoped lint: 24 files, zero errors, four existing image advisories. No install or local build.
- In-memory PostgreSQL schema 01-06 and authorization, transactions, delivery quota, role capacity and campaign editing tests pass. Campaign tests include stale versions, revoked access, MFA, locked approvals, archive/restore, audit count and zero queued delivery.
- Applied incremental campaign_draft_editing migration to dedicated cnbcqzecxydgpeejeegy. Hosted readback confirms both columns, anonymous execution denied and authenticated wrapper available.
- participation-api v5 is active; anonymous connection-status request returns 401. Public email/report/legacy payment flags remain false. Security advisor: zero errors/warnings, seven intentional service-only informational notices.
- Hosted first preview passed compilation, typing and generation. The first rendered pass found fixed navigation overlapping the mobile sign-in/fixture notice; the batched correction uses the site's header-size tokens. Text encoding separators were normalized.
- A presentation-only /admin/preview fixture uses shared layout/overview/analytics components with explicitly fictional data. It has no private backend access or writes, and Production builds return notFound. This is not an authenticated workflow test.

## Boundaries and outstanding work

No research writes, R2 object writes, paid upgrades, real transactions or email sends. Source/review files remain limited to 20 MB and free disk must remain above 90 GB. A superseded preview build was canceled before replacing it.

The full operations system remains incomplete. Owner provisioning and user-completed password/TOTP enrollment, Auth SMTP/templates, actual hosted role/storage/delivery tests, restricted email/PostHog service connections, digest/campaign scheduling and retention, and reconciliation of the existing Stripe one-time/monthly flow still need completion. Public intake remains closed. Configuration-present labels are not delivery or health claims.

Restricted sending/query-key approval is still pending from the previous turn. Do not infer it from generic continuation or deployment permission. Do not reroute previously rejected hosted mutation fixtures through another channel.

## Release result

Independent presentation review: ship, zero material fixes. Documentation review complete; existing visual system preserved and exceptions recorded. Released application: 96e79f3d05f8eb141adc0106e68b7daedf2f5882. Prior production GS5VRKAJBNKz2LkMmFY8zXiDp3WT at 5ea39f4365c81a2614b0f1e0782c6f379aecf8ab is the rollback reference.


Production deployment DQMuen95tcgNjCea8sY7eaY8HmNm completed Ready after 5m5s, rebuilt with Production environment variables and assigned to isitusa.com. GET /, /species, /admin and /privacy return200; the new login and privacy text are present. Live /admin shows the enabled invitation-only form without exposing private data. Existing checkout returns200/no-store with one-time/monthly and portal available; no transaction was created.

/admin/preview renders the custom page-not-found screen and contains no fictional fixture data. Next returns HTTP200 with its streamed notFound marker, so the planned strict HTTP404 is not established. The route is noindex; this transport-status limitation remains recorded. Do not claim an HTTP404.

Eight final 1440x1000 / 390x844 presentation captures were reviewed, including dark mode. The live sign-in proof is internal-production-login.png. These checks do not activate or verify private owner, mail, storage or reconciliation workflows.
