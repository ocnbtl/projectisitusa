# Profiles 401-600 private review release

- Date: 2026-10-11. Baseline: ad515a0550.
- Added 200 private review candidates in batches 9-12; total prepared: 600.
- Batch 9: 50 ready. Batch 10: 49 ready, 1 gap. Batch 11: 48 ready, 2 gaps. Batch 12: 49 ready, 1 gap.
- New gaps: Actinocyclus normanii f. subsala (spelling/taxon identity), Pyracantha fortuneana (conflicting taxon concepts), Dioscorea oppositifolia (misapplied Chinese-yam name), Xanthomonas campestris (citrus-canker pathovar mismatch). Original catalog IDs retained.
- 404 source-to-claim mappings. Full text, abstracts and an indexed species-specific excerpt are distinguished. Independent source groups support used facts; mirrored taxon listings are not independent corroboration.
- Exact queue IDs, uniqueness, description length, evidence/source mapping and first-400 preservation passed the integrator. First eight completion maps are unchanged.
- Read-only editorial audits covered all 200 new rows with targeted direct source checks. Applied identification wording fixes, clarified native ranges, reduced redundant caveats, added current EPPO nomenclature citation, and corrected one source-to-claim attribution.
- Application lint: 173 files, zero warnings/errors. Scoped whitespace check passed.
- Local TypeScript attempt stopped at the imposed 1 GB heap cap. This is not a passing local type check. Hosted build/type checking must pass before production promotion. No local full website build.
- Saved-review verification: 20 records; latest feedback 2026-10-11 00:26:19.214613+00; fingerprint d673e864d1d6b98518dd74b03c04661d, unchanged from baseline. No database writes.
- No public occurrence data, public species descriptions, authentication logic or saved feedback changed.
- Release commit: 79a48d78172564565da8346c642fbb500133e3dc.
- Hosted preview AzSsHP8YhTNJrQAusxQuTNivDuKu: READY, 4m 1s. Full hosted build (including type checking) passed. Production dependency audit reported zero vulnerabilities; one existing dependency warning remains.
- Preview UI: all 12 batches visible, batches 9-12 each contain the expected 50 rows, search finds #485 across batches, its research gap is visible and revision application is disabled, #600 opens with new copy and source notes.
- Responsive check: simulated 390 x 844 viewport, 375px document width, 313px profile article and 16px text; no horizontal overflow. Readable dark-mode screenshot inspected. Desktop light/dark views inspected. No captured browser warnings/errors.
- Preview uses synthetic review state. Production team tab currently requires sign-in, so authenticated production feedback interactions have not been reverified. Existing saved feedback was independently checked read-only above.
- Production deployment 2ekHWV97owFWUuqodzcVZXpKtZnu: READY at 2026-10-11 03:26:51 EDT, 4m 3s, source 79a48d78172564565da8346c642fbb500133e3dc. Vercel explicitly lists isitusa.com and team.isitusa.com in assigned custom domains. Production team sign-in loads successfully. Brave blocked the /admin/preview check with ERR_BLOCKED_BY_CLIENT, so no HTTP-404 claim is made; source still restricts that route to preview builds. Authenticated production workspace remains unverified because the available tab is signed out.
