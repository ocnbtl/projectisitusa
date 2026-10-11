# Profile description feedback pass, round 2

## Scope

Rewrote all 200 existing candidates in four fixed batches of 50. Read all 20 saved production reviews before revision, including the feedback saved through 2026-10-11 00:26 UTC. The revision follows the owner's preference for plain language, practical visual details, consistent catalog names, useful facts and less ornamental phrasing.

The 200 candidates are editorial rewrites of the existing research synthesis. This is not a claim that 200 new source investigations were completed. Original source URLs, access dates, research limitations, identification notes and actions remain unchanged. All 114 ready-for-review and 86 research-gap classifications are preserved.

## Review experience

- Prominent Round 2 description and revision date.
- Previous candidate available in a comparison disclosure.
- Supported alternative common names shown separately for 14 profiles and included in review search.
- African feathergrass scientific-name variants shown separately, with the unresolved classification caveat retained.
- Saved private drafts, feedback, source edits, versions and approval states are not overwritten.
- Public species descriptions and research projections are unchanged.

## Validation

- `node ops/national-research/ui-work/profile-feedback-round2-20261010/apply.mjs`: 200 changed, 50 per batch, sources and research fields unchanged. Descriptions span 56-74 words (mean 64).
- ESLint using the repository's existing eslintrc mode: targeted files pass. The first direct invocation required legacy configuration mode; the Next wrapper encountered a Windows sandbox path-canonicalization error. Direct ESLint with the existing config succeeded.
- `npm run typecheck:app`: passed.
- Whole-worktree whitespace check includes unrelated pre-existing CRLF changes; release check is scoped to task files, which must pass.
- Read-only production review fingerprint before release: 20 rows, `d673e864d1d6b98518dd74b03c04661d`. No private review write was performed.

Hosted build and live-workspace verification will be recorded after deployment.

## Hosted preview and release isolation

- Preview `C2YzLRSEREYuUtv6VxjH5jwMKRGt` / `projectisitusa-3y8wmxagz-unigentamos.vercel.app` passed in 4m18s at commit `c298bcbf555c1a4652ff31a7672576192d5166cc`.
- Hosted application lint: 173 files, zero errors and warnings. All four batch views show 50 profiles and Round 2 candidates. Previous-candidate disclosure, alternate-name search (stargrass), profile 200 and the disabled use-revision button for research-gap profile 12 were verified in the browser.
- Public-page isolation: only `editorial-tracker.tsx` imports the revision module. Public species pages read `src/lib/ui/species-editorial.ts`, which imports the unchanged `src/content/species-editorial.ts`. No application route or public editorial file differs between prior production and this release. The workspace renders staff authentication without a session; `/admin/preview` calls `notFound()` outside the preview environment.
- Automatic approval review initially withheld promotion pending proof of this separation. After the source checks above, the same production promotion was approved; production build `AHmYi5XEDLLq6TY7pDzRkoZWWf1T` started.
- Rechecked saved production feedback while the production build ran: same 20 rows and fingerprint `d673e864d1d6b98518dd74b03c04661d`.

## Production verified

- Production build `AHmYi5XEDLLq6TY7pDzRkoZWWf1T`, commit `c298bcbf555c1a4652ff31a7672576192d5166cc`, completed Ready in 4m19s. Vercel explicitly confirmed this is the current production deployment when activation was checked.
- User signed back in after refresh; authenticated `https://team.isitusa.com/admin` visibly renders Round 2 / all 200, with comparison disclosure working. Profile 21 retains the owner's saved feedback verbatim. No review save/approval action was performed.
- Production `/admin/preview` responds 404; signed-out `/admin` presents the invitation-only login.
- Live screenshot: `review-live.jpg` (local verification artifact, not public source).
- Public species descriptions remain unchanged. Editorial task complete; 86 research limitations remain explicitly flagged for separate research work.
