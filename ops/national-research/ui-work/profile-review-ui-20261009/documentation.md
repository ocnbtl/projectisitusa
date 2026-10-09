# Profile review design documentation

Date: 2026-10-09
Source revision checked: `2ad0e93a4b`
Classification: ordinary Operate/Read extension of the incumbent field-atlas system; no approved system change.

## Outcome

The profile-review composition matches the incumbent palette, system typography, opaque reading surfaces, fine separators, restrained controls and responsive master/detail patterns. `DESIGN.md`, global styles and component tokens were preserved. The surface brief gained a task-specific extension note; no page strategy was promoted into the global design system.

The supplied fresh finish review records `disposition: ship` and no material fixes. That verdict covers its source and four preview captures; this documentation pass checked source and the review record, and did not repeat browser, hosted database or production checks. No production-ready or completed-deployment claim is made here.

## Evidence checked

| Evidence | Finding |
| --- | --- |
| `PRODUCT.md` | Evidence-first county/species information, source links, explicit uncertainty, functional controls and accessibility remain the product constraints. |
| `DESIGN.md` | Incumbent "An open field atlas" world; mineral, pine, paper and teal; existing system font; opaque reading surfaces; sentence case and italic scientific names. |
| `.impeccable/surfaces/src-components-admin-workspace-tsx.md` | Existing-world workspace direction, quiet rail, actionable queues and focused reading; the new note records only this surface's extension. |
| `app/globals.css` | Actual inherited variables include background `#edf2ef`, foreground `#173c38`, muted `#526863`, strong surface `#fbfdfb`, accent `#14675f` and border `#cbd8d1`. Body uses Avenir Next / Segoe UI / sans-serif. No variables changed. |
| `src/components/admin/editorial-review.module.css` | Review colors reference incumbent variables. Prose is 17px/1.8 with a 65ch maximum, dropping to 16px on mobile; metadata is subordinate. At 1100px the list narrows, and below 760px the list stacks over the reader. Focus is a visible 2px accent outline. Review transitions are disabled for reduced motion. |
| `src/components/admin/admin.module.css` | Existing 1440px bounded workspace, navigation, strong-surface panel and shared responsive rules are retained. The panel has 16px corners; incumbent smaller controls already use 8-10px corners. |
| `src/components/participation/shared.tsx` and `participation.module.css` | Review fields, buttons and status/error notices reuse the existing primitives. |
| `src/components/admin/editorial-tracker.tsx` | Batch navigation, cross-batch search, status filter, article/source sequence, previous-description disclosure, private feedback and draft editing, separate approval, loading/unavailable/empty states and save receipts are implemented. Approval visibility uses `canReview`; save passes the expected record version to the existing RPC. This is source evidence, not a hosted authorization test. |
| `src/components/admin/workspace-frame.tsx` and `workspace.tsx` | Profile review appears in workspace navigation and the overview, with role-aware visibility and the existing workspace composition. |
| `src/content/species-editorial-drafts.ts` and four batch completion files | Internal drafts combine four files, each independently counted at 50 entries. |
| `src/content/species-editorial.ts` and `editorial-published.json` | Public editorial imports a separate published file containing 50 entries. Private save uses the review RPC and does not update that publication source. |
| `finish-review.md` | Fresh reviewer recorded ship, no material fixes, and valid desktop/mobile/tablet/2560 captures. Dirty-navigation browser confirmation remains outside its verified scope. |

## System summary

1. Palette: inherited mineral background, pine ink, muted pine, opaque paper and teal actions.
2. Typography: existing Avenir Next / Segoe UI family, sentence-case hierarchy and italic scientific names; readable 17px desktop / 16px mobile draft text.
3. Layout: bounded workspace with quiet navigation and a list/reader arrangement that stacks below 760px; prose stays within 65ch.
4. Components: shared inputs, buttons and notices; fine rules, native disclosures, visible selection/focus and purposeful library icons.
5. Rules: evidence stays readable and opaque, feedback/approval stays private, publication remains separate, and reduced-motion preferences are honored.

## Existing drift preserved

`DESIGN.md` is prose-only and has no machine-readable token frontmatter. `.impeccable/design.json` is absent in this checkout, despite being named as an existing input in the handoff. These are pre-existing documentation gaps, not authority to regenerate the system during an ordinary extension. The global Shapes prose describes 12-16px controls/panels, while incumbent workspace/shared controls already use smaller radii; the extension follows those existing component patterns. None of these gaps was canonized into a new system rule or repaired unasked. No new craft-floor defect was identified by the supplied finish review.

## Files written and scope

- `.impeccable/surfaces/src-components-admin-workspace-tsx.md`: profile-review extension and current release-authorization note.
- `ops/national-research/ui-work/profile-review-ui-20261009/documentation.md`: this evidence record.

No code, global design files, secrets, memory, deployment configuration or public editorial content was modified. No build, install or deployment was run by this documentation pass. The current user authorization overrides the earlier storage stop for the remote build/release only; release completion requires separate verification.
