# Profiles 201-400 review release

- Date: 2026-10-11.
- Release commit: ce76bb35e2a0a607b30c87cab579670ae7a0db06.
- Baseline: 200 prepared profiles. Added: 200. Total: 400 across eight batches.
- Batches 5, 6 and 7: 50 ready-for-review descriptions each. Batch 8: 49 ready and one explicit research gap.
- Remaining gap: Schinus terebinthifolia var. raddianus. Current references synonymize or deactivate this variety; a distinct reliable variety-level diagnosis was not verified. Species-level information is labeled and catalog identity was preserved.
- 418 source-to-claim mappings accompany the new profiles. Full-text and abstract access are distinguished. Source overlaps and taxonomic limitations are documented.
- Integrator verified exact queue membership, uniqueness, description lengths, source/evidence mappings, and unchanged first 200 revisions and first four completion files.
- Local application lint passed for 173 files with zero warnings/errors. TypeScript no-emit check passed. No local full website build.
- Scoped staged whitespace check passed. No public occurrence data, taxonomy IDs, public species descriptions, auth logic or saved-review data changed.
- Saved-review baseline and post-research query both returned 20 rows, latest feedback 2026-10-11 00:26:19.214613+00, fingerprint d673e864d1d6b98518dd74b03c04661d.
- Preview deployment 5gCrQ1GSqoiC5b9H7SDwSeWohkcb reached Ready at the release commit. Preview UI showed 400 profiles, batches 1-8, draft 351 and source links; simulated 390px viewport had no document horizontal overflow and all nine batch/catalog controls fit.
- Hosted build completed its production-dependency security gate. Installation logs retain the existing text-encoding deprecation and six development-dependency audit findings; this content release does not change dependencies.
- Production deployment 4EyyKgPoHCYgeAApkYTkpA7G6umH reached Ready at release commit ce76bb35e2a0a607b30c87cab579670ae7a0db06, with isitusa.com assigned. Production URL: https://projectisitusa-f0azltdwh-unigentamos.vercel.app.
- Production team /admin/preview returns HTTP 404 as required. Refreshing the actual team workspace returned the owner session to sign-in; signed-in production UI verification awaits renewed owner sign-in. Preview checks above do not prove production authentication or saved-review loading.
