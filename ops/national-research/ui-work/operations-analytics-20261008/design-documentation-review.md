# Operations analytics design documentation review

Date: 2026-10-08
Reviewed source: `5ea39f4365c81a2614b0f1e0782c6f379aecf8ab`
Branch: `codex/operations-analytics-20261008`
Disposition: source/documentation review complete; no activation or rendered approval implied.

## Scope and method

This is an ordinary extension of the existing atlas, covering public explicit analytics consent, privacy information and semantic event hooks. The private workspace, role controls and aggregate analytics are source-only context for this review. They have not been rendered or approved for activation by this pass.

Read the Impeccable document reference and incumbent committed `PRODUCT.md` and `DESIGN.md` using `git show HEAD`. Inspected `docs/participation/setup.md`, the local `progress.json`, `app/globals.css`, `app/privacy/page.tsx`, `src/components/site-analytics.tsx`, `src/components/analytics-consent.module.css`, `src/components/site-footer.tsx`, `src/lib/ui/telemetry.ts`, the workspace/site-usage components and their CSS. Checked semantic event call sites and the contribution checkout source to resolve setup wording.

No browser, hosted API, network request, build, install, deployment, live email or payment action was performed. Provider state and previous test/render results below are attributed to the progress record and parent task, not independently reverified here. No design-system files, source files, setup guide or historical records were changed. This review is the only authored file; no commit was created.

## Incumbent design preserved

The committed design describes "An open field atlas": restrained environmental colors, glass limited to floating map controls/navigation, opaque evidence and reading surfaces, existing system typography, visible focus and reduced-motion support. Public consent is an Operate surface and privacy information is a Read surface within that established direction. No new visual world, composition, token scale or component family is proposed.

The current consent panel and map privacy control use the existing `--surface-strong` and `--foreground` tokens. Both light and dark definitions exist in `app/globals.css:8-14`. Consent actions have a 44px minimum height, visible keyboard focus, wrapping and reduced-motion handling. These are source observations, not measured rendered contrast, overlap or touch results. The material dark-theme correction at the reviewed commit still needs hosted rendering; the earlier preview cannot validate that correction.

The private usage source uses restrained headings, tabular figures, tables, exact-value disclosure, loading/error/empty states and qualification of consenting-browser metrics. This does not prove an authenticated working dashboard. The inherited 2px left border on timeline list items is a timeline separator, consistent with the parent's detector advisory; it is not evidence of a newly introduced decorative card accent. No detector was rerun.

`PRODUCT.md`, `DESIGN.md` and any incumbent `.impeccable/design.json` remain untouched. No sidecar was created or repaired because a sparse checkout or absent local artifact is not authority to establish another system.

## Public behavior and evidence semantics

- The capture function requires affirmative consent, an allowed public route and an exact production hostname. It respects Global Privacy Control and Do Not Track. Explicit withdrawal clears the stored analytics identifiers and stops future capture.
- Events use an allowlist. Event properties accept fixed enums and bounded public IDs; search strings, email, report content, private routes, query strings and URL fragments are excluded by this source path. Species URLs are normalized. No automatic click collection, session replay or user identification is implemented here.
- Privacy choices are available from the public reading footer and the map. The privacy notice explains browser/visit identifiers, prospective withdrawal, excluded fields and the difference between contributions and unopened participation services.
- Synthetic receipt of 22 event types demonstrates the recorded verification path only. `progress.json` says production capture is unverified and the restricted server query key is not configured. An empty production summary does not establish zero actual visitors.
- Checkout-open and signup-request events are intermediate actions. The private usage copy correctly avoids calling them completed donations or confirmed subscriptions.

## Setup documentation contradictions and gaps

The October 8 checkpoint at the top of `docs/participation/setup.md` is substantially aligned with the progress record. The sequential steps below it retain older instructions and should be reconciled before this guide is used as an operational checklist. Findings are recorded here only, within this review's write boundary.

| Location | Contradiction or ambiguity | Required interpretation / proposed documentation correction |
| --- | --- | --- |
| `setup.md:21` | The migration recipe copies schema sources 01, 02 and 03, while line 7 states sources 01-05 are already applied and source files 04-capacity and 05-identification exist. | Describe the complete current sequence and distinguish existing applied migrations from future changes. Do not instruct operators to recreate the existing schema blindly. |
| `setup.md:23` | Unqualified wording says lint, build and browser checks remain incomplete, despite the October 8 checkpoint and progress record reporting a hosted preview and scoped lint results. It also asks for a production build after line 17 prohibits local builds for this allocation. | Label the September record explicitly as historical at this step, cite current scoped results, and specify hosted build verification. Preserve the actual gaps: current dark correction render, private authenticated flows and production capture. |
| `setup.md:27` | The guide still says to create a separate backend, although line 7 records the existing dedicated project. | Change this to verification of the already selected project and its remaining backup/retention setup; do not create a duplicate project. |
| `setup.md:59-61` | It describes the first checkout as one-time only and says payment pages remain disabled until legacy flags are true. The current checkpoint explicitly says embedded one-time/monthly checkout exists independently of those flags. Current `donation-checkout.tsx` and `app/api/contributions/checkout/route.ts` implement both frequencies. | Scope these steps to the legacy participation finance integration. State separately that existing public checkout does not prove reconciliation into the private finance workspace. |
| `setup.md:11`, compared with `progress.json.verification.hostedPreview` | The guide reports the successful `a817714` preview but does not mention that the later dark consent correction at `5ea39f4` still awaits hosted rendering. | Add the later source/render boundary when updating the checkpoint. Do not transfer earlier screenshot approval to changed CSS. |
| `progress.json:4,37`, compared with `setup.md:7,11` | `ownerLoginConfirmed: true` is ambiguous beside `ownerProvisioned: false` and explicit statements that owner login remains unverified. | Clarify what login or address confirmation the top-level flag means. It must not be interpreted as successful private-workspace owner authentication. |

## Outstanding boundaries

The owner remains unprovisioned in the recorded evidence. Restricted Resend sending and PostHog query-read keys await approval. Custom Auth SMTP, signed delivery integration, digest/campaign sending, retention/deletion, backup recovery and actual Stripe one-time/recurring reconciliation remain unfinished or unverified. Local fixtures do not verify hosted Auth/Storage behavior. Public intake flags remain false.

The parent task reports production still at `5701c3db18050083c19a3d892430ce28313d6ac3`; this pass did not inspect production. The progress record identifies preview `a817714726bf0fde1d9dd29f49a20952995d6aed` as the previously rendered build. The current source correction must pass hosted review and subsequent live verification before being described as shipped. Existing public contribution access does not authorize or establish activation of the private operations services.

## Resolution recheck, 2026-10-08

Rechecked only the six findings above against the parent's updated working copies of `docs/participation/setup.md` and `progress.json`. HEAD remained `5ea39f4365c81a2614b0f1e0782c6f379aecf8ab`; these documentation resolutions describe the inspected working files, not a new committed or deployed release. The earlier findings are retained as historical review evidence.

| Original finding | Resolution status | Evidence in updated working files |
| --- | --- | --- |
| Incomplete migration recipe | Resolved | `setup.md:21` states sources 01 through 05 are already applied, requires inspection of migration history and limits future work to incremental changes. It explicitly prohibits reapplying the foundation or targeting another project. |
| Historical/current verification and local-build conflict | Resolved | `setup.md:23` separates the historical September record from current scoped results, records the earlier hosted preview and zero lint errors, requires hosted builds and retains private-flow and production-capture verification gaps. |
| Duplicate backend creation instruction | Resolved | `setup.md:27` directs use of the existing project, explicitly prohibits a duplicate backend and retains capacity, recovery and retention checks. |
| Public versus legacy Stripe gating | Resolved | `setup.md:59-61` acknowledges one-time and monthly public checkout, scopes the unfinished work to private finance reconciliation, and states that the legacy receiver/flag do not control the current Next.js checkout. |
| Missing dark correction/render boundary | Resolved | `setup.md:23` explicitly identifies correction `5ea39f4` as still requiring hosted rendering and release verification. The earlier preview is not treated as evidence for this later correction. |
| Ambiguous owner login confirmation field | Resolved | Parsed `progress.json` has `ownerAddressConfirmed: true`; the old `ownerLoginConfirmed` property is absent. `supabase.ownerProvisioned` remains false, consistent with the guide's unprovisioned-owner and unverified-login statements. |

All six documentation findings are resolved in the inspected working files. This recheck does not resolve or reverify the operational and rendered limitations above. No additional findings, source edits, design-system changes, builds, browser checks, network actions or activation actions were introduced by this recheck.
