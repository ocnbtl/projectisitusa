# WQP retained fish measurements

The registered Water Quality Portal adapter supports historical clam counts at version `1.0.0` and the separately reviewed fish measurement method at version `2.0.0`. Canonical validation dispatches by the receipt version. Historical runs retain their original method and bytes.

## Approved scope

The initial fish method is limited to 67 independently reviewed county-species pairs: 43 silver carp (`Hypophthalmichthys molitrix`) and 24 round goby (`Neogobius melanostomus`) in 13 states. The exact pair list, input hashes, original acquisition recipes, reviews, exclusions and public caveats are pinned in `src/data/research/source-method-reviews/wqp-fish-measurements-v2.json`.

The fresh pre-integration baseline has 43 researched-unresolved silver-carp pairs and 24 not-researched round-goby sparse defaults. These are candidates until immutable source-run validation and compiler reconciliation establish exact net changes.

## Evidence rules

Reviewed positive Final, Actual field biological results support sampled historical occurrence through these specific forms:

- Population Census, Group Summary or Individual Count/count.
- Individual Length/mm or Length, Total (Fish)/cm.
- Individual Weight/kg.
- Population Census Total Sample Weight/g representing species-specific catch weight.

Exact source taxon names must match the catalog. Exact organization and monitoring-location identifiers must join to unambiguous active US publisher Station county FIPS. Original dates, units, biological intent and contributor identity remain unchanged.

Tissue chemical concentrations, fish diversity/anomaly metrics, unreviewed Frequency Class counts, zero/nonpositive values, provisional or qualified results, laboratory/QC samples and introduced test-organism contexts do not qualify. The Posey County failed-capture quantitative row is explicitly held; another activity supports that pair. Rejections create no absence or non-detection.

Individual lengths and catch weights remain occurrence evidence when tissue analysis follows, but tissue analytes themselves are excluded. Repeated rows, identical lengths and missing individual identifiers cannot establish independent fish counts or abundance.

Publisher county metadata is retained with explicit river-border and offshore-boundary caveats. Erie County, Ohio activity and Station coordinates differ by about 7.5 km; neither point is presented as a verified precise location. Generic NARS trawl descriptions can conflict with equipment fields, so exact gear and effort are not asserted.

Historical sampled occurrence does not establish current persistence, establishment, countywide prevalence or complete research protocols.

## Retention and replay

Original CSV responses are retained once inside `ops/national-research/evaluations/artifacts/wqp-expansion-preflight-20260908-r14.json.gz`, with original entry paths, byte counts and SHA-256 hashes. The interpreter verifies the archive, embedded entries, decoded profile hashes and row counts, acquisition lineage, independent reviews, selected witness fields and physical row locators.

The exploratory acquisition attempted 10 GETs: 8 completed and 2 failed. The common-carp Results response and Myriophyllum Stations response remain incomplete. Their failures are not converted into evidence. Two executed acquisition recipes are pinned separately from the repository base SHA; the base SHA does not falsely claim those recipes were already committed.

New immutable fish runs issue zero provider requests. They preserve the original Result/Station URLs and retrieval times. Each run retains all scoped source rows and dispositions in `wqp-fish-witnesses.json`. Compiler output contains one determination per qualifying county-species pair regardless of source-row count.

## Verification

`npm run check:wqp-fish-measurements` checks all 67 independently selected witnesses, source/profile integrity, public attribution and caveats, method scope, exclusions, determinism and invalid or tampered inputs. `npm run check:wqp-field-counts` preserves version 1 regression coverage. Both are included in the research-integrity gate.

Canonical source-run checks, exact before/after compiler reconciliation and national byte-stability verification remain required before claiming integrated gains. R2 research-data publication is a separate capacity and cadence decision.
