# WQP reviewed fish replay version 3

Version 3.0.0 of wqp-retained-field-counts accepts a managed, hash-pinned method-review path. Version 1 clam counts and version 2 fish measurements retain their historical code and method bytes. This removes repeated adapter implementations for each newly reviewed taxon/state group while preserving separately versioned source decisions.

## First scope: common carp

The first method is src/data/research/source-method-reviews/wqp-reviewed-fish-common-carp-20260908-r15.json: 87 Indiana and 65 Oklahoma county-species candidates, each with an independent primary Result and Station witness. Eight Oklahoma counties have only Provisional results and remain held. These 152 candidates become determination gains only after canonical run validation and exact compiler reconciliation.

The method reuses the version 2 positive field-fish predicate unchanged: exact catalog taxon, Final status, Actual positive values, reviewed biological intent and units, original valid collection dates, and an exact organization/site join to unambiguous active publisher county FIPS. Tissue analytes, unreviewed metrics, provisional results and introduced test-organism contexts remain excluded. No result from a search or rejection establishes absence or survey non-detection.

Two Jasper County rows have contradictory dates and are explicitly excluded by exact row hash and zero-based index. A consistent independent activity supports that county. McCurtain County has a river-border publisher/coordinate discrepancy of about 126 m; the public evidence retains that qualification. It does not claim precise water jurisdiction. Additional reviewed Rogers and Greer boundary caveats remain attached to their pairs.

Independent reviews also identified potentially valid field measurements with laboratory or tissue-processing fields. They are outside this first version 3 method and require a separate source-method review before use.

## Provenance and reuse

Original provider ZIP responses are retained once with receipts and executed acquisition recipes; their repository base identifies HEAD during acquisition, not a false claim that the exploratory recipes were already committed. The Station snapshot is reused from its earlier retained acquisition. Failed requests remain recorded as failed.

The in-memory ZIP reader accepts one unencrypted, non-ZIP64 CSV leaf, checks local/central records, streaming descriptors, declared and actual lengths, and CRC, and enforces 20 MB input/output caps. It writes no extracted file paths. The source-method loader also verifies SHA-256 hashes for the original archive, embedded entries, decoded profiles, independent reviews, exact primary witness fields and row locators, and chronology.

Canonical receipts pin version 3 and the exact method path/hash. Every replay performs zero provider requests. wqp-reviewed-fish-witnesses.json retains all scoped Result rows, full nonempty source fields, exact raw record hashes, dates, dispositions and Station joins. Repeated measurements are not summed into fish abundance. Historical sampled presence does not assert persistence, establishment, prevalence or protocol completion.

## Checks

The package command check:wqp-reviewed-fish tests the ZIP boundary and all 152 real reviewed fixtures, public attribution, source/hash/reviewer tampering, state/taxon scope, exclusions, held dates and deterministic output. It is included in check:research-integrity. Version 1 and version 2 regression scripts remain separate required checks. Canonical staged-run validation and national before/after reconciliation follow method registration.

The ZIP format follows [PKWARE APPNOTE 6.3.10](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT), sections 4.3.7, 4.3.9, 4.3.12 and 4.3.16, using the bundled Node 22 zlib implementation. Source collection context includes the [Oklahoma Conservation Commission aquatic community program](https://conservation.ok.gov/qa-monitoring-program-assessment-of-stream-aquatic-communities/); its general current description does not establish every historical sampling protocol. Exact reviewed agency source links and retrieval records are retained in the method context and independent reviews.
