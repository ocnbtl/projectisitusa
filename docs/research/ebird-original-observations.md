# Retained eBird original observations

The registered `gbif-ebird-retained-original-observations` adapter, version `1.0.0`, reconstructs historical recorded presence from original Cornell EOD fields retained through GBIF. MAIN approves a pinned method record after independent source review. The runner writes immutable evidence runs; compilers remain the only writers of county determinations.

The first method uses the complete 41-record US/2024 White-winged Parakeet query, all 41 original verbatim responses, the retained dataset and taxonomy metadata, and Cornell's reporting and quality-control guidance. Two isolated reviewers examined 18 California and 23 Florida records. Their exact committed proposals and independent Python verification recipes remain retained, including possible shared observations and source-code lineage differences. A passed proposal does not itself create a determination.

Acceptance requires matching original and interpreted occurrence identity, publisher, exact catalog species, accepted classifications, positive human-observation status, original calendar date, rights, and an unambiguous current publisher county within its original state. Explicit original/interpreted contradictions fail. The selected occurrence's own date and record URL are cited together; additional records are retained without summing birds or claiming statistical independence.

An absent coordinate-uncertainty field does not defeat an otherwise unambiguous publisher county. Coordinates are consistency evidence, not county assignment authority. A home, hotel, park, golf-course or zoo locality name alone does not prove captivity. Concrete record-specific contradictions remain review holds.

The original `not_reviewed`, `crawl_attempt` and `omitFromScheduledCrawl` values match retained dataset machine tags. GBIF documents the crawler controls at dataset scope. Annotation propagation is a qualified inference; the exact export transformation and individual expert approval are not established. The adapter preserves those fields and rejects different unreviewed quality flags. It never labels an agent's review as human approval.

Version 1 validates the retained pilot acquisition profile, including its first successful original response followed by a local parser-shape failure and the separately retained remaining responses. It does not pretend that failure was a new provider request or require a fabricated successful receipt. Future multi-page or authenticated DWCA acquisitions need an explicitly tested profile before reuse. The separate 15,000-record Monk Parakeet acquisition remains incomplete source material; it cannot close a source-family screen or create negative evidence.

The EOD omits sampling effort and complete-checklist metadata. A complete bounded positive-record review is not county protocol completion. Historical occurrence does not establish current persistence, breeding, naturalization, invasive impact, countywide prevalence, absence or non-detection. Silence, retrieval failure, rejection and missing geography remain separate from negative evidence.

Primary source context is retained with original response hashes and retrieval times:

- [Cornell eBird data download guidance](https://support.ebird.org/en/support/solutions/articles/48000838205-download-ebird-data)
- [Cornell eBird review process](https://support.ebird.org/en/support/solutions/articles/48000795278-the-ebird-review-process)
- [Cornell eBird reporting guidance](https://support.ebird.org/en/support/solutions/articles/48000948757-ebird-faqs)
- [EOD dataset and attribution](https://www.gbif.org/dataset/4fa7b334-ce0d-4e88-aaae-2e0c138d049e)
- [GBIF machine-tag definitions](https://gbif.github.io/gbif-api/apidocs/src-html/org/gbif/api/vocabulary/TagName.html)

Run `npm run check:ebird-original` for original-field, archive, method-lineage and deterministic reconstruction checks. Canonical run validation separately reconstructs every assertion, review, outcome and witness artifact from the receipt's committed input identity. Original acquisition code identities are preserved; the method-context receipt has a recipe hash but no repository commit, and none is inferred.
