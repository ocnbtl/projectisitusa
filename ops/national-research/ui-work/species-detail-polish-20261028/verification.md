# Species detail and discovery refinement — 28 October 2026

## Scope
Compact profile headings and sections, boxed references and reporting controls, prominent correction action, inset catalog disclosure, combined historical-record/absence popover, and removal of the reporting graphic and county-research calls to action. Directory photo credits have linked source details; no-photo cards use a small placeholder rather than an empty image panel. Search, category and environment controls share a coherent panel. Research selectors, update presentation, counts and source cards have clearer grouping and fewer separators.

## Photo audit
Reviewed all 417 missing or held profile images in the 2,504-species catalog. Approved 319 images (7,353,412 bytes including thumbnails); 98 remain unresolved. Seven legacy images were matched byte-for-byte to Commons files, recovering source links and correcting author credits where needed. Six legacy seed images still have author credit but no verified exact source URL; their attribution is preserved without inventing a link. Existing research facts, source records and generated catalog data are unchanged. Editorial image overrides supply the approved assets.

All missing identities were searched against iNaturalist; unresolved candidates were additionally checked through GBIF and Wikimedia Commons. Accepted images require a matching taxon, a source page, author attribution, an explicit reusable image license, and visual review. GBIF dataset licensing alone was not accepted as an image license. Public-domain and CC0 labels remain distinct. Illustrations, microscopy and documented disease symptoms are retained where appropriate; unrelated subjects, record sheets, illegible specimens and mixed-species composites are excluded. Source identification is evidence, not an independent expert determination.

`photo-provenance.json` records each published image, original/output hashes, author, license, source and resize changes. `photo-outcomes.json` covers every gap, provider results and rejected alternatives. Provider failures and lack of a suitable licensed image are not claims that no image exists elsewhere. Rejected images remain outside the public release.

## Validation
- Photo test: every gap represented; every published asset exists and matches its hash; approved licenses/credits present; all non-image catalog facts preserved; original catalog objects unchanged.
- Discovery tests: habitat filtering, URL state and evidence qualifications passed.
- Application lint: 201 files, no warnings/errors.
- Scoped application TypeScript check passed.
- Responsive preview checks: 375px mobile light/dark, 1024px tablet, 1440px desktop and wide desktop. Compact cards, photo/no-photo states, filter controls, county selection, source/reference expansion, correction dialog, registry disclosure and information popovers checked.
- Popovers use an opaque surface, viewport-clamped positioning, Escape/outside dismissal and focus return.
- Preview correction submission is disabled by deployment configuration; production controls must be checked after release without submitting a report.

## Release
UI preview: commit 4f95074a0f25553bd330d077921d444e91f425d9. Final photo additions and the last two profile copy/control changes follow in the next commit. Production promotion and live verification are pending at this checkpoint.
